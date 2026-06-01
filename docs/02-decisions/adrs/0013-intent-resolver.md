# ADR-013 — Wall intent resolver shape

* **Status:** Accepted
* **Sprint:** S10 (`phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S10-T6, lines 1019-1051)
* **Date:** 2026-04-27
* **Supersedes:** —
* **Superseded by:** —

## Context

PRYZM 1 ships three modules that together drive every "where does this
click resolve to?" decision in the wall family:

* `src/elements/walls/WallIntentResolver.ts:213` — resolves a raycast hit
  on a wall mesh to a typed `WallAnchor` (CENTERLINE / FACE / ENDPOINT
  + LEFT / RIGHT / CENTER side).
* `src/elements/walls/PathResolver.ts:94` — converts arc-or-line wall
  paths to polylines, computes cumulative arc-lengths, finds the closest
  point on a polyline, etc.
* `src/elements/walls/WallSnapCycler.ts:196` — cycles snap candidates on
  Tab; every candidate has a position + a typed source (intersection,
  midpoint, endpoint, perpendicular).

All three import `THREE.Vector3`.  All three are needed by the wall
plugin's L2 tool layer (S09-T3) and committer/overlay layer (S10-T6).

The kill-switch `K1B-2` (S07-T3 real-enforce, lint rule
`pryzm/no-three-outside-committer`) forbids any L2 plugin code from
importing THREE.  The intent resolver therefore CANNOT be a thin
re-export of the PRYZM 1 modules — it must be a port.

## Decision

Consolidate the three PRYZM 1 modules under a single namespace,
`plugins/wall/src/intent.ts`, that exposes:

```ts
// THREE-FREE 3D point — used in place of THREE.Vector3.
export type Vec3 = { readonly x: number; readonly y: number; readonly z: number };
export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

// Path: discriminated union — Line or Arc (mirrors WallPath in the kernel).
export type WallPath =
  | { kind: 'Line'; start: Vec3; end: Vec3 }
  | { kind: 'Arc';  start: Vec3; end: Vec3; control: Vec3 };

export const PathResolver = {
  toPolyline(path: WallPath, segments?: number): Vec3[];
  computeArcLengths(points: readonly Vec3[]): number[];
  distanceToT(arcLengths: readonly number[], distance: number): number;
  closestPointOnPolyline(p: Vec3, polyline: readonly Vec3[]): Vec3 | null;
};

export type WallAnchorType = 'CENTERLINE' | 'FACE' | 'ENDPOINT';
export type WallAnchorSide = 'LEFT' | 'RIGHT' | 'CENTER';
export interface WallAnchor {
  readonly type: WallAnchorType;
  readonly side: WallAnchorSide;
  readonly position: Vec3;
  readonly tangent: Vec3;
}

export const WallIntent = {
  resolveHitToAnchor(hit: Vec3, wall: WallWithCurve): WallAnchor | null;
  resolvePlacement(p: Vec3, walls: readonly WallWithCurve[]): WallAnchor | null;
};

export interface WallSnapCandidate {
  readonly source: 'INTERSECTION' | 'MIDPOINT' | 'ENDPOINT' | 'PERPENDICULAR';
  readonly position: Vec3;
}

export class WallSnapCycler {
  feed(candidates: readonly WallSnapCandidate[]): void;
  next(): WallSnapCandidate | null;
  reset(): void;
}
```

THREE-side mapping (for the committer / tool reviewer):

| PRYZM 1 entry point                              | PRYZM 2 port                              |
| ------------------------------------------------ | ----------------------------------------- |
| `WallIntentResolver.resolveHitToAnchor`          | `WallIntent.resolveHitToAnchor`           |
| `WallIntentResolver.resolvePlacement`            | `WallIntent.resolvePlacement`             |
| `PathResolver.toPolyline`                        | `PathResolver.toPolyline`                 |
| `PathResolver.computeArcLengths`                 | `PathResolver.computeArcLengths`          |
| `PathResolver.distanceToT`                       | `PathResolver.distanceToT`                |
| `PathResolver.closestPointOnPolyline`            | `PathResolver.closestPointOnPolyline`     |
| `WallSnapCycler` (whole class)                   | `WallSnapCycler` (whole class)            |

## Consequences

* **(+)** L2 plugin code stays THREE-free.  The lint rule
  `pryzm/no-three-outside-committer` real-enforces this; the intent
  resolver does not import THREE.
* **(+)** Parity guarantee — the intent resolver is exercised at the
  start of every wall fixture geometry.  Any divergence in this module
  surfaces as a position/length parity failure on the producer side
  (`tests/parity/wall/`), so we get free regression coverage.
* **(+)** Single namespace import — `import { WallIntent, PathResolver,
  WallSnapCycler } from './intent.js'` replaces three separate imports
  in the tool / committer / overlay layers.
* **(−)** Bit-exact parity between PRYZM 1 (THREE.Vector3-based) and
  PRYZM 2 (Vec3-based) requires reproducing the same float arithmetic
  order.  The port preserves arithmetic order verbatim from the PRYZM 1
  source; deviation requires a follow-up ADR.
* **(−)** A new `Vec3` type proliferates in the wall plugin's surface
  area.  We deliberately do NOT use the schema `Vec3` (which is a
  `{ x, y }` 2-vector with `y` silently meaning world-Z) — the explicit
  `{ x, y, z }` shape is auditable at a glance.

## References

* Implementation: `plugins/wall/src/intent.ts` (header cites this ADR)
* Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S10-T6 (lines 1019-1051)
* PRYZM 1 prior art: `src/elements/walls/{WallIntentResolver,PathResolver,WallSnapCycler}.ts`
* Related ADRs: ADR-008 (wall handler triage), ADR-009 (producer signature), ADR-012 (cascade-rule registration)
