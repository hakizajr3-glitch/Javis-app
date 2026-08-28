export type AgentRole =
  | 'commander'
  | 'planner'
  | 'executor'
  | 'observer'
  | 'memory'
  | 'reflection'
  | 'custom';

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  timestamp: Date;
}

export interface AgentBlueprint {
  id: string;
  name: string;
  role: AgentRole;
  description: string;
  systemPrompt: string;
  tools: AgentTool[];
  modelConfig: {
    provider: 'openai' | 'anthropic' | 'google' | 'local';
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  maxIterations: number;
  allowSubAgents: boolean;
}

export interface AgentInstance {
  id: string;
  blueprintId: string;
  name: string;
  role: AgentRole;
  state: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  context: Record<string, any>;
  messages: AgentMessage[];
  parentAgentId?: string;
  runId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentRun {
  id: string;
  goal: string;
  userId: string;
  parentRunId?: string;
  state:
    | 'queued'
    | 'planning'
    | 'executing'
    | 'monitoring'
    | 'reflecting'
    | 'completed'
    | 'failed'
    | 'cancelled';
  commanderId?: string;
  plannerId?: string;
  executorIds: string[];
  observerId?: string;
  memoryAgentId?: string;
  reflectionAgentId?: string;
  result?: string;
  error?: string;
  tasks: AgentTask[];
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
}

export interface AgentTask {
  id: string;
  runId: string;
  parentTaskId?: string;
  title: string;
  description: string;
  assignedTo: string;
  dependencies: string[];
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'failed';
  result?: string;
  error?: string;
  toolCalls: ToolCall[];
  startedAt?: Date;
  completedAt?: Date;
}

export interface SubAgentRequest {
  goal: string;
  role?: AgentRole;
  blueprintId?: string;
  name?: string;
  tools?: AgentTool[];
  context?: Record<string, any>;
  parentAgentId: string;
  parentRunId: string;
  userId: string;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

export interface AgentRunOptions {
  goal: string;
  userId: string;
  context?: Record<string, any>;
  parentRunId?: string;
  preferredBlueprints?: {
    commander?: string;
    planner?: string;
    executors?: string[];
    observer?: string;
    memory?: string;
    reflection?: string;
  };
}
