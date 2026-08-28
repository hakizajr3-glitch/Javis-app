export type UserId = string;
export type OrgId = string;
export type Role = 'admin' | 'member' | 'viewer' | 'owner';
export type ApprovalId = string;

export interface User {
  id: UserId;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  preferences: Record<string, any>;
  /** bcrypt hash of the user's password. Never store plaintext. */
  passwordHash?: string;
}

export interface Organization {
  id: OrgId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  settings: Record<string, any>;
}

export interface Permission {
  resource: string;
  action: 'read' | 'write' | 'execute' | 'delete' | 'approve' | 'admin';
  scope: 'system' | 'organization' | 'project' | 'resource';
  scopeId?: string;
}

export interface ApprovalRequest {
  id: ApprovalId;
  userId: UserId;
  requestedBy: UserId;
  resource: string;
  action: string;
  description: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: UserId;
  denialReason?: string;
}

export interface Tool {
  name: string;
  category: string;
  capabilities: string[];
}

export interface Resource {
  type: string;
  id: string;
  organizationId?: string;
  projectId?: string;
}

export interface Action {
  type: string;
  resource: Resource;
  userId: UserId;
  description: string;
}
