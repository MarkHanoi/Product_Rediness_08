// §ENVELOPE-DRAW-ON-THE-SITE-VIEWS (lane ENVELOPE-DRAW, 2026-09-07) — the session slot holding the
// perimeter the user DREW on a site view, and the push channel that gets it into the create panel.
//
// PLAN-ENVELOPE-DRAW-ON-SITE-VIEWS §2 "The drawn-ring hand-off store" · L-13050 · C58 §1.19.
//
// Modelled line-for-line on `targetFootprintAreaState.ts` next door, and for the same reason: a
// gesture WRITES, surfaces SUBSCRIBE and repaint themselves. That is what makes *"the user drew a
// ring but the panel never heard"* structurally impossible rather than a branch someone remembered.
//
// ⛔ RING AND AREA TRAVEL TOGETHER, FROM ONE PRODUCER. `buildEnvelopeAuthoringPlan` refuses to
// recompute an area (*"a second area routine is how a card comes to state a figure the scene
// disagrees with"*, C84 EI-9), so the slot carries the figure the gesture computed — through the
// kernel's ONE shoelace, `polygonSignedAreaOrdinates` (C73) — beside the ring it was computed from.
//
// ⛔ SESSION-ONLY, NOT PERSISTED, AND THAT IS A DECISION — the same argument
// `targetFootprintAreaState.ts:11-17` makes. A drawn perimeter is an EXPLORATION the user is about to
// commit as an element; the element is what persists (through `spaceEnvelope.batch.create`). A ring
// restored silently on the next load would sit on the ground as a proposal nobody in that session
// drew, about a site frame that may since have been re-seated.
//
// PURE except for one module-local slot and a listener set. No DOM, no THREE, no I/O.

import { trace } from '@opentelemetry/api';
import type { EnvelopeDrawSurfaceId, SceneXZPoint } from './envelopeDrawSurface';

const _tracer = trace.getTracer('pryzm.site.drawnEnvelopeFootprintState');

/** The six gestures the envelope draw offers — the slab family's two existing unions, unmerged. */
export type EnvelopeDrawMode = 'linear' | 'ortho' | 'curved' | 'rectangular' | 'circular' | 'elliptical';

/** What the user drew. Ring in project-frame scene-XZ metres (see `envelopeDrawSurface.ts`). */
export interface DrawnEnvelopeFootprint {
    readonly ring: readonly SceneXZPoint[];
    /** |shoelace| of `ring`, m² — computed ONCE by the gesture, never re-derived downstream. */
    readonly areaM2: number;
    /** Which site view it was drawn on. Printed, so the panel can name its own provenance. */
    readonly surfaceId: EnvelopeDrawSurfaceId;
    readonly mode: EnvelopeDrawMode;
}

type Listener = () => void;

const listeners = new Set<Listener>();

/** `null` ⇒ nothing has been drawn this session (or the last drawing was cleared). */
let drawn: DrawnEnvelopeFootprint | null = null;

function notify(): void {
    for (const fn of [...listeners]) {
        try {
            fn();
        } catch (e) {
            console.warn('[site][envelope-draw] §ENVELOPE-DRAW listener threw (non-fatal):', e);
        }
    }
}

/** THE ONE READ. */
export function getDrawnEnvelopeFootprint(): DrawnEnvelopeFootprint | null {
    return drawn;
}

/**
 * THE ONE WRITE. Pass `null` to clear.
 *
 * ⛔ ONLY A RING OF THREE OR MORE VERTICES WITH A FINITE POSITIVE AREA MAY BE STORED. A degenerate
 * drawing is a REFUSAL for the user to read (the gesture prints it), never a thing to hand to the
 * planner — storing one would invite the panel to ask "what does a two-point envelope extrude to?",
 * and the answer it would invent is exactly the shape the refusal exists to withhold.
 */
export function setDrawnEnvelopeFootprint(next: DrawnEnvelopeFootprint | null): void {
    const span = _tracer.startSpan('pryzm.site.setDrawnEnvelopeFootprint');
    try {
        if (next !== null) {
            if (next.ring.length < 3 || !Number.isFinite(next.areaM2) || next.areaM2 <= 0) {
                span.setAttribute('pryzm.envelopeDraw.refused', 'degenerate');
                console.warn(
                    '[site][envelope-draw] §ENVELOPE-DRAW refused to store a degenerate ring '
                    + `(${next.ring.length} vertices, ${next.areaM2} m²). The slot is unchanged.`,
                );
                return;
            }
        }
        if (drawn === next) return;
        drawn = next;
        span.setAttribute('pryzm.envelopeDraw.present', next !== null);
        if (next !== null) {
            span.setAttribute('pryzm.envelopeDraw.vertices', next.ring.length);
            span.setAttribute('pryzm.envelopeDraw.areaM2', next.areaM2);
            span.setAttribute('pryzm.envelopeDraw.surface', next.surfaceId);
        }
        notify();
    } finally {
        span.end();
    }
}

/** Subscribe a surface or panel. Returns its own unsubscribe. */
export function subscribeDrawnEnvelopeFootprint(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/** Drop the drawing. The user redrew, cleared it, or the site frame it was drawn about moved. */
export function clearDrawnEnvelopeFootprint(): void {
    setDrawnEnvelopeFootprint(null);
}

/** Test-only reset — clears the slot and drops every subscriber. */
export function __resetDrawnEnvelopeFootprintForTests(): void {
    drawn = null;
    listeners.clear();
}
