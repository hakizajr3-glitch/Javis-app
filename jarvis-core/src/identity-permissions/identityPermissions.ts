import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import {
  UserId,
  OrgId,
  Role,
  ApprovalId,
  User,
  Organization,
  Permission,
  ApprovalRequest,
  Tool,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';

const BCRYPT_ROUNDS = 12;

export class IdentityPermissions {
  private users: Map<UserId, User> = new Map();
  private organizations: Map<OrgId, Organization> = new Map();
  private userPermissions: Map<UserId, Permission[]> = new Map();
  private orgMembers: Map<OrgId, Map<UserId, Role>> = new Map();
  private approvals: Map<ApprovalId, ApprovalRequest> = new Map();
  private toolPermissions: Map<UserId, Tool[]> = new Map();

  // User Management
  async createUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserId> {
    const userId = uuidv4() as UserId;
    const newUser: User = {
      ...user,
      id: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.users.set(userId, newUser);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.COWORKER_ASSIGNED, // Reusing event type for user creation
      payload: { userId, action: 'user_created' },
      timestamp: new Date(),
      source: 'IdentityPermissions',
    });

    return userId;
  }

  async getUser(userId: UserId): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  async updateUser(userId: UserId, updates: Partial<User>): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const updatedUser = {
      ...user,
      ...updates,
      updatedAt: new Date(),
    };

    this.users.set(userId, updatedUser);
  }

  async deleteUser(userId: UserId): Promise<void> {
    // Clean up permissions
    this.userPermissions.delete(userId);
    this.toolPermissions.delete(userId);

    // Remove from organizations
    for (const [, members] of this.orgMembers.entries()) {
      members.delete(userId);
    }

    this.users.delete(userId);
  }

  async listUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  // Credential Management (bcrypt)
  async setUserPassword(userId: UserId, password: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    this.users.set(userId, { ...user, passwordHash, updatedAt: new Date() });
  }

  async verifyUserPassword(userId: UserId, password: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user || !user.passwordHash) {
      return false;
    }
    return bcrypt.compare(password, user.passwordHash);
  }

  // Organization Management
  async createOrganization(org: Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>): Promise<OrgId> {
    const orgId = uuidv4() as OrgId;
    const newOrg: Organization = {
      ...org,
      id: orgId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.organizations.set(orgId, newOrg);
    this.orgMembers.set(orgId, new Map());

    return orgId;
  }

  async getOrganization(orgId: OrgId): Promise<Organization | null> {
    return this.organizations.get(orgId) || null;
  }

  async updateOrganization(orgId: OrgId, updates: Partial<Organization>): Promise<void> {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    const updatedOrg = {
      ...org,
      ...updates,
      updatedAt: new Date(),
    };

    this.organizations.set(orgId, updatedOrg);
  }

  async deleteOrganization(orgId: OrgId): Promise<void> {
    this.orgMembers.delete(orgId);
    this.organizations.delete(orgId);
  }

  async addUserToOrganization(userId: UserId, orgId: OrgId, role: Role): Promise<void> {
    const members = this.orgMembers.get(orgId);
    if (!members) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    members.set(userId, role);
  }

  async removeUserFromOrganization(userId: UserId, orgId: OrgId): Promise<void> {
    const members = this.orgMembers.get(orgId);
    if (members) {
      members.delete(userId);
    }
  }

  async listOrganizationMembers(orgId: OrgId): Promise<Array<{ userId: UserId; role: Role }>> {
    const members = this.orgMembers.get(orgId);
    if (!members) {
      return [];
    }

    return Array.from(members.entries()).map(([userId, role]) => ({ userId, role }));
  }

  // Permission Checking
  async checkPermission(userId: UserId, resource: string, action: string): Promise<boolean> {
    const permissions = this.userPermissions.get(userId) || [];

    // Check for exact match
    const hasPermission = permissions.some(
      perm => perm.resource === resource && perm.action === action
    );

    // Check for admin permission (grants all)
    const hasAdmin = permissions.some(
      perm => perm.action === 'admin' && this.matchesScope(perm, resource)
    );

    return hasPermission || hasAdmin;
  }

  async grantPermission(userId: UserId, permission: Permission): Promise<void> {
    const permissions = this.userPermissions.get(userId) || [];
    permissions.push(permission);
    this.userPermissions.set(userId, permissions);
  }

  async revokePermission(userId: UserId, permission: Permission): Promise<void> {
    const permissions = this.userPermissions.get(userId) || [];
    const filtered = permissions.filter(
      perm => !(perm.resource === permission.resource && perm.action === permission.action)
    );
    this.userPermissions.set(userId, filtered);
  }

  async listUserPermissions(userId: UserId): Promise<Permission[]> {
    return this.userPermissions.get(userId) || [];
  }

  // Approval Workflow
  async requestApproval(request: Omit<ApprovalRequest, 'id' | 'status' | 'createdAt'>): Promise<ApprovalId> {
    const approvalId = uuidv4() as ApprovalId;
    const newRequest: ApprovalRequest = {
      ...request,
      id: approvalId,
      status: 'pending',
      createdAt: new Date(),
    };

    this.approvals.set(approvalId, newRequest);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.APPROVAL_REQUIRED,
      payload: { approvalId, request: newRequest },
      timestamp: new Date(),
      source: 'IdentityPermissions',
      correlationId: request.userId,
    });

    return approvalId;
  }

  async approveRequest(approvalId: ApprovalId, userId: UserId): Promise<void> {
    const request = this.approvals.get(approvalId);
    if (!request) {
      throw new Error(`Approval request not found: ${approvalId}`);
    }

    request.status = 'approved';
    request.resolvedAt = new Date();
    request.resolvedBy = userId;

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.APPROVAL_GRANTED,
      payload: { approvalId, approvedBy: userId },
      timestamp: new Date(),
      source: 'IdentityPermissions',
      correlationId: request.userId,
    });
  }

  async denyRequest(approvalId: ApprovalId, userId: UserId, reason: string): Promise<void> {
    const request = this.approvals.get(approvalId);
    if (!request) {
      throw new Error(`Approval request not found: ${approvalId}`);
    }

    request.status = 'denied';
    request.resolvedAt = new Date();
    request.resolvedBy = userId;
    request.denialReason = reason;

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.APPROVAL_DENIED,
      payload: { approvalId, deniedBy: userId, reason },
      timestamp: new Date(),
      source: 'IdentityPermissions',
      correlationId: request.userId,
    });
  }

  async getApprovalStatus(approvalId: ApprovalId): Promise<ApprovalRequest | null> {
    return this.approvals.get(approvalId) || null;
  }

  async listPendingApprovals(userId: UserId): Promise<ApprovalRequest[]> {
    return Array.from(this.approvals.values()).filter(
      req => req.status === 'pending' && req.userId === userId
    );
  }

  // Tool Permissions
  async grantToolPermission(userId: UserId, tool: Tool): Promise<void> {
    const permissions = this.toolPermissions.get(userId) || [];
    permissions.push(tool);
    this.toolPermissions.set(userId, permissions);
  }

  async revokeToolPermission(userId: UserId, tool: Tool): Promise<void> {
    const permissions = this.toolPermissions.get(userId) || [];
    const filtered = permissions.filter(t => t.name !== tool.name);
    this.toolPermissions.set(userId, filtered);
  }

  async checkToolPermission(userId: UserId, tool: string): Promise<boolean> {
    const permissions = this.toolPermissions.get(userId) || [];
    return permissions.some(t => t.name === tool);
  }

  async listToolPermissions(userId: UserId): Promise<Tool[]> {
    return this.toolPermissions.get(userId) || [];
  }

  private matchesScope(permission: Permission, resource: string): boolean {
    if (permission.scope === 'system') return true;
    if (permission.scope === 'resource' && permission.scopeId === resource) return true;
    // Add more scope matching logic as needed
    return false;
  }

  exportState(): Record<string, any> {
    const nestedMapToArray = (m: Map<string, Map<string, any>>) =>
      Array.from(m.entries()).map(([k, v]) => [k, Array.from(v.entries())]);
    return {
      users: Array.from(this.users.entries()),
      organizations: Array.from(this.organizations.entries()),
      userPermissions: Array.from(this.userPermissions.entries()),
      orgMembers: nestedMapToArray(this.orgMembers),
      approvals: Array.from(this.approvals.entries()),
      toolPermissions: Array.from(this.toolPermissions.entries()),
    };
  }

  importState(state: Record<string, any>): void {
    this.users = new Map(state.users || []);
    this.organizations = new Map(state.organizations || []);
    this.userPermissions = new Map(state.userPermissions || []);
    this.orgMembers = new Map(
      (state.orgMembers || []).map(([k, v]: [string, [string, any][]]) => [k, new Map(v)])
    );
    this.approvals = new Map(state.approvals || []);
    this.toolPermissions = new Map(state.toolPermissions || []);
  }
}

// Singleton instance
export const identityPermissions = new IdentityPermissions();
