import { describe, it, expect } from 'vitest';
import { MissionRuntime } from './missionRuntime.js';

describe('MissionRuntime', () => {
  it('creates and retrieves a mission', async () => {
    const mr = new MissionRuntime();
    const id = await mr.createMission({
      name: 'Test Mission',
      description: 'A test',
      instructions: 'Do something simple',
      userId: 'u1',
    });
    expect(id).toBeTruthy();
    const mission = mr.getMission(id);
    expect(mission).toBeDefined();
    expect(mission!.name).toBe('Test Mission');
    expect(mission!.status).toBe('queued');
  });

  it('lists missions with optional filters', async () => {
    const mr = new MissionRuntime();
    await mr.createMission({ name: 'A', description: 'd', instructions: 'i', userId: 'u1' });
    await mr.createMission({ name: 'B', description: 'd', instructions: 'i', userId: 'u2' });
    expect(mr.listMissions()).toHaveLength(2);
    expect(mr.listMissions({ userId: 'u1' })).toHaveLength(1);
  });

  it('tracks autonomy levels', async () => {
    const mr = new MissionRuntime();
    const id = await mr.createMission({
      name: 'A', description: 'd', instructions: 'i', userId: 'u1', autonomyLevel: 3,
    });
    expect(mr.getAutonomyLevel(id)).toBe(3);
    mr.setAutonomyLevel(id, 4);
    expect(mr.getAutonomyLevel(id)).toBe(4);
  });

  it('creates and restores checkpoints', async () => {
    const mr = new MissionRuntime();
    const id = await mr.createMission({ name: 'A', description: 'd', instructions: 'i', userId: 'u1' });
    const cpId = await mr.checkpoint(id, { step: 1 });
    expect(cpId).toBeTruthy();
    const restored = await mr.restoreCheckpoint(id, cpId);
    expect(restored).toEqual({ step: 1 });
  });

  it('returns null for unknown checkpoint', async () => {
    const mr = new MissionRuntime();
    expect(await mr.restoreCheckpoint('nope', 'nope')).toBeNull();
  });

  it('getStatus returns not_found for unknown missions', async () => {
    const mr = new MissionRuntime();
    const status = await mr.getStatus('nope');
    expect(status.status).toBe('not_found');
  });

  it('marks missions complete', async () => {
    const mr = new MissionRuntime();
    const id = await mr.createMission({ name: 'A', description: 'd', instructions: 'i', userId: 'u1' });
    await mr.completeMission(id);
    expect(mr.getMission(id)?.status).toBe('completed');
  });

  it('marks missions failed', async () => {
    const mr = new MissionRuntime();
    const id = await mr.createMission({ name: 'A', description: 'd', instructions: 'i', userId: 'u1' });
    await mr.failMission(id, 'something broke');
    expect(mr.getMission(id)?.status).toBe('failed');
  });
});
