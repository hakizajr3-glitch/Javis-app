import { v4 as uuidv4 } from 'uuid';
import {
  CaptureId,
  ImageAnalysis,
  DetectedObject,
  DetectedText,
  SuggestedAction,
} from './types.js';
import { screenCapture } from './screenCapture.js';
import { llmOrchestrator } from '../llm-orchestrator/llmOrchestrator.js';
import { eventBus, EventType } from '../observability/eventBus.js';

export class ImageUnderstanding {
  private analyses: Map<CaptureId, ImageAnalysis> = new Map();

  async analyzeCapture(captureId: CaptureId, context?: Record<string, any>): Promise<ImageAnalysis> {
    const capture = await screenCapture.getCapture(captureId);
    if (!capture) {
      throw new Error(`Capture not found: ${captureId}`);
    }

    // Use LLM with vision capabilities to analyze the image
    const analysis = await this.analyzeWithVisionModel(capture, context);

    this.analyses.set(captureId, analysis);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { captureId, analysis },
      timestamp: new Date(),
      source: 'ImageUnderstanding',
    });

    return analysis;
  }

  async getAnalysis(captureId: CaptureId): Promise<ImageAnalysis | null> {
    return this.analyses.get(captureId) || null;
  }

  async detectObjects(captureId: CaptureId): Promise<DetectedObject[]> {
    const analysis = await this.analyzeCapture(captureId);
    return analysis.objects;
  }

  async detectText(captureId: CaptureId): Promise<DetectedText[]> {
    const analysis = await this.analyzeCapture(captureId);
    return analysis.text;
  }

  async suggestActions(captureId: CaptureId, context?: Record<string, any>): Promise<SuggestedAction[]> {
    const analysis = await this.analyzeCapture(captureId, context);
    return analysis.actions;
  }

  async batchAnalyze(captureIds: CaptureId[]): Promise<Map<CaptureId, ImageAnalysis>> {
    const results = new Map<CaptureId, ImageAnalysis>();

    for (const captureId of captureIds) {
      try {
        const analysis = await this.analyzeCapture(captureId);
        results.set(captureId, analysis);
      } catch (error) {
        console.error(`Failed to analyze capture ${captureId}:`, error);
      }
    }

    return results;
  }

  async searchByContent(query: string, limit: number = 10): Promise<ImageAnalysis[]> {
    const analyses = Array.from(this.analyses.values());

    // Simple text search in descriptions
    const matching = analyses.filter(a =>
      a.description.toLowerCase().includes(query.toLowerCase())
    );

    return matching.slice(0, limit);
  }

  async compareCaptures(captureId1: CaptureId, captureId2: CaptureId): Promise<any> {
    const analysis1 = await this.getAnalysis(captureId1);
    const analysis2 = await this.getAnalysis(captureId2);

    if (!analysis1 || !analysis2) {
      throw new Error('One or both analyses not found');
    }

    // Compare descriptions
    const descriptionSimilarity = this.calculateSimilarity(analysis1.description, analysis2.description);

    // Compare detected objects
    const objectOverlap = this.calculateObjectOverlap(analysis1.objects, analysis2.objects);

    // Compare detected text
    const textOverlap = this.calculateTextOverlap(analysis1.text, analysis2.text);

    return {
      descriptionSimilarity,
      objectOverlap,
      textOverlap,
      overallSimilarity: (descriptionSimilarity + objectOverlap + textOverlap) / 3,
    };
  }

  private async analyzeWithVisionModel(capture: any, context?: Record<string, any>): Promise<ImageAnalysis> {
    // In production, this would use actual vision models (GPT-4 Vision, Claude Vision, etc.)
    // For now, use LLM to simulate vision analysis
    
    const prompt = `
Analyze this screen capture and provide:
1. A detailed description of what's visible
2. List of detected objects with their approximate locations
3. Any text visible on screen
4. Suggested actions the user might want to take

Context: ${JSON.stringify(context || {})}

Format your response as JSON with the following structure:
{
  "description": "string",
  "objects": [{"label": "string", "confidence": 0.0-1.0, "boundingBox": {x, y, width, height}}],
  "text": [{"text": "string", "confidence": 0.0-1.0, "boundingBox": {x, y, width, height}}],
  "actions": [{"type": "string", "description": "string", "target": "string", "confidence": 0.0-1.0}]
}
`;

    try {
      const response = await llmOrchestrator.executeRequest({
        prompt,
        provider: 'openai', // GPT-4 Vision would be ideal
      });

      // Parse the JSON response
      const parsed = JSON.parse(response.content);

      return {
        captureId: capture.id,
        description: parsed.description || 'Unable to analyze image',
        objects: parsed.objects || [],
        text: parsed.text || [],
        actions: parsed.actions || [],
        confidence: 0.7, // Default confidence
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Vision analysis failed:', error);

      // Return a basic analysis on failure
      return {
        captureId: capture.id,
        description: 'Screen capture analysis unavailable',
        objects: [],
        text: [],
        actions: [],
        confidence: 0,
        timestamp: new Date(),
      };
    }
  }

  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private calculateObjectOverlap(objects1: DetectedObject[], objects2: DetectedObject[]): number {
    if (objects1.length === 0 || objects2.length === 0) return 0;

    const labels1 = new Set(objects1.map(o => o.label));
    const labels2 = new Set(objects2.map(o => o.label));

    const intersection = new Set([...labels1].filter(x => labels2.has(x)));
    const union = new Set([...labels1, ...labels2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private calculateTextOverlap(text1: DetectedText[], text2: DetectedText[]): number {
    if (text1.length === 0 || text2.length === 0) return 0;

    const texts1 = new Set(text1.map(t => t.text.toLowerCase()));
    const texts2 = new Set(text2.map(t => t.text.toLowerCase()));

    const intersection = new Set([...texts1].filter(x => texts2.has(x)));
    const union = new Set([...texts1, ...texts2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  getStats() {
    return {
      totalAnalyses: this.analyses.size,
    };
  }
}

// Singleton instance
export const imageUnderstanding = new ImageUnderstanding();
