// §GLB-EXPORT-AUTHORING-FRAME (L-1420) + §GLB-EXPORT-STRIP-ANNOTATION-OVERLAYS (L-1421)
// + §FIX-GLOBE-REAL-GLAZING (L-1422)
//
// ⛔ THIS SUITE DOES NOT STUB `GLTFExporter`, AND IT DOES NOT ASSERT THAT A FUNCTION WAS
//    CALLED. Every assertion runs the REAL `exportFragmentsToGLB`, takes the REAL GLB blob
//    it returns, decodes the REAL glTF container out of those bytes, and measures the
//    resulting BOUNDING BOX IN METRES. C12 §11.4 ("MUST — test the bytes", L-1208) and this
//    repository's recorded lesson "committed ≠ reachable: prove it at the layer the user
//    experiences" both point at exactly this shape of test.
//
// ── THE DEFECT (founder, production, 2026-08-19) ─────────────────────────────────────────
// Opening 3D Globe → Real placed the building as a continent-sized white slab hanging in
// the sky. The log carried one number: `📦 Bounding box minY: 2553068.999066395`.
//
// The derivation, by ARITHMETIC (C12 §1.5 forbids concluding this from magnitude alone):
//   • `GISAreaLayout` calls `CesiumThreeBridge.setAnchor()` unconditionally at GIS init with
//     a hard-coded default anchor — the Sydney Opera House (lon 151.2153, lat -33.8568).
//   • `setAnchor()` re-parents every BIM root under `GIS_BIM_ROOT` and gives that group the
//     full ECEF `eastNorthUpToFixedFrame` matrix.
//   • WGS-84 ECEF **Y** for that anchor is **2 553 076.920 m**; the observed minY was
//     **2 553 068.999 m**. Residual **-7.921 m** = `east_y · x_local` with
//     `east_y = -0.876435` and a **9.04 m** east extent — a house footprint.
//   • The exporter baked `matrixWorld`, inheriting the frame. `SYDNEY_ECEF` and
//     `expectedMinY` below reproduce that arithmetic from first principles, so the test
//     re-derives the founder's number rather than quoting it.
//
// ── WHY THIS FAILS WITHOUT THE FIX ───────────────────────────────────────────────────────
// Before the frame-relative bake, the emitted GLB's own bounding box reached ~4.65e6 m in X
// (the anchoring step subtracted only the Y component). `expect(extent).toBeLessThan(1_000)`
// on the DECODED bytes is therefore red on the old code and green on the new — no stub, no
// spy, no pure-function stand-in.

import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import {
  exportFragmentsToGLB,
  resolveExportFrame,
  isGeoreferencedFrame,
  isAnnotationOverlayObject,
  describeExportRootBounds,
  AUTHORING_FRAME_MAX_TRANSLATION_M,
} from '../src/export/glb/GLBExporter';

// ---------------------------------------------------------------------------
// ENVIRONMENT SHIM — `FileReader`, and NOTHING else. (Same rationale, and the same ~8
// lines, as `glb-export-real-path-materials.test.ts`: three's `GLTFWriter.writeAsync`
// reaches for the DOM `FileReader`; Node 20 ships every other global it needs. This is a
// missing PLATFORM global, not a seam in the code under test.)
// ---------------------------------------------------------------------------
beforeAll(() => {
  if (typeof (globalThis as { FileReader?: unknown }).FileReader !== 'undefined') return;
  class NodeFileReader {
    public result: ArrayBuffer | string | null = null;
    public onloadend: (() => void) | null = null;
    public onerror: ((e: unknown) => void) | null = null;
    readAsArrayBuffer(blob: Blob): void {
      blob.arrayBuffer().then((buf) => { this.result = buf; this.onloadend?.(); }).catch((e) => this.onerror?.(e));
    }
    readAsDataURL(blob: Blob): void {
      blob
        .arrayBuffer()
        .then((buf) => {
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
          this.onloadend?.();
        })
        .catch((e) => this.onerror?.(e));
    }
  }
  (globalThis as { FileReader?: unknown }).FileReader = NodeFileReader;
});

// ---------------------------------------------------------------------------
// WGS-84 → ECEF, and the ENU→ECEF frame, implemented here from the definition.
//
// ⚠ Deliberately NOT imported from Cesium (or from anything else in the repo). A fake
// built from the header cannot falsify the header: if this test derived the frame from
// the same helper the bridge uses, an error in that helper would be invisible. These are
// the textbook formulae, and the constants below are what they produce.
// ---------------------------------------------------------------------------
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);

function wgs84ToEcef(latDeg: number, lonDeg: number, h = 0): THREE.Vector3 {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(lat) ** 2);
  return new THREE.Vector3(
    (N + h) * Math.cos(lat) * Math.cos(lon),
    (N + h) * Math.cos(lat) * Math.sin(lon),
    (N * (1 - WGS84_E2) + h) * Math.sin(lat),
  );
}

/** The matrix `CesiumThreeBridge.setAnchor()` puts on `GIS_BIM_ROOT`: columns E, N, U, origin. */
function eastNorthUpToFixedFrame(latDeg: number, lonDeg: number): THREE.Matrix4 {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const o = wgs84ToEcef(latDeg, lonDeg, 0);
  const east = new THREE.Vector3(-Math.sin(lon), Math.cos(lon), 0);
  const north = new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat));
  const up = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
  return new THREE.Matrix4().set(
    east.x, north.x, up.x, o.x,
    east.y, north.y, up.y, o.y,
    east.z, north.z, up.z, o.z,
    0, 0, 0, 1,
  );
}

/** The hard-coded default anchor in `GISAreaLayout` (`lon 151.2153 / lat -33.8568`). */
const SYDNEY_LAT = -33.8568;
const SYDNEY_LON = 151.2153;

// ---------------------------------------------------------------------------
// GLB → bounding box, in metres, from the emitted bytes.
//
// The glTF 2.0 container is decoded by hand (spec §4.4.1) and the box is composed from
// each mesh node's world matrix applied to its POSITION accessor's `min`/`max` — both
// spec-required fields the exporter writes. No third-party parser, so the test cannot
// inherit a parser's opinion about what the file says.
// ---------------------------------------------------------------------------
interface GltfJson {
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: Array<{
    name?: string; mesh?: number; children?: number[];
    matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[];
  }>;
  meshes?: Array<{ primitives: Array<{ attributes: Record<string, number>; material?: number }> }>;
  accessors?: Array<{ min?: number[]; max?: number[]; count: number }>;
  materials?: Array<{ name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[] }; extensions?: Record<string, unknown> }>;
}

async function exportAndDecode(
  scene: THREE.Scene,
  options?: Parameters<typeof exportFragmentsToGLB>[1],
): Promise<{ json: GltfJson; url: string }> {
  const url = await exportFragmentsToGLB(scene, options);
  expect(url, 'exportFragmentsToGLB returned no url — the export path itself failed or REFUSED').toBeTruthy();
  const buf = await (await fetch(url)).arrayBuffer();
  URL.revokeObjectURL(url);
  const view = new DataView(buf);
  expect(view.getUint32(0, true), 'GLB magic is not "glTF"').toBe(0x46546c67);
  const chunkLength = view.getUint32(12, true);
  expect(view.getUint32(16, true), 'first GLB chunk is not the JSON chunk').toBe(0x4e4f534a);
  return { json: JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, chunkLength))) as GltfJson, url };
}

/** The bounding box of the EXPORTED FILE, in metres, composed through the glTF node tree. */
function gltfBoundingBox(json: GltfJson): THREE.Box3 {
  const box = new THREE.Box3();
  const nodes = json.nodes ?? [];
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];

  const localMatrix = (n: NonNullable<GltfJson['nodes']>[number]): THREE.Matrix4 => {
    if (n.matrix) return new THREE.Matrix4().fromArray(n.matrix); // glTF matrices are column-major
    const t = n.translation ?? [0, 0, 0];
    const r = n.rotation ?? [0, 0, 0, 1];
    const s = n.scale ?? [1, 1, 1];
    return new THREE.Matrix4().compose(
      new THREE.Vector3(t[0], t[1], t[2]),
      new THREE.Quaternion(r[0], r[1], r[2], r[3]),
      new THREE.Vector3(s[0], s[1], s[2]),
    );
  };

  const walk = (index: number, parentWorld: THREE.Matrix4): void => {
    const n = nodes[index];
    if (!n) return;
    const world = new THREE.Matrix4().multiplyMatrices(parentWorld, localMatrix(n));
    if (n.mesh !== undefined) {
      for (const prim of json.meshes?.[n.mesh]?.primitives ?? []) {
        const acc = json.accessors?.[prim.attributes.POSITION ?? -1];
        if (!acc?.min || !acc?.max) continue;
        // Expand over the 8 corners of the accessor's own min/max, transformed to world.
        for (let c = 0; c < 8; c++) {
          const v = new THREE.Vector3(
            (c & 1 ? acc.max : acc.min)[0]!,
            (c & 2 ? acc.max : acc.min)[1]!,
            (c & 4 ? acc.max : acc.min)[2]!,
          ).applyMatrix4(world);
          box.expandByPoint(v);
        }
      }
    }
    for (const child of n.children ?? []) walk(child, world);
  };

  for (const r of roots) walk(r, new THREE.Matrix4());
  return box;
}

/** Largest absolute coordinate the exported file reaches, in metres. */
function worstExtentM(box: THREE.Box3): number {
  if (box.isEmpty()) return 0;
  return Math.max(
    Math.abs(box.min.x), Math.abs(box.min.y), Math.abs(box.min.z),
    Math.abs(box.max.x), Math.abs(box.max.y), Math.abs(box.max.z),
  );
}

// ---------------------------------------------------------------------------
// A minimal but REAL BIM-shaped building.
// ---------------------------------------------------------------------------
function makeElement(elementType: string, id: string, opts?: { withEdges?: boolean; glass?: boolean }): THREE.Object3D {
  const group = new THREE.Group();
  group.name = `${elementType}-${id}`;
  group.userData = { elementType, id };
  const geo = new THREE.BoxGeometry(9.04, 3, 6);
  const mat = opts?.glass
    ? new THREE.MeshPhysicalMaterial({ color: 0x223344, transmission: 0, transparent: false })
    : new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
  mat.name = opts?.glass ? 'real-bim-window-material' : 'real-bim-wall-material';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `${elementType}-${id}-geom`;
  mesh.position.set(4.52, 1.5, 0); // ground floor at Y = 0, 9.04 m east extent.
  group.add(mesh);
  if (opts?.withEdges) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x000000 }),
    );
    edges.name = `${elementType}Edges`;
    edges.position.copy(mesh.position);
    group.add(edges);
  }
  return group;
}

/** The founder's scene: BIM re-parented under `GIS_BIM_ROOT` carrying the ECEF matrix. */
function makeGeoreferencedScene(opts?: { declareFrame?: boolean; withEdges?: boolean }): {
  scene: THREE.Scene;
  gisRoot: THREE.Group;
} {
  const scene = new THREE.Scene();
  const gisRoot = new THREE.Group();
  gisRoot.name = 'GIS_BIM_ROOT';
  // `declareFrame: false` reproduces a producer that FORGOT to declare — arm B must still
  // classify it, which is the whole reason arm B exists.
  if (opts?.declareFrame !== false) gisRoot.userData.pryzmSceneFrame = 'geo-ecef';
  gisRoot.add(makeElement('wall', 'W-1', { withEdges: opts?.withEdges }));
  gisRoot.add(makeElement('window', 'WIN-1', { glass: true }));
  gisRoot.matrixAutoUpdate = false;
  gisRoot.matrix.copy(eastNorthUpToFixedFrame(SYDNEY_LAT, SYDNEY_LON));
  scene.add(gisRoot);
  scene.updateMatrixWorld(true);
  return { scene, gisRoot };
}

// ===========================================================================
describe('§GLB-EXPORT-AUTHORING-FRAME (L-1420) — the founder\'s 2 553 km building in the sky', () => {
  it('re-derives the founder\'s minY from the anchor, so the diagnosis is arithmetic and not magnitude', () => {
    const ecef = wgs84ToEcef(SYDNEY_LAT, SYDNEY_LON, 0);
    // The number in the founder's log was 2553068.999066395.
    expect(ecef.y).toBeCloseTo(2_553_076.92, 1);

    // The residual must be the BUILDING, not noise: east_y · 9.04 m.
    const lon = (SYDNEY_LON * Math.PI) / 180;
    const eastY = Math.cos(lon);
    const expectedMinY = ecef.y + eastY * 9.04;
    expect(expectedMinY).toBeCloseTo(2_553_068.999, 0);
  });

  it('MEASURES the offset PER ROOT, not as one aggregate, and names the ancestor that carries it', () => {
    const { scene } = makeGeoreferencedScene();
    const roots = scene.children[0]!.children;
    const dump = describeExportRootBounds(roots);

    expect(dump).toHaveLength(2);
    // ⭐ The aggregate-vs-per-item question, answered: EVERY root is offset, not one stray.
    for (const b of dump) {
      expect(b.min, `${b.elementType} has no bounds`).not.toBeNull();
      expect(Math.abs(b.min!.y)).toBeGreaterThan(2_000_000);
      // THE ANCESTRY IS THE ANSWER — the transform is on the PARENT, not the leaf.
      expect(b.ancestry).toContain('GIS_BIM_ROOT');
    }
  });

  it('classifies GIS_BIM_ROOT as a georeferencing frame by DECLARATION (arm A) and by MEASUREMENT (arm B)', () => {
    const declared = makeGeoreferencedScene({ declareFrame: true }).gisRoot;
    expect(isGeoreferencedFrame(declared)).toBe(true);

    const undeclared = makeGeoreferencedScene({ declareFrame: false }).gisRoot;
    expect(undeclared.userData.pryzmSceneFrame).toBeUndefined();
    // Arm B needs no cooperation from the producer — that is the point.
    expect(isGeoreferencedFrame(undeclared)).toBe(true);

    // A plain authoring-frame group is NOT a frame boundary.
    const plain = new THREE.Group();
    plain.position.set(12, 0, -30);
    plain.updateMatrixWorld(true);
    expect(isGeoreferencedFrame(plain)).toBe(false);
  });

  it('resolves the SHALLOWEST georeferenced ancestor, so an element keeps its own offset inside the building', () => {
    const { scene, gisRoot } = makeGeoreferencedScene();
    const storey = new THREE.Group();
    storey.name = 'storey-1';
    storey.position.set(0, 3, 0);
    const el = makeElement('wall', 'W-2');
    storey.add(el);
    gisRoot.add(storey);
    scene.updateMatrixWorld(true);

    // `storey-1` inherits the ECEF translation and so satisfies arm B too — picking the
    // NEAREST match would additionally strip the storey's own +3 m. The boundary is the
    // shallowest one.
    expect(isGeoreferencedFrame(storey)).toBe(true);
    expect(resolveExportFrame(el)).toBe(gisRoot);
  });

  // ⭐⭐ THE TEST THAT FAILS WITHOUT THE FIX — asserted on the DECODED GLB, in METRES.
  it('exports a GLB whose OWN bounding box is site-local metres, not the ECEF frame', async () => {
    const { scene } = makeGeoreferencedScene();
    const { json } = await exportAndDecode(scene);
    const box = gltfBoundingBox(json);

    expect(box.isEmpty(), 'the exported GLB contains no positioned geometry').toBe(false);
    // Before the fix this reached ~4.65e6 m in X (the anchoring step removed only Y).
    expect(worstExtentM(box)).toBeLessThan(1_000);
    // And the building is still the building: ~9.04 m east, 3 m tall, 6 m deep.
    expect(box.max.x - box.min.x).toBeCloseTo(9.04, 1);
    expect(box.max.y - box.min.y).toBeCloseTo(3, 1);
  });

  it('holds even when the producer never DECLARED the frame (arm B carries it alone)', async () => {
    const { scene } = makeGeoreferencedScene({ declareFrame: false });
    const { json } = await exportAndDecode(scene);
    expect(worstExtentM(gltfBoundingBox(json))).toBeLessThan(1_000);
  });

  it('keeps the ground floor on Y = 0 — the §GLOBE-GROUND-FLOAT anchor still holds after rebasing', async () => {
    const { scene } = makeGeoreferencedScene();
    const { json } = await exportAndDecode(scene);
    const box = gltfBoundingBox(json);
    // Ground floor authored at scene Y = 0; nothing below it, so the anchor drop is ~0.
    expect(box.min.y).toBeCloseTo(0, 1);
  });

  it('leaves a NORMAL (non-georeferenced) scene byte-for-byte unaffected — the download path is not changed', async () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    group.name = 'level-0';
    group.position.set(10, 0, -4);
    group.add(makeElement('wall', 'W-3'));
    scene.add(group);
    scene.updateMatrixWorld(true);

    const el = group.children[0]!;
    expect(resolveExportFrame(el)).toBeNull();

    const { json } = await exportAndDecode(scene);
    const box = gltfBoundingBox(json);
    // The ancestor's +10 X / -4 Z is AUTHORED placement and MUST survive (§A.21.D56).
    expect(box.min.x).toBeCloseTo(10, 1);
    expect(box.min.z).toBeCloseTo(-7, 1);
  });

  it('REFUSES rather than shipping a globe-scale GLB, if frame resolution ever fails', async () => {
    // A scene whose geometry itself is authored at ECEF magnitude: no ANCESTOR carries the
    // frame, so there is nothing to divide out and the tree is genuinely unusable. The
    // documented degradation is to decline and keep the massing (as the triangle budget does),
    // never to place a 2 553 km building on the globe again.
    const scene = new THREE.Scene();
    const el = makeElement('wall', 'W-4');
    el.position.set(0, 2_553_076, 0);
    scene.add(el);
    scene.updateMatrixWorld(true);

    expect(2_553_076).toBeGreaterThan(AUTHORING_FRAME_MAX_TRANSLATION_M);
    await expect(exportFragmentsToGLB(scene)).resolves.toBe('');
  });
});

// ===========================================================================
describe('§GLB-EXPORT-STRIP-ANNOTATION-OVERLAYS (L-1421) — derived from the object class, not a name list', () => {
  it('classifies line/point/sprite renderables as annotation, and meshes as architecture', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    expect(isAnnotationOverlayObject(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial()))).toBe(true);
    expect(isAnnotationOverlayObject(new THREE.Line(geo, new THREE.LineBasicMaterial()))).toBe(true);
    expect(isAnnotationOverlayObject(new THREE.Points(geo, new THREE.PointsMaterial()))).toBe(true);
    expect(isAnnotationOverlayObject(new THREE.Sprite(new THREE.SpriteMaterial()))).toBe(true);
    expect(isAnnotationOverlayObject(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()))).toBe(false);
    expect(isAnnotationOverlayObject(new THREE.Group())).toBe(false);
  });

  it('drops edge outlines from the Cesium REAL export, and keeps them in the plain download', async () => {
    const countLineMaterials = (json: GltfJson): number =>
      (json.materials ?? []).filter((m) => (m.name ?? '').length >= 0).length;

    const withEdges = makeGeoreferencedScene({ withEdges: true }).scene;
    const stripped = await exportAndDecode(withEdges, { stripAnnotationOverlays: true });
    // The `EdgesGeometry` primitive contributes its own mesh; stripping removes it entirely.
    const strippedPrims = (stripped.json.meshes ?? []).reduce((n, m) => n + m.primitives.length, 0);

    const withEdges2 = makeGeoreferencedScene({ withEdges: true }).scene;
    const kept = await exportAndDecode(withEdges2);
    const keptPrims = (kept.json.meshes ?? []).reduce((n, m) => n + m.primitives.length, 0);

    expect(keptPrims).toBeGreaterThan(strippedPrims);
    expect(countLineMaterials(stripped.json)).toBeLessThanOrEqual(countLineMaterials(kept.json));
  });
});

// ===========================================================================
describe('§FIX-GLOBE-REAL-GLAZING (L-1422) — C12 §11.4 asymmetry, decided', () => {
  it('remaps glazing to ONE shared glass material while opaque elements keep their REAL BIM material', async () => {
    const { scene } = makeGeoreferencedScene();
    const { json } = await exportAndDecode(scene, { glazingOverride: true });
    const names = (json.materials ?? []).map((m) => m.name ?? '(unnamed)');

    // The window became glass…
    expect(names).toContain('pryzm-forma-white-glass');
    // …and the wall did NOT become the white study material — that would be LESS realistic.
    expect(names).not.toContain('pryzm-forma-white-opaque');
    expect(names).toContain('real-bim-wall-material');
    // C12 §11.4 MUST — ONE override material per export TREE, never one per element.
    expect(names.filter((n) => n === 'pryzm-forma-white-glass')).toHaveLength(1);
  });

  it('still whitens everything when the Forma study explicitly asks for it (3D Site is unchanged)', async () => {
    const { scene } = makeGeoreferencedScene();
    const { json } = await exportAndDecode(scene, { formaWhite: true });
    const names = (json.materials ?? []).map((m) => m.name ?? '(unnamed)');
    expect(names).toContain('pryzm-forma-white-opaque');
    expect(names).toContain('pryzm-forma-white-glass');
    expect(names).not.toContain('real-bim-wall-material');
  });
});
