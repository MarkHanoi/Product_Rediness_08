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

  function outerVBot(s: Station): V6 {
    return [s.cx + s.nx * halfT, yBot, s.cz + s.nz * halfT, s.nx, 0, s.nz];
  }
  function outerVTop(s: Station): V6 {
    return [s.cx + s.nx * halfT, yTop, s.cz + s.nz * halfT, s.nx, 0, s.nz];
  }
  function innerVBot(s: Station): V6 {
    return [s.cx - s.nx * halfT, yBot, s.cz - s.nz * halfT, -s.nx, 0, -s.nz];
  }
  function innerVTop(s: Station): V6 {
    return [s.cx - s.nx * halfT, yTop, s.cz - s.nz * halfT, -s.nx, 0, -s.nz];
  }

  function topOuter(s: Station): V6 {
    return [s.cx + s.nx * halfT, yTop, s.cz + s.nz * halfT, 0, 1, 0];
  }
  function topInner(s: Station): V6 {
    return [s.cx - s.nx * halfT, yTop, s.cz - s.nz * halfT, 0, 1, 0];
  }
  function botOuter(s: Station): V6 {
    return [s.cx + s.nx * halfT, yBot, s.cz + s.nz * halfT, 0, -1, 0];
  }
  function botInner(s: Station): V6 {
    return [s.cx - s.nx * halfT, yBot, s.cz - s.nz * halfT, 0, -1, 0];
  }

  // ── outer curved face ─────────────────────────────────────────────────
  for (let i = 0; i < n - 1; i++) {
    const A = layerStations[i];
    const B = layerStations[i + 1];
    // CCW winding from outside — normals point outward without DoubleSide negation
    pushTri(outerVBot(A), outerVTop(B), outerVTop(A));
    pushTri(outerVBot(A), outerVBot(B), outerVTop(B));
  }

  // ── inner curved face ─────────────────────────────────────────────────
  for (let i = 0; i < n - 1; i++) {
    const A = layerStations[i];
    const B = layerStations[i + 1];
    // CCW winding from inside — normals point inward as stored
    pushTri(innerVBot(A), innerVTop(A), innerVTop(B));
    pushTri(innerVBot(A), innerVTop(B), innerVBot(B));
  }

  // ── top flat face ─────────────────────────────────────────────────────
  for (let i = 0; i < n - 1; i++) {
    const A = layerStations[i];
    const B = layerStations[i + 1];
    pushTri(topInner(A), topOuter(A), topOuter(B));
    pushTri(topInner(A), topOuter(B), topInner(B));
  }

  // ── bottom flat face ──────────────────────────────────────────────────
  for (let i = 0; i < n - 1; i++) {
    const A = layerStations[i];
    const B = layerStations[i + 1];
    pushTri(botInner(A), botOuter(B), botOuter(A));
    pushTri(botInner(A), botInner(B), botOuter(B));
  }

  // ── start cap (i=0) ───────────────────────────────────────────────────
  // §06-FIX + §CURVED-STRAIGHT-FIX: when startMN is present, project cap
  // vertices along the arc tangent onto the shared miter plane.
  // Prefer the exact Bézier tangent (startCapTan) when provided — this
  // matches the formula used in WallJoinResolver._wallDirAtJoin so the
  // miter normal and projection direction are always consistent.
  {
    const s = layerStations[0];
    let tanX: number, tanZ: number;
    if (startCapTan) {
      tanX = startCapTan.x;
      tanZ = startCapTan.z;
    } else {
      const dtx = layerStations[1].cx - s.cx;
      const dtz = layerStations[1].cz - s.cz;
      const dl = Math.sqrt(dtx * dtx + dtz * dtz) || 1;
      tanX = dtx / dl;
      tanZ = dtz / dl;
    }
    const cnx = -tanX;
    const cnz = -tanZ;

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

  // ── end cap (i=n-1) ───────────────────────────────────────────────────
  // §06-FIX + §CURVED-STRAIGHT-FIX: same miter projection at end station.
  // Prefer the exact Bézier tangent (endCapTan) when provided.
  {
    const s = layerStations[n - 1];
    let tanX: number, tanZ: number;
    if (endCapTan) {
      tanX = endCapTan.x;
      tanZ = endCapTan.z;
    } else {
      const dtx = s.cx - layerStations[n - 2].cx;
      const dtz = s.cz - layerStations[n - 2].cz;
      const dl = Math.sqrt(dtx * dtx + dtz * dtz) || 1;
      tanX = dtx / dl;
      tanZ = dtz / dl;
    }
    const cnx = tanX;
    const cnz = tanZ;

    let oX = s.cx + s.nx * halfT, oZ = s.cz + s.nz * halfT;
    let iX = s.cx - s.nx * halfT, iZ = s.cz - s.nz * halfT;
    const endOriginX = stations[n - 1].cx;
    const endOriginZ = stations[n - 1].cz;
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
