// §ENVELOPE-DRAW C5 (lane ENVELOPE-DRAW-2, 2026-09-07) — THE ONE 3D SITE ADAPTER.
// §ENVELOPE-FACE-DRAG-ON-SITE-VIEWS (lane FACE-DRAG, 2026-09-07) — and now the FACE-DRAG ports too.
//
// PLAN-ENVELOPE-DRAW-ON-SITE-VIEWS §3a · L-13045 · L-13050 · L-13051 · C58 §1.19 · C16 CA-18 ·
// C114 §10 · ADR-0380 D4 · P2 · P6 · P8 · C84 EI-9.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ ONE CESIUM ADAPTER, TWO GESTURES — AND THE SECOND ONE WAS ADDED HERE RATHER THAN BESIDE IT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// L-13051 is the founder's own correction of the framing: *"I WANT TO BE ABLE TO CREATE IT — THEN
// MODIFY BY DRAGGING FACES — BOTH."* CREATE and EDIT are different GESTURES (click-to-place-
// vertices → close → commit, versus pick-a-face → drag along its axis → commit) but they are two
// halves of ONE journey on ONE surface, and they share three quarters of their machinery: a
// screen ray, a preview channel, a camera suspend. Building a second Cesium class for the second
// gesture would mint FOUR adapters where TWO suffice — the same C84 EI-9 duplication the port
// extraction exists to prevent, one level up. So this class implements BOTH ports.
//
// ⚠ THE CLASS NAME IS HISTORICAL. It is the 3-D Site site-envelope adapter, not the "draw" one.
// Renaming it would churn every registration site and two spec files for no behavioural gain;
// this note is the cheaper honest answer.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT THIS FILE IS ALLOWED TO CONTAIN, AND WHAT IT IS NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Exactly the two things that genuinely branch per renderer: SCREEN → GROUND, and the IN-PROGRESS
// PREVIEW. The click machine, the ortho rule, the arc gesture, the loop generators, the undo
// semantics, `canClose()` and the area all live ABOVE this file in `siteEnvelopeDrawArming.ts`,
// once, for both surfaces. ⛔ If this adapter ever grows one of those it has stolen work that
// belongs above it (plan §7 rule 4) and the two site views will drift — which is the entire
// failure `SlabTool.ts:175` already demonstrates as a fourth diverged polyline machine.
//
// ⛔ P2 — `import type * as CesiumNS`. TYPE-ONLY. The Cesium namespace object arrives as a
// constructor dep from `GISAreaLayout`'s existing dynamic import, exactly as `SiteBoundaryDrawTool`
// takes it, so this file adds nothing to the main bundle and imports no THREE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE PICK IS NOT REINVENTED — IT IS `SiteBoundaryDrawTool.pickLatLon`, THE ONE FUNCTION IN THE
// REPO THAT ALREADY ANSWERS THIS ON THIS RENDERER
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `scene.pickPosition()` first (the RENDERED surface — 3D tiles / terrain), falling back to
// `camera.getPickRay()` + `globe.pick()` (the ellipsoid). That fallback is not decoration: on a
// Forma-mode scene with the globe hidden, or before terrain streams in, one of the two returns
// nothing and the other does. A hand-rolled `getPickRay`-only pick would work in the reviewer's
// session and return null on the founder's.
//
// ⚠ AND ITS CORRECTNESS IS NOT UNIT-TESTABLE (plan R4). `scene.pickPosition` needs a real depth
// buffer; `globe.pick` needs a real globe. ⛔ THIS LANE DELIBERATELY BUILDS NO FAKE VIEWER: a fake
// assembled from the same assumptions as the code cannot falsify them
// ([[fake-more-capable-than-real]]). What IS pinned headlessly is the PROJECTION half — the
// lat/lon ⇄ project-XZ round trip in `siteEnvelopeDrawFrame.ts`, on a site with θ ≠ 0, to
// sub-centimetre. The pick half is browser-only and is reported as such, never as covered.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ TWO LIVE HANDLERS ON ONE CANVAS IS THE DEFECT, NOT THE DESIGN (plan §7 rule 2)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `CesiumViewport` already owns a `ScreenSpaceEventHandler` for selection, and Cesium fires BOTH.
// So a draw click would ALSO run `scene.pick` and the context-building query panel. This adapter
// therefore asks the viewport to SUSPEND scene picking for the duration
// (`setScenePickingEnabled(false)` on arm, `true` on disarm) rather than constructing a rival
// handler and hoping. ⚠ Plan R2 — the exact firing ORDER of two Cesium handlers on one click is
// runtime behaviour nobody has recorded here; the suspension makes the order IRRELEVANT, which is
// why it is done unconditionally rather than after measuring.
//
// ⭐ CAMERA NAVIGATION STAYS LIVE, DELIBERATELY. `setNavigationEnabled(false)` exists and is NOT
// called: click-to-place at parcel scale needs pan and zoom while drawing, and
// `SiteBoundaryDrawTool` has shipped for months with the camera controller live alongside its own
// LEFT_CLICK. Disabling it would be a regression dressed as caution. (A future DRAG mode would
// need it; a drag mode is not this lane.)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE DOUBLE-CLICK ARTEFACT, NAMED RATHER THAN HIDDEN
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Cesium emits LEFT_CLICK, LEFT_CLICK, LEFT_DOUBLE_CLICK for a double click, so the closing
// gesture places one extra corner on top of the previous one. `SiteBoundaryDrawTool` ships with
// exactly this behaviour today. ⛔ It is NOT patched here with a pixel/time heuristic invented for
// the occasion — it is collapsed where it belongs, in the ONE `finish()` above both adapters,
// which drops consecutive coincident corners before storing. One rule, both renderers.

import type * as CesiumNS from 'cesium';
import { trace } from '@opentelemetry/api';
import type { ArcVertex2D } from '@pryzm/geometry-slab/boundary-path';
import {
    describeFaceRef,
    pickNearestSpaceEnvelopeFace,
    prismOfSpaceEnvelopeRecord,
    spaceEnvelopeFaceHandles,
    type SpaceEnvelopeFaceRef,
    type SpaceEnvelopePrism,
} from '@pryzm/geometry-space-envelope';
import type {
    EnvelopeDrawDimLabel,
    EnvelopeDrawSink,
    EnvelopeDrawSurface,
    EnvelopeRosterRing,
    SceneXZPoint,
} from './envelopeDrawSurface';
import {
    latLonToProjectXZ,
    projectXZToLatLon,
    resolveSiteDrawFrame,
    type SiteDrawFrame,
} from './siteEnvelopeDrawFrame';
import { enuToSceneXZ, sceneXZToEnu } from '../geospatial/sceneEnuFrame';
// §ENVELOPE-FACE-DRAG-PER-LEVEL (L-13236) — the storey the panel selected. Read for the AFFORDANCE
// only: the pick restriction itself lives ONCE in the renderer-free gesture, never here (see
// `spaceEnvelopeDragSurface.ts`'s `pick` wrapper). This file draws what that gesture will accept.
import {
    getSpaceEnvelopeFaceDragFocus,
    subscribeSpaceEnvelopeFaceDragFocus,
} from './spaceEnvelopeFaceDragFocusState';
// ⛔ TYPE-ONLY, therefore ERASED — no runtime edge from this file to the engine, and no THREE (P2).
// The four port shapes live once, in the renderer-free gesture; re-declaring them here would be a
// second copy of the contract this adapter exists to satisfy (C84 EI-9).
import type {
    DragPointerLike,
    DraggableSpaceEnvelope,
    FacePick,
    SceneRay,
    SpaceEnvelopeDragHandles,
    SpaceEnvelopeDragSurface,
} from '../../engine/spaceEnvelopeDragSurface';

const _tracer = trace.getTracer('pryzm.site.siteEnvelopeDrawCesium');

const VIOLET_CSS = '#6600FF';

/** §ENVELOPE-DRAW-LIVE-DIMS (L-13308) — the chip face: the 3D Site's existing dimension chip's. */
const DIM_LABEL_FONT = '600 14px system-ui, sans-serif';

/**
 * §25.6 GESTURE 1 — the two arrow colours, COPIED FROM THE THREE GIZMO rather than re-chosen.
 * `SpaceEnvelopeFaceGizmoBuilder.ts:65/67` owns `0x6600ff` / `0xb388ff`; the same gesture wearing
 * two different violets on two surfaces would read as two different affordances.
 */
const HANDLE_CSS = VIOLET_CSS;
const HANDLE_ACTIVE_CSS = '#b388ff';

/** Arrow width in PIXELS — screen-space, so an arrow stays grabbable-looking at any zoom. */
const HANDLE_WIDTH_PX = 9;

/**
 * §ENVELOPE-DRAW-PREVIEW-LINE (L-13088) — the memo key for a picked vertex's ground height.
 *
 * ⚠ MILLIMETRE PRECISION, DELIBERATELY, AND IT IS THE LOOSE END OF THIS DESIGN. Scene XZ is metres,
 * so 3 decimals key a corner to the millimetre — tight enough that two genuinely different corners
 * never collide, loose enough to survive the float noise of a round-trip through
 * `projectXZToLatLon`. A vertex the ortho rule has MOVED is a different key and misses on purpose;
 * `groundHeightFor` documents why that miss is safe.
 */
function vertexKey(p: { readonly x: number; readonly z: number }): string {
    return `${p.x.toFixed(3)}|${p.z.toFixed(3)}`;
}

/**
 * §ENVELOPE-DRAW-PREVIEW-LINE (L-13088) — how many picked ground heights to remember.
 *
 * A gesture is tens of corners; a hover is thousands of pointer-moves, and only the pointer-moves
 * that PICK write here. 256 is far above any real perimeter and small enough that the map cannot
 * become a leak inside one long draw. Eviction is oldest-first (insertion order), because the
 * corners a preview re-reads are the recent ones.
 */
const PICK_HEIGHT_MEMO_MAX = 256;

/**
 * §ENVELOPE-DRAW-PREVIEW-LINE (L-13088) — how far above its seat the preview line and dots sit.
 *
 * Half a metre: enough to clear z-fighting against the §SITE-SCOPE slab top (which itself sits on
 * sampled relief + 0.3 m) at parcel scale, small enough that the line still reads as lying ON the
 * ground rather than floating over it. The dots additionally disable the depth test, so they stay
 * visible through context massing; the LINE deliberately does not, so a corner behind a neighbour
 * reads as behind it.
 */
const PREVIEW_LIFT_M = 0.5;

export interface SiteEnvelopeDrawCesiumDeps {
    readonly viewer: CesiumNS.Viewer;
    readonly Cesium: typeof CesiumNS;
    /**
     * The ONE site frame origin (R6). Production: `GISAreaLayout.getSiteOrigin`, which is
     * `resolveSiteFrameOrigin(getCurrentSiteOrigin(), storeLocation, lastGeocodeFrame)` — the SAME
     * call the parcel ring is committed about. ⛔ Never a re-read geocode.
     */
    readonly getOrigin: () => { lat: number; lon: number } | null;
    /**
     * The site's `SiteLocation`, or `null` when the store cannot be reached. ⛔ `null` is a REFUSAL,
     * not θ = 0 — the §L-446 ambiguity. Production: `runtime.siteModelStore.getSite()?.location`.
     */
    readonly getSiteLocation: () => { trueNorth?: number } | null;
    /**
     * Suspend / restore the viewport's own selection pick for the duration of a draw.
     * Production: `CesiumViewport.setScenePickingEnabled`. Optional so a host that has not wired
     * it yet still gets a working draw — with the selection pick firing alongside, which is worse
     * but not broken, and is logged as such rather than silently tolerated.
     */
    readonly setScenePickingEnabled?: (on: boolean) => void;

    // ── §ENVELOPE-FACE-DRAG-ON-SITE-VIEWS — the four ports' inputs. ─────────────────────────
    // Every one is OPTIONAL, and that is a reachability statement rather than caution: a host
    // that wires the DRAW but not the DRAG gets a working draw and a `canDrag()` that answers
    // `false` with a reason, instead of a face-drag that silently does nothing (which is exactly
    // the defect D7 was — a panel promising a gesture the surface did not have).

    /**
     * ⭐ THE FRAME `renderSpaceEnvelopes` ACTUALLY DREW IN. Production:
     * `CesiumViewport.getSpaceEnvelopeSceneFrame()`.
     *
     * ⛔ NOT `resolveSiteDrawFrame`, AND THE DIFFERENCE IS LOAD-BEARING. The draw frame is the
     * right frame for a gesture that PRODUCES coordinates (it is the frame the parcel ring is
     * committed about). A PICK must land on the pixels that were painted, so it must read the
     * origin, θ and terrain seat the RASTERISER used. Two frames that agree today and diverge on
     * a terrain re-seat give a drag that grabs nothing — or grabs the wrong face, which looks
     * like a physics bug and is a frame bug (§L-430 / L-10740).
     */
    readonly getSceneFrame?: () => {
        readonly originLat: number;
        readonly originLon: number;
        readonly thetaRad: number;
        readonly baseHeightM: number;
    } | null;
    /**
     * Every authored envelope, read LAZILY on each pick — never captured. Production:
     * `[...runtime.stores.spaceEnvelope.getState().values()]`.
     *
     * ⭐ IT IS THE SAME SET `renderSpaceEnvelopes` DRAWS FROM, which is what makes
     * *"visible ⇒ pickable"* and *"pickable ⇒ visible"* both true by construction rather than by
     * care. The PERMITTED buildable study is not in this store at all (it is
     * §ENVELOPE-VIA-MASSING's `formaMassingEntities`), so his `§ENVELOPE-ONE-VISIBILITY mode=none`
     * toggle — which hides the study while the authored envelopes keep drawing — cannot make a
     * hidden thing draggable or a drawn thing un-grabbable.
     */
    readonly getEnvelopes?: () => readonly DraggableSpaceEnvelope[];
    /** `previewDraw`. Production: `CesiumViewport.setSpaceEnvelopePreview`. Writes NO store (P6). */
    readonly setEnvelopePreview?: (
        id: string,
        geometry: {
            readonly footprint: ReadonlyArray<{ readonly x: number; readonly z: number }>;
            readonly baseOffset: number;
            readonly height: number;
        },
    ) => void;
    /** `previewRestore`. Production: `CesiumViewport.clearSpaceEnvelopePreview`. */
    readonly clearEnvelopePreview?: (id: string) => void;
    /**
     * `setCameraEnabled`. Production: `CesiumViewport.setNavigationEnabled`.
     * ⛔ NOT `setScenePickingEnabled` — that viewport's own header forbids merging the two, and
     * they are wanted at opposite moments: the DRAW keeps the camera live and suspends the pick;
     * the DRAG suspends the camera (or every face pull also orbits) and leaves the pick alone.
     */
    readonly setNavigationEnabled?: (on: boolean) => void;
}

/**
 * The 3D Site (Cesium) implementation of BOTH site-envelope ports: the draw gesture
 * (`EnvelopeDrawSurface`) and the face-drag gesture (`SpaceEnvelopeDragSurface`).
 */
export class SiteEnvelopeDrawCesium implements EnvelopeDrawSurface, SpaceEnvelopeDragSurface {
    readonly surfaceId = 'site-3d' as const;

    private readonly viewer: CesiumNS.Viewer;
    private readonly C: typeof CesiumNS;
    private readonly deps: SiteEnvelopeDrawCesiumDeps;

    private handler: CesiumNS.ScreenSpaceEventHandler | null = null;
    private keyListener: ((e: KeyboardEvent) => void) | null = null;
    private sink: EnvelopeDrawSink | null = null;
    /** The frame LATCHED at arm — one origin and one θ for the whole gesture (R6). */
    private frame: SiteDrawFrame | null = null;

    /** Pooled preview entities: the vertex dots, the committed edges and the rubber-band tail. */
    private readonly pointEntities: CesiumNS.Entity[] = [];
    /** §ENVELOPE-DRAW-PREVIEW-LINE — the SOLID line through the corners the user has placed. */
    private lineEntity: CesiumNS.Entity | null = null;
    /*
     * §ENVELOPE-DRAW-PREVIEW-LINE (L-13088) — a SEPARATE DASHED entity for the rubber-band tail
     * (last corner → cursor, plus the closing edge) was declared here and never built. It is not
     * missing FUNCTION: `drawPreview` already draws the tail, as the last segments of the one
     * polyline (`all = [...committed, ...tail]`). What a second entity would add is that the tail
     * READS differently from the committed edges, so the user can tell what they have placed from
     * what is merely following the pointer. That is a real refinement and it is not built; the
     * field is removed rather than left declared-and-unread, because an unused private field is
     * exactly the shape that gets deleted later by someone who assumes it was dead all along.
     */
    /** §ENVELOPE-DRAW-PREVIEW-LINE — ground height per picked vertex; see `groundHeightFor`. */
    private readonly groundHeightAtVertex = new Map<string, number>();
    /** The height the most recent successful pick landed on, or `null` before the first one. */
    private lastGroundHeightM: number | null = null;

    // ── §ENVELOPE-DRAW-SETTLED-RING (L-13148) — the FINISHED perimeter's own entities. ──────
    // ⛔ SEPARATE FROM THE PREVIEW POOL ABOVE, DELIBERATELY. `disarm()` clears the preview on
    // every exit, and that is right for a half-drawn ring and wrong for a stored one. Two entity
    // sets is what lets one lifecycle end without ending the other; see the port's own note.
    /** The closed violet outline of the perimeter the user finished, or `null`. */
    private settledLine: CesiumNS.Entity | null = null;
    /** The faint violet ground fill under it — so the FOOTPRINT reads, not just its edge. */
    private settledFill: CesiumNS.Entity | null = null;
    /** The corner dots of the settled ring, one per vertex. */
    private readonly settledPoints: CesiumNS.Entity[] = [];

    // ── §ENVELOPE-DRAW-LIVE-DIMS (L-13308) — the live dimension chips' label entities. ─────
    // POOLED like the dots: a move fires per frame, and adding/removing labels per move makes
    // Cesium rebuild its label batch so the chips judder (`SiteBoundaryDrawTool.refreshDimLabels`).
    private readonly dimEntities: CesiumNS.Entity[] = [];
    // ── §ENVELOPE-ROSTER-ONE-SOURCE (L-13309) — the profile roster's own entities. ─────────
    // ⛔ A THIRD SET, NOT THE SETTLED ONE: the settled set now carries only the spine and is
    // cleared on every arm; the roster outlives every gesture and changes only with the roster.
    private readonly rosterEntities: CesiumNS.Entity[] = [];

    // ── §25.6 GESTURE 1 — THE ARROW AFFORDANCE'S OWN ENTITIES (L-13236) ─────────────────────
    // ⛔ POOLED AND REUSED, NEVER RE-ADDED PER FRAME, and that is not micro-optimisation. During a
    // drag `setTarget` is called on EVERY pointer move (the handle rides the face it is pulling),
    // and `renderSpaceEnvelopes` is ALREADY doing a full clear-and-rebuild on the same frames. Two
    // full entity churns per pointer move is the lifecycle the THREE gizmo's header says it refused
    // to live inside; a pool plus the signature guard below means a frame that changed nothing
    // costs nothing, and a frame that moved the face reassigns positions on entities that already
    // exist.
    /** One polyline per arrow half — two per face. Reused across repaints; length is the pool. */
    private readonly handleEntities: CesiumNS.Entity[] = [];
    /** What the GESTURE last pointed the handles at (hover / drag), or `null`. */
    private handleHoverTarget: DraggableSpaceEnvelope | null = null;
    /** `describeFaceRef` of the lit face, or `null`. A key, so a re-created ref still matches. */
    private handleActiveKey: string | null = null;
    /** The last painted state, so an unchanged repaint is free. `''` ⇒ nothing is drawn. */
    private handleSignature = '';
    /** The focus channel's unsubscribe — dropped by {@link disposeFaceDragAffordance}. */
    private unsubFocus: (() => void) | null = null;

    constructor(deps: SiteEnvelopeDrawCesiumDeps) {
        this.deps = deps;
        this.viewer = deps.viewer;
        this.C = deps.Cesium;
        // ⭐ THE SELECTION MUST BE VISIBLE BEFORE THE POINTER MOVES. The gesture drives the handles
        // from hover, which is right for discovery and useless for a SELECTION made in a panel on
        // the other side of the screen: the founder presses *Drag face* on the Level 2 row and must
        // see Level 2's arrows immediately, without first finding the volume with his mouse.
        try {
            this.unsubFocus = subscribeSpaceEnvelopeFaceDragFocus(() => { this.repaintHandles(); });
        } catch (e) {
            console.warn('[site][envelope-face-drag][3d] could not subscribe the per-level focus '
                + '— the arrows will appear on hover only (non-fatal):', e);
        }
    }

    /**
     * C16 CA-18 — WHY this surface cannot arm right now, in the user's words, or `null` when it can.
     * The arming registry prints it when nothing accepted, so the founder reads *"the site frame
     * origin is not resolvable yet — search the address first"* instead of the generic
     * *"no site view is attached"*, which would be a true sentence about the wrong thing.
     */
    cannotArmReason(): string | null {
        if (this.isTornDown()) {
            return 'The 3D Site view is mounted but its scene is being torn down, so it cannot take '
                + 'a drawing right now. Re-open 3D Site and press Draw again.';
        }
        const resolved = resolveSiteDrawFrame(this.deps.getOrigin(), this.deps.getSiteLocation());
        return resolved.ok ? null : `On the 3D Site view: ${resolved.reason}`;
    }

    private isTornDown(): boolean {
        try {
            const v = this.viewer as unknown as { isDestroyed?: () => boolean };
            if (typeof v.isDestroyed === 'function' && v.isDestroyed()) return true;
            return !this.viewer?.scene?.canvas;
        } catch {
            return true;
        }
    }

    // ── SCREEN → GROUND ─────────────────────────────────────────────────────────────────────

    /**
     * Port method. `clientX/clientY` are VIEWPORT coordinates (a DOM event's), so they are
     * rebased onto the canvas here — Cesium's own handler already hands canvas-relative positions,
     * and mixing the two is the class of bug that puts every vertex a header's height too high.
     */
    groundPointFromPointer(clientX: number, clientY: number): SceneXZPoint | null {
        try {
            const canvas = this.viewer?.scene?.canvas;
            if (!canvas) return null;
            const rect = canvas.getBoundingClientRect();
            return this.pickProjectXZ(
                new this.C.Cartesian2(clientX - rect.left, clientY - rect.top),
            );
        } catch {
            return null;
        }
    }

    /** Canvas position → project-frame scene-XZ, through the ONE frame conversion. */
    private pickProjectXZ(position: CesiumNS.Cartesian2): SceneXZPoint | null {
        const frame = this.frame ?? this.resolveFrameNow();
        if (!frame) return null;
        const C = this.C;
        const scene = this.viewer?.scene;
        if (!scene) return null;
        let cartesian: CesiumNS.Cartesian3 | undefined;
        try {
            // Prefer the RENDERED surface (3D tiles / terrain) — `SiteBoundaryDrawTool.pickLatLon`.
            cartesian = scene.pickPosition(position);
        } catch { cartesian = undefined; }
        if (!cartesian || !C.defined(cartesian)) {
            try {
                const ray = this.viewer.camera.getPickRay(position);
                cartesian = ray ? scene.globe.pick(ray, scene) : undefined;
            } catch { cartesian = undefined; }
        }
        if (!cartesian || !C.defined(cartesian)) return null;
        const carto = C.Cartographic.fromCartesian(cartesian);
        const p = latLonToProjectXZ(
            { lat: C.Math.toDegrees(carto.latitude), lon: C.Math.toDegrees(carto.longitude) },
            frame,
        );
        // ⭐ §ENVELOPE-DRAW-PREVIEW-LINE (L-13088) — REMEMBER THE GROUND HEIGHT THIS PICK LANDED ON.
        // The port hands the preview 2-D points, so the adapter would otherwise have to invent a
        // seat for them. It does not have to: `carto.height` IS the height of the surface the user
        // just clicked, measured on the pixels that were actually painted, and remembering it is
        // strictly better than re-sampling terrain (which needs the globe shown) or falling back to
        // one scalar for the whole ring. See `drawPreview` for why an absolute seat is required.
        if (Number.isFinite(carto.height)) {
            this.lastGroundHeightM = carto.height;
            this.groundHeightAtVertex.set(vertexKey(p), carto.height);
            // A gesture is tens of corners; a hover is thousands of moves. Cap the memo so a long
            // draw cannot grow it without bound — the newest entries are the ones a preview reads.
            if (this.groundHeightAtVertex.size > PICK_HEIGHT_MEMO_MAX) {
                const oldest = this.groundHeightAtVertex.keys().next();
                if (!oldest.done) this.groundHeightAtVertex.delete(oldest.value);
            }
        }
        return p;
    }

    /**
     * §ENVELOPE-DRAW-PREVIEW-LINE — the ground height to seat a preview vertex on: the height the
     * PICK that placed it landed on when PRYZM has it, then the most recent pick, then the seat the
     * rasteriser used for the envelopes themselves, then the ellipsoid.
     *
     * ⚠ A CONSTRAINED CORNER IS NOT A PICKED ONE. `BoundaryPathAuthor`'s ortho rule moves a corner
     * onto the perpendicular foot, so its XZ is not the XZ any pick produced and the memo misses on
     * purpose. The fallback is the most recent pick — a metre or two of relief away at parcel scale,
     * which the line is lifted clear of — never a silent zero.
     */
    private groundHeightFor(p: { readonly x: number; readonly z: number }): number {
        const exact = this.groundHeightAtVertex.get(vertexKey(p));
        if (exact !== undefined) return exact;
        if (this.lastGroundHeightM !== null) return this.lastGroundHeightM;
        try {
            const seat = this.deps.getSceneFrame?.()?.baseHeightM;
            if (typeof seat === 'number' && Number.isFinite(seat)) return seat;
        } catch { /* a host that throws tells us nothing; fall through */ }
        return 0;
    }

    private resolveFrameNow(): SiteDrawFrame | null {
        const resolved = resolveSiteDrawFrame(this.deps.getOrigin(), this.deps.getSiteLocation());
        return resolved.ok ? resolved.frame : null;
    }

    // ── THE PREVIEW ─────────────────────────────────────────────────────────────────────────

    drawPreview(
        committed: readonly ArcVertex2D[],
        tail: readonly ArcVertex2D[],
        closeRing: boolean,
        dims: readonly EnvelopeDrawDimLabel[] = [],
    ): void {
        const frame = this.frame;
        if (!frame) return;
        try {
            const C = this.C;
            const all = [...committed, ...tail];
            // ⭐ SEATED ABSOLUTELY, NOT CLAMPED — the reason is `groundHeightFor`'s own note, and it
            // is the whole point of the pick-height memo. `clampToGround` asks Cesium to drape the
            // line on the GLOBE, and the 3D Site runs in FORMA mode with the globe's imagery and
            // photoreal surface hidden. A clamped line therefore has nothing dependable to clamp to
            // exactly where the founder draws. Every vertex is placed at the height the PICK that
            // created it landed on, lifted clear of the ground so it is not z-fighting the slab.
            const positions = all.map((p) => {
                const ll = projectXZToLatLon(p, frame);
                return C.Cartesian3.fromDegrees(ll.lon, ll.lat, this.groundHeightFor(p) + PREVIEW_LIFT_M);
            });

            // ⭐ THE DOTS ARE POOLED, NOT REBUILT. A move event fires per animation frame at
            // parcel scale; adding and removing entities on each one makes Cesium rebuild its
            // primitive batch and the rubber-band judders — the same reason
            // `SiteBoundaryDrawTool.refreshDimLabels` pools its labels.
            const wanted = committed.length;
            while (this.pointEntities.length < wanted) {
                this.pointEntities.push(this.viewer.entities.add({
                    position: C.Cartesian3.fromDegrees(0, 0),
                    point: {
                        pixelSize: 9,
                        color: C.Color.fromCssColorString(VIOLET_CSS),
                        outlineColor: C.Color.WHITE,
                        outlineWidth: 2,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                        heightReference: C.HeightReference.CLAMP_TO_GROUND,
                    },
                }));
            }
            for (let i = 0; i < this.pointEntities.length; i++) {
                const ent = this.pointEntities[i]!;
                const show = i < wanted;
                ent.show = show;
                if (show) {
                    const ll = projectXZToLatLon(committed[i]!, frame);
                    (ent as unknown as { position: unknown }).position =
                        C.Cartesian3.fromDegrees(ll.lon, ll.lat) as unknown;
                }
            }

            if (this.lineEntity) {
                this.viewer.entities.remove(this.lineEntity);
                this.lineEntity = null;
            }
            if (positions.length >= 2) {
                const ring = closeRing && positions.length >= 3
                    ? [...positions, positions[0]!]
                    : positions;
                this.lineEntity = this.viewer.entities.add({
                    polyline: {
                        positions: ring,
                        width: 3,
                        // ⛔ NOT `clampToGround` — see the seat note above. The positions already
                        // carry their own absolute height, and asking Cesium to clamp them as well
                        // would hand the line back to the hidden globe this seat exists to avoid.
                        material: C.Color.fromCssColorString(VIOLET_CSS),
                    },
                });
            }
            // ⭐ §ENVELOPE-DRAW-LIVE-DIMS (L-13308) — the chips, painted where the arming module put them.
            this.paintDimLabels(dims, frame);
            this.viewer.scene.requestRender();
        } catch (e) {
            console.warn('[site][envelope-draw][3d] preview draw failed (non-fatal):', e);
        }
    }

    /**
     * §ENVELOPE-DRAW-LIVE-DIMS (L-13308) — one Cesium label per chip, pooled; surplus hidden.
     *
     * The LOOK is the site views' existing dimension chip (`SiteBoundaryDrawTool.refreshDimLabels`)
     * in the founder's brand: white with PRYZM-purple text, and the LIVE chip inverted (purple, white
     * text) so the length under the pointer reads first — the emphasis `DimensionPreview`'s filled
     * chip gives the slab and wall tools. ⛔ Never black. The TEXT is never composed here.
     *
     * ⛔ SEATED ABSOLUTELY at the preview line's lifted ground height, NOT clamped — the 3D Site
     * hides the globe (see `drawPreview`); `disableDepthTestDistance` keeps a chip readable through
     * context massing.
     */
    private paintDimLabels(dims: readonly EnvelopeDrawDimLabel[], frame: SiteDrawFrame): void {
        const C = this.C;
        const violet = C.Color.fromCssColorString(VIOLET_CSS);
        while (this.dimEntities.length < dims.length) {
            this.dimEntities.push(this.viewer.entities.add({
                position: C.Cartesian3.fromDegrees(0, 0),
                label: {
                    text: '',
                    font: DIM_LABEL_FONT,
                    fillColor: violet,
                    showBackground: true,
                    backgroundColor: C.Color.WHITE.withAlpha(0.95),
                    backgroundPadding: new C.Cartesian2(7, 4),
                    style: C.LabelStyle.FILL,
                    horizontalOrigin: C.HorizontalOrigin.CENTER,
                    verticalOrigin: C.VerticalOrigin.CENTER,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            }));
        }
        for (let i = 0; i < this.dimEntities.length; i++) {
            const ent = this.dimEntities[i]!;
            const dim = dims[i];
            if (dim === undefined) { ent.show = false; continue; }
            const ll = projectXZToLatLon(dim.at, frame);
            ent.show = true;
            ent.position = new C.ConstantPositionProperty(
                C.Cartesian3.fromDegrees(ll.lon, ll.lat, this.groundHeightFor(dim.at) + PREVIEW_LIFT_M),
            );
            const label = ent.label;
            if (!label) continue;
            const live = dim.kind === 'live';
            label.text = new C.ConstantProperty(dim.text);
            label.fillColor = new C.ConstantProperty(live ? C.Color.WHITE : violet);
            label.backgroundColor = new C.ConstantProperty(live ? violet : C.Color.WHITE.withAlpha(0.95));
        }
    }

    clearPreview(): void {
        try {
            for (const ent of this.pointEntities) this.viewer.entities.remove(ent);
            this.pointEntities.length = 0;
            if (this.lineEntity) {
                this.viewer.entities.remove(this.lineEntity);
                this.lineEntity = null;
            }
            // §ENVELOPE-DRAW-LIVE-DIMS — the chips belong to the draft and end with it.
            for (const ent of this.dimEntities) this.viewer.entities.remove(ent);
            this.dimEntities.length = 0;
            this.viewer.scene?.requestRender?.();
        } catch { /* viewer torn down — nothing to clear */ }
    }

    /**
     * ⭐ §ENVELOPE-DRAW-SETTLED-RING (L-13148) — the founder's *"it should continue"*, drawn.
     *
     * ⚠ IT RESOLVES ITS OWN FRAME. `this.frame` is latched at `arm()` and NULLED by `disarm()`,
     * and this is called immediately AFTER the finish has disarmed every surface — so reading the
     * latched frame here would find `null` every single time and paint nothing, silently. It reads
     * the SAME `resolveSiteDrawFrame` the arm did, about the SAME origin, so the settled ring lands
     * on the pixels the preview occupied a moment earlier.
     *
     * ⚠ AND IT REUSES THE PICK-HEIGHT MEMO. `groundHeightFor` still holds the height each corner's
     * own pick landed on, because `disarm()` does not clear it. That is why the settled ring sits on
     * the terrain the preview sat on rather than sinking to the ellipsoid — the same reason
     * `drawPreview` seats absolutely instead of clamping (the 3-D Site hides the globe).
     */
    drawSettledRing(ring: readonly SceneXZPoint[], closed = true): void {
        this.clearSettledRing();
        // ⭐ §ARRAY-ALONG-PATH (ADR-0386 D6) — three vertices to enclose anything, two to be a run.
        if (ring.length < (closed ? 3 : 2)) return;
        const frame = this.frame ?? this.resolveFrameNow();
        if (!frame) {
            // The origin went away between the last click and the finish — a re-seat mid-gesture.
            // The RING IS STILL STORED and the panel still names it; only the picture is missing,
            // and saying so is better than a line at a guessed point (C57 §1.5).
            console.warn(
                '[site][envelope-draw][3d] §ENVELOPE-DRAW-SETTLED-RING the perimeter was stored but '
                + 'the site frame origin is no longer resolvable, so it is not drawn. The create '
                + 'panel still holds it.',
            );
            return;
        }
        try {
            const C = this.C;
            const positions = ring.map((p) => {
                const ll = projectXZToLatLon(p, frame);
                return C.Cartesian3.fromDegrees(ll.lon, ll.lat, this.groundHeightFor(p) + PREVIEW_LIFT_M);
            });
            // ⛔ NO FILL FOR A SPINE. A run drawn as a filled polygon is a picture of a shape that
            // does not exist — and on a three-point spine it would be a solid triangle sitting on
            // the parcel that the user never drew.
            // The FILL first, so the outline and the dots draw over it.
            if (closed) this.settledFill = this.viewer.entities.add({
                polygon: {
                    hierarchy: new C.PolygonHierarchy(positions),
                    // ⛔ `perPositionHeight` — the vertices already carry the height each pick
                    // landed on. Letting Cesium flatten them to one `height` would sink the
                    // footprint into a slope, and clamping it would hand it to the hidden globe.
                    perPositionHeight: true,
                    material: C.Color.fromCssColorString(VIOLET_CSS).withAlpha(0.13),
                    outline: false,
                    shadows: C.ShadowMode.DISABLED,
                },
            });
            this.settledLine = this.viewer.entities.add({
                polyline: {
                    positions: closed ? [...positions, positions[0]!] : positions,
                    width: 3,
                    material: C.Color.fromCssColorString(VIOLET_CSS),
                },
            });
            for (const pos of positions) {
                this.settledPoints.push(this.viewer.entities.add({
                    position: pos,
                    point: {
                        pixelSize: 8,
                        color: C.Color.fromCssColorString(VIOLET_CSS),
                        outlineColor: C.Color.WHITE,
                        outlineWidth: 2,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    },
                }));
            }
            this.viewer.scene.requestRender();
        } catch (e) {
            console.warn('[site][envelope-draw][3d] settled-ring draw failed (non-fatal):', e);
        }
    }

    /** Idempotent; safe after teardown and safe when nothing was ever drawn. */
    clearSettledRing(): void {
        try {
            for (const ent of this.settledPoints) this.viewer.entities.remove(ent);
            this.settledPoints.length = 0;
            if (this.settledFill) { this.viewer.entities.remove(this.settledFill); this.settledFill = null; }
            if (this.settledLine) { this.viewer.entities.remove(this.settledLine); this.settledLine = null; }
            this.viewer.scene?.requestRender?.();
        } catch { /* viewer torn down — nothing to clear */ }
    }

    /**
     * ⭐⭐ §ENVELOPE-ROSTER-ONE-SOURCE (L-13309) — EVERY roster profile on the globe until the roster
     * says otherwise. The founder: *"it renders perfect on plan view - but i would like it to render
     * also on 3d site view"* and *"the previous profile gets deleted from the view"*.
     *
     * The look is the settled ring's (faint violet fill + violet outline — the footprint he called
     * "perfect" on the plan) WITHOUT the corner dots and chips the live draft carries, so the draft
     * being drawn over the roster is always the one with handles.
     *
     * ⚠ IT RESOLVES ITS OWN FRAME, like `drawSettledRing`: the roster repaints after the finish has
     * disarmed every surface (`this.frame` is null) and on registration, when nothing is armed.
     *
     * ⚠ THE SEAT, and why its fallback order differs from the preview's. A ring drawn on THIS view has
     * a picked height per corner (`groundHeightAtVertex`) and uses it. A ring drawn on the 2D MAP has
     * none and there is no pointer to follow, so the honest seat is the datum the rasteriser will seat
     * the CREATED envelope on (`getSceneFrame().baseHeightM`) — the outline sits where the block's
     * base will be. Only then the last pick, then the ellipsoid. The outline also carries a
     * `depthFailMaterial`, so a seat the terrain has not resolved yet (the ellipsoid, tens of metres
     * under the tiles at an inland site) still shows its outline instead of vanishing underground.
     */
    drawProfileRoster(rings: readonly EnvelopeRosterRing[]): void {
        const span = _tracer.startSpan('pryzm.site.envelopeDrawCesium.drawProfileRoster');
        try {
            this.clearProfileRoster();
            span.setAttribute('pryzm.envelopeDraw.rings', rings.length);
            if (rings.length === 0) return;
            const frame = this.frame ?? this.resolveFrameNow();
            if (!frame) {
                console.warn(
                    '[site][envelope-draw][3d] §ENVELOPE-ROSTER-ONE-SOURCE the profile roster holds '
                    + `${rings.length} ring(s) but the site frame origin is not resolvable on the 3D Site, `
                    + 'so none is drawn here. The roster still holds them and the panel still lists them.',
                );
                return;
            }
            const C = this.C;
            const violet = C.Color.fromCssColorString(VIOLET_CSS);
            for (const r of rings) {
                if (r.ring.length < 3) continue;
                const positions = r.ring.map((p) => {
                    const ll = projectXZToLatLon(p, frame);
                    return C.Cartesian3.fromDegrees(ll.lon, ll.lat, this.rosterSeatFor(p) + PREVIEW_LIFT_M);
                });
                this.rosterEntities.push(this.viewer.entities.add({
                    polygon: {
                        hierarchy: new C.PolygonHierarchy(positions),
                        // ⛔ `perPositionHeight` — each corner keeps its own seat (see above).
                        perPositionHeight: true,
                        material: violet.withAlpha(0.13),
                        outline: false,
                        shadows: C.ShadowMode.DISABLED,
                    },
                }));
                this.rosterEntities.push(this.viewer.entities.add({
                    polyline: {
                        positions: [...positions, positions[0]!],
                        width: 2.5,
                        material: violet,
                        depthFailMaterial: violet.withAlpha(0.45),
                    },
                }));
            }
            this.viewer.scene?.requestRender?.();
        } catch (e) {
            console.warn('[site][envelope-draw][3d] profile-roster draw failed (non-fatal):', e);
        } finally {
            span.end();
        }
    }

    /** Idempotent; safe after teardown and when nothing was ever drawn. */
    clearProfileRoster(): void {
        try {
            for (const ent of this.rosterEntities) this.viewer.entities.remove(ent);
            this.rosterEntities.length = 0;
            this.viewer.scene?.requestRender?.();
        } catch { /* viewer torn down — nothing to clear */ }
    }

    /** §ENVELOPE-ROSTER-ONE-SOURCE — the roster's seat order; see `drawProfileRoster`. */
    private rosterSeatFor(p: { readonly x: number; readonly z: number }): number {
        const picked = this.groundHeightAtVertex.get(vertexKey(p));
        if (picked !== undefined) return picked;
        try {
            const seat = this.deps.getSceneFrame?.()?.baseHeightM;
            if (typeof seat === 'number' && Number.isFinite(seat)) return seat;
        } catch { /* a host that throws tells us nothing; fall through */ }
        return this.lastGroundHeightM ?? 0;
    }

    // ══════════════════════════════════════════════════════════════════════════════════════
    // ⭐ §ENVELOPE-FACE-DRAG-ON-SITE-VIEWS — THE FOUR DRAG PORTS
    // ══════════════════════════════════════════════════════════════════════════════════════
    //
    // The GESTURE is not here. Grab resolution, the `maximumBuildable` refusal, the contextual
    // planner call, the neighbour preview, the 1e-3 m no-op drop, the single dispatch and the
    // camera hand-back on cancel AND on teardown all live once in `spaceEnvelopeDragSurface.ts`.
    // This is the surface-specific quarter: a ray, a pick, a preview channel and a camera switch.

    /**
     * ⭐ WHY THIS SURFACE CAN OR CANNOT TAKE A FACE-DRAG RIGHT NOW, in words a user can act on.
     *
     * ⛔ IT EXISTS BECAUSE D7 WAS EXACTLY THIS DEFECT POINTED THE OTHER WAY: the massing panel
     * asserted *"they are draggable by face"* on a surface with no drag installed, and nothing
     * anywhere said otherwise. A host that has not wired the ports must be able to SAY so rather
     * than ship a claim it cannot keep.
     */
    cannotDragReason(): string | null {
        if (this.isTornDown()) {
            return 'The 3D Site view is being torn down, so its envelopes cannot be edited right now.';
        }
        if (!this.deps.getSceneFrame || !this.deps.getEnvelopes) {
            return 'PRYZM has not wired face-editing to this 3D Site view in this session, so it is '
                + 'not offering a gesture that would do nothing. The envelopes still draw, and you '
                + 'can edit their outlines from the envelope panel.';
        }
        if (this.deps.getSceneFrame() === null) {
            return 'The 3D Site has no site frame seated yet, so PRYZM cannot say where on the Earth '
                + 'a face you drag would land. It becomes editable as soon as the site renders.';
        }
        return null;
    }

    /**
     * PORT 1 — screen point → a ray in the SCENE frame (the frame the prisms are authored and
     * drawn in). `null` when this surface cannot answer, NEVER a guess: the core treats `null` as
     * *"this frame carries no information"* and HOLDS the face, whereas a plausible-looking skewed
     * ray produces a drag that moves the right wall by the wrong amount and reads as a
     * sensitivity problem rather than a frame bug.
     *
     * ⭐ THE CONVERSION IS EXACT, NOT APPROXIMATE, AND IT IS THE INVERSE OF THE ONE THAT DREW THE
     * PRISM. `renderSpaceEnvelopes` builds `eastNorthUpToFixedFrame(origin)` and pushes
     * `(east, north, up)` through it; this inverts the SAME matrix and pulls the camera ray back:
     *
     *     ECEF ray ──inverseTransformation(ENU)──▶ ENU (x=east, y=north, z=up)
     *              ──enuToSceneXZ(east, north, θ)──▶ project XZ   (a PURE rotation + z-negation)
     *              ── y = up − formaTerrainBaseHeight ──▶ scene Y  (an AFFINE offset)
     *
     * ⛔ THE ORIGIN AND THE DIRECTION GO THROUGH DIFFERENT DOORS, AND THAT IS THE WHOLE TRAP.
     * `multiplyByPoint` applies the rotation AND the translation; `multiplyByPointAsVector`
     * applies the rotation only. A direction pushed through `multiplyByPoint` picks up the ENU
     * origin's 6,378 km translation and points at the centre of the Earth. Likewise the terrain
     * seat is subtracted from the ORIGIN's y and never from the direction's — an offset applied to
     * a direction is not an offset, it is a rotation nobody asked for.
     *
     * ⚠ AND θ IS APPLIED, BECAUSE THE PRISMS ARE STORED IN THE PROJECT FRAME. This is the
     * correction that cost the draw lane real time (PLAN §R5): BOTH site rasterisers apply θ when
     * they draw a stored footprint, so the frame a footprint lives in is the PROJECT frame and
     * each adapter converts at its own edge. `enuToSceneXZ` is verified a PURE rotation
     * (`sceneEnuFrame.ts`), which is what makes it valid on a DIRECTION and not only on a point.
     *
     * ⛔ THIS HALF CANNOT BE PROVEN HEADLESSLY. `camera.getPickRay` needs a real camera and a real
     * canvas; no fake viewer was built for it ([[fake-more-capable-than-real]]). What IS pinned in
     * `node` is everything downstream of the ray — the whole face pick, in
     * `packages/geometry-space-envelope/__tests__/spaceEnvelopeFacePick.test.ts`.
     */
    rayInSceneFrame(ev: DragPointerLike): SceneRay | null {
        try {
            const frame = this.deps.getSceneFrame?.() ?? null;
            if (!frame) return null;
            const scene = this.viewer?.scene;
            const canvas = scene?.canvas;
            if (!scene || !canvas) return null;
            const C = this.C;
            const rect = canvas.getBoundingClientRect();
            const ray = this.viewer.camera.getPickRay(
                new C.Cartesian2(ev.clientX - rect.left, ev.clientY - rect.top),
            );
            if (!ray) return null;

            const enu = C.Transforms.eastNorthUpToFixedFrame(
                C.Cartesian3.fromDegrees(frame.originLon, frame.originLat, 0),
            );
            // ⚠ `inverseTransformation` is exact for a RIGID transform (rotation + translation),
            // which is precisely what `eastNorthUpToFixedFrame` returns. It is not the general
            // matrix inverse and must not be used on one.
            const inv = C.Matrix4.inverseTransformation(enu, new C.Matrix4());
            const o = C.Matrix4.multiplyByPoint(inv, ray.origin, new C.Cartesian3());
            const d = C.Matrix4.multiplyByPointAsVector(inv, ray.direction, new C.Cartesian3());

            const po = enuToSceneXZ(o.x, o.y, frame.thetaRad);
            const pd = enuToSceneXZ(d.x, d.y, frame.thetaRad);
            const origin = { x: po.x, y: o.z - frame.baseHeightM, z: po.z };
            const direction = { x: pd.x, y: d.z, z: pd.z };
            if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z)) return null;
            if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y) || !Number.isFinite(direction.z)) return null;
            return { origin, direction };
        } catch {
            // A torn-down viewer, a camera mid-recreate. `null` is the honest answer and the core
            // HOLDS the face on it; throwing here would kill the pointer-move listener.
            return null;
        }
    }

    /**
     * PORT 2 — which envelope face is under the pointer. ONE pick, shared by the drag start, the
     * hover and the double-click, so those three can never resolve different envelopes.
     *
     * ⭐ NO PER-FACE PICKABLE GEOMETRY, WHICH IS WHAT MADE THIS CHEAP. L-13045 priced this port at
     * `n + 2` separately hit-testable primitives per envelope; it is a ray/prism intersection
     * (`pickNearestSpaceEnvelopeFace`, pure and headlessly tested), so `renderSpaceEnvelopes` is
     * unchanged, one `polygon` entity per envelope is still all that exists, and nothing is minted
     * that only the pick reads.
     *
     * ⛔ IT IS DEAF WHILE A DRAW IS ARMED, and that is a decision rather than an accident. The two
     * gestures share this canvas: without the guard, a click placing a corner of a NEW perimeter
     * on top of an EXISTING envelope would also start a face drag on it. While you are drawing an
     * envelope you are not editing one.
     */
    pickFace(ev: DragPointerLike): FacePick | null {
        // A draw is armed — see above.
        if (this.sink !== null) return null;
        const read = this.deps.getEnvelopes;
        if (!read) return null;
        const ray = this.rayInSceneFrame(ev);
        if (ray === null) return null;
        let records: readonly DraggableSpaceEnvelope[];
        try { records = read(); } catch { return null; }
        if (!Array.isArray(records) || records.length === 0) return null;
        const prisms: SpaceEnvelopePrism[] = [];
        for (const r of records) {
            // The SAME parse the rasteriser applies. A row it skipped as unreadable must not be
            // pickable — "drawn" and "grabbable" are one set, or the user pulls at nothing.
            if (!r || typeof r.id !== 'string' || r.id.length === 0) continue;
            if (!Array.isArray(r.footprint) || r.footprint.length < 3) continue;
            if (typeof r.height !== 'number' || !Number.isFinite(r.height) || r.height <= 0) continue;
            if (typeof r.baseOffset !== 'number' || !Number.isFinite(r.baseOffset)) continue;
            prisms.push(prismOfSpaceEnvelopeRecord(r));
        }
        const hit = pickNearestSpaceEnvelopeFace(prisms, ray.origin, ray.direction);
        if (hit === null) return null;
        return { id: hit.id, face: hit.face, point: hit.point };
    }

    /** PORT 3a — draw geometry that is NOT in the store. ⛔ Commits nothing (P6). */
    previewDraw(record: DraggableSpaceEnvelope): void {
        const set = this.deps.setEnvelopePreview;
        if (!set) return;
        try {
            set(record.id, {
                footprint: record.footprint,
                baseOffset: record.baseOffset,
                height: record.height,
            });
        } catch (e) {
            console.warn('[site][envelope-face-drag][3d] preview draw failed (non-fatal):', e);
        }
    }

    /** PORT 3b — drop the preview for one id so the AUTHORITATIVE geometry shows again. */
    previewRestore(id: string): void {
        const clear = this.deps.clearEnvelopePreview;
        if (!clear) return;
        try { clear(id); }
        catch (e) { console.warn('[site][envelope-face-drag][3d] preview restore failed (non-fatal):', e); }
    }

    /**
     * PORT 4 — suspend camera navigation for the length of the gesture.
     *
     * ⛔ THIS IS THE OPPOSITE CHOICE FROM THE DRAW, DELIBERATELY. The draw keeps navigation LIVE
     * (click-to-place at parcel scale needs pan and zoom) and suspends the scene PICK. A drag must
     * do the reverse: Cesium's camera controller binds this same canvas, so without this every
     * face pull would also orbit the globe. The core re-enables on release, on cancel and on its
     * own disposer, so an interrupted gesture cannot leave the camera dead.
     */
    setCameraEnabled(enabled: boolean): void {
        const set = this.deps.setNavigationEnabled;
        if (!set) return;
        try { set(enabled); }
        catch (e) { console.warn('[site][envelope-face-drag][3d] camera toggle failed (non-fatal):', e); }
    }

    /** The element the face-drag core binds its pointer listeners to, or `null` when there is none. */
    dragDomElement(): HTMLElement | null {
        try { return (this.viewer?.scene?.canvas as HTMLElement | undefined) ?? null; }
        catch { return null; }
    }

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // ⭐ THE OPTIONAL FIFTH PORT — §25.6 GESTURE 1, THE LITTLE ARROWS, ON CESIUM (L-13236)
    // ══════════════════════════════════════════════════════════════════════════════════════════
    //
    // ⛔ THIS IS THE HALF WHOSE ABSENCE `spaceEnvelopeDragSurface.ts:41-44` PREDICTED IN ADVANCE:
    // *"omit it and the drag works exactly as it did, and stays undiscoverable, which is a
    // regression in reachability rather than in behaviour"*. That is precisely what shipped on this
    // surface — a complete, correct, INVISIBLE gesture. No hover highlight, no cursor change, no
    // arrow, and therefore no reason for any user to suspect a face could be pulled at all.
    //
    // ⛔ NO PLACEMENT MATHS IS DONE HERE. Every number comes from `spaceEnvelopeFaceHandles`, the
    // same pure solver the THREE gizmo uses, so an arrow cannot point one way while the drag moves
    // another (C84 EI-9). This file contributes exactly one thing the solver cannot: the scene → ENU
    // → ECEF hop, and it is the SAME hop `CesiumViewport.renderSpaceEnvelopes` makes to draw the
    // prism the arrows stand on — `sceneXZToEnu(x, z, θ)` then `Matrix4.multiplyByPoint(enu, …)`,
    // with scene-Y lifted back onto the terrain seat. An arrow placed through a second frame
    // construction would float beside its own face on a re-seat (§L-430).

    /** The record the arrows currently belong to: what the gesture pointed at, else the FOCUS. */
    private effectiveHandleTarget(): DraggableSpaceEnvelope | null {
        if (this.handleHoverTarget !== null) return this.handleHoverTarget;
        let focusId: string | null = null;
        try { focusId = getSpaceEnvelopeFaceDragFocus()?.spaceEnvelopeId ?? null; }
        catch { return null; }
        if (focusId === null) return null;
        // ⛔ LOOKED UP LAZILY IN THE ONE STORE READER THE PICK USES. The focus carries an ID and
        // never a record (§L-545-SITE-CAPTURE), and reading it through `getEnvelopes` is what makes
        // "the arrows stand on something that is drawn" true rather than hoped.
        try {
            for (const r of this.deps.getEnvelopes?.() ?? []) {
                if (r && r.id === focusId) return r;
            }
        } catch { return null; }
        return null;
    }

    /**
     * ⭐ THE ONE PAINT. Called from the gesture (hover / drag) and from the focus channel, so both
     * routes produce identical arrows from identical inputs.
     *
     * ⚠ The signature guard is what makes it safe to call on every pointer move: a frame in which
     * nothing moved reassigns nothing.
     */
    private repaintHandles(): void {
        const target = this.effectiveHandleTarget();
        const frame = this.deps.getSceneFrame?.() ?? null;
        const sig = target === null || frame === null
            ? ''
            : `${target.id}|${target.baseOffset}|${target.height}|${this.handleActiveKey ?? '-'}|`
              + `${frame.originLat},${frame.originLon},${frame.thetaRad},${frame.baseHeightM}|`
              + target.footprint.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`).join(';');
        if (sig === this.handleSignature) return;
        this.handleSignature = sig;
        if (sig === '') { this.clearHandleEntities(); return; }
        try {
            this.paintHandleEntities(target!, frame!);
        } catch (e) {
            // ⛔ AN AFFORDANCE THAT THREW MUST NOT KILL THE GESTURE. This runs inside the core's
            // `pointermove` handler; an exception here would remove the frame and leave the face
            // stuck under a pointer that is still moving. The drag keeps working WITHOUT arrows,
            // which is the state this surface shipped in and is strictly better than no drag.
            this.handleSignature = '';
            this.clearHandleEntities();
            console.warn('[site][envelope-face-drag][3d] the face arrows could not be drawn; the '
                + 'drag itself is unaffected (non-fatal):', e);
        }
    }

    /** Build (or re-point) one polyline per arrow half. ⛔ Pool reuse — see the field's note. */
    private paintHandleEntities(target: DraggableSpaceEnvelope, frame: {
        readonly originLat: number; readonly originLon: number;
        readonly thetaRad: number; readonly baseHeightM: number;
    }): void {
        const C = this.C;
        const viewer = this.viewer;
        if (!viewer) { this.clearHandleEntities(); return; }
        const enu = C.Transforms.eastNorthUpToFixedFrame(
            C.Cartesian3.fromDegrees(frame.originLon, frame.originLat, 0),
        );
        // The EXACT inverse of `rayInSceneFrame`'s conversion, and the exact forward of
        // `renderSpaceEnvelopes`'s: θ on the plan pair, the terrain seat on the height.
        const toCartesian = (p: { x: number; y: number; z: number }): CesiumNS.Cartesian3 => {
            const { east, north } = sceneXZToEnu(p.x, p.z, frame.thetaRad);
            return C.Matrix4.multiplyByPoint(
                enu, new C.Cartesian3(east, north, p.y + frame.baseHeightM), new C.Cartesian3(),
            );
        };
        // §HORIZONTAL-FACES-ARE-PINNED (L-13272) — same option as the three.js gizmo, because
        // the two surfaces must offer the SAME set of grabbable faces.
        const handles = spaceEnvelopeFaceHandles(prismOfSpaceEnvelopeRecord(target), { omitCapFaces: true });
        const segments: { positions: CesiumNS.Cartesian3[]; active: boolean }[] = [];
        for (const h of handles) {
            const active = this.handleActiveKey !== null && this.handleActiveKey === h.key;
            const out = { x: h.anchor.x + h.axis.x * h.halfLengthM,
                y: h.anchor.y + h.axis.y * h.halfLengthM,
                z: h.anchor.z + h.axis.z * h.halfLengthM };
            const inn = { x: h.anchor.x - h.axis.x * h.halfLengthM,
                y: h.anchor.y - h.axis.y * h.halfLengthM,
                z: h.anchor.z - h.axis.z * h.halfLengthM };
            // ⭐ TWO ARROWS, NOT ONE. The founder's gesture is bidirectional — a face is pushed OUT
            // and pulled IN along the same normal — and a single-headed arrow would state half of
            // that. Both are drawn from the anchor outwards so each carries its own head.
            const centre = { x: h.anchor.x, y: h.anchor.y, z: h.anchor.z };
            segments.push({ positions: [toCartesian(centre), toCartesian(out)], active });
            segments.push({ positions: [toCartesian(centre), toCartesian(inn)], active });
        }
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i]!;
            const colour = C.Color.fromCssColorString(seg.active ? HANDLE_ACTIVE_CSS : HANDLE_CSS);
            const existing = this.handleEntities[i];
            if (existing?.polyline) {
                existing.polyline.positions = new C.ConstantProperty(seg.positions);
                existing.polyline.material = new C.PolylineArrowMaterialProperty(colour);
                existing.show = true;
                continue;
            }
            this.handleEntities.push(viewer.entities.add({
                polyline: {
                    positions: seg.positions,
                    width: HANDLE_WIDTH_PX,
                    material: new C.PolylineArrowMaterialProperty(colour),
                    // ⛔ STRAIGHT, NOT GEODESIC. At a few metres a geodesic arc would be drawn
                    // clamped to the ellipsoid and the arrow would lie on the ground instead of
                    // standing off the face it belongs to.
                    arcType: C.ArcType.NONE,
                    // The arrows are the AFFORDANCE: they must be findable through the translucent
                    // storey above them, or a stacked envelope hides its own controls.
                    depthFailMaterial: new C.PolylineArrowMaterialProperty(colour.withAlpha(0.45)),
                },
            }));
        }
        for (let i = segments.length; i < this.handleEntities.length; i++) {
            const e = this.handleEntities[i];
            if (e) e.show = false;
        }
        viewer.scene?.requestRender?.();
    }

    /** Remove every arrow entity. Idempotent, never throws. */
    private clearHandleEntities(): void {
        const viewer = this.viewer;
        for (const e of this.handleEntities) {
            try { viewer?.entities.remove(e); } catch { /* already gone */ }
        }
        this.handleEntities.length = 0;
        try { viewer?.scene?.requestRender?.(); } catch { /* torn down */ }
    }

    /**
     * ⭐ THE PORT. The gesture owns hover and drag; this object is the surface's answer to it.
     * ⚠ Arrow functions, so `this` is the adapter however the core destructures the port.
     */
    readonly handles: SpaceEnvelopeDragHandles = {
        targetId: (): string | null => this.effectiveHandleTarget()?.id ?? null,
        setTarget: (record: DraggableSpaceEnvelope | null): void => {
            this.handleHoverTarget = record;
            if (record === null) this.handleActiveKey = null;
            this.repaintHandles();
        },
        setActiveFace: (face: SpaceEnvelopeFaceRef | null): void => {
            this.handleActiveKey = face === null ? null : describeFaceRef(face);
            this.repaintHandles();
        },
    };

    /**
     * Drop the arrow entities and the focus subscription. ⛔ A host that recreates this adapter
     * MUST call it, or the previous adapter keeps repainting arrows into a viewer it no longer
     * owns every time the founder selects a storey.
     */
    disposeFaceDragAffordance(): void {
        try { this.unsubFocus?.(); } catch { /* mid-teardown */ }
        this.unsubFocus = null;
        this.handleHoverTarget = null;
        this.handleActiveKey = null;
        this.handleSignature = '';
        this.clearHandleEntities();
    }

    // ── ARM / DISARM ────────────────────────────────────────────────────────────────────────

    /** P8: `pryzm.site.envelopeDrawCesium.arm`. */
    arm(sink: EnvelopeDrawSink): boolean {
        const span = _tracer.startSpan('pryzm.site.envelopeDrawCesium.arm');
        try {
            if (this.isTornDown()) return false;
            // ⛔ THE FRAME IS RESOLVED BEFORE A SINGLE CLICK IS ACCEPTED, AND LATCHED FOR THE WHOLE
            // GESTURE. Resolving per click would let a geocode landing mid-draw move the origin
            // under the user, so corner 1 and corner 4 would sit in different frames — a ring that
            // is wrong in a way no single vertex looks wrong.
            const resolved = resolveSiteDrawFrame(this.deps.getOrigin(), this.deps.getSiteLocation());
            if (!resolved.ok) {
                console.warn(`[site][envelope-draw][3d] REFUSING to arm — ${resolved.reason}`);
                span.setAttribute('pryzm.envelopeDraw.armed', false);
                return false;
            }
            this.disarm();
            this.frame = resolved.frame;
            this.sink = sink;

            const C = this.C;
            this.handler = new C.ScreenSpaceEventHandler(this.viewer.scene.canvas);
            this.handler.setInputAction(
                (m: { position: CesiumNS.Cartesian2 }) => {
                    const p = this.pickProjectXZ(m.position);
                    if (!p) {
                        // ⛔ NEVER A SILENT NO-OP (L-1187). A click on sky or on a gap in the
                        // terrain is a real state and the user is told, not left wondering whether
                        // the tool is armed.
                        console.warn('[site][envelope-draw][3d] no ground under that click — '
                            + 'no corner was placed. Aim at the terrain or the site surface.');
                        return;
                    }
                    this.sink?.onPoint(p);
                },
                C.ScreenSpaceEventType.LEFT_CLICK,
            );
            this.handler.setInputAction(
                () => this.sink?.onFinish(),
                C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
            );
            this.handler.setInputAction(
                (m: { endPosition: CesiumNS.Cartesian2 }) => {
                    this.sink?.onMove(this.pickProjectXZ(m.endPosition));
                },
                C.ScreenSpaceEventType.MOUSE_MOVE,
            );

            this.keyListener = (e: KeyboardEvent): void => {
                if (!this.sink) return;
                if (e.key === 'Enter') { e.preventDefault(); this.sink.onFinish(); }
                else if (e.key === 'Escape') { e.preventDefault(); this.sink.onCancel(); }
                else if (e.key === 'Backspace') { e.preventDefault(); this.sink.onUndo(); }
            };
            window.addEventListener('keydown', this.keyListener);

            // ⛔ THE SELECTION PICK IS SUSPENDED — plan §7 rule 2. See the header.
            if (this.deps.setScenePickingEnabled) {
                try { this.deps.setScenePickingEnabled(false); }
                catch (e) { console.warn('[site][envelope-draw][3d] scene-pick suspend threw:', e); }
            } else {
                console.warn(
                    '[site][envelope-draw][3d] no `setScenePickingEnabled` was wired, so the '
                    + 'viewport’s own selection pick stays live during the draw: a draw click will '
                    + 'ALSO run scene.pick. The drawing still works; the selection side-effect is '
                    + 'the known cost of the missing wire.',
                );
            }

            console.log(
                `[site][envelope-draw][3d] armed · origin ${resolved.frame.origin.lat.toFixed(6)},`
                + `${resolved.frame.origin.lon.toFixed(6)} · θ=${resolved.frame.thetaRad.toFixed(4)} rad. `
                + 'Click corners; double-click or Enter closes; Backspace undoes; Esc cancels. '
                + 'Camera navigation stays live on purpose.',
            );
            span.setAttribute('pryzm.envelopeDraw.armed', true);
            span.setAttribute('pryzm.envelopeDraw.thetaRad', resolved.frame.thetaRad);
            return true;
        } catch (e) {
            console.warn('[site][envelope-draw][3d] arm failed (non-fatal):', e);
            span.setAttribute('pryzm.envelopeDraw.armed', false);
            return false;
        } finally {
            span.end();
        }
    }

    /** Idempotent. Every exit — finish, cancel, unregister, dispose — comes through here. */
    disarm(): void {
        const span = _tracer.startSpan('pryzm.site.envelopeDrawCesium.disarm');
        try {
            const wasArmed = this.sink !== null;
            this.sink = null;
            this.frame = null;
            if (this.handler) {
                try { this.handler.destroy(); } catch { /* already destroyed */ }
                this.handler = null;
            }
            if (this.keyListener) {
                window.removeEventListener('keydown', this.keyListener);
                this.keyListener = null;
            }
            this.clearPreview();
            // ⛔ RESTORED ON EVERY EXIT. A suspend with no matching restore leaves the 3D Site
            // unable to select anything for the rest of the session, and it would read as an
            // unrelated bug — which is exactly the L-7801 shape pointed the other way.
            if (wasArmed && this.deps.setScenePickingEnabled) {
                try { this.deps.setScenePickingEnabled(true); }
                catch (e) { console.warn('[site][envelope-draw][3d] scene-pick restore threw:', e); }
            }
            span.setAttribute('pryzm.envelopeDraw.wasArmed', wasArmed);
        } finally {
            span.end();
        }
    }
}
