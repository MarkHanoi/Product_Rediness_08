// §ENVELOPE-DRAW C5 (lane ENVELOPE-DRAW-2, 2026-09-07) — THE 3D SITE ADAPTER.
//
// PLAN-ENVELOPE-DRAW-ON-SITE-VIEWS §3a · L-13050 · C58 §1.19 · C16 CA-18 · P2 · P6 · P8.
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
}

/** The 3D Site (Cesium) implementation of the envelope-draw port. */
export class SiteEnvelopeDrawCesium implements EnvelopeDrawSurface {
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
