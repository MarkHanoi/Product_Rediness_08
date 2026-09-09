// §MASTER-PLAN (ADR-0383 S3, lane MASTER-PLAN, 2026-09-09) — N PROFILES, N BUILDINGS, ONE Ctrl+Z.
//
// ADR-0383 D1 / D4 / D5 / D7 · C114 §6a / §6d / §6e / §12 · C16 CA-2 · C73 §C73-POLY-BOOLEAN · P6.
//
// THE FOUNDER'S ASK, verbatim (2026-09-09):
//   *"i need to be able to do that for multiple envelopes on a single [parcel] for masterplanning —
//    the UI and the engine needs to allow me to: define multiple profiles first — i need to decide
//    how many — then define the levels and create bulk all the envelopes for all the profiles."*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔⛔ WHAT THIS MODULE IS NOT, STATED FIRST BECAUSE IT IS THE WHOLE RISK OF THE FILE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// It is **NOT a second envelope planner.** It holds ZERO lines of the storey ladder, ZERO lines of
// the height ladder, ZERO lines of the ordinance advisory, ZERO lines of the seatability rules and
// ZERO lines of the supersession rule. It calls `buildEnvelopeAuthoringPlan` ONCE PER PROFILE and
// composes the results.
//
// [[same-rule-two-implementations]] has recurred seven times in this repository and the shape is
// always the same: the fix lands in the copy nobody is looking at, and the guarding test stays
// green because it measured the other one. `envelopeAuthoringPlan.ts` is 1,000 lines of decisions
// that have each been corrected at least once — §ENVELOPE-STOREY-SEAT (L-13146) alone was a literal
// `0` that put five storeys on the ground. A master planner that re-derived any of it would ship
// with those defects restored and a green suite over the new copy.
//
// ⭐ THE THREE RULES THIS FILE CALLS RATHER THAN RE-IMPLEMENTS, NAMED SO A REVIEWER CAN CHECK:
//   1. *"what does one profile create"* → `buildEnvelopeAuthoringPlan` (the ONE planner).
//   2. *"do two blocks collide"* → `findMassingGroupOverlaps` (`massingGroupRoster.ts:464`), which
//      already implements D4 exactly: `intersectPolygons2D`, same storey only, both numbers, and a
//      separate `unmeasurable` arm. ⛔ It landed hours before this file with ZERO importers, which
//      is precisely how a second one gets written — see the projection note at `_projectRoster`.
//   3. *"how many profiles may a session hold"* → `DRAWN_ENVELOPE_MAX_PROFILES`, the roster's own
//      ceiling. ⛔ Not a second constant.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ D5 — WHICH REFUSALS KILL THE BATCH, AND WHICH KILL ONE BLOCK
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ADR-0383 D5: *"Refusing all three blocks because one ring was drawn badly is the failure
// [[refusing-half-needs-its-escape-hatch]] names: a gate whose 'no' branch discards work the user
// already did. Silently dropping it is worse — the user counts three blocks and gets two."*
//
// So a skipped profile is BUILT AROUND and **NAMED**, and a project-wide fault refuses everything.
// The partition is `_scopeOfRefusal`, an EXHAUSTIVE switch over the planner's own closed union, so
// a new refusal reason is a COMPILE ERROR here rather than a silent default into either bucket.
//
// ⚠ AND THE THIRD BUCKET IS THE ONE THAT MATTERS. Most of the planner's reasons are neither
// inherently project-wide nor inherently per-profile: *"not enough storeys"* is project-wide when
// every block asked for four in a one-storey project, and per-profile when the founder gives the
// podium 3 and the towers 12. D5's actual test is *"identical for every group"*, so those reasons
// are CONDITIONAL and are resolved by counting, never by classification.
//
// PURE: no store, no DOM, no THREE, no bus, no clock, no RNG. Ids are minted by the CALLER
// (C16 CA-2). Never throws. Deterministic. Dispatches nothing (P6).

import { trace } from '@opentelemetry/api';
import type { Pt, SpaceEnvelopeGroup } from '@pryzm/schemas';
import {
    buildEnvelopeAuthoringPlan,
    type AuthoredEnvelopeSpec,
    type AuthoredStoreyRow,
    type EnvelopeAuthoringAdvisory,
    type EnvelopeAuthoringRefusalReason,
} from './envelopeAuthoringPlan';
import {
    findMassingGroupOverlaps,
    type MassingGroupOverlapScan,
    type MassingGroupRosterResult,
    type MassingGroupStorey,
} from './massingGroupRoster';
import { DRAWN_ENVELOPE_MAX_PROFILES } from './drawnEnvelopeFootprintState';
import type { AdoptLevelCandidate } from './adoptProposalAsEnvelope';
import type { ExistingLevelEnvelope, LevelEnvelopeReadResult } from './levelEnvelopeSupersession';

const _tracer = trace.getTracer('pryzm.site.masterPlanAuthoringPlan');

/**
 * The most envelopes ONE master-plan gesture may mint.
 *
 * ⛔ THIS CEILING IS NOT REDUNDANT WITH `AUTHORING_MAX_STOREYS`, AND THE ARITHMETIC IS WHY.
 * That constant guards ONE profile at 40 storeys. `DRAWN_ENVELOPE_MAX_PROFILES` guards the roster
 * at 24. Neither guards their PRODUCT: 24 × 40 = **960 records in a single `produceCommand`** from
 * one press, which is not a limit either existing constant expresses. A gesture that mints a
 * thousand envelopes is not a master plan, it is an accident with an undo entry.
 *
 * ⚠ It is a limit on the GESTURE, never a statement about what the parcel allows — the same framing
 * `AUTHORING_MAX_STOREYS` carries, and the refusal says so and carries BOTH numbers so the user can
 * split the press in two rather than being told "no".
 */
export const MASTER_PLAN_MAX_ENVELOPES = 240;

/** One profile the user drew, with the building it becomes. */
export interface MasterPlanProfileInput {
    /**
     * The transient roster's own id for this profile (`drawnEnvelopeFootprintState`). Used ONLY to
     * name a skipped profile back to the surface that owns it. ⛔ Never written to a record.
     */
    readonly profileId: string;
    /**
     * ⭐ WHICH BUILDING this profile becomes. Both halves minted by the CALLER (C16 CA-2) — a group
     * id minted here would differ on redo and orphan every member naming the first.
     */
    readonly group: SpaceEnvelopeGroup;
    /** This profile's footprint ring, scene-XZ metres. See `EnvelopeAuthoringInput.ring`. */
    readonly ring: readonly Pt[] | null | undefined;
    /** That ring's area from the SAME producer. ⛔ Never recomputed. `null` ⇒ none stated. */
    readonly ringAreaM2: number | null;
    readonly ringSourceLabel: string;
    /** Straight off a text field, so `unknown` on purpose — CLASSIFIED by the planner, never here. */
    readonly requestedStoreys: unknown;
    /**
     * This profile's OWN ids, one per storey. ⛔ PARTITIONED PER PROFILE, and an id appearing in two
     * partitions is a REFUSAL (`overlapping-minted-ids`), not a last-writer-wins collision: two
     * blocks sharing a record id is two buildings that are silently one.
     */
    readonly mintedIds: readonly string[];
    readonly startStoreyId?: string | null;
    readonly provenanceDetail?: string;
}

/** The facts every profile shares, supplied once. */
export interface MasterPlanAuthoringInput {
    readonly profiles: readonly MasterPlanProfileInput[];
    /** The ordinance figures, as the ONE parcel-law model states them. `null` ⇒ not published. */
    readonly ordinance: {
        readonly maxHeightM: number | null;
        readonly maxFloors: number | null;
    };
    /** The project's storeys (`readLevelCandidates(bimManager.getLevels())`). SHARED. */
    readonly levels: readonly AdoptLevelCandidate[];
    /**
     * §ENVELOPE-DRAW R8 — the store read RESULT, shared by every profile. ⛔ A failure to read is
     * project-wide by construction: it is one read, so it cannot fail for one block and succeed
     * for another.
     */
    readonly existing: LevelEnvelopeReadResult;
}

/** Why the WHOLE gesture was refused. Closed. */
export type MasterPlanRefusalReason =
    /** No profiles at all — nothing to build. */
    | 'no-profiles'
    /** More profiles than the session roster may hold. */
    | 'too-many-profiles'
    /** ⛔ Two profiles claim the SAME `group.id`. Two blocks that are silently one building. */
    | 'duplicate-group-id'
    /** ⛔ One envelope id appears in two profiles' `mintedIds`. Two blocks, one record. */
    | 'overlapping-minted-ids'
    /** The composed batch exceeds `MASTER_PLAN_MAX_ENVELOPES`. Both numbers in the sentence. */
    | 'above-composed-batch-limit'
    /**
     * ⭐ D5's project-wide arm — a refusal the ONE planner returned that is not a statement about
     * one ring. `projectWideReason` names which.
     */
    | 'every-profile-refused';

export interface MasterPlanAuthoringRefusal {
    readonly ok: false;
    readonly reason: MasterPlanRefusalReason;
    /**
     * The planner's own reason, when this refusal came from the planner rather than from wiring.
     * Carried as a VALUE so the surface can offer the same escape hatch the single-building card
     * offers (`seatable`, `missingStoreys`) instead of parsing prose.
     */
    readonly projectWideReason: EnvelopeAuthoringRefusalReason | null;
    readonly statement: string;
}

/** A profile that was skipped while the others were built. ⛔ NAMED, never silently dropped (D5). */
export interface SkippedMasterPlanProfile {
    readonly profileId: string;
    readonly groupId: string;
    readonly groupLabel: string;
    readonly reason: EnvelopeAuthoringRefusalReason;
    /** The planner's own sentence, verbatim. ⛔ Never re-worded — one refusal, one wording. */
    readonly statement: string;
}

/** One building this gesture will create. */
export interface MasterPlanBuiltProfile {
    readonly profileId: string;
    readonly group: SpaceEnvelopeGroup;
    readonly envelopes: readonly AuthoredEnvelopeSpec[];
    readonly storeys: readonly AuthoredStoreyRow[];
    readonly footprintAreaM2: number;
    readonly totalIntendedM2: number;
    /**
     * This block's OWN ordinance advisory. ⛔ NEVER SUMMED AND NEVER MERGED ACROSS BLOCKS: "you
     * asked for 12 storeys, the ordinance derives 4" is a statement about ONE building, and a
     * merged version of it would be a number no block actually has.
     */
    readonly advisory: EnvelopeAuthoringAdvisory | null;
    /**
     * This block's OWN supersession result, exactly as the ONE resolver returned it for THIS
     * group's bucket. ⛔ Carried rather than re-derived: recomputing which envelopes a block
     * replaces would be a second implementation of the group rule, and the composed batch is a
     * UNION of these, never a fresh answer.
     */
    readonly supersedes: readonly string[];
    readonly replaces: readonly ExistingLevelEnvelope[];
    /** The planner's own sentence for this block, verbatim. */
    readonly statement: string;
}

export interface MasterPlanAuthoringPlan {
    readonly ok: true;
    /** ⭐ ONE command for N buildings — C114 §6a. `runBatch` is undo-NEUTRAL and is not used. */
    readonly command: 'spaceEnvelope.batch.create';
    readonly payload: {
        readonly envelopes: readonly AuthoredEnvelopeSpec[];
        readonly supersedes: readonly string[];
    };
    readonly intent: 'create' | 'replace';
    readonly built: readonly MasterPlanBuiltProfile[];
    /** ⭐ D5 — the profiles this gesture will NOT build, each with the planner's own reason. */
    readonly skipped: readonly SkippedMasterPlanProfile[];
    /** What is being replaced, as VALUES, across every block. */
    readonly replaces: readonly ExistingLevelEnvelope[];
    /**
     * ⭐ D4 — measured collisions BETWEEN THE BLOCKS OF THIS GESTURE, same storey only. Carries its
     * own `unmeasurable` arm; see `overlapLimit` for what it does NOT cover.
     */
    readonly overlaps: MassingGroupOverlapScan;
    /**
     * ⛔ THE LIMIT OF THE OVERLAP SCAN, AS A VALUE RATHER THAN A COMMENT. Non-null when the store
     * holds level envelopes this scan could not compare against, because `ExistingLevelEnvelope`
     * carries NO RING — measured, not assumed. §CONTEXT-DATA-HONESTY: "PRYZM did not look" and
     * "PRYZM looked and they are clear" must not reach the surface as the same silence.
     */
    readonly overlapLimit: string | null;
    /** Σ of the built blocks' `totalIntendedM2`. Stated before the click. */
    readonly totalIntendedM2: number;
    readonly statement: string;
}

export type MasterPlanAuthoringResult = MasterPlanAuthoringPlan | MasterPlanAuthoringRefusal;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// D5 — THE PARTITION
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `'profile'` — always about ONE ring; build the others and name this one.
 * `'batch'`   — never about one ring; refuse everything.
 * `'conditional'` — project-wide ONLY when it refuses EVERY profile. See the header.
 *
 * ⛔ EXHAUSTIVE BY CONSTRUCTION. The `never` assignment at the end means a new member of
 * `EnvelopeAuthoringRefusalReason` fails to compile HERE, rather than defaulting into a bucket. A
 * new reason silently classified as `'profile'` would drop a block; silently classified as
 * `'batch'` would discard the user's other work. Both are the failures D5 exists to prevent, so
 * neither may be reachable without a decision.
 */
function _scopeOfRefusal(reason: EnvelopeAuthoringRefusalReason): 'profile' | 'batch' | 'conditional' {
    switch (reason) {
        // ── ALWAYS ABOUT ONE RING ──────────────────────────────────────────────────────────────
        case 'no-footprint-ring':
            // D5's own example of the per-profile case, verbatim.
            return 'profile';
        case 'rival-envelope-not-authored':
            // This block's own storeys carry an envelope it may not replace. Another block's
            // storeys are a different question and the resolver is already group-scoped, so a
            // peer's unreplaceable envelope does not reach here at all.
            return 'profile';

        // ── NEVER ABOUT ONE RING ───────────────────────────────────────────────────────────────
        case 'envelopes-unreadable':
            // ONE store read, shared. It cannot fail for one block and succeed for another, and
            // creating blind is how rivals accumulate (§ENVELOPE-DRAW R8).
            return 'batch';
        case 'too-few-ids':
            // ⚠ A DELIBERATE CHOICE, and the one place this partition departs from "is it about
            // one ring". It IS per-profile in origin — ids are partitioned per profile — but it is
            // a fault in PRYZM'S WIRING, not in the user's design. Building 2 of 3 blocks because
            // PRYZM's own id minting came up short would hand the user a partial master plan for
            // no reason they can see or fix. D5 protects the user's DRAWING from being discarded;
            // it does not ask PRYZM to half-execute while broken.
            return 'batch';

        // ── DEPENDS ON WHETHER IT REFUSED EVERY PROFILE ────────────────────────────────────────
        case 'storeys-not-a-number':
        case 'storeys-not-positive':
        case 'storeys-above-batch-limit':
        case 'no-levels':
        case 'no-ground-level':
        case 'not-enough-storeys':
        case 'start-storey-not-seatable':
        case 'not-enough-storeys-above-start':
            return 'conditional';

        default: {
            const _exhaustive: never = reason;
            return _exhaustive;
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// D4 — THE PROJECTION
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Project the PLANNED blocks onto the shape `findMassingGroupOverlaps` already reads.
 *
 * ⛔⛔ THIS FUNCTION IS THE POINT OF THE WHOLE D4 SECTION, AND IT IS TWENTY LINES INSTEAD OF A
 * HUNDRED FOR ONE REASON. `findMassingGroupOverlaps` (`massingGroupRoster.ts:464`) already measures
 * exactly what D4 asks: `intersectPolygons2D` from the kernel, same-storey only, `OVERLAP_FLOOR_M2`,
 * both footprint numbers in the sentence, and a separate `unmeasurable[]` arm so a failure to
 * measure never reads as "clear of each other".
 *
 * It landed hours before this file with **zero importers and zero tests** — which is exactly the
 * state in which a second implementation gets written, because the first one is invisible
 * ([[authored-but-unwired-is-the-bottleneck]]). Writing a pre-commit overlap check here would have
 * produced two answers to *"do these blocks collide"*: one before the click and one in the panel
 * after it, drifting apart on the first change to either. So the PLAN is projected onto the ROSTER
 * shape and the one measurer is called. This lane's suite is also that function's first test.
 *
 * ⚠ The projection is deliberately total and lossless for the fields the scan reads
 * (`groups[].{groupId,label,storeys[]}`, `storeys[].{levelId,levelName,ring,footprintAreaM2}`); the
 * rest are filled from the plan and are not consulted by the scan.
 */
function _projectRoster(built: readonly MasterPlanBuiltProfile[]): MassingGroupRosterResult {
    let memberCount = 0;
    const groups = built.map((b) => {
        const storeys: MassingGroupStorey[] = b.envelopes.map((spec, i) => {
            const row = b.storeys[i];
            memberCount += 1;
            return {
                spaceEnvelopeId: spec.spaceEnvelopeId,
                levelId: spec.levelId,
                levelName: row?.label ?? null,
                elevationM: row?.elevation ?? null,
                envelopeName: spec.name,
                footprintAreaM2: b.footprintAreaM2,
                heightM: spec.height,
                baseOffsetM: spec.baseOffset,
                // ⛔ THE SPEC'S OWN RING, not the input ring: the planner copies the vertices per
                // storey (§ENVELOPE-PER-LEVEL), and measuring the input would measure something
                // the batch is not actually creating.
                ring: spec.footprint.map((p) => ({ x: p.x, z: p.z })),
            };
        });
        return {
            groupId: b.group.id,
            label: b.group.label,
            // Every storey of one profile is stamped from ONE `group` object, so a disagreement is
            // unrepresentable here. `null` is the truthful answer, not an unchecked default.
            labelDisagreement: null,
            storeys,
            storeyCount: storeys.length,
            footprintAreaM2: b.footprintAreaM2,
            totalIntendedM2: b.totalIntendedM2,
            totalIsPartial: false,
        };
    });
    return { readable: true, groups, memberCount };
}

/**
 * What the overlap scan could NOT see, as a sentence — or `null` when there was nothing it missed.
 *
 * ⛔ `ExistingLevelEnvelope` CARRIES NO RING. Measured: `levelEnvelopeSupersession.ts:102-123` is
 * `{ id, levelId, name, footprintAreaM2, provenance, group }`. So envelopes ALREADY in the store
 * cannot be compared against the blocks about to be created, and reporting "no overlaps" while
 * silently omitting them would be the §L-616 overstatement exactly: an UNKNOWN drawn as a zero.
 */
function _overlapLimit(input: MasterPlanAuthoringInput, superseded: ReadonlySet<string>): string | null {
    if (!input.existing.readable) return null;
    const unseen = input.existing.rows.filter((r) => !superseded.has(r.id));
    if (unseen.length === 0) return null;
    return `This overlap check compares the ${''}blocks in THIS gesture against each other only. `
        + `${unseen.length} level envelope${unseen.length === 1 ? '' : 's'} already in the project `
        + `${unseen.length === 1 ? 'is' : 'are'} NOT included, because the store read PRYZM has here `
        + 'carries each one\'s area but not its perimeter. ⛔ That is a gap in what was measured — '
        + 'NOT a finding that the new blocks are clear of them.';
}

// ──────────────────────────────────────────────────────────────────────────────────────────────

const _refuse = (
    reason: MasterPlanRefusalReason,
    statement: string,
    projectWideReason: EnvelopeAuthoringRefusalReason | null = null,
): MasterPlanAuthoringRefusal => ({ ok: false, reason, projectWideReason, statement });

/**
 * ⭐ N PROFILES → N BUILDINGS → ONE `spaceEnvelope.batch.create` → ONE Ctrl+Z.
 *
 * Pure; total; never throws; dispatches nothing (P6). Ids minted by the CALLER (C16 CA-2).
 */
export function buildMasterPlanAuthoringPlan(
    input: MasterPlanAuthoringInput,
): MasterPlanAuthoringResult {
    const span = _tracer.startSpan('pryzm.site.buildMasterPlanAuthoringPlan');
    try {
        const profiles = Array.isArray(input.profiles) ? input.profiles : [];
        span.setAttribute('pryzm.masterPlan.profiles', profiles.length);

        if (profiles.length === 0) {
            span.setAttribute('pryzm.masterPlan.refusal', 'no-profiles');
            return _refuse(
                'no-profiles',
                'There are no profiles to build. Draw at least one footprint on the parcel first; '
                + 'PRYZM will not invent one. This is a gap in what has been drawn — NOT a finding '
                + 'that nothing may be built here.',
            );
        }
        if (profiles.length > DRAWN_ENVELOPE_MAX_PROFILES) {
            span.setAttribute('pryzm.masterPlan.refusal', 'too-many-profiles');
            return _refuse(
                'too-many-profiles',
                `You have ${profiles.length} profiles; one master-plan gesture builds at most `
                + `${DRAWN_ENVELOPE_MAX_PROFILES}, so that ONE undo can still remove the whole thing. `
                + 'Nothing was created. This is a limit on the GESTURE, not a statement about what '
                + 'this parcel allows — build them in two presses.',
            );
        }

        // ── CALLER-WIRING REFUSALS FIRST. Both of these make two blocks silently ONE, which no
        // later check can detect and no user can see, so they are asked before anything is planned.
        const seenGroupIds = new Map<string, string>();
        for (const p of profiles) {
            const gid = p.group?.id ?? '';
            if (gid.length === 0) {
                span.setAttribute('pryzm.masterPlan.refusal', 'duplicate-group-id');
                return _refuse(
                    'duplicate-group-id',
                    `The profile "${p.profileId}" carries no building id, so PRYZM cannot tell which `
                    + 'building its envelopes belong to. Nothing was created. This is a gap in '
                    + 'PRYZM\'s wiring, not a refusal about your design.',
                );
            }
            const prior = seenGroupIds.get(gid);
            if (prior !== undefined) {
                span.setAttribute('pryzm.masterPlan.refusal', 'duplicate-group-id');
                return _refuse(
                    'duplicate-group-id',
                    `Two profiles ("${prior}" and "${p.profileId}") claim the same building `
                    + `"${p.group.label}". They would be created as ONE building, and each would `
                    + 'delete the other\'s storeys as it was built. Nothing was created.',
                );
            }
            seenGroupIds.set(gid, p.profileId);
        }
        const idOwner = new Map<string, string>();
        for (const p of profiles) {
            for (const id of p.mintedIds) {
                const prior = idOwner.get(id);
                if (prior !== undefined && prior !== p.profileId) {
                    span.setAttribute('pryzm.masterPlan.refusal', 'overlapping-minted-ids');
                    return _refuse(
                        'overlapping-minted-ids',
                        `The element id ${id} was handed to two profiles ("${prior}" and `
                        + `"${p.profileId}"), so one building's storey would overwrite the other's. `
                        + 'Nothing was created. This is a gap in PRYZM\'s wiring, not a refusal '
                        + 'about your design.',
                    );
                }
                idOwner.set(id, p.profileId);
            }
        }

        // ── ⭐ ONE PLANNER, ONCE PER PROFILE. Every decision below is the planner's; this loop
        // only records which of them was a plan and which was a refusal.
        const built: MasterPlanBuiltProfile[] = [];
        const skipped: SkippedMasterPlanProfile[] = [];
        const batchReasons: EnvelopeAuthoringRefusalReason[] = [];
        const conditional: { profile: MasterPlanProfileInput; reason: EnvelopeAuthoringRefusalReason; statement: string }[] = [];

        for (const p of profiles) {
            const r = buildEnvelopeAuthoringPlan({
                ring: p.ring,
                ringAreaM2: p.ringAreaM2,
                ringSourceLabel: p.ringSourceLabel,
                requestedStoreys: p.requestedStoreys,
                ordinance: input.ordinance,
                levels: input.levels,
                mintedIds: p.mintedIds,
                existing: input.existing,
                // ⭐⭐ THE ARGUMENT THAT MAKES THIS A MASTER PLAN RATHER THAN N GESTURES FIGHTING.
                // It scopes the supersession to THIS block, so building Block B leaves Block A
                // alone (C114 §6e clause 3). Without it every profile after the first would
                // compute the previous one's ids into `supersedes` and delete it.
                group: p.group,
                ...(p.startStoreyId !== undefined ? { startStoreyId: p.startStoreyId } : {}),
                ...(p.provenanceDetail !== undefined ? { provenanceDetail: p.provenanceDetail } : {}),
            });
            if (r.ok) {
                built.push({
                    profileId: p.profileId,
                    group: p.group,
                    envelopes: r.payload.envelopes,
                    storeys: r.storeys,
                    footprintAreaM2: r.footprintAreaM2,
                    totalIntendedM2: r.totalIntendedM2,
                    advisory: r.advisory,
                    supersedes: r.payload.supersedes,
                    replaces: r.replaces,
                    statement: r.statement,
                });
                continue;
            }
            const scope = _scopeOfRefusal(r.reason);
            if (scope === 'batch') {
                batchReasons.push(r.reason);
                // Keep going: a second, different batch reason is not more information, but the
                // FIRST one is the one reported, and stopping here would hide a per-profile
                // refusal the user also needs to fix. The refusal is emitted after the loop.
                continue;
            }
            if (scope === 'conditional') {
                conditional.push({ profile: p, reason: r.reason, statement: r.statement });
                continue;
            }
            skipped.push({
                profileId: p.profileId,
                groupId: p.group.id,
                groupLabel: p.group.label,
                reason: r.reason,
                statement: r.statement,
            });
        }

        // ── A project-wide fault refuses everything, whatever else happened.
        if (batchReasons.length > 0) {
            const reason = batchReasons[0]!;
            span.setAttribute('pryzm.masterPlan.refusal', 'every-profile-refused');
            span.setAttribute('pryzm.masterPlan.projectWideReason', reason);
            const one = profiles.length === 1;
            return _refuse(
                'every-profile-refused',
                (reason === 'envelopes-unreadable'
                    ? (input.existing.readable ? '' : input.existing.text) + ' '
                    : '')
                + `⚠ Nothing was created for ${one ? 'the profile' : `any of the ${profiles.length} profiles`}: `
                + 'this is a fault in what PRYZM could read or was handed, not a statement about any '
                + 'one of the footprints you drew, so building some of them would leave you a '
                + 'partial master plan with no reason you could see.',
                reason,
            );
        }

        // ── ⭐ D5's ACTUAL TEST, and it is a COUNT, not a classification. A conditional reason is
        // project-wide exactly when it refused EVERY profile — *"identical for every group"*. That
        // keeps "you asked for 4 storeys, this project has 1" a whole-batch refusal, while keeping
        // "not enough storeys" per-profile on the scheme where the podium asks for 3 and the towers
        // ask for 12 — which is a normal master plan, and where refusing everything would discard
        // the podium the user drew correctly.
        if (conditional.length > 0 && built.length === 0 && skipped.length === 0) {
            const first = conditional[0]!;
            const allSame = conditional.every((c) => c.reason === first.reason);
            span.setAttribute('pryzm.masterPlan.refusal', 'every-profile-refused');
            span.setAttribute('pryzm.masterPlan.projectWideReason', first.reason);
            return _refuse(
                'every-profile-refused',
                allSame
                    ? `${first.statement} ⚠ This is true of ${conditional.length === 1 ? 'the profile' : `all ${conditional.length} profiles`}`
                      + ', so nothing was created for any of them — it is a fact about the project, '
                      + 'not about any one footprint you drew.'
                    : `Every profile was refused, for more than one reason. The first: ${first.statement}`
                      + ' ⚠ Nothing was created.',
                first.reason,
            );
        }
        // Otherwise the conditional refusals are PER-PROFILE: some blocks build, these do not.
        for (const c of conditional) {
            skipped.push({
                profileId: c.profile.profileId,
                groupId: c.profile.group.id,
                groupLabel: c.profile.group.label,
                reason: c.reason,
                statement: c.statement,
            });
        }

        if (built.length === 0) {
            // Every profile was skipped for a per-profile reason. There is nothing to create, and
            // the honest answer names each one rather than a single generic sentence.
            span.setAttribute('pryzm.masterPlan.refusal', 'every-profile-refused');
            return _refuse(
                'every-profile-refused',
                `${skipped.map((s) => `${s.groupLabel}: ${s.statement}`).join(' ')} `
                + '⚠ Every profile was refused on its own terms, so nothing was created. Each '
                + 'sentence above names what to fix for that block; fixing any one of them is enough '
                + 'to build it on its own.',
                skipped[0]?.reason ?? null,
            );
        }

        // ── COMPOSE THE ONE PAYLOAD. ────────────────────────────────────────────────────────────
        const envelopes: AuthoredEnvelopeSpec[] = [];
        for (const b of built) envelopes.push(...b.envelopes);

        if (envelopes.length > MASTER_PLAN_MAX_ENVELOPES) {
            span.setAttribute('pryzm.masterPlan.refusal', 'above-composed-batch-limit');
            return _refuse(
                'above-composed-batch-limit',
                `These ${built.length} blocks come to ${envelopes.length} envelopes; one gesture mints `
                + `at most ${MASTER_PLAN_MAX_ENVELOPES}, so that ONE undo can still remove the whole `
                + 'thing. Nothing was created. This is a limit on the GESTURE, not a statement about '
                + 'what this parcel allows — build the blocks in two presses.',
            );
        }

        // ⛔ DE-DUPLICATED, because two blocks on the same storey CANNOT supersede the same
        // envelope — the resolver is group-scoped — but the ungrouped case can put one id in one
        // block's list only, and a set is the shape that makes the invariant obvious rather than
        // assumed. The handler refuses a repeated id, so this is also the difference between a
        // clear plan and a terse `_supersedeRefusal` bounce after the click.
        // ⛔ A UNION OF WHAT EACH BLOCK'S OWN RESOLVER RETURNED — never a fresh answer. Re-deriving
        // which envelopes the batch replaces would be the second implementation of the group rule.
        // The set is de-duplicated because the invariant "two blocks cannot supersede one envelope"
        // is a CONSEQUENCE of the resolver being group-scoped, and a `Set` makes it hold by
        // construction rather than by trusting the consequence.
        const supersedeSet = new Set<string>();
        const replaces: ExistingLevelEnvelope[] = [];
        const seenReplaceIds = new Set<string>();
        for (const b of built) {
            for (const id of b.supersedes) supersedeSet.add(id);
            for (const row of b.replaces) {
                if (seenReplaceIds.has(row.id)) continue;
                seenReplaceIds.add(row.id);
                replaces.push(row);
            }
        }

        // ⛔ THE INVARIANT, ASSERTED HERE WITH A SENTENCE rather than left to the handler's terse
        // `_supersedeRefusal`. A batch may not supersede an envelope it is also creating (C114 §6d
        // clause 2); if that were ever true here it would mean two profiles were handed the same
        // id, which the wiring gate above already refuses — so this is a belt on a brace, and it
        // says so in words the user can act on rather than bouncing after the click.
        const creating = new Set(envelopes.map((e) => e.spaceEnvelopeId));
        for (const id of supersedeSet) {
            if (creating.has(id)) {
                span.setAttribute('pryzm.masterPlan.refusal', 'overlapping-minted-ids');
                return _refuse(
                    'overlapping-minted-ids',
                    `The element id ${id} is both being created and being replaced by this gesture, `
                    + 'which cannot both be true. Nothing was created. This is a gap in PRYZM\'s '
                    + 'wiring, not a refusal about your design.',
                );
            }
        }

        const supersedes = Object.freeze([...supersedeSet]);
        const intent: 'create' | 'replace' = supersedes.length > 0 ? 'replace' : 'create';

        // ── ⭐ D4 — CALL the one measurer. See `_projectRoster`.
        const overlaps = findMassingGroupOverlaps(_projectRoster(built));
        span.setAttribute('pryzm.masterPlan.overlaps', overlaps.overlaps.length);
        span.setAttribute('pryzm.masterPlan.overlapUnmeasurable', overlaps.unmeasurable.length);

        const totalIntendedM2 = built.reduce((sum, b) => sum + b.totalIntendedM2, 0);
        span.setAttribute('pryzm.masterPlan.built', built.length);
        span.setAttribute('pryzm.masterPlan.skipped', skipped.length);
        span.setAttribute('pryzm.masterPlan.envelopes', envelopes.length);

        const blockWord = built.length === 1 ? 'building' : 'buildings';
        const skippedHalf = skipped.length === 0
            ? ''
            : ` ⚠ ${skipped.length} profile${skipped.length === 1 ? '' : 's'} `
              + `${skipped.length === 1 ? 'was' : 'were'} NOT built: `
              + `${skipped.map((s) => `${s.groupLabel} — ${s.statement}`).join(' ')}`;
        const replaceHalf = supersedes.length === 0
            ? ''
            : ` ${supersedes.length} level envelope${supersedes.length === 1 ? '' : 's'} already in `
              + `${supersedes.length === 1 ? 'its' : 'their'} own block ${supersedes.length === 1 ? 'is' : 'are'} `
              + 'replaced in the same command — the whole thing is ONE undo.';

        return {
            ok: true,
            command: 'spaceEnvelope.batch.create',
            payload: { envelopes: Object.freeze(envelopes), supersedes },
            intent,
            built: Object.freeze(built),
            skipped: Object.freeze(skipped),
            replaces: Object.freeze(replaces),
            overlaps,
            overlapLimit: _overlapLimit(input, supersedeSet),
            totalIntendedM2,
            statement:
                `Creates ${envelopes.length} level envelope${envelopes.length === 1 ? '' : 's'} across `
                + `${built.length} ${blockWord} (${built.map((b) => b.group.label).join(', ')}), `
                + `${totalIntendedM2.toFixed(0)} m² of intended floor area in total. Each block is `
                + 'independent: a change to one does not move the others, and every envelope is a '
                + 'DESIGN INTENT volume, never a permitted one.'
                + replaceHalf
                + skippedHalf,
        };
    } finally {
        span.end();
    }
}
