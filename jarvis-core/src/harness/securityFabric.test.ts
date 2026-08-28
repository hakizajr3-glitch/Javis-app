import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityFabric, SecurityFabric as SF } from './securityFabric.js';

describe('SecurityFabric', () => {
  let fabric: SecurityFabric;

  beforeEach(() => {
    fabric = new SF({
      scanIntervalMs: 999999, // Don't actually run monitoring cycles during tests
    });
  });

  // ── 2D.1: Security Auditing ──────────────────────────────────────────

  it('runs a network scan audit', async () => {
    const auditId = await fabric.runAudit('network-scan', 'localhost', 'test-user');
    const audit = fabric.getAudit(auditId);
    expect(audit).not.toBeNull();
    expect(audit!.type).toBe('network-scan');
    expect(audit!.target).toBe('localhost');
    expect(audit!.status).toBe('completed');
    expect(audit!.summary).toBeDefined();
  });

  it('runs a config audit', async () => {
    const auditId = await fabric.runAudit('config-audit', '/etc/jarvis', 'test-user');
    const audit = fabric.getAudit(auditId);
    expect(audit).not.toBeNull();
    expect(audit!.status).toBe('completed');
  });

  it('runs a dependency scan', async () => {
    const auditId = await fabric.runAudit('dependency-scan', './package.json', 'test-user');
    const audit = fabric.getAudit(auditId);
    expect(audit).not.toBeNull();
    expect(audit!.status).toBe('completed');
  });

  it('computes threat level from findings', async () => {
    const auditId = await fabric.runAudit('network-scan', 'localhost', 'test-user');
    const audit = fabric.getAudit(auditId);
    expect(audit!.threatLevel).toBeDefined();
    expect(['none', 'low', 'medium', 'high', 'critical']).toContain(audit!.threatLevel);
  });

  it('lists audits by type', async () => {
    await fabric.runAudit('network-scan', 'host1', 'user');
    await fabric.runAudit('config-audit', '/etc', 'user');
    await fabric.runAudit('network-scan', 'host2', 'user');

    const all = fabric.listAudits();
    expect(all.length).toBe(3);

    const networkScans = fabric.listAudits('network-scan');
    expect(networkScans.length).toBe(2);
    expect(networkScans.every(a => a.type === 'network-scan')).toBe(true);
  });

  // ── 2D.2: Malware Analysis ───────────────────────────────────────────

  it('analyzes a file and produces a verdict', async () => {
    const analysisId = await fabric.analyzeFile('/tmp/test-file.txt', 'test-user');
    const analysis = fabric.getAnalysis(analysisId);
    expect(analysis).not.toBeNull();
    expect(analysis!.filePath).toBe('/tmp/test-file.txt');
    expect(['completed', 'failed']).toContain(analysis!.status);
    expect(['clean', 'suspicious', 'malicious', 'unknown']).toContain(analysis!.verdict);
  });

  it('lists analyses', async () => {
    await fabric.analyzeFile('/tmp/file1.txt', 'user');
    await fabric.analyzeFile('/tmp/file2.txt', 'user');
    const analyses = fabric.listAnalyses();
    expect(analyses.length).toBe(2);
  });

  // ── 2D.3: Security Monitoring ────────────────────────────────────────

  it('creates and acknowledges alerts', () => {
    const alertId = fabric.createAlert('medium', 'test', 'Suspicious activity detected');
    const alerts = fabric.listAlerts();
    expect(alerts.length).toBe(1);
    expect(alerts[0].id).toBe(alertId);
    expect(alerts[0].acknowledged).toBe(false);

    fabric.acknowledgeAlert(alertId);
    const acked = fabric.listAlerts();
    expect(acked[0].acknowledged).toBe(true);
  });

  it('auto-creates incidents for high-level alerts', () => {
    fabric.createAlert('high', 'monitor', 'High threat detected');
    const incidents = fabric.listIncidents();
    expect(incidents.length).toBe(1);
    expect(incidents[0].level).toBe('high');
  });

  it('auto-contains critical incidents', () => {
    fabric.createAlert('critical', 'monitor', 'Critical threat detected');
    const incidents = fabric.listIncidents();
    expect(incidents.length).toBe(1);
    expect(incidents[0].status).toBe('contained');
    expect(incidents[0].containedAt).toBeDefined();
  });

  it('starts and stops monitoring', () => {
    fabric.startMonitoring();
    const stats = fabric.getStats();
    expect(stats.monitoring).toBe(true);

    fabric.stopMonitoring();
    const statsAfter = fabric.getStats();
    expect(statsAfter.monitoring).toBe(false);
  });

  // ── 2D.4: Incident Response ──────────────────────────────────────────

  it('runs full incident response lifecycle', async () => {
    const incidentId = fabric.createIncident('medium', 'test', 'Test incident');

    // Detect
    let incident = fabric.getIncident(incidentId);
    expect(incident!.status).toBe('detected');

    // Contain
    await fabric.containIncident(incidentId, 'Isolated affected system');
    incident = fabric.getIncident(incidentId);
    expect(incident!.status).toBe('contained');
    expect(incident!.containedAt).toBeDefined();

    // Investigate
    await fabric.investigateIncident(incidentId, 'Analyzed logs and traces');
    incident = fabric.getIncident(incidentId);
    expect(incident!.status).toBe('investigating');

    // Remediate
    await fabric.remediateIncident(incidentId, 'Patched vulnerability', 'Outdated dependency');
    incident = fabric.getIncident(incidentId);
    expect(incident!.status).toBe('remediated');
    expect(incident!.rootCause).toBe('Outdated dependency');

    // Verify
    await fabric.verifyIncident(incidentId, 'Confirmed fix is effective');
    incident = fabric.getIncident(incidentId);
    expect(incident!.status).toBe('verified');
    expect(incident!.verifiedAt).toBeDefined();

    // Should have 4 actions (one per phase)
    expect(incident!.actions.length).toBe(4);
    const phases = incident!.actions.map(a => a.phase);
    expect(phases).toEqual(['contain', 'investigate', 'remediate', 'verify']);
  });

  it('can mark incidents as false positive', () => {
    const incidentId = fabric.createIncident('low', 'test', 'False alarm');
    fabric.markFalsePositive(incidentId);
    const incident = fabric.getIncident(incidentId);
    expect(incident!.status).toBe('false-positive');
  });

  it('lists incidents by status', async () => {
    const id1 = fabric.createIncident('low', 'test', 'Incident 1');
    const id2 = fabric.createIncident('low', 'test', 'Incident 2');
    await fabric.containIncident(id2, 'Contained');

    const detected = fabric.listIncidents('detected');
    expect(detected.length).toBe(1);
    expect(detected[0].id).toBe(id1);

    const contained = fabric.listIncidents('contained');
    expect(contained.length).toBe(1);
    expect(contained[0].id).toBe(id2);
  });

  // ── Stats ────────────────────────────────────────────────────────────

  it('computes stats', async () => {
    await fabric.runAudit('network-scan', 'localhost', 'user');
    fabric.createAlert('low', 'test', 'Test alert');
    fabric.createIncident('medium', 'test', 'Test incident');

    const stats = fabric.getStats();
    expect(stats.totalAudits).toBe(1);
    expect(stats.totalAlerts).toBe(1);
    expect(stats.activeIncidents).toBe(1);
  });
});
