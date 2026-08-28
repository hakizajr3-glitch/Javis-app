import { AgentInstance, SubAgentRequest, AgentRun } from './types.js';
import { agentHarness } from './agentHarness.js';

export interface ParallelSubAgentResult {
  instance: AgentInstance;
  result?: string;
  error?: string;
  duration: number;
}

export class SubAgentRunner {
  /**
   * Spawn multiple sub-agents and run them in parallel.
   * Each sub-agent receives its own goal and context, and is attached to the same parent run.
   */
  async runParallel(
    requests: SubAgentRequest[],
    timeoutMs: number = 120000
  ): Promise<ParallelSubAgentResult[]> {
    const startTime = Date.now();

    const instances = await Promise.all(
      requests.map(req => agentHarness.spawnSubAgent(req))
    );

    const results = await Promise.all(
      instances.map(async (instance, index) => {
        const requestStart = Date.now();
        try {
          // Execute the sub-goal as a child run under the same parent.
          const childRun = await agentHarness.startRun({
            goal: requests[index].goal,
            userId: requests[index].userId,
            parentRunId: requests[index].parentRunId,
            context: requests[index].context,
          });

          // Wait up to the remaining timeout for the child run to finish.
          const remaining = timeoutMs - (Date.now() - startTime);
          await this.waitForRun(childRun.id, remaining);

          const completedRun = agentHarness.getRun(childRun.id);
          return {
            instance,
            result: completedRun?.result,
            error: completedRun?.error,
            duration: Date.now() - requestStart,
          };
        } catch (error) {
          return {
            instance,
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - requestStart,
          };
        }
      })
    );

    return results;
  }

  /**
   * Spawn multiple sub-agents and run them one after another.
   * Each result is passed as context into the next sub-agent's context under `previousResult`.
   */
  async runSequential(
    requests: SubAgentRequest[],
    timeoutMs: number = 120000
  ): Promise<ParallelSubAgentResult[]> {
    const results: ParallelSubAgentResult[] = [];
    let previousResult: string | undefined;

    const startTime = Date.now();

    for (const request of requests) {
      const requestStart = Date.now();
      const enrichedRequest: SubAgentRequest = {
        ...request,
        context: {
          ...request.context,
          previousResult,
        },
      };

      try {
        const childRun = await agentHarness.startRun({
          goal: enrichedRequest.goal,
          userId: enrichedRequest.userId,
          parentRunId: enrichedRequest.parentRunId,
          context: enrichedRequest.context,
        });

        const remaining = timeoutMs - (Date.now() - startTime);
        await this.waitForRun(childRun.id, remaining);

        const completedRun = agentHarness.getRun(childRun.id);
        const result = completedRun?.result;
        previousResult = result;

        results.push({
          instance: undefined as any, // child run has its own instances
          result,
          error: completedRun?.error,
          duration: Date.now() - requestStart,
        });
      } catch (error) {
        results.push({
          instance: undefined as any,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - requestStart,
        });
        break;
      }
    }

    return results;
  }

  private async waitForRun(runId: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const terminalStates = new Set(['completed', 'failed', 'cancelled']);

    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        const run = agentHarness.getRun(runId);
        if (run && terminalStates.has(run.state)) {
          clearInterval(check);
          resolve();
        }
        if (Date.now() > deadline) {
          clearInterval(check);
          reject(new Error(`Sub-agent run ${runId} timed out`));
        }
      }, 250);
    });
  }
}

export const subAgentRunner = new SubAgentRunner();
