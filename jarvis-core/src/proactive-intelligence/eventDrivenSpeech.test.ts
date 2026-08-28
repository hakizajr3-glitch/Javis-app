import { describe, it, expect, beforeEach } from 'vitest';
import { EventDrivenSpeech } from './eventDrivenSpeech.js';

describe('EventDrivenSpeech condition evaluator', () => {
  let speech: EventDrivenSpeech;

  beforeEach(() => {
    speech = new EventDrivenSpeech();
  });

  it('matches simple equality condition', () => {
    const matches = (speech as any).matchesCondition(
      "context.status === 'failed'",
      { payload: { status: 'failed' } }
    );
    expect(matches).toBe(true);
  });

  it('matches numeric comparison', () => {
    const matches = (speech as any).matchesCondition(
      'context.priority > 5',
      { payload: { priority: 7 } }
    );
    expect(matches).toBe(true);
  });

  it('supports logical AND/OR', () => {
    const matches = (speech as any).matchesCondition(
      "context.status === 'failed' && context.priority > 5",
      { payload: { status: 'failed', priority: 7 } }
    );
    expect(matches).toBe(true);
  });

  it('supports negation', () => {
    const matches = (speech as any).matchesCondition(
      "!(context.status === 'success')",
      { payload: { status: 'failed' } }
    );
    expect(matches).toBe(true);
  });

  it('allows access to event metadata', () => {
    const matches = (speech as any).matchesCondition(
      "event.type === 'TASK_FAILED'",
      { type: 'TASK_FAILED', payload: {} }
    );
    expect(matches).toBe(true);
  });

  it('returns false on unsafe expression', () => {
    const matches = (speech as any).matchesCondition(
      "process.exit()",
      { payload: {} }
    );
    expect(matches).toBe(false);
  });

  it('substitutes message templates from context', () => {
    const message = (speech as any).substituteMessageTemplate(
      'Task {{context.taskId}} failed: {{context.reason}}',
      {
        context: { taskId: '42', reason: 'timeout' },
        event: { type: 'TASK_FAILED' },
        trigger: { id: 't1', message: '' } as any,
      }
    );
    expect(message).toBe('Task 42 failed: timeout');
  });

  it('leaves unknown template variables unchanged', () => {
    const message = (speech as any).substituteMessageTemplate(
      'Hello {{unknown.foo}}',
      {
        context: {},
        event: {},
        trigger: { id: 't1', message: '' } as any,
      }
    );
    expect(message).toBe('Hello {{unknown.foo}}');
  });
});
