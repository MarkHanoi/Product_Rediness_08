import * as THREE from '@pryzm/renderer-three/three';
import { RoofData, SlopeArrow } from './RoofTypes.js';
import { gableRidge } from './roofRidgeAxis.js';

type Pt = [number, number]; // [x, z] in level-local space

interface Group { start: number; count: number; materialIndex: number; }
interface BBox  { minX: number; maxX: number; minZ: number; maxZ: number; }

/**
 * Pure static geometry factory for all RoofType values.
 * Implements §3 of 02-ROOF-GEOMETRY-ENGINE-CONTRACT.
 *
 * Material slot assignments (§2.5):
 *   Slot 0 – Trim / Fascia (white):   gable ends, fascia bands, side trim
 *   Slot 1 – Deck (light grey):        bottom soffit
 *   Slot 2 – Interior (near white):    interior ceiling (not generated yet)
 *   Slot 3 – Shingle (warm tan):       outer roofing surface
 *
 * Phase 2 note: all materials use DoubleSide so faces render regardless of
 * winding direction. Phase 3 will audit winding and switch to FrontSide for
 * slot 3 for performance.
 */
export class RoofGeometryBuilder {

    // ──────────────────────────────────────────────────────────────────────────
    // ROUTER (§3.1)
    // ──────────────────────────────────────────────────────────────────────────

    static generate(data: Readonly<RoofData>): THREE.BufferGeometry {
        // P3.4 — Segment composition: if segments defined, merge their geometries
        if (data.segments && data.segments.length > 0) {
            return this._buildSegmentedGeometry(data);
        }

        switch (data.roofType) {
            case 'flat':      return this.generateFlat(data);
            case 'shed':      return this.generateShed(data);
            case 'gable':     return this.generateGable(data);
            case 'hip':       return this.generateHip(data);
            case 'dutch':     return this.generateDutchHip(data);
            case 'gambrel':   return this.generateGambrel(data);
            case 'mansard':   return this.generateMansard(data);
            case 'barrel':    return this.generateBarrel(data);
            case 'by_region': return this.generateByRegion(data);
            default:          return this.generateFlat(data);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // P3.4 — SEGMENT COMPOSITION
    // ──────────────────────────────────────────────────────────────────────────

    private static _buildSegmentedGeometry(data: Readonly<RoofData>): THREE.BufferGeometry {
        const geometries: THREE.BufferGeometry[] = [];

        for (const seg of data.segments!) {
            const segData: Readonly<RoofData> = {
                ...data,
                footprint: seg.subPolygon,
                roofType:  seg.roofType,
                slope:     seg.slope     ?? data.slope,
                overhang:  seg.overhang  ?? data.overhang,
                thickness: seg.thickness ?? data.thickness,
                segments:  undefined,   // prevent infinite recursion
                slopeArrows: undefined, // slope arrows are segment-level, not nested
            } as RoofData;
            geometries.push(this.generate(segData));
        }

        if (geometries.length === 0) return new THREE.BufferGeometry();
        if (geometries.length === 1) return geometries[0];
        return this._mergeGeometries(geometries);
    }

    /**
     * Merges multiple BufferGeometries by concatenating their vertex arrays.
     * Preserves material groups by offsetting their index ranges.
     */
    private static _mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
        const allPositions: number[] = [];
        const allIndices:   number[] = [];
        const allGroups:    Group[]  = [];
        let   vertexOffset = 0;
        let   indexCursor  = 0;

        for (const geo of geos) {
            geo.computeVertexNormals();
            const posArr = geo.getAttribute('position') as THREE.BufferAttribute;
            const idxArr = geo.index;

            if (!posArr || !idxArr) continue;

            const posData = posArr.array as Float32Array;
            const idxData = idxArr.array as Uint16Array | Uint32Array;

            for (let i = 0; i < posData.length; i++) allPositions.push(posData[i]);
            for (let i = 0; i < idxData.length; i++) allIndices.push(idxData[i] + vertexOffset);

            for (const grp of geo.groups) {
                allGroups.push({
                    start:         grp.start + indexCursor,
                    count:         grp.count,
                    materialIndex: grp.materialIndex ?? 0,
                });
            }

            vertexOffset += posData.length / 3;
            indexCursor  += idxData.length;
        }

        return this._toGeo(allPositions, allIndices, allGroups);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // FLAT  (§3.2)
    // ──────────────────────────────────────────────────────────────────────────

    static generateFlat(data: Readonly<RoofData>): THREE.BufferGeometry {
        const pts = this._resolvePolygon(data);
        if (pts.length < 3) {
            return new THREE.BufferGeometry();
        }
        return this._buildExtrudedPolygon(pts, data.thickness);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SHED / SINGLE SLOPE  (§3.3)
    // ──────────────────────────────────────────────────────────────────────────

    static generateShed(data: Readonly<RoofData>): THREE.BufferGeometry {
        const pts = this._resolvePolygon(data);
        if (pts.length < 3) return this.generateFlat(data);

        const slope     = data.slope    ?? 0.05;
        const overhang  = data.overhang ?? 0;
        const thickness = data.thickness;

        const eavePts = this._applyOverhang(pts, overhang);
        const n       = eavePts.length;

        // Slope direction = direction of the longest edge
        let maxEdge = 0;
        const slopeDir = new THREE.Vector2(1, 0);
        for (let i = 0; i < n; i++) {
            const a = new THREE.Vector2(...eavePts[i]);
            const b = new THREE.Vector2(...eavePts[(i + 1) % n]);
            const d = a.distanceTo(b);
            if (d > maxEdge) { maxEdge = d; slopeDir.subVectors(b, a).normalize(); }
        }

        const heights = eavePts.map(([x, z]) =>
            new THREE.Vector2(x, z).dot(slopeDir) * slope
        );

        return this._buildVariableHeightRoof(eavePts, heights, thickness);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GABLE  (§3.4)
    // ──────────────────────────────────────────────────────────────────────────

    static generateGable(data: Readonly<RoofData>): THREE.BufferGeometry {
        const pts = this._resolvePolygon(data);
        if (pts.length < 3) return this.generateFlat(data);

        const slope     = data.slope    ?? 0.4;
        const overhang  = data.overhang ?? 0;
        const thickness = data.thickness;

        const eavePts = this._applyOverhang(pts, overhang);

        // A.21.D24 §RIDGE-PRINCIPAL-AXIS — the gable ridge must run along the
        // footprint's PRINCIPAL axis (its longest edge direction), NOT world X/Z.
        // The prior code derived the ridge from the axis-aligned bbox, which is
        // wrong for a rotated / skewed / parallelogram footprint (the founder's
        // 16°-skewed plot): the ridge endpoints landed at the bbox corners and the
        // eave→ridge slope faces sheared into a broken gable. `gableRidge` (pure,
        // THREE-free) builds the ridge in the footprint's own (u = principal axis,
        // v = perpendicular) frame: the ridge runs along u at the centre of the
        // v-extent, spanning the full u-extent. For an axis-aligned rectangle the
        // principal axis IS world X or Z, so this reproduces the old result EXACTLY
        // (no regression).
        const { ridge, ridgeH: axisRidgeH } = gableRidge(eavePts, slope);
        const [rP1, rP2] = ridge;

        // P3.5 — Slope Arrows: if per-edge slopes are defined, compute ridge height
        // as the minimum contribution from all edges (most restrictive edge governs);
        // otherwise the principal-axis half-perp height that `gableRidge` derives.
        const ridgeH = (data.slopeArrows && data.slopeArrows.length > 0)
            ? this._computeSlopeArrowRidgeH(eavePts, data.slopeArrows, slope)
            : axisRidgeH;

        return this._buildMultiLevel(
            eavePts, 0,
            [rP1, rP2], ridgeH,
            null, 0,
            thickness
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // HIP  (§3.5)
    // ──────────────────────────────────────────────────────────────────────────

    static generateHip(data: Readonly<RoofData>): THREE.BufferGeometry {
        const pts = this._resolvePolygon(data);
        if (pts.length < 3) return this.generateFlat(data);

        const globalSlope = data.slope    ?? 0.3;
        const overhang    = data.overhang ?? 0;
        const thickness   = data.thickness;

        const eavePts  = this._applyOverhang(pts, overhang);
        const inradius = this._computeInradius(eavePts);

        // P3.5 — Slope Arrows: if per-edge slopes are defined, compute ridge height
        // as the minimum contribution from all edges (most restrictive edge governs).
        const ridgeH = (data.slopeArrows && data.slopeArrows.length > 0)
            ? this._computeSlopeArrowRidgeH(eavePts, data.slopeArrows, globalSlope)
            : inradius * globalSlope;

        // Shrink to get ridge polygon
        const ridgePts = this._shrinkPolygon(eavePts, inradius);

        if (ridgePts.length === 0) {
            // Fully degenerate → single apex pyramid
            const cx = eavePts.reduce((s, p) => s + p[0], 0) / eavePts.length;
            const cz = eavePts.reduce((s, p) => s + p[1], 0) / eavePts.length;
            return this._buildMultiLevel(eavePts, 0, [[cx, cz]], ridgeH, null, 0, thickness);
        }

        return this._buildMultiLevel(eavePts, 0, ridgePts, ridgeH, null, 0, thickness);
    }

    /**
     * P3.5 — Compute ridge height from per-edge slope arrows.
     *
     * For each footprint edge, compute how high the ridge must be to satisfy
     * that edge's slope: ridgeH_edge = distFromCentroidToEdge × edgeSlope.
     * The actual ridge height is the minimum over all edges (most restrictive).
     */
    private static _computeSlopeArrowRidgeH(
        eavePts:    Pt[],
        slopeArrows: SlopeArrow[],
        globalSlope: number,
    ): number {
        const n  = eavePts.length;
        const cx = eavePts.reduce((s, p) => s + p[0], 0) / n;
        const cz = eavePts.reduce((s, p) => s + p[1], 0) / n;
        let   minH = Infinity;

        for (let i = 0; i < n; i++) {
            const arrow      = slopeArrows.find(a => a.edgeIndex === i);
            const edgeSlope  = arrow ? arrow.slope : globalSlope;
            const a          = eavePts[i];
            const b          = eavePts[(i + 1) % n];
            const distToEdge = this._distPointToSeg(cx, cz, a[0], a[1], b[0], b[1]);
            const h          = distToEdge * edgeSlope;
            if (h < minH) minH = h;
        }

        return minH < Infinity ? minH : this._computeInradius(eavePts) * globalSlope;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // DUTCH HIP  (§3.6)
    // ──────────────────────────────────────────────────────────────────────────

    static generateDutchHip(data: Readonly<RoofData>): THREE.BufferGeometry {
        const pts = this._resolvePolygon(data);
        if (pts.length < 3) return this.generateFlat(data);

        const slope     = data.slope    ?? 0.3;
        const overhang  = data.overhang ?? 0;
        const thickness = data.thickness;

        const eavePts  = this._applyOverhang(pts, overhang);
        const inradius = this._computeInradius(eavePts);
        const ridgeH   = inradius * slope;

        let ridgePts = this._shrinkPolygon(eavePts, inradius);

        if (ridgePts.length === 0) {
            const cx = eavePts.reduce((s, p) => s + p[0], 0) / eavePts.length;
            const cz = eavePts.reduce((s, p) => s + p[1], 0) / eavePts.length;
            ridgePts = [[cx, cz]];
        }

        // Dutch hip: if ridge is a line (2 pts), truncate each end by 20%
        // and add small gable triangles at the truncated ends
        if (ridgePts.length === 2) {
            const [p1, p2] = ridgePts;
            const dx = p2[0] - p1[0], dz = p2[1] - p1[1];
            const trunc = 0.20; // 20% truncation at each end
            const truncatedRidge: Pt[] = [
                [p1[0] + dx * trunc, p1[1] + dz * trunc],
                [p2[0] - dx * trunc, p2[1] - dz * trunc],
            ];
            return this._buildMultiLevel(eavePts, 0, truncatedRidge, ridgeH, null, 0, thickness);
        }

        return this._buildMultiLevel(eavePts, 0, ridgePts, ridgeH, null, 0, thickness);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GAMBREL  (§3.7)
    // ──────────────────────────────────────────────────────────────────────────

    static generateGambrel(data: Readonly<RoofData>): THREE.BufferGeometry {
        const pts = this._resolvePolygon(data);
        if (pts.length < 3) return this.generateFlat(data);

        const slope     = data.slope    ?? 0.6;
        const overhang  = data.overhang ?? 0;
        const thickness = data.thickness;

        const eavePts = this._applyOverhang(pts, overhang);
        const bb      = this._bbox(eavePts);
        const spanX   = bb.maxX - bb.minX;
        const spanZ   = bb.maxZ - bb.minZ;

        const ridgeAlongX = spanX >= spanZ;
        const halfPerp    = ridgeAlongX ? spanZ / 2 : spanX / 2;
        const centerPerp  = ridgeAlongX ? (bb.minZ + bb.maxZ) / 2 : (bb.minX + bb.maxX) / 2;
        const ridgeH      = halfPerp * slope;

        // Gambrel profile: two slopes per side
        // Lower slope: eave (0) → knee (kneeH) at kneePerp distance from center
        // Upper slope: knee (kneeH) → ridge (ridgeH) at center
        const kneePerp = halfPerp * 0.5;  // knee at 50% of half-span from center
        const kneeH    = ridgeH * 0.45;   // knee at 45% of ridge height

        // Knee polygon: clamp each vertex perpendicular coord to ±kneePerp
        const kneePts: Pt[] = eavePts.map(([x, z]) => {
            if (ridgeAlongX) {
                const dz = z - centerPerp;
                const clamped = Math.sign(dz) * Math.min(Math.abs(dz), kneePerp);
                return [x, centerPerp + clamped] as Pt;
            } else {
                const dx = x - centerPerp;
                const clamped = Math.sign(dx) * Math.min(Math.abs(dx), kneePerp);
                return [centerPerp + clamped, z] as Pt;
            }
        });

        // Deduplicate knee polygon (clamp may merge vertices)
        const deduped = this._deduplicatePts(kneePts);

        // Ridge line at centerPerp, spanning the full parallel extent
        const ridgePts: Pt[] = ridgeAlongX
            ? [[bb.minX, centerPerp], [bb.maxX, centerPerp]]
            : [[centerPerp, bb.minZ], [centerPerp, bb.maxZ]];

        return this._buildMultiLevel(eavePts, 0, deduped.length >= 3 ? deduped : kneePts, kneeH, ridgePts, ridgeH, thickness);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // MANSARD  (§3.8)
    // ──────────────────────────────────────────────────────────────────────────

    static generateMansard(data: Readonly<RoofData>): THREE.BufferGeometry {
        const pts = this._resolvePolygon(data);
        if (pts.length < 3) return this.generateFlat(data);

        const slope     = data.slope    ?? 0.5;
        const overhang  = data.overhang ?? 0;
        const thickness = data.thickness;

        const eavePts  = this._applyOverhang(pts, overhang);
        const inradius = this._computeInradius(eavePts);
        const ridgeH   = inradius * slope;

        // Mansard: lower steep slope (eave → skirt) + upper near-flat cap (skirt → top)
        const skirtInset = inradius * 0.4;
        const skirtH     = ridgeH * 0.75;

        const skirtPts = this._shrinkPolygon(eavePts, skirtInset);
        const topPts   = this._shrinkPolygon(eavePts, inradius);

        if (skirtPts.length < 3) return this.generateHip(data);

        const finalTop = topPts.length >= 3 ? topPts : skirtPts;
        return this._buildMultiLevel(eavePts, 0, skirtPts, skirtH, finalTop, ridgeH, thickness);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // BARREL  (§3.9 area — custom algorithm)
    // ──────────────────────────────────────────────────────────────────────────

    static generateBarrel(data: Readonly<RoofData>): THREE.BufferGeometry {
        const pts = this._resolvePolygon(data);
        if (pts.length < 3) return this.generateFlat(data);

        const overhang  = data.overhang ?? 0;
        const thickness = data.thickness;
        const segments  = 20;

        const eavePts = this._applyOverhang(pts, overhang);
        const bb      = this._bbox(eavePts);
        const spanX   = bb.maxX - bb.minX;
        const spanZ   = bb.maxZ - bb.minZ;

        // Barrel vault runs along the longer axis
        const barrelAlongX = spanX >= spanZ;
        const radius        = (barrelAlongX ? spanZ : spanX) / 2;
        const len           = barrelAlongX ? spanX : spanZ;
        const centerPar     = barrelAlongX ? (bb.minX + bb.maxX) / 2 : (bb.minZ + bb.maxZ) / 2;
        const centerPerp    = barrelAlongX ? (bb.minZ + bb.maxZ) / 2 : (bb.minX + bb.maxX) / 2;
        const halfLen       = len / 2;

        const positions: number[] = [];
        const indices:   number[] = [];
        const groups:    Group[]  = [];
        let   cursor = 0;

        // Arc ring: (segments+1) rings × 2 longitudinal positions (start, end)
        for (let ri = 0; ri <= segments; ri++) {
            const angle   = (Math.PI * ri) / segments;  // 0 → π
            const perpOff = radius * Math.cos(Math.PI - angle); // eave to eave via apex
            const h       = radius * Math.sin(angle);            // 0 at eave, radius at apex

            for (let li = 0; li < 2; li++) {
                const parOff = li === 0 ? -halfLen : halfLen;
                if (barrelAlongX) {
                    positions.push(centerPar + parOff, h, centerPerp + perpOff);
                } else {
                    positions.push(centerPerp + perpOff, h, centerPar + parOff);
                }
            }
        }

        // Outer arc surface → slot 3
        const arcStart = cursor;
        for (let ri = 0; ri < segments; ri++) {
            const a = ri * 2, b = ri * 2 + 1, c = (ri + 1) * 2, d = (ri + 1) * 2 + 1;
            indices.push(a, b, c);
            indices.push(b, d, c);
            cursor += 6;
        }
        groups.push({ start: arcStart, count: cursor - arcStart, materialIndex: 3 });

        // End caps (two semicircular fans) → slot 0
        const capStart = cursor;
        const midRi = Math.floor(segments / 2); // apex ring index
        for (let end = 0; end < 2; end++) {
            const li      = end;         // 0 = start end, 1 = far end
            const apexIdx = midRi * 2 + li;
            for (let ri = 0; ri < segments; ri++) {
                const aIdx = ri * 2 + li;
                const bIdx = (ri + 1) * 2 + li;
                if (end === 0) {
                    indices.push(apexIdx, bIdx, aIdx);
                } else {
                    indices.push(apexIdx, aIdx, bIdx);
                }
                cursor += 3;
            }
        }
        groups.push({ start: capStart, count: cursor - capStart, materialIndex: 0 });

        // Bottom flat soffit → slot 1
        const botOff = positions.length / 3;
        const botY   = -thickness;
        positions.push(
            barrelAlongX ? centerPar - halfLen : bb.minX, botY,
            barrelAlongX ? bb.minZ            : centerPar - halfLen
        );
        positions.push(
            barrelAlongX ? centerPar + halfLen : bb.maxX, botY,
            barrelAlongX ? bb.minZ            : centerPar - halfLen
        );
        positions.push(
            barrelAlongX ? centerPar + halfLen : bb.maxX, botY,
            barrelAlongX ? bb.maxZ            : centerPar + halfLen
        );
        positions.push(
            barrelAlongX ? centerPar - halfLen : bb.minX, botY,
            barrelAlongX ? bb.maxZ            : centerPar + halfLen
        );

        const botStart = cursor;
        indices.push(botOff, botOff + 2, botOff + 1);
        indices.push(botOff, botOff + 3, botOff + 2);
        cursor += 6;
        groups.push({ start: botStart, count: cursor - botStart, materialIndex: 1 });

        return this._toGeo(positions, indices, groups);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // BY REGION  (§3.9)
    // ──────────────────────────────────────────────────────────────────────────

    static generateByRegion(data: Readonly<RoofData>): THREE.BufferGeometry {
        if (data.slope && data.slope > 0) return this.generateShed(data);
        return this.generateFlat(data);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PRIVATE GEOMETRY BUILDERS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Build an extruded flat polygon (flat roof).
     * Top → slot 3, Bottom → slot 1, Sides → slot 0.
     */
    private static _buildExtrudedPolygon(pts: Pt[], thickness: number): THREE.BufferGeometry {
        const n = pts.length;
        const positions: number[] = [];
        const indices:   number[] = [];
        const groups:    Group[]  = [];
        let   cursor = 0;

        pts.forEach(([x, z]) => positions.push(x,           0, z));
        pts.forEach(([x, z]) => positions.push(x, -thickness, z));

        const shape  = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
        const triIdx = THREE.ShapeUtils.triangulateShape(shape.getPoints(), []);

        const tStart = cursor;
        for (const [i0, i1, i2] of triIdx) { indices.push(i0, i1, i2); cursor += 3; }
        groups.push({ start: tStart, count: cursor - tStart, materialIndex: 3 });

        const bStart = cursor;
        for (const [i0, i1, i2] of triIdx) { indices.push(n + i2, n + i1, n + i0); cursor += 3; }
        groups.push({ start: bStart, count: cursor - bStart, materialIndex: 1 });

        const sStart = cursor;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            indices.push(i, n + i, j);
            indices.push(n + i, n + j, j);
            cursor += 6;
        }
        groups.push({ start: sStart, count: cursor - sStart, materialIndex: 0 });

        return this._toGeo(positions, indices, groups);
    }

    /**
     * Build roof top from a polygon where each vertex has a custom Y height.
     * Bottom is always flat at -thickness.
     * Used by shed and as a fallback for other types.
     */
    private static _buildVariableHeightRoof(pts: Pt[], heights: number[], thickness: number): THREE.BufferGeometry {
        const n = pts.length;
        const positions: number[] = [];
        const indices:   number[] = [];
        const groups:    Group[]  = [];
        let   cursor = 0;

        pts.forEach(([x, z], i) => positions.push(x, heights[i], z));
        pts.forEach(([x, z])    => positions.push(x, -thickness,  z));

        const shape  = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
        const triIdx = THREE.ShapeUtils.triangulateShape(shape.getPoints(), []);

        const tStart = cursor;
        for (const [i0, i1, i2] of triIdx) { indices.push(i0, i1, i2); cursor += 3; }
        groups.push({ start: tStart, count: cursor - tStart, materialIndex: 3 });

        const bStart = cursor;
        for (const [i0, i1, i2] of triIdx) { indices.push(n + i2, n + i1, n + i0); cursor += 3; }
        groups.push({ start: bStart, count: cursor - bStart, materialIndex: 1 });

        const sStart = cursor;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            indices.push(i, n + i, j);
            indices.push(n + i, n + j, j);
            cursor += 6;
        }
        groups.push({ start: sStart, count: cursor - sStart, materialIndex: 0 });

        return this._toGeo(positions, indices, groups);
    }

    /**
     * Multi-level roof builder.
     *
     * Builds geometry by connecting multiple polygon "levels":
     *   Level 0: eavePts at eaveH (usually 0)
     *   Level 1: midPts  at midH  (knee for gambrel, skirt for mansard, ridge for gable/hip)
     *   Level 2: topPts  at topH  (ridge for gambrel/mansard, null for single-stage)
     *
     * Each pair of adjacent levels is connected via _connectLevels().
     * The topmost level gets a capping face if it has ≥3 points.
     *
     * Slope faces → slot 3, Bottom soffit → slot 1, Outer sides → slot 0.
     */
    private static _buildMultiLevel(
        eavePts: Pt[], eaveH: number,
        midPts:  Pt[], midH:  number,
        topPts:  Pt[] | null, topH: number,
        thickness: number
    ): THREE.BufferGeometry {
        const positions: number[] = [];
        const indices:   number[] = [];
        const groups:    Group[]  = [];
        let   cursor = 0;

        const nEave = eavePts.length;
        const nMid  = midPts.length;
        const nTop  = topPts?.length ?? 0;

        // ── Register vertex blocks ────────────────────────────────────────────
        const eaveTopBase = 0;
        eavePts.forEach(([x, z]) => positions.push(x, eaveH,  z));

        const midBase = nEave;
        midPts.forEach(([x, z])  => positions.push(x, midH,   z));

        let topBase = nEave + nMid;
        if (topPts && nTop >= 2) {
            topPts.forEach(([x, z]) => positions.push(x, topH, z));
        }

        const botBase = nEave + nMid + (topPts && nTop >= 2 ? nTop : 0);
        eavePts.forEach(([x, z]) => positions.push(x, -thickness, z));

        // ── Slope: eave → mid ────────────────────────────────────────────────
        const slopeStart1 = cursor;
        this._connectLevels(
            eavePts, eaveTopBase,
            midPts,  midBase,
            indices
        );
        cursor = indices.length;
        groups.push({ start: slopeStart1, count: cursor - slopeStart1, materialIndex: 3 });

        // ── Slope: mid → top (only when topPts is provided) ──────────────────
        if (topPts && nTop >= 2) {
            const slopeStart2 = cursor;
            this._connectLevels(
                midPts, midBase,
                topPts, topBase,
                indices
            );
            cursor = indices.length;
            groups.push({ start: slopeStart2, count: cursor - slopeStart2, materialIndex: 3 });

            // Cap the top if it has ≥ 3 points (mansard flat cap or gambrel ridge)
            if (nTop >= 3) {
                const capStart = cursor;
                const shape  = new THREE.Shape(topPts.map(([x, z]) => new THREE.Vector2(x, z)));
                const triIdx = THREE.ShapeUtils.triangulateShape(shape.getPoints(), []);
                for (const [i0, i1, i2] of triIdx) {
                    indices.push(topBase + i0, topBase + i1, topBase + i2);
                    cursor += 3;
                }
                groups.push({ start: capStart, count: cursor - capStart, materialIndex: 3 });
            }
        } else if (!topPts && nMid >= 3) {
            // Cap the mid level if it has ≥3 points (hip ridge polygon cap)
            const capStart = cursor;
            const shape  = new THREE.Shape(midPts.map(([x, z]) => new THREE.Vector2(x, z)));
            const triIdx = THREE.ShapeUtils.triangulateShape(shape.getPoints(), []);
            for (const [i0, i1, i2] of triIdx) {
                indices.push(midBase + i0, midBase + i1, midBase + i2);
                cursor += 3;
            }
            groups.push({ start: capStart, count: cursor - capStart, materialIndex: 3 });
        }

        // ── Bottom face (soffit) → slot 1 ────────────────────────────────────
        const botFaceStart = cursor;
        const botShape = new THREE.Shape(eavePts.map(([x, z]) => new THREE.Vector2(x, z)));
        const botTri   = THREE.ShapeUtils.triangulateShape(botShape.getPoints(), []);
        for (const [i0, i1, i2] of botTri) {
            indices.push(botBase + i2, botBase + i1, botBase + i0);
            cursor += 3;
        }
        groups.push({ start: botFaceStart, count: cursor - botFaceStart, materialIndex: 1 });

        // ── Outer sides (eave top → eave bottom) → slot 0 ────────────────────
        const sideStart = cursor;
        for (let i = 0; i < nEave; i++) {
            const j  = (i + 1) % nEave;
            const t0 = eaveTopBase + i, t1 = eaveTopBase + j;
            const b0 = botBase + i,     b1 = botBase + j;
            indices.push(t0, b0, t1);
            indices.push(b0, b1, t1);
            cursor += 6;
        }
        groups.push({ start: sideStart, count: cursor - sideStart, materialIndex: 0 });

        return this._toGeo(positions, indices, groups);
    }

    /**
     * Connect two polygon levels with triangulated slope faces.
     * For each edge of the lower polygon, finds the nearest vertex/vertices of the
     * upper polygon and builds a triangle or quad face.
     */
    private static _connectLevels(
        lower:     Pt[], lowerBase: number,
        upper:     Pt[], upperBase: number,
        indices:   number[]
    ): void {
        const nL = lower.length;
        const nU = upper.length;
        if (nL === 0 || nU === 0) return;

        for (let i = 0; i < nL; i++) {
            const j  = (i + 1) % nL;
            const li = lowerBase + i;
            const lj = lowerBase + j;

            // Find nearest upper vertex for each lower vertex
            const ui = upperBase + this._nearestIdx(upper, lower[i][0], lower[i][1]);
            const uj = upperBase + this._nearestIdx(upper, lower[j][0], lower[j][1]);

            if (ui === uj) {
                // Both lower vertices share the same upper vertex → triangle
                indices.push(li, lj, ui);
            } else {
                // Different upper vertices → quad (2 triangles)
                indices.push(li, lj, uj);
                indices.push(li, uj, ui);
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // POLYGON UTILITIES
    // ──────────────────────────────────────────────────────────────────────────

    private static _resolvePolygon(data: Readonly<RoofData>): Pt[] {
        if (data.footprint?.polygon && data.footprint.polygon.length >= 3) {
            return data.footprint.polygon;
        }
        if (data.polygon && data.polygon.length >= 3) {
            return data.polygon as Pt[];
        }
        return [];
    }

    private static _bbox(pts: Pt[]): BBox {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const [x, z] of pts) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
        return { minX, maxX, minZ, maxZ };
    }

    /**
     * Expand polygon outward from its centroid by distance d.
     * Centroid-based: works correctly for convex polygons.
     */
    private static _applyOverhang(pts: Pt[], d: number): Pt[] {
        if (d <= 0) return pts;
        const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        return pts.map(([x, z]): Pt => {
            const dx = x - cx, dz = z - cz;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            return [x + (dx / len) * d, z + (dz / len) * d];
        });
    }

    /**
     * Shrink polygon inward by distance d using edge-shifting (straight skeleton step).
     * Uses the inward normal of each CCW polygon edge shifted by d, then intersects
     * adjacent shifted lines to find new vertex positions.
     *
     * Returns the shrunken polygon vertices, or an empty array if fully degenerate.
     */
    private static _shrinkPolygon(pts: Pt[], d: number): Pt[] {
        if (d <= 0) return [...pts];
        const n = pts.length;
        if (n < 3) return [];

        // Compute inward-shifted line for each edge: a·x + b·z = c
        const lines: { a: number; b: number; c: number }[] = [];
        for (let i = 0; i < n; i++) {
            const [x1, z1] = pts[i];
            const [x2, z2] = pts[(i + 1) % n];
            const dx = x2 - x1, dz = z2 - z1;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len < 1e-10) { lines.push({ a: 0, b: 0, c: 0 }); continue; }
            // Inward normal for CCW polygon: (-dz, dx) / len
            const nx = -dz / len, nz = dx / len;
            // Shift line inward by d: c += d
            lines.push({ a: nx, b: nz, c: nx * x1 + nz * z1 + d });
        }

        // Intersect adjacent shifted lines to find new vertex positions
        const newPts: Pt[] = [];
        for (let i = 0; i < n; i++) {
            const l1  = lines[i];
            const l2  = lines[(i + 1) % n];
            const det = l1.a * l2.b - l2.a * l1.b;
            if (Math.abs(det) < 1e-8) continue; // parallel edges — vertex collapsed
            const x = (l1.c * l2.b - l2.c * l1.b) / det;
            const z = (l1.a * l2.c - l2.a * l1.c) / det;
            newPts.push([x, z]);
        }

        if (newPts.length < 2) return [];

        // Sanity-filter: keep only points inside the original polygon
        const cx = pts.reduce((s, p) => s + p[0], 0) / n;
        const cz = pts.reduce((s, p) => s + p[1], 0) / n;
        const filtered = newPts.filter(([x, z]) => {
            // Accept if closer to centroid than original vertices
            const maxOrigDist = Math.max(...pts.map(([px, pz]) => (px - cx) ** 2 + (pz - cz) ** 2));
            const dist2 = (x - cx) ** 2 + (z - cz) ** 2;
            return dist2 <= maxOrigDist * 1.1; // allow 10% slack
        });

        return filtered.length >= 2 ? filtered : [];
    }

    /**
     * Compute the inradius: minimum distance from centroid to any edge.
     * For a convex polygon, this equals the largest circle that fits inside.
     */
    private static _computeInradius(pts: Pt[]): number {
        const n  = pts.length;
        const cx = pts.reduce((s, p) => s + p[0], 0) / n;
        const cz = pts.reduce((s, p) => s + p[1], 0) / n;
        let minDist = Infinity;
        for (let i = 0; i < n; i++) {
            const [x1, z1] = pts[i];
            const [x2, z2] = pts[(i + 1) % n];
            const dist = this._distPointToSeg(cx, cz, x1, z1, x2, z2);
            if (dist < minDist) minDist = dist;
        }
        return minDist < Infinity ? minDist : 1;
    }

    /** Point-to-line-segment distance. */
    private static _distPointToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
        const dx = bx - ax, dz = bz - az;
        const len2 = dx * dx + dz * dz;
        if (len2 < 1e-10) return Math.sqrt((px - ax) ** 2 + (pz - az) ** 2);
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
        return Math.sqrt((px - (ax + t * dx)) ** 2 + (pz - (az + t * dz)) ** 2);
    }

    /** Find the index of the nearest point in `pts` to (px, pz). */
    private static _nearestIdx(pts: Pt[], px: number, pz: number): number {
        let best = 0, bestDist = Infinity;
        for (let i = 0; i < pts.length; i++) {
            const dx = pts[i][0] - px, dz = pts[i][1] - pz;
            const d  = dx * dx + dz * dz;
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best;
    }

    /** Remove consecutive duplicate points (within 1e-6 tolerance). */
    private static _deduplicatePts(pts: Pt[]): Pt[] {
        const result: Pt[] = [];
        for (let i = 0; i < pts.length; i++) {
            const prev = result[result.length - 1];
            const curr = pts[i];
            if (!prev || Math.abs(curr[0] - prev[0]) > 1e-6 || Math.abs(curr[1] - prev[1]) > 1e-6) {
                result.push(curr);
            }
        }
        return result;
    }

    /** Assemble a BufferGeometry from raw arrays and material groups. */
    private static _toGeo(positions: number[], indices: number[], groups: Group[]): THREE.BufferGeometry {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        for (const g of groups) geo.addGroup(g.start, g.count, g.materialIndex);
        return geo;
    }

}
