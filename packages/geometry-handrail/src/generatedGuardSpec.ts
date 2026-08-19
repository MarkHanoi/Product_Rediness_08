/**
 * §FIX-HANDRAIL-GENERATOR-NO-MATERIAL (L-1203, C95 §15.16.7) — the catalogue fields
 * an AUTO-GENERATED guard inherits, said once.
 *
 * ─── THE DEFECT THIS CLOSES ─────────────────────────────────────────────────
 * The founder's console carries ~145 lines of
 *
 *   `§C100-HANDRAIL-MATERIAL-ID handrail <id> has NO RESOLVABLE MATERIAL —
 *    no materialId and no colour override … Falling back to #cccccc`
 *
 * ⭐ The diagnostic was working exactly as designed: `resolveColour` refuses to fall
 * back SILENTLY (C100 §5), which is the only reason this was measurable at all. The
 * defect was upstream. Measured across every creation route in the repo, FOUR
 * auto-generators hand-list their payload and **never consult the type catalogue**:
 *
 *   · `ResidentialBuildingExecutor` — balcony 3-edge guard (3 per upper apartment,
 *     and therefore the bulk source), roof-garden perimeter guard, stair-void rail
 *   · `HouseLayoutExecutor` — stairwell-void guardrail
 *
 * They pass `{id, start, end, height, thickness, levelId, baseOffset, fillType,
 * railProfile}` and nothing else. `CreateHandrailCommand` is a faithful amplifier —
 * it accepts `materialId` and deliberately does NOT default it (compare `baseOffset ?? 0`
 * and `fillType ?? 'baluster'`, which do) — so every one of those records reached the
 * store naming no material, and every one renders grey.
 *
 * ⛔ AND IT WAS NEVER ONLY ABOUT COLOUR. Those generators also missed the infill
 * fields, so a generated BALUSTER guard got 20 mm generic balusters at the historical
 * 0.11 m pitch instead of the catalogue's members — and, before §FIX-HANDRAIL-INFILLMAXGAP-DEAD,
 * at whatever `postSpacing` happened to be. On a fall-protection guard that is not a
 * cosmetic gap.
 *
 * ─── WHY A SHARED RESOLVER AND NOT FOUR EDITS ───────────────────────────────
 * Four call sites, one question. Patching each one in place would put four copies of
 * "which material does a generated guard use?" in two apps files — the enumerated-copies
 * defect this family has now been bitten by three times (L-1189's shadow list, L-1190's
 * dead event key, L-1202's remembered counts). One resolver, four callers.
 *
 * ⛔ IT DELIBERATELY RETURNS ONLY WHAT THE GENERATOR DOES NOT DECIDE ITSELF.
 * A generator has real intent about GEOMETRY — a 1.1 m glass balcony guard, a
 * 0.9 m baluster rail around a stair void — and this must never overwrite it. So the
 * returned object carries the CATALOGUE's material and infill members and NOT
 * `height`, `thickness`, `fillType`, `railProfile`, `baseOffset` or anything
 * positional. Spread it FIRST and let the caller's explicit fields win:
 *
 *     new CreateHandrailCommand({ ...generatedGuardSpec('glass'), id, start, end, … })
 *
 * CONTRACTS: C100 §2.1 (a family REFERENCES a material, never carries a hex) ·
 * C84 EI-2 (a field the pipeline drops is a defect) / EI-8 (one vocabulary) ·
 * C95 §15.16 (the type set) · C16 (command authoring).
 */

import { handrailTypeStore, type HandrailTypeDefinition } from '@pryzm/core-app-model/stores';

/**
 * The catalogue type each generated guard INTENT maps to.
 *
 * ⚠ These two ids are the only hand-written names here, and they are deliberately
 * built-in ids rather than "whatever looks right": both are `isBuiltIn`, so they are
 * CODE — re-seeded on every store construction and preserved by `clearCustomTypes()`
 * — and therefore cannot be deleted by a user or lost to a project switch. A generator
 * pointing at a user type could find it gone mid-session.
 */
const GUARD_TYPE_FOR_INTENT = {
    /** Frameless/panel glass balustrade — balconies, terraces, roof decks. */
    glass: 'glass-guardrail',
    /** Square-bar metal balustrade at a 100 mm-sphere-compliant pitch — stair voids. */
    baluster: 'metal-balustrade-square',
} as const;

export type GeneratedGuardIntent = keyof typeof GUARD_TYPE_FOR_INTENT;

/**
 * The subset of a type that a generated guard inherits.
 *
 * Every member here is a field the generator has NO opinion about; none of them is a
 * field it sets itself. Keeping the two sets disjoint is what makes "spread first,
 * caller wins" safe rather than merely conventional.
 */
export interface GeneratedGuardSpec {
    readonly materialId?: string;
    readonly railDiameter?: number;
    readonly postSpacing?: number;
    readonly balusterShape?: 'rectangular' | 'round';
    readonly balusterWidth?: number;
    readonly balusterSpacing?: number;
    readonly infillMaxGap?: number;
}

/**
 * The catalogue fields an auto-generated guard of `intent` should carry.
 *
 * Returns `{}` — never a fabricated material — if the type is somehow absent. That is
 * the honest degradation: the guard is still created, and `HandrailFragmentBuilder`
 * still NAMES the missing material in the console exactly as it does today. Inventing
 * a materialId here to silence the warning would destroy the one diagnostic that made
 * this defect measurable (C100 §5).
 */
export function generatedGuardSpec(intent: GeneratedGuardIntent): GeneratedGuardSpec {
    const def: HandrailTypeDefinition | undefined = handrailTypeStore.getById(GUARD_TYPE_FOR_INTENT[intent]);
    if (!def) return {};
    return {
        materialId: def.materialId,
        railDiameter: def.railDiameter,
        postSpacing: def.postSpacing,
        balusterShape: def.balusterShape,
        balusterWidth: def.balusterWidth,
        balusterSpacing: def.balusterSpacing,
        infillMaxGap: def.infillMaxGap,
    };
}

/**
 * The type ids this resolver depends on, exported so a test can assert they exist in
 * the catalogue rather than discovering their absence as a grey handrail in the field.
 */
export const GENERATED_GUARD_TYPE_IDS: readonly string[] = Object.values(GUARD_TYPE_FOR_INTENT);
