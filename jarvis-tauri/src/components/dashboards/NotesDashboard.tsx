import React, { useState, useEffect } from 'react';
import { FileText, Plus, Search, Tag, Clock, Trash2, Edit3, Save, X, BookOpen, FolderOpen, Pin } from 'lucide-react';
import { coreBridge } from '../../coreBridge';

interface NoteItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: Date;
  notebook: string;
  pinned: boolean;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

const notebooks = ['All Notes', 'Work', 'Personal', 'Technical', 'Templates', 'Ideas'];

export const NotesDashboard: React.FC = () => {
  const [notes, setNotes] = useState<NoteItem[]>(() => coreBridge.getNotes());
  useEffect(() => { coreBridge.saveNotes(notes); }, [notes]);
  const [selectedNote, setSelectedNote] = useState<NoteItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNotebook, setActiveNotebook] = useState('All Notes');
  const [showNewNote, setShowNewNote] = useState(false);

  const filteredNotes = notes.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) || n.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesNotebook = activeNotebook === 'All Notes' || n.notebook === activeNotebook;
    return matchesSearch && matchesNotebook;
  });

  const handleSelectNote = (note: NoteItem) => {
    setSelectedNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditTags(note.tags.join(', '));
    setIsEditing(false);
  };

  const handleSaveNote = () => {
    if (!selectedNote) return;
    setNotes(prev => prev.map(n => n.id === selectedNote.id ? {
      ...n,
      title: editTitle,
      content: editContent,
      tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
    } : n));
    setSelectedNote(prev => prev ? { ...prev, title: editTitle, content: editContent, tags: editTags.split(',').map(t => t.trim()).filter(Boolean) } : null);
    setIsEditing(false);
  };

  const handleNewNote = () => {
    const newNote: NoteItem = {
      id: generateId(),
      title: 'Untitled Note',
      content: '',
      tags: [],
      createdAt: new Date(),
      notebook: activeNotebook === 'All Notes' ? 'Personal' : activeNotebook,
      pinned: false,
    };
    setNotes(prev => [newNote, ...prev]);
    setSelectedNote(newNote);
    setEditTitle('Untitled Note');
    setEditContent('');
    setEditTags('');
    setIsEditing(true);
    setShowNewNote(false);
  };

  const handleDeleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    if (selectedNote?.id === id) setSelectedNote(null);
  };

  return (
    <div className="flex-1 flex gap-4 min-h-0">
      {/* Sidebar */}
      <div className="w-[220px] shrink-0 flex flex-col gap-3">
        <button
          onClick={() => setShowNewNote(true)}
          className="w-full px-3 py-2.5 rounded-lg bg-cyan-400/10 border border-cyan-400/40 text-cyan-400 hover:bg-cyan-400/20 transition-all flex items-center gap-2 justify-center font-mono-tech text-[10px] font-bold tracking-wider"
        >
          <Plus size={14} /> NEW NOTE
        </button>

        <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-2">
          <span className="text-[8px] text-stonic-textDim font-mono-tech tracking-wider px-2 py-1">NOTEBOOKS</span>
          {notebooks.map(nb => (
            <button
              key={nb}
              onClick={() => { setActiveNotebook(nb); setSelectedNote(null); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px] transition-all font-mono-tech ${
                activeNotebook === nb ? 'bg-cyan-400/10 text-cyan-400' : 'text-stonic-textMuted hover:text-stonic-text hover:bg-stonic-hover/30'
              }`}
            >
              <FolderOpen size={12} />
              <span>{nb}</span>
              {nb !== 'All Notes' && <span className="ml-auto text-[8px] text-stonic-textDim">{notes.filter(n => n.notebook === nb).length}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Notes List */}
      <div className="w-[280px] shrink-0 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col min-h-0">
        <div className="p-2.5 border-b border-stonic-b1">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stonic-textDim" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search notes..."
              className="w-full pl-7 pr-3 py-1.5 rounded-md bg-stonic-surface/50 border border-stonic-b1 text-[10px] text-stonic-text font-mono-tech placeholder:text-stonic-textDim focus:outline-none focus:border-cyan-400/40"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-stonic-textDim gap-2">
              <FileText size={32} className="opacity-20" />
              <span className="text-[10px] font-mono-tech">No notes found</span>
            </div>
          ) : (
            filteredNotes.map(note => (
              <button
                key={note.id}
                onClick={() => handleSelectNote(note)}
                className={`w-full text-left p-2.5 border-b border-stonic-b1/30 hover:bg-stonic-hover/30 transition-colors ${
                  selectedNote?.id === note.id ? 'bg-cyan-400/5 border-l-2 border-l-cyan-400' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  {note.pinned && <Pin size={10} className="text-amber-400 shrink-0" />}
                  <span className="text-[10px] font-semibold text-stonic-text font-mono-tech truncate">{note.title}</span>
                </div>
                <div className="flex items-center gap-2 text-[7px] text-stonic-textDim font-mono-tech">
                  <Clock size={8} />
                  <span>{note.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span className="text-stonic-b1">|</span>
                  <BookOpen size={8} />
                  <span>{note.notebook}</span>
                </div>
                <div className="flex gap-1 mt-1">
                  {note.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded bg-stonic-surface border border-stonic-b1 text-[7px] text-stonic-textMuted font-mono-tech">{tag}</span>
                  ))}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Note Editor */}
      <div className="flex-1 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col min-h-0">
        {selectedNote ? (
          <>
            <div className="p-3 border-b border-stonic-b1 flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isEditing ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="flex-1 bg-stonic-surface/50 border border-stonic-b1 rounded-md px-2 py-1 text-[11px] text-stonic-text font-mono-tech focus:outline-none focus:border-cyan-400/40"
                    placeholder="Note title..."
                  />
                ) : (
                  <span className="text-[12px] font-bold text-stonic-text font-mono-tech truncate">{selectedNote.title}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {isEditing ? (
                  <>
                    <button onClick={handleSaveNote} className="p-1.5 rounded-md bg-cyan-400/10 text-cyan-400 hover:bg-cyan-400/20 transition-colors"><Save size={14} /></button>
                    <button onClick={() => setIsEditing(false)} className="p-1.5 rounded-md hover:bg-stonic-hover transition-colors text-stonic-textMuted"><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setIsEditing(true)} className="p-1.5 rounded-md hover:bg-stonic-hover transition-colors text-stonic-textMuted"><Edit3 size={14} /></button>
                    <button onClick={() => handleDeleteNote(selectedNote.id)} className="p-1.5 rounded-md hover:bg-red-500/10 text-stonic-textMuted hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            </div>
            <div className="flex-1 p-3 overflow-y-auto min-h-0">
              {isEditing ? (
                <>
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="w-full h-full min-h-[200px] bg-stonic-surface/50 border border-stonic-b1 rounded-md p-3 text-[10px] text-stonic-text font-mono-tech resize-none focus:outline-none focus:border-cyan-400/40"
                    placeholder="Write your note here..."
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <Tag size={12} className="text-stonic-textDim" />
                    <input
                      type="text"
                      value={editTags}
                      onChange={e => setEditTags(e.target.value)}
                      placeholder="Tags (comma separated)"
                      className="flex-1 bg-stonic-surface/50 border border-stonic-b1 rounded-md px-2 py-1 text-[9px] text-stonic-text font-mono-tech focus:outline-none focus:border-cyan-400/40"
                    />
                  </div>
                </>
              ) : (
                <pre className="text-[10px] text-stonic-text font-mono-tech whitespace-pre-wrap leading-relaxed">{selectedNote.content}</pre>
              )}
            </div>
            <div className="p-2.5 border-t border-stonic-b1 flex items-center justify-between text-[8px] text-stonic-textDim font-mono-tech">
              <div className="flex items-center gap-3">
                <span>Created: {selectedNote.createdAt.toLocaleString()}</span>
                <span>Notebook: {selectedNote.notebook}</span>
              </div>
              <div className="flex gap-1">
                {selectedNote.tags.map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 rounded bg-cyan-400/5 border border-cyan-400/20 text-[7px] text-cyan-400">{tag}</span>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-stonic-textDim gap-3">
            <FileText size={48} className="opacity-10" />
            <span className="text-[11px] font-mono-tech">Select a note to view or edit</span>
            <button onClick={() => setShowNewNote(true)} className="px-4 py-2 rounded-lg bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/20 transition-all text-[10px] font-mono-tech flex items-center gap-2">
              <Plus size={12} /> Create New Note
            </button>
          </div>
        )}
      </div>

      {/* New Note Modal */}
      {showNewNote && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowNewNote(false)}>
          <div className="w-[500px] bg-stonic-card border border-cyan-400/30 rounded-2xl p-6 shadow-[0_0_40px_rgba(0,216,238,0.2)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white font-mono-tech tracking-wider">NEW NOTE</h3>
              <button onClick={() => setShowNewNote(false)} className="p-1 rounded-md hover:bg-stonic-hover text-stonic-textMuted"><X size={16} /></button>
            </div>
            <input
              type="text"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              placeholder="Note title"
              className="w-full mb-3 bg-stonic-surface/50 border border-stonic-b1 rounded-md px-3 py-2 text-[11px] text-stonic-text font-mono-tech focus:outline-none focus:border-cyan-400/40"
            />
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              placeholder="Note content..."
              rows={5}
              className="w-full mb-3 bg-stonic-surface/50 border border-stonic-b1 rounded-md p-3 text-[10px] text-stonic-text font-mono-tech resize-none focus:outline-none focus:border-cyan-400/40"
            />
            <button onClick={handleNewNote} className="w-full py-2 rounded-lg bg-cyan-400/20 border border-cyan-400/40 text-cyan-400 font-mono-tech text-[10px] font-bold tracking-wider hover:bg-cyan-400/30 transition-all">
              CREATE NOTE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesDashboard;
