import { spawn } from 'child_process';
import { pathToFileURL } from 'url';

export interface SandboxPolicy {
  allowedCommands?: string[];
  blockedCommands?: string[];
  allowedPaths?: string[];
  blockedPaths?: string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: Record<string, string | undefined>;
  cwd?: string;
  user?: string;
  network?: 'none' | 'restricted' | 'full';
}

export interface SandboxResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  killed: boolean;
  error?: string;
}

export interface SandboxAuditEvent {
  command: string;
  exitCode: number | null;
  durationMs: number;
  timestamp: Date;
  policy: string;
  allowed: boolean;
  killed: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

export class ProcessSandbox {
  private policies = new Map<string, SandboxPolicy>();

  registerPolicy(name: string, policy: SandboxPolicy): void {
    this.policies.set(name, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
      network: 'restricted',
      ...policy,
    });
  }

  getPolicy(name: string): SandboxPolicy | undefined {
    return this.policies.get(name);
  }

  async execute(command: string, policyName = 'default', args: string[] = []): Promise<SandboxResult> {
    const policy = this.policies.get(policyName) || this.defaultPolicy();

    if (!this.isCommandAllowed(command, policy)) {
      return {
        command,
        exitCode: null,
        stdout: '',
        stderr: `Command blocked by sandbox policy '${policyName}'`,
        durationMs: 0,
        killed: false,
        error: 'BLOCKED_BY_POLICY',
      };
    }

    const start = Date.now();
    const cwd = policy.cwd || process.cwd();

    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd,
        env: this.buildEnv(policy),
        timeout: policy.timeoutMs,
        killSignal: 'SIGTERM',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      const maxBytes = policy.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES;
      let stdoutBytes = 0;
      let stderrBytes = 0;

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes <= maxBytes) {
          stdout += chunk.toString('utf-8');
        } else if (!killed) {
          killed = true;
          child.kill('SIGTERM');
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBytes += chunk.length;
        if (stderrBytes <= maxBytes) {
          stderr += chunk.toString('utf-8');
        }
      });

      child.on('error', (error) => {
        resolve({
          command,
          exitCode: null,
          stdout,
          stderr: stderr || error.message,
          durationMs: Date.now() - start,
          killed,
          error: error.message,
        });
      });

      child.on('close', (exitCode) => {
        resolve({
          command,
          exitCode,
          stdout,
          stderr,
          durationMs: Date.now() - start,
          killed,
        });
      });

      // Hard timeout fallback
      setTimeout(() => {
        if (!child.killed) {
          killed = true;
          child.kill('SIGKILL');
        }
      }, (policy.timeoutMs || DEFAULT_TIMEOUT_MS) + 2000);
    });
  }

  async executeShell(script: string, policyName = 'default'): Promise<SandboxResult> {
    const policy = this.policies.get(policyName) || this.defaultPolicy();

    if (!this.isScriptAllowed(script, policy)) {
      return {
        command: script,
        exitCode: null,
        stdout: '',
        stderr: `Script blocked by sandbox policy '${policyName}'`,
        durationMs: 0,
        killed: false,
        error: 'BLOCKED_BY_POLICY',
      };
    }

    const shell = process.platform === 'win32' ? 'cmd.exe' : 'sh';
    const flag = process.platform === 'win32' ? '/c' : '-c';
    return this.execute(shell, policyName, [flag, script]);
  }

  private defaultPolicy(): SandboxPolicy {
    return {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
      network: 'restricted',
    };
  }

  private isCommandAllowed(command: string, policy: SandboxPolicy): boolean {
    const base = command.split(' ')[0].toLowerCase();

    if (policy.blockedCommands && policy.blockedCommands.some(c => base === c.toLowerCase())) {
      return false;
    }

    if (policy.allowedCommands && policy.allowedCommands.length > 0) {
      return policy.allowedCommands.some(c => base === c.toLowerCase());
    }

    return true;
  }

  private isScriptAllowed(script: string, policy: SandboxPolicy): boolean {
    const lower = script.toLowerCase();

    if (policy.blockedCommands) {
      for (const blocked of policy.blockedCommands) {
        if (lower.includes(blocked.toLowerCase())) {
          return false;
        }
      }
    }

    if (policy.blockedPaths) {
      for (const blocked of policy.blockedPaths) {
        if (lower.includes(blocked.toLowerCase())) {
          return false;
        }
      }
    }

    return true;
  }

  private buildEnv(policy: SandboxPolicy): NodeJS.ProcessEnv {
    const base = process.env;
    const env: NodeJS.ProcessEnv = { ...base };

    if (policy.env) {
      for (const [key, value] of Object.entries(policy.env)) {
        if (value === undefined) {
          delete env[key];
        } else {
          env[key] = value;
        }
      }
    }

    if (policy.network === 'none') {
      env.NODE_OPTIONS = '--no-network';
    }

    return env;
  }
}

export const processSandbox = new ProcessSandbox();

// Register default restrictive policy
processSandbox.registerPolicy('default', {
  timeoutMs: 30_000,
  maxOutputBytes: 1024 * 1024,
  blockedCommands: ['rm', 'sudo', 'mkfs', 'dd', 'format', 'shutdown'],
  network: 'restricted',
});

processSandbox.registerPolicy('read-only', {
  timeoutMs: 15_000,
  maxOutputBytes: 512 * 1024,
  allowedCommands: ['cat', 'ls', 'echo', 'grep', 'find', 'git', 'node', 'python3', 'npx'],
  blockedCommands: ['rm', 'sudo', 'mkfs', 'dd', 'format', 'shutdown'],
  network: 'restricted',
});

processSandbox.registerPolicy('networked', {
  timeoutMs: 60_000,
  maxOutputBytes: 2 * 1024 * 1024,
  allowedCommands: ['curl', 'wget', 'git', 'node', 'npm', 'npx', 'python3'],
  blockedCommands: ['rm', 'sudo', 'mkfs', 'dd', 'format', 'shutdown'],
  network: 'full',
});
