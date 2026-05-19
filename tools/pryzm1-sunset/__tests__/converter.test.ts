// converter.test.ts — fixture-driven round-trip tests for the
// PRYZM 1 → PRYZM 2 sunset converter.  Spec: ADR-0031 + SPEC-26 §1.

import { describe, expect, it } from 'vitest';

import { convertPryzm1Snapshot } from '../src/converter.js';
import type { Pryzm1Snapshot } from '../src/types.js';

const FIXED_NOW = 1_730_000_000_000; // 2024-10-27 (deterministic for snapshots)
const CLIENT_ID = 'sunset-test';

const minimalProject = {
  id: 'p-001',
  name: 'Minimal',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

describe('convertPryzm1Snapshot', () => {
  it('emits a v1 archive header with PRYZM 1 provenance fields', () => {
    const snapshot: Pryzm1Snapshot = { schemaVersion: 1, project: minimalProject };
    const out = convertPryzm1Snapshot(snapshot, { clientId: CLIENT_ID, fixedNow: FIXED_NOW });
    expect(out.formatVersion).toBe(1);
    expect(out.project.migratedFrom).toBe('pryzm-1');
    expect(out.project.migratedAt).toBe(new Date(FIXED_NOW).toISOString());
    expect(out.project.id).toBe('p-001');
    expect(out.events).toEqual([]);
  });

  it('emits level.create events in input order with monotonic causalSeq', () => {
    const snapshot: Pryzm1Snapshot = {
      schemaVersion: 1,
      project: minimalProject,
      levels: [
        { id: 'l-1', name: 'Ground', elevation: 0 },
        { id: 'l-2', name: 'First', elevation: 3000 },
      ],
    };
    const out = convertPryzm1Snapshot(snapshot, { clientId: CLIENT_ID, fixedNow: FIXED_NOW });
    expect(out.events).toHaveLength(2);
    expect(out.events[0]?.type).toBe('level.create');
    expect(out.events[0]?.causalSeq).toBe(1);
    expect(out.events[1]?.causalSeq).toBe(2);
    expect(out.events[0]?.payload).toEqual({ id: 'l-1', name: 'Ground', elevation: 0 });
    expect(out.migrationReport.outputEventCounts['level.create']).toBe(2);
  });

  it('skips zero-length walls + non-positive height/thickness with reasons', () => {
    const snapshot: Pryzm1Snapshot = {
      schemaVersion: 1,
      project: minimalProject,
      walls: [
        {
          id: 'w-good',
          start: { x: 0, y: 0, z: 0 },
          end: { x: 1000, y: 0, z: 0 },
          height: 2400,
          thickness: 100,
        },
        {
          id: 'w-zero-len',
          start: { x: 5, y: 5, z: 0 },
          end: { x: 5, y: 5, z: 0 },
          height: 2400,
          thickness: 100,
        },
        {
          id: 'w-bad-h',
          start: { x: 0, y: 0, z: 0 },
          end: { x: 1000, y: 0, z: 0 },
          height: 0,
          thickness: 100,
        },
      ],
    };
    const out = convertPryzm1Snapshot(snapshot, { clientId: CLIENT_ID, fixedNow: FIXED_NOW });
    expect(out.events.map((e) => (e.payload as { id: string }).id)).toEqual(['w-good']);
    expect(out.migrationReport.skipped.map((s) => s.id).sort()).toEqual(['w-bad-h', 'w-zero-len']);
  });

  it('skips doors whose host wall is missing', () => {
    const snapshot: Pryzm1Snapshot = {
      schemaVersion: 1,
      project: minimalProject,
      walls: [
        {
          id: 'w-1',
          start: { x: 0, y: 0, z: 0 },
          end: { x: 1000, y: 0, z: 0 },
          height: 2400,
          thickness: 100,
        },
      ],
      doors: [
        { id: 'd-good', hostWallId: 'w-1', position: 0.5, width: 800, height: 2000 },
        { id: 'd-orphan', hostWallId: 'w-missing', position: 0.5, width: 800, height: 2000 },
      ],
    };
    const out = convertPryzm1Snapshot(snapshot, { clientId: CLIENT_ID, fixedNow: FIXED_NOW });
    const doorEvents = out.events.filter((e) => e.type === 'door.create');
    expect(doorEvents.map((e) => (e.payload as { id: string }).id)).toEqual(['d-good']);
    const orphan = out.migrationReport.skipped.find((s) => s.id === 'd-orphan');
    expect(orphan?.reason).toMatch(/host wall .* not present/);
  });

  it('records Tier 2 element kinds in tier2Deferred + warnings', () => {
    const snapshot = {
      schemaVersion: 1,
      project: minimalProject,
      columns: [{ id: 'c-1' }],
      stairs: [{ id: 's-1' }, { id: 's-2' }],
    } as unknown as Pryzm1Snapshot;
    const out = convertPryzm1Snapshot(snapshot, { clientId: CLIENT_ID, fixedNow: FIXED_NOW });
    expect(out.migrationReport.tier2Deferred).toEqual(['columns (1 elements)', 'stairs (2 elements)']);
    expect(out.migrationReport.warnings).toHaveLength(2);
  });

  it('is byte-stable given identical fixedNow + clientId (round-trip)', () => {
    const snapshot: Pryzm1Snapshot = {
      schemaVersion: 1,
      project: minimalProject,
      levels: [{ id: 'l-1', name: 'Ground', elevation: 0 }],
      walls: [
        {
          id: 'w-1',
          start: { x: 0, y: 0, z: 0 },
          end: { x: 1000, y: 0, z: 0 },
          height: 2400,
          thickness: 100,
          levelId: 'l-1',
        },
      ],
      doors: [{ id: 'd-1', hostWallId: 'w-1', position: 0.5, width: 800, height: 2000 }],
    };
    const a = JSON.stringify(convertPryzm1Snapshot(snapshot, { clientId: CLIENT_ID, fixedNow: FIXED_NOW }));
    const b = JSON.stringify(convertPryzm1Snapshot(snapshot, { clientId: CLIENT_ID, fixedNow: FIXED_NOW }));
    expect(a).toBe(b);
  });

  it('emits levels before walls before doors so causalSeq matches dependency order', () => {
    const snapshot: Pryzm1Snapshot = {
      schemaVersion: 1,
      project: minimalProject,
      levels: [{ id: 'l-1', name: 'Ground', elevation: 0 }],
      walls: [
        {
          id: 'w-1',
          start: { x: 0, y: 0, z: 0 },
          end: { x: 1000, y: 0, z: 0 },
          height: 2400,
          thickness: 100,
          levelId: 'l-1',
        },
      ],
      doors: [{ id: 'd-1', hostWallId: 'w-1', position: 0.5, width: 800, height: 2000 }],
    };
    const out = convertPryzm1Snapshot(snapshot, { clientId: CLIENT_ID, fixedNow: FIXED_NOW });
    expect(out.events.map((e) => e.type)).toEqual(['level.create', 'wall.create', 'door.create']);
    expect(out.events.map((e) => e.causalSeq)).toEqual([1, 2, 3]);
  });
});
