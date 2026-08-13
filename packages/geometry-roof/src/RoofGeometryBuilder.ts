import * as THREE from '@pryzm/renderer-three/three';
import { RoofData, SlopeArrow } from './RoofTypes.js';
import { pointInRingEvenOdd } from '@pryzm/geometry-kernel';
import { gableRidge, isConvexPolygon } from './roofRidgeAxis.js';
import { decomposeInPrincipalFrame, rotatePolyXZ, rectToPolygon, type Pt2 } from './roofDecompose.js';
// `offsetPolygon` (strict, returns a discriminated OffsetResult) is used by
// `_shrinkPolygon`, which must be able to REFUSE; `offsetPolygonOrSelf` is the
// lenient outward variant. Both come from the single canonical implementation in
// @pryzm/geometry-kernel — see tools/ga-gate/check-offset-implementations.ts (R3),
// which is pinned at 0 rivals.
import { offsetPolygon, offsetPolygonOrSelf, type Pt2 as OffsetPt2 } from './pure/polygonOffset.js';
import { pitchedRingsFromOffsets, type PitchedRingStack } from './pure/pitchedFromOffsets.js';

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

    // ──────────────────────────────────────────────────────────────────────────
    // §W2A-ROOF-FORM-HONESTY — ADR-0299 §RECOVERY-MUST-REFUSE, applied to form.
    //
    // Every branch below that CANNOT build the requested roof — a mansard whose
    // skirt ring collapsed, a pitched roof on a footprint that admits no inward
    // offset, an eave offset that degenerated to zero overhang — used to return
    // an ordinary `THREE.BufferGeometry` with nothing but (at best) a console
    // line. The geometry was then dimensioned, scheduled and taken off as an
    // authoritative answer to a question it did not answer.
    //
    // The console is not a channel: nothing downstream can read it. `userData`
    // IS one — it survives to the committer, the inspector and any QA probe — so
    // a degraded roof now CARRIES ITS OWN REFUSAL:
    //
    //     geo.userData.pryzmRoofDegraded : true
    //     geo.userData.pryzmRoofDegradations : string[]   // every reason, in order
    //
    // ⚠ Read `pryzmRoofDegraded` before treating a roof as authoritative.
    //
    // DETERMINISM (ADR-0061): the accumulator is reset at the OUTERMOST
    // `generate()` only (`_genDepth`), so the recursive segment/wing builds
    // contribute their reasons to the same list instead of clearing it. JS is
    // single-threaded and no `await` occurs inside a build, so this cannot
    // interleave across two roofs.
    // ──────────────────────────────────────────────────────────────────────────

    private static _degradations: string[] = [];
    private static _genDepth = 0;

    /** Record a reason the produced roof is NOT the requested roof. */
    private static _noteDegradation(reason: string): void {
        this._degradations.push(reason);
        console.warn(`[geometry-roof] §DIAG-ROOF §W2A-ROOF-FORM-HONESTY ${reason}`);
    }

    /**
     * §W2A DEFECT 3 — the ONE place a pitched roof may become a flat one.
     *
     * There were SEVEN bare `return this.generateFlat(data)` fallbacks plus the
     * concave/no-inward-offset branch. A flat plane where a gable was requested
     * is not a degraded gable, it is a different building — and it was returned
     * as an ordinary geometry. Routing them through here means a flat roof that
     * is a SUBSTITUTION can always be told apart from a flat roof that was ASKED
     * FOR (`roofType === 'flat'` takes the direct path and records nothing).
     */
    private static _degradeToFlat(data: Readonly<RoofData>, reason: string): THREE.BufferGeometry {
        if (data.roofType !== 'flat') {
            this._noteDegradation(
                `requestedForm=${data.roofType} producedForm=flat — ${reason}. The committed ` +
                `roof is a FLAT slab; do not read it as a ${data.roofType}.`,
            );
        }
        return this.generateFlat(data);
    }

    static generate(data: Readonly<RoofData>): THREE.BufferGeometry {
        if (this._genDepth === 0) this._degradations = [];
        this._genDepth++;
        try {
            const geo = this._generateInner(data);
            if (this._genDepth === 1 && this._degradations.length > 0) {
                geo.userData.pryzmRoofDegraded = true;
                geo.userData.pryzmRoofDegradations = [...this._degradations];
            }
            return geo;
        } finally {
            this._genDepth--;
        }
    }

    private static _generateInner(data: Readonly<RoofData>): THREE.BufferGeometry {
        // P3.4 — Segment composition: if segments defined, merge their geometries
        if (data.segments && data.segments.length > 0) {
            return this._buildSegmentedGeometry(data);
        }

        // §ROOF-CONCAVE-DECOMPOSE (founder L-shape defect, 2026-06-10) — a pitched
        // roofType (gable/hip/dutch) on a CONCAVE footprint (L/T/U) cannot be capped
        // by the convex-only single-ridge builders (their inward edge-shifts cross at
        // the re-entrant corner → clashing planes). Instead split the rectilinear
        // footprint into rectangular wings and put a real gable on EACH wing at the
        // same pitch & eave height; the ridges meet at a valley where wings abut.
        // Convex footprints are UNCHANGED (skip this branch entirely → no regression).
        if (this._isPitched(data.roofType)) {
            const poly = this._resolvePolygon(data);

            // §ROOF-ENGINE-STAGE-1 (L-699) — a TRACED boundary (region detection,
            // or any footprint containing a tessellated curved wall) has far more
            // vertices than the closed-form convex builders assume. `generateGable`
            // lays ONE ridge across the whole ring and `_connectLevels` then matches
            // each of ~30 eave vertices to its nearest of 2 ridge vertices; the
            // result is not a gable, and `generateHip` is worse because its
            // `_computeInradius` measures from the CENTROID, which need not even lie
            // inside the polygon. Route these to the general offset builder, which
            // makes no assumption about vertex count or edge direction.
            //
            // ⚠ Threshold, and why it is safe: 8 vertices. Every footprint the house
            // generator produces (rectangles, L / T / U shells) has ≤ 8 and is
            // therefore BIT-IDENTICAL to before. Only boundaries that were already
            // producing a broken roof change.
            if (poly.length > 8 && isConvexPolygon(poly.map(([x, z]) => ({ x, z })))) {
                const traced = this._buildGeneralPitched(data, poly);
                if (traced) return traced;
            }

            if (poly.length >= 3 && !isConvexPolygon(poly.map(([x, z]) => ({ x, z })))) {
                const concave = this._buildConcavePitched(data, poly);
                if (concave) return concave;
                // §ROOF-ENGINE-STAGE-1 (L-699, founder 2026-08-07) — the rectilinear
                // decomposition failed. This used to FLAT-DEGRADE, which is how a
                // "By Region" roof over a room with a curved wall came out as a
                // single flat plane: a tessellated arc is rectilinear in NO frame,
                // so the gate could only ever refuse. A refusal that renders as a
                // roof is the worst of both worlds.
                //
                // Fall through to the general offset-based pitched builder, which
                // needs no rectilinearity and handles concave AND curved shells.
                // Only a genuinely degenerate footprint reaches flat now.
                const general = this._buildGeneralPitched(data, poly);
                if (general) return general;
                return this._degradeToFlat(
                    data,
                    `concave footprint (verts=${poly.length}) admits no inward offset, so ` +
                    `§ROOF-CONCAVE-DECOMPOSE and §ROOF-ENGINE-STAGE-1 both refused`,
                );
            }
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
    // §ROOF-CONCAVE-DECOMPOSE — concave (L/T/U) pitched roof via rectangular wings
    // ──────────────────────────────────────────────────────────────────────────

    /** A pitched roofType whose convex single-ridge builder fails on a concave shell. */
    private static _isPitched(t: RoofData['roofType']): boolean {
        return t === 'gable' || t === 'hip' || t === 'dutch';
    }

    /**
     * Build a real pitched roof over a CONCAVE footprint by decomposing it into
     * axis-aligned rectangular wings (an L → 2, a T/U → 3) and putting a gable on
     * each wing at the SAME slope & eave height. Ridges of abutting wings meet at a
     * valley by construction (shared eave-height edge). Returns `null` if the shell
     * is not rectilinearly decomposable (caller flat-degrades).
     *
     * Overhang is applied ONLY on rectangle edges that lie on the footprint's OUTER
     * boundary (not on an internal edge shared with another wing) so the eaves
     * project past the walls outside while the wings stay flush at the valley.
     * Deterministic — no Date / no Math.random (ADR-0061).
     */
    private static _buildConcavePitched(data: Readonly<RoofData>, poly: Pt[]): THREE.BufferGeometry | null {
        // §ROOF-PRINCIPAL-FRAME (founder "roof renders flat when the shape isn't a
        // rectangle", 2026-06-16) — decompose in the WORLD frame first, else in the
        // footprint's PRINCIPAL-AXIS frame. A rectilinear L/T/U ROTATED to a plot's
        // principal axis (every edge at ~θ°) is NOT world-axis-rectilinear, so the
        // old `decomposeRectilinear(poly)` returned null → flat-degrade (the founder's
        // flat roof on the rotated house). Now we de-rotate the footprint by −θ so it
        // becomes axis-aligned, build the per-wing gables in THAT frame, then rotate
        // the finished mesh back by +θ about the same pivot → a true pitched roof over
        // the rotated shell. Axis-aligned shells take angleRad=0 → byte-identical.
        const decomp = decomposeInPrincipalFrame(poly as Pt2[]);
        if (!decomp || decomp.rects.length === 0) return null;
        const { rects, angleRad, cx, cz } = decomp;

        const slope     = data.slope    ?? 0.4;
        const overhang  = data.overhang ?? 0;
        const thickness = data.thickness;

        // Build the wings in the frame the rects live in: the world poly when
        // angleRad===0, else the de-rotated (axis-aligned) footprint.
        const framePoly: Pt[] = angleRad === 0
            ? poly
            : (rotatePolyXZ(poly as Pt2[], -angleRad, cx, cz) as Pt[]);

        // §DIAG-ROOF — report wings + whether a principal-axis frame was used.
        console.log(
            `[geometry-roof] §DIAG-ROOF §ROOF-CONCAVE-DECOMPOSE footprint verts=${poly.length} ` +
            `requestedKind=${data.roofType} chosenKind=gable-per-wing parts=${rects.length} ` +
            `frame=${angleRad === 0 ? 'world-axis' : `principal-axis(${(angleRad * 180 / Math.PI).toFixed(1)}°)`} ` +
            `(rectilinear decomposition → one gable per wing @ slope=${slope.toFixed(3)})`,
        );

        const geometries: THREE.BufferGeometry[] = [];
        for (const r of rects) {
            // Expand each outer edge of this rect outward by the overhang. An edge is
            // "outer" iff a probe just outside it (along THIS rect's own span) is NOT
            // inside the footprint; an inner edge (abuts another wing) stays flush.
            // Probed against framePoly (same frame as the rects).
            const eMinX = this._isOuterEdge(framePoly, r.minX, 'minX', r.minZ, r.maxZ) ? r.minX - overhang : r.minX;
            const eMaxX = this._isOuterEdge(framePoly, r.maxX, 'maxX', r.minZ, r.maxZ) ? r.maxX + overhang : r.maxX;
            const eMinZ = this._isOuterEdge(framePoly, r.minZ, 'minZ', r.minX, r.maxX) ? r.minZ - overhang : r.minZ;
            const eMaxZ = this._isOuterEdge(framePoly, r.maxZ, 'maxZ', r.minX, r.maxX) ? r.maxZ + overhang : r.maxZ;

            const eavePts = rectToPolygon({ minX: eMinX, maxX: eMaxX, minZ: eMinZ, maxZ: eMaxZ }) as Pt[];

            // Per-wing gable: ridge along the wing's principal (longer) axis, centred.
            // gableRidge handles the orientation; identical machinery to generateGable
            // (no overhang re-applied here — the rect is already the eave polygon).
            const { ridge, ridgeH } = gableRidge(eavePts as Pt2[], slope);
            const [rP1, rP2] = ridge;
            geometries.push(
                this._buildMultiLevel(eavePts, 0, [rP1 as Pt, rP2 as Pt], ridgeH, null, 0, thickness),
            );
        }

        const merged = geometries.length === 1 ? geometries[0]! : this._mergeGeometries(geometries);
        // Rotate the built mesh back to the footprint's true orientation (no-op when
        // angleRad===0). XZ-plane rotation about the footprint centroid; height (Y)
        // unchanged so the eave/ridge planes are preserved.
        if (angleRad !== 0) this._rotateGeometryXZ(merged, angleRad, cx, cz);
        return merged;
    }

    /**
     * §ROOF-ENGINE-STAGE-1 — the GENERAL pitched builder: a real sloping roof over
     * any simple polygon, convex or concave, straight-edged or tessellated-curved.
     *
     * Builds the surface height(p) = slope × distance(p, boundary) discretely, by
     * progressive inward offsetting (see `pitchedFromOffsets.ts` for the method
     * and its honest limits). Returns `null` only when the footprint admits no
     * inward offset at all, i.e. it is genuinely degenerate — at which point the
     * caller's flat fallback is the correct answer rather than a concealment.
     *
     * Overhang is applied here (the eave ring is offset OUTWARD first) so this
     * method takes the raw footprint, matching `generateGable` / `generateHip`.
     */
    private static _buildGeneralPitched(data: Readonly<RoofData>, poly: Pt[]): THREE.BufferGeometry | null {
        const slope = data.slope ?? 0.4;
        if (!(slope > 0)) return null;

        const eavePts = this._applyOverhang(poly, data.overhang ?? 0);
        const stack   = pitchedRingsFromOffsets(eavePts as OffsetPt2[], slope, 8);
        if (stack.rings.length < 2) return null;

        console.log(
            `[geometry-roof] §DIAG-ROOF §ROOF-ENGINE-STAGE-1 footprint verts=${poly.length} ` +
            `requestedKind=${data.roofType} chosenKind=general-pitched rings=${stack.rings.length} ` +
            `slope=${slope.toFixed(3)} peak=${stack.peakHeight.toFixed(3)}m` +
            (stack.terminatedEarly ? ` ⚠ terminatedEarly (${stack.reason ?? 'unknown'}) — apex is a plateau` : ''),
        );

        return this._buildFromRingStack(stack, data.thickness);
    }

    /** Rotate a built roof geometry in the XZ plane about a pivot by `theta` rad
     *  (Y unchanged), then recompute normals. Inverse of the −theta de-rotation
     *  applied to the footprint, so the wings land back over the rotated shell. */
    private static _rotateGeometryXZ(geo: THREE.BufferGeometry, theta: number, cx: number, cz: number): void {
        const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!pos) return;
        const arr = pos.array as Float32Array;
        const c = Math.cos(theta), s = Math.sin(theta);
        for (let i = 0; i < arr.length; i += 3) {
            const x = arr[i]! - cx;
            const z = arr[i + 2]! - cz;
            arr[i]     = cx + x * c - z * s;
            arr[i + 2] = cz + x * s + z * c;
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
    }

    /**
     * Is the given axis-aligned boundary line of a sub-rect an OUTER edge of the
     * footprint? Probes points just outside the line, sampled along THIS rect's own
     * span (`spanLo..spanHi` on the perpendicular axis): if every probe is outside
     * the footprint the edge faces the outside world (eave gets the overhang); if any
     * probe is inside, the edge abuts another wing (no overhang → flush valley).
     *
     * `side` says which face of the rect the coordinate `v` bounds. Deterministic.
     */
    private static _isOuterEdge(
        poly: Pt[], v: number, side: 'minX' | 'maxX' | 'minZ' | 'maxZ',
        spanLo: number, spanHi: number,
    ): boolean {
        const probe = 1e-3;
        const samples = 9;
        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const s = spanLo + t * (spanHi - spanLo);
            let px: number, pz: number;
            switch (side) {
                case 'minX': px = v - probe; pz = s; break;
                case 'maxX': px = v + probe; pz = s; break;
                case 'minZ': pz = v - probe; px = s; break;
                default:     pz = v + probe; px = s; break;
            }
            if (this._pointInPoly(poly, px, pz)) return false; // inside ⇒ shared inner edge
        }
        return true; // nowhere inside just past it ⇒ outer edge
    }

    /** Even-odd point-in-polygon (XZ) — §C73-PIP-CANONICAL: delegates to THE
     *  kernel ray cast over the tuple ring (the `|| 1e-9` guard was dead code:
     *  the straddle test makes the divisor structurally nonzero). */
    private static _pointInPoly(poly: Pt[], px: number, pz: number): boolean {
        return pointInRingEvenOdd(px, pz, poly.length, (i) => poly[i]![0], (i) => poly[i]![1]);
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
        if (pts.length < 3) return this._degradeToFlat(data, `footprint has only ${pts.length} resolvable vertices`);

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
        if (pts.length < 3) return this._degradeToFlat(data, `footprint has only ${pts.length} resolvable vertices`);

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
        if (pts.length < 3) return this._degradeToFlat(data, `footprint has only ${pts.length} resolvable vertices`);

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
        if (pts.length < 3) return this._degradeToFlat(data, `footprint has only ${pts.length} resolvable vertices`);

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
        if (pts.length < 3) return this._degradeToFlat(data, `footprint has only ${pts.length} resolvable vertices`);

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
        if (pts.length < 3) return this._degradeToFlat(data, `footprint has only ${pts.length} resolvable vertices`);

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

        if (skirtPts.length < 3) {
            // §W2A DEFECT 3 — this line used to be a bare `return this.generateHip(data)`:
            // an identical BufferGeometry, NO log, NO flag. The user asked for a
            // MANSARD and received a HIP, dimensioned as authoritative. A mansard
            // needs a skirt ring; this footprint has none, so a mansard is not
            // buildable here. We still build the only form the footprint admits
            // (inventing a skirt ring is exactly what ADR-0299 forbids) — but the
            // substitution is now RECORDED ON THE GEOMETRY.
            this._noteDegradation(
                `requestedForm=mansard producedForm=hip — the mansard skirt ring at ` +
                `${skirtInset.toFixed(3)}m inward is not producible on this footprint. ` +
                `The committed roof is a HIP; do not read it as a mansard.`,
            );
            return this.generateHip(data);
        }

        if (topPts.length < 3) {
            // Reusing the skirt ring as the cap gives a mansard with a zero-depth
            // upper pitch — a hip with an extra crease. Named, not hidden.
            this._noteDegradation(
                `requestedForm=mansard producedForm=mansard(degenerate cap) — the top ring at ` +
                `${inradius.toFixed(3)}m inward is not producible, so the cap reuses the skirt ` +
                `ring and the upper pitch has zero depth.`,
            );
        }
        const finalTop = topPts.length >= 3 ? topPts : skirtPts;
        return this._buildMultiLevel(eavePts, 0, skirtPts, skirtH, finalTop, ridgeH, thickness);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // BARREL  (§3.9 area — custom algorithm)
    // ──────────────────────────────────────────────────────────────────────────

    static generateBarrel(data: Readonly<RoofData>): THREE.BufferGeometry {
        const pts = this._resolvePolygon(data);
        if (pts.length < 3) return this._degradeToFlat(data, `footprint has only ${pts.length} resolvable vertices`);

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
     * §ROOF-ENGINE-STAGE-1 — build a pitched roof mesh from a `PitchedRingStack`.
     *
     * Every ring carries the SAME vertex count with a 1:1 index correspondence
     * (enforced by `pitchedRingsFromOffsets`), so consecutive rings are joined by
     * a plain quad strip — no nearest-vertex matching, and therefore none of the
     * shearing `_connectLevels` can produce when two levels disagree on vertex
     * count. The innermost ring is capped; the eave ring is extruded down by
     * `thickness` for the soffit and fascia, exactly as `_buildMultiLevel` does,
     * so material slots are unchanged (3 = shingle, 1 = soffit, 0 = fascia).
     */
    private static _buildFromRingStack(stack: PitchedRingStack, thickness: number): THREE.BufferGeometry {
        const rings = stack.rings;
        const positions: number[] = [];
        const indices:   number[] = [];
        const groups:    Group[]  = [];
        let   cursor = 0;

        const n = rings[0]!.polygon.length;
        const ringBase: number[] = [];
        for (const ring of rings) {
            ringBase.push(positions.length / 3);
            for (const [x, z] of ring.polygon) positions.push(x, ring.height, z);
        }
        const botBase = positions.length / 3;
        for (const [x, z] of rings[0]!.polygon) positions.push(x, -thickness, z);

        // ── Slope faces: ring k → ring k+1 (quad strip) → slot 3 ─────────────
        const slopeStart = cursor;
        for (let k = 0; k + 1 < rings.length; k++) {
            const lo = ringBase[k]!;
            const hi = ringBase[k + 1]!;
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                indices.push(lo + i, lo + j, hi + j);
                indices.push(lo + i, hi + j, hi + i);
                cursor += 6;
            }
        }
        if (cursor > slopeStart) {
            groups.push({ start: slopeStart, count: cursor - slopeStart, materialIndex: 3 });
        }

        // ── Cap the innermost ring → slot 3 ──────────────────────────────────
        const top = rings[rings.length - 1]!;
        if (top.polygon.length >= 3) {
            const capStart = cursor;
            const shape  = new THREE.Shape(top.polygon.map(([x, z]) => new THREE.Vector2(x, z)));
            const triIdx = THREE.ShapeUtils.triangulateShape(shape.getPoints(), []);
            const base   = ringBase[rings.length - 1]!;
            for (const [i0, i1, i2] of triIdx) { indices.push(base + i0, base + i1, base + i2); cursor += 3; }
            if (cursor > capStart) groups.push({ start: capStart, count: cursor - capStart, materialIndex: 3 });
        }

        // ── Soffit → slot 1 ──────────────────────────────────────────────────
        const botStart = cursor;
        const botShape = new THREE.Shape(rings[0]!.polygon.map(([x, z]) => new THREE.Vector2(x, z)));
        const botTri   = THREE.ShapeUtils.triangulateShape(botShape.getPoints(), []);
        for (const [i0, i1, i2] of botTri) { indices.push(botBase + i2, botBase + i1, botBase + i0); cursor += 3; }
        groups.push({ start: botStart, count: cursor - botStart, materialIndex: 1 });

        // ── Fascia (eave top → eave bottom) → slot 0 ─────────────────────────
        const sideStart = cursor;
        const eaveBase  = ringBase[0]!;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            indices.push(eaveBase + i, botBase + i, eaveBase + j);
            indices.push(botBase + i, botBase + j, eaveBase + j);
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
     * §ROOF-ENGINE-STAGE-1 (L-699) — expand the footprint outward by `d` metres
     * along its EDGE NORMALS: a true parallel (Minkowski) offset.
     *
     * ⚠ WHAT THIS REPLACES: the previous implementation pushed every vertex `d`
     * metres RADIALLY AWAY FROM THE CENTROID. That is not an offset, and its
     * error is a function of shape — on a square a 300 mm overhang drew 212 mm;
     * on an elongated footprint the eaves at the ends overshot while the long
     * edges barely moved; on a CONCAVE footprint the re-entrant corner moved
     * further INTO the notch; and on a tessellated arc every sample sat at a
     * different radius, so the eave was a different curve rather than a parallel
     * one. That last case is the founder's *"overhangs well outside the
     * building"* on a curved-wall region (2026-08-07).
     *
     * Fail-safe by construction: if the offset degenerates the ORIGINAL polygon
     * is returned (a roof is always produced) and the degradation is RECORDED ON
     * THE GEOMETRY — never silently substituted.
     *
     * ⚠ §W2A DEFECT 4 — WHAT CHANGED AND WHY IT MATTERED. This method used to
     * flatten `OffsetResult` to a bare `Pt[]` and `console.warn` the reason. The
     * kernel KNEW the eave had degenerated to zero overhang; the wrapper threw
     * that away, so a roof with NO overhang where 300 mm was specified was
     * committed and dimensioned as authoritative, with the only evidence in a
     * console nothing downstream reads. The reason now reaches
     * `geo.userData.pryzmRoofDegradations` via `_noteDegradation`.
     *
     * The layer that KNOWS must be the layer that REPORTS.
     */
    private static _applyOverhang(pts: Pt[], d: number): Pt[] {
        if (d <= 0) return pts;
        const r = offsetPolygonOrSelf(pts as OffsetPt2[], d);
        if (r.degenerate) {
            this._noteDegradation(
                `eave overhang of ${d}m was NOT produced faithfully on a ${pts.length}-vertex ` +
                `footprint: ${r.reason ?? 'unknown'}. The committed eave is not a ${d}m overhang — ` +
                `do not dimension from it.`,
            );
        }
        return r.polygon as Pt[];
    }

    /**
     * §W2A-ONE-OFFSET — inward offset. THIS IS NOW A THIN CALL, NOT AN ALGORITHM.
     *
     * ⚠ WHAT THIS REPLACES, AND WHY IT WAS NOT A "WORKING" ROUTINE: this method
     * was a VERBATIM TWIN of `geometry-kernel`'s `shrinkPolygon`, and both were
     * wrong in the same three ways. Measured against an independent oracle
     * (perpendicular distance at every edge midpoint of the result):
     *
     *   • `if (|det| < 1e-8) continue` DELETED the vertex at every near-parallel
     *     corner and still reported success. On the arc fixture it silently
     *     returned 29 vertices for a 30-vertex ring.
     *     ⚠ RETRACTED: an earlier draft added "— 49% of vertices on real
     *     cadastral rings —" here. That figure was never measured on this
     *     routine; it is `insetPolygon.ts:437`'s share of cadastral vertices
     *     turning by less than 1°, a far looser threshold than `|det| < 1e-8`.
     *     Re-measured across 24…4000-segment arcs, the loss is 1–3 vertices in
     *     absolute terms and its SHARE falls with density (10.0% at 30 verts,
     *     0.1% at 1006). Silent deletion is the defect; 49% overstated it.
     *   • The only gate was `dist² ≤ maxOrigDistSq · 1.1`: a CENTROID-RADIUS
     *     test, blind to shape, to folds and to winding inversion. On a 10×10
     *     square shrunk by its own inradius it returned FOUR fully-collapsed
     *     vertices as success — so `generateHip`'s `ridgePts.length === 0 → apex`
     *     branch was unreachable and the hip was built from coincident points.
     *     On the U-shape it returned eight vertices spanning 1000 mm of
     *     perpendicular error for a 3000 mm request: the arms had inverted.
     *   • `filtered.length >= 2` was SUCCESS. A 2-vertex "polygon" is not one.
     *
     * The replacement refuses on all three ('offset collapsed the ring',
     * 'offset inverted the ring winding', 'offset ring self-intersects'), so the
     * degenerate branches in the callers finally fire.
     *
     * Returns `[]` when the inward offset is not producible — callers already
     * treat `[]` as degenerate, and `[]` here means REFUSED, with the reason
     * logged rather than swallowed.
     */
    private static _shrinkPolygon(pts: Pt[], d: number): Pt[] {
        if (d <= 0) return [...pts];
        if (pts.length < 3) return [];
        const r = offsetPolygon(pts as OffsetPt2[], -d);
        if (r.polygon.length < 3 || r.degenerate) {
            this._noteDegradation(
                `inward offset of ${d.toFixed(3)}m REFUSED on a ${pts.length}-vertex ring: ` +
                `${r.reason ?? 'unknown'} — the caller's degenerate branch runs instead of a ` +
                `plausible wrong ring.`,
            );
            return [];
        }
        return r.polygon as Pt[];
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
