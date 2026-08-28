import { v4 as uuidv4 } from 'uuid';
import {
  ContactId,
  GroupId,
  Contact,
  ContactGroup,
  ContactFilter,
  ContactInteraction,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';
import { organizationBuilder } from '../cowork-v2/organizationBuilder.js';

export class ContactsManager {
  private contacts: Map<ContactId, Contact> = new Map();
  private groups: Map<GroupId, ContactGroup> = new Map();
  private interactions: Map<string, ContactInteraction> = new Map();

  async createContact(
    name: string,
    createdBy: string,
    email?: string,
    phone?: string,
    organization?: string,
    title?: string,
    avatar?: string,
    groupId?: GroupId,
    organizationId?: string,
    tags: string[] = [],
    notes?: string
  ): Promise<ContactId> {
    const contactId = uuidv4() as ContactId;

    // Verify organization exists if provided
    if (organizationId) {
      const org = await organizationBuilder.getOrganization(organizationId);
      if (!org) {
        throw new Error(`Organization not found: ${organizationId}`);
      }
    }

    const contact: Contact = {
      id: contactId,
      name,
      email,
      phone,
      organization,
      title,
      avatar,
      tags,
      notes,
      groupId,
      organizationId,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
      isFavorite: false,
    };

    this.contacts.set(contactId, contact);

    await memoryEngine.setWorkingMemory(contactId, 'contact', contact);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.ARTIFACT_CREATED,
      payload: { contactId, name, organizationId },
      timestamp: new Date(),
      source: 'ContactsManager',
    });

    return contactId;
  }

  async updateContact(contactId: ContactId, updates: Partial<Omit<Contact, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    const contact = this.contacts.get(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    const updatedContact: Contact = {
      ...contact,
      ...updates,
      updatedAt: new Date(),
    };

    this.contacts.set(contactId, updatedContact);

    await memoryEngine.setWorkingMemory(contactId, 'contact', updatedContact);
  }

  async deleteContact(contactId: ContactId): Promise<void> {
    this.contacts.delete(contactId);
    await memoryEngine.deleteWorkingMemory(contactId, 'contact');
  }

  async getContact(contactId: ContactId): Promise<Contact | null> {
    return this.contacts.get(contactId) || null;
  }

  async listContacts(filter?: ContactFilter): Promise<Contact[]> {
    let contacts = Array.from(this.contacts.values());

    if (filter) {
      if (filter.groupId) {
        contacts = contacts.filter(c => c.groupId === filter.groupId);
      }
      if (filter.organizationId) {
        contacts = contacts.filter(c => c.organizationId === filter.organizationId);
      }
      if (filter.tags && filter.tags.length > 0) {
        contacts = contacts.filter(c => filter.tags!.some(tag => c.tags.includes(tag)));
      }
      if (filter.isFavorite !== undefined) {
        contacts = contacts.filter(c => c.isFavorite === filter.isFavorite);
      }
      if (filter.createdBy) {
        contacts = contacts.filter(c => c.createdBy === filter.createdBy);
      }
      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase();
        contacts = contacts.filter(c =>
          c.name.toLowerCase().includes(query) ||
          c.email?.toLowerCase().includes(query) ||
          c.phone?.includes(query) ||
          c.organization?.toLowerCase().includes(query) ||
          c.notes?.toLowerCase().includes(query)
        );
      }
    }

    return contacts.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async toggleFavorite(contactId: ContactId): Promise<void> {
    const contact = this.contacts.get(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    await this.updateContact(contactId, { isFavorite: !contact.isFavorite });
  }

  async createGroup(
    name: string,
    createdBy: string,
    description?: string,
    color?: string,
    organizationId?: string
  ): Promise<GroupId> {
    const groupId = uuidv4() as GroupId;

    // Verify organization exists if provided
    if (organizationId) {
      const org = await organizationBuilder.getOrganization(organizationId);
      if (!org) {
        throw new Error(`Organization not found: ${organizationId}`);
      }
    }

    const group: ContactGroup = {
      id: groupId,
      name,
      description,
      color,
      organizationId,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.groups.set(groupId, group);

    await memoryEngine.setWorkingMemory(groupId, 'contact_group', group);

    return groupId;
  }

  async updateGroup(groupId: GroupId, updates: Partial<Omit<ContactGroup, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    const updatedGroup: ContactGroup = {
      ...group,
      ...updates,
      updatedAt: new Date(),
    };

    this.groups.set(groupId, updatedGroup);
    await memoryEngine.setWorkingMemory(groupId, 'contact_group', updatedGroup);
  }

  async deleteGroup(groupId: GroupId): Promise<void> {
    this.groups.delete(groupId);
    await memoryEngine.deleteWorkingMemory(groupId, 'contact_group');
  }

  async getGroup(groupId: GroupId): Promise<ContactGroup | null> {
    return this.groups.get(groupId) || null;
  }

  async listGroups(organizationId?: string, createdBy?: string): Promise<ContactGroup[]> {
    let groups = Array.from(this.groups.values());

    if (organizationId) {
      groups = groups.filter(g => g.organizationId === organizationId);
    }
    if (createdBy) {
      groups = groups.filter(g => g.createdBy === createdBy);
    }

    return groups.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async addContactToGroup(contactId: ContactId, groupId: GroupId): Promise<void> {
    const contact = this.contacts.get(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    await this.updateContact(contactId, { groupId });
  }

  async removeContactFromGroup(contactId: ContactId): Promise<void> {
    const contact = this.contacts.get(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    await this.updateContact(contactId, { groupId: undefined });
  }

  async getContactsByGroup(groupId: GroupId): Promise<Contact[]> {
    return this.listContacts({ groupId });
  }

  async addInteraction(
    contactId: ContactId,
    type: ContactInteraction['type'],
    summary: string,
    createdBy: string
  ): Promise<string> {
    const contact = this.contacts.get(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    const interactionId = uuidv4();
    const interaction: ContactInteraction = {
      id: interactionId,
      contactId,
      type,
      summary,
      timestamp: new Date(),
      createdBy,
    };

    this.interactions.set(interactionId, interaction);

    await memoryEngine.setWorkingMemory(interactionId, 'contact_interaction', interaction);

    // Update contact's updated timestamp
    await this.updateContact(contactId, {});

    return interactionId;
  }

  async getInteractions(contactId: ContactId, limit: number = 50): Promise<ContactInteraction[]> {
    const interactions = Array.from(this.interactions.values())
      .filter(i => i.contactId === contactId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);

    return interactions;
  }

  async searchContacts(query: string, organizationId?: string): Promise<Contact[]> {
    const searchQuery = query.toLowerCase();
    let contacts = Array.from(this.contacts.values());

    if (organizationId) {
      contacts = contacts.filter(c => c.organizationId === organizationId);
    }

    return contacts.filter(c =>
      c.name.toLowerCase().includes(searchQuery) ||
      c.email?.toLowerCase().includes(searchQuery) ||
      c.phone?.includes(searchQuery) ||
      c.organization?.toLowerCase().includes(searchQuery) ||
      c.title?.toLowerCase().includes(searchQuery) ||
      c.tags.some(tag => tag.toLowerCase().includes(searchQuery))
    );
  }

  exportState(): Record<string, any> {
    return {
      contacts: Array.from(this.contacts.entries()),
      groups: Array.from(this.groups.entries()),
      interactions: Array.from(this.interactions.entries()),
    };
  }

  importState(state: Record<string, any>): void {
    this.contacts = new Map(state.contacts || []);
    this.groups = new Map(state.groups || []);
    this.interactions = new Map(state.interactions || []);
  }
}

// Singleton instance
export const contactsManager = new ContactsManager();
