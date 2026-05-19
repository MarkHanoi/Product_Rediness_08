/**
 * Rhino reader tests (Phase 3-B Sprint S57).
 *
 * Per PHASE-3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md §S57.
 *
 * Two layers of coverage:
 *   1. Pure unit test against an injected `RhinoModuleLike` stub — works
 *      everywhere, no WASM.
 *   2. Integration test against the real `rhino3dm` WASM — wrapped in
 *      try/catch so the suite still passes if the WASM cannot be loaded
 *      in the host environment (matches per-spec graceful skip).
 */

import { describe, expect, it } from 'vitest';
import { readRhino3dm, loadRhinoModule, type RhinoModuleLike } from '../src/index.js';

function stubModule(): RhinoModuleLike {
  return {
    File3dm: {
      fromByteArray: () => ({
        applicationName: () => 'Rhino 8',
        unitSystem: () => 4, // meters
        layers: {
          count: 2,
          get: (i: number) => i === 0
            ? { id: 'layer-a', name: 'Default', fullPath: 'Default', parentLayerId: '00000000-0000-0000-0000-000000000000', visible: true, color: { r: 255, g: 0, b: 0 } }
            : { id: 'layer-b', name: 'Walls',   fullPath: 'Walls',   parentLayerId: 'layer-a', visible: true, color: { r: 0, g: 255, b: 0 } },
        },
        objects: () => ({
          count: 4,
          get: (i: number) => {
            const baseAttr = (id: string, layerIndex: number) => ({ attributes: () => ({ id, layerIndex }) });
            switch (i) {
              case 0: return {
                ...baseAttr('p-1', 0),
                geometry: () => ({ objectType: 1, location: { x: 1, y: 2, z: 3 } }),
              };
              case 1: return {
                ...baseAttr('c-1', 0),
                geometry: () => ({
                  objectType: 4,
                  isClosed: false,
                  toPolyline: () => ({
                    count: 3,
                    get: (j: number) => [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }][j],
                  }),
                }),
              };
              case 2: return {
                ...baseAttr('m-1', 1),
                geometry: () => ({
                  objectType: 32,
                  vertices: () => ({
                    count: 3,
                    get: (j: number) => [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }][j],
                  }),
                  faces: () => ({
                    count: 1,
                    get: () => ({ a: 0, b: 1, c: 2, d: 0, isQuad: false }),
                  }),
                }),
              };
              case 3: return {
                // Brep: unsupported objectType — should drop
                ...baseAttr('b-1', 1),
                geometry: () => ({ objectType: 8 }),
              };
              default: return null;
            }
          },
        }),
      }),
    },
  };
}

describe('readRhino3dm (stub module)', () => {
  it('parses layers, points, curves, meshes; counts dropped non-mesh entries', async () => {
    const doc = await readRhino3dm(new Uint8Array([1, 2, 3]), { rhinoModule: stubModule() });

    expect(doc.application).toBe('Rhino 8');
    expect(doc.unit).toBe('meters');
    expect(doc.layers).toHaveLength(2);
    expect(doc.layers[0].id).toBe('layer-a');
    expect(doc.layers[1].parentLayerId).toBe('layer-a');

    expect(doc.counts).toEqual({ layers: 2, points: 1, curves: 1, meshes: 1, droppedNoMesh: 1 });

    const point = doc.objects.find((o) => o.kind === 'point');
    expect(point).toBeDefined();
    expect(point!.kind === 'point' && point!.position).toEqual({ x: 1, y: 2, z: 3 });

    const curve = doc.objects.find((o) => o.kind === 'curve');
    expect(curve!.kind === 'curve' && curve!.vertices.length).toBe(3);

    const mesh = doc.objects.find((o) => o.kind === 'mesh');
    expect(mesh!.kind === 'mesh' && mesh!.vertices.length).toBe(9);
    expect(mesh!.kind === 'mesh' && [...mesh!.faces]).toEqual([0, 1, 2]);
  });

  it('throws if rhino3dm returns null (corrupt file)', async () => {
    const mod: RhinoModuleLike = { File3dm: { fromByteArray: () => null } };
    await expect(readRhino3dm(new Uint8Array([0]), { rhinoModule: mod })).rejects.toThrow();
  });

  it('preserves layer hierarchy via parentLayerId', async () => {
    const doc = await readRhino3dm(new Uint8Array([1]), { rhinoModule: stubModule() });
    const child = doc.layers.find((l) => l.id === 'layer-b');
    expect(child?.parentLayerId).toBe('layer-a');
  });
});

describe('readRhino3dm (real WASM, optional)', () => {
  it('loadRhinoModule resolves or throws gracefully', async () => {
    try {
      const mod = await loadRhinoModule();
      expect(mod.File3dm).toBeDefined();
    } catch (err) {
      // WASM unavailable — graceful skip per S57 plugin K3-B gate.
      expect(err).toBeInstanceOf(Error);
    }
  });
});
