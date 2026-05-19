import { describe, it, expect } from 'vitest';
import {
  InMemoryOverrideStore,
  InvalidOverrideError,
  type OverrideRecord,
} from '../src/index.js';

function rec(o: Partial<OverrideRecord> = {}): OverrideRecord {
  return {
    subjectKind: 'workspace',
    subjectId: 'ws-acme',
    plan: 'enterprise',
    setBy: 'admin@pryzm.com',
    setAt: Date.UTC(2026, 3, 1),
    reason: 'Q2 enterprise trial',
    ...o,
  };
}

describe('InMemoryOverrideStore.set', () => {
  it('upserts a valid record', () => {
    const s = new InMemoryOverrideStore();
    s.set(rec());
    expect(s.size()).toBe(1);
    expect(s.get('workspace', 'ws-acme')?.plan).toBe('enterprise');
  });

  it('replaces on second set (audit lives in API log, not store)', () => {
    const s = new InMemoryOverrideStore();
    s.set(rec({ plan: 'team' }));
    s.set(rec({ plan: 'business' }));
    expect(s.size()).toBe(1);
    expect(s.get('workspace', 'ws-acme')?.plan).toBe('business');
  });

  it('rejects empty subjectId', () => {
    const s = new InMemoryOverrideStore();
    expect(() => s.set(rec({ subjectId: '' }))).toThrow(InvalidOverrideError);
  });

  it('rejects empty reason', () => {
    const s = new InMemoryOverrideStore();
    expect(() => s.set(rec({ reason: '' }))).toThrow(InvalidOverrideError);
  });

  it('rejects bad plan enum', () => {
    const s = new InMemoryOverrideStore();
    expect(() => s.set(rec({ plan: 'galactic' as any }))).toThrow(InvalidOverrideError);
  });

  it('freezes stored record', () => {
    const s = new InMemoryOverrideStore();
    s.set(rec());
    const got = s.get('workspace', 'ws-acme')!;
    expect(() => { (got as any).plan = 'team'; }).toThrow(TypeError);
  });
});

describe('InMemoryOverrideStore.delete', () => {
  it('returns true on hit, false on miss', () => {
    const s = new InMemoryOverrideStore();
    s.set(rec());
    expect(s.delete('workspace', 'ws-acme')).toBe(true);
    expect(s.delete('workspace', 'ws-acme')).toBe(false);
    expect(s.size()).toBe(0);
  });
});

describe('InMemoryOverrideStore.list', () => {
  it('returns sorted by key (stable JSON output)', () => {
    const s = new InMemoryOverrideStore();
    s.set(rec({ subjectKind: 'user', subjectId: 'u-1' }));
    s.set(rec({ subjectKind: 'workspace', subjectId: 'ws-acme' }));
    s.set(rec({ subjectKind: 'user', subjectId: 'u-0' }));
    const list = s.list();
    expect(list.map((r) => `${r.subjectKind}:${r.subjectId}`)).toEqual([
      'user:u-0',
      'user:u-1',
      'workspace:ws-acme',
    ]);
  });
});

describe('seed', () => {
  it('hydrates from seed', () => {
    const s = new InMemoryOverrideStore({
      seed: [rec({ subjectId: 'a' }), rec({ subjectId: 'b' })],
    });
    expect(s.size()).toBe(2);
  });
});
