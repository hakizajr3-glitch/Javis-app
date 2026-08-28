import { v4 as uuidv4 } from 'uuid';
import {
  UserTaskId,
  ProjectId,
  UserTask,
  Subtask,
  Project,
  TaskFilter,
  TaskAssignment,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';
import { organizationBuilder } from '../cowork-v2/organizationBuilder.js';
import { aiWorkforce } from '../cowork-v2/aiWorkforce.js';

export class TasksManager {
  private tasks: Map<UserTaskId, UserTask> = new Map();
  private projects: Map<ProjectId, Project> = new Map();
  private assignments: Map<string, TaskAssignment> = new Map();

  async createTask(
    title: string,
    description: string,
    createdBy: string,
    projectId?: ProjectId,
    organizationId?: string,
    agentId?: string,
    priority: UserTask['priority'] = 'medium',
    dueDate?: Date,
    tags: string[] = []
  ): Promise<UserTaskId> {
    const taskId = uuidv4() as UserTaskId;

    // Verify organization exists if provided
    if (organizationId) {
      const org = await organizationBuilder.getOrganization(organizationId);
      if (!org) {
        throw new Error(`Organization not found: ${organizationId}`);
      }
    }

    // Verify agent exists if provided
    if (agentId) {
      const agent = await aiWorkforce.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }
    }

    const task: UserTask = {
      id: taskId,
      title,
      description,
      status: 'todo',
      priority,
      projectId,
      organizationId,
      agentId,
      dueDate,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags,
      dependencies: [],
      subtasks: [],
    };

    this.tasks.set(taskId, task);

    await memoryEngine.setWorkingMemory(taskId, 'task', task);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_STARTED,
      payload: { taskId, title, organizationId, agentId },
      timestamp: new Date(),
      source: 'TasksManager',
    });

    return taskId;
  }

  async updateTask(taskId: UserTaskId, updates: Partial<Omit<UserTask, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const updatedTask: UserTask = {
      ...task,
      ...updates,
      updatedAt: new Date(),
    };

    // Set completedAt if status changed to completed
    if (updates.status === 'completed' && task.status !== 'completed') {
      updatedTask.completedAt = new Date();
    }

    this.tasks.set(taskId, updatedTask);

    await memoryEngine.setWorkingMemory(taskId, 'task', updatedTask);

    // Publish completion event if task was completed
    if (updates.status === 'completed' && task.status !== 'completed') {
      await eventBus.publish({
        id: uuidv4(),
        type: EventType.TASK_COMPLETED,
        payload: { taskId, updates },
        timestamp: new Date(),
        source: 'TasksManager',
      });
    }
  }

  async deleteTask(taskId: UserTaskId): Promise<void> {
    this.tasks.delete(taskId);
    await memoryEngine.deleteWorkingMemory(taskId, 'task');
  }

  async getTask(taskId: UserTaskId): Promise<UserTask | null> {
    return this.tasks.get(taskId) || null;
  }

  async listTasks(filter?: TaskFilter): Promise<UserTask[]> {
    let tasks = Array.from(this.tasks.values());

    if (filter) {
      if (filter.projectId) {
        tasks = tasks.filter(t => t.projectId === filter.projectId);
      }
      if (filter.organizationId) {
        tasks = tasks.filter(t => t.organizationId === filter.organizationId);
      }
      if (filter.assignedTo) {
        tasks = tasks.filter(t => t.assignedTo === filter.assignedTo);
      }
      if (filter.agentId) {
        tasks = tasks.filter(t => t.agentId === filter.agentId);
      }
      if (filter.status) {
        tasks = tasks.filter(t => t.status === filter.status);
      }
      if (filter.priority) {
        tasks = tasks.filter(t => t.priority === filter.priority);
      }
      if (filter.tags && filter.tags.length > 0) {
        tasks = tasks.filter(t => filter.tags!.some(tag => t.tags.includes(tag)));
      }
      if (filter.dueBefore) {
        tasks = tasks.filter(t => t.dueDate && t.dueDate <= filter.dueBefore!);
      }
      if (filter.dueAfter) {
        tasks = tasks.filter(t => t.dueDate && t.dueDate >= filter.dueAfter!);
      }
      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase();
        tasks = tasks.filter(t =>
          t.title.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
        );
      }
    }

    return tasks.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async assignTask(taskId: UserTaskId, assignedTo: string, assignedBy: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const assignmentId = uuidv4();
    const assignment: TaskAssignment = {
      taskId,
      assignedTo,
      assignedAt: new Date(),
      assignedBy,
    };

    this.assignments.set(assignmentId, assignment);

    await this.updateTask(taskId, { assignedTo });

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.COWORKER_ASSIGNED,
      payload: { taskId, assignedTo, assignedBy },
      timestamp: new Date(),
      source: 'TasksManager',
    });
  }

  async addSubtask(taskId: UserTaskId, title: string): Promise<string> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const subtaskId = uuidv4();
    const subtask: Subtask = {
      id: subtaskId,
      title,
      completed: false,
    };

    const updatedTask: UserTask = {
      ...task,
      subtasks: [...task.subtasks, subtask],
      updatedAt: new Date(),
    };

    this.tasks.set(taskId, updatedTask);
    await memoryEngine.setWorkingMemory(taskId, 'task', updatedTask);

    return subtaskId;
  }

  async completeSubtask(taskId: UserTaskId, subtaskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const updatedSubtasks = task.subtasks.map(st =>
      st.id === subtaskId
        ? { ...st, completed: true, completedAt: new Date() } as Subtask
        : st
    );

    await this.updateTask(taskId, { subtasks: updatedSubtasks });
  }

  async createProject(
    name: string,
    description: string,
    createdBy: string,
    organizationId?: string,
    color?: string
  ): Promise<ProjectId> {
    const projectId = uuidv4() as ProjectId;

    // Verify organization exists if provided
    if (organizationId) {
      const org = await organizationBuilder.getOrganization(organizationId);
      if (!org) {
        throw new Error(`Organization not found: ${organizationId}`);
      }
    }

    const project: Project = {
      id: projectId,
      name,
      description,
      organizationId,
      status: 'active',
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
      color,
    };

    this.projects.set(projectId, project);

    await memoryEngine.setWorkingMemory(projectId, 'project', project);

    return projectId;
  }

  async updateProject(projectId: ProjectId, updates: Partial<Omit<Project, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const updatedProject: Project = {
      ...project,
      ...updates,
      updatedAt: new Date(),
    };

    this.projects.set(projectId, updatedProject);
    await memoryEngine.setWorkingMemory(projectId, 'project', updatedProject);
  }

  async deleteProject(projectId: ProjectId): Promise<void> {
    this.projects.delete(projectId);
    await memoryEngine.deleteWorkingMemory(projectId, 'project');
  }

  async getProject(projectId: ProjectId): Promise<Project | null> {
    return this.projects.get(projectId) || null;
  }

  async listProjects(organizationId?: string, createdBy?: string): Promise<Project[]> {
    let projects = Array.from(this.projects.values());

    if (organizationId) {
      projects = projects.filter(p => p.organizationId === organizationId);
    }
    if (createdBy) {
      projects = projects.filter(p => p.createdBy === createdBy);
    }

    return projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getTasksByProject(projectId: ProjectId): Promise<UserTask[]> {
    return this.listTasks({ projectId });
  }

  async assignTaskToAgent(taskId: UserTaskId, agentId: string, assignedBy: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const agent = await aiWorkforce.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    await this.updateTask(taskId, { agentId });

    await aiWorkforce.updateAgentStatus(agentId, 'busy', taskId);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.COWORKER_ASSIGNED,
      payload: { taskId, agentId, assignedBy },
      timestamp: new Date(),
      source: 'TasksManager',
    });
  }

  exportState(): Record<string, any> {
    return {
      tasks: Array.from(this.tasks.entries()),
      projects: Array.from(this.projects.entries()),
      assignments: Array.from(this.assignments.entries()),
    };
  }

  importState(state: Record<string, any>): void {
    this.tasks = new Map(state.tasks || []);
    this.projects = new Map(state.projects || []);
    this.assignments = new Map(state.assignments || []);
  }
}

// Singleton instance
export const tasksManager = new TasksManager();
