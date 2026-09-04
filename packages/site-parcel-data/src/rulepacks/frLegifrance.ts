// FRANCE — the Légifrance citation target, as a LEAF module.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS IS ITS OWN FILE — it breaks an import CYCLE, and the cycle was load-bearing
// ══════════════════════════════════════════════════════════════════════════════════════════════
// This constant used to live in `countryAdapters/fr/frNoExtraction.ts` (a 65 KB adapter), and
// `rulepacks/frRnuNationalPack.ts` imported it from there — a PURE rule pack reaching up into an
// adapter for one string. That edge was harmless until `frNoExtraction` acquired the call that
// finally makes the packs reachable (`frResolution.ts`), at which point it closed a ring:
//
//     frNoExtraction → frResolution → frRnuNationalPack → frNoExtraction
//
// ⛔ A cycle through a module whose top level RUNS (§SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD) resolves
// to `undefined` at load in whichever direction the bundler enters first, and the symptom is not a
// type error — it is a citation that silently becomes `undefined` in production. Hoisting the
// constant to a leaf with ZERO imports removes the edge instead of ordering it, so no bundler
// entry order can reproduce the failure.
//
// `frNoExtraction.ts` re-exports the name it always exported, so no consumer moved.
//
// PURE: no imports, no I/O, no clock. It is one probed URL.

/**
 * Code de l'urbanisme on Légifrance — the document every RNU / national-article citation points at.
 *
 * ⚠ THE SPELLING IS PROBED, NOT GUESSED (2026-09-02): the `/codes/id/` form **302s** from here, so
 * the `texte_lc` form is the one that resolves. Do not "tidy" it to the shorter URL.
 */
export const FR_LEGIFRANCE_CODE_URBANISME_URL =
    'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006074075/';
