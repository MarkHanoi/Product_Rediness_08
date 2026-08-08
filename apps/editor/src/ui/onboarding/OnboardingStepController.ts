// O.2 / O.7.1 — Onboarding STEP CONTROLLER (RAC → location → draw-or-skip →
// CONFIRM → generate).
//
// WHY THIS EXISTS
// ---------------
// O.1 (PlatformRouter) ships auth-first ordering + the post-auth brief-ready
// handoff. A.5.g.4 (`briefBootstrap`) then auto-drove create-project →
// `createSiteFromRect` (a DEFAULT 10×8 m rectangle) → generate — the user never
// got to set their REAL plot. O.2 inserts a small guided flow BETWEEN the brief
// and generation, per ONBOARDING-WORKFLOW-DESIGN-2026-06-03.md §3.3 + §6 O.2:
//
//   1. Location  — "Where's your project?" address → geocode → site.updateLocation
//   2. Site      — "How do you want to set your plot?"  →  TWO choices:
//                    ⚡ Use a default footprint   (skip — today's safe default)
//                    ✏️ Draw it on the map        (activate GIS + boundary draw)
//   3. Confirm   — (O.7.1) "Generate your {typology} with AI?" — KEEP the boundary
//                  visible + ASK before generating (NOT a silent auto-generate).
//                    • Generate {typology} → generateAndFinish (generate → 3D → done)
//                    • Not now             → dispose, leave boundary/site intact
//   4. Generate  — generateApartmentFromBoundary → land in the canvas (3D view).
//
// The founder ratified: **GIS/boundary is SKIPPABLE — the user's choice** (§7.2).
// O.7.1 SUPERSEDES the old "auto-generate on land" (§7.5): every path that used to
// silently generate (drawn-boundary commit, default-plot skip,
// "skip drawing") now routes through the CONFIRM step so the user chooses. The
// default-rectangle path is kept as the no-GIS fallback; "Draw it on the map" is
// the inviting default. Only a HARD ERROR (start threw) still auto-generates.
//
// WHAT THIS REUSES (vs writes)
// ----------------------------
// - REUSES `createSiteFromRect` (A.7.c.x) for BOTH the location dispatch (it calls
//   the pure `siteUpdateLocation` handler with lat/lon/address) AND the default-
//   rectangle parcel. The location step does NOT introduce a second site-dispatch
//   path — it threads lat/lon/address straight into `createSiteFromRect`.
// - REUSES `geocodeAddress` (A.8.a) for the address → lat/lon lookup.
// - REUSES `generateApartmentFromBoundary` (A.5.g.3) for the final generate.
// - REUSES the GIS activation + boundary-draw seam: `window.pryzmToggleGIS`
//   (registered in GISAreaLayout, A.8.c idiom) to mount/activate Cesium, then
//   `window.pryzmStartBoundaryDraw` to start the polygon draw. It then WAITS for
//   the `site.parcel-boundary-set` runtime event the draw tool fires on commit.
// - REUSES the `ONBOARDING_STYLES` overlay idiom (#6600FF) — this module only adds
//   a thin step-overlay built from the same CSS family (`os-*` classes live in
//   onboardingStyles.ts).
// - WRITES only the step state machine + the minimal overlay DOM here.
//
// GUARANTEES
// ----------
// - CSP-safe: vanilla DOM + `addEventListener` only (no inline handlers/styles).
// - NEVER throws into the caller: every step is try/guarded + logs
//   `[onboarding-step]`; on any failure it falls back to the default rectangle +
//   generates so the user always lands on a result.
// - §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR (ADR-0299): the draw-wait's idle timer OFFERS, it
//   never AUTHORS. It used to commit a default 10 × 8 m rectangle as the user's parcel after
//   60 s of "no interaction" and advance to the confirm step — inventing the one input the
//   whole C19 → C58 → generator chain derives from, on evidence (idleness) that cannot tell
//   "stuck" from "reading in another window" from "tab in the background". It now shows a
//   dismissible hint pointing at the "Skip drawing — use a default plot" button the user
//   already has, and only once the surface has been visible, ready and untouched.
//   ⚠ CONSEQUENCE, STATED NOT HIDDEN: if GIS never wires up, the draw step no longer
//   auto-resolves itself. The user is NOT stranded — "← Back" and "Skip drawing" are both in
//   the banner throughout — but the flow will sit there rather than invent a plot. That is
//   the intended trade (ADR-0299 §Consequences): a visible stall beats a silent fabrication.
//
// TYPOLOGY-AGNOSTIC
// -----------------
// Steps 1-2 are site-layer only (location + parcel). Only the final generate call
// (step 3) is apartment-specific — see the §FUTURE-TYPOLOGY marker at that call.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { createSiteFromRect } from '../site/createSiteFromRect.js';
import { resolveSiteContext, ensureSite, dispatchSiteLocation, dispatchClearParcelBoundary, resolveBuildableFootprint, getLastBuildableEnvelope } from '../site/siteDispatch.js';
// §L-401 slice 2 — the pure storey height-cap decision (C58 envelope → legal storey count).
import { capStoreysToEnvelope } from '@pryzm/site-parcel-data';
import { geocodeAddress } from '../site/geocodeAddress.js';
// PRYZM-EARTH-ONBOARDING PRD Milestone 2 (§9/§10) — the `location` step's globe presentation
// layer: a full-screen Cesium globe (the EXISTING singleton, re-shown solo) behind the search
// card, driven by the EXISTING `siteEntryModel`/`SiteEntryStore` reducer instead of a bare
// geocode-then-set-field call. See GlobeHeroSearch.ts's header for the full reuse rationale.
import { GlobeHeroSearch } from './GlobeHeroSearch.js';
// PRD §22 — the zoom-then-split reveal SEQUENCE (frame-seed → anchor → arm → mount → fade),
// extracted DOM-free so the ordering the §21 revert note mandates is unit-assertable.
import { runSiteRevealSequence, type SiteRevealTarget } from './siteRevealSequence.js';
// §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR (ADR-0299) — the PURE draw-idle decision. It can return
// `wait` or `offer` and nothing else: a watchdog may offer, it may never author domain data.
import { decideDrawIdleAction, DRAW_IDLE_OFFER_MS as DRAW_IDLE_OFFER_MS_DEFAULT } from './drawIdleWatchdog.js';
import { siteEntryCoverageEntries } from '../../engine/views/siteEntryCoverage';
import { fetchContextBuildingsNearAndFar } from '../geospatial/contextBuildings.js';
// §STARTUP-BUDGET (founder 2026-08-07, 5× startup) — passive phase marks; behaviour-free.
import { markStartupPhase } from '../../engine/startupBudget';
import { generateApartmentFromBoundary } from '../apartment-layout/apartmentFromBoundary.js';
// §TYPOLOGY-CHOICE-AT-CONFIRM — the chooser's pure model (options + route + zoning
// advisory) and the EXISTING active-brief stash the chosen typology is written through.
import {
    buildTypologyChoices,
    confirmCopyFor,
    nextChoiceIndex,
    resolveGenerateRoute,
    zoningAdvisoryFor,
    type TypologyChoice,
} from './typologyChoiceModel.js';
import { setActiveBrief } from '../apartment-layout/activeBrief.js';
import { generateHouseFromBoundary, type FootprintPoint } from '../house-layout/houseFromBoundary.js';
import { generateResidentialFromBoundary } from '../residential-building/residentialFromBoundary.js';
// §OFFICE-ONBOARDING-WIRE — the office tower is a FIRST-CLASS typology from the picker.
// We derive its circular footprint (centroid + fit radius) from the drawn parcel, then
// drive the SAME office controller the console path uses (opens the setup modal / plate).
import { deriveOfficeCircleFromParcel, isOfficeTypologyId, resolveOfficeStoreyCount } from '../office-building/deriveOfficeCircle.js';
import { getOfficeBuildingController } from '../office-building/officeBuildingTrigger.js';
// §OFFICE-PREVIEW-STEP — the office SETUP/PREVIEW step (mirrors resi's program step):
// a live circular-plate preview + analytics + adjustable params + a Build button. The
// orchestrator runs PURE here for the live preview; the controller owns the real build.
import { orchestrateOfficeBuilding, maxFeasibleStoriesForRadius } from '@pryzm/ai-host';
import type { OfficeBuildingOk, WorkplaceCulture } from '@pryzm/ai-host';
import { buildOfficePlatePreviewSvg, buildOfficeAnalyticsHtml } from '../office-building/officePlatePreview.js';
import { buildResidentialCardModel, type ResidentialCardModel } from '../residential-building/residentialCardModel.js';
import { buildResidentialPlanSvg } from '../residential-building/residentialPlanThumbnail.js';
// §RESI-CIRC-GRAPH — the per-floor circulation bubble graph (house-modal parity), shown BELOW the plan.
import { buildResidentialCirculationGraphSvg } from '../residential-building/residentialCirculationGraph.js';
// §BUILDING-PREVIEW-MODULAR — the shared, building-type-agnostic façade palette (single source).
import { FACADE_PALETTE, DEFAULT_FACADE_HEX } from '../preview-kit/buildingPlanDescriptor.js';
import { orchestrateResidentialBuilding } from '@pryzm/ai-host';
import type { ResidentialBuildingOk } from '@pryzm/ai-host';
// §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 B) — the ONE terminal "Finish → land in
// the 3D + plan split canvas" transition, shared with the map host (which owns it when the
// wizard is not mounted — the GIS launcher / re-entry paths).
import { enterCanvasWithSitePlanUnderlay } from '../site/overlay/enterCanvasWithSitePlan.js';
import { makeDraggable } from '../makeDraggable.js';
import { makeResizable } from '../makeResizable.js';

/** Default parcel rectangle (metres) — the no-GIS fallback (founder §7.2). Matches
 *  `createSiteFromRect` + `briefBootstrap`'s single-apartment-scale default. */
const DEFAULT_PARCEL_WIDTH_M = 10;
const DEFAULT_PARCEL_DEPTH_M = 8;

/** §OFFICE-ONBOARDING-WIRE — fallback circular-plate radius (m) when the drawn parcel
 *  can't be read/derived, so the office flow never blocks (mirrors the office
 *  controller's own DEFAULT_RADIUS_M). */
const OFFICE_DEFAULT_RADIUS_M = 22;

/** §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR — `DRAW_WATCHDOG_MS` is gone. The idle timer no longer
 *  authors a default rectangle, so there is no "fallback" interval to name; what remains is
 *  `DRAW_IDLE_OFFER_MS` — how long a VISIBLE, READY, UNTOUCHED draw surface waits before it
 *  OFFERS the escape hatch the user already has. See `drawIdleWatchdog.ts` for the rationale. */
const DRAW_IDLE_OFFER_MS = DRAW_IDLE_OFFER_MS_DEFAULT;

/** The narrowed location result we thread into `createSiteFromRect`. */
interface PickedLocation {
    readonly lat: number;
    readonly lon: number;
    readonly address: string;
    /** The geocoder's `[west, south, east, north]` bounding box when supplied —
     *  threaded to the 2D map (via `pryzmSetGeocodeFrame`) so it `fitBounds` to the
     *  exact plot on open instead of opening at world zoom (tested zoom defect). */
    readonly bbox?: [number, number, number, number];
}

export interface OnboardingStepControllerOptions {
    readonly runtime: PryzmRuntime;
    /** Seed address parsed from the RAC brief (`metadata.address`), if any —
     *  pre-fills the location input. */
    readonly seedAddress?: string;
    /** Typology captured by the RAC brief (`brief.typologyId`), e.g. `'apartment'`.
     *  Threaded so the O.7.1 generate-confirm step copy/label is TYPOLOGY-AWARE
     *  (see `typologyLabel()` + the §FUTURE-TYPOLOGY switch point). Defaults to
     *  `'apartment'` — the one shipped generator today. */
    readonly typologyId?: string;
    /** O.12.c — the STRUCTURED brief metadata (`PipelineBrief.metadata`, field-id
     *  keyed) the RAC captured. Carried verbatim (typology-agnostic — this layer
     *  does NOT introspect the field ids) and forwarded to the typology-specific
     *  generate call so the user's bedroom/bathroom/option choices drive the
     *  result. Omitted ⇒ the generator falls back to the active-brief stash, then
     *  DEFAULT_PROGRAM. */
    readonly briefMetadata?: Record<string, unknown>;
}

type StepId = 'location' | 'site' | 'confirm' | 'generating';

/**
 * Launch the guided onboarding step flow. Mounts a small overlay, drives
 * location → draw-or-skip → generate, and tears itself down when done. The
 * caller (briefBootstrap) invokes this AFTER the project is created + opened.
 *
 * Returns a disposer that tears the overlay down early (e.g. if the runtime
 * re-composes). Safe to ignore — the flow disposes itself on completion.
 */
export function startOnboardingStepFlow(
    opts: OnboardingStepControllerOptions,
): () => void {
    const controller = new OnboardingStepController(opts);
    controller.start();
    return () => controller.dispose();
}

/** §L-435 — a settings combination that DOES fit, found by probing around one that does not. */
export interface NearestFeasibleResi {
    readonly floors: number;
    readonly minM2: number;
    readonly maxM2: number;
    /** Short human label for the one-click fix button, e.g. "3 floors" or "60–120 m² units". */
    readonly label: string;
}

/**
 * §L-435 — find the NEAREST residential settings that actually produce a layout.
 *
 * WHY: "No layout fits at this size — try a larger size band or fewer floors" is a refusal, not
 * guidance. It leaves the user to guess which of two knobs to turn, and by how much, with a
 * multi-second preview round-trip per guess. This probes for them and offers the answer.
 *
 * HOW: re-runs the SAME pure orchestrator (`orchestrateResidentialBuilding`) — no separate
 * feasibility model that could disagree with the engine. Probes in order of least surprise:
 * fewer floors first (keeps the unit mix the user chose), then a wider size band. Bounded to a
 * handful of attempts so a failing preview stays responsive.
 *
 * Returns null when nothing nearby fits — in which case the caller must NOT invent advice.
 */
export function findNearestFeasibleResi(input: {
    footprint: ReadonlyArray<{ x: number; z: number }>;
    floors: number;
    minM2: number;
    maxM2: number;
    typologies: { T1: boolean; T2: boolean; T3: boolean; T4: boolean };
}): NearestFeasibleResi | null {
    const attempt = (floors: number, minM2: number, maxM2: number): boolean => {
        try {
            const r = orchestrateResidentialBuilding({
                footprint: input.footprint as { x: number; z: number }[],
                upperLevels: floors,
                coreWidthM: 6, coreDepthM: 4, corridorWidthM: 1.5,
                minApartmentAreaM2: minM2,
                maxApartmentAreaM2: maxM2,
                typologies: input.typologies,
            });
            return r.status === 'ok';
        } catch { return false; }
    };

    // 1) Fewer floors — preserves the chosen unit mix and size band, so it is the least
    //    surprising change to propose. Step down at most 4 (bounded probe).
    for (let f = input.floors - 1; f >= 1 && f >= input.floors - 4; f--) {
        if (attempt(f, input.minM2, input.maxM2)) {
            return {
                floors: f, minM2: input.minM2, maxM2: input.maxM2,
                label: `${f} floor${f === 1 ? '' : 's'}`,
            };
        }
    }

    // 2) A wider size band at the ORIGINAL floor count — the user may care more about height
    //    than about unit size. Widen the max, then also lower the min.
    for (const widen of [20, 40, 60]) {
        const maxM2 = input.maxM2 + widen;
        if (attempt(input.floors, input.minM2, maxM2)) {
            return {
                floors: input.floors, minM2: input.minM2, maxM2,
                label: `${input.minM2}–${maxM2} m² units`,
            };
        }
    }
    for (const widen of [20, 40]) {
        const minM2 = Math.max(20, input.minM2 - widen);
        const maxM2 = input.maxM2 + widen;
        if (attempt(input.floors, minM2, maxM2)) {
            return {
                floors: input.floors, minM2, maxM2,
                label: `${minM2}–${maxM2} m² units`,
            };
        }
    }

    return null;   // nothing nearby fits — say so plainly rather than guessing
}

// Exported for unit tests (the public entry point is `startOnboardingStepFlow`); the flow
// is otherwise always launched via that factory.
export class OnboardingStepController {
    private readonly runtime: PryzmRuntime;
    private readonly seedAddress: string;
    /** Typology from the brief — drives the O.7.1 confirm-step copy/label AND the
     *  `generateAndFinish` route. §TYPOLOGY-CHOICE-AT-CONFIRM: no longer readonly —
     *  the confirm step's chooser reassigns it (through `setTypology`, which keeps the
     *  active brief in step) when the user picks a different building type. */
    private typologyId: string;
    /** §CONFIRM-PANEL-UX (C43) — the typology id whose chooser chip must regain focus
     *  after the confirm step re-renders. Null on every render the chooser did not
     *  cause, so the step never grabs focus unprompted. */
    private pendingChooserFocus: string | null = null;
    /** O.12.c — structured brief metadata, forwarded to the generate call. §RESI-MULTIFAMILY
     *  (Task 2): the residential program step MUTATES this with the user's level/area/typology
     *  choices before generate, so it is not readonly. */
    private briefMetadata: Record<string, unknown>;

    private overlay: HTMLElement | null = null;
    private bodyEl: HTMLElement | null = null;
    private stepLabelEl: HTMLElement | null = null;

    /** PRYZM-EARTH-ONBOARDING PRD Milestone 2 — the `location` step's globe presentation
     *  (mounts the solo Cesium globe + drives the search through `SiteEntryStore`). Created on
     *  entry to `renderLocationStep()`, disposed the moment the step is left (skip, a resolved
     *  search, or overlay teardown) — the globe must not stay live once the flow has moved on. */
    private globeHero: GlobeHeroSearch | null = null;

    /** PRD §22 — true once the zoom-then-split reveal has actually MOUNTED the site-authoring
     *  split (2D GIS left · live 3D Site right). Drives two things: the hero must then be
     *  released WITHOUT hiding the globe (the split now owns that viewport), and the site step
     *  must not re-mount or tear down what is already up. */
    private splitRevealed = false;

    /**
     * §REVEAL-CONTENT-READY — the in-flight context prefetch started at the `city` stage of the
     * camera descent, held so the reveal can WAIT on it rather than mounting the split over a load
     * that has not landed. `null` until the warm-up fires (and if it never fires, the reveal does
     * not wait at all). Never rejects — `warmContextCache` attaches the `.catch` at creation, so
     * awaiting this can only resolve.
     */
    private contextWarm: Promise<unknown> | null = null;

    /**
     * §REVEAL-FLIGHT-COMPLETE — the in-progress reveal, held so `handleGeocode` can await it
     * before tearing the location step down. See the note at `onParcelArrival`. Never rejects
     * (`revealSplitAtParcel` handles its own failures), so awaiting it can only resolve.
     */
    private revealInFlight: Promise<void> | null = null;

    /** Current step — drives the indicator + guards re-entry into generate. */
    private step: StepId = 'location';
    private picked: PickedLocation | null = null;
    private disposed = false;

    /** Disposers for in-flight listeners/timers so dispose() is leak-free. */
    private cleanups: Array<() => void> = [];

    /** §L-384 — the draw-commit wait (boundary-set listener + watchdog) disposer, tracked
     *  separately so BACK / re-draw can cancel JUST it without tearing down drag/resize. */
    private drawWaitCleanup: (() => void) | null = null;

    constructor(opts: OnboardingStepControllerOptions) {
        this.runtime = opts.runtime;
        this.seedAddress = (opts.seedAddress ?? '').trim();
        this.typologyId = (opts.typologyId ?? 'apartment').trim() || 'apartment';
        this.briefMetadata = opts.briefMetadata ?? {};
    }

    /**
     * Typology-aware noun for the confirm-step copy/label. §FUTURE-TYPOLOGY:
     * `'apartment'` (single-plate generator) and `'casa-unifamiliar'` (the
     * multi-storey HOUSE generator, A.21.j) both have shipped generators wired in
     * `generateAndFinish`; other typologies are a graceful fallthrough until their
     * Pack adds its noun here and swaps the generate call in `generateAndFinish`.
     */
    private typologyLabel(): string {
        switch (this.typologyId) {
            case 'apartment': return 'apartment';
            case 'casa-unifamiliar': return 'house';   // §A.6.c — friendly noun
            case 'house': return 'house';
            // §RESI-MULTIFAMILY routed under `residential-multifamily`; the pack that
            // composeRuntime registers declares `residential-building`. Both reach here.
            case 'residential-multifamily': return 'residential building';
            case 'residential-building': return 'residential building';
            // §OFFICE-ONBOARDING-WIRE — the picker emits the registry pack id
            // (`office-building`); the RAC/short form may emit `office`. Accept BOTH.
            case 'office': return 'office';
            case 'office-building': return 'office';
            default: return this.typologyId || 'design';
        }
    }

    /**
     * §TYPOLOGY-CHOICE-AT-CONFIRM — adopt the typology the user picked at the confirm
     * step, keeping the ACTIVE BRIEF in step with it.
     *
     * The brief is typology-DECLARED, and `activeBrief` is the existing single source
     * of truth the picker, the re-trigger path and `gatherLayoutPayload` all read. So
     * the chooser writes through THAT mechanism rather than standing up a parallel one:
     * change the typology and the stashed brief now says so too. Program metadata is
     * carried across verbatim — this layer does not introspect field ids (a house brief's
     * style chip is still meaningful to an apartment), and each pack's own brief resolver
     * ignores what it does not recognise.
     */
    private setTypology(typologyId: string): void {
        if (typologyId === this.typologyId) return;
        console.log(`[onboarding-step] typology chosen: "${this.typologyId}" → "${typologyId}".`);
        this.typologyId = typologyId;
        setActiveBrief({ typologyId, metadata: this.briefMetadata });
    }

    /** §OFFICE-ONBOARDING-WIRE — true when the brief's typology is the office tower,
     *  under EITHER id the picker (`office-building`, the registry pack id) or the
     *  short/RAC form (`office`) may thread. */
    private isOfficeTypology(): boolean {
        return isOfficeTypologyId(this.typologyId);
    }

    start(): void {
        try {
            console.log('[onboarding-step] starting guided flow (location → draw-or-skip → generate).');
            this.mountOverlay();
            this.renderLocationStep();
        } catch (err) {
            console.error('[onboarding-step] start threw — falling back to default rectangle + generate:', err);
            void this.fallbackDefaultRectAndGenerate('start-threw');
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const c of this.cleanups.splice(0)) {
            try { c(); } catch { /* ignore */ }
        }
        if (this.overlay?.parentNode) this.overlay.parentNode.removeChild(this.overlay);
        this.overlay = null;
        this.bodyEl = null;
        this.stepLabelEl = null;
    }

    private toast(message: string, severity: 'info' | 'success' | 'error'): void {
        try { this.runtime.events?.emit('pryzm:toast', { message, severity }); } catch { /* ignore */ }
    }

    /** §RESI-LANDSCAPE-MODAL — minimal HTML-escape for any interpolated runtime text
     *  written into the views rail (floor labels come from the card model). */
    private escResi(s: string): string {
        return String(s).replace(/[&<>"']/g, (c) => (
            c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
        ));
    }

    // ── overlay shell ─────────────────────────────────────────────────────────

    private mountOverlay(): void {
        const overlay = document.createElement('section');
        overlay.className = 'os-onboarding-overlay';
        overlay.setAttribute('data-testid', 'onboarding-step-overlay');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'Set up your project');

        const header = document.createElement('header');
        header.className = 'os-header';
        const title = document.createElement('h2');
        title.className = 'os-title';
        title.textContent = 'Set up your project';
        const stepChip = document.createElement('span');
        stepChip.className = 'os-step-chip';
        stepChip.setAttribute('data-testid', 'onboarding-step-chip');
        this.stepLabelEl = stepChip;
        header.appendChild(title);
        header.appendChild(stepChip);
        overlay.appendChild(header);

        const body = document.createElement('div');
        body.className = 'os-body';
        body.setAttribute('data-testid', 'onboarding-step-body');
        this.bodyEl = body;
        overlay.appendChild(body);

        // ── Drag + resize chrome (founder feedback 2026-06-03) ────────────────
        // Draggable by the header (cursor:move in CSS); interactive header children
        // are excluded so a click doesn't start a drag. Re-evaluated per mousedown
        // by makeDraggable, so it survives the body re-renders between steps. The
        // grip is hidden by CSS in the docked --drawing presentation.
        const grip = document.createElement('div');
        grip.className = 'os-resize-grip';
        grip.setAttribute('data-testid', 'onboarding-resize-grip');
        grip.setAttribute('aria-hidden', 'true');
        overlay.appendChild(grip);
        this.addCleanup(makeDraggable(overlay, '.os-header', ['button', 'input', 'a']));
        this.addCleanup(makeResizable(overlay, grip, { minWidth: 300, minHeight: 220 }));

        document.body.appendChild(overlay);
        this.overlay = overlay;
    }

    /** Update the persistent "Step N of 4" indicator. (O.7.1 inserted the
     *  generate-confirm step between the plot and the generate, so the flow is now
     *  Location → Plot → Confirm → Generate.) */
    private setStepIndicator(n: number, label: string): void {
        if (this.stepLabelEl) this.stepLabelEl.textContent = `Step ${n} of 4 · ${label}`;
    }

    /**
     * Switch the overlay between its two presentations:
     *  - MODAL (default): centered card + full-screen backdrop (steps 1, 3 and the
     *    site-choice phase). Captures pointer events — it's a dialog.
     *  - DRAWING (non-blocking): a slim banner docked to the bottom edge with NO
     *    backdrop, so the map underneath is fully visible and interactive. The
     *    overlay container lets pointer events fall through to the map; only the
     *    banner card itself is interactive (handled in CSS via pointer-events).
     *
     * This is the fix for the tested defect: the centered modal covered the map
     * during STEP 2 / DRAW YOUR PLOT, so the user couldn't click to draw.
     */
    private setDrawingPresentation(drawing: boolean): void {
        if (!this.overlay) return;
        // If the user dragged/resized a modal step (which pins explicit px
        // left/top/width/height/margin), those inline styles would override the
        // docked-banner CSS for the --drawing presentation. Clear them on entry so
        // the banner docks correctly; the modal steps re-center via CSS `inset:0`
        // + `margin:auto` once the inline values are gone.
        if (drawing) {
            const s = this.overlay.style;
            s.left = ''; s.top = ''; s.right = ''; s.bottom = '';
            s.width = ''; s.height = ''; s.margin = '';
            s.maxWidth = ''; s.maxHeight = ''; s.transform = '';
        }
        this.overlay.classList.toggle('os-onboarding-overlay--drawing', drawing);
        // A modal dialog must trap focus/announce; the docked banner must NOT —
        // it sits beside an interactive map, so drop the dialog role while drawing.
        if (drawing) {
            this.overlay.setAttribute('role', 'region');
        } else {
            this.overlay.setAttribute('role', 'dialog');
        }
    }

    private clearBody(): HTMLElement {
        const body = this.bodyEl;
        if (!body) throw new Error('overlay body not mounted');
        while (body.firstChild) body.removeChild(body.firstChild);
        return body;
    }

    private addCleanup(fn: () => void): void {
        this.cleanups.push(fn);
    }

    // ── Step 1: Location ──────────────────────────────────────────────────────

    private renderLocationStep(): void {
        this.step = 'location';
        markStartupPhase('location-step:open'); // §STARTUP-BUDGET
        this.setDrawingPresentation(false);
        this.setStepIndicator(1, 'Location');
        const body = this.clearBody();

        const prompt = document.createElement('p');
        prompt.className = 'os-prompt';
        prompt.textContent = "Where's your project?";
        body.appendChild(prompt);

        const hint = document.createElement('p');
        hint.className = 'os-hint';
        hint.textContent =
            'Search a city or address to fly the globe there, or drag it yourself. You can skip this.';
        body.appendChild(hint);

        const form = document.createElement('form');
        form.className = 'os-input-row';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'os-input';
        input.setAttribute('data-testid', 'onboarding-location-input');
        input.placeholder = 'e.g. 10 Downing Street, London';
        input.autocomplete = 'off';
        if (this.seedAddress) input.value = this.seedAddress;
        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.className = 'os-btn os-btn--primary';
        submit.textContent = 'Find location';
        form.appendChild(input);
        form.appendChild(submit);
        body.appendChild(form);

        const status = document.createElement('p');
        status.className = 'os-status';
        status.setAttribute('data-testid', 'onboarding-location-status');
        status.hidden = true;
        body.appendChild(status);

        const skipRow = document.createElement('div');
        skipRow.className = 'os-footer';
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'os-btn os-btn--ghost';
        skip.setAttribute('data-testid', 'onboarding-location-skip');
        skip.textContent = 'Skip — no location';
        skipRow.appendChild(skip);
        body.appendChild(skipRow);

        // PRYZM-EARTH-ONBOARDING PRD Milestone 2 — mount the solo Cesium globe BEHIND this
        // card and hand the search box to it. `window.pryzmToggleGIS`/
        // `window.pryzmGetSiteEntryCameraHost` are the SAME typed-global idiom this file
        // already uses for `pryzmStartBoundaryDraw` below (§GIS-HANDOFF) — no new mechanism.
        this.globeHero = new GlobeHeroSearch({
            toggleGlobe: (active) => {
                const w = window as unknown as { pryzmToggleGIS?: (a: boolean) => void };
                try { w.pryzmToggleGIS?.(active); } catch { /* ignore */ }
            },
            getCameraHost: () => {
                const w = window as unknown as {
                    pryzmGetSiteEntryCameraHost?: () => import('../../engine/views/siteEntryStore').GlobeCameraHost | null;
                };
                try { return w.pryzmGetSiteEntryCameraHost?.() ?? null; } catch { return null; }
            },
            // PRD §16 (Milestone 2 polish) — the real readiness gate that closes the dropped-
            // frame race (§SITE-ENTRY-GLOBE-READY). Missing the global (older bundle, or a
            // test harness) degrades to the pre-fix synchronous framing rather than throwing.
            whenCameraHostReady: () => {
                const w = window as unknown as { pryzmGetSiteEntryCameraHostReady?: () => Promise<void> };
                try {
                    const ready = w.pryzmGetSiteEntryCameraHostReady?.() ?? Promise.resolve();
                    // §STARTUP-BUDGET — when the globe's camera host is genuinely live (the chunk
                    // + viewer construction cost sits between location-step:open and this mark).
                    return ready.then(() => { markStartupPhase('globe:camera-host-ready'); });
                } catch { return Promise.resolve(); }
            },
            // §17 Increment 1 (PRD §17.2 "City" row) — the SAME cache/dedup mechanism
            // §CTX-PREFETCH-ON-LOCATION (L-470, `CesiumViewport.ts:2930`) already uses to warm
            // context buildings once a site is created, fired ONE STAGE EARLIER — the moment the
            // camera flight reaches `city`, not the moment the user later commits to a parcel and
            // `createSiteFromRect` runs. Same bbox key (same lat/lon throughout the chain — see
            // `GlobeHeroSearch.search()`), so this is a pure latency win: whichever caller reads
            // it next (this file's own `createSiteFromRect`/`site.location-changed` path, or
            // `SiteBoundaryMap2D.ts:1243`) gets a cache hit instead of a cold fetch. Fire-and-
            // forget, non-fatal by construction (`fetchContextBuildingsNearAndFar` never throws;
            // the `.catch` below is a defensive backstop only).
            // §REVEAL-CONTENT-READY (founder 2026-08-06: "KEEP THAT LOADING IN THE BACKGROUND …
            // START ZOOMING … THEN transition to the split view") — ⚠ THE PREFETCH IS UNCHANGED;
            // WHAT CHANGED IS THAT WE NOW REMEMBER ITS PROMISE. It already fires at the `city`
            // stage, i.e. the expensive load already overlaps the camera flight exactly as asked.
            // The missing half was the GATE: the promise was dropped on the floor, so the reveal
            // could not know whether the content had landed and mounted the split regardless.
            // Holding it lets `revealSplitAtParcel` wait on the REAL signal instead of a timer.
            warmContextCache: (lat, lon) => {
                markStartupPhase('context-warm:start'); // §STARTUP-BUDGET
                this.contextWarm = fetchContextBuildingsNearAndFar(lat, lon)
                    .then((r) => { markStartupPhase('context-warm:done'); return r; })
                    .catch(() => {
                        /* best-effort prefetch — a cold cache later is not a regression */
                        markStartupPhase('context-warm:done');
                        return null;
                    });
                void this.contextWarm;
            },
            // PRD §22 — THE REVEAL GATE. The full-screen globe owns the whole screen for the
            // ENTIRE flight (world → country → city → parcel); only when the staged chain has
            // landed at its closest stage does the split appear, in the strict order the §21
            // revert note requires. See `revealSplitAtParcel()`.
            // ⚠ Fire-and-forget BY CONTRACT: `onParcelArrival` is declared `=> void` and
            // `GlobeHeroSearch` does not await it, so the camera flight is never blocked by the
            // reveal. §REVEAL-CONTENT-READY made the reveal async (it now waits on the context
            // load); the globe keeps flying underneath it, which IS the choreography.
            onParcelArrival: (picked) => {
                markStartupPhase('flight:parcel-arrival'); // §STARTUP-BUDGET
                // §REVEAL-FLIGHT-COMPLETE — ⚠ HOLD THE PROMISE. `handleGeocode` must await this
                // before `leaveLocationStep()`, which disposes the hero and — unless
                // `splitRevealed` is already true — hides the globe the split is about to
                // re-parent (the §22 "black 3D pane" hazard, by a different route). The reveal
                // became asynchronous when it started gating on readiness, so the flag is no
                // longer set by the time `search()` returns; without this handle the teardown
                // races the mount it is supposed to follow.
                this.revealInFlight = this.revealSplitAtParcel({
                    lat: picked.lat,
                    lon: picked.lon,
                    address: picked.address,
                    ...(picked.bbox ? { bbox: picked.bbox } : {}),
                });
            },
            entries: siteEntryCoverageEntries(),
            // §STARTUP-BUDGET — the same geocoder, with phase marks around the round-trip.
            geocode: async (q) => {
                markStartupPhase('geocode:start');
                try {
                    return await geocodeAddress(q);
                } finally {
                    markStartupPhase('geocode:end');
                }
            },
        });
        void this.globeHero.mount();
        this.addCleanup(() => this.globeHero?.dispose());
        // PRD §16 (Milestone 2 polish, founder-reported live) — a brand-new empty project's
        // SplitViewManager AUTO-OPENS its 2D-plan pane on project-load (same mechanism the
        // §L-412 site-authoring split already guards against below via `suppressAutoOpen()` —
        // this is the identical race, just reached from the onboarding `location` step instead:
        // the globe is meant to own the FULL screen at this stage; the auto-opened empty plan
        // pane + its "View Properties" panel showed through beside it. Not restored on
        // `leaveLocationStep()` — the `site` step that follows either goes straight into the
        // real §L-412 split (which re-suppresses/re-arms this itself) or the BIM canvas, neither
        // of which wants the STALE empty-project plan pane back.
        try {
            const svp = window as unknown as { splitViewManager?: { suppressAutoOpen?: () => void } };
            svp.splitViewManager?.suppressAutoOpen?.();
        } catch (e) {
            console.warn('[onboarding-step] SVP suppressAutoOpen failed (non-fatal):', e);
        }

        const onSubmit = (e: Event): void => {
            e.preventDefault();
            void this.handleGeocode(input.value, status, submit);
        };
        form.addEventListener('submit', onSubmit);
        skip.addEventListener('click', () => {
            console.log('[onboarding-step] location skipped (no location).');
            this.picked = null;
            this.leaveLocationStep();
            this.renderSiteStep();
        });
        this.addCleanup(() => form.removeEventListener('submit', onSubmit));

        // Defer focus so the overlay is painted first.
        try { input.focus(); } catch { /* ignore */ }
    }

    /** Dismiss the globe presentation when the `location` step is left by any path (skip, a
     *  resolved search, empty-query-treated-as-skip) — the globe must not stay live once the
     *  flow has moved on to the plot step. Idempotent (`GlobeHeroSearch.dispose()` is). */
    private leaveLocationStep(): void {
        // PRD §22 — once the reveal has mounted the split, the SINGLE Cesium viewport has been
        // re-parented into its RIGHT pane. Releasing the hero must NOT toggle the globe off, or
        // the 3D Site pane the user just flew into goes black (`setVisible(false)`).
        this.globeHero?.dispose(this.splitRevealed ? { keepGlobe: true } : undefined);
        this.globeHero = null;
    }

    // ── PRD §22: the zoom-then-split reveal ───────────────────────────────────

    /**
     * PRD §22 / §17.4 — the founder's choreography, at its gate.
     *
     * Called by `GlobeHeroSearch`'s `onParcelArrival` — i.e. AFTER the full-screen globe has
     * flown the whole staged chain (world → country → city → parcel) and the terminal hand-off
     * intent was accepted. Everything before this moment is one continuous full-screen zoom;
     * this is the single point where the split appears.
     *
     * THE ORDER IS THE WHOLE POINT (§21 revert note; `runSiteRevealSequence` owns it):
     *   1. seed the 2D pane's opening frame (`pryzmSetGeocodeFrame`) — else it opens at world zoom
     *   2. anchor the site LOCATION ONLY (`dispatchSiteLocation`, never a boundary — C19 §1.4
     *      keeps the user's own committed draw as the FIRST `site.setParcelBoundary`) — else the
     *      3D pane has "no site location yet — cannot place massing" and renders empty
     *   3. arm the one-shot early boundary listener — the mount AUTO-ARMS the draw tool
     *      (`GISAreaLayout.ts:4309`) and the user has not yet chosen how to define their site, so
     *      a boundary drawn/selected immediately must route to confirm, not vanish (§21.1 fdg. 2)
     *   4. mount the ONE existing split (`pryzmMountSiteAuthoringPanes`, idempotent — P1)
     *   5. fade it in (presentation only)
     *
     * If (1) or (2) cannot be done, NOTHING is mounted and the user simply stays on the
     * full-screen globe — the pre-§21 behaviour the founder confirmed was correct.
     */
    private async revealSplitAtParcel(target: SiteRevealTarget): Promise<void> {
        const w = window as unknown as {
            pryzmSetGeocodeFrame?: (frame: { lat: number; lon: number; bbox?: [number, number, number, number] }) => void;
            pryzmMountSiteAuthoringPanes?: () => void;
            pryzmFadeInSiteAuthoringPanes?: () => void;
        };
        const result = await runSiteRevealSequence(
            {
                seedGeocodeFrame: (frame) => {
                    if (typeof w.pryzmSetGeocodeFrame !== 'function') return false;
                    w.pryzmSetGeocodeFrame(frame);
                    return true;
                },
                anchorSiteLocation: (t) => {
                    const ctx = resolveSiteContext(this.runtime);
                    if (!ctx) return false;
                    dispatchSiteLocation(ctx, {
                        latitude: t.lat,
                        longitude: t.lon,
                        siteAddress: t.address ?? null,
                    });
                    return true;
                },
                armBoundaryListener: () => this.armEarlySplitBoundaryListener(),
                // §REVEAL-CONTENT-READY — the gate. This is the SAME promise the `city`-stage
                // warm-up started (see `warmContextCache` above), not a second fetch, so the wait
                // is genuinely "has the background load finished", and it is usually already
                // resolved by the time the flight reaches the parcel stage. When the warm-up never
                // ran (a search that skipped the city stage, or an older bundle without the hook)
                // `contextWarm` is null and the reveal mounts immediately — no stall, no timer.
                awaitContentReady: () =>
                    (this.contextWarm ?? Promise.resolve()).then((r) => {
                        markStartupPhase('reveal:content-ready'); // §STARTUP-BUDGET
                        return r;
                    }),
                // §REVEAL-FLIGHT-COMPLETE — the other gate: the descent the user is watching
                // (§STARTUP-DIRECT-DESCENT: now ONE short-ease flight, not the staged 3.75 s).
                // Settles on cancellation too, so a user who grabs the globe mid-flight gets
                // their split at once instead of waiting out an animation they overrode.
                awaitFlightComplete: () =>
                    (this.globeHero?.whenFlightSettled() ?? Promise.resolve()).then(() => {
                        markStartupPhase('reveal:flight-settled'); // §STARTUP-BUDGET
                    }),
                mountSplit: () => {
                    if (typeof w.pryzmMountSiteAuthoringPanes !== 'function') {
                        throw new Error('pryzmMountSiteAuthoringPanes is not wired');
                    }
                    w.pryzmMountSiteAuthoringPanes();
                },
                fadeInSplit: () => { w.pryzmFadeInSiteAuthoringPanes?.(); },
            },
            target,
        );
        if (result.mounted) {
            this.splitRevealed = true;
            markStartupPhase('reveal:split-mounted'); // §STARTUP-BUDGET
            console.log('[onboarding-step] §22 reveal: split mounted in order —', result.steps.join(' → '));
        } else {
            console.warn(
                `[onboarding-step] §22 reveal: split NOT mounted (${result.stoppedBecause ?? 'mount failed'}) — ` +
                'staying full-screen on the globe. Steps run:', result.steps.join(' → ') || '(none)',
            );
        }
    }

    /**
     * PRD §22 (re-applying §21.1 finding 2, which the §21 revert kept as valid analysis) — a
     * ONE-SHOT `site.parcel-boundary-set` listener armed the instant the split appears.
     *
     * WHY: mounting the split auto-arms the boundary-draw tool (and parcel select) in the left
     * pane. At that moment the user has not yet answered "How do you want to set your plot?" —
     * so a parcel they select, or a boundary they trace immediately, is a real, deliberate
     * commit that must route to the generate-confirm step. Without this it fires into an empty
     * bus and is silently lost.
     *
     * Shares the SAME `this.drawWaitCleanup` slot `armBoundaryCommitWait()` uses, so whichever
     * is armed last wins and a commit can never double-fire (clicking "Draw it on the map"
     * supersedes this listener with the full draw wait).
     *
     * DELIBERATELY NO IDLE TIMER: the default-plot escape hatch belongs to an explicit draw
     * session. A user reading the choice card is not drawing. (§FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR
     * has since removed the forced default plot from the draw session too — the L-420 defect
     * this note anticipated turned out to be the founder-reported wedge.)
     */
    private armEarlySplitBoundaryListener(): void {
        this.drawWaitCleanup?.();
        this.drawWaitCleanup = null;

        let settled = false;
        const cleanup = (): void => {
            try { sub?.dispose(); } catch { /* ignore */ }
        };
        const sub = this.runtime.events?.on('site.parcel-boundary-set', () => {
            if (settled || this.disposed) return;
            settled = true;
            cleanup();
            if (this.drawWaitCleanup === cleanup) this.drawWaitCleanup = null;
            console.log('[onboarding-step] §22: boundary committed straight off the revealed split — routing to confirm.');
            this.renderGenerateConfirmStep('drawn');
        });
        this.drawWaitCleanup = cleanup;
        this.addCleanup(cleanup);
    }

    private async handleGeocode(
        query: string,
        status: HTMLElement,
        submitBtn: HTMLButtonElement,
    ): Promise<void> {
        const q = (query ?? '').trim();
        if (!q) {
            console.log('[onboarding-step] empty address — treating as skip.');
            this.picked = null;
            this.leaveLocationStep();
            this.renderSiteStep();
            return;
        }

        status.hidden = false;
        status.textContent = 'Searching…';
        submitBtn.disabled = true;
        try {
            const hero = this.globeHero;
            if (!hero) {
                // Defensive — the step controller always sets this in renderLocationStep().
                console.warn('[onboarding-step] handleGeocode: no GlobeHeroSearch mounted.');
                status.textContent = 'Location lookup failed — you can skip to use the default site.';
                submitBtn.disabled = false;
                return;
            }
            const outcome = await hero.search(q);
            if (this.disposed) return;
            if (!outcome.ok) {
                console.warn('[onboarding-step] location search failed:', outcome.message);
                status.textContent = outcome.message;
                submitBtn.disabled = false;
                return;
            }
            this.picked = outcome.picked;
            console.log('[onboarding-step] location resolved', this.picked);
            status.textContent = outcome.message;
            // §REVEAL-FLIGHT-COMPLETE — let the reveal finish before tearing the hero down.
            // `leaveLocationStep()` disposes the globe hero and only passes `keepGlobe` once
            // `splitRevealed` is true; with an async reveal that flag is set inside the promise
            // below, so disposing first would hide the viewport the split has just adopted.
            if (this.revealInFlight) {
                await this.revealInFlight;
                if (this.disposed) return;
            }
            this.leaveLocationStep();
            // §UX-NO-SETUP-PANEL (founder 2026-08-06: "REMOVE THIS PANEL (Set up your project).
            // Go for DRAW IN THE MAP by default") — a RESOLVED location goes straight to the map.
            //
            // The "How do you want to set your plot?" card asked a question the flow can now
            // answer for itself: by the time it appeared, §22's reveal had ALREADY mounted the
            // split, seeded the 2D frame, anchored the site and armed the boundary listener. The
            // map was live and armed BEHIND the card — so the card was a modal step over a working
            // surface, which is exactly the friction the founder is describing.
            //
            // `startDrawThenGenerate()` is the same handler the card's "Draw it on the map" choice
            // invoked, and every step in it is idempotent against the reveal having run (anchor,
            // frame-seed and `pryzmMountSiteAuthoringPanes` are all safe to repeat), so this is a
            // shortcut through the existing path rather than a second one. It swaps the wizard card
            // for the slim docked drawing banner and arms the boundary-commit wait.
            //
            // ⚠ THE PANEL SURVIVES ON THE SKIP PATH BELOW, DELIBERATELY. With no location there is
            // nothing to fly to and no parcel to pick, so "⚡ Use a default footprint" is the only
            // way to start — removing the card there would strand the user.
            // ⚠ KNOWN REACHABILITY LOSS, flagged not hidden: "📄 Overlay a plan / PDF"
            // (§FIX-SITE-OVERLAY-IMPORT-TERMINAL, L-70) now has no entry point on the
            // resolved-location path. It is still reachable via skip. Whether it deserves a
            // permanent affordance on the map surface is a founder call, not one to make silently.
            void this.startDrawThenGenerate();
        } catch (err) {
            console.warn('[onboarding-step] geocode threw (non-fatal) — allowing skip:', err);
            if (this.disposed) return;
            status.textContent = 'Location lookup failed — you can skip to use the default site.';
            submitBtn.disabled = false;
        }
    }

    // ── Step 2: Site (draw-or-skip) ────────────────────────────────────────────

    private renderSiteStep(): void {
        this.step = 'site';
        this.setDrawingPresentation(false);
        this.setStepIndicator(2, 'Your plot');
        const body = this.clearBody();

        const prompt = document.createElement('p');
        prompt.className = 'os-prompt';
        prompt.textContent = 'How do you want to set your plot?';
        body.appendChild(prompt);

        if (this.picked) {
            const loc = document.createElement('p');
            loc.className = 'os-hint';
            loc.textContent = `📍 ${this.picked.address}`;
            body.appendChild(loc);
        }

        const choices = document.createElement('div');
        choices.className = 'os-choices';

        const defaultBtn = this.buildChoiceCard(
            '⚡ Use a default footprint',
            'Start instantly with a 10 × 8 m plot. You can refine the site later.',
            'onboarding-site-default',
        );
        const drawBtn = this.buildChoiceCard(
            '✏️ Draw it on the map',
            'Open the map and trace your real plot boundary, corner by corner.',
            'onboarding-site-draw',
        );
        // §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — import a client PDF / survey image,
        // calibrate it to true scale, and drop it straight onto the PRYZM canvas as an
        // axis-aligned underlay to draw over. NO boundary trace, NO auto-generate.
        const overlayBtn = this.buildChoiceCard(
            '📄 Overlay a plan / PDF',
            'Place your survey or CAD plan on the map, scale it to true size, then open it on the canvas to draw over.',
            'onboarding-site-overlay',
        );
        choices.appendChild(defaultBtn);
        choices.appendChild(drawBtn);
        choices.appendChild(overlayBtn);
        body.appendChild(choices);

        const footer = document.createElement('div');
        footer.className = 'os-footer';
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'os-btn os-btn--ghost';
        back.setAttribute('data-testid', 'onboarding-site-back');
        back.textContent = '← Back';
        footer.appendChild(back);
        body.appendChild(footer);

        defaultBtn.addEventListener('click', () => {
            console.log('[onboarding-step] site choice: default footprint (skip draw).');
            void this.useDefaultRectThenConfirm();
        });
        drawBtn.addEventListener('click', () => {
            console.log('[onboarding-step] site choice: draw on map.');
            void this.startDrawThenGenerate();
        });
        overlayBtn.addEventListener('click', () => {
            console.log('[onboarding-step] site choice: overlay a plan/PDF → import to canvas (no draw, no generate).');
            void this.startOverlayImport();
        });
        back.addEventListener('click', () => this.renderLocationStep());
    }

    private buildChoiceCard(label: string, desc: string, testId: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'os-choice';
        btn.setAttribute('data-testid', testId);
        const t = document.createElement('span');
        t.className = 'os-choice-title';
        t.textContent = label;
        const d = document.createElement('span');
        d.className = 'os-choice-desc';
        d.textContent = desc;
        btn.appendChild(t);
        btn.appendChild(d);
        return btn;
    }

    // ── Step 3: Generate-confirm (O.7.1) ───────────────────────────────────────

    /**
     * The SKIP path — author a default-rectangle parcel, then ROUTE TO CONFIRM
     * (O.7.1). Previously this generated immediately; now the user is asked first,
     * so the Skip path lands them in the editor with a default plot + the
     * "Generate with AI?" question (rather than a silent auto-generate).
     */
    private useDefaultRectThenConfirm(): void {
        // PRD §22 — disarm the early-split boundary listener FIRST. `createSiteFromRect` emits
        // `site.parcel-boundary-set` SYNCHRONOUSLY, which would otherwise trip that listener into
        // a redundant 'drawn'-labelled confirm a tick before this path's own 'default-plot' one.
        try { this.drawWaitCleanup?.(); } catch { /* ignore */ }
        this.drawWaitCleanup = null;
        const siteOk = this.createSite({
            ...(this.picked ? { lat: this.picked.lat, lon: this.picked.lon, address: this.picked.address } : {}),
            width: DEFAULT_PARCEL_WIDTH_M,
            depth: DEFAULT_PARCEL_DEPTH_M,
        });
        if (!siteOk) {
            // createSite already toasted + logged; nothing left to do — bail without throwing.
            this.dispose();
            return;
        }
        // createSiteFromRect sets the boundary synchronously + emits the event, so
        // the default parcel is already in the store and visible. Ask before generating.
        this.renderGenerateConfirmStep('default-plot');
    }

    /**
     * The DRAW path — activate GIS, start the boundary-draw tool, set the Site
     * location/origin (so the draw tool projects lat/lon → site-XZ), then WAIT for
     * the `site.parcel-boundary-set` event the draw tool fires on commit. §FIX-DRAW-
     * WATCHDOG-MUST-NOT-AUTHOR: an idle window now OFFERS the default-plot escape hatch
     * rather than committing one — the wait ends only when the user acts.
     *
     * §GIS-HANDOFF (needs browser verification): there is no clean runtime hook to
     * toggle GIS, so we use the established window-hook idiom — `pryzmToggleGIS`
     * (registered alongside `pryzmStartBoundaryDraw` in GISAreaLayout) to
     * mount/activate Cesium, then `pryzmStartBoundaryDraw` to begin the draw. Both
     * are no-ops until the editor's GIS area has wired them; if they never wire, the draw
     * banner's "← Back" / "Skip drawing" remain the user's (explicit) way out — nothing is
     * auto-committed on their behalf. The draw tool reads the Site origin via getSiteOrigin() — so we
     * set the location on the Site FIRST (via createSiteFromRect's location path,
     * with width/depth 0-area-safe defaults that we immediately overwrite on draw).
     */
    private async startDrawThenGenerate(): Promise<void> {
        // 1) Anchor the Site (location only, NO boundary) up front, so:
        //    (a) the draw tool's getSiteOrigin() can project the drawn lat/lon ring;
        //    (b) the user's committed draw is the FIRST `site.setParcelBoundary`, so
        //        the one-shot/immutable rule (C19 §1.4) does NOT reject it.
        //    We deliberately do NOT call createSiteFromRect here (it always authors
        //    a rectangle boundary, which would "win" and block the drawn one — the
        //    bug flagged in the O.2 build). dispatchSiteLocation creates the Site +
        //    sets location with no boundary; ensureSite creates a 0/0 Site when the
        //    user skipped the location step. The draw tool then owns the boundary.
        const ctx = resolveSiteContext(this.runtime);
        if (ctx) {
            if (this.picked) {
                console.log('[onboarding-step] anchoring Site location (no boundary) before draw.');
                dispatchSiteLocation(ctx, {
                    latitude: this.picked.lat,
                    longitude: this.picked.lon,
                    siteAddress: this.picked.address ?? null,
                });
            } else {
                // No location picked — still create the Site so the draw can set the
                // first boundary + getSiteOrigin falls back to the first vertex.
                ensureSite(ctx);
            }
        }

        // 2) Arm the boundary-set listener + idle offer BEFORE starting the draw so
        //    we never miss the commit event.
        this.renderDrawingStep();
        this.armBoundaryCommitWait();

        // 3) Activate GIS + start the draw tool via the window-hook handoff.
        try {
            const w = window as unknown as {
                pryzmToggleGIS?: (active: boolean) => void;
                pryzmStartBoundaryDraw?: () => void;
                pryzmSetGeocodeFrame?: (frame: { lat: number; lon: number; bbox?: [number, number, number, number] }) => void;
                // §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — the site-authoring split.
                pryzmMountSiteAuthoringPanes?: () => void;
            };
            // §ZOOM-TO-ADDRESS (tested defect): seed the 2D map's getMapInitial frame
            // from THIS flow's geocode result BEFORE the draw opens. The onboarding
            // geocode runs outside the GIS-rail search box, so without this the bbox
            // never reaches getMapInitial() and the map opened at world zoom — the
            // user had to zoom to their address manually. With the bbox threaded,
            // SiteBoundaryMap2D fitBounds to the exact plot on open.
            if (this.picked && typeof w.pryzmSetGeocodeFrame === 'function') {
                console.log('[onboarding-step] §ZOOM-TO-ADDRESS: seeding map frame', {
                    lat: this.picked.lat, lon: this.picked.lon, bbox: this.picked.bbox,
                });
                w.pryzmSetGeocodeFrame({
                    lat: this.picked.lat,
                    lon: this.picked.lon,
                    ...(this.picked.bbox ? { bbox: this.picked.bbox } : {}),
                });
            }
            // §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — PREFER the site-authoring
            // SPLIT: it lands the user directly in 2D map LEFT · live 3D Site RIGHT, so the
            // site + boundary + buildable envelope render on the right AS the user draws /
            // selects on the left — no "Not now → hunt the 3D button" dance. The split's own
            // MapLibre mounter arms the draw tool in the left pane, so `startDrawWhenReady`
            // is NOT needed on this path. Falls back to the classic single-pane handoff
            // (Cesium owns #container + 2D overlay) when the split entry isn't wired.
            if (typeof w.pryzmMountSiteAuthoringPanes === 'function') {
                console.log('[onboarding-step] §GIS-HANDOFF (L-412): mounting the site-authoring split (2D map left · live 3D Site right).');
                w.pryzmMountSiteAuthoringPanes();
            } else if (typeof w.pryzmToggleGIS === 'function') {
                console.log('[onboarding-step] §GIS-HANDOFF: pryzmToggleGIS(true) (single-pane fallback).');
                w.pryzmToggleGIS(true);
                // The Cesium mount + boundary tool construction is async inside
                // GISAreaLayout; poll briefly for pryzmStartBoundaryDraw, then call it.
                this.startDrawWhenReady();
            } else {
                console.warn('[onboarding-step] §GIS-HANDOFF: no GIS entry wired — the draw button on the GIS rail still works. §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR: nothing will auto-commit a plot; the banner’s ← Back / Skip drawing are the way out.');
            }
        } catch (err) {
            console.warn('[onboarding-step] §GIS-HANDOFF threw — the draw banner’s ← Back / Skip drawing remain the user’s way out (nothing auto-commits):', err);
        }
    }

    /**
     * §L-384 — arm the "boundary committed" wait: a `site.parcel-boundary-set` listener
     * + an idle timer. On commit → the Confirm step; on a genuinely idle window → an OFFER
     * of the default-plot escape hatch (§FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR — never a commit).
     * Tracked in `this.drawWaitCleanup` so BACK / re-draw can cancel JUST this wait (not
     * the overlay's drag/resize cleanups). Re-armable — cancels any prior wait first, so
     * the confirm-step "← Back to drawing" re-draw can re-enter cleanly without double-firing.
     */
    private armBoundaryCommitWait(): void {
        // Cancel any prior wait so a re-arm (BACK → re-draw) never double-fires.
        this.drawWaitCleanup?.();
        this.drawWaitCleanup = null;

        let settled = false;
        const sub = this.runtime.events?.on('site.parcel-boundary-set', () => {
            if (settled) return;
            settled = true;
            cleanup();
            // O.7.1: keep the drawn boundary visible on the map + ASK before generate.
            console.log('[onboarding-step] boundary committed — keeping it visible + asking before generate.');
            this.renderGenerateConfirmStep('drawn');
        });

        // §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR (ADR-0299, founder-reported) — THE IDLE TIMER NO
        // LONGER AUTHORS ANYTHING.
        //
        // It used to call `fallbackDefaultRectToConfirm('watchdog')`: a 10 × 8 m rectangle at the
        // geocode centre, committed as the user's parcel (C19 §1.4 — IMMUTABLE from that moment),
        // labelled `source="default-plot"`, with the flow advanced to "Generate your apartment with
        // AI?". Three things were wrong with that, and only the third had been noticed before:
        //   1. A timer has NO EVIDENCE about where the user's land is. Inventing a parcel is
        //      inventing the single input the whole C19 → C58 → generator chain derives from, and
        //      presenting it as authored data (ADR-0299 §4).
        //   2. Idleness cannot distinguish "stuck" from "reading a Catastro record in another
        //      window" from "TAB IN THE BACKGROUND". In a hidden tab the signal is meaningless.
        //   3. It locked the C19 one-shot, so the user's REAL parcel then hit `parcel-already-set`
        //      — the wedge (see §FIX-BOUNDARY-COMMIT-REFUSE, the other half of this fix).
        // Its own log line gave it away: "falling back to a default plot, THEN ASKING before
        // generate". Asking after acting is not asking.
        //
        // What replaces it: `decideDrawIdleAction` (pure, unit-tested, and — deliberately — unable
        // to express a commit) can only return `offer`. The offer is a NON-BLOCKING hint pointing
        // at the "Skip drawing — use a default plot" button already in the draw banner. The user's
        // click is what authors a plot. The listener above STAYS ARMED throughout, so drawing at
        // any point still works. Lengthening the timeout was explicitly NOT the fix — the defect
        // was what it did, not when.
        let lastActivityAt = Date.now();
        let offered = false;
        const onActivity = (): void => { lastActivityAt = Date.now(); };
        const hasDoc = typeof document !== 'undefined';
        // A tab returning to the foreground is a fresh start: the user has only now had a chance
        // to look at the surface, so the idle clock restarts rather than expiring on arrival.
        const onVisibility = (): void => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                lastActivityAt = Date.now();
            }
        };
        if (hasDoc) {
            document.addEventListener('pointerdown', onActivity, true);
            document.addEventListener('keydown', onActivity, true);
            document.addEventListener('visibilitychange', onVisibility, true);
        }
        let watchdog: ReturnType<typeof setTimeout>;
        const armWatchdog = (): void => {
            watchdog = setTimeout(() => {
                if (settled || this.disposed) return;
                const decision = decideDrawIdleAction({
                    nowMs: Date.now(),
                    lastActivityAtMs: lastActivityAt,
                    drawSurfaceReadyAtMs: this.drawSurfaceReadyAtMs(),
                    documentHidden: hasDoc && document.visibilityState === 'hidden',
                    alreadyOffered: offered,
                    idleWindowMs: DRAW_IDLE_OFFER_MS,
                });
                if (decision.action === 'offer') {
                    offered = true;
                    console.log(
                        `[onboarding-step] §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR — the draw surface has been ` +
                        `visible, ready and untouched for ${Math.round(DRAW_IDLE_OFFER_MS / 1000)}s. ` +
                        'OFFERING the default-plot escape hatch (no parcel authored, nothing committed, ' +
                        'the draw stays armed).',
                    );
                    this.showDefaultPlotOffer();
                } else {
                    console.log(`[onboarding-step] draw idle tick — waiting (${decision.because}).`);
                }
                // Keep ticking either way: the surface may become ready, or the tab may return.
                armWatchdog();
            }, DRAW_IDLE_OFFER_MS);
        };
        armWatchdog();

        const cleanup = (): void => {
            try { sub?.dispose(); } catch { /* ignore */ }
            clearTimeout(watchdog);
            if (hasDoc) {
                document.removeEventListener('pointerdown', onActivity, true);
                document.removeEventListener('keydown', onActivity, true);
                document.removeEventListener('visibilitychange', onVisibility, true);
            }
        };
        this.drawWaitCleanup = cleanup;
        this.addCleanup(cleanup);
    }

    /**
     * §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR — when did the draw surface become genuinely usable?
     *
     * `SiteBoundaryMap2D` stamps `window.pryzmBoundaryDrawSurfaceReadyAt` on its MapLibre `load`
     * (the moment "[gis] map2d: ready" is logged) and clears it on dispose. `null` therefore means
     * "there is nothing to draw on yet" — which is exactly the state the founder's tiles stall
     * (`readiness NEVER ARRIVED at stage "tiles" … no progress for 25000 ms`) leaves the user in.
     * The idle clock must not run then: a user cannot be idle on a surface that does not exist,
     * and charging our load time to their patience is what made the old watchdog fire on people
     * who had never been shown a map.
     */
    private drawSurfaceReadyAtMs(): number | null {
        if (typeof window === 'undefined') return null;
        const at = (window as unknown as { pryzmBoundaryDrawSurfaceReadyAt?: number }).pryzmBoundaryDrawSurfaceReadyAt;
        return typeof at === 'number' && Number.isFinite(at) ? at : null;
    }

    /**
     * §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR — the OFFER that replaced the silent commit.
     *
     * Non-blocking, additive, and reversible by ignoring it: a line of text appended to the draw
     * banner drawing the eye to the "Skip drawing — use a default plot" button that is already
     * sitting next to it. Nothing is dispatched, no parcel exists, the C19 one-shot is untouched
     * and the boundary listener stays armed — so drawing, selecting a parcel, or going Back all
     * still work exactly as they did a second earlier. Shown at most once per draw session.
     *
     * This is the whole of what a watchdog is entitled to do: draw attention to a choice, never
     * make it. If the user is simply reading in another window, the worst case is a hint they
     * never see — not a plot in Barcelona they never asked for.
     */
    private showDefaultPlotOffer(): void {
        if (this.disposed || typeof document === 'undefined') return;
        const body = this.bodyEl;
        if (!body) return;
        if (body.querySelector('[data-testid="onboarding-draw-idle-offer"]')) return;
        const hint = document.createElement('p');
        hint.className = 'os-hint';
        hint.setAttribute('data-testid', 'onboarding-draw-idle-offer');
        hint.textContent = 'Still deciding? You can start from a default 10 × 8 m plot and refine the site later — use “Skip drawing” below.';
        // Insert ABOVE the footer so the buttons stay where the user last saw them.
        const footer = body.querySelector('.os-footer');
        if (footer) body.insertBefore(hint, footer); else body.appendChild(hint);
    }

    /**
     * §L-384 — BACK out of the Confirm / Program step. The committed parcel boundary is
     * a C19 §1.4 IMMUTABLE one-shot, so "go back and change the plot" is a CLEAR-then-
     * recreate, never a mutation:
     *  - DRAWN plot: the live 2D map is still mounted (O.7.2.b) → `pryzmRearmBoundaryDraw`
     *    clears the boundary (site.replace) + re-arms the draw; we re-enter the draw wait.
     *  - DEFAULT plot (no live map): clear the boundary via the dispatch + return to the
     *    plot-choice step so the user can pick another method.
     */
    private backFromConfirm(source: 'drawn' | 'default-plot'): void {
        this.overlay?.classList.remove('os-onboarding-overlay--confirm');
        this.overlay?.classList.remove('os-onboarding-overlay--resi');
        const w = window as unknown as { pryzmRearmBoundaryDraw?: () => void };
        if (source === 'drawn' && typeof w.pryzmRearmBoundaryDraw === 'function') {
            console.log('[onboarding-step] §L-384 confirm → BACK to drawing (clear + re-arm the live map).');
            try { w.pryzmRearmBoundaryDraw(); } catch { /* ignore */ }
            this.renderDrawingStep();
            this.armBoundaryCommitWait();
            return;
        }
        console.log('[onboarding-step] §L-384 confirm → BACK to plot choice (clear boundary via dispatch).');
        try {
            const ctx = resolveSiteContext(this.runtime);
            if (ctx) dispatchClearParcelBoundary(ctx);
        } catch (e) { console.warn('[onboarding-step] §L-384 backFromConfirm clear failed (non-fatal):', e); }
        this.renderSiteStep();
    }

    /**
     * Poll (bounded) for `window.pryzmStartBoundaryDraw` to appear after GIS
     * activation, then call it. GISAreaLayout registers it only once Cesium has
     * mounted (an async Promise.all), so a short poll bridges the gap. If it never
     * appears, the draw banner's "← Back" / "Skip drawing" remain available (nothing
     * auto-commits a plot — §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR).
     */
    private startDrawWhenReady(): void {
        let tries = 0;
        const MAX_TRIES = 40; // 40 × 250 ms = 10 s.
        const tick = (): void => {
            if (this.disposed) return;
            const start = (window as unknown as { pryzmStartBoundaryDraw?: () => void }).pryzmStartBoundaryDraw;
            if (typeof start === 'function') {
                console.log('[onboarding-step] §GIS-HANDOFF: pryzmStartBoundaryDraw() — draw tool armed.');
                try { start(); } catch (err) { console.warn('[onboarding-step] startBoundaryDraw threw:', err); }
                return;
            }
            if (++tries >= MAX_TRIES) {
                console.warn('[onboarding-step] §GIS-HANDOFF: pryzmStartBoundaryDraw never appeared — manual GIS-rail draw, or the banner’s ← Back / Skip drawing. Nothing auto-commits a plot.');
                return;
            }
            const t = setTimeout(tick, 250);
            this.addCleanup(() => clearTimeout(t));
        };
        tick();
    }

    /**
     * §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) + §FEAT-SITE-OVERLAY-PLAN-UNDERLAY (L-71) —
     * the PDF/image IMPORT branch. This is DECOUPLED from the draw→generate flow: it opens
     * the 2D map in OVERLAY-ONLY mode (no boundary draw, no idle offer, no generate-confirm),
     * auto-opens the upload picker, and treats "✓ Finish" as the sole TERMINAL action →
     * the calibrated plan is dropped onto the PRYZM canvas as an axis-aligned underlay
     * (created by the overlay controller → SiteBoundaryMap2D → createPlanCanvasUnderlayFromSiteOverlay)
     * and the wizard disposes, landing the user in the editor. The other onboarding
     * branches (default footprint, draw-plot → generate) are untouched.
     */
    private async startOverlayImport(): Promise<void> {
        // 1) Anchor the Site (location only, NO boundary) so the overlay's origin resolves.
        const ctx = resolveSiteContext(this.runtime);
        if (ctx) {
            if (this.picked) {
                dispatchSiteLocation(ctx, {
                    latitude: this.picked.lat,
                    longitude: this.picked.lon,
                    siteAddress: this.picked.address ?? null,
                });
            } else {
                ensureSite(ctx);
            }
        }

        // 2/3) TERMINAL completion + CANCEL. When the user presses "✓ Finish", the overlay
        //    controller emits `site.overlay-placement-committed` (AFTER creating the canvas
        //    underlay + setting Project North) → we dispose the wizard and land in the editor.
        //    When the user backs out, we tear the map down and RESTORE the plot-choice step so
        //    they can pick another method.
        let settled = false;
        const finishImport = (): void => {
            if (settled) return;
            settled = true;
            try { sub?.dispose(); } catch { /* ignore */ }
            console.log('[onboarding-step] §SITE-OVERLAY: plan imported to canvas — terminal (NO boundary, NO generate).');
            this.toast('Plan placed on the canvas — start drawing your walls over it.', 'success');
            // §FIX-SITE-OVERLAY-ENTER-CANVAS (L-78) — the underlay was already created + placed
            // (the controller AWAITED it before firing this event). Now close the 2D map, EXIT
            // GIS, switch to PLAN (Top) view and frame the camera on the plan so the founder
            // actually SEES it, then dispose the wizard.
            void this.landInCanvasWithUnderlay();
        };
        // §FIX-SITE-OVERLAY-DOUBLE-PANEL (L-77) — Back/cancel: tear down the overlay map and
        // RE-RENDER the plot-choice step (restores the choice card the import step dismissed),
        // so the user can pick a different plot method. Does NOT dispose the wizard.
        const cancelImport = (): void => {
            if (settled) return;
            settled = true;
            try { sub?.dispose(); } catch { /* ignore */ }
            console.log('[onboarding-step] §SITE-OVERLAY: import cancelled — restoring the plot-choice step.');
            const w = window as unknown as { pryzmCloseBoundaryMap2D?: () => void; pryzmToggleGIS?: (a: boolean) => void };
            try { w.pryzmCloseBoundaryMap2D?.(); } catch { /* ignore */ }
            try { w.pryzmToggleGIS?.(false); } catch { /* ignore */ }
            if (!this.disposed) this.renderSiteStep();
        };
        const sub = this.runtime.events?.on('site.overlay-placement-committed', () => finishImport());
        this.addCleanup(() => { try { sub?.dispose(); } catch { /* ignore */ } });

        // §FIX-SITE-OVERLAY-DOUBLE-PANEL (L-77) — DISMISS the plot-choice card (clearBody)
        // and show a slim "place your plan" banner instead, so the onboarding wizard and the
        // "Site plan overlay" controls panel are never on screen at once (only one active
        // panel). The banner carries the sole in-wizard affordance for this step: "← Back".
        this.setStepIndicator(2, 'Find your site');
        this.setDrawingPresentation(true);
        const body = this.clearBody();
        const hint = document.createElement('p');
        hint.className = 'os-hint os-draw-instruction';
        // §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 A) — the instruction now matches
        // the real (locate → place → finish) order instead of assuming the plan is already up.
        hint.textContent = 'Pan and zoom the map to your site · then press "Overlay plan / PDF" to add your plan · place, scale and rotate it · then press ✓ Finish.';
        body.appendChild(hint);
        const footer = document.createElement('div');
        footer.className = 'os-footer';
        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'os-btn os-btn--ghost';
        backBtn.setAttribute('data-testid', 'onboarding-overlay-cancel');
        backBtn.textContent = '← Back';
        backBtn.addEventListener('click', () => cancelImport());
        footer.appendChild(backBtn);
        body.appendChild(footer);

        // 4) Activate GIS + open the map in OVERLAY-ONLY mode, then auto-open the picker.
        try {
            const w = window as unknown as {
                pryzmToggleGIS?: (active: boolean) => void;
                pryzmSetGeocodeFrame?: (frame: { lat: number; lon: number; bbox?: [number, number, number, number] }) => void;
            };
            if (this.picked && typeof w.pryzmSetGeocodeFrame === 'function') {
                w.pryzmSetGeocodeFrame({
                    lat: this.picked.lat,
                    lon: this.picked.lon,
                    ...(this.picked.bbox ? { bbox: this.picked.bbox } : {}),
                });
            }
            if (typeof w.pryzmToggleGIS === 'function') w.pryzmToggleGIS(true);
            this.startOverlayImportWhenReady();
        } catch (err) {
            console.warn('[onboarding-step] §SITE-OVERLAY-IMPORT threw:', err);
        }
    }

    /**
     * §FIX-SITE-OVERLAY-ENTER-CANVAS (L-78) + §FIX-ONBOARDING-OVERLAY-SINGLE-PANEL-NO-BOUNDARY-SPLIT3D
     * (L-194) — land the user in the editor with the imported plan VISIBLE, in the 3D SPLIT view
     * (plan + 3D) ready to continue drawing walls over the underlay. The overlay controller already
     * created + placed the underlay mesh in the BIM scene (awaited before this runs).
     *
     * §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 B) — the transition itself now lives in
     * ONE place, `enterCanvasWithSitePlanUnderlay()` (close map → exit GIS → 3D view → split
     * 3D+plan → frame), because the wizard is NOT always there: the same panel is reachable from
     * the always-on Plan + Site (GIS) launcher (C06 §7) and on re-entry to an onboarded project,
     * and in those cases this listener does not exist — which is precisely why "✓ Finish" left the
     * founder on the map. The map host calls the same function; it is idempotent, so exactly one
     * landing happens. The wizard's remaining job is simply to dispose itself.
     */
    private async landInCanvasWithUnderlay(): Promise<void> {
        await enterCanvasWithSitePlanUnderlay();
        // Dispose the wizard — we're done; the user is in the canvas.
        this.dispose();
    }

    /**
     * Poll (bounded) for the overlay-only map hook + the upload-picker hook, then open the
     * map in overlay-only mode and pop the file picker so the user starts from their plan.
     */
    private startOverlayImportWhenReady(): void {
        let tries = 0;
        const MAX_TRIES = 40; // 40 × 250 ms = 10 s.
        const tick = (): void => {
            if (this.disposed) return;
            const w = window as unknown as {
                pryzmStartSitePlanOverlayImport?: () => void;
                pryzmOpenSitePlanOverlay?: () => void;
            };
            if (typeof w.pryzmStartSitePlanOverlayImport === 'function') {
                try { w.pryzmStartSitePlanOverlayImport(); } catch (err) { console.warn('[onboarding-step] startSitePlanOverlayImport threw:', err); }
                // §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 A) — WE DO NOT OPEN THE
                // FILE PICKER HERE. This auto-open on MODE ENTRY was the inverted order: the
                // upload fired before the user had panned/zoomed to their site, so the raster
                // landed at the geocode origin — the founder's "RANDOM, not accurate location".
                // The map now opens in the `locating` phase; the user navigates, THEN presses
                // "Overlay plan / PDF" (the map button / the overlay panel's own upload button),
                // which anchors the plan to the view they actually chose.
                return;
            }
            if (++tries >= MAX_TRIES) {
                console.warn('[onboarding-step] §SITE-OVERLAY-IMPORT: pryzmStartSitePlanOverlayImport never appeared.');
                return;
            }
            const t = setTimeout(tick, 250);
            this.addCleanup(() => clearTimeout(t));
        };
        tick();
    }

    /**
     * The DRAW phase is the ONLY non-modal step: the user must SEE and CLICK the
     * map underneath to trace their plot. So instead of the centered card we render
     * a slim instruction banner docked to the bottom edge (`--drawing` presentation,
     * no backdrop, pointer-events fall through to the map — see CSS). We keep just
     * the one-line instruction + the "Skip drawing" escape hatch, inline in the
     * banner. The step chip ("Step 2 of 4 · Draw your plot") stays in the header.
     */
    private renderDrawingStep(): void {
        this.setDrawingPresentation(true);
        this.setStepIndicator(2, 'Draw your plot');
        const body = this.clearBody();

        const hint = document.createElement('p');
        hint.className = 'os-hint os-draw-instruction';
        // §L-384 — advertise the new edit affordances (undo/redo + Esc-clear) inline.
        hint.textContent = 'Click each corner · Ctrl+Z undo · double-click or Enter to close · Esc clears';
        body.appendChild(hint);

        const footer = document.createElement('div');
        footer.className = 'os-footer';

        // §L-384 — BACK to the plot-choice step. Tears the draw map down cleanly and
        // cancels JUST the draw-commit wait (not the overlay's drag/resize cleanups).
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'os-btn os-btn--ghost';
        back.setAttribute('data-testid', 'onboarding-draw-back');
        back.textContent = '← Back';
        footer.appendChild(back);

        const useDefault = document.createElement('button');
        useDefault.type = 'button';
        useDefault.className = 'os-btn os-btn--ghost';
        useDefault.setAttribute('data-testid', 'onboarding-draw-usedefault');
        useDefault.textContent = 'Skip drawing — use a default plot';
        footer.appendChild(useDefault);
        body.appendChild(footer);

        back.addEventListener('click', () => {
            console.log('[onboarding-step] §L-384 draw → BACK to plot choice.');
            // Cancel the draw-commit wait so it can't fire the confirm after we leave.
            try { this.drawWaitCleanup?.(); } catch { /* ignore */ }
            this.drawWaitCleanup = null;
            // Tear down the live 2D draw map + any in-flight boundary tool.
            const w = window as unknown as { pryzmCloseBoundaryMap2D?: () => void; pryzmCancelBoundaryDraw?: () => void };
            try { w.pryzmCancelBoundaryDraw?.(); } catch { /* ignore */ }
            try { w.pryzmCloseBoundaryMap2D?.(); } catch { /* ignore */ }
            this.renderSiteStep();
        });

        useDefault.addEventListener('click', () => {
            console.log('[onboarding-step] user opted out of drawing — default plot, then ask before generate.');
            // O.7.1: cancel the in-flight draw-wait listener/idle timer (we're leaving
            // the draw phase) so it can't fire the confirm a second time.
            for (const c of this.cleanups.splice(0)) { try { c(); } catch { /* ignore */ } }
            void this.fallbackDefaultRectToConfirm('user-skip-draw');
        });
    }

    /**
     * O.7.1 — the GENERATE-CONFIRM step. Inserted between boundary-commit (or the
     * Skip/default-plot path) and the generate, so the flow ASKS instead of
     * silently auto-generating. Two outcomes:
     *   • "Generate {typology}"        → runs `generateAndFinish()` (generate →
     *                                     activate 3D view → dispose).
     *   • "Not now — I'll design it…"  → disposes the overlay WITHOUT generating,
     *                                     leaving the user in the editor with their
     *                                     boundary/site intact (they can generate
     *                                     later via the AI panel /
     *                                     `pryzmGenerateApartmentFromBoundary()`).
     *
     * KEEP-BOUNDARY-VISIBLE: this card uses the NON-BLOCKING drawing presentation
     * (no full-screen backdrop, pointer-events fall through to the map) so the
     * drawn boundary stays on screen behind the question. A `--confirm` modifier
     * restores the vertical title/subtext/buttons layout (the draw banner is a
     * horizontal row). `source` only affects the breadcrumb + subtext wording.
     *
     * §FUTURE-TYPOLOGY: the LABEL is typology-aware (`typologyLabel()`); the actual
     * dispatch (apartment generator) lives in `generateAndFinish` — a future Pack
     * swaps that one call and adds its noun to `typologyLabel()`.
     */
    private renderGenerateConfirmStep(source: 'drawn' | 'default-plot'): void {
        if (this.disposed) return;
        this.step = 'confirm';
        this.setStepIndicator(3, 'Confirm');
        // Non-blocking + keep the boundary visible, then opt into the confirm layout.
        this.setDrawingPresentation(true);
        this.overlay?.classList.add('os-onboarding-overlay--confirm');

        // §RESI-MULTIFAMILY (Task 2, 2026-06-23) — the multi-family residential building
        // needs EXPLICIT inputs the founder spec mandates (number of levels, min/max
        // apartment surface, which T1–T4 typologies). Instead of the generic one-line
        // confirm we render a compact PROGRAM panel here (prefilled with the founder
        // defaults: 5 floors, 60–100 m², T2+T3) so the flow still runs on a click-through
        // but the user can change every value before the preview/build reflects it.
        // §RESI-SETUP-AFTER-GENERATE (founder 2026-08-01, re-escalating L-435: "I don't need the
        // massive window for building residential at this stage. It should be like the apartment /
        // house workflow — the user should see first the PARCEL, then the ENVELOPE, then click
        // GENERATE BUILDING, then this screen comes.")
        //
        // The residential branch used to REPLACE the confirm card with the full-screen landscape
        // setup panel (levels · min/max apartment area · T1–T4 mix · roof · ground floor · balconies ·
        // façade colour). That front-loaded a long parameter form on a user who has not yet seen what
        // they are building on, and it demoted the L-424 "I'll design it myself" path — a first-class
        // outcome — to a footnote under a form they never asked for.
        //
        // The apartment and house typologies already do this the right way round: a COMPACT,
        // NON-BLOCKING confirm card over the live parcel + envelope ("Generate your X with AI?" /
        // "Not now — I'll design it myself"), with every parameter surface deferred until AFTER the
        // user has opted in. Residential now travels that SAME path — `renderResidentialProgramStep`
        // is reached only from the Generate button below, never before it. No third flow is invented:
        // the compact card is the existing generic one, and the setup panel is unchanged apart from
        // WHEN it opens.
        const deferToResidentialSetup = resolveGenerateRoute(this.typologyId) === 'residential-building';

        // §OFFICE-PREVIEW-STEP (founder 2026-06-30) — the office tower earns its own SETUP
        // step (like the residential building): adjustable stories / floor-to-floor / radius
        // / desk-density / culture + a LIVE circular-plate preview + analytics + a "Build
        // this tower" button. Instead of straight-to-generate-and-reject, the founder SEES
        // the feasible config (Task A clamps the slider to the plate) before building.
        //
        // §TYPOLOGY-CHOICE-AT-CONFIRM — that setup step now opens from the GENERATE button
        // below (like residential's, §RESI-SETUP-AFTER-GENERATE), not INSTEAD of the confirm
        // card. Two reasons, and they are the same reason: the user cannot choose a typology
        // at a step that was skipped for them, and C50 §14 KV-2 (L-670) records exactly this
        // shape as the un-contracted defect — "the OFFICE typology then copied [residential's
        // wrong shape]", front-loading a parameter surface before the generate opt-in. Both
        // typologies now defer their setup until after the user has seen the parcel + envelope
        // and explicitly asked to generate.
        const deferToOfficeSetup = this.isOfficeTypology();

        const body = this.clearBody();

        console.log(`[onboarding-step] confirm step (source="${source}", typology="${this.typologyId}").`);

        // ── §TYPOLOGY-CHOICE-AT-CONFIRM — the chooser ────────────────────────────
        // The founder's ask (2026-08-07): let the user CHOOSE what to build at this
        // moment, instead of inheriting the silent `'apartment'` default that
        // `resolveSeededTypologyId` stamps for the no-modal "+ New Project" gesture.
        // Options come from the REGISTRY (C50 §5.3 — registry-driven, never a
        // hard-coded list), filtered to those with a wired generator so no entry can
        // silently no-op. When only one typology is offerable the chooser is omitted
        // entirely rather than rendering a single dead radio.
        const choices = this.offerableTypologies();
        if (choices.length > 1) {
            body.appendChild(this.buildTypologyChooser(choices, source));
        }
        // §CONFIRM-PANEL-UX (C43) — selecting a chip re-renders this whole step, which
        // destroys the element that had focus. Restore it onto the newly checked chip
        // so keyboard selection can continue; only ever set by the chooser itself, so a
        // fresh confirm step never steals focus from the map.
        const restoreFocusTo = this.pendingChooserFocus;
        this.pendingChooserFocus = null;
        if (restoreFocusTo) {
            const chip = body.querySelector<HTMLElement>(`[data-typology-id="${CSS.escape(restoreFocusTo)}"]`);
            chip?.focus();
        }

        const typology = this.typologyLabel();

        // §CONFIRM-PANEL-UX — title / body / CTA are DERIVED from the chosen route by
        // one pure function, so the three can never describe different buildings. The
        // body line used to be hard-coded to "rooms, walls, doors and windows", i.e. an
        // apartment, on a card that can now generate a house, a residential building or
        // an office tower. See `confirmCopyFor`'s block comment.
        const copy = confirmCopyFor(resolveGenerateRoute(this.typologyId), typology, source);

        const title = document.createElement('p');
        title.className = 'os-prompt';
        title.textContent = copy.title;
        title.setAttribute('data-testid', 'onboarding-confirm-title');
        body.appendChild(title);

        const sub = document.createElement('p');
        sub.className = 'os-hint';
        sub.textContent = copy.body;
        sub.setAttribute('data-testid', 'onboarding-confirm-body');
        body.appendChild(sub);

        // The zoning advisory for the CURRENT choice. Advisory only — see
        // `zoningAdvisoryFor`'s block comment for the C58 §10.2 justification.
        const advisory = this.zoningAdvisory(choices);
        if (advisory && advisory.kind !== 'permitted') {
            const note = document.createElement('p');
            note.className = advisory.kind === 'conflict' ? 'os-hint os-hint--warn' : 'os-hint os-hint--muted';
            note.setAttribute('data-testid', `onboarding-confirm-zoning-${advisory.kind}`);
            note.textContent = advisory.message;
            body.appendChild(note);
        }

        const actions = document.createElement('div');
        actions.className = 'os-confirm-actions';

        const generate = document.createElement('button');
        generate.type = 'button';
        generate.className = 'os-btn os-btn--primary';
        generate.setAttribute('data-testid', 'onboarding-confirm-generate');
        generate.textContent = copy.cta;

        const notNow = document.createElement('button');
        notNow.type = 'button';
        notNow.className = 'os-btn os-btn--ghost';
        notNow.setAttribute('data-testid', 'onboarding-confirm-notnow');
        notNow.textContent = `Not now — I'll design it myself`;

        // §L-384 — BACK: return to re-draw (drawn) / plot choice (default), clearing the
        // immutable C19 boundary first (clear-then-recreate, never a mutation).
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'os-btn os-btn--ghost';
        back.setAttribute('data-testid', 'onboarding-confirm-back');
        back.textContent = source === 'drawn' ? '← Back to drawing' : '← Back';
        back.addEventListener('click', () => this.backFromConfirm(source));

        // §CONFIRM-PANEL-UX — the primary CTA takes its own full-width row; the two
        // EXITS share the row beneath it. Previously all three sat in one wrapping row
        // at equal weight, which forced the card to be as wide as the longest label
        // ("Not now — I'll design it myself") — most of why it was 560px. Both exits
        // keep their full wording: the founder's constraint is fewer WORDS, not less
        // clarity, and "I'll design it myself" is a first-class outcome (§L-424), so it
        // is de-emphasised in weight, never in legibility.
        //
        // DOM order IS the tab order: Generate → Back → Not now. The action the user
        // most likely wants comes first after the chooser.
        actions.appendChild(generate);
        const exits = document.createElement('div');
        exits.className = 'os-confirm-exits';
        exits.appendChild(back);
        exits.appendChild(notNow);
        actions.appendChild(exits);
        body.appendChild(actions);

        generate.addEventListener('click', () => {
            // §RESI-SETUP-AFTER-GENERATE — residential opens its SETUP panel here, AFTER the user has
            // seen the parcel + envelope and explicitly asked to generate. Every other typology goes
            // straight to the generator, exactly as before.
            if (deferToResidentialSetup) {
                console.log('[onboarding-step] confirm → GENERATE BUILDING — opening the residential setup step.');
                this.renderResidentialProgramStep(source);
                return;
            }
            // §TYPOLOGY-CHOICE-AT-CONFIRM — the office tower's setup step, now reached
            // only from this opt-in (see `deferToOfficeSetup` above).
            if (deferToOfficeSetup) {
                console.log('[onboarding-step] confirm → GENERATE TOWER — opening the office setup step.');
                this.renderOfficeProgramStep(source);
                return;
            }
            console.log('[onboarding-step] confirm → GENERATE (AI dispatch).');
            this.overlay?.classList.remove('os-onboarding-overlay--confirm');
            void this.generateAndFinish();
        });
        notNow.addEventListener('click', () => {
            // §L-424 (founder live-traced) — "I'll design it myself" must LAND THE USER IN THE
            // PRYZM CANVAS, not just dispose the overlay (which stranded them on the 2D-map +
            // Cesium site split — "on continue doesn't really continue to pryzm view yet").
            // `landInCanvasWithUnderlay` runs the SAME tested transition Generate uses
            // (close map → exit GIS / unmount the site split → BIM 3D + plan view, framed on the
            // plot) but WITHOUT generating — so the user arrives in the editor with the parcel
            // boundary + buildable-envelope volume already drawn as design guides
            // (ParcelBoundarySceneRenderer, both 3D + plan), the site/boundary intact, ready to author.
            console.log('[onboarding-step] confirm → NOT NOW — landing in the PRYZM canvas (boundary + envelope guides), no generate.');
            this.toast('Your plot + buildable envelope are in the canvas — design away, or generate any time from the AI panel.', 'info');
            void this.landInCanvasWithUnderlay();
        });
    }

    /**
     * §TYPOLOGY-CHOICE-AT-CONFIRM — the typologies this flow can actually BUILD.
     *
     * Registry-driven per C50 §5.3 (never a hard-coded list, so a fifth pack appears
     * by registering), then filtered by `resolveGenerateRoute` so an offered card
     * always has a generator behind it. If the registry is unreachable we fall back to
     * the CURRENT typology alone — degrading to "no choice" is safe; inventing options
     * we cannot build is not.
     */
    private offerableTypologies(): readonly TypologyChoice[] {
        try {
            const packs = this.runtime?.typology?.registry?.list?.() ?? [];
            const choices = buildTypologyChoices(packs.map((p) => p.manifest));
            if (choices.length > 0) return choices;
        } catch (err) {
            console.warn('[onboarding-step] typology registry unavailable for the chooser (non-fatal):', err);
        }
        return [];
    }

    /**
     * §TYPOLOGY-CHOICE-AT-CONFIRM — the radio-card chooser. Selecting re-renders the
     * confirm step so the title, the CTA and the zoning advisory all follow the choice
     * (the copy must stop hard-coding "apartment").
     */
    private buildTypologyChooser(
        choices: readonly TypologyChoice[],
        source: 'drawn' | 'default-plot',
    ): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'os-typology-choices';
        wrap.setAttribute('role', 'radiogroup');
        wrap.setAttribute('aria-label', 'What do you want to build?');
        wrap.setAttribute('data-testid', 'onboarding-typology-chooser');

        // §CONFIRM-PANEL-UX — a compact uppercase section label, the same one the
        // office analytics and the residential views rail already use, instead of a
        // full-size sentence. It reads as chrome, and it costs one line instead of two.
        const lead = document.createElement('p');
        lead.className = 'os-section-label';
        lead.textContent = 'What do you want to build?';
        wrap.appendChild(lead);

        const row = document.createElement('div');
        row.className = 'os-typology-choices__row';

        const selectedIndex = Math.max(
            0,
            choices.findIndex((c) => c.id === this.typologyId
                || resolveGenerateRoute(c.id) === resolveGenerateRoute(this.typologyId)),
        );

        const choose = (index: number): void => {
            const next = choices[index];
            if (!next || next.id === this.typologyId) return;
            this.setTypology(next.id);
            // Re-render the whole confirm step: copy, CTA and advisory are all
            // functions of the choice, so re-deriving beats patching three nodes.
            // The re-render destroys the focused button, so remember which chip must
            // regain focus — a keyboard user who loses focus to <body> mid-selection
            // has to tab the whole card again, which is the practical failure the
            // arrow keys were added to prevent.
            this.pendingChooserFocus = next.id;
            this.renderGenerateConfirmStep(source);
        };

        choices.forEach((choice, index) => {
            const selected = index === selectedIndex;

            const card = document.createElement('button');
            card.type = 'button';
            card.className = `os-typology-choice${selected ? ' os-typology-choice--selected' : ''}`;
            card.setAttribute('role', 'radio');
            card.setAttribute('aria-checked', selected ? 'true' : 'false');
            // C43 / WAI-ARIA radiogroup: the GROUP is one tab stop. Only the checked
            // radio is tabbable; the rest are reached with the arrow keys below. The
            // previous four-tab-stops shape contradicted the role it declared.
            card.tabIndex = selected ? 0 : -1;
            card.setAttribute('data-typology-id', choice.id);
            card.setAttribute('data-testid', `onboarding-typology-${choice.id}`);
            // The pack's full catalogue name stays reachable on hover / to AT, while
            // the visible chip carries the short label the small card can hold.
            card.title = choice.label;
            card.setAttribute('aria-label', choice.label);

            const name = document.createElement('span');
            name.className = 'os-typology-choice__label';
            name.textContent = choice.chooserLabel;
            card.appendChild(name);

            card.addEventListener('click', () => choose(index));
            card.addEventListener('keydown', (ev: KeyboardEvent) => {
                const target = nextChoiceIndex(index, ev.key, choices.length);
                if (target === null) return; // not ours — leave Tab/Enter/Space alone
                ev.preventDefault();
                if (target === selectedIndex) {
                    // Already the selection: no re-render, just move focus.
                    (row.children[target] as HTMLElement | undefined)?.focus();
                    return;
                }
                choose(target);
            });

            row.appendChild(card);
        });

        wrap.appendChild(row);
        return wrap;
    }

    /**
     * §TYPOLOGY-CHOICE-AT-CONFIRM — the zoning advisory for the current choice, read
     * from the SOLVED envelope (`getLastBuildableEnvelope`) rather than any number this
     * UI computes itself. Returns null when we cannot even name the choice's category.
     */
    private zoningAdvisory(choices: readonly TypologyChoice[]): ReturnType<typeof zoningAdvisoryFor> | null {
        const current = choices.find((c) => c.id === this.typologyId);
        if (!current) return null;
        try {
            const envelope = getLastBuildableEnvelope();
            return zoningAdvisoryFor(
                current.category,
                envelope ? { permittedUse: envelope.permittedUse } : null,
            );
        } catch (err) {
            console.warn('[onboarding-step] zoning advisory unavailable (non-fatal):', err);
            return null;
        }
    }

    /**
     * §RESI-MULTIFAMILY (Task 2) — the residential-building PROGRAM step (the founder
     * spec's explicit inputs). Replaces the generic confirm for the
     * `residential-multifamily` typology: the user sets NUMBER OF LEVELS (1–20), MIN +
     * MAX apartment surface (m²) and which TYPOLOGIES are wanted (T1–T4), then Generate.
     *
     * Prefilled with the founder defaults (5 floors, 60–100 m², T2 + T3) so a click-
     * through still runs; whatever the user changes is written into `this.briefMetadata`
     * (the SAME field ids `residentialRequestFromBrief` reads: floors / minApartmentAreaM2
     * / maxApartmentAreaM2 / T1..T4) BEFORE the generate, so the orchestrator + preview +
     * build all honour the inputs. Validated minimally (clamps + min ≤ max + ≥1 typology).
     */
    private renderResidentialProgramStep(source: 'drawn' | 'default-plot'): void {
        if (this.disposed) return;
        const body = this.clearBody();
        console.log(`[onboarding-step] residential program step (source="${source}").`);

        // §RESI-LANDSCAPE-MODAL (founder 2026-06-27) — the residential setup is the ONE
        // step that earns a wide LANDSCAPE layout (left "levels/views" rail · large central
        // plan preview · right controls), mirroring the residential-HOUSE preview modal.
        // `--resi` widens the docked card + switches the body to the 3-column grid (CSS);
        // it is removed on every exit (generate / not-now) so the slim banner returns for
        // the other steps. Behaviour-neutral: the same form/inputs/handlers, re-grouped.
        this.overlay?.classList.add('os-onboarding-overlay--resi');

        // Seed from any captured brief value, else the founder defaults.
        const num = (v: unknown, dflt: number): number => {
            const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
            return Number.isFinite(n) && n > 0 ? n : dflt;
        };
        const md = this.briefMetadata;
        const seedFloors = Math.max(1, Math.min(20, Math.round(num(md['floors'] ?? md['levels'] ?? md['upperLevels'], 5))));
        const seedMin = num(md['minApartmentAreaM2'] ?? md['minAreaM2'], 60);
        const seedMax = num(md['maxApartmentAreaM2'] ?? md['maxAreaM2'], 100);
        const seedT = (k: string, dflt: boolean): boolean => {
            const raw = md[k];
            if (typeof raw === 'boolean') return raw;
            if (typeof raw === 'string') { const s = raw.trim().toLowerCase(); if (s === 'true' || s === 'yes' || s === '1') return true; if (s === 'false' || s === 'no' || s === '0') return false; }
            return dflt;
        };

        const title = document.createElement('p');
        title.className = 'os-prompt';
        title.textContent = 'Set up your residential building';
        title.setAttribute('data-testid', 'onboarding-resi-title');
        body.appendChild(title);

        const hint = document.createElement('p');
        hint.className = 'os-hint';
        hint.textContent = source === 'drawn'
            ? 'Choose how many floors, the apartment size band, and which apartment types to mix into the plot you drew.'
            : 'Choose how many floors, the apartment size band, and which apartment types to mix.';
        body.appendChild(hint);

        const form = document.createElement('form');
        form.className = 'os-resi-form';

        // Helper to build a labelled number input row.
        const numberField = (label: string, testId: string, value: number, min: number, max: number, step: number): HTMLInputElement => {
            const row = document.createElement('label');
            row.className = 'os-field';
            const cap = document.createElement('span');
            cap.className = 'os-field-label';
            cap.textContent = label;
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'os-input';
            input.setAttribute('data-testid', testId);
            input.value = String(value);
            input.min = String(min); input.max = String(max); input.step = String(step);
            row.appendChild(cap); row.appendChild(input);
            form.appendChild(row);
            return input;
        };

        // §RESI-LIVE-SLIDERS (founder 2026-06-23) — slider-driven setup: drag the apartment size
        // band and the value updates LIVE next to its label. The apartment SIZE drives the resulting
        // apartment count + typology fit, so sliders give the founder the live "change the sqm and the
        // layout follows" feel. (A debounced live LAYOUT preview re-running the pure orchestrator on
        // input is the next slice; this lands the slider UX + live value first.) The data-testids +
        // `.value` semantics are unchanged from the number inputs, so the generate handler + any tests
        // read them identically.
        const sliderField = (label: string, testId: string, value: number, min: number, max: number, step: number, unit: string): HTMLInputElement => {
            const row = document.createElement('label');
            row.className = 'os-field os-field--slider';
            const head = document.createElement('span');
            head.className = 'os-field-head';
            const cap = document.createElement('span');
            cap.className = 'os-field-label';
            cap.textContent = label;
            const val = document.createElement('span');
            val.className = 'os-field-value';
            val.setAttribute('data-testid', `${testId}-value`);
            val.textContent = `${value}${unit}`;
            head.appendChild(cap);
            head.appendChild(val);
            const input = document.createElement('input');
            input.type = 'range';
            input.className = 'os-input os-slider';
            input.setAttribute('data-testid', testId);
            input.value = String(value);
            input.min = String(min); input.max = String(max); input.step = String(step);
            // Live value readout as the user drags. (The debounced layout re-generate hooks here too.)
            input.addEventListener('input', () => { val.textContent = `${input.value}${unit}`; });
            row.appendChild(head); row.appendChild(input);
            form.appendChild(row);
            return input;
        };

        const floorsInput = numberField('Number of levels (1–20)', 'onboarding-resi-floors', seedFloors, 1, 20, 1);
        const minInput = sliderField('Min apartment surface', 'onboarding-resi-min', seedMin, 20, 400, 5, ' m²');
        const maxInput = sliderField('Max apartment surface', 'onboarding-resi-max', seedMax, 20, 400, 5, ' m²');

        // Typology toggle chips (T1–T4).
        const typoWrap = document.createElement('div');
        typoWrap.className = 'os-field';
        const typoLabel = document.createElement('span');
        typoLabel.className = 'os-field-label';
        typoLabel.textContent = 'Apartment types (pick one or more)';
        typoWrap.appendChild(typoLabel);
        const chips = document.createElement('div');
        chips.className = 'os-typo-chips';
        const typoDefs: Array<{ key: 'T1' | 'T2' | 'T3' | 'T4'; label: string; on: boolean }> = [
            { key: 'T1', label: 'T1 · studio/1-bed', on: seedT('T1', false) },
            { key: 'T2', label: 'T2 · 2-bed', on: seedT('T2', true) },
            { key: 'T3', label: 'T3 · 3-bed', on: seedT('T3', true) },
            { key: 'T4', label: 'T4 · 4-bed', on: seedT('T4', false) },
        ];
        const typoState: Record<'T1' | 'T2' | 'T3' | 'T4', boolean> = { T1: typoDefs[0]!.on, T2: typoDefs[1]!.on, T3: typoDefs[2]!.on, T4: typoDefs[3]!.on };
        for (const def of typoDefs) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'os-typo-chip' + (def.on ? ' os-typo-chip--on' : '');
            chip.setAttribute('data-testid', `onboarding-resi-${def.key.toLowerCase()}`);
            chip.setAttribute('aria-pressed', String(def.on));
            chip.textContent = def.label;
            chip.addEventListener('click', () => {
                typoState[def.key] = !typoState[def.key];
                chip.classList.toggle('os-typo-chip--on', typoState[def.key]);
                chip.setAttribute('aria-pressed', String(typoState[def.key]));
            });
            chips.appendChild(chip);
        }
        typoWrap.appendChild(chips);
        form.appendChild(typoWrap);

        // §RESI-PREVIEW-OPTIONS (founder 2026-06-24) — roof / ground-floor commercial / façade
        // colour / balconies. Default: flat roof, big commercial windows, white façade, balconies on.
        let roofGardenOn = false;
        let commercialCurtain = false;          // false ⇒ big commercial windows (the default)
        let balconiesOn = true;
        let facadeColor = DEFAULT_FACADE_HEX;   // §BUILDING-PREVIEW-MODULAR — shared palette head (warm white)
        const singleSelect = (
            labelText: string,
            opts: Array<{ key: string; label: string; on: boolean }>,
            onPick: (key: string) => void,
        ): void => {
            const wrap = document.createElement('div');
            wrap.className = 'os-field';
            const lbl = document.createElement('span');
            lbl.className = 'os-field-label';
            lbl.textContent = labelText;
            wrap.appendChild(lbl);
            const row = document.createElement('div');
            row.className = 'os-typo-chips';
            for (const o of opts) {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'os-typo-chip' + (o.on ? ' os-typo-chip--on' : '');
                chip.textContent = o.label;
                chip.setAttribute('aria-pressed', String(o.on));
                chip.addEventListener('click', () => {
                    row.querySelectorAll('button').forEach((b) => { b.classList.remove('os-typo-chip--on'); b.setAttribute('aria-pressed', 'false'); });
                    chip.classList.add('os-typo-chip--on');
                    chip.setAttribute('aria-pressed', 'true');
                    onPick(o.key);
                });
                row.appendChild(chip);
            }
            wrap.appendChild(row);
            form.appendChild(wrap);
        };
        singleSelect('Roof', [
            { key: 'flat', label: 'Flat roof', on: true },
            { key: 'garden', label: 'Roof garden', on: false },
        ], (k) => { roofGardenOn = k === 'garden'; });
        singleSelect('Ground floor', [
            { key: 'windows', label: 'Commercial windows', on: true },
            { key: 'curtain', label: 'Curtain wall', on: false },
        ], (k) => { commercialCurtain = k === 'curtain'; });
        singleSelect('Balconies', [
            { key: 'yes', label: 'Yes', on: true },
            { key: 'no', label: 'No', on: false },
        ], (k) => { balconiesOn = k === 'yes'; });
        // Façade colour — Notting-Hill pastel swatches (default warm white).
        const colourWrap = document.createElement('div');
        colourWrap.className = 'os-field';
        const colourLbl = document.createElement('span');
        colourLbl.className = 'os-field-label';
        colourLbl.textContent = 'Façade colour';
        colourWrap.appendChild(colourLbl);
        const swatchRow = document.createElement('div');
        // §BUILDING-PREVIEW-MODULAR — the façade swatch row wraps to multiple rows for the
        // expanded (~21) pastel palette; `os-swatch-row` lays them out in a flowing wrap.
        swatchRow.className = 'os-typo-chips os-swatch-row';
        // §BUILDING-PREVIEW-MODULAR — the façade palette is the SHARED, building-type-agnostic
        // set (single source of truth in the preview-kit), so house / residential / every future
        // typology offer the same ~21 tasteful pastels. The original 7 lead so existing picks resolve.
        for (const p of FACADE_PALETTE) {
            const sw = document.createElement('button');
            sw.type = 'button';
            sw.className = 'os-swatch' + (p.hex === facadeColor ? ' os-swatch--on' : '');
            sw.style.background = p.hex;
            sw.title = p.name;
            sw.setAttribute('aria-label', p.name);
            sw.addEventListener('click', () => {
                swatchRow.querySelectorAll('button').forEach((b) => b.classList.remove('os-swatch--on'));
                sw.classList.add('os-swatch--on');
                facadeColor = p.hex;
            });
            swatchRow.appendChild(sw);
        }
        colourWrap.appendChild(swatchRow);
        form.appendChild(colourWrap);

        const status = document.createElement('p');
        status.className = 'os-status';
        status.setAttribute('data-testid', 'onboarding-resi-status');
        status.hidden = true;
        form.appendChild(status);

        const actions = document.createElement('div');
        actions.className = 'os-confirm-actions';
        const generate = document.createElement('button');
        generate.type = 'submit';
        generate.className = 'os-btn os-btn--primary';
        generate.setAttribute('data-testid', 'onboarding-resi-generate');
        generate.textContent = 'Generate residential building';
        const notNow = document.createElement('button');
        notNow.type = 'button';
        notNow.className = 'os-btn os-btn--ghost';
        notNow.setAttribute('data-testid', 'onboarding-resi-notnow');
        notNow.textContent = `Not now — I'll design it myself`;
        // §RESI-SETUP-AFTER-GENERATE — this panel now sits AFTER the confirm card, so BACK returns to
        // that card (parcel + envelope still on screen) instead of discarding the drawn boundary and
        // dropping the user back into the draw tool. Re-drawing is still one more click from there
        // (the confirm card keeps its own §L-384 "Back to drawing").
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'os-btn os-btn--ghost';
        back.setAttribute('data-testid', 'onboarding-resi-back');
        back.textContent = '← Back';
        back.addEventListener('click', () => {
            this.overlay?.classList.remove('os-onboarding-overlay--resi');
            this.renderGenerateConfirmStep(source);
        });
        actions.appendChild(back);
        actions.appendChild(generate);
        actions.appendChild(notNow);
        form.appendChild(actions);

        // §RESI-LANDSCAPE-MODAL — assemble the three landscape columns:
        //   LEFT  — "Views / levels" rail (level label + per-floor distribution chips).
        //   CENTER — the large plan preview (the `preview` div, populated below).
        //   RIGHT  — the controls `form` (built above, unchanged).
        // CSS (`os-resi-layout`) lays these out side-by-side on a wide card and collapses
        // to a single column on a narrow viewport, so the form/preview wiring is untouched.
        const layout = document.createElement('div');
        layout.className = 'os-resi-layout';

        const views = document.createElement('aside');
        views.className = 'os-resi-views';
        views.setAttribute('data-testid', 'onboarding-resi-views');
        const viewsHead = document.createElement('div');
        viewsHead.className = 'os-resi-views-head';
        viewsHead.textContent = 'Views';
        views.appendChild(viewsHead);
        const viewsList = document.createElement('div');
        viewsList.className = 'os-resi-views-list';
        viewsList.setAttribute('data-testid', 'onboarding-resi-views-list');
        views.appendChild(viewsList);

        const stage = document.createElement('div');
        stage.className = 'os-resi-stage';

        // §RESI-LIVE-SLIDERS (2/2) — LIVE LAYOUT PREVIEW. On every slider / typology / floor change,
        // debounce-run the PURE orchestrator on the drawn footprint and show the resulting apartment
        // COUNT + typology MIX + net area, so the founder sees the layout FOLLOW the sliders in real
        // time. Display-only — NO scene mutation (mirrors the controller's P3/P6 preview rule); the real
        // build still happens on submit. The orchestrator is pure + fast (ms), so a 180 ms debounce keeps
        // dragging smooth. Core/corridor use the controller's defaults (6×4 m core, 1.5 m corridor) so the
        // live count MATCHES the committed build.
        const preview = document.createElement('div');
        preview.className = 'os-resi-preview';
        preview.setAttribute('data-testid', 'onboarding-resi-preview');
        stage.appendChild(preview);

        // §RESI-LANDSCAPE-MODAL — commit the three columns: views (left) · stage (centre) ·
        // form (right). Done here (after `preview`/`stage` exist) so the form stays the
        // last column; the body now hosts ONE landscape grid instead of a tall stack.
        layout.appendChild(views);
        layout.appendChild(stage);
        layout.appendChild(form);
        body.appendChild(layout);

        const numV = (v: string, d: number): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };

        // §RESI-PER-LEVEL-PREVIEW (founder 2026-06-28) — clicking a Views-rail chip drives the
        // CENTRE preview to THAT level's plan + caption + unit-count. The orchestrator OK result
        // (and its card model) are cached here so a chip click re-renders the preview INSTANTLY
        // (no re-run); a slider/typology/floor change re-runs the orchestrator and refreshes the
        // cache. `selectedLevelIndex === null` ⇒ track the representative pick (engine default).
        // The index is the position into `result.levels` / `card.floors` (orchestrator-aligned).
        let lastResult: ResidentialBuildingOk | null = null;
        let lastCard: ResidentialCardModel | null = null;
        let selectedLevelIndex: number | null = null;

        /** §RESI-LANDSCAPE-MODAL — paint the LEFT "Views / levels" rail from the live result:
         *  one CLICKABLE chip per floor (label + unit count); the SELECTED level is highlighted.
         *  Rebuilt on every live re-render so it tracks the sliders; click handlers are re-bound
         *  here (innerHTML replace drops the old ones). */
        const renderViewsRail = (card: ResidentialCardModel | null, activeIndex: number): void => {
            if (!card) { viewsList.innerHTML = `<span class="os-resi-views-empty">Draw a plot to preview floors.</span>`; return; }
            const rows: string[] = [];
            for (let i = 0; i < card.floors.length; i++) {
                const f = card.floors[i]!;
                const placed = f.apartments.filter(a => a.status === 'ok').length;
                const isActive = i === activeIndex;
                const meta = f.role === 'ground'
                    ? (f.commercialGroundFloor ? 'Commercial · core' : 'Lobby · core')
                    : `${placed} unit${placed === 1 ? '' : 's'}`;
                rows.push(
                    `<button type="button" class="os-resi-view-chip${isActive ? ' os-resi-view-chip--on' : ''}" ` +
                    `data-level="${i}" aria-pressed="${isActive ? 'true' : 'false'}">` +
                    `<span class="os-resi-view-chip-label">${this.escResi(f.label)}</span>` +
                    `<span class="os-resi-view-chip-meta">${this.escResi(meta)}</span></button>`,
                );
            }
            viewsList.innerHTML = rows.join('') || `<span class="os-resi-views-empty">No floors yet.</span>`;
            // Re-bind chip clicks: select that level → re-render the preview for it (no re-run).
            viewsList.querySelectorAll('button.os-resi-view-chip').forEach((b) => {
                b.addEventListener('click', () => {
                    const idx = Number((b as HTMLElement).dataset['level']);
                    if (!Number.isInteger(idx)) return;
                    selectedLevelIndex = idx;
                    console.log('[onboarding-step] §RESI-PER-LEVEL-PREVIEW: views chip →', idx);
                    if (lastResult && lastCard) renderPreviewForLevel(lastResult, lastCard, idx);
                });
            });
        };

        /** §RESI-PER-LEVEL-PREVIEW — render the CENTRE preview + caption + unit-count line for a
         *  SPECIFIC level of an already-computed result. The building TOTALS (whole-building apt
         *  count / net area / floor count) stay constant; the per-level line + plan track the
         *  selected floor. Re-highlights the rail to match. */
        const renderPreviewForLevel = (result: ResidentialBuildingOk, card: ResidentialCardModel, levelIndex: number): void => {
            const idx = Math.max(0, Math.min(card.floors.length - 1, levelIndex));
            const floor = card.floors[idx];
            const plan = buildResidentialPlanSvg(result, { targetPx: 460, levelIndex: idx });
            const placed = floor ? floor.apartments.filter(a => a.status === 'ok').length : 0;
            // Per-level line: ground = its commercial/core role; upper = its placed unit count.
            const levelLine = floor && floor.role === 'ground'
                ? (floor.commercialGroundFloor ? 'Commercial ground floor · core' : 'Lobby · core')
                : `${placed} apartment${placed === 1 ? '' : 's'} on this floor`;
            const mix = new Map<string, number>();
            for (const f of card.floors) for (const a of f.apartments) if (a.status === 'ok') mix.set(a.typology, (mix.get(a.typology) ?? 0) + 1);
            const mixStr = [...mix.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, n]) => `${t}×${n}`).join(' · ') || '—';
            const aptWord = card.totalApartments === 1 ? 'apartment' : 'apartments';
            const flrWord = card.upperLevels === 1 ? 'floor' : 'floors';
            const caption = plan.levelLabel || (floor ? floor.label : '');
            // §RESI-CIRC-GRAPH — the floor's circulation bubble graph (core hub + one node per
            // apartment, each edged to the core), shown BELOW the plan. CONSUME-ONLY of the shared
            // bubble renderer (the house modal's Living-Graph language). Empty on a no-apartment floor.
            let graphHtml = '';
            try {
                const graph = buildResidentialCirculationGraphSvg(result, { levelIndex: idx });
                if (graph.svg) {
                    graphHtml =
                        `<div class="os-resi-preview-graph">` +
                        `<div class="os-resi-preview-graph-head">Circulation · core + ${graph.nodeCount} unit${graph.nodeCount === 1 ? '' : 's'}</div>` +
                        `<div class="os-resi-preview-graph-svg">${graph.svg}</div></div>`;
                }
            } catch (e) {
                console.warn('[onboarding-step] §RESI-CIRC-GRAPH render failed (non-fatal):', e);
            }
            preview.innerHTML =
                (plan.svg ? `<div class="os-resi-preview-plan">${plan.svg}</div>` +
                    `<div class="os-resi-preview-caption">${this.escResi(caption)} · ${this.escResi(levelLine)}</div>` : ``) +
                graphHtml +
                `<div class="os-resi-preview-head"><strong>${card.totalApartments}</strong> ${aptWord} · ` +
                `<strong>${Math.round(card.totalNetAreaM2)}</strong> m² net · <strong>${card.upperLevels}</strong> residential ${flrWord}</div>` +
                `<div class="os-resi-preview-mix">${mixStr}</div>` +
                (card.totalRejected > 0 ? `<div class="os-resi-preview-warn">${card.totalRejected} unit(s) didn't fit — try a larger size band or fewer types</div>` : ``);
            renderViewsRail(card, idx);
        };

        const renderLivePreview = (): void => {
            const footprint = this.readParcelFootprint();
            if (!footprint) { preview.innerHTML = `<span class="os-resi-preview-hint">Draw a plot to preview the layout.</span>`; lastResult = null; lastCard = null; renderViewsRail(null, -1); return; }
            let minM2 = numV(minInput.value, seedMin);
            let maxM2 = numV(maxInput.value, seedMax);
            if (maxM2 < minM2) { const t = minM2; minM2 = maxM2; maxM2 = t; }
            const floors = Math.max(1, Math.min(20, Math.round(numV(floorsInput.value, seedFloors))));
            if (!(typoState.T1 || typoState.T2 || typoState.T3 || typoState.T4)) {
                preview.innerHTML = `<span class="os-resi-preview-hint">Pick at least one apartment type to preview.</span>`; lastResult = null; lastCard = null; renderViewsRail(null, -1); return;
            }
            try {
                const result = orchestrateResidentialBuilding({
                    footprint,
                    upperLevels: floors,
                    coreWidthM: 6, coreDepthM: 4, corridorWidthM: 1.5,
                    minApartmentAreaM2: minM2,
                    maxApartmentAreaM2: maxM2,
                    typologies: { T1: typoState.T1, T2: typoState.T2, T3: typoState.T3, T4: typoState.T4 },
                });
                if (result.status !== 'ok') {
                    // §L-435 — a dead end that says only "try something else" is a refusal, not
                    // guidance. The orchestrator ALREADY returns a soft-fail `reason` (C50 §1.7)
                    // and the UI was discarding it. Surface the real reason, then PROBE for the
                    // nearest setting that does fit and offer it as one click.
                    const nearest = findNearestFeasibleResi({
                        footprint, floors, minM2, maxM2,
                        typologies: { T1: typoState.T1, T2: typoState.T2, T3: typoState.T3, T4: typoState.T4 },
                    });
                    const why = this._escapeHtml(result.reason || 'this combination does not fit the plot');
                    preview.innerHTML =
                        `<span class="os-resi-preview-hint"><strong>No layout fits.</strong> ${why}`
                        + (nearest
                            ? ` <button type="button" class="os-inline-fix" data-testid="onboarding-resi-nearest-fix">`
                              + `Use ${this._escapeHtml(nearest.label)}</button>`
                            : ' Try a larger size band or fewer floors.')
                        + `</span>`;
                    if (nearest) {
                        preview.querySelector<HTMLButtonElement>('[data-testid="onboarding-resi-nearest-fix"]')
                            ?.addEventListener('click', () => {
                                floorsInput.value = String(nearest.floors);
                                minInput.value = String(nearest.minM2);
                                maxInput.value = String(nearest.maxM2);
                                renderLivePreview();
                            });
                    }
                    lastResult = null; lastCard = null; renderViewsRail(null, -1); return;
                }
                const card = buildResidentialCardModel(result);
                lastResult = result;
                lastCard = card;
                // §RESI-PER-LEVEL-PREVIEW — keep the user's selected floor across slider changes when
                // it still exists; otherwise fall back to the representative pick (selectedLevelIndex
                // stays null so the preview tracks the engine default).
                let activeIndex: number;
                if (selectedLevelIndex !== null && selectedLevelIndex < card.floors.length) {
                    activeIndex = selectedLevelIndex;
                } else {
                    selectedLevelIndex = null;
                    // Render once to discover the representative level, then highlight it in the rail.
                    const probe = buildResidentialPlanSvg(result, { targetPx: 1 });
                    activeIndex = card.floors.findIndex(f => f.label === probe.levelLabel);
                    if (activeIndex < 0) activeIndex = Math.max(0, card.floors.length - 1);
                }
                renderPreviewForLevel(result, card, activeIndex);
            } catch (err) {
                preview.innerHTML = `<span class="os-resi-preview-hint">Live preview unavailable.</span>`;
                lastResult = null; lastCard = null;
                renderViewsRail(null, -1);
                console.warn('[onboarding-step] residential live preview threw (non-fatal):', err);
            }
        };
        let previewTimer: ReturnType<typeof setTimeout> | undefined;
        const scheduleLivePreview = (): void => {
            if (previewTimer) clearTimeout(previewTimer);
            previewTimer = setTimeout(renderLivePreview, 180);
        };
        this.addCleanup(() => { if (previewTimer) clearTimeout(previewTimer); });
        for (const el of [minInput, maxInput, floorsInput]) el.addEventListener('input', scheduleLivePreview);
        chips.querySelectorAll('button').forEach((b) => b.addEventListener('click', scheduleLivePreview));
        renderLivePreview();   // initial paint from the seeded values

        const onSubmit = (e: Event): void => {
            e.preventDefault();
            const floors = Math.max(1, Math.min(20, Math.round(num(floorsInput.value, seedFloors))));
            let minM2 = num(minInput.value, seedMin);
            let maxM2 = num(maxInput.value, seedMax);
            if (maxM2 < minM2) { const t = minM2; minM2 = maxM2; maxM2 = t; }
            const anyTypo = typoState.T1 || typoState.T2 || typoState.T3 || typoState.T4;
            if (!anyTypo) {
                status.hidden = false;
                status.textContent = 'Pick at least one apartment type (T1–T4).';
                return;
            }
            // Write the user's choices into the brief metadata the residential generator
            // reads (residentialRequestFromBrief). Floors is the UPPER-level count there
            // (1..20). The orchestrator adds the ground floor on top.
            this.briefMetadata = {
                ...this.briefMetadata,
                floors,
                minApartmentAreaM2: minM2,
                maxApartmentAreaM2: maxM2,
                T1: typoState.T1, T2: typoState.T2, T3: typoState.T3, T4: typoState.T4,
                // §RESI-PREVIEW-OPTIONS — roof / ground-floor / balconies / façade colour.
                roofGarden: roofGardenOn,
                groundCommercialCurtain: commercialCurtain,
                balconies: balconiesOn,
                facadeColor,
            };
            console.log('[onboarding-step] residential program confirmed', {
                floors, minApartmentAreaM2: minM2, maxApartmentAreaM2: maxM2, typologies: { ...typoState },
            });
            this.overlay?.classList.remove('os-onboarding-overlay--confirm');
            this.overlay?.classList.remove('os-onboarding-overlay--resi');
            void this.generateAndFinish();
        };
        form.addEventListener('submit', onSubmit);
        this.addCleanup(() => form.removeEventListener('submit', onSubmit));

        notNow.addEventListener('click', () => {
            this.overlay?.classList.remove('os-onboarding-overlay--resi');
            // §L-424 — land in the PRYZM canvas (boundary + envelope guides), not stranded on the site split.
            console.log('[onboarding-step] residential program → NOT NOW — landing in the PRYZM canvas (boundary + envelope), no generate.');
            this.toast('Your plot + buildable envelope are in the canvas — design away, or generate any time from the AI panel.', 'info');
            void this.landInCanvasWithUnderlay();
        });
    }

    /**
     * §OFFICE-PREVIEW-STEP (founder 2026-06-30) — the OFFICE-building SETUP step, the
     * sibling of `renderResidentialProgramStep`. Replaces the generic confirm for the
     * office typology: the user sets STORIES (1..feasibleMax), FLOOR-TO-FLOOR height,
     * RADIUS (derived from the drawn parcel, adjustable), DESK DENSITY and the workplace
     * CULTURE (open-plan-first / perimeter-offices-first), with a LIVE circular-plate
     * PREVIEW + the analytics panel re-rendering on every change. Task A guarantees the
     * preview is always feasible (the stories slider is capped to `maxFeasibleStoriesFor
     * Radius`), so the founder never sees a rejected config. "Build this tower" writes the
     * chosen params into `briefMetadata` (read by `generateOffice`) and runs the SAME
     * generate path. Display-only preview — NO scene mutation here (P3/P6); the executor
     * owns the build on click. Confined to the office step (coordination guard).
     */
    private renderOfficeProgramStep(source: 'drawn' | 'default-plot'): void {
        if (this.disposed) return;
        const body = this.clearBody();
        console.log(`[onboarding-step] §OFFICE-PREVIEW-STEP office setup step (source="${source}").`);
        // §OFFICE-PREVIEW-MODAL-LAYOUT — the office step rides the wide landscape card
        // (--resi widens it + resets the body to one grid) but lays its OWN two-column
        // grid (--office): LEFT = bounded plate preview + analytics table, RIGHT = the
        // controls form. Its own modifier keeps the office grid template independent of
        // the resi 3-column rail layout.
        this.overlay?.classList.add('os-onboarding-overlay--resi');
        this.overlay?.classList.add('os-onboarding-overlay--office');

        // Derive the circular radius from the drawn parcel (else the office default).
        const footprint = this.readParcelFootprint();
        const circle = deriveOfficeCircleFromParcel(footprint);
        const derivedRadiusM = Math.round(((circle?.radiusM && circle.radiusM > 0) ? circle.radiusM : OFFICE_DEFAULT_RADIUS_M) * 10) / 10;

        // Seed from any captured brief value, else the demo defaults (40 storeys clamped).
        const seedStories = resolveOfficeStoreyCount(this.briefMetadata);
        const seedFtf = 4.0;
        const seedDeskDensity = 6;
        let culture: WorkplaceCulture = 'open-plan-first';

        const title = document.createElement('p');
        title.className = 'os-prompt';
        title.textContent = 'Set up your office building';
        title.setAttribute('data-testid', 'onboarding-office-title');
        body.appendChild(title);

        const hint = document.createElement('p');
        hint.className = 'os-hint';
        hint.textContent = source === 'drawn'
            ? 'A circular tower fitted to the plot you drew. Set the height, plate radius and workplace culture — the floor plate updates live.'
            : 'A circular tower. Set the height, plate radius and workplace culture — the floor plate updates live.';
        body.appendChild(hint);

        const form = document.createElement('form');
        form.className = 'os-resi-form';

        // Live value-readout slider (mirrors the resi sliderField).
        const sliderField = (label: string, testId: string, value: number, min: number, max: number, step: number, unit: string): HTMLInputElement => {
            const row = document.createElement('label');
            row.className = 'os-field os-field--slider';
            const head = document.createElement('span');
            head.className = 'os-field-head';
            const cap = document.createElement('span');
            cap.className = 'os-field-label';
            cap.textContent = label;
            const val = document.createElement('span');
            val.className = 'os-field-value';
            val.setAttribute('data-testid', `${testId}-value`);
            val.textContent = `${value}${unit}`;
            head.appendChild(cap); head.appendChild(val);
            const input = document.createElement('input');
            input.type = 'range';
            input.className = 'os-input os-slider';
            input.setAttribute('data-testid', testId);
            input.value = String(value);
            input.min = String(min); input.max = String(max); input.step = String(step);
            input.addEventListener('input', () => { val.textContent = `${input.value}${unit}`; });
            row.appendChild(head); row.appendChild(input);
            form.appendChild(row);
            return input;
        };

        // §OFFICE-PREVIEW-STEP — the stories slider is CAPPED to the FEASIBLE max for the
        // current radius (Task A), so the preview is never infeasible. The cap follows the
        // radius slider live (a bigger plate hosts a taller tower).
        // §L-401 slice 2 — the storey cap is now the STRICTER of structural feasibility (plate
        // radius) and ZONING (the C58 envelope's height limit at this floor-to-floor). Slice 1
        // made the FOOTPRINT compliant; without this a building sits perfectly inside the
        // setbacks and still busts the height limit, so "compliant-by-construction" was only
        // half true. Capping the SLIDER (not just the output) means the user cannot author a
        // non-compliant request in the first place.
        // Returns the ENFORCEABLE storey cap. An ESTIMATED envelope never caps (it advises) —
        // the default rule pack invents `maxHeight_m: 12`, which at a 4 m office floor-to-floor
        // would silently pin every office outside real zoning data to 3 storeys and read as a
        // broken slider rather than a compliance decision.
        const zoningCapFor = (storeyHeightM: number): { cap: number; advisoryStoreys: number | null } => {
            const env = getLastBuildableEnvelope();
            const isEstimate = env?.confidence === 'estimated-ruleset';
            const r = capStoreysToEnvelope({
                requestedStoreys: seedStories,
                maxHeightM: env?.maxHeight_m ?? null,
                storeyHeightM,
                isEstimate,
            });
            // Estimated zoning NEVER constrains the control; it only annotates it.
            if (isEstimate) return { cap: Number.POSITIVE_INFINITY, advisoryStoreys: r.heightAllowedStoreys };
            return { cap: r.heightAllowedStoreys ?? Number.POSITIVE_INFINITY, advisoryStoreys: null };
        };
        const feasibleMax = Math.max(1, Math.min(
            maxFeasibleStoriesForRadius(derivedRadiusM),
            zoningCapFor(seedFtf).cap,
        ));
        const storiesInput = sliderField('Storeys', 'onboarding-office-stories', Math.min(seedStories, feasibleMax), 1, Math.max(feasibleMax, 1), 1, '');
        const radiusInput = sliderField('Plate radius', 'onboarding-office-radius', derivedRadiusM, 8, Math.max(60, Math.ceil(derivedRadiusM)), 1, ' m');
        const ftfInput = sliderField('Floor-to-floor height', 'onboarding-office-ftf', seedFtf, 3, 6, 0.1, ' m');
        const deskInput = sliderField('Desk density', 'onboarding-office-desk', seedDeskDensity, 4, 8, 1, ' /1000 sqft');

        // §L-401 slice 2 — the storey-cap REASON line (filled in by refreshPreview).
        const capHint = document.createElement('div');
        capHint.className = 'os-hint';
        capHint.setAttribute('data-testid', 'onboarding-office-storey-cap-hint');
        form.appendChild(capHint);

        // Culture toggle (open-plan-first / perimeter-offices-first).
        const cultureWrap = document.createElement('div');
        cultureWrap.className = 'os-field';
        const cultureLbl = document.createElement('span');
        cultureLbl.className = 'os-field-label';
        cultureLbl.textContent = 'Workplace culture';
        cultureWrap.appendChild(cultureLbl);
        const cultureRow = document.createElement('div');
        cultureRow.className = 'os-typo-chips';
        const cultureOpts: Array<{ key: WorkplaceCulture; label: string }> = [
            { key: 'open-plan-first', label: 'Open-plan first' },
            { key: 'perimeter-offices-first', label: 'Perimeter offices first' },
        ];
        let refreshPreview: () => void = () => { /* set below */ };
        for (const o of cultureOpts) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'os-typo-chip' + (o.key === culture ? ' os-typo-chip--on' : '');
            chip.setAttribute('data-testid', `onboarding-office-culture-${o.key}`);
            chip.setAttribute('aria-pressed', String(o.key === culture));
            chip.textContent = o.label;
            chip.addEventListener('click', () => {
                culture = o.key;
                cultureRow.querySelectorAll('button').forEach((b) => { b.classList.remove('os-typo-chip--on'); b.setAttribute('aria-pressed', 'false'); });
                chip.classList.add('os-typo-chip--on');
                chip.setAttribute('aria-pressed', 'true');
                refreshPreview();
            });
            cultureRow.appendChild(chip);
        }
        cultureWrap.appendChild(cultureRow);
        form.appendChild(cultureWrap);

        // §OFFICE-ARCH-FURNISH-SPLIT (SPEC-OFFICE-GENERATION-ENGINE §2) — the preview toggle:
        // "Architecture Only ↔ Architecture + Interior". Default = Architecture Only (the SPEC §1
        // split — architecture is the primary deliverable; furniture is Command 2). When
        // "+ Interior" is picked, Build runs the architecture THEN the furnish pass in one go.
        let withInterior = false;   // default: Architecture Only
        const interiorWrap = document.createElement('div');
        interiorWrap.className = 'os-field';
        const interiorLbl = document.createElement('span');
        interiorLbl.className = 'os-field-label';
        interiorLbl.textContent = 'Interior';
        interiorWrap.appendChild(interiorLbl);
        const interiorRow = document.createElement('div');
        interiorRow.className = 'os-typo-chips';
        const interiorOpts: Array<{ key: boolean; label: string }> = [
            { key: false, label: 'Architecture Only' },
            { key: true, label: 'Architecture + Interior' },
        ];
        for (const o of interiorOpts) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'os-typo-chip' + (o.key === withInterior ? ' os-typo-chip--on' : '');
            chip.setAttribute('data-testid', `onboarding-office-interior-${o.key ? 'on' : 'off'}`);
            chip.setAttribute('aria-pressed', String(o.key === withInterior));
            chip.textContent = o.label;
            chip.addEventListener('click', () => {
                withInterior = o.key;
                interiorRow.querySelectorAll('button').forEach((b) => { b.classList.remove('os-typo-chip--on'); b.setAttribute('aria-pressed', 'false'); });
                chip.classList.add('os-typo-chip--on');
                chip.setAttribute('aria-pressed', 'true');
            });
            interiorRow.appendChild(chip);
        }
        interiorWrap.appendChild(interiorRow);
        form.appendChild(interiorWrap);

        // §OFFICE-FACADE-GLASS-COLOUR (founder) — TWO colour pickers, mirroring the residential
        // building's §RESI-FACADE-COLOUR swatch row: a FAÇADE colour (painted on the opaque
        // shell / walls / core / roof) and a GLASS colour (the office is heavily glazed — curtain
        // walls + glazed offices — so the glass tint is user-controllable too). Both default so
        // "absent" reproduces the current look (façade warm-white, glass a light neutral blue).
        let facadeColor: string = DEFAULT_FACADE_HEX;
        let glassColor = '#9bc8e4';   // curtain-wall builder default light blue
        // §OFFICE-INNER-WALL-COLOUR (founder 2026-07-01) — a THIRD picker: the INNER-WALL colour, so
        // interior partition walls (office partitions + core/toilet partitions) can differ from the
        // façade. Default = warm white (same as the façade default) so "absent" reproduces the look.
        let innerWallColor: string = DEFAULT_FACADE_HEX;
        const swatchPicker = (
            labelText: string,
            palette: ReadonlyArray<{ hex: string; name: string }>,
            initial: string,
            onPick: (hex: string) => void,
            testId: string,
        ): void => {
            const wrap = document.createElement('div');
            wrap.className = 'os-field';
            const lbl = document.createElement('span');
            lbl.className = 'os-field-label';
            lbl.textContent = labelText;
            wrap.appendChild(lbl);
            const row = document.createElement('div');
            row.className = 'os-typo-chips os-swatch-row';
            row.setAttribute('data-testid', testId);
            for (const p of palette) {
                const sw = document.createElement('button');
                sw.type = 'button';
                sw.className = 'os-swatch' + (p.hex === initial ? ' os-swatch--on' : '');
                sw.style.background = p.hex;
                sw.title = p.name;
                sw.setAttribute('aria-label', p.name);
                sw.addEventListener('click', () => {
                    row.querySelectorAll('button').forEach((b) => b.classList.remove('os-swatch--on'));
                    sw.classList.add('os-swatch--on');
                    onPick(p.hex);
                });
                row.appendChild(sw);
            }
            wrap.appendChild(row);
            form.appendChild(wrap);
        };
        // Façade colour — the SHARED building palette (same swatches the residential step offers).
        swatchPicker('Façade colour', FACADE_PALETTE, facadeColor, (hex) => { facadeColor = hex; }, 'onboarding-office-facade-colour');
        // Glass colour — a small light-blue/neutral tint palette for the curtain-wall glazing.
        const GLASS_PALETTE: ReadonlyArray<{ hex: string; name: string }> = [
            { hex: '#9bc8e4', name: 'Sky blue (default)' },
            { hex: '#bcd9ea', name: 'Pale blue' },
            { hex: '#a8c6c0', name: 'Sea green' },
            { hex: '#c9d6e0', name: 'Cool grey' },
            { hex: '#8fb3c9', name: 'Steel blue' },
            { hex: '#d6e4ec', name: 'Clear glass' },
            { hex: '#7fa8b8', name: 'Deep teal' },
        ];
        swatchPicker('Glass colour', GLASS_PALETTE, glassColor, (hex) => { glassColor = hex; }, 'onboarding-office-glass-colour');
        // §OFFICE-INNER-WALL-COLOUR — inner-wall colour picker (interior partitions), the SHARED
        // building palette (same swatches the façade offers) so a partition can differ from the shell.
        swatchPicker('Inner-wall colour', FACADE_PALETTE, innerWallColor, (hex) => { innerWallColor = hex; }, 'onboarding-office-innerwall-colour');

        // Plate-shape note (circular) — informational chip.
        const shapeNote = document.createElement('p');
        shapeNote.className = 'os-hint';
        shapeNote.textContent = 'Plate shape: circular (centred core + concentric desk rings).';
        form.appendChild(shapeNote);

        const status = document.createElement('p');
        status.className = 'os-status';
        status.setAttribute('data-testid', 'onboarding-office-status');
        status.hidden = true;
        form.appendChild(status);

        const actions = document.createElement('div');
        actions.className = 'os-confirm-actions';
        const generate = document.createElement('button');
        generate.type = 'submit';
        generate.className = 'os-btn os-btn--primary';
        generate.setAttribute('data-testid', 'onboarding-office-generate');
        generate.textContent = 'Build this tower';
        const notNow = document.createElement('button');
        notNow.type = 'button';
        notNow.className = 'os-btn os-btn--ghost';
        notNow.setAttribute('data-testid', 'onboarding-office-notnow');
        notNow.textContent = `Not now — I'll design it myself`;
        // §L-384 — BACK to re-draw / plot choice (clear-then-recreate of the C19 boundary).
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'os-btn os-btn--ghost';
        back.setAttribute('data-testid', 'onboarding-office-back');
        back.textContent = source === 'drawn' ? '← Back to drawing' : '← Back';
        back.addEventListener('click', () => this.backFromConfirm(source));
        actions.appendChild(back);
        actions.appendChild(generate); actions.appendChild(notNow);
        form.appendChild(actions);

        // §OFFICE-PREVIEW-MODAL-LAYOUT — two-column landscape:
        //   LEFT  — a bounded plate-preview box (the circular SVG, fixed-size, its OWN
        //           box) with the analytics key→value table beneath it.
        //   RIGHT — the controls form (sliders · culture · caption · actions).
        // The preview and the sliders sit in separate, bounded grid cells and never
        // overlap. `plate` holds the SVG; `analytics` holds the table — separate targets
        // so refreshPreview paints into distinct regions.
        const layout = document.createElement('div');
        layout.className = 'os-office-layout';
        const left = document.createElement('div');
        left.className = 'os-office-left';
        const plate = document.createElement('div');
        plate.className = 'os-office-plate';
        plate.setAttribute('data-testid', 'onboarding-office-preview');
        const analytics = document.createElement('div');
        analytics.className = 'os-office-analytics';
        analytics.setAttribute('data-testid', 'onboarding-office-analytics');
        left.appendChild(plate);
        left.appendChild(analytics);
        layout.appendChild(left);
        layout.appendChild(form);
        body.appendChild(layout);

        // §OFFICE-PREVIEW-STEP — LIVE PREVIEW: run the PURE orchestrator on the current
        // params and paint the circular plate SVG + analytics. Display-only (no mutation).
        const numV = (v: string, d: number): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };
        refreshPreview = (): void => {
            const radiusM = numV(radiusInput.value, derivedRadiusM);
            // Re-cap the stories slider to this radius (a smaller plate → fewer storeys) AND
            // to zoning (§L-401 slice 2). Because this runs on EVERY slider input, the zoning
            // cap correctly follows the floor-to-floor slider too: taller storeys ⇒ fewer of
            // them fit under the same height limit.
            const ftfM = numV(ftfInput.value, seedFtf);
            const structuralCap = Math.max(1, maxFeasibleStoriesForRadius(radiusM));
            const { cap: zoningCap, advisoryStoreys } = zoningCapFor(ftfM);
            const cap = Math.max(1, Math.min(structuralCap, zoningCap));
            // Tell the user WHY the slider stops where it does — a control that silently
            // refuses to move is indistinguishable from a broken one — and, when the zoning is
            // only an ESTIMATE, say so plainly instead of presenting a guess as a legal limit.
            const envMaxH = getLastBuildableEnvelope()?.maxHeight_m ?? null;
            if (capHint) {
                if (advisoryStoreys !== null && envMaxH) {
                    capHint.textContent =
                        `Estimated zoning (${envMaxH} m) suggests about ${Math.max(1, advisoryStoreys)} storeys at `
                        + `${ftfM.toFixed(1)} m floor-to-floor — not enforced, this is a default rule pack, not published data.`;
                } else if (Number.isFinite(zoningCap) && zoningCap <= structuralCap && envMaxH) {
                    capHint.textContent =
                        `Max ${cap} storeys — limited by the ${envMaxH} m zoning height at ${ftfM.toFixed(1)} m floor-to-floor.`;
                } else {
                    capHint.textContent = `Max ${cap} storeys — limited by the ${radiusM} m plate radius.`;
                }
            }
            storiesInput.max = String(cap);
            if (numV(storiesInput.value, seedStories) > cap) {
                storiesInput.value = String(cap);
                const valEl = storiesInput.parentElement?.querySelector('[data-testid="onboarding-office-stories-value"]');
                if (valEl) valEl.textContent = String(cap);
            }
            const stories = Math.max(1, Math.round(numV(storiesInput.value, seedStories)));
            const result = orchestrateOfficeBuilding({
                radiusM,
                stories,
                floorToFloorM: numV(ftfInput.value, seedFtf),
                deskDensityPer1000Sqft: Math.round(numV(deskInput.value, seedDeskDensity)),
                culture,
            });
            if (result.status !== 'ok') {
                plate.innerHTML = `<p class="os-resi-preview-hint">Adjust the radius or storeys to preview the tower.</p>`;
                analytics.innerHTML = '';
                return;
            }
            const ok: OfficeBuildingOk = result;
            const svg = buildOfficePlatePreviewSvg(ok, 260);
            const note = ok.autoFit.notes.length > 0
                ? `<p class="os-hint" data-testid="onboarding-office-autofit">${ok.autoFit.notes.map((n) => this._escapeHtml(n)).join(' ')}</p>`
                : '';
            // LEFT-TOP: the bounded circular plate in its own box (nothing overlaps it).
            plate.innerHTML =
                `<div class="os-office-plate-svg">${svg}</div>` +
                `<div class="os-office-plate-caption">Representative open-plan floor</div>`;
            // LEFT-BOTTOM: the analytics key→value table (+ optional auto-fit note).
            analytics.innerHTML = buildOfficeAnalyticsHtml(ok) + note;
        };
        // Re-render live on any control change.
        for (const el of [storiesInput, radiusInput, ftfInput, deskInput]) {
            el.addEventListener('input', refreshPreview);
        }
        refreshPreview();

        const onSubmit = (e: Event): void => {
            e.preventDefault();
            const radiusM = numV(radiusInput.value, derivedRadiusM);
            const cap = Math.max(1, maxFeasibleStoriesForRadius(radiusM));
            const stories = Math.min(Math.max(1, Math.round(numV(storiesInput.value, seedStories))), cap);
            // §OFFICE-PREVIEW-STEP — write the chosen params into the brief so `generateOffice`
            // builds EXACTLY what the preview showed (same source of truth as the resi step).
            this.briefMetadata = {
                ...this.briefMetadata,
                floors: stories,
                officeRadiusM: radiusM,
                officeFloorToFloorM: numV(ftfInput.value, seedFtf),
                officeDeskDensity: Math.round(numV(deskInput.value, seedDeskDensity)),
                officeCulture: culture,
                // §OFFICE-ARCH-FURNISH-SPLIT — the preview toggle. Read by generateOffice → buildDirect.
                officeWithInterior: withInterior,
                // §OFFICE-FACADE-GLASS-COLOUR — façade + glass colours from the swatch pickers.
                officeFacadeColor: facadeColor,
                officeGlassColor: glassColor,
                // §OFFICE-INNER-WALL-COLOUR — the inner-wall (interior partition) colour.
                officeInnerWallColor: innerWallColor,
            };
            console.log('[onboarding-step] §OFFICE-PREVIEW-STEP build confirmed', { stories, radiusM, culture, withInterior });
            this.overlay?.classList.remove('os-onboarding-overlay--confirm');
            this.overlay?.classList.remove('os-onboarding-overlay--resi');
            this.overlay?.classList.remove('os-onboarding-overlay--office');
            void this.generateAndFinish();
        };
        form.addEventListener('submit', onSubmit);
        this.addCleanup(() => form.removeEventListener('submit', onSubmit));

        notNow.addEventListener('click', () => {
            this.overlay?.classList.remove('os-onboarding-overlay--resi');
            this.overlay?.classList.remove('os-onboarding-overlay--office');
            // §L-424 — land in the PRYZM canvas (boundary + envelope guides), not stranded on the site split.
            console.log('[onboarding-step] §OFFICE-PREVIEW-STEP → NOT NOW — landing in the PRYZM canvas (boundary + envelope), no generate.');
            this.toast('Your plot + buildable envelope are in the canvas — design away, or generate any time from the AI panel.', 'info');
            void this.landInCanvasWithUnderlay();
        });
    }

    /** §OFFICE-PREVIEW-STEP — minimal HTML escape for preview notes (display-only). */
    private _escapeHtml(s: string): string {
        return s.replace(/[&<>"']/g, (c) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
        ));
    }

    private renderGeneratingStep(): void {
        this.step = 'generating';
        this.setDrawingPresentation(false);
        this.overlay?.classList.remove('os-onboarding-overlay--confirm');
        this.overlay?.classList.remove('os-onboarding-overlay--resi');
        this.overlay?.classList.remove('os-onboarding-overlay--office');
        this.setStepIndicator(4, 'Generating');
        const body = this.clearBody();
        const p = document.createElement('p');
        p.className = 'os-prompt';
        p.textContent = `Laying out your ${this.typologyLabel()}…`;
        body.appendChild(p);
        const hint = document.createElement('p');
        hint.className = 'os-hint';
        hint.textContent = 'Generating from your site boundary. This lands you straight in the editor.';
        body.appendChild(hint);
    }

    // ── shared site + generate plumbing ────────────────────────────────────────

    /** Call `createSiteFromRect` with whatever location/size we have. Returns its
     *  boolean result. Wraps in try so it never throws into the flow. */
    private createSite(opts: { lat?: number; lon?: number; address?: string; width: number; depth: number }): boolean {
        try {
            return createSiteFromRect(this.runtime, {
                ...(opts.address ? { address: opts.address } : {}),
                ...(opts.lat !== undefined ? { lat: opts.lat } : {}),
                ...(opts.lon !== undefined ? { lon: opts.lon } : {}),
                width: opts.width,
                depth: opts.depth,
            });
        } catch (err) {
            console.error('[onboarding-step] createSiteFromRect threw (swallowed):', err);
            return false;
        }
    }

    /**
     * O.7.1 — default-rectangle fallback that ROUTES TO CONFIRM (not generate).
     * Used by the "Skip drawing" escape hatch ONLY — §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR
     * removed the idle-timer caller, so every remaining caller is an explicit user click.
     * Authors a
     * default plot (so there's a visible boundary to generate from) then surfaces
     * the generate-confirm step so the user still chooses. Guarded by `disposed`.
     */
    private fallbackDefaultRectToConfirm(reason: string): void {
        if (this.disposed) return;
        console.log(`[onboarding-step] default plot → confirm (${reason}).`);
        const siteOk = this.createSite({
            ...(this.picked ? { lat: this.picked.lat, lon: this.picked.lon, address: this.picked.address } : {}),
            width: DEFAULT_PARCEL_WIDTH_M,
            depth: DEFAULT_PARCEL_DEPTH_M,
        });
        if (!siteOk) {
            this.dispose();
            return;
        }
        this.renderGenerateConfirmStep('default-plot');
    }

    /** Default-rectangle fallback used by HARD-ERROR paths (e.g. start threw).
     *  Creates the Site (with location if we have one) then generates — no confirm,
     *  because in these paths the overlay may be unusable. Idempotent-ish: guarded
     *  by `disposed`. */
    private async fallbackDefaultRectAndGenerate(reason: string): Promise<void> {
        if (this.disposed) return;
        console.log(`[onboarding-step] fallback default rectangle (${reason}).`);
        this.renderGeneratingStep();
        const siteOk = this.createSite({
            ...(this.picked ? { lat: this.picked.lat, lon: this.picked.lon, address: this.picked.address } : {}),
            width: DEFAULT_PARCEL_WIDTH_M,
            depth: DEFAULT_PARCEL_DEPTH_M,
        });
        if (!siteOk) {
            this.dispose();
            return;
        }
        await this.generateAndFinish();
    }

    /**
     * Run the typology generator from the authored boundary, then tear the
     * overlay down so the user lands in the canvas. Never throws.
     *
     * §FUTURE-TYPOLOGY (A.21.j): the dispatch is the only typology-specific part.
     * `casa-unifamiliar` → `generateHouse()` (multi-storey); everything else →
     * `generateApartmentFromBoundary`. The location + parcel steps above are
     * identical for every typology.
     */
    private async generateAndFinish(): Promise<void> {
        if (this.disposed) return;
        console.log(`[onboarding-step] entering generate (from step "${this.step}").`);
        // O.7.2.b — GENERATE is the ONLY action that tears down the cream 2D plan map.
        // After boundary-commit the map stayed alive (so the confirm rendered over a
        // live plan map); now that the user chose "Generate", dispose it up front so
        // the "Generating…" step + the dual-pane result aren't drawn under the map.
        // Idempotent + double-dispose safe; showSiteResultView() also calls it.
        try {
            const closeMap = (window as unknown as { pryzmCloseBoundaryMap2D?: () => void }).pryzmCloseBoundaryMap2D;
            if (typeof closeMap === 'function') {
                console.log('[onboarding-step] §O.7.2.b: closing the cream 2D plan map (generate-time teardown).');
                closeMap();
            }
        } catch (closeErr) {
            console.warn('[onboarding-step] §O.7.2.b: pryzmCloseBoundaryMap2D threw (non-fatal):', closeErr);
        }
        this.renderGeneratingStep();
        try {
            // §FUTURE-TYPOLOGY (A.21.j) — typology SWITCH POINT. The location +
            // parcel steps above are identical for every typology; ONLY this
            // dispatch differs. House (`casa-unifamiliar`) routes to the
            // multi-storey HOUSE generator (levels + per-storey rooms + stair +
            // slab-void + roof); every other typology keeps the apartment path
            // byte-for-byte. ADDITIVE — the apartment branch is unchanged.
            // §TYPOLOGY-CHOICE-AT-CONFIRM — the switch now dispatches on the SHARED
            // `resolveGenerateRoute` resolver (unit-tested against the real registered
            // manifests) instead of on raw id equality. That is what makes the chooser's
            // "only offer what is wired" filter and this dispatch provably agree: they
            // are the same function. Id-equality was also how `residential-building`
            // (the registered pack id) fell through to the APARTMENT generator — the
            // user picking a residential building and silently getting a flat.
            const route = resolveGenerateRoute(this.typologyId);
            if (route === 'house') {
                await this.generateHouse();
            } else if (route === 'residential-building') {
                // §RESI-MULTIFAMILY — the multi-family residential building. Reads
                // the SAME authored parcel boundary, derives the residential program
                // (floors + per-apartment min/max m² + T1–T4 mix) from the captured
                // brief, runs the orchestrator on that footprint, and opens the
                // residential PREVIEW MODAL → Build. The building-type SELECTION is
                // the opt-in (no console flag on this path). ADDITIVE — neither the
                // apartment nor the house branch is touched.
                await generateResidentialFromBoundary(this.runtime, this.briefMetadata);
            } else if (route === 'office') {
                // §OFFICE-ONBOARDING-WIRE — the office TOWER. The tower is CIRCULAR
                // (radius + stories), but the user draws a polygon parcel, so we derive
                // the circle (centroid + a fit radius that sits inside the plot) from
                // the drawn boundary and drive the office controller (opens the setup
                // modal / emits the plate). ADDITIVE — apartment/house/resi untouched.
                await this.generateOffice();
            } else {
                // O.12.c — forward the STRUCTURED brief so the user's captured
                // bedroom/bathroom/option choices drive the generated layout.
                await generateApartmentFromBoundary(this.runtime, this.briefMetadata);
            }
            console.log('[onboarding-step] generate complete — onboarding flow finished.');
            // §ONB-RESULT-VIEW (O.7.2 / O.7.2.b, supersedes §ONB-3D-VIEW): the founder
            // tested twice and the LEFT pane went BLANK after generate. O.7.2.b fixed
            // the upstream half: the cream 2D Hektar map no longer disposes itself on
            // boundary-commit — commit() now FREEZES (keeps the map + boundary alive so
            // the confirm renders over a live plan map), and the map is torn down ONLY
            // at generate-time (we called pryzmCloseBoundaryMap2D() above; the result
            // controller also disposes it). The old code here then force-activated the
            // BIM 3D view WITHOUT turning GIS off, leaving an orphaned Cesium overlay.
            //
            // Now: hand the pane to GISAreaLayout's post-generate DUAL-PANE controller.
            // It lands on the BIM DUAL-PANE ('2D' → GIS off, LEFT 3D viewport · RIGHT
            // 2D plan via SplitViewManager — the user SEES their generated apartment,
            // no blank) and mounts an on-brand toggle so the user can flip to the
            // Cesium 3D globe (re-framed to the plot) on demand. Best-effort: if the
            // hook isn't wired (GIS area not mounted), fall back to the old BIM 3D
            // activation so we still never leave the user on nothing.
            try {
                const showResult = (window as unknown as {
                    pryzmShowSiteResultView?: (initial?: '2D' | '3D') => void;
                }).pryzmShowSiteResultView;
                if (typeof showResult === 'function') {
                    showResult('2D');
                    console.log('[onboarding-step] §ONB-RESULT-VIEW: handed pane to dual-view (landed on 2D plan; 3D toggle available).');
                } else {
                    console.warn('[onboarding-step] §ONB-RESULT-VIEW: pryzmShowSiteResultView missing — falling back to BIM 3D activation.');
                    await window.viewController?.activate('3D');
                }
            } catch (viewErr) {
                console.warn('[onboarding-step] post-generate result-view handoff failed (non-fatal):', viewErr);
            }
        } catch (err) {
            console.error('[onboarding-step] generate threw (swallowed):', err);
            this.toast(`Generation failed: ${String(err)}`, 'error');
        } finally {
            this.dispose();
        }
    }

    /**
     * A.21.j — the HOUSE generate branch. Builds the multi-storey house INSIDE
     * the SAME authored parcel boundary the apartment path uses: it reads the
     * parcel polygon from `runtime.siteModelStore.getParcelBoundary()` (exactly
     * the read `generateApartmentFromBoundary` does internally), maps it to a
     * footprint, derives the storey count from the brief's `floors` field
     * (default 2, clamped [1,3]), and calls `generateHouseFromBoundary` with
     * `{ footprint }` so the shell is drawn on the drawn plot — NOT a default
     * 10×8 rectangle. ADDITIVE: this never touches the apartment dispatch.
     */
    private async generateHouse(): Promise<void> {
        const storeyCount = this.resolveStoreyCount();
        const footprint = this.readParcelFootprint();
        console.log('[onboarding-step] §FUTURE-TYPOLOGY (A.21.j) → HOUSE generator', {
            storeyCount,
            footprintPts: footprint?.length ?? 0,
        });
        // If the parcel read failed (degenerate / missing boundary), let the
        // house generator fall back to its own default rectangle rather than
        // blocking the flow — mirrors the apartment path's defensive posture.
        await generateHouseFromBoundary(
            this.runtime,
            storeyCount,
            footprint ? { footprint } : undefined,
        );
    }

    /**
     * §OFFICE-ONBOARDING-WIRE — the OFFICE generate branch. The office tower is
     * CIRCULAR (radius + stories), but the user drew a POLYGON parcel, so we:
     *   1. read the drawn parcel polygon (`readParcelFootprint()`, shared with house),
     *   2. derive a circle that SITS INSIDE the plot (centroid + fit radius, the pure
     *      `deriveOfficeCircleFromParcel`),
     *   3. resolve the storey count from the brief (`floors`/`levels`/`stories`, up to
     *      ~40), then
     *   4. drive the SAME office controller the console path uses (opens the office
     *      setup modal / emits the plate) via `request({ stories, radiusM })`.
     * If the parcel read/derive fails we fall back to a default radius (22 m) so the
     * flow never blocks — mirroring the house path's defensive posture. Span-free
     * here: the office controller's `request()` owns the OTel span (per file convention).
     */
    private async generateOffice(): Promise<void> {
        const requestedStories = resolveOfficeStoreyCount(this.briefMetadata);
        const footprint = this.readParcelFootprint();
        const circle = deriveOfficeCircleFromParcel(footprint);
        // §OFFICE-PREVIEW-STEP — if the office SETUP step ran, it wrote the chosen params
        // (radius / floor-to-floor / desk density / culture) into the brief, so build
        // EXACTLY what the preview showed and SKIP the controller's own modal (the
        // onboarding step already WAS the preview). Otherwise (console / RAC path), fall
        // back to deriving the radius + the modal `request` as before.
        const md = this.briefMetadata;
        const previewRadius = typeof md['officeRadiusM'] === 'number' ? (md['officeRadiusM'] as number) : null;
        const radiusM = previewRadius && previewRadius > 0
            ? previewRadius
            : (circle?.radiusM && circle.radiusM > 0 ? circle.radiusM : OFFICE_DEFAULT_RADIUS_M);
        const culture = md['officeCulture'] === 'perimeter-offices-first' || md['officeCulture'] === 'open-plan-first'
            ? (md['officeCulture'] as WorkplaceCulture) : undefined;
        const floorToFloorM = typeof md['officeFloorToFloorM'] === 'number' ? (md['officeFloorToFloorM'] as number) : undefined;
        const deskDensityPer1000Sqft = typeof md['officeDeskDensity'] === 'number' ? (md['officeDeskDensity'] as number) : undefined;
        // §OFFICE-ARCH-FURNISH-SPLIT — the preview toggle: "Architecture + Interior" furnishes in
        // the same build. Default (undefined / false) = Architecture Only (SPEC §2 default).
        const withInterior = md['officeWithInterior'] === true;
        // §OFFICE-FACADE-GLASS-COLOUR — the façade + glass colours from the preview swatches.
        const hexRe = /^#[0-9a-fA-F]{6}$/;
        const facadeColor = typeof md['officeFacadeColor'] === 'string' && hexRe.test(md['officeFacadeColor'] as string) ? (md['officeFacadeColor'] as string) : undefined;
        const glassColor = typeof md['officeGlassColor'] === 'string' && hexRe.test(md['officeGlassColor'] as string) ? (md['officeGlassColor'] as string) : undefined;
        // §OFFICE-INNER-WALL-COLOUR — the inner-wall (interior partition) colour from the preview.
        const innerWallColor = typeof md['officeInnerWallColor'] === 'string' && hexRe.test(md['officeInnerWallColor'] as string) ? (md['officeInnerWallColor'] as string) : undefined;

        // §L-401 slice 2 — ENFORCE the zoning storey cap at GENERATION, not only on the
        // slider. Defence in depth, and not redundant: `stories` can arrive from the capped
        // preview slider OR from the console / RAC path, which never saw that slider. The
        // slider cap is UX; THIS is the correctness boundary — it is the last point before a
        // non-compliant building is authored.
        const envForCap = getLastBuildableEnvelope();
        const storeyCap = capStoreysToEnvelope({
            requestedStoreys: requestedStories,
            maxHeightM: envForCap?.maxHeight_m ?? null,
            storeyHeightM: floorToFloorM ?? 4.0,
            // ESTIMATED zoning advises, never blocks — see storeyCap.ts `isEstimate`.
            isEstimate: envForCap?.confidence === 'estimated-ruleset',
        });
        const stories = storeyCap.storeys;
        if (storeyCap.capped) {
            console.warn(`[onboarding-step] §L-401 storey cap — ${storeyCap.explanation}`);
        } else if (storeyCap.advisory) {
            console.info(`[onboarding-step] §L-401 storey ADVISORY (estimated zoning, not enforced) — ${storeyCap.explanation}`);
        }
        if (storeyCap.infeasible) {
            // Never silently emit a non-compliant building: say so loudly. (Surfacing this in
            // the UI belongs with the L-402 compliance report — logged there, not faked here.)
            console.error(`[onboarding-step] §L-401 INFEASIBLE — ${storeyCap.explanation} Building 1 storey; this site cannot comply at this floor-to-floor.`);
        }
        console.log('[onboarding-step] §OFFICE-ONBOARDING-WIRE → OFFICE generator', {
            stories,
            footprintPts: footprint?.length ?? 0,
            derivedRadiusM: circle?.radiusM ?? null,
            radiusM,
            fromPreview: previewRadius != null,
        });
        try {
            const controller = getOfficeBuildingController();
            const req = {
                stories,
                radiusM,
                ...(floorToFloorM ? { floorToFloorM } : {}),
                ...(deskDensityPer1000Sqft ? { deskDensityPer1000Sqft } : {}),
                ...(culture ? { culture } : {}),
                ...(facadeColor ? { facadeColor } : {}),
                ...(glassColor ? { glassColor } : {}),
                ...(innerWallColor ? { innerWallColor } : {}),
            };
            if (previewRadius != null) {
                // The onboarding step already previewed → build directly (no second modal).
                // §OFFICE-ARCH-FURNISH-SPLIT — thread the preview's Architecture/Interior toggle.
                await controller.buildDirect(this.runtime, req, { withInterior });
            } else {
                await controller.request(this.runtime, req);
            }
        } catch (err) {
            console.error('[onboarding-step] §OFFICE-ONBOARDING-WIRE: office controller request threw (swallowed):', err);
            this.toast(`Office generation failed: ${String(err)}`, 'error');
        }
    }

    /**
     * A.21.j — derive the house storey count from the captured brief's `floors`
     * field (the casa-unifamiliar manifest's `briefSchema` stepper, ids stable).
     * Defaults to 2 (a house demo should be multi-storey) when absent/ill-typed,
     * and clamps to [1,3] (the manifest's own min/max). storeyCount=1 is valid —
     * the house executor degrades to a single plate.
     */
    private resolveStoreyCount(): number {
        const raw = this.briefMetadata['floors'];
        let n =
            typeof raw === 'number' && Number.isFinite(raw)
                ? raw
                : typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))
                    ? Number(raw)
                    : 2; // default — house demos are multi-storey
        n = Math.round(n);
        n = Math.max(1, Math.min(3, n));
        return n;
    }

    /**
     * A.21.j — read the authored parcel polygon the SAME way the apartment path
     * does (`runtime.siteModelStore.getParcelBoundary()`), and map it to a
     * footprint for the house shell. Returns `null` when there's no usable
     * boundary (the caller then lets the house generator use its own default).
     * Drops a duplicate closing vertex so the shell builder never emits a
     * zero-length edge (mirrors apartmentFromBoundary's `polygonToFootprint`).
     */
    private readParcelFootprint(): FootprintPoint[] | null {
        try {
            const store = this.runtime.siteModelStore;
            if (!store) {
                console.warn('[onboarding-step] §A.21.j: runtime.siteModelStore undefined — house uses its default footprint.');
                return null;
            }
            const boundary = store.getParcelBoundary();
            // L-401 — build INSIDE the C58 buildable envelope (setbacks applied) when one is
            // cached for this parcel: COMPLIANT-BY-CONSTRUCTION. `resolveBuildableFootprint`
            // returns the envelope inset ring when valid, else the raw parcel (unchanged).
            const rawPolygon = boundary?.polygon ?? [];
            const { polygon, source } = resolveBuildableFootprint(rawPolygon);
            if (polygon.length < 3) {
                console.warn(`[onboarding-step] §A.21.j: parcel boundary has ${polygon.length} pts (<3) — house uses its default footprint.`);
                return null;
            }
            if (source === 'envelope') {
                console.log(`[onboarding-step] §L-401: footprint = buildable-envelope inset (${polygon.length} pts) — compliant-by-construction (setbacks applied).`);
            }
            const pts: FootprintPoint[] = polygon.map((p) => ({ x: p.x, z: p.z }));
            if (pts.length >= 2) {
                const first = pts[0]!;
                const last = pts[pts.length - 1]!;
                const EPS = 1e-6;
                if (Math.abs(first.x - last.x) < EPS && Math.abs(first.z - last.z) < EPS) {
                    pts.pop();
                }
            }
            if (pts.length < 3) {
                console.warn('[onboarding-step] §A.21.j: footprint collapsed below 3 distinct points — house uses its default footprint.');
                return null;
            }
            return pts;
        } catch (err) {
            console.warn('[onboarding-step] §A.21.j: reading parcel footprint threw (non-fatal):', err);
            return null;
        }
    }
}
