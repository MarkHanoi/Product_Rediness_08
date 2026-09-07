// §ENVELOPE-FACE-DRAG-PER-LEVEL (lane FACE-DRAG-BUTTON, 2026-09-07) — WHICH STOREY THE NEXT FACE
// GRAB BELONGS TO, and the push channel that tells the surfaces and the panel about it.
//
// Founder: *"SO THE USER COULD SELECT A LEVEL AND DRAG THE FACES OF EACH VOLUME PER LEVEL"*.
// C114 §10 · C115-56 · C115-27 · C16 CA-18 · C84 EI-9 · P6 · P8. Row L-13236.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT THIS IS, AND — MORE IMPORTANTLY — WHAT IT IS NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// It is NOT an arming slot. The face-drag gesture needs no arming and has none: it is installed
// unconditionally on both 3-D surfaces and is live whenever an envelope is under the pointer
// (`GISAreaLayout.ts` for the 3-D Site, `attachSpaceEnvelopeRender.ts` for BIM 3-D). Turning it
// into a mode would be a REGRESSION dressed as a feature — the gesture would stop working for
// every user who did not first find the button.
//
// It is a SUBJECT. With five storeys stacked on one footprint, every face of Level 2 has Level 1
// below it and Level 3 above it in the same screen pixels, and a low camera makes a mis-grab a
// certainty rather than a risk. The founder's sentence asks for the fix by name: *select a level*,
// then drag ITS faces. This slot is that selection, and it does exactly three things:
//   1. it RESTRICTS the pick to the focused envelope, so a pull aimed at Level 2 cannot land on
//      Level 3 (`siteEnvelopeDrawCesium.pickFace`);
//   2. it makes that storey's faces VISIBLE — the arrow affordance stands on the focused envelope
//      even when the pointer is nowhere near it (the same file's `handles` port);
//   3. it gives the per-storey panel row something to say and something to toggle.
//
// ⛔ IT STORES AN ID, NEVER A RECORD. §L-545-SITE-CAPTURE: a record captured here is one the store
// may no longer hold by the time it is read — after an undo, a project switch or a re-compose. The
// readers already have the ONE store reader they need; what they lack is WHICH id, and that is all
// this carries. The `label` beside it is for a SENTENCE, never for a lookup.
//
// ⛔ SESSION-ONLY, NOT PERSISTED, AND THAT IS A DECISION — the argument
// `drawnEnvelopeFootprintState.ts:14-20` makes, applied one step further out. An ENVELOPE is a
// design fact and persists (it is an element). A FOCUS is a statement about where this user's
// pointer attention is in this session; restoring one on the next load would silently restrict the
// pick on a surface nobody had touched yet, which is the worst possible shape for a restriction.
//
// ⛔ P6 — NOTHING HERE MUTATES A DESIGN. The one mutation the whole feature makes is still exactly
// one `spaceEnvelope.moveFace` dispatched by the gesture on pointer-up (C114 §6a). Taking or
// releasing a focus dispatches nothing, writes no store and changes no geometry.
//
// PURE except for one module-local slot and a listener set. No DOM, no THREE, no I/O, and — by
// design — no import of the arming registry: the mutual exclusion with the perimeter DRAW lives one
// level up, in `spaceEnvelopeFaceDragSurfaces.ts`, so this stays a slot rather than a controller.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.site.spaceEnvelopeFaceDragFocusState');

/** The storey whose faces the next grab belongs to. */
export interface SpaceEnvelopeFaceDragFocus {
    /** The `spaceEnvelope` element id. ⛔ An id, never a record — see the header. */
    readonly spaceEnvelopeId: string;
    /**
     * How the panel named that storey ("Ground", "Level 2"). Carried so a refusal or a readout can
     * say WHICH storey without re-deriving a name from the store — two spellings of one storey's
     * name is the C84 EI-9 shape at its smallest. ⛔ Never used to look anything up.
     */
    readonly label: string;
}

type Listener = () => void;

const listeners = new Set<Listener>();

/** `null` ⇒ no storey is focused, and the gesture picks whatever is under the pointer. */
let focus: SpaceEnvelopeFaceDragFocus | null = null;

function notify(): void {
    for (const fn of [...listeners]) {
        try {
            fn();
        } catch (e) {
            console.warn('[site][envelope-face-drag] §PER-LEVEL focus listener threw (non-fatal):', e);
        }
    }
}

/** THE ONE READ. */
export function getSpaceEnvelopeFaceDragFocus(): SpaceEnvelopeFaceDragFocus | null {
    return focus;
}

/**
 * THE ONE WRITE. Pass `null` to release.
 *
 * ⛔ AN EMPTY ID IS REFUSED RATHER THAN STORED. A focus on `''` would restrict the pick to an
 * envelope that cannot exist — i.e. it would silently make every face un-grabbable, which reads to
 * the user as "the drag is broken" and to a reviewer as "the focus works". Refusing loudly is the
 * only reading of that state that anyone can act on.
 *
 * P8: `pryzm.site.setSpaceEnvelopeFaceDragFocus`.
 */
export function setSpaceEnvelopeFaceDragFocus(next: SpaceEnvelopeFaceDragFocus | null): void {
    const span = _tracer.startSpan('pryzm.site.setSpaceEnvelopeFaceDragFocus');
    try {
        if (next !== null && (typeof next.spaceEnvelopeId !== 'string' || next.spaceEnvelopeId.trim() === '')) {
            span.setAttribute('pryzm.faceDragFocus.refused', 'empty-id');
            console.warn(
                '[site][envelope-face-drag] §PER-LEVEL refused a focus with no envelope id — that '
                + 'would make EVERY face un-grabbable while looking like a working focus. The slot '
                + 'is unchanged.',
            );
            return;
        }
        if (focus === next) return;
        if (focus !== null && next !== null && focus.spaceEnvelopeId === next.spaceEnvelopeId
            && focus.label === next.label) return;
        focus = next;
        span.setAttribute('pryzm.faceDragFocus.present', next !== null);
        if (next !== null) span.setAttribute('pryzm.faceDragFocus.id', next.spaceEnvelopeId);
        notify();
    } finally {
        span.end();
    }
}

/** Subscribe a surface or panel. Returns its own unsubscribe. */
export function subscribeSpaceEnvelopeFaceDragFocus(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/** Release the focus. The gesture goes back to picking whatever is under the pointer. */
export function clearSpaceEnvelopeFaceDragFocus(): void {
    setSpaceEnvelopeFaceDragFocus(null);
}

/**
 * Is this envelope the focused one? `true` for every envelope when nothing is focused — i.e. the
 * UNFOCUSED state is permissive, never restrictive.
 *
 * ⭐ THE ONE PREDICATE, SO THE PICK AND THE AFFORDANCE CANNOT DISAGREE. Two readings of "is this
 * the subject?" would let the arrows stand on a storey the pick refuses, which is the exact shape
 * of an affordance that lies (C84 EI-9).
 */
export function isSpaceEnvelopeFaceDragFocusable(id: string): boolean {
    return focus === null || focus.spaceEnvelopeId === id;
}

/** Test-only reset — clears the slot and drops every subscriber. */
export function __resetSpaceEnvelopeFaceDragFocusForTests(): void {
    focus = null;
    listeners.clear();
}
