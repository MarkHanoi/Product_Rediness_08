/**
 * §KEEPING-A-MASSING-OPTION-ACCUMULATES-INSTEAD-OF-REPLACING (L-13038, lane MASSING-REPLACE).
 *
 * ⭐ THE DEFECT, IN THE FOUNDER'S WORDS: *"WHEN I SELECT ANOTHER MASSING OPTION THE PREVIOUS ONE
 * SHALL BE REMOVED."* Three presses of "Keep this as a level envelope" left three level envelopes
 * on Ground, and the room solver then refused to guess between them.
 *
 * ⛔ THE REFUSAL WAS NEVER THE BUG AND IS NOT TOUCHED HERE (C58 §1.13). This suite pins the MINT:
 *   1. a second generated option REPLACES the first, on the SAME storey, in ONE command;
 *   2. ⛔ it does NOT replace an envelope the user authored — or one whose origin PRYZM cannot
 *      establish, which sits with `authored`, never with `computed` (C75 §1.4);
 *   3. other storeys are untouched;
 *   4. a store that could not be READ refuses — it is not an empty storey (§CONTEXT-DATA-HONESTY).
 */

import { describe, it, expect } from 'vitest';
import {
    authoredProvenance,
    provenancePredatingTheField,
    regeneratedProvenance,
    systemProvenance,
} from '@pryzm/schemas/provenance';
import {
    GENERATED_MASSING_RULE,
    OWN_AUTHORING_RULE,
    isReplaceableByGeneratedMassing,
    isReplaceableByOwnAuthoring,
    readLevelEnvelopes,
    resolveLevelEnvelopeSupersession,
    type ExistingLevelEnvelope,
} from '../levelEnvelopeSupersession';
import { buildAdoptProposalPlan, type AdoptLevelCandidate } from '../adoptProposalAsEnvelope';
import type { TargetFootprintProposal } from '../targetFootprintAreaSolver';

const GENERATED = systemProvenance('computed', 'fitted by the massing solver');

const row = (over: Partial<ExistingLevelEnvelope> = {}): ExistingLevelEnvelope => ({
    id: 'env-1',
    levelId: 'lvl-0',
    name: 'Proposed ground floor · 431 m²',
    footprintAreaM2: 431,
    provenance: GENERATED,
    ...over,
    // §MASSING-GROUPS (ADR-0383) — pinned AFTER the spread: `Partial<>` may carry
    // `group: undefined`, and ungrouped must be `null`, never absent.
    group: over.group ?? null,
});

// ─────────────────────────────────────────────────────────────────────────────
// THE RULE — who may be replaced
// ─────────────────────────────────────────────────────────────────────────────

describe('isReplaceableByGeneratedMassing', () => {
    it("PRYZM's own output is replaceable — computed, and a plate that already replaced one", () => {
        expect(isReplaceableByGeneratedMassing(GENERATED)).toBe(true);
        expect(isReplaceableByGeneratedMassing(regeneratedProvenance(GENERATED, 'again'))).toBe(true);
    });

    it('⛔ what the USER authored is NOT replaceable (C58 §1.19 / C75 §2.6)', () => {
        expect(isReplaceableByGeneratedMassing(authoredProvenance('drawn on the site view'))).toBe(false);
    });

    it('⛔ an UNKNOWN origin is NOT replaceable — unknown sits with authored, never with computed', () => {
        expect(isReplaceableByGeneratedMassing(provenancePredatingTheField())).toBe(false);
        expect(isReplaceableByGeneratedMassing(null)).toBe(false);
    });

    it('⛔ neither is an observed or inferred value — only PRYZM massing output qualifies', () => {
        expect(isReplaceableByGeneratedMassing(systemProvenance('observed', 'cadastre'))).toBe(false);
        expect(isReplaceableByGeneratedMassing(systemProvenance('inferred', 'default'))).toBe(false);
    });
});

describe('resolveLevelEnvelopeSupersession', () => {
    it('an empty storey creates and replaces nothing', () => {
        expect(resolveLevelEnvelopeSupersession([]).kind).toBe('none');
    });

    it('⭐ one generated envelope ⇒ REPLACE, and the sentence names it and the ONE undo', () => {
        const s = resolveLevelEnvelopeSupersession([row()]);
        if (s.kind !== 'replace') throw new Error(`expected replace, got ${s.kind}`);
        expect(s.ids).toEqual(['env-1']);
        expect(s.sentence).toContain('Proposed ground floor · 431 m²');
        expect(s.sentence).toContain('ONE undo');
    });

    it('⭐ THREE accumulated rivals are healed in ONE gesture — all three ids go', () => {
        const s = resolveLevelEnvelopeSupersession([
            row({ id: 'a', name: 'Proposed ground floor · 431 m²', footprintAreaM2: 431 }),
            row({ id: 'b', name: 'Proposed ground floor · 301 m²', footprintAreaM2: 301 }),
            row({ id: 'c', name: 'Proposed ground floor · 144 m²', footprintAreaM2: 144 }),
        ]);
        if (s.kind !== 'replace') throw new Error(`expected replace, got ${s.kind}`);
        expect(s.ids).toEqual(['a', 'b', 'c']);
        expect(s.sentence).toContain('3 level envelopes');
    });

    it('⛔ a HAND-AUTHORED envelope BLOCKS — nothing created, nothing deleted, reason given', () => {
        const s = resolveLevelEnvelopeSupersession([
            row({ id: 'mine', name: 'My massing', provenance: authoredProvenance('drawn by hand') }),
        ]);
        if (s.kind !== 'blocked') throw new Error(`expected blocked, got ${s.kind}`);
        expect(s.blockers.map((b) => b.id)).toEqual(['mine']);
        expect(s.sentence).toContain('will not delete');
        expect(s.sentence).toContain('Nothing was created and nothing was deleted');
        // It says WHY, in the vocabulary the record actually carries.
        expect(s.sentence).toContain('authored');
    });

    it('⛔ ONE authored envelope blocks the whole storey, even beside generated ones', () => {
        const s = resolveLevelEnvelopeSupersession([
            row({ id: 'gen' }),
            row({ id: 'mine', provenance: authoredProvenance() }),
        ]);
        expect(s.kind).toBe('blocked');
    });

    it('⛔ an envelope with NO provenance at all blocks, and says that is why', () => {
        const s = resolveLevelEnvelopeSupersession([row({ id: 'old', provenance: null })]);
        if (s.kind !== 'blocked') throw new Error(`expected blocked, got ${s.kind}`);
        expect(s.sentence).toContain('no origin recorded');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §ENVELOPE-DRAW R8 — the SIBLING rule: the user's own authoring replaces only itself
// ─────────────────────────────────────────────────────────────────────────────

describe('isReplaceableByOwnAuthoring', () => {
    it('⭐ ONLY authored qualifies — the user may replace what the user made', () => {
        expect(isReplaceableByOwnAuthoring(authoredProvenance('drawn on the 3D Site'))).toBe(true);
        expect(isReplaceableByOwnAuthoring(authoredProvenance())).toBe(true);
    });

    it('⛔ PRYZM\'s own plates are NOT replaceable by a drawing — computed and regenerated block', () => {
        expect(isReplaceableByOwnAuthoring(GENERATED)).toBe(false);
        expect(isReplaceableByOwnAuthoring(regeneratedProvenance(GENERATED, 'again'))).toBe(false);
    });

    it('⛔ null / unknown / predates-the-field block — unknown sits with "not mine"', () => {
        expect(isReplaceableByOwnAuthoring(null)).toBe(false);
        expect(isReplaceableByOwnAuthoring(provenancePredatingTheField())).toBe(false);
    });

    it('⛔ and the generated-massing rule is NOT widened by the sibling — a drawing still blocks it', () => {
        expect(isReplaceableByGeneratedMassing(authoredProvenance('drawn'))).toBe(false);
    });
});

describe('resolveLevelEnvelopeSupersession with OWN_AUTHORING_RULE', () => {
    it('the DEFAULT rule is the generated-massing one — the original sentences are unchanged', () => {
        const a = resolveLevelEnvelopeSupersession([row()]);
        const b = resolveLevelEnvelopeSupersession([row()], GENERATED_MASSING_RULE);
        expect(a).toEqual(b);
        if (a.kind !== 'replace') throw new Error(a.kind);
        expect(a.sentence).toContain('which PRYZM generated');
    });

    it('⭐ an authored envelope ⇒ REPLACE, and the sentence says the USER authored it, in one undo', () => {
        const s = resolveLevelEnvelopeSupersession(
            [row({ id: 'mine', name: 'Level envelope · Ground · 200 m²', provenance: authoredProvenance('extruded') })],
            OWN_AUTHORING_RULE,
        );
        if (s.kind !== 'replace') throw new Error(`expected replace, got ${s.kind}`);
        expect(s.ids).toEqual(['mine']);
        expect(s.sentence).toContain('which you authored earlier');
        expect(s.sentence).not.toContain('PRYZM generated');
        expect(s.sentence).toContain('ONE undo');
    });

    it('⛔ a GENERATED plate BLOCKS the user\'s authoring — with the route out, grammar for one', () => {
        const s = resolveLevelEnvelopeSupersession([row({ id: 'plate' })], OWN_AUTHORING_RULE);
        if (s.kind !== 'blocked') throw new Error(`expected blocked, got ${s.kind}`);
        expect(s.sentence).toContain('a level envelope that is not your own authoring');
        expect(s.sentence).toContain('a plate PRYZM fitted from a massing option');
        expect(s.sentence).toContain('Nothing was created and nothing was deleted');
        expect(s.sentence).toContain('Delete the one you do not want yourself');
    });

    it('⛔ two blockers read in the plural', () => {
        const s = resolveLevelEnvelopeSupersession([row({ id: 'a' }), row({ id: 'b' })], OWN_AUTHORING_RULE);
        if (s.kind !== 'blocked') throw new Error(s.kind);
        expect(s.sentence).toContain('2 level envelopes that are not your own authoring');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE READ — failure is not emptiness
// ─────────────────────────────────────────────────────────────────────────────

const storeWith = (records: readonly Record<string, unknown>[]) => ({
    getState: () => new Map(records.map((r) => [String(r.id), r])),
});

describe('readLevelEnvelopes', () => {
    it('⛔ NO STORE is an admission about PRYZM, never a finding that the storey is empty', () => {
        const r = readLevelEnvelopes(null);
        expect(r.readable).toBe(false);
        if (r.readable) return;
        expect(r.reason).toBe('no-store');
        expect(r.text).toContain('gap in PRYZM');
    });

    it('⛔ a THROWING store is its own arm — distinct from an empty one', () => {
        const r = readLevelEnvelopes({ getState: () => { throw new Error('boom'); } });
        expect(r.readable).toBe(false);
        if (r.readable) return;
        expect(r.reason).toBe('store-threw');
        expect(r.text).toContain('NOT a finding');
    });

    it('reads level envelopes with their provenance, and ignores rooms', () => {
        const r = readLevelEnvelopes(storeWith([
            {
                id: 'a', role: 'level', levelId: 'lvl-0', name: 'Proposed ground floor · 301 m²',
                footprintAreaM2: 301, provenance: { origin: 'computed', detail: 'x' },
            },
            { id: 'b', role: 'room', levelId: 'lvl-0', footprintAreaM2: 12 },
        ]));
        if (!r.readable) throw new Error('expected readable');
        expect(r.rows).toHaveLength(1);
        expect(r.rows[0]!.id).toBe('a');
        expect(r.rows[0]!.provenance?.origin).toBe('computed');
    });

    it('a record carrying no provenance reads NULL — not a fabricated origin', () => {
        const r = readLevelEnvelopes(storeWith([
            { id: 'a', role: 'level', levelId: 'lvl-0', footprintAreaM2: 50 },
        ]));
        if (!r.readable) throw new Error('expected readable');
        expect(r.rows[0]!.provenance).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE MINT — end to end through the planner the card actually calls
// ─────────────────────────────────────────────────────────────────────────────

const RING = [
    { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 },
];
const PROPOSAL: TargetFootprintProposal = {
    ok: true,
    ring: RING,
    achievedAreaM2: 100,
    targetAreaM2: 100,
    permittedAreaM2: 200,
    insetM: 1,
    statement: 'fitted',
};
const LEVELS: readonly AdoptLevelCandidate[] = [
    { id: 'lvl-0', name: 'Ground', elevation: 0, height: 3 },
    { id: 'lvl-1', name: 'Level 1', elevation: 3, height: 3 },
];
const ORD = { maxHeightM: 12, maxFloors: 4 };

describe('buildAdoptProposalPlan — the press that used to accumulate', () => {
    it('⭐ the SECOND option supersedes the first, in ONE command', () => {
        const r = buildAdoptProposalPlan(PROPOSAL, LEVELS, ORD, 'new-1', {
            readable: true,
            rows: [row({ id: 'first', levelId: 'lvl-0' })],
        });
        if (!r.ok) throw new Error(`expected a plan, got ${r.reason}`);
        expect(r.command).toBe('spaceEnvelope.batch.create');
        expect(r.payload.supersedes).toEqual(['first']);
        expect(r.payload.envelopes).toHaveLength(1);
        expect(r.replaces.map((e) => e.id)).toEqual(['first']);
        // The statement leads with the LOSS, before the verb that creates.
        expect(r.statement.startsWith('Replaces the level envelope')).toBe(true);
    });

    it('⭐ PER STOREY — an envelope on another storey is left alone', () => {
        const r = buildAdoptProposalPlan(PROPOSAL, LEVELS, ORD, 'new-1', {
            readable: true,
            rows: [row({ id: 'upstairs', levelId: 'lvl-1' })],
        });
        if (!r.ok) throw new Error(`expected a plan, got ${r.reason}`);
        expect(r.payload.supersedes).toEqual([]);
        expect(r.statement).toContain('Creates ONE level envelope');
    });

    it('⛔ REFUSES rather than destroying a hand-authored envelope on the target storey', () => {
        const r = buildAdoptProposalPlan(PROPOSAL, LEVELS, ORD, 'new-1', {
            readable: true,
            rows: [row({ id: 'mine', levelId: 'lvl-0', provenance: authoredProvenance('drawn') })],
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('rival-envelope-not-generated');
        expect(r.statement).toContain('will not delete');
    });

    it('⛔ REFUSES when the store could not be read — never creates blind', () => {
        const r = buildAdoptProposalPlan(PROPOSAL, LEVELS, ORD, 'new-1', {
            readable: false, reason: 'no-store', text: 'no store here',
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('envelopes-unreadable');
    });

    it('stamps the record so the NEXT press can tell it apart from a drawing', () => {
        const fresh = buildAdoptProposalPlan(PROPOSAL, LEVELS, ORD, 'new-1', { readable: true, rows: [] });
        if (!fresh.ok) throw new Error('expected a plan');
        expect(fresh.payload.envelopes[0].provenance.origin).toBe('computed');

        // …and a replacement records WHAT IT REPLACED (C75 §2.7).
        const again = buildAdoptProposalPlan(PROPOSAL, LEVELS, ORD, 'new-2', {
            readable: true, rows: [row({ id: 'first', levelId: 'lvl-0' })],
        });
        if (!again.ok) throw new Error('expected a plan');
        expect(again.payload.envelopes[0].provenance.origin).toBe('regenerated');
        expect(again.payload.envelopes[0].provenance.replaced?.origin).toBe('computed');
    });

    it('⭐ the plate it stamps is one IT can replace next time — the loop closes', () => {
        const first = buildAdoptProposalPlan(PROPOSAL, LEVELS, ORD, 'new-1', { readable: true, rows: [] });
        if (!first.ok) throw new Error('expected a plan');
        expect(isReplaceableByGeneratedMassing(first.payload.envelopes[0].provenance)).toBe(true);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ §MASSING-GROUPS (ADR-0383 D3) — BLOCK A AND BLOCK B ARE PEERS, NOT RIVALS
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ WHY THESE ARMS HAD TO BE WRITTEN SEPARATELY, AND WHY THE 120 GREEN TESTS ABOVE DID NOT COVER
// THIS. Every fixture above carries `group: null`. They therefore pin ADR-0383 D3's
// BACK-COMPATIBILITY claim — "ungrouped behaves exactly as before" — which is real and worth
// pinning, and they pin NOTHING about the new behaviour. A suite that goes green on a feature it
// never exercises is the shape [[gate-blind-on-the-wrong-axis]] names: green ≠ right.
//
// The founder's requirement is one sentence: *"multiple envelopes on a single parcel for
// masterplanning"*. Before ADR-0383, drawing Block B on a storey Block A already occupied either
// DELETED Block A (`kind:'replace'`) or refused (`kind:'blocked'`) — because the rule was
// `levelId`-only. These arms are the ones that would go red if that ever came back.

const grouped = (
    groupId: string,
    label: string,
    over: Partial<ExistingLevelEnvelope> = {},
): ExistingLevelEnvelope => row({ ...over, group: { id: groupId, label } });

describe('§MASSING-GROUPS — supersession is scoped to ONE building', () => {
    it('⭐ Block B does NOT touch Block A on the same storey — the whole feature, in one arm', () => {
        const blockA = grouped('g-a', 'Block A', { id: 'a-ground' });
        const s = resolveLevelEnvelopeSupersession([blockA], GENERATED_MASSING_RULE, 'g-b');
        expect(s.kind).toBe('none');
    });

    it('Block B DOES replace its own earlier envelope on that storey', () => {
        const blockA = grouped('g-a', 'Block A', { id: 'a-ground' });
        const blockB = grouped('g-b', 'Block B', { id: 'b-ground' });
        const s = resolveLevelEnvelopeSupersession([blockA, blockB], GENERATED_MASSING_RULE, 'g-b');
        expect(s.kind).toBe('replace');
        if (s.kind !== 'replace') throw new Error('unreachable');
        // ⛔ ONLY b-ground. If `a-ground` ever appears here, the master plan is being deleted.
        expect([...s.ids]).toEqual(['b-ground']);
    });

    it('⭐ the sentence NAMES the block, and says the others are untouched', () => {
        const s = resolveLevelEnvelopeSupersession(
            [grouped('g-a', 'Block A', { id: 'a1' }), grouped('g-b', 'Block B', { id: 'b1' })],
            GENERATED_MASSING_RULE,
            'g-b',
        );
        if (s.kind !== 'replace') throw new Error('expected replace');
        expect(s.sentence).toContain('Block B');
        expect(s.sentence).toContain('untouched');
    });

    it('a single-building project reads EXACTLY as before — no block name, no peer note', () => {
        const s = resolveLevelEnvelopeSupersession([row({ id: 'only' })], GENERATED_MASSING_RULE, null);
        if (s.kind !== 'replace') throw new Error('expected replace');
        expect(s.sentence).toContain('already on this storey');
        expect(s.sentence).not.toContain('untouched');
    });

    it('⛔ UNGROUPED is its own bucket — a grouped create never sweeps a pre-ADR-0383 envelope', () => {
        const legacy = row({ id: 'pre-adr' }); // group: null — every record written before today
        expect(resolveLevelEnvelopeSupersession([legacy], GENERATED_MASSING_RULE, 'g-a').kind).toBe('none');
    });

    it('⛔ …and the reverse: an UNGROUPED create never sweeps a master-plan block', () => {
        const blockA = grouped('g-a', 'Block A', { id: 'a-ground' });
        expect(resolveLevelEnvelopeSupersession([blockA], GENERATED_MASSING_RULE, null).kind).toBe('none');
    });

    it('the group bucket is applied BEFORE the provenance rule, so a peer cannot BLOCK either', () => {
        // An AUTHORED envelope in another block would block a generated create if the buckets were
        // merged. It must not even be considered — it is not on the table.
        const otherBlocksDrawing = grouped('g-a', 'Block A', { id: 'a-hand', provenance: authoredProvenance('drew it') });
        const s = resolveLevelEnvelopeSupersession([otherBlocksDrawing], GENERATED_MASSING_RULE, 'g-b');
        expect(s.kind).toBe('none');
    });

    it('within ONE block the provenance rule still governs — grouping is not a licence to delete', () => {
        const mine = grouped('g-b', 'Block B', { id: 'b-hand', provenance: authoredProvenance('drew it') });
        const s = resolveLevelEnvelopeSupersession([mine], GENERATED_MASSING_RULE, 'g-b');
        expect(s.kind).toBe('blocked');
    });
});

describe('§MASSING-GROUPS — readLevelEnvelopes reads the group as strictly as the id', () => {
    const store = (recs: readonly Record<string, unknown>[]) => ({
        getState: () => new Map(recs.map((r) => [String(r.id), r])),
    });
    const base = { role: 'level', levelId: 'L0', name: 'x', footprintAreaM2: 1, provenance: { origin: 'computed' } };

    it('a well-formed group is carried through', () => {
        const r = readLevelEnvelopes(store([{ ...base, id: 'e1', group: { id: 'g', label: 'Block A' } }]));
        if (!r.readable) throw new Error('expected readable');
        expect(r.rows[0]?.group).toEqual({ id: 'g', label: 'Block A' });
    });

    it('an ABSENT group reads null — ungrouped, the pre-ADR-0383 record', () => {
        const r = readLevelEnvelopes(store([{ ...base, id: 'e1' }]));
        if (!r.readable) throw new Error('expected readable');
        expect(r.rows[0]?.group).toBeNull();
    });

    it('⛔ a MALFORMED group DROPS the row — it must never be coerced into the ungrouped bucket', () => {
        // §CONTEXT-DATA-HONESTY (L-581/L-616). Reading `{id:"g"}` (no label) as `null` would file a
        // master-plan block under the single-building flow and make it eligible for deletion by a
        // gesture that never meant to touch it. A failure and an emptiness must not share a value.
        const r = readLevelEnvelopes(store([
            { ...base, id: 'ok', group: { id: 'g', label: 'Block A' } },
            { ...base, id: 'bad-no-label', group: { id: 'g' } },
            { ...base, id: 'bad-not-object', group: 'Block A' },
        ]));
        if (!r.readable) throw new Error('expected readable');
        expect(r.rows.map((x) => x.id)).toEqual(['ok']);
    });
});
