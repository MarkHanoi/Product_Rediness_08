// GeometryWorkerTypes — ADR-047 · Task 4.2
//
// Shared message-contract types for the curtain-wall geometry worker pipeline.
// NO THREE imports — all types use plain numbers / typed arrays only so they
// are safe to send across the Worker message boundary (structured-clone).
//
// Design invariants:
//   P2 — No '@pryzm/renderer-three/three' import; no 'three' import.
//   P3 — No rAF references.
//
// Consumers:
//   GeometryWorkerPool.ts  — main thread (posts requests, receives results)
//   geometry.worker.ts     — worker thread (receives requests, posts results)

// ---------------------------------------------------------------------------
// Cell (serialisable — no THREE.Vector3)
// ---------------------------------------------------------------------------

/**
 * A plain-object version of CurtainCell for cross-thread message passing.
 * The four corner values are flattened to scalars so no class instances
 * (THREE.Vector3) cross the worker boundary.
 */
export interface SerializableCell {
    i: number;
    j: number;
    u0: number;
    u1: number;
    v0: number;
    v1: number;
    width: number;
    height: number;
    /** Bottom-left corner X in curtain wall local space. */
    blX: number;
    /** Bottom-left corner Y in curtain wall local space. */
    blY: number;
    /** Top-right corner X in curtain wall local space. */
    trX: number;
    /** Top-right corner Y in curtain wall local space. */
    trY: number;
}

// ---------------------------------------------------------------------------
// Typed-array geometry result (one box: positions / normals / uvs / indices)
// ---------------------------------------------------------------------------

/**
 * The raw typed-array contents of a single THREE.BufferGeometry (box shape).
 * Transferred zero-copy via postMessage `transfer` list.
 *
 * Vertex layout: 6 faces × 4 vertices = 24 unique vertices.
 * Index layout:  6 faces × 2 triangles × 3 indices = 36 indices.
 */
export interface BoxGeomArrays {
    positions: Float32Array;  // 24 * 3 = 72 floats
    normals:   Float32Array;  // 24 * 3 = 72 floats
    uvs:       Float32Array;  // 24 * 2 = 48 floats
    indices:   Uint16Array;   // 36 indices
}

/**
 * Geometry for one fallback glass panel, plus its centre offset
 * within the curtain wall group local space.
 */
export interface FallbackPanelResult {
    geom: BoxGeomArrays;
    /** Centre X of the panel cell in curtain wall local space. */
    cx: number;
    /** Centre Y of the panel cell in curtain wall local space. */
    cy: number;
}

// ---------------------------------------------------------------------------
// Worker request / result
// ---------------------------------------------------------------------------

/**
 * Message posted FROM the main thread TO the geometry worker.
 * All fields are structured-clone–safe (plain numbers / typed arrays).
 */
export interface GeometryWorkerRequest {
    /** Unique request identifier (ULID-style monotonic string). */
    requestId: string;
    /** The curtain wall element id — echoed back in the result. */
    wallId: string;
    /** Serialisable cells (corners as scalars, not THREE.Vector3). */
    cells: SerializableCell[];
    mullionSize: number;
    panelThickness: number;
    wallHeight: number;
    wallLength: number;
    /**
     * Sorted normalised t-values for VERTICAL mullion positions.
     * These are the uLines t-values after ascending sort.
     */
    uLinesT: number[];
    /**
     * Sorted normalised t-values for HORIZONTAL mullion positions.
     * These are the vLines t-values after ascending sort.
     */
    vLinesT: number[];
}

/**
 * Message posted FROM the geometry worker TO the main thread.
 * All TypedArrays are transferred (zero-copy) — callers must not read
 * them after posting.
 *
 * If the worker encountered an unrecoverable error it posts a result with
 * `error` set to a non-empty string.  All geometry fields are empty/null in
 * that case.  The pool's message handler converts this into a Promise
 * rejection so `_submitToWorker`'s `.catch()` can trigger the sync fallback.
 */
export interface GeometryWorkerResult {
    requestId: string;
    wallId: string;
    /**
     * Set to a non-empty string when the worker failed to process the request.
     * When present the geometry arrays below are all empty/null and the
     * main-thread caller should fall back to synchronous `build()`.
     */
    error?: string;
    /** One BoxGeomArrays per cell (fallback glass panel, no material override). */
    fallbackPanels: FallbackPanelResult[];
    /**
     * Single box geometry shared by ALL vertical mullion instances.
     * null when uLinesT is empty.
     */
    vMullionBox: BoxGeomArrays | null;
    /**
     * Single box geometry shared by ALL horizontal mullion instances.
     * null when vLinesT is empty.
     */
    hMullionBox: BoxGeomArrays | null;
    /**
     * Column-major 4×4 matrices for vertical mullion InstancedMesh.
     * Length = uLinesT.length × 16. null when uLinesT is empty.
     */
    vInstanceMatrices: Float32Array | null;
    /**
     * Column-major 4×4 matrices for horizontal mullion InstancedMesh.
     * Length = vLinesT.length × 16. null when vLinesT is empty.
     */
    hInstanceMatrices: Float32Array | null;
}
