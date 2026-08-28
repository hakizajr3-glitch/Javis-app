export type SecretId = string;
export type SandboxId = string;

export interface AuditEvent {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  resource: string;
  outcome: 'success' | 'failure';
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface EncryptedData {
  ciphertext: Buffer;
  keyId: string;
  algorithm: string;
  iv: Buffer;
}

export interface Secret {
  id: SecretId;
  name: string;
  value: string; // encrypted at rest
  createdAt: Date;
  updatedAt: Date;
  lastRotatedAt?: Date;
  rotationPeriod?: number; // days
  createdBy: string;
  tags: string[];
}

export interface SandboxConfig {
  resourceLimits: {
    cpu: string;
    memory: string;
    disk: string;
    network: boolean;
  };
  allowedPaths: string[];
  deniedPaths: string[];
  allowedExecutables: string[];
  timeout: number; // seconds
}

export interface ApprovalDecision {
  approved: boolean;
  reason?: string;
  requiresApproval: boolean;
}

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: Error;
  duration: number;
}
