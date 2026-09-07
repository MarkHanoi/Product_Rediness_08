// §ENVELOPE-FACE-DRAG-PER-LEVEL (lane FACE-DRAG-BUTTON, 2026-09-07) — WHICH SURFACES CAN TAKE A
// FACE DRAG RIGHT NOW, AND WHAT THEY SAY WHEN THEY CANNOT.
//
// C16 CA-18 (a refusal names the reason AND the route back) · C115-27 (three visual states, never a
// dead click) · C84 EI-9 · C114 §10. Row L-13236.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHY THIS EXISTS: A PANEL COULD NOT ASK THE QUESTION IT HAD TO ANSWER
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `SiteEnvelopeDrawCesium.cannotDragReason()` already distinguishes three states in the user's own
// words — torn down · ports not wired · no frame seated — and each names its own next action. Until
// this file, its ONLY production caller wrote it to `console.log`. So the per-storey panel row had
// no way to ask *"can I offer a Drag face button, and if not, why not?"*, and its only options were
// a dead click or a sentence invented on a surface's behalf. Both are the D7 defect: a panel
// asserting a gesture the surface does not have.
//
// This is deliberately the SMALLEST possible mirror of `siteEnvelopeDrawArming`'s registration half
// (`registerEnvelopeDrawSurface` / `composeArmRefusal` / `ENVELOPE_DRAW_NO_SURFACE_REASON`) — a
// register, an unregister, and one composer. ⛔ It holds NO gesture state: the face drag has no
// arming, no owner and no in-progress ring, and giving it a mode here would turn a gesture that is
// always live into one that only works after a button press — a regression wearing a feature's
// clothes.
//
// ⛔ IT NEVER WRITES A REASON OF ITS OWN ABOUT A REGISTERED SURFACE. Every sentence below either
// comes verbatim from the surface that owns the answer, or covers the one case no surface can
// speak to: that there is no surface at all.

import { trace } from '@opentelemetry/api';
import { disarmEnvelopeDraw, isEnvelopeDrawArmed } from './siteEnvelopeDrawArming';
import {
    getSpaceEnvelopeFaceDragFocus,
    setSpaceEnvelopeFaceDragFocus,
    type SpaceEnvelopeFaceDragFocus,
} from './spaceEnvelopeFaceDragFocusState';

const _tracer = trace.getTracer('pryzm.site.spaceEnvelopeFaceDragSurfaces');

/**
 * What this register needs of a surface. ⚠ Deliberately NOT `SpaceEnvelopeDragSurface`: the four
 * drag ports are the GESTURE's contract and are answered per pointer event; this is the panel's
 * question and is answered per repaint. A surface implements both; conflating them would drag the
 * whole port surface into a file that only ever asks one thing.
 */
export interface SpaceEnvelopeFaceDragCapableSurface {
    /** Names the surface in logs and in a composed refusal. */
    readonly surfaceId: string;
    /** `null` ⇒ a plain yes. Otherwise the reason AND the route back, in the user's words. */
    cannotDragReason(): string | null;
}

const registered: SpaceEnvelopeFaceDragCapableSurface[] = [];

/**
 * A surface announces itself on mount. Returns its unregister, which its dispose MUST call — a
 * torn-down viewer left in this list would keep answering "yes, you can drag" for a canvas that no
 * longer exists.
 *
 * ⭐ AND UNREGISTERING THE LAST SURFACE RELEASES THE FOCUS. A focus is a restriction on a pick; a
 * restriction with nothing left to restrict is invisible state that would silently narrow the next
 * surface to mount. Releasing it is the only reading a user could act on.
 */
export function registerSpaceEnvelopeFaceDragSurface(
    surface: SpaceEnvelopeFaceDragCapableSurface,
): () => void {
    const span = _tracer.startSpan('pryzm.site.registerSpaceEnvelopeFaceDragSurface');
    try {
        if (!registered.includes(surface)) registered.push(surface);
        span.setAttribute('pryzm.faceDrag.surface', surface.surfaceId);
        span.setAttribute('pryzm.faceDrag.registered', registered.length);
        return () => {
            const i = registered.indexOf(surface);
            if (i >= 0) registered.splice(i, 1);
            if (registered.length === 0 && getSpaceEnvelopeFaceDragFocus() !== null) {
                setSpaceEnvelopeFaceDragFocus(null);
            }
        };
    } finally {
        span.end();
    }
}

/** How many face-drag surfaces are mounted right now. */
export function registeredSpaceEnvelopeFaceDragSurfaces(): number {
    return registered.length;
}

/**
 * The refusal when NO 3-D surface is mounted. ⛔ It names the 2-D map's exclusion explicitly rather
 * than leaving the user to discover it: C115-56 excludes the plan from face drag BY DESIGN — a plan
 * has no vertical axis, so there is no direction for a face to move along — and a user staring at a
 * 2-D map wondering why the button is off deserves the reason, not the symptom.
 */
export const SPACE_ENVELOPE_FACE_DRAG_NO_SURFACE_REASON =
    'Dragging a face needs a 3-D view under the pointer, and none is attached right now. Open 3D '
    + 'Site or the BIM 3-D viewport, then press Drag face again. The 2D Site Map is excluded on '
    + 'purpose — a plan has no vertical axis, so a face has no direction to move along there. This '
    + 'is a wiring state in PRYZM, not a finding about your envelope: you can still edit each '
    + 'storey outline with Edit perimeter.';

/**
 * §ENVELOPE-FACE-DRAG-PER-LEVEL — the sentence a refused *Drag face* carries back, composed from
 * the surfaces' OWN answers. Mirrors `composeArmRefusal()` exactly, and for the same reason: the
 * panel and a spec must read one producer rather than two spellings of one sentence.
 */
export function composeFaceDragRefusal(): string {
    if (registered.length === 0) return SPACE_ENVELOPE_FACE_DRAG_NO_SURFACE_REASON;
    const said: string[] = [];
    for (const s of registered) {
        let why: string | null = null;
        try { why = s.cannotDragReason(); }
        catch (e) { console.warn(`[site][envelope-face-drag] ${s.surfaceId}.cannotDragReason threw:`, e); }
        if (why !== null && why.trim() !== '') said.push(why.trim());
    }
    if (said.length === 0) {
        return `${registered.length} 3-D view(s) are attached, but none accepted the face drag and `
            + 'none said why. That is a wiring gap in PRYZM, not a finding about your envelope — you '
            + 'can still edit each storey outline with Edit perimeter.';
    }
    return said.join(' · ');
}

/** Whether a face drag can be taken right now, and — when it cannot — the surfaces' own reason. */
export interface SpaceEnvelopeFaceDragAvailability {
    readonly ok: boolean;
    /** How many mounted surfaces answered a plain yes. `0` whenever `ok` is false. */
    readonly surfaces: number;
    /** Present iff `!ok`. Names the reason AND the route back (C16 CA-18). */
    readonly reason?: string;
}

/**
 * ⭐ THE PANEL'S QUESTION, ANSWERED BY THE SURFACES. The analogue of
 * `spaceEnvelopeProfileEditTool.profileEditAvailability(id)` that PR-G-15 already leans on, so the
 * new per-storey control gets the same three visual states from the same discipline: a live button
 * where a drag is possible, a DISABLED one carrying the surfaces' own reason where it is not, and
 * never a dead click (C115-27).
 *
 * ⚠ IT ASKS EVERY SURFACE AND ACCEPTS ANY ONE YES. The founder may have BIM 3-D open while the 3-D
 * Site is mid-teardown; a verdict that required unanimity would refuse a gesture that works.
 */
export function spaceEnvelopeFaceDragAvailability(): SpaceEnvelopeFaceDragAvailability {
    let ok = 0;
    for (const s of registered) {
        try { if (s.cannotDragReason() === null) ok += 1; }
        catch { /* the composer below reports it — a throwing surface is not a yes */ }
    }
    if (ok > 0) return { ok: true, surfaces: ok };
    return { ok: false, surfaces: 0, reason: composeFaceDragRefusal() };
}

/**
 * ⭐ TAKE THE FOCUS — the founder's *"select a level"*, with the one conflict this app can actually
 * have designed out rather than discovered.
 *
 * ⛔ IT DISARMS THE PERIMETER DRAW. Both gestures live on the same canvas. The DRAW already wins
 * that collision from its side (`SiteEnvelopeDrawCesium.pickFace` answers `null` while a draw is
 * armed, so a corner-placing click can never also start a face drag). This closes the OTHER
 * direction: a user who selected a storey and then found their clicks placing vertices would read
 * the drag as broken, and nothing anywhere would say why. Selecting a storey to drag is a statement
 * that you have finished drawing.
 *
 * ⛔ IT DISPATCHES NOTHING AND WRITES NO STORE (P6). The one mutation of this whole feature stays
 * the single `spaceEnvelope.moveFace` the gesture dispatches on pointer-up (C114 §6a).
 *
 * P8: `pryzm.site.takeSpaceEnvelopeFaceDragFocus`.
 */
export function takeSpaceEnvelopeFaceDragFocus(next: SpaceEnvelopeFaceDragFocus): void {
    const span = _tracer.startSpan('pryzm.site.takeSpaceEnvelopeFaceDragFocus');
    try {
        if (isEnvelopeDrawArmed()) {
            const n = disarmEnvelopeDraw();
            span.setAttribute('pryzm.faceDragFocus.disarmedDraw', n);
            console.log(
                `[site][envelope-face-drag] §PER-LEVEL disarmed the perimeter draw on ${n} surface(s) — `
                + 'one canvas cannot be placing corners and pulling faces at the same time.',
            );
        }
        setSpaceEnvelopeFaceDragFocus(next);
        span.setAttribute('pryzm.faceDragFocus.id', next.spaceEnvelopeId);
    } finally {
        span.end();
    }
}

/** Release the focus. The gesture stays live and goes back to picking whatever is under the pointer. */
export function releaseSpaceEnvelopeFaceDragFocus(): void {
    setSpaceEnvelopeFaceDragFocus(null);
}

/** Test-only reset — drops every registration. The focus slot has its own reset. */
export function __resetSpaceEnvelopeFaceDragSurfacesForTests(): void {
    registered.length = 0;
}
