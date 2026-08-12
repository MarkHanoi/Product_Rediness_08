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

// ─── ADR-0319 class 3 — DERIVED-INCIDENTAL, enumerated BY NAME ───────────────
//
// ADR-0319 splits element fields into three classes and applies the round-trip
// contract differently to each:
//
//   class 1 AUTHORITATIVE        — byte-for-byte, no tolerance ever
//                                  (`id`, `ifcData.guid`, authored geometry …)
//   class 2 DERIVED-BUT-CAUSAL   — may differ across a RESTORE; may NEVER
//                                  differ across an UNDO (`metadata.version`,
//                                  `wall._renderVersion`, any monotonic counter)
//   class 3 DERIVED-INCIDENTAL   — may differ across a restore AND an undo;
//                                  excluded from the comparator by THIS list.
//
// The ADR is explicit about the SHAPE of this rule: "an enumerated exclusion
// list — never a pattern, never a prefix-match, never 'ignore fields ending in
// At' — so adding a field to it is a visible diff in review." Accordingly this
// is a list of exact, fully-qualified field paths, matched by whole-segment
// equality against the tail of a divergence path. `metadata.modifiedAtBy`,
// `createdAtSource`, or any other similarly-spelled field does NOT match; only
// these two names do, and adding a third means editing this array.
//
// NOTHING ELSE IS EXCLUDED. `metadata.version` and `_renderVersion` are class 2
// and are deliberately ABSENT — a counter that ratchets through an undo/redo
// cycle is a REAL DEFECT (ADR-0319 §2) and stays red until the code is fixed.
export const ADR0319_CLASS3_FIELDS: readonly string[] = [
  'metadata.createdAt',
  'metadata.modifiedAt',
];

// ─── ADR-0319 class 2 — DERIVED-BUT-CAUSAL, excludable across a RESTORE ONLY ─
//
// ADR-0319 §2: "may differ across a restore; may NOT differ across an undo."
// A reload legitimately re-executes commands and walks monotonic counters
// forward; an undo that leaves a counter moved means the model is NOT the same
// model, which is a REAL DEFECT.
//
// Accordingly this list exists as a SEPARATE, SEPARATELY-NAMED artefact:
//
//   * the PERSISTENCE comparator (persistence.cert.ts) MAY consume it, with a
//     printed citation on every row it touches;
//   * the UNDO comparator (undoredo.cert.ts) MUST NOT consume it, ever — its
//     predicate is `isAdr0319Class3` alone, and the TWO-LIST SEPARATION test in
//     persistence.cert.ts plus the FALSIFIABILITY test in undoredo.cert.ts both
//     go red if a class-2 counter stops being reported across an undo.
//
// Do NOT merge these two lists. The single combined list is exactly the shape
// of tolerance creep the acceptance plan's §0 rule 3 forbids: one list that
// grows to fit whatever is failing, consumed everywhere, cited nowhere.
// Same enumeration discipline as class 3: exact field paths, whole-segment
// tail match, never a pattern. Both names below are named IN the ADR.
export const ADR0319_CLASS2_RESTORE_ONLY: readonly string[] = [
  'metadata.version',
  '_renderVersion',
];

/**
 * Whole-segment tail match of `path` against one enumerated field list.
 *
 * Divergence paths are `<kind>.<id>.<field…>`; the match is against the trailing
 * whole segments of the path, so `wall.u-wall-1.metadata.modifiedAt` matches
 * `metadata.modifiedAt` while `wall.u-wall-1.metadata.modifiedAtBy` does not.
 * ONE matcher for both classes — the lists differ, the discipline does not.
 */
function matchesEnumeratedTail(path: string, fields: readonly string[]): boolean {
  const segs = path.split('.');
  return fields.some((field) => {
    const f = field.split('.');
    if (segs.length <= f.length) return false; // must sit ON a record, not BE one
    return f.every((s, i) => segs[segs.length - f.length + i] === s);
  });
}

/** True when `path` names an ADR-0319 class-3 (DERIVED-INCIDENTAL) field. */
export function isAdr0319Class3(path: string): boolean {
  return matchesEnumeratedTail(path, ADR0319_CLASS3_FIELDS);
}

/** True when `path` names an ADR-0319 class-2 (DERIVED-BUT-CAUSAL) counter.
 *  RESTORE-ONLY: consuming this across an undo is forbidden — see the list's
 *  declaration comment above. */
export function isAdr0319Class2RestoreOnly(path: string): boolean {
  return matchesEnumeratedTail(path, ADR0319_CLASS2_RESTORE_ONLY);
}

/** Human-readable provenance for a report cell, so an exclusion is never silent. */
export const ADR0319_CLASS3_CITATION =
  `ADR-0319 §3 class-3 (DERIVED-INCIDENTAL), enumerated by name: ${ADR0319_CLASS3_FIELDS.join(', ')}`;

export const ADR0319_CLASS2_RESTORE_CITATION =
  `ADR-0319 §2 class-2 (DERIVED-BUT-CAUSAL, excludable across a RESTORE only — never an undo), ` +
  `enumerated by name: ${ADR0319_CLASS2_RESTORE_ONLY.join(', ')}`;

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
): { status: 'MISCONFIGURED' | 'CLEAN' | 'DIVERGED'; divergences: Divergence[]; toleratedCount: number; toleratedDivergences: Divergence[] } {
  if (!expected.reached || !actual.reached) {
    return {
      status: 'MISCONFIGURED',
      divergences: [{
        path: kind,
        expected: expected.reached ? '(reached)' : `capture failed: ${expected.reachError}`,
        actual: actual.reached ? '(reached)' : `capture failed: ${actual.reachError}`,
      }],
      toleratedCount: 0,
      toleratedDivergences: [],
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
  // ONE comparison, split two ways. `toleratedDivergences` is returned in full —
  // never just a count — so every caller CAN (and the cert suites DO) print the
  // names of what was dropped. A green row that hides what it excluded is the
  // defect the whole certification plan exists to prevent.
  const kept: Divergence[] = [];
  const toleratedDivergences: Divergence[] = [];
  for (const d of raw) (tolerated(d.path) ? toleratedDivergences : kept).push(d);
  return {
    status: kept.length === 0 ? 'CLEAN' : 'DIVERGED',
    divergences: kept,
    toleratedCount: toleratedDivergences.length,
    toleratedDivergences,
  };
}

/** Whole-capture diff over every kind. */
export function diffState(
  expected: StateCapture,
  actual: StateCapture,
  tolerated: (path: string) => boolean = () => false,
): { clean: boolean; misconfigured: string[]; divergences: Divergence[]; toleratedCount: number; toleratedDivergences: Divergence[] } {
  const misconfigured: string[] = [];
  const divergences: Divergence[] = [];
  const toleratedDivergences: Divergence[] = [];
  for (const kind of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const r = diffKind(kind, expected[kind] ?? { reached: false, reachError: 'kind absent from expected capture', records: {} },
      actual[kind] ?? { reached: false, reachError: 'kind absent from actual capture', records: {} }, tolerated);
    if (r.status === 'MISCONFIGURED') misconfigured.push(kind);
    divergences.push(...r.divergences);
    toleratedDivergences.push(...r.toleratedDivergences);
  }
  return {
    clean: misconfigured.length === 0 && divergences.length === 0,
    misconfigured, divergences,
    toleratedCount: toleratedDivergences.length,
    toleratedDivergences,
  };
}
