// E1a (EUROPE-IMPLEMENTATION-PLAN §E1a · REPORT §I) — LITHUANIA: the ASGR field
// vocabulary, IMPORTED from the state specification, never invented.
//
// SOURCE (cited, not paraphrased): VTPSI LEIP specification, 2024-06-18, fetched
// 2026-08-31 — https://www.geoportal.lt/download/Specifikacijos/VTPSI_LEIP_specifikacija_20240628.pdf
// — recorded in audit/europe-site-intel/2026-08-31/lanes/
// netherlands-poland-lithuania-estonia.md §LT-1, alongside the live probe of
// `https://tpdr.planuojustatau.lt/arcgis/rest/services/duomenu_viesinimas/ASGR/MapServer`.
//
// ASGR ("aktuali suvestine informacija apie galiojancius reglamentus") is the
// national consolidated valid-regulations layer: FAR + height + coverage + green
// share, per polygon, WITH per-value provenance columns — "the provenance+
// confidence structure Pryzm's §11 evidence graph wants already exists as a
// national attribute schema here" (lane 4, verbatim).
//
// ⚠ MAX_INTENS UNIT CAUTION (lane 4, verbatim substance): live values like
// 15/160 against the spec's "1 decimal" suggest a percent-like encoding
// (1.6 FAR = 160?) — resolve against the ASGR methodology BEFORE computing GFA;
// do not guess (probe-can-be-wrong-three-ways). That is why NO unit strings are
// declared for the value fields below: an invented unit here would silently
// mis-compute every Lithuanian GFA downstream.
//
// L0-pure (P5): Zod only. Zero I/O, zero THREE, zero DOM.

import { z } from 'zod';

/** The four numeric regulation value fields ASGR serves per polygon. */
export const LtAsgrValueFieldSchema = z.enum([
    'MAX_AUK_M', // max building height, metres (spec: "maksimalus pastatu aukstis, m")
    'MAX_INTENS', // max plot development intensity — UNIT UNRESOLVED, see header caution
    'MAX_TANKIS', // max coverage, % (density)
    'MIN_APZELD', // min green share, %
]);
export type LtAsgrValueField = z.infer<typeof LtAsgrValueFieldSchema>;

/**
 * The per-value provenance column SUFFIXES the spec attaches to EACH of the four
 * value families (e.g. `MAX_AUK_M_TP`, `MAX_AUK_M_NR`, `MAX_AUK_M_D`,
 * `MAX_AUK_M_TPR`):
 *   - `_TP`  — source-document system id
 *   - `_NR`  — document number
 *   - `_D`   — approval date
 *   - `_TPR` — planning kind
 */
export const LT_ASGR_PROVENANCE_SUFFIXES = Object.freeze(['_TP', '_NR', '_D', '_TPR'] as const);
export type LtAsgrProvenanceSuffix = (typeof LT_ASGR_PROVENANCE_SUFFIXES)[number];

/** Pure helper: the provenance column names for one value field. */
export function ltAsgrProvenanceColumns(field: LtAsgrValueField): readonly string[] {
    return LT_ASGR_PROVENANCE_SUFFIXES.map((s) => `${field}${s}`);
}

/** Classification fields (from the same spec §LT-1). */
export const LT_ASGR_CLASSIFICATION_FIELDS = Object.freeze([
    'PAGR_PASK', // primary use (classifier) — probed live value: "KT"
    'NAUD_BUD', // use mode
    'NAUD_TIP', // use type
    'FUNKC_ZON', // functional zone — probed live value: "U_GC_P_F"
] as const);

/**
 * `PILN` completeness flag: P = full, N = possibly incomplete. First-class
 * honesty data — an N row's values are still values, but the record itself
 * warns it may not consolidate every governing document.
 */
export const LtAsgrPilnFlagSchema = z.enum(['P', 'N']);
export type LtAsgrPilnFlag = z.infer<typeof LtAsgrPilnFlagSchema>;

/** `ATN_DOK` — updated-from-non-spatial-documents flag (spec field name). */
export const LT_ASGR_ATN_DOK_FIELD = 'ATN_DOK' as const;
