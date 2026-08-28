export type NoteId = string;
export type NotebookId = string;

export interface Note {
  id: NoteId;
  title: string;
  content: string;
  tags: string[];
  notebookId?: NotebookId;
  organizationId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  sharedWith?: string[];
  isShared: boolean;
}

export interface Notebook {
  id: NotebookId;
  name: string;
  description: string;
  organizationId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  color?: string;
  icon?: string;
}

export interface NoteFilter {
  notebookId?: NotebookId;
  organizationId?: string;
  tags?: string[];
  createdBy?: string;
  sharedWith?: string;
  searchQuery?: string;
  dateRange?: { start: Date; end: Date };
}

export interface NoteShare {
  noteId: NoteId;
  sharedWith: string;
  permission: 'read' | 'write' | 'admin';
  sharedAt: Date;
  sharedBy: string;
}
