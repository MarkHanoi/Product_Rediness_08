// ADR-0074 P1b (C21 §10) — sun-hours analysis pass + heatmap overlay (renderer-three).
//
// THIS is the P2 single-THREE-owner home for the solar sun-hours feature's
// geometry side. It is ADDITIVE + ISOLATED: it never touches the normal render
// path. Invoked only by the editor console command (pryzmComputeSunHours), it:
//
//   1. Gathers the building's exterior surface meshes (roof/slab + walls) for a
//      level by traversing the scene (userData.elementType + userData.levelId).
//   2. Builds a merged occluder geometry + a three-mesh-bvh for fast CPU
//      occlusion raycasts (the same library @pryzm/picking uses).
//   3. Derives SolarSurface[] from each mesh triangle: outward normal + a grid of
//      world sample points (nudged off the surface to avoid self-hit), via the
//      pure faceGrid helper.
//   4. Generates the sun-sample set for the site latitude via @pryzm/solar-analysis
//      (generateSunSamples) — NOT re-implementing the sun math; the ENU frame
//      (+X East, +Y Up, +Z South) matches RealSunService.
//   5. Accumulates per-surface sun-hours with @pryzm/solar-analysis
//      (accumulateSunHours), injecting a BVH-raycast occlusion oracle.
//   6. Paints a TOGGLEABLE per-vertex-colour heatmap onto the meshes WITHOUT
//      mutating their original materials (originals saved in userData, restored by
//      clearSunHoursOverlay).
//
// CPU raycast occlusion (robust + correct) is used in this slice; a GPU/WebGPU
// shadow-map oracle is a later perf optimisation (ADR-0074 P2).

import * as THREE from '../three-re-export.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import {
    accumulateSunHours,
    generateSunSamples,
    type SolarSurface,
    type SunHoursResult,
    type SunSample,
    type Vec3,
} from '@pryzm/solar-analysis';
import { gridTriangle, type V3 } from './faceGrid.js';
import {
    DEFAULT_SUN_HOURS_RAMP,
    sunHoursToColor,
    type RampStop,
} from './heatmapRamp.js';
import {
    isExteriorFace,
    isGlazingSurface,
    EXTERIOR_PROBE_EPS,
} from './solarSurfaceFilter.js';
import { clampTimeMinutes } from './solarPresets.js';

// One-time install of three-mesh-bvh accelerated raycast onto Three's prototype
// (idempotent — @pryzm/picking installs the same; re-install is a harmless no-op).
type AccelMesh = typeof THREE.Mesh & { prototype: { raycast: typeof acceleratedRaycast } };
((THREE.Mesh as unknown) as AccelMesh).prototype.raycast = acceleratedRaycast;

/** Element types treated as exterior solar surfaces (roof/slab + walls). */
const SOLAR_ELEMENT_TYPES = new Set<string>([
    'Slab', 'Roof', 'roof', 'slab',
    'Wall', 'LayeredWall', 'WallPart', 'wall',
]);

/** userData flags marking a mesh as carrying the heatmap overlay. */
const KEY_ORIGINAL_MATERIAL = '__pryzmSunHoursOrigMaterial';
const KEY_HAD_COLOR_ATTR = '__pryzmSunHoursHadColorAttr';
const KEY_OVERLAY_APPLIED = '__pryzmSunHoursApplied';

export interface ComputeSunHoursOptions {
    /** Analysis day-of-year (1..366). Default: the current UTC day. */
    readonly dayOfYear?: number;
    /** Minutes between sun samples within the day. Default 15. */
    readonly stepMinutes?: number;
    /** Site latitude (decimal degrees). Required for the sun path. */
    readonly latDeg: number;
    /** Site longitude (decimal degrees). Affects solar time of day. Default 0. */
    readonly lngDeg?: number;
    /**
     * §L-430 — θ, the PROJECT→TRUE-north angle (radians; `SiteLocation.trueNorth`). Default 0.
     *
     * This analysis raycasts sun directions against SCENE geometry, so the sun must be in the
     * SAME frame the model is authored in. Omitting θ once the authoring frame rotates would
     * cast every ray from a bearing θ off the true sun — a fully-populated, plausible, wrong
     * sun-hours heatmap. Must match `RealSunService.setProjectNorth`, or the analysed shadows
     * and the viewport shadows disagree.
     */
    readonly projectNorthRad?: number;
    /** Sample spacing on each surface, metres. Default 0.75. */
    readonly sampleSpacing?: number;
    /** Heatmap colour ramp (cold → hot). Default PRYZM purple → yellow. */
    readonly ramp?: ReadonlyArray<RampStop>;
    /** Apply the heatmap overlay to the meshes. Default true. */
    readonly paint?: boolean;
    /**
     * OPT-IN (default false → console path byte-identical). When true, drop interior
     * faces (whose outward normal probes immediately hit the building's own geometry)
     * before accumulation, so the AVG/MIN reflect only exterior-facing surfaces.
     * See solarSurfaceFilter.isExteriorFace for the heuristic.
     */
    readonly exteriorOnly?: boolean;
    /**
     * OPT-IN (default false → console path byte-identical). When true, glazing/glass
     * meshes (window glass, curtain-wall glass, transparent materials) are excluded
     * from BOTH the occluder BVH and the sampled surfaces — glass shouldn't cast a
     * hard solid shadow nor be heat-mapped as opaque. See isGlazingSurface.
     */
    readonly excludeGlass?: boolean;
    /**
     * Optional time-of-day filter, minutes past midnight (0..1439). When set, only
     * sun samples within `timeWindowMinutes` of this instant are integrated (a
     * "sun at HH:MM ± window" pass for the panel's time slider). Default: undefined
     * → integrate the whole daylight day (console path unchanged).
     */
    readonly centerTimeMinutes?: number;
    /** Half-window (minutes) around `centerTimeMinutes`. Default 60. Ignored unless
     *  `centerTimeMinutes` is set. */
    readonly timeWindowMinutes?: number;
}

export interface ComputeSunHoursOnModelResult {
    /** Per-surface + AVG/MAX/MIN sun-hours from @pryzm/solar-analysis. */
    readonly result: SunHoursResult;
    /** Number of meshes gathered as exterior solar surfaces. */
    readonly meshCount: number;
    /** Total sample points raycast across all surfaces. */
    readonly samplePointCount: number;
    /** Sun samples integrated over (above-horizon). */
    readonly sunSampleCount: number;
    /** Whether the heatmap overlay was applied. */
    readonly painted: boolean;
}

/** Internal per-mesh record linking a mesh to its derived solar surface. */
interface MeshSurface {
    readonly mesh: THREE.Mesh;
    readonly surface: SolarSurface;
}

/** THREE-free glazing test for a mesh: its elementType token OR a transparent,
 *  low-opacity single material. Used by the excludeGlass option. */
function meshIsGlazing(mesh: THREE.Mesh): boolean {
    const et = (mesh.userData as { elementType?: string }).elementType;
    const mat = mesh.material;
    const single = Array.isArray(mat) ? undefined : (mat as THREE.Material | undefined);
    return isGlazingSurface({
        elementType: et,
        transparent: single?.transparent,
        opacity: single?.opacity,
    });
}

function gatherSolarMeshes(
    scene: THREE.Object3D,
    levelId: string,
    excludeGlass: boolean,
): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const ud = obj.userData as { elementType?: string; levelId?: string };
        if (!ud.elementType || !SOLAR_ELEMENT_TYPES.has(ud.elementType)) return;
        if (ud.levelId !== undefined && ud.levelId !== levelId) return;
        if (!obj.geometry || !(obj.geometry as THREE.BufferGeometry).attributes?.position) return;
        if (excludeGlass && meshIsGlazing(obj)) return;
        // Skip effectively-hidden meshes.
        let cur: THREE.Object3D | null = obj;
        let visible = true;
        while (cur) { if (cur.visible === false) { visible = false; break; } cur = cur.parent; }
        if (!visible) return;
        out.push(obj);
    });
    return out;
}

/** Iterate a mesh's world-space triangles, invoking cb(a,b,c). Handles indexed +
 *  non-indexed geometry and applies the mesh's world matrix. */
function forEachWorldTriangle(
    mesh: THREE.Mesh,
    cb: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => void,
): void {
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return;
    mesh.updateWorldMatrix(true, false);
    const mat = mesh.matrixWorld;
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    const index = geo.index;
    const triCount = index ? index.count / 3 : pos.count / 3;
    for (let t = 0; t < triCount; t++) {
        const i0 = index ? index.getX(t * 3) : t * 3;
        const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
        va.fromBufferAttribute(pos, i0).applyMatrix4(mat);
        vb.fromBufferAttribute(pos, i1).applyMatrix4(mat);
        vc.fromBufferAttribute(pos, i2).applyMatrix4(mat);
        cb(va, vb, vc);
    }
}

/** Build a SolarSurface (outward normal estimate + sample-point grid) for a mesh.
 *  The normal is the area-weighted mean of its triangle face normals (in world
 *  space); sample points come from gridTriangle per triangle. */
function buildSurfaceForMesh(
    mesh: THREE.Mesh,
    surfaceId: string,
    spacing: number,
): SolarSurface | null {
    let nx = 0, ny = 0, nz = 0;
    const samplePoints: Vec3[] = [];
    const triNormal = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();

    forEachWorldTriangle(mesh, (a, b, c) => {
        ab.subVectors(b, a);
        ac.subVectors(c, a);
        triNormal.crossVectors(ab, ac); // length = 2·area, direction = face normal
        const area2 = triNormal.length();
        if (area2 < 1e-9) return;
        nx += triNormal.x; ny += triNormal.y; nz += triNormal.z; // area-weighted

        const n: V3 = { x: triNormal.x / area2, y: triNormal.y / area2, z: triNormal.z / area2 };
        const pts = gridTriangle(
            { x: a.x, y: a.y, z: a.z },
            { x: b.x, y: b.y, z: b.z },
            { x: c.x, y: c.y, z: c.z },
            n,
            { spacing },
        );
        for (const p of pts) samplePoints.push(p);
    });

    const nlen = Math.hypot(nx, ny, nz);
    if (nlen < 1e-9 || samplePoints.length === 0) return null;
    return {
        id: surfaceId,
        normal: { x: nx / nlen, y: ny / nlen, z: nz / nlen },
        samplePoints,
    };
}

/** Merge the gathered meshes' world-space geometry into ONE occluder geometry +
 *  build a MeshBVH for fast raycasts. Positions only (occlusion is geometric). */
function buildOccluderBvh(meshes: ReadonlyArray<THREE.Mesh>): MeshBVH | null {
    const positions: number[] = [];
    const tmp = new THREE.Vector3();
    for (const mesh of meshes) {
        const geo = mesh.geometry as THREE.BufferGeometry;
        const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
        if (!pos) continue;
        mesh.updateWorldMatrix(true, false);
        const mat = mesh.matrixWorld;
        const index = geo.index;
        const triCount = index ? index.count / 3 : pos.count / 3;
        for (let t = 0; t < triCount; t++) {
            for (let k = 0; k < 3; k++) {
                const vi = index ? index.getX(t * 3 + k) : t * 3 + k;
                tmp.fromBufferAttribute(pos, vi).applyMatrix4(mat);
                positions.push(tmp.x, tmp.y, tmp.z);
            }
        }
    }
    if (positions.length === 0) return null;
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new MeshBVH(merged);
}

/** Apply a flat per-mesh heatmap colour as vertex colours, preserving (saving) the
 *  original material + any prior colour attribute. Non-destructive — restore via
 *  clearSunHoursOverlay. */
function paintMesh(mesh: THREE.Mesh, r: number, g: number, b: number): void {
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return;

    // Save original material once (clone so we can flip vertexColors on a copy).
    if (mesh.userData[KEY_ORIGINAL_MATERIAL] === undefined) {
        mesh.userData[KEY_ORIGINAL_MATERIAL] = mesh.material;
    }
    // Remember whether a colour attribute pre-existed (so clear can delete ours).
    if (mesh.userData[KEY_HAD_COLOR_ATTR] === undefined) {
        mesh.userData[KEY_HAD_COLOR_ATTR] = geo.getAttribute('color') !== undefined;
    }

    const n = pos.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const overlayMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
        metalness: 0.0,
        side: THREE.DoubleSide,
    });
    overlayMat.name = '__pryzmSunHoursOverlay';
    mesh.material = overlayMat;
    mesh.userData[KEY_OVERLAY_APPLIED] = true;
}

/**
 * Run the sun-hours analysis pass on the given scene for `levelId` and (by default)
 * paint the heatmap. Additive + isolated — never mutates the normal render path
 * except via the explicitly-restorable overlay. Returns the SunHoursResult and
 * counts for logging. Returns null when no solar meshes are found.
 */
export function computeSunHoursOnModel(
    scene: THREE.Object3D,
    levelId: string,
    opts: ComputeSunHoursOptions,
): ComputeSunHoursOnModelResult | null {
    const excludeGlass = opts.excludeGlass === true;
    const meshes = gatherSolarMeshes(scene, levelId, excludeGlass);
    if (meshes.length === 0) return null;

    const spacing = opts.sampleSpacing && opts.sampleSpacing > 0 ? opts.sampleSpacing : 0.75;

    // Derive per-mesh surfaces.
    let meshSurfaces: MeshSurface[] = [];
    for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i]!;
        const id = (mesh.userData['elementId'] as string | undefined)
            ?? (mesh.userData['id'] as string | undefined)
            ?? `${mesh.userData['elementType'] ?? 'surface'}#${i}`;
        const surface = buildSurfaceForMesh(mesh, id, spacing);
        if (surface) meshSurfaces.push({ mesh, surface });
    }
    if (meshSurfaces.length === 0) return null;

    // Build the occluder BVH from ALL gathered meshes (so a wall can shade a roof).
    // (When excludeGlass is set, glass meshes were already dropped from `meshes`, so
    //  they neither cast shadow here nor appear as sampled surfaces above.)
    const bvh = buildOccluderBvh(meshes);

    // OPT-IN exterior-only filter: drop surfaces whose outward normal probes
    // immediately hit the building's own geometry (i.e. they face into an enclosed
    // space). Roof/slab tops (upward normal) are always kept. See isExteriorFace.
    if (opts.exteriorOnly === true && bvh) {
        const probeRay = new THREE.Ray();
        const probeDir = new THREE.Vector3();
        meshSurfaces = meshSurfaces.filter((m) => {
            const n = m.surface.normal;
            // Upward-facing surfaces (roofs/slab tops) are exterior by construction.
            if (n.y >= 0.5) return true;
            const p0 = m.surface.samplePoints[0];
            if (!p0) return true;
            probeRay.origin.set(p0.x, p0.y, p0.z);
            probeDir.set(n.x, n.y, n.z).normalize();
            probeRay.direction.copy(probeDir);
            // Probe OUTWARD a short distance; a near self-hit ⇒ interior face.
            const hit = bvh.raycastFirst(probeRay, THREE.DoubleSide, 1e-3, EXTERIOR_PROBE_EPS * 2);
            const dist = hit ? (hit.distance as number) : null;
            return isExteriorFace(n.y, dist);
        });
        if (meshSurfaces.length === 0) return null;
    }

    // Sun samples for the site, single day, daylight-only, fixed cadence.
    const now = new Date();
    const dayOfYear = opts.dayOfYear
        ?? Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
            - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
    const stepMinutes = opts.stepMinutes && opts.stepMinutes > 0 ? opts.stepMinutes : 15;
    let samples: SunSample[] = generateSunSamples({
        latDeg: opts.latDeg,
        lngDeg: opts.lngDeg ?? 0,
        dayOfYear,
        stepMinutes,
        daylightOnly: true,
        // §L-430 — express the sun in the AUTHORING frame; these dirs are raycast against
        // scene geometry below, so a true-frame sun would rotate every shadow by θ.
        projectNorthRad: opts.projectNorthRad ?? 0,
    });

    // Optional time-of-day window (panel's HH:MM slider): keep only samples within
    // `timeWindowMinutes` of `centerTimeMinutes`. Default-undefined ⇒ whole day.
    if (opts.centerTimeMinutes != null && Number.isFinite(opts.centerTimeMinutes)) {
        const center = clampTimeMinutes(opts.centerTimeMinutes);
        const half = opts.timeWindowMinutes != null && opts.timeWindowMinutes > 0
            ? opts.timeWindowMinutes : 60;
        samples = samples.filter((s) => Math.abs(s.timeMinutes - center) <= half);
    }

    // Occlusion oracle: BVH raycast from the (already-nudged) point toward the sun.
    // A hit before "infinity" ⇒ blocked. A tiny near-skip guards residual self-hit.
    const ray = new THREE.Ray();
    const dir = new THREE.Vector3();
    const NEAR_SKIP = 0.05;  // m — ignore hits closer than this (self / coplanar)
    const FAR = 5_000;       // m — practical "infinity" for a building-scale scene
    const isOccluded = (point: Vec3, sunDir: Vec3): boolean => {
        if (!bvh) return false;
        ray.origin.set(point.x, point.y, point.z);
        dir.set(sunDir.x, sunDir.y, sunDir.z).normalize();
        ray.direction.copy(dir);
        // near = NEAR_SKIP skips the surface the point sits just off of; any hit in
        // (NEAR_SKIP, FAR] toward the sun ⇒ blocked.
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide, NEAR_SKIP, FAR);
        return hit !== null;
    };

    const surfaces = meshSurfaces.map((m) => m.surface);
    const result = accumulateSunHours(surfaces, samples, isOccluded, { stepMinutes });

    let painted = false;
    let samplePointCount = 0;
    for (const m of meshSurfaces) samplePointCount += m.surface.samplePoints.length;

    if (opts.paint !== false) {
        const ramp = opts.ramp ?? DEFAULT_SUN_HOURS_RAMP;
        const maxHours = result.maxSunHours > 0 ? result.maxSunHours : 1;
        const byId = new Map(result.surfaces.map((s) => [s.surfaceId, s]));
        for (const m of meshSurfaces) {
            const s = byId.get(m.surface.id);
            const hours = s ? s.sunHours : 0;
            const c = sunHoursToColor(hours, maxHours, ramp);
            paintMesh(m.mesh, c.r, c.g, c.b);
        }
        painted = true;
    }

    return {
        result,
        meshCount: meshSurfaces.length,
        samplePointCount,
        sunSampleCount: samples.length,
        painted,
    };
}

/**
 * Remove the sun-hours heatmap overlay from the scene: restore each painted mesh's
 * original material and delete the colour attribute we added (unless one pre-existed).
 * Returns the number of meshes cleared. Safe to call when nothing is painted.
 */
export function clearSunHoursOverlay(scene: THREE.Object3D): number {
    let cleared = 0;
    scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.userData[KEY_OVERLAY_APPLIED] !== true) return;
        const orig = obj.userData[KEY_ORIGINAL_MATERIAL] as THREE.Material | THREE.Material[] | undefined;
        const overlay = obj.material;
        if (orig !== undefined) obj.material = orig;
        // Dispose the throwaway overlay material(s).
        if (overlay && overlay !== orig) {
            if (Array.isArray(overlay)) overlay.forEach((mm) => mm.dispose());
            else (overlay as THREE.Material).dispose();
        }
        if (obj.userData[KEY_HAD_COLOR_ATTR] === false) {
            (obj.geometry as THREE.BufferGeometry).deleteAttribute('color');
        }
        delete obj.userData[KEY_ORIGINAL_MATERIAL];
        delete obj.userData[KEY_HAD_COLOR_ATTR];
        delete obj.userData[KEY_OVERLAY_APPLIED];
        cleared++;
    });
    return cleared;
}
