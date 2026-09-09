// §MASTER-PLAN (ADR-0383 S3) — N profiles, N buildings, ONE command, pinned.
//
// ⭐ THIS SUITE IS ALSO `findMassingGroupOverlaps`'s FIRST TEST. That function landed hours before
// this file (55d10d80) with ZERO importers and ZERO tests — 1,084 lines of S5/S6 that had never
// executed ([[authored-but-unwired-is-the-bottleneck]]). S3 is its first caller, so S3's suite is
// where its `unmeasurable` arms and its same-storey rule get exercised for the first time.
//
// ⛔ A GREEN SUITE HERE IS NOT A USER CAPABILITY. This pins a PURE function. Nothing here shows that
// a surface can hand it three profiles, that the button dispatches, or that anything draws the
// result. C114 §14a forbids reporting one as the other.

import { describe, it, expect } from 'vitest';
import {
    buildMasterPlanAuthoringPlan,
    MASTER_PLAN_MAX_ENVELOPES,
    type MasterPlanAuthoringInput,
    type MasterPlanProfileInput,
} from '../masterPlanAuthoringPlan';
import { DRAWN_ENVELOPE_MAX_PROFILES } from '../drawnEnvelopeFootprintState';
import type { AdoptLevelCandidate } from '../adoptProposalAsEnvelope';
import type { ExistingLevelEnvelope, LevelEnvelopeReadResult } from '../levelEnvelopeSupersession';
import { authoredProvenance, systemProvenance } from '@pryzm/schemas/provenance';

const LEVELS: readonly AdoptLevelCandidate[] = [
    { id: 'lvl-0', name: 'Ground', elevation: 0, height: 3 },
    { id: 'lvl-1', name: 'Level 1', elevation: 3, height: 3 },
    { id: 'lvl-2', name: 'Level 2', elevation: 6, height: 3 },
];

/** A square of side `s` with its lower-left corner at (x0, z0). */
const square = (x0: number, z0: number, s: number) => [
    { x: x0, z: z0 },
    { x: x0 + s, z: z0 },
    { x: x0 + s, z: z0 + s },
    { x: x0, z: z0 + s },
];

let idSeq = 0;
const ids = (n: number): string[] =>
    Array.from({ length: n }, () => `se-${String(++idSeq).padStart(4, '0')}`);

function profile(over: Partial<MasterPlanProfileInput> = {}): MasterPlanProfileInput {
    return {
        profileId: 'p1',
        group: { id: 'mg_a', label: 'Block A' },
        ring: square(0, 0, 10),
        ringAreaM2: 100,
        ringSourceLabel: 'the perimeter you drew',
        requestedStoreys: 2,
        mintedIds: ids(6),
        ...over,
    };
}

function input(over: Partial<MasterPlanAuthoringInput> = {}): MasterPlanAuthoringInput {
    return {
        profiles: [profile()],
        ordinance: { maxHeightM: 20, maxFloors: 6 },
        levels: LEVELS,
        existing: { readable: true, rows: [] },
        ...over,
    };
}

function existingRow(over: Partial<ExistingLevelEnvelope> = {}): ExistingLevelEnvelope {
    return {
        id: 'old-1',
        levelId: 'lvl-0',
        name: 'Level envelope · Ground',
        footprintAreaM2: 100,
        provenance: authoredProvenance('user extruded the perimeter they drew'),
        ...over,
        group: over.group ?? null,
    };
}
const readable = (rows: readonly ExistingLevelEnvelope[]): LevelEnvelopeReadResult =>
    ({ readable: true, rows });

const BLOCK_A = { id: 'mg_a', label: 'Block A' } as const;
const BLOCK_B = { id: 'mg_b', label: 'Block B' } as const;
const BLOCK_C = { id: 'mg_c', label: 'Block C' } as const;

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('the happy path — three blocks, one command, one undo', () => {
    it('⭐⭐ builds THREE independent buildings in ONE `spaceEnvelope.batch.create`', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A, ring: square(0, 0, 10), requestedStoreys: 2 }),
                profile({ profileId: 'p2', group: BLOCK_B, ring: square(40, 0, 10), requestedStoreys: 3 }),
                profile({ profileId: 'p3', group: BLOCK_C, ring: square(80, 0, 10), requestedStoreys: 1 }),
            ],
        }));
        if (!r.ok) throw new Error(r.statement);
        // ⛔ ONE command. `batchCoordinator.runBatch` is undo-NEUTRAL (C114 §6a); three dispatches
        // would spend three Ctrl+Zs on one gesture.
        expect(r.command).toBe('spaceEnvelope.batch.create');
        expect(r.built).toHaveLength(3);
        expect(r.skipped).toEqual([]);
        expect(r.payload.envelopes).toHaveLength(2 + 3 + 1);
    });

    it('⭐ each block’s storeys carry ITS OWN group — the ids never bleed across blocks', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A, ring: square(0, 0, 10), requestedStoreys: 2 }),
                profile({ profileId: 'p2', group: BLOCK_B, ring: square(40, 0, 10), requestedStoreys: 3 }),
            ],
        }));
        if (!r.ok) throw new Error(r.statement);
        const byGroup = new Map<string, number>();
        for (const e of r.payload.envelopes) {
            const g = e.group?.id ?? '(ungrouped)';
            byGroup.set(g, (byGroup.get(g) ?? 0) + 1);
        }
        expect(byGroup.get('mg_a')).toBe(2);
        expect(byGroup.get('mg_b')).toBe(3);
        expect(byGroup.get('(ungrouped)')).toBeUndefined();
    });

    it('⭐ each block keeps its OWN ordinance advisory — never summed, never merged', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            ordinance: { maxHeightM: 20, maxFloors: 2 },
            profiles: [
                // Podium: within the ordinance. Tower: over it. Two different facts.
                profile({ profileId: 'p1', group: BLOCK_A, ring: square(0, 0, 10), requestedStoreys: 1 }),
                profile({ profileId: 'p2', group: BLOCK_B, ring: square(40, 0, 10), requestedStoreys: 3 }),
            ],
        }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.built[0]!.advisory).toBeNull();
        expect(r.built[1]!.advisory?.askedStoreys).toBe(3);
        expect(r.built[1]!.advisory?.permittedStoreys).toBe(2);
    });

    it('sums the intended area across blocks, and states it', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A, ring: square(0, 0, 10), ringAreaM2: 100, requestedStoreys: 2 }),
                profile({ profileId: 'p2', group: BLOCK_B, ring: square(40, 0, 10), ringAreaM2: 200, requestedStoreys: 3 }),
            ],
        }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.totalIntendedM2).toBeCloseTo(100 * 2 + 200 * 3, 6);
    });

    it('⛔ a block does NOT supersede a PEER block already in the store', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [profile({ profileId: 'p2', group: BLOCK_B, requestedStoreys: 1 })],
            existing: readable([
                existingRow({ id: 'blockA-ground', levelId: 'lvl-0', group: BLOCK_A }),
                existingRow({ id: 'legacy-ground', levelId: 'lvl-0' }),
            ]),
        }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.payload.supersedes).toEqual([]);
        expect(r.intent).toBe('create');
    });

    it('… and the composed `supersedes` is the UNION of what each block’s own resolver returned', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A, ring: square(0, 0, 10), requestedStoreys: 1 }),
                profile({ profileId: 'p2', group: BLOCK_B, ring: square(40, 0, 10), requestedStoreys: 1 }),
            ],
            existing: readable([
                existingRow({ id: 'a-old', levelId: 'lvl-0', group: BLOCK_A }),
                existingRow({ id: 'b-old', levelId: 'lvl-0', group: BLOCK_B }),
            ]),
        }));
        if (!r.ok) throw new Error(r.statement);
        expect([...r.payload.supersedes].sort()).toEqual(['a-old', 'b-old']);
        expect(r.intent).toBe('replace');
        expect(r.replaces.map((x) => x.id).sort()).toEqual(['a-old', 'b-old']);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('⭐ D5 — a per-profile refusal must not kill the batch; a project-wide one must', () => {
    it('⭐⭐ a DEGENERATE RING skips ONE block and BUILDS the other two, naming the one skipped', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A, ring: square(0, 0, 10) }),
                // Two vertices cannot bound an area — D5's own example of the per-profile case.
                profile({ profileId: 'p2', group: BLOCK_B, ring: [{ x: 0, z: 0 }, { x: 1, z: 1 }] }),
                profile({ profileId: 'p3', group: BLOCK_C, ring: square(80, 0, 10) }),
            ],
        }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.built.map((b) => b.group.id)).toEqual(['mg_a', 'mg_c']);
        expect(r.skipped).toHaveLength(1);
        expect(r.skipped[0]!.profileId).toBe('p2');
        expect(r.skipped[0]!.groupLabel).toBe('Block B');
        expect(r.skipped[0]!.reason).toBe('no-footprint-ring');
        // ⛔ NAMED IN THE SENTENCE, not merely present in an array a surface might not render:
        // "the user counts three blocks and gets two" is the failure D5 exists to prevent.
        expect(r.statement).toContain('Block B');
    });

    it('⛔ an UNREADABLE STORE refuses the WHOLE batch — one read, shared by every block', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A }),
                profile({ profileId: 'p2', group: BLOCK_B, ring: square(40, 0, 10) }),
            ],
            existing: { readable: false, reason: 'no-store', text: 'This runtime exposes no space-envelope store.' },
        }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('every-profile-refused');
        expect(r.projectWideReason).toBe('envelopes-unreadable');
    });

    it('⛔ TOO FEW MINTED IDS refuses the whole batch — a PRYZM wiring fault, not a design refusal', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A, requestedStoreys: 3, mintedIds: ['x1'] }),
                profile({ profileId: 'p2', group: BLOCK_B, ring: square(40, 0, 10) }),
            ],
        }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.projectWideReason).toBe('too-few-ids');
    });

    it('⭐⭐ "you asked 4 storeys, the project has 1" refuses the WHOLE batch when it is true of EVERY block', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            levels: [{ id: 'lvl-0', name: 'Ground', elevation: 0, height: 3 }],
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A, requestedStoreys: 4 }),
                profile({ profileId: 'p2', group: BLOCK_B, ring: square(40, 0, 10), requestedStoreys: 4 }),
            ],
        }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('every-profile-refused');
        expect(r.projectWideReason).toBe('not-enough-storeys');
    });

    it('⭐⭐ … but the SAME reason is PER-PROFILE when the podium fits and the tower does not', () => {
        // The founder's real scheme: a 2-storey podium and a 12-storey tower in a 3-storey project.
        // Classifying `not-enough-storeys` as project-wide would discard the podium he drew
        // correctly. D5's test is "identical for every group", and here it is not.
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'podium', group: BLOCK_A, ring: square(0, 0, 20), requestedStoreys: 2 }),
                profile({ profileId: 'tower', group: BLOCK_B, ring: square(40, 0, 10), requestedStoreys: 12 }),
            ],
        }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.built.map((b) => b.profileId)).toEqual(['podium']);
        expect(r.skipped.map((s) => s.profileId)).toEqual(['tower']);
        expect(r.skipped[0]!.reason).toBe('not-enough-storeys');
    });

    it('when EVERY profile is refused on its own terms, nothing is created and EACH is named', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A, ring: [{ x: 0, z: 0 }] }),
                profile({ profileId: 'p2', group: BLOCK_B, ring: null }),
            ],
        }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('every-profile-refused');
        expect(r.statement).toContain('Block A');
        expect(r.statement).toContain('Block B');
    });

    it('an unreplaceable rival in ONE block skips that block only', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A, ring: square(0, 0, 10), requestedStoreys: 1 }),
                profile({ profileId: 'p2', group: BLOCK_B, ring: square(40, 0, 10), requestedStoreys: 1 }),
            ],
            existing: readable([
                existingRow({
                    id: 'b-generated',
                    levelId: 'lvl-0',
                    group: BLOCK_B,
                    provenance: systemProvenance('computed', 'fitted by the massing solver'),
                }),
            ]),
        }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.built.map((b) => b.group.id)).toEqual(['mg_a']);
        expect(r.skipped[0]!.reason).toBe('rival-envelope-not-authored');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('⛔ caller-wiring refusals — asked FIRST, because both make two blocks silently one', () => {
    it('refuses two profiles claiming the SAME group id', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A }),
                profile({ profileId: 'p2', group: { id: 'mg_a', label: 'Block A' }, ring: square(40, 0, 10) }),
            ],
        }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('duplicate-group-id');
    });

    it('refuses ONE element id handed to TWO profiles', () => {
        const shared = ids(4);
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A, mintedIds: shared }),
                profile({ profileId: 'p2', group: BLOCK_B, ring: square(40, 0, 10), mintedIds: shared }),
            ],
        }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('overlapping-minted-ids');
    });

    it('refuses an empty profile list', () => {
        const r = buildMasterPlanAuthoringPlan(input({ profiles: [] }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('no-profiles');
    });

    it('refuses more profiles than the session roster holds, with BOTH numbers', () => {
        const many = Array.from({ length: DRAWN_ENVELOPE_MAX_PROFILES + 1 }, (_, i) =>
            profile({ profileId: `p${i}`, group: { id: `mg_${i}`, label: `Block ${i}` }, ring: square(i * 40, 0, 10) }));
        const r = buildMasterPlanAuthoringPlan(input({ profiles: many }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('too-many-profiles');
        expect(r.statement).toContain(String(DRAWN_ENVELOPE_MAX_PROFILES + 1));
        expect(r.statement).toContain(String(DRAWN_ENVELOPE_MAX_PROFILES));
    });

    it('⭐ refuses a COMPOSED batch above the gesture ceiling — the product neither existing constant guards', () => {
        // 20 profiles x 20 storeys = 400 records from one press. Each profile is individually
        // within AUTHORING_MAX_STOREYS (40) and the roster is within DRAWN_ENVELOPE_MAX_PROFILES.
        const levels = Array.from({ length: 20 }, (_, i) => ({
            id: `lvl-${i}`, name: `Level ${i}`, elevation: i * 3, height: 3,
        }));
        const many = Array.from({ length: 20 }, (_, i) =>
            profile({
                profileId: `p${i}`,
                group: { id: `mg_${i}`, label: `Block ${i}` },
                ring: square(i * 40, 0, 10),
                requestedStoreys: 20,
                mintedIds: ids(20),
            }));
        const r = buildMasterPlanAuthoringPlan(input({ profiles: many, levels }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('above-composed-batch-limit');
        expect(r.statement).toContain(String(MASTER_PLAN_MAX_ENVELOPES));
        expect(r.statement).toContain('400');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ D4 — AND THESE ARE `findMassingGroupOverlaps`'s FIRST TESTS.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('⭐ D4 — overlap between blocks is measured, advisory, and same-storey only', () => {
    it('⭐ two blocks overlapping ON THE SAME STOREY are REPORTED, with BOTH numbers', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A, ring: square(0, 0, 10), ringAreaM2: 100, requestedStoreys: 1 }),
                // Offset by 5 m: a 5 x 10 = 50 m² overlap, measured by the kernel, never estimated.
                profile({ profileId: 'p2', group: BLOCK_B, ring: square(5, 0, 10), ringAreaM2: 100, requestedStoreys: 1 }),
            ],
        }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.overlaps.overlaps).toHaveLength(1);
        const o = r.overlaps.overlaps[0]!;
        expect(o.overlapAreaM2).toBeCloseTo(50, 6);
        expect(o.aAreaM2).toBeCloseTo(100, 6);
        expect(o.bAreaM2).toBeCloseTo(100, 6);
        expect(o.levelId).toBe('lvl-0');
    });

    it('⛔ and it is an ADVISORY, never a refusal — the plan is still built', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A, ring: square(0, 0, 10), requestedStoreys: 1 }),
                profile({ profileId: 'p2', group: BLOCK_B, ring: square(5, 0, 10), requestedStoreys: 1 }),
            ],
        }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.payload.envelopes).toHaveLength(2);
        expect(r.overlaps.overlaps[0]!.sentence).toContain('not a refusal');
    });

    it('⭐⭐ THE PODIUM AND THE TOWERS — overlap on DIFFERENT storeys is NOT A FINDING AT ALL', () => {
        // A 2-storey podium and a tower starting on Level 2, occupying the same ground in plan.
        // Flagging this would train the user to ignore the warning on the storey where it matters.
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({
                    profileId: 'podium', group: BLOCK_A, ring: square(0, 0, 30), ringAreaM2: 900,
                    requestedStoreys: 2, startStoreyId: 'lvl-0',
                }),
                profile({
                    profileId: 'tower', group: BLOCK_B, ring: square(5, 5, 10), ringAreaM2: 100,
                    requestedStoreys: 1, startStoreyId: 'lvl-2',
                }),
            ],
        }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.built).toHaveLength(2);
        // The rings genuinely intersect in plan; they are simply never on the same storey.
        expect(r.overlaps.overlaps).toEqual([]);
        expect(r.overlaps.pairsExamined).toBe(0);
    });

    it('⭐ a SELF-CROSSING ring lands in `unmeasurable`, NOT in "they are clear of each other"', () => {
        // A bow-tie: 4 vertices, non-degenerate, but the perimeter crosses itself.
        const bowtie = [{ x: 0, z: 0 }, { x: 10, z: 10 }, { x: 10, z: 0 }, { x: 0, z: 10 }];
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [
                profile({ profileId: 'p1', group: BLOCK_A, ring: square(0, 0, 10), requestedStoreys: 1 }),
                profile({ profileId: 'p2', group: BLOCK_B, ring: bowtie, requestedStoreys: 1 }),
            ],
        }));
        if (!r.ok) throw new Error(r.statement);
        // ⛔ §CONTEXT-DATA-HONESTY — whichever arm the kernel lands in, "PRYZM could not measure"
        // and "PRYZM measured, they are clear" must not be the same value. One of the two arms
        // must be non-empty; an empty scan with no gap recorded would be the L-616 overstatement.
        const scanned = r.overlaps.overlaps.length + r.overlaps.unmeasurable.length;
        expect(r.overlaps.pairsExamined).toBe(1);
        expect(scanned).toBeGreaterThan(0);
        for (const u of r.overlaps.unmeasurable) {
            expect(u.text).toContain('NOT a finding that');
        }
    });

    it('⛔ names what the overlap scan could NOT see — existing envelopes carry no ring', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [profile({ profileId: 'p1', group: BLOCK_A, requestedStoreys: 1 })],
            existing: readable([existingRow({ id: 'blockZ-ground', levelId: 'lvl-0', group: { id: 'mg_z', label: 'Block Z' } })]),
        }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.overlapLimit).not.toBeNull();
        expect(r.overlapLimit).toContain('NOT a finding');
    });

    it('… and says nothing when there was nothing it missed', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [profile({ profileId: 'p1', group: BLOCK_A, requestedStoreys: 1 })],
        }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.overlapLimit).toBeNull();
    });

    it('a single block cannot overlap itself — the scan examines no pairs', () => {
        const r = buildMasterPlanAuthoringPlan(input({
            profiles: [profile({ profileId: 'p1', group: BLOCK_A, requestedStoreys: 3 })],
        }));
        if (!r.ok) throw new Error(r.statement);
        expect(r.overlaps.pairsExamined).toBe(0);
        expect(r.overlaps.overlaps).toEqual([]);
    });
});
