import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
  AuditEvent,
  SecretId,
  Secret,
  SandboxId,
  SandboxConfig,
  ApprovalDecision,
  ActionResult,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { identityPermissions } from '../identity-permissions/identityPermissions.js';

export class SecurityLayer {
  private auditLog: Map<string, AuditEvent> = new Map();
  private secrets: Map<SecretId, Secret> = new Map();
  private sandboxes: Map<SandboxId, SandboxConfig> = new Map();
  private maxAuditLogSize: number = 10000;
  private encryptionKeys: Map<string, Buffer> = new Map();

  // Approval Gates
  async enforceApprovalGate(action: any): Promise<ApprovalDecision> {
    // Check if action requires approval
    const requiresApproval = await this.checkIfRequiresApproval(action);

    if (!requiresApproval) {
      return {
        approved: true,
        requiresApproval: false,
      };
    }

    // Request approval through Identity & Permissions
    const approvalId = await identityPermissions.requestApproval({
      userId: action.userId,
      requestedBy: action.userId,
      resource: action.resource,
      action: action.type,
      description: action.description,
    });

    return {
      approved: false,
      requiresApproval: true,
      reason: `Approval required. Approval ID: ${approvalId}`,
    };
  }

  async bypassApprovalGate(action: any, reason: string, bypassKey: string): Promise<void> {
    // Validate bypass key (in production, this would be a secure token)
    if (bypassKey !== process.env.BYPASS_KEY) {
      throw new Error('Invalid bypass key');
    }

    // Log the bypass
    await this.logAuditEvent({
      id: uuidv4(),
      timestamp: new Date(),
      userId: action.userId,
      action: action.type,
      resource: action.resource,
      outcome: 'success',
      details: {
        bypassed: true,
        reason,
      },
    });
  }

  // Audit Logging
  async logAuditEvent(event: AuditEvent): Promise<void> {
    this.auditLog.set(event.id, event);

    // Emit event to event bus
    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED, // Using task completed for audit events
      payload: { auditEvent: event },
      timestamp: event.timestamp,
      source: 'SecurityLayer',
      correlationId: event.userId,
    });

    // Clean old events if needed
    if (this.auditLog.size > this.maxAuditLogSize) {
      this.cleanOldAuditEvents();
    }
  }

  async queryAuditLogs(query: any): Promise<AuditEvent[]> {
    let events = Array.from(this.auditLog.values());

    // Apply filters
    if (query.userId) {
      events = events.filter(e => e.userId === query.userId);
    }
    if (query.action) {
      events = events.filter(e => e.action === query.action);
    }
    if (query.startTime) {
      events = events.filter(e => e.timestamp >= query.startTime);
    }
    if (query.endTime) {
      events = events.filter(e => e.timestamp <= query.endTime);
    }
    if (query.outcome) {
      events = events.filter(e => e.outcome === query.outcome);
    }

    // Sort by timestamp descending
    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async exportAuditLogs(query: any, format: 'json' | 'csv'): Promise<Buffer> {
    const events = await this.queryAuditLogs(query);

    if (format === 'json') {
      return Buffer.from(JSON.stringify(events, null, 2));
    } else if (format === 'csv') {
      const headers = 'id,timestamp,userId,action,resource,outcome\n';
      const rows = events.map(e =>
        `${e.id},${e.timestamp.toISOString()},${e.userId},${e.action},${e.resource},${e.outcome}`
      ).join('\n');
      return Buffer.from(headers + rows);
    }

    throw new Error(`Unsupported format: ${format}`);
  }

  // Encryption
  async encrypt(data: Buffer, keyId: string): Promise<{
    ciphertext: Buffer;
    keyId: string;
    algorithm: string;
    iv: Buffer;
    authTag: Buffer;
  }> {
    const key = this.encryptionKeys.get(keyId);
    if (!key) {
      throw new Error(`Encryption key not found: ${keyId}`);
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(data);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted,
      keyId,
      algorithm: 'aes-256-gcm',
      iv,
      authTag,
    };
  }

  async decrypt(encryptedData: any): Promise<Buffer> {
    const key = this.encryptionKeys.get(encryptedData.keyId);
    if (!key) {
      throw new Error(`Encryption key not found: ${encryptedData.keyId}`);
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, encryptedData.iv);
    decipher.setAuthTag(encryptedData.authTag);
    let decrypted = decipher.update(encryptedData.ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted;
  }

  async rotateEncryptionKey(oldKeyId: string, newKeyId: string): Promise<void> {
    // In production, this would re-encrypt all data with the new key
    console.log(`Rotating encryption key from ${oldKeyId} to ${newKeyId}`);
  }

  // Secrets Management
  async storeSecret(secret: Omit<Secret, 'id' | 'createdAt' | 'updatedAt'>): Promise<SecretId> {
    const secretId = uuidv4() as SecretId;
    const newSecret: Secret = {
      ...secret,
      id: secretId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Encrypt the secret value. Persist IV + authTag alongside the ciphertext
    // so the value can be decrypted later (aes-256-gcm requires the auth tag).
    const encrypted = await this.encrypt(Buffer.from(secret.value), 'default-key');
    newSecret.value = JSON.stringify({
      v: 1,
      ciphertext: encrypted.ciphertext.toString('base64'),
      iv: encrypted.iv.toString('base64'),
      authTag: encrypted.authTag.toString('base64'),
    });

    this.secrets.set(secretId, newSecret);

    await this.logAuditEvent({
      id: uuidv4(),
      timestamp: new Date(),
      userId: secret.createdBy,
      action: 'store_secret',
      resource: secretId,
      outcome: 'success',
      details: { secretName: secret.name },
    });

    return secretId;
  }

  async retrieveSecret(secretId: SecretId): Promise<Secret> {
    const secret = this.secrets.get(secretId);
    if (!secret) {
      throw new Error(`Secret not found: ${secretId}`);
    }

    // Decrypt the secret value using the persisted IV + authTag envelope.
    let envelope: { ciphertext: string; iv: string; authTag: string };
    try {
      envelope = JSON.parse(secret.value);
    } catch {
      throw new Error(
        `Secret ${secretId} was stored in an incompatible format (missing encryption metadata). Re-store the secret.`
      );
    }
    if (!envelope?.ciphertext || !envelope?.iv || !envelope?.authTag) {
      throw new Error(
        `Secret ${secretId} is missing encryption metadata (iv/authTag). Re-store the secret.`
      );
    }

    const encrypted = {
      ciphertext: Buffer.from(envelope.ciphertext, 'base64'),
      keyId: 'default-key',
      algorithm: 'aes-256-gcm',
      iv: Buffer.from(envelope.iv, 'base64'),
      authTag: Buffer.from(envelope.authTag, 'base64'),
    };

    const decrypted = await this.decrypt(encrypted);

    return {
      ...secret,
      value: decrypted.toString(),
    };
  }

  async deleteSecret(secretId: SecretId): Promise<void> {
    this.secrets.delete(secretId);
  }

  async rotateSecret(secretId: SecretId): Promise<void> {
    const secret = this.secrets.get(secretId);
    if (!secret) {
      throw new Error(`Secret not found: ${secretId}`);
    }

    // In production, generate new secret value
    secret.lastRotatedAt = new Date();
    this.secrets.set(secretId, secret);
  }

  async listSecrets(filter?: any): Promise<Secret[]> {
    let secrets = Array.from(this.secrets.values());

    if (filter) {
      if (filter.tags) {
        secrets = secrets.filter(s =>
          filter.tags.every((tag: string) => s.tags.includes(tag))
        );
      }
      if (filter.createdBy) {
        secrets = secrets.filter(s => s.createdBy === filter.createdBy);
      }
    }

    return secrets;
  }

  // Sandboxing
  async createSandbox(config: SandboxConfig): Promise<SandboxId> {
    const sandboxId = uuidv4() as SandboxId;
    this.sandboxes.set(sandboxId, config);
    return sandboxId;
  }

  async executeInSandbox(sandboxId: SandboxId, action: any): Promise<ActionResult> {
    const config = this.sandboxes.get(sandboxId);
    if (!config) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    // In production, this would execute in an isolated environment
    const startTime = Date.now();

    try {
      // Simulate execution
      const result = await this.executeActionSafely(action, config);

      return {
        success: true,
        data: result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        duration: Date.now() - startTime,
      };
    }
  }

  async destroySandbox(sandboxId: SandboxId): Promise<void> {
    this.sandboxes.delete(sandboxId);
  }

  async getSandboxStatus(sandboxId: SandboxId): Promise<any> {
    const config = this.sandboxes.get(sandboxId);
    if (!config) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    return {
      sandboxId,
      active: true,
      config,
    };
  }

  private async checkIfRequiresApproval(action: any): Promise<boolean> {
    // Read-only actions are auto-approved
    if (action.type === 'read') {
      return false;
    }

    // Non-read-only actions require approval
    return true;
  }

  private async executeActionSafely(action: any, config: SandboxConfig): Promise<any> {
    // In production, this would execute in a sandboxed environment
    // For now, return a mock result
    return { executed: true, action: action.type };
  }

  private cleanOldAuditEvents(): void {
    const events = Array.from(this.auditLog.entries())
      .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());

    const toRemove = events.slice(0, events.length - this.maxAuditLogSize);
    for (const [id] of toRemove) {
      this.auditLog.delete(id);
    }
  }

  initializeDefaultKey(): void {
    // Generate a default encryption key
    const key = crypto.randomBytes(32);
    this.encryptionKeys.set('default-key', key);
  }

  exportState(): Record<string, any> {
    return {
      auditLog: Array.from(this.auditLog.entries()),
      secrets: Array.from(this.secrets.entries()),
      sandboxes: Array.from(this.sandboxes.entries()),
    };
  }

  importState(state: Record<string, any>): void {
    this.auditLog = new Map(state.auditLog || []);
    this.secrets = new Map(state.secrets || []);
    this.sandboxes = new Map(state.sandboxes || []);
  }
}

// Singleton instance
export const securityLayer = new SecurityLayer();
securityLayer.initializeDefaultKey();
