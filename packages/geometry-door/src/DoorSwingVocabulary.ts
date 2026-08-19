// DoorSwingVocabulary — the ONE translation between the L0 `Door.swing` enum and
// the legacy `{ hingesSide, swingDirection }` pair.
//
// §L-1040 / C86 §11 #7 / C84 EI-3 · EI-8 · EI-9 · EI-2.
//
// ── WHY THIS FILE EXISTS (C84 EI-10(a) — a named reason, not convenience) ─────────
//
// Two vocabularies describe one thing — "which way does this door open?":
//
//   L0      `Door.swing`        'left-in' | 'left-out' | 'right-in' | 'right-out' | 'sliding'
//                               (packages/schemas/src/elements/Door.ts:67)
//   LEGACY  `hingesSide`        'left' | 'right'          (DoorTypes.ts:63)
//           `swingDirection`    'inward' | 'outward'      (DoorTypes.ts:64)
//
// Before this file, the translation was performed inline at a UI call site
// (`apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts`) as:
//
//     ctx.wallStore?.updateDoor?.(d.id, { swingDirection: updates.swing });
//
// — the `swing` VALUE assigned to the `swingDirection` FIELD. The field name matched;
// the vocabulary did not. NOT ONE of the five `swing` members is a member of
// `swingDirection`, so EVERY swing change from the property panel wrote an
// out-of-union value into the legacy record, silently. C86 §11 #7 predicted "four of
// five map, `'sliding'` is lost"; the measured intersection is EMPTY. Pinned by
// `packages/geometry-door/__tests__/SwingVocabularyCensus.test.ts`.
//
// The translation therefore has to live somewhere that is neither of the two schemas
// and is reachable from both the UI and the geometry layer. It lives beside the
// LEGACY vocabulary because that is the side that needs defending: this package owns
// `DoorOpeningSchema`, so a future widening of `swingDirection` is a one-file change
// that this table is compiled against.
//
// ⛔ THERE IS EXACTLY ONE MAPPER (C84 EI-9). Do not inline a second at a call site —
// that is the defect this file closes. `DOOR_FLIP_STATES`
// (`packages/core-app-model/src/preview/DoorPlacementFlip.ts:50-53`) is NOT a rival:
// it enumerates the four legacy PAIRS for the placement-flip gesture and never speaks
// the `swing` vocabulary, so it answers a different question and is CO-LIVING under
// C84 §3.5.
//
// ── THE FIFTH MEMBER (C84 EI-2 — carried, or DECLARED as dropped; never omitted) ──
//
// `'sliding'` has NO representation in a 2×2 of hinge-side × swing-direction, because
// a sliding door has neither. It is DECLARED unrepresentable here and the mapper
// REFUSES it rather than picking a plausible hinge. C16 CA-DOCTRINE-A: "A refusal
// that names its reason is strictly better than a silent lie." A user who picks
// `sliding` must not be given a hinged door.
//
// ⚠ THIS IS A CONTAINMENT, NOT THE FIX. C86 WO-Voc-1 is unchanged and still OWED:
// `'sliding'` MUST gain a legacy representation, or MUST leave `Door.swing`. Until
// one of those lands, the refusal is what keeps the loss visible instead of silent.
// Retirement condition (C84 EI-10(d)): this module is deleted when the two
// vocabularies collapse to one under C86 WO-C-2's migration.

/** The L0 vocabulary — mirrors `Door.swing` (`schemas/src/elements/Door.ts:67`). */
export type DoorSwing = 'left-in' | 'left-out' | 'right-in' | 'right-out' | 'sliding';

/** The legacy vocabulary — mirrors `DoorOpeningSchema` (`DoorTypes.ts:63-64`). */
export type DoorHingesSide = 'left' | 'right';
export type DoorSwingDirection = 'inward' | 'outward';

export interface LegacySwingPair {
  readonly hingesSide: DoorHingesSide;
  readonly swingDirection: DoorSwingDirection;
}

/**
 * The four representable members. `'sliding'` is deliberately absent — see the
 * header. Exported so a census can assert the table is total over what it claims.
 */
export const SWING_TO_LEGACY: Readonly<Record<Exclude<DoorSwing, 'sliding'>, LegacySwingPair>> =
  Object.freeze({
    'left-in': { hingesSide: 'left', swingDirection: 'inward' },
    'left-out': { hingesSide: 'left', swingDirection: 'outward' },
    'right-in': { hingesSide: 'right', swingDirection: 'inward' },
    'right-out': { hingesSide: 'right', swingDirection: 'outward' },
  });

/** Every member the L0 enum can hold, in schema order. */
export const ALL_DOOR_SWINGS: readonly DoorSwing[] = Object.freeze([
  'left-in',
  'left-out',
  'right-in',
  'right-out',
  'sliding',
]);

/**
 * The members the legacy record CANNOT hold, declared rather than discovered.
 * C86 WO-Voc-1 closes when this is empty.
 */
export const UNREPRESENTABLE_SWINGS: readonly DoorSwing[] = Object.freeze(['sliding']);

export type SwingMapResult =
  | { readonly ok: true; readonly legacy: LegacySwingPair }
  | { readonly ok: false; readonly reason: string };

/**
 * Translate an L0 `swing` into the legacy pair, or REFUSE with a reason a caller can
 * surface. Never returns a plausible-but-wrong pair.
 *
 * Failure and emptiness are not the same value here: an unknown input and an
 * unrepresentable input get DIFFERENT reasons, so a caller can tell a typo from a
 * capability gap.
 */
export function mapSwingToLegacy(swing: unknown): SwingMapResult {
  if (typeof swing !== 'string' || !(ALL_DOOR_SWINGS as readonly string[]).includes(swing)) {
    return {
      ok: false,
      reason:
        `door swing "${String(swing)}" is not a member of Door.swing ` +
        `(${ALL_DOOR_SWINGS.join(' | ')}) — nothing was written.`,
    };
  }
  if ((UNREPRESENTABLE_SWINGS as readonly string[]).includes(swing)) {
    return {
      ok: false,
      reason:
        `door swing "${swing}" has no representation in the legacy door record, ` +
        `whose vocabulary is hingesSide('left'|'right') × swingDirection('inward'|'outward'). ` +
        `Refusing rather than storing a hinged door for a sliding one (C86 WO-Voc-1, C84 EI-3).`,
    };
  }
  return { ok: true, legacy: SWING_TO_LEGACY[swing as Exclude<DoorSwing, 'sliding'>] };
}
