// ADR-0383 §4a — ⭐ THE CROSS-LANE AGREEMENT CHECK: the payload MY surface builds is run through
// THEIR handler's own validator.
//
// ADR-0383 §4 / §4a · C16 CA-2 · C84 EI-9 · [[same-rule-two-implementations]] ·
// [[same-rule-two-implementations]]'s prescription: *"add a cross-model agreement check"*.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THIS FILE IS THE MOST VALUABLE ONE IN THE STAGE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Two lanes built the two halves of `spaceEnvelope.group.setStoreys` on the same day, separately,
// both coding against ADR-0383 §4a's table: lane MP-UI wrote the SURFACE resolver
// (`buildMassingGroupStoreyPlan`) and lane MP-SPINE wrote the HANDLER
// (`SetMassingGroupStoreysHandler`). Neither read the other's code while writing it.
//
// ⛔ AND `bus.registeredTypes` CANNOT CATCH A DISAGREEMENT BETWEEN THEM. The verb NAME matches, so
// an availability check passes while the payload SHAPE or its VALIDATION RULES differ — the
// surface renders a confident sentence, the user presses the button, and the handler refuses
// underneath. That is exactly [[same-rule-two-implementations]] in its worst form: *"the fix works
// for me and not for him"*, where the two implementations are two lanes' work meeting at runtime.
//
// ⭐ WRITING THIS FILE FOUND A REAL DIVERGENCE. The handler refuses `targetStoreys < 1` —
// *"a delete wearing a resize's name"* — and my resolver accepted 0 and would have built a plan
// for it. The surface now refuses first, in the handler's own words. That defect was invisible to
// every test on either side, because each side was self-consistent.
//
// ⚠ THE LIMIT: this runs the handler's `canExecute`, not its `execute`. It proves the payload is
// ACCEPTED, not that the resulting stack is right. The handler's own suite owns that half.

import { describe, it, expect } from 'vitest';
import {
    buildMassingGroupStoreyPlan,
    MASSING_GROUP_SET_STOREYS_VERB,
} from '../massingGroupStoreyPlan';
import { readMassingGroups, type MassingGroup } from '../massingGroupRoster';
import type { AdoptLevelCandidate } from '../adoptProposalAsEnvelope';
// ⭐ THE OTHER LANE'S HANDLER, IMPORTED DELIBERATELY — that is the entire point of this file. An
// L7 test importing L6 is a legal downward edge, and importing a COPY of the validator (or
// re-stating its rules here) would defeat the check: the thing being verified is that the REAL
// handler accepts the REAL payload.
//
// ⚠ `MassingGroupCommands` is not on the plugin's barrel, so this is a deep path. It is not a
// `@pryzm/plugin-space-envelope` import because the barrel does not re-export it, and adding it to
// the barrel is that lane's decision, not this one's.
// eslint-disable-next-line pryzm/no-legacy-src-import -- FALSE POSITIVE: the rule targets the
// legacy ROOT `src/` tree (PRYZM 1, deleted in Phase G). This is `plugins/space-envelope/src`, a
// workspace module. Silenced with its reason rather than left as standing noise — a warning
// everyone learns to scroll past is a warning that stops working.
import {
    SetMassingGroupStoreysHandler,
    type SetMassingGroupStoreysPayload,
} from '../../../../../../plugins/space-envelope/src/handlers/MassingGroupCommands';

const LEVELS: readonly AdoptLevelCandidate[] = [
    { id: 'L0', name: 'Ground', elevation: 0, height: 3 },
    { id: 'L1', name: 'Level 1', elevation: 3, height: 3 },
    { id: 'L2', name: 'Level 2', elevation: 6, height: 3 },
    { id: 'L3', name: 'Level 3', elevation: 9, height: 3 },
];
const NO_ORD = { maxHeightM: null, maxFloors: null };
const G = { id: 'g-a', label: 'Block A' };

const SQ = [[0, 0], [10, 0], [10, 10], [0, 10]] as const;

/** One record, in the shape BOTH sides read it. */
function envRec(id: string, levelId: string, baseOffset: number): Record<string, unknown> {
    return {
        id, role: 'level', levelId, baseOffset, height: 3, footprintAreaM2: 100,
        provenance: { origin: 'authored' }, group: G,
        footprint: SQ.map(([x, z]) => ({ x, y: 0, z })),
    };
}

/** The SURFACE's view, through the real roster reader. */
function surfaceGroup(recs: readonly Record<string, unknown>[]): MassingGroup {
    const m = new Map<string, unknown>();
    for (const r of recs) m.set(r.id as string, r);
    const roster = readMassingGroups({ getState: () => m as ReadonlyMap<string, unknown> }, LEVELS);
    if (!roster.readable) throw new Error('fixture unreadable');
    const g = roster.groups.find((x) => x.groupId === 'g-a');
    if (!g) throw new Error('no g-a');
    return g;
}

/** The HANDLER's view: `stores.spaceEnvelope` as a plain record map. */
function handlerCtx(recs: readonly Record<string, unknown>[]): { stores: { spaceEnvelope: Record<string, unknown> } } {
    const spaceEnvelope: Record<string, unknown> = {};
    for (const r of recs) spaceEnvelope[r.id as string] = r;
    return { stores: { spaceEnvelope } };
}

const handler = new SetMassingGroupStoreysHandler();

/**
 * The refusal text, narrowed. `ValidationResult` is a discriminated union whose `reason` lives only
 * on the INVALID arm, so reading it unguarded is a type error — and the reason it is worth a helper
 * rather than a cast is that the text is what makes a failing assertion diagnosable: without it a
 * red arm here says "expected true to be false" and nothing about WHY the handler refused.
 */
const why = (v: { readonly valid: boolean; readonly reason?: string }): string =>
    (v.valid ? '' : (v.reason ?? '(no reason given)'));

/** The refusal text for an assertion, or a marker when the handler unexpectedly ACCEPTED. */
const refusalOf = (v: { readonly valid: boolean; readonly reason?: string }): string =>
    (v.valid ? '(handler ACCEPTED — expected a refusal)' : (v.reason ?? ''));

/** Build a plan on the surface, then ask the handler whether it would accept it. */
function roundTrip(recs: readonly Record<string, unknown>[], target: number, ids: readonly string[]) {
    const plan = buildMassingGroupStoreyPlan({
        group: surfaceGroup(recs), levels: LEVELS, ordinance: NO_ORD,
        targetStoreys: target, mintedIds: ids,
    });
    if (!plan.ok) return { plan, verdict: null };
    const verdict = handler.canExecute(
        handlerCtx(recs) as never,
        plan.payload as unknown as SetMassingGroupStoreysPayload,
    );
    return { plan, verdict };
}

const TWO = [envRec('a0', 'L0', 0), envRec('a1', 'L1', 3)];

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('⭐ the two lanes agree on the verb NAME', () => {
    it('the surface dispatches exactly the type the handler registers', () => {
        expect(MASSING_GROUP_SET_STOREYS_VERB).toBe(handler.type);
    });
});

describe('⭐ every plan the surface calls OK is ACCEPTED by the handler', () => {
    it('GROW 2 → 4', () => {
        const { plan, verdict } = roundTrip(TWO, 4, ['m0', 'm1']);
        expect(plan.ok).toBe(true);
        expect(verdict, JSON.stringify(verdict)).not.toBeNull();
        expect(verdict!.valid, why(verdict!)).toBe(true);
    });

    it('GROW by one', () => {
        const { verdict } = roundTrip(TWO, 3, ['m0']);
        expect(verdict!.valid, why(verdict!)).toBe(true);
    });

    it('SHRINK 2 → 1, with an EMPTY added[]', () => {
        const { plan, verdict } = roundTrip(TWO, 1, []);
        expect(plan.ok).toBe(true);
        if (!plan.ok) throw new Error('unreachable');
        expect(plan.payload.added).toEqual([]);
        expect(verdict!.valid, why(verdict!)).toBe(true);
    });

    it('⭐ THE CROSS-CHECK THE HANDLER MAKES IS SATISFIED BY CONSTRUCTION', () => {
        // The handler refuses when `added.length !== target - current`, because *"the handler is
        // being asked to produce a stack of a size nobody decided"*. The surface's `added` is built
        // from exactly that difference, so the two numbers cannot drift — pinned here rather than
        // assumed, because it is the one thing a payload-shape check would not notice.
        for (const target of [3, 4]) {
            const { plan, verdict } = roundTrip(TWO, target, ['m0', 'm1', 'm2']);
            if (!plan.ok) throw new Error('unreachable');
            expect(plan.payload.added.length).toBe(target - 2);
            expect(verdict!.valid, why(verdict!)).toBe(true);
        }
    });

    it('the ids the surface mints are accepted as caller-minted and unique (C16 CA-2)', () => {
        const { plan, verdict } = roundTrip(TWO, 4, ['caller-a', 'caller-b']);
        if (!plan.ok) throw new Error('unreachable');
        expect(plan.payload.added.map((a) => a.spaceEnvelopeId)).toEqual(['caller-a', 'caller-b']);
        expect(verdict!.valid, why(verdict!)).toBe(true);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('⛔ AND WHERE THE HANDLER REFUSES, THE SURFACE REFUSES FIRST — never after the press', () => {
    // ⭐ THE ARM THAT FOUND THE BUG. Each of these is a state the HANDLER rejects; the surface must
    // reject it too, so the user reads the reason BEFORE pressing rather than watching a button do
    // nothing. A surface that built a confident plan here would be the [[fake-more-capable-than-real]]
    // shape pointed at the user.

    it('TARGET 0 — the divergence this file found', () => {
        // The handler: *"a building has at least one storey … a delete wearing a resize's name"*.
        // My resolver accepted 0 until this test was written.
        const { plan } = roundTrip(TWO, 0, []);
        expect(plan.ok).toBe(false);
        if (plan.ok) throw new Error('the surface must refuse 0');
        expect(plan.reason).toBe('zero-storeys');
        expect(plan.statement).toMatch(/delete wearing a resize/);
        // and the handler agrees, in its own words, on a hand-built payload
        const v = handler.canExecute(
            handlerCtx(TWO) as never,
            { groupId: 'g-a', targetStoreys: 0, added: [] } as SetMassingGroupStoreysPayload);
        expect(v.valid).toBe(false);
        expect(refusalOf(v)).toMatch(/at least one storey/);
    });

    it('NO CHANGE — both sides call it a no-op rather than spending a Ctrl+Z', () => {
        const { plan } = roundTrip(TWO, 2, []);
        expect(plan.ok).toBe(false);
        if (plan.ok) throw new Error('unreachable');
        expect(plan.reason).toBe('no-change');
        const v = handler.canExecute(
            handlerCtx(TWO) as never,
            { groupId: 'g-a', targetStoreys: 2, added: [] } as SetMassingGroupStoreysPayload);
        expect(v.valid).toBe(false);
        expect(refusalOf(v)).toMatch(/already has 2 storeys/);
    });

    it('A NON-WHOLE TARGET — refused on both sides', () => {
        const { plan } = roundTrip(TWO, 2.5, []);
        expect(plan.ok).toBe(false);
        if (plan.ok) throw new Error('unreachable');
        expect(plan.reason).toBe('not-a-count');
        const v = handler.canExecute(
            handlerCtx(TWO) as never,
            { groupId: 'g-a', targetStoreys: 2.5, added: [] } as SetMassingGroupStoreysPayload);
        expect(v.valid).toBe(false);
    });

    it('AN UNKNOWN GROUP — the surface cannot even build one, and the handler refuses it', () => {
        const v = handler.canExecute(
            handlerCtx(TWO) as never,
            { groupId: 'g-nope', targetStoreys: 3, added: [] } as SetMassingGroupStoreysPayload);
        expect(v.valid).toBe(false);
        expect(refusalOf(v)).toMatch(/no massing group/);
    });

    it('NOT ENOUGH FREE STOREYS — the surface refuses before a payload exists', () => {
        // The handler would accept any `added` whose length matches the difference; it is the
        // SURFACE that knows the project has no storey to seat them on (§4a: the surface resolves).
        // So this refusal has only one owner, and it is here.
        const { plan } = roundTrip(TWO, 9, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
        expect(plan.ok).toBe(false);
        if (plan.ok) throw new Error('unreachable');
        expect(plan.reason).toBe('not-enough-storeys');
    });
});
