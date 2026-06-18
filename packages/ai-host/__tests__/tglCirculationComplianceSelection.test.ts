// §CIRCULATION-COMPLIANCE — the SELECTION-side fix for the founder's repeatable
// production defect (2026-06-18):
//
//   Inspector: "Bedroom 1 — Not on circulation ✗ (served through Dining)"
//              "Bedroom 1 — Not on circulation ✗ (served through Bedroom 2)"
//
// A bedroom MUST reach the circulation spine (corridor / hall) WITHOUT passing through
// another habitable room. The angle-independent reach gate (`unreachableHabitableRoomIds`)
// already FLAGS such a sealed bedroom — Rule R, `hardFailedRules ∋ 'reach'` — and that
// makes the candidate `hardValid:false`.
//
// THE BUG (selection, not detection): when EVERY enumerated strategy is hard-invalid
// (the §TOPO-HARD-REJECT-ALL least-bad fallback), the winner pool was selected over ALL
// candidates by `selectTier` (connected / circulationRouted) then the soft weighted score
// — NONE of which forbids SEALING a habitable bedroom. So a candidate that strands a
// bedroom behind another habitable room (Rule R fails) could OUTRANK a sibling candidate,
// equally hard-invalid for some OTHER reason (e.g. corridor-stair / corridor-purity /
// frontage), in which EVERY bedroom DOES reach circulation. `circulationRouted` is NOT the
// same signal: a room can be circulation-routed (it has SOME door) yet still be unreachable
// from the entrance across a disconnected access sub-graph.
//
// THE FIX (`preferReachComplete`, enumerate.ts): a HARD reach tiebreaker applied to the
// least-bad pool BEFORE the soft weighted comparison — among the surviving candidates,
// prefer the ones that SEAL NO habitable room ('reach' not in hardFailedRules). A bedroom
// that reaches circulation without crossing another habitable room ALWAYS beats one that
// does not, independent of the weighted score.
//
// FAIL-BEFORE-FIX (rigorous honesty): the OLD pool had no reach tiebreaker, so when the
// reach-SEALED candidate carried the higher weighted score / better tier it was SELECTED
// (the inspector then read "served through …"). `preferReachComplete` is the literal
// predicate the fix inserts; the `noReachTiebreaker` baseline below reproduces the OLD
// winner choice on the SAME candidate set and shows it picked the sealed one — the fix
// flips it. And the no-op cases prove the gate stays byte-identical on a compliant pool.

import { describe, expect, it } from 'vitest';
import {
    preferReachComplete,
    enumerateLayouts,
    type TglCandidate,
    type EnumerateInput,
} from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

// A minimal TglCandidate stub — `preferReachComplete` reads only `strategy` +
// `hardFailedRules`; the rest is filler so the cast is type-honest about the shape.
const cand = (
    strategy: string,
    hardFailedRules: TglCandidate['hardFailedRules'],
    weighted = 0.5,
): TglCandidate =>
    ({
        strategy,
        hardFailedRules,
        weighted,
        hardValid: hardFailedRules.length === 0,
        // unused-by-the-helper filler:
        graph: { nodes: [], edges: [] } as unknown as TglCandidate['graph'],
        objectives: {} as TglCandidate['objectives'],
        rank: 0,
        compromises: 0,
        connected: true,
        shapeAdmissible: true,
        topologyAdmissible: true,
        circulationRouted: true,
        underMinAreaRooms: [],
        missingMandatoryTypes: [],
        droppedRooms: [],
        roomOverlaps: [],
        boundaries: [],
    }) as TglCandidate;

// The OLD (pre-fix) winner choice over a least-bad pool: NO reach tiebreaker — pick the
// highest weighted score (the ranker's soft comparator), tie-broken by strategy id. This
// is the behaviour `preferReachComplete` REPLACES; we keep it here to prove the flip.
const noReachTiebreaker = (pool: readonly TglCandidate[]): TglCandidate =>
    [...pool].sort(
        (a, b) => b.weighted - a.weighted || (a.strategy < b.strategy ? -1 : 1),
    )[0]!;

describe('§CIRCULATION-COMPLIANCE: preferReachComplete (hard reach tiebreaker)', () => {
    it('FAIL-BEFORE-FIX — a reach-SEALED candidate with a higher weighted score WOULD have won', () => {
        // Both candidates are hard-invalid; `sealed` strands a bedroom (Rule R) but scores
        // higher, `clean` seals nobody but scores lower. The OLD comparator picks `sealed`.
        const sealed = cand('z-fwd-id', ['corridor-stair', 'reach'], /*weighted*/ 0.80);
        const clean = cand('x-fwd-id', ['corridor-stair'], /*weighted*/ 0.60);
        const pool = [sealed, clean];

        // OLD behaviour: the sealed bedroom wins (the founder's "served through …" defect).
        expect(noReachTiebreaker(pool).strategy).toBe('z-fwd-id');
        expect(noReachTiebreaker(pool).hardFailedRules).toContain('reach');

        // NEW behaviour: the reach tiebreaker removes every reach-sealed candidate first, so
        // only `clean` survives — a bedroom reaching circulation beats a higher weighted score.
        const narrowed = preferReachComplete(pool);
        expect(narrowed).toEqual([clean]);
        expect(noReachTiebreaker(narrowed).strategy).toBe('x-fwd-id');
        expect(narrowed.every(c => !c.hardFailedRules.includes('reach'))).toBe(true);
    });

    it('no-op when NO candidate seals a room (compliant pool stays byte-identical)', () => {
        const pool = [cand('a', []), cand('b', ['corridor-stair']), cand('c', [])];
        // No 'reach' failure anywhere ⇒ the helper must return the pool UNCHANGED (same ref
        // semantics: identical membership + order) so a compliant winner never changes.
        expect(preferReachComplete(pool)).toBe(pool);
    });

    it('no-op when EVERY candidate seals a room (never empties the pool)', () => {
        // If every least-bad candidate strands a bedroom, the engine still must ship one
        // (never empty) — the tiebreaker only narrows a PROPER non-empty subset.
        const pool = [cand('a', ['reach']), cand('b', ['reach', 'frontage'])];
        expect(preferReachComplete(pool)).toBe(pool);
    });

    it('keeps ALL reach-clean candidates (narrows the sealed ones only, deterministic order)', () => {
        const c1 = cand('x', ['frontage']);
        const c2 = cand('y', ['reach']);
        const c3 = cand('z', ['corridor-purity']);
        const narrowed = preferReachComplete([c1, c2, c3]);
        expect(narrowed).toEqual([c1, c3]);          // c2 (sealed) dropped; order preserved
    });

    it('is pure / deterministic — two calls on the same pool are identical', () => {
        const pool = [cand('a', ['reach']), cand('b', [])];
        expect(preferReachComplete(pool)).toEqual(preferReachComplete(pool));
    });
});

// ── End-to-end invariant: NO selected winner may ship a sealed habitable room when the
//    enumeration produced ANY reach-clean alternative. This is the founder's rule expressed
//    on the real pipeline output — a bedroom served through another habitable room must
//    never be the shipped winner. (When a hard-valid candidate exists the winner is already
//    reach-clean; this guards the all-hard-invalid fallback too.) ─────────────────────────
describe('§CIRCULATION-COMPLIANCE: enumerateLayouts never ships a sealed bedroom over a reach-clean sibling', () => {
    const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
    const PROGRAM: ApartmentProgram = {
        bedrooms: 2, bathrooms: 1, masterEnSuite: true,
        openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
    };
    const PLATE: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
    const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
        shellPolygon: PLATE, program: PROGRAM, levelId: 'L1', seed: 'circ-compliance',
        weights: WEIGHTS, count: 3, ...over,
    });

    it('the shipped winner never carries a `reach` hard-failure', () => {
        const out = enumerateLayouts(input());
        expect(out.length).toBeGreaterThan(0);
        // If ANY candidate exists that did not seal a room, the winner must be one of them.
        const anyReachClean = out.some(c => !c.hardFailedRules.includes('reach'));
        if (anyReachClean) {
            expect(out[0]!.hardFailedRules).not.toContain('reach');
        }
    });

    it('determinism preserved (ADR-0061) — two runs byte-identical', () => {
        const i = input();
        expect(JSON.stringify(enumerateLayouts(i))).toEqual(JSON.stringify(enumerateLayouts(i)));
    });
});
