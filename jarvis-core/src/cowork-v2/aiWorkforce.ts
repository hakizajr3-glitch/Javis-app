import { v4 as uuidv4 } from 'uuid';
import {
  AgentId,
  TeamId,
  Agent,
  AgentPerformance,
  Team,
  WorkforceAssignment,
  WorkforceCoordination,
  AgentCommunication,
  WorkforceMetrics,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';

export class AIWorkforce {
  private agents: Map<AgentId, Agent> = new Map();
  private teams: Map<TeamId, Team> = new Map();
  private assignments: Map<string, WorkforceAssignment> = new Map();
  private communications: Map<string, AgentCommunication> = new Map();
  private coordination: WorkforceCoordination = {
    activeAgents: new Map(),
    availableAgents: [],
    busyAgents: [],
    taskQueue: [],
    completedAssignments: [],
  };

  async createAgent(
    name: string,
    type: 'human' | 'ai' | 'hybrid',
    role: string,
    capabilities: string[],
    _organizationId: string
  ): Promise<AgentId> {
    const agentId = uuidv4() as AgentId;

    const agent: Agent = {
      id: agentId,
      name,
      type,
      role,
      capabilities,
      status: 'idle',
      performance: {
        tasksCompleted: 0,
        tasksFailed: 0,
        averageCompletionTime: 0,
        successRate: 1.0,
        totalWorkTime: 0,
      },
      createdAt: new Date(),
      lastActive: new Date(),
    };

    this.agents.set(agentId, agent);
    this.coordination.activeAgents.set(agentId, agent);
    this.coordination.availableAgents.push(agentId);

    await memoryEngine.setWorkingMemory(agentId, 'agent_info', agent);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.COWORKER_ASSIGNED,
      payload: { agentId, name, type, role },
      timestamp: new Date(),
      source: 'AIWorkforce',
    });

    return agentId;
  }

  async getAgent(agentId: AgentId): Promise<Agent | null> {
    return this.agents.get(agentId) || null;
  }

  async listAgents(filters?: { type?: string; status?: string; teamId?: TeamId }): Promise<Agent[]> {
    let agents = Array.from(this.agents.values());

    if (filters) {
      if (filters.type) {
        agents = agents.filter(a => a.type === filters.type);
      }
      if (filters.status) {
        agents = agents.filter(a => a.status === filters.status);
      }
      if (filters.teamId) {
        agents = agents.filter(a => a.teamId === filters.teamId);
      }
    }

    return agents.sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
  }

  async updateAgentStatus(agentId: AgentId, status: 'active' | 'idle' | 'busy' | 'offline', currentTask?: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const oldStatus = agent.status;
    agent.status = status;
    agent.currentTask = currentTask;
    agent.lastActive = new Date();

    this.agents.set(agentId, agent);
    this.coordination.activeAgents.set(agentId, agent);

    // Update coordination lists
    if (oldStatus === 'idle' && status !== 'idle') {
      this.coordination.availableAgents = this.coordination.availableAgents.filter(id => id !== agentId);
    }
    if (oldStatus !== 'idle' && status === 'idle') {
      this.coordination.availableAgents.push(agentId);
    }
    if (oldStatus !== 'busy' && status === 'busy') {
      this.coordination.busyAgents.push(agentId);
    }
    if (oldStatus === 'busy' && status !== 'busy') {
      this.coordination.busyAgents = this.coordination.busyAgents.filter(id => id !== agentId);
    }

    await memoryEngine.setWorkingMemory(agentId, 'agent_info', agent);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { agentId, status, currentTask },
      timestamp: new Date(),
      source: 'AIWorkforce',
    });
  }

  async updateAgentPerformance(agentId: AgentId, performance: Partial<AgentPerformance>): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    agent.performance = { ...agent.performance, ...performance };
    this.agents.set(agentId, agent);

    await memoryEngine.setWorkingMemory(agentId, 'agent_info', agent);
  }

  async createTeam(
    name: string,
    description: string,
    leadAgentId: AgentId,
    organizationId: string
  ): Promise<TeamId> {
    const teamId = uuidv4() as TeamId;

    const team: Team = {
      id: teamId,
      name,
      description,
      members: [leadAgentId],
      leadAgentId,
      createdAt: new Date(),
      updatedAt: new Date(),
      organizationId,
    };

    this.teams.set(teamId, team);

    // Update agent's team assignment
    const agent = this.agents.get(leadAgentId);
    if (agent) {
      agent.teamId = teamId;
      this.agents.set(leadAgentId, agent);
    }

    await memoryEngine.setWorkingMemory(teamId, 'team_info', team);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { teamId, name, leadAgentId },
      timestamp: new Date(),
      source: 'AIWorkforce',
    });

    return teamId;
  }

  async addAgentToTeam(teamId: TeamId, agentId: AgentId): Promise<void> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (!team.members.includes(agentId)) {
      team.members.push(agentId);
      team.updatedAt = new Date();
      this.teams.set(teamId, team);

      agent.teamId = teamId;
      this.agents.set(agentId, agent);

      await memoryEngine.setWorkingMemory(teamId, 'team_info', team);
      await memoryEngine.setWorkingMemory(agentId, 'agent_info', agent);
    }
  }

  async removeAgentFromTeam(teamId: TeamId, agentId: AgentId): Promise<void> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    team.members = team.members.filter(id => id !== agentId);
    team.updatedAt = new Date();
    this.teams.set(teamId, team);

    const agent = this.agents.get(agentId);
    if (agent) {
      agent.teamId = undefined;
      this.agents.set(agentId, agent);
    }

    await memoryEngine.setWorkingMemory(teamId, 'team_info', team);
  }

  async getTeam(teamId: TeamId): Promise<Team | null> {
    return this.teams.get(teamId) || null;
  }

  async listTeams(organizationId: string): Promise<Team[]> {
    return Array.from(this.teams.values())
      .filter(t => t.organizationId === organizationId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async assignTask(
    agentId: AgentId,
    taskId: string,
    missionId: string,
    priority: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<string> {
    const assignmentId = uuidv4();

    const assignment: WorkforceAssignment = {
      id: assignmentId,
      agentId,
      taskId,
      missionId,
      assignedAt: new Date(),
      status: 'assigned',
      priority,
    };

    this.assignments.set(assignmentId, assignment);
    this.coordination.taskQueue.push(assignment);

    // Update agent status
    await this.updateAgentStatus(agentId, 'busy', taskId);

    await memoryEngine.setWorkingMemory(assignmentId, 'assignment', assignment);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { assignmentId, agentId, taskId, priority },
      timestamp: new Date(),
      source: 'AIWorkforce',
    });

    return assignmentId;
  }

  async completeAssignment(assignmentId: string, success: boolean, duration: number): Promise<void> {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) {
      throw new Error(`Assignment not found: ${assignmentId}`);
    }

    assignment.status = success ? 'completed' : 'failed';
    assignment.completedAt = new Date();

    this.assignments.set(assignmentId, assignment);
    this.coordination.completedAssignments.push(assignment);

    // Update agent performance
    const agent = this.agents.get(assignment.agentId);
    if (agent) {
      agent.performance.tasksCompleted += success ? 1 : 0;
      agent.performance.tasksFailed += success ? 0 : 1;
      agent.performance.totalWorkTime += duration;

      const totalTasks = agent.performance.tasksCompleted + agent.performance.tasksFailed;
      agent.performance.successRate = agent.performance.tasksCompleted / totalTasks;
      agent.performance.averageCompletionTime = agent.performance.totalWorkTime / totalTasks;

      // Update agent status to idle
      await this.updateAgentStatus(assignment.agentId, 'idle');

      this.agents.set(assignment.agentId, agent);
    }

    await memoryEngine.setWorkingMemory(assignmentId, 'assignment', assignment);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { assignmentId, success, duration },
      timestamp: new Date(),
      source: 'AIWorkforce',
    });
  }

  async sendMessage(
    fromAgentId: AgentId,
    message: string,
    messageType: 'task' | 'status' | 'request' | 'response' | 'alert',
    toAgentId?: AgentId,
    relatedTaskId?: string
  ): Promise<string> {
    const communicationId = uuidv4();

    const communication: AgentCommunication = {
      id: communicationId,
      fromAgentId,
      toAgentId,
      message,
      messageType,
      timestamp: new Date(),
      relatedTaskId,
    };

    this.communications.set(communicationId, communication);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { communicationId, fromAgentId, toAgentId, messageType },
      timestamp: new Date(),
      source: 'AIWorkforce',
    });

    return communicationId;
  }

  async getMessages(agentId?: AgentId, limit: number = 50): Promise<AgentCommunication[]> {
    let messages = Array.from(this.communications.values());

    if (agentId) {
      messages = messages.filter(m => m.fromAgentId === agentId || m.toAgentId === agentId);
    }

    return messages
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getCoordination(): Promise<WorkforceCoordination> {
    return this.coordination;
  }

  async getMetrics(): Promise<WorkforceMetrics> {
    const totalAgents = this.agents.size;
    const activeAgents = Array.from(this.agents.values()).filter(a => a.status === 'active').length;
    const idleAgents = Array.from(this.agents.values()).filter(a => a.status === 'idle').length;
    const busyAgents = Array.from(this.agents.values()).filter(a => a.status === 'busy').length;

    const totalAssignments = this.assignments.size;
    const completedAssignments = this.coordination.completedAssignments.length;
    const failedAssignments = this.coordination.completedAssignments.filter(a => a.status === 'failed').length;

    // Calculate average task duration
    const completed = this.coordination.completedAssignments.filter(a => a.completedAt);
    const durations = completed.map(a => a.completedAt!.getTime() - a.assignedAt.getTime());
    const averageTaskDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    // Calculate team efficiency
    const teamEfficiency = completedAssignments > 0 ? (completedAssignments - failedAssignments) / completedAssignments : 1.0;

    return {
      totalAgents,
      activeAgents,
      idleAgents,
      busyAgents,
      totalAssignments,
      completedAssignments,
      failedAssignments,
      averageTaskDuration,
      teamEfficiency,
    };
  }

  async findBestAgent(capabilities: string[], _priority: 'low' | 'medium' | 'high' | 'critical'): Promise<Agent | null> {
    const availableAgents = Array.from(this.agents.values())
      .filter(a => a.status === 'idle')
      .filter(a => capabilities.every(cap => a.capabilities.includes(cap)));

    if (availableAgents.length === 0) {
      return null;
    }

    // Sort by performance (success rate, average completion time)
    availableAgents.sort((a, b) => {
      if (a.performance.successRate !== b.performance.successRate) {
        return b.performance.successRate - a.performance.successRate;
      }
      return a.performance.averageCompletionTime - b.performance.averageCompletionTime;
    });

    return availableAgents[0];
  }

  getStats() {
    return {
      totalAgents: this.agents.size,
      totalTeams: this.teams.size,
      totalAssignments: this.assignments.size,
      totalCommunications: this.communications.size,
    };
  }

  exportState(): Record<string, any> {
    return {
      agents: Array.from(this.agents.entries()),
      teams: Array.from(this.teams.entries()),
      assignments: Array.from(this.assignments.entries()),
      communications: Array.from(this.communications.entries()),
      coordination: {
        activeAgents: Array.from(this.coordination.activeAgents.entries()),
        availableAgents: this.coordination.availableAgents,
        busyAgents: this.coordination.busyAgents,
        taskQueue: this.coordination.taskQueue,
        completedAssignments: this.coordination.completedAssignments,
      },
    };
  }

  importState(state: Record<string, any>): void {
    this.agents = new Map(state.agents || []);
    this.teams = new Map(state.teams || []);
    this.assignments = new Map(state.assignments || []);
    this.communications = new Map(state.communications || []);
    if (state.coordination) {
      this.coordination = {
        activeAgents: new Map(state.coordination.activeAgents || []),
        availableAgents: state.coordination.availableAgents || [],
        busyAgents: state.coordination.busyAgents || [],
        taskQueue: state.coordination.taskQueue || [],
        completedAssignments: state.coordination.completedAssignments || [],
      };
    }
  }
}

// Singleton instance
export const aiWorkforce = new AIWorkforce();
