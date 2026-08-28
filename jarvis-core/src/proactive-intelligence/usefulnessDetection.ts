import {
  UsefulnessScore,
} from './types.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';
import { llmOrchestrator } from '../llm-orchestrator/llmOrchestrator.js';

export class UsefulnessDetection {
  private minThreshold: number = 0.6;

  async evaluateUsefulness(
    message: string,
    _eventType: string,
    context: Record<string, any>,
    userId: string
  ): Promise<UsefulnessScore> {
    // Factor 1: Relevance - how relevant is this to the user's current context
    const relevance = await this.calculateRelevance(message, context, userId);

    // Factor 2: Timing - is this a good time to interrupt?
    const timing = await this.calculateTiming(context, userId);

    // Factor 3: Novelty - is this new information or redundant?
    const novelty = await this.calculateNovelty(message, userId);

    // Factor 4: Actionability - can the user act on this information?
    const actionability = await this.calculateActionability(message, context);

    // Calculate overall score
    const score = (
      relevance * 0.3 +
      timing * 0.25 +
      novelty * 0.2 +
      actionability * 0.25
    );

    // Calculate confidence based on how much context we have
    const confidence = this.calculateConfidence(context, userId);

    // Generate reasoning
    const reasoning = this.generateReasoning(relevance, timing, novelty, actionability);

    return {
      score,
      confidence,
      reasoning,
      factors: {
        relevance,
        timing,
        novelty,
        actionability,
      },
    };
  }

  async shouldSpeak(
    message: string,
    eventType: string,
    context: Record<string, any>,
    userId: string,
    threshold?: number
  ): Promise<{ shouldSpeak: boolean; usefulness: UsefulnessScore }> {
    const usefulness = await this.evaluateUsefulness(message, eventType, context, userId);
    const effectiveThreshold = threshold || this.minThreshold;

    return {
      shouldSpeak: usefulness.score >= effectiveThreshold && usefulness.confidence >= 0.5,
      usefulness,
    };
  }

  private async calculateRelevance(message: string, context: Record<string, any>, userId: string): Promise<number> {
    // Check if message relates to recent tasks or missions
    const recentMemory = await memoryEngine.searchPersonalMemory(userId, message);
    
    if (recentMemory.length > 0) {
      return Math.min(0.8 + (recentMemory[0].score * 0.2), 1.0);
    }

    // Check if message relates to current mission
    if (context.missionId) {
      const missionMemory = await memoryEngine.searchWorkingMemory(context.missionId, message);
      if (missionMemory.length > 0) {
        return Math.min(0.7 + (missionMemory[0].score * 0.3), 1.0);
      }
    }

    // Use LLM to assess relevance if no memory matches
    const relevancePrompt = `
Rate the relevance of this message to the user's current context:

Message: "${message}"
Context: ${JSON.stringify(context)}

Rate from 0.0 to 1.0, where 1.0 is highly relevant.
Return only the number.
`;

    try {
      const response = await llmOrchestrator.executeRequest({
        prompt: relevancePrompt,
        provider: 'openai',
      });

      const score = parseFloat(response.content.trim());
      return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
    } catch (error) {
      return 0.5; // Default to medium relevance if LLM fails
    }
  }

  private async calculateTiming(_context: Record<string, any>, userId: string): Promise<number> {
    // Check if user is in a focused state (e.g., in a meeting, deep work)
    const userState = await memoryEngine.getPersonalMemory(userId, 'current_state');
    
    if (userState?.state === 'focused' || userState?.state === 'meeting') {
      return 0.2; // Low timing score - don't interrupt
    }

    if (userState?.state === 'idle' || userState?.state === 'waiting') {
      return 0.9; // High timing score - good time to speak
    }

    // Check time of day
    const hour = new Date().getHours();
    if (hour >= 9 && hour <= 17) {
      return 0.7; // Business hours - good timing
    } else if (hour >= 22 || hour <= 6) {
      return 0.1; // Late night/early morning - bad timing
    }

    return 0.5; // Default timing
  }

  private async calculateNovelty(message: string, userId: string): Promise<number> {
    // Check if similar message was recently spoken
    const recentSpeeches = await memoryEngine.getPersonalMemory(userId, 'recent_speeches');
    
    if (recentSpeeches && Array.isArray(recentSpeeches)) {
      for (const speech of recentSpeeches.slice(-5)) { // Check last 5 speeches
        const similarity = this.calculateSimilarity(message, speech.message);
        if (similarity > 0.8) {
          return 0.2; // Low novelty - very similar to recent speech
        }
      }
    }

    // Check if this information is already in memory
    const memoryMatches = await memoryEngine.searchPersonalMemory(userId, message);
    if (memoryMatches.length > 0 && memoryMatches[0].score > 0.9) {
      return 0.3; // Low novelty - already in memory
    }

    return 0.8; // High novelty
  }

  private async calculateActionability(message: string, context: Record<string, any>): Promise<number> {
    // Use LLM to assess actionability
    const actionabilityPrompt = `
Rate how actionable this message is for the user:

Message: "${message}"
Context: ${JSON.stringify(context)}

Rate from 0.0 to 1.0, where 1.0 means the user can immediately act on this information.
Return only the number.
`;

    try {
      const response = await llmOrchestrator.executeRequest({
        prompt: actionabilityPrompt,
        provider: 'openai',
      });

      const score = parseFloat(response.content.trim());
      return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
    } catch (error) {
      return 0.5; // Default to medium actionability if LLM fails
    }
  }

  private calculateConfidence(context: Record<string, any>, userId: string): number {
    let confidence = 0.5;

    // Increase confidence if we have rich context
    if (context.missionId) confidence += 0.1;
    if (context.projectId) confidence += 0.1;
    if (context.taskId) confidence += 0.1;

    // Increase confidence if we have user history
    if (userId) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private generateReasoning(relevance: number, timing: number, novelty: number, actionability: number): string {
    const factors = [];

    if (relevance > 0.7) factors.push('highly relevant to current context');
    else if (relevance < 0.4) factors.push('low relevance to current context');

    if (timing > 0.7) factors.push('good timing');
    else if (timing < 0.4) factors.push('poor timing');

    if (novelty > 0.7) factors.push('new information');
    else if (novelty < 0.4) factors.push('redundant information');

    if (actionability > 0.7) factors.push('highly actionable');
    else if (actionability < 0.4) factors.push('low actionability');

    return factors.join(', ') || 'neutral assessment';
  }

  private calculateSimilarity(message1: string, message2: string): number {
    // Simple similarity calculation using word overlap
    const words1 = new Set(message1.toLowerCase().split(/\s+/));
    const words2 = new Set(message2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  setMinThreshold(threshold: number): void {
    this.minThreshold = Math.max(0, Math.min(1, threshold));
  }

  getMinThreshold(): number {
    return this.minThreshold;
  }
}

// Singleton instance
export const usefulnessDetection = new UsefulnessDetection();
