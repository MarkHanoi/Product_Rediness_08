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
// §FEAT-RAKE-CURVED — `rakeShearPerMetre` is the ONE place cot(rake) is computed, and this
// module consumes it exactly as the straight arms do. It applies the result RADIALLY (along
// each station's own normal) rather than along one fixed direction; that is the whole
// difference between a cone and a translated arc, and it is a difference of WHERE the
// single authority's number is applied, never of what the number is.
import { rakeShearPerMetre } from './WallRake';

/**
 * §FEAT-RAKE-CURVED — the rake, as this builder needs it.
 *
 * `datumY` is the WALL's base plane, which is NOT this call's `wallBaseOffset` whenever the
 * caller is emitting a BAND. `CurvedWallOpeningBuilder` splits a wall with an opening into
 * one solid per (arc-span × vertical-span) rectangle and builds each with
 * `wallBaseOffset + band.yLo`; a band two metres up must start ALREADY displaced by `k · 2`,
 * or the wall renders as a stack of disjoint rings. Carrying the datum rather than assuming
 * `wallBaseOffset` is what makes one function serve the plain, layered and opening arms.
 *
 * It is the SAME datum, and the same rule, as the straight path's
 * `_applyRakeShearToChildren`: `p ↦ p + k·(p.y − datumY)·normal`.
 */
export interface CurvedRakeOption {
  /** `WallData.rakeAngleDeg`. Absent / null / 90 ⇒ this whole feature is a no-op. */
  readonly angleDeg?: number | null;
  /** The WALL's base plane Y — not the band's. */
  readonly datumY: number;
}

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
  // §FEAT-RAKE-CURVED — absent ⇒ byte-identical geometry, including normals.
  rake?:         CurvedRakeOption | null,
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
  // ── §FEAT-RAKE-CURVED — FOUR corner tables, because the top ring is no longer the
  //    base ring. `k` is `cot(rake)` from the single authority; the displacement is
  //    RADIAL — along each station's own `n` — which is what makes the swept face a
  //    frustum of a cone and holds the batter constant along the run. `dBot` and `dTop`
  //    are measured from the WALL datum so a BAND starts where the band below it ended.
  //
  //    At 90° (or with `rake` absent) `k`, `dBot` and `dTop` are all 0, the four tables
  //    collapse to the original two, and every vertex and normal below is bit-identical.
  const _rakeK = rake ? rakeShearPerMetre(rake.angleDeg) : 0;
  const _rakeDatum = rake ? rake.datumY : yBot;
  const dBot = _rakeK === 0 ? 0 : _rakeK * (yBot - _rakeDatum);
  const dTop = _rakeK === 0 ? 0 : _rakeK * (yTop - _rakeDatum);

  const outerPt:    Array<[number, number]> = layerStations.map(s => [s.cx + s.nx * (halfT + dBot), s.cz + s.nz * (halfT + dBot)]);
  const innerPt:    Array<[number, number]> = layerStations.map(s => [s.cx - s.nx * halfT + s.nx * dBot, s.cz - s.nz * halfT + s.nz * dBot]);
  const outerPtTop: Array<[number, number]> = layerStations.map(s => [s.cx + s.nx * (halfT + dTop), s.cz + s.nz * (halfT + dTop)]);
  const innerPtTop: Array<[number, number]> = layerStations.map(s => [s.cx - s.nx * halfT + s.nx * dTop, s.cz - s.nz * halfT + s.nz * dTop]);

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
  // §FEAT-RAKE-CURVED — ALL FOUR tables are projected, with the SAME plane and the same
  // tangents. The miter plane is VERTICAL, so projecting the displaced top corner is the
  // correct thing to do and not an approximation: the plane contains the vertical, so a
  // radial displacement followed by projection lands where the leaning end face meets the
  // neighbour. Projecting only the base pair — which is what omitting the top tables would
  // have meant — would reopen §FIX-CURVED-WALL-MITER-WATERTIGHT at the top edge and take
  // the plan poché with it.
  if (startMN) {
    outerPt[0]    = projectCapVertex(outerPt[0][0],    outerPt[0][1],    0, 0, startTanX, startTanZ, startMN);
    innerPt[0]    = projectCapVertex(innerPt[0][0],    innerPt[0][1],    0, 0, startTanX, startTanZ, startMN);
    outerPtTop[0] = projectCapVertex(outerPtTop[0]![0], outerPtTop[0]![1], 0, 0, startTanX, startTanZ, startMN);
    innerPtTop[0] = projectCapVertex(innerPtTop[0]![0], innerPtTop[0]![1], 0, 0, startTanX, startTanZ, startMN);
  }
  if (endMN) {
    const endOriginX = stations[n - 1].cx;
    const endOriginZ = stations[n - 1].cz;
    outerPt[n - 1]    = projectCapVertex(outerPt[n - 1][0],    outerPt[n - 1][1],    endOriginX, endOriginZ, endTanX, endTanZ, endMN);
    innerPt[n - 1]    = projectCapVertex(innerPt[n - 1][0],    innerPt[n - 1][1],    endOriginX, endOriginZ, endTanX, endTanZ, endMN);
    outerPtTop[n - 1] = projectCapVertex(outerPtTop[n - 1]![0], outerPtTop[n - 1]![1], endOriginX, endOriginZ, endTanX, endTanZ, endMN);
    innerPtTop[n - 1] = projectCapVertex(innerPtTop[n - 1]![0], innerPtTop[n - 1]![1], endOriginX, endOriginZ, endTanX, endTanZ, endMN);
  }

  // ── §FEAT-RAKE-CURVED — the battered face normal, derived rather than guessed ──
  //
  // The outer face is swept by `P(s, y) = base(s) + n(s)·(k·y)`, so its two surface
  // tangents are the station tangent `t` (horizontal) and `d = (n.x·k, 1, n.z·k)`. The
  // outward normal must be perpendicular to both, and `N = (n.x, −k, n.z)` is:
  //
  //     N · t = n · t = 0                      (n ⟂ t in plan, by construction)
  //     N · d = k·(n.x² + n.z²) − k = k − k = 0 (|n| = 1)
  //
  // so `N` normalised is exact — not an approximation and not a numerical estimate. The
  // inner face is its negation. At k = 0 this reduces to `(n.x, 0, n.z)`, the original
  // expression, which is what keeps a vertical curved wall bit-identical INCLUDING its
  // shading. Getting this wrong would not move a single vertex — it would light a cone
  // as though it were a cylinder, which is the kind of defect that survives a geometry
  // test and is obvious only on screen.
  const _nrmScale = _rakeK === 0 ? 1 : 1 / Math.sqrt(1 + _rakeK * _rakeK);
  const _nrmY = _rakeK === 0 ? 0 : -_rakeK * _nrmScale;

  function outerVBot(i: number): V6 {
    const s = layerStations[i];
    return [outerPt[i][0], yBot, outerPt[i][1], s.nx * _nrmScale, _nrmY, s.nz * _nrmScale];
  }
  function outerVTop(i: number): V6 {
    const s = layerStations[i];
    return [outerPtTop[i]![0], yTop, outerPtTop[i]![1], s.nx * _nrmScale, _nrmY, s.nz * _nrmScale];
  }
  function innerVBot(i: number): V6 {
    const s = layerStations[i];
    return [innerPt[i][0], yBot, innerPt[i][1], -s.nx * _nrmScale, -_nrmY, -s.nz * _nrmScale];
  }
  function innerVTop(i: number): V6 {
    const s = layerStations[i];
    return [innerPtTop[i]![0], yTop, innerPtTop[i]![1], -s.nx * _nrmScale, -_nrmY, -s.nz * _nrmScale];
  }

  // The top and bottom faces stay HORIZONTAL — a rake moves the top ring sideways, it
  // does not tilt the cap — so their normals are unchanged at every angle.
  function topOuter(i: number): V6 {
    return [outerPtTop[i]![0], yTop, outerPtTop[i]![1], 0, 1, 0];
  }
  function topInner(i: number): V6 {
    return [innerPtTop[i]![0], yTop, innerPtTop[i]![1], 0, 1, 0];
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
    // §FEAT-RAKE-CURVED — the cap's TOP pair comes from the top tables. Its NORMAL is
    // unchanged (±tangent): both `n` and the vertical are perpendicular to `t`, so a
    // radial-plus-vertical displacement keeps the cap in its own vertical plane.
    const cnx = -startTanX;
    const cnz = -startTanZ;
    const [oX, oZ] = outerPt[0];
    const [iX, iZ] = innerPt[0];
    const [oXt, oZt] = outerPtTop[0]!;
    const [iXt, iZt] = innerPtTop[0]!;
    const oBo: V6 = [oX,  yBot, oZ,  cnx, 0, cnz];
    const oTo: V6 = [oXt, yTop, oZt, cnx, 0, cnz];
    const iBo: V6 = [iX,  yBot, iZ,  cnx, 0, cnz];
    const iTo: V6 = [iXt, yTop, iZt, cnx, 0, cnz];
    pushTri(oBo, oTo, iTo);
    pushTri(oBo, iTo, iBo);
  }

  // ── end cap (i=n-1) ───────────────────────────────────────────────────
  {
    const cnx = endTanX;
    const cnz = endTanZ;
    const [oX, oZ] = outerPt[n - 1];
    const [iX, iZ] = innerPt[n - 1];
    const [oXt, oZt] = outerPtTop[n - 1]!;
    const [iXt, iZt] = innerPtTop[n - 1]!;
    const oBo: V6 = [oX,  yBot, oZ,  cnx, 0, cnz];
    const oTo: V6 = [oXt, yTop, oZt, cnx, 0, cnz];
    const iBo: V6 = [iX,  yBot, iZ,  cnx, 0, cnz];
    const iTo: V6 = [iXt, yTop, iZt, cnx, 0, cnz];
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
