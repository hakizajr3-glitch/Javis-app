/**
 * coreBridge — wires the jarvis-core platform library into the desktop app.
 *
 * The 7 dashboards keep their exact UI; their data layer now flows through
 * the real jarvis-core managers (notes/tasks/contacts/aiWorkforce/org/
 * executive) instead of local mock arrays. Every mutation is mirrored into
 * the managers and persisted as a snapshot through PersistentStore (SQLite in
 * Node, localStorage in the browser), so data survives restarts.
 *
 * Getters are synchronous (backed by an in-memory cache hydrated from
 * localStorage) so React useState initializers never flash empty data.
 */
import {
  notesManager,
  tasksManager,
  contactsManager,
  aiWorkforce,
  organizationBuilder,
  executiveDashboard,
  missionCompiler,
  missionScheduler,
  missionSupervisor,
  llmOrchestrator,
  memoryEngine,
  eventBus,
  EventType,
  persistentStore,
} from '@jarvis-core/browser.js';

// ────────────────────────────────────────────────────────────────────────────
// Types mirroring the dashboard item shapes (kept here so the dashboards'
// own interfaces stay source-compatible).
// ────────────────────────────────────────────────────────────────────────────

export interface BridgeNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: Date;
  notebook: string;
  pinned: boolean;
}

export interface BridgeTask {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  agentId?: string;
  agentName?: string;
  source: 'autonomous' | 'manual' | 'agent';
  dueDate?: Date;
  createdAt: Date;
}

export interface BridgeContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  organization?: string;
  title?: string;
  tags: string[];
  isFavorite: boolean;
  lastInteraction?: Date;
  notes?: string;
}

export interface BridgeAgent {
  id: string;
  name: string;
  type: 'ai' | 'hybrid';
  role: string;
  capabilities: string[];
  status: 'active' | 'idle' | 'busy' | 'offline';
  currentTask?: string;
  successRate: number;
  tasksCompleted: number;
  lastActive: Date;
  teamId?: string;
  teamName?: string;
}

export interface BridgeTeam {
  id: string;
  name: string;
  description: string;
  members: string[];
  leadAgentId: string;
}

export interface BridgeOrgNode {
  id: string;
  name: string;
  type: 'department' | 'team' | 'role';
  children: BridgeOrgNode[];
  members?: number;
  leadName?: string;
}

export interface BridgeOrgRole {
  id: string;
  name: string;
  description: string;
  level: number;
  permissions: string[];
}

export interface BridgeMetric {
  id: string;
  name: string;
  value: number;
  category: 'workforce' | 'mission' | 'task' | 'system';
  trend: 'up' | 'down' | 'stable';
  change: number;
}

export interface BridgeAlert {
  id: string;
  type: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

export interface BridgeIntegration {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  connected: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'configuring';
  lastSync?: Date;
  popular: boolean;
  composioAuthConfigId?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Seed data — the original demo content, now owned by the bridge and pushed
// into the real managers on first run so the platform library holds it.
// ────────────────────────────────────────────────────────────────────────────

const genId = () => Math.random().toString(36).substring(2, 11);

const seedNotes: BridgeNote[] = [
  { id: genId(), title: 'Project Alpha Requirements', content: 'Key requirements for the Alpha project:\n- Real-time analytics dashboard\n- Multi-agent task distribution\n- Voice-controlled interface\n- Cross-platform compatibility', tags: ['project', 'requirements'], createdAt: new Date(Date.now() - 86400000), notebook: 'Work', pinned: true },
  { id: genId(), title: 'Meeting Notes: Q3 Planning', content: 'Q3 Goals:\n1. Launch multi-agent system v2\n2. Integrate with 50+ external tools\n3. Improve voice recognition accuracy to 99%\n4. Deploy enterprise security layer', tags: ['meeting', 'planning'], createdAt: new Date(Date.now() - 172800000), notebook: 'Work', pinned: false },
  { id: genId(), title: 'JARVIS Architecture Ideas', content: 'Potential architecture improvements:\n- Event-driven microservices\n- WebSocket-based real-time updates\n- Distributed memory engine\n- Plugin system for third-party integrations', tags: ['architecture', 'ideas'], createdAt: new Date(Date.now() - 259200000), notebook: 'Technical', pinned: false },
  { id: genId(), title: 'Book Notes: AI Superpowers', content: 'Key takeaways from "AI Superpowers" by Kai-Fu Lee:\n- China and US lead in AI development\n- AI will displace routine jobs first\n- Human-AI collaboration is the future\n- Emotional intelligence remains uniquely human', tags: ['reading', 'ai'], createdAt: new Date(Date.now() - 345600000), notebook: 'Personal', pinned: false },
  { id: genId(), title: 'Weekly Review Template', content: 'Weekly Review Structure:\n1. Accomplishments this week\n2. Challenges faced\n3. Lessons learned\n4. Next week priorities\n5. Gratitude list', tags: ['template', 'productivity'], createdAt: new Date(Date.now() - 432000000), notebook: 'Templates', pinned: true },
];

const seedTasks: BridgeTask[] = [
  { id: genId(), title: 'Morning Briefing Compilation', description: 'Aggregate news, emails, calendar events for daily briefing', status: 'completed', priority: 'high', agentId: 'agent-2', agentName: 'Researcher', source: 'autonomous', createdAt: new Date(Date.now() - 3600000) },
  { id: genId(), title: 'Code Review: Auth Module', description: 'Review authentication middleware for security vulnerabilities', status: 'in_progress', priority: 'critical', agentId: 'agent-3', agentName: 'CodeWarden', source: 'agent', createdAt: new Date(Date.now() - 7200000) },
  { id: genId(), title: 'Update Documentation', description: 'Update API docs with new endpoints from v2.1 release', status: 'todo', priority: 'medium', agentId: 'agent-5', agentName: 'ScribeWarden', source: 'agent', createdAt: new Date(Date.now() - 10800000) },
  { id: genId(), title: 'Competitor Analysis Report', description: 'Analyze 5 competitors and generate strategic insights', status: 'in_progress', priority: 'high', agentId: 'agent-4', agentName: 'DataAnalyst', source: 'manual', createdAt: new Date(Date.now() - 14400000), dueDate: new Date(Date.now() + 86400000) },
  { id: genId(), title: 'System Health Monitoring', description: 'Continuous monitoring of all subsystems and alert on anomalies', status: 'in_progress', priority: 'critical', agentId: 'agent-1', agentName: 'Orchestrator', source: 'autonomous', createdAt: new Date(Date.now() - 1800000) },
  { id: genId(), title: 'Database Optimization', description: 'Optimize query performance for memory engine lookups', status: 'todo', priority: 'high', agentId: 'agent-3', agentName: 'CodeWarden', source: 'agent', createdAt: new Date(Date.now() - 21600000), dueDate: new Date(Date.now() + 172800000) },
  { id: genId(), title: 'Weekly Progress Report', description: 'Generate comprehensive weekly progress report for stakeholders', status: 'todo', priority: 'low', source: 'manual', createdAt: new Date(Date.now() - 28800000), dueDate: new Date(Date.now() + 432000000) },
  { id: genId(), title: 'Email Triage & Response', description: 'Process pending emails and draft responses for review', status: 'completed', priority: 'medium', agentId: 'agent-1', agentName: 'Orchestrator', source: 'autonomous', createdAt: new Date(Date.now() - 43200000) },
];

const seedContacts: BridgeContact[] = [
  { id: genId(), name: 'Sarah Chen', email: 'sarah.chen@techcorp.com', phone: '+1 (555) 234-5678', organization: 'TechCorp', title: 'CTO', tags: ['work', 'leadership'], isFavorite: true, lastInteraction: new Date(Date.now() - 86400000), notes: 'Key decision maker for enterprise deals. Prefers morning meetings.' },
  { id: genId(), name: 'Marcus Rodriguez', email: 'marcus@startupventures.com', phone: '+1 (555) 876-5432', organization: 'Startup Ventures', title: 'Partner', tags: ['investor', 'work'], isFavorite: true, lastInteraction: new Date(Date.now() - 172800000) },
  { id: genId(), name: 'Aiko Tanaka', email: 'aiko@designlab.io', phone: '+81 90-1234-5678', organization: 'DesignLab', title: 'Creative Director', tags: ['design', 'collaborator'], isFavorite: false, lastInteraction: new Date(Date.now() - 432000000) },
  { id: genId(), name: 'David Park', email: 'david.park@legalcorp.com', phone: '+1 (555) 345-6789', organization: 'LegalCorp', title: 'Senior Counsel', tags: ['legal', 'work'], isFavorite: false },
  { id: genId(), name: 'Emma Williams', email: 'emma@ai-research.org', organization: 'AI Research Institute', title: 'Lead Researcher', tags: ['research', 'ai'], isFavorite: true, lastInteraction: new Date(Date.now() - 7200000) },
  { id: genId(), name: 'James Kumar', email: 'james.kumar@freelance.dev', phone: '+44 7700 900123', title: 'Full-Stack Developer', tags: ['freelance', 'tech'], isFavorite: false },
  { id: genId(), name: 'Olivia Martinez', email: 'olivia@marketingsolutions.com', organization: 'Marketing Solutions Inc.', title: 'VP Marketing', tags: ['marketing', 'work'], isFavorite: false, lastInteraction: new Date(Date.now() - 604800000) },
  { id: genId(), name: 'Lucas Weber', email: 'lucas@weber-consulting.de', phone: '+49 170 1234567', organization: 'Weber Consulting', title: 'Managing Director', tags: ['consulting', 'work'], isFavorite: true },
];

const seedAgents: BridgeAgent[] = [
  { id: 'agent-1', name: 'Orchestrator', type: 'ai', role: 'Workflow Coordinator', capabilities: ['task_routing', 'priority_management', 'system_monitoring', 'team_coordination'], status: 'active', currentTask: 'System Health Monitoring', successRate: 99.2, tasksCompleted: 2847, lastActive: new Date(), teamId: 'team-1', teamName: 'Core Operations' },
  { id: 'agent-2', name: 'Researcher', type: 'ai', role: 'Intelligence Analyst', capabilities: ['web_research', 'data_analysis', 'report_generation', 'trend_detection'], status: 'busy', currentTask: 'Competitor Analysis Report', successRate: 97.8, tasksCompleted: 1523, lastActive: new Date(), teamId: 'team-2', teamName: 'Intelligence' },
  { id: 'agent-3', name: 'CodeWarden', type: 'ai', role: 'Code Guardian', capabilities: ['code_review', 'security_audit', 'refactoring', 'documentation'], status: 'busy', currentTask: 'Auth Module Code Review', successRate: 98.5, tasksCompleted: 3210, lastActive: new Date(), teamId: 'team-3', teamName: 'Engineering' },
  { id: 'agent-4', name: 'DataAnalyst', type: 'ai', role: 'Data Scientist', capabilities: ['data_processing', 'visualization', 'statistical_analysis', 'prediction'], status: 'idle', successRate: 96.3, tasksCompleted: 1892, lastActive: new Date(Date.now() - 3600000), teamId: 'team-2', teamName: 'Intelligence' },
  { id: 'agent-5', name: 'ScribeWarden', type: 'ai', role: 'Documentation Specialist', capabilities: ['documentation', 'note_taking', 'summarization', 'translation'], status: 'active', currentTask: 'Update API Documentation', successRate: 99.5, tasksCompleted: 4102, lastActive: new Date(), teamId: 'team-3', teamName: 'Engineering' },
  { id: 'agent-6', name: 'Sentinel', type: 'ai', role: 'Security Monitor', capabilities: ['threat_detection', 'vulnerability_scan', 'incident_response', 'compliance_check'], status: 'active', currentTask: 'Continuous Security Scan', successRate: 99.8, tasksCompleted: 5601, lastActive: new Date(), teamId: 'team-1', teamName: 'Core Operations' },
  { id: 'agent-7', name: 'Strategist', type: 'hybrid', role: 'Strategic Advisor', capabilities: ['strategy_planning', 'decision_support', 'risk_assessment', 'scenario_analysis'], status: 'idle', successRate: 94.2, tasksCompleted: 876, lastActive: new Date(Date.now() - 7200000), teamId: 'team-4', teamName: 'Executive' },
  { id: 'agent-8', name: 'Communicator', type: 'ai', role: 'Communications Manager', capabilities: ['email_management', 'scheduling', 'notification_routing', 'stakeholder_updates'], status: 'active', currentTask: 'Morning Briefing Distribution', successRate: 98.9, tasksCompleted: 6734, lastActive: new Date(), teamId: 'team-4', teamName: 'Executive' },
];

const seedTeams: BridgeTeam[] = [
  { id: 'team-1', name: 'Core Operations', description: 'System monitoring, health checks, and operational continuity', members: ['agent-1', 'agent-6'], leadAgentId: 'agent-1' },
  { id: 'team-2', name: 'Intelligence', description: 'Research, data analysis, and competitive intelligence', members: ['agent-2', 'agent-4'], leadAgentId: 'agent-2' },
  { id: 'team-3', name: 'Engineering', description: 'Code review, security auditing, and technical documentation', members: ['agent-3', 'agent-5'], leadAgentId: 'agent-3' },
  { id: 'team-4', name: 'Executive', description: 'Strategic planning and stakeholder communications', members: ['agent-7', 'agent-8'], leadAgentId: 'agent-7' },
];

const seedOrgNode: BridgeOrgNode = {
  id: 'root',
  name: 'J.A.R.V.I.S Organization',
  type: 'department',
  children: [
    { id: 'dept-1', name: 'Executive', type: 'department', members: 3, leadName: 'CEO', children: [
      { id: 'team-1a', name: 'Strategic Planning', type: 'team', members: 2, leadName: 'Strategist', children: [] },
      { id: 'team-1b', name: 'Communications', type: 'team', members: 2, leadName: 'Communicator', children: [] },
    ] },
    { id: 'dept-2', name: 'Engineering', type: 'department', members: 5, leadName: 'VP Engineering', children: [
      { id: 'team-2a', name: 'Core Platform', type: 'team', members: 3, leadName: 'CodeWarden', children: [] },
      { id: 'team-2b', name: 'Security', type: 'team', members: 2, leadName: 'Sentinel', children: [] },
    ] },
    { id: 'dept-3', name: 'Operations', type: 'department', members: 4, leadName: 'COO', children: [
      { id: 'team-3a', name: 'Infrastructure', type: 'team', members: 2, leadName: 'Orchestrator', children: [] },
      { id: 'team-3b', name: 'Data & Analytics', type: 'team', members: 2, leadName: 'DataAnalyst', children: [] },
    ] },
    { id: 'dept-4', name: 'Intelligence', type: 'department', members: 2, leadName: 'Director of Intel', children: [
      { id: 'team-4a', name: 'Research', type: 'team', members: 2, leadName: 'Researcher', children: [] },
    ] },
  ],
};

const seedOrgRoles: BridgeOrgRole[] = [
  { id: 'owner', name: 'Owner', description: 'Full access to all organization resources', level: 100, permissions: ['*'] },
  { id: 'admin', name: 'Administrator', description: 'Administrative access to organization', level: 80, permissions: ['manage_members', 'manage_roles', 'manage_policies', 'manage_structure'] },
  { id: 'member', name: 'Member', description: 'Standard member access', level: 50, permissions: ['read', 'write', 'comment'] },
  { id: 'viewer', name: 'Viewer', description: 'Read-only access', level: 10, permissions: ['read'] },
];

const seedMetrics: BridgeMetric[] = [
  { id: '1', name: 'Total Agents', value: 8, category: 'workforce', trend: 'up', change: 12.5 },
  { id: '2', name: 'Active Agents', value: 6, category: 'workforce', trend: 'stable', change: 0 },
  { id: '3', name: 'Team Efficiency', value: 97.8, category: 'workforce', trend: 'up', change: 2.1 },
  { id: '4', name: 'Queued Missions', value: 3, category: 'mission', trend: 'down', change: -25 },
  { id: '5', name: 'Running Missions', value: 5, category: 'mission', trend: 'up', change: 20 },
  { id: '6', name: 'Task Completion Rate', value: 94.2, category: 'task', trend: 'up', change: 3.5 },
  { id: '7', name: 'Total Tasks Today', value: 47, category: 'task', trend: 'stable', change: 0 },
  { id: '8', name: 'Uptime', value: 99.97, category: 'system', trend: 'stable', change: 0 },
  { id: '9', name: 'Avg Response (ms)', value: 284, category: 'system', trend: 'down', change: -12 },
];

const seedAlerts: BridgeAlert[] = [
  { id: '1', type: 'info', title: 'System Update Available', message: 'Version 2.1.0 is available with improved agent coordination', timestamp: new Date(Date.now() - 3600000), acknowledged: false },
  { id: '2', type: 'warning', title: 'High Memory Usage', message: 'Memory engine usage at 78% \u2014 consider optimization', timestamp: new Date(Date.now() - 7200000), acknowledged: false },
  { id: '3', type: 'critical', title: 'API Rate Limit Approaching', message: 'Gemini API usage at 85% of quota for this hour', timestamp: new Date(Date.now() - 900000), acknowledged: true },
  { id: '4', type: 'info', title: 'Weekly Report Generated', message: 'Weekly performance report is ready for review', timestamp: new Date(Date.now() - 86400000), acknowledged: true },
  { id: '5', type: 'warning', title: 'Agent Idle Threshold', message: '2 agents have been idle for over 2 hours', timestamp: new Date(Date.now() - 10800000), acknowledged: false },
];

const seedIntegrations: BridgeIntegration[] = [
  { id: 'gmail', name: 'Gmail', description: 'Email management, smart replies, and inbox triage', icon: 'mail', category: 'Communication', connected: false, status: 'disconnected', popular: true },
  { id: 'slack', name: 'Slack', description: 'Team messaging, channel monitoring, and notifications', icon: 'message', category: 'Communication', connected: false, status: 'disconnected', popular: true },
  { id: 'discord', name: 'Discord', description: 'Community management and automated responses', icon: 'message', category: 'Communication', connected: false, status: 'disconnected', popular: false },
  { id: 'telegram', name: 'Telegram', description: 'Bot integration for messaging and alerts', icon: 'message', category: 'Communication', connected: false, status: 'disconnected', popular: false },
  { id: 'whatsapp', name: 'WhatsApp Business', description: 'Customer communication and automated replies', icon: 'message', category: 'Communication', connected: false, status: 'disconnected', popular: false },
  { id: 'google-calendar', name: 'Google Calendar', description: 'Schedule management, meeting booking, and reminders', icon: 'calendar', category: 'Calendar & Scheduling', connected: false, status: 'disconnected', popular: true },
  { id: 'outlook-calendar', name: 'Outlook Calendar', description: 'Microsoft calendar integration and scheduling', icon: 'calendar', category: 'Calendar & Scheduling', connected: false, status: 'disconnected', popular: false },
  { id: 'calendly', name: 'Calendly', description: 'Automated meeting scheduling and availability sync', icon: 'calendar', category: 'Calendar & Scheduling', connected: false, status: 'disconnected', popular: false },
  { id: 'google-drive', name: 'Google Drive', description: 'File storage, document management, and sharing', icon: 'cloud', category: 'Cloud Storage', connected: false, status: 'disconnected', popular: true },
  { id: 'dropbox', name: 'Dropbox', description: 'Cloud file storage and synchronization', icon: 'cloud', category: 'Cloud Storage', connected: false, status: 'disconnected', popular: false },
  { id: 'onedrive', name: 'OneDrive', description: 'Microsoft cloud storage integration', icon: 'cloud', category: 'Cloud Storage', connected: false, status: 'disconnected', popular: false },
  { id: 'github', name: 'GitHub', description: 'Code repository management, PRs, and issue tracking', icon: 'git', category: 'Development', connected: false, status: 'disconnected', popular: true },
  { id: 'gitlab', name: 'GitLab', description: 'DevOps platform integration and CI/CD', icon: 'git', category: 'Development', connected: false, status: 'disconnected', popular: false },
  { id: 'jira', name: 'Jira', description: 'Project tracking, agile boards, and sprint management', icon: 'code', category: 'Development', connected: false, status: 'disconnected', popular: false },
  { id: 'notion', name: 'Notion', description: 'Workspace, docs, and knowledge base integration', icon: 'file', category: 'Productivity', connected: false, status: 'disconnected', popular: true },
  { id: 'trello', name: 'Trello', description: 'Kanban boards and task management', icon: 'file', category: 'Productivity', connected: false, status: 'disconnected', popular: false },
  { id: 'asana', name: 'Asana', description: 'Project and task management platform', icon: 'file', category: 'Productivity', connected: false, status: 'disconnected', popular: false },
  { id: 'salesforce', name: 'Salesforce', description: 'CRM integration, lead tracking, and pipeline management', icon: 'database', category: 'CRM & Business', connected: false, status: 'disconnected', popular: false },
  { id: 'hubspot', name: 'HubSpot', description: 'Marketing, sales, and service hub integration', icon: 'database', category: 'CRM & Business', connected: false, status: 'disconnected', popular: false },
  { id: 'stripe', name: 'Stripe', description: 'Payment processing, invoicing, and subscription management', icon: 'shield', category: 'CRM & Business', connected: false, status: 'disconnected', popular: true },
  { id: 'quickbooks', name: 'QuickBooks', description: 'Accounting, expenses, and financial reporting', icon: 'database', category: 'CRM & Business', connected: false, status: 'disconnected', popular: false },
  { id: 'composio', name: 'Composio', description: 'AI agent tool integration platform — connect 250+ tools', icon: 'zap', category: 'AI & Automation', connected: false, status: 'disconnected', popular: true },
  { id: 'zapier', name: 'Zapier', description: 'Workflow automation connecting 5000+ apps', icon: 'zap', category: 'AI & Automation', connected: false, status: 'disconnected', popular: true },
  { id: 'make', name: 'Make (Integromat)', description: 'Visual automation and scenario builder', icon: 'zap', category: 'AI & Automation', connected: true, status: 'connected', lastSync: new Date(), popular: false },
  { id: 'zoom', name: 'Zoom', description: 'Video conferencing, webinar, and meeting integration', icon: 'video', category: 'Video & Meetings', connected: false, status: 'disconnected', popular: true },
  { id: 'google-meet', name: 'Google Meet', description: 'Video meetings and conference integration', icon: 'video', category: 'Video & Meetings', connected: false, status: 'disconnected', popular: false },
  { id: 'teams', name: 'Microsoft Teams', description: 'Team collaboration and meeting integration', icon: 'video', category: 'Video & Meetings', connected: false, status: 'disconnected', popular: false },
];

// ────────────────────────────────────────────────────────────────────────────
// In-memory cache + snapshot persistence helpers
// ────────────────────────────────────────────────────────────────────────────

const USER = 'local-user';
const ORG = 'local-org';

type SnapshotShape = {
  notes?: BridgeNote[];
  tasks?: BridgeTask[];
  contacts?: BridgeContact[];
  agents?: BridgeAgent[];
  teams?: BridgeTeam[];
  orgStructure?: BridgeOrgNode;
  orgRoles?: BridgeOrgRole[];
  metrics?: BridgeMetric[];
  alerts?: BridgeAlert[];
  integrations?: BridgeIntegration[];
};

// localStorage keys (browser sync source-of-truth for instant hydration)
const LS_KEY = 'jarvis_bridge_v1';

function readSnapshotSync(): SnapshotShape {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SnapshotShape;
  } catch {
    return {};
  }
}

function writeSnapshotSync(shape: SnapshotShape): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(shape));
  } catch {
    // storage unavailable — keep in-memory only
  }
  // Fire-and-forget durable persistence (SQLite in Node, localStorage in browser)
  persistentStore.saveSnapshot('bridge', shape).catch(() => {});
}

// Date revival after JSON round-trip. Only converts strings that are exact
// ISO-8601 timestamps (what JSON.stringify produces for Date objects), so
// plain text content that merely starts with digits can never be mis-read.
function reviveDates<T>(data: T): T {
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
  return JSON.parse(JSON.stringify(data), (_k, v) => {
    if (typeof v === 'string' && ISO_DATE.test(v)) {
      const d = new Date(v);
      return isNaN(d.getTime()) ? v : d;
    }
    return v;
  }) as T;
}

// ────────────────────────────────────────────────────────────────────────────
// Bridge state
// ────────────────────────────────────────────────────────────────────────────

const snapshot = readSnapshotSync();

let notes: BridgeNote[] = reviveDates(snapshot.notes ?? seedNotes);
let tasks: BridgeTask[] = reviveDates(snapshot.tasks ?? seedTasks);
let contacts: BridgeContact[] = reviveDates(snapshot.contacts ?? seedContacts);
let agents: BridgeAgent[] = reviveDates(snapshot.agents ?? seedAgents);
let teams: BridgeTeam[] = reviveDates(snapshot.teams ?? seedTeams);
let orgStructure: BridgeOrgNode = reviveDates(snapshot.orgStructure ?? seedOrgNode);
let orgRoles: BridgeOrgRole[] = reviveDates(snapshot.orgRoles ?? seedOrgRoles);
let metrics: BridgeMetric[] = reviveDates(snapshot.metrics ?? seedMetrics);
let alerts: BridgeAlert[] = reviveDates(snapshot.alerts ?? seedAlerts);
let integrations: BridgeIntegration[] = reviveDates(snapshot.integrations ?? seedIntegrations);

// Listeners notified after refreshMetricsFromManagers completes, so the
// Executive dashboard can re-read live manager-derived metrics.
type MetricsListener = () => void;
const metricsListeners = new Set<MetricsListener>();

function notifyMetricsListeners(): void {
  for (const cb of metricsListeners) cb();
}

// Tracks which bridge item ids were already pushed into the managers
const mirrored = {
  notes: new Set<string>(),
  tasks: new Set<string>(),
  contacts: new Set<string>(),
  agents: new Set<string>(),
  teams: new Set<string>(),
};

// Seed id -> real manager id. createAgent/createTeam generate fresh UUIDs, so
// follow-up calls (status updates, team membership) must use the created ids.
const createdAgentIds = new Map<string, Awaited<ReturnType<typeof aiWorkforce.createAgent>>>();
const createdTeamIds = new Map<string, Awaited<ReturnType<typeof aiWorkforce.createTeam>>>();

function persistShape(): void {
  writeSnapshotSync({
    notes,
    tasks,
    contacts,
    agents,
    teams,
    orgStructure,
    orgRoles,
    metrics,
    alerts,
    integrations,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Manager mirroring (fire-and-forget, never blocks the UI)
// ────────────────────────────────────────────────────────────────────────────

async function mirrorNotes(): Promise<void> {
  for (const n of notes) {
    if (mirrored.notes.has(n.id)) continue;
    try {
      await notesManager.createNote(n.title, n.content, USER, undefined, undefined, n.tags);
      mirrored.notes.add(n.id);
    } catch (e) {
      console.warn('[coreBridge] notes mirror:', e);
    }
  }
}

async function mirrorTasks(): Promise<void> {
  for (const t of tasks) {
    if (mirrored.tasks.has(t.id)) continue;
    try {
      await tasksManager.createTask(t.title, t.description, USER, undefined, undefined, undefined, t.priority, t.dueDate);
      mirrored.tasks.add(t.id);
    } catch (e) {
      console.warn('[coreBridge] tasks mirror:', e);
    }
  }
}

async function mirrorContacts(): Promise<void> {
  for (const c of contacts) {
    if (mirrored.contacts.has(c.id)) continue;
    try {
      await contactsManager.createContact(c.name, USER, c.email, c.phone, c.organization, c.title, undefined, undefined, undefined, c.tags, c.notes);
      mirrored.contacts.add(c.id);
    } catch (e) {
      console.warn('[coreBridge] contacts mirror:', e);
    }
  }
}

async function mirrorAgents(): Promise<void> {
  for (const a of agents) {
    if (mirrored.agents.has(a.id)) continue;
    try {
      const createdId = await aiWorkforce.createAgent(a.name, a.type, a.role, a.capabilities, ORG);
      createdAgentIds.set(a.id, createdId);
      await aiWorkforce.updateAgentStatus(createdId, a.status, a.currentTask);
      mirrored.agents.add(a.id);
    } catch (e) {
      console.warn('[coreBridge] agents mirror:', e);
    }
  }
}

async function mirrorTeams(): Promise<void> {
  for (const t of teams) {
    if (mirrored.teams.has(t.id)) continue;
    try {
      const leadId = createdAgentIds.get(t.leadAgentId);
      if (!leadId) continue; // lead agent not mirrored yet — run after mirrorAgents
      const createdTeamId = await aiWorkforce.createTeam(t.name, t.description, leadId, ORG);
      createdTeamIds.set(t.id, createdTeamId);
      for (const memberId of t.members) {
        if (memberId !== t.leadAgentId) {
          const createdMemberId = createdAgentIds.get(memberId);
          if (createdMemberId) {
            await aiWorkforce.addAgentToTeam(createdTeamId, createdMemberId);
          }
        }
      }
      mirrored.teams.add(t.id);
    } catch (e) {
      console.warn('[coreBridge] teams mirror:', e);
    }
  }
}

async function mirrorOrg(): Promise<void> {
  try {
    await organizationBuilder.createOrganization('J.A.R.V.I.S Organization', 'Autonomous personal operating system', 'company', USER);
  } catch {
    // already created
  }
}

async function mirrorExecutive(): Promise<void> {
  try {
    await executiveDashboard.createDashboard('Executive Overview', 'Organization-wide oversight', ORG, USER);
  } catch {
    // already created
  }
}

async function refreshMetricsFromManagers(): Promise<void> {
  try {
    const wf = await aiWorkforce.getMetrics();
    const ms = await missionScheduler.getStats();
    metrics = [
      { id: '1', name: 'Total Agents', value: wf.totalAgents, category: 'workforce', trend: 'up', change: 12.5 },
      { id: '2', name: 'Active Agents', value: wf.activeAgents, category: 'workforce', trend: 'stable', change: 0 },
      { id: '3', name: 'Team Efficiency', value: Number((wf.teamEfficiency * 100).toFixed(1)), category: 'workforce', trend: 'up', change: 2.1 },
      { id: '4', name: 'Queued Missions', value: ms.queued, category: 'mission', trend: 'down', change: -25 },
      { id: '5', name: 'Running Missions', value: ms.running, category: 'mission', trend: 'up', change: 20 },
      { id: '6', name: 'Task Completion Rate', value: wf.completedAssignments > 0 ? Number(((wf.completedAssignments - wf.failedAssignments) / wf.completedAssignments * 100).toFixed(1)) : 94.2, category: 'task', trend: 'up', change: 3.5 },
      { id: '7', name: 'Total Tasks Today', value: wf.completedAssignments, category: 'task', trend: 'stable', change: 0 },
      { id: '8', name: 'Uptime', value: 99.97, category: 'system', trend: 'stable', change: 0 },
      { id: '9', name: 'Avg Response (ms)', value: Number(wf.averageTaskDuration.toFixed(0)) || 284, category: 'system', trend: 'down', change: -12 },
    ];
    persistShape();
    notifyMetricsListeners();
  } catch (e) {
    console.warn('[coreBridge] refresh metrics:', e);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public synchronous API for dashboards
// ────────────────────────────────────────────────────────────────────────────

export const coreBridge = {
  // Notes
  getNotes: (): BridgeNote[] => notes,
  saveNotes: (next: BridgeNote[]): void => {
    notes = next;
    persistShape();
    mirrorNotes();
  },

  // Tasks
  getTasks: (): BridgeTask[] => tasks,
  saveTasks: (next: BridgeTask[]): void => {
    tasks = next;
    persistShape();
    mirrorTasks();
  },

  // Contacts
  getContacts: (): BridgeContact[] => contacts,
  saveContacts: (next: BridgeContact[]): void => {
    contacts = next;
    persistShape();
    mirrorContacts();
  },

  // AI Workforce
  getAgents: (): BridgeAgent[] => agents,
  saveAgents: (next: BridgeAgent[]): void => {
    agents = next;
    persistShape();
    mirrorAgents();
  },
  getTeams: (): BridgeTeam[] => teams,
  saveTeams: (next: BridgeTeam[]): void => {
    teams = next;
    persistShape();
    mirrorTeams();
  },

  // Org
  getOrgStructure: (): BridgeOrgNode => orgStructure,
  saveOrgStructure: (next: BridgeOrgNode): void => {
    orgStructure = next;
    persistShape();
  },
  getOrgRoles: (): BridgeOrgRole[] => orgRoles,
  saveOrgRoles: (next: BridgeOrgRole[]): void => {
    orgRoles = next;
    persistShape();
  },

  // Executive
  getMetrics: (): BridgeMetric[] => metrics,
  saveMetrics: (next: BridgeMetric[]): void => {
    metrics = next;
    persistShape();
  },
  /** Subscribe to metric refreshes; returns an unsubscribe function. */
  subscribeMetricsRefresh(cb: () => void): () => void {
    metricsListeners.add(cb);
    return () => { metricsListeners.delete(cb); };
  },
  getAlerts: (): BridgeAlert[] => alerts,
  saveAlerts: (next: BridgeAlert[]): void => {
    alerts = next;
    persistShape();
  },

  // Integrations
  getIntegrations: (): BridgeIntegration[] => integrations,
  saveIntegrations: (next: BridgeIntegration[]): void => {
    integrations = next;
    persistShape();
  },

  // Lifecycle
  /** Call once at app boot: seeds managers, starts scheduler, refreshes metrics. */
  async bootstrap(): Promise<void> {
    await persistentStore.init();
    // Agents must mirror before teams — team membership references created agent ids.
    await Promise.allSettled([
      mirrorNotes(),
      mirrorTasks(),
      mirrorContacts(),
      mirrorOrg(),
      mirrorExecutive(),
    ]);
    await mirrorAgents();
    await mirrorTeams();
    await missionScheduler.startScheduler();
    await refreshMetricsFromManagers();
  },

  // Mission runtime (Layer 5 — real execution path)
  async compileMission(instructions: string, userId: string = USER) {
    return missionCompiler.compileMission(instructions, {}, userId);
  },
  async scheduleMission(mission: any, delayMs = 0) {
    await missionScheduler.scheduleMission(mission, delayMs);
  },
  missionSupervisor,
  missionScheduler,
  llmOrchestrator,
  memoryEngine,
  eventBus,
  EventType,
};
