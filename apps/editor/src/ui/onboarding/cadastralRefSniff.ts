// §WHERE-IS-YOUR-PROJECT (L-13057, founder 2026-09-07: "USER SHALL BE ABLE TO ADD EITHER THE
// LOCATION — CITY, ADDRESS, OR A CADASTRAL REFERENCE") — the DISCRIMINATION half of that feature.
//
// WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
// ---------------------------------------------
// PRYZM already resolves cadastral references: `server/jurisdiction/parcelZoningProxy.js`'s
// `resolveParcelGeometry()` has driven Catastro's INSPIRE `GetParcel&REFCAT=` call since L-380,
// and `apps/editor/src/ui/site/parcel/CatastroParcelProvider.ts` is its client. What did not
// exist was an ENTRY POINT (one search field that will accept a reference) and the DECISION that
// entry point needs: **is this string a place, or a registry reference?**
//
// This module is ONLY that decision. It performs no I/O, imports nothing, and resolves nothing —
// so it is directly unit-testable, and so that the one resolver stays the one resolver.
//
// THE FOUR RULES IT ENCODES (all of them load-bearing, all from L-13057)
// ---------------------------------------------------------------------
//  1. **ONE FIELD, NO MODE PICKER.** The user never declares "this is a reference". The shape of
//     what they typed decides, and the caller announces which way it was read.
//  2. **UNKNOWN SHAPE ⇒ FALL THROUGH, NEVER ERROR.** A cadastral reference is jurisdiction-
//     shaped. A Spanish `refcat` is 14 or 20 characters in a fixed digit/letter arrangement;
//     other registries are shaped differently and are NOT implemented here. Anything this module
//     does not positively recognise returns `null`, and `null` means "hand it to the geocoder" —
//     not "reject the input". A user typing a Dutch or German reference gets a place search that
//     misses, which is a worse answer than resolving it but a far better one than an error
//     asserting their reference is invalid.
//  3. **A MATCH IS A READING, NOT A CERTAINTY.** `sniffCadastralRef` returns which registry it
//     matched and under what pattern, so the caller can say *"read as a Spanish cadastral
//     reference"* and offer *"search as a place instead"*. C57 §1.5: never guess silently.
//  4. **NAME THE REGISTRY ON FAILURE.** A reference that matches a pattern but does not resolve
//     must be reported as *"Catastro (Spain) has no parcel with that reference"* — never a bare
//     "not found", which would collapse a failure and an absence into one message
//     (§CONTEXT-DATA-HONESTY: they are different answers).
//
// ⚠ WHY THE PATTERNS ARE STRICT, AND WHAT THAT COSTS
// --------------------------------------------------
// The positional patterns below (7 digits, 2 letters, 4 digits, 1 letter …) are taken from real
// references this repo already holds — `1722706DF3812B` (the founder's own session log),
// `1035716DF3813E`, `1218101DF3811G`, `1950501UG4915S`, `0229720DF3802G` — not from a
// recollection of the specification. A loose `[0-9A-Z]{14}` would also match a whitespace-
// stripped address, and reading "10 Downing Street" as a parcel reference is the failure mode
// worth being strict about. THE COST, STATED: a validly-formed reference in a shape not listed
// here is treated as a place name and will miss in the geocoder. That is rule 2 working as
// designed, and the fix is to add the pattern here, in one place.

/** Registries this module can RECOGNISE. Recognition ≠ resolution — see `CADASTRAL_REGISTRIES`. */
export type CadastralRegistryId = 'es-catastro';

/** How the reference is written, for the caller's copy (and for tests to pin the branch). */
export type CadastralRefKind = 'urban' | 'rustic';

export interface CadastralRegistry {
    readonly id: CadastralRegistryId;
    /** Short name for inline copy — "Catastro". */
    readonly shortName: string;
    /** The name to use when reporting a FAILURE, so the user learns which registry was asked. */
    readonly fullName: string;
    /** ISO-3166-1 alpha-2 of the registry's jurisdiction. */
    readonly countryCode: string;
}

/**
 * The registries with a wired resolver. ⚠ ONE entry today, deliberately — Spain. Adding a row
 * here without also wiring its resolver would make this module claim a capability the product
 * does not have, which is the defect class §CONTEXT-DATA-HONESTY exists to prevent.
 */
export const CADASTRAL_REGISTRIES: Readonly<Record<CadastralRegistryId, CadastralRegistry>> = {
    'es-catastro': {
        id: 'es-catastro',
        shortName: 'Catastro',
        fullName: 'Catastro (Spain)',
        countryCode: 'ES',
    },
};

export interface CadastralRefReading {
    /** Which registry's shape matched. */
    readonly registry: CadastralRegistry;
    /** Urban vs rustic reference shape — reported, not acted on. */
    readonly kind: CadastralRefKind;
    /** Separator-stripped, upper-cased form of what the user typed. */
    readonly normalised: string;
    /**
     * The PARCEL reference — the first 14 characters. A 20-character Spanish reference names a
     * property UNIT (a flat, a garage) inside a parcel: 14 parcel characters + 4 identifying the
     * unit + 2 control characters. The parcel is what a site is placed on, so a 20-character
     * entry is narrowed to its parcel here and the caller is told (`narrowedFromUnitRef`).
     */
    readonly parcelRef: string;
    /** True when the user typed a 20-character unit reference and we kept its parcel half. */
    readonly narrowedFromUnitRef: boolean;
    /** Exactly what the user typed, untouched — for echoing back in copy. */
    readonly raw: string;
}

/** Separators a person may type inside a reference (Catastro's own UI prints them in groups). */
const SEPARATORS = /[\s.\-/_]+/g;

/**
 * Spain, URBAN: `1722706` `DF` `3812` `B` — 7 digits, 2 letters, 4 digits, 1 letter.
 * The 20-character form appends 4 digits (the unit) + 2 control letters.
 */
const ES_URBAN_14 = /^\d{7}[A-Z]{2}\d{4}[A-Z]$/;
const ES_URBAN_20 = /^\d{7}[A-Z]{2}\d{4}[A-Z]\d{4}[A-Z]{2}$/;

/**
 * Spain, RUSTIC: `13077` `A` `01800039` — 5 digits (province + municipality), a letter, 8 digits
 * (polígono + parcela). The 20-character form appends the same 4 + 2 tail as the urban one.
 */
const ES_RUSTIC_14 = /^\d{5}[A-Z]\d{8}$/;
const ES_RUSTIC_20 = /^\d{5}[A-Z]\d{12}[A-Z]{2}$/;

/**
 * Strip the separators a person may type inside a reference and upper-case it.
 *
 * Exported because the caller shows the normalised form back to the user ("read
 * `1722706DF3812B` as …"), and showing a different string from the one that was matched would
 * make the announcement untrue.
 */
export function normaliseCadastralCandidate(input: string): string {
    return (input ?? '').trim().replace(SEPARATORS, '').toUpperCase();
}

/**
 * Decide whether a typed string is a cadastral reference this product can resolve.
 *
 * @returns the reading (registry + parcel reference), or `null` meaning **"treat it as a
 *          place and hand it to the geocoder"**. `null` is never an error and must never be
 *          surfaced as one.
 */
export function sniffCadastralRef(input: string): CadastralRefReading | null {
    const raw = (input ?? '').trim();
    if (raw.length === 0) return null;
    // A comma is an ADDRESS separator ("Carrer de Picasso 22, Barcelona"). No registry writes
    // one inside a reference, so its presence settles the reading before any pattern runs.
    if (raw.includes(',')) return null;

    const normalised = normaliseCadastralCandidate(raw);
    if (normalised.length !== 14 && normalised.length !== 20) return null;

    const registry = CADASTRAL_REGISTRIES['es-catastro'];
    let kind: CadastralRefKind | null = null;
    if (ES_URBAN_14.test(normalised) || ES_URBAN_20.test(normalised)) kind = 'urban';
    else if (ES_RUSTIC_14.test(normalised) || ES_RUSTIC_20.test(normalised)) kind = 'rustic';
    if (kind === null) return null;

    return {
        registry,
        kind,
        normalised,
        parcelRef: normalised.slice(0, 14),
        narrowedFromUnitRef: normalised.length === 20,
        raw,
    };
}

/**
 * The one-line status a caller shows the MOMENT it decides to read the input as a reference —
 * rule 3. It always names the registry and always implies the alternative, so the user is never
 * left to infer which of the two readings they got.
 */
export function describeCadastralReading(reading: CadastralRefReading): string {
    const unit = reading.narrowedFromUnitRef
        ? ` (${reading.normalised} names a unit — using its parcel)`
        : '';
    return `Reading ${reading.parcelRef} as a ${reading.registry.fullName} cadastral reference${unit}…`;
}

/**
 * The failure line for a reference that MATCHED a registry pattern but did not resolve.
 *
 * ⚠ It names the registry that was asked. "Not found" alone is the message this exists to
 * prevent: it cannot be told apart from "we never asked", and those are different answers.
 */
export function describeCadastralMiss(reading: CadastralRefReading): string {
    return (
        `${reading.registry.fullName} has no parcel with reference ${reading.parcelRef}. ` +
        'Check the reference, or search for the place by name instead.'
    );
}
