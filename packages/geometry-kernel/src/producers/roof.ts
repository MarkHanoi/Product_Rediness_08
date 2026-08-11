// produceRoof — pure function `(roof, _joinData, worldY) => BufferGeometryDescriptor`.
//
// S10-T7 — port of PRYZM 1's `RoofGeometryBuilder.generate()` (875
// LOC, 9 shapes) reduced to the PRYZM 2 simplified `Roof` schema
// (5 shapes: `flat | gable | hip | mono | mansard`; no segments,
// no slope arrows).
//
// FROZEN at the same producer signature as `produceWall` (ADR-009 —
// `docs/02-decisions/adrs/0009-producer-pure-function-signature.md`):
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
  bbox,
  centroid,
  ensureCCW,
  inradius,
  type Pt,
} from './_internal/roof/polygon.js';
// §W2A-ONE-OFFSET — the ONE offset. `applyOverhang` / `shrinkPolygon` are gone;
// read the block that replaced them in `_internal/roof/polygon.ts` for the
// measured reason.
import { offsetPolygon, offsetPolygonOrSelf, type Pt2 } from '../pure/polygonOffset.js';
import {
  describeRoofFormResolution,
  encodeRoofFormResolution,
  type RoofFormResolution,
} from './_internal/roof/roofFormResolution.js';
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

  // ── EAVE ──────────────────────────────────────────────────────────────────
  // §W2A-ONE-OFFSET. A true mitred parallel offset: every edge midpoint of the
  // result sits exactly `overhang` from the footprint boundary. The radial
  // dilation this replaces delivered 212 mm for a 300 mm request on a square
  // and 30–299 mm on a 40×4 plan.
  let eavePts: Pt[] = ccw;
  let eaveDegradedReason: string | null = null;
  if (roof.overhang > 0) {
    const eave = offsetPolygonOrSelf(ccw as Pt2[], roof.overhang);
    eavePts = eave.polygon as Pt[];
    if (eave.degenerate) {
      eaveDegradedReason = eave.reason ?? 'unknown';
      console.warn(
        `[geometry-kernel] §DIAG-ROOF §W2A-ONE-OFFSET eave offset degraded ` +
          `(verts=${ccw.length} overhang=${roof.overhang}): ${eaveDegradedReason}. ` +
          `The committed eave is NOT a faithful ${roof.overhang} m overhang — do not dimension from it.`,
      );
    }
  }

  const slope = Math.tan(roof.pitch); // pitch in radians → rise-per-run

  // §W2A-ROOF-FORM-HONESTY — set by any branch that cannot build the requested
  // form. It is logged AND folded into the hash; it is never silent.
  let form: RoofFormResolution = { kind: 'faithful', shape: roof.shape };

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
      // §W2A-ONE-OFFSET. `shrinkPolygon(eave, r)` returned a COLLAPSED 4-vertex
      // ring as SUCCESS on a plain 10×10 square, so this apex-pyramid branch was
      // dead code and the hip was built from four coincident points. The real
      // offset refuses ('offset collapsed the ring'), so the branch now fires.
      const ridge = offsetPolygon(eavePts as Pt2[], -r);
      let midPts: Pt[];
      if (ridge.polygon.length < 3 || ridge.degenerate) {
        // A hip whose ridge ring collapses to a point IS a pyramid — the
        // limiting case of a hip, not a substituted form. Reported, not hidden.
        const [cx, cz] = centroid(eavePts);
        midPts = [[cx, cz]];
        form = {
          kind: 'degraded',
          requested: 'hip',
          produced: 'pyramid',
          reason: `ridge ring at ${r.toFixed(3)}m inward: ${ridge.reason ?? 'collapsed'}`,
        };
      } else {
        midPts = ridge.polygon as Pt[];
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
      const skirt = offsetPolygon(eavePts as Pt2[], -skirtInset);
      const top = offsetPolygon(eavePts as Pt2[], -r);

      if (skirt.polygon.length < 3 || skirt.degenerate) {
        // §W2A-ROOF-FORM-HONESTY. This branch used to build a HIP and return it
        // as an ordinary geometry — identical BufferGeometry, no log, no hash
        // difference. The user asked for a mansard and got a hip, dimensioned as
        // authoritative. It still builds the only form this footprint admits
        // (there is no third option that is not an invented ring, which ADR-0299
        // forbids), but it now says so.
        form = {
          kind: 'degraded',
          requested: 'mansard',
          produced: 'hip',
          reason: `skirt ring at ${skirtInset.toFixed(3)}m inward: ${skirt.reason ?? 'collapsed'} — a mansard needs a skirt ring and this footprint has none`,
        };
        let midPts: Pt[];
        if (top.polygon.length < 3 || top.degenerate) {
          const [cx, cz] = centroid(eavePts);
          midPts = [[cx, cz]];
        } else {
          midPts = top.polygon as Pt[];
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
        // The skirt exists. If the TOP ring does not, the old code reused the
        // skirt ring as the top — a mansard with a zero-depth cap, which is a
        // hip with an extra crease, not a mansard. Same rule: build it, name it.
        const topOk = top.polygon.length >= 3 && !top.degenerate;
        if (!topOk) {
          form = {
            kind: 'degraded',
            requested: 'mansard',
            produced: 'mansard',
            reason: `top ring at ${r.toFixed(3)}m inward: ${top.reason ?? 'collapsed'} — the cap reuses the skirt ring, so the upper pitch is degenerate`,
          };
        }
        raw = buildMultiLevel({
          eavePts,
          midPts: skirt.polygon as Pt[],
          midH: skirtH,
          topPts: topOk ? (top.polygon as Pt[]) : (skirt.polygon as Pt[]),
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

  const diag = describeRoofFormResolution(form);
  if (diag) console.warn(diag);

  const concat = concatRaw(raw);
  // §W2A-ROOF-FORM-HONESTY — the resolution is folded into the hash. Without
  // this, `RoofCommitter.onUpdate`'s `desc.hash === entry.descriptorHash` skip
  // could conceal a roof that silently changed form. `encodeRoofFormResolution`
  // returns '' for a faithful roof, so faithful hashes are unchanged.
  const hash =
    composeRoofGeometryHash(roof, worldY) +
    encodeRoofFormResolution(form) +
    (eaveDegradedReason ? '|EAVE-DEGRADED' : '');
  return serializeDescriptor(concat, hash);
};
