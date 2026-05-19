import { describe, it, expect } from 'vitest';
import {
  aggregateByWorkspace,
  aggregateByProject,
  aggregateByActor,
  aggregateBySurface,
  aggregateByDay,
  aggregateByModel,
  aggregateByWorkflow,
  computeTotals,
  utcDayKey,
  type AiSpendEntry,
} from '../src/index.js';

function make(o: Partial<AiSpendEntry> = {}): AiSpendEntry {
  return {
    id: o.id ?? Math.random().toString(36).slice(2),
    workspaceId: 'ws-acme',
    projectId: 'p-1',
    actorId: 'u-alice',
    actorKind: 'user',
    surface: 'editor',
    workflowId: 'plan.critique',
    model: 'anthropic.claude-sonnet-4',
    ts: Date.UTC(2026, 3, 1, 12, 0, 0),
    costUsd: 0.01,
    ...o,
  };
}

describe('utcDayKey', () => {
  it('formats as YYYY-MM-DD UTC', () => {
    expect(utcDayKey(Date.UTC(2026, 3, 7, 23, 59, 59))).toBe('2026-04-07');
    expect(utcDayKey(Date.UTC(2026, 3, 8, 0, 0, 0))).toBe('2026-04-08');
  });

  it('does NOT use local timezone (regression — UTC days are required by SPEC-28 §9.2)', () => {
    // Pick a moment that is on different calendar days in UTC vs e.g. UTC-12.
    const ts = Date.UTC(2026, 5, 15, 1, 0, 0); // 2026-06-15 01:00 UTC
    expect(utcDayKey(ts)).toBe('2026-06-15');
  });
});

describe('aggregateByWorkspace', () => {
  it('groups + sums correctly', () => {
    const rows = aggregateByWorkspace([
      make({ workspaceId: 'a', costUsd: 0.10 }),
      make({ workspaceId: 'a', costUsd: 0.20 }),
      make({ workspaceId: 'b', costUsd: 0.05 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ key: 'a', count: 2, totalCostUsd: 0.30 });
    expect(rows[1]).toMatchObject({ key: 'b', count: 1, totalCostUsd: 0.05 });
  });

  it('sorts keys ascending (deterministic JSON)', () => {
    const rows = aggregateByWorkspace([
      make({ workspaceId: 'z' }),
      make({ workspaceId: 'a' }),
      make({ workspaceId: 'm' }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(['a', 'm', 'z']);
  });

  it('records first/last seen ts for time-windowed display', () => {
    const rows = aggregateByWorkspace([
      make({ workspaceId: 'a', ts: 200 }),
      make({ workspaceId: 'a', ts: 100 }),
      make({ workspaceId: 'a', ts: 150 }),
    ]);
    expect(rows[0]!.firstSeenTs).toBe(100);
    expect(rows[0]!.lastSeenTs).toBe(200);
  });
});

describe('aggregateByProject', () => {
  it('groups by projectId', () => {
    const rows = aggregateByProject([
      make({ projectId: 'p-a' }),
      make({ projectId: 'p-a' }),
      make({ projectId: 'p-b' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ key: 'p-a', count: 2 });
  });
});

describe('aggregateByActor', () => {
  it('keys by actorKind:actorId so user u-x ≠ plugin u-x', () => {
    const rows = aggregateByActor([
      make({ actorKind: 'user', actorId: 'x' }),
      make({ actorKind: 'plugin', actorId: 'x' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.key)).toContain('user:x');
    expect(rows.map((r) => r.key)).toContain('plugin:x');
  });
});

describe('aggregateBySurface', () => {
  it('groups by surface', () => {
    const rows = aggregateBySurface([
      make({ surface: 'editor' }),
      make({ surface: 'editor' }),
      make({ surface: 'api' }),
    ]);
    expect(rows.find((r) => r.key === 'editor')!.count).toBe(2);
    expect(rows.find((r) => r.key === 'api')!.count).toBe(1);
  });
});

describe('aggregateByDay', () => {
  it('rolls up by UTC calendar day', () => {
    const day1 = Date.UTC(2026, 3, 1, 12, 0, 0);
    const day1late = Date.UTC(2026, 3, 1, 23, 30, 0);
    const day2 = Date.UTC(2026, 3, 2, 1, 0, 0);
    const rows = aggregateByDay([
      make({ ts: day1, costUsd: 0.10 }),
      make({ ts: day1late, costUsd: 0.20 }),
      make({ ts: day2, costUsd: 0.05 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ key: '2026-04-01', count: 2, totalCostUsd: 0.30 });
    expect(rows[1]).toMatchObject({ key: '2026-04-02', count: 1, totalCostUsd: 0.05 });
  });
});

describe('aggregateByModel & byWorkflow', () => {
  it('byModel groups by `model` string', () => {
    const rows = aggregateByModel([
      make({ model: 'anthropic.claude-sonnet-4' }),
      make({ model: 'anthropic.claude-haiku-3' }),
      make({ model: 'anthropic.claude-sonnet-4' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.key === 'anthropic.claude-sonnet-4')!.count).toBe(2);
  });

  it('byWorkflow groups by `workflowId`', () => {
    const rows = aggregateByWorkflow([
      make({ workflowId: 'plan.critique' }),
      make({ workflowId: 'auto.layout' }),
      make({ workflowId: 'plan.critique' }),
    ]);
    expect(rows).toHaveLength(2);
  });
});

describe('computeTotals', () => {
  it('sums + counts distinct', () => {
    const t = computeTotals([
      make({ projectId: 'p-1', actorId: 'u-1', costUsd: 0.10 }),
      make({ projectId: 'p-1', actorId: 'u-2', costUsd: 0.20 }),
      make({ projectId: 'p-2', actorId: 'u-1', costUsd: 0.05 }),
    ]);
    expect(t.count).toBe(3);
    expect(t.totalCostUsd).toBe(0.35);
    expect(t.distinctProjects).toBe(2);
    expect(t.distinctActors).toBe(2);
  });

  it('handles empty array — returns all zeros', () => {
    const t = computeTotals([]);
    expect(t).toEqual({ count: 0, totalCostUsd: 0, distinctProjects: 0, distinctActors: 0 });
  });

  it('rounds to 6 decimal places (sub-cent precision)', () => {
    const t = computeTotals([
      make({ costUsd: 0.1 }),
      make({ costUsd: 0.2 }),
    ]);
    // 0.1 + 0.2 in JS is 0.30000000000000004 — rounded to 0.3.
    expect(t.totalCostUsd).toBe(0.3);
  });
});

describe('aggregation row immutability', () => {
  it('rows are frozen', () => {
    const rows = aggregateByWorkspace([make({ workspaceId: 'a' })]);
    expect(() => {
      (rows[0] as any).count = 999;
    }).toThrow(TypeError);
  });
});
