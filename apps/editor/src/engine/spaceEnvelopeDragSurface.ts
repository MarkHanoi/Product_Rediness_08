/**
 * spaceEnvelopeDragSurface — THE FACE-DRAG GESTURE, WITHOUT A RENDERER.
 * §ENVELOPE-DRAG-PORTS (L-13045) · C114 §10 · ADR-0380 D4 · C16 §8.6 · P2 · P6 · C84 EI-9.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS FILE EXISTS, AND WHY IT LANDED BEFORE ANY SECOND SURFACE
 * ═══════════════════════════════════════════════════════════════════════════════
 * The founder's §2.4 gesture — grab ONE face, it moves along ITS OWN perpendicular, the
 * connected faces adapt, and a move that would destroy the solid REFUSES with both numbers
 * — is wanted on three surfaces: the BIM 3-D viewport (THREE/WebGPU), the 3-D Site
 * (Cesium) and the 2-D Site map (MapLibre).
 *
 * The 474-line controller that implemented it touched THREE on SIX lines. Everything else
 * — grab resolution, the `maximumBuildable` role refusal, the contextual planner call,
 * neighbour-preview bookkeeping, the 1e-3 m no-op drop, the single dispatch, and handing
 * the camera back on cancel AND on teardown — was already surface-independent. Copy-porting
 * it twice would therefore have minted THREE implementations of ONE gesture to move six
 * lines, which is the C84 EI-9 hazard this repo has paid for repeatedly: the copies drift,
 * and the drift is invisible because each copy passes its own tests.
 *
 * So the six lines went behind four ports and the gesture stayed here, once. Each further
 * surface is now an ADAPTER — screen→ray, a per-face pick, a preview channel and a camera
 * suspend — and not a fork of the refusal logic.
 *
 * ─── THE FOUR PORTS, AND WHAT EACH ONE COSTS A NEW SURFACE ──────────────────────
 *   1. `rayInSceneFrame(ev)`  — screen point → a ray in the SCENE frame, plain `{x,y,z}`.
 *      ⚠ Returns `null` when the surface cannot answer. THREE always can; Cesium's
 *        `camera.getPickRay` can return nothing, and a surface that guesses instead of
 *        answering `null` produces a plausible-looking skewed drag, which is the failure
 *        mode that survives review.
 *   2. `pickFace(ev)`         — which envelope face is under the pointer, and where.
 *      ⛔ ONE pick, shared by hover, drag-start and double-click. Two picks are two
 *        answers to one question and let a double-click open an editor on a different
 *        envelope than the drag would have moved.
 *   3. `previewDraw` / `previewRestore` — the preview CHANNEL. `previewDraw` shows
 *      geometry that is NOT in the store; `previewRestore(id)` drops the preview for one
 *      id so the authoritative geometry shows again. They are two ports rather than one
 *      because restore is not "draw the stored record" on every surface: on a surface
 *      whose renderer reads the store directly, restore is *removing* an overlay.
 *   4. `setCameraEnabled(bool)` — suspend camera navigation for the length of the gesture.
 *
 * Plus one OPTIONAL group, `handles`, for the arrow affordance (§25.6 GESTURE 1). It is
 * optional because a surface can ship the gesture before it ships the arrows — omit it and
 * the drag works exactly as it did, and stays undiscoverable, which is a regression in
 * reachability rather than in behaviour ([[committed-is-not-reachable]]).
 *
 * ─── WHAT IS NOT HERE, ON PURPOSE ───────────────────────────────────────────────
 * ⛔ NO THREE. This module has no THREE value import. Its only THREE-adjacent edge is the
 *    ERASED `import type` of `SpaceEnvelopeRenderInput` — a plain data interface that
 *    happens to live in the mesh-builder file. It is imported rather than re-declared
 *    because a second copy of a record shape is a drift factory (C84 EI-9); the import
 *    compiles to nothing.
 * ⛔ NO GEOMETRY MATHS. `spaceEnvelopeFaceAxis`, `closestPointOnFaceAxis`,
 *    `prismOfSpaceEnvelopeRecord`, `readSpaceEnvelopeFaceDrag` and both planners already
 *    live in `@pryzm/geometry-space-envelope`, which is THREE-free BY MANIFEST — it
 *    declines `@pryzm/spatial-index` specifically because that package imports THREE. None
 *    of it is duplicated here and none of it may be.
 *
 * ─── ⭐ WHAT A *DRAW* GESTURE CAN REUSE, MEASURED RATHER THAN GUESSED ────────────
 * The founder wants CREATE and MODIFY on both site views as one journey: draw a new
 * buildable envelope, then edit it by dragging faces, on the same surface. A draw tool is
 * NOT built here — it is a separate lane — but the ports were named so that lane does not
 * have to rename them, and this is the honest accounting of what it inherits:
 *
 *   · `rayInSceneFrame`   — REUSABLE UNCHANGED, and deliberately so. It returns the RAY,
 *     not a hit. What you intersect it with is the gesture's business: this gesture
 *     intersects it with a face axis, a draw gesture intersects it with the ground plane.
 *     ⛔ Do not fold ground-intersection into this port. The moment it returns a point
 *       instead of a ray it stops serving both, and the two gestures need two of it.
 *   · `setCameraEnabled`  — REUSABLE UNCHANGED. Identical need, identical shape.
 *   · `previewRestore`    — REUSABLE UNCHANGED (drop the transient, show what is stored).
 *   · `previewDraw`       — REUSABLE FOR THE SECOND HALF OF A DRAW, NOT THE FIRST. Once a
 *     ring closes and a height is assumed, the about-to-be-created envelope IS a
 *     `DraggableSpaceEnvelope` with a provisional id, and this port draws it as-is. An
 *     IN-PROGRESS ring — two vertices and a rubber band — is not a prism, and
 *     `SpaceEnvelopeMeshBuilder` correctly draws NOTHING for it. So a draw lane needs one
 *     additional transient-polyline channel; widening THIS port to a union would cost the
 *     face-drag adapters a branch they can never take, which is why it was left alone.
 *   · `pickFace`          — EDIT-ONLY by nature. A draw picks the ground, not a face.
 *
 * The consequence worth acting on: a Cesium adapter and a MapLibre adapter should each be
 * built ONCE and serve BOTH gestures. Two Cesium adapters where one would do is the same
 * EI-9 duplication this extraction exists to avoid, one level up.
 *
 * ⛔ NO CESIUM OR MAPLIBRE ADAPTER. Those are separate lanes with real unknowns of their
 *    own (per-face pick geometry; the screen-ray → scene-XZ inverse and its skew class;
 *    and the fact that a PLAN map has no vertical axis, so height can never be dragged
 *    there). Rushing them inside a refactor is how an extraction becomes a rewrite.
 *
 * ─── ONE PLANNER, TWO USES, AND THAT IS THE POINT ───────────────────────────────
 * The live preview and the commit both call `planSpaceEnvelopeFaceMoveInContext`. So a drag
 * the commit would refuse is refused DURING the drag, with the same sentence and the same
 * two numbers — the preview can never promise something the commit then declines
 * (C114 §12a).
 *
 * ⛔ THE PREVIEW IS NOT A COMMIT AND MUST NEVER BECOME ONE (P6). While the pointer is down
 * this calls `previewDraw` and writes NOTHING to any store. Exactly ONE
 * `spaceEnvelope.moveFace` is dispatched, on release, so one gesture costs one Ctrl+Z — and
 * a per-frame dispatch would spend the user's undo history on the smoothness of their mouse.
 *
 * ⚠ AND A DRAG THAT ENDED WHERE IT STARTED DISPATCHES NOTHING. A no-op still mints a ring
 * entry and spends the next Ctrl+Z on an edit that never happened (C113 §6.4).
 *
 * ⛔ TYPE A IS NOT DRAGGABLE, BY CONSTRUCTION AND NOT BY POLICY. Only `level` and `room`
 * envelopes exist to grab: `role: 'maximumBuildable'` is refused at the create verb
 * (ADR-0380 D2), so no record with that role can be in the store to be drawn, let alone
 * dragged. The guard below is defence in depth against a future promotion, and it names its
 * reason rather than silently ignoring the pointer.
 */

import {
    closestPointOnFaceAxis,
    planSpaceEnvelopeFaceMoveInContext,
    prismOfSpaceEnvelopeRecord,
    readSpaceEnvelopeFaceDrag,
    spaceEnvelopeFaceAxis,
    type SpaceEnvelopeContextEntry,
    type SpaceEnvelopeFaceRef,
} from '@pryzm/geometry-space-envelope';
// ⛔ TYPE-ONLY, and therefore ERASED. See the header: one definition of the record shape,
// no runtime edge to the renderer.
import type { SpaceEnvelopeRenderInput } from './SpaceEnvelopeMeshBuilder';

/** The record shape the gesture needs. Read from the ONE store, never cached. */
export interface DraggableSpaceEnvelope extends SpaceEnvelopeRenderInput {
    readonly footprint: ReadonlyArray<{ readonly x: number; readonly z: number }>;
    readonly baseOffset: number;
    readonly height: number;
    /** §RESI-STAGE-G — the membership the CONTEXTUAL planner judges containment against. */
    readonly withinId?: string | null;
    readonly name?: string;
}

/**
 * §RESI-STAGE-G — one record as the contextual planner sees it. The SAME shape the handler
 * builds (`containmentGate.contextEntryOf`), spelled here because the engine may not import
 * the plugin's internals; both are structural over the L0 record.
 */
export function contextEntryOfDraggable(r: DraggableSpaceEnvelope): SpaceEnvelopeContextEntry {
    return {
        prism: prismOfSpaceEnvelopeRecord(r),
        role: r.role ?? 'room',
        levelId: r.levelId ?? '',
        withinId: r.withinId ?? null,
        ...(r.name !== undefined ? { name: r.name } : {}),
    };
}

/** A plain point or direction in the SCENE frame, metres. No renderer vector type. */
export interface DragVec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * The two fields every port reads off an event.
 *
 * ⚠ Deliberately NOT `PointerEvent`: a `dblclick` is a `MouseEvent`, and the narrower type
 * would have forced either a cast or a second copy of the screen→ray arithmetic — and a
 * second screen→ray map is a second answer to one question.
 */
export interface DragPointerLike {
    readonly clientX: number;
    readonly clientY: number;
}

/** A ray in the SCENE frame. `direction` need not be normalised by the adapter. */
export interface SceneRay {
    readonly origin: DragVec3;
    readonly direction: DragVec3;
}

/** What the pointer is over: which envelope, which of its `n + 2` faces, and where. */
export interface FacePick {
    readonly id: string;
    readonly face: SpaceEnvelopeFaceRef;
    readonly point: DragVec3;
}

/**
 * ⭐ §25.6 GESTURE 1 — THE LITTLE ARROW, as a port. OPTIONAL: a surface may ship the drag
 * before it ships the affordance.
 */
export interface SpaceEnvelopeDragHandles {
    /** The envelope the handles currently belong to, or `null`. */
    targetId(): string | null;
    /** Draw handles for this record's faces — or clear them when given `null`. */
    setTarget(record: DraggableSpaceEnvelope | null): void;
    /** Light the handle for one face — or clear the lighting when given `null`. */
    setActiveFace(face: SpaceEnvelopeFaceRef | null): void;
}

/**
 * ⭐ THE PORT. Four required members; implement them and the whole gesture — refusals,
 * neighbour previews, undo economy and all — comes for free.
 */
export interface SpaceEnvelopeDragSurface {
    /**
     * Screen point → ray in the SCENE frame. ⭐ GESTURE-NEUTRAL: a draw tool reuses this
     * unchanged — see the header. It returns the RAY, never a hit.
     * ⚠ Answer `null` rather than guessing when the surface cannot produce one. The core
     * treats `null` as "this frame carries no information" and HOLDS the face.
     */
    rayInSceneFrame(ev: DragPointerLike): SceneRay | null;
    /** Which envelope face is under the pointer. `null` for empty space. EDIT-ONLY. */
    pickFace(ev: DragPointerLike): FacePick | null;
    /**
     * Draw this geometry as a PREVIEW. ⛔ It is not committed and must not be stored (P6).
     * ⭐ Reusable by a draw gesture once its ring has closed; an in-progress rubber band is
     * not a prism and needs a channel of its own (header).
     */
    previewDraw(record: DraggableSpaceEnvelope): void;
    /** Drop any preview for this id, so the AUTHORITATIVE geometry shows again. */
    previewRestore(id: string): void;
    /** Suspend / resume camera navigation for the length of the gesture. GESTURE-NEUTRAL. */
    setCameraEnabled(enabled: boolean): void;
    /** The arrow affordance, when the surface has one. */
    readonly handles?: SpaceEnvelopeDragHandles;
}

/**
 * ⭐ §ENVELOPE-DRAG-CONSEQUENCE (lane FACE-DRAG-2, 2026-09-07) — WHAT A COMMITTED FACE MOVE
 * TELLS THE REST OF THE APP. Handover ADDENDUM §D asked for exactly this shape.
 *
 * ⛔ `ringBefore` AND `ringAfter` ARE LOAD-BEARING, AND THE REASON IS THE COMMAND'S OWN PAYLOAD.
 * `spaceEnvelope.moveFace` carries `{face, deltaM}` — RELATIVE to whatever solid the store holds
 * at the moment it runs. A consequence handler that saw only the delta could not compute where a
 * derived wall should land without re-deriving the subject's geometry, and re-deriving it is how
 * two answers to one question appear (C84 EI-9). Both rings are carried, in the SAME project-frame
 * scene-XZ metres the record is authored in, so the consumer needs nothing else.
 *
 * ⚠ `ringAfter` IS THE PLANNED RING, NOT A RE-READ OF THE STORE. It is the exact geometry the
 * live preview last showed and the exact geometry the commit was asked to write — the two come
 * from ONE call to `planSpaceEnvelopeFaceMoveInContext`, which is what stops the preview promising
 * a move the commit refuses. If the handler refuses (the store moved under the gesture), the
 * dispatch's own `.catch` is where that is heard; this event is not a receipt for persistence and
 * must not be read as one.
 */
export interface SpaceEnvelopeFaceMoveCommitted {
    readonly spaceEnvelopeId: string;
    readonly face: SpaceEnvelopeFaceRef;
    readonly deltaM: number;
    /** The subject's footprint BEFORE the gesture, project-frame scene-XZ metres, open loop. */
    readonly ringBefore: ReadonlyArray<{ readonly x: number; readonly z: number }>;
    /** The footprint the commit was asked to write. Same frame, same convention. */
    readonly ringAfter: ReadonlyArray<{ readonly x: number; readonly z: number }>;
    /**
     * ⭐ §ENVELOPE-PARTITIONS-FOLLOW (lane WALLS-FOLLOW-WIRE, 2026-09-07) — THE ROOMS THE SAME
     * COMMIT MOVED, each with the two rings that describe its move.
     *
     * ⛔ IT IS NOT A CONVENIENCE FIELD. Founder: *"… AND THE INTERIOR PARTITIONS TOO."* A
     * partition is `boundedBy` its ROOM envelope, never the level's — `buildFromDesignPlan.ts:631`
     * writes `envelopeRole: 'room'` on every partition's `derivedFrom`. So a consumer holding only
     * the SUBJECT's two rings can move the perimeter and can NEVER move a partition, however the
     * cascade is written. The rooms moved in the same patch pair as the subject
     * (`MutateSpaceEnvelope.ts:238-260` maps `plan.adapted` into the same `produceCommand`), and
     * without this field their new rings die inside the gesture.
     *
     * ⚠ `ringBefore` IS READ FROM THE STORE DURING THE DRAG, NOT AFTER IT. The store is untouched
     * until pointer-up (the drag is preview-only, P6), and `deps.dispatch` runs BEFORE this event is
     * raised — so a read taken at commit time could already be the moved ring. Each room's
     * pre-drag ring is therefore captured the FIRST time the plan names it, and never re-read.
     *
     * Empty when nothing adapted, which is the ordinary outcome of pulling a face OUTWARD: no room
     * is stranded by a larger level, so no room moves, so no partition has anything to follow.
     */
    readonly adapted?: readonly SpaceEnvelopeAdaptedRing[];
    /**
     * ⭐ §ENVELOPE-TOP-FACE-HEIGHT (lane TOP-FACE-HEIGHT, L-13118) — THE SECOND AXIS. The
     * subject's height as the drag STARTED, metres.
     *
     * ⛔ IT IS THE FIELD L-13118 NAMED AS THE WHOLE OF THE GAP: *"WHAT IS MISSING IS THE EVENT
     * FIELD, NOT THE VERB."* `SpaceEnvelopeFaceMove.ts:78` — *"The new footprint ring. For
     * top/bottom moves this is unchanged"* — so a top drag changes ONLY `height` (and, on the
     * bottom face, `baseOffset`), and an event carrying rings alone could describe it only as "no
     * change". `wall.updateHeightBatch` already existed and already cost one undo entry; this pair
     * is what reaches it.
     *
     * ⚠ OPTIONAL, AND ABSENT MEANS *"this surface does not report height"* — never "the height did
     * not change". Same §CONTEXT-DATA-HONESTY rule as `adapted`. Every surface built on
     * `installSpaceEnvelopeFaceDragOnSurface` reports both, because both are read off the SAME
     * plan object that produced `ringAfter`.
     */
    readonly heightBefore?: number;
    /** The height the SAME commit was asked to write. Same lockstep rule as `ringAfter`. */
    readonly heightAfter?: number;
    /** The subject's base offset as the drag started, metres. */
    readonly baseOffsetBefore?: number;
    /**
     * The base offset the same commit was asked to write. ⛔ A CHANGE here is a BOTTOM-face drag,
     * and the wall cascade refuses it by name — see `spaceEnvelopeWallFollowPlan.ts`.
     */
    readonly baseOffsetAfter?: number;
    /** Which surface the gesture ran on — `'bim-3d'`, `'site-3d'`, … Free-form by design. */
    readonly surfaceId?: string;
}

/**
 * One envelope that adapted alongside the dragged subject, with the rings that bracket its move.
 * Same frame and same open-loop convention as the subject's own two rings.
 */
export interface SpaceEnvelopeAdaptedRing {
    readonly envelopeId: string;
    /** Its footprint as the store held it when the gesture started. */
    readonly ringBefore: ReadonlyArray<{ readonly x: number; readonly z: number }>;
    /** The footprint the SAME commit was asked to write for it. */
    readonly ringAfter: ReadonlyArray<{ readonly x: number; readonly z: number }>;
    /**
     * §ENVELOPE-TOP-FACE-HEIGHT — its height as the store held it when the gesture started.
     *
     * ⛔ AN ADAPTED ROOM CAN CHANGE HEIGHT AS WELL AS RING, and that is not hypothetical:
     * `SpaceEnvelopeContext.ts:344-363` runs a VERTICAL adaptation (top, then bottom) after the
     * horizontal one, so a room the moved storey would strand vertically is clipped to it. Carrying
     * only its rings would move its partitions in plan and leave them poking through the storey
     * above.
     */
    readonly heightBefore?: number;
    /** The height the SAME commit was asked to write for it. */
    readonly heightAfter?: number;
    /** Its base offset before the commit, metres. */
    readonly baseOffsetBefore?: number;
    /** The base offset the same commit was asked to write for it. */
    readonly baseOffsetAfter?: number;
}

/**
 * ⭐ THE ONE NAME. Emitted on `runtime.events` after the single `spaceEnvelope.moveFace` dispatch.
 *
 * ⛔ IT IS DECLARED HERE, BESIDE THE GESTURE THAT RAISES IT, AND NOT IN EACH WIRING SITE. There
 * are already two wiring sites (the THREE/WebGPU canvas and the 3-D Site) and a third is planned;
 * a string literal spelled at each of them is three chances to spell it differently, and a
 * mis-spelled event name fails SILENTLY at both ends.
 */
export const SPACE_ENVELOPE_FACE_MOVED_EVENT = 'pryzm:spaceEnvelope:faceMoved';

/**
 * ⭐ THE ONE SPELLING OF THE COMMAND THIS GESTURE DISPATCHES (P6). It mirrors
 * `MutateSpaceEnvelope`'s own `readonly type` in `plugins/space-envelope`.
 *
 * ⛔ IT EXISTS BECAUSE THERE ARE NOW TWO WIRING SITES AND A THIRD IS PLANNED. `initTools` (the
 * THREE/WebGPU canvas) and `GISAreaLayout` (the 3-D Site) both dispatch this verb; a literal
 * spelled at each is two chances to spell it differently, and a mis-spelled verb reaches the bus
 * as an UNKNOWN COMMAND — which fails at a different layer, with a different sentence, than the
 * refusal the user should have seen.
 */
export const SPACE_ENVELOPE_MOVE_FACE_COMMAND = 'spaceEnvelope.moveFace';

/** The narrowest shape of the composed `runtime.bus` this needs. Structural — no runtime import. */
export interface SpaceEnvelopeCommandBusLike {
    executeCommand(name: string, payload: unknown): unknown;
}

/**
 * Dispatch the ONE face-move command, always as a promise the caller can `.catch`.
 *
 * ⚠ `Promise.resolve(...)` IS NOT CEREMONY. `RuntimeSlot.bus.executeCommand` is declared to return
 * `unknown` on the composed handle, so calling `.catch` on it directly is a type error — and
 * dropping the `.catch` to satisfy the compiler turns a refused move into an UNHANDLED REJECTION
 * the user never hears about (§FIX-OP-SILENT-NOOP).
 */
export function dispatchSpaceEnvelopeFaceMove(
    bus: SpaceEnvelopeCommandBusLike,
    payload: { spaceEnvelopeId: string; face: SpaceEnvelopeFaceRef; deltaM: number },
): Promise<unknown> {
    return Promise.resolve(bus.executeCommand(SPACE_ENVELOPE_MOVE_FACE_COMMAND, payload));
}

/** The narrowest shape of `runtime.events` this needs. Structural, so no runtime import. */
export interface SpaceEnvelopeFaceMoveEventSink {
    emit(name: string, payload: unknown): void;
}

/**
 * Emit {@link SPACE_ENVELOPE_FACE_MOVED_EVENT}, never throwing into the gesture.
 *
 * ⚠ A consequence handler that throws must not kill the pointer-up that raised it: the move is
 * already dispatched by the time this runs, so an exception here would leave the user with a
 * committed edit and a half-finished gesture (the camera hand-back happens first, deliberately).
 */
export function emitSpaceEnvelopeFaceMoved(
    events: SpaceEnvelopeFaceMoveEventSink | null | undefined,
    ev: SpaceEnvelopeFaceMoveCommitted,
): void {
    if (!events || typeof events.emit !== 'function') return;
    try {
        events.emit(SPACE_ENVELOPE_FACE_MOVED_EVENT, ev);
    } catch (e) {
        console.warn('[spaceEnvelopeFaceDrag] a face-move consequence listener threw (non-fatal):', e);
    }
}

/** Everything the gesture needs that is NOT about drawing or picking. */
export interface SpaceEnvelopeFaceDragCoreDeps {
    /** The element the pointer events arrive on. */
    readonly domElement: HTMLElement;
    /** The surface this gesture is running on. */
    readonly surface: SpaceEnvelopeDragSurface;
    /**
     * The AUTHORITATIVE record for an id. ⛔ Resolved LAZILY on every gesture rather than
     * captured once: a reference threaded in at install time goes stale the moment the
     * runtime is recomposed (project switch, backend swap, device-loss recovery) — the
     * §L-545-SITE-CAPTURE lesson the serializer states in full.
     */
    readonly getRecord: (id: string) => DraggableSpaceEnvelope | undefined;
    /** Dispatch through the bus. THE ONLY mutation path (P6). */
    readonly dispatch: (payload: {
        spaceEnvelopeId: string;
        face: SpaceEnvelopeFaceRef;
        deltaM: number;
    }) => void;
    /** Report a refusal to the user in the surface's own idiom. Optional. */
    readonly onRefusal?: (message: string) => void;
    /** Live readout while dragging — "+1.35 m". Optional. */
    readonly onPreview?: (deltaM: number, faceLabel: string) => void;
    /**
     * §RESI-STAGE-G — EVERY envelope in the store, read lazily per pointer move, so the
     * preview is judged by the SAME contextual planner the commit uses: a room face that
     * would leave its level is refused DURING the drag with both numbers, and the neighbour
     * that shares the face is previewed moving with it (STR §11 / §12). Omit it and the
     * preview judges the subject alone — which is exactly the state where the preview can
     * promise a move the commit then refuses, so `initTools` never omits it.
     */
    readonly getWorld?: () => readonly DraggableSpaceEnvelope[];
    /**
     * ⭐ §RESI-STAGE-G — DOUBLE-CLICK OPENS THE FOOTPRINT EDITOR (C114 §11 item 7). Handled
     * HERE rather than by a second controller because this gesture already owns the only
     * pick that can answer *"which envelope is under the pointer?"*, and a rival picker
     * would be a second answer to that question (C84 EI-9) that could resolve a different
     * envelope than the one the drag is about to move.
     *
     * ⛔ IT IS NOT A COMMAND AND IT WRITES NOTHING. The handler is the L7 tool's
     * `enterProfileEditMode`; the mutation is the `spaceEnvelope.setFootprint` that tool
     * dispatches on Apply (P6). Omit it and the double-click does nothing at all.
     */
    readonly onProfileEdit?: (spaceEnvelopeId: string) => void;
    /**
     * ⭐ §ENVELOPE-DRAG-CONSEQUENCE — called ONCE, immediately after the single dispatch, with
     * both rings (see {@link SpaceEnvelopeFaceMoveCommitted}).
     *
     * ⛔ IT IS NOT A SECOND MUTATION PATH (P6). Nothing here writes; a consequence that wants to
     * move a wall dispatches its OWN command from its OWN handler, and that is a second undo entry
     * by design — a cascade folded into this gesture's single dispatch would be a store write
     * nobody asked the bus for.
     *
     * ⚠ A NO-OP GESTURE RAISES NOTHING, exactly as it dispatches nothing. A listener that fired on
     * a click-that-was-not-an-edit would rebuild derived geometry for a move that never happened.
     */
    readonly onCommitted?: (ev: SpaceEnvelopeFaceMoveCommitted) => void;
    /** Names the surface in {@link SpaceEnvelopeFaceMoveCommitted.surfaceId}. Optional. */
    readonly surfaceId?: string;
}

/** Below this a drag is a click, not an edit. Not a dimension — a gesture threshold. */
const MIN_COMMITTED_DELTA_M = 1e-3;

interface ActiveDrag {
    readonly id: string;
    readonly face: SpaceEnvelopeFaceRef;
    readonly axis: { x: number; y: number; z: number };
    readonly grabWorld: { x: number; y: number; z: number };
    readonly startRecord: DraggableSpaceEnvelope;
    lastDeltaM: number;
    /**
     * §ENVELOPE-DRAG-CONSEQUENCE — the ring the LAST accepted plan produced, kept in lockstep with
     * `lastDeltaM`. ⛔ Written in the SAME statement as the delta and read only when the delta
     * commits, so the two can never describe different frames of the drag.
     */
    lastPlannedRing: ReadonlyArray<{ readonly x: number; readonly z: number }> | null;
    /**
     * §ENVELOPE-TOP-FACE-HEIGHT — the height and base the LAST accepted plan produced, written in
     * the SAME statement as `lastPlannedRing`. ⛔ One statement, three fields: a top drag leaves the
     * ring alone and moves these, a side drag does the opposite, and the committed event must never
     * be able to carry a ring from one frame of the drag and a height from another.
     */
    lastPlannedHeight: number | null;
    lastPlannedBaseOffset: number | null;
    /**
     * §ENVELOPE-PARTITIONS-FOLLOW — each adapted envelope's PRE-DRAG geometry, captured the first
     * time the plan names it and never overwritten. ⛔ Captured during the drag, because the only
     * window in which the store is guaranteed to still hold the pre-drag geometry closes at
     * `deps.dispatch` — which runs before the committed event is raised.
     *
     * ⭐ ONE MAP FOR ALL THREE READINGS (ring, height, base), so the first-sight rule below is
     * written ONCE and the three can never be captured on different frames.
     */
    readonly adaptedBefore: Map<string, {
        readonly ring: ReadonlyArray<{ readonly x: number; readonly z: number }>;
        readonly height: number;
        readonly baseOffset: number;
    }>;
    /**
     * The adapted rings the LAST accepted plan produced — the same lockstep rule as
     * `lastPlannedRing`, and computed from the SAME plan object, so the subject's ring and the
     * rooms' rings can never come from different frames of the drag.
     */
    lastAdapted: readonly SpaceEnvelopeAdaptedRing[] | null;
    /** Neighbours the preview has REDRAWN — restored from the store on release / click. */
    previewedNeighbourIds: Set<string>;
}

/**
 * Install the face-drag interaction on ANY surface. Returns a disposer — call it on
 * teardown, or the listeners outlive the scene and the next runtime gets two of them.
 *
 * The THREE/WebGPU entry point is `installSpaceEnvelopeFaceDrag` in
 * `spaceEnvelopeFaceDragController.ts`, which builds the THREE adapter and calls this.
 */
export function installSpaceEnvelopeFaceDragOnSurface(
    deps: SpaceEnvelopeFaceDragCoreDeps,
): () => void {
    const { surface } = deps;
    let active: ActiveDrag | null = null;

    const onPointerDown = (ev: PointerEvent): void => {
        if (ev.button !== 0) return;
        const picked = surface.pickFace(ev);
        if (!picked) return;
        const { id, face } = picked;

        const record = deps.getRecord(id);
        if (!record) {
            // ⛔ LOUD, NEVER SILENT. A drawn face with no record behind it means the scene
            // and the store have diverged — the exact state a redraw-on-diff subscriber
            // exists to prevent — and a silent return would leave the user pulling at a
            // solid that does not respond, with nothing anywhere saying why.
            console.warn(
                `[spaceEnvelopeFaceDrag] a face of '${id}' was grabbed but the store holds no such `
                + 'envelope — the scene and the ONE authority have diverged; refusing to drag.',
            );
            return;
        }
        if (record.role !== undefined && record.role !== 'level' && record.role !== 'room') {
            deps.onRefusal?.(
                'The maximum buildable volume is SOLVED from the zoning rules, not drawn — '
                + 'it is a study, and PRYZM will not let you drag one. Draw a LEVEL envelope instead.',
            );
            return;
        }

        const prism = prismOfSpaceEnvelopeRecord(record);
        const axis = spaceEnvelopeFaceAxis(prism, face);
        if (axis === null) {
            deps.onRefusal?.('That face has no direction to move along — its ring edge is degenerate.');
            return;
        }

        active = {
            id,
            face,
            axis,
            grabWorld: { x: picked.point.x, y: picked.point.y, z: picked.point.z },
            startRecord: record,
            lastDeltaM: 0,
            lastPlannedRing: null,
            lastPlannedHeight: null,
            lastPlannedBaseOffset: null,
            adaptedBefore: new Map<string, {
                readonly ring: ReadonlyArray<{ readonly x: number; readonly z: number }>;
                readonly height: number;
                readonly baseOffset: number;
            }>(),
            lastAdapted: null,
            previewedNeighbourIds: new Set<string>(),
        };
        // ⚠ Capture the pointer so a drag that leaves the canvas still ends HERE. Without
        // it, releasing over a panel leaves `active` set and the next click continues a drag
        // the user believes they finished.
        deps.domElement.setPointerCapture?.(ev.pointerId);
        // ⛔ THE CAMERA STOPS HERE, NOT AT `stopPropagation`. On the THREE surface
        // `camera-controls` binds the SAME element, and same-element listeners are not
        // stopped by propagation (that needs `stopImmediatePropagation`, which would also
        // silence listeners this gesture has no right to silence). Every other
        // direct-manipulation drag in this app disables the controls instead. Re-enabled in
        // `finish` — on release AND on cancel, so a gesture interrupted by the browser
        // cannot leave the camera dead.
        surface.setCameraEnabled(false);
        // The handles follow the face being dragged, and the grabbed one stays lit.
        surface.handles?.setTarget(record);
        surface.handles?.setActiveFace(face);
        ev.stopPropagation();
    };

    /**
     * ⭐ §25.6 — THE HANDLES APPEAR ON THE ENVELOPE UNDER THE POINTER.
     *
     * This is how the gesture becomes discoverable, and it asks NO new question — it is the
     * SAME `pickFace` the drag and the double-click use, so hovering can never light a face
     * that clicking would not move.
     *
     * ⚠ Hover is skipped entirely while a drag is active: during a gesture the handles
     * belong to the dragged envelope, and re-picking under the pointer would hand them to
     * whatever the moving face is currently passing over.
     */
    const onHover = (ev: PointerEvent): void => {
        const handles = surface.handles;
        if (!handles || active) return;
        const picked = surface.pickFace(ev);
        if (!picked) {
            // ⛔ CLEARED, NOT LEFT BEHIND. Handles on an envelope the pointer has left
            // belong to nothing the user is looking at, and the next click on them starts a
            // drag on an envelope they had stopped aiming at.
            if (handles.targetId() !== null) handles.setTarget(null);
            return;
        }
        const record = deps.getRecord(picked.id);
        if (!record) return;
        handles.setTarget(record);
        handles.setActiveFace(picked.face);
    };

    const onPointerMove = (ev: PointerEvent): void => {
        if (!active) {
            onHover(ev);
            return;
        }
        const ray = surface.rayInSceneFrame(ev);
        // ⛔ The surface could not answer. HOLD the face rather than moving it to a number
        // nothing produced — see the port's own note.
        if (ray === null) return;
        const onAxis = closestPointOnFaceAxis(
            { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z },
            { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z },
            active.grabWorld,
            active.axis,
        );
        // ⛔ `null` is the camera looking straight down the drag axis: the gesture carries no
        // information, so the face HOLDS rather than jumping to a number the user could not
        // have intended.
        if (onAxis === null) return;

        const prism = prismOfSpaceEnvelopeRecord(active.startRecord);
        const reading = readSpaceEnvelopeFaceDrag(prism, active.face, active.grabWorld, onAxis);
        if (reading === null) return;

        // ⭐ THE SAME PLANNER THE COMMIT USES — the CONTEXTUAL one (§RESI-STAGE-G). A drag
        // that would leave the level, or strand a room, is refused NOW with both numbers,
        // and leaves the last valid preview on screen.
        const world = (deps.getWorld?.() ?? [active.startRecord]).map(contextEntryOfDraggable);
        const subject = contextEntryOfDraggable(active.startRecord);
        const planned = planSpaceEnvelopeFaceMoveInContext({
            subject: { ...subject, prism },
            face: active.face,
            deltaM: reading.deltaM,
            world: world.some((w) => w.prism.id === subject.prism.id) ? world : [...world, subject],
        });
        if ('refusal' in planned) {
            deps.onRefusal?.(planned.refusal.message);
            return;
        }
        const { plan } = planned;
        const plannedRing = plan.entry.footprint.map((p) => ({ x: p.x, z: p.z }));
        // ⛔ ONE STATEMENT, TWO FIELDS. The delta and the ring it produced are written together so
        // the committed event can never carry a delta from one frame and a ring from another.
        active.lastDeltaM = reading.deltaM;
        active.lastPlannedRing = plannedRing;
        // §ENVELOPE-TOP-FACE-HEIGHT — the other two thirds of the same plan, written here so a
        // top drag (ring identical, height moved) is as fully described as a side drag.
        active.lastPlannedHeight = plan.entry.height;
        active.lastPlannedBaseOffset = plan.entry.baseOffset;
        deps.onPreview?.(reading.deltaM, reading.faceLabel);
        // PREVIEW ONLY — the store is untouched until release (P6).
        const previewed = {
            ...active.startRecord,
            footprint: plannedRing,
            baseOffset: plan.entry.baseOffset,
            height: plan.entry.height,
        };
        surface.previewDraw(previewed);
        // ⭐ THE HANDLE RIDES THE FACE IT IS DRAGGING. Re-placed from the PREVIEW record,
        // never from the store — the store still holds the pre-drag geometry, so reading it
        // here would pin the handle to where the face WAS while the face moved away from
        // under the user's pointer.
        surface.handles?.setTarget(previewed);
        // ⭐ THE NEIGHBOUR FOLLOWS IN THE PREVIEW TOO — what the commit will write, drawn
        // before it is written. A neighbour that adapted on an earlier frame and not on this
        // one is put back from the store, so the preview never leaves a phantom.
        const adaptedNow = new Set<string>();
        // §ENVELOPE-PARTITIONS-FOLLOW — built in the SAME pass that draws the preview, from the
        // SAME `plan`, so the rings the partitions will follow are the rings the user is looking at.
        const adaptedRings: SpaceEnvelopeAdaptedRing[] = [];
        for (const e of plan.adapted) {
            const rec = deps.getRecord(e.envelopeId);
            if (!rec) continue;
            adaptedNow.add(e.envelopeId);
            active.previewedNeighbourIds.add(e.envelopeId);
            const ringAfter = e.footprint.map((p) => ({ x: p.x, z: p.z }));
            // ⛔ FIRST SIGHT WINS. `rec` is the STORE's record and the store is untouched until
            // pointer-up, so any read during the drag is the pre-drag ring — but re-reading it on
            // every frame would silently start returning the COMMITTED ring the moment a future
            // change made the dispatch synchronous, and a `ringBefore` equal to `ringAfter` reads
            // as "this room did not move" rather than as a bug.
            if (!active.adaptedBefore.has(e.envelopeId)) {
                active.adaptedBefore.set(e.envelopeId, {
                    ring: rec.footprint.map((p) => ({ x: p.x, z: p.z })),
                    height: rec.height,
                    baseOffset: rec.baseOffset,
                });
            }
            const capturedBefore = active.adaptedBefore.get(e.envelopeId)!;
            adaptedRings.push({
                envelopeId: e.envelopeId,
                ringBefore: capturedBefore.ring,
                ringAfter,
                // §ENVELOPE-TOP-FACE-HEIGHT — an adapted room shrinks VERTICALLY as well as in plan
                // (`SpaceEnvelopeContext.ts:344-363`), so its partitions need both axes or they end
                // up through the storey above.
                heightBefore: capturedBefore.height,
                heightAfter: e.height,
                baseOffsetBefore: capturedBefore.baseOffset,
                baseOffsetAfter: e.baseOffset,
            });
            surface.previewDraw({
                ...rec,
                footprint: ringAfter,
                baseOffset: e.baseOffset,
                height: e.height,
            });
        }
        // Lockstep with `lastPlannedRing` — both describe THIS frame's plan and no other.
        active.lastAdapted = adaptedRings;
        for (const id of active.previewedNeighbourIds) {
            if (adaptedNow.has(id)) continue;
            surface.previewRestore(id);
            active.previewedNeighbourIds.delete(id);
        }
    };

    const finish = (ev: PointerEvent): void => {
        if (!active) return;
        const drag = active;
        active = null;
        deps.domElement.releasePointerCapture?.(ev.pointerId);
        // ⛔ FIRST, AND ON EVERY EXIT FROM THIS FUNCTION. `pointercancel` routes here too, so
        // a gesture the browser tears down (a touch turning into a system swipe, a context
        // menu) cannot leave the camera permanently frozen — which is a far worse failure
        // than the orbit-while-dragging this pairs with.
        surface.setCameraEnabled(true);
        surface.handles?.setActiveFace(null);

        if (Math.abs(drag.lastDeltaM) < MIN_COMMITTED_DELTA_M) {
            // A click, not an edit. Show the AUTHORITATIVE geometry so the preview cannot
            // leave a phantom behind, and dispatch nothing (C113 §6.4).
            surface.previewRestore(drag.id);
            const live = deps.getRecord(drag.id);
            // The handles go back on the AUTHORITATIVE geometry with the prism, or a
            // cancelled drag leaves a handle floating where the preview last put it.
            if (live) surface.handles?.setTarget(live);
            for (const id of drag.previewedNeighbourIds) surface.previewRestore(id);
            return;
        }
        // ⭐ EXACTLY ONE DISPATCH FOR THE WHOLE GESTURE. The redraw that follows is the
        // store's own `subscribeDirty` notification, not this closure — so the committed
        // solid on screen is the one the store holds, never the one the preview computed.
        deps.dispatch({ spaceEnvelopeId: drag.id, face: drag.face, deltaM: drag.lastDeltaM });
        // ⭐ §ENVELOPE-DRAG-CONSEQUENCE — AFTER the dispatch, never instead of it, and carrying
        // BOTH rings because the command's own payload is relative (ADDENDUM §D). Consumers today:
        // none in the tree — this is built ahead of the wall-follows-envelope cascade so that lane
        // does not have to reopen the gesture to get its input.
        // ⚠ `lastPlannedRing` is non-null whenever `lastDeltaM` cleared the threshold — they are
        // written together — but it is CHECKED rather than asserted: a null here would mean the two
        // had drifted, and emitting an event with an invented ring is worse than emitting none.
        if (deps.onCommitted && drag.lastPlannedRing) {
            try {
                deps.onCommitted({
                    spaceEnvelopeId: drag.id,
                    face: drag.face,
                    deltaM: drag.lastDeltaM,
                    ringBefore: drag.startRecord.footprint.map((p) => ({ x: p.x, z: p.z })),
                    ringAfter: drag.lastPlannedRing,
                    // ⭐ §ENVELOPE-TOP-FACE-HEIGHT (L-13118) — THE FIELD THAT WAS MISSING. Sent on
                    // EVERY committed drag, not only a top one: "the height did not change" is a
                    // fact the consumer is entitled to read, and omitting it on side drags would
                    // make absence ambiguous between "unchanged" and "not reported".
                    // ⚠ CHECKED, NOT ASSERTED, for the same reason `lastPlannedRing` is: these three
                    // are written in one statement, so a null here would mean they had drifted, and
                    // an invented height is worse than an omitted one.
                    ...(drag.lastPlannedHeight !== null
                        ? {
                            heightBefore: drag.startRecord.height,
                            heightAfter: drag.lastPlannedHeight,
                        }
                        : {}),
                    ...(drag.lastPlannedBaseOffset !== null
                        ? {
                            baseOffsetBefore: drag.startRecord.baseOffset,
                            baseOffsetAfter: drag.lastPlannedBaseOffset,
                        }
                        : {}),
                    // ⭐ §ENVELOPE-PARTITIONS-FOLLOW — the rooms the SAME commit moved. Omitted
                    // rather than sent empty when nothing adapted, so a consumer can tell "no room
                    // moved" from "this surface does not report rooms" (§CONTEXT-DATA-HONESTY).
                    ...(drag.lastAdapted && drag.lastAdapted.length > 0
                        ? { adapted: drag.lastAdapted }
                        : {}),
                    ...(deps.surfaceId !== undefined ? { surfaceId: deps.surfaceId } : {}),
                });
            } catch (e) {
                console.warn('[spaceEnvelopeFaceDrag] the committed-move listener threw (non-fatal):', e);
            }
        }
    };

    /**
     * §RESI-STAGE-G — double-click a face, edit the FOOTPRINT (C114 §11 item 7).
     *
     * ⚠ It resolves through `pickFace`, the same pick the drag uses, and hands the id to the
     * tool WITHOUT judging it: whether this envelope can be edited is
     * `SpaceEnvelopeProfileEditTool.profileEditAvailability`'s answer, and asking here too
     * would be a second verdict that could disagree with the button's (C84 EI-9.2).
     *
     * ⛔ A double-click on empty space, or on anything that is not an envelope face, is left
     * ALONE — `stopPropagation` is called only on a hit, so the existing double-click paths
     * (slab profile edit, SelectionManager) are untouched by this listener's presence.
     */
    const onDoubleClick = (ev: MouseEvent): void => {
        if (!deps.onProfileEdit) return;
        const picked = surface.pickFace(ev);
        if (!picked) return;
        ev.stopPropagation();
        ev.preventDefault();
        deps.onProfileEdit(picked.id);
    };

    /** The pointer left the canvas entirely — no envelope is under it, so no handles. */
    const onPointerLeave = (): void => {
        if (active) return;
        surface.handles?.setTarget(null);
    };

    deps.domElement.addEventListener('pointerdown', onPointerDown);
    deps.domElement.addEventListener('pointermove', onPointerMove);
    deps.domElement.addEventListener('pointerup', finish);
    deps.domElement.addEventListener('pointercancel', finish);
    deps.domElement.addEventListener('pointerleave', onPointerLeave);
    deps.domElement.addEventListener('dblclick', onDoubleClick);

    return () => {
        deps.domElement.removeEventListener('pointerdown', onPointerDown);
        deps.domElement.removeEventListener('pointermove', onPointerMove);
        deps.domElement.removeEventListener('pointerup', finish);
        deps.domElement.removeEventListener('pointercancel', finish);
        deps.domElement.removeEventListener('pointerleave', onPointerLeave);
        deps.domElement.removeEventListener('dblclick', onDoubleClick);
        // ⛔ THE CAMERA IS HANDED BACK ON TEARDOWN. A disposer that ran mid-drag would
        // otherwise leave navigation disabled for the life of the next runtime — a dead
        // camera with no listener left anywhere to re-enable it.
        if (active) surface.setCameraEnabled(true);
        surface.handles?.setTarget(null);
        active = null;
    };
}
