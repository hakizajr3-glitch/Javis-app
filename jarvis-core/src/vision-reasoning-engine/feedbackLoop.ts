import { v4 as uuidv4 } from 'uuid';
import {
  CaptureId,
  VisualFeedback,
  OverlayElement,
} from './types.js';
import { screenCapture } from './screenCapture.js';
import { imageUnderstanding } from './imageUnderstanding.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { usefulnessDetection } from '../proactive-intelligence/usefulnessDetection.js';

export class FeedbackLoop {
  private feedbackHistory: Map<CaptureId, VisualFeedback> = new Map();
  private enabled: boolean = true;

  async provideFeedback(captureId: CaptureId, context?: Record<string, any>): Promise<VisualFeedback> {
    if (!this.enabled) {
      throw new Error('Feedback loop is disabled');
    }

    const analysis = await imageUnderstanding.getAnalysis(captureId);
    if (!analysis) {
      throw new Error(`No analysis found for capture: ${captureId}`);
    }

    // Generate feedback based on analysis
    const feedback = await this.generateFeedback(analysis, context);

    this.feedbackHistory.set(captureId, feedback);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { captureId, feedback },
      timestamp: new Date(),
      source: 'FeedbackLoop',
    });

    return feedback;
  }

  async generateOverlay(captureId: CaptureId, feedback: VisualFeedback): Promise<Buffer> {
    const capture = await screenCapture.getCapture(captureId);
    if (!capture) {
      throw new Error(`Capture not found: ${captureId}`);
    }

    // In production, this would render the overlay on the actual image
    // For now, return the original image
    return capture.image;
  }

  async highlightRegion(captureId: CaptureId, region: { x: number; y: number; width: number; height: number }, color: string = '#ff0000'): Promise<void> {
    const feedback = await this.feedbackHistory.get(captureId);
    if (!feedback) {
      throw new Error(`No feedback found for capture: ${captureId}`);
    }

    const overlay: OverlayElement = {
      type: 'box',
      position: { x: region.x, y: region.y },
      size: { width: region.width, height: region.height },
      color,
    };

    feedback.overlay.push(overlay);
    this.feedbackHistory.set(captureId, feedback);
  }

  async addTextAnnotation(captureId: CaptureId, text: string, position: { x: number; y: number }, color: string = '#ffffff'): Promise<void> {
    const feedback = await this.feedbackHistory.get(captureId);
    if (!feedback) {
      throw new Error(`No feedback found for capture: ${captureId}`);
    }

    const overlay: OverlayElement = {
      type: 'text',
      position,
      content: text,
      color,
    };

    feedback.overlay.push(overlay);
    this.feedbackHistory.set(captureId, feedback);
  }

  async addArrow(captureId: CaptureId, from: { x: number; y: number }, to: { x: number; y: number }, color: string = '#ffff00'): Promise<void> {
    const feedback = await this.feedbackHistory.get(captureId);
    if (!feedback) {
      throw new Error(`No feedback found for capture: ${captureId}`);
    }

    const overlay: OverlayElement = {
      type: 'arrow',
      position: from,
      content: JSON.stringify(to),
      color,
    };

    feedback.overlay.push(overlay);
    this.feedbackHistory.set(captureId, feedback);
  }

  async clearOverlay(captureId: CaptureId): Promise<void> {
    const feedback = await this.feedbackHistory.get(captureId);
    if (!feedback) {
      throw new Error(`No feedback found for capture: ${captureId}`);
    }

    feedback.overlay = [];
    this.feedbackHistory.set(captureId, feedback);
  }

  async getFeedback(captureId: CaptureId): Promise<VisualFeedback | null> {
    return this.feedbackHistory.get(captureId) || null;
  }

  async listFeedback(limit: number = 100): Promise<VisualFeedback[]> {
    return Array.from(this.feedbackHistory.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async enable(): Promise<void> {
    this.enabled = true;
  }

  async disable(): Promise<void> {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private async generateFeedback(analysis: any, context?: Record<string, any>): Promise<VisualFeedback> {
    const feedback: string[] = [];

    // Generate feedback based on detected objects
    if (analysis.objects && analysis.objects.length > 0) {
      feedback.push(`Detected ${analysis.objects.length} objects: ${analysis.objects.map((o: any) => o.label).join(', ')}`);
    }

    // Generate feedback based on detected text
    if (analysis.text && analysis.text.length > 0) {
      feedback.push(`Detected text: ${analysis.text.map((t: any) => t.text).join(', ')}`);
    }

    // Generate feedback based on suggested actions
    if (analysis.actions && analysis.actions.length > 0) {
      feedback.push(`Suggested actions: ${analysis.actions.map((a: any) => a.description).join(', ')}`);
    }

    // Check if feedback would be useful
    const feedbackText = feedback.join('. ');
    const usefulness = await usefulnessDetection.evaluateUsefulness(
      feedbackText,
      'vision_feedback',
      context || {},
      'system'
    );

    // Generate overlay elements based on analysis
    const overlay: OverlayElement[] = [];

    // Add highlights for detected objects
    if (analysis.objects) {
      for (const obj of analysis.objects.slice(0, 5)) { // Limit to 5 highlights
        overlay.push({
          type: 'box',
          position: { x: obj.boundingBox.x, y: obj.boundingBox.y },
          size: { width: obj.boundingBox.width, height: obj.boundingBox.height },
          color: '#00ff00',
        });
      }
    }

    return {
      captureId: analysis.captureId,
      feedback: feedbackText || 'No significant feedback available',
      overlay,
      timestamp: new Date(),
    };
  }

  getStats() {
    return {
      totalFeedback: this.feedbackHistory.size,
      enabled: this.enabled,
    };
  }
}

// Singleton instance
export const feedbackLoop = new FeedbackLoop();
