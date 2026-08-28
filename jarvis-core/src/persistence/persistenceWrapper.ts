import { PersistenceAdapter } from './types.js';
import { persistenceManager } from './persistenceAdapter.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';
import { identityPermissions } from '../identity-permissions/identityPermissions.js';
import { securityLayer } from '../security/securityLayer.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { myAIDocs } from '../myaidocs/myaidocs.js';
import { aiWorkforce } from '../cowork-v2/aiWorkforce.js';
import { organizationBuilder } from '../cowork-v2/organizationBuilder.js';
import { executiveDashboard } from '../cowork-v2/executiveDashboard.js';
import { missionScheduler } from '../mission-runtime/missionScheduler.js';
import { missionSupervisor } from '../mission-runtime/missionSupervisor.js';
import { taskLogger } from '../self-improving-skills/taskLogger.js';
import { notesManager } from '../notes/notes.js';
import { tasksManager } from '../tasks/tasks.js';
import { contactsManager } from '../contacts/contacts.js';

const SNAPSHOT_KEY = 'jarvis:snapshot';
const SNAPSHOT_INTERVAL_MS = 30_000; // 30 seconds

export interface Persistable {
  exportState(): Record<string, any>;
  importState(state: Record<string, any>): void;
}

export class PersistenceWrapper {
  private adapter: PersistenceAdapter | null = null;
  private interval: NodeJS.Timeout | null = null;
  private dirty = false;
  private modules: Map<string, Persistable> = new Map();

  registerModule(name: string, module: Persistable): void {
    this.modules.set(name, module);
  }

  async init(adapter?: PersistenceAdapter): Promise<void> {
    this.adapter = adapter || persistenceManager.getAdapter();
    await this.adapter.connect();

    this.registerModule('memoryEngine', memoryEngine as any);
    this.registerModule('identityPermissions', identityPermissions as any);
    this.registerModule('securityLayer', securityLayer as any);
    this.registerModule('eventBus', eventBus as any);
    this.registerModule('myAIDocs', myAIDocs as any);
    this.registerModule('aiWorkforce', aiWorkforce as any);
    this.registerModule('organizationBuilder', organizationBuilder as any);
    this.registerModule('executiveDashboard', executiveDashboard as any);
    this.registerModule('missionScheduler', missionScheduler as any);
    this.registerModule('missionSupervisor', missionSupervisor as any);
    this.registerModule('taskLogger', taskLogger as any);
    this.registerModule('notesManager', notesManager as any);
    this.registerModule('tasksManager', tasksManager as any);
    this.registerModule('contactsManager', contactsManager as any);

    await this.restore();
    this.startAutoSnapshot();
    this.subscribeToStateChanges();
  }

  private subscribeToStateChanges(): void {
    const stateChangingEvents = [
      EventType.TASK_COMPLETED,
      EventType.TASK_FAILED,
      EventType.APPROVAL_GRANTED,
      EventType.APPROVAL_DENIED,
      EventType.MISSION_CREATED,
      EventType.MISSION_COMPLETED,
      EventType.MISSION_FAILED,
      EventType.ARTIFACT_CREATED,
      EventType.ARTIFACT_UPDATED,
      EventType.ARTIFACT_DELETED,
      EventType.COWORKER_ASSIGNED,
      EventType.COWORKER_STATUS_CHANGED,
    ];

    for (const eventType of stateChangingEvents) {
      eventBus.subscribe(eventType, () => {
        this.markDirty();
      });
    }
  }

  markDirty(): void {
    this.dirty = true;
  }

  async snapshot(): Promise<void> {
    if (!this.adapter) return;

    const state: Record<string, any> = {};
    for (const [name, module] of this.modules.entries()) {
      try {
        state[name] = module.exportState();
      } catch (err) {
        console.error(`[PersistenceWrapper] exportState failed for ${name}:`, err);
      }
    }

    await this.adapter.set(SNAPSHOT_KEY, {
      timestamp: new Date().toISOString(),
      state,
    });
    this.dirty = false;
  }

  async restore(): Promise<void> {
    if (!this.adapter) return;

    const snapshot = await this.adapter.get<{ timestamp: string; state: Record<string, any> }>(SNAPSHOT_KEY);
    if (!snapshot) {
      console.log('[PersistenceWrapper] No snapshot found, starting fresh');
      return;
    }

    console.log(`[PersistenceWrapper] Restoring snapshot from ${snapshot.timestamp}`);
    for (const [name, module] of this.modules.entries()) {
      if (snapshot.state[name]) {
        try {
          module.importState(snapshot.state[name]);
        } catch (err) {
          console.error(`[PersistenceWrapper] importState failed for ${name}:`, err);
        }
      }
    }
  }

  startAutoSnapshot(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      if (this.dirty) {
        this.snapshot().catch(err =>
          console.error('[PersistenceWrapper] auto-snapshot failed:', err)
        );
      }
    }, SNAPSHOT_INTERVAL_MS);
  }

  stopAutoSnapshot(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async shutdown(): Promise<void> {
    this.stopAutoSnapshot();
    await this.snapshot();
    if (this.adapter) {
      await this.adapter.disconnect();
    }
  }
}

export const persistenceWrapper = new PersistenceWrapper();
