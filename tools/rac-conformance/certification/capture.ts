// ─── Independent state capture + structural diff ─────────────────────────────
//
// The §7 oracle rule: NEVER ask the same object whether it is valid. The
// EXPECTED side of every comparison is a JSON deep-clone taken BEFORE the
// operation under test ran (serialize/reload, or undo). The ACTUAL side is a
// fresh read of the live stores AFTER it ran. The comparator itself never
// consults CommandResult.success, handler patches, or any store's own opinion.
//
// FAILURE ≠ EMPTINESS: `captureState` records, per kind, whether the read
// REACHED a store at all. A comparator over a kind whose capture never reached
// a store answers MISCONFIGURED — never "0 divergences".

import type { World } from './world';
import { doorStore, windowStore } from './world';

export interface KindCapture {
  /** true when getAll() executed without throwing (0 records is still reached). */
  reached: boolean;
  reachError?: string;
  /** id → JSON-normalised record. */
  records: Record<string, unknown>;
}

export type StateCapture = Record<string, KindCapture>;

/** The element kinds this harness can compose, and the authoritative reader for each. */
export function kindReaders(world: World): Array<[string, () => Array<{ id: string }>]> {
  const s = world.stores;
  return [
    ['level',       () => s.wallStore.getLevels()],
    ['grid',        () => s.gridStore.getAll()],
    ['wall',        () => s.wallStore.getAll()],
    ['door',        () => doorStore.getAll()],
    ['window',      () => windowStore.getAll()],
    ['opening',     () => s.openingStore.getAll()],
    ['slab',        () => s.slabStore.getAll()],
    ['roof',        () => s.roofStore.getAll()],
    ['column',      () => s.columnStore.getAll()],
    ['beam',        () => s.beamStore.getAll()],
    ['stair',       () => s.stairStore.getAll()],
    ['curtainWall', () => s.curtainWallStore.getAll()],
    ['handrail',    () => s.handrailStore.getAll()],
    ['plumbing',    () => s.plumbingStore.getAll()],
    ['furniture',   () => s.furnitureStore.getAll()],
    ['ceiling',     () => s.ceilingStore.getAll()],
    ['floor',       () => s.floorStore.getAll()],
    ['room',        () => s.roomStore.getAll()],
  ];
}

/** JSON-normalise (drops undefined, functions, THREE refs are expected absent). */
function norm(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v ?? null));
}

export function captureState(world: World): StateCapture {
  const out: StateCapture = {};
  for (const [kind, read] of kindReaders(world)) {
    try {
      const records: Record<string, unknown> = {};
      for (const rec of read()) {
        const id = (rec as { id?: string }).id ?? `__no_id_${Object.keys(records).length}`;
        records[id] = norm(rec);
      }
      out[kind] = { reached: true, records };
    } catch (e) {
      out[kind] = { reached: false, reachError: String(e).slice(0, 300), records: {} };
    }
  }
  return out;
}

export interface Divergence {
  path: string;             // e.g. wall.<id>.height
  expected: unknown;
  actual: unknown;
}

function deepDiff(path: string, a: unknown, b: unknown, out: Divergence[]): void {
  if (a === b) return;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, expected: a, actual: b });
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    out.push({ path, expected: a, actual: b });
    return;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const k of keys) {
    deepDiff(`${path}.${k}`, (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], out);
  }
}

/** Diff one kind. `tolerated` = predicate over a divergence path that is an
 *  EXPLICITLY DOCUMENTED derived-state tolerance (each entry must cite its
 *  document at the call site). Undocumented divergences are always reported. */
export function diffKind(
  kind: string,
  expected: KindCapture,
  actual: KindCapture,
  tolerated: (path: string) => boolean = () => false,
): { status: 'MISCONFIGURED' | 'CLEAN' | 'DIVERGED'; divergences: Divergence[]; toleratedCount: number } {
  if (!expected.reached || !actual.reached) {
    return {
      status: 'MISCONFIGURED',
      divergences: [{
        path: kind,
        expected: expected.reached ? '(reached)' : `capture failed: ${expected.reachError}`,
        actual: actual.reached ? '(reached)' : `capture failed: ${actual.reachError}`,
      }],
      toleratedCount: 0,
    };
  }
  const raw: Divergence[] = [];
  const ids = new Set([...Object.keys(expected.records), ...Object.keys(actual.records)]);
  for (const id of ids) {
    const e = expected.records[id];
    const a = actual.records[id];
    if (e === undefined) { raw.push({ path: `${kind}.${id}`, expected: '(absent)', actual: '(present)' }); continue; }
    if (a === undefined) { raw.push({ path: `${kind}.${id}`, expected: '(present)', actual: '(absent — LOST)' }); continue; }
    deepDiff(`${kind}.${id}`, e, a, raw);
  }
  const kept = raw.filter((d) => !tolerated(d.path));
  return {
    status: kept.length === 0 ? 'CLEAN' : 'DIVERGED',
    divergences: kept,
    toleratedCount: raw.length - kept.length,
  };
}

/** Whole-capture diff over every kind. */
export function diffState(
  expected: StateCapture,
  actual: StateCapture,
  tolerated: (path: string) => boolean = () => false,
): { clean: boolean; misconfigured: string[]; divergences: Divergence[]; toleratedCount: number } {
  const misconfigured: string[] = [];
  const divergences: Divergence[] = [];
  let toleratedCount = 0;
  for (const kind of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const r = diffKind(kind, expected[kind] ?? { reached: false, reachError: 'kind absent from expected capture', records: {} },
      actual[kind] ?? { reached: false, reachError: 'kind absent from actual capture', records: {} }, tolerated);
    if (r.status === 'MISCONFIGURED') misconfigured.push(kind);
    divergences.push(...r.divergences);
    toleratedCount += r.toleratedCount;
  }
  return { clean: misconfigured.length === 0 && divergences.length === 0, misconfigured, divergences, toleratedCount };
}
