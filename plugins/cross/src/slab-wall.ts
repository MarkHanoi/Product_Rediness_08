// plugins/cross/slab-wall.ts — slab → wall cascade rule (S12-T6).
//
// Lifts the slab/wall coupling from PRYZM 1's
// `src/elements/walls/SlabWallCoupling.ts:133`
// into the L4 cascade-rule registry per
// `code-level ADR docs/02-decisions/adrs/0010-slab-handler-triage.md` §"Cross-element coupling"
// and the wider cascade contract from
// `code-level ADR docs/02-decisions/adrs/0012-cross-element-cascade-rule-registration.md`.
//
// PRYZM 1 expressed the coupling as an **inline branch** inside
// `SlabWallCoupling.applyCascade`:
//
// ```ts
// // PRYZM 1 — abridged
// if (cmd.kind === 'slab.move' || cmd.kind === 'slab.setBaseOffset') {
//   for (const wallId of registry.wallsPinnedToSlab(cmd.slabId)) {
//     bimManager.execute(new MoveWallCommand(wallId, cmd.delta));
//   }
// }
// ```
//
// PRYZM 2 lifts that branch out into a `CascadeRule` whose data
// dependency (which walls are pinned to which slab) is supplied by
// caller-injected lookup functions.  This keeps the rule:
//
//   • PURE (deterministic for a given lookup snapshot),
//   • UNIT-TESTABLE in isolation (no Store imports),
//   • DECOUPLED from the eventual `pinning` data model — the rule is
//     stable when 1C lands the per-wall `pinnedToSlabId` field.
//
// FIRES FOR
// ---------
//   • slab.move           → wall.transform[move]   (translate baseLine)
//   • slab.setBaseOffset  → wall.transform[move]   (translate Y only)
//   • slab.setThickness   → wall.transform[move]   (when wall is pinned
//                                                   to the slab's TOP edge)
//
// DOES NOT FIRE FOR
// -----------------
//   • slab.setType / slab.addHole / slab.removeHole — none of these
//     change the slab's outer outline or top elevation, so no wall
//     position cascade is required.
//
// The rule is wired at bootstrap time per ADR-012 §"Decision":
//
// ```ts
// cascadeRunner.register(buildSlabWallCascadeRule({
//   wallsPinnedToSlab: (slabId) => slabWallRegistry.wallsFor(slabId),
//   wallPinAnchor:     (slabId, wallId) => slabWallRegistry.anchorOf(slabId, wallId),
// }));
// ```

import type { CascadeCommand, CascadeContext, CascadeRule } from '@pryzm/plugin-sdk';

const SLAB_MOVE = 'slab.move';
const SLAB_SET_BASE_OFFSET = 'slab.setBaseOffset';
const SLAB_SET_THICKNESS = 'slab.setThickness';

const APPLIES_TO: ReadonlySet<string> = new Set([
  SLAB_MOVE,
  SLAB_SET_BASE_OFFSET,
  SLAB_SET_THICKNESS,
]);

/** Where on the slab a wall is pinned.  `bottom` walls sit on the
 *  slab's top face; `top` walls hang off the slab below — used to
 *  decide whether a `slab.setThickness` cascades to that wall. */
export type SlabWallPinAnchor = 'bottom' | 'top';

export interface SlabWallCascadeDeps {
  /** Returns the ids of the walls currently pinned to a given slab.
   *  Called once per `slab.*` command; should be cheap (registry
   *  lookup, not a per-wall scan). */
  readonly wallsPinnedToSlab: (slabId: string) => readonly string[];

  /** Returns the anchor of a specific wall on a specific slab.  When
   *  not provided, every pinned wall is treated as `bottom` (which is
   *  by far the common case — bearing walls sit on the slab top). */
  readonly wallPinAnchor?: (slabId: string, wallId: string) => SlabWallPinAnchor;

  /** Optional rule key override — defaults to `'cross.slab-wall'`.
   *  Provided so multi-tenant test harnesses can register isolated
   *  copies of the same rule under unique keys. */
  readonly key?: string;
}

interface SlabMovePayload {
  readonly slabId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}
interface SlabSetBaseOffsetPayload {
  readonly slabId: string;
  readonly baseOffset: number;
  readonly previousBaseOffset?: number;
}
interface SlabSetThicknessPayload {
  readonly slabId: string;
  readonly thickness: number;
  readonly previousThickness?: number;
}

function isSlabMove(cmd: CascadeCommand): cmd is CascadeCommand & { payload: SlabMovePayload } {
  return cmd.type === SLAB_MOVE;
}
function isSlabSetBaseOffset(cmd: CascadeCommand): cmd is CascadeCommand & { payload: SlabSetBaseOffsetPayload } {
  return cmd.type === SLAB_SET_BASE_OFFSET;
}
function isSlabSetThickness(cmd: CascadeCommand): cmd is CascadeCommand & { payload: SlabSetThicknessPayload } {
  return cmd.type === SLAB_SET_THICKNESS;
}

/** Extracts the slab id from any cascade payload this rule fires for.
 *  Default extractor uses `payload.id ?? payload.wallId` per ADR-012;
 *  we override to `payload.slabId` since slab handlers carry it under
 *  that name (matches `MoveSlabHandler` etc.). */
function extractSlabId(cmd: CascadeCommand): string {
  const p = cmd.payload as { slabId?: unknown };
  if (typeof p.slabId !== 'string' || p.slabId.length === 0) {
    throw new Error(
      `[cross.slab-wall] cmd.type=${cmd.type} has no string payload.slabId — ` +
        `cannot route slab→wall cascade`,
    );
  }
  return p.slabId;
}

export function buildSlabWallCascadeRule(deps: SlabWallCascadeDeps): CascadeRule {
  if (typeof deps.wallsPinnedToSlab !== 'function') {
    throw new Error('[cross.slab-wall] wallsPinnedToSlab must be a function');
  }
  const anchorOf = deps.wallPinAnchor ?? (() => 'bottom' as SlabWallPinAnchor);

  return {
    key: deps.key ?? 'cross.slab-wall',

    appliesTo(cmdType: string): boolean {
      return APPLIES_TO.has(cmdType);
    },

    extractEntityId: extractSlabId,

    resolveAffected(cmd: CascadeCommand, _ctx: CascadeContext): readonly string[] {
      const slabId = extractSlabId(cmd);
      const candidates = deps.wallsPinnedToSlab(slabId);
      if (cmd.type !== SLAB_SET_THICKNESS) return candidates;
      // setThickness only cascades to walls pinned to the TOP face —
      // bottom-anchored walls don't move when the slab gets thicker.
      const out: string[] = [];
      for (const wallId of candidates) {
        if (anchorOf(slabId, wallId) === 'top') out.push(wallId);
      }
      return out;
    },

    synthesize(affectedId: string, rootCmd: CascadeCommand, _ctx: CascadeContext): CascadeCommand {
      // Translate the slab edit into a wall.transform[move] payload.
      // The wall plugin's TransformWallHandler accepts `{ wallId,
      // kind:'move', delta }` per `plugins/wall/src/handlers/TransformWall.ts`.
      if (isSlabMove(rootCmd)) {
        return {
          type: 'wall.transform',
          payload: {
            wallId: affectedId,
            kind: 'move',
            delta: { x: rootCmd.payload.delta.x, z: rootCmd.payload.delta.z },
            // Source attribution — useful in the OTel span tree for
            // distinguishing user-issued moves from cascaded ones.
            cascadedFrom: rootCmd.type,
            slabId: extractSlabId(rootCmd),
          },
        };
      }
      if (isSlabSetBaseOffset(rootCmd)) {
        const dy =
          rootCmd.payload.previousBaseOffset !== undefined
            ? rootCmd.payload.baseOffset - rootCmd.payload.previousBaseOffset
            : 0;
        return {
          type: 'wall.transform',
          payload: {
            wallId: affectedId,
            kind: 'move',
            delta: { x: 0, z: 0, y: dy },
            cascadedFrom: rootCmd.type,
            slabId: extractSlabId(rootCmd),
          },
        };
      }
      if (isSlabSetThickness(rootCmd)) {
        const dy =
          rootCmd.payload.previousThickness !== undefined
            ? rootCmd.payload.thickness - rootCmd.payload.previousThickness
            : 0;
        return {
          type: 'wall.transform',
          payload: {
            wallId: affectedId,
            kind: 'move',
            delta: { x: 0, z: 0, y: dy },
            cascadedFrom: rootCmd.type,
            slabId: extractSlabId(rootCmd),
          },
        };
      }
      throw new Error(
        `[cross.slab-wall] synthesize called for unhandled cmd.type=${rootCmd.type}`,
      );
    },
  };
}

/** Symbolic listing of the slab command types that cascade to walls.
 *  Exported for tests + bootstrap-time assertions. */
export const SLAB_WALL_CASCADE_TRIGGERS = [
  SLAB_MOVE,
  SLAB_SET_BASE_OFFSET,
  SLAB_SET_THICKNESS,
] as const;
