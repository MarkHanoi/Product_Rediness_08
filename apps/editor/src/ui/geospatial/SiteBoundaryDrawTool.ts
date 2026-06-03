// A.8.c — Cesium site-boundary polygon-draw tool.
//
// Click to add a vertex, double-click / Enter to close the loop, Esc to cancel.
// Renders the in-progress polygon outline + vertices in PRYZM violet (#6600FF).
// On close it converts the drawn lat/lon ring → site-local XZ (the headless
// `buildBoundaryFromLatLonRing`, with the Site location as the projection origin)
// and dispatches `site.setParcelBoundary` via the shared L5 helper. After commit
// the authored boundary feeds `generateApartmentFromBoundary()` end-to-end.
//
// This is the ONLY new file that imports Cesium besides CesiumViewport. It is
// constructed lazily by GISAreaLayout (same dynamic-import site as CesiumViewport)
// so the Cesium chunk is not pulled into the main bundle.

import type * as CesiumNS from 'cesium';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    buildBoundaryFromLatLonRing,
    type LatLon,
} from '../site/boundaryProjection.js';
import { resolveSiteContext, dispatchParcelBoundary, dispatchSiteLocation } from '../site/siteDispatch.js';

const VIOLET_CSS = '#6600FF';

export interface SiteBoundaryDrawToolDeps {
    readonly viewer: CesiumNS.Viewer;
    readonly Cesium: typeof CesiumNS;
    readonly runtime: PryzmRuntime | null;
    /**
     * The Site origin (lat/lon) the drawn ring is projected about. Defaults to
     * the first clicked vertex if the Site has no location yet (so drawing works
     * even before a geocode search). Returns null if unknown.
     */
    readonly getOrigin: () => { lat: number; lon: number } | null;
}

/**
 * Interactive Cesium polygon-draw tool. Lifecycle: `start()` → user clicks →
 * `commit()` on close (or `cancel()`). Idempotent `start()`/`stop()`.
 */
export class SiteBoundaryDrawTool {
    private readonly viewer: CesiumNS.Viewer;
    private readonly Cesium: typeof CesiumNS;
    private readonly runtime: PryzmRuntime | null;
    private readonly getOrigin: () => { lat: number; lon: number } | null;

    private handler: CesiumNS.ScreenSpaceEventHandler | null = null;
    private keyListener: ((e: KeyboardEvent) => void) | null = null;
    private readonly vertices: LatLon[] = [];
    private readonly vertexEntities: CesiumNS.Entity[] = [];
    private lineEntity: CesiumNS.Entity | null = null;
    private active = false;

    constructor(deps: SiteBoundaryDrawToolDeps) {
        this.viewer = deps.viewer;
        this.Cesium = deps.Cesium;
        this.runtime = deps.runtime;
        this.getOrigin = deps.getOrigin;
    }

    get isActive(): boolean {
        return this.active;
    }

    /** Begin a draw session. No-op if already active. */
    start(): void {
        if (this.active) {
            console.log('[gis] boundary-draw already active');
            return;
        }
        const C = this.Cesium;
        this.active = true;
        this.vertices.length = 0;

        this.handler = new C.ScreenSpaceEventHandler(this.viewer.scene.canvas);

        this.handler.setInputAction(
            (movement: { position: CesiumNS.Cartesian2 }) => this.onLeftClick(movement.position),
            C.ScreenSpaceEventType.LEFT_CLICK,
        );
        this.handler.setInputAction(
            () => this.commit(),
            C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
        );

        this.keyListener = (e: KeyboardEvent) => {
            if (!this.active) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                this.commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.cancel();
            }
        };
        window.addEventListener('keydown', this.keyListener);

        this.runtime?.events?.emit('pryzm:toast', {
            message: 'Boundary draw: click to add corners, double-click or Enter to close, Esc to cancel.',
            severity: 'info',
        });
        console.log('[gis] boundary-draw started');
    }

    /** Pick a lat/lon from a screen position (globe / 3D-tiles surface). */
    private pickLatLon(position: CesiumNS.Cartesian2): LatLon | null {
        const C = this.Cesium;
        const scene = this.viewer.scene;
        // Prefer the rendered surface (3D tiles / terrain); fall back to ellipsoid.
        let cartesian: CesiumNS.Cartesian3 | undefined = scene.pickPosition(position);
        if (!cartesian || !C.defined(cartesian)) {
            const ray = this.viewer.camera.getPickRay(position);
            cartesian = ray ? scene.globe.pick(ray, scene) : undefined;
        }
        if (!cartesian || !C.defined(cartesian)) return null;
        const carto = C.Cartographic.fromCartesian(cartesian);
        return {
            lat: C.Math.toDegrees(carto.latitude),
            lon: C.Math.toDegrees(carto.longitude),
        };
    }

    private onLeftClick(position: CesiumNS.Cartesian2): void {
        const ll = this.pickLatLon(position);
        if (!ll) {
            console.warn('[gis] boundary-draw: could not pick a surface point here');
            return;
        }
        this.vertices.push(ll);
        this.addVertexMarker(ll);
        this.refreshLine();
        console.log(`[gis] boundary-draw: vertex ${this.vertices.length} @ ${ll.lat.toFixed(6)}, ${ll.lon.toFixed(6)}`);
    }

    private addVertexMarker(ll: LatLon): void {
        const C = this.Cesium;
        const ent = this.viewer.entities.add({
            position: C.Cartesian3.fromDegrees(ll.lon, ll.lat),
            point: {
                pixelSize: 10,
                color: C.Color.fromCssColorString(VIOLET_CSS),
                outlineColor: C.Color.WHITE,
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                heightReference: C.HeightReference.CLAMP_TO_GROUND,
            },
        });
        this.vertexEntities.push(ent);
    }

    private refreshLine(): void {
        const C = this.Cesium;
        if (this.lineEntity) {
            this.viewer.entities.remove(this.lineEntity);
            this.lineEntity = null;
        }
        if (this.vertices.length < 2) {
            this.viewer.scene.requestRender();
            return;
        }
        // Close the loop visually (last → first) so the in-progress shape reads
        // as a polygon, not an open path.
        const ring = [...this.vertices, this.vertices[0]!];
        const positions = ring.map((v) => C.Cartesian3.fromDegrees(v.lon, v.lat));
        this.lineEntity = this.viewer.entities.add({
            polyline: {
                positions,
                width: 3,
                clampToGround: true,
                material: C.Color.fromCssColorString(VIOLET_CSS),
            },
        });
        this.viewer.scene.requestRender();
    }

    /** Close the loop, project, and dispatch `site.setParcelBoundary`. */
    commit(): void {
        if (!this.active) return;
        if (this.vertices.length < 3) {
            this.runtime?.events?.emit('pryzm:toast', {
                message: `Need at least 3 corners (have ${this.vertices.length}).`,
                severity: 'error',
            });
            console.warn('[gis] boundary-draw: <3 vertices, not closing');
            return;
        }

        // Origin for the local-tangent-plane projection: the Site location if set,
        // else the first drawn vertex (so drawing works before a geocode search).
        const fromSite = this.getOrigin();
        const origin = fromSite ?? { lat: this.vertices[0]!.lat, lon: this.vertices[0]!.lon };
        console.log('[gis] boundary-draw: projecting about origin', origin, fromSite ? '(from Site location)' : '(from first vertex)');

        const built = buildBoundaryFromLatLonRing(this.vertices, origin.lat, origin.lon);
        console.log(`[gis] boundary-draw: ${built.polygon.length} XZ pts`, built.polygon, built.edgeClassifications);

        const ctx = resolveSiteContext(this.runtime);
        if (!ctx) {
            this.cleanup();
            return;
        }

        // If the Site had no geocoded location, record the projection origin (the
        // first vertex) as the Site location so the apartment generator + future
        // site intelligence share the SAME frame the boundary was projected in.
        if (!fromSite) {
            dispatchSiteLocation(ctx, { latitude: origin.lat, longitude: origin.lon, siteAddress: null });
        }

        // (dispatchParcelBoundary creates the Site if absent; rejects if the
        // parcel polygon is already set per C19 §1.4.)
        const ok = dispatchParcelBoundary(ctx, {
            polygon: built.polygon,
            edgeClassifications: built.edgeClassifications,
        });
        if (ok) {
            const area = signedAreaAbs(built.polygon);
            ctx.toast(
                `Site boundary set — ${built.polygon.length} corners (~${area.toFixed(0)} m²). ` +
                `Run pryzmGenerateApartmentFromBoundary() to generate.`,
                'success',
            );
        }
        this.cleanup();
    }

    /** Abort the current draw without committing. */
    cancel(): void {
        if (!this.active) return;
        console.log('[gis] boundary-draw cancelled');
        this.runtime?.events?.emit('pryzm:toast', { message: 'Boundary draw cancelled.', severity: 'info' });
        this.cleanup();
    }

    /** Alias for cancel() — disposes any active session. */
    stop(): void {
        this.cleanup();
    }

    private cleanup(): void {
        this.active = false;
        if (this.handler) {
            this.handler.destroy();
            this.handler = null;
        }
        if (this.keyListener) {
            window.removeEventListener('keydown', this.keyListener);
            this.keyListener = null;
        }
        for (const ent of this.vertexEntities) this.viewer.entities.remove(ent);
        this.vertexEntities.length = 0;
        if (this.lineEntity) {
            this.viewer.entities.remove(this.lineEntity);
            this.lineEntity = null;
        }
        this.vertices.length = 0;
        this.viewer.scene.requestRender();
    }
}

/** Absolute shoelace area of an XZ ring (m²) — for the commit toast. */
function signedAreaAbs(ring: ReadonlyArray<{ x: number; z: number }>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}
