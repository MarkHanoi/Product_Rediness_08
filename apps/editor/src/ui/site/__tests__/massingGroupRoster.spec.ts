// ADR-0383 S7 (lane MP-UI, 2026-09-09) — THE READER'S BINDING ARMS.
//
// ADR-0383 D1 point 3 / D4 · C84 EI-9 · C58 §1.4 · §CONTEXT-DATA-HONESTY (L-581 / L-616) ·
// C73 §C73-POLY-BOOLEAN / GE-05.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE LIMIT OF THIS FILE, STATED BEFORE ITS FIRST ASSERTION — [[fake-more-capable-than-real]]
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Every fixture here builds a MULTI-GROUP store directly, and at the time of writing **no user
// gesture could produce one**. ⚠ THAT IS A MOVING FACT AND THIS COMMENT MUST NOT BE READ AS THE
// CURRENT ONE — CLAUDE.md's most-repeated lesson is that a transcribed count rots. **Re-measure:**
//   `grep -n 'group' plugins/space-envelope/src/handlers/CreateSpaceEnvelopeBatch.ts`
//   `sed -n '29,40p' plugins/space-envelope/src/handlers/index.ts`   # the verb roster
//
// Measured 2026-09-09 while writing this file, in two readings hours apart: the create spec first
// carried **no `group` field** at all, and by the second reading lane MP-SPINE had added one while
// the three `spaceEnvelope.group.*` verbs were **still absent** (`SPACE_ENVELOPE_HANDLER_TYPES` = 7,
// none of them a group verb). The ladder is being climbed underneath this file.
//
// So a fixture here may be MORE CAPABLE THAN THE PRODUCT, which is exactly the hazard
// [[fake-more-capable-than-real]] names: a fake built to the header cannot falsify the header.
// ⛔ These arms therefore prove the READER is correct over a store that holds groups. They do NOT
// prove any user can reach that state. **When the create path and the group verbs are both live,
// re-run this reader against a store built by the REAL create path** — that is the arm this file
// cannot yet carry, and saying so is not a caveat, it is the finding.
//
// What IS fully real here: the single-group (`group: null`) arms. That is every project today.

import { describe, it, expect } from 'vitest';
import {
    readMassingGroups,
    readMassingGroupRef,
    findMassingGroupOverlaps,
    liveMassingGroupIds,
    resolveGroupOfEnvelope,
    describeMassingGroupStorey,
    UNGROUPED_MASSING_LABEL,
    type MassingGroupRosterResult,
} from '../massingGroupRoster';
import type { AdoptLevelCandidate } from '../adoptProposalAsEnvelope';
import { collectIntendedAreas } from '../intendedAreaChannel';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Fixtures. A record is shaped exactly as `readLevelEnvelopes` + the roster's second projection
// read it: `role`/`id`/`levelId` are load-bearing, `provenance` must carry an `origin`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Ring = readonly (readonly [number, number])[];

const SQ_10: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
/** Overlaps SQ_10 on exactly 5 × 10 = 50 m². */
const SQ_10_SHIFTED: Ring = [[5, 0], [15, 0], [15, 10], [5, 10]];
/** Clear of SQ_10 entirely. */
const SQ_10_FAR: Ring = [[100, 0], [110, 0], [110, 10], [100, 10]];
/** A bowtie — the kernel refuses this with `self-intersecting-input`. */
const BOWTIE: Ring = [[0, 0], [10, 10], [10, 0], [0, 10]];

function ringToFootprint(r: Ring): { x: number; y: number; z: number }[] {
    return r.map(([x, z]) => ({ x, y: 0, z }));
}

interface RecSpec {
    readonly id: string;
    readonly levelId: string;
    readonly group?: { id: string; label: string } | null;
    readonly areaM2?: number | null;
    readonly ring?: Ring | null;
    readonly height?: number | null;
    readonly baseOffset?: number | null;
    readonly name?: string | null;
    readonly role?: string;
}

function rec(s: RecSpec): Record<string, unknown> {
    const out: Record<string, unknown> = {
        id: s.id,
        role: s.role ?? 'level',
        levelId: s.levelId,
        provenance: { origin: 'authored' },
    };
    if (s.name !== undefined) out.name = s.name;
    if (s.group !== undefined && s.group !== null) out.group = s.group;
    if (s.areaM2 !== undefined) { if (s.areaM2 !== null) out.footprintAreaM2 = s.areaM2; }
    else out.footprintAreaM2 = 100;
    if (s.ring !== undefined) { if (s.ring !== null) out.footprint = ringToFootprint(s.ring); }
    if (s.height !== undefined && s.height !== null) out.height = s.height;
    if (s.baseOffset !== undefined && s.baseOffset !== null) out.baseOffset = s.baseOffset;
    return out;
}

function store(recs: readonly Record<string, unknown>[]) {
    const m = new Map<string, unknown>();
    for (const r of recs) m.set(r.id as string, r);
    return { getState: () => m as ReadonlyMap<string, unknown> };
}

const LEVELS: readonly AdoptLevelCandidate[] = [
    { id: 'L0', name: 'Ground', elevation: 0, height: 3 },
    { id: 'L1', name: 'Level 1', elevation: 3, height: 3 },
    { id: 'L2', name: 'Level 2', elevation: 6, height: 3 },
];

const A = { id: 'g-a', label: 'Block A' };
const B = { id: 'g-b', label: 'Block B' };

const groupsOf = (r: MassingGroupRosterResult) => (r.readable ? r.groups : []);

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('readMassingGroups — a FAILURE and an EMPTINESS are three distinct values', () => {
    // §CONTEXT-DATA-HONESTY (L-581/L-616): the defect this repo repeats most is "the source did not
    // answer" and "there is nothing here" arriving as the same value. These three arms are the
    // whole point of the reader's two-armed result type, so they are pinned by IDENTITY of arm,
    // never by "is it falsy".

    it('no store ⇒ readable:false / no-store, and the text REFUSES to be read as an empty parcel', () => {
        const r = readMassingGroups(null, LEVELS);
        expect(r.readable).toBe(false);
        if (r.readable) throw new Error('unreachable');
        expect(r.reason).toBe('no-store');
        expect(r.text).toMatch(/NOT a finding that this parcel holds no buildings/);
        // ⛔ THE BINDING HALF: it must not be reachable as "zero groups".
        expect((r as unknown as { groups?: unknown }).groups).toBeUndefined();
    });

    it('a store whose getState() THROWS ⇒ store-threw — a DIFFERENT value from no-store', () => {
        const thrower = { getState: () => { throw new Error('boom'); } };
        const r = readMassingGroups(thrower as never, LEVELS);
        expect(r.readable).toBe(false);
        if (r.readable) throw new Error('unreachable');
        expect(r.reason).toBe('store-threw');
        // The two failures must not collapse into one another.
        const other = readMassingGroups(null, LEVELS);
        expect(other.readable).toBe(false);
        if (other.readable) throw new Error('unreachable');
        expect(r.reason).not.toBe(other.reason);
        expect(r.text).not.toBe(other.text);
    });

    it('a genuinely EMPTY project ⇒ readable:TRUE with zero groups — not a failure', () => {
        const r = readMassingGroups(store([]), LEVELS);
        expect(r.readable).toBe(true);
        if (!r.readable) throw new Error('unreachable');
        expect(r.groups).toEqual([]);
        expect(r.memberCount).toBe(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('readMassingGroups — bucketing, ordering and the ungrouped residue', () => {
    it('every envelope ungrouped ⇒ exactly ONE bucket, groupId null, the declared label', () => {
        // ⭐ THIS IS THE ONLY STATE THE PRODUCT CAN CURRENTLY REACH (see the file header).
        const r = readMassingGroups(store([
            rec({ id: 'e0', levelId: 'L0' }),
            rec({ id: 'e1', levelId: 'L1' }),
        ]), LEVELS);
        const gs = groupsOf(r);
        expect(gs).toHaveLength(1);
        expect(gs[0]!.groupId).toBeNull();
        expect(gs[0]!.label).toBe(UNGROUPED_MASSING_LABEL);
        expect(gs[0]!.storeyCount).toBe(2);
    });

    it('two groups + an ungrouped residue ⇒ named groups by label, UNGROUPED LAST', () => {
        const r = readMassingGroups(store([
            rec({ id: 'b0', levelId: 'L0', group: B }),
            rec({ id: 'a0', levelId: 'L0', group: A }),
            rec({ id: 'u0', levelId: 'L0' }),
        ]), LEVELS);
        const gs = groupsOf(r);
        expect(gs.map((g) => g.label)).toEqual(['Block A', 'Block B', UNGROUPED_MASSING_LABEL]);
        expect(gs[2]!.groupId).toBeNull();
    });

    it('storeys sort LOWEST FIRST, and an unresolvable elevation sorts LAST — never as the plate', () => {
        // A storey PRYZM cannot place must not be drawn at the bottom of the stack as though it
        // were the ground plate. That is a §L-616 overstatement in sort order.
        const r = readMassingGroups(store([
            rec({ id: 'e2', levelId: 'L2', group: A }),
            rec({ id: 'eX', levelId: 'L-not-in-store', group: A }),
            rec({ id: 'e0', levelId: 'L0', group: A }),
        ]), LEVELS);
        const g = groupsOf(r)[0]!;
        expect(g.storeys.map((s) => s.spaceEnvelopeId)).toEqual(['e0', 'e2', 'eX']);
        expect(g.storeys[2]!.levelName).toBeNull();
        expect(g.storeys[2]!.elevationM).toBeNull();
    });

    it('footprintAreaM2 is the LOWEST-seated storey, not an average and not the largest', () => {
        const r = readMassingGroups(store([
            rec({ id: 'e0', levelId: 'L0', group: A, areaM2: 300 }),
            rec({ id: 'e1', levelId: 'L1', group: A, areaM2: 900 }),
        ]), LEVELS);
        const g = groupsOf(r)[0]!;
        expect(g.footprintAreaM2).toBe(300);
        expect(g.totalIntendedM2).toBe(1200);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('readMassingGroups — the label DISAGREEMENT is reported, never voted on', () => {
    // ADR-0383 D1 names `label` as the denormalised field that can drift, and point 3 makes the
    // READER responsible: it takes the lowest-seated member's spelling and REPORTS every rival
    // rather than silently picking one. A drift becomes visible, not invisible.

    it('agreeing members ⇒ labelDisagreement is null', () => {
        const r = readMassingGroups(store([
            rec({ id: 'e0', levelId: 'L0', group: A }),
            rec({ id: 'e1', levelId: 'L1', group: A }),
        ]), LEVELS);
        expect(groupsOf(r)[0]!.labelDisagreement).toBeNull();
    });

    it('drifted members ⇒ EVERY distinct spelling, the lowest-seated one FIRST', () => {
        const r = readMassingGroups(store([
            // Seeded out of order on purpose: the answer must come from ELEVATION, not from
            // insertion order into the store map.
            rec({ id: 'e2', levelId: 'L2', group: { id: 'g-a', label: 'Block A (old)' } }),
            rec({ id: 'e1', levelId: 'L1', group: { id: 'g-a', label: 'Tower A' } }),
            rec({ id: 'e0', levelId: 'L0', group: { id: 'g-a', label: 'Block A' } }),
        ]), LEVELS);
        const g = groupsOf(r)[0]!;
        expect(g.label).toBe('Block A');                       // the lowest-seated member's
        expect(g.labelDisagreement).not.toBeNull();
        expect(g.labelDisagreement![0]).toBe('Block A');        // authoritative spelling first
        expect(new Set(g.labelDisagreement!)).toEqual(new Set(['Block A', 'Tower A', 'Block A (old)']));
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('readMassingGroups — a PARTIAL total is flagged, because a partial total shown as a total overstates', () => {
    it('some storeys unreadable ⇒ totalIsPartial true and the total is the sum over SOME', () => {
        const r = readMassingGroups(store([
            rec({ id: 'e0', levelId: 'L0', group: A, areaM2: 200 }),
            rec({ id: 'e1', levelId: 'L1', group: A, areaM2: null }),
        ]), LEVELS);
        const g = groupsOf(r)[0]!;
        expect(g.totalIntendedM2).toBe(200);
        expect(g.totalIsPartial).toBe(true);
        expect(g.storeyCount).toBe(2);
    });

    it('NO storey readable ⇒ total is null, NOT zero — none declared is not zero declared', () => {
        const r = readMassingGroups(store([
            rec({ id: 'e0', levelId: 'L0', group: A, areaM2: null }),
        ]), LEVELS);
        const g = groupsOf(r)[0]!;
        expect(g.totalIntendedM2).toBeNull();
        expect(g.totalIntendedM2).not.toBe(0);
        expect(g.totalIsPartial).toBe(false);   // nothing to be partial ABOUT
    });

    it('every storey readable ⇒ totalIsPartial false', () => {
        const r = readMassingGroups(store([
            rec({ id: 'e0', levelId: 'L0', group: A, areaM2: 100 }),
            rec({ id: 'e1', levelId: 'L1', group: A, areaM2: 100 }),
        ]), LEVELS);
        expect(groupsOf(r)[0]!.totalIsPartial).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('findMassingGroupOverlaps — ADVISORY with BOTH numbers, and never a refusal (D4)', () => {
    const twoBlocksSameStorey = () => readMassingGroups(store([
        rec({ id: 'a0', levelId: 'L0', group: A, areaM2: 100, ring: SQ_10 }),
        rec({ id: 'b0', levelId: 'L0', group: B, areaM2: 100, ring: SQ_10_SHIFTED }),
    ]), LEVELS);

    it('SAME storey, rings overlapping ⇒ ONE measured finding carrying BOTH footprints', () => {
        const scan = findMassingGroupOverlaps(twoBlocksSameStorey());
        expect(scan.overlaps).toHaveLength(1);
        expect(scan.unmeasurable).toEqual([]);
        expect(scan.pairsExamined).toBe(1);
        const o = scan.overlaps[0]!;
        // 5 × 10 = 50 m², MEASURED by the kernel — pinned as a number, not as "> 0".
        expect(o.overlapAreaM2).toBeCloseTo(50, 6);
        expect(o.aAreaM2).toBe(100);
        expect(o.bAreaM2).toBe(100);
        expect(o.sentence).toContain('50 m²');
        expect(o.sentence).toContain('100 m²');
    });

    it('the sentence is in the ADVISORY voice and says so — C114 §12 forbids a refusal here', () => {
        const o = findMassingGroupOverlaps(twoBlocksSameStorey()).overlaps[0]!;
        expect(o.sentence).toMatch(/NOTE, not a refusal/);
        expect(o.sentence).not.toMatch(/cannot|refus(e|ed) to draw|not allowed/i);
        // ⛔ THE STRUCTURAL HALF, which prose cannot regress: the scan type has no refusal arm.
        expect(Object.prototype.hasOwnProperty.call(o, 'blocked')).toBe(false);
        const scan = findMassingGroupOverlaps(twoBlocksSameStorey());
        expect(Object.prototype.hasOwnProperty.call(scan, 'ok')).toBe(false);
    });

    it('DIFFERENT storeys ⇒ ZERO findings and ZERO pairs — a podium with a tower is not a defect', () => {
        // Flagging this would train the user to ignore the warning (ADR-0383 D4).
        const roster = readMassingGroups(store([
            rec({ id: 'a0', levelId: 'L0', group: A, areaM2: 100, ring: SQ_10 }),
            rec({ id: 'b1', levelId: 'L1', group: B, areaM2: 100, ring: SQ_10 }),   // IDENTICAL ring
        ]), LEVELS);
        const scan = findMassingGroupOverlaps(roster);
        expect(scan.overlaps).toEqual([]);
        expect(scan.pairsExamined).toBe(0);
        expect(scan.unmeasurable).toEqual([]);
    });

    it('same storey, rings CLEAR of each other ⇒ examined, and no finding', () => {
        const roster = readMassingGroups(store([
            rec({ id: 'a0', levelId: 'L0', group: A, areaM2: 100, ring: SQ_10 }),
            rec({ id: 'b0', levelId: 'L0', group: B, areaM2: 100, ring: SQ_10_FAR }),
        ]), LEVELS);
        const scan = findMassingGroupOverlaps(roster);
        expect(scan.pairsExamined).toBe(1);
        expect(scan.overlaps).toEqual([]);
        expect(scan.unmeasurable).toEqual([]);
    });

    it('WITHIN one group two envelopes on one storey are NOT examined — that is supersession’s question', () => {
        const roster = readMassingGroups(store([
            rec({ id: 'a0', levelId: 'L0', group: A, areaM2: 100, ring: SQ_10 }),
            rec({ id: 'a0b', levelId: 'L0', group: A, areaM2: 100, ring: SQ_10 }),
        ]), LEVELS);
        const scan = findMassingGroupOverlaps(roster);
        expect(scan.pairsExamined).toBe(0);
        expect(scan.overlaps).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('findMassingGroupOverlaps — an UNMEASURABLE pair is not a CLEAR pair', () => {
    // ⭐ THE ARM THIS WHOLE LANE EXISTS TO PROTECT. `intersectPolygons2D` refusing, or a record
    // carrying no ring, must NEVER land as "they do not overlap". A failure and an emptiness
    // sharing one value is this repo's most-repeated defect (§CONTEXT-DATA-HONESTY, L-581/L-616).

    it('a MISSING ring ⇒ unmeasurable / no-ring, with a text that refuses the clear reading', () => {
        const roster = readMassingGroups(store([
            rec({ id: 'a0', levelId: 'L0', group: A, areaM2: 100, ring: SQ_10 }),
            rec({ id: 'b0', levelId: 'L0', group: B, areaM2: 100, ring: null }),
        ]), LEVELS);
        const scan = findMassingGroupOverlaps(roster);
        expect(scan.overlaps).toEqual([]);              // ⛔ NOT a finding
        expect(scan.unmeasurable).toHaveLength(1);      // ⛔ AND NOT SILENCE
        expect(scan.unmeasurable[0]!.reason).toBe('no-ring');
        expect(scan.unmeasurable[0]!.text).toMatch(/NOT a finding that\s+they are clear of each other|NOT a finding that they are clear/);
        expect(scan.pairsExamined).toBe(1);
    });

    it('a SELF-CROSSING ring ⇒ unmeasurable / kernel-refused, carrying the kernel’s own reason', () => {
        const roster = readMassingGroups(store([
            rec({ id: 'a0', levelId: 'L0', group: A, areaM2: 100, ring: SQ_10 }),
            rec({ id: 'b0', levelId: 'L0', group: B, areaM2: 100, ring: BOWTIE }),
        ]), LEVELS);
        const scan = findMassingGroupOverlaps(roster);
        expect(scan.overlaps).toEqual([]);
        expect(scan.unmeasurable).toHaveLength(1);
        expect(scan.unmeasurable[0]!.reason).toBe('kernel-refused');
        expect(scan.unmeasurable[0]!.text).toContain('self-intersecting-input');
    });

    it('an unreadable ROSTER produces an empty scan that claims nothing at all', () => {
        const scan = findMassingGroupOverlaps({ readable: false, reason: 'no-store', text: 'x' });
        expect(scan.overlaps).toEqual([]);
        expect(scan.unmeasurable).toEqual([]);
        expect(scan.pairsExamined).toBe(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('⭐ CROSS-MODEL AGREEMENT — the group split must sum to the whole-project total', () => {
    // ⭐ THE ARM `massingGroupRoster.ts`'s OWN HEADER PROMISES (lines 52-55), and it was missing
    // until this file. [[same-rule-two-implementations]]'s prescription is literally *"add a
    // cross-model agreement check"*: `collectIntendedAreas` splits INTENDED area by STOREY and
    // `readMassingGroups` splits the same quantity by GROUP. Two readers of one number are only
    // safe when something fails when they disagree — C84 EI-9.

    const sumGroups = (r: MassingGroupRosterResult): number => {
        let s = 0;
        for (const g of groupsOf(r)) s += g.totalIntendedM2 ?? 0;
        return s;
    };

    it('two groups across three storeys ⇒ Σ(group totals) === collectIntendedAreas total', () => {
        const recs = [
            rec({ id: 'a0', levelId: 'L0', group: A, areaM2: 300 }),
            rec({ id: 'a1', levelId: 'L1', group: A, areaM2: 280 }),
            rec({ id: 'b0', levelId: 'L0', group: B, areaM2: 150 }),
            rec({ id: 'u2', levelId: 'L2', areaM2: 90 }),
        ];
        const byGroup = sumGroups(readMassingGroups(store(recs), LEVELS));
        const whole = collectIntendedAreas(store(recs), LEVELS);
        expect(whole.readable).toBe(true);
        if (!whole.readable) throw new Error('unreachable');
        expect(whole.totalIntendedM2).toBe(820);
        expect(byGroup).toBe(whole.totalIntendedM2);     // ⛔ the two models must agree
    });

    it('agrees on the single-group project too — the only state the product can reach today', () => {
        const recs = [
            rec({ id: 'e0', levelId: 'L0', areaM2: 210 }),
            rec({ id: 'e1', levelId: 'L1', areaM2: 210 }),
        ];
        const whole = collectIntendedAreas(store(recs), LEVELS);
        if (!whole.readable) throw new Error('unreachable');
        expect(sumGroups(readMassingGroups(store(recs), LEVELS))).toBe(whole.totalIntendedM2);
    });

    it('⚠ THE ONE LEGITIMATE DIVERGENCE, PINNED SO IT CANNOT BE MISTAKEN FOR A BUG', () => {
        // A record whose `group` is PRESENT but unreadable is DROPPED by `readLevelEnvelopes`
        // (`levelEnvelopeSupersession.ts:213-221`) on purpose: coercing it into the `null` bucket
        // would file a master-plan block under the single-building flow and make it eligible for
        // supersession by a gesture that never meant to touch it. `collectIntendedAreas` does not
        // read `group` at all, so it keeps the row.
        //
        // ⭐ THE DIVERGENCE IS THEREFORE REAL AND CORRECT, and it is asserted rather than tolerated
        // — if a future edit made the two agree here, one of the two rules changed silently.
        const recs = [
            rec({ id: 'ok', levelId: 'L0', areaM2: 100 }),
            { id: 'bad', role: 'level', levelId: 'L0', footprintAreaM2: 500,
              provenance: { origin: 'authored' }, group: { id: 'g-x' } },  // no label ⇒ unreadable
        ];
        const whole = collectIntendedAreas(store(recs), LEVELS);
        if (!whole.readable) throw new Error('unreachable');
        expect(whole.totalIntendedM2).toBe(600);          // the whole-project reader keeps it
        expect(sumGroups(readMassingGroups(store(recs), LEVELS))).toBe(100);  // the group reader drops it
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('readMassingGroupRef — a blank id reads as UNGROUPED, never as a group called ""', () => {
    it('accepts a well-formed ref and trims it', () => {
        expect(readMassingGroupRef({ group: { id: '  g-a  ', label: '  Block A  ' } }))
            .toEqual({ id: 'g-a', label: 'Block A' });
    });
    it('falls back to the id when the label is blank — never invents a name', () => {
        expect(readMassingGroupRef({ group: { id: 'g-a', label: '   ' } }))
            .toEqual({ id: 'g-a', label: 'g-a' });
    });
    it('a blank id ⇒ null (ungrouped), because a group nothing can select is worse than none', () => {
        expect(readMassingGroupRef({ group: { id: '   ', label: 'Block A' } })).toBeNull();
        expect(readMassingGroupRef({ group: null })).toBeNull();
        expect(readMassingGroupRef({})).toBeNull();
        expect(readMassingGroupRef(null)).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('liveMassingGroupIds / resolveGroupOfEnvelope / describeMassingGroupStorey', () => {
    const roster = () => readMassingGroups(store([
        rec({ id: 'a0', levelId: 'L0', group: A }),
        rec({ id: 'u0', levelId: 'L0' }),
    ]), LEVELS);

    it('liveMassingGroupIds omits the ungrouped bucket — null is not an id you can select', () => {
        expect(liveMassingGroupIds(roster())).toEqual(['g-a']);
    });

    it('liveMassingGroupIds is EMPTY when the read failed — so a reconcile cannot act on a failure', () => {
        // ⛔ Load-bearing: `reconcileMassingGroupSelection` drops a selection absent from this list.
        // If an unreadable store returned "no live groups" in a way the reconciler acted on, a
        // transient read failure would silently deselect the user's building. It returns [] and the
        // SECTION is responsible for not reconciling on an unreadable roster — pinned in the
        // section's own spec.
        expect(liveMassingGroupIds({ readable: false, reason: 'store-threw', text: 'x' })).toEqual([]);
    });

    it('resolveGroupOfEnvelope maps a member id to its group, and a stranger to null', () => {
        expect(resolveGroupOfEnvelope(roster(), 'a0')?.groupId).toBe('g-a');
        expect(resolveGroupOfEnvelope(roster(), 'u0')?.groupId).toBeNull();     // the ungrouped bucket
        expect(resolveGroupOfEnvelope(roster(), 'nope')).toBeNull();
    });

    it('describeMassingGroupStorey SAYS a dangling levelId is dangling rather than hiding it', () => {
        const r = readMassingGroups(store([
            rec({ id: 'eX', levelId: 'L-ghost', group: A, areaM2: 250, height: 3.5 }),
        ]), LEVELS);
        const text = describeMassingGroupStorey(groupsOf(r)[0]!.storeys[0]!);
        expect(text).toContain('L-ghost');
        expect(text).toContain('a storey this project does not have');
        expect(text).toContain('250 m²');
        expect(text).toContain('3.5 m tall');
    });

    it('describeMassingGroupStorey says "area not readable" rather than printing a zero', () => {
        const r = readMassingGroups(store([
            rec({ id: 'e0', levelId: 'L0', group: A, areaM2: null }),
        ]), LEVELS);
        const text = describeMassingGroupStorey(groupsOf(r)[0]!.storeys[0]!);
        expect(text).toContain('area not readable');
        expect(text).not.toMatch(/\b0 m²/);
    });
});
