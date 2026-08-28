/**
 * Adapter — bridges the existing mission-runtime module into the harness
 * MissionRuntime. This is a thin wrapper that lets the harness create and
 * manage missions through the existing compiler/scheduler/supervisor stack.
 */
export { MissionRuntime, missionRuntime } from '../missionRuntime.js';
export type { CreateMissionInput, MissionStatus, MissionCheckpoint } from '../missionRuntime.js';
