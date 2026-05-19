// Spec: parseClientMessage rejects malformed frames so a single bad
// client cannot crash the server.

import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/protocol/messages.js';

describe('parseClientMessage', () => {
  it('parses a valid project.subscribe', () => {
    const msg = parseClientMessage(
      JSON.stringify({ type: 'project.subscribe', projectId: 'p1', fromSeq: 5 }),
    );
    expect(msg).toEqual({ type: 'project.subscribe', projectId: 'p1', fromSeq: 5 });
  });

  it('parses project.subscribe without fromSeq', () => {
    const msg = parseClientMessage(JSON.stringify({ type: 'project.subscribe', projectId: 'p1' }));
    expect(msg).toEqual({ type: 'project.subscribe', projectId: 'p1' });
  });

  it('parses a valid event.append', () => {
    const msg = parseClientMessage(
      JSON.stringify({
        type: 'event.append',
        payload: {
          projectId: 'p1',
          clientId: 'c1',
          event: { id: 'e1', type: 'wall.create', actorId: 'u1', payload: { foo: 1 } },
        },
      }),
    );
    expect(msg?.type).toBe('event.append');
    if (msg?.type === 'event.append') {
      expect(msg.payload.event.payload).toEqual({ foo: 1 });
    }
  });

  it('parses a valid events.load', () => {
    const msg = parseClientMessage(
      JSON.stringify({
        type: 'events.load',
        payload: { projectId: 'p1', fromSeq: 0, limit: 100, cursor: 'c1' },
      }),
    );
    expect(msg?.type).toBe('events.load');
    if (msg?.type === 'events.load') {
      expect(msg.payload.limit).toBe(100);
      expect(msg.payload.cursor).toBe('c1');
    }
  });

  it.each([
    ['not JSON at all', 'not json'],
    ['empty string', ''],
    ['null', 'null'],
    ['array root', '[1,2,3]'],
    ['missing type', '{}'],
    ['unknown type', '{"type":"event.unknown"}'],
    ['subscribe missing projectId', '{"type":"project.subscribe"}'],
    ['subscribe with non-string projectId', '{"type":"project.subscribe","projectId":42}'],
    ['subscribe with fromSeq=NaN', '{"type":"project.subscribe","projectId":"p","fromSeq":null}'],
    ['append missing event', '{"type":"event.append","payload":{"projectId":"p","clientId":"c"}}'],
    ['append with event missing actorId',
      '{"type":"event.append","payload":{"projectId":"p","clientId":"c","event":{"id":"e","type":"t"}}}'],
    ['load missing fromSeq', '{"type":"events.load","payload":{"projectId":"p"}}'],
  ])('returns null for %s', (_label, raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });
});
