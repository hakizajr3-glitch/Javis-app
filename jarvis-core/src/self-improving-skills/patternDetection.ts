import { v4 as uuidv4 } from 'uuid';
import {
  Pattern,
  TaskLog,
} from './types.js';
import { taskLogger } from './taskLogger.js';

export class PatternDetection {
  private patterns: Map<string, Pattern> = new Map();
  private minFrequency: number = 3;
  private minConfidence: number = 0.7;

  async detectPatterns(userId: string): Promise<Pattern[]> {
    const tasks = await taskLogger.getTaskHistory(userId, 1000);
    const detectedPatterns: Pattern[] = [];

    // Group tasks by description similarity
    const taskGroups = this.groupTasksByDescription(tasks);

    for (const [key, groupTasks] of taskGroups.entries()) {
      if (groupTasks.length >= this.minFrequency) {
        const pattern = await this.createPattern(key, groupTasks);
        if (pattern.confidence >= this.minConfidence) {
          detectedPatterns.push(pattern);
          this.patterns.set(pattern.id, pattern);
        }
      }
    }

    // Detect parameter patterns
    const parameterPatterns = await this.detectParameterPatterns(tasks);
    detectedPatterns.push(...parameterPatterns);

    return detectedPatterns.sort((a, b) => b.frequency - a.frequency);
  }

  async getPatterns(userId?: string): Promise<Pattern[]> {
    let patterns = Array.from(this.patterns.values());

    if (userId) {
      // Filter patterns relevant to user
      patterns = patterns.filter(p =>
        p.examples.some(t => t.userId === userId)
      );
    }

    return patterns.sort((a, b) => b.frequency - a.frequency);
  }

  async getPattern(patternId: string): Promise<Pattern | null> {
    return this.patterns.get(patternId) || null;
  }

  async updatePatterns(userId: string): Promise<void> {
    // Re-detect patterns with new task data
    const newPatterns = await this.detectPatterns(userId);
    
    // Merge with existing patterns
    for (const newPattern of newPatterns) {
      const existing = this.patterns.get(newPattern.id);
      if (existing) {
        // Update existing pattern
        existing.frequency = newPattern.frequency;
        existing.confidence = newPattern.confidence;
        existing.lastSeen = newPattern.lastSeen;
        existing.examples = newPattern.examples;
      } else {
        // Add new pattern
        this.patterns.set(newPattern.id, newPattern);
      }
    }
  }

  private groupTasksByDescription(tasks: TaskLog[]): Map<string, TaskLog[]> {
    const groups = new Map<string, TaskLog[]>();

    for (const task of tasks) {
      const key = this.normalizeDescription(task.description);
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(task);
    }

    return groups;
  }

  private normalizeDescription(description: string): string {
    return description
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async createPattern(_key: string, tasks: TaskLog[]): Promise<Pattern> {
    const patternId = uuidv4();
    const frequency = tasks.length;
    const successCount = tasks.filter(t => t.success).length;
    const confidence = successCount / frequency;

    // Get most recent timestamp
    const lastSeen = tasks.reduce((max, t) => 
      t.timestamp > max ? t.timestamp : max, tasks[0].timestamp);

    // Generate description from first task
    const description = this.generatePatternDescription(tasks);

    return {
      id: patternId,
      description,
      frequency,
      examples: tasks.slice(0, 5), // Keep top 5 examples
      confidence,
      lastSeen,
    };
  }

  private generatePatternDescription(tasks: TaskLog[]): string {
    const firstTask = tasks[0];
    
    // Extract common parameters
    const commonParams = this.extractCommonParameters(tasks);
    
    let description = firstTask.description;
    
    if (Object.keys(commonParams).length > 0) {
      const paramStr = Object.entries(commonParams)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(', ');
      description += ` (with params: ${paramStr})`;
    }

    return description;
  }

  private extractCommonParameters(tasks: TaskLog[]): Record<string, any> {
    if (tasks.length === 0) return {};

    const common: Record<string, any> = {};
    const firstParams = tasks[0].parameters;

    for (const [key, value] of Object.entries(firstParams)) {
      const allMatch = tasks.every(t => 
        JSON.stringify(t.parameters[key]) === JSON.stringify(value)
      );

      if (allMatch) {
        common[key] = value;
      }
    }

    return common;
  }

  private async detectParameterPatterns(tasks: TaskLog[]): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // Detect patterns in parameter values
    const paramGroups = this.groupTasksByParameters(tasks);

    for (const [key, groupTasks] of paramGroups.entries()) {
      if (groupTasks.length >= this.minFrequency) {
        const pattern = await this.createPattern(key, groupTasks);
        if (pattern.confidence >= this.minConfidence) {
          patterns.push(pattern);
          this.patterns.set(pattern.id, pattern);
        }
      }
    }

    return patterns;
  }

  private groupTasksByParameters(tasks: TaskLog[]): Map<string, TaskLog[]> {
    const groups = new Map<string, TaskLog[]>();

    for (const task of tasks) {
      const key = this.normalizeParameters(task.parameters);
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(task);
    }

    return groups;
  }

  private normalizeParameters(params: Record<string, any>): string {
    const sortedKeys = Object.keys(params).sort();
    return sortedKeys.map(k => `${k}:${JSON.stringify(params[k])}`).join('|');
  }

  async getPatternStats(userId: string): Promise<{
    totalPatterns: number;
    highConfidencePatterns: number;
    frequentPatterns: number;
    byFrequency: Record<string, number>;
  }> {
    const patterns = await this.getPatterns(userId);
    const highConfidence = patterns.filter(p => p.confidence >= 0.8).length;
    const frequent = patterns.filter(p => p.frequency >= 5).length;

    const byFrequency: Record<string, number> = {};
    for (const pattern of patterns) {
      const freqRange = this.getFrequencyRange(pattern.frequency);
      byFrequency[freqRange] = (byFrequency[freqRange] || 0) + 1;
    }

    return {
      totalPatterns: patterns.length,
      highConfidencePatterns: highConfidence,
      frequentPatterns: frequent,
      byFrequency,
    };
  }

  private getFrequencyRange(frequency: number): string {
    if (frequency < 3) return '1-2';
    if (frequency < 5) return '3-4';
    if (frequency < 10) return '5-9';
    if (frequency < 20) return '10-19';
    return '20+';
  }
}

// Singleton instance
export const patternDetection = new PatternDetection();
