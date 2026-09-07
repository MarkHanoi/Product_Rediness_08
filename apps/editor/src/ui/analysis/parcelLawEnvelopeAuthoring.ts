// §PL-ENVELOPE-AUTHORING (lane PL-ENVELOPE-AUTHORING, 2026-09-06) — the CONTROL that lets a human
// CREATE a space envelope on the Parcel Law tab, extrude it over a chosen number of floor levels,
// and watch the law check move as they do it.
//
// STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.2 · §25.6 · §25.11 · C114 §6a / §12 / §14 ·
// RESI-ORCHESTRATOR-PLAN §3 (R2/R5) · C19 §5.6 · C58 §1.4 · C83 §1.2 · C08 §3.1 · P4 · P6 · P8.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER'S SENTENCE THIS FILE ANSWERS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// *"I DON'T KNOW HOW TO CONTINUE — what I want to do here is CREATE THE ENVELOPES for the house /
//  residential building … then CHECK LIVE AGAINST THE LAW … to see what I can build in second
//  floor for example — the maximum area of implantation — what I used."*
//
// So this section is exactly three things, in the order he asked for them:
//   1. CREATE — a footprint, extruded over N storeys, as N `role: 'level'` space envelopes in ONE
//      `spaceEnvelope.batch.create` (C114 §6a: one gesture, one Ctrl+Z).
//   2. AUTHOR THE PERIMETER — per created storey, the SHIPPED profile editor
//      (`window.spaceEnvelopeTool.enterProfileEditMode`, C114 §14 item 7). ⛔ No second outline
//      surface is written here; C114 §10b forbids one and the join already exists.
//   3. CHECK LIVE — implantation used vs the permitted footprint, floor area used vs the total
//      BRUT allowance, and what REMAINS for the floors above, recomputed on the same store channel
//      the 3-D scene renders from.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ EVERY NUMBER ON THIS SECTION IS PRODUCED ELSEWHERE. THIS FILE COMPUTES NOTHING.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   · the parcel / ordinance / massing figures → `resolveParcelLawModel` (§25.11 clause 1's ONE
//     model; the rail panel and the tab's fact section render the same value);
//   · which `BuildableEnvelope` is current, and its permitted RING → `resolveParcelLawEnvelope`,
//     extracted from that same reader by this lane so no second "which envelope?" rule exists;
//   · the create decision, the storey-count verdict and the height ladder →
//     `envelopeAuthoringPlan.ts` (pure, 21 cases);
//   · the BRUT / NET arithmetic and the per-storey remainder → `brutAreaAllocation.ts`, which
//     LANDED TODAY WITH NO PRODUCTION CALLER. This is its wire. ⛔ Not a re-derivation: the
//     `total − allocated` subtraction happens once, in that module;
//   · the allocation TABLE → `buildBrutAllocationHtml`, the renderer that shipped beside it;
//   · what is currently drawn → `collectIntendedAreas`, the same channel the envelope card reads.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ HOW TO READ THE LAW-CHECK TABLE, STATED BECAUSE THE WORDING CAN MISLEAD
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `buildBrutAllocation` was written for a user TYPING a target per storey, so a row it refuses
// says *"Nothing was allocated here."* Here the "request" is not typed — it is the area a user has
// already DRAWN. A refused row therefore means *"the envelope on this storey is outside the
// allowance"*, NOT *"nothing exists on this storey"*, and the envelope is neither deleted nor
// clamped. The lede sentence rendered above the table says exactly that, in the open, because a
// reading the user has to infer is a reading most users get wrong. Logged as L-12988 rather than
// tidied away.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ AN UNKNOWN ORDINANCE STILL AUTHORS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// At the founder's Córdoba parcel the card correctly says PRYZM has not transcribed the
// ordenanza's buildable rules — *"no-rule-pack … not an error"*. This section keeps the CREATE
// controls live there and reports compliance as UNKNOWN: `resolveBrutAllowance` returns
// `totalBrutM2: null` with a named reason, and `buildBrutAllocationHtml` renders that as *"not
// known · PRYZM will not guess"* in the admission voice, never as `0 m² remaining`. Those two
// demand opposite next actions from a user and rendering them alike is the single most-repeated
// defect in this repo (C58 §1.4 / L-616).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ §NO-RULE-PACK-STILL-AUTHORS (L-12993, 2026-09-06) — AND HIS OWN NUMBERS ARE THE THIRD RING
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The paragraph above was TRUE and still left the founder with no path. On his Córdoba parcel
// (CL CAPITULARES 18, `no-rule-pack`) `model.massing.footprintM2` is null, so the permitted-ring
// route is closed AND the fitted-plate route is closed with it — `resolveLiveTargetFootprintProposal`
// erodes INWARD from the permitted area, so it needs the very ring that does not exist. Both routes
// started from the same missing thing and the section correctly said so, which made it a DEAD END:
// every control was live, and the button could never enable.
//
// ⭐ HE HAD ALREADY SUPPLIED THE MISSING INPUT. `envelopeCardSections.buildStudyHeightEntryHtml`
// takes a HEIGHT and a SETBACK, `buildUserSuppliedStudyEnvelope` turns them into a study whose
// `footprintPolygon` IS a ring in the same scene-XZ frame as `insetPolygon`, and it was sitting in
// `contextDerivedStudyEnvelopeState` under this site's id — read by the card, unread by this
// section. So the third route reads the ring that already existed; ⛔ it does not compute one.
//
// ⛔ THE TWO RULES THAT MAKE THIS CORRECT RATHER THAN A FABRICATION (C58 §1.4 / L-616):
//   1. ONLY `heightBasis.method === 'user-supplied'` is accepted. The median-of-neighbours arm of
//      the same slot is PRYZM's own derivation with a setback PRYZM defaulted, and extruding it
//      would be exactly the *"setback PRYZM guesses when the ordenanza is silent"* — a fabricated
//      legal fact. A setback the USER typed is HIS decision and is carried as his.
//   2. ⛔ PRYZM NEVER PICKS THE SETBACK. There is no default here, no inference from neighbours and
//      no zero-on-his-behalf: with no saved decision this route is simply ABSENT, and the fallback
//      sentence names the control he can use. An UNKNOWN constraint drawn as zero is an
//      overstatement on real land, and it would be one made in PRYZM's voice.
// Every figure this route produces is therefore labelled a STUDY OF HIS OWN NUMBERS, never a
// permitted quantity — and the live law check above it still reports the allowance as UNKNOWN with
// its named reason, because supplying a setback tells PRYZM nothing about the ordenanza.
//
// ⚠ IT RANKS BELOW THE PERMITTED RING, DELIBERATELY. Where PRYZM HAS solved a determination, a
// study saved earlier — possibly before that solve — must not silently outrank it
// ([[verification-artifact-can-predate-subject]]). The fitted plate still wins over both, because
// it is a decision made INSIDE the current determination.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ §ENVELOPE-DRAW R8 (lane ENVELOPE-DRAW, 2026-09-07) — PRESSING CREATE TWICE REPLACES, IT DOES
// NOT ACCUMULATE — AND THE OUTCOME IS STATED BEFORE THE CLICK
// ══════════════════════════════════════════════════════════════════════════════════════════════
// L-13047 recorded this control as *"STILL ACCUMULATES: press it twice and you get two level
// envelopes per storey"*. The founder's L-13038 ruling — *"when I select another the previous shall
// be removed"* — applies to his own authoring. So every render reads what is already on the target
// storeys (`readLevelEnvelopes`, the SAME read the adopt card uses) and hands it to the planner,
// which returns the ids to SUPERSEDE in the one `spaceEnvelope.batch.create` (C114 §6d — one
// produceCommand, one undo). The intent line under the button says `create` / `replace` / `refuse`
// BEFORE the click, exactly as `adoptProposalAsEnvelope` does: a replace names what goes, a refuse
// withholds the button and prints the storey and the way out. ⛔ Only what this control AUTHORED is
// replaced (`OWN_AUTHORING_RULE`); a plate PRYZM fitted, or an origin PRYZM cannot read, refuses.
//
// ⛔ P6 — THIS FILE WRITES NO STORE. The one mutation it can cause is
// `bus.executeCommand('spaceEnvelope.batch.create', …)`. ⛔ P4 — no `(window as any)`: both globals
// it needs are reached through a typed, injectable host. ⛔ C08 §3.1 — every control it BUILDS is
// built with `createElement` + `textContent`; the single `innerHTML` sink takes the string from
// `buildBrutAllocationHtml`, which is the existing card renderer and escapes its own values.

import { trace } from '@opentelemetry/api';
import { createId } from '@pryzm/schemas';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { collectIntendedAreas, type IntendedAreaSnapshot } from '../site/intendedAreaChannel';
import { readLevelCandidates, type AdoptLevelCandidate } from '../site/adoptProposalAsEnvelope';
import {
    buildEnvelopeAuthoringPlan,
    type EnvelopeAuthoringResult,
} from '../site/envelopeAuthoringPlan';
import {
    buildBrutAllocation,
    resolveBrutAllowance,
    type AllocationRequest,
} from '../site/brutAreaAllocation';
import { buildBrutAllocationHtml } from '../site/envelopeCardSections';
import {
    resolveParcelLawEnvelope,
    resolveParcelLawModel,
    resolveParcelLawSiteId,
} from '../site/parcel/resolveParcelLawModel';
import {
    getContextDerivedStudyEnvelope,
    subscribeContextDerivedStudyEnvelope,
} from '../site/contextDerivedStudyEnvelopeState';
import type { ParcelLawModel } from '../site/parcel/parcelLawModel';
import { resolveLiveTargetFootprintProposal } from '../site/targetFootprintAreaState';
// §ENVELOPE-DRAW C4 (lane ENVELOPE-DRAW-2, 2026-09-07) — THE PERIMETER THE USER DREW ON A SITE
// VIEW. The gesture writes ONE session slot and this section READS it; nothing here draws, picks or
// projects. That slot carries its ring and its area from the SAME producer (the kernel's one
// shoelace), which is why this file can name a figure it did not compute without risking the
// *"a card states a figure the scene disagrees with"* defect (C84 EI-9).
import {
    clearDrawnEnvelopeFootprint,
    getDrawnEnvelopeFootprint,
    subscribeDrawnEnvelopeFootprint,
    type DrawnEnvelopeFootprint,
} from '../site/drawnEnvelopeFootprintState';
// §ENVELOPE-DRAW R8 (L-13047's tail) — WHAT IS ALREADY ON EACH STOREY, read through the same
// channel the massing-option adopt reads, so this control and that card cannot disagree about
// what is in the store (C84 EI-9). The judgement is the planner's; this file only reads.
import { readLevelEnvelopes, type LevelEnvelopeReadResult } from '../site/levelEnvelopeSupersession';
import { resolveEnvelopeStore, type LiveEnvelopeStore } from './parcelLawQuantities';

const _tracer = trace.getTracer('pryzm.analysis.parcelLawEnvelopeAuthoring');

/** `data-testid` on the section root. */
export const AUTHORING_SLOT_TESTID = 'analysis-parcel-law-authoring';
/** The storey-count entry. */
export const AUTHORING_STOREYS_INPUT_TESTID = 'parcel-law-authoring-storeys';
/** The create button. */
export const AUTHORING_CREATE_BTN_TESTID = 'parcel-law-authoring-create-btn';
/** The status line — plan, refusal or confirmation. `data-state` says which. */
export const AUTHORING_STATUS_TESTID = 'parcel-law-authoring-status';
/** The line naming WHICH ring will be extruded, and what that ring is. */
export const AUTHORING_SOURCE_TESTID = 'parcel-law-authoring-source';
/** The C114 §12 storey-count ADVISORY. Present only when the ask exceeds the derived count. */
export const AUTHORING_ADVISORY_TESTID = 'parcel-law-authoring-advisory';
/**
 * §ENVELOPE-DRAW R8 — what the NEXT click will do, stated before it: `data-intent` is
 * `create` / `replace` / `refuse` / `idle` (no storey count typed yet). On `refuse` the create
 * button is withheld and this line carries the reason and the way out.
 */
export const AUTHORING_INTENT_TESTID = 'parcel-law-authoring-intent';
/** One "Edit perimeter" button per created storey. `data-space-envelope-id` names its subject. */
export const AUTHORING_EDIT_PERIMETER_ATTR = 'data-authoring-edit-perimeter';
/** The list of created storeys with their perimeter-edit buttons. */
export const AUTHORING_CREATED_TESTID = 'parcel-law-authoring-created';
/**
 * §ENVELOPE-DRAW C4 — the way OUT of the drawn route. Present ONLY while the drawn perimeter is
 * the source; discarding it hands the ladder back to the plate / permitted ring / study below it.
 * ⛔ Without this the drawn ring would be a one-way door for the session: it outranks every other
 * route, so a user who drew once could never return to their fitted plate — a dead end wearing a
 * feature's clothes.
 */
export const AUTHORING_DISCARD_DRAWN_TESTID = 'parcel-law-authoring-discard-drawn';
/** The live BRUT/NET law-check slot. */
export const AUTHORING_LAWCHECK_TESTID = 'parcel-law-authoring-lawcheck';
/** How the law-check table must be read — see the header. */
export const AUTHORING_LAWCHECK_LEDE_TESTID = 'parcel-law-authoring-lawcheck-lede';
/** `'yes'`, or `'no:<reason>'` — whether the live store channel was subscribed. */
export const AUTHORING_SUBSCRIBED_ATTR = 'data-live-subscribed';
/** `'yes'` / `'no:threw'` — whether the USER-SUPPLIED study channel was subscribed (L-12993). */
export const AUTHORING_STUDY_SUBSCRIBED_ATTR = 'data-study-subscribed';
/**
 * §ENVELOPE-DRAW C4 — `'yes'` / `'no:threw'` / `'no:not-wired'`: whether the DRAWN-PERIMETER
 * channel was subscribed. Pinned by a spec because this attribute is the difference between the
 * gesture being REACHABLE and the ring landing in a slot nobody reads.
 */
export const AUTHORING_DRAWN_SUBSCRIBED_ATTR = 'data-drawn-subscribed';
/** How many repaints the STORE channel has driven. Read by the liveness spec. */
export const AUTHORING_LIVE_ATTR = 'data-live-repaints';

/** How the law-check table must be read. Stated in the open — see the header. */
export const LAWCHECK_LEDE =
    'Checked against what you have DRAWN. Each storey row is the level-envelope area on that '
    + 'storey, measured against the allowance. A row PRYZM refuses means that storey is outside '
    + 'the allowance — the envelope still exists and nothing was deleted or trimmed; PRYZM is '
    + 'declining to count it as compliant, and says with which two numbers.';

/** The typed capability host. P4 — no `(window as any)` anywhere in this file. */
export interface AuthoringCapabilityHost {
    readonly spaceEnvelopeTool?: {
        enterProfileEditMode: (spaceEnvelopeId: string) => void;
        profileEditAvailability: (spaceEnvelopeId: string) => { ok: boolean; reason?: string };
    } | undefined;
}

/**
 * §NO-RULE-PACK-STILL-AUTHORS (L-12993) — the STUDY MASSING the user supplied for this site, as
 * this section needs it. Every field is HIS, read off the study `buildUserSuppliedStudyEnvelope`
 * already built from his height and his setback — ⛔ nothing here is derived, defaulted or inferred.
 */
export interface UserSuppliedStudyFootprint {
    /** `ContextDerivedStudyEnvelope.footprintPolygon` — scene-XZ metres, the `insetPolygon` frame. */
    readonly ring: readonly { x: number; z: number }[];
    /** `footprintAreaM2`, from the same producer as the ring. Never recomputed here. */
    readonly areaM2: number;
    /** The inward offset HE typed. `0` means he typed zero, never that PRYZM assumed one. */
    readonly setbackM: number;
    /** The height HE typed, carried so the section can say what it does and does not drive. */
    readonly heightM: number;
}

/** One storey this gesture created, kept only so its perimeter can be opened for editing. */
interface CreatedStorey {
    readonly spaceEnvelopeId: string;
    readonly label: string;
}

export interface ParcelLawEnvelopeAuthoringDeps {
    /** Production: `() => window.runtime` — resolved per CALL, never captured (§L-545). */
    readonly runtime: () => PryzmRuntime | null | undefined;
    /** Production: `() => window.bimManager?.getLevels?.()`. Returns the raw records. */
    readonly readLevels: () => unknown;
    /** Production: `resolveParcelLawModel` — the ONE model (§25.11 clause 1). */
    readonly readModel: (rt: PryzmRuntime | null | undefined) => ParcelLawModel;
    /** Production: `resolveParcelLawEnvelope` — the SAME "which envelope is current" rule. */
    readonly readEnvelopeRing: (rt: PryzmRuntime | null | undefined) => readonly { x: number; z: number }[] | null;
    /**
     * Production: the USER-SUPPLIED study massing for the current site, or `null` (L-12993).
     * ⛔ Returns `null` for a PRYZM-derived study — see the header's rule 1.
     *
     * ⚠ OPTIONAL, so every spec literal written before this seam existed keeps compiling; omitted
     * means "no study", which is the state of every parcel whose owner never typed one.
     */
    readonly readStudyFootprint?: (rt: PryzmRuntime | null | undefined) => UserSuppliedStudyFootprint | null;
    /**
     * Production: `subscribeContextDerivedStudyEnvelope` — so SAVING a study height on the card
     * enables this section's button in the same beat, instead of on some later unrelated repaint.
     * ⚠ Optional for the same reason as `readStudyFootprint`.
     */
    readonly subscribeStudy?: (fn: () => void) => () => void;
    /**
     * §ENVELOPE-DRAW C4 — the perimeter the user DREW on a site view, or `null`.
     * Production: `getDrawnEnvelopeFootprint`.
     *
     * ⚠ OPTIONAL, and omitted means "nothing was drawn" — never "assume the module slot". A spec
     * written before this seam existed must not start reading a session singleton another spec in
     * the same file seeded; that is how a suite acquires order-dependence it cannot see.
     */
    readonly readDrawnFootprint?: () => DrawnEnvelopeFootprint | null;
    /**
     * §ENVELOPE-DRAW C4 — THE CHANNEL THAT MAKES THE GESTURE REACHABLE.
     * Production: `subscribeDrawnEnvelopeFootprint`.
     *
     * ⭐ WITHOUT THIS THE FEATURE IS [[authored-but-unwired-is-the-bottleneck]] AGAIN: the ring
     * would land in the slot and the panel would show it only on some later unrelated repaint —
     * i.e. the founder draws a perimeter and the panel keeps naming the plate. The gesture writes,
     * this section repaints itself, in the same beat. Same pub/sub shape as the study channel above.
     */
    readonly subscribeDrawn?: (fn: () => void) => () => void;
    /** Production: `createId('spaceEnvelope')`. Injected so a spec can pin the ids (C16 CA-2). */
    readonly mintId: () => string;
    /** Production: `window`. */
    readonly capabilityHost: AuthoringCapabilityHost;
    /**
     * §ENVELOPE-DRAW R8 — what is ALREADY in the space-envelope store, as the READ returned it.
     * Production: `readLevelEnvelopes(resolveEnvelopeStore(rt))`. Optional so every spec literal
     * written before this seam keeps compiling; omitted means the production read of the runtime's
     * own store, never "assume empty".
     */
    readonly readExisting?: (rt: PryzmRuntime | null | undefined) => LevelEnvelopeReadResult;
}

/** The production read of what is on the storeys — ONE channel, shared with the adopt card. */
function readExistingDefault(rt: PryzmRuntime | null | undefined): LevelEnvelopeReadResult {
    return readLevelEnvelopes(resolveEnvelopeStore(rt));
}

/** The production wiring. Resolved when CALLED, so a runtime composed after boot is seen. */
export function defaultParcelLawEnvelopeAuthoringDeps(): ParcelLawEnvelopeAuthoringDeps {
    const w = (typeof window !== 'undefined' ? window : {}) as unknown as
        AuthoringCapabilityHost & {
            runtime?: PryzmRuntime | null;
            bimManager?: { getLevels?: () => unknown[] };
        };
    return {
        runtime: () => w.runtime ?? null,
        readLevels: () => {
            try { return w.bimManager?.getLevels?.() ?? []; } catch { return []; }
        },
        readModel: (rt) => resolveParcelLawModel(rt),
        readEnvelopeRing: (rt) => {
            const env = resolveParcelLawEnvelope(rt).envelope;
            const ring = env?.insetPolygon ?? null;
            return Array.isArray(ring) && ring.length >= 3 ? ring : null;
        },
        // §NO-RULE-PACK-STILL-AUTHORS (L-12993) — the ring the user's OWN numbers already built.
        // ⛔ ONE STUDY SLOT, ONE SITE RULE: the study comes from the same session state the
        // envelope card renders (`contextDerivedStudyEnvelopeState`, written by
        // `applyUserSuppliedStudyHeight`), keyed by the same site the ONE parcel-law model reads
        // (`resolveParcelLawSiteId`). No second study, no second "which site".
        readStudyFootprint: (rt) => {
            try {
                const siteId = resolveParcelLawSiteId(rt);
                if (siteId === null) return null;
                const result = getContextDerivedStudyEnvelope(siteId);
                if (result === null || !result.ok) return null;
                const study = result.study;
                // ⛔ RULE 1 — a PRYZM-derived study is NOT the user's decision. See the header.
                if (study.heightBasis.method !== 'user-supplied') return null;
                const ring = study.footprintPolygon;
                if (!Array.isArray(ring) || ring.length < 3) return null;
                return {
                    ring,
                    areaM2: study.footprintAreaM2,
                    setbackM: study.setback_m,
                    heightM: study.heightBasis.suppliedHeight_m,
                };
            } catch (e) {
                console.warn('[analysis][parcel-law][authoring] study read failed (non-fatal):', e);
                return null;
            }
        },
        subscribeStudy: subscribeContextDerivedStudyEnvelope,
        // §ENVELOPE-DRAW C4 — the ONE drawn-perimeter slot and its ONE push channel. Module
        // functions, not a captured value: the gesture may finish long after this dep set is built.
        readDrawnFootprint: getDrawnEnvelopeFootprint,
        subscribeDrawn: subscribeDrawnEnvelopeFootprint,
        mintId: () => createId('spaceEnvelope'),
        capabilityHost: w,
    };
}

/**
 * §PL-IA-Q (STR §26.3) — where this ONE mount puts its two halves.
 *
 * ⛔ A PLACEMENT, NEVER A SPLIT OF THE PRODUCER. There is one `render()`, one store
 * subscription and one `buildLiveLawCheck` call whatever this says; only the parent of the
 * law-check pair changes.
 */
export interface ParcelLawEnvelopeAuthoringPlacement {
    /**
     * Host for the live law check (the lede + the BRUT/NET allowance ledger). Omit and the pair
     * stays inside this section, which is the historic layout.
     */
    readonly lawCheckHost?: HTMLElement | null;
}

export interface ParcelLawEnvelopeAuthoringHandle {
    readonly element: HTMLElement;
    /** Re-read everything and repaint. Cheap; never throws into the host. */
    repaint(): void;
    /** How many repaints the STORE channel has driven. Read by the liveness spec. */
    liveRepaintCount(): number;
    dispose(): void;
}

/** The footprint this gesture will extrude, and the honest name of where it came from. */
interface FootprintSource {
    /**
     * WHICH rung of the ladder answered. A machine-readable name beside the prose, so a surface can
     * offer a route-specific affordance (the drawn route's discard) without sniffing it back out of
     * `label` — [[confident-register-rows-are-the-wrong-ones]]: prose is for the user, not for code.
     */
    readonly kind: 'drawn' | 'plate' | 'permitted' | 'study' | 'none';
    readonly ring: readonly { x: number; z: number }[] | null;
    readonly areaM2: number | null;
    readonly label: string;
    /** The sentence rendered under the heading. Says what the ring IS and what it is not. */
    readonly text: string;
    /**
     * §ENVELOPE-DRAW — the `authoredProvenance` detail for an envelope made from this ring, in the
     * producer's own words (C58 §1.19 clause 3: an authored envelope names its own source).
     */
    readonly provenanceDetail: string;
}

/**
 * §ENVELOPE-DRAW C4 — how each gesture reads in a sentence. ⛔ A LABEL TABLE, NOT A SECOND MODE
 * TABLE: the six keys ARE `EnvelopeDrawMode`, spelled by that type, so a seventh mode is a compile
 * error here rather than a silently un-named shape (plan §7 rule 6).
 */
const DRAWN_MODE_NOUN: Readonly<Record<DrawnEnvelopeFootprint['mode'], string>> = Object.freeze({
    linear: 'freehand polyline',
    ortho: 'orthogonal polyline',
    curved: 'polyline with arcs',
    rectangular: 'rectangle',
    circular: 'circle',
    elliptical: 'ellipse',
});

/**
 * Decide which ring the create gesture extrudes. PURE over its inputs.
 *
 * ⭐ THE USER'S OWN PLATE WINS OVER THE PERMITTED RING. A fitted ground-floor plate is a decision
 * the user made in the section above this one (§5 / §RESI-ORCH-TARGET-AREA); the permitted ring is
 * an upper bound PRYZM solved. Extruding the bound while a chosen plate sits on the ground would
 * silently discard the choice.
 *
 * ⚠ `footprintIsUpperBound` TRAVELS WITH THE PERMITTED RING (L-619 / C58 §1.2). When the ring is
 * the whole parcel only because the setbacks are unknown, the sentence says so — extruding it
 * without that rider would present an unknown as a permission.
 *
 * ⭐ AND THE THIRD ROUTE, L-12993: the STUDY FOOTPRINT THE USER'S OWN SETBACK LEAVES. It ranks
 * LAST of the three on purpose — see the module header — and it is the only route open on a parcel
 * PRYZM holds no rule pack for, which is most parcels on earth. ⛔ It is offered only when a study
 * is PASSED IN; this function never invents one, and `null` for `study` means the user typed
 * nothing, not that his setback is zero.
 */
export function resolveFootprintSource(
    model: ParcelLawModel,
    permittedRing: readonly { x: number; z: number }[] | null,
    study: UserSuppliedStudyFootprint | null = null,
    drawn: DrawnEnvelopeFootprint | null = getDrawnEnvelopeFootprint(),
): FootprintSource {
    // ── §ENVELOPE-DRAW C4 — THE PERIMETER HE DREW, AND IT OUTRANKS ALL THREE SOLVED ROUTES ────
    //
    // ⭐ THE FOUNDER'S TOP-PRIORITY SENTENCE ENDS HERE: *"THE MOST IMPORTANT IS THE CAPACITY TO
    // CREATE — DRAW — DESIGN BUILDABLE ENVELOPES IN THE 2D SITE VIEW AND 3D SITE VIEW."* Everything
    // downstream of a ring already worked; this branch is what a ring he drew CONNECTS to.
    //
    // It ranks FIRST for the same reason the fitted plate outranks the permitted ring (below): it
    // is the most recent decision the USER made, and the two rungs beneath it are things PRYZM
    // solved or he typed earlier. Extruding a plate while a perimeter he just drew sits on the
    // ground would silently discard the gesture — the exact defect the plate rung exists to avoid,
    // one rung up. ⛔ The way back is not implicit: the section renders a DISCARD control while
    // this rung answers (`AUTHORING_DISCARD_DRAWN_TESTID`), so the ranking is reversible in one
    // click rather than a one-way door for the session.
    //
    // ⛔ THE AREA IS NOT RECOMPUTED HERE. The gesture computed it once, through the kernel's one
    // shoelace, and stored it beside the ring it was computed from. A second area routine at this
    // seam is how a card comes to state a figure the scene disagrees with (C84 EI-9).
    if (drawn !== null && drawn.ring.length >= 3) {
        const where = drawn.surfaceId === 'site-3d' ? 'the 3D Site view' : 'the 2D Site Map';
        const shape = DRAWN_MODE_NOUN[drawn.mode] ?? drawn.mode;
        return {
            kind: 'drawn',
            ring: drawn.ring,
            areaM2: drawn.areaM2,
            label: 'the perimeter you drew on this view',
            provenanceDetail:
                `user drew the envelope perimeter on ${where} (${shape}, ${drawn.ring.length} corners) `
                + 'and extruded it from the envelope authoring control',
            text:
                `Extrudes the ${drawn.areaM2.toFixed(0)} m² perimeter you drew on ${where} — ${drawn.ring.length} `
                + `corners, ${shape}. ⭐ This is YOUR design intent, not a statement of what the law permits: `
                + 'PRYZM is drawing what you asked for and checking it against whatever allowance it does know, '
                + 'below. Every storey gets this same ring; you can then edit any storey’s perimeter on its own. '
                + 'Draw again to replace this perimeter, or discard it to go back to the footprint PRYZM solved.',
        };
    }
    const permittedAreaM2 = model.massing?.footprintM2 ?? null;
    const plate = resolveLiveTargetFootprintProposal(
        permittedAreaM2 !== null && permittedAreaM2 > 0 ? permittedAreaM2 : null,
    );
    if (plate !== null) {
        return {
            kind: 'plate',
            ring: plate.ring,
            areaM2: plate.achievedAreaM2,
            label: 'the ground-floor plate you fitted',
            provenanceDetail: 'user extruded the ground-floor plate they fitted inside the permitted footprint, from the envelope authoring control',
            text:
                `Extrudes the ${plate.achievedAreaM2.toFixed(0)} m² plate you fitted on the ground, inside the `
                + `${plate.permittedAreaM2.toFixed(0)} m² permitted footprint. Every storey gets this same ring; `
                + 'you can then edit any storey’s perimeter on its own.',
        };
    }
    if (permittedRing !== null && permittedAreaM2 !== null && permittedAreaM2 > 0) {
        const upperBound = model.massing?.footprintIsUpperBound === true;
        return {
            kind: 'permitted',
            ring: permittedRing,
            areaM2: permittedAreaM2,
            provenanceDetail: upperBound
                ? 'user extruded the permitted footprint (an UPPER BOUND — setbacks unknown) from the envelope authoring control'
                : 'user extruded the permitted buildable footprint from the envelope authoring control',
            label: upperBound
                ? 'the permitted footprint, which is an UPPER BOUND'
                : 'the permitted buildable footprint',
            text: upperBound
                ? `Extrudes the ${permittedAreaM2.toFixed(0)} m² permitted footprint — which for this parcel is `
                  + 'the WHOLE parcel, because PRYZM does not know the setbacks. ⚠ That is an upper bound, not a '
                  + 'buildable area: fit a ground-floor area first if you want a realistic plate.'
                : `Extrudes the ${permittedAreaM2.toFixed(0)} m² permitted buildable footprint — a STUDY, not a `
                  + 'permit. Every storey gets this same ring; you can then edit any storey’s perimeter on '
                  + 'its own.',
        };
    }
    // ── THE THIRD ROUTE (L-12993) — his own numbers, labelled as his. ────────────────────────
    if (study !== null && study.ring.length >= 3) {
        const zeroSetback = study.setbackM <= 0;
        return {
            kind: 'study',
            ring: study.ring,
            areaM2: study.areaM2,
            label: `the ${study.setbackM.toFixed(1)} m setback you supplied`,
            provenanceDetail: `user extruded the study footprint their own ${study.setbackM.toFixed(1)} m setback leaves, from the envelope authoring control`,
            text:
                `Extrudes the ${study.areaM2.toFixed(0)} m² footprint YOUR OWN ${study.setbackM.toFixed(1)} m setback `
                + (zeroSetback
                    ? 'leaves — with a setback of zero that is the parcel ring itself. '
                    : 'leaves inside the parcel ring. ')
                + '⚠ This is YOUR study, not a permitted area: PRYZM has not transcribed an ordenanza for this '
                + 'parcel, so it is neither confirming this setback nor saying this may be built — it is drawing '
                + `what you asked for. You also supplied ${study.heightM.toFixed(1)} m as the study HEIGHT; each `
                + 'envelope’s storey height comes from this project’s storeys, not from that number. Change the '
                + 'setback on “Type one for a study massing” to move this line. Every storey gets this same ring; '
                + 'you can then edit any storey’s perimeter on its own.',
        };
    }
    return {
        kind: 'none',
        ring: null,
        areaM2: null,
        label: 'nothing',
        provenanceDetail: 'no ring — nothing is authored from this state',
        text:
            'PRYZM has not solved a buildable footprint for this parcel and no ground-floor plate is fitted, so '
            + 'there is no perimeter to extrude yet. This is a gap in what PRYZM has — NOT a finding that nothing '
            + 'may be built here. ⭐ You can author one from your own numbers: on the site card, under “Don’t know '
            + 'the height? Type one for a study massing”, enter a height and a setback and press “Build study from '
            + 'this height” — PRYZM will then extrude the footprint YOUR setback leaves inside the parcel ring, '
            + 'labelled as yours throughout. ⛔ PRYZM will not choose that setback for you: where the ordenanza is '
            + 'silent, a setback PRYZM invented would be a legal claim it has no basis for.',
    };
}

/**
 * ⭐ THE LIVE LAW CHECK. Turns what is DRAWN into the allocation model §25.2 specifies.
 * PURE over its inputs; the caller supplies the snapshot and the storeys.
 *
 * ⛔ The requests are the DRAWN areas, one per storey that carries at least one level envelope.
 * A storey with none gets NO request, so its row states its CEILING — which is the answer to
 * *"what can I build on the second floor?"* asked before anything is drawn there.
 */
export function buildLiveLawCheck(
    model: ParcelLawModel,
    storeys: readonly AdoptLevelCandidate[],
    snapshot: IntendedAreaSnapshot,
): ReturnType<typeof buildBrutAllocation> {
    const allowance = resolveBrutAllowance({
        permittedFootprintM2: model.massing?.footprintM2 ?? null,
        maxFAR: model.ordinance?.maxFAR ?? null,
        parcelAreaM2: model.geometry?.areaM2 ?? null,
        maxFloors: model.ordinance?.maxFloors ?? null,
    });
    const requests: AllocationRequest[] = snapshot.readable
        ? snapshot.byLevel
            .filter((l) => l.levelEnvelopeCount > 0)
            .map((l) => ({ levelId: l.levelId, requestedM2: l.intendedAreaM2 }))
        : [];
    return buildBrutAllocation(
        allowance,
        storeys.map((l) => ({ levelId: l.id, name: l.name, elevation: l.elevation })),
        requests,
    );
}

const H = (tag: string, css: string, text?: string): HTMLElement => {
    const el = document.createElement(tag);
    el.style.cssText = css;
    if (text !== undefined) el.textContent = text;
    return el;
};

/**
 * Mount the "Create the envelope" section into `host`.
 *
 * ⛔ NEVER THROWS INTO THE SURFACE. A tab that cannot build is a tab the founder cannot open, and
 * reachability is the whole point of the lane that created this tab (L-12915). Every arm that
 * fails renders a SENTENCE saying what failed, never an empty div.
 */
export function mountParcelLawEnvelopeAuthoring(
    host: HTMLElement,
    deps: ParcelLawEnvelopeAuthoringDeps = defaultParcelLawEnvelopeAuthoringDeps(),
    opts?: ParcelLawEnvelopeAuthoringPlacement,
): ParcelLawEnvelopeAuthoringHandle {
    const span = _tracer.startSpan('pryzm.analysis.mountParcelLawEnvelopeAuthoring');
    const root = document.createElement('div');
    root.className = 'anl-parcel-law-authoring';
    root.setAttribute('data-testid', AUTHORING_SLOT_TESTID);
    root.style.cssText = 'margin-top:9px;border-top:1px solid #efecf7;padding-top:7px;min-width:0;max-width:100%;';

    let disposed = false;
    let liveRepaints = 0;
    let unsubStore: (() => void) | null = null;
    /** §NO-RULE-PACK-STILL-AUTHORS — the study channel's own unsubscribe. */
    let unsubStudy: (() => void) | null = null;
    /** §ENVELOPE-DRAW C4 — the drawn-perimeter channel's own unsubscribe. */
    let unsubDrawn: (() => void) | null = null;
    /** What the user last typed, so a live repaint never blanks their entry. */
    let typedStoreys = '';
    /** The last gesture's outcome — carried, never sniffed back out of prose. */
    let lastResult: EnvelopeAuthoringResult | null = null;
    /** Set when the dispatch itself failed (as opposed to the plan refusing). */
    let dispatchError: string | null = null;
    /** The storeys the last successful create produced — the perimeter-edit subjects. */
    let created: readonly CreatedStorey[] = [];

    // ── the fixed chrome, built ONCE (C08 §3.1 — createElement + textContent only) ────────────
    const heading = H('div', 'font-weight:700;font-size:10.5px;color:#6600FF;', 'Create the envelope');
    const sourceLine = H('div', 'margin-top:3px;color:#8a83a0;font-size:9.5px;line-height:1.4;');
    sourceLine.setAttribute('data-testid', AUTHORING_SOURCE_TESTID);
    /** Which rung answered, as an attribute — so a surface and a spec agree without reading prose. */
    const sourceKindAttr = 'data-source-kind';

    // §ENVELOPE-DRAW C4 — THE WAY BACK OUT OF THE DRAWN ROUTE. Rendered only while the drawn
    // perimeter is the source; see `AUTHORING_DISCARD_DRAWN_TESTID`. ⛔ It clears the SESSION SLOT
    // only — an envelope already created from that ring is an element, and elements are removed by
    // undo or by the store, never by a panel quietly dropping a reference (P6).
    const discardDrawnBtn = document.createElement('button');
    discardDrawnBtn.type = 'button';
    discardDrawnBtn.textContent = 'Discard the drawn perimeter';
    discardDrawnBtn.setAttribute('data-testid', AUTHORING_DISCARD_DRAWN_TESTID);
    discardDrawnBtn.title =
        'Forgets the perimeter you drew, so this control goes back to the footprint PRYZM solved. '
        + 'Envelopes you already created from it are NOT removed — use undo for those.';
    discardDrawnBtn.style.cssText =
        'margin-top:4px;appearance:none;border:1px solid #d8d3e6;cursor:pointer;padding:3px 7px;'
        + 'border-radius:6px;font:600 9.5px system-ui;background:#faf9fd;color:#6600FF;';
    discardDrawnBtn.hidden = true;
    discardDrawnBtn.onclick = (ev): void => {
        ev.preventDefault();
        ev.stopPropagation();
        clearDrawnEnvelopeFootprint();
        render();
    };

    const entryRow = H('div', 'display:flex;gap:6px;margin-top:6px;align-items:flex-end;');
    const entryCol = H('div', 'flex:1;min-width:0;');
    const label = H('label', 'display:block;font-size:9px;color:#8a83a0;', 'Number of floor levels');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.setAttribute('data-testid', AUTHORING_STOREYS_INPUT_TESTID);
    input.style.cssText =
        'width:100%;box-sizing:border-box;padding:5px 6px;border-radius:6px;border:1px solid #d8d3e6;'
        + 'font:600 11px system-ui;';
    // §ENVELOPE-DRAW R8 — the intent line answers the storey count the user is TYPING, so it
    // re-renders per keystroke rather than on the next store event (which may never come).
    input.addEventListener('input', () => { typedStoreys = input.value; render(); });
    entryCol.appendChild(label);
    entryCol.appendChild(input);
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.textContent = 'Create envelope';
    createBtn.setAttribute('data-testid', AUTHORING_CREATE_BTN_TESTID);
    createBtn.style.cssText =
        'flex:none;appearance:none;border:1px solid #6600FF;cursor:pointer;padding:6px 10px;border-radius:8px;'
        + 'font:600 11px system-ui;background:#6600FF;color:#ffffff;';
    entryRow.appendChild(entryCol);
    entryRow.appendChild(createBtn);

    const statusLine = H('div', 'margin-top:5px;font-size:9.5px;line-height:1.45;min-height:12px;');
    statusLine.setAttribute('data-testid', AUTHORING_STATUS_TESTID);
    statusLine.setAttribute('data-state', 'idle');

    const advisoryLine = H('div', 'margin-top:5px;font-size:9.5px;line-height:1.45;');
    advisoryLine.setAttribute('data-testid', AUTHORING_ADVISORY_TESTID);
    advisoryLine.hidden = true;

    // §ENVELOPE-DRAW R8 — what the NEXT click does, before it. Hidden until a storey count is typed.
    const intentLine = H('div', 'margin-top:4px;font-size:9.5px;line-height:1.45;color:#6b6480;');
    intentLine.setAttribute('data-testid', AUTHORING_INTENT_TESTID);
    intentLine.setAttribute('data-intent', 'idle');
    intentLine.hidden = true;

    const createdList = H('div', 'margin-top:6px;');
    createdList.setAttribute('data-testid', AUTHORING_CREATED_TESTID);

    const lawLede = H('div',
        'margin-top:9px;font-size:9px;line-height:1.4;color:#8a83a0;', LAWCHECK_LEDE);
    lawLede.setAttribute('data-testid', AUTHORING_LAWCHECK_LEDE_TESTID);
    const lawSlot = H('div', 'margin-top:2px;');
    lawSlot.setAttribute('data-testid', AUTHORING_LAWCHECK_TESTID);

    // ⭐ §PL-IA-Q (STR §26.3) — THE LEDGER IS A DIFFERENT QUESTION FROM THE GESTURE.
    //
    // Sections 1–6 answer *"what do I want to build?"*; the live law check answers *"how much of
    // my allowance have I used, and what is left?"*. They were welded together because one mount
    // produced both, not because they belong in one place — and welding them is precisely the
    // flatness the founder named (§26.2: *"no hierarchy between 'what is this plot' and 'what may
    // I build' and 'what have I drawn'"*).
    //
    // ⛔ ONE MOUNT, ONE SUBSCRIPTION, ONE COMPUTATION — TWO PLACES ON THE PAGE. This is not a
    // second law check; `render()` writes to `lawSlot` whichever host holds it, so the ledger and
    // the create controls can never show different vintages of one envelope. When no placement is
    // given the pair stays inside this section, exactly as before, and every existing caller and
    // spec is unaffected.
    const lawCheckHost = opts?.lawCheckHost ?? null;
    root.append(heading, sourceLine, discardDrawnBtn, entryRow, intentLine, statusLine, advisoryLine, createdList);
    (lawCheckHost ?? root).append(lawLede, lawSlot);

    /** Read everything this section shows, from the ONE producer of each figure. */
    const readAll = (): {
        model: ParcelLawModel;
        source: FootprintSource;
        levels: readonly AdoptLevelCandidate[];
        snapshot: IntendedAreaSnapshot;
        existing: LevelEnvelopeReadResult;
    } => {
        const rt = deps.runtime();
        const model = deps.readModel(rt);
        // §NO-RULE-PACK-STILL-AUTHORS — a study read that throws must not blank the section; the
        // absence is a VALUE this resolver already handles (it renders the "type one" sentence).
        let study: UserSuppliedStudyFootprint | null = null;
        try { study = deps.readStudyFootprint?.(rt) ?? null; }
        catch (e) { console.warn('[analysis][parcel-law][authoring] study read threw (non-fatal):', e); }
        // §ENVELOPE-DRAW C4 — same rule as the study read: a slot that throws must not blank the
        // section, and its absence is a VALUE the resolver already handles (the next rung answers).
        let drawn: DrawnEnvelopeFootprint | null = null;
        try { drawn = deps.readDrawnFootprint?.() ?? null; }
        catch (e) { console.warn('[analysis][parcel-law][authoring] drawn-ring read threw (non-fatal):', e); }
        const source = resolveFootprintSource(model, deps.readEnvelopeRing(rt), study, drawn);
        const levels = readLevelCandidates(deps.readLevels());
        const store = resolveEnvelopeStore(rt);
        const snapshot = collectIntendedAreas(
            store as LiveEnvelopeStore | null,
            levels.map((l) => ({ id: l.id, name: l.name, elevation: l.elevation })),
        );
        const existing = (deps.readExisting ?? readExistingDefault)(rt);
        return { model, source, levels, snapshot, existing };
    };

    /**
     * §ENVELOPE-DRAW R8 — THE PLAN THE NEXT CLICK WOULD DISPATCH, built from the same inputs with
     * PLACEHOLDER ids (never dispatched — the click mints real ones, C16 CA-2). ONE producer for
     * "what will happen" and "what happened": the intent line and the click cannot disagree.
     */
    const previewPlan = (
        r: ReturnType<typeof readAll>,
    ): EnvelopeAuthoringResult | null => {
        const wanted = Number(typedStoreys);
        if (typedStoreys.trim() === '' || !Number.isFinite(wanted) || wanted <= 0 || !Number.isInteger(wanted)) return null;
        const n = Math.min(Math.floor(wanted), 64);
        const ids: string[] = [];
        for (let i = 0; i < n; i++) ids.push(`preview-${i}`);
        return buildEnvelopeAuthoringPlan({
            ring: r.source.ring,
            ringAreaM2: r.source.areaM2,
            ringSourceLabel: r.source.label,
            requestedStoreys: typedStoreys,
            ordinance: {
                maxHeightM: r.model.ordinance?.maxHeightM ?? null,
                maxFloors: r.model.ordinance?.maxFloors ?? null,
            },
            levels: r.levels,
            mintedIds: ids,
            existing: r.existing,
            provenanceDetail: r.source.provenanceDetail,
        });
    };

    /** Paint the perimeter-edit buttons for whatever the last create produced. */
    const renderCreated = (): void => {
        createdList.replaceChildren();
        if (created.length === 0) return;
        const tool = deps.capabilityHost.spaceEnvelopeTool;
        const note = H('div', 'font-size:9px;color:#8a83a0;line-height:1.4;',
            tool
                ? 'Author each storey’s perimeter in the outline editor — straight, orthogonal or curved. '
                  + 'Each storey is its own element, so editing one does not move the others.'
                : 'The outline editor is not reachable in this session, so PRYZM is not offering a button that '
                  + 'would do nothing. The envelopes were still created — you can drag their faces in the 3-D view.');
        createdList.appendChild(note);
        if (!tool) return;
        for (const c of created) {
            const row = H('div', 'display:flex;gap:6px;align-items:center;margin-top:4px;min-width:0;');
            row.appendChild(H('div', 'flex:1;min-width:0;font-size:10px;color:#4b4460;overflow-wrap:break-word;', c.label));
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Edit perimeter';
            btn.setAttribute(AUTHORING_EDIT_PERIMETER_ATTR, '');
            btn.setAttribute('data-space-envelope-id', c.spaceEnvelopeId);
            btn.style.cssText =
                'flex:none;appearance:none;border:1px solid #d8d3e6;cursor:pointer;padding:4px 8px;'
                + 'border-radius:6px;font:600 10px system-ui;background:#faf9fd;color:#6600FF;';
            // ⛔ THE AVAILABILITY IS ASKED OF THE TOOL, NOT GUESSED. `profileEditAvailability` is
            // the resolver's own per-element verdict, so a button that cannot work is DISABLED
            // WITH ITS REASON rather than shown and dead (§FIX-DEAD-EDIT-PROFILE-BUTTON).
            let verdict: { ok: boolean; reason?: string } = { ok: true };
            try { verdict = tool.profileEditAvailability(c.spaceEnvelopeId); }
            catch (e) { verdict = { ok: false, reason: `PRYZM could not ask the outline editor: ${String(e)}` }; }
            if (!verdict.ok) {
                btn.disabled = true;
                btn.style.cursor = 'not-allowed';
                btn.style.opacity = '0.55';
                btn.title = verdict.reason ?? 'Not available for this envelope.';
            } else {
                btn.onclick = (ev): void => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    try { tool.enterProfileEditMode(c.spaceEnvelopeId); }
                    catch (e) {
                        setStatus(
                            `PRYZM could not open the outline editor: ${String((e as Error)?.message ?? e)}. `
                            + 'Nothing changed.',
                            'refused',
                        );
                    }
                };
            }
            row.appendChild(btn);
            createdList.appendChild(row);
        }
    };

    const setStatus = (text: string, state: 'idle' | 'refused' | 'done' | 'plan'): void => {
        statusLine.textContent = text;
        statusLine.setAttribute('data-state', state);
        const refused = state === 'refused';
        statusLine.style.color = refused ? '#8a5a00' : '#6b6480';
        statusLine.style.background = text === '' ? '' : refused ? '#fdf8ee' : '#faf9fd';
        statusLine.style.borderLeft = text === '' ? '' : `2px solid ${refused ? '#c9973a' : '#6600FF'}`;
        statusLine.style.padding = text === '' ? '' : '4px 6px';
        statusLine.style.borderRadius = text === '' ? '' : '0 5px 5px 0';
    };

    const render = (): void => {
        if (disposed) return;
        try {
            const { model, source, levels, snapshot, existing } = readAll();

            sourceLine.textContent = source.text;
            sourceLine.setAttribute(sourceKindAttr, source.kind);
            // §ENVELOPE-DRAW C4 — the discard is offered exactly when it has a subject.
            discardDrawnBtn.hidden = source.kind !== 'drawn';
            input.value = typedStoreys;
            const derived = model.ordinance?.maxFloors ?? null;
            input.placeholder = derived !== null && derived > 0
                ? `e.g. ${derived}`
                : 'e.g. 2';
            label.textContent = derived !== null && derived > 0
                ? `Number of floor levels — the study derives ${derived}`
                : levels.length > 0
                    ? `Number of floor levels — this project has ${levels.length} storey${levels.length === 1 ? '' : 's'}`
                    : 'Number of floor levels';

            // ⛔ THE CONTROL IS OFFERED ONLY WHERE IT CAN WORK. A create button with no ring to
            // extrude can only ever refuse, and a control that can only fail is a dead click with
            // a label on it. The reason is already in `source.text` above it.
            let canCreate = source.ring !== null;
            input.disabled = !canCreate;

            // ── §ENVELOPE-DRAW R8 — STATE THE OUTCOME BEFORE THE CLICK ─────────────────────────
            // `create` / `replace` / `refuse`, from the SAME planner the click runs. A refuse of the
            // supersession class (a rival this control did not author, an unreadable store)
            // WITHHOLDS the button and prints the reason; every other refusal (storey count, no
            // levels) is left to the click, exactly as before, because the user is still typing.
            const preview = canCreate ? previewPlan({ model, source, levels, snapshot, existing }) : null;
            let intent: 'idle' | 'create' | 'replace' | 'refuse' = 'idle';
            let intentText = '';
            if (preview !== null) {
                if (preview.ok) {
                    intent = preview.intent;
                    intentText = preview.intent === 'replace'
                        ? preview.statement
                        : `Creates ${preview.storeys.length} level envelope${preview.storeys.length === 1 ? '' : 's'} — `
                          + 'the target storeys carry nothing this control made. One undo removes them.';
                } else if (preview.reason === 'rival-envelope-not-authored' || preview.reason === 'envelopes-unreadable') {
                    intent = 'refuse';
                    intentText = preview.statement;
                    canCreate = false;
                }
            }
            intentLine.hidden = intent === 'idle';
            intentLine.textContent = intentText;
            intentLine.setAttribute('data-intent', intent);
            intentLine.style.color = intent === 'refuse' ? '#8a5a00' : intent === 'replace' ? '#4b4460' : '#6b6480';
            intentLine.style.background = intent === 'refuse' ? '#fdf8ee' : intent === 'replace' ? '#f4f0ff' : '';
            intentLine.style.borderLeft = intent === 'refuse' ? '2px solid #c9973a' : intent === 'replace' ? '2px solid #6600FF' : '';
            intentLine.style.padding = intent === 'idle' ? '' : '4px 6px';
            intentLine.style.borderRadius = intent === 'idle' ? '' : '0 5px 5px 0';
            createBtn.textContent = intent === 'replace' ? 'Replace and create envelope' : 'Create envelope';
            createBtn.title = intent === 'replace'
                ? 'Replaces the level envelope(s) you authored earlier on these storeys — one undo brings them back.'
                : intent === 'refuse'
                    ? 'Withheld — see the reason above the button.'
                    : '';

            createBtn.disabled = !canCreate;
            createBtn.style.opacity = canCreate ? '1' : '0.55';
            createBtn.style.cursor = canCreate ? 'pointer' : 'not-allowed';

            // The status line survives a repaint: it is about the user's LAST gesture, and a store
            // event is not a gesture. Only its numbers are re-read, never its verdict.
            if (dispatchError !== null) setStatus(dispatchError, 'refused');
            else if (lastResult !== null && !lastResult.ok) setStatus(lastResult.statement, 'refused');
            else if (lastResult !== null && lastResult.ok) {
                setStatus(
                    lastResult.intent === 'replace'
                        ? `Replaced — one undo brings the previous back. ${lastResult.statement}`
                        : `Created — one undo removes it. ${lastResult.statement}`,
                    'done',
                );
            }

            const advisory = lastResult !== null && lastResult.ok ? lastResult.advisory : null;
            advisoryLine.hidden = advisory === null;
            if (advisory !== null) {
                advisoryLine.textContent = advisory.statement;
                advisoryLine.style.color = '#8a5a00';
                advisoryLine.style.background = '#fdf8ee';
                advisoryLine.style.borderLeft = '2px solid #c9973a';
                advisoryLine.style.padding = '4px 6px';
                advisoryLine.style.borderRadius = '0 5px 5px 0';
            }

            renderCreated();

            // ── THE LIVE LAW CHECK ────────────────────────────────────────────────────────────
            if (!snapshot.readable) {
                // ⛔ FAILURE IS NOT EMPTINESS. An unreadable store renders the channel's own
                // sentence, never a table of zeros that looks like a finding.
                lawSlot.replaceChildren(H('div', 'font-size:9.5px;line-height:1.45;color:#8a5a00;', snapshot.text));
            } else {
                lawSlot.innerHTML = buildBrutAllocationHtml(buildLiveLawCheck(model, levels, snapshot));
            }
        } catch (e) {
            console.warn('[analysis][parcel-law][authoring] render failed (non-fatal):', e);
            root.replaceChildren(H('div', 'font-size:9.5px;line-height:1.45;color:#8a5a00;',
                'The envelope-authoring section could not render this pass. This is a failure of THIS '
                + 'section, not a finding about your project.'));
            // ⛔ THE LEDGER GOES WITH IT. When it was placed in another host, `replaceChildren`
            // above cannot reach it, and a stale allowance table left standing beside a section
            // that just admitted it could not render is the worst of both — a figure with no
            // statement of its own vintage. It states the same failure instead.
            if (lawCheckHost !== null) {
                lawLede.remove();
                lawSlot.replaceChildren(H('div', 'font-size:9.5px;line-height:1.45;color:#8a5a00;',
                    'The allowance ledger could not be re-read this pass, because the section that '
                    + 'produces it failed to render. The figures above it are from the last pass '
                    + 'that succeeded.'));
            }
        }
    };

    createBtn.onclick = (ev): void => {
        ev.preventDefault();
        ev.stopPropagation();
        dispatchError = null;
        created = [];
        try {
            const { model, source, levels, existing } = readAll();
            // ⛔ THE IDS ARE MINTED HERE, NEVER IN THE HANDLER (C16 CA-2): `execute()` runs again
            // on REDO, so an id minted inside the handler would differ the second time and orphan
            // every `withinId` pointing at the first.
            const wanted = Number(typedStoreys);
            const idCount = Number.isFinite(wanted) && wanted > 0 && wanted <= 64 ? Math.floor(wanted) : 1;
            const mintedIds: string[] = [];
            for (let i = 0; i < idCount; i++) mintedIds.push(deps.mintId());

            const plan = buildEnvelopeAuthoringPlan({
                ring: source.ring,
                ringAreaM2: source.areaM2,
                ringSourceLabel: source.label,
                requestedStoreys: typedStoreys,
                ordinance: {
                    maxHeightM: model.ordinance?.maxHeightM ?? null,
                    maxFloors: model.ordinance?.maxFloors ?? null,
                },
                levels,
                mintedIds,
                // §ENVELOPE-DRAW R8 — read in the SAME beat as the click, never from the last render:
                // a store event between them is exactly the state a stale read would create blind on.
                existing,
                provenanceDetail: source.provenanceDetail,
            });
            lastResult = plan;
            if (!plan.ok) { render(); return; }

            const bus = deps.runtime()?.bus;
            if (!bus || typeof bus.executeCommand !== 'function') {
                // An admission about PRYZM's wiring, never a statement about the user's project.
                dispatchError =
                    'This surface has no command bus, so PRYZM cannot create the envelope. Nothing was created '
                    + 'and nothing changed — this is a gap in the wiring, not a refusal about your design.';
                render();
                return;
            }
            // ⛔ P6 — the ONLY mutation path, and ONE batch verb so one gesture is one Ctrl+Z.
            bus.executeCommand(plan.command, plan.payload);
            created = plan.storeys.map((s, i) => ({
                spaceEnvelopeId: plan.payload.envelopes[i]!.spaceEnvelopeId,
                label: s.label,
            }));
        } catch (e) {
            dispatchError =
                `PRYZM could not create the envelope: ${String((e as Error)?.message ?? e)}. `
                + 'Nothing was created and nothing changed.';
            created = [];
        }
        render();
    };

    try {
        host.appendChild(root);
        render();

        // ── THE LIVE CHANNEL — the SAME one the 3-D scene renders from. ───────────────────────
        // `Store.applyPatch` notifies `subscribeDirty` on execute, undo AND redo alike, so one
        // subscription covers a create, a face drag, a footprint edit and a Ctrl+Z. RESI-
        // ORCHESTRATOR-PLAN §3: honour the existing synchronisation contract, never invent a
        // fourth update path.
        const store = resolveEnvelopeStore(deps.runtime());
        if (store && typeof store.subscribeDirty === 'function') {
            try {
                unsubStore = store.subscribeDirty(() => {
                    if (disposed || !root.isConnected) return;
                    liveRepaints += 1;
                    render();
                    root.setAttribute(AUTHORING_LIVE_ATTR, String(liveRepaints));
                });
                root.setAttribute(AUTHORING_SUBSCRIBED_ATTR, 'yes');
            } catch (e) {
                root.setAttribute(AUTHORING_SUBSCRIBED_ATTR, 'no:threw');
                console.warn('[analysis][parcel-law][authoring] subscribeDirty threw — the law check will '
                    + 'not update as envelopes change:', e);
            }
        } else {
            root.setAttribute(
                AUTHORING_SUBSCRIBED_ATTR,
                store ? 'no:store-has-no-dirty-channel' : 'no:no-store',
            );
            console.warn('[analysis][parcel-law][authoring] runtime.stores.spaceEnvelope '
                + (store ? 'exposes no subscribeDirty' : 'is not reachable')
                + ' — the law check will not update live this session.');
        }
        // ── THE STUDY CHANNEL (L-12993) — the founder types a height and a setback on the card,
        // `applyUserSuppliedStudyHeight` writes the ONE study slot, and this section's create
        // button must enable IN THAT BEAT. Without this subscription the ring would appear only on
        // some later unrelated repaint, which is the §AUTHORED-BUT-UNWIRED shape: the fix would be
        // present and the founder would not see it. Same pub/sub the 3-D study volume uses.
        if (deps.subscribeStudy) {
            try {
                unsubStudy = deps.subscribeStudy(() => {
                    if (disposed || !root.isConnected) return;
                    render();
                });
                root.setAttribute(AUTHORING_STUDY_SUBSCRIBED_ATTR, 'yes');
            } catch (e) {
                root.setAttribute(AUTHORING_STUDY_SUBSCRIBED_ATTR, 'no:threw');
                console.warn('[analysis][parcel-law][authoring] study subscribe threw — a study saved on '
                    + 'the card will not enable the create button until this section repaints:', e);
            }
        } else {
            root.setAttribute(AUTHORING_STUDY_SUBSCRIBED_ATTR, 'no:not-wired');
        }
        // ── THE DRAWN-PERIMETER CHANNEL (§ENVELOPE-DRAW C4) — the founder clicks the last corner
        // on the 2D Site Map or 3D Site, `siteEnvelopeDrawArming` stores ring + area, and THIS
        // section must name it as the source in that same beat. Without the subscription the panel
        // would keep announcing the plate it was going to extrude a moment ago, which is the
        // [[committed-is-not-reachable]] shape: the ring exists, the wire does not.
        if (deps.subscribeDrawn) {
            try {
                unsubDrawn = deps.subscribeDrawn(() => {
                    if (disposed || !root.isConnected) return;
                    render();
                });
                root.setAttribute(AUTHORING_DRAWN_SUBSCRIBED_ATTR, 'yes');
            } catch (e) {
                root.setAttribute(AUTHORING_DRAWN_SUBSCRIBED_ATTR, 'no:threw');
                console.warn('[analysis][parcel-law][authoring] drawn-ring subscribe threw — a perimeter '
                    + 'drawn on a site view will not appear here until this section repaints:', e);
            }
        } else {
            root.setAttribute(AUTHORING_DRAWN_SUBSCRIBED_ATTR, 'no:not-wired');
        }
        span.setAttribute('pryzm.analysis.parcelLawAuthoring.mounted', true);
    } catch (e) {
        span.setAttribute('pryzm.analysis.parcelLawAuthoring.mounted', false);
        console.warn('[analysis][parcel-law][authoring] mount failed (non-fatal):', e);
    } finally {
        span.end();
    }

    return {
        element: root,
        repaint: render,
        liveRepaintCount: () => liveRepaints,
        dispose(): void {
            if (disposed) return;
            disposed = true;
            try { unsubStore?.(); } catch { /* teardown is best-effort */ }
            unsubStore = null;
            try { unsubStudy?.(); } catch { /* teardown is best-effort */ }
            unsubStudy = null;
            try { unsubDrawn?.(); } catch { /* teardown is best-effort */ }
            unsubDrawn = null;
            root.remove();
            // §PL-IA-Q — the law-check pair is this mount's, wherever it was placed. `root.remove()`
            // reaches it only when it lives inside `root`; a mount that left a live ledger standing
            // in someone else's host after disposing is the stranded-chrome failure the tab body's
            // own teardown exists to prevent.
            lawLede.remove();
            lawSlot.remove();
        },
    };
}
