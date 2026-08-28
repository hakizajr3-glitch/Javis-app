export type CaptureId = string;

export interface ScreenCapture {
  id: CaptureId;
  image: Buffer;
  timestamp: Date;
  source: 'desktop' | 'window' | 'region';
  sourceId?: string; // window ID or region coordinates
  metadata: {
    width: number;
    height: number;
    format: string;
    dpi?: number;
  };
}

export interface ImageAnalysis {
  captureId: CaptureId;
  description: string;
  objects: DetectedObject[];
  text: DetectedText[];
  actions: SuggestedAction[];
  confidence: number;
  timestamp: Date;
}

export interface DetectedObject {
  label: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface DetectedText {
  text: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SuggestedAction {
  type: 'click' | 'type' | 'scroll' | 'navigate' | 'wait';
  description: string;
  target?: string;
  parameters?: Record<string, any>;
  confidence: number;
}

export interface VisualFeedback {
  captureId: CaptureId;
  feedback: string;
  overlay: OverlayElement[];
  timestamp: Date;
}

export interface OverlayElement {
  type: 'highlight' | 'arrow' | 'text' | 'box';
  position: { x: number; y: number };
  size?: { width: number; height: number };
  content?: string;
  color: string;
}

export interface CaptureConfig {
  interval: number; // milliseconds
  quality: 'low' | 'medium' | 'high';
  format: 'png' | 'jpeg' | 'webp';
  maxCaptures: number;
}
