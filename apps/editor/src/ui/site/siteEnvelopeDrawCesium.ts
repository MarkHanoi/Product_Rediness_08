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
    pickNearestSpaceEnvelopeFace,
    prismOfSpaceEnvelopeRecord,
    type SpaceEnvelopePrism,
} from '@pryzm/geometry-space-envelope';
import type {
    EnvelopeDrawSink,
    EnvelopeDrawSurface,
    SceneXZPoint,
} from './envelopeDrawSurface';
import {
    latLonToProjectXZ,
    projectXZToLatLon,
    resolveSiteDrawFrame,
    type SiteDrawFrame,
} from './siteEnvelopeDrawFrame';
import { enuToSceneXZ } from '../geospatial/sceneEnuFrame';
// ⛔ TYPE-ONLY, therefore ERASED — no runtime edge from this file to the engine, and no THREE (P2).
// The four port shapes live once, in the renderer-free gesture; re-declaring them here would be a
// second copy of the contract this adapter exists to satisfy (C84 EI-9).
import type {
    DragPointerLike,
    DraggableSpaceEnvelope,
    FacePick,
    SceneRay,
    SpaceEnvelopeDragSurface,
} from '../../engine/spaceEnvelopeDragSurface';

const _tracer = trace.getTracer('pryzm.site.siteEnvelopeDrawCesium');

const VIOLET_CSS = '#6600FF';

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

    /** Pooled preview entities: the vertex dots and the single ring polyline. */
    private readonly pointEntities: CesiumNS.Entity[] = [];
    private lineEntity: CesiumNS.Entity | null = null;

    constructor(deps: SiteEnvelopeDrawCesiumDeps) {
        this.deps = deps;
        this.viewer = deps.viewer;
        this.C = deps.Cesium;
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
        return latLonToProjectXZ(
            { lat: C.Math.toDegrees(carto.latitude), lon: C.Math.toDegrees(carto.longitude) },
            frame,
        );
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
    ): void {
        const frame = this.frame;
        if (!frame) return;
        try {
            const C = this.C;
            const all = [...committed, ...tail];
            const positions = all.map((p) => {
                const ll = projectXZToLatLon(p, frame);
                return C.Cartesian3.fromDegrees(ll.lon, ll.lat);
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
                        clampToGround: true,
                        material: C.Color.fromCssColorString(VIOLET_CSS),
                    },
                });
            }
            this.viewer.scene.requestRender();
        } catch (e) {
            console.warn('[site][envelope-draw][3d] preview draw failed (non-fatal):', e);
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
            this.viewer.scene?.requestRender?.();
        } catch { /* viewer torn down — nothing to clear */ }
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
