import { v4 as uuidv4 } from 'uuid';
import {
  Workspace,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';
import { myAIDocs } from '../myaidocs/myaidocs.js';

export class WorkspaceManager {
  private workspaces: Map<string, Workspace> = new Map();
  private activeWorkspace: string | null = null;

  async createWorkspace(
    name: string,
    type: 'project' | 'mission' | 'sandbox',
    path: string,
    userId: string
  ): Promise<string> {
    const workspaceId = uuidv4();

    const workspace: Workspace = {
      id: workspaceId,
      name,
      type,
      path,
      state: {},
      resources: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: userId,
    };

    this.workspaces.set(workspaceId, workspace);

    // Initialize workspace in memory
    await memoryEngine.setWorkingMemory(workspaceId, 'workspace_info', workspace);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { workspaceId, name, type },
      timestamp: new Date(),
      source: 'WorkspaceManager',
      correlationId: userId,
    });

    return workspaceId;
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    return this.workspaces.get(workspaceId) || null;
  }

  async listWorkspaces(filters?: { type?: string; userId?: string }): Promise<Workspace[]> {
    let workspaces = Array.from(this.workspaces.values());

    if (filters) {
      if (filters.type) {
        workspaces = workspaces.filter(w => w.type === filters.type);
      }
      if (filters.userId) {
        workspaces = workspaces.filter(w => w.createdBy === filters.userId);
      }
    }

    return workspaces.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const updatedWorkspace: Workspace = {
      ...workspace,
      ...updates,
      updatedAt: new Date(),
    };

    this.workspaces.set(workspaceId, updatedWorkspace);

    await memoryEngine.setWorkingMemory(workspaceId, 'workspace_info', updatedWorkspace);
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Clean up memory
    await memoryEngine.deleteWorkingMemory(workspaceId, 'workspace_info');

    // Clean up artifacts
    const artifacts = await myAIDocs.listArtifacts({ missionId: workspaceId });
    for (const artifact of artifacts) {
      await myAIDocs.deleteArtifact(artifact.id);
    }

    this.workspaces.delete(workspaceId);

    if (this.activeWorkspace === workspaceId) {
      this.activeWorkspace = null;
    }

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { workspaceId, action: 'deleted' },
      timestamp: new Date(),
      source: 'WorkspaceManager',
    });
  }

  async setActiveWorkspace(workspaceId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    this.activeWorkspace = workspaceId;

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { workspaceId, action: 'activated' },
      timestamp: new Date(),
      source: 'WorkspaceManager',
    });
  }

  async getActiveWorkspace(): Promise<Workspace | null> {
    if (!this.activeWorkspace) {
      return null;
    }

    return this.workspaces.get(this.activeWorkspace) || null;
  }

  async updateWorkspaceState(workspaceId: string, state: Record<string, any>): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    workspace.state = { ...workspace.state, ...state };
    workspace.updatedAt = new Date();

    this.workspaces.set(workspaceId, workspace);

    await memoryEngine.setWorkingMemory(workspaceId, 'workspace_state', workspace.state);
  }

  async getWorkspaceState(workspaceId: string): Promise<Record<string, any>> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    return workspace.state;
  }

  async addResource(workspaceId: string, resourceId: string, resource: any): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    workspace.resources[resourceId] = resource;
    workspace.updatedAt = new Date();

    this.workspaces.set(workspaceId, workspace);

    await memoryEngine.setWorkingMemory(workspaceId, `resource_${resourceId}`, resource);
  }

  async getResource(workspaceId: string, resourceId: string): Promise<any> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    return workspace.resources[resourceId] || null;
  }

  async listResources(workspaceId: string): Promise<Record<string, any>> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    return workspace.resources;
  }

  async removeResource(workspaceId: string, resourceId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    delete workspace.resources[resourceId];
    workspace.updatedAt = new Date();

    this.workspaces.set(workspaceId, workspace);

    await memoryEngine.deleteWorkingMemory(workspaceId, `resource_${resourceId}`);
  }

  async snapshotWorkspace(workspaceId: string): Promise<string> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const snapshot = {
      workspace,
      state: workspace.state,
      resources: workspace.resources,
      timestamp: new Date(),
    };

    const content = Buffer.from(JSON.stringify(snapshot, null, 2));
    const artifactId = await myAIDocs.createArtifact({
      type: 'other',
      name: `workspace_snapshot_${workspaceId}_${Date.now()}`,
      content,
      metadata: {
        mimeType: 'application/json',
        size: content.length,
        checksum: Buffer.from(content).toString('base64'),
        description: `Workspace snapshot for ${workspace.name}`,
        custom: {
          workspaceId,
          workspaceName: workspace.name,
        },
      },
      createdBy: 'system',
      missionId: workspaceId,
      tags: ['workspace_snapshot', workspace.type],
    });

    return artifactId;
  }

  async restoreWorkspace(artifactId: string, workspaceId: string): Promise<void> {
    const artifact = await myAIDocs.getArtifact(artifactId);
    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    const snapshot = JSON.parse(artifact.content.toString());

    if (snapshot.workspace.id !== workspaceId) {
      throw new Error('Snapshot does not match workspace ID');
    }

    const workspace: Workspace = {
      ...snapshot.workspace,
      id: workspaceId,
      updatedAt: new Date(),
    };

    this.workspaces.set(workspaceId, workspace);

    await memoryEngine.setWorkingMemory(workspaceId, 'workspace_info', workspace);
    await memoryEngine.setWorkingMemory(workspaceId, 'workspace_state', snapshot.state);

    for (const [resourceId, resource] of Object.entries(snapshot.resources)) {
      await memoryEngine.setWorkingMemory(workspaceId, `resource_${resourceId}`, resource);
    }

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { workspaceId, artifactId, action: 'restored' },
      timestamp: new Date(),
      source: 'WorkspaceManager',
    });
  }

  async getWorkspaceStats(workspaceId: string): Promise<{
    stateSize: number;
    resourceCount: number;
    artifactCount: number;
    lastModified: Date;
  }> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const artifacts = await myAIDocs.listArtifacts({ missionId: workspaceId });

    return {
      stateSize: JSON.stringify(workspace.state).length,
      resourceCount: Object.keys(workspace.resources).length,
      artifactCount: artifacts.length,
      lastModified: workspace.updatedAt,
    };
  }

  getStats() {
    return {
      totalWorkspaces: this.workspaces.size,
      activeWorkspace: this.activeWorkspace,
      byType: {
        project: Array.from(this.workspaces.values()).filter(w => w.type === 'project').length,
        mission: Array.from(this.workspaces.values()).filter(w => w.type === 'mission').length,
        sandbox: Array.from(this.workspaces.values()).filter(w => w.type === 'sandbox').length,
      },
    };
  }
}

// Singleton instance
export const workspaceManager = new WorkspaceManager();
