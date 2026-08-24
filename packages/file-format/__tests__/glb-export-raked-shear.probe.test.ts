// §GLB-SHEAR-SURVIVES-THE-EXPORT (L-10142) — A RAKE IS A SHEAR, AND `Matrix4.decompose`
// CANNOT CARRY ONE. The GLB the Cesium 3D-Site / 3D-Globe "Real" mode renders is produced
// by `exportFragmentsToGLB`, and `cloneWithBakedWorldTransform` used to seat every export
// root with `clone.matrix.decompose(clone.position, clone.quaternion, clone.scale)`.
//
// ── PROVENANCE ───────────────────────────────────────────────────────────────────────────
// Lane ELEV14 (commit 4c1af611) fixed the IDENTICAL root in `NativeElementMeshExporter`,
// the 2-D feed for plan/section/elevation, and logged this consumer as OPEN and UNMEASURED:
//
//     L-10142 — "GLBExporter decomposes the same way, so a raked wall would EXPORT as the
//                wrong solid."
//
// This suite is the measurement. The founder then reported it from the other end: 3D Site →
// Real, "windows in 3D Site view hosted on a raked, edited-profile wall don't display good",
// with panes visibly floating off and skewed at an angle the wall does not have.
//
// ── ⛔ THIS SUITE DOES NOT ASSERT AGAINST A MATRIX ────────────────────────────────────────
// ELEV14's own defect survived unit tests of exactly that shape. Every number below runs the
// REAL `exportFragmentsToGLB`, decodes the REAL GLB bytes it returns (JSON chunk + BIN
// chunk, by hand, glTF 2.0 §4.4.1), reads the REAL `POSITION` accessor floats, composes the
// REAL glTF node tree, and compares EXPORTED WORLD VERTICES against the AUTHORED WORLD
// VERTICES in the live THREE scene. Metres, at the layer the founder looks at.
//
// ── ⛔ THE BUILDERS ARE MIRRORED, NEVER IMPORTED ──────────────────────────────────────────
// `rakeShearPerMetre`, `_applyRakeShearToChildren` and the WindowBuilder/DoorBuilder leaf
// shear are re-implemented here from their definitions. A fake built from the header cannot
// falsify the header: importing `@pryzm/geometry-wall` would make an error in the shear
// invisible to this test, because both sides would carry it. The matrices below are copied
// element-for-element from:
//   • `WallFragmentBuilder._applyRakeShearToChildren`  (WallFragmentBuilder.ts:3302-3331)
//   • `WindowBuilder` §RAKE-HOSTED-OPENING             (WindowBuilder.ts:1240-1252)
//   • `DoorBuilder`   §RAKE-HOSTED-OPENING             (DoorBuilder.ts:786-798)
//   • `WallRake.rakeShearPerMetre` / `rakeTopOffset`   (WallRake.ts:267-300)
//
// ── ⭐ THE CONTROLS ARE THE FINDING ───────────────────────────────────────────────────────
// A PROFILE lives in the GEOMETRY, and `clone(true)` passes geometry BY REFERENCE, so it was
// never at risk — exactly as ELEV14 measured for the 2-D feed. A rake on the WALL BODY lives
// on the wall group's CHILDREN, which `Object3D.copy` carries whole (`matrix`,
// `matrixWorld`, `matrixAutoUpdate` — Object3D.js:1601-1607), so it was not at risk either.
// ONLY A SHEAR SEATED ON AN EXPORT **ROOT** BROKE — and the only elements that carry one
// there are the HOSTED LEAVES: windows and doors. Had this probe measured the founder's
// screenshot alone, "raked walls export wrong" would have been the conclusion and the wall
// half fixed for nothing.

import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { exportFragmentsToGLB, SCENE_FRAME_USERDATA_KEY } from '../src/export/glb/GLBExporter';

// ---------------------------------------------------------------------------
// ENVIRONMENT SHIM — `FileReader`, and NOTHING else. (Identical rationale and the same ~20
// lines as `glb-export-authoring-frame.test.ts`: three's `GLTFWriter.writeAsync` reaches for
// the DOM `FileReader`; Node 20 ships every other global it needs. A missing PLATFORM
// global, not a seam in the code under test.)
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

// ═══════════════════════════════════════════════════════════════════════════════════════
// THE REAL RAKE MATHS, RE-DERIVED (see the header — deliberately NOT imported).
// ═══════════════════════════════════════════════════════════════════════════════════════

const DEG2RAD = Math.PI / 180;

/** `WallRake.rakeShearPerMetre` — `cot(rake)`, the signed multiplier on the LEFT normal. */
function rakeShearPerMetre(rakeAngleDeg: number): number {
  const r = rakeAngleDeg * DEG2RAD;
  const s = Math.sin(r);
  if (Math.abs(s) < 1e-12) return 0;
  return Math.cos(r) / s;
}

/**
 * `WallFragmentBuilder._applyRakeShearToChildren` — the WORLD shear about `y = baseOffset`,
 * premultiplied onto each CHILD of the wall group. `leftPerp(d) = (−d.z, d.x)`.
 */
function applyRakeShearToChildren(
  wallGroup: THREE.Group,
  k: number,
  direction: { x: number; z: number },
  baseOffset: number,
): void {
  if (k === 0) return;
  const L = Math.hypot(direction.x, direction.z);
  const dx = direction.x / L;
  const dz = direction.z / L;
  const sx = k * -dz;
  const sz = k * dx;
  const y0 = baseOffset;
  const S = new THREE.Matrix4().set(
    1, sx, 0, -sx * y0,
    0, 1, 0, 0,
    0, sz, 1, -sz * y0,
    0, 0, 0, 1,
  );
  for (const child of wallGroup.children) {
    child.updateMatrix();
    child.matrixAutoUpdate = false;
    child.matrix.premultiply(S);
    child.matrixWorldNeedsUpdate = true;
  }
  wallGroup.updateMatrixWorld(true);
}

/**
 * `WallRake.rakeTopOffset` — the horizontal offset of a station at `rise` above the wall
 * base, along `leftPerp(direction)`.
 */
function rakeTopOffset(k: number, rise: number, direction: { x: number; z: number }): { x: number; z: number } {
  const L = Math.hypot(direction.x, direction.z);
  const dx = direction.x / L;
  const dz = direction.z / L;
  // leftPerp(d) = (−d.z, d.x)
  return { x: k * rise * -dz, z: k * rise * dx };
}

/**
 * `WindowBuilder`/`DoorBuilder` §RAKE-HOSTED-OPENING — the leaf leans with the wall. In the
 * group's LOCAL frame (+X along the wall, +Z on `leftPerp` after `rotationY`) the lean is
 * the one-element shear `z ↦ z + k·y`, written straight onto `matrix` with
 * `matrixAutoUpdate` disabled because a shear has no TRS decomposition.
 *
 * ⭐ THIS GROUP IS AN EXPORT **ROOT** (`WindowBuilder.ts:979` — `this.scene.add(group)`, and
 * `:806` stamps `userData.elementType = 'Window'`). That is the whole defect: the shear sits
 * on the very node `cloneWithBakedWorldTransform` used to decompose.
 */
function applyHostedLeafShear(group: THREE.Object3D, k: number): void {
  if (k === 0) return;
  group.updateMatrix();
  group.matrixAutoUpdate = false;
  group.matrix.multiply(new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, k, 1, 0,
    0, 0, 0, 1,
  ));
  group.matrixWorldNeedsUpdate = true;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// GLB → EXPORTED WORLD VERTICES, from the emitted bytes. No third-party parser, so the test
// cannot inherit a parser's opinion about what the file says.
// ═══════════════════════════════════════════════════════════════════════════════════════

interface GltfJson {
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: Array<{
    name?: string; mesh?: number; children?: number[];
    matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[];
  }>;
  meshes?: Array<{ primitives: Array<{ attributes: Record<string, number> }> }>;
  accessors?: Array<{ bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }>;
  bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }>;
}

interface DecodedGlb {
  json: GltfJson;
  bin: DataView;
  /** True when at least one node carried the 16-float `matrix` form rather than T/R/S. */
  usedMatrixNodeForm: boolean;
}

async function exportAndDecode(
  scene: THREE.Scene,
  options?: Parameters<typeof exportFragmentsToGLB>[1],
): Promise<DecodedGlb> {
  const url = await exportFragmentsToGLB(scene, options);
  expect(url, 'exportFragmentsToGLB returned no url — the export path itself failed or REFUSED').toBeTruthy();
  const buf = await (await fetch(url)).arrayBuffer();
  URL.revokeObjectURL(url);

  const view = new DataView(buf);
  expect(view.getUint32(0, true), 'GLB magic is not "glTF"').toBe(0x46546c67);
  const jsonLength = view.getUint32(12, true);
  expect(view.getUint32(16, true), 'first GLB chunk is not the JSON chunk').toBe(0x4e4f534a);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLength))) as GltfJson;

  // Second chunk: BIN (glTF 2.0 §4.4.1 — 4-byte length, 4-byte type, then payload).
  const binHeaderOffset = 20 + jsonLength;
  const binLength = view.getUint32(binHeaderOffset, true);
  expect(view.getUint32(binHeaderOffset + 4, true), 'second GLB chunk is not the BIN chunk').toBe(0x004e4942);
  const bin = new DataView(buf, binHeaderOffset + 8, binLength);

  const usedMatrixNodeForm = (json.nodes ?? []).some((n) => Array.isArray(n.matrix));
  return { json, bin, usedMatrixNodeForm };
}

/** Read a `VEC3`/`FLOAT` accessor out of the BIN chunk, honouring `byteStride`. */
function readVec3Accessor(glb: DecodedGlb, accessorIndex: number): Float32Array {
  const acc = glb.json.accessors?.[accessorIndex];
  if (!acc) throw new Error(`accessor ${accessorIndex} missing`);
  expect(acc.type, 'POSITION accessor is not VEC3').toBe('VEC3');
  expect(acc.componentType, 'POSITION accessor is not FLOAT (5126)').toBe(5126);
  const bv = glb.json.bufferViews?.[acc.bufferView ?? -1];
  if (!bv) throw new Error(`bufferView for accessor ${accessorIndex} missing`);
  const stride = bv.byteStride ?? 12;
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out = new Float32Array(acc.count * 3);
  for (let i = 0; i < acc.count; i++) {
    const o = base + i * stride;
    out[i * 3 + 0] = glb.bin.getFloat32(o + 0, true);
    out[i * 3 + 1] = glb.bin.getFloat32(o + 4, true);
    out[i * 3 + 2] = glb.bin.getFloat32(o + 8, true);
  }
  return out;
}

/** Every mesh-bearing node in the emitted file, keyed by name, with its composed world matrix. */
function exportedMeshNodes(glb: DecodedGlb): Map<string, { world: THREE.Matrix4; positions: Float32Array }> {
  const result = new Map<string, { world: THREE.Matrix4; positions: Float32Array }>();
  const nodes = glb.json.nodes ?? [];
  const roots = glb.json.scenes?.[glb.json.scene ?? 0]?.nodes ?? [];

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
    if (n.mesh !== undefined && n.name) {
      const prim = glb.json.meshes?.[n.mesh]?.primitives?.[0];
      const posIdx = prim?.attributes?.POSITION;
      if (posIdx !== undefined) result.set(n.name, { world, positions: readVec3Accessor(glb, posIdx) });
    }
    for (const child of n.children ?? []) walk(child, world);
  };

  for (const r of roots) walk(r, new THREE.Matrix4());
  return result;
}

/**
 * ⭐ THE MEASUREMENT — worst per-vertex displacement, in METRES, between the solid the editor
 * authored and the solid the GLB actually carries.
 *
 * The authored side is read from the LIVE THREE scene (`mesh.matrixWorld` × the geometry's own
 * `position` attribute, optionally re-expressed in the authoring frame). The exported side is
 * read from the emitted BYTES. Vertex order is preserved by `GLTFExporter` (it copies the
 * attribute verbatim), so the comparison is index-for-index on the SAME named mesh.
 */
function worstVertexErrorM(
  scene: THREE.Scene,
  glb: DecodedGlb,
  meshName: string,
  frameInverse?: THREE.Matrix4 | null,
): number {
  const source = scene.getObjectByName(meshName) as THREE.Mesh | undefined;
  expect(source, `source mesh "${meshName}" is not in the authored scene`).toBeTruthy();
  source!.updateWorldMatrix(true, false);

  const exported = exportedMeshNodes(glb).get(meshName);
  expect(exported, `mesh "${meshName}" is absent from the EXPORTED GLB`).toBeTruthy();

  const authoredWorld = new THREE.Matrix4().copy(source!.matrixWorld);
  if (frameInverse) authoredWorld.premultiply(frameInverse);

  const attr = source!.geometry.getAttribute('position') as THREE.BufferAttribute;
  expect(exported!.positions.length / 3, `vertex COUNT differs for "${meshName}"`).toBe(attr.count);

  let worst = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < attr.count; i++) {
    a.set(attr.getX(i), attr.getY(i), attr.getZ(i)).applyMatrix4(authoredWorld);
    b.set(exported!.positions[i * 3]!, exported!.positions[i * 3 + 1]!, exported!.positions[i * 3 + 2]!)
      .applyMatrix4(exported!.world);
    worst = Math.max(worst, a.distanceTo(b));
  }
  return worst;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// THE FOUNDER'S BUILDING — a raked, profile-edited wall hosting a window and a door.
// ═══════════════════════════════════════════════════════════════════════════════════════

const WALL_LENGTH = 4;
const WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.3;
/** The founder's lean. 62° from horizontal ⇒ `cot 62° = 0.5317` m of drift per metre of rise. */
const RAKE_DEG = 62;

/**
 * A PROFILE-EDITED wall body: the top edge is no longer flat. This lives in the GEOMETRY —
 * `Object3D.clone(true)` copies geometry BY REFERENCE (Mesh.js `this.geometry = source.geometry`),
 * so it is the CONTROL that proves the defect is the transform and not the profile.
 */
function profiledWallGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(WALL_LENGTH, 0);
  shape.lineTo(WALL_LENGTH, WALL_HEIGHT * 0.55);      // an edited profile: stepped + sloped top
  shape.lineTo(WALL_LENGTH * 0.62, WALL_HEIGHT);
  shape.lineTo(WALL_LENGTH * 0.28, WALL_HEIGHT * 0.78);
  shape.lineTo(0, WALL_HEIGHT * 0.9);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_THICKNESS, bevelEnabled: false });
  geo.translate(0, 0, -WALL_THICKNESS / 2); // centre the thickness on the baseline
  return geo;
}

/** A plain rectangular wall body, base at Y = 0, centred on the baseline in Z. */
function plainWallGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(WALL_LENGTH, WALL_HEIGHT, WALL_THICKNESS);
  geo.translate(WALL_LENGTH / 2, WALL_HEIGHT / 2, 0);
  return geo;
}

interface BuildOpts {
  rakeDeg?: number;
  profiled?: boolean;
  hostedWindow?: boolean;
  hostedDoor?: boolean;
  /** Re-parent the whole BIM under a georeferencing frame, as `CesiumThreeBridge.setAnchor()` does. */
  georeferenced?: boolean;
}

interface BuiltScene {
  scene: THREE.Scene;
  /** `inverse(frame.matrixWorld)` when georeferenced — the frame the exporter divides out. */
  frameInverse: THREE.Matrix4 | null;
}

function buildScene(opts: BuildOpts): BuiltScene {
  const scene = new THREE.Scene();
  const k = rakeShearPerMetre(opts.rakeDeg ?? 90);
  const direction = { x: 1, z: 0 };   // wall runs along +X ⇒ leftPerp = (0, +1) ⇒ shear in +Z
  const wallBaseY = 0;

  let host: THREE.Object3D = scene;
  let frameInverse: THREE.Matrix4 | null = null;
  if (opts.georeferenced) {
    // The shape `CesiumThreeBridge.setAnchor()` produces: a DECLARED georeferencing frame
    // carrying an ENU→ECEF rotation + a megametre translation.
    const gisRoot = new THREE.Group();
    gisRoot.name = 'GIS_BIM_ROOT';
    gisRoot.userData = { [SCENE_FRAME_USERDATA_KEY]: 'geo-ecef' };
    gisRoot.matrixAutoUpdate = false;
    gisRoot.matrix.set(
      -0.876435, 0.271243, -0.397205, -4646229.6,
      0.481522, 0.493690, -0.723117, 2553076.9,
      0.0, 0.825030, 0.565088, -3534657.3,
      0, 0, 0, 1,
    );
    scene.add(gisRoot);
    host = gisRoot;
    scene.updateMatrixWorld(true);
    frameInverse = new THREE.Matrix4().copy(gisRoot.matrixWorld).invert();
  }

  // ── the wall ────────────────────────────────────────────────────────────────
  const wall = new THREE.Group();
  wall.name = 'wall-1';
  wall.userData = { elementType: 'wall', id: 'w1' };
  const body = new THREE.Mesh(
    opts.profiled ? profiledWallGeometry() : plainWallGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xb0a89c }),
  );
  body.name = 'wall-1-body';
  wall.add(body);
  host.add(wall);
  scene.updateMatrixWorld(true);
  applyRakeShearToChildren(wall, k, direction, wallBaseY);

  // ── the hosted window (an export ROOT of its own — WindowBuilder.ts:979 + :806) ──
  if (opts.hostedWindow) {
    const win = new THREE.Group();
    win.name = 'win-1';
    win.userData = { elementType: 'Window', id: 'win1' };
    const centreY = 1.0 + 1.2 / 2;                    // sill 1.0 m, leaf 1.2 m tall
    const off = rakeTopOffset(k, centreY - wallBaseY, direction);
    win.rotation.y = 0;                               // the wall runs along +X
    win.position.set(2.0 + off.x, centreY, 0 + off.z);
    const pane = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1.2, 0.05),
      new THREE.MeshPhysicalMaterial({ color: 0xbfd3e6, transmission: 0.85, transparent: true, opacity: 0.34, depthWrite: false }),
    );
    pane.name = 'win-1-pane';
    pane.userData = { elementType: 'Window', id: 'win1' };
    win.add(pane);
    host.add(win);
    applyHostedLeafShear(win, k);
  }

  // ── the hosted door (DoorBuilder.ts:786-798 — the SAME shape) ────────────────
  if (opts.hostedDoor) {
    const door = new THREE.Group();
    door.name = 'door-1';
    door.userData = { elementType: 'Door', id: 'door1' };
    const centreY = 2.1 / 2;
    const off = rakeTopOffset(k, centreY - wallBaseY, direction);
    door.rotation.y = 0;
    door.position.set(0.9 + off.x, centreY, 0 + off.z);
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 2.1, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b }),
    );
    leaf.name = 'door-1-leaf';
    leaf.userData = { elementType: 'Door', id: 'door1' };
    door.add(leaf);
    host.add(door);
    applyHostedLeafShear(door, k);
  }

  scene.updateMatrixWorld(true);
  return { scene, frameInverse };
}

// ═══════════════════════════════════════════════════════════════════════════════════════

describe('§GLB-SHEAR-SURVIVES-THE-EXPORT (L-10142) — the exported GLB must carry the shear', () => {
  // The rake is real and non-trivial: assert the arithmetic before asserting anything about it.
  it('the probe leans the wall by a measurable amount (the test would be vacuous otherwise)', () => {
    const k = rakeShearPerMetre(RAKE_DEG);
    expect(k).toBeCloseTo(1 / Math.tan(RAKE_DEG * DEG2RAD), 12);
    expect(Math.abs(k * WALL_HEIGHT)).toBeGreaterThan(1.5); // > 1.5 m of top-edge drift
  });

  it('CONTROL — a PLAIN wall (no rake, no profile) exports its solid exactly', async () => {
    const { scene } = buildScene({ rakeDeg: 90 });
    const glb = await exportAndDecode(scene);
    expect(worstVertexErrorM(scene, glb, 'wall-1-body')).toBeLessThan(1e-4);
  });

  it('CONTROL — a PROFILE-EDITED wall exports its solid exactly (geometry is by reference)', async () => {
    const { scene } = buildScene({ rakeDeg: 90, profiled: true });
    const glb = await exportAndDecode(scene);
    expect(worstVertexErrorM(scene, glb, 'wall-1-body')).toBeLessThan(1e-4);
  });

  it('CONTROL — a RAKED wall BODY exports its solid exactly (the shear lives on a CHILD)', async () => {
    // `Object3D.copy` carries `matrix` + `matrixAutoUpdate` (Object3D.js:1601-1607), so a
    // shear premultiplied onto a wall-group CHILD survives `clone(true)` and reaches
    // `GLTFExporter` as the 16-float node `matrix`. This arm was never the defect — and
    // saying so is what stops the wall half being "fixed" for nothing.
    const { scene } = buildScene({ rakeDeg: RAKE_DEG, profiled: true });
    const glb = await exportAndDecode(scene);
    expect(worstVertexErrorM(scene, glb, 'wall-1-body')).toBeLessThan(1e-4);
  });

  it('⭐ THE FOUNDER\'S CASE — a WINDOW hosted on a raked, profile-edited wall', async () => {
    const { scene } = buildScene({ rakeDeg: RAKE_DEG, profiled: true, hostedWindow: true });
    const glb = await exportAndDecode(scene);

    const paneErr = worstVertexErrorM(scene, glb, 'win-1-pane');
    const wallErr = worstVertexErrorM(scene, glb, 'wall-1-body');

    // The wall is right and the window is wrong — EXACTLY what the screenshot shows.
    expect(wallErr).toBeLessThan(1e-4);
    expect(paneErr, 'the exported pane must match the authored pane, vertex for vertex').toBeLessThan(1e-4);
  });

  it('a DOOR hosted on the same raked wall (DoorBuilder carries the identical shear)', async () => {
    const { scene } = buildScene({ rakeDeg: RAKE_DEG, profiled: true, hostedDoor: true });
    const glb = await exportAndDecode(scene);
    expect(worstVertexErrorM(scene, glb, 'door-1-leaf')).toBeLessThan(1e-4);
  });

  it('⭐ THE REAL 3D-SITE PATH — georeferenced under GIS_BIM_ROOT, frame divided out', async () => {
    // This is the branch the founder is actually on: `ProjectLifecycleController` → GLB →
    // `[CesiumViewport][globe] REAL model placed on photoreal tiles`. The frame arm of
    // `cloneWithBakedWorldTransform` composes `inverse(frame) × element.matrixWorld` and used
    // to decompose THAT — so it lost the shear too, and it is the arm production takes.
    const { scene, frameInverse } = buildScene({
      rakeDeg: RAKE_DEG, profiled: true, hostedWindow: true, hostedDoor: true, georeferenced: true,
    });
    const glb = await exportAndDecode(scene, { stripAnnotationOverlays: true, glazingOverride: true });

    expect(worstVertexErrorM(scene, glb, 'wall-1-body', frameInverse)).toBeLessThan(1e-3);
    expect(worstVertexErrorM(scene, glb, 'win-1-pane', frameInverse)).toBeLessThan(1e-3);
    expect(worstVertexErrorM(scene, glb, 'door-1-leaf', frameInverse)).toBeLessThan(1e-3);
  });

  it('glTF carries the shear in the 16-float node `matrix`, NOT in T/R/S', async () => {
    // ⭐ THE FORMAT WAS NEVER THE CONSTRAINT, and this asserts it against the BYTES rather
    // than against the spec. `GLTFWriter` defaults `trs: false` (GLTFExporter.js:649) and then
    // writes `nodeDef.matrix = object.matrix.elements` (:2400) — a full affine, shear included.
    //
    // ⚠ BUT IT RE-COMPOSES FIRST IF YOU LET IT: `if (object.matrixAutoUpdate) object.updateMatrix()`
    // (:2392) rebuilds `matrix` from position/quaternion/scale and silently discards whatever
    // was assigned. `matrixAutoUpdate = false` is what makes the fix stick — the same one line
    // ELEV14 called "THE ONE LINE THIS WHOLE FIX IS".
    const { scene } = buildScene({ rakeDeg: RAKE_DEG, profiled: true, hostedWindow: true });
    const glb = await exportAndDecode(scene);
    expect(glb.usedMatrixNodeForm, 'no glTF node used the `matrix` form — T/R/S cannot carry a shear').toBe(true);

    // And the emitted matrix for the window root is genuinely non-orthogonal (a real shear),
    // not merely a rotation the decompose would have survived.
    const winNode = (glb.json.nodes ?? []).find((n) => n.name === 'win-1' && Array.isArray(n.matrix));
    expect(winNode, 'the window export root is missing from the GLB').toBeTruthy();
    const m = new THREE.Matrix4().fromArray(winNode!.matrix!);
    const e = m.elements;
    const colY = new THREE.Vector3(e[4]!, e[5]!, e[6]!);
    const colZ = new THREE.Vector3(e[8]!, e[9]!, e[10]!);
    // A pure T·R·S has orthogonal basis columns. A shear does not — that is why decompose fails.
    expect(Math.abs(colY.normalize().dot(colZ.normalize())), 'the exported window basis is orthogonal — the shear is GONE')
      .toBeGreaterThan(1e-3);
  });
});
