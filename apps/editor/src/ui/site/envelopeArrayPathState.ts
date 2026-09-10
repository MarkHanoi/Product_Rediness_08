// §ARRAY-ALONG-PATH (ADR-0386 D6, lane ARRAY-ALONG-PATH, 2026-09-10) — THE SESSION SLOT HOLDING
// THE SPINE THE USER STROKED, and the push channel that gets it into the master-planning panel.
//
// ADR-0386 D3 / D6 · ADR-0383 D2 · C58 §1.19 · C13 §3.10.
//
// ⛔ THIS IS `drawnEnvelopeFootprintState` FOR A PATH, MODELLED ON IT LINE FOR LINE, AND FOR THE
// SAME REASON: a gesture WRITES, surfaces SUBSCRIBE and repaint themselves. That is what makes
// *"the user drew a spine but the panel never heard"* structurally impossible rather than a branch
// somebody remembered.
//
// ⛔ AND IT IS A SEPARATE SLOT FROM THE FOOTPRINT ROSTER, NOT A SEVENTH FIELD ON IT. A profile IS a
// ring (that module refuses to represent one without); a spine is an OPEN polyline that is not a
// profile, will never become an element, and is discarded the moment its copies are in the roster.
// Widening `DrawnEnvelopeFootprint` to carry an optional path would have made every existing reader
// of the roster — the planner, the card, the two site rasterisers — able to receive a value that is
// not a perimeter. One slot, one meaning.
//
// ⛔ SESSION-ONLY, NOT PERSISTED, and that is the same decision `drawnEnvelopeFootprintState` makes
// with the same argument: the spine is scaffolding for an exploration. What persists is the
// BUILDINGS, through the one `spaceEnvelope.batch.create`.
//
// PURE except for one module-local slot and a listener set. No DOM, no THREE, no I/O.

import { trace } from '@opentelemetry/api';
import type { EnvelopeDrawSurfaceId, SceneXZPoint } from './envelopeDrawSurface';
import type { EnvelopeDrawMode } from './drawnEnvelopeFootprintState';

const _tracer = trace.getTracer('pryzm.site.envelopeArrayPathState');

/** The spine the array is generated along. Project-frame scene-XZ metres — the ring's own frame. */
export interface DrawnArrayPath {
    /**
     * The OPEN polyline, oldest vertex first.
     *
     * ⭐ VERTEX 0 IS THE PROTOTYPE'S CENTRE (ADR-0386 D3), seeded by the gesture rather than asked
     * of the user — *"a line starting from the CENTRE of the first envelope"* is then a property of
     * the tool instead of an instruction that can be missed. Backspace can still pop it, and the
     * generator MEASURES the resulting offset rather than silently re-anchoring.
     */
    readonly path: readonly SceneXZPoint[];
    /** Σ of the segment lengths, m — computed ONCE by the gesture, never re-derived downstream. */
    readonly lengthM: number;
    readonly surfaceId: EnvelopeDrawSurfaceId;
    readonly mode: EnvelopeDrawMode;
}

type Listener = () => void;

const listeners = new Set<Listener>();

let current: DrawnArrayPath | null = null;

function notify(): void {
    for (const fn of [...listeners]) {
        try {
            fn();
        } catch (e) {
            console.warn('[site][array-path] §ARRAY-ALONG-PATH listener threw (non-fatal):', e);
        }
    }
}

/**
 * ⛔ THE ONE STORABILITY RULE. A spine needs TWO distinct vertices and a positive length — not
 * three, and that is the one place this differs from the perimeter slot next door. A single 30 m
 * run is a perfectly good spine; it is a PATH, not a ring. (The same distinction
 * `BoundaryLinePlanToolHandler` draws with `MIN_PATH_VERTS = 2`.)
 */
function isStorable(p: DrawnArrayPath): boolean {
    return p.path.length >= 2 && Number.isFinite(p.lengthM) && p.lengthM > 0;
}

/** THE ONE READ. `null` ⇒ no spine has been stroked this session (or it was cleared). */
export function getDrawnArrayPath(): DrawnArrayPath | null {
    return current;
}

/** THE ONE WRITE. `null` clears. A degenerate spine is REFUSED, never stored. */
export function setDrawnArrayPath(next: DrawnArrayPath | null): void {
    const span = _tracer.startSpan('pryzm.site.setDrawnArrayPath');
    try {
        if (next === null) {
            if (current === null) return;
            current = null;
            span.setAttribute('pryzm.arrayPath.present', false);
            notify();
            return;
        }
        if (!isStorable(next)) {
            span.setAttribute('pryzm.arrayPath.refused', 'degenerate');
            console.warn(
                '[site][array-path] §ARRAY-ALONG-PATH refused to store a degenerate spine '
                + `(${next.path.length} vertices, ${next.lengthM} m). The slot is unchanged.`,
            );
            return;
        }
        if (current === next) return;
        current = Object.freeze({
            path: Object.freeze(next.path.map((p) => Object.freeze({ x: p.x, z: p.z }))),
            lengthM: next.lengthM,
            surfaceId: next.surfaceId,
            mode: next.mode,
        });
        span.setAttribute('pryzm.arrayPath.present', true);
        span.setAttribute('pryzm.arrayPath.vertices', current.path.length);
        span.setAttribute('pryzm.arrayPath.lengthM', current.lengthM);
        span.setAttribute('pryzm.arrayPath.surface', current.surfaceId);
        notify();
    } finally {
        span.end();
    }
}

/** Drop the spine. The copies already in the roster are NOT touched — they are profiles now. */
export function clearDrawnArrayPath(): void {
    setDrawnArrayPath(null);
}

/** Subscribe a panel or surface. Returns its own unsubscribe. */
export function subscribeDrawnArrayPath(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/** Σ of the segment lengths of a polyline, metres. The ONE producer of a spine's length. */
export function arrayPathLengthM(path: readonly SceneXZPoint[]): number {
    let total = 0;
    for (let i = 1; i < path.length; i++) {
        total += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z);
    }
    return total;
}

/** Test-only reset — clears the slot and every subscriber. */
export function __resetDrawnArrayPathForTests(): void {
    current = null;
    listeners.clear();
}
