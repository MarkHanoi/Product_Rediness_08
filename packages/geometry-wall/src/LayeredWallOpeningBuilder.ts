import * as THREE from '@pryzm/renderer-three/three';
import { toCreasedNormals, mergeGeometries } from '@pryzm/renderer-three';
import { WallData, Opening, WallLayer } from './WallTypes';
import { WALL_DEFAULT_BODY_COLOUR } from './WallDefaultBodyColour';

/**
 * §PERF-PHASE2 — wall-layer mesh-explosion cap.
 *
 * A layered wall with openings emits one mesh+material PER LAYER (see
 * buildLayeredWallSegmentsAroundOpenings). A wall whose system type stacks many
 * layers (e.g. brick / cavity / blockwork / service-void / plasterboard +
 * skim = 5-7 layers) therefore produces 5-7 separate draw calls EACH, and a
 * façade of such walls multiplies that across every wall — the layered-wall mesh
 * explosion the spike flagged.
 *
 * Cap: once a wall's layer-mesh count exceeds MAX_WALL_LAYER_SEGMENTS, layers
 * that share an IDENTICAL material colour are MERGED into a single mesh per
 * colour (mergeGeometries on the already-built per-layer geometries). Because the
 * merged geometries share one material and live in the same wall-local space, the
 * union is pixel-for-pixel identical to the separate meshes — only the draw-call
 * count drops. Layers with distinct colours are NEVER merged (visual result
 * preserved). Under the threshold, the path is byte-identical to before (no merge).
 *
 * Openings are unaffected: each layer geometry already encodes the opening voids
 * (buildContinuousLayerGeometry punches the grid), so merging same-colour layers
 * simply concatenates void-correct geometries. This path is the NON-CSG layered
 * path; CSG/plain walls are untouched.
 */
export const MAX_WALL_LAYER_SEGMENTS = 4;

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
        // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): offset is the LEFT EDGE of the
        // span [offset, offset+width]; aligns the layered void with the frame centre
        // (offset + width/2) placed by createDoorFrame/createWindowFrame.
        const left  = op.offset;
        const right = op.offset + op.width;
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
        // §OPENING-OFFSET-LEFTEDGE-UNIFY: offset is the LEFT EDGE; span = [offset, offset+width].
        const left = Math.max(0, op.offset);
        const right = Math.min(wallLength, op.offset + op.width);
        const bottom = Math.max(0, op.sillHeight ?? 0);
        const top = Math.min(wallHeight, (op.sillHeight ?? 0) + op.height);
        if (right - left > 0.001 && top - bottom > 0.001) {
            rects.push({ left, right, bottom, top });
        }
    }
    return rects;
}

// §WALL-NAN-GUARD (2026-06-25) — one-shot latch so the defensive non-finite
// fallback below logs ONCE per (wallId|layerIndex) instead of flooding the
// console every wall rebuild (the symptom we are eliminating).
const _nanGuardLogged = new Set<string>();

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
    // §WALL-NAN-GUARD — identity for the one-shot non-finite diagnostic.
    wallId?: string,
    layerIndex?: number,
): THREE.BufferGeometry {
    // §WALL-NAN-GUARD (2026-06-25) — DEFENCE-IN-DEPTH against a NaN baseOffset /
    // NaN scalar reaching the BufferGeometry. The canonical regression
    // (§RESI-FACADE-INTERIOR-WHITE layered perimeter walls) passed an `undefined`
    // wall.baseOffset straight into `wallBaseOffset + y` → every vertex Y was NaN →
    // computeBoundingBox()/computeBoundingSphere() spammed "Computed min/max have
    // NaN values" / "radius is NaN" once per wall rebuild AND the wall vanished.
    // The caller now defaults baseOffset to 0 (root fix), but we coerce here too so
    // ANY non-finite scalar input (baseOffset, length, height, layer offset) cannot
    // produce a NaN-coordinate geometry. A wrong-but-finite wall beats a NaN flood.
    if (!Number.isFinite(wallBaseOffset)) wallBaseOffset = 0;
    if (!Number.isFinite(wallLength))     wallLength = 0;
    if (!Number.isFinite(wallHeight))     wallHeight = 0;
    if (!Number.isFinite(layerCenter))    layerCenter = 0;
    if (!Number.isFinite(layerThickness)) layerThickness = 0;
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

    // §MITER-T-CLAMP (twin of MiterPrismBuilder, founder 2026-06-18 "walls go off
    // extruding really a lot") — when the miter normal is near-parallel to the wall
    // (MnDotDir → 0, a degenerate/very-acute corner) the projection `(MnDotOut·z)/MnDotDir`
    // blows up to hundreds of metres, slicing the opening-wall cap off into empty space.
    // A real building miter projects well under a metre past the wall end; clamp the
    // projection so a degenerate corner square-caps instead of running away. Legitimate
    // mitres (small offset) are byte-identical.
    const MITER_PROJ_MAX_M = 1.0;
    const clampProj = (off: number): number =>
        off > MITER_PROJ_MAX_M ? MITER_PROJ_MAX_M : (off < -MITER_PROJ_MAX_M ? -MITER_PROJ_MAX_M : off);
    const pushVertex = (x: number, y: number, z: number): number => {
        let effectiveX = x;
        if (startMN && x < 1e-5 && Math.abs(startMnDotDir) > 1e-4) {
            effectiveX = clampProj(-(startMnDotOut * z) / startMnDotDir);
        } else if (endMN && Math.abs(x - wallLength) < 1e-5 && Math.abs(endMnDotDir) > 1e-4) {
            effectiveX = wallLength + clampProj(-(endMnDotOut * z) / endMnDotDir);
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

    // §WALL-NAN-GUARD (2026-06-25) — final safety net: if any computed vertex
    // position is non-finite, the BufferGeometry would spam computeBoundingBox()/
    // computeBoundingSphere() NaN warnings every rebuild AND the wall would not
    // render. Detect it here, log ONCE (latched by wallId|layerIndex), and fall
    // back to a valid plain box spanning the layer's extent so the wall renders as
    // a simple solid rather than vanishing. This kills the console flood regardless
    // of the upstream root cause (bad baseOffset, bad miter projection, etc.).
    let _positionsFinite = true;
    for (let pi = 0; pi < positions.length; pi++) {
        if (!Number.isFinite(positions[pi])) { _positionsFinite = false; break; }
    }
    if (!_positionsFinite) {
        const key = `${wallId ?? '?'}|${layerIndex ?? '?'}`;
        if (!_nanGuardLogged.has(key)) {
            _nanGuardLogged.add(key);
            console.warn(
                `[LayeredWallOpeningBuilder] §WALL-NAN-GUARD non-finite vertex in layered ` +
                `opening geometry — wall=${wallId ?? '?'} layer=${layerIndex ?? '?'} ` +
                `(len=${wallLength} h=${wallHeight} baseOff=${wallBaseOffset} ` +
                `layerCenter=${layerCenter} layerThk=${layerThickness} ` +
                `startMN=${startMN ? `${startMN.nx},${startMN.nz}` : 'none'} ` +
                `endMN=${endMN ? `${endMN.nx},${endMN.nz}` : 'none'}). ` +
                `Falling back to a plain box so the wall still renders.`,
            );
        }
        // Build a clean axis-aligned box for the layer along the wall direction.
        // All inputs were coerced finite at the top, so this box is always valid.
        const safeLen   = Math.max(1e-3, wallLength);
        const safeHt    = Math.max(1e-3, wallHeight);
        const safeThk   = Math.max(1e-3, layerThickness);
        const fallback  = new THREE.BoxGeometry(safeLen, safeHt, safeThk);
        // Box is centred at origin and axis-aligned along local X (= wall length).
        // Rotate FIRST about the origin to align local X with `direction`, THEN
        // translate to the layer's placement (mid-length along `direction`, lateral
        // `layerCenter` along `outward`, vertical centre at baseOffset + height/2).
        const ang = Math.atan2(direction.z, direction.x);
        fallback.rotateY(-ang);
        const mid = direction.clone().multiplyScalar(safeLen / 2)
            .add(outward.clone().multiplyScalar(layerCenter));
        fallback.translate(mid.x, wallBaseOffset + safeHt / 2, mid.z);
        fallback.computeVertexNormals();
        fallback.computeBoundingBox();
        fallback.computeBoundingSphere();
        return fallback;
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
    // §WALL-NAN-GUARD (2026-06-25) — ROOT FIX. `wall.baseOffset` is typed `number`
    // but the generator/command path (e.g. §RESI-FACADE-INTERIOR-WHITE shell walls,
    // which carry NO baseOffset) leaves it `undefined` at render time. Feeding
    // `undefined` into `wallBaseOffset + y` below produced a NaN Y on EVERY vertex,
    // which the BufferGeometry then reported as NaN min/max + NaN radius once per
    // wall rebuild, and the wall vanished. The plain-wall path already defends with
    // `?? 0` (WallFragmentBuilder §FIX-NAN-Y); the layered-opening path did not.
    const wallBaseOffset = Number.isFinite(wall.baseOffset as number) ? (wall.baseOffset as number) : 0;
    const openingRects = normaliseOpeningRects(
        clusters.flatMap(cluster => cluster.openings),
        wallLength,
        wallHeight,
    );

    let layerCursor = -totalThickness / 2;

    // ── Build the per-layer geometry + resolved colour first ──────────────────
    // §PERF-PHASE2 — collect geometries so we can OPTIONALLY merge same-colour
    // layers into one mesh below. Under the threshold this loop is byte-identical
    // to the old per-layer emission (no merge).
    interface BuiltLayer {
        geo: THREE.BufferGeometry;
        matColor: string;
        layer: WallLayer;
        layerIndex: number;
    }
    const built: BuiltLayer[] = [];
    for (const [layerIndex, layer] of (wall.layers as WallLayer[]).entries()) {
        const layerCenter = layerCursor + layer.thickness / 2;
        layerCursor += layer.thickness;

        // §L934-ONE-WALL-ONE-COLOUR — the third copy of the beige default, on the
        // layered-WITH-OPENINGS arm. §BEIGE-WALL-FIX (2026-06-08) purged this literal
        // from the instanced arm and left all three layered arms carrying it, so which
        // colour a wall got depended on which arm the router picked. Imported from
        // `WallFragmentBuilder` so there is exactly ONE declaration of the default.
        const matColor: string = (layer as any).materialColor ?? wall.materialColor ?? WALL_DEFAULT_BODY_COLOUR;
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
            wall.id,
            layerIndex,
        );
        built.push({ geo, matColor, layer, layerIndex });
    }

    const makeMat = (matColor: string): THREE.MeshStandardMaterial =>
        new THREE.MeshStandardMaterial({ color: matColor, roughness: 0.85, metalness: 0.0 });

    const emitMesh = (
        geo: THREE.BufferGeometry,
        matColor: string,
        userData: Record<string, unknown>,
    ): void => {
        const mesh = new THREE.Mesh(geo, makeMat(matColor));
        mesh.userData = userData;
        mesh.position.set(0, 0, 0);
        wallGroup.add(mesh);
        addedMeshes.push(mesh);
    };

    // ── §PERF-PHASE2 cap: merge same-colour layers when over the threshold ────
    // Only merges geometries that share an IDENTICAL colour → visually identical
    // (one material, unioned geometry). Distinct-colour layers stay separate.
    if (built.length > MAX_WALL_LAYER_SEGMENTS) {
        // Group layer indices by resolved colour, preserving first-seen order.
        const byColor = new Map<string, BuiltLayer[]>();
        for (const b of built) {
            const g = byColor.get(b.matColor);
            if (g) g.push(b);
            else byColor.set(b.matColor, [b]);
        }
        for (const [matColor, group] of byColor) {
            if (group.length === 1) {
                // Single layer of this colour — emit as-is (no merge needed).
                const b = group[0]!;
                emitMesh(b.geo, matColor, {
                    role: 'geometry', selectable: false, wallId: wall.id, parentId: wall.id,
                    layerName: b.layer.name, layerFunction: b.layer.function, layerIndex: b.layerIndex,
                });
                continue;
            }
            // Merge all geometries of this colour into ONE. mergeGeometries returns
            // null if the inputs are attribute-incompatible — fall back to per-layer
            // emission in that (not expected) case so nothing is dropped.
            const merged = mergeGeometries(group.map(b => b.geo), false);
            if (merged) {
                merged.computeBoundingBox();
                merged.computeBoundingSphere();
                // Dispose the now-merged source geometries.
                for (const b of group) b.geo.dispose();
                emitMesh(merged, matColor, {
                    role: 'geometry', selectable: false, wallId: wall.id, parentId: wall.id,
                    // Per-layer name/function/index are not load-bearing for selection
                    // (which keys on wallId); record the set that was merged for debug.
                    layerMerged: true,
                    layerIndices: group.map(b => b.layerIndex),
                    layerNames: group.map(b => b.layer.name),
                });
            } else {
                for (const b of group) {
                    emitMesh(b.geo, matColor, {
                        role: 'geometry', selectable: false, wallId: wall.id, parentId: wall.id,
                        layerName: b.layer.name, layerFunction: b.layer.function, layerIndex: b.layerIndex,
                    });
                }
            }
        }
        return addedMeshes;
    }

    // ── Under threshold: original per-layer emission (byte-identical to before) ─
    for (const b of built) {
        emitMesh(b.geo, b.matColor, {
            role: 'geometry', selectable: false, wallId: wall.id, parentId: wall.id,
            layerName: b.layer.name, layerFunction: b.layer.function, layerIndex: b.layerIndex,
        });
    }

    return addedMeshes;
}
