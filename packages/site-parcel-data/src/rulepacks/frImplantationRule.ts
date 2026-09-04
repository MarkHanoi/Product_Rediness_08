// FRANCE — the MITOYENNETÉ RE-SPLIT. Founder blocker review 2026-09-04 §8.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE MIS-FRAMING THIS FILE CORRECTS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `FR-ENVELOPE-COMPLETION.md` §3 item 8 stood ONE hard 🔴 — "legal party-wall status … a
// property-law fact national GIS cannot settle" — for TWO different questions:
//
//   1. THE RULE PARAMETER. A French PLU's lateral-implantation article almost always reads
//      *"l'implantation en limite séparative est AUTORISÉE / IMPOSÉE / INTERDITE"* (sometimes with
//      a band: "sur une profondeur de 15 m à compter de l'alignement"). That is a rule value, in
//      the same règlement text as the setbacks, reachable through the same channel: **`extractable`**.
//      Under the RNU it is not even text-bound: R.111-17 opens with *"À moins que le bâtiment à
//      construire ne jouxte la limite parcellaire"* — building ON the limit is **autorisée**, as a
//      matter of national law (see `frRnuNationalPack.ts`).
//   2. THE PROPERTY FACT. Whether the wall already standing on the limit is legally *mitoyen*
//      (Code civil art. 653 s.) — held in titles and acts, not in any national GIS:
//      **`undeterminable`**. It matters only in the narrower case of building ON an existing
//      party wall, and it never decides whether the RULE permits a boundary implantation.
//
// One 🔴 for both made France look more blocked than it is. This module types (1) and states (2).
//
// PURE + deterministic (C58 §1.1/§1.9). No I/O.

/** The three values the lateral-implantation RULE takes in French règlements. */
export const FR_LATERAL_IMPLANTATION_RULES = ['autorisee', 'imposee', 'interdite'] as const;
export type FrLateralImplantationRule = (typeof FR_LATERAL_IMPLANTATION_RULES)[number];

export interface FrLateralImplantationExtraction {
    readonly rule: FrLateralImplantationRule;
    /** The exact phrase matched — reviewable, never paraphrased. */
    readonly verbatim: string;
}

// "en limite(s) séparative(s)" / "sur la limite" / "jouxter la limite" + a modality within reach.
const LIMIT_PHRASE = /(en|sur|à|a)\s+(la\s+|les\s+|une\s+)?limites?\s+(s[ée]paratives?|parcellaires?|de\s+propri[ée]t[ée])|jouxt\w*\s+la\s+limite/i;
const MODALITY: readonly { readonly rule: FrLateralImplantationRule; readonly re: RegExp }[] = [
    { rule: 'interdite', re: /interdit\w*|(n['’]est\s+pas|ne\s+sont\s+pas)\s+(autoris|admis)\w*|proscri\w*/i },
    { rule: 'imposee', re: /impos\w*|obligatoire\w*|doivent\s+(s['’])?[eê]tre\s+(implant|édifi|edifi)\w*\s+(en|sur)\s+limite|doit\s+(s['’])?[eê]tre\s+(implant|édifi|edifi)\w*\s+(en|sur)\s+limite/i },
    { rule: 'autorisee', re: /autoris\w*|admis\w*|peuvent\s+(s['’])?[eê]tre\s+(implant|édifi|edifi)\w*|peut\s+(s['’])?[eê]tre\s+(implant|édifi|edifi)\w*|à\s+moins\s+que|a\s+moins\s+que|soit\s+en\s+limite/i },
];

/**
 * Extract the lateral-implantation rule from règlement/libelle text. **Pure, total.** Returns
 * `null` when no boundary phrase is present or no modality accompanies it — never a default.
 *
 * ⚠ PRECEDENCE: `interdite` is tested first, then `imposee`, then `autorisee`, because a sentence
 * such as "l'implantation en limite est autorisée sauf … où elle est interdite" is a CONDITIONAL
 * the PDF leg must type; reporting the prohibition first is the conservative reading (L-616: an
 * unknown constraint must never be drawn as permissive).
 */
export function extractFrLateralImplantationRule(
    ...texts: readonly (string | null | undefined)[]
): FrLateralImplantationExtraction | null {
    for (const t of texts) {
        if (typeof t !== 'string' || t.trim() === '') continue;
        const lim = LIMIT_PHRASE.exec(t);
        if (lim === null) continue;
        // Look in a window around the limit phrase — the modality sits in the same clause.
        const start = Math.max(0, lim.index - 120);
        const end = Math.min(t.length, lim.index + lim[0].length + 120);
        const window = t.slice(start, end);
        for (const m of MODALITY) {
            const hit = m.re.exec(window);
            if (hit !== null) return { rule: m.rule, verbatim: window.trim() };
        }
    }
    return null;
}

/**
 * The split, stated once for documents and refusal text. `ruleParameter` is what the PDF channel
 * (or the RNU pack) recovers; `legalPartyWallStatus` is the residual 🔴, and its scope is named.
 */
export const FR_MITOYENNETE_SPLIT = Object.freeze({
    ruleParameter: {
        question: 'Does the instrument permit / impose / forbid implantation on the separative limit?',
        reachability: 'extractable' as const,
        channel:
            'the lateral-implantation article of the règlement (CNIG 15.02 family), the same PDF ' +
            'channel as setbacks; under the RNU, R.111-17 answers it nationally (autorisée)',
    },
    legalPartyWallStatus: {
        question: 'Is the existing wall on the limit legally mitoyen (Code civil art. 653 s.)?',
        reachability: 'undeterminable' as const,
        scope:
            'bears only on building ON an existing party wall; never on whether the RULE permits a ' +
            'boundary implantation. Held in titles and acts, not in national GIS.',
    },
});
