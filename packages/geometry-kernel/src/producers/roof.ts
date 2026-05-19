// produceRoof — pure function `(roof, _joinData, worldY) => BufferGeometryDescriptor`.
//
// S10-T7 — port of PRYZM 1's `RoofGeometryBuilder.generate()` (875
// LOC, 9 shapes) reduced to the PRYZM 2 simplified `Roof` schema
// (5 shapes: `flat | gable | hip | mono | mansard`; no segments,
// no slope arrows).
//
// FROZEN at the same producer signature as `produceWall` (ADR-009 —
// `docs/architecture/adr/0009-producer-pure-function-signature.md`):
//   `(dto, joinData, worldY) → BufferGeometryDescriptor`.  Roofs do
// not currently consume `joinData`, but the slot is preserved so the
// L4 producer registry can dispatch uniformly across element families.
//
// PRYZM 2 schema → PRYZM 1 algorithm mapping:
//   flat    → PRYZM 1 `generateFlat`     (extruded polygon)
//   mono    → PRYZM 1 `generateShed`     (variable-height single slope)
//   gable   → PRYZM 1 `generateGable`    (multi-level: eave → ridge line)
//   hip     → PRYZM 1 `generateHip`      (multi-level: eave → shrunk ridge polygon)
//   mansard → PRYZM 1 `generateMansard`  (multi-level: eave → skirt → top)
//
// PRYZM 2's `pitch` (radians) is converted to PRYZM 1's `slope`
// (rise-per-run) via `Math.tan(pitch)`.

import type { Roof } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { DescriptorInvariantError } from '../types/assertValidDescriptor.js';
import {
  applyOverhang,
  bbox,
  centroid,
  ensureCCW,
  inradius,
  shrinkPolygon,
  type Pt,
} from './_internal/roof/polygon.js';
import { buildExtruded } from './_internal/roof/buildExtruded.js';
import { buildVariableHeight } from './_internal/roof/buildVariableHeight.js';
import { buildMultiLevel } from './_internal/roof/buildMultiLevel.js';
import { composeRoofGeometryHash } from './_internal/roof/composeRoofGeometryHash.js';
import { composeRoofMaterialKey } from './_internal/roof/composeRoofMaterialKey.js';
import { concatRaw, type RawGroup } from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';

export type RoofProducer = (
  roof: Readonly<Roof>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

/** Roofs do not currently use joinData — placeholder for future
 *  cross-element joins (e.g. roof-to-wall flashing). */
export type RoofJoinData = JoinData;

/** Convert PRYZM 2 boundary `Vec3[]` to local-XZ `Pt[]` (drop Y). */
function boundaryToPts(boundary: Roof['boundary']): Pt[] {
  return boundary.map((p): Pt => [p.x, p.z]);
}

export const produceRoof: RoofProducer = (roof, _joinData, worldY) => {
  const pts = boundaryToPts(roof.boundary);
  if (pts.length < 3) {
    throw new DescriptorInvariantError(
      `[produceRoof] roof.boundary requires ≥3 points; got ${pts.length}`,
    );
  }

  const shingleKey = composeRoofMaterialKey({
    slot: 'shingle',
    materialId: roof.materialId,
    materialColor: roof.materialColor,
  });
  const deckKey = composeRoofMaterialKey({ slot: 'deck', materialId: roof.materialId });
  const trimKey = composeRoofMaterialKey({ slot: 'trim', materialId: roof.materialId });

  const ccw = ensureCCW(pts);
  const eavePts = applyOverhang(ccw, roof.overhang);
  const slope = Math.tan(roof.pitch); // pitch in radians → rise-per-run

  let raw: RawGroup[];
  switch (roof.shape) {
    case 'flat':
      raw = buildExtruded({
        polygon: eavePts,
        thickness: roof.thickness,
        worldY,
        shingleKey,
        deckKey,
        trimKey,
      });
      break;

    case 'mono': {
      // Slope direction = the longest edge of eavePts.
      let maxEdge = 0;
      let dirX = 1, dirZ = 0;
      const n = eavePts.length;
      for (let i = 0; i < n; i++) {
        const a = eavePts[i]!;
        const b = eavePts[(i + 1) % n]!;
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > maxEdge) { maxEdge = d; dirX = dx / d; dirZ = dz / d; }
      }
      // Per-vertex height = (vertex · slopeDir - minProjection) * slope.
      const dots = eavePts.map(([x, z]) => x * dirX + z * dirZ);
      const minDot = Math.min(...dots);
      const heights = dots.map((dot) => (dot - minDot) * slope);
      raw = buildVariableHeight({
        polygon: eavePts,
        heights,
        thickness: roof.thickness,
        worldY,
        shingleKey,
        deckKey,
        trimKey,
      });
      break;
    }

    case 'gable': {
      const bb = bbox(eavePts);
      const spanX = bb.maxX - bb.minX;
      const spanZ = bb.maxZ - bb.minZ;
      const ridgeAlongX = spanX >= spanZ;
      const halfPerp = ridgeAlongX ? spanZ / 2 : spanX / 2;
      const centerPerp = ridgeAlongX
        ? (bb.minZ + bb.maxZ) / 2
        : (bb.minX + bb.maxX) / 2;
      const ridgeH = halfPerp * slope;
      const rP1: Pt = ridgeAlongX ? [bb.minX, centerPerp] : [centerPerp, bb.minZ];
      const rP2: Pt = ridgeAlongX ? [bb.maxX, centerPerp] : [centerPerp, bb.maxZ];
      raw = buildMultiLevel({
        eavePts,
        midPts: [rP1, rP2],
        midH: ridgeH,
        topPts: null,
        topH: 0,
        thickness: roof.thickness,
        worldY,
        shingleKey,
        deckKey,
        trimKey,
      });
      break;
    }

    case 'hip': {
      const r = inradius(eavePts);
      const ridgeH = r * slope;
      const ridgePts = shrinkPolygon(eavePts, r);
      let midPts: Pt[];
      if (ridgePts.length === 0) {
        // Degenerate → single apex pyramid.
        const [cx, cz] = centroid(eavePts);
        midPts = [[cx, cz]];
      } else {
        midPts = ridgePts;
      }
      raw = buildMultiLevel({
        eavePts,
        midPts,
        midH: ridgeH,
        topPts: null,
        topH: 0,
        thickness: roof.thickness,
        worldY,
        shingleKey,
        deckKey,
        trimKey,
      });
      break;
    }

    case 'mansard': {
      const r = inradius(eavePts);
      const ridgeH = r * slope;
      const skirtInset = r * 0.4;
      const skirtH = ridgeH * 0.75;
      const skirtPts = shrinkPolygon(eavePts, skirtInset);
      const topPts = shrinkPolygon(eavePts, r);
      if (skirtPts.length < 3) {
        // Fall back to hip — reuse the hip branch.
        const ridge = shrinkPolygon(eavePts, r);
        let midPts: Pt[];
        if (ridge.length === 0) {
          const [cx, cz] = centroid(eavePts);
          midPts = [[cx, cz]];
        } else {
          midPts = ridge;
        }
        raw = buildMultiLevel({
          eavePts,
          midPts,
          midH: ridgeH,
          topPts: null,
          topH: 0,
          thickness: roof.thickness,
          worldY,
          shingleKey,
          deckKey,
          trimKey,
        });
      } else {
        const finalTop = topPts.length >= 3 ? topPts : skirtPts;
        raw = buildMultiLevel({
          eavePts,
          midPts: skirtPts,
          midH: skirtH,
          topPts: finalTop,
          topH: ridgeH,
          thickness: roof.thickness,
          worldY,
          shingleKey,
          deckKey,
          trimKey,
        });
      }
      break;
    }
  }

  const concat = concatRaw(raw);
  const hash = composeRoofGeometryHash(roof, worldY);
  return serializeDescriptor(concat, hash);
};
