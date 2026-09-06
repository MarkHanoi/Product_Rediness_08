// §STREET-LIFE (L-12936, founder 2026-09-05: "would it be possible to add everywhere pedestrians but
// also street lighting etc?") — the CESIUM half. The pure placement lives in contextStreetLife.ts;
// this module owns the two instanced primitives, the layer's lifecycle, and the one console line.
//
// WHY IT IS ITS OWN MODULE, not more `CesiumViewport` methods: CesiumViewport.ts is a 15 kLOC shared
// file that three lanes are editing concurrently. The hook there is a handful of lines that call
// `StreetLifeLayer` (the fleet's SHARED-FILE RULE); everything else — the reads, the placement call,
// the geometry, the log — is here, and moves without touching that file again.
//
// ⚠ THE BINDING RENDER CONSTRAINT is the trees' (ADR-0094 + memory
// `webgpu-heavy-scene-crash-and-instancing`): street furniture and people are NUMEROUS, so they are
// CHEAP BY CONSTRUCTION and drawn exactly like the canopies —
//   • ONE batched `Cesium.Primitive` for every lamp (pole + head instances share it) and ONE for
//     every person (body + head), never one entity per object;
//   • ONE shared `PerInstanceColorAppearance` per primitive (`flat: true` → no lighting pass);
//   • SHADOWLESS (`ShadowMode.DISABLED` — the shadow pass is the perf driver at these counts);
//   • bounded before we ever reach Cesium: `placeLamps` / `placePedestrians` cap nearest-first, and
//     this module additionally radial-culls to the near disc.
// Each object seats on its OWN per-point relief through the host's `groundAt` — the same
// `sampleGround` seat the canopies use — so on Lisbon's hill a lamp stands on the street it lights
// rather than on one flat plane. Because the ground is BAKED INTO the instance matrices, the layer
// cannot be re-seated by rewriting a scalar: it is REBUILT on the settled base
// (`rebuildStreetLifeForBase`), the §CTX-TREES-RESEAT (L-12918) precedent.
//
// ⚠ HONESTY (C57 §1.5/§1.9, C58 §1.2). Mapped lamps are DATA; synthesised lamps and every pedestrian
// are SCENERY. The log line counts them apart and says so in words, and the furniture layer's state
// (ok · absent · unavailable · disabled) rides with the mapped count so "0 mapped" is never
// ambiguous. Nothing here writes to a store or the BIM model — it is visual only (P6 is not in play:
// no store is touched at all).

import * as Cesium from 'cesium';
import { fetchContextRoads } from './contextRoads';
import { fetchContextLanduse } from './contextLanduse';
import { fetchContextFurniture } from './contextFurniture';
import { CONTEXT_WIDE_HALF_DEG } from './contextExtents';
import {
    placeLamps, placePedestrians, streetLifeLogLine,
    PEDESTRIAN_PALETTE_SIZE,
    type StreetLamp, type StreetPedestrian, type FurnitureLayerState,
} from './contextStreetLife';
import type { LanduseAreaLike } from './formaGroundColour';

/** Radial cull for the rendered objects — the near context disc (~890 m), like the canopies. */
export const STREET_LIFE_RENDER_RADIUS_M = 890;
/** Hard instance ceilings AFTER the placement caps, so a pathological road set still cannot blow up. */
export const STREET_LIFE_MAX_LAMPS = 1200;
export const STREET_LIFE_MAX_PEOPLE = 800;

/** Lamp post geometry — 6 m pole + a small warm head, per the founder's "street lighting". */
export const LAMP_POLE_HEIGHT_M = 6;
const LAMP_POLE_RADIUS_M = 0.075;
const LAMP_HEAD_RADIUS_M = 0.32;
const LAMP_POLE_CSS = '#8A8880';   // muted grey — furniture recedes behind the massing.
const LAMP_HEAD_CSS = '#F2D9A0';   // warm, unlit head (no light source: this is scenery, not a study).

/** Person geometry — a 1.7 m capsule: a body cylinder + a head. */
export const PERSON_HEIGHT_M = 1.7;
const PERSON_BODY_HEIGHT_M = 1.4;
const PERSON_BODY_RADIUS_M = 0.19;
const PERSON_HEAD_RADIUS_M = 0.13;

/**
 * Muted clothing palette — deliberately desaturated so a crowd reads as texture on the street and
 * never competes with the white massing or the purple envelope. `PEDESTRIAN_PALETTE_SIZE` entries;
 * the pure module hands us the index, so the same person is the same colour on every rebuild.
 */
export const PEDESTRIAN_PALETTE: readonly string[] = [
    '#5B6472', '#7A6E63', '#4F5A55', '#6E5F6B', '#57616B', '#6B6558',
];

/** What the layer needs from its host viewport — nothing else. Keeps this module Cesium-only. */
export interface StreetLifeHost {
    /** Absolute ground height in metres at lat/lon, on the settled relief (the trees' `sampleGround`). */
    groundAt(lat: number, lon: number): number;
    /**
     * §CTX-SEAT-FIRST-FOR-BAKED-LAYERS (L-12964) — give the host the chance to resolve the DETAILED
     * terrain ground for these exact points BEFORE `groundAt` is asked for any of them.
     *
     * `groundAt` is synchronous, and the host's implementation falls back to the currently
     * TESSELLATED globe mesh when it has no detailed sample for a point — at start-up that is two
     * coarse level-2 tiles seen from 600 m up, ~7 m off the real surface at Córdoba (founder,
     * 2026-09-06: lamps and people "sits under the visual plane … after the user selects the parcel
     * they are nicely visually again"). Lamps and pedestrians BAKE that ground into their instance
     * matrices, so a coarse answer is permanent until a full rebuild. The layer chooses its own
     * points, so only the layer can say WHICH points need sampling — hence this hook.
     *
     * Optional so a caller that has no terrain (tests, the flat/keyless path) can omit it; never
     * throws, and a rejection only means the seats fall back to exactly the pre-L-12964 behaviour.
     */
    prepareGrounds?(points: ReadonlyArray<{ lat: number; lon: number }>): Promise<void>;
}

export interface StreetLifeCounts {
    readonly mapped: number;
    readonly synthesisedLamps: number;
    readonly roadWaysLit: number;
    readonly pedestrians: number;
    readonly furnitureLayer: FurnitureLayerState;
    readonly lampInstances: number;
    readonly peopleInstances: number;
}

function cssColor(css: string): Cesium.Color {
    return Cesium.Color.fromCssColorString(css).withAlpha(1);
}

/**
 * The instanced street-life layer: mapped + synthesised street lamps and synthetic pedestrians.
 * One instance per viewport. Every method is guarded and idempotent; nothing throws.
 */
export class StreetLifeLayer {
    private lampsPrimitive: Cesium.Primitive | null = null;
    private peoplePrimitive: Cesium.Primitive | null = null;
    private abort: AbortController | null = null;
    private at: { lat: number; lon: number } | null = null;
    private lastCounts: StreetLifeCounts | null = null;

    /** §STREET-LIFE toggle — DEFAULT ON in Forma. Honoured by `load` and by the base rebuild. */
    public enabled = true;

    /** Where the layer is currently built, or null. Used by the settled-base rebuild. */
    public get builtAt(): { lat: number; lon: number } | null { return this.at; }
    public get hasContent(): boolean { return this.lampsPrimitive !== null || this.peoplePrimitive !== null; }
    public get counts(): StreetLifeCounts | null { return this.lastCounts; }

    /** Remove both primitives (idempotent; `primitives.remove` destroys them). */
    public clear(viewer: Cesium.Viewer | null): void {
        for (const p of [this.lampsPrimitive, this.peoplePrimitive]) {
            if (viewer && p) {
                try { viewer.scene.primitives.remove(p); } catch { /* already gone / destroyed with the viewer */ }
            }
        }
        this.lampsPrimitive = null;
        this.peoplePrimitive = null;
        this.at = null;
    }

    /** Abort any in-flight load and drop the layer — for viewer teardown / project switch. */
    public dispose(viewer: Cesium.Viewer | null): void {
        try { this.abort?.abort(); } catch { /* ignore */ }
        this.abort = null;
        this.clear(viewer);
        this.lastCounts = null;
    }

    /**
     * Read (cached) roads + landuse + the `furniture` layer, place the objects, and build the two
     * primitives at `lat/lon`. `force` rebuilds at the same site (the settled-base re-seat).
     *
     * All three reads are bbox-cached and already warmed by `warmAllContextLayers`, so on a live site
     * this costs no network at all. An ABSENT furniture layer is an honest empty — synthesis still
     * runs off the road network, which is the whole point of the arm.
     */
    public async load(
        viewer: Cesium.Viewer | null, host: StreetLifeHost, lat: number, lon: number, force = false,
    ): Promise<void> {
        if (!viewer) return;
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
        if (!this.enabled) { this.clear(viewer); return; }
        if (!force && this.hasContent && this.at &&
            Math.abs(this.at.lat - lat) < 1e-6 && Math.abs(this.at.lon - lon) < 1e-6) return;

        this.abort?.abort();
        this.abort = new AbortController();
        const signal = this.abort.signal;

        let furniture, roads, landuse;
        try {
            [furniture, roads, landuse] = await Promise.all([
                fetchContextFurniture(lat, lon, signal),
                fetchContextRoads(lat, lon, signal),
                fetchContextLanduse(lat, lon, signal, CONTEXT_WIDE_HALF_DEG),
            ]);
        } catch { return; }
        if (signal.aborted || !this.viewerStillCurrent(viewer)) return;
        if (!this.enabled) { this.clear(viewer); return; }

        const origin = { lat, lon };
        const lampResult = placeLamps(furniture.lamps, roads.ways, {
            origin, radiusM: STREET_LIFE_RENDER_RADIUS_M,
        });
        const peopleResult = placePedestrians(
            roads.ways, landuse.areas as ReadonlyArray<LanduseAreaLike>,
            { origin, radiusM: STREET_LIFE_RENDER_RADIUS_M },
        );

        this.clear(viewer);
        this.at = { lat, lon };

        const lamps = lampResult.lamps
            .filter((l) => l.distM <= STREET_LIFE_RENDER_RADIUS_M)
            .slice(0, STREET_LIFE_MAX_LAMPS);
        const people = peopleResult.people.slice(0, STREET_LIFE_MAX_PEOPLE);

        // §CTX-SEAT-FIRST-FOR-BAKED-LAYERS (L-12964) — resolve the DETAILED ground for exactly the
        // points about to be baked, BEFORE `groundAt` is asked for any of them. See `StreetLifeHost`.
        if (host.prepareGrounds) {
            try {
                await host.prepareGrounds([
                    ...lamps.map((l) => ({ lat: l.lat, lon: l.lon })),
                    ...people.map((p) => ({ lat: p.lat, lon: p.lon })),
                ]);
            } catch { /* seats fall back to the pre-L-12964 sample; never fatal */ }
            if (signal.aborted || !this.viewerStillCurrent(viewer)) return;
            if (!this.enabled) { this.clear(viewer); return; }
        }

        const lampInstances = this.buildLamps(viewer, host, lamps);
        const peopleInstances = this.buildPeople(viewer, host, people);

        this.lastCounts = {
            mapped: lampResult.mappedCount,
            synthesisedLamps: lampResult.syntheticCount,
            roadWaysLit: lampResult.waysLit,
            pedestrians: people.length,
            furnitureLayer: furniture.state,
            lampInstances,
            peopleInstances,
        };
        try { viewer.scene.requestRender(); } catch { /* viewer torn down mid-build */ }

        console.log(streetLifeLogLine({
            mapped: lampResult.mappedCount,
            synthesisedLamps: lampResult.syntheticCount,
            roadWaysLit: lampResult.waysLit,
            pedestrians: people.length,
            furnitureLayer: furniture.state,
            ...(furniture.reason === undefined ? {} : { furnitureReason: furniture.reason }),
        }));
        console.log(
            `[CesiumViewport][forma] §STREET-LIFE (L-12936) render: ${lampInstances} lamp instance(s) + ` +
                `${peopleInstances} person instance(s) in TWO shadowless shared-material primitives ` +
                `(radial ≤${STREET_LIFE_RENDER_RADIUS_M} m; ${lampResult.waysEligible} eligible road way(s), ` +
                `${lampResult.waysSkippedMapped} left to their mapped lamps, ` +
                `${lampResult.syntheticDroppedByCap} synthesised lamp(s) + ${peopleResult.droppedByCap} ` +
                'person(s) dropped by the nearest-first cap).',
        );
    }

    private viewerStillCurrent(viewer: Cesium.Viewer): boolean {
        try { return !viewer.isDestroyed(); } catch { return false; }
    }

    /** ONE primitive for every lamp: a pole instance + a head instance each, per-instance colour. */
    private buildLamps(viewer: Cesium.Viewer, host: StreetLifeHost, lamps: ReadonlyArray<StreetLamp>): number {
        if (lamps.length === 0) return 0;
        const poleGeom = new Cesium.CylinderGeometry({
            length: LAMP_POLE_HEIGHT_M,
            topRadius: LAMP_POLE_RADIUS_M,
            bottomRadius: LAMP_POLE_RADIUS_M * 1.4,   // a hair wider at the base — reads as a post.
            slices: 6,                                 // low-poly by construction.
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        });
        const headGeom = new Cesium.EllipsoidGeometry({
            radii: new Cesium.Cartesian3(LAMP_HEAD_RADIUS_M, LAMP_HEAD_RADIUS_M, LAMP_HEAD_RADIUS_M * 0.55),
            stackPartitions: 4,
            slicePartitions: 6,
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        });
        const poleColor = Cesium.ColorGeometryInstanceAttribute.fromColor(cssColor(LAMP_POLE_CSS));
        const headColor = Cesium.ColorGeometryInstanceAttribute.fromColor(cssColor(LAMP_HEAD_CSS));

        const instances: Cesium.GeometryInstance[] = [];
        for (const l of lamps) {
            try {
                const ground = host.groundAt(l.lat, l.lon);
                if (!Number.isFinite(ground)) continue;
                instances.push(new Cesium.GeometryInstance({
                    geometry: poleGeom,
                    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(
                        Cesium.Cartesian3.fromDegrees(l.lon, l.lat, ground + LAMP_POLE_HEIGHT_M / 2)),
                    attributes: { color: poleColor },
                }));
                instances.push(new Cesium.GeometryInstance({
                    geometry: headGeom,
                    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(
                        Cesium.Cartesian3.fromDegrees(l.lon, l.lat, ground + LAMP_POLE_HEIGHT_M + 0.05)),
                    attributes: { color: headColor },
                }));
            } catch { /* skip one malformed lamp */ }
        }
        if (instances.length === 0) return 0;
        try {
            const prim = new Cesium.Primitive({
                geometryInstances: instances,
                appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: false, closed: true }),
                asynchronous: true,
                shadows: Cesium.ShadowMode.DISABLED,
            });
            viewer.scene.primitives.add(prim);
            this.lampsPrimitive = prim;
            return instances.length;
        } catch (e) {
            console.warn('[CesiumViewport][forma] §STREET-LIFE lamp primitive build failed:', e);
            return 0;
        }
    }

    /** ONE primitive for every person: a body instance + a head instance each, muted per-hash colour. */
    private buildPeople(viewer: Cesium.Viewer, host: StreetLifeHost, people: ReadonlyArray<StreetPedestrian>): number {
        if (people.length === 0) return 0;
        // A cylinder is rotationally symmetric, so `headingRad` does not change the silhouette; it is
        // carried by the pure module for a future oriented low-poly mesh and deliberately unused here
        // rather than faked into a rotation that would show nothing.
        const bodyGeom = new Cesium.CylinderGeometry({
            length: PERSON_BODY_HEIGHT_M,
            topRadius: PERSON_BODY_RADIUS_M * 0.85,
            bottomRadius: PERSON_BODY_RADIUS_M,
            slices: 6,
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        });
        const headGeom = new Cesium.EllipsoidGeometry({
            radii: new Cesium.Cartesian3(PERSON_HEAD_RADIUS_M, PERSON_HEAD_RADIUS_M, PERSON_HEAD_RADIUS_M),
            stackPartitions: 4,
            slicePartitions: 6,
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        });
        const bodyColors = PEDESTRIAN_PALETTE.map(
            (css) => Cesium.ColorGeometryInstanceAttribute.fromColor(cssColor(css)));
        const headColor = Cesium.ColorGeometryInstanceAttribute.fromColor(cssColor('#B9A894'));

        const instances: Cesium.GeometryInstance[] = [];
        for (const p of people) {
            try {
                const ground = host.groundAt(p.lat, p.lon);
                if (!Number.isFinite(ground)) continue;
                const colour = bodyColors[p.palette % PEDESTRIAN_PALETTE_SIZE] ?? bodyColors[0]!;
                instances.push(new Cesium.GeometryInstance({
                    geometry: bodyGeom,
                    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(
                        Cesium.Cartesian3.fromDegrees(p.lon, p.lat, ground + PERSON_BODY_HEIGHT_M / 2)),
                    attributes: { color: colour },
                }));
                instances.push(new Cesium.GeometryInstance({
                    geometry: headGeom,
                    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(
                        Cesium.Cartesian3.fromDegrees(p.lon, p.lat, ground + PERSON_HEIGHT_M - PERSON_HEAD_RADIUS_M)),
                    attributes: { color: headColor },
                }));
            } catch { /* skip one malformed person */ }
        }
        if (instances.length === 0) return 0;
        try {
            const prim = new Cesium.Primitive({
                geometryInstances: instances,
                appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: false, closed: true }),
                asynchronous: true,
                shadows: Cesium.ShadowMode.DISABLED,
            });
            viewer.scene.primitives.add(prim);
            this.peoplePrimitive = prim;
            return instances.length;
        } catch (e) {
            console.warn('[CesiumViewport][forma] §STREET-LIFE people primitive build failed:', e);
            return 0;
        }
    }
}
