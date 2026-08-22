// BalconyDimensions — the ONE place a balcony dimension may come from.
//
// §FEAT-BALCONY-COMPOUND (L-5600) · C103 §5 · ADR-0333 · L-127 (the no-literals rule)
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE RULE THIS FILE EXISTS TO ENFORCE
// ═══════════════════════════════════════════════════════════════════════════════
// "A literal dimension typed into a builder is the single most-repeated bug in this
// codebase." ADR-121 §4.4 states it as a law: *a richer HARDCODED glyph is the same
// bug at higher resolution*. It has been paid for by the door (L-266), the window
// (L-278), the plan tools (L-127) and the pool (§FEAT-SWIMMING-POOL-ELEMENT).
//
// ⚠ AND IT HAS ALREADY BEEN PAID FOR BY THE BALCONY, IN THIS REPO, TODAY.
// `apps/editor/src/ui/residential-building/ResidentialBuildingExecutor.ts:142-147`
// carries FIVE balcony constants as module-scope literals —
//
//     BALCONY_DEPTH_M = 1.4 · BALCONY_MIN_WIDTH_M = 2.5 ·
//     BALCONY_SLAB_THICKNESS_M = 0.2 · BALCONY_GUARD_HEIGHT_M = 1.1 ·
//     BALCONY_SIDE_INSET_M = 0.05
//
// — reachable by NO user and overridable by NOTHING. They are not deleted by this
// package (that generator is a batch pipeline with its own tuned intent, and
// silently re-tuning a shipped generator is a different change), but they are the
// reason this file exists BEFORE any balcony record does: the moment a second
// balcony producer copies a number, the two disagree and neither is wrong.
//
// So: the founder said 1.0 m wide × 0.5 m deep with a 1.0 m railing.
// **THOSE ARE DEFAULTS, NOT CONSTANTS.** They live HERE, once, in
// `BALCONY_DIMENSION_DEFAULTS`, and nowhere else in the tree.
//
// The resolution chain has exactly three tiers, strongest first — the same chain
// `resolvePoolDimensions()` and `resolveWindowDimensions()` use:
//
//     1. the BALCONY RECORD's own field   (an explicit user override)
//     2. its SYSTEM TYPE                  (a "French Balcony 0.4 m" family)
//     3. BALCONY_DIMENSION_DEFAULTS       (the documented default, below)
//
// EVERY consumer — the assembly, the plan preview, the property panel, the
// schedule — MUST call `resolveBalconyDimensions()`. None may read `balcony.width`
// directly (it is `number | undefined`, so reading it raw is a type error at the
// point of use, which is deliberate), and none may carry a dimensional constant of
// its own. `__tests__/balconyNoLiterals.test.ts` enforces that at SOURCE level
// across this package and the balcony plugin.

import { trace } from '@opentelemetry/api';
import type { Balcony } from '@pryzm/schemas';

const _tracer = trace.getTracer('pryzm-geometry-balcony');

/**
 * A balcony system type — tier 2 of the resolution chain.
 *
 * This is the seam a "French Balcony 0.4 m" / "Terrace 2.5 m" family plugs into.
 * Every field is optional: a system type may pin some dimensions and leave the rest
 * to the documented default.
 */
export interface BalconySystemType {
  readonly id: string;
  readonly name?: string;
  readonly width?: number;
  readonly projection?: number;
  readonly railingHeight?: number;
  readonly slabThickness?: number;
  readonly finishThickness?: number;
  readonly railDiameter?: number;
  readonly railingTypeId?: string;
  readonly finishTypeId?: string;
}

/**
 * TIER 3 — the documented defaults. **The only dimensional literals about a balcony
 * that may exist in this package or the balcony plugin.**
 *
 * Every value is justified, because an unjustified default is a literal wearing a hat:
 *
 *  • `width` 1.0 m — the founder's stated default ("initially default of 1 Meter").
 *    It is also the smallest span that admits a standard 0.9 m leaf onto the balcony,
 *    so the default balcony is enterable through the default door.
 *  • `projection` 0.5 m — the founder's stated default ("0.5 depth"). This is a
 *    JULIET/French balcony depth: standing room, not sitting room. It is deliberately
 *    NOT the residential pipeline's 1.4 m, which is that generator's own tuned intent
 *    for a full apartment balcony and is reachable by no user.
 *  • `railingHeight` 1.0 m — the founder's stated default ("1 Meter Hight railing"),
 *    measured from the FINISHED floor level, which is where every guard code measures
 *    it from. ⚠ Note it is BELOW the 1.1 m the residential generator uses: 1.1 m is
 *    the common UK/ES minimum for a dwelling above a threshold height, so a balcony
 *    left at the default may not satisfy a jurisdiction's guard rule. That is a
 *    PARAMETER the user can change, and it is stated rather than silently overridden
 *    — C63's rule that a refusal or a caveat beats a fabricated compliance.
 *  • `slabThickness` 0.2 m — the plate default this repo already uses for a
 *    cantilever balcony floor (`BALCONY_SLAB_THICKNESS_M`, and the `Slab` schema's
 *    own 0.2 m default). Chosen to AGREE with the shipped generator rather than to
 *    introduce a third figure.
 *  • `finishThickness` 0.015 m — the `Floor` schema's documented default and
 *    `DEFAULT_FINISH_THICKNESS_M` in `FloorTypes.ts` (tile / engineered timber).
 *    Same reasoning: agree with the existing family, do not re-decide for it.
 *  • `railDiameter` 0.04 m — the `Handrail` schema's own documented default. The
 *    railing member is a HANDRAIL, so its default section is the handrail family's.
 */
export const BALCONY_DIMENSION_DEFAULTS = {
  width: 1.0,
  projection: 0.5,
  railingHeight: 1.0,
  slabThickness: 0.2,
  finishThickness: 0.015,
  railDiameter: 0.04,
} as const;

/**
 * The cantilever slab's `baseOffset`.
 *
 * ⭐ NOT A DIMENSION, AND NOT A DEFAULT — a SEMANTIC ANCHOR, whose value is
 * definitionally zero. The slab family's §03 anchor is *"the slab is positioned so
 * its TOP face aligns with the level datum"*, so a balcony plate whose walking
 * surface is the storey's floor has `baseOffset = 0` by definition, not by choice.
 * There is nothing here for a user or a system type to override.
 *
 * ⚠ It is named and exported anyway, and it lives in THIS file, because the
 * no-literals guard is right to fire on `baseOffset: 0` and the correct response to a
 * guard firing is never to loosen the guard. `balconyNoLiterals.test.ts` caught this
 * on its first run — which is the guard working, and is recorded rather than quietly
 * fixed. Naming it here keeps the rule *"BalconyDimensions.ts is the only file that
 * may contain a balcony number"* exactly true.
 */
export const SLAB_TOP_AT_LEVEL_DATUM = 0;

/** The fully-resolved dimension set. Every field is REQUIRED — resolution is total. */
export interface ResolvedBalconyDimensions {
  /** Clear span along the host wall, in metres. */
  readonly width: number;
  /** Projection away from the host wall, in metres. */
  readonly projection: number;
  /** Railing height above the FINISHED floor level, in metres. */
  readonly railingHeight: number;
  /** Cantilever slab thickness, in metres. */
  readonly slabThickness: number;
  /** Floor-finish assembly thickness, in metres. */
  readonly finishThickness: number;
  /** Handrail section diameter, in metres. */
  readonly railDiameter: number;
}

/**
 * Resolve every balcony dimension through `record → systemType → documented default`.
 *
 * THE ONE CHOKEPOINT. If you need a balcony dimension, you call this. There is no
 * other legitimate source, and the no-literals guard will red your PR if you invent
 * one.
 *
 * @param balcony    the balcony record (tier 1)
 * @param systemType its resolved system type, if any (tier 2)
 */
export function resolveBalconyDimensions(
  balcony: Pick<
    Balcony,
    'width' | 'projection' | 'railingHeight' | 'slabThickness' | 'finishThickness'
  >,
  systemType?: BalconySystemType,
): ResolvedBalconyDimensions {
  return _tracer.startActiveSpan('pryzm.balcony.resolveDimensions', (span) => {
    try {
      const pick = <T>(fromRecord: T | undefined, fromType: T | undefined, fallback: T): T =>
        fromRecord ?? fromType ?? fallback;

      const resolved: ResolvedBalconyDimensions = {
        width: pick(balcony.width, systemType?.width, BALCONY_DIMENSION_DEFAULTS.width),
        projection: pick(
          balcony.projection,
          systemType?.projection,
          BALCONY_DIMENSION_DEFAULTS.projection,
        ),
        railingHeight: pick(
          balcony.railingHeight,
          systemType?.railingHeight,
          BALCONY_DIMENSION_DEFAULTS.railingHeight,
        ),
        slabThickness: pick(
          balcony.slabThickness,
          systemType?.slabThickness,
          BALCONY_DIMENSION_DEFAULTS.slabThickness,
        ),
        finishThickness: pick(
          balcony.finishThickness,
          systemType?.finishThickness,
          BALCONY_DIMENSION_DEFAULTS.finishThickness,
        ),
        // `railDiameter` has no record tier: the balcony record deliberately carries no
        // rail section. A user who wants a different section edits the RAILING MEMBER,
        // which is a real handrail with the whole handrail property panel behind it —
        // that is the founder's "changed on demand by selecting the independent
        // elements". A parent field here would be a second, rival place to say it.
        railDiameter: pick(
          undefined,
          systemType?.railDiameter,
          BALCONY_DIMENSION_DEFAULTS.railDiameter,
        ),
      };

      span.setAttribute('pryzm.balcony.width', resolved.width);
      span.setAttribute('pryzm.balcony.projection', resolved.projection);
      span.setAttribute('pryzm.balcony.railingHeight', resolved.railingHeight);
      span.setAttribute('pryzm.balcony.systemTypeId', systemType?.id ?? '(none)');
      return resolved;
    } finally {
      span.end();
    }
  });
}
