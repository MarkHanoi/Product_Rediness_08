// plugins/cross/stair-handrail.ts — stair → handrail cascade rule (S14-T7).
//
// Lifts the PRYZM 1 stair-to-rail coupling
// (`src/elements/handrails/StairHandrailCoupling.ts`) into the L4
// cascade-rule registry per
// `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md`.
//
// Rule contract — same shape as `cross.slab-wall`:
//   • PURE — deterministic for a given lookup snapshot,
//   • UNIT-TESTABLE in isolation (no Store imports),
//   • DECOUPLED from the eventual `pinning` data model.  Today the
//     handrail's `hostId` field carries the host stair id; the rule
//     accepts a caller-injected lookup so future snap-edge models can
//     plug in without changing this file.
//
// FIRES FOR
// ---------
//   • stair.move           → handrail.recompute (translate path)
//   • stair.setShape       → handrail.recompute (re-sample stair edge)
//   • stair.setTreadCount  → handrail.recompute (length changes)
//   • stair.setRiserHeight → handrail.recompute (vertical change)
//   • stair.setWidth       → handrail.recompute (edge offset changes)
//   • stair.rotate         → handrail.recompute (rotate path)
//
// DOES NOT FIRE FOR
// -----------------
//   • stair.setType  — material-only swap, no edge motion.
//   • stair.delete   — handrail lifecycle managed by the host plugin
//                      (orphan handrails are pruned by a separate
//                      garbage-collect pass, not the cascade).

import type { CascadeCommand, CascadeContext, CascadeRule } from '@pryzm/plugin-sdk';

const STAIR_MOVE = 'stair.move';
const STAIR_SET_SHAPE = 'stair.setShape';
const STAIR_SET_TREAD_COUNT = 'stair.setTreadCount';
const STAIR_SET_RISER_HEIGHT = 'stair.setRiserHeight';
const STAIR_SET_WIDTH = 'stair.setWidth';
const STAIR_ROTATE = 'stair.rotate';

const APPLIES_TO: ReadonlySet<string> = new Set([
  STAIR_MOVE,
  STAIR_SET_SHAPE,
  STAIR_SET_TREAD_COUNT,
  STAIR_SET_RISER_HEIGHT,
  STAIR_SET_WIDTH,
  STAIR_ROTATE,
]);

export interface StairHandrailCascadeDeps {
  /** Returns ids of every handrail currently hosted on a given stair.
   *  Should be O(1) — typically a registry lookup. */
  readonly handrailsOnStair: (stairId: string) => readonly string[];

  /** Returns the resampled rail path for a `(stairId, handrailId)` pair
   *  AFTER the stair edit has been applied.  Caller is responsible for
   *  walking the new stair edge (typically the outboard side of the
   *  flight, lifted by the rail's `height`) and returning the polyline.
   *
   *  Returning `null` from this function is a signal to the cascade
   *  runner that the rail should be removed (e.g. host stair was
   *  deleted before the lookup ran); in v1 we don't synthesize a
   *  delete here — the stair plugin's own delete lifecycle is
   *  responsible for orphan cleanup. */
  readonly resampleHandrailPath: (
    stairId: string,
    handrailId: string,
  ) => readonly { readonly x: number; readonly y: number; readonly z: number }[] | null;

  /** Optional rule key override — defaults to `'cross.stair-handrail'`.
   *  Provided so multi-tenant test harnesses can register isolated
   *  copies of the same rule under unique keys. */
  readonly key?: string;
}

function extractStairId(cmd: CascadeCommand): string {
  const p = cmd.payload as { stairId?: unknown };
  if (typeof p.stairId !== 'string' || p.stairId.length === 0) {
    throw new Error(
      `[cross.stair-handrail] cmd.type=${cmd.type} has no string payload.stairId — ` +
        `cannot route stair→handrail cascade`,
    );
  }
  return p.stairId;
}

export function buildStairHandrailCascadeRule(deps: StairHandrailCascadeDeps): CascadeRule {
  if (typeof deps.handrailsOnStair !== 'function') {
    throw new Error('[cross.stair-handrail] handrailsOnStair must be a function');
  }
  if (typeof deps.resampleHandrailPath !== 'function') {
    throw new Error('[cross.stair-handrail] resampleHandrailPath must be a function');
  }

  return {
    key: deps.key ?? 'cross.stair-handrail',

    appliesTo(cmdType: string): boolean { return APPLIES_TO.has(cmdType); },

    extractEntityId: extractStairId,

    resolveAffected(cmd: CascadeCommand, _ctx: CascadeContext): readonly string[] {
      return deps.handrailsOnStair(extractStairId(cmd));
    },

    synthesize(handrailId: string, rootCmd: CascadeCommand, _ctx: CascadeContext): CascadeCommand {
      const stairId = extractStairId(rootCmd);
      const newPath = deps.resampleHandrailPath(stairId, handrailId);
      if (!newPath) {
        // Edge case: lookup returned null mid-cascade.  Synthesize a
        // no-op recompute (with the rail's current path would require
        // store access; instead synthesize the smallest valid edit so
        // the bus still records causality).  Two zero-spaced points
        // are NOT valid (the validator rejects coincident endpoints),
        // so use a tiny epsilon stepoff that downstream callers can
        // detect via `cause: 'lookup-failed'`.
        return {
          type: 'handrail.recompute',
          payload: {
            handrailId,
            path: [
              { x: 0, y: 0, z: 0 },
              { x: 1e-6, y: 0, z: 0 },
            ],
            cause: `cascade:${rootCmd.type}:lookup-failed`,
          },
        };
      }
      return {
        type: 'handrail.recompute',
        payload: {
          handrailId,
          path: newPath,
          cause: `cascade:${rootCmd.type}`,
          stairId,
          cascadedFrom: rootCmd.type,
        },
      };
    },
  };
}

/** Symbolic listing of the stair command types that cascade to handrails.
 *  Exported for tests + bootstrap-time assertions. */
export const STAIR_HANDRAIL_CASCADE_TRIGGERS = [
  STAIR_MOVE,
  STAIR_SET_SHAPE,
  STAIR_SET_TREAD_COUNT,
  STAIR_SET_RISER_HEIGHT,
  STAIR_SET_WIDTH,
  STAIR_ROTATE,
] as const;
