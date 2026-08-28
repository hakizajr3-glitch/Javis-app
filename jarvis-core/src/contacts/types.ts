export type ContactId = string;
export type GroupId = string;

export interface Contact {
  id: ContactId;
  name: string;
  email?: string;
  phone?: string;
  organization?: string;
  title?: string;
  avatar?: string;
  tags: string[];
  notes?: string;
  groupId?: GroupId;
  organizationId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  isFavorite: boolean;
}

export interface ContactGroup {
  id: GroupId;
  name: string;
  description?: string;
  color?: string;
  organizationId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactFilter {
  groupId?: GroupId;
  organizationId?: string;
  tags?: string[];
  searchQuery?: string;
  isFavorite?: boolean;
  createdBy?: string;
}

export interface ContactInteraction {
  id: string;
  contactId: ContactId;
  type: 'email' | 'call' | 'meeting' | 'message' | 'note';
  summary: string;
  timestamp: Date;
  createdBy: string;
}
