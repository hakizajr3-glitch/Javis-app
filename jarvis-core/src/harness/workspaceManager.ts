/**
 * Isolated Workspaces — per-agent isolation for parallel execution.
 *
 * Per the master spec (Section 8):
 *   "Each autonomous coworker can receive an isolated workspace, browser
 *    profile, filesystem scope, credentials scope, terminal environment,
 *    memory scope, and optional computer/desktop session."
 *
 * Workspaces ensure that parallel agents don't interfere with each other.
 */
import { v4 as uuidv4 } from 'uuid';
import { eventBus, EventType } from '../observability/eventBus.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkspaceId = string;

export interface AgentWorkspace {
  id: WorkspaceId;
  agentId: string;
  /** Filesystem root — all file operations are scoped to this path. */
  fsRoot: string;
  /** Browser profile directory (for Playwright/browser isolation). */
  browserProfileDir?: string;
  /** Credential scope — which secrets this agent can access. */
  credentialScope: string[];
  /** Terminal environment variables (merged over base env). */
  terminalEnv: Record<string, string>;
  /** Working directory for shell commands. */
  workingDir: string;
  /** Memory scope — 'private' = only this agent, 'shared' = workforce, 'org' = department. */
  memoryScope: 'private' | 'shared' | 'org';
  /** Whether this workspace has a dedicated desktop session. */
  hasDesktopSession: boolean;
  /** Whether this workspace has a git worktree for code isolation. */
  gitWorktree?: {
    repoRoot: string;
    branch: string;
    worktreePath: string;
  };
  createdAt: Date;
  /** Whether the workspace has been cleaned up. */
  cleanedUp: boolean;
}

export interface WorkspaceCreateOptions {
  agentId: string;
  /** Base directory for all workspaces. Defaults to ~/.jarvis/workspaces/ */
  baseDir?: string;
  /** Filesystem scope — if true, creates a dedicated directory. */
  isolateFs?: boolean;
  /** Browser isolation — if true, creates a dedicated browser profile. */
  isolateBrowser?: boolean;
  /** Credentials to grant. */
  credentials?: string[];
  /** Additional environment variables. */
  env?: Record<string, string>;
  /** Working directory (if not isolating FS). */
  workingDir?: string;
  /** Memory scope. */
  memoryScope?: 'private' | 'shared' | 'org';
  /** Whether to allocate a desktop session. */
  desktopSession?: boolean;
  /** Git worktree configuration for code missions. */
  gitWorktree?: {
    repoRoot: string;
    branch: string;
  };
}

// ---------------------------------------------------------------------------
// Workspace Manager
// ---------------------------------------------------------------------------

export class WorkspaceManager {
  private workspaces: Map<WorkspaceId, AgentWorkspace> = new Map();
  private byAgent: Map<string, WorkspaceId> = new Map();
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? this.getDefaultBaseDir();
  }

  private getDefaultBaseDir(): string {
    try {
    const os = require('os');
    const path = require('path');
    return path.join(os.homedir(), '.jarvis', 'workspaces');
    } catch {
      return '/tmp/jarvis-workspaces';
    }
  }

  /**
   * Create an isolated workspace for an agent.
   */
  async createWorkspace(opts: WorkspaceCreateOptions): Promise<AgentWorkspace> {
    const id = uuidv4();
    const wsDir = `${this.baseDir}/${opts.agentId.slice(0, 8)}-${id.slice(0, 8)}`;

    const workspace: AgentWorkspace = {
      id,
      agentId: opts.agentId,
      fsRoot: opts.isolateFs ? wsDir : (opts.workingDir || process.cwd()),
      browserProfileDir: opts.isolateBrowser ? `${wsDir}/browser-profile` : undefined,
      credentialScope: opts.credentials ?? [],
      terminalEnv: opts.env ?? {},
      workingDir: opts.isolateFs ? wsDir : (opts.workingDir || process.cwd()),
      memoryScope: opts.memoryScope ?? 'private',
      hasDesktopSession: opts.desktopSession ?? false,
      gitWorktree: opts.gitWorktree ? {
        repoRoot: opts.gitWorktree.repoRoot,
        branch: opts.gitWorktree.branch,
        worktreePath: wsDir,
      } : undefined,
      createdAt: new Date(),
      cleanedUp: false,
    };

    this.workspaces.set(id, workspace);
    this.byAgent.set(opts.agentId, id);

    eventBus.publish({
      id: uuidv4(),
      type: EventType.COWORKER_ASSIGNED,
      payload: { workspaceId: id, agentId: opts.agentId, fsRoot: workspace.fsRoot },
      timestamp: new Date(),
      source: 'WorkspaceManager',
    });

    return workspace;
  }

  /**
   * Get the workspace for an agent.
   */
  getWorkspace(agentId: string): AgentWorkspace | undefined {
    const wsId = this.byAgent.get(agentId);
    if (!wsId) return undefined;
    return this.workspaces.get(wsId);
  }

  /**
   * Get a workspace by ID.
   */
  getWorkspaceById(id: WorkspaceId): AgentWorkspace | undefined {
    return this.workspaces.get(id);
  }

  /**
   * List all active workspaces.
   */
  listWorkspaces(): AgentWorkspace[] {
    return Array.from(this.workspaces.values()).filter(ws => !ws.cleanedUp);
  }

  /**
   * Check if a file path is within an agent's workspace scope.
   */
  isPathInScope(agentId: string, path: string): boolean {
    const ws = this.getWorkspace(agentId);
    if (!ws) return false;
    // Normalize and check if path starts with fsRoot
    const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/');
    const root = ws.fsRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    return normalized.startsWith(root);
  }

  /**
   * Check if an agent has access to a credential.
   */
  hasCredentialAccess(agentId: string, credentialName: string): boolean {
    const ws = this.getWorkspace(agentId);
    if (!ws) return false;
    return ws.credentialScope.includes(credentialName) ||
           ws.credentialScope.includes('*');
  }

  /**
   * Get the terminal environment for an agent (base env + workspace env).
   */
  getTerminalEnv(agentId: string): Record<string, string> {
    const ws = this.getWorkspace(agentId);
    if (!ws) return {};
    return { ...ws.terminalEnv };
  }

  /**
   * Get the working directory for an agent.
   */
  getWorkingDir(agentId: string): string {
    const ws = this.getWorkspace(agentId);
    return ws?.workingDir ?? process.cwd();
  }

  /**
   * Grant additional credentials to an agent's workspace.
   */
  grantCredential(agentId: string, credentialName: string): void {
    const ws = this.getWorkspace(agentId);
    if (!ws) return;
    if (!ws.credentialScope.includes(credentialName)) {
      ws.credentialScope.push(credentialName);
    }
  }

  /**
   * Revoke a credential from an agent's workspace.
   */
  revokeCredential(agentId: string, credentialName: string): void {
    const ws = this.getWorkspace(agentId);
    if (!ws) return;
    ws.credentialScope = ws.credentialScope.filter(c => c !== credentialName);
  }

  /**
   * Clean up a workspace — marks it as cleaned up and removes from active list.
   * In production, this would also delete the filesystem directory.
   */
  async cleanupWorkspace(agentId: string): Promise<void> {
    const wsId = this.byAgent.get(agentId);
    if (!wsId) return;
    const ws = this.workspaces.get(wsId);
    if (ws) {
      ws.cleanedUp = true;
    }
    this.byAgent.delete(agentId);

    eventBus.publish({
      id: uuidv4(),
      type: EventType.COWORKER_STATUS_CHANGED,
      payload: { workspaceId: wsId, agentId },
      timestamp: new Date(),
      source: 'WorkspaceManager',
    });
  }

  /**
   * Get stats for observability.
   */
  getStats(): { total: number; active: number; cleanedUp: number } {
    const all = Array.from(this.workspaces.values());
    return {
      total: all.length,
      active: all.filter(ws => !ws.cleanedUp).length,
      cleanedUp: all.filter(ws => ws.cleanedUp).length,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const workspaceManager = new WorkspaceManager();
