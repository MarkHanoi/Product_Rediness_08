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
 * ⭐ §ENVELOPE-DRAW-LIVE-DIMS (L-13308) — ONE live dimension chip of the in-progress perimeter.
 *
 * The founder: *"while defining the points that define the profile of the massing envelope - i want
 * to see the preview dims - as we have while creating slabs + walls on pryzm views"*.
 *
 * ⛔ DECIDED ABOVE THE PORT, PAINTED BELOW IT. Which segments carry a chip (placed edges, the
 * rubber-band, the closing edge, ONE chip per arc run, a radius for a circle) depends on the MODE,
 * and only `siteEnvelopeDrawArming.ts` knows the mode — an adapter handed `committed`/`tail` cannot
 * tell a 16-chord arc from 16 hand-placed corners. The text comes from the ONE formatter
 * (`envelopeDrawDims.ts` → `formatDimension`). An adapter that measured or formatted a length itself
 * would be the per-renderer drift this port exists to prevent (plan §7 rule 4).
 */
export interface EnvelopeDrawDimLabel {
    /** Where the chip sits — project-frame scene-XZ metres, like every other point on this port. */
    readonly at: SceneXZPoint;
    /** The chip text, already formatted. An adapter paints it verbatim. */
    readonly text: string;
    /** The measured length in metres (the radius, for a circle). Carried so a spec can read the number. */
    readonly lengthM: number;
    /**
     * `live` follows the pointer (the rubber-band, or a loop being dragged out); `placed` is an edge
     * between two corners already placed; `closing` is the implied last → first edge. Adapters paint
     * `live` as the emphasised chip (PRYZM purple fill, white text) and the others white with purple
     * text — never black (founder brand rule).
     */
    readonly kind: 'live' | 'placed' | 'closing';
}

/**
 * ⭐ §ENVELOPE-ROSTER-ONE-SOURCE (L-13309) — ONE ring of the transient profile roster
 * (`drawnEnvelopeFootprintState`), as a site surface paints it.
 *
 * ⚠ ONE ENTRY PER DISTINCT FOOTPRINT, NOT PER PROFILE. "Add another profile" seeds the new profile
 * with the SAME frozen footprint object as the one it copies (`undrawnCopies` reads exactly that
 * reference equality), so two profiles can stand on one ring until the next draw replaces the copy.
 * Painting that ring twice would stack two coplanar translucent fills — a darker patch on the map and
 * z-fighting on the globe — for a picture that says nothing more.
 */
export interface EnvelopeRosterRing {
    /** Every roster profile this ring stands for, oldest first. Never empty. */
    readonly profileIds: readonly string[];
    /** The first such profile's label (`Profile N` or the user's rename). */
    readonly label: string;
    /** The CLOSED perimeter — the very ring the roster stores, never a second copy. */
    readonly ring: readonly SceneXZPoint[];
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
     *
     * ⭐ §ENVELOPE-DRAW-LIVE-DIMS (L-13308) — `dims` are the live dimension chips for exactly this
     * preview, computed ONCE above the port (see `EnvelopeDrawDimLabel`). An adapter paints them at
     * `at` with `text` and nothing else. OPTIONAL and last, so every adapter and fake written against
     * the three-argument form keeps compiling and keeps its behaviour — it simply shows no chips.
     */
    drawPreview(
        committed: readonly ArcVertex2D[],
        tail: readonly ArcVertex2D[],
        closeRing: boolean,
        dims?: readonly EnvelopeDrawDimLabel[],
    ): void;
    clearPreview(): void;
    /**
     * ⭐⭐ §ENVELOPE-ROSTER-ONE-SOURCE (L-13309) — PAINT THE WHOLE PROFILE ROSTER, AND KEEP IT PAINTED.
     *
     * The founder, twice: *"When the user adds another profile - the previous profile gets deleted
     * from the view - then it is still there - but we dont render"* and *"it renders perfect on plan
     * view - but i would like it to render also on 3d site view"*.
     *
     * Called by the registry with the roster's rings on EVERY registered surface, whenever the roster
     * changes (finish, add, remove, rename, clear) and when a surface registers — so a ring finished
     * on one pane is painted on the other, and a pane mounted later shows what was drawn before it.
     * `[]` means "paint nothing": the adapter removes its roster paint.
     *
     * ⛔ ITS OWN CHANNEL, SEPARATE FROM THE PREVIEW AND THE SETTLED SPINE. Every gesture exit clears
     * the preview, and every arm clears the settled spine; either lifetime applied to the roster is
     * exactly the defect this closes. Styled as the FINISHED footprint (faint fill + outline, no
     * corner dots, no chips) so it never reads as the draft being drawn over it.
     */
    drawProfileRoster?(rings: readonly EnvelopeRosterRing[]): void;
    /** Remove this surface's roster paint. Idempotent. Called when the surface unregisters. */
    clearProfileRoster?(): void;
    /**
     * ⭐ §ENVELOPE-DRAW-SETTLED-RING (lane ENVELOPE-DRAW-AND-STOREYS, 2026-09-07 · L-13148) —
     * PAINT THE PERIMETER THE USER JUST CLOSED, AND KEEP IT PAINTED AFTER THE GESTURE ENDS.
     *
     * ⚠ §ENVELOPE-ROSTER-ONE-SOURCE (L-13309) — A FINISHED PERIMETER NO LONGER COMES THROUGH HERE.
     * It is a roster profile, and `drawProfileRoster` paints it on every surface. This channel now
     * carries only the finished array SPINE (`closed = false`), which is not a roster profile. The
     * notes below are kept as the record of why a finished stroke needs a channel of its own at all.
     *
     * The founder: *"when i click enter - it desappar from hte screen - it should continue"*. He
     * closed the ring and the drawing vanished, so while he decided how many storeys to ask for he
     * had nothing on screen to decide ABOUT. The vanish was not a bug in any adapter: `finish()`
     * calls `disarmAll()`, `disarm()` calls `clearPreview()`, and the preview is by definition the
     * IN-PROGRESS one. Nothing was ever asked to draw the FINISHED one.
     *
     * ⛔ IT IS A SECOND CHANNEL, NOT A LONGER-LIVED FIRST ONE, AND THAT IS THE WHOLE DESIGN. The
     * in-progress preview is cleared by six different exits (disarm, cancel, re-arm, the first
     * click winning on another surface, unregister, teardown) and every one of them is correct for
     * a half-drawn ring and wrong for a stored one. Sharing the entities would mean each of those
     * six sites had to learn the difference; a separate channel means none of them do.
     *
     * ⚠ OPTIONAL. A surface that does not implement it keeps exactly today's behaviour — the ring
     * is stored and the panel names it, there is simply nothing painted. That is a reachability
     * statement, not caution: an adapter is never made to promise a picture it cannot draw.
     *
     * ⭐ §ARRAY-ALONG-PATH (ADR-0386 D6) — `closed` DEFAULTS TO TRUE, so every adapter written
     * before this parameter existed is called with the argument list it was written for and keeps
     * its exact behaviour. `false` asks for an OPEN polyline: the array spine, which is a run and
     * not a perimeter. An adapter that ignores the parameter draws the old closed shape — visibly
     * wrong rather than silently absent, which is the right failure mode for an optional method.
     *
     * ⛔ AND THE MINIMUM DIFFERS WITH IT: a closed ring needs three vertices to enclose anything,
     * an open path needs two. An adapter that keeps a hard `length < 3` guard will silently drop
     * every two-point spine.
     *
     * @param ring the CLOSED perimeter, in the same project-frame scene-XZ metres as `onPoint` —
     *             the exact vertices handed to `setDrawnEnvelopeFootprint`, never a second copy.
     *             When `closed` is false this is instead the exact vertices handed to
     *             `setDrawnArrayPath`.
     */
    drawSettledRing?(ring: readonly SceneXZPoint[], closed?: boolean): void;
    /** Drop the settled ring. Idempotent; safe on a surface that never drew one. */
    clearSettledRing?(): void;
    /**
     * Bind pointer/keyboard handlers to THIS sink, yield the surface's own click ladder to the
     * gesture, and keep camera pan/rotate LIVE (click-to-place needs pan at parcel scale — plan
     * §3a/§3b). Returns `false` when the surface cannot arm right now (not mounted, mid-teardown)
     * so the registry counts only surfaces that really accepted.
     */
    arm(sink: EnvelopeDrawSink): boolean;
    /** Unbind, restore the surface's own click ladder, clear the preview. Idempotent. */
    disarm(): void;
    /**
     * §ENVELOPE-DRAW C5 (C16 CA-18) — WHY this surface would refuse to arm right now, in the words
     * a user can act on, or `null` when it would accept.
     *
     * ⭐ ADDED BECAUSE A BOOLEAN CANNOT CARRY A REASON, AND THE REASON IS THE PRODUCT. Without it a
     * mounted 3D Site that cannot resolve the site frame origin refuses through `arm() → false`,
     * and the registry then prints *"no site view is attached"* — a TRUE sentence about the WRONG
     * thing, which sends the user to re-open a view that is already open. With it the registry
     * prints *"On the 3D Site view: no site frame ORIGIN is resolvable — search the address or
     * select the parcel first"*, which names the actual next action.
     *
     * ⚠ OPTIONAL, and a surface that omits it is not lying — it is saying nothing, and the registry
     * falls back to the generic refusal. That is the honest default; inventing a reason on a
     * surface's behalf is exactly the fabrication this repo keeps logging.
     */
    cannotArmReason?(): string | null;
}
