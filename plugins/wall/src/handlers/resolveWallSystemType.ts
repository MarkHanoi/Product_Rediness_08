// resolveWallSystemType — §FIX-WALL-LAYERS-PLAN-VS-3D-CREATION (L-239 / L-211)
//
// THE ONE SITE where a wall's `systemTypeId` is turned into the two intrinsic
// fields the renderers actually read: `thickness` and `layers[]`.
//
// WHY THIS EXISTS (C11 §2 — one element ⇒ one creation pipeline):
//   Before this module, `systemTypeId → thickness` was resolved in CreateWall
//   only (§WALL-TYPE-THICKNESS), and `systemTypeId → layers` was resolved
//   NOWHERE on the bus pipeline — only in the *legacy* `CreateWallCommand`
//   (packages/command-registry). The 3D wall tool happens to dual-write through
//   that legacy command, so a 3D-created layered wall got its `layers[]`; the
//   PLAN tool is bus-only, so a plan-created wall of the SAME type was stored
//   with the right thickness but NO layers. Both renderers
//   (WallFragmentBuilder §03-1.3 and WallLayerPlanSymbolBuilder) read
//   `wall.layers` FROM THE INSTANCE — so the plan-created wall drew as a plain
//   wall in BOTH views (L-239), and any wall lacking a stamped stack showed
//   layers in 3D but not in plan (L-211).
//
//   FOUNDER DECISION (binding): the INSTANCE is canonical — `layers` is
//   persisted on the wall record, and the resolution happens ONCE, BELOW the
//   tools, at the command chokepoint. No tool may resolve (or forget) it.
//
// CONTRACTS: C11 §2/§3.2 (single creation pipeline, chokepoint resolution),
//            C03 §2 (schemas are the canonical record — `Wall.layers` is
//            first-class domain data, not a render detail),
//            ADR-0116 (the ONE shared wall system-type catalogue).
//
// PURITY: no I/O, no THREE, no DOM. The catalogue is injected.

import type { WallSystemTypeStore } from '../system-type-store.js';
import type { WallData } from '../store.js';

/** The two intrinsic fields a wall system type contributes to an instance. */
export interface ResolvedWallSystemType {
  /** Total thickness in metres. `undefined` ⇒ caller/schema default stands. */
  readonly thickness?: number;
  /** Deep-cloned layer stack. `undefined` ⇒ plain (unlayered) wall. */
  readonly layers?: WallData['layers'];
}

/** Caller-supplied wall fields that participate in the resolution. */
export interface WallSystemTypeInputs {
  readonly systemTypeId?: string;
  readonly thickness?: number;
  readonly layers?: WallData['layers'];
}

/**
 * Resolve `{ thickness, layers }` for a wall about to be created.
 *
 * PRECEDENCE (deliberate, and identical for every creation path):
 *
 *   1. An EXPLICIT `layers[]` on the payload always wins. This is the
 *      §RESI-FACADE-INTERIOR-WHITE case — a generator that has already
 *      customised the per-layer finish colours (exterior façade colour +
 *      interior white) must not have that stack overwritten by the catalogue's
 *      default colours. When explicit layers are supplied, thickness falls back
 *      to their SUM if the caller gave none.
 *   2. Otherwise, when `systemTypeId` resolves in the catalogue, BOTH fields
 *      come from the type: `layers` is a deep clone of the type's stack and
 *      `thickness` is the type's `totalThickness`. The type's thickness
 *      deliberately OVERRIDES a caller-supplied placeholder — that is the
 *      shipped §WALL-TYPE-THICKNESS / §FIX-PLAN-WALL-TYPE-IGNORED behaviour
 *      (the tool sends a default it cannot authoritatively know).
 *   3. On a catalogue miss (unknown / stale / not-yet-restored type id) the
 *      caller's own values stand and NOTHING is invented. Resolution is
 *      best-effort by design (ADR-0116: `has()` is permissive, an unknown id
 *      must never *reject* a wall).
 *
 * IDEMPOTENT: re-running this over its own output returns the same values —
 * which is what makes the load-time backfill (P4) safe to run on every load.
 */
export function resolveWallSystemType(
  store: WallSystemTypeStore | undefined,
  input: WallSystemTypeInputs,
): ResolvedWallSystemType {
  // (1) Explicit layer stack wins — never clobber a caller's customised finishes.
  if (input.layers !== undefined && input.layers.length > 0) {
    const sum = input.layers.reduce((s, l) => s + (l?.thickness ?? 0), 0);
    return {
      layers: cloneLayers(input.layers),
      thickness:
        input.thickness !== undefined
          ? input.thickness
          : sum > 0
            ? round6(sum)
            : undefined,
    };
  }

  // (2) Catalogue resolution from the type id.
  if (input.systemTypeId !== undefined && store !== undefined) {
    const type = store.get(input.systemTypeId);
    if (type !== undefined) {
      const layers = Array.isArray(type.layers) && type.layers.length > 0
        ? cloneLayers(type.layers as unknown as NonNullable<WallData['layers']>)
        : undefined;
      const total = type.totalThickness;
      return {
        layers,
        thickness:
          typeof total === 'number' && total > 0 ? total : input.thickness,
      };
    }
  }

  // (3) Miss (or no catalogue wired) — the caller's values stand untouched.
  return { thickness: input.thickness, layers: undefined };
}

/** Deep clone so the stored instance can never alias the catalogue's frozen
 *  layer objects (a later `wallSystemTypeStore.update()` must not retro-mutate
 *  walls already committed — Contract §01 §2.2 "frozen snapshot at execution
 *  time"). */
function cloneLayers(
  layers: NonNullable<WallData['layers']>,
): NonNullable<WallData['layers']> {
  return layers.map((l) => ({ ...l }));
}

/** 6dp round — keeps equality assertions stable across float summation, and
 *  matches `WallSystemTypeStore.totalThickness`'s own rounding. */
function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
