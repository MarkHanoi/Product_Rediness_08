// ADR-0383 §4a (lane MP-UI, 2026-09-09) — THE SURFACE-SIDE STOREY RESOLVER'S BINDING ARMS.
//
// ADR-0383 §4 / §4a / D5 / D7 · C16 CA-2 · C58 §1.4 · §BASE-OFFSET-IS-ABSOLUTE (L-13286) ·
// §WHOSE-FOOTPRINT-IS-THE-SLAB (L-13296) · [[refusing-half-needs-its-escape-hatch]].
//
// ⚠ WHAT THIS FILE CANNOT PROVE, SAID FIRST. `spaceEnvelope.group.setStoreys` DOES NOT EXIST —
// measured 2026-09-09, `SPACE_ENVELOPE_HANDLER_TYPES` is 7 verbs and none is a group verb. So every
// arm here pins the PAYLOAD THE SURFACE WOULD SEND, and none of them proves a handler consumes it.
// ⛔ When S4 lands, one arm is owed that this file cannot carry: that the handler copies the ring
// this module NAMES (§4a(b) puts the copy in the handler and the disclosure here, which is one rule
// described in two places — tolerable only while something eventually checks it).

import { describe, it, expect } from 'vitest';
import {
    buildMassingGroupStoreyPlan,
    MASSING_GROUP_SET_STOREYS_VERB,
} from '../massingGroupStoreyPlan';
import { readMassingGroups, type MassingGroup } from '../massingGroupRoster';
import type { AdoptLevelCandidate } from '../adoptProposalAsEnvelope';

const LEVELS: readonly AdoptLevelCandidate[] = [
    { id: 'L0', name: 'Ground', elevation: 0, height: 3 },
    { id: 'L1', name: 'Level 1', elevation: 3, height: 3 },
    { id: 'L2', name: 'Level 2', elevation: 6, height: 3 },
    { id: 'L3', name: 'Level 3', elevation: 9, height: 3 },
];
const NO_ORD = { maxHeightM: null, maxFloors: null };
const G = { id: 'g-a', label: 'Block A' };

type Ring = readonly (readonly [number, number])[];
const SQ = (s: number): Ring => [[0, 0], [s, 0], [s, s], [0, s]];

function envRec(id: string, levelId: string, ring: Ring, areaM2: number): Record<string, unknown> {
    return {
        id, role: 'level', levelId, footprintAreaM2: areaM2,
        provenance: { origin: 'authored' }, group: G, height: 3,
        footprint: ring.map(([x, z]) => ({ x, y: 0, z })),
    };
}

/** Build a real `MassingGroup` through the REAL reader — never a hand-rolled literal. */
function groupOf(recs: readonly Record<string, unknown>[]): MassingGroup {
    const m = new Map<string, unknown>();
    for (const r of recs) m.set(r.id as string, r);
    const roster = readMassingGroups({ getState: () => m as ReadonlyMap<string, unknown> }, LEVELS);
    if (!roster.readable) throw new Error('fixture unreadable');
    const g = roster.groups.find((x) => x.groupId === 'g-a');
    if (!g) throw new Error('fixture has no g-a');
    return g;
}

/** A two-storey Block A whose rings MATCH (10 × 10 = 100 m² on both). */
const flat = () => groupOf([
    envRec('a0', 'L0', SQ(10), 100),
    envRec('a1', 'L1', SQ(10), 100),
]);

/** A two-storey Block A that is SET BACK at the top (100 m² → 64 m²). */
const setBack = () => groupOf([
    envRec('a0', 'L0', SQ(10), 100),
    envRec('a1', 'L1', SQ(8), 64),
]);

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `minted-${i}`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('GROW — the surface resolves which storeys, and the payload is §4a’s exact shape', () => {
    it('2 → 4 emits the verb with added[] carrying id / levelId / baseOffset / height', () => {
        const r = buildMassingGroupStoreyPlan({
            group: flat(), levels: LEVELS, ordinance: NO_ORD, targetStoreys: 4, mintedIds: ids(2),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) throw new Error('unreachable');
        expect(r.command).toBe(MASSING_GROUP_SET_STOREYS_VERB);
        expect(r.direction).toBe('grow');
        expect(r.delta).toBe(2);
        expect(r.payload.groupId).toBe('g-a');
        expect(r.payload.targetStoreys).toBe(4);
        expect(r.payload.added).toHaveLength(2);
        // ⭐ THE STOREYS ARE THE FREE ONES ABOVE THE TOP, IN ELEVATION ORDER.
        expect(r.payload.added.map((a) => a.levelId)).toEqual(['L2', 'L3']);
        // ⛔ §BASE-OFFSET-IS-ABSOLUTE (L-13286) — the seat is the storey's ELEVATION, full stop.
        // Adding a relative offset to it counted the elevation twice and produced a false
        // "your building is too tall" refusal.
        expect(r.payload.added.map((a) => a.baseOffset)).toEqual([6, 9]);
        expect(r.payload.added.every((a) => a.height === 3)).toBe(true);
    });

    it('⛔ THE IDS ARE THE CALLER’S, IN ORDER — C16 CA-2, because redo re-runs execute()', () => {
        const r = buildMassingGroupStoreyPlan({
            group: flat(), levels: LEVELS, ordinance: NO_ORD, targetStoreys: 4,
            mintedIds: ['caller-x', 'caller-y', 'caller-unused'],
        });
        if (!r.ok) throw new Error('unreachable');
        expect(r.payload.added.map((a) => a.spaceEnvelopeId)).toEqual(['caller-x', 'caller-y']);
    });

    it('too FEW minted ids ⇒ a refusal that admits a WIRING fault, not a design one', () => {
        const r = buildMassingGroupStoreyPlan({
            group: flat(), levels: LEVELS, ordinance: NO_ORD, targetStoreys: 4, mintedIds: ['only-one'],
        });
        expect(r.ok).toBe(false);
        if (r.ok) throw new Error('unreachable');
        expect(r.reason).toBe('too-few-ids');
        expect(r.statement).toMatch(/gap in PRYZM's wiring, not a refusal about your design/);
    });

    it('a storey ALREADY occupied by this group is never offered twice', () => {
        const g = groupOf([
            envRec('a0', 'L0', SQ(10), 100),
            envRec('a2', 'L2', SQ(10), 100),   // a gap at L1, and the top is L2
        ]);
        const r = buildMassingGroupStoreyPlan({
            group: g, levels: LEVELS, ordinance: NO_ORD, targetStoreys: 3, mintedIds: ids(1),
        });
        if (!r.ok) throw new Error('unreachable');
        // ⛔ L1 is FREE but BELOW the top — growing stacks onto what is there, it does not backfill.
        expect(r.payload.added.map((a) => a.levelId)).toEqual(['L3']);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('SHRINK — ONE verb for both directions, and added[] is EMPTY', () => {
    it('4 → 1 removes from the top, names what goes, and carries no geometry', () => {
        const g = groupOf([
            envRec('a0', 'L0', SQ(10), 100),
            envRec('a1', 'L1', SQ(10), 100),
            envRec('a2', 'L2', SQ(10), 100),
            envRec('a3', 'L3', SQ(10), 100),
        ]);
        const r = buildMassingGroupStoreyPlan({
            group: g, levels: LEVELS, ordinance: NO_ORD, targetStoreys: 1, mintedIds: [],
        });
        if (!r.ok) throw new Error('unreachable');
        expect(r.direction).toBe('shrink');
        expect(r.delta).toBe(3);
        // ⛔ §4a: "added is empty when the target is a SHRINK; the handler removes from the top and
        // does not need geometry to do it."
        expect(r.payload.added).toEqual([]);
        // Top-first, and NAMED — a user pressing a number should read which drawings vanish.
        expect(r.removing.map((s) => s.levelId)).toEqual(['L3', 'L2', 'L1']);
        expect(r.statement).toContain('Level 3');
        expect(r.statement).toMatch(/One undo puts them back/);
    });

    it('the SAME verb serves both directions — never addStorey + removeStorey', () => {
        // ADR-0383 §4: two verbs would let a surface implement "3 to 6" as three dispatches and
        // spend three Ctrl+Zs on one gesture.
        const grow = buildMassingGroupStoreyPlan({
            group: flat(), levels: LEVELS, ordinance: NO_ORD, targetStoreys: 3, mintedIds: ids(1),
        });
        const shrink = buildMassingGroupStoreyPlan({
            group: flat(), levels: LEVELS, ordinance: NO_ORD, targetStoreys: 1, mintedIds: [],
        });
        if (!grow.ok || !shrink.ok) throw new Error('unreachable');
        expect(grow.command).toBe(shrink.command);
        expect(grow.command).toBe('spaceEnvelope.group.setStoreys');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('REFUSALS — each one names the way out, and D5 keeps project-wide apart from per-profile', () => {
    it('the UNGROUPED bucket refuses, because no group verb can address a null id', () => {
        const m = new Map<string, unknown>();
        m.set('u0', { id: 'u0', role: 'level', levelId: 'L0', footprintAreaM2: 100,
            provenance: { origin: 'authored' } });
        const roster = readMassingGroups({ getState: () => m as ReadonlyMap<string, unknown> }, LEVELS);
        if (!roster.readable) throw new Error('unreachable');
        const r = buildMassingGroupStoreyPlan({
            group: roster.groups[0]!, levels: LEVELS, ordinance: NO_ORD, targetStoreys: 3, mintedIds: ids(2),
        });
        expect(r.ok).toBe(false);
        if (r.ok) throw new Error('unreachable');
        expect(r.reason).toBe('ungrouped');
    });

    it('⭐ D5 PROJECT-WIDE: not enough storeys ⇒ refuse, and SAY how to make it possible', () => {
        // [[refusing-half-needs-its-escape-hatch]] (L-942): a gate whose "yes" branch is unreachable
        // is a regression with a citation attached. This one names the next action.
        const r = buildMassingGroupStoreyPlan({
            group: flat(), levels: LEVELS, ordinance: NO_ORD, targetStoreys: 9, mintedIds: ids(7),
        });
        expect(r.ok).toBe(false);
        if (r.ok) throw new Error('unreachable');
        expect(r.reason).toBe('not-enough-storeys');
        expect(r.statement).toContain('2 free storeys');       // L2 and L3
        expect(r.statement).toMatch(/Add the storeys to the project first/);
        expect(r.statement).toMatch(/Nothing was changed/);
    });

    it('a target EQUAL to the current count is "no-change", not an error and not a dispatch', () => {
        const r = buildMassingGroupStoreyPlan({
            group: flat(), levels: LEVELS, ordinance: NO_ORD, targetStoreys: 2, mintedIds: [],
        });
        expect(r.ok).toBe(false);
        if (r.ok) throw new Error('unreachable');
        expect(r.reason).toBe('no-change');
    });

    it('a non-whole or negative target is refused before anything is resolved', () => {
        for (const t of [2.5, -1, Number.NaN]) {
            const r = buildMassingGroupStoreyPlan({
                group: flat(), levels: LEVELS, ordinance: NO_ORD, targetStoreys: t, mintedIds: ids(4),
            });
            expect(r.ok).toBe(false);
            if (r.ok) throw new Error('unreachable');
            expect(r.reason).toBe('not-a-count');
        }
    });

    it('above the batch ceiling refuses with the SAME ceiling the envelope batch carries', () => {
        const r = buildMassingGroupStoreyPlan({
            group: flat(), levels: LEVELS, ordinance: NO_ORD, targetStoreys: 999, mintedIds: ids(997),
        });
        expect(r.ok).toBe(false);
        if (r.ok) throw new Error('unreachable');
        expect(r.reason).toBe('above-batch-limit');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('⭐ §4a(b) — the ring disclosure fires ONLY when the choice changes the building', () => {
    // *"ask or disclose only when the ambiguity is REAL, because a message the user must dismiss on
    //  every press is a message they stop reading."*

    it('EVERY ring matching ⇒ ringAssumption is null and the surface says nothing', () => {
        const r = buildMassingGroupStoreyPlan({
            group: flat(), levels: LEVELS, ordinance: NO_ORD, targetStoreys: 3, mintedIds: ids(1),
        });
        if (!r.ok) throw new Error('unreachable');
        expect(r.ringAssumption).toBeNull();
    });

    it('a SET-BACK top ⇒ disclosed, naming the ring used AND the alternative, with both numbers', () => {
        const r = buildMassingGroupStoreyPlan({
            group: setBack(), levels: LEVELS, ordinance: NO_ORD, targetStoreys: 3, mintedIds: ids(1),
        });
        if (!r.ok) throw new Error('unreachable');
        expect(r.ringAssumption).not.toBeNull();
        const a = r.ringAssumption!;
        expect(a.fromLevelLabel).toBe('Level 1');       // the TOP-seated member
        expect(a.groundLevelLabel).toBe('Ground');
        expect(Math.round(a.fromAreaM2)).toBe(64);
        expect(Math.round(a.groundAreaM2)).toBe(100);
        // ⛔ It says WHY, in the founder's terms: a set-back already drawn is kept, not undone.
        expect(a.sentence).toMatch(/set-back you have already drawn is kept rather than undone/);
        expect(a.sentence).toContain('64 m²');
        expect(a.sentence).toContain('100 m²');
    });

    it('a SHRINK never discloses a ring — nothing is copied', () => {
        const r = buildMassingGroupStoreyPlan({
            group: setBack(), levels: LEVELS, ordinance: NO_ORD, targetStoreys: 1, mintedIds: [],
        });
        if (!r.ok) throw new Error('unreachable');
        expect(r.ringAssumption).toBeNull();
    });

    it('a ONE-storey block never discloses — top and ground are the same envelope', () => {
        const g = groupOf([envRec('a0', 'L0', SQ(10), 100)]);
        const r = buildMassingGroupStoreyPlan({
            group: g, levels: LEVELS, ordinance: NO_ORD, targetStoreys: 2, mintedIds: ids(1),
        });
        if (!r.ok) throw new Error('unreachable');
        expect(r.ringAssumption).toBeNull();
    });
});
