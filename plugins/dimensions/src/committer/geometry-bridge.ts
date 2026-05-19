// geometry-bridge — DimensionDescriptor → THREE geometry objects (S29).
//
// Dimensions emit two kinds of 3D geometry:
//
//   1. Arrow-body meshes — from `produceDimension()` descriptor.
//      These are small box-prism arrowheads.
//
//   2. Line objects — from `analyseDimension()` analytic record.
//      Extension lines, the dimension line itself.  Rendered as
//      `THREE.Line` (not as indexed triangle geometry) so they stay
//      pixel-crisp at all camera distances.

import * as THREE from '@pryzm/renderer-three/three';
import type { BufferGeometryDescriptor } from '@pryzm/plugin-sdk';
import type { DimensionAnalytic, DimensionEdge } from '@pryzm/plugin-sdk';

// ── Arrow-body mesh geometry ─────────────────────────────────────────────────

export function buildDimensionBodyGeometry(
  descriptor: BufferGeometryDescriptor,
): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(descriptor.position, 3));
  g.setAttribute('normal',   new THREE.BufferAttribute(descriptor.normal, 3));
  g.setAttribute('uv',       new THREE.BufferAttribute(descriptor.uv, 2));
  g.setIndex(new THREE.BufferAttribute(descriptor.index, 1));
  for (const grp of descriptor.groups) g.addGroup(grp.start, grp.count, grp.materialIndex);
  const mn = descriptor.bounds.min;
  const mx = descriptor.bounds.max;
  g.boundingBox = new THREE.Box3(
    new THREE.Vector3(mn.x, mn.y, mn.z),
    new THREE.Vector3(mx.x, mx.y, mx.z),
  );
  const cx = (mn.x + mx.x) * 0.5;
  const cy = (mn.y + mx.y) * 0.5;
  const cz = (mn.z + mx.z) * 0.5;
  g.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(cx, cy, cz),
    Math.hypot(mx.x - cx, mx.y - cy, mx.z - cz),
  );
  return g;
}

export function disposeDimensionBodyGeometry(g: THREE.BufferGeometry | null | undefined): void {
  g?.dispose();
}

// ── Line geometry ────────────────────────────────────────────────────────────

/**
 * Builds a `THREE.Line` for one extension or dimension line segment.
 * Both endpoints are lifted to `worldY` so the line sits at the cut-plane
 * elevation rather than the wall base.
 */
export function buildLineGeometry(edge: DimensionEdge, worldY: number): THREE.Line {
  const s = edge.start;
  const e = edge.end;
  const pts = [
    new THREE.Vector3(s.x, worldY, s.z),
    new THREE.Vector3(e.x, worldY, e.z),
  ];
  const geo  = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(geo);
}

/**
 * Builds all line objects for the full analytic record
 * (extension lines + dimension line).
 */
export function buildAnalyticLines(analytic: DimensionAnalytic, worldY: number): THREE.Line[] {
  const lines: THREE.Line[] = [];
  for (const ext of analytic.extensionLines) {
    lines.push(buildLineGeometry(ext, worldY));
  }
  if (analytic.dimensionLine) {
    lines.push(buildLineGeometry(analytic.dimensionLine, worldY));
  }
  return lines;
}

export function disposeLines(lines: THREE.Line[]): void {
  for (const ln of lines) {
    ln.geometry.dispose();
  }
}
