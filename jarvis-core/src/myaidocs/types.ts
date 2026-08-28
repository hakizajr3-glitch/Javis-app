export type ArtifactId = string;

export interface Artifact {
  id: ArtifactId;
  type: 'document' | 'image' | 'code' | 'diagram' | 'report' | 'other';
  name: string;
  content: Buffer;
  metadata: ArtifactMetadata;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // userId or coworkerId
  missionId?: string;
  projectId?: string;
  organizationId?: string;
  version: string;
  tags: string[];
}

export interface ArtifactMetadata {
  mimeType: string;
  size: number;
  checksum: string;
  language?: string;
  framework?: string;
  dependencies?: string[];
  description?: string;
  custom?: Record<string, any>;
}

export interface Relation {
  fromId: ArtifactId;
  toId: ArtifactId;
  relation: string; // 'depends_on', 'related_to', 'derived_from', etc.
  createdAt: Date;
  createdBy: string;
}

export interface Version {
  version: string;
  artifactId: ArtifactId;
  content: Buffer;
  metadata: ArtifactMetadata;
  createdAt: Date;
  createdBy: string;
  changeDescription?: string;
}

export interface RenderResult {
  rendered: Buffer;
  format: 'png' | 'svg' | 'pdf';
  metadata: {
    width?: number;
    height?: number;
    pages?: number;
  };
}

export interface ArtifactFilter {
  type?: string;
  tags?: string[];
  missionId?: string;
  projectId?: string;
  organizationId?: string;
  createdBy?: string;
  dateRange?: { start: Date; end: Date };
}

export interface SearchQuery {
  query: string;
  filters?: ArtifactFilter;
  limit?: number;
  offset?: number;
}
