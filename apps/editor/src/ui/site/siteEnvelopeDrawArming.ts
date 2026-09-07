// §ENVELOPE-DRAW-ON-THE-SITE-VIEWS (lane ENVELOPE-DRAW, 2026-09-07) — THE ARMING REGISTRY, THE
// GESTURE DRIVER AND THE MODE STORE. One module, because they are one lifecycle.
//
// PLAN-ENVELOPE-DRAW-ON-SITE-VIEWS §2 "Arming registry" / "ESC / finish" / "Mode vocabulary" ·
// L-13050 · C58 §1.19 · C16 CA-18 · P6 · P8.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ ARM EVERY ATTACHED SURFACE; THE FIRST CLICK WINS AND DISARMS THE REST
// ══════════════════════════════════════════════════════════════════════════════════════════════
// This is `activatePlanOnlyTool.ts:139-167` transposed, and it SIDESTEPS the missing active-view
// accessor (L-5106, `elementAuthoringContext.ts:67-83`) entirely: nobody asks "which pane is
// active". Every registered surface is armed, the count of surfaces that accepted is returned, and
// when none did the refusal names WHY and the route back (C16 CA-18). The surface that receives the
// first click becomes the owner and the others are disarmed in that same call, so a user in the
// site-authoring split (2D map LEFT · 3D Site RIGHT) draws on whichever pane they clicked in.
//
// ⛔ THE DISARM SHIPS IN THE SAME MODULE AS THE ARM (plan §7 rule 12). L-7801 recorded what happens
// otherwise: arming had a function, disarming had none, Escape unwound the chrome and left the
// handler live, and the next click created another element. Every exit — finish, cancel, an
// explicit `disarmEnvelopeDraw()`, an unregister while armed — passes through `disarmAll()`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE GESTURE IS NOT FORKED (plan §7 rule 3)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `BoundaryPathAuthor` IS the ortho rule (the founder-ruled perpendicular foot), the 3-click arc and
// the undo semantics for the whole slab family. `boundaryLoopVertices` IS the rectangle / circle /
// ellipse generator. This module OWNS one instance of the first and CALLS the second; it re-derives
// neither. `SlabTool.ts:175` is already a diverged fourth polyline machine — this is not the fifth.
//
// ⛔ AND THE MODE TABLE IS NOT MINTED A SECOND TIME (plan §7 rule 6). `EnvelopeDrawMode` is the UNION
// of the two existing slab-family unions (`BoundaryDrawMode` + `BoundaryLoopMode`), spelled by
// their own type guards. It is deliberately NOT merged with `SiteBoundaryMap2D`'s
// `SiteBoundaryGesture` — that draws a PARCEL in lat/lon, this authors an ELEMENT in model space
// (L-1322: *"merging two things because they share three words is how the five spellings happened"*).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ ESC CANCELS · DOUBLE-CLICK / ENTER FINISHES · LOOP MODES FINISH ON THE SECOND CLICK
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Both site surfaces already agree on this (Cesium `SiteBoundaryDrawTool`, MapLibre `onDblClick` +
// the overlay `keyListener`), and `BOUNDARY_LOOP_GESTURE` already declares the two-click loop. The
// slab's four-ESC-owner layering is deliberately NOT inherited (plan §7 rule 9).
//
// ⛔ P6 — THIS MODULE DISPATCHES NOTHING. Its one output is `setDrawnEnvelopeFootprint`; the create
// panel reads that slot and dispatches the ONE `spaceEnvelope.batch.create` through the ONE plan.
// ⛔ MODE IS READ FRESH ON EVERY CLICK (the `activeSlabDrawMode.ts:59-63` rule): switching mode
// mid-draw applies to the next click and never re-arms — re-arming is what destroyed the slab's
// in-progress polyline and produced the founder's complaint the shared mode bar exists to remove.
//
// No DOM, no THREE, no renderer. Module-local state + listener sets only.

import { trace } from '@opentelemetry/api';
import {
    BoundaryPathAuthor,
    isBoundaryDrawMode,
    type ArcVertex2D,
} from '@pryzm/geometry-slab/boundary-path';
import {
    BOUNDARY_LOOP_GESTURE,
    boundaryLoopRefusal,
    boundaryLoopVertices,
    isBoundaryLoopMode,
} from '@pryzm/geometry-slab/boundary-loops';
// §C73-AREA-CANONICAL — the kernel's ONE shoelace, behind accessors. ⛔ Not a fourth private
// `signedAreaAbs` (plan §7 rule 8: `SiteBoundaryDrawTool` and `SiteBoundaryMap2D` each carry one
// already; this lane consumes the canonical body instead of adding a copy).
import { polygonSignedAreaOrdinates } from '@pryzm/geometry-kernel';
// §ENVELOPE-MODE-BAR (L-13152) — the wall's OWN three path constants, spread rather than retyped.
// ⛔ The founder asked for *"the draw tool as you see on the image — as we have in pryzm"*, and
// `boundary-line` already establishes the pattern for that claim: spread `WALL_DRAW_MODES` so
// "same as the wall" is true BY CONSTRUCTION and cannot drift into three matching literals.
import { WALL_DRAW_MODES, type CreationMode } from '@app/engine/views/plantools/elementCreationMatrix';
import type { EnvelopeDrawSink, EnvelopeDrawSurface, SceneXZPoint } from './envelopeDrawSurface';
import {
    getDrawnEnvelopeFootprint,
    setDrawnEnvelopeFootprint,
    subscribeDrawnEnvelopeFootprint,
    type EnvelopeDrawMode,
} from './drawnEnvelopeFootprintState';

const _tracer = trace.getTracer('pryzm.site.siteEnvelopeDrawArming');

export type { EnvelopeDrawMode } from './drawnEnvelopeFootprintState';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ §ENVELOPE-MODE-BAR (L-13152) — THE PILLS, AND WHY THEY ARE DECLARED HERE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The founder, twice: *"i would like the panel with curved - stright line - orothogonal etc.. as we
// have with the slab / wall tool in pryzm views"* and *"I need the draw tool as you see on the image
// 4 - as we have in pryzm"*.
//
// ⛔ THE MODE STORE BELOW WAS BUILT AND NEVER WIRED. `setEnvelopeDrawMode` had **zero production
// callers** — only its own spec — so the six gestures existed, `resolveEnvelopeDrawMode()` was read
// fresh on every click exactly as designed, and the user could never reach any of them: every
// perimeter was drawn in the `'linear'` default. That is [[authored-but-unwired-is-the-bottleneck]]
// in its purest form, and it is why the bar was missing rather than broken.
//
// ⛔ THE BAR IS `DrawingModeBar`, NOT A SECOND ONE. That component is the shared successor that
// already replaced four hand-maintained HUD copies and is already reused by pool, balcony and
// boundary-line through `activatePlanOnlyTool`; the wall's `.wdh-bar` in the founder's screenshot is
// its predecessor's markup and its own stylesheet. A second strip with its own key bindings and its
// own idea of what "orthogonal" means is the rival-mechanism defect this repo keeps logging.
//
// ⛔ AND THE ROW IS *NOT* ADDED TO `ELEMENT_CREATION_MATRIX`. Every consumer of that table treats a
// row as a PLAN/3-D element tool — `planAutoModeReachability`, `pointerReachesArmedHandler` and the
// activator-coverage gates all iterate it and would report a real, permanent violation for a tool
// that has no plan handler, no `ToolManager` key and no 3-D arm because it draws on a GLOBE. Minting
// false violations to look tidy is the exact defect CLAUDE.md records for the layer table. The three
// PATH constants are still shared with the wall by spreading `WALL_DRAW_MODES`; only the loop rows,
// whose ids and keys already match every other family, are spelled here.
export const ENVELOPE_DRAW_BAR_MODES: readonly CreationMode[] = Object.freeze([
    ...WALL_DRAW_MODES,
    // ⛔ SAME IDS AND SAME KEYS as the wall / slab / floor / boundary-line rows — they are
    // `BoundaryLoopMode` from @pryzm/geometry-slab, the module that turns each into vertices, and
    // `boundaryLoopVertices` below is the generator this gesture already calls.
    { id: 'rectangular', key: 'Q', label: 'Rectangular', description: 'Closed perimeter from two opposite corners' },
    { id: 'circular',    key: 'I', label: 'Circular',    description: 'Closed perimeter from centre and rim' },
    { id: 'elliptical',  key: 'E', label: 'Elliptical',  description: 'Closed perimeter from centre and bounding corner' },
    // ⭐ PRESENT, DISABLED, AND IT SAYS WHY — the founder's own rule for this bar. "By Slab" is a
    // real wall mode and it is INAPPLICABLE HERE, which is a different fact from "not implemented":
    // this gesture runs on the 2-D Site Map and the 3-D globe, where there is no slab to pick, and
    // `EnvelopeDrawSurface` has no slab picker to give it one. Omitting it would make the bar read as
    // a smaller, different tool than the one he already knows; rendering it live would be a dead
    // click. ⚠ If a site view ever gains a slab pick, this string is what has to go — and a grep
    // for `unavailable` finds it.
    {
        id: 'byslab', key: 'S', label: 'By Slab', isAction: true,
        description: 'Create the perimeter from a selected slab',
        unavailable:
            'Not on a site view — “By Slab” traces a slab you have selected in the BIM model, and the '
            + 'envelope perimeter is drawn on the map or the globe, where there is no slab to pick. Draw '
            + 'the corners, or use one of the closed shapes.',
    },
]);

/**
 * Bar order. The three path constraints first, then the three closed loops — the slab strip's order.
 *
 * ⛔ DERIVED FROM THE PILLS, NEVER TYPED TWICE (C84 EI-9). This list is what the GESTURE accepts and
 * the list above is what the USER is offered; two literals would let the bar offer a seventh pill
 * that `setEnvelopeDrawMode` silently ignores, which is a dead control that looks alive. Anything the
 * bar declares UNAVAILABLE is not a gesture mode and is filtered out here by the same field the bar
 * greys it with, so the two cannot disagree about which is which.
 */
export const ENVELOPE_DRAW_MODES: readonly EnvelopeDrawMode[] = Object.freeze(
    ENVELOPE_DRAW_BAR_MODES
        .filter((m) => m.unavailable === undefined)
        .map((m) => m.id)
        .filter((id): id is EnvelopeDrawMode => isEnvelopeDrawModeId(id)),
);

/** The narrowing `ENVELOPE_DRAW_MODES` uses, declared before it so the freeze above can call it. */
function isEnvelopeDrawModeId(v: unknown): v is EnvelopeDrawMode {
    return isBoundaryDrawMode(v) || isBoundaryLoopMode(v);
}

/** Narrows an arbitrary picker string to one of the six. Spelled by the two existing guards. */
export function isEnvelopeDrawMode(v: unknown): v is EnvelopeDrawMode {
    return isEnvelopeDrawModeId(v);
}

// ── THE MODE STORE ──────────────────────────────────────────────────────────────────────────────

/** LINEAR is the default — the freeform polyline. A user who never opens the strip gets that. */
let _mode: EnvelopeDrawMode = 'linear';
const modeListeners = new Set<() => void>();

/** Record the selected mode. From ANY strip instance; the value outlives every strip. Never re-arms. */
export function setEnvelopeDrawMode(mode: unknown): void {
    const span = _tracer.startSpan('pryzm.site.setEnvelopeDrawMode');
    try {
        const applied = isEnvelopeDrawMode(mode);
        if (applied && mode !== _mode) {
            _mode = mode;
            // A pending loop anchor or arc midpoint from the OLD mode would be misread by the new
            // one (a rectangle's corner A is not an arc's midpoint). Drop the half-gesture, keep the
            // committed vertices — the next click continues the path under the new constraint.
            loopFirst = null;
            if (author.pendingArcMidpoint !== null) author.undo();
            repaintPreview();
            for (const fn of [...modeListeners]) { try { fn(); } catch { /* listener's problem */ } }
        }
        span.setAttribute('pryzm.envelopeDraw.mode', _mode);
        span.setAttribute('pryzm.envelopeDraw.applied', applied);
    } finally {
        span.end();
    }
}

/** Read fresh on every click / move — the `WallModePicker.getActiveMode()` contract. */
export function resolveEnvelopeDrawMode(): EnvelopeDrawMode {
    return _mode;
}

export function subscribeEnvelopeDrawMode(fn: () => void): () => void {
    modeListeners.add(fn);
    return () => { modeListeners.delete(fn); };
}

// ── THE REGISTRY ────────────────────────────────────────────────────────────────────────────────

/** Every surface currently mounted, in registration order. */
const registered: EnvelopeDrawSurface[] = [];
/** The subset currently armed (their sinks are honoured). */
const armed = new Set<EnvelopeDrawSurface>();
/** The surface that received the first click of this gesture, or null before it. */
let owner: EnvelopeDrawSurface | null = null;

const author = new BoundaryPathAuthor();
/** Loop modes: the first click (corner A / centre), or null while awaiting it. */
let loopFirst: SceneXZPoint | null = null;
/** The last pointer position over ground, for the rubber-band. */
let cursor: SceneXZPoint | null = null;

// ── ⭐ §ENVELOPE-DRAW-SETTLED-RING (L-13148) — THE FINISHED PERIMETER STAYS ON SCREEN ───────
//
// The founder: *"when i click enter - it desappar from hte screen - it should continue"*.
//
// ⛔ THE VANISH WAS NOT A BUG IN AN ADAPTER — it was a gap in the LIFECYCLE. `finish()` stores the
// ring and calls `disarmAll()`; `disarm()` clears the in-progress preview, correctly, because the
// gesture is over. Nothing was ever asked to draw the ring that is now STORED, so the user closed
// a perimeter, was handed a panel that talks about it, and had nothing on screen to decide about
// while he chose a storey count.
//
// ⛔ IT IS KEPT ALIVE BY THE SLOT, NOT BY THIS MODULE'S GESTURE STATE, AND THAT IS THE DESIGN.
// `drawnEnvelopeFootprintState` is already the ONE answer to *"what perimeter is current?"* — the
// panel's source line, its discard button and the plan's ring all read it. Hanging the picture off
// the same slot means the picture cannot outlive the drawing or disappear while it survives, in
// any of the five ways the slot can change (redraw, discard, a degenerate ring being refused, the
// panel clearing it, a test reset). A second lifetime here would be a second answer.
/** The surface currently showing a settled ring, or `null`. Cleared through `clearSettledRing`. */
let settledOn: EnvelopeDrawSurface | null = null;

function paintSettledRing(surface: EnvelopeDrawSurface, ring: readonly SceneXZPoint[]): void {
    ensureSlotSubscription();
    clearSettledRing();
    // ⚠ A SURFACE THAT DOES NOT IMPLEMENT IT IS NOT AN ERROR. The ring is stored either way and
    // the panel names it; only the picture is absent, which is exactly what an optional port method
    // means. Recording the owner anyway would leave a clear pointed at nothing.
    if (typeof surface.drawSettledRing !== 'function') return;
    try {
        surface.drawSettledRing(ring);
        settledOn = surface;
    } catch (e) {
        console.warn('[site][envelope-draw] settled-ring draw threw (non-fatal):', e);
    }
}

function clearSettledRing(): void {
    const s = settledOn;
    settledOn = null;
    if (!s) return;
    try { s.clearSettledRing?.(); } catch { /* surface may be mid-teardown */ }
}

/**
 * ⛔ ONE SUBSCRIPTION, INSTALLED WHEN THE FIRST RING IS PAINTED AND NEVER TORN DOWN. It is what
 * makes *"the drawing was discarded but its outline is still on the globe"* unrepresentable rather
 * than a branch every caller has to remember ([[authored-but-unwired-is-the-bottleneck]]).
 *
 * ⚠ IT IS LAZY RATHER THAN MODULE-LOAD, AND THAT IS NOT STYLE. `__resetDrawnEnvelopeFootprintForTests`
 * calls `listeners.clear()` — it drops EVERY subscriber, including this one — so a module-load
 * subscription is dead from the first `beforeEach` onwards and the clear-on-discard rule would be
 * green in production and silently absent under test, which is the [[fake-more-capable-than-real]]
 * shape inverted. Installing it at the moment a ring is painted, and dropping the handle in this
 * module's own test reset, keeps the two in step.
 */
let slotUnsub: (() => void) | null = null;

function ensureSlotSubscription(): void {
    if (slotUnsub !== null) return;
    slotUnsub = subscribeDrawnEnvelopeFootprint(() => {
        if (getDrawnEnvelopeFootprint() === null) clearSettledRing();
    });
}

/** What the gesture is doing, in the user's words — read by the panel's status line. */
export interface EnvelopeDrawStatus {
    readonly armed: boolean;
    /** How many surfaces are currently armed (0 when idle). */
    readonly surfaces: number;
    /** The surface that owns the gesture in progress, once a first click has landed. */
    readonly owner: EnvelopeDrawSurface['surfaceId'] | null;
    readonly mode: EnvelopeDrawMode;
    /** Vertices placed so far (path modes) — 0 or 1 in loop modes. */
    readonly vertices: number;
    /** The next thing to do, in one sentence. Empty when idle. */
    readonly hint: string;
    /** The last refusal (a degenerate loop, a close with too few corners), or null. Cleared on the next click. */
    readonly refusal: string | null;
}

const statusListeners = new Set<() => void>();
let lastRefusal: string | null = null;

function notifyStatus(): void {
    for (const fn of [...statusListeners]) {
        try { fn(); } catch (e) { console.warn('[site][envelope-draw] status listener threw (non-fatal):', e); }
    }
}

/** Subscribe to arm/disarm/click state — the Draw button paints its pressed state from it. */
export function subscribeEnvelopeDrawStatus(fn: () => void): () => void {
    statusListeners.add(fn);
    return () => { statusListeners.delete(fn); };
}

function hintFor(): string {
    if (armed.size === 0) return '';
    const mode = _mode;
    if (isBoundaryLoopMode(mode)) {
        const g = BOUNDARY_LOOP_GESTURE[mode];
        return loopFirst === null
            ? `${g.first} · Esc cancels.`
            : `${g.second} — the shape closes on this click · Backspace re-picks the first · Esc cancels.`;
    }
    if (author.pendingArcMidpoint !== null) {
        return 'Click the arc END — the last click was the arc midpoint · Backspace re-picks the bulge · Esc cancels.';
    }
    if (author.pointCount === 0) {
        return 'Click to place the first corner of the envelope perimeter · Esc cancels.';
    }
    return author.canClose()
        ? 'Click the next corner · double-click or Enter closes the perimeter · Backspace removes the last corner · Esc cancels.'
        : 'Click the next corner (a perimeter needs three) · Backspace removes the last corner · Esc cancels.';
}

export function getEnvelopeDrawStatus(): EnvelopeDrawStatus {
    return {
        armed: armed.size > 0,
        surfaces: armed.size,
        owner: owner?.surfaceId ?? null,
        mode: _mode,
        vertices: isBoundaryLoopMode(_mode) ? (loopFirst === null ? 0 : 1) : author.pointCount,
        hint: hintFor(),
        refusal: lastRefusal,
    };
}

export function isEnvelopeDrawArmed(): boolean {
    return armed.size > 0;
}

/**
 * A surface announces itself on mount. Returns its unregister, which a dispose MUST call: an
 * unregister while armed disarms that surface first, so a torn-down map can never be the owner of
 * a gesture the user is still making on the other pane.
 */
export function registerEnvelopeDrawSurface(surface: EnvelopeDrawSurface): () => void {
    const span = _tracer.startSpan('pryzm.site.registerEnvelopeDrawSurface');
    try {
        if (!registered.includes(surface)) registered.push(surface);
        span.setAttribute('pryzm.envelopeDraw.surface', surface.surfaceId);
        span.setAttribute('pryzm.envelopeDraw.registered', registered.length);
        return () => {
            const i = registered.indexOf(surface);
            if (i >= 0) registered.splice(i, 1);
            // The surface holding the settled outline is going away with its entities; drop the
            // pointer so a later clear does not call into a torn-down viewer.
            if (settledOn === surface) settledOn = null;
            if (armed.has(surface)) {
                armed.delete(surface);
                try { surface.disarm(); } catch { /* mid-teardown */ }
                if (owner === surface) {
                    // The gesture's owner is gone: there is nothing left to finish it on.
                    resetGesture();
                    disarmAll();
                }
                notifyStatus();
            }
        };
    } finally {
        span.end();
    }
}

/** How many surfaces are registered right now (mounted, whether or not armed). */
export function registeredEnvelopeDrawSurfaces(): number {
    return registered.length;
}

export interface EnvelopeDrawActivation {
    readonly ok: boolean;
    /** How many surfaces accepted the arm. `0` whenever `ok` is false. */
    readonly surfaces: number;
    /** Present iff `!ok`. Names the reason AND the route back (C16 CA-18). */
    readonly reason?: string;
}

/** The refusal when no site surface is mounted — the route back is the site-authoring split. */
export const ENVELOPE_DRAW_NO_SURFACE_REASON =
    'Drawing the envelope perimeter needs a site view under the pointer, and none is attached '
    + 'right now. Open the 2D Site Map or 3D Site (the site-authoring split shows both), then press '
    + 'Draw again. This is a wiring state in PRYZM, not a finding about your parcel — you can still '
    + 'extrude the permitted footprint or your fitted plate from this panel.';

/**
 * §ENVELOPE-DRAW C5 — the refusal an arm that accepted NOTHING carries back. See the call site.
 * Exported so the panel and a spec read the same producer rather than two spellings.
 */
export function composeArmRefusal(): string {
    if (registered.length === 0) return ENVELOPE_DRAW_NO_SURFACE_REASON;
    const said: string[] = [];
    for (const s of registered) {
        let why: string | null = null;
        try { why = s.cannotArmReason?.() ?? null; }
        catch (e) { console.warn(`[site][envelope-draw] ${s.surfaceId}.cannotArmReason threw:`, e); }
        if (why !== null && why.trim() !== '') said.push(why.trim());
    }
    if (said.length === 0) {
        return `${registered.length} site view(s) are attached, but none accepted the drawing and `
            + 'none said why. That is a wiring gap in PRYZM, not a finding about your parcel — you '
            + 'can still extrude the permitted footprint or your fitted plate from this panel.';
    }
    return said.join(' · ');
}

function resetGesture(): void {
    author.reset();
    loopFirst = null;
    cursor = null;
    owner = null;
}

function disarmAll(): void {
    for (const s of [...armed]) {
        armed.delete(s);
        try { s.disarm(); } catch (e) { console.warn('[site][envelope-draw] disarm threw (non-fatal):', e); }
        try { s.clearPreview(); } catch { /* surface may be mid-teardown */ }
    }
}

/**
 * Arm the draw on EVERY registered surface. Re-arming while armed restarts the gesture (the
 * previous half-drawn ring is dropped — it was never stored). Never throws.
 *
 * P8: `pryzm.site.armEnvelopeDraw`.
 */
export function armEnvelopeDraw(): EnvelopeDrawActivation {
    const span = _tracer.startSpan('pryzm.site.armEnvelopeDraw');
    try {
        if (armed.size > 0) { resetGesture(); disarmAll(); }
        // ⛔ THE PREVIOUS DRAWING'S OUTLINE GOES WHEN A NEW DRAW STARTS, not when it finishes. A
        // user re-arming has decided to replace the perimeter; leaving the old one painted would
        // put two rings on the globe and no way to tell which one the panel is talking about.
        clearSettledRing();
        lastRefusal = null;
        let accepted = 0;
        for (const surface of registered) {
            let ok = false;
            try { ok = surface.arm(makeSink(surface)); }
            catch (e) { console.warn(`[site][envelope-draw] ${surface.surfaceId}.arm threw (non-fatal):`, e); }
            if (ok) { armed.add(surface); accepted++; }
        }
        span.setAttribute('pryzm.envelopeDraw.registered', registered.length);
        span.setAttribute('pryzm.envelopeDraw.accepted', accepted);
        if (accepted === 0) {
            // ⭐ §ENVELOPE-DRAW C5 — A SURFACE THAT IS ATTACHED BUT CANNOT ARM GETS TO SAY WHY.
            // With no surface registered the refusal is the generic one (the route back is "open a
            // site view"). With surfaces registered that generic sentence is TRUE ABOUT THE WRONG
            // THING — it sends the user to open a view they are already looking at — so the
            // surfaces' own reasons are printed instead, each naming its own next action (C16
            // CA-18). ⛔ A surface that supplies no reason contributes none; nothing is invented on
            // its behalf.
            const reason = composeArmRefusal();
            console.warn(
                `[site][envelope-draw] §ENVELOPE-DRAW arm REFUSED — ${registered.length} surface(s) registered, `
                + '0 accepted. ' + reason,
            );
            notifyStatus();
            return { ok: false, surfaces: 0, reason };
        }
        console.log(
            `[site][envelope-draw] §ENVELOPE-DRAW armed on ${accepted} surface(s) `
            + `(${[...armed].map((s) => s.surfaceId).join(', ')}) · mode=${_mode} · the first click wins.`,
        );
        notifyStatus();
        return { ok: true, surfaces: accepted };
    } finally {
        span.end();
    }
}

/**
 * Disarm every armed surface and drop the in-progress ring. The stored (finished) drawing, if any,
 * is NOT touched — cancelling a redraw must not destroy the drawing already handed to the panel.
 *
 * @returns how many surfaces were disarmed.
 * P8: `pryzm.site.disarmEnvelopeDraw`.
 */
export function disarmEnvelopeDraw(): number {
    const span = _tracer.startSpan('pryzm.site.disarmEnvelopeDraw');
    try {
        const n = armed.size;
        resetGesture();
        disarmAll();
        span.setAttribute('pryzm.envelopeDraw.disarmed', n);
        if (n > 0) console.log(`[site][envelope-draw] §ENVELOPE-DRAW disarmed ${n} surface(s).`);
        notifyStatus();
        return n;
    } finally {
        span.end();
    }
}

// ── THE GESTURE ─────────────────────────────────────────────────────────────────────────────────

function repaintPreview(): void {
    const target = owner;
    if (!target || !armed.has(target)) return;
    const mode = _mode;
    try {
        if (isBoundaryLoopMode(mode)) {
            if (loopFirst === null) { target.drawPreview([], [], false); return; }
            const ring = cursor ? boundaryLoopVertices(mode, loopFirst, cursor) : [];
            // Below the loop's minimum extent the generator returns []; show the anchor alone.
            target.drawPreview(ring.length >= 3 ? [] : [loopFirst], ring, ring.length >= 3);
            return;
        }
        const committed = author.points;
        const tail = author.previewTail(mode, cursor);
        target.drawPreview(committed, tail, committed.length + tail.length >= 3);
    } catch (e) {
        console.warn('[site][envelope-draw] preview draw threw (non-fatal):', e);
    }
}

/**
 * §ENVELOPE-DRAW C5 — DROP CONSECUTIVE COINCIDENT CORNERS (including last-vs-first).
 *
 * ⭐ THIS IS ONE RULE FOR BOTH RENDERERS, NOT A CESIUM PATCH. Every double-click-to-close gesture
 * on both surfaces emits the closing click as a corner FIRST and the finish SECOND — Cesium fires
 * LEFT_CLICK, LEFT_CLICK, LEFT_DOUBLE_CLICK; MapLibre fires click, click, dblclick — so the ring
 * arrives with its last corner sitting on top of the previous one. A zero-length edge in a
 * committed footprint is a real defect (it is a polygon vertex that no consumer can normal), and
 * fixing it with a per-adapter pixel/time heuristic would mint TWO heuristics that disagree.
 *
 * ⛔ IT IS A COLLAPSE, NEVER A SIMPLIFY. Only exactly-coincident neighbours go (1 mm, well under
 * any real corner); no collinear-vertex removal, no smoothing, no reordering. The user's corners
 * are the user's corners.
 */
function collapseCoincident(ring: readonly ArcVertex2D[]): ArcVertex2D[] {
    const EPS_M = 1e-3;
    const out: ArcVertex2D[] = [];
    for (const p of ring) {
        const prev = out[out.length - 1];
        if (prev && Math.abs(prev.x - p.x) < EPS_M && Math.abs(prev.z - p.z) < EPS_M) continue;
        out.push({ x: p.x, z: p.z });
    }
    while (out.length >= 2) {
        const a = out[0]!;
        const b = out[out.length - 1]!;
        if (Math.abs(a.x - b.x) < EPS_M && Math.abs(a.z - b.z) < EPS_M) out.pop();
        else break;
    }
    return out;
}

function finish(rawRing: readonly ArcVertex2D[], mode: EnvelopeDrawMode): void {
    const from = owner;
    if (!from) return;
    const ring = collapseCoincident(rawRing);
    if (ring.length < 3) {
        // The collapse ate the perimeter — every corner landed on the same spot. That is a REFUSAL
        // for the user to read, never a ring to hand the planner (the store refuses it anyway).
        lastRefusal =
            `Those ${rawRing.length} corners are all on the same spot, so there is no perimeter to `
            + 'close. Place corners further apart and try again — nothing was stored.';
        notifyStatus();
        return;
    }
    const areaM2 = Math.abs(polygonSignedAreaOrdinates(ring.length, (i) => ring[i]!.x, (i) => ring[i]!.z));
    const stored = ring.map((p) => ({ x: p.x, z: p.z }));
    resetGesture();
    disarmAll();
    setDrawnEnvelopeFootprint({ ring: stored, areaM2, surfaceId: from.surfaceId, mode });
    // ⭐ §ENVELOPE-DRAW-SETTLED-RING — AFTER the store write, never before: the write is the thing
    // that can refuse (a degenerate ring), and painting first would leave an outline on screen for
    // a perimeter the slot rejected. `from` is captured above because `resetGesture()` has already
    // nulled `owner` by the time we get here.
    paintSettledRing(from, stored);
    console.log(
        `[site][envelope-draw] §ENVELOPE-DRAW finished on ${from.surfaceId}: ${stored.length} corners · `
        + `${areaM2.toFixed(1)} m² · mode=${mode}. Handed to the create panel — nothing is dispatched here (P6).`,
    );
    notifyStatus();
}

function makeSink(surface: EnvelopeDrawSurface): EnvelopeDrawSink {
    const live = (): boolean => armed.has(surface);
    return {
        onPoint(p: SceneXZPoint): void {
            if (!live()) return;
            lastRefusal = null;
            if (owner === null) {
                // ⭐ THE FIRST CLICK WINS. Every other surface is disarmed in this same call.
                owner = surface;
                for (const s of [...armed]) {
                    if (s === surface) continue;
                    armed.delete(s);
                    try { s.disarm(); } catch { /* mid-teardown */ }
                    try { s.clearPreview(); } catch { /* ditto */ }
                }
            } else if (owner !== surface) {
                return; // a late event from a surface that lost the race
            }
            const mode = _mode; // ⛔ read fresh per click, never latched at arm
            cursor = p;
            if (isBoundaryLoopMode(mode)) {
                if (loopFirst === null) {
                    loopFirst = { x: p.x, z: p.z };
                    repaintPreview();
                    notifyStatus();
                    return;
                }
                const refusal = boundaryLoopRefusal(mode, loopFirst, p);
                if (refusal !== null) {
                    lastRefusal = refusal;
                    repaintPreview();
                    notifyStatus();
                    return;
                }
                finish(boundaryLoopVertices(mode, loopFirst, p), mode);
                return;
            }
            author.click(mode, { x: p.x, z: p.z });
            repaintPreview();
            notifyStatus();
        },
        onMove(p: SceneXZPoint | null): void {
            if (!live()) return;
            if (owner !== null && owner !== surface) return;
            cursor = p;
            if (owner === surface) repaintPreview();
        },
        onFinish(): void {
            if (!live() || owner !== surface) return;
            const mode = _mode;
            if (isBoundaryLoopMode(mode)) return; // loops close on their second click
            if (!author.canClose()) {
                lastRefusal = author.pendingArcMidpoint !== null
                    ? 'The perimeter cannot close while an arc is half-drawn: click the arc END first, '
                      + 'or press Backspace to drop the midpoint.'
                    : `A perimeter needs at least three corners — ${author.pointCount} placed so far. `
                      + 'Nothing was closed.';
                notifyStatus();
                return;
            }
            finish(author.points, mode);
        },
        onUndo(): void {
            if (!live() || owner !== surface) return;
            if (isBoundaryLoopMode(_mode)) loopFirst = null;
            else author.undo();
            lastRefusal = null;
            repaintPreview();
            notifyStatus();
        },
        onCancel(): void {
            if (!live()) return;
            // The stored drawing (if any) survives — see `disarmEnvelopeDraw`.
            resetGesture();
            disarmAll();
            console.log(`[site][envelope-draw] §ENVELOPE-DRAW cancelled from ${surface.surfaceId} — nothing stored.`);
            notifyStatus();
        },
    };
}

/** Test-only reset — drops surfaces, listeners, the gesture and the mode. */
export function __resetEnvelopeDrawArmingForTests(): void {
    clearSettledRing();
    // ⛔ The handle is DROPPED, not called: `__resetDrawnEnvelopeFootprintForTests` clears the whole
    // listener set, so the stored unsubscribe already points at nothing. Dropping it is what lets
    // the next paint install a live one. See `ensureSlotSubscription`.
    slotUnsub = null;
    resetGesture();
    for (const s of [...armed]) { armed.delete(s); try { s.disarm(); } catch { /* ignore */ } }
    registered.length = 0;
    statusListeners.clear();
    modeListeners.clear();
    lastRefusal = null;
    _mode = 'linear';
}
