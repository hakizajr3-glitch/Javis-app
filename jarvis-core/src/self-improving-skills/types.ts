export type TaskId = string;
export type SkillId = string;

export interface TaskLog {
  id: TaskId;
  description: string;
  context: Record<string, any>;
  parameters: Record<string, any>;
  result: any;
  success: boolean;
  duration: number;
  timestamp: Date;
  userId: string;
  missionId?: string;
  tags: string[];
}

export interface Pattern {
  id: string;
  description: string;
  frequency: number;
  examples: TaskLog[];
  confidence: number;
  lastSeen: Date;
}

export interface Skill {
  id: SkillId;
  name: string;
  description: string;
  code: string;
  parameters: SkillParameter[];
  examples: TaskLog[];
  performance: SkillPerformance;
  status: 'proposed' | 'approved' | 'installed' | 'deprecated';
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  default?: any;
  description: string;
}

export interface SkillPerformance {
  accuracy: number;
  speed: number;
  successRate: number;
  usageCount: number;
  lastUsed: Date;
  averageDuration: number;
}

export interface SkillProposal {
  skill: Skill;
  reasoning: string;
  expectedBenefit: string;
  confidence: number;
  examples: TaskLog[];
}
