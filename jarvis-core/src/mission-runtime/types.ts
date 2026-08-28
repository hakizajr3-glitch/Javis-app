export type MissionId = string;
export type MissionTaskId = string;

export interface Mission {
  id: MissionId;
  name: string;
  description: string;
  instructions: string;
  compiledPlan: MissionPlan;
  status: 'pending' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdBy: string;
  workspaceId: string;
  tags: string[];
}

export interface MissionPlan {
  tasks: Task[];
  dependencies: Map<MissionTaskId, MissionTaskId[]>;
  estimatedDuration: number;
  resources: ResourceRequirement[];
}

export interface Task {
  id: MissionTaskId;
  name: string;
  description: string;
  type: 'llm' | 'automation' | 'connector' | 'memory' | 'vision' | 'custom';
  parameters: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: Error;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  critical: boolean;
}

export interface ResourceRequirement {
  type: 'cpu' | 'memory' | 'disk' | 'network' | 'llm' | 'connector';
  amount: number;
  unit: string;
}

export interface MissionSchedule {
  missionId: MissionId;
  scheduledAt: Date;
  priority: number;
  estimatedDuration: number;
  dependencies: MissionId[];
}

export interface MissionExecution {
  missionId: MissionId;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  currentTaskId?: MissionTaskId;
  progress: number;
  logs: ExecutionLog[];
  metrics: ExecutionMetrics;
}

export interface ExecutionLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  taskId?: MissionTaskId;
}

export interface ExecutionMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageTaskDuration: number;
  totalDuration: number;
  resourceUsage: ResourceUsage;
}

export interface ResourceUsage {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
}

export interface Workspace {
  id: string;
  name: string;
  type: 'project' | 'mission' | 'sandbox';
  path: string;
  state: Record<string, any>;
  resources: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface CompiledMission {
  id: MissionId;
  plan: MissionPlan;
  compilationTime: number;
  confidence: number;
  warnings: string[];
}
