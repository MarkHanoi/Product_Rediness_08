// §MASTER-PLAN-IS-REACHABLE (lane MP-WIRE, 2026-09-09) — ADR-0383 S3 + S5, WIRED.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THIS FILE IS A WIRE. IT CONTAINS NO ENGINE, AND THAT IS THE WHOLE POINT OF IT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Five lanes built master planning on 2026-09-09. Every layer was committed, tested and
// scramble-proven, and the founder could not reach ONE of them — he sent a screenshot of the
// right-hand rail and asked when he could create multiple profiles. Measured that evening:
//
//     masterPlanAuthoringPlan   → called by NOTHING but its own spec
//     getDrawnEnvelopeProfiles  → called by NOTHING but its own module
//
// That is [[authored-but-unwired-is-the-bottleneck]] at fleet scale: each lane built its layer
// correctly and no lane owned the wire. ⛔ SO NOTHING HERE DECIDES ANYTHING. Every judgement is
// made by a module that already existed and is already tested:
//
//   · WHICH PROFILES EXIST        → `drawnEnvelopeFootprintState` (the session roster, ADR-0383 S5)
//   · WHAT THE GESTURE BUILDS     → `buildMasterPlanAuthoringPlan` (ADR-0383 S3) — N profiles into
//                                    ONE `spaceEnvelope.batch.create`, one Ctrl+Z
//   · WHICH BLOCKS COLLIDE        → the plan's own `overlaps`, measured by `intersectPolygons2D`
//                                    inside `findMassingGroupOverlaps` (ADR-0383 D4)
//   · WHAT IS ALREADY ON A STOREY → `readLevelEnvelopes` (the same channel the single-building
//                                    card and the adopt card read — C84 EI-9, one answer)
//   · WHERE THE PERIMETER COMES FROM → the existing draw gesture (`siteEnvelopeDrawArming`)
//
// If a sentence in this file states a number, that number came off one of those producers. A
// second area routine, a second overlap check or a second "what does this replace" here would be
// the rival-solver shape this repo has already paid for four times.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ HOW N PROFILES ARE DRAWN — AND WHY THERE IS NO "MASTER-PLANNING MODE" FLAG
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `drawnEnvelopeFootprintState`'s header rules this out explicitly, and this file OBEYS it rather
// than re-litigating it. The draw gesture keeps its one unchanged meaning — *"write the most
// recent profile"* — and the roster is grown by an explicit control:
//
//     draw A               → [P1(A)]
//     press "Add another"  → [P1(A), P2(A)]   ← P2 starts as a COPY, and this section SAYS so
//     draw B               → [P1(A), P2(B)]
//
// ⛔ A capture-mode flag (*"the next draw appends instead of replacing"*) is hidden state that
// decides what a gesture means, written by one surface and read by another — the exact shape of
// [[view-region-one-owner]]. The seeded copy is visible, is stated on the row that carries it, and
// is undone by drawing.
//
// ⛔ AND `getDrawnEnvelopeFootprint()` STILL MEANS "THE MOST RECENT". Nothing in this file changes
// that, which is why the single-building create card next door is untouched by master planning.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE ADVISORY IS AN ADVISORY. IT IS NEVER RENDERED AS A REFUSAL
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Two blocks overlapping on the SAME storey is measured and reported with BOTH numbers. Two blocks
// overlapping on DIFFERENT storeys is a podium and a tower and is not a finding at all — the scan
// is same-storey by construction, so it never even produces one. The Create button is NEVER
// disabled by an overlap: [[spatial-validity-rules-founder-direction]] separates IMPOSSIBLE from
// INADVISABLE, and this is the second.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// P6 / C16 CA-2 / C08 §3.1
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The ONE mutation is `bus.executeCommand('spaceEnvelope.batch.create', …)` — no store is written
// here. Every envelope id and every group id is minted by THIS caller before the dispatch, because
// `execute()` runs again on REDO and an id minted inside a handler would differ the second time.
// Every element is built with `createElement` + `textContent`; there is no `innerHTML` sink.

import { trace } from '@opentelemetry/api';
import { createId } from '@pryzm/schemas';
import type { AdoptLevelCandidate } from './adoptProposalAsEnvelope';
import { readLevelCandidates } from './adoptProposalAsEnvelope';
import {
    addDrawnEnvelopeProfile,
    clearDrawnEnvelopeProfiles,
    getDrawnEnvelopeProfiles,
    removeDrawnEnvelopeProfile,
    subscribeDrawnEnvelopeFootprint,
    DRAWN_ENVELOPE_MAX_PROFILES,
    type DrawnEnvelopeProfile,
} from './drawnEnvelopeFootprintState';
import {
    armEnvelopeDraw,
    getEnvelopeDrawStatus,
    subscribeEnvelopeDrawStatus,
    type EnvelopeDrawActivation,
    type EnvelopeDrawStatus,
} from './siteEnvelopeDrawArming';
import {
    buildMasterPlanAuthoringPlan,
    type MasterPlanAuthoringResult,
    type MasterPlanProfileInput,
} from './masterPlanAuthoringPlan';
import { readLevelEnvelopes, type LevelEnvelopeReadResult } from './levelEnvelopeSupersession';
import type { SpaceEnvelopeReadHandle } from './intendedAreaChannel';
// ⭐ THE ONE PARCEL-LAW MODEL — the same resolver the envelope card and the single-building create
// card read, so the ordinance figure this section hands the planner cannot disagree with the one
// question 2 prints next to it (C84 EI-9).
import { resolveParcelLawModel } from './parcel/resolveParcelLawModel';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

const _tracer = trace.getTracer('pryzm.site.masterPlanSection');

/** PRYZM purple — white + violet only ([[preview-color-unified-pryzm-purple]]). */
const VIOLET = '#6600FF';
const INK_SOFT = '#8a83a0';
const ADVISORY_INK = '#8a5a00';
const ADVISORY_EDGE = '#c9973a';
const ADVISORY_BG = '#fdf8ee';
const REFUSAL_INK = '#9b2c2c';

export const MASTER_PLAN_ROOT_TESTID = 'site-master-plan';
export const MASTER_PLAN_VERDICT_TESTID = 'site-master-plan-verdict';
export const MASTER_PLAN_ROSTER_TESTID = 'site-master-plan-roster';
export const MASTER_PLAN_PROFILE_ROW_TESTID = 'site-master-plan-profile';
export const MASTER_PLAN_EMPTY_TESTID = 'site-master-plan-empty';
export const MASTER_PLAN_DRAW_BTN_TESTID = 'site-master-plan-draw';
export const MASTER_PLAN_ADD_BTN_TESTID = 'site-master-plan-add';
export const MASTER_PLAN_CLEAR_BTN_TESTID = 'site-master-plan-clear';
export const MASTER_PLAN_STOREYS_INPUT_TESTID = 'site-master-plan-storeys';
export const MASTER_PLAN_CREATE_BTN_TESTID = 'site-master-plan-create';
export const MASTER_PLAN_PREVIEW_TESTID = 'site-master-plan-preview';
export const MASTER_PLAN_BUILT_ROW_TESTID = 'site-master-plan-will-build';
export const MASTER_PLAN_SKIPPED_ROW_TESTID = 'site-master-plan-skipped';
export const MASTER_PLAN_ADVISORY_TESTID = 'site-master-plan-advisory';
export const MASTER_PLAN_OVERLAP_LIMIT_TESTID = 'site-master-plan-overlap-limit';
export const MASTER_PLAN_UNMEASURABLE_TESTID = 'site-master-plan-unmeasurable';
export const MASTER_PLAN_REFUSAL_TESTID = 'site-master-plan-refusal';
export const MASTER_PLAN_STATUS_TESTID = 'site-master-plan-status';
export const MASTER_PLAN_COPY_NOTE_TESTID = 'site-master-plan-copy-note';
/** Carries the roster's own `profileId`, so a control is found without parsing its label. */
export const MASTER_PLAN_PROFILE_ID_ATTR = 'data-master-plan-profile-id';
/** On a Remove button — the profile it drops. */
export const MASTER_PLAN_REMOVE_ATTR = 'data-master-plan-remove';

/**
 * The most storeys one press may ask for. ⛔ The same ceiling `parcelLawEnvelopeAuthoring` applies
 * to the single-building create, quoted rather than re-chosen — the PLANNER owns the real limit
 * (`storeys-above-batch-limit`, `MASTER_PLAN_MAX_ENVELOPES`) and refuses with both numbers.
 */
const ID_MINT_CEILING = 64;

// ═════════════════════════════════════════════════════════════════════════════════════════════
// DEPS
// ═════════════════════════════════════════════════════════════════════════════════════════════

export interface MasterPlanSectionDeps {
    /** The session roster, oldest first. Production: `getDrawnEnvelopeProfiles`. */
    readonly readProfiles: () => readonly DrawnEnvelopeProfile[];
    /** Roster change channel. Production: `subscribeDrawnEnvelopeFootprint`. */
    readonly subscribeProfiles: (fn: () => void) => () => void;
    /** Append a profile seeded with a ring. Production: `addDrawnEnvelopeProfile`. */
    readonly addProfile: (p: DrawnEnvelopeProfile) => void;
    readonly removeProfile: (profileId: string) => void;
    readonly clearProfiles: () => void;
    /** Arm the existing draw gesture. Production: `armEnvelopeDraw`. */
    readonly armDraw: () => EnvelopeDrawActivation;
    readonly readDrawStatus: () => EnvelopeDrawStatus;
    readonly subscribeDrawStatus: (fn: () => void) => () => void;
    /**
     * The project's storeys. ⛔ `null` when they could NOT be read — never `[]` for that case: an
     * empty array means "this project has no storeys", which is a different fact and gets a
     * different sentence from the planner.
     */
    readonly readLevels: () => readonly AdoptLevelCandidate[] | null;
    /** The ordinance figures as the ONE parcel-law model states them. Nulls when unpublished. */
    readonly readOrdinance: () => { readonly maxHeightM: number | null; readonly maxFloors: number | null };
    /** What is already on the storeys — the SHARED read, one per gesture (ADR-0383's `existing`). */
    readonly readExisting: () => LevelEnvelopeReadResult;
    /** P6 — the ONLY mutation path this section can reach. */
    readonly dispatch: (type: string, payload: unknown) => void;
    /** Whether the bus has a handler at all. `null` ⇒ PRYZM cannot tell, which is its own arm. */
    readonly readRegisteredCommandTypes?: () => readonly string[] | null;
    /** Envelope ids, minted by the CALLER (C16 CA-2). */
    readonly mintId: () => string;
    /** Group ids, minted by the CALLER for the same reason. ⛔ Not element ids. */
    readonly mintGroupId: () => string;
}

export interface MasterPlanSectionHandle {
    readonly element: HTMLElement;
    refresh(): void;
    dispose(): void;
}

/** Structural over `PryzmRuntime`: only `stores` and `bus` are read, through ONE cast seam. */
type RuntimeLike = {
    readonly stores?: unknown;
    readonly bus?: {
        executeCommand?: (type: string, payload: unknown) => unknown;
        registeredTypes?: readonly string[];
    };
};

let _groupMintCount = 0;

/**
 * Production deps — every one of them the read the neighbouring surfaces already make.
 *
 * ⛔ NEVER THE NULL PROP ALONE — §L-12916: a card that read the null runtime prop rendered a figure
 * that had never been created. The prop is the PREFERRED source and `window.runtime` the fallback,
 * resolved per CALL rather than captured (§L-545), so a runtime composed after boot is seen.
 */
export function defaultMasterPlanSectionDeps(runtimeProp?: RuntimeLike | null): MasterPlanSectionDeps {
    const w = (typeof window !== 'undefined' ? window : {}) as unknown as {
        runtime?: RuntimeLike;
        bimManager?: { getLevels?: () => unknown[] };
    };
    const live = (): RuntimeLike | null => runtimeProp ?? w.runtime ?? null;
    const store = (): SpaceEnvelopeReadHandle | null => {
        const s = live()?.stores;
        if (!s || typeof s !== 'object') return null;
        return ((s as Record<string, unknown>)['spaceEnvelope'] ?? null) as SpaceEnvelopeReadHandle | null;
    };
    return {
        readProfiles: getDrawnEnvelopeProfiles,
        subscribeProfiles: subscribeDrawnEnvelopeFootprint,
        addProfile: (p) => { addDrawnEnvelopeProfile(p.footprint); },
        removeProfile: removeDrawnEnvelopeProfile,
        clearProfiles: clearDrawnEnvelopeProfiles,
        armDraw: armEnvelopeDraw,
        readDrawStatus: getEnvelopeDrawStatus,
        subscribeDrawStatus: subscribeEnvelopeDrawStatus,
        readLevels: () => {
            try {
                const raw = w.bimManager?.getLevels?.();
                if (raw === undefined) return null;   // no bimManager ⇒ the storeys are NOT readable
                return readLevelCandidates(raw);
            } catch {
                return null;
            }
        },
        // ⚠ THE ORDINANCE IS READ FROM THE ONE PARCEL-LAW MODEL, and read HERE ONLY TO HAND IT TO
        // THE PLANNER. This section derives nothing from it — the advisory ("you asked for 12, the
        // ordinance derives 4") is the planner's, PER BLOCK, and is never summed across blocks.
        // ⛔ A read that throws yields NULLS, which the planner already treats as "not published";
        // inventing a ceiling here would be the §L-616 overstatement on someone's land.
        readOrdinance: () => {
            try {
                const model = resolveParcelLawModel(live() as unknown as PryzmRuntime | null);
                return {
                    maxHeightM: model.ordinance?.maxHeightM ?? null,
                    maxFloors: model.ordinance?.maxFloors ?? null,
                };
            } catch (e) {
                console.warn('[site][master-plan] ordinance read threw (non-fatal):', e);
                return { maxHeightM: null, maxFloors: null };
            }
        },
        readExisting: () => readLevelEnvelopes(store()),
        dispatch: (type, payload) => {
            const bus = live()?.bus;
            if (!bus || typeof bus.executeCommand !== 'function') throw new Error('no command bus');
            bus.executeCommand(type, payload);
        },
        readRegisteredCommandTypes: () => {
            const t = live()?.bus?.registeredTypes;
            return Array.isArray(t) ? t : null;
        },
        mintId: () => createId('spaceEnvelope'),
        // ⛔ NOT a `defineElement` branded id: a group is not an element (C114 §6d), and giving it
        // one would invite the second store that ADR-0383 D1 declined.
        mintGroupId: () => `mg_${Date.now().toString(36)}_${(++_groupMintCount).toString(36)}`,
    };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE ONE PROSE PRODUCER
// ═════════════════════════════════════════════════════════════════════════════════════════════

const el = (tag: string, css: string, text?: string): HTMLElement => {
    const n = document.createElement(tag);
    n.style.cssText = css;
    if (text !== undefined) n.textContent = text;   // C08 §3.1 — no HTML sink in this file
    return n;
};

const fmtArea = (m2: number): string =>
    Number.isFinite(m2) ? `${Math.round(m2).toLocaleString('en-GB')} m²` : 'area not readable';

/**
 * The roster line, and the ONLY place this section's headline is composed.
 *
 * ⛔ It states what PRYZM HOLDS, never what the parcel permits — the second is the planner's and
 * the ordinance's, and merging the two is how a roster comes to wear a confident face.
 *
 * Pure; total; never throws.
 */
export function describeMasterPlanRoster(profiles: readonly DrawnEnvelopeProfile[]): string {
    if (profiles.length === 0) {
        return 'No profiles drawn this session. Draw a perimeter on a site view to start a master '
            + 'plan — each profile becomes ONE building.';
    }
    if (profiles.length === 1) {
        return '1 profile drawn this session. Add another to master-plan several buildings in one '
            + 'command; create it now and you get one building.';
    }
    return `${profiles.length} profiles drawn this session — ${profiles.length} buildings in one `
        + 'command, one undo.';
}

/**
 * Which profiles are still an UNDRAWN COPY of the profile they were seeded from.
 *
 * ⭐ REFERENCE EQUALITY, NOT GEOMETRY. `addDrawnEnvelopeProfile` stores the very same frozen
 * footprint object, and the next draw REPLACES it with a new one — so `===` answers *"has this
 * profile been drawn yet"* exactly, with no tolerance to choose and no second area routine. Two
 * rings the user genuinely drew on the same spot are NOT flagged here; the plan's measured overlap
 * advisory is what speaks to those, with both numbers.
 */
export function undrawnCopies(
    profiles: readonly DrawnEnvelopeProfile[],
): ReadonlyMap<string, string> {
    const seen = new Map<unknown, string>();
    const out = new Map<string, string>();
    for (const p of profiles) {
        const first = seen.get(p.footprint);
        if (first === undefined) seen.set(p.footprint, p.label);
        else out.set(p.profileId, first);
    }
    return out;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE PLAN — one producer for "what the next click will do" AND for what it did
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Compose the planner's input from the roster and the typed storey count.
 *
 * ⭐ ONE COMPOSER FOR THE PREVIEW AND THE CLICK. The preview passes placeholder ids (never
 * dispatched); the click passes ids minted from `deps.mintId` / `deps.mintGroupId`. Everything
 * else is identical BY CONSTRUCTION, which is what stops the sentence above the button from
 * describing a gesture other than the one the button sends (§ENVELOPE-DRAW R8's rule, applied to
 * N blocks).
 */
export function composeMasterPlanInput(args: {
    readonly profiles: readonly DrawnEnvelopeProfile[];
    readonly requestedStoreys: unknown;
    readonly levels: readonly AdoptLevelCandidate[];
    readonly ordinance: { readonly maxHeightM: number | null; readonly maxFloors: number | null };
    readonly existing: LevelEnvelopeReadResult;
    readonly mintId: () => string;
    readonly mintGroupId: () => string;
}): Parameters<typeof buildMasterPlanAuthoringPlan>[0] {
    const wanted = Number(args.requestedStoreys);
    const idCount = Number.isFinite(wanted) && wanted > 0 && wanted <= ID_MINT_CEILING
        ? Math.floor(wanted)
        : 1;
    const profiles: MasterPlanProfileInput[] = args.profiles.map((p) => {
        const mintedIds: string[] = [];
        for (let i = 0; i < idCount; i++) mintedIds.push(args.mintId());
        return {
            profileId: p.profileId,
            // ⛔ THE GROUP LABEL IS THE PROFILE'S LABEL. The user named this block in the roster;
            // inventing a second name for the same thing at dispatch time is how a roster and a
            // scene come to disagree about which building is which.
            group: { id: args.mintGroupId(), label: p.label },
            ring: p.footprint.ring,
            // ⛔ The area the GESTURE computed, carried — never recomputed (C84 EI-9).
            ringAreaM2: p.footprint.areaM2,
            ringSourceLabel: `the perimeter you drew for ${p.label}`,
            requestedStoreys: args.requestedStoreys,
            mintedIds,
        };
    });
    return {
        profiles,
        ordinance: args.ordinance,
        levels: args.levels,
        existing: args.existing,
    };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// MOUNT
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Mount the master-planning section. Renders immediately; re-renders on the roster channel and on
 * the draw-status channel, so pressing Draw on this panel and finishing the gesture on a site view
 * lights this section without anybody polling.
 */
export function mountMasterPlanSection(
    host: HTMLElement,
    deps: MasterPlanSectionDeps,
): MasterPlanSectionHandle {
    const span = _tracer.startSpan('pryzm.site.mountMasterPlanSection');
    try {
        const root = el('div',
            'margin-top:9px;border-top:1px solid #efecf7;padding-top:7px;min-width:0;max-width:100%;');
        root.setAttribute('data-testid', MASTER_PLAN_ROOT_TESTID);
        host.appendChild(root);

        let disposed = false;
        /**
         * The number the user typed. ⭐ HELD ACROSS REPAINTS — the roster and the draw channel both
         * fire while the user is typing, and a repaint that discarded it would erase a half-typed
         * storey count every time a gesture settled.
         */
        let typedStoreys = '';
        /** The last gesture's outcome, so a dispatch failure is REPORTED rather than swallowed. */
        let statusNote: string | null = null;
        let statusKind: 'ok' | 'refused' | null = null;

        // ── the fixed chrome, built ONCE (C08 §3.1 — createElement + textContent only) ────────
        const heading = el('div', `font-weight:700;font-size:11px;color:${VIOLET};`, 'Master planning');
        const verdict = el('div', `margin-top:2px;font:600 10.5px/1.4 system-ui,sans-serif;color:${VIOLET};min-width:0;`);
        verdict.setAttribute('data-testid', MASTER_PLAN_VERDICT_TESTID);
        const roster = el('div', 'margin-top:5px;');
        roster.setAttribute('data-testid', MASTER_PLAN_ROSTER_TESTID);
        const controls = el('div', 'display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;align-items:center;');
        const entry = el('div', 'display:flex;gap:6px;margin-top:7px;align-items:flex-end;');
        const preview = el('div', 'margin-top:6px;');
        preview.setAttribute('data-testid', MASTER_PLAN_PREVIEW_TESTID);
        const statusLine = el('div', 'margin-top:5px;font-size:9.5px;line-height:1.5;min-height:11px;');
        statusLine.setAttribute('data-testid', MASTER_PLAN_STATUS_TESTID);
        statusLine.setAttribute('data-state', 'idle');

        const btn = (label: string, testid: string, primary: boolean): HTMLButtonElement => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.setAttribute('data-testid', testid);
            b.style.cssText =
                'appearance:none;cursor:pointer;padding:4px 8px;border-radius:7px;font-weight:600;'
                + 'font-size:9.5px;font-family:system-ui,sans-serif;'
                + (primary
                    ? `border:1px solid ${VIOLET};background:${VIOLET};color:#ffffff;`
                    : `border:1px solid #d8d3e6;background:#faf9fd;color:${VIOLET};`);
            return b;
        };

        const drawBtn = btn('Draw a profile', MASTER_PLAN_DRAW_BTN_TESTID, false);
        const addBtn = btn('Add another profile', MASTER_PLAN_ADD_BTN_TESTID, false);
        const clearBtn = btn('Clear all profiles', MASTER_PLAN_CLEAR_BTN_TESTID, false);
        controls.append(drawBtn, addBtn, clearBtn);

        const storeysLabel = el('label', `display:block;font-size:9px;color:${INK_SOFT};`,
            'Floor levels — every block in this plan');
        const storeysInput = document.createElement('input');
        storeysInput.type = 'number';
        storeysInput.min = '1';
        storeysInput.step = '1';
        storeysInput.setAttribute('data-testid', MASTER_PLAN_STOREYS_INPUT_TESTID);
        storeysInput.style.cssText =
            'width:100%;box-sizing:border-box;padding:4px 6px;border-radius:6px;border:1px solid #d8d3e6;'
            + 'font-weight:600;font-size:10.5px;font-family:system-ui,sans-serif;';
        storeysInput.addEventListener('input', () => { typedStoreys = storeysInput.value; render(); });
        const storeysCol = el('div', 'flex:1;min-width:0;');
        storeysCol.append(storeysLabel, storeysInput);
        const createBtn = btn('Create all blocks', MASTER_PLAN_CREATE_BTN_TESTID, true);
        createBtn.style.cssText += 'flex:none;padding:6px 10px;font-size:10.5px;';
        entry.append(storeysCol, createBtn);

        root.append(heading, verdict, roster, controls, entry, preview, statusLine);

        // ── reads ────────────────────────────────────────────────────────────────────────────

        /** Every read this section makes, in ONE beat — see `runCreate` for why that matters. */
        const readAll = (): {
            profiles: readonly DrawnEnvelopeProfile[];
            levels: readonly AdoptLevelCandidate[] | null;
            ordinance: { maxHeightM: number | null; maxFloors: number | null };
            existing: LevelEnvelopeReadResult;
        } => {
            let profiles: readonly DrawnEnvelopeProfile[] = [];
            try { profiles = deps.readProfiles(); } catch { profiles = []; }
            let levels: readonly AdoptLevelCandidate[] | null = null;
            try { levels = deps.readLevels(); } catch { levels = null; }
            let ordinance = { maxHeightM: null as number | null, maxFloors: null as number | null };
            try { ordinance = { ...deps.readOrdinance() }; } catch { /* nulls stand */ }
            let existing: LevelEnvelopeReadResult;
            try {
                existing = deps.readExisting();
            } catch {
                existing = {
                    readable: false, reason: 'store-threw',
                    text: 'Reading the space-envelope store failed, so PRYZM cannot see what is already '
                        + 'on the storeys. Nothing was created. This is a failure to read — NOT a finding '
                        + 'that the storeys are empty.',
                };
            }
            return { profiles, levels, ordinance, existing };
        };

        /**
         * The plan the NEXT click would dispatch, with PLACEHOLDER ids that are never sent.
         *
         * ⛔ `null` ONLY when there is nothing to plan — an empty roster or an unread storey list.
         * A REFUSAL is a value, and it is rendered; swallowing it would put the user in front of a
         * button whose reason for not working is invisible.
         */
        const previewPlan = (r: ReturnType<typeof readAll>): MasterPlanAuthoringResult | null => {
            if (r.profiles.length === 0) return null;
            if (r.levels === null) return null;
            let seq = 0;
            let gseq = 0;
            return buildMasterPlanAuthoringPlan(composeMasterPlanInput({
                profiles: r.profiles,
                requestedStoreys: typedStoreys,
                levels: r.levels,
                ordinance: r.ordinance,
                existing: r.existing,
                mintId: () => `preview-${++seq}`,
                mintGroupId: () => `preview-group-${++gseq}`,
            }));
        };

        // ── render ───────────────────────────────────────────────────────────────────────────

        const renderRoster = (profiles: readonly DrawnEnvelopeProfile[]): void => {
            roster.replaceChildren();
            if (profiles.length === 0) {
                const empty = el('div', `font-size:9.5px;line-height:1.45;color:${INK_SOFT};`,
                    'Nothing is drawn yet. Press Draw a profile, then click the corners of the first '
                    + 'building\'s perimeter on the 2D Site Map or the 3D Site. Profiles live for this '
                    + 'session only — the BUILDINGS you create from them are what persist.');
                empty.setAttribute('data-testid', MASTER_PLAN_EMPTY_TESTID);
                roster.appendChild(empty);
                return;
            }
            const copies = undrawnCopies(profiles);
            for (const p of profiles) {
                const row = el('div',
                    'display:flex;gap:6px;align-items:baseline;padding:3px 0;border-bottom:1px solid #f4f2fa;');
                row.setAttribute('data-testid', MASTER_PLAN_PROFILE_ROW_TESTID);
                row.setAttribute(MASTER_PLAN_PROFILE_ID_ATTR, p.profileId);
                const name = el('div', 'font-weight:600;font-size:10px;color:#2b2440;flex:1;min-width:0;', p.label);
                const area = el('div', `font-size:9.5px;color:${INK_SOFT};flex:none;`, fmtArea(p.footprint.areaM2));
                const drop = document.createElement('button');
                drop.type = 'button';
                drop.textContent = 'Remove';
                drop.setAttribute(MASTER_PLAN_REMOVE_ATTR, p.profileId);
                drop.title = `Drops ${p.label} from this session's roster. Nothing that already exists `
                    + 'in the project is removed — this profile has never been created.';
                drop.style.cssText =
                    'appearance:none;border:1px solid #e4e0ef;background:#ffffff;cursor:pointer;'
                    + `padding:1px 6px;border-radius:5px;font-size:9px;color:${INK_SOFT};flex:none;`;
                drop.onclick = (ev): void => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    try { deps.removeProfile(p.profileId); } catch { /* the roster is unchanged */ }
                    render();
                };
                row.append(name, area, drop);
                roster.appendChild(row);
                const copiedFrom = copies.get(p.profileId);
                if (copiedFrom !== undefined) {
                    // ⭐ STATED ON THE ROW THAT CARRIES IT — the roster module's header requires the
                    // control that seeds a copy to say so on its own face. Two blocks on one
                    // perimeter is a real state the user can create; it must not be a silent one.
                    const note = el('div',
                        `font-size:9px;line-height:1.4;color:${ADVISORY_INK};padding:0 0 3px 0;`,
                        `${p.label} still has ${copiedFrom}'s perimeter — press Draw a profile and `
                        + 'draw to give it its own. Created as it stands, it would sit exactly on top '
                        + `of ${copiedFrom}.`);
                    note.setAttribute('data-testid', MASTER_PLAN_COPY_NOTE_TESTID);
                    note.setAttribute(MASTER_PLAN_PROFILE_ID_ATTR, p.profileId);
                    roster.appendChild(note);
                }
            }
        };

        const renderPreview = (r: ReturnType<typeof readAll>, plan: MasterPlanAuthoringResult | null): void => {
            preview.replaceChildren();
            if (r.levels === null) {
                const gap = el('div', `font-size:9.5px;line-height:1.45;color:${ADVISORY_INK};`,
                    'PRYZM cannot read this project\'s storeys from here, so it cannot say what these '
                    + 'profiles would become. Nothing was created. This is a failure to read — NOT a '
                    + 'finding that the project has no storeys.');
                gap.setAttribute('data-testid', MASTER_PLAN_REFUSAL_TESTID);
                preview.appendChild(gap);
                return;
            }
            if (plan === null) return;
            if (!plan.ok) {
                // ⛔ THE REFUSAL IS THE PLANNER'S OWN SENTENCE, VERBATIM. One refusal, one wording —
                // re-phrasing it here would give the user two versions of one answer.
                const box = el('div',
                    `padding:5px 6px;border:1px solid #e8c9c9;border-radius:8px;background:#fdf6f6;`
                    + `font-size:9.5px;line-height:1.45;color:${REFUSAL_INK};`,
                    plan.statement);
                box.setAttribute('data-testid', MASTER_PLAN_REFUSAL_TESTID);
                box.setAttribute('data-reason', plan.reason);
                preview.appendChild(box);
                return;
            }

            const lede = el('div', `font-size:9.5px;line-height:1.5;color:#4b4460;`, plan.statement);
            preview.appendChild(lede);

            for (const b of plan.built) {
                const row = el('div',
                    `margin-top:3px;font-size:9.5px;line-height:1.45;color:#2b2440;`,
                    `${b.group.label} — ${b.storeys.length} storey${b.storeys.length === 1 ? '' : 's'} · `
                    + `${fmtArea(b.footprintAreaM2)} footprint · ${fmtArea(b.totalIntendedM2)} intended.`);
                row.setAttribute('data-testid', MASTER_PLAN_BUILT_ROW_TESTID);
                preview.appendChild(row);
                if (b.advisory !== null) {
                    // ⛔ THIS BLOCK'S OWN ADVISORY, never summed across blocks — "you asked for 12,
                    // the ordinance derives 4" is a statement about ONE building.
                    const adv = el('div',
                        `margin:2px 0 0 0;padding:4px 6px;border:1px solid ${ADVISORY_EDGE};border-radius:7px;`
                        + `background:${ADVISORY_BG};font-size:9px;line-height:1.4;color:${ADVISORY_INK};`,
                        b.advisory.statement);
                    adv.setAttribute('data-testid', MASTER_PLAN_ADVISORY_TESTID);
                    preview.appendChild(adv);
                }
            }

            // ⭐ D5 — A SKIPPED PROFILE IS NAMED, never silently dropped.
            for (const s of plan.skipped) {
                const row = el('div',
                    `margin-top:3px;padding:4px 6px;border:1px dashed #e8c9c9;border-radius:7px;`
                    + `font-size:9px;line-height:1.4;color:${REFUSAL_INK};`,
                    `${s.groupLabel} will NOT be built — ${s.statement}`);
                row.setAttribute('data-testid', MASTER_PLAN_SKIPPED_ROW_TESTID);
                row.setAttribute(MASTER_PLAN_PROFILE_ID_ATTR, s.profileId);
                preview.appendChild(row);
            }

            // ⛔ THE OVERLAP IS AN ADVISORY AND IS RENDERED AS ONE — see this file's header. It
            // never disables the button and it never reads as a refusal.
            for (const o of plan.overlaps.overlaps) {
                const box = el('div',
                    `margin-top:4px;padding:5px 6px;border:1px solid ${ADVISORY_EDGE};border-radius:8px;`
                    + `background:${ADVISORY_BG};font-size:9.5px;line-height:1.45;color:${ADVISORY_INK};`,
                    o.sentence);
                box.setAttribute('data-testid', MASTER_PLAN_ADVISORY_TESTID);
                preview.appendChild(box);
            }
            // ⛔ AN UNMEASURABLE PAIR GETS ITS OWN SENTENCE — "PRYZM did not look" and "PRYZM looked
            // and they are clear" must never reach the surface as the same silence.
            for (const g of plan.overlaps.unmeasurable) {
                const box = el('div',
                    `margin-top:4px;padding:5px 6px;border:1px dashed ${ADVISORY_EDGE};border-radius:8px;`
                    + `background:${ADVISORY_BG};font-size:9px;line-height:1.4;color:${ADVISORY_INK};`,
                    g.text);
                box.setAttribute('data-testid', MASTER_PLAN_UNMEASURABLE_TESTID);
                preview.appendChild(box);
            }
            if (plan.overlapLimit !== null) {
                const box = el('div',
                    `margin-top:4px;font-size:9px;line-height:1.4;color:${INK_SOFT};`,
                    plan.overlapLimit);
                box.setAttribute('data-testid', MASTER_PLAN_OVERLAP_LIMIT_TESTID);
                preview.appendChild(box);
            }
        };

        const render = (): void => {
            if (disposed) return;
            const r = readAll();

            verdict.textContent = describeMasterPlanRoster(r.profiles);
            renderRoster(r.profiles);

            const drawStatus = (() => {
                try { return deps.readDrawStatus(); } catch { return null; }
            })();
            drawBtn.textContent = drawStatus?.armed === true ? 'Drawing — click the corners' : 'Draw a profile';
            drawBtn.setAttribute('aria-pressed', String(drawStatus?.armed === true));

            addBtn.disabled = r.profiles.length === 0 || r.profiles.length >= DRAWN_ENVELOPE_MAX_PROFILES;
            addBtn.title = r.profiles.length === 0
                ? 'Draw the first profile before adding a second.'
                : r.profiles.length >= DRAWN_ENVELOPE_MAX_PROFILES
                    ? `This session already holds ${DRAWN_ENVELOPE_MAX_PROFILES} profiles, which is the `
                        + 'guard against a runaway caller — remove one you no longer want and add again.'
                    : 'Adds a profile that STARTS as a copy of the most recent perimeter, and arms the '
                        + 'draw so your next perimeter replaces it.';
            addBtn.style.opacity = addBtn.disabled ? '0.45' : '1';
            clearBtn.disabled = r.profiles.length === 0;
            clearBtn.style.opacity = clearBtn.disabled ? '0.45' : '1';

            const plan = previewPlan(r);
            renderPreview(r, plan);

            // ⭐ THE BUTTON IS DISABLED ONLY FOR THINGS THAT MAKE IT MEANINGLESS — an empty roster,
            // an unread storey list, a plan the planner refused, or a bus with no handler. ⛔ NEVER
            // for an overlap: that is an advisory (see the header), and [[refusing-half-needs-its-
            // escape-hatch]] is what a gate with no yes-branch becomes.
            let blocked: string | null = null;
            if (r.profiles.length === 0) blocked = 'Draw at least one profile first.';
            else if (r.levels === null) blocked = 'PRYZM cannot read this project\'s storeys from here.';
            else if (plan !== null && !plan.ok) blocked = 'See the reason above.';
            else {
                const types = deps.readRegisteredCommandTypes?.() ?? null;
                if (types !== null && !types.includes('spaceEnvelope.batch.create')) {
                    blocked = 'This runtime has no `spaceEnvelope.batch.create` handler registered, so '
                        + 'PRYZM cannot create the blocks. That is a gap in the wiring, not a refusal '
                        + 'about your design.';
                }
            }
            createBtn.disabled = blocked !== null;
            createBtn.style.opacity = blocked === null ? '1' : '0.45';
            createBtn.title = blocked ?? 'Creates every block above in ONE command — one Ctrl+Z undoes '
                + 'the whole master plan.';
            createBtn.textContent = plan !== null && plan.ok && plan.built.length > 0
                ? `Create ${plan.built.length} block${plan.built.length === 1 ? '' : 's'}`
                : 'Create all blocks';

            if (statusNote !== null) {
                statusLine.textContent = statusNote;
                statusLine.setAttribute('data-state', statusKind ?? 'idle');
                statusLine.style.color = statusKind === 'refused' ? REFUSAL_INK : VIOLET;
            } else {
                statusLine.textContent = '';
                statusLine.setAttribute('data-state', 'idle');
            }

            span.setAttribute('pryzm.masterPlan.profiles', r.profiles.length);
        };

        // ── gestures ─────────────────────────────────────────────────────────────────────────

        const setStatus = (text: string, kind: 'ok' | 'refused'): void => {
            statusNote = text;
            statusKind = kind;
        };

        drawBtn.onclick = (ev): void => {
            ev.preventDefault();
            ev.stopPropagation();
            statusNote = null;
            statusKind = null;
            let act: EnvelopeDrawActivation;
            try {
                act = deps.armDraw();
            } catch (e) {
                setStatus(`PRYZM could not start the draw: ${String((e as Error)?.message ?? e)}.`, 'refused');
                render();
                return;
            }
            // ⛔ THE REFUSAL IS THE ARMING MODULE'S OWN SENTENCE — it names the route back (C16
            // CA-18), and a re-worded copy here would be a second answer to one question.
            if (!act.ok) setStatus(act.reason ?? 'No site view accepted the draw.', 'refused');
            render();
        };

        addBtn.onclick = (ev): void => {
            ev.preventDefault();
            ev.stopPropagation();
            statusNote = null;
            statusKind = null;
            const profiles = deps.readProfiles();
            const last = profiles[profiles.length - 1];
            if (last === undefined) {
                setStatus('Draw the first profile before adding a second.', 'refused');
                render();
                return;
            }
            const before = profiles.length;
            try { deps.addProfile(last); } catch { /* the roster refuses loudly in its own log */ }
            const after = deps.readProfiles().length;
            if (after === before) {
                setStatus(
                    'That profile was not added — the session roster is full, or the perimeter it was '
                    + 'seeded from is degenerate. The roster is unchanged.', 'refused');
                render();
                return;
            }
            // ⭐ ARMED IMMEDIATELY, because the copy is not the point — drawing over it is. The next
            // finished perimeter REPLACES this new last profile, which is the roster's one unchanged
            // rule rather than a special case (`drawnEnvelopeFootprintState`'s header).
            let act: EnvelopeDrawActivation | null = null;
            try { act = deps.armDraw(); } catch { act = null; }
            if (act !== null && !act.ok) setStatus(act.reason ?? 'No site view accepted the draw.', 'refused');
            else setStatus('Added — now draw this block\'s own perimeter on a site view.', 'ok');
            render();
        };

        clearBtn.onclick = (ev): void => {
            ev.preventDefault();
            ev.stopPropagation();
            statusNote = null;
            statusKind = null;
            // ⛔ CLEARS THE EXPLORATION, NOT THE PROJECT. Blocks already created are elements, and
            // elements are removed by undo or by the store — never by a panel dropping a reference.
            try { deps.clearProfiles(); } catch { /* non-fatal */ }
            render();
        };

        /**
         * ⭐ THE CREATE — N profiles, ONE `spaceEnvelope.batch.create`, ONE Ctrl+Z.
         *
         * ⛔ EVERY READ HAPPENS IN THIS BEAT, never from the last render: a store event between the
         * paint and the click is exactly the state a stale read would create blind on
         * (§ENVELOPE-DRAW R8). ⛔ Ids are minted HERE (C16 CA-2) — `execute()` runs again on REDO,
         * and an id minted inside the handler would differ the second time and orphan the group.
         */
        const runCreate = (): void => {
            statusNote = null;
            statusKind = null;
            try {
                const r = readAll();
                if (r.profiles.length === 0) {
                    setStatus('There are no profiles to build.', 'refused');
                    render();
                    return;
                }
                if (r.levels === null) {
                    setStatus(
                        'PRYZM cannot read this project\'s storeys from here, so nothing was created. '
                        + 'This is a failure to read — NOT a finding that the project has no storeys.',
                        'refused');
                    render();
                    return;
                }
                const plan = buildMasterPlanAuthoringPlan(composeMasterPlanInput({
                    profiles: r.profiles,
                    requestedStoreys: typedStoreys,
                    levels: r.levels,
                    ordinance: r.ordinance,
                    existing: r.existing,
                    mintId: deps.mintId,
                    mintGroupId: deps.mintGroupId,
                }));
                if (!plan.ok) {
                    setStatus(plan.statement, 'refused');
                    render();
                    return;
                }
                // ⛔ P6 — the ONLY mutation path, and ONE batch verb so one gesture is one Ctrl+Z.
                deps.dispatch(plan.command, plan.payload);
                const n = plan.built.length;
                const skipped = plan.skipped.length;
                setStatus(
                    `Created ${n} block${n === 1 ? '' : 's'} (${plan.payload.envelopes.length} level `
                    + `envelope${plan.payload.envelopes.length === 1 ? '' : 's'}) in one command — Ctrl+Z `
                    + `undoes the whole master plan.`
                    + (skipped > 0
                        ? ` ${skipped} profile${skipped === 1 ? ' was' : 's were'} skipped and named above; `
                            + `${skipped === 1 ? 'it is' : 'they are'} still on the roster.`
                        : ''),
                    'ok');
            } catch (e) {
                setStatus(
                    `PRYZM could not create the blocks: ${String((e as Error)?.message ?? e)}. Nothing was `
                    + 'created and nothing changed.', 'refused');
            }
            render();
        };

        createBtn.onclick = (ev): void => {
            ev.preventDefault();
            ev.stopPropagation();
            runCreate();
        };

        // ── channels ─────────────────────────────────────────────────────────────────────────

        let offProfiles: (() => void) | null = null;
        let offDraw: (() => void) | null = null;
        try { offProfiles = deps.subscribeProfiles(() => { if (!disposed) render(); }); } catch { offProfiles = null; }
        try { offDraw = deps.subscribeDrawStatus(() => { if (!disposed) render(); }); } catch { offDraw = null; }

        render();

        return {
            element: root,
            refresh: render,
            dispose: (): void => {
                disposed = true;
                try { offProfiles?.(); } catch { /* mid-teardown */ }
                try { offDraw?.(); } catch { /* ditto */ }
                offProfiles = null;
                offDraw = null;
                root.remove();
            },
        };
    } finally {
        span.end();
    }
}
