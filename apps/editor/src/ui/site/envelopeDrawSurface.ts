// §ENVELOPE-DRAW-ON-THE-SITE-VIEWS (lane ENVELOPE-DRAW, 2026-09-07) — THE PORT.
// PLAN-ENVELOPE-DRAW-ON-SITE-VIEWS §1 · L-13050 · C58 §1.19 · C114 §6a · C16 · P2 · P6.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER'S SENTENCE, AND THE ONE THING THAT BRANCHES PER RENDERER
// ══════════════════════════════════════════════════════════════════════════════════════════════
// *"AS A USER CREATES A SLAB ON PRYZM 3D / 2D VIEW, THE USER SHALL BE ABLE TO CREATE THE BUILDABLE
//  ENVELOPE VIA UI ON 2D SITE VIEW AND 3D SITE VIEW — SAME PRINCIPLE."*
//
// Three of the four layers of that gesture are ALREADY renderer-free and already shipping:
//   · the click/constraint state machine — `BoundaryPathAuthor` (`@pryzm/geometry-slab/boundary-path`,
//     the founder-ruled perpendicular-foot ortho and the 3-click arc) and the closed-loop generators
//     (`@pryzm/geometry-slab/boundary-loops`);
//   · the commit decision — `buildEnvelopeAuthoringPlan` (no store, no DOM, no THREE, no bus);
//   · the render-back — both site surfaces already subscribe the ONE space-envelope store.
//
// So the ONLY things a renderer must supply are the two this interface names: SCREEN → GROUND, and
// the IN-PROGRESS PREVIEW. Everything else lives above this port, once, in
// `siteEnvelopeDrawArming.ts`. ⛔ If an adapter grows a `canClose()`, an area routine or a mode
// switch, it has stolen work that belongs above it (plan §7 rule 4).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ NOTHING EXISTING MOVES BEHIND THIS PORT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `SlabTool` (THREE-bound, its own polyline machine) and `SlabPlanToolHandler` (Canvas2D,
// `PlanToolDrawContext` hard-bound to `HTMLCanvasElement`) share no seam today, and retrofitting
// them onto this one is a multi-week refactor this feature does not need. This port is NEW and
// NARROW, and it is deliberately not `PlanToolHandler`: no Cesium or MapLibre adapter could ever
// satisfy that interface's canvas-typed draw context.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE FRAME IS THE CONTRACT — PROJECT-FRAME SCENE-XZ, THE FRAME THE FOOTPRINT IS COMMITTED IN
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A point handed to the sink is in SCENE-XZ METRES ABOUT THE SITE FRAME ORIGIN, in the PROJECT
// frame — exactly the frame `SpaceEnvelope.footprint` is stored in and the frame the parcel's
// `insetPolygon` shares (`envelopeAuthoringPlan.ts`: *"the SAME frame as the parcel ring"*).
//
// ⚠ CORRECTING THE PLAN'S R5 ON THE RECORD (it said the site adapters are θ-free): BOTH site
// rasterisers apply θ when they draw a stored footprint — `SiteBoundaryMap2D.spaceEnvelopeFeature-
// Collection` and `CesiumViewport.renderSpaceEnvelopes` each run `sceneXZToEnu(p.x, p.z, θ)` before
// `sceneXZToLatLon` / the ENU matrix. The stored ring is therefore PROJECT-frame, and an adapter
// that fed this port true-north XZ would draw the envelope at the wrong bearing on any rotated site
// (Barcelona θ ≈ 45°) while looking perfect where θ = 0 — the §L-446 ambiguity. So each adapter
// converts at its OWN edge, once, in this order and no other:
//
//     pointer → lat/lon → latLonToSceneXZ (ENU as x=east, z=−north) → enuToSceneXZ(east, north, θ)
//     preview: sceneXZToEnu(x, z, θ) → sceneXZToLatLon({x: east, z: −north}) → renderer
//
// about the ONE origin `resolveSiteFrameOrigin` yields (R6 — never a re-read geocode), and reading
// θ from the same `SiteLocation.trueNorth` the rasterisers read. ⛔ The BIM plan surface draws the
// authoring frame de-rotated by θ BY DESIGN (ADR-0115); anyone mirroring this port onto that
// surface must NOT apply the conversion above a second time.
//
// PURE TYPES. No THREE, no Cesium, no MapLibre, no DOM.

import type { ArcVertex2D } from '@pryzm/geometry-slab/boundary-path';

/** The two site surfaces the envelope can be drawn on. A closed union — a third is a decision. */
export type EnvelopeDrawSurfaceId = 'site-3d' | 'site-map-2d';

/** A point in project-frame scene-XZ metres about the site frame origin. See the header. */
export interface SceneXZPoint {
    readonly x: number;
    readonly z: number;
}

/**
 * What a surface tells the gesture. Every method is ALREADY converted to scene-XZ by the surface;
 * the gesture above never sees a pixel, a lat/lon or a renderer event.
 *
 * ⚠ A sink is only honoured while its surface is ARMED — a surface whose `disarm()` was called
 * and which keeps calling in (a late event on a torn-down handler) is ignored, not obeyed. That is
 * L-7801 (Escape unwound the chrome and left the handler live) closed at the registry rather than
 * trusted to every adapter.
 */
export interface EnvelopeDrawSink {
    /** A click on the ground. */
    onPoint(p: SceneXZPoint): void;
    /** The pointer moved; `null` when it is not over ground (so the rubber-band can lift). */
    onMove(p: SceneXZPoint | null): void;
    /** Double-click or Enter. Loop modes never call this — they finish on the second click. */
    onFinish(): void;
    /** Backspace. */
    onUndo(): void;
    /** Escape. */
    onCancel(): void;
}

/**
 * THE PORT. One per site surface, registered on mount and unregistered on dispose.
 */
export interface EnvelopeDrawSurface {
    readonly surfaceId: EnvelopeDrawSurfaceId;
    /**
     * Screen point → project-frame scene-XZ metres, or `null` when the pointer is not over ground.
     * The adapter's own pointer handlers call this and forward the result to the sink; it is also
     * the one method a headless spec can exercise on the projection half (R4: the PICK half needs
     * a real depth buffer / globe and is browser-only).
     */
    groundPointFromPointer(clientX: number, clientY: number): SceneXZPoint | null;
    /**
     * Draw the committed vertices followed by the rubber-band tail. Called on every move and click.
     * `closeRing` asks for the closing edge (last → first) — true for a loop preview and for a path
     * of three or more, false for an open two-point path.
     */
    drawPreview(
        committed: readonly ArcVertex2D[],
        tail: readonly ArcVertex2D[],
        closeRing: boolean,
    ): void;
    clearPreview(): void;
    /**
     * Bind pointer/keyboard handlers to THIS sink, yield the surface's own click ladder to the
     * gesture, and keep camera pan/rotate LIVE (click-to-place needs pan at parcel scale — plan
     * §3a/§3b). Returns `false` when the surface cannot arm right now (not mounted, mid-teardown)
     * so the registry counts only surfaces that really accepted.
     */
    arm(sink: EnvelopeDrawSink): boolean;
    /** Unbind, restore the surface's own click ladder, clear the preview. Idempotent. */
    disarm(): void;
}
