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
// silently generate (drawn-boundary commit, default-plot skip, draw watchdog,
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
// - A 60 s WATCHDOG on the draw-wait: if the user never commits a boundary (or GIS
//   never mounts), it falls back to the default rectangle + generates so the flow
//   can't hang.
//
// TYPOLOGY-AGNOSTIC
// -----------------
// Steps 1-2 are site-layer only (location + parcel). Only the final generate call
// (step 3) is apartment-specific — see the §FUTURE-TYPOLOGY marker at that call.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { createSiteFromRect } from '../site/createSiteFromRect.js';
import { resolveSiteContext, ensureSite, dispatchSiteLocation } from '../site/siteDispatch.js';
import { geocodeAddress } from '../site/geocodeAddress.js';
import { generateApartmentFromBoundary } from '../apartment-layout/apartmentFromBoundary.js';
import { makeDraggable } from '../makeDraggable.js';
import { makeResizable } from '../makeResizable.js';

/** Default parcel rectangle (metres) — the no-GIS fallback (founder §7.2). Matches
 *  `createSiteFromRect` + `briefBootstrap`'s single-apartment-scale default. */
const DEFAULT_PARCEL_WIDTH_M = 10;
const DEFAULT_PARCEL_DEPTH_M = 8;

/** How long to wait for the user to commit a drawn boundary before the watchdog
 *  falls back to the default rectangle + generates (so the flow can't hang). */
const DRAW_WATCHDOG_MS = 60_000;

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

class OnboardingStepController {
    private readonly runtime: PryzmRuntime;
    private readonly seedAddress: string;
    /** Typology from the brief — drives the O.7.1 confirm-step copy/label. */
    private readonly typologyId: string;
    /** O.12.c — structured brief metadata, forwarded to the generate call. */
    private readonly briefMetadata: Record<string, unknown>;

    private overlay: HTMLElement | null = null;
    private bodyEl: HTMLElement | null = null;
    private stepLabelEl: HTMLElement | null = null;

    /** Current step — drives the indicator + guards re-entry into generate. */
    private step: StepId = 'location';
    private picked: PickedLocation | null = null;
    private disposed = false;

    /** Disposers for in-flight listeners/timers so dispose() is leak-free. */
    private cleanups: Array<() => void> = [];

    constructor(opts: OnboardingStepControllerOptions) {
        this.runtime = opts.runtime;
        this.seedAddress = (opts.seedAddress ?? '').trim();
        this.typologyId = (opts.typologyId ?? 'apartment').trim() || 'apartment';
        this.briefMetadata = opts.briefMetadata ?? {};
    }

    /**
     * Typology-aware noun for the confirm-step copy/label. §FUTURE-TYPOLOGY: today
     * only `'apartment'` has a shipped generator (see `generateAndFinish`), so
     * everything else is a graceful fallthrough; when house/office Packs land they
     * add their noun here and swap the generate call in `generateAndFinish`.
     */
    private typologyLabel(): string {
        switch (this.typologyId) {
            case 'apartment': return 'apartment';
            case 'casa-unifamiliar': return 'house';   // §A.6.c — friendly noun
            case 'house': return 'house';
            case 'office': return 'office';
            default: return this.typologyId || 'design';
        }
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
        this.setDrawingPresentation(false);
        this.setStepIndicator(1, 'Location');
        const body = this.clearBody();

        const prompt = document.createElement('p');
        prompt.className = 'os-prompt';
        prompt.textContent = "Where's your project?";
        body.appendChild(prompt);

        const hint = document.createElement('p');
        hint.className = 'os-hint';
        hint.textContent = 'Enter a city or address so we can anchor your site on the map. You can skip this.';
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

        const onSubmit = (e: Event): void => {
            e.preventDefault();
            void this.handleGeocode(input.value, status, submit);
        };
        form.addEventListener('submit', onSubmit);
        skip.addEventListener('click', () => {
            console.log('[onboarding-step] location skipped (no location).');
            this.picked = null;
            this.renderSiteStep();
        });
        this.addCleanup(() => form.removeEventListener('submit', onSubmit));

        // Defer focus so the overlay is painted first.
        try { input.focus(); } catch { /* ignore */ }
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
            this.renderSiteStep();
            return;
        }

        status.hidden = false;
        status.textContent = 'Searching…';
        submitBtn.disabled = true;
        try {
            const results = await geocodeAddress(q);
            if (this.disposed) return;
            if (results.length === 0) {
                console.warn('[onboarding-step] geocode returned no results for', JSON.stringify(q));
                status.textContent = 'No matches — check the spelling, or skip to use the default site.';
                submitBtn.disabled = false;
                return;
            }
            const best = results[0]!;
            this.picked = {
                lat: best.lat,
                lon: best.lon,
                address: best.displayName,
                ...(best.bbox ? { bbox: best.bbox } : {}),
            };
            console.log('[onboarding-step] location resolved', this.picked);
            status.textContent = `Found: ${best.displayName}`;
            this.renderSiteStep();
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
        choices.appendChild(defaultBtn);
        choices.appendChild(drawBtn);
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
     * the `site.parcel-boundary-set` event the draw tool fires on commit. A 60 s
     * watchdog falls back to the default rectangle so the flow can't hang.
     *
     * §GIS-HANDOFF (needs browser verification): there is no clean runtime hook to
     * toggle GIS, so we use the established window-hook idiom — `pryzmToggleGIS`
     * (registered alongside `pryzmStartBoundaryDraw` in GISAreaLayout) to
     * mount/activate Cesium, then `pryzmStartBoundaryDraw` to begin the draw. Both
     * are no-ops until the editor's GIS area has wired them; the watchdog covers
     * that case. The draw tool reads the Site origin via getSiteOrigin() — so we
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

        // 2) Arm the boundary-set listener + watchdog BEFORE starting the draw so
        //    we never miss the commit event.
        this.renderDrawingStep();

        let settled = false;
        const finish = (source: 'drawn' | 'watchdog'): void => {
            if (settled) return;
            settled = true;
            cleanup();
            if (source === 'watchdog') {
                // O.7.1: a timed-out draw must NOT silently generate. Author a
                // default plot so there's something to generate from + visible, then
                // surface the confirm step so the user still CHOOSES.
                console.warn('[onboarding-step] draw watchdog fired (60 s) — falling back to a default plot, then asking before generate.');
                this.toast('No boundary drawn — using a default plot.', 'info');
                void this.fallbackDefaultRectToConfirm('watchdog');
            } else {
                // O.7.1: keep the drawn boundary visible on the map + ASK before
                // generating (typology→AI dispatch). Do NOT auto-generate.
                console.log('[onboarding-step] boundary committed — keeping it visible + asking before generate.');
                this.renderGenerateConfirmStep('drawn');
            }
        };

        const sub = this.runtime.events?.on('site.parcel-boundary-set', () => finish('drawn'));
        const watchdog = setTimeout(() => finish('watchdog'), DRAW_WATCHDOG_MS);
        const cleanup = (): void => {
            try { sub?.dispose(); } catch { /* ignore */ }
            clearTimeout(watchdog);
        };
        this.addCleanup(cleanup);

        // 3) Activate GIS + start the draw tool via the window-hook handoff.
        try {
            const w = window as unknown as {
                pryzmToggleGIS?: (active: boolean) => void;
                pryzmStartBoundaryDraw?: () => void;
                pryzmSetGeocodeFrame?: (frame: { lat: number; lon: number; bbox?: [number, number, number, number] }) => void;
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
            if (typeof w.pryzmToggleGIS === 'function') {
                console.log('[onboarding-step] §GIS-HANDOFF: pryzmToggleGIS(true).');
                w.pryzmToggleGIS(true);
            } else {
                console.warn('[onboarding-step] §GIS-HANDOFF: pryzmToggleGIS missing — GIS area not wired; the draw button on the GIS rail still works, watchdog will cover a no-show.');
            }
            // The Cesium mount + boundary tool construction is async inside
            // GISAreaLayout; poll briefly for pryzmStartBoundaryDraw, then call it.
            this.startDrawWhenReady();
        } catch (err) {
            console.warn('[onboarding-step] §GIS-HANDOFF threw — relying on watchdog:', err);
        }
    }

    /**
     * Poll (bounded) for `window.pryzmStartBoundaryDraw` to appear after GIS
     * activation, then call it. GISAreaLayout registers it only once Cesium has
     * mounted (an async Promise.all), so a short poll bridges the gap. If it never
     * appears, the draw watchdog still fires.
     */
    private startDrawWhenReady(): void {
        let tries = 0;
        const MAX_TRIES = 40; // 40 × 250 ms = 10 s — well inside the 60 s watchdog.
        const tick = (): void => {
            if (this.disposed) return;
            const start = (window as unknown as { pryzmStartBoundaryDraw?: () => void }).pryzmStartBoundaryDraw;
            if (typeof start === 'function') {
                console.log('[onboarding-step] §GIS-HANDOFF: pryzmStartBoundaryDraw() — draw tool armed.');
                try { start(); } catch (err) { console.warn('[onboarding-step] startBoundaryDraw threw:', err); }
                return;
            }
            if (++tries >= MAX_TRIES) {
                console.warn('[onboarding-step] §GIS-HANDOFF: pryzmStartBoundaryDraw never appeared — relying on watchdog / manual GIS-rail draw.');
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
     * banner. The step chip ("STEP 2 OF 3 · DRAW YOUR PLOT") stays in the header.
     */
    private renderDrawingStep(): void {
        this.setDrawingPresentation(true);
        this.setStepIndicator(2, 'Draw your plot');
        const body = this.clearBody();

        const hint = document.createElement('p');
        hint.className = 'os-hint os-draw-instruction';
        hint.textContent = 'Click each corner · double-click or Enter to close · Esc to cancel';
        body.appendChild(hint);

        const footer = document.createElement('div');
        footer.className = 'os-footer';
        const useDefault = document.createElement('button');
        useDefault.type = 'button';
        useDefault.className = 'os-btn os-btn--ghost';
        useDefault.setAttribute('data-testid', 'onboarding-draw-usedefault');
        useDefault.textContent = 'Skip drawing — use a default plot';
        footer.appendChild(useDefault);
        body.appendChild(footer);

        useDefault.addEventListener('click', () => {
            console.log('[onboarding-step] user opted out of drawing — default plot, then ask before generate.');
            // O.7.1: cancel the in-flight draw-wait listener/watchdog (we're leaving
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
        const body = this.clearBody();

        const typology = this.typologyLabel();
        console.log(`[onboarding-step] confirm step (source="${source}", typology="${this.typologyId}").`);

        const title = document.createElement('p');
        title.className = 'os-prompt';
        title.textContent = `Generate your ${typology} with AI?`;
        title.setAttribute('data-testid', 'onboarding-confirm-title');
        body.appendChild(title);

        const sub = document.createElement('p');
        sub.className = 'os-hint';
        sub.textContent = source === 'drawn'
            ? `We'll lay out rooms, walls, doors and windows inside the plot you drew.`
            : `We'll lay out rooms, walls, doors and windows inside your plot.`;
        body.appendChild(sub);

        const actions = document.createElement('div');
        actions.className = 'os-confirm-actions';

        const generate = document.createElement('button');
        generate.type = 'button';
        generate.className = 'os-btn os-btn--primary';
        generate.setAttribute('data-testid', 'onboarding-confirm-generate');
        generate.textContent = `Generate ${typology}`;

        const notNow = document.createElement('button');
        notNow.type = 'button';
        notNow.className = 'os-btn os-btn--ghost';
        notNow.setAttribute('data-testid', 'onboarding-confirm-notnow');
        notNow.textContent = `Not now — I'll design it myself`;

        actions.appendChild(generate);
        actions.appendChild(notNow);
        body.appendChild(actions);

        generate.addEventListener('click', () => {
            console.log('[onboarding-step] confirm → GENERATE (AI dispatch).');
            this.overlay?.classList.remove('os-onboarding-overlay--confirm');
            void this.generateAndFinish();
        });
        notNow.addEventListener('click', () => {
            console.log('[onboarding-step] confirm → NOT NOW — disposing overlay, leaving boundary/site intact (no generate).');
            this.toast('Saved your plot — generate any time from the AI panel.', 'info');
            this.dispose();
        });
    }

    private renderGeneratingStep(): void {
        this.step = 'generating';
        this.setDrawingPresentation(false);
        this.overlay?.classList.remove('os-onboarding-overlay--confirm');
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
     * Used by the draw watchdog + the "Skip drawing" escape hatch: authors a
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
     * Run the apartment generator from the authored boundary, then tear the
     * overlay down so the user lands in the canvas. Never throws.
     *
     * §FUTURE-TYPOLOGY: `generateApartmentFromBoundary` is the only typology-
     * specific call. A house/office Pack swaps THIS line; the location + parcel
     * steps above are identical for every typology.
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
            // O.12.c — forward the STRUCTURED brief so the user's captured
            // bedroom/bathroom/option choices drive the generated layout.
            await generateApartmentFromBoundary(this.runtime, this.briefMetadata);
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
}
