import { v4 as uuidv4 } from 'uuid';
import {
  MissionId,
  CompiledMission,
  MissionPlan,
  Task,
  ResourceRequirement,
} from './types.js';
import { llmOrchestrator } from '../llm-orchestrator/llmOrchestrator.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';

export class MissionCompiler {
  async compileMission(
    instructions: string,
    context: Record<string, any>,
    userId: string
  ): Promise<CompiledMission> {
    const startTime = Date.now();
    const missionId = uuidv4() as MissionId;

    // Use LLM to parse instructions into a structured plan
    const plan = await this.generatePlan(instructions, context, userId);

    const compilationTime = Date.now() - startTime;

    const compiled: CompiledMission = {
      id: missionId,
      plan,
      compilationTime,
      confidence: this.calculateConfidence(plan),
      warnings: this.generateWarnings(plan),
    };

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { missionId, compilationTime, confidence: compiled.confidence },
      timestamp: new Date(),
      source: 'MissionCompiler',
      correlationId: userId,
    });

    return compiled;
  }

  async recompileMission(
    missionId: MissionId,
    instructions: string,
    context: Record<string, any>,
    userId: string
  ): Promise<CompiledMission> {
    // Store original plan for comparison
    const originalPlan = await memoryEngine.getWorkingMemory(missionId, 'compiled_plan');
    
    const compiled = await this.compileMission(instructions, context, userId);

    // Compare with original plan
    if (originalPlan) {
      compiled.warnings.push('Mission recompiled - plan may have changed');
    }

    return compiled;
  }

  async validatePlan(plan: MissionPlan): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate tasks
    if (plan.tasks.length === 0) {
      errors.push('Plan must contain at least one task');
    }

    // Validate task dependencies
    for (const task of plan.tasks) {
      const dependencies = plan.dependencies.get(task.id) || [];
      for (const depId of dependencies) {
        const depTask = plan.tasks.find(t => t.id === depId);
        if (!depTask) {
          errors.push(`Task ${task.id} depends on non-existent task ${depId}`);
        }
      }
    }

    // Check for circular dependencies
    if (this.hasCircularDependencies(plan)) {
      errors.push('Plan contains circular dependencies');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async estimateExecutionTime(plan: MissionPlan): Promise<number> {
    // Estimate based on task types and complexity
    let totalTime = 0;

    for (const task of plan.tasks) {
      switch (task.type) {
        case 'llm':
          totalTime += 5000; // 5 seconds average
          break;
        case 'automation':
          totalTime += 2000; // 2 seconds average
          break;
        case 'connector':
          totalTime += 3000; // 3 seconds average
          break;
        case 'memory':
          totalTime += 1000; // 1 second average
          break;
        case 'vision':
          totalTime += 10000; // 10 seconds average
          break;
        default:
          totalTime += 3000;
      }
    }

    return totalTime;
  }

  private async generatePlan(
    instructions: string,
    context: Record<string, any>,
    userId: string
  ): Promise<MissionPlan> {
    // Retrieve relevant context from memory
    const personalMemory = await memoryEngine.searchPersonalMemory(userId, instructions);
    const contextSummary = this.summarizeContext(personalMemory, context);

    const prompt = `
Parse the following mission instructions into a structured execution plan:

Instructions: "${instructions}"

Context: ${contextSummary}

Generate a JSON response with the following structure:
{
  "tasks": [
    {
      "id": "task-1",
      "name": "Task Name",
      "description": "Task description",
      "type": "llm|automation|connector|memory|vision|custom",
      "parameters": {}
    }
  ],
  "dependencies": {
    "task-2": ["task-1"],
    "task-3": ["task-1", "task-2"]
  },
  "resources": [
    {
      "type": "cpu|memory|disk|network|llm|connector",
      "amount": 1,
      "unit": "units"
    }
  ]
}

Break down the mission into logical, executable steps. Ensure dependencies are correctly specified.
`;

    try {
      const response = await llmOrchestrator.executeRequest({
        prompt,
        provider: 'anthropic', // Use Claude for better structured output
      });

      const parsed = JSON.parse(response.content);

      // Validate and sanitize the parsed plan
      return this.sanitizePlan(parsed);
    } catch (error) {
      console.error('Mission compilation failed:', error);

      // Return a fallback plan
      return this.createFallbackPlan(instructions);
    }
  }

  private sanitizePlan(plan: any): MissionPlan {
    const tasks: Task[] = (plan.tasks || []).map((t: any, index: number) => ({
      id: t.id || `task-${index}`,
      name: t.name || `Task ${index + 1}`,
      description: t.description || '',
      type: t.type || 'custom',
      parameters: t.parameters || {},
      status: 'pending',
    }));

    const dependencies = new Map<string, string[]>();
    if (plan.dependencies) {
      for (const [taskId, deps] of Object.entries(plan.dependencies)) {
        dependencies.set(taskId, Array.isArray(deps) ? deps as string[] : []);
      }
    }

    const resources: ResourceRequirement[] = (plan.resources || []).map((r: any) => ({
      type: r.type || 'cpu',
      amount: r.amount || 1,
      unit: r.unit || 'units',
    }));

    return {
      tasks,
      dependencies,
      estimatedDuration: 0, // Will be calculated separately
      resources,
    };
  }

  private createFallbackPlan(instructions: string): MissionPlan {
    const taskId = uuidv4();

    return {
      tasks: [
        {
          id: taskId,
          name: 'Execute Mission',
          description: instructions,
          type: 'llm',
          parameters: { instructions },
          status: 'pending',
          critical: true,
        },
      ],
      dependencies: new Map(),
      estimatedDuration: 10000,
      resources: [
        {
          type: 'llm',
          amount: 1,
          unit: 'request',
        },
      ],
    };
  }

  private calculateConfidence(plan: MissionPlan): number {
    // Confidence based on plan structure and completeness
    let confidence = 0.5;

    if (plan.tasks.length > 0) confidence += 0.2;
    if (plan.dependencies.size > 0) confidence += 0.1;
    if (plan.resources.length > 0) confidence += 0.1;
    if (plan.tasks.every(t => t.type !== 'custom')) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private generateWarnings(plan: MissionPlan): string[] {
    const warnings: string[] = [];

    if (plan.tasks.length === 0) {
      warnings.push('No tasks in plan');
    }

    if (plan.tasks.some(t => t.type === 'custom')) {
      warnings.push('Plan contains custom tasks that may require manual implementation');
    }

    if (this.hasCircularDependencies(plan)) {
      warnings.push('Plan contains circular dependencies');
    }

    if (plan.estimatedDuration > 60000) {
      warnings.push('Estimated execution time exceeds 1 minute');
    }

    return warnings;
  }

  private hasCircularDependencies(plan: MissionPlan): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (taskId: string): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);

      const dependencies = plan.dependencies.get(taskId) || [];
      for (const depId of dependencies) {
        if (!visited.has(depId)) {
          if (hasCycle(depId)) return true;
        } else if (recursionStack.has(depId)) {
          return true;
        }
      }

      recursionStack.delete(taskId);
      return false;
    };

    for (const task of plan.tasks) {
      if (!visited.has(task.id)) {
        if (hasCycle(task.id)) return true;
      }
    }

    return false;
  }

  private summarizeContext(memory: any[], context: Record<string, any>): string {
    const summary: string[] = [];

    if (memory && memory.length > 0) {
      summary.push(`Relevant memory: ${memory.length} items`);
    }

    if (context.missionId) {
      summary.push(`Related to mission: ${context.missionId}`);
    }

    if (context.projectId) {
      summary.push(`Project: ${context.projectId}`);
    }

    return summary.join(', ') || 'No additional context';
  }

  getStats() {
    return {
      // Statistics about compilation performance
    };
  }
}

// Singleton instance
export const missionCompiler = new MissionCompiler();
