import { v4 as uuidv4 } from 'uuid';
import {
  SpeechTrigger,
  SpeechEvent,
  ProactiveConfig,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { usefulnessDetection } from './usefulnessDetection.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';
import { aiWorkforce } from '../cowork-v2/aiWorkforce.js';
import { organizationBuilder } from '../cowork-v2/organizationBuilder.js';

export class EventDrivenSpeech {
  private triggers: Map<string, SpeechTrigger> = new Map();
  private speechHistory: Map<string, SpeechEvent> = new Map();
  private config: ProactiveConfig = {
    enabled: true,
    minUsefulnessThreshold: 0.6,
    maxSpeechesPerHour: 10,
    quietHours: { start: '22:00', end: '08:00' },
    allowedEventTypes: [
      EventType.TASK_COMPLETED,
      EventType.TASK_FAILED,
      EventType.MISSION_COMPLETED,
      EventType.APPROVAL_REQUIRED,
      EventType.ARTIFACT_CREATED,
    ],
    organizationAware: true,
    agentCoordination: true,
  };

  constructor() {
    this.subscribeToEvents();
  }

  async createTrigger(trigger: Omit<SpeechTrigger, 'id' | 'createdAt'>): Promise<string> {
    const triggerId = uuidv4();
    const newTrigger: SpeechTrigger = {
      ...trigger,
      id: triggerId,
      createdAt: new Date(),
    };

    this.triggers.set(triggerId, newTrigger);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { action: 'trigger_created', triggerId },
      timestamp: new Date(),
      source: 'EventDrivenSpeech',
    });

    return triggerId;
  }

  async updateTrigger(triggerId: string, updates: Partial<SpeechTrigger>): Promise<void> {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) {
      throw new Error(`Trigger not found: ${triggerId}`);
    }

    const updatedTrigger: SpeechTrigger = {
      ...trigger,
      ...updates,
    };

    this.triggers.set(triggerId, updatedTrigger);
  }

  async deleteTrigger(triggerId: string): Promise<void> {
    this.triggers.delete(triggerId);
  }

  async getTrigger(triggerId: string): Promise<SpeechTrigger | null> {
    return this.triggers.get(triggerId) || null;
  }

  async listTriggers(filters?: { eventType?: string; enabled?: boolean }): Promise<SpeechTrigger[]> {
    let triggers = Array.from(this.triggers.values());

    if (filters) {
      if (filters.eventType) {
        triggers = triggers.filter(t => t.eventType === filters.eventType);
      }
      if (filters.enabled !== undefined) {
        triggers = triggers.filter(t => t.enabled === filters.enabled);
      }
    }

    return triggers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async enableTrigger(triggerId: string): Promise<void> {
    await this.updateTrigger(triggerId, { enabled: true });
  }

  async disableTrigger(triggerId: string): Promise<void> {
    await this.updateTrigger(triggerId, { enabled: false });
  }

  async speak(
    message: string,
    eventType: string,
    context: Record<string, any>,
    userId: string,
    organizationId?: string,
    agentId?: string,
    triggerId?: string,
    correlationId?: string
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Check if event type is allowed
    if (!this.config.allowedEventTypes.includes(eventType as EventType)) {
      return;
    }

    // Check if in quiet hours
    if (this.isInQuietHours()) {
      return;
    }

    // Check rate limit
    if (await this.isRateLimited(userId)) {
      return;
    }

    // Organization-aware filtering
    if (this.config.organizationAware && organizationId) {
      const org = await organizationBuilder.getOrganization(organizationId);
      if (!org) {
        console.warn(`[Proactive Speech] Organization not found: ${organizationId}`);
        return;
      }
    }

    // Agent coordination - check if agent should speak
    if (this.config.agentCoordination && agentId) {
      const agent = await aiWorkforce.getAgent(agentId);
      if (!agent || agent.status !== 'active') {
        console.warn(`[Proactive Speech] Agent not active: ${agentId}`);
        return;
      }
    }

    // Evaluate usefulness
    const { shouldSpeak, usefulness } = await usefulnessDetection.shouldSpeak(
      message,
      eventType,
      context,
      userId,
      this.config.minUsefulnessThreshold
    );

    if (!shouldSpeak) {
      // Log the decision for learning
      await this.logSpeechDecision(message, eventType, usefulness, false, userId);
      return;
    }

    // Speak the message
    await this.deliverSpeech(message, context);

    // Log the speech event
    const speechEvent: SpeechEvent = {
      id: uuidv4(),
      triggerId: triggerId || eventType,
      message,
      usefulness,
      spoken: true,
      timestamp: new Date(),
      userId,
      organizationId,
      agentId,
      correlationId,
    };

    this.speechHistory.set(speechEvent.id, speechEvent);

    // Update recent speeches in memory
    await this.updateRecentSpeeches(userId, message);

    // Log agent speech in AI workforce for coordination tracking
    if (this.config.agentCoordination && agentId) {
      await memoryEngine.setWorkingMemory(agentId, 'recent_speech', {
        message,
        timestamp: new Date(),
        eventType,
      });
    }

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: {
        action: 'speech_delivered',
        message,
        usefulness,
        organizationId,
        agentId,
        triggerId,
      },
      timestamp: new Date(),
      source: 'EventDrivenSpeech',
      correlationId: correlationId || userId,
    });
  }

  async getSpeechHistory(userId?: string, limit: number = 100): Promise<SpeechEvent[]> {
    let events = Array.from(this.speechHistory.values());

    if (userId) {
      events = events.filter(e => e.userId === userId);
    }

    return events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getStats(userId: string): Promise<{
    totalSpeeches: number;
    speechesLastHour: number;
    averageUsefulness: number;
    byEventType: Record<string, number>;
  }> {
    const history = await this.getSpeechHistory(userId);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const speechesLastHour = history.filter(e => e.timestamp >= oneHourAgo).length;
    const averageUsefulness = history.length > 0
      ? history.reduce((sum, e) => sum + e.usefulness.score, 0) / history.length
      : 0;

    const byEventType: Record<string, number> = {};
    for (const event of history) {
      byEventType[event.triggerId] = (byEventType[event.triggerId] || 0) + 1;
    }

    return {
      totalSpeeches: history.length,
      speechesLastHour,
      averageUsefulness,
      byEventType,
    };
  }

  async updateConfig(updates: Partial<ProactiveConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
  }

  getConfig(): ProactiveConfig {
    return { ...this.config };
  }

  private subscribeToEvents(): void {
    // Subscribe to all allowed event types
    for (const eventType of this.config.allowedEventTypes) {
      eventBus.subscribe(eventType as EventType, async (event) => {
        await this.handleEvent(event);
      });
    }
  }

  private async handleEvent(event: any): Promise<void> {
    // Avoid feedback loops from our own events
    if (event.source === 'EventDrivenSpeech') {
      return;
    }

    const payload = event.payload || {};

    // Find matching triggers
    const matchingTriggers = Array.from(this.triggers.values()).filter(
      t => t.enabled && t.eventType === event.type && this.matchesCondition(t.condition, event)
    );

    for (const trigger of matchingTriggers) {
      // Extract identifiers from event with sensible fallbacks
      const userId =
        payload.userId || payload.user_id || event.correlationId || 'default';
      const organizationId =
        payload.organizationId || payload.orgId || trigger.organizationId;
      const agentId =
        payload.agentId || payload.agent_id || trigger.agentId;
      const correlationId = event.correlationId || userId;

      const context = {
        ...payload,
        eventType: event.type,
        eventSource: event.source,
        timestamp: event.timestamp,
      };

      // Substitute template variables like {{context.missionId}} or {{event.type}}
      const message = this.substituteMessageTemplate(trigger.message, {
        context: payload,
        event,
        trigger,
      });

      await this.speak(
        message,
        trigger.eventType,
        context,
        userId,
        organizationId,
        agentId,
        trigger.id,
        correlationId
      );
    }
  }

  private substituteMessageTemplate(
    template: string,
    variables: {
      context: Record<string, any>;
      event: any;
      trigger: SpeechTrigger;
    }
  ): string {
    return template.replace(/\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$.]*)\s*\}\}/g, (
      _match,
      path: string
    ) => {
      const parts = path.split('.');
      const root = parts[0];
      const rest = parts.slice(1);

      let value: any;
      if (root === 'context') {
        value = variables.context;
      } else if (root === 'event') {
        value = variables.event;
      } else if (root === 'trigger') {
        value = variables.trigger;
      } else {
        return _match;
      }

      for (const part of rest) {
        if (value == null || typeof value !== 'object') {
          return _match;
        }
        value = value[part];
      }

      return value != null ? String(value) : _match;
    });
  }

  private matchesCondition(condition: string, event: any): boolean {
    if (!condition || condition.trim() === '') {
      return true;
    }

    try {
      const payload = event.payload || {};
      const context = { context: payload, event };
      return this.evaluateExpression(condition, context) === true;
    } catch (error) {
      console.error('[EventDrivenSpeech] Condition evaluation failed:', error);
      return false;
    }
  }

  // Safe expression evaluator for trigger conditions.
  // Supports: property access (context.status, event.type), literals,
  // comparison operators (===, !==, <, >, <=, >=), &&, ||, !, and parentheses.
  private evaluateExpression(expression: string, env: Record<string, any>): any {
    const tokens = this.tokenize(expression);
    const { result } = this.parseExpression(tokens, 0, env);
    return result;
  }

  private tokenize(expression: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    while (i < expression.length) {
      const ch = expression[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (/[a-zA-Z_$]/.test(ch)) {
        let j = i;
        while (j < expression.length && /[a-zA-Z0-9_$]/.test(expression[j])) {
          j++;
        }
        tokens.push(expression.slice(i, j));
        i = j;
        continue;
      }
      if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(expression[i + 1]))) {
        let j = i + (ch === '-' ? 1 : 0);
        while (j < expression.length && /[0-9.]/.test(expression[j])) {
          j++;
        }
        tokens.push(expression.slice(i, j));
        i = j;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const quote = ch;
        let j = i + 1;
        while (j < expression.length && expression[j] !== quote) {
          if (expression[j] === '\\') j++;
          j++;
        }
        tokens.push(expression.slice(i, j + 1));
        i = j + 1;
        continue;
      }
      if (ch === '(' || ch === ')') {
        tokens.push(ch);
        i++;
        continue;
      }
      // Multi-char operators first (longest match)
      const threeChar = expression.slice(i, i + 3);
      if (threeChar === '===' || threeChar === '!==') {
        tokens.push(threeChar);
        i += 3;
        continue;
      }
      const twoChar = expression.slice(i, i + 2);
      if (['&&', '||', '==', '!=', '<=', '>='].includes(twoChar)) {
        tokens.push(twoChar);
        i += 2;
        continue;
      }
      const oneChar = expression.slice(i, i + 1);
      if (['!', '<', '>', '+', '-', '*', '/', '.', '='].includes(oneChar)) {
        tokens.push(oneChar);
        i++;
        continue;
      }
      throw new Error(`Unexpected character '${ch}' at position ${i}`);
    }
    return tokens;
  }

  private parseExpression(
    tokens: string[],
    start: number,
    env: Record<string, any>
  ): { result: any; nextIndex: number } {
    return this.parseOr(tokens, start, env);
  }

  private parseOr(tokens: string[], start: number, env: Record<string, any>): { result: any; nextIndex: number } {
    let { result, nextIndex } = this.parseAnd(tokens, start, env);
    while (nextIndex < tokens.length && tokens[nextIndex] === '||') {
      const right = this.parseAnd(tokens, nextIndex + 1, env);
      result = result || right.result;
      nextIndex = right.nextIndex;
    }
    return { result, nextIndex };
  }

  private parseAnd(tokens: string[], start: number, env: Record<string, any>): { result: any; nextIndex: number } {
    let { result, nextIndex } = this.parseNot(tokens, start, env);
    while (nextIndex < tokens.length && tokens[nextIndex] === '&&') {
      const right = this.parseNot(tokens, nextIndex + 1, env);
      result = result && right.result;
      nextIndex = right.nextIndex;
    }
    return { result, nextIndex };
  }

  private parseNot(tokens: string[], start: number, env: Record<string, any>): { result: any; nextIndex: number } {
    if (start < tokens.length && tokens[start] === '!') {
      const { result, nextIndex } = this.parseNot(tokens, start + 1, env);
      return { result: !result, nextIndex };
    }
    return this.parseComparison(tokens, start, env);
  }

  private parseComparison(
    tokens: string[],
    start: number,
    env: Record<string, any>
  ): { result: any; nextIndex: number } {
    let { result, nextIndex } = this.parsePrimary(tokens, start, env);
    const operators = ['===', '!==', '==', '!=', '<=', '>=', '<', '>'];
    if (nextIndex < tokens.length && operators.includes(tokens[nextIndex])) {
      const op = tokens[nextIndex];
      const right = this.parsePrimary(tokens, nextIndex + 1, env);
      switch (op) {
        case '===':
        case '==':
          result = result == right.result;
          break;
        case '!==':
        case '!=':
          result = result != right.result;
          break;
        case '<':
          result = result < right.result;
          break;
        case '>':
          result = result > right.result;
          break;
        case '<=':
          result = result <= right.result;
          break;
        case '>=':
          result = result >= right.result;
          break;
      }
      nextIndex = right.nextIndex;
    }
    return { result, nextIndex };
  }

  private parsePrimary(
    tokens: string[],
    start: number,
    env: Record<string, any>
  ): { result: any; nextIndex: number } {
    if (start >= tokens.length) {
      throw new Error('Unexpected end of expression');
    }
    const token = tokens[start];

    if (token === '(') {
      const { result, nextIndex } = this.parseExpression(tokens, start + 1, env);
      if (nextIndex >= tokens.length || tokens[nextIndex] !== ')') {
        throw new Error('Expected closing parenthesis');
      }
      return { result, nextIndex: nextIndex + 1 };
    }

    // Literals
    if (/^true$/i.test(token)) return { result: true, nextIndex: start + 1 };
    if (/^false$/i.test(token)) return { result: false, nextIndex: start + 1 };
    if (/^null$/i.test(token)) return { result: null, nextIndex: start + 1 };
    if (/^\d+(\.\d+)?$/.test(token)) return { result: parseFloat(token), nextIndex: start + 1 };
    if (/^[-]\d+(\.\d+)?$/.test(token)) return { result: parseFloat(token), nextIndex: start + 1 };
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      return { result: token.slice(1, -1), nextIndex: start + 1 };
    }

    // Identifier path: context.foo.bar or event.type
    if (/[a-zA-Z_$]/.test(token[0])) {
      const path = [token];
      let i = start + 1;
      while (i + 1 < tokens.length && tokens[i] === '.') {
        path.push(tokens[i + 1]);
        i += 2;
      }
      let value = env[path[0]];
      for (let j = 1; j < path.length; j++) {
        if (value == null || typeof value !== 'object') {
          value = undefined;
          break;
        }
        value = value[path[j]];
      }
      return { result: value, nextIndex: i };
    }

    throw new Error(`Unexpected token '${token}' at position ${start}`);
  }

  private isInQuietHours(): boolean {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    return currentTime >= this.config.quietHours.start || currentTime <= this.config.quietHours.end;
  }

  private async isRateLimited(userId: string): Promise<boolean> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentSpeeches = await this.getSpeechHistory(userId);
    const speechesLastHour = recentSpeeches.filter(e => e.timestamp >= oneHourAgo).length;

    return speechesLastHour >= this.config.maxSpeechesPerHour;
  }

  private async deliverSpeech(message: string, _context: Record<string, any>): Promise<void> {
    // In production, this would integrate with the TTS system
    console.log(`[Proactive Speech] ${message}`);
  }

  private async logSpeechDecision(
    message: string,
    eventType: string,
    usefulness: any,
    spoken: boolean,
    userId: string
  ): Promise<void> {
    const decision = {
      message,
      eventType,
      usefulness,
      spoken,
      timestamp: new Date(),
    };

    await memoryEngine.setPersonalMemory(userId, `speech_decision_${Date.now()}`, decision);
  }

  private async updateRecentSpeeches(userId: string, message: string): Promise<void> {
    const recentSpeeches = await memoryEngine.getPersonalMemory(userId, 'recent_speeches') || [];
    const updated = [
      ...(Array.isArray(recentSpeeches) ? recentSpeeches : []),
      { message, timestamp: new Date() },
    ].slice(-10); // Keep last 10

    await memoryEngine.setPersonalMemory(userId, 'recent_speeches', updated);
  }
}

// Singleton instance
export const eventDrivenSpeech = new EventDrivenSpeech();
