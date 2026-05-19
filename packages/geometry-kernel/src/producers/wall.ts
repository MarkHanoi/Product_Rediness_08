// produceWall — pure function `(dto, joinData, worldY) => BufferGeometryDescriptor`.
//
// FROZEN at S08 D2 by ADR-009 (`docs/architecture/adr/0009-producer-
// pure-function-signature.md`).  Identical inputs MUST produce
// byte-identical output across Node `worker_thread` and the browser
// worker (K1-B pivot test).
//
// Pipeline (matches `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` line 615-625):
//
//   path     = buildPath(dto.baseLine, dto.curve)             // WallPath.ts
//   miters   = resolveMiters(path, joinData)                  // resolveMiters.ts
//   layers   = dto.layers ?? [implicitSingleLayer]
//   extruded = extrudeLayers(path, miters, layers, ...)       // buildMiterPrism / buildCurvedLayer
//   withHoles = openings.length === 0 ? extruded : applyOpenings(extruded, openings)
//   desc     = serialize(withHoles)
//   return { ...desc, hash: composeWallGeometryHash(...) }

import type { Wall } from '@pryzm/protocol';
import type {
  BufferGeometryDescriptor,
} from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { DescriptorInvariantError } from '../types/assertValidDescriptor.js';
import type { Point3D } from '../types/Point3D.js';
import {
  buildMiterPrism,
} from './_internal/buildMiterPrism.js';
import { resolveMiters } from './_internal/resolveMiters.js';
import {
  buildCurvedLayerGeometry,
  computeStations,
} from './_internal/buildCurvedLayer.js';
import {
  buildLayeredOpeningsLayers,
} from './_internal/buildLayeredOpenings.js';
import {
  composeMaterialKey,
} from './_internal/composeMaterialKey.js';
import {
  composeWallGeometryHash,
} from './_internal/composeWallGeometryHash.js';
import {
  concatRaw,
  type RawGroup,
} from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';

export type WallProducer = (
  dto: Readonly<Wall>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

/** Implicit single layer used when `wall.layers` is unset. */
function implicitLayers(wall: Wall): NonNullable<Wall['layers']> {
  return [
    {
      name: 'wall',
      function: 'structure',
      thickness: wall.thickness,
      materialId: wall.materialId,
      materialColor: wall.materialColor,
    },
  ];
}

function planarLength(a: Point3D, b: Point3D): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export const produceWall: WallProducer = (dto, joinData, worldY) => {
  // ── Sanity gate (echoes the schema-side `MIN_WALL_LEN` invariant) ──
  const [start, end] = dto.baseLine;
  const wallLength = planarLength(start, end);
  if (wallLength < 1e-6) {
    throw new DescriptorInvariantError(
      `wall.baseLine has zero planar length (${wallLength.toExponential(3)} m); refusing to produce a degenerate descriptor`,
    );
  }

  // Forward direction in XZ.
  const dirX = (end.x - start.x) / wallLength;
  const dirZ = (end.z - start.z) / wallLength;
  // Outward (perpendicular in XZ).
  const outwardX = -dirZ;
  const outwardZ = dirX;

  // The producer's geometry origin is the wall's start point with Y
  // replaced by `worldY` (`worldY` is the level-floor world Y).  The
  // PRYZM 1 convention stores level elevation in `baseLine[*].y`; we
  // ignore that field and use the producer's third arg.
  const baseStart: Point3D = { x: start.x, y: worldY, z: start.z };
  const baseEnd: Point3D = { x: end.x, y: worldY, z: end.z };

  const miters = resolveMiters(dirX, dirZ, joinData);
  const layers = dto.layers && dto.layers.length > 0 ? dto.layers : implicitLayers(dto);
  const totalThickness = layers.reduce((sum, l) => sum + l.thickness, 0);

  const isCurved = !!dto.curve;
  const hasOpenings = dto.openings.length > 0;

  const parts: RawGroup[] = [];

  if (isCurved) {
    // ── Curved code path ───────────────────────────────────────────
    // Stations are computed in local-to-baseStart space; we shift to
    // world by adding baseStart at serialise time.
    const stations = computeStations(
      start,
      end,
      dto.curve!.control,
      dto.curve!.segments,
    );
    const startCapTan = stations.length >= 2
      ? (() => {
          const a = stations[0]!;
          const b = stations[1]!;
          const tx = b.cx - a.cx;
          const tz = b.cz - a.cz;
          const tl = Math.sqrt(tx * tx + tz * tz) || 1;
          return { x: tx / tl, z: tz / tl };
        })()
      : null;
    const endCapTan = stations.length >= 2
      ? (() => {
          const a = stations[stations.length - 2]!;
          const b = stations[stations.length - 1]!;
          const tx = b.cx - a.cx;
          const tz = b.cz - a.cz;
          const tl = Math.sqrt(tx * tx + tz * tz) || 1;
          return { x: tx / tl, z: tz / tl };
        })()
      : null;

    let cursor = -totalThickness / 2;
    for (const layer of layers) {
      const center = cursor + layer.thickness / 2;
      cursor += layer.thickness;
      const local = buildCurvedLayerGeometry(
        center,
        stations,
        dto.height,
        dto.baseOffset,
        layer.thickness / 2,
        miters.start,
        miters.end,
        startCapTan,
        endCapTan,
      );
      // Shift station-local positions into world.  Stations are
      // expressed relative to `start` (baseStart with worldY set
      // appropriately at the layer's Y handled inside the lift).
      const shifted = shiftPositions(local.positions, baseStart.x, worldY, baseStart.z);
      parts.push({
        geometry: { positions: shifted, normals: local.normals },
        materialKey: composeMaterialKey({
          systemTypeId: dto.systemTypeId,
          materialId: layer.materialId ?? dto.materialId,
          materialColor: layer.materialColor ?? dto.materialColor,
          layerName: layer.name,
        }),
      });
    }
  } else if (hasOpenings) {
    // ── Straight + openings (per-layer continuous surface) ─────────
    // Inflate the implicit single layer for unlayered walls so the
    // openings branch produces geometry symmetric with the no-openings
    // branch (PRYZM 1 wraps the same fallback inside `WallFragment-
    // Builder.generate`).
    const dtoForLayered: Wall =
      dto.layers && dto.layers.length > 0
        ? dto
        : ({ ...dto, layers: implicitLayers(dto) } as Wall);
    const layered = buildLayeredOpeningsLayers(
      dtoForLayered,
      baseStart,
      dirX,
      dirZ,
      outwardX,
      outwardZ,
      wallLength,
      miters.start,
      miters.end,
    );
    for (const { layer, geometry } of layered) {
      parts.push({
        geometry,
        materialKey: composeMaterialKey({
          systemTypeId: dto.systemTypeId,
          materialId: layer.materialId ?? dto.materialId,
          materialColor: layer.materialColor ?? dto.materialColor,
          layerName: layer.name,
        }),
      });
    }
  } else {
    // ── Straight, no openings — one prism per layer ────────────────
    let cursor = -totalThickness / 2;
    for (const layer of layers) {
      const center = cursor + layer.thickness / 2;
      cursor += layer.thickness;

      // Layer centerline endpoints (offset along outward normal).
      const layerStart: Point3D = {
        x: baseStart.x + outwardX * center,
        y: baseStart.y,
        z: baseStart.z + outwardZ * center,
      };
      const layerEnd: Point3D = {
        x: baseEnd.x + outwardX * center,
        y: baseEnd.y,
        z: baseEnd.z + outwardZ * center,
      };

      const raw = buildMiterPrism(
        layerStart,
        layerEnd,
        baseStart,
        baseEnd,
        layer.thickness / 2,
        dto.height,
        dto.baseOffset,
        miters.start,
        miters.end,
      );
      parts.push({
        geometry: raw,
        materialKey: composeMaterialKey({
          systemTypeId: dto.systemTypeId,
          materialId: layer.materialId ?? dto.materialId,
          materialColor: layer.materialColor ?? dto.materialColor,
          layerName: layer.name,
        }),
      });
    }
  }

  const concatenated = concatRaw(parts);
  const hash = composeWallGeometryHash(dto, joinData, worldY);
  return serializeDescriptor(concatenated, hash);
};

/**
 * Shift each (x, y, z) triple by `(dx, dy, dz)`.  Used by the curved
 * path to convert station-local positions to world coordinates.
 */
function shiftPositions(
  positions: number[],
  dx: number,
  dy: number,
  dz: number,
): number[] {
  const out = new Array<number>(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = positions[i]! + dx;
    out[i + 1] = positions[i + 1]! + dy;
    out[i + 2] = positions[i + 2]! + dz;
  }
  return out;
}
