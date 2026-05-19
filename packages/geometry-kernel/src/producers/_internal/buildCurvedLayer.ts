// buildCurvedLayer — lifted from
// `src/elements/walls/CurvedWallLayerBuilder.ts` (250 LOC), adapted
// to plain typed-array output and `Point3D`-backed math.
//
// The station-based per-segment construction matches PRYZM 1
// vertex-for-vertex.  The miter-cap projection at start/end uses
// `projectCapVertex` (lifted earlier from
// `CurvedWallCapMiter.ts`).

import type { RawGeometry } from './rawGeometry.js';
import type { CapMiterNormal } from './projectCapVertex.js';
import { projectCapVertex } from './projectCapVertex.js';
import { arcToPoints } from './WallPath.js';
import type { Point3D } from '../../types/Point3D.js';

export interface Station {
  readonly cx: number;
  readonly cz: number;
  readonly nx: number;
  readonly nz: number;
}

type V6 = readonly [number, number, number, number, number, number];

export function computeStations(
  start: Point3D,
  end: Point3D,
  control: Point3D,
  segments: number,
): Station[] {
  const pts = arcToPoints(start, control, end, segments);
  const n = pts.length;
  const stations: Station[] = [];
  for (let i = 0; i < n; i++) {
    let tx: number, tz: number;
    if (i < n - 1) {
      tx = pts[i + 1]!.x - pts[i]!.x;
      tz = pts[i + 1]!.z - pts[i]!.z;
    } else {
      tx = pts[i]!.x - pts[i - 1]!.x;
      tz = pts[i]!.z - pts[i - 1]!.z;
    }
    const tLen = Math.sqrt(tx * tx + tz * tz) || 1;
    tx /= tLen;
    tz /= tLen;
    stations.push({
      cx: pts[i]!.x - start.x,
      cz: pts[i]!.z - start.z,
      nx: -tz,
      nz: tx,
    });
  }
  return stations;
}

export function buildCurvedLayerGeometry(
  layerOffset: number,
  stations: readonly Station[],
  wallHeight: number,
  wallBaseOffset: number,
  halfT: number,
  startMN: CapMiterNormal | null,
  endMN: CapMiterNormal | null,
  startCapTan: { x: number; z: number } | null,
  endCapTan: { x: number; z: number } | null,
): RawGeometry {
  const n = stations.length;
  const yBot = wallBaseOffset;
  const yTop = wallBaseOffset + wallHeight;

  const layerStations: Station[] = stations.map((s) => ({
    cx: s.cx + s.nx * layerOffset,
    cz: s.cz + s.nz * layerOffset,
    nx: s.nx,
    nz: s.nz,
  }));

  const positions: number[] = [];
  const normals: number[] = [];

  function pushTri(a: V6, b: V6, c: V6): void {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    normals.push(a[3], a[4], a[5], b[3], b[4], b[5], c[3], c[4], c[5]);
  }

  const outerVBot = (s: Station): V6 => [s.cx + s.nx * halfT, yBot, s.cz + s.nz * halfT, s.nx, 0, s.nz];
  const outerVTop = (s: Station): V6 => [s.cx + s.nx * halfT, yTop, s.cz + s.nz * halfT, s.nx, 0, s.nz];
  const innerVBot = (s: Station): V6 => [s.cx - s.nx * halfT, yBot, s.cz - s.nz * halfT, -s.nx, 0, -s.nz];
  const innerVTop = (s: Station): V6 => [s.cx - s.nx * halfT, yTop, s.cz - s.nz * halfT, -s.nx, 0, -s.nz];
  const topOuter = (s: Station): V6 => [s.cx + s.nx * halfT, yTop, s.cz + s.nz * halfT, 0, 1, 0];
  const topInner = (s: Station): V6 => [s.cx - s.nx * halfT, yTop, s.cz - s.nz * halfT, 0, 1, 0];
  const botOuter = (s: Station): V6 => [s.cx + s.nx * halfT, yBot, s.cz + s.nz * halfT, 0, -1, 0];
  const botInner = (s: Station): V6 => [s.cx - s.nx * halfT, yBot, s.cz - s.nz * halfT, 0, -1, 0];

  for (let i = 0; i < n - 1; i++) {
    const A = layerStations[i]!;
    const B = layerStations[i + 1]!;
    pushTri(outerVBot(A), outerVTop(B), outerVTop(A));
    pushTri(outerVBot(A), outerVBot(B), outerVTop(B));
  }
  for (let i = 0; i < n - 1; i++) {
    const A = layerStations[i]!;
    const B = layerStations[i + 1]!;
    pushTri(innerVBot(A), innerVTop(A), innerVTop(B));
    pushTri(innerVBot(A), innerVTop(B), innerVBot(B));
  }
  for (let i = 0; i < n - 1; i++) {
    const A = layerStations[i]!;
    const B = layerStations[i + 1]!;
    pushTri(topInner(A), topOuter(A), topOuter(B));
    pushTri(topInner(A), topOuter(B), topInner(B));
  }
  for (let i = 0; i < n - 1; i++) {
    const A = layerStations[i]!;
    const B = layerStations[i + 1]!;
    pushTri(botInner(A), botOuter(B), botOuter(A));
    pushTri(botInner(A), botInner(B), botOuter(B));
  }

  // Start cap.
  {
    const s = layerStations[0]!;
    let tanX: number, tanZ: number;
    if (startCapTan) {
      tanX = startCapTan.x; tanZ = startCapTan.z;
    } else {
      const dtx = layerStations[1]!.cx - s.cx;
      const dtz = layerStations[1]!.cz - s.cz;
      const dl = Math.sqrt(dtx * dtx + dtz * dtz) || 1;
      tanX = dtx / dl; tanZ = dtz / dl;
    }
    const cnx = -tanX, cnz = -tanZ;
    let oX = s.cx + s.nx * halfT, oZ = s.cz + s.nz * halfT;
    let iX = s.cx - s.nx * halfT, iZ = s.cz - s.nz * halfT;
    if (startMN) {
      [oX, oZ] = projectCapVertex(oX, oZ, 0, 0, tanX, tanZ, startMN);
      [iX, iZ] = projectCapVertex(iX, iZ, 0, 0, tanX, tanZ, startMN);
    }
    const oBo: V6 = [oX, yBot, oZ, cnx, 0, cnz];
    const oTo: V6 = [oX, yTop, oZ, cnx, 0, cnz];
    const iBo: V6 = [iX, yBot, iZ, cnx, 0, cnz];
    const iTo: V6 = [iX, yTop, iZ, cnx, 0, cnz];
    pushTri(oBo, oTo, iTo);
    pushTri(oBo, iTo, iBo);
  }
  // End cap.
  {
    const s = layerStations[n - 1]!;
    let tanX: number, tanZ: number;
    if (endCapTan) {
      tanX = endCapTan.x; tanZ = endCapTan.z;
    } else {
      const dtx = s.cx - layerStations[n - 2]!.cx;
      const dtz = s.cz - layerStations[n - 2]!.cz;
      const dl = Math.sqrt(dtx * dtx + dtz * dtz) || 1;
      tanX = dtx / dl; tanZ = dtz / dl;
    }
    const cnx = tanX, cnz = tanZ;
    let oX = s.cx + s.nx * halfT, oZ = s.cz + s.nz * halfT;
    let iX = s.cx - s.nx * halfT, iZ = s.cz - s.nz * halfT;
    const endOriginX = stations[n - 1]!.cx;
    const endOriginZ = stations[n - 1]!.cz;
    if (endMN) {
      [oX, oZ] = projectCapVertex(oX, oZ, endOriginX, endOriginZ, tanX, tanZ, endMN);
      [iX, iZ] = projectCapVertex(iX, iZ, endOriginX, endOriginZ, tanX, tanZ, endMN);
    }
    const oBo: V6 = [oX, yBot, oZ, cnx, 0, cnz];
    const oTo: V6 = [oX, yTop, oZ, cnx, 0, cnz];
    const iBo: V6 = [iX, yBot, iZ, cnx, 0, cnz];
    const iTo: V6 = [iX, yTop, iZ, cnx, 0, cnz];
    pushTri(oBo, iTo, oTo);
    pushTri(oBo, iBo, iTo);
  }

  return { positions, normals };
}
