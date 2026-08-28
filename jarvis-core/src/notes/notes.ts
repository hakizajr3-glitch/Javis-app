import { v4 as uuidv4 } from 'uuid';
import {
  NoteId,
  NotebookId,
  Note,
  Notebook,
  NoteFilter,
  NoteShare,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';
import { organizationBuilder } from '../cowork-v2/organizationBuilder.js';

export class NotesManager {
  private notes: Map<NoteId, Note> = new Map();
  private notebooks: Map<NotebookId, Notebook> = new Map();
  private shares: Map<string, NoteShare> = new Map();

  async createNote(
    title: string,
    content: string,
    createdBy: string,
    notebookId?: NotebookId,
    organizationId?: string,
    tags: string[] = []
  ): Promise<NoteId> {
    const noteId = uuidv4() as NoteId;

    // Verify organization exists if provided
    if (organizationId) {
      const org = await organizationBuilder.getOrganization(organizationId);
      if (!org) {
        throw new Error(`Organization not found: ${organizationId}`);
      }
    }

    const note: Note = {
      id: noteId,
      title,
      content,
      tags,
      notebookId,
      organizationId,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
      isShared: false,
    };

    this.notes.set(noteId, note);

    await memoryEngine.setWorkingMemory(noteId, 'note', note);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.ARTIFACT_CREATED,
      payload: { noteId, title, organizationId },
      timestamp: new Date(),
      source: 'NotesManager',
    });

    return noteId;
  }

  async updateNote(noteId: NoteId, updates: Partial<Omit<Note, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    const note = this.notes.get(noteId);
    if (!note) {
      throw new Error(`Note not found: ${noteId}`);
    }

    const updatedNote: Note = {
      ...note,
      ...updates,
      updatedAt: new Date(),
    };

    this.notes.set(noteId, updatedNote);

    await memoryEngine.setWorkingMemory(noteId, 'note', updatedNote);
  }

  async deleteNote(noteId: NoteId): Promise<void> {
    this.notes.delete(noteId);
    await memoryEngine.deleteWorkingMemory(noteId, 'note');
  }

  async getNote(noteId: NoteId): Promise<Note | null> {
    return this.notes.get(noteId) || null;
  }

  async listNotes(filter?: NoteFilter): Promise<Note[]> {
    let notes = Array.from(this.notes.values());

    if (filter) {
      if (filter.notebookId) {
        notes = notes.filter(n => n.notebookId === filter.notebookId);
      }
      if (filter.organizationId) {
        notes = notes.filter(n => n.organizationId === filter.organizationId);
      }
      if (filter.tags && filter.tags.length > 0) {
        notes = notes.filter(n => filter.tags!.some(tag => n.tags.includes(tag)));
      }
      if (filter.createdBy) {
        notes = notes.filter(n => n.createdBy === filter.createdBy);
      }
      if (filter.sharedWith) {
        notes = notes.filter(n => n.sharedWith?.includes(filter.sharedWith!));
      }
      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase();
        notes = notes.filter(n =>
          n.title.toLowerCase().includes(query) ||
          n.content.toLowerCase().includes(query)
        );
      }
      if (filter.dateRange) {
        notes = notes.filter(n =>
          n.createdAt >= filter.dateRange!.start &&
          n.createdAt <= filter.dateRange!.end
        );
      }
    }

    return notes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async createNotebook(
    name: string,
    description: string,
    createdBy: string,
    organizationId?: string,
    color?: string,
    icon?: string
  ): Promise<NotebookId> {
    const notebookId = uuidv4() as NotebookId;

    // Verify organization exists if provided
    if (organizationId) {
      const org = await organizationBuilder.getOrganization(organizationId);
      if (!org) {
        throw new Error(`Organization not found: ${organizationId}`);
      }
    }

    const notebook: Notebook = {
      id: notebookId,
      name,
      description,
      organizationId,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
      color,
      icon,
    };

    this.notebooks.set(notebookId, notebook);

    await memoryEngine.setWorkingMemory(notebookId, 'notebook', notebook);

    return notebookId;
  }

  async updateNotebook(notebookId: NotebookId, updates: Partial<Omit<Notebook, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) {
      throw new Error(`Notebook not found: ${notebookId}`);
    }

    const updatedNotebook: Notebook = {
      ...notebook,
      ...updates,
      updatedAt: new Date(),
    };

    this.notebooks.set(notebookId, updatedNotebook);

    await memoryEngine.setWorkingMemory(notebookId, 'notebook', updatedNotebook);
  }

  async deleteNotebook(notebookId: NotebookId): Promise<void> {
    this.notebooks.delete(notebookId);
    await memoryEngine.deleteWorkingMemory(notebookId, 'notebook');
  }

  async getNotebook(notebookId: NotebookId): Promise<Notebook | null> {
    return this.notebooks.get(notebookId) || null;
  }

  async listNotebooks(organizationId?: string, createdBy?: string): Promise<Notebook[]> {
    let notebooks = Array.from(this.notebooks.values());

    if (organizationId) {
      notebooks = notebooks.filter(n => n.organizationId === organizationId);
    }
    if (createdBy) {
      notebooks = notebooks.filter(n => n.createdBy === createdBy);
    }

    return notebooks.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async shareNote(
    noteId: NoteId,
    sharedWith: string,
    permission: 'read' | 'write' | 'admin',
    sharedBy: string
  ): Promise<void> {
    const note = this.notes.get(noteId);
    if (!note) {
      throw new Error(`Note not found: ${noteId}`);
    }

    const shareId = uuidv4();
    const share: NoteShare = {
      noteId,
      sharedWith,
      permission,
      sharedAt: new Date(),
      sharedBy,
    };

    this.shares.set(shareId, share);

    // Update note to reflect sharing
    const updatedNote: Note = {
      ...note,
      sharedWith: [...(note.sharedWith || []), sharedWith],
      isShared: true,
      updatedAt: new Date(),
    };

    this.notes.set(noteId, updatedNote);
    await memoryEngine.setWorkingMemory(noteId, 'note', updatedNote);
  }

  async unshareNote(noteId: NoteId, sharedWith: string): Promise<void> {
    const note = this.notes.get(noteId);
    if (!note) {
      throw new Error(`Note not found: ${noteId}`);
    }

    // Remove share entry
    for (const [shareId, share] of this.shares.entries()) {
      if (share.noteId === noteId && share.sharedWith === sharedWith) {
        this.shares.delete(shareId);
      }
    }

    // Update note
    const updatedNote: Note = {
      ...note,
      sharedWith: note.sharedWith?.filter(id => id !== sharedWith),
      isShared: (note.sharedWith?.filter(id => id !== sharedWith).length || 0) > 0,
      updatedAt: new Date(),
    };

    this.notes.set(noteId, updatedNote);
    await memoryEngine.setWorkingMemory(noteId, 'note', updatedNote);
  }

  async getSharedNotes(userId: string): Promise<Note[]> {
    const sharedWithMe = Array.from(this.shares.values())
      .filter(share => share.sharedWith === userId)
      .map(share => share.noteId);

    return Array.from(this.notes.values())
      .filter(note => sharedWithMe.includes(note.id));
  }

  exportState(): Record<string, any> {
    return {
      notes: Array.from(this.notes.entries()),
      notebooks: Array.from(this.notebooks.entries()),
      shares: Array.from(this.shares.entries()),
    };
  }

  importState(state: Record<string, any>): void {
    this.notes = new Map(state.notes || []);
    this.notebooks = new Map(state.notebooks || []);
    this.shares = new Map(state.shares || []);
  }
}

// Singleton instance
export const notesManager = new NotesManager();
