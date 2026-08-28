import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, Mail, Phone, Building2, Star, MessageSquare, Calendar, ChevronRight, X } from 'lucide-react';
import { coreBridge } from '../../coreBridge';

interface ContactItem {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  organization?: string;
  title?: string;
  tags: string[];
  isFavorite: boolean;
  lastInteraction?: Date;
  notes?: string;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

const groups = ['All Contacts', 'Work', 'Personal', 'Investors', 'Collaborators', 'Clients'];

export const ContactsDashboard: React.FC = () => {
  const [contacts, setContacts] = useState<ContactItem[]>(() => coreBridge.getContacts());
  useEffect(() => { coreBridge.saveContacts(contacts); }, [contacts]);
  const [selectedContact, setSelectedContact] = useState<ContactItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState('All Contacts');
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '', organization: '', title: '', tags: '' });

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || (c.email?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || (c.organization?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const toggleFavorite = (id: string) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, isFavorite: !c.isFavorite } : c));
  };

  const handleAddContact = () => {
    if (!newContact.name.trim()) return;
    const contact: ContactItem = {
      id: generateId(),
      name: newContact.name,
      email: newContact.email || undefined,
      phone: newContact.phone || undefined,
      organization: newContact.organization || undefined,
      title: newContact.title || undefined,
      tags: newContact.tags.split(',').map(t => t.trim()).filter(Boolean),
      isFavorite: false,
    };
    setContacts(prev => [contact, ...prev]);
    setNewContact({ name: '', email: '', phone: '', organization: '', title: '', tags: '' });
    setShowNewContact(false);
  };

  return (
    <div className="flex-1 flex gap-4 min-h-0">
      <div className="w-[200px] shrink-0 flex flex-col gap-3">
        <button onClick={() => setShowNewContact(true)} className="w-full px-3 py-2.5 rounded-lg bg-blue-400/10 border border-blue-400/40 text-blue-400 hover:bg-blue-400/20 transition-all flex items-center gap-2 justify-center font-mono-tech text-[10px] font-bold tracking-wider">
          <Plus size={14} /> ADD CONTACT
        </button>
        <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-2">
          <span className="text-[8px] text-stonic-textDim font-mono-tech tracking-wider px-2 py-1">GROUPS</span>
          {groups.map(g => (
            <button key={g} onClick={() => { setActiveGroup(g); setSelectedContact(null); }} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px] transition-all font-mono-tech ${
              activeGroup === g ? 'bg-blue-400/10 text-blue-400' : 'text-stonic-textMuted hover:text-stonic-text hover:bg-stonic-hover/30'
            }`}>
              <Users size={12} /> <span>{g}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="w-[300px] shrink-0 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col min-h-0">
        <div className="p-2.5 border-b border-stonic-b1">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stonic-textDim" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search contacts..." className="w-full pl-7 pr-3 py-1.5 rounded-md bg-stonic-surface/50 border border-stonic-b1 text-[10px] text-stonic-text font-mono-tech placeholder:text-stonic-textDim focus:outline-none focus:border-blue-400/40" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-stonic-textDim gap-2">
              <Users size={32} className="opacity-20" />
              <span className="text-[10px] font-mono-tech">No contacts found</span>
            </div>
          ) : (
            filteredContacts.map(contact => (
              <button
                key={contact.id}
                onClick={() => setSelectedContact(contact)}
                className={`w-full text-left p-3 border-b border-stonic-b1/30 hover:bg-stonic-hover/20 transition-colors flex items-start gap-3 ${
                  selectedContact?.id === contact.id ? 'bg-blue-400/5 border-l-2 border-l-blue-400' : ''
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400/20 to-purple-400/20 border border-blue-400/30 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-blue-400 font-mono-tech">{contact.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-stonic-text font-mono-tech truncate">{contact.name}</span>
                    {contact.isFavorite && <Star size={10} className="text-amber-400 fill-amber-400 shrink-0" />}
                  </div>
                  {contact.title && <p className="text-[8px] text-stonic-textMuted truncate">{contact.title}{contact.organization ? ` \u00b7 ${contact.organization}` : ''}</p>}
                  {contact.email && <p className="text-[8px] text-stonic-textDim truncate">{contact.email}</p>}
                </div>
                <ChevronRight size={12} className="text-stonic-textDim mt-1" />
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col min-h-0">
        {selectedContact ? (
          <>
            <div className="p-4 border-b border-stonic-b1">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400/20 to-purple-400/20 border-2 border-blue-400/40 flex items-center justify-center shrink-0">
                  <span className="text-xl font-bold text-blue-400 font-mono-tech">{selectedContact.name.charAt(0)}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white font-mono-tech">{selectedContact.name}</h3>
                    <button onClick={() => toggleFavorite(selectedContact.id)}>
                      <Star size={16} className={selectedContact.isFavorite ? 'text-amber-400 fill-amber-400' : 'text-stonic-textDim'} />
                    </button>
                  </div>
                  {selectedContact.title && <p className="text-[10px] text-stonic-textMuted">{selectedContact.title}{selectedContact.organization ? ` at ${selectedContact.organization}` : ''}</p>}
                  <div className="flex gap-1 mt-2">
                    {selectedContact.tags.map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded bg-blue-400/5 border border-blue-400/20 text-[7px] text-blue-400 font-mono-tech">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
              {selectedContact.email && (
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-stonic-surface/50 border border-stonic-b1">
                  <Mail size={14} className="text-blue-400" />
                  <div>
                    <span className="text-[8px] text-stonic-textDim font-mono-tech">EMAIL</span>
                    <p className="text-[10px] text-stonic-text font-mono-tech">{selectedContact.email}</p>
                  </div>
                </div>
              )}
              {selectedContact.phone && (
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-stonic-surface/50 border border-stonic-b1">
                  <Phone size={14} className="text-green-400" />
                  <div>
                    <span className="text-[8px] text-stonic-textDim font-mono-tech">PHONE</span>
                    <p className="text-[10px] text-stonic-text font-mono-tech">{selectedContact.phone}</p>
                  </div>
                </div>
              )}
              {selectedContact.organization && (
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-stonic-surface/50 border border-stonic-b1">
                  <Building2 size={14} className="text-purple-400" />
                  <div>
                    <span className="text-[8px] text-stonic-textDim font-mono-tech">ORGANIZATION</span>
                    <p className="text-[10px] text-stonic-text font-mono-tech">{selectedContact.organization}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-stonic-surface/50 border border-stonic-b1">
                <MessageSquare size={14} className="text-amber-400" />
                <div>
                  <span className="text-[8px] text-stonic-textDim font-mono-tech">NOTES</span>
                  <p className="text-[10px] text-stonic-text font-mono-tech">{selectedContact.notes || 'No notes yet'}</p>
                </div>
              </div>
            </div>
            <div className="p-3 border-t border-stonic-b1 flex gap-2">
              <button className="flex-1 py-2 rounded-lg bg-blue-400/10 border border-blue-400/30 text-blue-400 text-[9px] font-mono-tech font-bold hover:bg-blue-400/20 transition-all flex items-center justify-center gap-1.5">
                <Mail size={12} /> SEND EMAIL
              </button>
              <button className="flex-1 py-2 rounded-lg bg-green-400/10 border border-green-400/30 text-green-400 text-[9px] font-mono-tech font-bold hover:bg-green-400/20 transition-all flex items-center justify-center gap-1.5">
                <Calendar size={12} /> SCHEDULE
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-stonic-textDim gap-3">
            <Users size={48} className="opacity-10" />
            <span className="text-[11px] font-mono-tech">Select a contact to view details</span>
            <button onClick={() => setShowNewContact(true)} className="px-4 py-2 rounded-lg bg-blue-400/10 border border-blue-400/30 text-blue-400 hover:bg-blue-400/20 transition-all text-[10px] font-mono-tech flex items-center gap-2">
              <Plus size={12} /> Add New Contact
            </button>
          </div>
        )}
      </div>

      {showNewContact && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowNewContact(false)}>
          <div className="w-[480px] bg-stonic-card border border-blue-400/30 rounded-2xl p-6 shadow-[0_0_40px_rgba(59,130,246,0.2)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white font-mono-tech tracking-wider">NEW CONTACT</h3>
              <button onClick={() => setShowNewContact(false)} className="p-1 rounded-md hover:bg-stonic-hover text-stonic-textMuted"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <input type="text" value={newContact.name} onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))} placeholder="Full name" className="w-full bg-stonic-surface/50 border border-stonic-b1 rounded-md px-3 py-2 text-[10px] text-stonic-text font-mono-tech focus:outline-none focus:border-blue-400/40" />
              <input type="text" value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="w-full bg-stonic-surface/50 border border-stonic-b1 rounded-md px-3 py-2 text-[10px] text-stonic-text font-mono-tech focus:outline-none focus:border-blue-400/40" />
              <input type="text" value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className="w-full bg-stonic-surface/50 border border-stonic-b1 rounded-md px-3 py-2 text-[10px] text-stonic-text font-mono-tech focus:outline-none focus:border-blue-400/40" />
              <div className="flex gap-3">
                <input type="text" value={newContact.organization} onChange={e => setNewContact(p => ({ ...p, organization: e.target.value }))} placeholder="Organization" className="flex-1 bg-stonic-surface/50 border border-stonic-b1 rounded-md px-3 py-2 text-[10px] text-stonic-text font-mono-tech focus:outline-none focus:border-blue-400/40" />
                <input type="text" value={newContact.title} onChange={e => setNewContact(p => ({ ...p, title: e.target.value }))} placeholder="Title" className="flex-1 bg-stonic-surface/50 border border-stonic-b1 rounded-md px-3 py-2 text-[10px] text-stonic-text font-mono-tech focus:outline-none focus:border-blue-400/40" />
              </div>
              <input type="text" value={newContact.tags} onChange={e => setNewContact(p => ({ ...p, tags: e.target.value }))} placeholder="Tags (comma separated)" className="w-full bg-stonic-surface/50 border border-stonic-b1 rounded-md px-3 py-2 text-[10px] text-stonic-text font-mono-tech focus:outline-none focus:border-blue-400/40" />
            </div>
            <button onClick={handleAddContact} className="w-full mt-4 py-2 rounded-lg bg-blue-400/20 border border-blue-400/40 text-blue-400 font-mono-tech text-[10px] font-bold tracking-wider hover:bg-blue-400/30 transition-all">ADD CONTACT</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactsDashboard;
