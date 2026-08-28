interface ElectronAPI {
  getConfig?: () => Promise<Record<string, string>>;
  synthesize?: (text: string) => Promise<{ ok?: boolean; audio?: ArrayBuffer; mime?: string }>;
  transcribeAudio?: (bytes: Uint8Array, opts?: { mime?: string }) => Promise<{ ok?: boolean; transcript?: string }>;
  hasKey?: (name: string) => Promise<boolean>;
}

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<{ [index: number]: SpeechRecognitionResultItem; isFinal: boolean }>;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  /** Active camera video element — set by CameraWidget when camera is on. */
  __jarvisCameraRef?: HTMLVideoElement | null;
  /** Active screen-share video element — set when screen sharing is active. */
  __jarvisScreenRef?: HTMLVideoElement | null;
}
