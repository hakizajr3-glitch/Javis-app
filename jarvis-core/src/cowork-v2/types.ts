export type AgentId = string;
export type TeamId = string;
export type CoworkOrgId = string;

export interface Agent {
  id: AgentId;
  name: string;
  type: 'human' | 'ai' | 'hybrid';
  role: string;
  capabilities: string[];
  status: 'active' | 'idle' | 'busy' | 'offline';
  currentTask?: string;
  performance: AgentPerformance;
  createdAt: Date;
  lastActive: Date;
  teamId?: TeamId;
}

export interface AgentPerformance {
  tasksCompleted: number;
  tasksFailed: number;
  averageCompletionTime: number;
  successRate: number;
  totalWorkTime: number;
}

export interface Team {
  id: TeamId;
  name: string;
  description: string;
  members: AgentId[];
  leadAgentId: AgentId;
  createdAt: Date;
  updatedAt: Date;
  organizationId: string;
}

export interface WorkforceAssignment {
  id: string;
  agentId: AgentId;
  taskId: string;
  missionId: string;
  assignedAt: Date;
  completedAt?: Date;
  status: 'assigned' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface WorkforceCoordination {
  activeAgents: Map<AgentId, Agent>;
  availableAgents: AgentId[];
  busyAgents: AgentId[];
  taskQueue: WorkforceAssignment[];
  completedAssignments: WorkforceAssignment[];
}

export interface AgentCommunication {
  id: string;
  fromAgentId: AgentId;
  toAgentId?: AgentId; // undefined for broadcast
  message: string;
  messageType: 'task' | 'status' | 'request' | 'response' | 'alert';
  timestamp: Date;
  relatedTaskId?: string;
}

export interface WorkforceMetrics {
  totalAgents: number;
  activeAgents: number;
  idleAgents: number;
  busyAgents: number;
  totalAssignments: number;
  completedAssignments: number;
  failedAssignments: number;
  averageTaskDuration: number;
  teamEfficiency: number;
}

export interface CoworkOrganization {
  id: CoworkOrgId;
  name: string;
  description: string;
  type: 'company' | 'team' | 'project' | 'community';
  ownerId: string;
  settings: {
    public: boolean;
    inviteOnly: boolean;
    requireApproval: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface OrgStructure {
  id: string;
  name: string;
  nodes: OrgStructureNode[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OrgStructureNode {
  id: string;
  name: string;
  type: 'department' | 'team' | 'role';
  parentId: string | null;
  children: string[];
}

export interface OrgRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  level: number;
}

export interface OrgPolicy {
  id: string;
  name: string;
  description: string;
  type: 'access' | 'security' | 'workflow' | 'compliance';
  rules: Record<string, any>;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrgMember {
  userId: string;
  role: string;
  joinedAt: Date;
}

export type DashboardId = string;

export interface Dashboard {
  id: DashboardId;
  name: string;
  description: string;
  organizationId: string;
  widgets: DashboardWidget[];
  layout: { columns: number; rows: number };
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'text' | 'alert';
  title: string;
  position: { x: number; y: number; width: number; height: number };
  config: Record<string, any>;
}

export interface DashboardMetric {
  id: string;
  name: string;
  value: number;
  category: 'workforce' | 'mission' | 'task' | 'system';
  trend: 'up' | 'down' | 'stable';
}

export interface DashboardAlert {
  id: string;
  type: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  organizationId: string;
  relatedId?: string;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  createdAt: Date;
}

export interface DashboardReport {
  id: string;
  name: string;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  organizationId: string;
  startDate: Date;
  endDate: Date;
  metrics: DashboardMetric[];
  summary: string;
  createdAt: Date;
}
