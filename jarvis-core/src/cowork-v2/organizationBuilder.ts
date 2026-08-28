import { v4 as uuidv4 } from 'uuid';
import {
  CoworkOrgId,
  CoworkOrganization,
  OrgStructure,
  OrgRole,
  OrgPolicy,
  OrgMember,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';
import { identityPermissions } from '../identity-permissions/identityPermissions.js';

export class OrganizationBuilder {
  private organizations: Map<CoworkOrgId, CoworkOrganization> = new Map();
  private structures: Map<CoworkOrgId, OrgStructure> = new Map();
  private roles: Map<CoworkOrgId, Map<string, OrgRole>> = new Map();
  private policies: Map<CoworkOrgId, OrgPolicy[]> = new Map();

  async createOrganization(
    name: string,
    description: string,
    type: 'company' | 'team' | 'project' | 'community',
    ownerId: string
  ): Promise<CoworkOrgId> {
    const orgId = uuidv4() as CoworkOrgId;

    const organization: CoworkOrganization = {
      id: orgId,
      name,
      description,
      type,
      ownerId,
      settings: {
        public: false,
        inviteOnly: true,
        requireApproval: false,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.organizations.set(orgId, organization);

    // Create default structure
    await this.createDefaultStructure(orgId);

    // Create default roles
    await this.createDefaultRoles(orgId);

    // Add owner as member
    await identityPermissions.addUserToOrganization(ownerId, orgId, 'owner');

    await memoryEngine.setWorkingMemory(orgId, 'organization', organization);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { orgId, name, type, ownerId },
      timestamp: new Date(),
      source: 'OrganizationBuilder',
    });

    return orgId;
  }

  async getOrganization(orgId: CoworkOrgId): Promise<CoworkOrganization | null> {
    return this.organizations.get(orgId) || null;
  }

  async listOrganizations(userId?: string): Promise<CoworkOrganization[]> {
    let orgs = Array.from(this.organizations.values());

    if (userId) {
      // Filter to organizations where user is a member
      // Since IdentityPermissions doesn't have listOrganizations, we'll filter by ownerId for now
      // In production, this would query the actual membership
      orgs = orgs.filter(o => o.ownerId === userId);
    }

    return orgs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async updateOrganization(orgId: CoworkOrgId, updates: Partial<CoworkOrganization>): Promise<void> {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    const updatedOrg: CoworkOrganization = {
      ...org,
      ...updates,
      updatedAt: new Date(),
    };

    this.organizations.set(orgId, updatedOrg);

    await memoryEngine.setWorkingMemory(orgId, 'organization', updatedOrg);
  }

  async deleteOrganization(orgId: CoworkOrgId): Promise<void> {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    this.organizations.delete(orgId);
    this.structures.delete(orgId);
    this.roles.delete(orgId);
    this.policies.delete(orgId);

    await memoryEngine.deleteWorkingMemory(orgId, 'organization');

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { orgId, action: 'deleted' },
      timestamp: new Date(),
      source: 'OrganizationBuilder',
    });
  }

  async createStructure(orgId: CoworkOrgId, structure: OrgStructure): Promise<void> {
    this.structures.set(orgId, structure);

    await memoryEngine.setWorkingMemory(orgId, 'structure', structure);
  }

  async getStructure(orgId: CoworkOrgId): Promise<OrgStructure | null> {
    return this.structures.get(orgId) || null;
  }

  async updateStructure(orgId: CoworkOrgId, structure: Partial<OrgStructure>): Promise<void> {
    const existing = this.structures.get(orgId);
    if (!existing) {
      throw new Error(`Structure not found for organization: ${orgId}`);
    }

    const updated: OrgStructure = {
      ...existing,
      ...structure,
    };

    this.structures.set(orgId, updated);

    await memoryEngine.setWorkingMemory(orgId, 'structure', updated);
  }

  async createRole(orgId: CoworkOrgId, role: OrgRole): Promise<void> {
    const orgRoles = this.roles.get(orgId) || new Map();
    orgRoles.set(role.id, role);
    this.roles.set(orgId, orgRoles);

    await memoryEngine.setWorkingMemory(orgId, `role_${role.id}`, role);
  }

  async getRole(orgId: CoworkOrgId, roleId: string): Promise<OrgRole | null> {
    const orgRoles = this.roles.get(orgId);
    if (!orgRoles) return null;
    return orgRoles.get(roleId) || null;
  }

  async listRoles(orgId: CoworkOrgId): Promise<OrgRole[]> {
    const orgRoles = this.roles.get(orgId);
    if (!orgRoles) return [];
    return Array.from(orgRoles.values());
  }

  async updateRole(orgId: CoworkOrgId, roleId: string, updates: Partial<OrgRole>): Promise<void> {
    const orgRoles = this.roles.get(orgId);
    if (!orgRoles) {
      throw new Error(`Roles not found for organization: ${orgId}`);
    }

    const role = orgRoles.get(roleId);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }

    const updated: OrgRole = {
      ...role,
      ...updates,
    };

    orgRoles.set(roleId, updated);
    this.roles.set(orgId, orgRoles);

    await memoryEngine.setWorkingMemory(orgId, `role_${roleId}`, updated);
  }

  async deleteRole(orgId: CoworkOrgId, roleId: string): Promise<void> {
    const orgRoles = this.roles.get(orgId);
    if (!orgRoles) return;

    orgRoles.delete(roleId);
    this.roles.set(orgId, orgRoles);

    await memoryEngine.deleteWorkingMemory(orgId, `role_${roleId}`);
  }

  async assignRole(orgId: CoworkOrgId, userId: string, roleId: string): Promise<void> {
    await identityPermissions.addUserToOrganization(userId, orgId, roleId as any);
  }

  async removeRole(orgId: CoworkOrgId, userId: string): Promise<void> {
    await identityPermissions.removeUserFromOrganization(userId, orgId);
  }

  async createPolicy(orgId: CoworkOrgId, policy: OrgPolicy): Promise<void> {
    const orgPolicies = this.policies.get(orgId) || [];
    orgPolicies.push(policy);
    this.policies.set(orgId, orgPolicies);

    await memoryEngine.setWorkingMemory(orgId, `policy_${policy.id}`, policy);
  }

  async getPolicy(orgId: CoworkOrgId, policyId: string): Promise<OrgPolicy | null> {
    const orgPolicies = this.policies.get(orgId);
    if (!orgPolicies) return null;
    return orgPolicies.find(p => p.id === policyId) || null;
  }

  async listPolicies(orgId: CoworkOrgId): Promise<OrgPolicy[]> {
    return this.policies.get(orgId) || [];
  }

  async updatePolicy(orgId: CoworkOrgId, policyId: string, updates: Partial<OrgPolicy>): Promise<void> {
    const orgPolicies = this.policies.get(orgId);
    if (!orgPolicies) {
      throw new Error(`Policies not found for organization: ${orgId}`);
    }

    const index = orgPolicies.findIndex(p => p.id === policyId);
    if (index === -1) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    const updated: OrgPolicy = {
      ...orgPolicies[index],
      ...updates,
    };

    orgPolicies[index] = updated;
    this.policies.set(orgId, orgPolicies);

    await memoryEngine.setWorkingMemory(orgId, `policy_${policyId}`, updated);
  }

  async deletePolicy(orgId: CoworkOrgId, policyId: string): Promise<void> {
    const orgPolicies = this.policies.get(orgId);
    if (!orgPolicies) return;

    const filtered = orgPolicies.filter(p => p.id !== policyId);
    this.policies.set(orgId, filtered);

    await memoryEngine.deleteWorkingMemory(orgId, `policy_${policyId}`);
  }

  async getMembers(orgId: CoworkOrgId): Promise<OrgMember[]> {
    const members = await identityPermissions.listOrganizationMembers(orgId);

    return members.map((member: any) => ({
      userId: member.userId,
      role: member.role,
      joinedAt: new Date(), // Would need to track this separately
    }));
  }

  async getOrgStats(orgId: CoworkOrgId): Promise<{
    totalMembers: number;
    totalRoles: number;
    totalPolicies: number;
    structureDepth: number;
  }> {
    const members = await this.getMembers(orgId);
    const roles = await this.listRoles(orgId);
    const policies = await this.listPolicies(orgId);
    const structure = await this.getStructure(orgId);

    let structureDepth = 0;
    if (structure) {
      const calculateDepth = (node: any, depth: number): number => {
        if (!node.children || node.children.length === 0) return depth;
        return Math.max(...node.children.map((child: any) => calculateDepth(child, depth + 1)));
      };
      structureDepth = calculateDepth(structure, 0);
    }

    return {
      totalMembers: members.length,
      totalRoles: roles.length,
      totalPolicies: policies.length,
      structureDepth,
    };
  }

  private async createDefaultStructure(orgId: CoworkOrgId): Promise<void> {
    const structure: OrgStructure = {
      id: uuidv4(),
      name: 'Default Structure',
      nodes: [
        {
          id: uuidv4(),
          name: 'Executive',
          type: 'department',
          parentId: null,
          children: [],
        },
        {
          id: uuidv4(),
          name: 'Engineering',
          type: 'department',
          parentId: null,
          children: [],
        },
        {
          id: uuidv4(),
          name: 'Operations',
          type: 'department',
          parentId: null,
          children: [],
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.structures.set(orgId, structure);
  }

  private async createDefaultRoles(orgId: CoworkOrgId): Promise<void> {
    const roles: OrgRole[] = [
      {
        id: 'owner',
        name: 'Owner',
        description: 'Full access to all organization resources',
        permissions: ['*'],
        level: 100,
      },
      {
        id: 'admin',
        name: 'Administrator',
        description: 'Administrative access to organization',
        permissions: ['manage_members', 'manage_roles', 'manage_policies', 'manage_structure'],
        level: 80,
      },
      {
        id: 'member',
        name: 'Member',
        description: 'Standard member access',
        permissions: ['read', 'write', 'comment'],
        level: 50,
      },
      {
        id: 'viewer',
        name: 'Viewer',
        description: 'Read-only access',
        permissions: ['read'],
        level: 10,
      },
    ];

    const orgRoles = new Map<string, OrgRole>();
    for (const role of roles) {
      orgRoles.set(role.id, role);
    }

    this.roles.set(orgId, orgRoles);
  }

  getStats() {
    return {
      totalOrganizations: this.organizations.size,
      totalStructures: this.structures.size,
      totalRoles: Array.from(this.roles.values()).reduce((sum, map) => sum + map.size, 0),
      totalPolicies: Array.from(this.policies.values()).reduce((sum, arr) => sum + arr.length, 0),
    };
  }

  exportState(): Record<string, any> {
    const nestedMapToArray = (m: Map<string, Map<string, any>>) =>
      Array.from(m.entries()).map(([k, v]) => [k, Array.from(v.entries())]);
    return {
      organizations: Array.from(this.organizations.entries()),
      structures: Array.from(this.structures.entries()),
      roles: nestedMapToArray(this.roles),
      policies: Array.from(this.policies.entries()),
    };
  }

  importState(state: Record<string, any>): void {
    this.organizations = new Map(state.organizations || []);
    this.structures = new Map(state.structures || []);
    this.roles = new Map(
      (state.roles || []).map(([k, v]: [string, [string, any][]]) => [k, new Map(v)])
    );
    this.policies = new Map(state.policies || []);
  }
}

// Singleton instance
export const organizationBuilder = new OrganizationBuilder();
