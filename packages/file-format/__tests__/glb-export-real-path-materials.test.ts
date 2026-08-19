// §FIX-GLB-NAME-UNSUPPORTED-MATERIALS (L-1206) + §FIX-FORMA-WHITE-MATERIAL-PER-ELEMENT (L-1207)
// + §FIX-FORMA-WHITE-GLASS-SURVIVES-GLTF (L-1208)
//
// ⛔ THIS SUITE DELIBERATELY DOES NOT STUB `GLTFExporter`.
//
// The sibling suite `glb-export-forma-white.test.ts` opens by declaring that "the full
// white remap runs inside exportFragmentsToGLB (DOM-bound GLTFExporter, out of scope for
// this Node-env suite)" and then tests only the PURE classifier. That premise is FALSE —
// three's `GLTFExporter` needs `Blob`, `URL.createObjectURL` and `TextEncoder`, all of
// which Node 20 provides — and it is exactly the gap that let the founder's real defect
// through: the classifier was green while the bytes that reach Cesium were never asserted.
// A test that stubs the exporter proves nothing about the GLB, and a fake built from the
// header cannot falsify the header.
//
// So every assertion below runs the REAL `exportFragmentsToGLB`, takes the REAL GLB blob
// it returns, and decodes the REAL glTF JSON chunk out of the binary container. What is
// asserted is what Cesium loads.

import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import {
  exportFragmentsToGLB,
  collectUnsupportedGltfMaterials,
} from '../src/export/glb/GLBExporter';

// ---------------------------------------------------------------------------
// ENVIRONMENT SHIM — `FileReader`, and NOTHING else.
//
// ⚠ Read this before deciding the suite "stubs the exporter". It does not. three's
// `GLTFWriter.writeAsync` (GLTFExporter.js L692) reaches for the DOM `FileReader` to
// turn its buffers into the GLB container; Node 20 ships `Blob`, `URL.createObjectURL`,
// `TextEncoder` and `fetch`, but not `FileReader`. This is a missing PLATFORM global,
// not a seam in the code under test: the shim below is ~8 lines of `Blob.arrayBuffer()`
// with no knowledge of glTF, materials, or PRYZM. The exporter, the white override, the
// element selection, the triangle budget, the ground anchoring and the GLB byte layout
// all still run for real, and every assertion reads the bytes that came out.
// ---------------------------------------------------------------------------
beforeAll(() => {
  if (typeof (globalThis as { FileReader?: unknown }).FileReader !== 'undefined') return;
  class NodeFileReader {
    public result: ArrayBuffer | string | null = null;
    public onloadend: (() => void) | null = null;
    public onerror: ((e: unknown) => void) | null = null;
    readAsArrayBuffer(blob: Blob): void {
      blob
        .arrayBuffer()
        .then((buf) => { this.result = buf; this.onloadend?.(); })
        .catch((e) => this.onerror?.(e));
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
// GLB container decoding — glTF 2.0 binary layout (spec §4.4.1):
//   header  : magic u32 'glTF' | version u32 | total length u32
//   chunk 0 : length u32 | type u32 (0x4E4F534A 'JSON') | JSON bytes
// We only need chunk 0. No third-party parser, so the test cannot inherit a
// parser's opinion about what the file says.
// ---------------------------------------------------------------------------
interface GltfJson {
  materials?: Array<{
    name?: string;
    alphaMode?: string;
    pbrMetallicRoughness?: { baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number };
    extensions?: Record<string, unknown>;
  }>;
  meshes?: Array<{ name?: string; primitives: Array<{ material?: number }> }>;
  nodes?: Array<{ name?: string; mesh?: number; children?: number[] }>;
  extensionsUsed?: string[];
}

async function exportAndDecode(
  scene: THREE.Scene,
  options?: Parameters<typeof exportFragmentsToGLB>[1],
): Promise<GltfJson> {
  const url = await exportFragmentsToGLB(scene, options);
  expect(url, 'exportFragmentsToGLB returned no url — the export path itself failed').toBeTruthy();
  const buf = await (await fetch(url)).arrayBuffer();
  URL.revokeObjectURL(url);

  const view = new DataView(buf);
  expect(view.getUint32(0, true), 'GLB magic is not "glTF"').toBe(0x46546c67);
  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  expect(chunkType, 'first GLB chunk is not the JSON chunk').toBe(0x4e4f534a);
  const json = new TextDecoder().decode(new Uint8Array(buf, 20, chunkLength));
  return JSON.parse(json) as GltfJson;
}

/** A minimal but REAL BIM-shaped element: a group carrying `userData.elementType`. */
function makeElement(
  elementType: string,
  id: string,
  material: THREE.Material,
  objectKind: 'mesh' | 'line' = 'mesh',
): THREE.Object3D {
  const group = new THREE.Group();
  group.name = `${elementType}-${id}`;
  group.userData = { elementType, id };
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const child =
    objectKind === 'line'
      ? new THREE.LineSegments(new THREE.EdgesGeometry(geo), material as THREE.LineBasicMaterial)
      : new THREE.Mesh(geo, material);
  child.name = `${elementType}-${id}-geom`;
  group.add(child);
  return group;
}

describe('§FIX-GLB-NAME-UNSUPPORTED-MATERIALS (L-1206) — the five anonymous warnings, named', () => {
  it('MeshPhysicalMaterial glazing does NOT trip the exporter warning (the standing hypothesis, falsified)', () => {
    // The hypothesis under investigation was: "the GLTFExporter warnings are the GLAZING,
    // because glTF cannot represent MeshPhysicalMaterial, so the pane lands opaque."
    // three's predicate is `isMeshStandardMaterial !== true && isMeshBasicMaterial !== true`,
    // and MeshPhysicalMaterial EXTENDS MeshStandardMaterial. Assert the flag directly, so
    // this stays true against the installed three rather than against a memory of it.
    const glass = new THREE.MeshPhysicalMaterial({ transmission: 0.85, ior: 1.5, transparent: true });
    expect((glass as unknown as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial).toBe(true);

    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glass));
    expect(collectUnsupportedGltfMaterials(root)).toEqual([]);
  });

  it('names the offenders by element id + material class (Line/Points/Phong — not glazing)', () => {
    const root = new THREE.Group();

    const wall = makeElement('wall', 'W-1', new THREE.MeshStandardMaterial({ color: 0x888888 }));
    // An edge-outline LineSegments living UNDER the wall element. `applyFormaWhiteOverride`
    // is `isMesh`-only, so this keeps LineBasicMaterial all the way into the exporter.
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x222222 });
    outlineMat.name = 'wall-edge-outline';
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), outlineMat);
    outline.name = 'wall-edges';
    wall.add(outline);
    root.add(wall);

    // A legacy Phong mesh (the other real-world source: imported/older geometry).
    const phongMat = new THREE.MeshPhongMaterial({ color: 0xc8a46e });
    phongMat.name = 'legacy-phong';
    root.add(makeElement('door', 'D-1', phongMat));

    const found = collectUnsupportedGltfMaterials(root);
    expect(found).toHaveLength(2);

    const line = found.find((f) => f.materialClass === 'LineBasicMaterial');
    expect(line).toBeDefined();
    expect(line!.elementType).toBe('wall');
    expect(line!.elementId).toBe('W-1');
    expect(line!.objectClass).toBe('LineSegments');
    expect(line!.materialName).toBe('wall-edge-outline');

    const phong = found.find((f) => f.materialClass === 'MeshPhongMaterial');
    expect(phong).toBeDefined();
    expect(phong!.elementType).toBe('door');
    expect(phong!.elementId).toBe('D-1');
  });

  it('de-duplicates by material instance, so a shared material is reported ONCE', () => {
    const shared = new THREE.MeshPhongMaterial({ color: 0x112233 });
    const root = new THREE.Group();
    for (let i = 0; i < 5; i++) root.add(makeElement('wall', `W-${i}`, shared));
    // Five elements, ONE material instance → one finding. (The exporter likewise warns
    // once per material, not once per mesh: it caches by material.)
    expect(collectUnsupportedGltfMaterials(root)).toHaveLength(1);
  });

  it('the census matches what the REAL exporter warns about, one-for-one', async () => {
    const scene = new THREE.Scene();
    scene.add(makeElement('wall', 'W-1', new THREE.MeshStandardMaterial({ color: 0x888888 })));
    scene.add(makeElement('door', 'D-1', new THREE.MeshPhongMaterial({ color: 0xc8a46e })));
    scene.add(makeElement('railing', 'R-1', new THREE.LineBasicMaterial({ color: 0x222222 }), 'line'));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // NO formaWhite → real materials reach the exporter, exactly like the 3D-GLOBE path.
      await exportAndDecode(scene);
      const exporterWarnings = warn.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('Use MeshStandardMaterial or MeshBasicMaterial'),
      );
      // Phong + LineBasic = 2 offenders → the real exporter warns exactly twice.
      expect(exporterWarnings).toHaveLength(2);
      // …and our census named exactly those two BEFORE the exporter ran.
      const named = warn.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('§FIX-GLB-NAME-UNSUPPORTED-MATERIALS'),
      );
      expect(named).toHaveLength(1);
      expect(named[0]![0]).toContain('2 material(s)');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('§FIX-FORMA-WHITE-MATERIAL-PER-ELEMENT (L-1207) — one shared pair per TREE, not per element', () => {
  it('emits exactly TWO materials for a many-element white export', async () => {
    const scene = new THREE.Scene();
    // 12 opaque elements + 4 windows. Pre-fix this produced up to 32 byte-identical
    // glTF materials (one white + one glass per ROOT ELEMENT); the doc comment promised 2.
    for (let i = 0; i < 12; i++) {
      scene.add(makeElement('wall', `W-${i}`, new THREE.MeshStandardMaterial({ color: 0x8b4513 })));
    }
    for (let i = 0; i < 4; i++) {
      scene.add(makeElement('window', `WIN-${i}`, new THREE.MeshStandardMaterial({ color: 0x884422 })));
    }

    const gltf = await exportAndDecode(scene, { formaWhite: true });
    expect(gltf.materials, 'no materials in the exported glTF').toBeDefined();
    expect(gltf.materials!).toHaveLength(2);

    const names = gltf.materials!.map((m) => m.name).sort();
    expect(names).toEqual(['pryzm-forma-white-glass', 'pryzm-forma-white-opaque']);
  });

  it('an all-opaque white export allocates NO glass material (lazy)', async () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 6; i++) {
      scene.add(makeElement('slab', `S-${i}`, new THREE.MeshStandardMaterial({ color: 0x999999 })));
    }
    const gltf = await exportAndDecode(scene, { formaWhite: true });
    expect(gltf.materials!).toHaveLength(1);
    expect(gltf.materials![0]!.name).toBe('pryzm-forma-white-opaque');
  });
});

describe('§FIX-FORMA-WHITE-GLASS-SURVIVES-GLTF (L-1208) — a window must not land opaque', () => {
  it('the exported glazing material is translucent AND carries the glTF-native glass extensions', async () => {
    const scene = new THREE.Scene();
    scene.add(makeElement('wall', 'W-1', new THREE.MeshStandardMaterial({ color: 0x8b4513 })));
    // The founder's case: the pane's REAL material is an opaque brown BIM finish. Only the
    // element TYPE says "window" — so `classifyFormaWhiteRole`'s element-type arm is what
    // must save it. If that arm regresses, the pane exports opaque tan, which is exactly
    // what the screenshot showed.
    scene.add(makeElement('window', 'WIN-1', new THREE.MeshStandardMaterial({ color: 0xc8a46e })));

    const gltf = await exportAndDecode(scene, { formaWhite: true });
    const glass = gltf.materials!.find((m) => m.name === 'pryzm-forma-white-glass');
    expect(glass, 'the window element did not export as glass').toBeDefined();

    // 1. Translucency that EVERY glTF consumer honours, including ones with no
    //    transmission support (Cesium): alphaMode BLEND + baseColorFactor alpha < 1.
    expect(glass!.alphaMode).toBe('BLEND');
    const baseColor = glass!.pbrMetallicRoughness?.baseColorFactor;
    expect(baseColor, 'glazing has no baseColorFactor — it would render fully opaque white').toBeDefined();
    expect(baseColor![3]).toBeLessThan(1);
    expect(baseColor![3]).toBeGreaterThan(0);

    // 2. The glTF-NATIVE physical-glass route, for consumers that do support it.
    //    MEASURED, not assumed: three 0.183 writes `KHR_materials_transmission` here but
    //    NOT `KHR_materials_ior` — its `GLTFMaterialsIorExtension` only emits when
    //    `material.ior !== 1.5`, and 1.5 (window glass) IS the glTF default, so the
    //    extension is correctly omitted and the default applies. Asserting ior would
    //    encode a wrong expectation as a requirement.
    expect(gltf.extensionsUsed ?? []).toContain('KHR_materials_transmission');
    expect(gltf.extensionsUsed ?? []).not.toContain('KHR_materials_ior');
    expect(glass!.extensions?.KHR_materials_transmission).toBeDefined();

    // 3. The opaque material must stay fully opaque — otherwise the whole building fades.
    const white = gltf.materials!.find((m) => m.name === 'pryzm-forma-white-opaque');
    expect(white!.alphaMode ?? 'OPAQUE').toBe('OPAQUE');
  });

  it('the DEFAULT (non-white) export keeps real materials — the 3D-GLOBE path exports an OPAQUE pane', async () => {
    // This documents the ASYMMETRY the founder is seeing, rather than asserting it is right:
    //   3D SITE  (GISAreaLayout `forma6`) → exportFragmentsToGLB(scene, { formaWhite: true })
    //   3D GLOBE (GISAreaLayout `globe`)  → exportFragmentsToGLB(scene)      ← no override
    // On the globe path a window whose BIM material is an opaque brown finish exports as an
    // opaque brown pane. That is the defect L-1208 records; this test pins the CURRENT
    // behaviour so the fix has something to flip.
    const scene = new THREE.Scene();
    const paneMat = new THREE.MeshStandardMaterial({ color: 0xc8a46e });
    paneMat.name = 'bim-window-pane';
    scene.add(makeElement('window', 'WIN-1', paneMat));

    const gltf = await exportAndDecode(scene);
    expect(gltf.materials!).toHaveLength(1);
    expect(gltf.materials![0]!.name).toBe('bim-window-pane');
    expect(gltf.materials![0]!.alphaMode ?? 'OPAQUE').toBe('OPAQUE');
  });
});
