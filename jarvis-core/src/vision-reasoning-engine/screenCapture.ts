import { v4 as uuidv4 } from 'uuid';
import {
  CaptureId,
  ScreenCapture as ScreenCaptureType,
  CaptureConfig,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { myAIDocs } from '../myaidocs/myaidocs.js';

export class ScreenCaptureManager {
  private captures: Map<CaptureId, ScreenCaptureType> = new Map();
  private config: CaptureConfig = {
    interval: 1000, // 1 second
    quality: 'medium',
    format: 'png',
    maxCaptures: 100,
  };
  private captureInterval: NodeJS.Timeout | null = null;
  private isCapturing: boolean = false;

  async captureScreen(source: 'desktop' | 'window' | 'region' = 'desktop', sourceId?: string): Promise<CaptureId> {
    const captureId = uuidv4() as CaptureId;

    // In production, this would use actual screen capture APIs
    // For now, generate a placeholder image
    const image = await this.generatePlaceholderImage();

    const capture: ScreenCaptureType = {
      id: captureId,
      image,
      timestamp: new Date(),
      source,
      sourceId,
      metadata: {
        width: 1920,
        height: 1080,
        format: this.config.format,
        dpi: 96,
      },
    };

    this.captures.set(captureId, capture);

    // Clean old captures if needed
    if (this.captures.size > this.config.maxCaptures) {
      this.cleanOldCaptures();
    }

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.ARTIFACT_CREATED,
      payload: { captureId, source },
      timestamp: new Date(),
      source: 'ScreenCapture',
    });

    return captureId;
  }

  async getCapture(captureId: CaptureId): Promise<ScreenCaptureType | null> {
    return this.captures.get(captureId) || null;
  }

  async listCaptures(filters?: {
    source?: 'desktop' | 'window' | 'region';
    startTime?: Date;
    endTime?: Date;
  }): Promise<ScreenCaptureType[]> {
    let captures = Array.from(this.captures.values());

    if (filters) {
      if (filters.source) {
        captures = captures.filter(c => c.source === filters.source);
      }
      if (filters.startTime) {
        captures = captures.filter(c => c.timestamp >= filters.startTime!);
      }
      if (filters.endTime) {
        captures = captures.filter(c => c.timestamp <= filters.endTime!);
      }
    }

    return captures.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async deleteCapture(captureId: CaptureId): Promise<void> {
    this.captures.delete(captureId);
  }

  async startContinuousCapture(source: 'desktop' | 'window' | 'region' = 'desktop', sourceId?: string): Promise<void> {
    if (this.isCapturing) {
      return;
    }

    this.isCapturing = true;

    this.captureInterval = setInterval(async () => {
      try {
        await this.captureScreen(source, sourceId);
      } catch (error) {
        console.error('Continuous capture error:', error);
      }
    }, this.config.interval);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { action: 'continuous_capture_started', source, interval: this.config.interval },
      timestamp: new Date(),
      source: 'ScreenCapture',
    });
  }

  async stopContinuousCapture(): Promise<void> {
    if (!this.isCapturing) {
      return;
    }

    this.isCapturing = false;

    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { action: 'continuous_capture_stopped' },
      timestamp: new Date(),
      source: 'ScreenCapture',
    });
  }

  async saveCaptureToMyAIDocs(captureId: CaptureId, missionId?: string, projectId?: string): Promise<string> {
    const capture = this.captures.get(captureId);
    if (!capture) {
      throw new Error(`Capture not found: ${captureId}`);
    }

    const artifactId = await myAIDocs.createArtifact({
      type: 'image',
      name: `screen_capture_${capture.timestamp.getTime()}`,
      content: capture.image,
      metadata: {
        mimeType: `image/${capture.metadata.format}`,
        size: capture.image.length,
        checksum: this.calculateChecksum(capture.image),
        description: `Screen capture from ${capture.source}`,
        custom: {
          source: capture.source,
          sourceId: capture.sourceId,
          width: capture.metadata.width,
          height: capture.metadata.height,
        },
      },
      createdBy: 'system',
      missionId,
      projectId,
      tags: ['screen_capture', capture.source],
    });

    return artifactId;
  }

  async updateConfig(updates: Partial<CaptureConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };

    // Restart continuous capture if it's running
    if (this.isCapturing) {
      await this.stopContinuousCapture();
      await this.startContinuousCapture();
    }
  }

  getConfig(): CaptureConfig {
    return { ...this.config };
  }

  isCapturingActive(): boolean {
    return this.isCapturing;
  }

  private async generatePlaceholderImage(): Promise<Buffer> {
    // In production, this would use actual screen capture APIs
    // For now, generate a simple placeholder
    const size = 1920 * 1080 * 4; // RGBA
    const buffer = Buffer.alloc(size);
    
    // Fill with a pattern
    for (let i = 0; i < size; i += 4) {
      buffer[i] = 0x1a;     // R
      buffer[i + 1] = 0x1a; // G
      buffer[i + 2] = 0x2e; // B
      buffer[i + 3] = 0xff; // A
    }

    return buffer;
  }

  private cleanOldCaptures(): void {
    const captures = Array.from(this.captures.entries())
      .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());

    const toRemove = captures.slice(0, captures.length - this.config.maxCaptures);
    for (const [id] of toRemove) {
      this.captures.delete(id);
    }
  }

  private calculateChecksum(buffer: Buffer): string {
    // Simple checksum
    let hash = 0;
    for (let i = 0; i < buffer.length; i++) {
      hash = ((hash << 5) - hash) + buffer[i];
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  getStats() {
    return {
      totalCaptures: this.captures.size,
      isCapturing: this.isCapturing,
      config: this.config,
    };
  }
}

// Singleton instance
export const screenCapture = new ScreenCaptureManager();
