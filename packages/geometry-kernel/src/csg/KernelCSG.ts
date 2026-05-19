// KernelCSG — THREE-free Boolean ops for the kernel (S53 D4).
//
// Per `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §7.4 + §13:
// 3D Booleans are backed by `manifold-3d` (WASM, THREE-free).  The
// adapter is loaded lazily via dynamic `import()` so kernel consumers
// that never use CSG do NOT pull the ~600 KB WASM blob.
//
// Surface:
//   const csg = await KernelCSG.create();
//   const out = csg.union(a, b);     // a ∪ b
//   const out = csg.subtract(a, b);  // a − b
//   const out = csg.intersect(a, b); // a ∩ b
//
// Each `CSGOperand` is a plain triangle soup `{ position, index }` in
// metres.  Inputs need not be perfectly weld-clean — `Mesh.merge()`
// welds vertices within Manifold's epsilon before lifting to a
// Manifold solid.  Outputs are plain triangle soup again.
//
// LAYER — L4 PURE.  No THREE, no DOM, no Node primitives.  The
// dynamic `import('manifold-3d')` is the kernel's *only* permitted
// non-pure boundary (the WASM module brings its own runtime).

import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';

export interface CSGOperand {
  readonly position: Float32Array;
  readonly index: Uint16Array | Uint32Array;
}

interface ManifoldHandle {
  getMesh(): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array };
  delete?(): void;
}
interface ManifoldStatic {
  ofMesh(mesh: unknown): ManifoldHandle;
  union(a: ManifoldHandle, b: ManifoldHandle): ManifoldHandle;
  difference(a: ManifoldHandle, b: ManifoldHandle): ManifoldHandle;
  intersection(a: ManifoldHandle, b: ManifoldHandle): ManifoldHandle;
}
interface MeshHandle {
  merge?(): boolean;
}
interface MeshConstructor {
  new (opts: {
    numProp: number;
    vertProperties: Float32Array;
    triVerts: Uint32Array;
  }): MeshHandle;
}
interface ManifoldToplevel {
  Manifold: ManifoldStatic;
  Mesh: MeshConstructor;
  setup?: () => void;
}

let topPromise: Promise<ManifoldToplevel> | null = null;

async function loadManifoldToplevel(): Promise<ManifoldToplevel> {
  if (topPromise) return topPromise;
  topPromise = (async () => {
    const mod = (await import('manifold-3d')) as unknown as {
      default: () => Promise<ManifoldToplevel>;
    };
    const top = await mod.default();
    if (typeof top.setup === 'function') top.setup();
    return top;
  })();
  return topPromise;
}

/**
 * Reset the cached `manifold-3d` module load.  TEST-ONLY seam — keeps
 * the per-test state isolated when a suite needs to assert the
 * lazy-load path.  Production callers must not invoke this.
 */
export function __resetKernelCSGForTests(): void {
  topPromise = null;
}

/**
 * 3D Boolean engine.  Backed by `manifold-3d` (WASM, THREE-free).
 * Loaded lazily via `KernelCSG.create()` so consumers that never run
 * CSG do not pull the WASM payload.
 */
export class KernelCSG {
  /** @internal — populated by `create()`. */
  private constructor(private readonly _top: ManifoldToplevel) {}

  static async create(): Promise<KernelCSG> {
    const top = await loadManifoldToplevel();
    return new KernelCSG(top);
  }

  /** `a ∪ b` as triangle soup. */
  union(a: CSGOperand, b: CSGOperand): CSGOperand {
    return this._op('union', a, b);
  }

  /** `a − b` as triangle soup. */
  subtract(a: CSGOperand, b: CSGOperand): CSGOperand {
    return this._op('difference', a, b);
  }

  /** `a ∩ b` as triangle soup. */
  intersect(a: CSGOperand, b: CSGOperand): CSGOperand {
    return this._op('intersection', a, b);
  }

  private _op(
    op: 'union' | 'difference' | 'intersection',
    a: CSGOperand,
    b: CSGOperand,
  ): CSGOperand {
    const ma = this._lift(a);
    const mb = this._lift(b);
    let result: ManifoldHandle;
    try {
      if (op === 'union') result = this._top.Manifold.union(ma, mb);
      else if (op === 'difference') result = this._top.Manifold.difference(ma, mb);
      else result = this._top.Manifold.intersection(ma, mb);
    } finally {
      // Manifold's WASM solids hold native memory; release input
      // handles eagerly so long-running editors do not leak.
      ma.delete?.();
      mb.delete?.();
    }
    try {
      const mesh = result.getMesh();
      return manifoldMeshToOperand(mesh);
    } finally {
      result.delete?.();
    }
  }

  private _lift(op: CSGOperand): ManifoldHandle {
    if (op.position.length === 0 || op.index.length === 0) {
      throw new Error('KernelCSG: cannot lift an empty operand into Manifold.');
    }
    if (op.position.length % 3 !== 0) {
      throw new Error(
        `KernelCSG: position length ${op.position.length} is not a multiple of 3.`,
      );
    }
    if (op.index.length % 3 !== 0) {
      throw new Error(
        `KernelCSG: index length ${op.index.length} is not a multiple of 3.`,
      );
    }
    const triVerts =
      op.index instanceof Uint32Array ? op.index : new Uint32Array(op.index);
    const mesh = new this._top.Mesh({
      numProp: 3,
      vertProperties: op.position,
      triVerts,
    });
    // Best-effort weld of duplicated edge verts (e.g. extrude emits
    // unique side verts so cap normals stay sharp; Manifold needs a
    // welded edge graph to be combinatorially manifold).
    if (typeof mesh.merge === 'function') mesh.merge();
    return this._top.Manifold.ofMesh(mesh);
  }
}

function manifoldMeshToOperand(mesh: {
  readonly numProp: number;
  readonly vertProperties: Float32Array;
  readonly triVerts: Uint32Array;
}): CSGOperand {
  const np = mesh.numProp;
  if (np === 3) {
    return {
      position: new Float32Array(mesh.vertProperties),
      index: new Uint32Array(mesh.triVerts),
    };
  }
  const numVerts = mesh.vertProperties.length / np;
  const position = new Float32Array(numVerts * 3);
  for (let v = 0; v < numVerts; v++) {
    position[3 * v + 0] = mesh.vertProperties[np * v + 0]!;
    position[3 * v + 1] = mesh.vertProperties[np * v + 1]!;
    position[3 * v + 2] = mesh.vertProperties[np * v + 2]!;
  }
  return { position, index: new Uint32Array(mesh.triVerts) };
}

/**
 * Convenience helper: extract CSG-friendly operand buffers from a
 * descriptor.  Used when chaining `produceExtrude / Sweep / Revolve`
 * → CSG → re-serialise (slab S11+, family editor S53).
 */
export function descriptorToOperand(d: BufferGeometryDescriptor): CSGOperand {
  return {
    position: d.position,
    index: d.index instanceof Uint32Array ? d.index : new Uint32Array(d.index),
  };
}
