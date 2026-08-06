/**
 * CurvedWallLayerBuilder.ts
 *
 * Builds curved wall geometry with support for multiple layers.
 * Follows the same per-station architecture as the single-layer curved wall builder.
 * Each layer has its centerline offset from the wall's baseline, and geometry is built
 * independently for each layer with proper normal computation.
 *
 * Contract: §03-1.2 Curved walls + §03-1.3 Layered walls
 */

import * as THREE from '@pryzm/renderer-three/three';
import { WallLayer } from './WallTypes';
import { PathResolver } from './PathResolver';
import { projectCapVertex, CapMiterNormal } from './CurvedWallCapMiter';

export interface Station {
  cx: number;
  cz: number;
  nx: number;
  nz: number;
}

type V6 = [number, number, number, number, number, number];

/**
 * Builds curved geometry for a single layer.
 * @param _layer - Layer definition (thickness, material, etc.) - kept for future extension
 * @param layerOffset - Lateral offset from centerline for this layer (metres)
 * @param stations - Pre-computed station data (centerline + outward normals)
 * @param wallHeight - Wall height
 * @param wallBaseOffset - Base offset (Y position)
 * @param halfT - Half-thickness of the layer
 * @returns BufferGeometry for this layer
 */
export function buildCurvedLayerGeometry(
  _layer: WallLayer,
  layerOffset: number,
  stations: Station[],
  wallHeight: number,
  wallBaseOffset: number,
  halfT: number,
  startMN?:      CapMiterNormal | null,
  endMN?:        CapMiterNormal | null,
  startCapTan?:  { x: number; z: number } | null,
  endCapTan?:    { x: number; z: number } | null,
): THREE.BufferGeometry {
  const n = stations.length;
  const yBot = wallBaseOffset;
  const yTop = wallBaseOffset + wallHeight;

  // ── Offset stations for this layer ──
  // Each station's centerline is shifted by layerOffset along the outward normal
  const layerStations: Station[] = stations.map((s) => ({
    cx: s.cx + s.nx * layerOffset,
    cz: s.cz + s.nz * layerOffset,
    nx: s.nx,  // normal doesn't change, just the centerline position
    nz: s.nz,
  }));

  const pos: number[] = [];
  const nrm: number[] = [];

  function pushTri(a: V6, b: V6, c: V6): void {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    nrm.push(a[3], a[4], a[5], b[3], b[4], b[5], c[3], c[4], c[5]);
  }

  // ── §FIX-CURVED-WALL-MITER-WATERTIGHT (2026-08-06) — ONE corner table ──────
  //
  // ROOT CAUSE OF THE FOUNDER'S "curved wall has no plan poché" DEFECT: the §06-FIX
  // miter projection was applied to the CAP QUAD ONLY, while the outer/inner/top/
  // bottom faces still ENDED at the UNPROJECTED terminal-station corners. At every
  // wall join the solid therefore had a slit between its faces and its (shifted)
  // cap — invisible in 3D (the neighbour covers the joint) but fatal in plan: the
  // true cut section (`buildPlanCutSectionGeometry`, L-246) of a non-watertight
  // solid is an OPEN chain, `PocheFillBuilder` stitches CLOSED loops only, so a
  // joined curved wall rendered as a hollow outline while straight walls (whose
  // `buildMiterPrism` projects the WHOLE end face) filled correctly.
  //
  // THE FIX: compute each station's outer/inner corner ONCE, miter-project the
  // TERMINAL corners, and have every face group AND the caps consume the SAME
  // table — the solid is watertight by construction and the plan section closes.
  const outerPt: Array<[number, number]> = layerStations.map(s => [s.cx + s.nx * halfT, s.cz + s.nz * halfT]);
  const innerPt: Array<[number, number]> = layerStations.map(s => [s.cx - s.nx * halfT, s.cz - s.nz * halfT]);

  // Cap tangents — exact Bézier tangents when provided (§CURVED-STRAIGHT-FIX:
  // identical to WallJoinResolver._wallDirAtJoin), station chords otherwise.
  let startTanX: number, startTanZ: number;
  if (startCapTan) {
    startTanX = startCapTan.x;
    startTanZ = startCapTan.z;
  } else {
    const dtx = layerStations[1].cx - layerStations[0].cx;
    const dtz = layerStations[1].cz - layerStations[0].cz;
    const dl = Math.sqrt(dtx * dtx + dtz * dtz) || 1;
    startTanX = dtx / dl;
    startTanZ = dtz / dl;
  }
  let endTanX: number, endTanZ: number;
  if (endCapTan) {
    endTanX = endCapTan.x;
    endTanZ = endCapTan.z;
  } else {
    const dtx = layerStations[n - 1].cx - layerStations[n - 2].cx;
    const dtz = layerStations[n - 1].cz - layerStations[n - 2].cz;
    const dl = Math.sqrt(dtx * dtx + dtz * dtz) || 1;
    endTanX = dtx / dl;
    endTanZ = dtz / dl;
  }

  // §06-FIX + §CURVED-STRAIGHT-FIX + §FIX-CURVED-WALL-MITER-WATERTIGHT: project the
  // TERMINAL corners onto the shared miter plane, in the corner table itself, so the
  // face strips end exactly where the cap sits (flush joint, closed section).
  if (startMN) {
    outerPt[0] = projectCapVertex(outerPt[0][0], outerPt[0][1], 0, 0, startTanX, startTanZ, startMN);
    innerPt[0] = projectCapVertex(innerPt[0][0], innerPt[0][1], 0, 0, startTanX, startTanZ, startMN);
  }
  if (endMN) {
    const endOriginX = stations[n - 1].cx;
    const endOriginZ = stations[n - 1].cz;
    outerPt[n - 1] = projectCapVertex(outerPt[n - 1][0], outerPt[n - 1][1], endOriginX, endOriginZ, endTanX, endTanZ, endMN);
    innerPt[n - 1] = projectCapVertex(innerPt[n - 1][0], innerPt[n - 1][1], endOriginX, endOriginZ, endTanX, endTanZ, endMN);
  }

  function outerVBot(i: number): V6 {
    const s = layerStations[i];
    return [outerPt[i][0], yBot, outerPt[i][1], s.nx, 0, s.nz];
  }
  function outerVTop(i: number): V6 {
    const s = layerStations[i];
    return [outerPt[i][0], yTop, outerPt[i][1], s.nx, 0, s.nz];
  }
  function innerVBot(i: number): V6 {
    const s = layerStations[i];
    return [innerPt[i][0], yBot, innerPt[i][1], -s.nx, 0, -s.nz];
  }
  function innerVTop(i: number): V6 {
    const s = layerStations[i];
    return [innerPt[i][0], yTop, innerPt[i][1], -s.nx, 0, -s.nz];
  }

  function topOuter(i: number): V6 {
    return [outerPt[i][0], yTop, outerPt[i][1], 0, 1, 0];
  }
  function topInner(i: number): V6 {
    return [innerPt[i][0], yTop, innerPt[i][1], 0, 1, 0];
  }
  function botOuter(i: number): V6 {
    return [outerPt[i][0], yBot, outerPt[i][1], 0, -1, 0];
  }
  function botInner(i: number): V6 {
    return [innerPt[i][0], yBot, innerPt[i][1], 0, -1, 0];
  }

  // ── outer curved face ─────────────────────────────────────────────────
  for (let i = 0; i < n - 1; i++) {
    // CCW winding from outside — normals point outward without DoubleSide negation
    pushTri(outerVBot(i), outerVTop(i + 1), outerVTop(i));
    pushTri(outerVBot(i), outerVBot(i + 1), outerVTop(i + 1));
  }

  // ── inner curved face ─────────────────────────────────────────────────
  for (let i = 0; i < n - 1; i++) {
    // CCW winding from inside — normals point inward as stored
    pushTri(innerVBot(i), innerVTop(i), innerVTop(i + 1));
    pushTri(innerVBot(i), innerVTop(i + 1), innerVBot(i + 1));
  }

  // ── top flat face ─────────────────────────────────────────────────────
  for (let i = 0; i < n - 1; i++) {
    pushTri(topInner(i), topOuter(i), topOuter(i + 1));
    pushTri(topInner(i), topOuter(i + 1), topInner(i + 1));
  }

  // ── bottom flat face ──────────────────────────────────────────────────
  for (let i = 0; i < n - 1; i++) {
    pushTri(botInner(i), botOuter(i + 1), botOuter(i));
    pushTri(botInner(i), botInner(i + 1), botOuter(i + 1));
  }

  // ── start cap (i=0) ───────────────────────────────────────────────────
  // §FIX-CURVED-WALL-MITER-WATERTIGHT: the cap consumes the SAME (already
  // projected) terminal corners the face strips end on — no second projection.
  {
    const cnx = -startTanX;
    const cnz = -startTanZ;
    const [oX, oZ] = outerPt[0];
    const [iX, iZ] = innerPt[0];
    const oBo: V6 = [oX, yBot, oZ, cnx, 0, cnz];
    const oTo: V6 = [oX, yTop, oZ, cnx, 0, cnz];
    const iBo: V6 = [iX, yBot, iZ, cnx, 0, cnz];
    const iTo: V6 = [iX, yTop, iZ, cnx, 0, cnz];
    pushTri(oBo, oTo, iTo);
    pushTri(oBo, iTo, iBo);
  }

  // ── end cap (i=n-1) ───────────────────────────────────────────────────
  {
    const cnx = endTanX;
    const cnz = endTanZ;
    const [oX, oZ] = outerPt[n - 1];
    const [iX, iZ] = innerPt[n - 1];
    const oBo: V6 = [oX, yBot, oZ, cnx, 0, cnz];
    const oTo: V6 = [oX, yTop, oZ, cnx, 0, cnz];
    const iBo: V6 = [iX, yBot, iZ, cnx, 0, cnz];
    const iTo: V6 = [iX, yTop, iZ, cnx, 0, cnz];
    pushTri(oBo, iTo, oTo);
    pushTri(oBo, iBo, iTo);
  }

  // ── assemble geometry ─────────────────────────────────────────────────
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));

  return geom;
}

/**
 * Compute stations (centerline + outward normal) for the curved arc.
 * Shared between single-layer and multi-layer curved wall building.
 */
export function computeStations(
  start: THREE.Vector3,
  end: THREE.Vector3,
  control: THREE.Vector3,
  segments: number,
): Station[] {
  const pts = PathResolver.toPolyline(
    { kind: 'Arc', start, end, control },
    segments,
  );

  const n = pts.length;
  const stations: Station[] = [];

  for (let i = 0; i < n; i++) {
    let tx: number, tz: number;
    if (i < n - 1) {
      tx = pts[i + 1].x - pts[i].x;
      tz = pts[i + 1].z - pts[i].z;
    } else {
      tx = pts[i].x - pts[i - 1].x;
      tz = pts[i].z - pts[i - 1].z;
    }
    const tLen = Math.sqrt(tx * tx + tz * tz) || 1;
    tx /= tLen;
    tz /= tLen;

    stations.push({
      cx: pts[i].x - start.x,
      cz: pts[i].z - start.z,
      nx: -tz,
      nz: tx,
    });
  }

  return stations;
}
