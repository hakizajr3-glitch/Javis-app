export type MemoryTier = 'working' | 'organization' | 'personal';

export interface MemoryResult {
  tier: MemoryTier;
  key: string;
  value: any;
  score: number;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy?: string;
    missionId?: string;
    orgId?: string;
    userId?: string;
  };
}

export interface MemoryFilter {
  tier?: MemoryTier;
  missionId?: string;
  orgId?: string;
  userId?: string;
  dateRange?: { start: Date; end: Date };
}

export interface ConsolidationResult {
  itemsConsolidated: number;
  itemsArchived: number;
  spaceSaved: number;
  duration: number;
}

export interface ArchivalResult {
  itemsArchived: number;
  archiveLocation: string;
  duration: number;
}
