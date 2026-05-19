// JoinData — wall (and other linear elements) join-resolution input.
//
// FROZEN at S08 D2 by ADR-009 (lines 602-606 of the S08 sprint plan).
// Pre-resolved by the wall handler before the producer is invoked;
// the producer never reads the wall store and never queries
// neighbours.
//
// `miterAngleRad` is the angle (in radians) between the wall's
// forward direction and the miter plane normal.  `0` means the miter
// plane is perpendicular to the wall (i.e. a flat / square cap, but
// still emitted as a join);  `±π/4` is the canonical 90° corner.  The
// producer converts the angle to a unit `(nx, nz)` normal internally
// (see `producers/_internal/resolveMiters.ts`).

import type { WallId } from '@pryzm/protocol';

export interface JoinEnd {
  /** Miter angle in radians.  `0` = flat cap; `π/4` = 90° corner. */
  readonly miterAngleRad: number;
  /** The neighbour wall participating in the join. */
  readonly neighbourId: WallId;
}

/**
 * Join descriptor handed to the wall producer.  Both ends are
 * optional — an absent end means a free-standing flat cap (no join,
 * no miter).
 */
export interface JoinData {
  readonly start?: JoinEnd;
  readonly end?: JoinEnd;
}

/**
 * Sentinel used by tests + benchmarks that need to invoke the
 * producer without any joins resolved.
 */
export const NO_JOINS: Readonly<JoinData> = Object.freeze({});

// Legacy join-kind names kept as a deprecated exported type for any
// in-flight code that referenced the S07 stub.  Kept as `type` only
// (no value emit) — new callers use `JoinEnd` + `miterAngleRad`.
export type JoinKind = 'flat' | 'miter' | 't-junction' | 'cross';
