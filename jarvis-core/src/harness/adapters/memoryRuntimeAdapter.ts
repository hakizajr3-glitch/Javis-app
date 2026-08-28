/**
 * Adapter — bridges the existing memory-engine module into the harness
 * MemoryRuntime. This is a thin wrapper that lets the harness access the
 * legacy tier-based memory (working/organization/personal) through the new
 * typed MemoryRecord interface.
 *
 * For the one-way import adapter (legacy → new), see memoryEngineAdapter.ts.
 * This file re-exports both the new MemoryRuntime and the import utility.
 */
export { MemoryRuntime, freshDNA, emptyPerformance } from '../memoryRuntime.js';
export type { MemoryRuntimeOptions, SaveMemoryInput, ConsolidationResult, MemoryStats } from '../memoryRuntime.js';

// One-way import from legacy memory-engine.
export { importLegacyMemory, searchLegacyAsRecords } from './memoryEngineAdapter.js';
export type { ImportResult } from './memoryEngineAdapter.js';
