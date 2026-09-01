// E1a (EUROPE-IMPLEMENTATION-PLAN §E1a · REPORT §I) — NETHERLANDS: IMOW value-
// list REFERENCES and the three-way norm-value split, IMPORTED, never invented.
//
// SOURCES (cited, not paraphrased) — recorded in
// audit/europe-site-intel/2026-08-31/lanes/netherlands-poland-lithuania-estonia.md §NL-A:
//   - Ozon "Omgevingsdocumenten Presenteren" OpenAPI v8.5.2, fetched keyless
//     2026-08-31: `NormSpec` { naam (e.g. "Bouwhoogte"), type (TypeNorm),
//     eenheid (unit from the national value list), groep (Normgroep),
//     normwaarden[] } and `NormwaardeSpec` { kwantitatieveWaarde: number,
//     kwalitatieveWaarde: string, waardeInRegeltekst, locatieRefs }.
//   - IMOW/STOP-TPOD standards: https://docs.geostandaarden.nl/ow/imow/
//     (IMOW 3.x/4.0-ic, checked 2026-08-31) — "the value lists (Eenheid,
//     TypeNorm, Normgroep) are exactly the enum vocabulary Pryzm's canonical
//     Rule model should import rather than invent (Class D: CONSUME)".
//
// ⚠ WHAT IS DELIBERATELY *NOT* HERE: the MEMBERS of the Eenheid / TypeNorm /
// Normgroep lists. Only the Eenheid list URI was captured verbatim in the probe;
// enumerating members (or guessing the TypeNorm/Normgroep URIs from the URI
// pattern) would be inventing state vocabulary — the exact failure this file
// exists to prevent. An E-wave follow-up fetches the lists live (I/O, so it can
// never live in L0 anyway) and generates cited members; until then the
// references below are the canonical pointers.
//
// L0-pure (P5): Zod only. Zero I/O, zero THREE, zero DOM.

import { z } from 'zod';
import type { RuleValueLocation } from '../provenance.js';

/** A reference to one national IMOW value list ("waardelijst"). */
export interface NlImowValueListRef {
    /** List name as the IMOW standard spells it. */
    readonly name: 'Eenheid' | 'TypeNorm' | 'Normgroep';
    /**
     * Canonical list URI — non-null ONLY where the probe captured it verbatim.
     * `null` means "documented at {@link docs}, URI not yet fetched" — an honest
     * gap, never a licence to guess the URI from the pattern.
     */
    readonly uri: string | null;
    /** Where the list is normatively documented (checked 2026-08-31). */
    readonly docs: string;
}

/** The three IMOW value lists the canonical Rule model consumes (Class D). */
export const NL_IMOW_VALUE_LISTS: readonly NlImowValueListRef[] = Object.freeze([
    Object.freeze({
        name: 'Eenheid',
        // Captured verbatim from the live openapi.json (NormSpec.eenheid), 2026-08-31.
        uri: 'https://standaarden.omgevingswet.overheid.nl/id/waardelijst/Eenheid',
        docs: 'https://docs.geostandaarden.nl/ow/imow/',
    } as const),
    Object.freeze({
        name: 'TypeNorm',
        uri: null,
        docs: 'https://docs.geostandaarden.nl/ow/imow/',
    } as const),
    Object.freeze({
        name: 'Normgroep',
        uri: null,
        docs: 'https://docs.geostandaarden.nl/ow/imow/',
    } as const),
]);

/**
 * The three-way value split of `NormwaardeSpec` (openapi v8.5.2, verbatim field
 * names). The lane calls it "a ready-made confidence taxonomy": a quantitative
 * attribute, a qualitative attribute, or "the value only lives in rule prose".
 */
export const NlNormwaardeKindSchema = z.enum([
    'kwantitatieveWaarde',
    'kwalitatieveWaarde',
    'waardeInRegeltekst',
]);
export type NlNormwaardeKind = z.infer<typeof NlNormwaardeKindSchema>;

/**
 * Pure mapping: which `RuleValueLocation` a Normwaarde kind implies. This IS the
 * REPORT §I sentence "`valueLocation` ∈ attribute | in-document-text — the NL
 * `waardeInRegeltekst` / EE `tingimus` split" as code.
 */
export function nlNormwaardeValueLocation(kind: NlNormwaardeKind): RuleValueLocation {
    return kind === 'waardeInRegeltekst' ? 'in-document-text' : 'attribute';
}
