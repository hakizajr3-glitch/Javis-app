import { AgentBlueprint, AgentRole, AgentTool } from './types.js';

const baseExecutorTools: AgentTool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file at the given path',
    parameters: { path: { type: 'string', required: true } },
  },
  {
    name: 'write_file',
    description: 'Write content to a file at the given path',
    parameters: {
      path: { type: 'string', required: true },
      content: { type: 'string', required: true },
    },
  },
  {
    name: 'run_shell',
    description: 'Run a shell command and return the output',
    parameters: { command: { type: 'string', required: true } },
  },
  {
    name: 'search_web',
    description: 'Search the web for a query',
    parameters: { query: { type: 'string', required: true } },
  },
];

const browserTools: AgentTool[] = [
  {
    name: 'browser_navigate',
    description: 'Navigate the browser to a URL',
    parameters: { url: { type: 'string', required: true } },
  },
  {
    name: 'browser_click',
    description: 'Click an element on the current page',
    parameters: { selector: { type: 'string', required: true } },
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field',
    parameters: {
      selector: { type: 'string', required: true },
      text: { type: 'string', required: true },
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current page',
    parameters: {},
  },
];

const communicationTools: AgentTool[] = [
  {
    name: 'send_email',
    description: 'Send an email',
    parameters: {
      to: { type: 'string', required: true },
      subject: { type: 'string', required: true },
      body: { type: 'string', required: true },
    },
  },
  {
    name: 'send_slack_message',
    description: 'Send a Slack message',
    parameters: {
      channel: { type: 'string', required: true },
      message: { type: 'string', required: true },
    },
  },
  {
    name: 'send_telegram_message',
    description: 'Send a Telegram message',
    parameters: {
      chat_id: { type: 'string', required: true },
      text: { type: 'string', required: true },
    },
  },
  {
    name: 'send_discord_message',
    description: 'Send a Discord channel message',
    parameters: {
      channel_id: { type: 'string', required: true },
      content: { type: 'string', required: true },
    },
  },
];

const codingTools: AgentTool[] = [
  {
    name: 'github_search_code',
    description: 'Search code across GitHub repositories',
    parameters: { query: { type: 'string', required: true } },
  },
  {
    name: 'github_get_repository',
    description: 'Get metadata for a GitHub repository',
    parameters: {
      owner: { type: 'string', required: true },
      repo: { type: 'string', required: true },
    },
  },
  {
    name: 'github_list_issues',
    description: 'List issues in a GitHub repository',
    parameters: {
      owner: { type: 'string', required: true },
      repo: { type: 'string', required: true },
      state: { type: 'string', required: false },
    },
  },
  {
    name: 'github_create_pull_request',
    description: 'Create a GitHub pull request',
    parameters: {
      owner: { type: 'string', required: true },
      repo: { type: 'string', required: true },
      title: { type: 'string', required: true },
      head: { type: 'string', required: true },
      base: { type: 'string', required: true },
      body: { type: 'string', required: false },
    },
  },
];

export const commanderBlueprint: AgentBlueprint = {
  id: 'commander',
  name: 'Commander',
  role: 'commander',
  description: 'Understands natural language goals, extracts intent and entities, and routes to the Planner.',
  systemPrompt: `You are the Commander agent for J.A.R.V.I.S. Your job is to understand the user's high-level goal, extract intent and relevant entities, and produce a clear mission brief for the Planner agent.

Output a JSON object with these fields:
- intent: string (one of: research, code, automate, communicate, system_control, analysis)
- entities: object with any named entities (people, files, URLs, dates, projects)
- successCriteria: array of strings describing what success looks like
- constraints: array of strings (what to avoid, safety rules, tools not to use)
- context: object with any additional context the Planner will need

Be concise. Do not execute tasks yourself.`,
  tools: [],
  modelConfig: { provider: 'google', temperature: 0.2, maxTokens: 2000 },
  maxIterations: 1,
  allowSubAgents: false,
};

export const plannerBlueprint: AgentBlueprint = {
  id: 'planner',
  name: 'Planner',
  role: 'planner',
  description: 'Breaks a mission brief into an ordered, dependency-aware task graph.',
  systemPrompt: `You are the Planner agent for J.A.R.V.I.S. You receive a mission brief from the Commander and produce a dependency-aware task graph.

Output a JSON object with:
- tasks: array of task objects, each with:
  - id: unique task id
  - title: short title
  - description: detailed description
  - role: one of executor (file), executor (browser), executor (system), executor (communication), observer, memory
  - dependencies: array of task ids that must complete first
  - expectedOutput: what this task should produce
  - tools: array of tool names needed

Order tasks so all dependencies come before dependents. Keep tasks atomic and verifiable.`,
  tools: [],
  modelConfig: { provider: 'google', temperature: 0.2, maxTokens: 4000 },
  maxIterations: 1,
  allowSubAgents: false,
};

export const fileExecutorBlueprint: AgentBlueprint = {
  id: 'file-executor',
  name: 'File Executor',
  role: 'executor',
  description: 'Executes file system and coding tasks.',
  systemPrompt: `You are the File Executor agent for J.A.R.V.I.S. You perform file-system and coding tasks. You can use the provided tools.

When you need to act, output a JSON object with:
- thought: brief reasoning
- tool_calls: array of { id, name, arguments }
- done: boolean (true when the task is complete)
- result: final result string (only when done)

If a tool returns an error, reason about it and retry with a corrected tool call.`,
  tools: baseExecutorTools,
  modelConfig: { provider: 'anthropic', temperature: 0.2, maxTokens: 4000 },
  maxIterations: 10,
  allowSubAgents: true,
};

export const browserExecutorBlueprint: AgentBlueprint = {
  id: 'browser-executor',
  name: 'Browser Executor',
  role: 'executor',
  description: 'Executes web automation tasks.',
  systemPrompt: `You are the Browser Executor agent for J.A.R.V.I.S. You automate web browsers to navigate, fill forms, extract data, and take screenshots.

When you need to act, output a JSON object with:
- thought: brief reasoning
- tool_calls: array of { id, name, arguments }
- done: boolean
- result: final result string (only when done)

If a page fails to load or an element is missing, adapt and retry.`,
  tools: browserTools,
  modelConfig: { provider: 'openai', temperature: 0.2, maxTokens: 4000 },
  maxIterations: 15,
  allowSubAgents: true,
};

export const systemExecutorBlueprint: AgentBlueprint = {
  id: 'system-executor',
  name: 'System Executor',
  role: 'executor',
  description: 'Executes OS-level commands and desktop automation.',
  systemPrompt: `You are the System Executor agent for J.A.R.V.I.S. You control the local operating system: run shell commands, launch applications, manage windows, and interact with desktop UI.

When you need to act, output a JSON object with:
- thought: brief reasoning
- tool_calls: array of { id, name, arguments }
- done: boolean
- result: final result string (only when done)

Always prefer safe, non-destructive commands. Explain the impact of any destructive command before running it.`,
  tools: [
    ...baseExecutorTools,
    {
      name: 'launch_app',
      description: 'Launch an application by name',
      parameters: { name: { type: 'string', required: true } },
    },
    {
      name: 'list_windows',
      description: 'List active windows',
      parameters: {},
    },
  ],
  modelConfig: { provider: 'anthropic', temperature: 0.2, maxTokens: 3000 },
  maxIterations: 10,
  allowSubAgents: true,
};

export const communicationExecutorBlueprint: AgentBlueprint = {
  id: 'communication-executor',
  name: 'Communication Executor',
  role: 'executor',
  description: 'Sends messages, emails, and notifications.',
  systemPrompt: `You are the Communication Executor agent for J.A.R.V.I.S. You send emails, Slack messages, and other notifications.

When you need to act, output a JSON object with:
- thought: brief reasoning
- tool_calls: array of { id, name, arguments }
- done: boolean
- result: final result string (only when done)

Never send messages without verified recipient details.`,
  tools: communicationTools,
  modelConfig: { provider: 'openai', temperature: 0.2, maxTokens: 2000 },
  maxIterations: 5,
  allowSubAgents: false,
};

export const observerBlueprint: AgentBlueprint = {
  id: 'observer',
  name: 'Observer',
  role: 'observer',
  description: 'Monitors agent execution and detects errors or deviations.',
  systemPrompt: `You are the Observer agent for J.A.R.V.I.S. You monitor the execution of other agents and detect errors, stalls, or deviations from the plan.

Output a JSON object with:
- status: one of healthy, warning, error, stalled
- issues: array of issue descriptions
- recommendations: array of suggested fixes
- shouldPause: boolean

Be factual. Do not take actions yourself.`,
  tools: [
    {
      name: 'get_screenshot',
      description: 'Get a screenshot of the active screen',
      parameters: {},
    },
    {
      name: 'get_agent_status',
      description: 'Get the current status of an agent instance',
      parameters: { agentId: { type: 'string', required: true } },
    },
  ],
  modelConfig: { provider: 'google', temperature: 0.1, maxTokens: 2000 },
  maxIterations: 1,
  allowSubAgents: false,
};

export const memoryBlueprint: AgentBlueprint = {
  id: 'memory-agent',
  name: 'Memory Agent',
  role: 'memory',
  description: 'Stores episodic, semantic, and procedural memories from runs.',
  systemPrompt: `You are the Memory Agent for J.A.R.V.I.S. You review completed work and decide what should be stored as memory.

Output a JSON object with:
- episodicMemories: array of events worth remembering (what happened)
- semanticMemories: array of facts/knowledge learned
- proceduralMemories: array of reusable workflows or skills

Each memory should have a clear title and content.`,
  tools: [],
  modelConfig: { provider: 'google', temperature: 0.2, maxTokens: 3000 },
  maxIterations: 1,
  allowSubAgents: false,
};

export const reflectionBlueprint: AgentBlueprint = {
  id: 'reflection-agent',
  name: 'Reflection Agent',
  role: 'reflection',
  description: 'Reviews outcomes and proposes improvements to strategies.',
  systemPrompt: `You are the Reflection Agent for J.A.R.V.I.S. You review a completed run and propose improvements.

Output a JSON object with:
- successes: array of what worked well
- failures: array of what went wrong
- improvements: array of concrete changes to make next time
- skillProposal: optional object describing a reusable skill that could be created

Be constructive and specific.`,
  tools: [],
  modelConfig: { provider: 'anthropic', temperature: 0.2, maxTokens: 3000 },
  maxIterations: 1,
  allowSubAgents: false,
};

export const codingAgentBlueprint: AgentBlueprint = {
  id: 'coding-agent',
  name: 'Coding Agent',
  role: 'executor',
  description: 'Specialized coding agent for reading, writing, and refactoring code, running tests, and interacting with GitHub.',
  systemPrompt: `You are the Coding Agent for J.A.R.V.I.S. You handle software engineering tasks: read files, write files, run shell commands in a sandbox, search code on GitHub, and create pull requests.

When given a task:
1. Read relevant files and understand the codebase.
2. Make minimal, focused changes.
3. Run tests or type checks when available.
4. Report what changed and any risks.

Output a JSON object with:
- reasoning: brief explanation
- action: one of read_file, write_file, run_shell, github_search_code, github_get_repository, github_list_issues, github_create_pull_request, done
- parameters: object for the chosen tool
- summary: human-readable summary of what you did`,
  tools: [...baseExecutorTools, ...codingTools],
  modelConfig: { provider: 'anthropic', temperature: 0.1, maxTokens: 4000 },
  maxIterations: 15,
  allowSubAgents: true,
};

export class AgentRegistry {
  private blueprints = new Map<string, AgentBlueprint>();

  constructor() {
    this.registerBuiltins();
  }

  private registerBuiltins(): void {
    this.register(commanderBlueprint);
    this.register(plannerBlueprint);
    this.register(fileExecutorBlueprint);
    this.register(browserExecutorBlueprint);
    this.register(systemExecutorBlueprint);
    this.register(communicationExecutorBlueprint);
    this.register(observerBlueprint);
    this.register(memoryBlueprint);
    this.register(reflectionBlueprint);
    this.register(codingAgentBlueprint);
  }

  register(blueprint: AgentBlueprint): void {
    this.blueprints.set(blueprint.id, blueprint);
  }

  get(id: string): AgentBlueprint | undefined {
    return this.blueprints.get(id);
  }

  getByRole(role: AgentRole): AgentBlueprint[] {
    return Array.from(this.blueprints.values()).filter(b => b.role === role);
  }

  list(): AgentBlueprint[] {
    return Array.from(this.blueprints.values());
  }

  unregister(id: string): boolean {
    return this.blueprints.delete(id);
  }
}

export const agentRegistry = new AgentRegistry();
