export interface SpeechTrigger {
  id: string;
  eventType: string;
  condition: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  enabled: boolean;
  createdAt: Date;
  createdBy: string;
  organizationId?: string;
  agentId?: string;
}

export interface UsefulnessScore {
  score: number;
  confidence: number;
  reasoning: string;
  factors: {
    relevance: number;
    timing: number;
    novelty: number;
    actionability: number;
  };
}

export interface SpeechEvent {
  id: string;
  triggerId: string;
  message: string;
  usefulness: UsefulnessScore;
  spoken: boolean;
  timestamp: Date;
  userId: string;
  organizationId?: string;
  agentId?: string;
  correlationId?: string;
}

export interface ProactiveConfig {
  enabled: boolean;
  minUsefulnessThreshold: number;
  maxSpeechesPerHour: number;
  quietHours: { start: string; end: string };
  allowedEventTypes: string[];
  organizationAware: boolean;
  agentCoordination: boolean;
}
