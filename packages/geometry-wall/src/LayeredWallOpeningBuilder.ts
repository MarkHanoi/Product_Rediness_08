import * as THREE from '@pryzm/renderer-three/three';
import { toCreasedNormals } from '@pryzm/renderer-three';
import { WallData, Opening, WallLayer } from './WallTypes';

export interface OpeningCluster {
    minLeft: number;
    maxRight: number;
    openings: Opening[];
}

/**
 * Groups a sorted list of openings into non-overlapping horizontal clusters.
 * Two openings are in the same cluster if their horizontal spans overlap.
 * This is the same clustering algorithm used in the plain-wall opening path.
 */
export function clusterOpenings(openings: Opening[]): OpeningCluster[] {
    const sorted = [...openings].sort((a, b) => a.offset - b.offset);
    const clusters: OpeningCluster[] = [];

    for (const op of sorted) {
        const left  = op.offset - op.width / 2;
        const right = op.offset + op.width / 2;
        let merged = false;

        for (const cluster of clusters) {
            if (right >= cluster.minLeft - 0.001 && left <= cluster.maxRight + 0.001) {
                cluster.minLeft  = Math.min(cluster.minLeft, left);
                cluster.maxRight = Math.max(cluster.maxRight, right);
                cluster.openings.push(op);
                merged = true;
                break;
            }
        }

        if (!merged) {
            clusters.push({ minLeft: left, maxRight: right, openings: [op] });
        }
    }

    return clusters.sort((a, b) => a.minLeft - b.minLeft);
}

export interface LayerMiterNormals {
    start?: { nx: number; nz: number } | null;
    end?:   { nx: number; nz: number } | null;
}

interface OpeningRect {
    left: number;
    right: number;
    bottom: number;
    top: number;
}

function addUniqueBreak(values: number[], value: number): void {
    const rounded = Math.round(value * 1000000) / 1000000;
    if (!values.some(v => Math.abs(v - rounded) < 0.000001)) {
        values.push(rounded);
    }
}

function normaliseOpeningRects(openings: Opening[], wallLength: number, wallHeight: number): OpeningRect[] {
    const rects: OpeningRect[] = [];
    for (const op of openings) {
        const left = Math.max(0, op.offset - op.width / 2);
        const right = Math.min(wallLength, op.offset + op.width / 2);
        const bottom = Math.max(0, op.sillHeight ?? 0);
        const top = Math.min(wallHeight, (op.sillHeight ?? 0) + op.height);
        if (right - left > 0.001 && top - bottom > 0.001) {
            rects.push({ left, right, bottom, top });
        }
    }
    return rects;
}

function buildContinuousLayerGeometry(
    rects: OpeningRect[],
    wallLength: number,
    wallHeight: number,
    wallBaseOffset: number,
    direction: THREE.Vector3,
    outward: THREE.Vector3,
    layerCenter: number,
    layerThickness: number,
    startMN?: { nx: number; nz: number } | null,
    endMN?:   { nx: number; nz: number } | null,
): THREE.BufferGeometry {
    const xs = [0, wallLength];
    const ys = [0, wallHeight];
    for (const rect of rects) {
        addUniqueBreak(xs, rect.left);
        addUniqueBreak(xs, rect.right);
        addUniqueBreak(ys, rect.bottom);
        addUniqueBreak(ys, rect.top);
    }
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);

    const xCount = xs.length - 1;
    const yCount = ys.length - 1;
    const solid: boolean[][] = [];
    for (let i = 0; i < xCount; i++) {
        solid[i] = [];
        for (let j = 0; j < yCount; j++) {
            const cx = (xs[i] + xs[i + 1]) / 2;
            const cy = (ys[j] + ys[j + 1]) / 2;
            solid[i][j] = !rects.some(rect =>
                cx > rect.left + 0.0001 &&
                cx < rect.right - 0.0001 &&
                cy > rect.bottom + 0.0001 &&
                cy < rect.top - 0.0001
            );
        }
    }

    const positions: number[] = [];
    const indices: number[] = [];
    const half = layerThickness / 2;
    const back = layerCenter - half;
    const front = layerCenter + half;

    // §MITER-FIX: Pre-compute dot products for the miter plane projection.
    // The miter plane at the START (x=0) is defined by startMN; at the END
    // (x=wallLength) by endMN.  For a vertex at lateral offset z from the
    // baseline, the projection along the wall direction onto the miter plane is:
    //   effectiveX = xGrid − (MN · outward) * z / (MN · direction)
    // where xGrid is 0 or wallLength.  This is the same formula used by
    // buildMiterPrism, so joined layered walls with openings and without openings
    // produce geometrically identical miter caps.
    const startMnDotDir = startMN ? (startMN.nx * direction.x + startMN.nz * direction.z) : 0;
    const startMnDotOut = startMN ? (startMN.nx * outward.x   + startMN.nz * outward.z)   : 0;
    const endMnDotDir   = endMN   ? (endMN.nx   * direction.x + endMN.nz   * direction.z) : 0;
    const endMnDotOut   = endMN   ? (endMN.nx   * outward.x   + endMN.nz   * outward.z)   : 0;

    const pushVertex = (x: number, y: number, z: number): number => {
        let effectiveX = x;
        if (startMN && x < 1e-5 && Math.abs(startMnDotDir) > 1e-4) {
            effectiveX = -(startMnDotOut * z) / startMnDotDir;
        } else if (endMN && Math.abs(x - wallLength) < 1e-5 && Math.abs(endMnDotDir) > 1e-4) {
            effectiveX = wallLength - (endMnDotOut * z) / endMnDotDir;
        }
        const horizontal = direction.clone().multiplyScalar(effectiveX).add(outward.clone().multiplyScalar(z));
        positions.push(horizontal.x, wallBaseOffset + y, horizontal.z);
        return positions.length / 3 - 1;
    };

    const addQuad = (
        a: [number, number, number],
        b: [number, number, number],
        c: [number, number, number],
        d: [number, number, number],
    ): void => {
        const ia = pushVertex(a[0], a[1], a[2]);
        const ib = pushVertex(b[0], b[1], b[2]);
        const ic = pushVertex(c[0], c[1], c[2]);
        const id = pushVertex(d[0], d[1], d[2]);
        indices.push(ia, ib, ic, ia, ic, id);
    };

    const isSolid = (i: number, j: number): boolean =>
        i >= 0 && i < xCount && j >= 0 && j < yCount && solid[i][j];

    // §96-LAYERED-SEAM-FIX (2026-05-24) — FRONT/BACK faces: greedy-merge adjacent
    // solid cells into maximal rectangles. The old per-cell emission put a quad
    // boundary at every grid break (e.g. the opening's left/right x), so a door
    // produced a FULL-HEIGHT coplanar edge beside it — the "division lines" the
    // architect saw on the wall face. Merging removes those internal face edges;
    // away from the opening the face is now a single quad.
    const covered: boolean[][] = Array.from({ length: xCount }, () => new Array<boolean>(yCount).fill(false));
    for (let i = 0; i < xCount; i++) {
        for (let j = 0; j < yCount; j++) {
            if (!solid[i]![j] || covered[i]![j]) continue;
            // widen along x while the cell is solid + not yet covered
            let w = 1;
            while (i + w < xCount && solid[i + w]![j] && !covered[i + w]![j]) w++;
            // grow along y while the WHOLE [i..i+w) span of row (j+h) is solid + uncovered
            let h = 1;
            growY: while (j + h < yCount) {
                for (let k = i; k < i + w; k++) {
                    if (!solid[k]![j + h] || covered[k]![j + h]) break growY;
                }
                h++;
            }
            for (let a = i; a < i + w; a++) for (let b = j; b < j + h; b++) covered[a]![b] = true;
            const X0 = xs[i]!, X1 = xs[i + w]!, Y0 = ys[j]!, Y1 = ys[j + h]!;
            addQuad([X0, Y0, front], [X1, Y0, front], [X1, Y1, front], [X0, Y1, front]);
            addQuad([X1, Y0, back], [X0, Y0, back], [X0, Y1, back], [X1, Y1, back]);
        }
    }

    // REVEAL (side / sill / head) faces: emit per cell only where the neighbour is
    // void. These are the real perpendicular faces of the opening — kept crisp.
    for (let i = 0; i < xCount; i++) {
        for (let j = 0; j < yCount; j++) {
            if (!solid[i]![j]) continue;
            const x0 = xs[i]!;
            const x1 = xs[i + 1]!;
            const y0 = ys[j]!;
            const y1 = ys[j + 1]!;
            if (!isSolid(i - 1, j)) {
                addQuad([x0, y0, back], [x0, y0, front], [x0, y1, front], [x0, y1, back]);
            }
            if (!isSolid(i + 1, j)) {
                addQuad([x1, y0, front], [x1, y0, back], [x1, y1, back], [x1, y1, front]);
            }
            if (!isSolid(i, j - 1)) {
                addQuad([x1, y0, front], [x0, y0, front], [x0, y0, back], [x1, y0, back]);
            }
            if (!isSolid(i, j + 1)) {
                addQuad([x0, y1, back], [x0, y1, front], [x1, y1, front], [x1, y1, back]);
            }
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    // §96-LAYERED-SEAM-FIX — creased normals: one shared normal per coplanar region
    // (the merged face shades as a single seamless surface) while the 90° reveal
    // edges stay hard. Mirrors the plain-wall CSG path (descriptorToBufferGeometry).
    const creased = toCreasedNormals(geometry, THREE.MathUtils.degToRad(30));
    geometry.dispose();
    creased.computeBoundingBox();
    creased.computeBoundingSphere();
    return creased;
}

/**
 * Builds wall-body segments for a straight layered wall that has openings.
 *
 * When miterNormals is supplied, the first segment of each layer (before the first
 * opening cluster) and the last segment (after the last cluster) are rendered with
 * miter-prism geometry instead of BoxGeometry so that wall-join miter cuts are
 * preserved when openings exist on a joined wall.
 *
 * Contract compliance:
 *   §02-Spatial-Projection: pure geometry function — reads WallData as read-only,
 *     never mutates store or semantic state.
 *   §03-Semantic-Model §03-1.3: Each layer is rendered as a separate mesh at the
 *     correct lateral offset from the baseline. Openings punch through ALL layers.
 *   §01-Core-Contract §4.1: Calling this function multiple times with the same data
 *     produces identical geometry (all randomness is in caller's fragment ID generation).
 *
 * @param wall           - The WallData (must have wall.layers and wall.openings).
 * @param wallGroup      - The Three.js Group that is the wall's scene root.
 * @param clusters       - Pre-computed opening clusters (from clusterOpenings()).
 * @param totalThickness - Sum of all layer thicknesses.
 * @param miterNormals   - Optional miter normals from WallJoinResolver; when provided,
 *                         the start (x=0) and end (x=wallLength) cap vertices of each
 *                         layer are projected onto the miter plane so that joined layered
 *                         walls with openings have the same miter geometry as those
 *                         without openings.
 * @returns Array of THREE.Mesh objects added to wallGroup (for caller's fragment tracking).
 */
export function buildLayeredWallSegmentsAroundOpenings(
    wall: WallData,
    wallGroup: THREE.Group,
    clusters: OpeningCluster[],
    totalThickness: number,
    miterNormals?: LayerMiterNormals,
): THREE.Mesh[] {
    const addedMeshes: THREE.Mesh[] = [];

    const [start, end] = wall.baseLine;
    const directionVec  = new THREE.Vector3().subVectors(end, start);
    const wallLength    = directionVec.length();
    const direction     = directionVec.clone().normalize();
    const outward       = new THREE.Vector3(-direction.z, 0, direction.x);

    const wallHeight    = wall.height;
    const wallBaseOffset = wall.baseOffset;
    const openingRects = normaliseOpeningRects(
        clusters.flatMap(cluster => cluster.openings),
        wallLength,
        wallHeight,
    );

    let layerCursor = -totalThickness / 2;

    for (const [layerIndex, layer] of (wall.layers as WallLayer[]).entries()) {
        const layerCenter = layerCursor + layer.thickness / 2;
        layerCursor += layer.thickness;

        const matColor = (layer as any).materialColor ?? wall.materialColor ?? '#d4c5b0';
        const layerMat = new THREE.MeshStandardMaterial({
            color:     matColor,
            roughness: 0.85,
            metalness: 0.0,
        });

        const commonUserData = {
            role:       'geometry',
            selectable: false,
            wallId:     wall.id,
            parentId:   wall.id,
            layerName:  layer.name,
            layerFunction: layer.function,
            layerIndex,
        };

        const geo = buildContinuousLayerGeometry(
            openingRects,
            wallLength,
            wallHeight,
            wallBaseOffset,
            direction,
            outward,
            layerCenter,
            layer.thickness,
            miterNormals?.start,
            miterNormals?.end,
        );
        const mesh = new THREE.Mesh(geo, layerMat.clone());
        mesh.userData = { ...commonUserData };
        mesh.position.set(0, 0, 0);
        wallGroup.add(mesh);
        addedMeshes.push(mesh);
    }

    return addedMeshes;
}
