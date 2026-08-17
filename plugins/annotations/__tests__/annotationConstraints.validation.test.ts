// ─── C74 §2 · the one PERSISTED constraint family, at its declared strength ──
//
// `annotationConstraints` is the slice `ProjectSerializer` writes into the
// project snapshot and `ProjectLoader` reads back. C74 §2 classifies it
// VALIDATION, and until this file existed NOTHING EXECUTABLE IN THE REPO NAMED
// IT — `check-constraint-honesty`'s H3 arm read it as the last family whose
// declared strength had no witness at all.
//
// ─── WHY THESE ASSERTIONS AND NOT OTHERS ────────────────────────────────────
// A suite that merely proved `checkAll()` is callable would pass against a
// gutted evaluator, and that is the exact C74 §1.1 defect the H3 row measures.
// VALIDATION means three separable things, so all three are asserted:
//
//   1. A SATISFIED constraint is ACCEPTED. Load-bearing, not decoration: an
//      evaluator that reported everything violated would satisfy every negative
//      case below.
//   2. A VIOLATED constraint is REPORTED WITH ITS IDENTITY — its own record,
//      its own description, and BOTH numbers (the measured distance and the
//      target it breached), by exact value rather than by truthiness.
//   3. VALIDATION IS NOT ENFORCEMENT. The family checks and records; it must
//      not move geometry or refuse a mutation. Asserted, because misreading a
//      VALIDATION family as ENFORCEMENT is how a system comes to believe it is
//      protected by something that only takes notes.
//
// Each operator boundary is probed AT THE EDGE (the 1 mm EQUAL_TOLERANCE_M),
// because a limit nobody probed at the boundary could be `>=` where its
// sentence says "exceeds" and nothing would notice.
//
// ─── AND THE AXIS THIS REPO CARES ABOUT MOST ────────────────────────────────
// §CONTEXT-DATA-HONESTY / C70 L-INV-1 — "I found nothing" and "I could not
// look" are never the same value. For this family the distinction is the
// `'unknown'` result: a constraint whose references cannot be resolved must NOT
// come back `'satisfied'`. That is asserted directly, and it is the assertion
// most likely to catch a future regression, because collapsing `'unknown'` into
// `'satisfied'` is invisible in every UI that only counts violations.
//
// ⚠ ONE DEFECT IS PINNED AS MEASURED, NOT ENDORSED — see the final block. The
// evaluator prefers a STALE cached position over reporting `'unknown'`, so a
// deleted element can still read `'satisfied'`. This suite asserts what the
// code does today and names it as a defect rather than blessing it; changing
// that behaviour is not this row's lane.

import { describe, expect, it } from 'vitest';
import { ConstraintStore, type ConstraintRecord } from '../src/subsystem/ConstraintStore.js';
import { ConstraintSolver } from '../src/subsystem/ConstraintSolver.js';
import type { ResolverStores, StableReference } from '../src/subsystem/AnnotationReference.js';

/** A free world-space reference — resolvable without any element store. */
function pointRef(id: string, x: number, y: number, z: number): StableReference {
  return {
    elementId: id,
    elementType: 'point',
    subElement: 'point',
    stableKey: `point:${id}`,
    cachedPosition: { x, y, z },
  };
}

/** A wall-hosted reference — resolvable only if `wallStore` knows the wall. */
function wallRef(wallId: string, sub: 'start' | 'end'): StableReference {
  return {
    elementId: wallId,
    elementType: 'wall',
    subElement: sub,
    stableKey: `wall-${wallId}:${sub}`,
  };
}

function record(
  over: Partial<ConstraintRecord> & Pick<ConstraintRecord, 'operator' | 'valueMetres' | 'references'>,
): ConstraintRecord {
  return {
    id: over.id ?? `c-${over.operator}-${over.valueMetres}`,
    sourceAnnotationId: over.sourceAnnotationId ?? 'dim-1',
    type: over.type ?? 'hard',
    description: over.description ?? `Dim ${over.operator} ${over.valueMetres} m`,
    lastResult: 'unknown',
    violationDeltaMetres: 0,
    ...over,
  } as ConstraintRecord;
}

const NO_STORES: ResolverStores = {};

// ─────────────────────────────────────────────────────────────────────────────
describe('annotationConstraints — VALIDATION (C74 §2): a satisfied constraint is ACCEPTED', () => {
  it('a 5.000 m span against a ">= 1.200 m" rule is satisfied, with the measured distance', () => {
    const store = new ConstraintStore();
    store.restoreRecord(record({
      id: 'ok-1',
      operator: '>=',
      valueMetres: 1.2,
      description: 'A–B ≥ 1.200 m',
      references: [pointRef('a', 0, 0, 0), pointRef('b', 5, 0, 0)],
    }));

    const violated = new ConstraintSolver().checkAll(store, NO_STORES);

    expect(violated).toHaveLength(0);
    const after = store.getById('ok-1')!;
    expect(after.lastResult).toBe('satisfied');
    // actual − target, by value: 5.000 − 1.200.
    expect(after.violationDeltaMetres).toBeCloseTo(3.8, 9);
  });

  it('the accept arm is not vacuous — the same evaluator refuses the same span under a stricter rule', () => {
    const store = new ConstraintStore();
    store.restoreRecord(record({
      id: 'strict-1',
      operator: '>=',
      valueMetres: 9,
      description: 'A–B ≥ 9.000 m',
      references: [pointRef('a', 0, 0, 0), pointRef('b', 5, 0, 0)],
    }));

    const violated = new ConstraintSolver().checkAll(store, NO_STORES);

    expect(violated).toHaveLength(1);
    expect(store.getById('strict-1')!.lastResult).toBe('violated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('annotationConstraints — VALIDATION: a violation is reported WITH ITS IDENTITY', () => {
  it('carries the record, its own sentence, and BOTH numbers', () => {
    const store = new ConstraintStore();
    store.restoreRecord(record({
      id: 'v-1',
      operator: '>=',
      valueMetres: 1.2,
      description: 'Corridor clear width ≥ 1.200 m',
      references: [pointRef('a', 0, 0, 0), pointRef('b', 0.9, 0, 0)],
    }));

    const violated = new ConstraintSolver().checkAll(store, NO_STORES);

    expect(violated).toHaveLength(1);
    const v = violated[0]!;
    // Its own identity — not a generic "a constraint failed".
    expect(v.id).toBe('v-1');
    expect(v.sourceAnnotationId).toBe('dim-1');
    expect(v.description).toBe('Corridor clear width ≥ 1.200 m');
    expect(v.lastResult).toBe('violated');
    // BOTH numbers: the breached limit is on the record, and the measured
    // value is recoverable from the signed delta. 0.900 − 1.200 = −0.300.
    expect(v.valueMetres).toBeCloseTo(1.2, 9);
    expect(v.violationDeltaMetres).toBeCloseTo(-0.3, 9);
    expect(v.valueMetres + v.violationDeltaMetres).toBeCloseTo(0.9, 9);
  });

  it('the sign of the delta distinguishes under- from over-satisfaction', () => {
    const store = new ConstraintStore();
    store.restoreRecord(record({
      id: 'over-1',
      operator: '<=',
      valueMetres: 1,
      description: 'Gap ≤ 1.000 m',
      references: [pointRef('a', 0, 0, 0), pointRef('b', 2.5, 0, 0)],
    }));

    const violated = new ConstraintSolver().checkAll(store, NO_STORES);

    expect(violated).toHaveLength(1);
    expect(violated[0]!.violationDeltaMetres).toBeCloseTo(1.5, 9);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('annotationConstraints — VALIDATION: every operator probed AT THE EDGE', () => {
  // EQUAL_TOLERANCE_M is 1 mm. Each case sits one step either side of it, so an
  // off-by-one in the comparison direction (`>` where the sentence says `>=`,
  // or a dropped tolerance term) changes a verdict here.
  const TOL = 0.001;
  const cases: ReadonlyArray<{
    op: ConstraintRecord['operator']; target: number; actual: number; satisfied: boolean; why: string;
  }> = [
    { op: '>=', target: 2, actual: 2 - TOL / 2, satisfied: true, why: 'inside tolerance below the floor' },
    { op: '>=', target: 2, actual: 2 - TOL * 2, satisfied: false, why: 'outside tolerance below the floor' },
    { op: '<=', target: 2, actual: 2 + TOL / 2, satisfied: true, why: 'inside tolerance above the ceiling' },
    { op: '<=', target: 2, actual: 2 + TOL * 2, satisfied: false, why: 'outside tolerance above the ceiling' },
    { op: '==', target: 2, actual: 2 + TOL / 2, satisfied: true, why: 'equal within 1 mm' },
    { op: '==', target: 2, actual: 2 + TOL * 2, satisfied: false, why: 'not equal beyond 1 mm' },
    { op: '>', target: 2, actual: 2 + TOL * 2, satisfied: true, why: 'strictly greater beyond tolerance' },
    { op: '>', target: 2, actual: 2 + TOL / 2, satisfied: false, why: 'greater only inside tolerance is NOT >' },
    { op: '<', target: 2, actual: 2 - TOL * 2, satisfied: true, why: 'strictly less beyond tolerance' },
    { op: '<', target: 2, actual: 2 - TOL / 2, satisfied: false, why: 'less only inside tolerance is NOT <' },
  ];

  for (const c of cases) {
    it(`${c.actual.toFixed(4)} m ${c.op} ${c.target} m → ${c.satisfied ? 'satisfied' : 'violated'} (${c.why})`, () => {
      const store = new ConstraintStore();
      store.restoreRecord(record({
        id: 'edge',
        operator: c.op,
        valueMetres: c.target,
        references: [pointRef('a', 0, 0, 0), pointRef('b', c.actual, 0, 0)],
      }));
      new ConstraintSolver().checkAll(store, NO_STORES);
      expect(store.getById('edge')!.lastResult).toBe(c.satisfied ? 'satisfied' : 'violated');
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe('annotationConstraints — §CONTEXT-DATA-HONESTY: unresolvable is UNKNOWN, never satisfied', () => {
  it('a wall-hosted constraint whose wall the store has never heard of reads "unknown"', () => {
    const store = new ConstraintStore();
    store.restoreRecord(record({
      id: 'unres-1',
      operator: '>=',
      valueMetres: 1.2,
      description: 'Wall W1 start → W2 start ≥ 1.200 m',
      references: [wallRef('w-missing-1', 'start'), wallRef('w-missing-2', 'start')],
    }));

    // An EMPTY store, not a broken one: `getById` answers `undefined` for every
    // id, which is exactly what a project that has not loaded its walls looks
    // like. Nothing here is a substitute for the evaluator under test.
    const emptyWalls: ResolverStores = { wallStore: { getById: () => undefined } };
    const violated = new ConstraintSolver().checkAll(store, emptyWalls);

    const after = store.getById('unres-1')!;
    expect(after.lastResult).toBe('unknown');
    expect(after.lastResult).not.toBe('satisfied');
    // And it is NOT reported as a violation either — "I could not look" is a
    // third value, distinct from both "compliant" and "breached".
    expect(violated).toHaveLength(0);
    // No number is invented for a measurement that never happened.
    expect(after.violationDeltaMetres).toBe(0);
  });

  it('an unknown constraint and a satisfied one are DIFFERENT VALUES in the same batch', () => {
    // The whole point: a batch containing one unevaluable rule must not read as
    // a clean batch. If `unknown` ever collapses into `satisfied`, this fails.
    const store = new ConstraintStore();
    store.restoreRecord(record({
      id: 'good',
      operator: '>=',
      valueMetres: 1,
      references: [pointRef('a', 0, 0, 0), pointRef('b', 5, 0, 0)],
    }));
    store.restoreRecord(record({
      id: 'blind',
      operator: '>=',
      valueMetres: 1,
      references: [wallRef('w-missing', 'start'), pointRef('b', 5, 0, 0)],
    }));

    new ConstraintSolver().checkAll(store, { wallStore: { getById: () => undefined } });

    expect(store.getById('good')!.lastResult).toBe('satisfied');
    expect(store.getById('blind')!.lastResult).toBe('unknown');
    expect(store.getById('blind')!.lastResult).not.toBe(store.getById('good')!.lastResult);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('annotationConstraints — VALIDATION is NOT ENFORCEMENT (C74 §1.1)', () => {
  it('evaluation records a verdict and moves no geometry', () => {
    const store = new ConstraintStore();
    const refs: [StableReference, StableReference] = [
      pointRef('a', 0, 0, 0),
      pointRef('b', 0.5, 0, 0),
    ];
    const before = JSON.stringify(refs);
    store.restoreRecord(record({
      id: 'passive',
      operator: '>=',
      valueMetres: 1.2,
      references: refs,
    }));

    const violated = new ConstraintSolver().checkAll(store, NO_STORES);

    // It reports…
    expect(violated).toHaveLength(1);
    expect(store.getById('passive')!.lastResult).toBe('violated');
    // …and it does not correct. A solver would have moved `b` to 1.2 m; a
    // VALIDATION family may not, and the references are untouched.
    expect(JSON.stringify(refs)).toBe(before);
    expect(store.getById('passive')!.references[1]!.cachedPosition).toEqual({ x: 0.5, y: 0, z: 0 });
  });

  it('subscribers are notified on every run, including a clean one', () => {
    const store = new ConstraintStore();
    store.restoreRecord(record({
      id: 'clean',
      operator: '>=',
      valueMetres: 1,
      references: [pointRef('a', 0, 0, 0), pointRef('b', 5, 0, 0)],
    }));
    const seen: number[] = [];
    store.subscribe((rs) => seen.push(rs.length));

    new ConstraintSolver().checkAll(store, NO_STORES);

    // A validation pass that stays silent when everything passes cannot be
    // distinguished from one that did not run.
    expect(seen).toEqual([1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('annotationConstraints — the PERSISTED half: written, read back, re-checked', () => {
  it('survives the snapshot round-trip with its identity and its verdict intact', () => {
    const authored = new ConstraintStore();
    authored.restoreRecord(record({
      id: 'persist-1',
      sourceAnnotationId: 'dim-persist',
      operator: '>=',
      valueMetres: 1.2,
      description: 'Corridor clear width ≥ 1.200 m',
      references: [pointRef('a', 0, 0, 0), pointRef('b', 0.9, 0, 0)],
    }));
    new ConstraintSolver().checkAll(authored, NO_STORES);
    expect(authored.getById('persist-1')!.lastResult).toBe('violated');

    // Exactly what `ProjectSerializer` writes and `ProjectLoader` reads back:
    // the snapshot slice is keyed by the family's own name, which is why that
    // name is load-bearing rather than decorative here.
    const snapshot: { annotationConstraints?: { version: 1; records: ConstraintRecord[] } } = {
      annotationConstraints: authored.serialize(),
    };
    expect(snapshot.annotationConstraints!.version).toBe(1);
    expect(snapshot.annotationConstraints!.records).toHaveLength(1);

    const reloaded = new ConstraintStore();
    reloaded.deserialize(snapshot.annotationConstraints);

    const back = reloaded.getById('persist-1')!;
    expect(back).toBeDefined();
    expect(back.description).toBe('Corridor clear width ≥ 1.200 m');
    expect(back.valueMetres).toBeCloseTo(1.2, 9);
    expect(back.violationDeltaMetres).toBeCloseTo(-0.3, 9);

    // And it is still CHECKABLE after the round-trip — a persisted rule that
    // cannot be re-evaluated is a note, not a constraint.
    const violatedAgain = new ConstraintSolver().checkAll(reloaded, NO_STORES);
    expect(violatedAgain).toHaveLength(1);
    expect(violatedAgain[0]!.id).toBe('persist-1');
    expect(reloaded.getById('persist-1')!.violationDeltaMetres).toBeCloseTo(-0.3, 9);
  });

  it('a snapshot at an unknown version restores NOTHING rather than a wrong something', () => {
    const store = new ConstraintStore();
    store.restoreRecord(record({
      id: 'pre-existing',
      operator: '>=',
      valueMetres: 1,
      references: [pointRef('a', 0, 0, 0), pointRef('b', 5, 0, 0)],
    }));

    store.deserialize({ version: 99, records: [{ id: 'from-the-future' }] });

    // The store is CLEARED, not left holding a record the payload never
    // authorised. Both facts asserted, because "ignored the payload" and
    // "merged the payload" differ only here.
    expect(store.size).toBe(0);
    expect(store.getById('from-the-future')).toBeUndefined();
    expect(store.getById('pre-existing')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('annotationConstraints — DEFECT PINNED AS MEASURED, NOT ENDORSED', () => {
  it('⚠ a DELETED element still reads "satisfied" from its stale cached position', () => {
    // `ConstraintSolver.check` falls back to `cachedPosition` when the live
    // resolver answers null, and its own docstring gives "the element was
    // deleted between placement and evaluation" as the reason. The consequence
    // is the exact collision this suite's honesty block forbids elsewhere: the
    // wall is GONE, and the verdict is nevertheless a confident 'satisfied'
    // computed against where it used to be.
    //
    // Asserted here so the behaviour is recorded rather than assumed, and so
    // any future fix must come past this test deliberately. It is NOT a claim
    // that the behaviour is correct.
    const store = new ConstraintStore();
    const stale: StableReference = { ...wallRef('w-deleted', 'start'), cachedPosition: { x: 0, y: 0, z: 0 } };
    store.restoreRecord(record({
      id: 'stale-1',
      operator: '>=',
      valueMetres: 1.2,
      references: [stale, pointRef('b', 5, 0, 0)],
    }));

    new ConstraintSolver().checkAll(store, { wallStore: { getById: () => undefined } });

    expect(store.getById('stale-1')!.lastResult).toBe('satisfied');
    // The honest answer would have been 'unknown' — the same value the
    // no-cached-position case above correctly produces. The ONLY difference
    // between the two is whether a stale coordinate happened to be cached.
    expect(store.getById('stale-1')!.lastResult).not.toBe('unknown');
  });
});
