import { Message } from '../services/nim.js';

export interface Session {
  id: string;
  messages: Message[];
  createdAt: number;
  lastActivity: number;
  state: SessionState;
  deepgramSession?: unknown;
  currentTranscript?: string;
}

export type SessionState = 
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private maxSessions: number;

  constructor(maxSessions: number = 50) {
    this.maxSessions = maxSessions;
  }

  createSession(): string {
    const id = this.generateSessionId();
    
    const session: Session = {
      id,
      messages: [],
      createdAt: Date.now(),
      lastActivity: Date.now(),
      state: 'idle',
    };

    this.sessions.set(id, session);
    console.log(`[Session] Created: ${id} (Total: ${this.sessions.size})`);
    
    return id;
  }

  getSession(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session;
  }

  deleteSession(id: string): void {
    this.sessions.delete(id);
    console.log(`[Session] Deleted: ${id} (Remaining: ${this.sessions.size})`);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  updateState(id: string, state: SessionState): void {
    const session = this.sessions.get(id);
    if (session) {
      session.state = state;
      session.lastActivity = Date.now();
    }
  }

  addMessage(id: string, message: Message): void {
    const session = this.sessions.get(id);
    if (session) {
      session.messages.push(message);
      session.lastActivity = Date.now();
      
      if (session.messages.length > 100) {
        session.messages = session.messages.slice(-50);
      }
    }
  }

  getMessages(id: string): Message[] {
    const session = this.sessions.get(id);
    return session?.messages || [];
  }

  clearMessages(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.messages = [];
    }
  }

  private generateSessionId(): string {
    return `jarvis_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  isFull(): boolean {
    return this.sessions.size >= this.maxSessions;
  }
}