import { describe, it, expect } from 'vitest';
import {
  InMemoryAiSpendStore,
  DuplicateSpendEntryError,
  InvalidSpendEntryError,
  type AiSpendEntry,
} from '../src/index.js';

function make(overrides: Partial<AiSpendEntry> = {}): AiSpendEntry {
  return {
    id: 'e1',
    workspaceId: 'ws-acme',
    projectId: 'p-1',
    actorId: 'u-alice',
    actorKind: 'user',
    surface: 'editor',
    workflowId: 'plan.critique',
    model: 'anthropic.claude-sonnet-4',
    ts: Date.UTC(2026, 3, 1, 12, 0, 0),
    costUsd: 0.0123,
    ...overrides,
  };
}

describe('InMemoryAiSpendStore.append', () => {
  it('accepts a valid entry and tracks size', () => {
    const s = new InMemoryAiSpendStore();
    s.append(make());
    expect(s.size()).toBe(1);
  });

  it('rejects an invalid entry (negative cost)', () => {
    const s = new InMemoryAiSpendStore();
    expect(() => s.append(make({ costUsd: -1 }))).toThrow(InvalidSpendEntryError);
    expect(s.size()).toBe(0);
  });

  it('rejects an invalid entry (empty workspaceId)', () => {
    const s = new InMemoryAiSpendStore();
    expect(() => s.append(make({ workspaceId: '' }))).toThrow(InvalidSpendEntryError);
  });

  it('rejects an invalid entry (non-finite cost)', () => {
    const s = new InMemoryAiSpendStore();
    expect(() => s.append(make({ costUsd: Number.POSITIVE_INFINITY }))).toThrow(
      InvalidSpendEntryError,
    );
  });

  it('rejects duplicate ids loudly', () => {
    const s = new InMemoryAiSpendStore();
    s.append(make({ id: 'dup' }));
    expect(() => s.append(make({ id: 'dup' }))).toThrow(DuplicateSpendEntryError);
    expect(s.size()).toBe(1);
  });

  it('freezes appended entries — mutations are no-ops', () => {
    const s = new InMemoryAiSpendStore();
    s.append(make({ id: 'frz' }));
    const got = s.query({ workspaceId: 'ws-acme' })[0]!;
    expect(() => {
      (got as any).costUsd = 999;
    }).toThrow(TypeError);
  });
});

describe('InMemoryAiSpendStore.appendBatch', () => {
  it('all-or-nothing on validation failure', () => {
    const s = new InMemoryAiSpendStore();
    const ok = make({ id: 'a' });
    const bad = make({ id: 'b', costUsd: -5 });
    expect(() => s.appendBatch([ok, bad])).toThrow(InvalidSpendEntryError);
    expect(s.size()).toBe(0);
  });

  it('all-or-nothing on duplicate-id collision', () => {
    const s = new InMemoryAiSpendStore();
    s.append(make({ id: 'x' }));
    const ok = make({ id: 'y' });
    const dup = make({ id: 'x' });
    expect(() => s.appendBatch([ok, dup])).toThrow(DuplicateSpendEntryError);
    expect(s.size()).toBe(1); // only the original
  });

  it('commits all on success', () => {
    const s = new InMemoryAiSpendStore();
    s.appendBatch([make({ id: 'a' }), make({ id: 'b' }), make({ id: 'c' })]);
    expect(s.size()).toBe(3);
  });
});

describe('InMemoryAiSpendStore.query', () => {
  it('filters by workspaceId', () => {
    const s = new InMemoryAiSpendStore();
    s.append(make({ id: 'a', workspaceId: 'ws-1' }));
    s.append(make({ id: 'b', workspaceId: 'ws-2' }));
    expect(s.query({ workspaceId: 'ws-1' })).toHaveLength(1);
    expect(s.query({ workspaceId: 'ws-1' })[0]!.id).toBe('a');
  });

  it('filters by projectId', () => {
    const s = new InMemoryAiSpendStore();
    s.append(make({ id: 'a', projectId: 'p-1' }));
    s.append(make({ id: 'b', projectId: 'p-2' }));
    expect(s.query({ projectId: 'p-2' })).toHaveLength(1);
  });

  it('filters by ts range [from, to)', () => {
    const s = new InMemoryAiSpendStore();
    s.append(make({ id: 'a', ts: 100 }));
    s.append(make({ id: 'b', ts: 200 }));
    s.append(make({ id: 'c', ts: 300 }));
    expect(s.query({ fromTs: 150, toTs: 250 })).toHaveLength(1);
    expect(s.query({ fromTs: 200, toTs: 300 })).toHaveLength(1); // [200,300) — excludes 300
    expect(s.query({ fromTs: 100 })).toHaveLength(3);
    expect(s.query({ toTs: 200 })).toHaveLength(1); // 100 only
  });

  it('seeds work', () => {
    const s = new InMemoryAiSpendStore({
      seed: [make({ id: 'a' }), make({ id: 'b' })],
    });
    expect(s.size()).toBe(2);
  });
});
