export type UserTaskId = string;
export type ProjectId = string;

export interface UserTask {
  id: UserTaskId;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  projectId?: ProjectId;
  organizationId?: string;
  agentId?: string;
  dueDate?: Date;
  completedAt?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  dependencies: UserTaskId[];
  subtasks: Subtask[];
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: Date;
}

export interface Project {
  id: ProjectId;
  name: string;
  description: string;
  organizationId?: string;
  status: 'active' | 'archived' | 'completed';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  color?: string;
}

export interface TaskFilter {
  projectId?: ProjectId;
  organizationId?: string;
  assignedTo?: string;
  agentId?: string;
  status?: UserTask['status'];
  priority?: UserTask['priority'];
  tags?: string[];
  dueBefore?: Date;
  dueAfter?: Date;
  searchQuery?: string;
}

export interface TaskAssignment {
  taskId: UserTaskId;
  assignedTo: string;
  assignedAt: Date;
  assignedBy: string;
}
