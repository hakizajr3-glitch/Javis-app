/**
 * Adapter — bridges the existing self-improving-skills module into the
 * harness SkillRuntime. This is a thin wrapper that lets the harness create,
 * execute, and improve skills through the existing taskLogger/patternDetection/
 * skillProposal stack.
 */
export { SkillRuntime, skillRuntime } from '../skillRuntime.js';
export type { CreateSkillInput, SkillExecutionResult } from '../skillRuntime.js';
