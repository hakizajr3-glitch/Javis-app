import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRuntime } from './skillRuntime.js';
import { MemoryRuntime } from './memoryRuntime.js';

describe('SkillRuntime', () => {
  let sr: SkillRuntime;

  beforeEach(() => {
    sr = new SkillRuntime(new MemoryRuntime());
  });

  it('creates a skill and retrieves it', async () => {
    const id = await sr.createSkill({
      name: 'deploy',
      purpose: 'deploys apps',
      instructions: 'run deploy.sh',
      preconditions: ['app builds'],
      capabilityIds: ['shell.execute'],
      requiresApproval: true,
    });
    expect(id).toBeTruthy();
    const skill = sr.getSkill(id);
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('deploy');
    expect(skill!.version).toBe(1);
    expect(skill!.requiresApproval).toBe(true);
  });

  it('lists and searches skills', async () => {
    await sr.createSkill({
      name: 'deploy', purpose: 'deploys', instructions: 'run deploy',
      preconditions: [], capabilityIds: [], requiresApproval: false,
    });
    await sr.createSkill({
      name: 'test', purpose: 'runs tests', instructions: 'run tests',
      preconditions: [], capabilityIds: [], requiresApproval: false,
    });
    expect(sr.listSkills()).toHaveLength(2);
    expect(sr.searchSkills('deploy')).toHaveLength(1);
    expect(sr.searchSkills('test')).toHaveLength(1);
  });

  it('executes a skill and tracks performance', async () => {
    const id = await sr.createSkill({
      name: 'echo', purpose: 'echoes', instructions: 'echo input',
      preconditions: [], capabilityIds: [], requiresApproval: false,
    });
    const result = await sr.executeSkill(id, { msg: 'hi' }, 'u1');
    expect(result.success).toBe(true);
    const skill = sr.getSkill(id)!;
    expect(skill.performance.tasksAttempted).toBe(1);
    expect(skill.performance.tasksSucceeded).toBe(1);
    expect(skill.performance.successRate).toBe(1);
  });

  it('improves a skill by bumping version', async () => {
    const id = await sr.createSkill({
      name: 'x', purpose: 'p', instructions: 'v1',
      preconditions: [], capabilityIds: [], requiresApproval: false,
    });
    const improved = await sr.improveSkill(id, { instructions: 'v2' });
    expect(improved!.version).toBe(2);
    expect(improved!.instructions).toBe('v2');
  });

  it('getSkillStats returns performance', async () => {
    const id = await sr.createSkill({
      name: 'x', purpose: 'p', instructions: 'i',
      preconditions: [], capabilityIds: [], requiresApproval: false,
    });
    await sr.executeSkill(id, {}, 'u1');
    const stats = sr.getSkillStats(id);
    expect(stats).toBeDefined();
    expect(stats!.tasksAttempted).toBe(1);
  });

  it('persists skills to memory', async () => {
    const memory = new MemoryRuntime();
    const sr = new SkillRuntime(memory);
    await sr.createSkill({
      name: 'persisted', purpose: 'p', instructions: 'do thing',
      preconditions: [], capabilityIds: [], requiresApproval: false,
    });
    const records = await memory.queryKnowledge('persisted');
    expect(records).toHaveLength(1);
    expect(records[0].kind).toBe('skill');
  });
});
