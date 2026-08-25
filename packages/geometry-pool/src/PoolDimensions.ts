// PoolDimensions — the ONE place a pool dimension may come from.
//
// §FEAT-SWIMMING-POOL-ELEMENT (L-292) · ADR-0124 §7 · L-127 (the no-literals rule)
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE RULE THIS FILE EXISTS TO ENFORCE
// ═══════════════════════════════════════════════════════════════════════════════
// "A literal dimension typed into a builder is the single most-repeated bug in this
// codebase." ADR-121 §4.4 states it as a law: *a richer HARDCODED glyph is the same
// bug at higher resolution*. It has now been paid for by the door (L-266), the
// window (L-278 — a `Math.max(cdt, 0.06)` inside `WindowBuilder` made a double
// window grow a 60 mm meeting stile in 3D while its plan symbol drew a 30 mm one)
// and the plan tools (L-127).
//
// So: the founder said the pool is 1.2 m deep. **THAT IS A DEFAULT, NOT A CONSTANT.**
// It lives HERE, once, in `POOL_DIMENSION_DEFAULTS`, and nowhere else in the tree.
//
// The resolution chain has exactly three tiers, strongest first — the same chain
// `resolveWindowDimensions()` uses:
//
//     1. the POOL RECORD's own field   (an explicit user override)
//     2. its SYSTEM TYPE               (the "Domestic Pool 1.2m" family)
//     3. POOL_DIMENSION_DEFAULTS       (the documented default, below)
//
// EVERY consumer — the assembly, the water builder, the plan symbol, the section
// symbol, the schedule — MUST call `resolvePoolDimensions()`. None may read
// `pool.depth` directly (it is `number | undefined`, so reading it raw is a type
// error at the point of use, which is deliberate), and none may carry a dimensional
// constant of its own. `packages/geometry-pool/__tests__/poolNoLiterals.test.ts`
// enforces this at SOURCE level across the whole package and the pool plugin.

import { trace } from '@opentelemetry/api';
import type { Pool } from '@pryzm/schemas';

const _tracer = trace.getTracer('pryzm-geometry-pool');

/**
 * A pool system type — tier 2 of the resolution chain.
 *
 * This is the seam a "Domestic Pool 1.2 m" / "Competition Pool 2.0 m" family plugs
 * into. Every field is optional: a system type may pin some dimensions and leave the
 * rest to the documented default.
 */
export interface PoolSystemType {
  readonly id: string;
  readonly name?: string;
  readonly depth?: number;
  readonly wallThickness?: number;
  readonly floorThickness?: number;
  readonly freeboard?: number;
  readonly waterColor?: string;
  readonly waterOpacity?: number;
}

/**
 * TIER 3 — the documented defaults. **The only dimensional literals about a pool
 * that may exist anywhere in PRYZM.**
 *
 * Every value is justified, because an unjustified default is a literal wearing a
 * hat:
 *
 *  • `depth` 1.2 m — the founder's stated default and the standard shallow-end /
 *    domestic-pool depth. Below 1.35 m diving is prohibited, which is why 1.2 m is
 *    the conventional "safe domestic" figure.
 *  • `wallThickness` 0.25 m — a reinforced-concrete retaining wall holding back
 *    1.2 m of water plus surcharge; it is also ≥ the `Wall` schema's 0.05 m floor.
 *  • `floorThickness` 0.3 m — a suspended pool base slab; thicker than the 0.2 m
 *    default `Slab` because it is structural, not a floor plate.
 *  • `freeboard` 0.1 m — the water surface sits 100 mm below the coping, the
 *    conventional gap that stops the pool overtopping. **This is the field that
 *    makes "the water level below the coping" representable at all** — the founder's
 *    named regret case for the "water is just a blue slab" shortcut (ADR-0124 §4).
 *  • `waterColor` `#2E86C1` — "transparent, blueish", per the brief. A mid
 *    cerulean: the blue channel dominates both others, which is what
 *    `poolWaterRenderIntent.test.ts` WR-1 actually asserts (re-tuning the hex is
 *    free; turning the water grey or green is not).
 *  • `waterOpacity` 0.3 — ⭐ THE FOUNDER'S FIGURE, AND IT IS A COMPLEMENT.
 *    He asked for *"a box with 70% TRANSPARENCY in blue"*. Transparency and
 *    opacity are complements, so 70% transparent IS `opacity: 0.3`, and writing
 *    `0.7` here would ship the number he said while showing the opposite of what
 *    he asked for — nearly solid water. This value was 0.55 before §POOL95 (45%
 *    transparent), which was nobody's stated figure; it is now his, and it is
 *    still a DEFAULT, overridable at both stronger tiers.
 */
export const POOL_DIMENSION_DEFAULTS = {
  depth: 1.2,
  wallThickness: 0.25,
  floorThickness: 0.3,
  freeboard: 0.1,
  waterColor: '#2E86C1',
  waterOpacity: 0.3,
} as const;

/** The fully-resolved dimension set. Every field is REQUIRED — resolution is total. */
export interface ResolvedPoolDimensions {
  /** Host-slab TOP → pool-floor TOP, in metres. The pool wall's height. */
  readonly depth: number;
  readonly wallThickness: number;
  readonly floorThickness: number;
  /** Water surface sits this far BELOW the host slab's top face, in metres. */
  readonly freeboard: number;
  readonly waterColor: string;
  readonly waterOpacity: number;
}

/**
 * Resolve every pool dimension through `record → systemType → documented default`.
 *
 * THE ONE CHOKEPOINT. If you need a pool dimension, you call this. There is no
 * other legitimate source, and the no-literals guard will red your PR if you invent
 * one.
 *
 * @param pool       the pool record (tier 1)
 * @param systemType its resolved system type, if any (tier 2)
 */
export function resolvePoolDimensions(
  pool: Pick<
    Pool,
    'depth' | 'wallThickness' | 'floorThickness' | 'freeboard' | 'waterColor' | 'waterOpacity'
  >,
  systemType?: PoolSystemType,
): ResolvedPoolDimensions {
  return _tracer.startActiveSpan('pryzm.pool.resolveDimensions', (span) => {
    try {
      // ⚠ `??`, NEVER `||`. An authored `waterOpacity: 0` — invisible water, which
      // the schema admits (`min(0)`) — is FALSY, so `||` would read it as "unset"
      // and silently restore the default: the architect turns the water off and it
      // stays on. Pinned by `poolWaterRenderIntent.test.ts` WR-4.
      const pick = <T>(fromRecord: T | undefined, fromType: T | undefined, fallback: T): T =>
        fromRecord ?? fromType ?? fallback;

      const resolved: ResolvedPoolDimensions = {
        depth:          pick(pool.depth,          systemType?.depth,          POOL_DIMENSION_DEFAULTS.depth),
        wallThickness:  pick(pool.wallThickness,  systemType?.wallThickness,  POOL_DIMENSION_DEFAULTS.wallThickness),
        floorThickness: pick(pool.floorThickness, systemType?.floorThickness, POOL_DIMENSION_DEFAULTS.floorThickness),
        freeboard:      pick(pool.freeboard,      systemType?.freeboard,      POOL_DIMENSION_DEFAULTS.freeboard),
        // ⭐ §POOL95 — TIER 1 WAS A LITERAL `undefined` HERE, for both fields, so the
        // architect's own override was structurally unreachable: `Pool` carried no
        // such field to read. The chain is documented as three tiers in this file's
        // header and was two for the water's appearance. It is three now.
        waterColor:     pick(pool.waterColor,     systemType?.waterColor,     POOL_DIMENSION_DEFAULTS.waterColor),
        waterOpacity:   pick(pool.waterOpacity,   systemType?.waterOpacity,   POOL_DIMENSION_DEFAULTS.waterOpacity),
      };

      span.setAttribute('pryzm.pool.depth', resolved.depth);
      span.setAttribute('pryzm.pool.freeboard', resolved.freeboard);
      span.setAttribute('pryzm.pool.systemTypeId', systemType?.id ?? '(none)');
      return resolved;
    } finally {
      span.end();
    }
  });
}
