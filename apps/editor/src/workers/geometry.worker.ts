// geometry.worker.ts — ADR-047 · Task 4.2
//
// Web Worker for curtain-wall fallback-glass geometry computation.
//
// CONTRACT INVARIANTS (must never be violated):
//   P2 — Does NOT import from 'three' or '@pryzm/renderer-three/three'.
//         Works exclusively with raw typed arrays (Float32Array, Uint16Array).
//   P3 — Does NOT call rAF at any code path (no requestAnimationFrame invocations).
//   WORKER — Runs in a dedicated worker thread; self is DedicatedWorkerGlobalScope.
//
// Input  (GeometryWorkerRequest):  wallId, cells[], mullion/panel params, grid t-values.
// Output (GeometryWorkerResult):   typed-array geometry for panels + mullion matrices.
//
// All output ArrayBuffers are transferred (zero-copy) via postMessage transfer list.
//
// ERROR HANDLING (§4.2-ROBUST-FALLBACK):
//   If processRequest() throws for any reason, the worker posts back a minimal
//   GeometryWorkerResult with `error` set to the error message and all geometry
//   fields empty/null.  The main-thread GeometryWorkerPool detects the `error`
//   field and rejects the pending Promise, causing CurtainWallBuilder to fall
//   back to synchronous build() for that wall.  This guarantees walls are always
//   rendered — possibly at the cost of a slightly longer main-thread build — even
//   if the worker encounters an unexpected condition.

// ---------------------------------------------------------------------------
// Inline type definitions (mirror of GeometryWorkerTypes.ts in src/).
// Duplicated so the worker is self-contained and requires no bundler-resolved
// path to the main-thread source tree.
// ---------------------------------------------------------------------------

interface SerializableCell {
    i: number; j: number;
    u0: number; u1: number;
    v0: number; v1: number;
    width: number; height: number;
    blX: number; blY: number;
    trX: number; trY: number;
}

interface BoxGeomArrays {
    positions: Float32Array;
    normals:   Float32Array;
    uvs:       Float32Array;
    indices:   Uint16Array;
}

interface FallbackPanelResult {
    geom: BoxGeomArrays;
    cx: number;
    cy: number;
}

interface GeometryWorkerRequest {
    requestId: string;
    wallId: string;
    cells: SerializableCell[];
    mullionSize: number;
    panelThickness: number;
    wallHeight: number;
    wallLength: number;
    uLinesT: number[];
    vLinesT: number[];
}

interface GeometryWorkerResult {
    requestId: string;
    wallId: string;
    error?: string;
    fallbackPanels: FallbackPanelResult[];
    vMullionBox: BoxGeomArrays | null;
    hMullionBox: BoxGeomArrays | null;
    vInstanceMatrices: Float32Array | null;
    hInstanceMatrices: Float32Array | null;
}

// ---------------------------------------------------------------------------
// Box geometry builder — pure math, no THREE
// ---------------------------------------------------------------------------

/**
 * Build a THREE-compatible BoxGeometry as raw typed arrays.
 *
 * Vertex layout: 6 faces × 4 vertices = 24 vertices.
 * Index layout:  6 faces × 2 triangles × 3 = 36 indices.
 * Each face uses a flat (planar) UV map: corners (0,0)→(1,0)→(1,1)→(0,1).
 *
 * Column-major matrix convention matches THREE.js internal element order.
 * When reconstructed on the main thread via new THREE.BufferGeometry() +
 * setAttribute('position', ...) etc., this produces geometry identical to
 * new THREE.BoxGeometry(w, h, d).
 *
 * @param w  Width  (X axis half-extent = w/2)
 * @param h  Height (Y axis half-extent = h/2)
 * @param d  Depth  (Z axis half-extent = d/2)
 */
function buildBoxGeom(w: number, h: number, d: number): BoxGeomArrays {
    const hw = w / 2;
    const hh = h / 2;
    const hd = d / 2;

    // 24 vertices × 3 components = 72 floats each for positions/normals
    const positions = new Float32Array(72);
    const normals   = new Float32Array(72);
    // 24 vertices × 2 UV components = 48 floats
    const uvs       = new Float32Array(48);
    // 6 faces × 6 indices = 36
    const indices   = new Uint16Array(36);

    // Face definitions: normal vector + 4 corner positions (CCW from outside).
    // Each entry: [nx, ny, nz, p0x,p0y,p0z, p1x,p1y,p1z, p2x,p2y,p2z, p3x,p3y,p3z]
    // Winding: triangles (0,1,2) and (0,2,3) are CCW when viewed from the normal side.
    const faceData: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number][] = [
        // +X face  (right, normal = +X)
        [ 1,  0,  0,   hw, -hh, -hd,   hw,  hh, -hd,   hw,  hh,  hd,   hw, -hh,  hd],
        // -X face  (left, normal = -X)
        [-1,  0,  0,  -hw, -hh,  hd,  -hw,  hh,  hd,  -hw,  hh, -hd,  -hw, -hh, -hd],
        // +Y face  (top, normal = +Y)
        [ 0,  1,  0,  -hw,  hh, -hd,   hw,  hh, -hd,   hw,  hh,  hd,  -hw,  hh,  hd],
        // -Y face  (bottom, normal = -Y)
        [ 0, -1,  0,  -hw, -hh,  hd,   hw, -hh,  hd,   hw, -hh, -hd,  -hw, -hh, -hd],
        // +Z face  (front, normal = +Z)
        [ 0,  0,  1,  -hw, -hh,  hd,   hw, -hh,  hd,   hw,  hh,  hd,  -hw,  hh,  hd],
        // -Z face  (back, normal = -Z)
        [ 0,  0, -1,   hw, -hh, -hd,  -hw, -hh, -hd,  -hw,  hh, -hd,   hw,  hh, -hd],
    ];

    // UV coordinates for each of the 4 corners per face (planar mapping)
    const cornerUVs: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];

    for (let f = 0; f < 6; f++) {
        const fd = faceData[f];
        const nx = fd[0], ny = fd[1], nz = fd[2];
        const vBase = f * 4;

        for (let v = 0; v < 4; v++) {
            const pi = (vBase + v) * 3;
            // Position: fd[3 + v*3], fd[4 + v*3], fd[5 + v*3]
            positions[pi    ] = fd[3 + v * 3];
            positions[pi + 1] = fd[4 + v * 3];
            positions[pi + 2] = fd[5 + v * 3];
            // Normal: same for all 4 vertices of a face
            normals[pi    ] = nx;
            normals[pi + 1] = ny;
            normals[pi + 2] = nz;
            // UV
            const ui = (vBase + v) * 2;
            uvs[ui    ] = cornerUVs[v][0];
            uvs[ui + 1] = cornerUVs[v][1];
        }

        // Two triangles per face: (0,1,2) and (0,2,3)
        const iBase = f * 6;
        indices[iBase    ] = vBase;
        indices[iBase + 1] = vBase + 1;
        indices[iBase + 2] = vBase + 2;
        indices[iBase + 3] = vBase;
        indices[iBase + 4] = vBase + 2;
        indices[iBase + 5] = vBase + 3;
    }

    return { positions, normals, uvs, indices };
}

// ---------------------------------------------------------------------------
// Translation-matrix builder (column-major, THREE.js convention)
// ---------------------------------------------------------------------------

/**
 * Write a pure translation 4×4 matrix into `out` at `offset` (16 floats).
 *
 * THREE.js Matrix4 stores elements in column-major order:
 *   elements[0..3]   = column 0
 *   elements[4..7]   = column 1
 *   elements[8..11]  = column 2
 *   elements[12..15] = column 3  (translation x, y, z, 1)
 *
 * InstancedMesh.setMatrixAt(i, mat) calls mat.toArray() which reads
 * mat.elements directly — so this layout is the correct target.
 *
 * On the main thread: `new THREE.Matrix4().fromArray(matrices, i * 16)`
 * produces the correct Matrix4 from these 16 floats.
 */
function writeTranslationMatrix(
    x: number, y: number, z: number,
    out: Float32Array, offset: number,
): void {
    out[offset     ] = 1; out[offset +  1] = 0; out[offset +  2] = 0; out[offset +  3] = 0;
    out[offset +  4] = 0; out[offset +  5] = 1; out[offset +  6] = 0; out[offset +  7] = 0;
    out[offset +  8] = 0; out[offset +  9] = 0; out[offset + 10] = 1; out[offset + 11] = 0;
    out[offset + 12] = x; out[offset + 13] = y; out[offset + 14] = z; out[offset + 15] = 1;
}

// ---------------------------------------------------------------------------
// Core geometry computation — called per worker message
// ---------------------------------------------------------------------------

function processRequest(req: GeometryWorkerRequest): GeometryWorkerResult {
    const {
        requestId, wallId, cells,
        mullionSize, panelThickness, wallHeight, wallLength,
        uLinesT, vLinesT,
    } = req;

    // ── Fallback glass panels ─────────────────────────────────────────────
    const fallbackPanels: FallbackPanelResult[] = [];

    for (const cell of cells) {
        const panelWidth  = Math.max(0.01, cell.width  - mullionSize);
        const panelHeight = Math.max(0.01, cell.height - mullionSize);
        const cx = (cell.blX + cell.trX) / 2;
        const cy = (cell.blY + cell.trY) / 2;
        const geom = buildBoxGeom(panelWidth, panelHeight, panelThickness);
        fallbackPanels.push({ geom, cx, cy });
    }

    // ── Vertical mullion geometry + instance matrices ─────────────────────
    let vMullionBox: BoxGeomArrays | null = null;
    let vInstanceMatrices: Float32Array | null = null;

    if (uLinesT.length > 0) {
        vMullionBox = buildBoxGeom(mullionSize, wallHeight, mullionSize);
        vInstanceMatrices = new Float32Array(uLinesT.length * 16);
        const halfLength = wallLength / 2;
        for (let i = 0; i < uLinesT.length; i++) {
            const x = uLinesT[i] * wallLength - halfLength;
            const y = wallHeight / 2;
            writeTranslationMatrix(x, y, 0, vInstanceMatrices, i * 16);
        }
    }

    // ── Horizontal mullion geometry + instance matrices ───────────────────
    let hMullionBox: BoxGeomArrays | null = null;
    let hInstanceMatrices: Float32Array | null = null;

    if (vLinesT.length > 0) {
        hMullionBox = buildBoxGeom(wallLength, mullionSize, mullionSize);
        hInstanceMatrices = new Float32Array(vLinesT.length * 16);
        for (let i = 0; i < vLinesT.length; i++) {
            const y = vLinesT[i] * wallHeight;
            writeTranslationMatrix(0, y, 0, hInstanceMatrices, i * 16);
        }
    }

    return {
        requestId,
        wallId,
        fallbackPanels,
        vMullionBox,
        hMullionBox,
        vInstanceMatrices,
        hInstanceMatrices,
    };
}

// ---------------------------------------------------------------------------
// Worker message pump
// ---------------------------------------------------------------------------

self.addEventListener('message', (event: MessageEvent<GeometryWorkerRequest>) => {
    const req = event.data;

    // §4.2-ROBUST-FALLBACK: wrap all computation in try-catch so any unexpected
    // error is posted back as an error result rather than silently crashing.
    // The main-thread GeometryWorkerPool converts the `error` field into a
    // Promise rejection, allowing CurtainWallBuilder to fall back to sync build().
    let result: GeometryWorkerResult;
    try {
        result = processRequest(req);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[geometry.worker] processRequest failed:', message, err);
        self.postMessage({
            requestId:      req.requestId,
            wallId:         req.wallId,
            error:          message,
            fallbackPanels: [],
            vMullionBox:    null,
            hMullionBox:    null,
            vInstanceMatrices: null,
            hInstanceMatrices: null,
        } satisfies GeometryWorkerResult);
        return;
    }

    // Collect all transferable ArrayBuffers for zero-copy transfer
    const transferables: ArrayBuffer[] = [];

    for (const panel of result.fallbackPanels) {
        transferables.push(
            panel.geom.positions.buffer,
            panel.geom.normals.buffer,
            panel.geom.uvs.buffer,
            panel.geom.indices.buffer,
        );
    }
    if (result.vMullionBox) {
        transferables.push(
            result.vMullionBox.positions.buffer,
            result.vMullionBox.normals.buffer,
            result.vMullionBox.uvs.buffer,
            result.vMullionBox.indices.buffer,
        );
    }
    if (result.hMullionBox) {
        transferables.push(
            result.hMullionBox.positions.buffer,
            result.hMullionBox.normals.buffer,
            result.hMullionBox.uvs.buffer,
            result.hMullionBox.indices.buffer,
        );
    }
    if (result.vInstanceMatrices) {
        transferables.push(result.vInstanceMatrices.buffer);
    }
    if (result.hInstanceMatrices) {
        transferables.push(result.hInstanceMatrices.buffer);
    }

    // §4.2-ROBUST-FALLBACK: wrap postMessage so a DataCloneError (e.g. duplicate
    // buffer in transfer list) is caught and an error result sent instead.
    try {
        self.postMessage(result, transferables);
    } catch (postErr) {
        const message = postErr instanceof Error ? postErr.message : String(postErr);
        console.error('[geometry.worker] postMessage (transfer) failed:', message, postErr);
        self.postMessage({
            requestId:      req.requestId,
            wallId:         req.wallId,
            error:          `postMessage transfer failed: ${message}`,
            fallbackPanels: [],
            vMullionBox:    null,
            hMullionBox:    null,
            vInstanceMatrices: null,
            hInstanceMatrices: null,
        } satisfies GeometryWorkerResult);
    }
});
