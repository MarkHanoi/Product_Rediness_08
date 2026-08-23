/**
 * §ELEV-SHEAR-SURVIVES-THE-PROXY (L-10140) — THE PROBE THAT NAMES WHICH DEFECT THIS IS.
 *
 * Founder, 2026-08-23: *"check why a raked wall with edited profile would not render well in
 * elevation?"* — split view, 3-D left / West Elevation right. The 3-D shows the wall correctly
 * raked with its edited profile; the elevation draws a QUADRILATERAL floating above and left of
 * the building outline, detached from the gable silhouette below it.
 *
 * ⭐ THE MODEL IS RIGHT AND THE PROJECTION OF IT IS WRONG. This file establishes which of the
 * three candidate defects it is, at the layer that decides:
 *
 *   (i)   the projector is FED geometry that is not the wall  → a FEEDING defect
 *   (ii)  it is fed the wall and projects it wrongly          → a PROJECTION defect
 *   (iii) it refuses and draws a fallback                     → a SILENT REFUSAL
 *
 * ═══ THE MECHANISM UNDER TEST ═══
 *
 * `WallFragmentBuilder._applyRakeShearToChildren` (`WallFragmentBuilder.ts:3302`) applies the
 * rake as a genuine SHEAR MATRIX premultiplied onto each child's `matrix`, with
 * `matrixAutoUpdate = false`. ⛔ **The rake is in the MATRIX, not in the geometry.** That file's
 * own §L955 note says why instancing had to be abandoned for raked walls: *"GPU instancing
 * decomposes a world matrix into T·R·S and a shear is not expressible in TRS"*.
 *
 * `NativeElementMeshExporter.exportForView` — the ONE feeder of `EdgeProjectorService` — did
 * exactly that decompose:
 *
 *     source.matrixWorld.decompose(proxy.position, proxy.quaternion, proxy.scale);
 *
 * `THREE.Matrix4.decompose` takes column LENGTHS as scale and then reads a quaternion off the
 * normalised basis. For a sheared matrix that basis is NOT orthogonal, so the quaternion is
 * arbitrary and the recomposed T·R·S is a DIFFERENT SOLID. The projector then draws
 * `EdgesGeometry(mesh.geometry).applyMatrix4(mesh.matrixWorld)` (`EdgeProjectorService.ts:2892`,
 * `:2906`) — i.e. it faithfully projects the wrong solid.
 *
 * ⛔ THE SAME REASON THAT MADE INSTANCING UNSAFE FOR A RAKED WALL MADE THE PROXY UNSAFE, AND
 * ONLY ONE OF THE TWO WAS ACTED ON.
 *
 * ═══ THE MEASUREMENT — worst corner error between the model and what the projector is fed ═══
 *
 * | case                                   | before | after |
 * |---|---|---|
 * | plain wall (CONTROL)                   | 0        | 0     |
 * | profile-edited ONLY (CONTROL)          | 0        | 0     |
 * | raked only                             | **0.413 m** | 0 |
 * | raked + profile — **the founder's wall**| **0.413 m** | 0 |
 * | raked + profile, oblique 20° (on sheet)| **0.433 m** | 0 |
 * | raked + profile + an opening (on sheet)| **0.413 m** | 0 |
 * | SECTION, same wall                     | **0.438 m** | 0 |
 * | PLAN, same wall                        | **0.438 m** | 0 |
 * | cache HIT vs the MISS that filled it   | **0.027 m** | 0 |
 *
 * ⭐ **THE TWO CONTROLS ARE THE ANSWER TO (i) vs (ii).** The feed is exact for a plain wall and
 * exact for a profile-edited one — a profile lives in the GEOMETRY and geometry is passed by
 * reference. It is wrong ONLY where a shear exists. That is a FEEDING defect, (i): the projector
 * was handed a solid that is not the wall, and drew it faithfully.
 *
 * ⭐ **AND IT WAS NEVER ONLY THE ELEVATION.** Section and plan are fed by the same
 * `exportForView` (`ViewController.ts:675`/`:2280`, `initScene.ts:1345`/`:1399`) and were wrong
 * by 0.438 m on the same wall. The founder reported the view he happened to have open.
 *
 * ⚠ The last row is its own finding: the §H.2 descriptor cache re-decomposed an
 * already-recomposed matrix, so the SAME element drifted a further 27 mm between the pass that
 * built it and every pass served from cache. A drawing that changes when you re-open it.
 *
 * Maps C04 §7 (projection feeds), C09 §4.6.4f, C85/C86 (element integrity in 2-D views).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { NativeElementMeshExporter } from './NativeElementMeshExporter';

// ─── The wall, and its rake ──────────────────────────────────────────────────

const WALL_LEN = 4;
const WALL_H = 3;
const WALL_T = 0.3;
/** 75° from horizontal — the founder's own probe angle in `WallElevationSymbol.probe.test.ts`. */
const RAKE_DEG = 75;
/** `rakeShearPerMetre(75)` = cot(75°) = lateral metres per metre of rise. */
const K = 1 / Math.tan((RAKE_DEG * Math.PI) / 180);

/**
 * The EXACT shear `WallFragmentBuilder._applyRakeShearToChildren` builds
 * (`WallFragmentBuilder.ts:3315-3323`), reproduced rather than imported because the method is
 * private. ⚠ If that construction ever changes, this probe must be re-derived from it — it is a
 * copy of a mechanism, and the copy is what makes the assertion below meaningful.
 */
function rakeShear(k: number, dirX: number, dirZ: number, y0: number): THREE.Matrix4 {
    const L = Math.hypot(dirX, dirZ);
    const dx = dirX / L;
    const dz = dirZ / L;
    // leftPerp(d) = (−d.z, d.x)
    const sx = k * -dz;
    const sz = k * dx;
    return new THREE.Matrix4().set(
        1, sx, 0, -sx * y0,
        0, 1,  0, 0,
        0, sz, 1, -sz * y0,
        0, 0,  0, 1,
    );
}

/**
 * A wall element root whose body child carries the rake as a premultiplied shear — the scene
 * graph `WallFragmentBuilder` actually leaves behind for a raked wall.
 *
 * `bearing` rotates the wall in plan so the oblique case can be driven too.
 */
function rakedWallRoot(
    id: string,
    opts: { bearingDeg?: number; rakeDeg?: number | null; profileRing?: Array<[number, number]> } = {},
): THREE.Group {
    const bearing = ((opts.bearingDeg ?? 0) * Math.PI) / 180;
    const dirX = Math.cos(bearing);
    const dirZ = Math.sin(bearing);

    const group = new THREE.Group();

    // The body. A PROFILE is baked into the GEOMETRY (an authored elevation outline extruded
    // through the thickness); the RAKE is applied as a matrix on top. That asymmetry is the
    // whole point of the combined case.
    const geo = opts.profileRing
        ? _profiledBodyGeometry(opts.profileRing, WALL_T)
        : new THREE.BoxGeometry(WALL_LEN, WALL_H, WALL_T);
    if (!opts.profileRing) geo.translate(WALL_LEN / 2, WALL_H / 2, 0); // base at y=0, start at x=0

    const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    body.userData = { elementType: 'Wall', role: 'geometry' };
    body.rotation.y = -bearing;
    body.updateMatrix();
    group.add(body);

    const k = opts.rakeDeg == null ? 0 : 1 / Math.tan((opts.rakeDeg * Math.PI) / 180);
    if (k !== 0) {
        const S = rakeShear(k, dirX, dirZ, 0);
        for (const child of group.children) {
            child.updateMatrix();
            child.matrixAutoUpdate = false;
            child.matrix.premultiply(S);
            child.matrixWorldNeedsUpdate = true;
        }
        group.userData.rakeAngleDeg = opts.rakeDeg;
    }

    group.userData = { ...group.userData, id, elementType: 'Wall' };
    group.updateMatrixWorld(true);
    return group;
}

/** An authored elevation ring (u = along wall, v = height) extruded through `t`. */
function _profiledBodyGeometry(ring: Array<[number, number]>, t: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(ring[0]![0], ring[0]![1]);
    for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i]![0], ring[i]![1]);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
    geo.translate(0, 0, -t / 2);
    return geo;
}

/** A gable: 4 m long, 2 m at the shoulders, 3 m at the ridge. */
const GABLE_RING: Array<[number, number]> = [
    [0, 0], [WALL_LEN, 0], [WALL_LEN, 2], [WALL_LEN / 2, WALL_H], [0, 2],
];

// ─── Harness ─────────────────────────────────────────────────────────────────

function fakeBimManager(levels: Array<{ id: string; elevation: number; height: number; childrenIds: string[] }>) {
    return {
        getLevels: () => levels,
        getLevelById: (id: string) => levels.find(l => l.id === id),
    } as never;
}

/** A West elevation with NO explicit section volume — culls nothing, so the probe measures only
 *  the transform. (`scope=ABSENT` in the exporter's own log.) */
function westElevation(): never {
    return {
        id: 'vd-probe-elev-west',
        name: 'West Elevation',
        viewType: 'elevation',
        spatial: { projectionDirection: { x: 1, y: 0, z: 0 } },
    } as never;
}

/**
 * Export one root and return the proxy meshes the projector will read, alongside the SOURCE
 * meshes it should have been given.
 */
function exportProxies(root: THREE.Group): { proxies: THREE.Mesh[]; sources: THREE.Mesh[] } {
    const levels = [{ id: 'L0', elevation: 0, height: 3, childrenIds: [root.userData.id as string] }];
    elementRegistry.registerRoot(root.userData.id as string, root);
    const exporter = new NativeElementMeshExporter();
    exporter.setBimManager(fakeBimManager(levels));
    const groups = exporter.exportForView(westElevation());
    const proxies: THREE.Mesh[] = [];
    for (const g of groups) {
        g.updateMatrixWorld(true);
        g.traverse(o => { if ((o as THREE.Mesh).isMesh) proxies.push(o as THREE.Mesh); });
    }
    const sources: THREE.Mesh[] = [];
    root.updateMatrixWorld(true);
    root.traverse(o => { if ((o as THREE.Mesh).isMesh) sources.push(o as THREE.Mesh); });
    return { proxies, sources };
}

/** Every corner of a mesh's local AABB, taken to world through its `matrixWorld`. */
function worldCorners(mesh: THREE.Mesh): THREE.Vector3[] {
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox!;
    const out: THREE.Vector3[] = [];
    for (const x of [b.min.x, b.max.x]) {
        for (const y of [b.min.y, b.max.y]) {
            for (const z of [b.min.z, b.max.z]) {
                out.push(new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld));
            }
        }
    }
    return out;
}

/** THE MEASUREMENT THE FOUNDER IS LOOKING AT: the (h, v) silhouette on a West elevation sheet.
 *  West ⇒ view direction +X ⇒ h = (−n.z, 0, n.x) = (0,0,1), v = world +Y. */
function elevationHV(p: THREE.Vector3): { h: number; v: number } {
    return { h: p.z, v: p.y };
}

/** Worst corner error in metres between what the projector gets and what the model holds. */
function maxCornerError(proxies: THREE.Mesh[], sources: THREE.Mesh[]): number {
    expect(proxies.length).toBe(sources.length);
    let worst = 0;
    for (let i = 0; i < proxies.length; i++) {
        const a = worldCorners(proxies[i]!);
        const b = worldCorners(sources[i]!);
        for (let c = 0; c < a.length; c++) worst = Math.max(worst, a[c]!.distanceTo(b[c]!));
    }
    return worst;
}

/** Worst (h, v) error on the elevation sheet — the drawing's own units. */
function maxSheetError(proxies: THREE.Mesh[], sources: THREE.Mesh[]): number {
    let worst = 0;
    for (let i = 0; i < proxies.length; i++) {
        const a = worldCorners(proxies[i]!);
        const b = worldCorners(sources[i]!);
        for (let c = 0; c < a.length; c++) {
            const pa = elevationHV(a[c]!), pb = elevationHV(b[c]!);
            worst = Math.max(worst, Math.hypot(pa.h - pb.h, pa.v - pb.v));
        }
    }
    return worst;
}

/** Metres. Tighter than a drawn line width at any sheet scale; anything above this is visible. */
const TOL = 1e-6;

// ─── The four combinations the founder's case is made of ─────────────────────

describe('§ELEV-SHEAR-SURVIVES-THE-PROXY — what actually reaches EdgeProjectorService', () => {
    beforeEach(() => elementRegistry.clear());

    it('CONTROL — a PLAIN wall reaches the projector exactly (the feed is not broken in general)', () => {
        const { proxies, sources } = exportProxies(rakedWallRoot('w-plain', { rakeDeg: null }));
        expect(proxies.length).toBeGreaterThan(0);
        expect(maxCornerError(proxies, sources)).toBeLessThan(TOL);
    });

    it('CONTROL — a PROFILE-EDITED-ONLY wall reaches the projector exactly (profile is in the GEOMETRY, and geometry is shared by reference)', () => {
        const { proxies, sources } = exportProxies(
            rakedWallRoot('w-profile', { rakeDeg: null, profileRing: GABLE_RING }),
        );
        expect(proxies.length).toBeGreaterThan(0);
        expect(maxCornerError(proxies, sources)).toBeLessThan(TOL);
    });

    it('RAKED-ONLY — the shear must survive the proxy (RED before the fix)', () => {
        const { proxies, sources } = exportProxies(rakedWallRoot('w-rake', { rakeDeg: RAKE_DEG }));
        expect(proxies.length).toBeGreaterThan(0);
        expect(maxCornerError(proxies, sources)).toBeLessThan(TOL);
    });

    it('RAKED + PROFILE-EDITED — THE FOUNDER’S OWN CASE (RED before the fix)', () => {
        const { proxies, sources } = exportProxies(
            rakedWallRoot('w-rake-profile', { rakeDeg: RAKE_DEG, profileRing: GABLE_RING }),
        );
        expect(proxies.length).toBeGreaterThan(0);
        expect(maxCornerError(proxies, sources)).toBeLessThan(TOL);
    });

    it('RAKED + PROFILE + OBLIQUE BEARING — the sheet silhouette must match the model’s', () => {
        const { proxies, sources } = exportProxies(
            rakedWallRoot('w-oblique', { rakeDeg: RAKE_DEG, bearingDeg: 20, profileRing: GABLE_RING }),
        );
        expect(proxies.length).toBeGreaterThan(0);
        // ⭐ Asserted on the SHEET, not on the mesh — E of the brief. A test that asserts the
        // 3-D mesh is right proves nothing about this bug, because the 3-D was already right.
        expect(maxSheetError(proxies, sources)).toBeLessThan(TOL);
    });

    it('RAKED + PROFILE + AN OPENING — a hosted void is carried through with the same transform', () => {
        // The opening's own mesh is a separate child of the same root; it rides the SAME shear.
        const root = rakedWallRoot('w-rake-profile-op', { rakeDeg: RAKE_DEG, profileRing: GABLE_RING });
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, WALL_T), new THREE.MeshBasicMaterial());
        leaf.position.set(1.5, 1.05, 0);
        leaf.userData = { elementType: 'Window' };
        leaf.updateMatrix();
        leaf.matrixAutoUpdate = false;
        leaf.matrix.premultiply(rakeShear(K, 1, 0, 0));
        root.add(leaf);
        root.updateMatrixWorld(true);

        const { proxies, sources } = exportProxies(root);
        expect(proxies.length).toBe(2);
        expect(maxSheetError(proxies, sources)).toBeLessThan(TOL);
    });

    // ── THE SIBLING VIEWS (D of the brief) ───────────────────────────────────
    //
    // ⭐ ONE FEEDER, THREE VIEWS. `exportForView` is the SINGLE producer of native geometry for
    // every 2-D view (`initScene.ts:1345` / `:1399` for plan, `ViewController.ts:675` / `:2280`
    // for section and elevation) — so a wall wrong in elevation was wrong in section and in plan
    // by the same 0.413 m. Asserted per view rather than argued from the shared call site,
    // because "they share a feeder" is exactly the kind of claim that stops being true quietly.

    function exportProxiesFor(root: THREE.Group, viewDef: never): { proxies: THREE.Mesh[]; sources: THREE.Mesh[] } {
        const levels = [{ id: 'L0', elevation: 0, height: 3, childrenIds: [root.userData.id as string] }];
        elementRegistry.registerRoot(root.userData.id as string, root);
        const exporter = new NativeElementMeshExporter();
        exporter.setBimManager(fakeBimManager(levels));
        const groups = exporter.exportForView(viewDef);
        const proxies: THREE.Mesh[] = [];
        for (const g of groups) {
            g.updateMatrixWorld(true);
            g.traverse(o => { if ((o as THREE.Mesh).isMesh) proxies.push(o as THREE.Mesh); });
        }
        const sources: THREE.Mesh[] = [];
        root.updateMatrixWorld(true);
        root.traverse(o => { if ((o as THREE.Mesh).isMesh) sources.push(o as THREE.Mesh); });
        return { proxies, sources };
    }

    it('SECTION — the same wall reaches the section feed undistorted', () => {
        const { proxies, sources } = exportProxiesFor(
            rakedWallRoot('w-sec', { rakeDeg: RAKE_DEG, bearingDeg: 20, profileRing: GABLE_RING }),
            { id: 'vd-probe-section', name: 'Section 1', viewType: 'section',
              spatial: { projectionDirection: { x: 0, y: 0, z: -1 } } } as never,
        );
        expect(proxies.length).toBeGreaterThan(0);
        expect(maxCornerError(proxies, sources)).toBeLessThan(TOL);
    });

    it('PLAN — the same wall reaches the plan feed undistorted', () => {
        // ⚠ A raked wall's plan is DELIBERATELY its un-sheared BASE footprint (ADR-0310 §2.3,
        // `WallRake.ts:212`). That is a decision made downstream of here, on correct geometry.
        // What this pins is that the feed does not distort the solid BEFORE that decision — a
        // corrupted transform moved the base outline too.
        const { proxies, sources } = exportProxiesFor(
            rakedWallRoot('w-plan', { rakeDeg: RAKE_DEG, bearingDeg: 20, profileRing: GABLE_RING }),
            { id: 'vd-probe-plan', name: 'Level 0 Plan', viewType: 'floorPlan',
              spatial: { levelId: 'L0', projectionDirection: { x: 0, y: -1, z: 0 } } } as never,
        );
        expect(proxies.length).toBeGreaterThan(0);
        expect(maxCornerError(proxies, sources)).toBeLessThan(TOL);
    });

    it('THE CACHE MUST NOT RE-INTRODUCE IT — the second export of the same element is identical to the first', () => {
        // §H.2 stores a DESCRIPTOR per proxy and rebuilds from it on the next pass. A descriptor
        // that can only hold position/quaternion/scale would silently restore the T·R·S bug on
        // every cache HIT even after the miss path was fixed — so both paths are pinned.
        const root = rakedWallRoot('w-cached', { rakeDeg: RAKE_DEG, profileRing: GABLE_RING });
        const levels = [{ id: 'L0', elevation: 0, height: 3, childrenIds: ['w-cached'] }];
        elementRegistry.registerRoot('w-cached', root);
        const exporter = new NativeElementMeshExporter();
        exporter.setBimManager(fakeBimManager(levels));

        const first = exporter.exportForView(westElevation());   // MISS
        first.forEach(g => g.updateMatrixWorld(true));
        const firstM = first.flatMap(g => { const o: THREE.Matrix4[] = []; g.traverse(c => { if ((c as THREE.Mesh).isMesh) o.push(c.matrixWorld.clone()); }); return o; });

        const second = exporter.exportForView(westElevation());  // HIT
        second.forEach(g => g.updateMatrixWorld(true));
        const secondM = second.flatMap(g => { const o: THREE.Matrix4[] = []; g.traverse(c => { if ((c as THREE.Mesh).isMesh) o.push(c.matrixWorld.clone()); }); return o; });

        expect(secondM.length).toBe(firstM.length);
        for (let i = 0; i < firstM.length; i++) {
            for (let e = 0; e < 16; e++) {
                expect(Math.abs(secondM[i]!.elements[e]! - firstM[i]!.elements[e]!)).toBeLessThan(TOL);
            }
        }
    });
});
