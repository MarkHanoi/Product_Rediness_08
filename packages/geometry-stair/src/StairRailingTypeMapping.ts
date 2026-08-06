/**
 * StairRailingTypeMapping — §FIX-STAIR-RAILING-TYPE-PICKER
 * ========================================================
 *
 * ── THE TWO VOCABULARIES, AND WHY THERE WERE TWO ─────────────────────────────
 *
 * The product ships ONE user-facing railing catalogue: `handrailTypeStore`
 * (`packages/core-app-model/src/stores/HandrailTypeStore.ts`) — five named,
 * dimensioned definitions ("Glass Guardrail 1100 mm · Glass", "Timber Baluster
 * Railing 1000 mm · Baluster", …). It is what the draw-time "Handrail Type" picker
 * lists, and what the placed-handrail property-panel widget lists.
 *
 * A STAIR railing is a different record in a different store
 * (`StairRailingStore` / `StairRailingConfig`) and carries a field called
 * `railingType` whose values are `none | flat-bar | glass-panel | circular`. Those
 * are NOT catalogue entries and never were: they are the four CONSTRUCTION FORMS
 * `StairRailingBuilder` switches on (`buildRailingType_flatBar` /
 * `_glassPanel` / `_circular` / `_none`). `flat-bar` is the default form, which is
 * why the console reports `type=flat-bar` for a railing the user never typed.
 *
 * So the mismatch the founder saw is real but it is not a duplicate catalogue —
 * it is a catalogue (`HandrailTypeDefinition`) and a renderer switch
 * (`RailingType`) that were never connected. This module is that connection, and
 * it UNIFIES rather than forks: `handrailTypeStore` becomes the single named
 * vocabulary for BOTH railing families, and `RailingType` is demoted to what it
 * has always been — a derived construction form.
 *
 * ── THE PROJECTION ───────────────────────────────────────────────────────────
 *
 *   fillType 'glass'    → 'glass-panel'   (panel infill, framed)
 *   fillType 'baluster' → 'flat-bar'      (rectangular balusters + top rail)
 *   fillType 'open'     → railProfile 'round' ? 'circular' : 'flat-bar'
 *
 * That rule reproduces the intent of all five built-ins exactly; it is a RULE, not
 * a lookup table, so a user-defined catalogue type maps too.
 *
 * `RailingType 'none'` is deliberately unreachable from the catalogue: "no railing"
 * is the absence of a railing, not a type of one. Deleting the railing is the
 * operation for that, and it already exists.
 *
 * ── WHAT DRIVES THE GEOMETRY ─────────────────────────────────────────────────
 *
 * The definition's HEIGHT drives `topRailHeight` (900 / 1000 / 1100 mm — the exact
 * numbers the picker advertises), its INFILL drives the construction form and the
 * baluster shape, its THICKNESS drives the baluster width, its `postSpacing === 0`
 * drives "no newel posts" (the built-in "Stair Handrail" declares exactly that),
 * and its `materialName` drives `StairRailingBuilder.makeMaterial`. Nothing here
 * falls back to a hard-coded default when the definition speaks.
 *
 * Fields the catalogue has NO concept of — `balusterSpacing`, `handrailHeight`,
 * `side`, `postAtStart`/`postAtEnd` when posts ARE wanted — are left untouched
 * rather than invented. A type change must not silently reset geometry the type
 * does not describe.
 *
 * Layer: L2 (geometry-stair) → L2/L3 (core-app-model). `StairRailingStore` already
 * imports core-app-model, so no new edge is introduced.
 */

import type { HandrailTypeDefinition } from '@pryzm/core-app-model';
import type { RailingType, StairRailingConfig, BalusterShape } from './StairRailingTypes';

/** The subset of `StairRailingConfig` a catalogue type materialises. */
export type StairRailingTypeFields = Pick<
    StairRailingConfig,
    'typeId' | 'railingType' | 'topRailHeight' | 'balusterShape' | 'balusterWidth' | 'material'
> & { postAtStart?: boolean; postAtEnd?: boolean };

/**
 * Projects a catalogue definition's INFILL + RAIL PROFILE onto the construction
 * form `StairRailingBuilder` switches on.
 *
 * Exported separately because it is the one piece of the mapping that is a
 * judgement, and it deserves to be asserted on its own in the suite.
 */
export function railingTypeForHandrailType(
    fillType: HandrailTypeDefinition['fillType'],
    railProfile: HandrailTypeDefinition['railProfile'],
): RailingType {
    if (fillType === 'glass') return 'glass-panel';
    if (fillType === 'baluster') return 'flat-bar';
    // 'open' — an open balustrade reads as a circular tube rail or a flat-bar frame
    // depending on the rail profile the definition declares.
    return railProfile === 'round' ? 'circular' : 'flat-bar';
}

/**
 * Materialises a `HandrailTypeDefinition` into the `StairRailingConfig` fields it
 * describes. The returned patch is intentionally PARTIAL — see the header note on
 * fields the catalogue has no concept of.
 *
 * @param def the catalogue definition the user chose
 * @returns the fields to merge onto the railing record
 */
export function resolveStairRailingTypeFields(def: HandrailTypeDefinition): StairRailingTypeFields {
    const railingType = railingTypeForHandrailType(def.fillType, def.railProfile);
    const balusterShape: BalusterShape = def.railProfile === 'round' ? 'round' : 'rectangular';

    const fields: StairRailingTypeFields = {
        typeId:        def.id,
        railingType,
        topRailHeight: def.height,
        balusterShape,
        balusterWidth: def.thickness,
        material:      def.materialName ?? 'steel',
    };

    // `postSpacing === 0` is the catalogue's way of saying "no newel posts" — the
    // built-in "Stair Handrail" is exactly that. A stair railing expresses the same
    // thing as postAtStart/postAtEnd, since its posts are terminal, not spaced.
    // `undefined` means the definition is silent, so the railing keeps its posts.
    if (def.postSpacing !== undefined) {
        const hasPosts = def.postSpacing > 0;
        fields.postAtStart = hasPosts;
        fields.postAtEnd   = hasPosts;
    }

    return fields;
}
