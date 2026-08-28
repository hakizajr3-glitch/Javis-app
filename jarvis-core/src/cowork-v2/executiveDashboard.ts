import { v4 as uuidv4 } from 'uuid';
import {
  DashboardId,
  Dashboard,
  DashboardWidget,
  DashboardMetric,
  DashboardAlert,
  DashboardReport,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';
import { aiWorkforce } from './aiWorkforce.js';
import { missionScheduler } from '../mission-runtime/missionScheduler.js';
import { taskLogger } from '../self-improving-skills/taskLogger.js';

export class ExecutiveDashboard {
  private dashboards: Map<DashboardId, Dashboard> = new Map();
  private alerts: Map<string, DashboardAlert> = new Map();
  private reports: Map<string, DashboardReport> = new Map();

  async createDashboard(
    name: string,
    description: string,
    organizationId: string,
    createdBy: string
  ): Promise<DashboardId> {
    const dashboardId = uuidv4() as DashboardId;

    const dashboard: Dashboard = {
      id: dashboardId,
      name,
      description,
      organizationId,
      widgets: [],
      layout: { columns: 3, rows: 4 },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy,
    };

    this.dashboards.set(dashboardId, dashboard);

    await memoryEngine.setWorkingMemory(dashboardId, 'dashboard', dashboard);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { dashboardId, name, organizationId },
      timestamp: new Date(),
      source: 'ExecutiveDashboard',
    });

    return dashboardId;
  }

  async getDashboard(dashboardId: DashboardId): Promise<Dashboard | null> {
    return this.dashboards.get(dashboardId) || null;
  }

  async listDashboards(organizationId: string): Promise<Dashboard[]> {
    return Array.from(this.dashboards.values())
      .filter(d => d.organizationId === organizationId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async updateDashboard(dashboardId: DashboardId, updates: Partial<Dashboard>): Promise<void> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    const updated: Dashboard = {
      ...dashboard,
      ...updates,
      updatedAt: new Date(),
    };

    this.dashboards.set(dashboardId, updated);

    await memoryEngine.setWorkingMemory(dashboardId, 'dashboard', updated);
  }

  async addWidget(dashboardId: DashboardId, widget: DashboardWidget): Promise<void> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    dashboard.widgets.push(widget);
    dashboard.updatedAt = new Date();

    this.dashboards.set(dashboardId, dashboard);

    await memoryEngine.setWorkingMemory(dashboardId, 'dashboard', dashboard);
  }

  async removeWidget(dashboardId: DashboardId, widgetId: string): Promise<void> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    dashboard.widgets = dashboard.widgets.filter((w: DashboardWidget) => w.id !== widgetId);
    dashboard.updatedAt = new Date();

    this.dashboards.set(dashboardId, dashboard);

    await memoryEngine.setWorkingMemory(dashboardId, 'dashboard', dashboard);
  }

  async getMetrics(_organizationId: string): Promise<DashboardMetric[]> {
    const metrics: DashboardMetric[] = [];

    // Workforce metrics
    const workforceMetrics = await aiWorkforce.getMetrics();
    metrics.push({
      id: 'workforce_total_agents',
      name: 'Total Agents',
      value: workforceMetrics.totalAgents,
      category: 'workforce',
      trend: 'stable',
    });
    metrics.push({
      id: 'workforce_active_agents',
      name: 'Active Agents',
      value: workforceMetrics.activeAgents,
      category: 'workforce',
      trend: 'up',
    });
    metrics.push({
      id: 'workforce_team_efficiency',
      name: 'Team Efficiency',
      value: workforceMetrics.teamEfficiency * 100,
      category: 'workforce',
      trend: 'up',
    });

    // Mission metrics
    const missionStats = await missionScheduler.getStats();
    metrics.push({
      id: 'mission_queued',
      name: 'Queued Missions',
      value: missionStats.queued,
      category: 'mission',
      trend: 'stable',
    });
    metrics.push({
      id: 'mission_running',
      name: 'Running Missions',
      value: missionStats.running,
      category: 'mission',
      trend: 'stable',
    });

    // Task metrics
    const recentTasks = await taskLogger.listTasks({});
    const completedTasks = recentTasks.filter(t => t.success);
    
    metrics.push({
      id: 'task_completion_rate',
      name: 'Task Completion Rate',
      value: recentTasks.length > 0 ? (completedTasks.length / recentTasks.length) * 100 : 0,
      category: 'task',
      trend: 'up',
    });

    return metrics;
  }

  async createAlert(
    type: 'info' | 'warning' | 'error' | 'critical',
    title: string,
    message: string,
    organizationId: string,
    relatedId?: string
  ): Promise<string> {
    const alertId = uuidv4();

    const alert: DashboardAlert = {
      id: alertId,
      type,
      title,
      message,
      organizationId,
      relatedId,
      acknowledged: false,
      createdAt: new Date(),
    };

    this.alerts.set(alertId, alert);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_FAILED,
      payload: { alertId, type, title },
      timestamp: new Date(),
      source: 'ExecutiveDashboard',
    });

    return alertId;
  }

  async acknowledgeAlert(alertId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();

    this.alerts.set(alertId, alert);
  }

  async getAlerts(organizationId: string, unacknowledgedOnly: boolean = false): Promise<DashboardAlert[]> {
    let alerts = Array.from(this.alerts.values())
      .filter(a => a.organizationId === organizationId);

    if (unacknowledgedOnly) {
      alerts = alerts.filter(a => !a.acknowledged);
    }

    return alerts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async generateReport(
    name: string,
    type: 'daily' | 'weekly' | 'monthly' | 'custom',
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    const reportId = uuidv4();

    const report: DashboardReport = {
      id: reportId,
      name,
      type,
      organizationId,
      startDate,
      endDate,
      metrics: await this.getMetrics(organizationId),
      summary: await this.generateSummary(organizationId, startDate, endDate),
      createdAt: new Date(),
    };

    this.reports.set(reportId, report);

    await memoryEngine.setWorkingMemory(reportId, 'report', report);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { reportId, name, type },
      timestamp: new Date(),
      source: 'ExecutiveDashboard',
    });

    return reportId;
  }

  async getReport(reportId: string): Promise<DashboardReport | null> {
    return this.reports.get(reportId) || null;
  }

  async listReports(organizationId: string): Promise<DashboardReport[]> {
    return Array.from(this.reports.values())
      .filter(r => r.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getOrganizationOverview(organizationId: string): Promise<{
    workforce: any;
    missions: any;
    tasks: any;
    alerts: DashboardAlert[];
  }> {
    const workforceMetrics = await aiWorkforce.getMetrics();
    const missionStats = await missionScheduler.getStats();
    const recentTasks = await taskLogger.listTasks({});
    const alerts = await this.getAlerts(organizationId, true);

    return {
      workforce: workforceMetrics,
      missions: missionStats,
      tasks: {
        total: recentTasks.length,
        completed: recentTasks.filter(t => t.success).length,
        failed: recentTasks.filter(t => !t.success).length,
      },
      alerts,
    };
  }

  private async generateSummary(_organizationId: string, startDate: Date, endDate: Date): Promise<string> {
    // Generate a text summary of the report
    const workforceMetrics = await aiWorkforce.getMetrics();
    const missionStats = await missionScheduler.getStats();

    return `
Organization Summary Report
Period: ${startDate.toISOString()} to ${endDate.toISOString()}

Workforce:
- Total Agents: ${workforceMetrics.totalAgents}
- Active Agents: ${workforceMetrics.activeAgents}
- Team Efficiency: ${(workforceMetrics.teamEfficiency * 100).toFixed(2)}%

Missions:
- Queued: ${missionStats.queued}
- Running: ${missionStats.running}
- Total Processed: ${missionStats.totalProcessed}

Overall Status: ${workforceMetrics.teamEfficiency > 0.8 ? 'Excellent' : workforceMetrics.teamEfficiency > 0.5 ? 'Good' : 'Needs Improvement'}
    `.trim();
  }

  getStats() {
    return {
      totalDashboards: this.dashboards.size,
      totalAlerts: this.alerts.size,
      totalReports: this.reports.size,
      unacknowledgedAlerts: Array.from(this.alerts.values()).filter(a => !a.acknowledged).length,
    };
  }

  exportState(): Record<string, any> {
    return {
      dashboards: Array.from(this.dashboards.entries()),
      alerts: Array.from(this.alerts.entries()),
      reports: Array.from(this.reports.entries()),
    };
  }

  importState(state: Record<string, any>): void {
    this.dashboards = new Map(state.dashboards || []);
    this.alerts = new Map(state.alerts || []);
    this.reports = new Map(state.reports || []);
  }
}

// Singleton instance
export const executiveDashboard = new ExecutiveDashboard();
