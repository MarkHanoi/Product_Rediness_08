// TransformWallHandler — consolidated geometric transform handler (S10-T1).
//
// `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md`
// MERGES 5 PRYZM 1 commands → 1 PRYZM 2 handler with discriminated `kind`:
//
//   • Move          — translate baseLine by a 2D delta on the XZ plane.
//   • Mirror        — reflect baseLine across an axis (origin + direction).
//   • Scale         — scale baseLine endpoints around a 3D pivot by a factor.
//   • Offset        — translate baseLine perpendicular to its own direction
//                     by `distance`, on the chosen `side`.
//   • ReferenceEdit — replace baseLine with a freshly resolved 2-tuple.
//
// Each kind dispatches to a thin private helper (`transformMove`,
// `transformMirror`, `transformScale`, `transformOffset`,
// `transformReferenceEdit`).  Every helper PRESERVES the wall's
// y-elevation (`Wall.refine` rule (2)) — only the X/Z components are
// rewritten.  The dispatch is exhaustive: a `never`-typed default case
// makes any added kind a TYPE error at compile time.
//
// SEMANTIC NOTE — relationship to S07-T5 `MoveWall` (`wall.move`):
//   `MoveWall` accepts an ABSOLUTE 2-point baseLine and is the cascade
//   trigger (`wall.move` → `wall.recomputeMiter`).  `TransformWall.move`
//   accepts a 2D DELTA — it is the inspector / nudge / drag command and
//   composes naturally with snapping.  Both coexist; the cascade-rule
//   registration in `bootstrap.ts` (S10-T6 wiring) declares both
//   `wall.move` and `wall.transform` as wall-baseline cascade triggers.
//
// PERF NOTE — `Math.hypot` is called twice in the offset helper because
// the perpendicular vector must be unit-length; pre-computing the
// inverse-length is fine for 1-mm-tolerance use but clamped at 1e-9 to
// avoid NaN on a coincident-endpoint baseline (which the schema would
// have rejected upstream — defensive guard for in-flight cascades).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { WallDimensionsError, WallNotFoundError } from '../errors.js';
import type { WallData, WallsState } from '../store.js';

/** 2D point on the XZ floor plane (world-X, world-Z).  Distinct from
 *  `Vec2` in `@pryzm/schemas` — that type uses `{ x, y }` where `y`
 *  silently means world-Z.  We use explicit `{ x, z }` here to keep
 *  every transform helper auditable at a glance. */
export interface XZPoint {
  readonly x: number;
  readonly z: number;
}

/** 3D point alias mirroring the Vec3 schema shape. */
export interface XYZPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type TransformWallKind = TransformWallPayload['kind'];

export type TransformWallPayload =
  | { readonly kind: 'move';          readonly id: string; readonly delta: XZPoint }
  | { readonly kind: 'mirror';        readonly id: string; readonly axis: { readonly origin: XZPoint; readonly direction: XZPoint } }
  | { readonly kind: 'scale';         readonly id: string; readonly pivot: XZPoint; readonly factor: number }
  | { readonly kind: 'offset';        readonly id: string; readonly distance: number; readonly side: 'left' | 'right' }
  | { readonly kind: 'referenceEdit'; readonly id: string; readonly newBaseLine: WallData['baseLine'] };

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

/** Minimum baseline length the schema enforces (`Wall.refine` rule (1)). */
const MIN_WALL_LEN = 0.05;

/** Below this magnitude the perpendicular vector for `offset` is treated
 *  as ill-defined — guards against NaN if a cascade ever hands us a
 *  zero-length baseline (which the schema would have rejected upstream). */
const PERP_EPS = 1e-9;

function isFiniteXZ(p: unknown): p is XZPoint {
  if (typeof p !== 'object' || p === null) return false;
  const r = p as Record<string, unknown>;
  return (
    typeof r.x === 'number' && Number.isFinite(r.x) &&
    typeof r.z === 'number' && Number.isFinite(r.z)
  );
}

function isFiniteVec3(v: unknown): v is XYZPoint {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.x === 'number' && Number.isFinite(r.x) &&
    typeof r.y === 'number' && Number.isFinite(r.y) &&
    typeof r.z === 'number' && Number.isFinite(r.z)
  );
}

function planarLen(a: XYZPoint, b: XYZPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function ensureMinLen(a: XYZPoint, b: XYZPoint, kind: string): void {
  if (planarLen(a, b) < MIN_WALL_LEN) {
    throw new WallDimensionsError(
      `wall.transform[${kind}] would shrink baseLine below ${MIN_WALL_LEN} m`,
    );
  }
}

// ── Private helpers — one per kind ─────────────────────────────────
//
// Each returns the NEW baseLine 2-tuple.  Y is preserved verbatim from
// the input wall (level elevation is not a property of the transform).

function transformMove(wall: WallData, delta: XZPoint): WallData['baseLine'] {
  const [a, b] = wall.baseLine;
  return [
    { x: a.x + delta.x, y: a.y, z: a.z + delta.z },
    { x: b.x + delta.x, y: b.y, z: b.z + delta.z },
  ];
}

/** Reflect a 2D point across a line through `origin` with direction
 *  vector `dir` (need not be unit length — we normalise internally). */
function reflectXZ(p: XYZPoint, origin: XZPoint, dir: XZPoint): { x: number; z: number } {
  const dlen = Math.hypot(dir.x, dir.z);
  if (dlen < PERP_EPS) {
    throw new WallDimensionsError('wall.transform[mirror] axis direction is zero-length');
  }
  const ux = dir.x / dlen;
  const uz = dir.z / dlen;
  // Vector from origin to p (planar).
  const vx = p.x - origin.x;
  const vz = p.z - origin.z;
  // Project onto axis: dot(v, u).
  const t = vx * ux + vz * uz;
  // Reflection = 2 * (t * u) - v   then re-anchor at origin.
  return {
    x: origin.x + (2 * t * ux - vx),
    z: origin.z + (2 * t * uz - vz),
  };
}

function transformMirror(
  wall: WallData,
  axis: { origin: XZPoint; direction: XZPoint },
): WallData['baseLine'] {
  const [a, b] = wall.baseLine;
  const ra = reflectXZ(a, axis.origin, axis.direction);
  const rb = reflectXZ(b, axis.origin, axis.direction);
  return [
    { x: ra.x, y: a.y, z: ra.z },
    { x: rb.x, y: b.y, z: rb.z },
  ];
}

function transformScale(
  wall: WallData,
  pivot: XZPoint,
  factor: number,
): WallData['baseLine'] {
  const [a, b] = wall.baseLine;
  return [
    {
      x: pivot.x + (a.x - pivot.x) * factor,
      y: a.y,
      z: pivot.z + (a.z - pivot.z) * factor,
    },
    {
      x: pivot.x + (b.x - pivot.x) * factor,
      y: b.y,
      z: pivot.z + (b.z - pivot.z) * factor,
    },
  ];
}

function transformOffset(
  wall: WallData,
  distance: number,
  side: 'left' | 'right',
): WallData['baseLine'] {
  const [a, b] = wall.baseLine;
  // Direction vector along the baseline (XZ plane).
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < PERP_EPS) {
    throw new WallDimensionsError(
      'wall.transform[offset] cannot operate on a zero-length baseline',
    );
  }
  // Unit perpendicular: rotate (dx, dz) by +90° → (-dz, dx) (LEFT side
  // when looking from a→b along +X with +Z forward).  RIGHT is the
  // opposite.
  const sign = side === 'left' ? 1 : -1;
  const px = (-dz / len) * distance * sign;
  const pz = ( dx / len) * distance * sign;
  return [
    { x: a.x + px, y: a.y, z: a.z + pz },
    { x: b.x + px, y: b.y, z: b.z + pz },
  ];
}

function transformReferenceEdit(
  _wall: WallData,
  newBaseLine: WallData['baseLine'],
): WallData['baseLine'] {
  // The validator on `canExecute` already proved the new baseLine is
  // schema-compliant; here we just clone the points.
  const [a, b] = newBaseLine;
  return [
    { x: a.x, y: a.y, z: a.z },
    { x: b.x, y: b.y, z: b.z },
  ];
}

/** Exhaustive switch — adding a new `kind` is a compile error here. */
function dispatchTransform(
  wall: WallData,
  cmd: TransformWallPayload,
): WallData['baseLine'] {
  switch (cmd.kind) {
    case 'move':          return transformMove(wall, cmd.delta);
    case 'mirror':        return transformMirror(wall, cmd.axis);
    case 'scale':         return transformScale(wall, cmd.pivot, cmd.factor);
    case 'offset':        return transformOffset(wall, cmd.distance, cmd.side);
    case 'referenceEdit': return transformReferenceEdit(wall, cmd.newBaseLine);
    default: {
      // Compile-time exhaustiveness — `_x` is `never` if every kind is
      // covered.  Runtime safety net throws so a future stale build
      // doesn't silently no-op.
      const _x: never = cmd;
      throw new WallDimensionsError(
        `wall.transform: unknown kind in payload: ${JSON.stringify(_x)}`,
      );
    }
  }
}

export class TransformWallHandler
  implements CommandHandler<TransformWallPayload, WallHandlerStores>
{
  readonly type = 'wall.transform';
  readonly affectedStores = ['wall'] as const;

  canExecute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: TransformWallPayload,
  ): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'cmd.id must be a non-empty string' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    switch (cmd.kind) {
      case 'move':
        if (!isFiniteXZ(cmd.delta)) {
          return { valid: false, reason: 'delta must be { x, z } with finite numbers' };
        }
        return { valid: true };
      case 'mirror':
        if (!isFiniteXZ(cmd.axis?.origin) || !isFiniteXZ(cmd.axis?.direction)) {
          return { valid: false, reason: 'axis.{origin,direction} must be { x, z } with finite numbers' };
        }
        if (Math.hypot(cmd.axis.direction.x, cmd.axis.direction.z) < PERP_EPS) {
          return { valid: false, reason: 'axis.direction must be non-zero' };
        }
        return { valid: true };
      case 'scale':
        if (!isFiniteXZ(cmd.pivot)) {
          return { valid: false, reason: 'pivot must be { x, z } with finite numbers' };
        }
        if (!Number.isFinite(cmd.factor) || cmd.factor === 0) {
          return { valid: false, reason: 'factor must be a finite non-zero number' };
        }
        return { valid: true };
      case 'offset':
        if (!Number.isFinite(cmd.distance)) {
          return { valid: false, reason: 'distance must be a finite number' };
        }
        if (cmd.side !== 'left' && cmd.side !== 'right') {
          return { valid: false, reason: "side must be 'left' or 'right'" };
        }
        return { valid: true };
      case 'referenceEdit': {
        if (!Array.isArray(cmd.newBaseLine) || cmd.newBaseLine.length !== 2) {
          return { valid: false, reason: 'newBaseLine must be a 2-tuple of Vec3' };
        }
        const [a, b] = cmd.newBaseLine;
        if (!isFiniteVec3(a) || !isFiniteVec3(b)) {
          return { valid: false, reason: 'newBaseLine endpoints must be finite { x, y, z }' };
        }
        if (a.y !== b.y) {
          return { valid: false, reason: 'newBaseLine endpoints must share the same y (level elevation)' };
        }
        if (planarLen(a, b) < MIN_WALL_LEN) {
          return { valid: false, reason: `newBaseLine planar length must be ≥ ${MIN_WALL_LEN} m` };
        }
        return { valid: true };
      }
      default: {
        const _x: never = cmd;
        return { valid: false, reason: `unknown transform kind: ${JSON.stringify(_x)}` };
      }
    }
  }

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: TransformWallPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const wall = ctx.stores.wall[cmd.id];
    if (wall === undefined) throw new WallNotFoundError(cmd.id);

    const nextBaseLine = dispatchTransform(wall, cmd);
    ensureMinLen(nextBaseLine[0], nextBaseLine[1], cmd.kind);

    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      const w = draft[cmd.id];
      if (w === undefined) return;
      w.baseLine = [
        { x: nextBaseLine[0].x, y: nextBaseLine[0].y, z: nextBaseLine[0].z },
        { x: nextBaseLine[1].x, y: nextBaseLine[1].y, z: nextBaseLine[1].z },
      ];
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
