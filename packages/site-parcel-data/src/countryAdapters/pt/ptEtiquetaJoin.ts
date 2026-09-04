// ═════════════════════════════════════════════════════════════════════════════════════════════
// §PT-ETIQUETA-JOIN (lane ENVELOPE-IBERIA round 3, 2026-09-04) — doctrine §6 + §12 step 5:
// "`ETIQUETA` IS THE JOIN KEY from polygon to regulamento article. Use it BEFORE any text
// similarity matching."
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE DEFECT THIS CLOSES. Until this round the ONLY polygon → article join in the PT adapter was
// TEXT: `ptPortoPdmDraft.ts` `ptPortoFucTipo` does `legend.includes('frente urbana continua tipo ii')`
// on CRUS's `classificacao_e_qualificacao`. That is the doctrine's SECOND choice and it has a
// measured failure mode: CRUS legends are DGT's harmonisation of 308 municipal legends, and two
// municipalities spell the same subcategory differently while one municipality spells two DIFFERENT
// subcategories almost identically (Porto's «tipo I» is a substring of «tipo II» — the Porto reader
// had to test the longer first). The Norma Técnica PDM (Aviso 9282/2021) mandates a per-polygon
// `ETIQUETA` (e.g. `EH1`) that is the municipality's OWN key into its OWN regulamento — an exact
// join, not a similarity.
//
// ⚠ WHERE ETIQUETA COMES FROM, HONESTLY: the MUNICIPAL planta de ordenamento vector (Norma Técnica
// `DESIGNACAO + ESPECIFICA + ETIQUETA`). CRUS does NOT carry it (`parsePtCrusZone` reads no such
// property — measured, `ptCrusZone.ts`). So today ETIQUETA is an INJECTED input: whoever holds the
// municipal vector supplies it. When it is absent the join FALLS BACK to text, and the fallback is
// FLAGGED `assumed` with the doctrine's own words as the basis — never silently promoted to a join.
//
// ⚠ WATCH FLAG (doctrine §13): "DGT reworking the PDM and REN data models — the `ETIQUETA` join key
// MAY MOVE." Carried on every etiqueta-joined outcome.
//
// PURITY: L2-pure. Data + pure functions. No I/O.

import type { PermittedUse } from '@pryzm/schemas';
import type { PtInstrumentRef } from './ptProvenance.js';

/** Doctrine §13 watch flag for this join. */
export const PT_ETIQUETA_WATCH =
    'DGT is reworking the PDM data model — the ETIQUETA join key MAY MOVE. Re-verify the municipal vector\'s key field per release.';

/**
 * ONE regulamento entry — the article-level transcription of what a subcategory permits. Every
 * numeric member is `null` when the article does not state it (⛔ never 0 — L-616). Article strings
 * are per VALUE because a regulamento sets Iu in one article and cércea in another.
 *
 * ⚠ `pisos` and `profundidade_m` carry NO DR 5/2019 lexicon key in `ptConceptLexicon.ts` (the
 * lexicon encodes the indices + the height quantities + Re/Af/Ai/Ac/As; "número de pisos" and
 * "profundidade" are not in it). They are therefore transcribed as explicit fields and NOT
 * token-type-checked — a named gap, stated in the scorecard, not papered over by inventing an
 * abbreviation the dictionary does not fix.
 */
export interface PtRegulamentoEntry {
    /** The ETIQUETA this entry is keyed by (`EH1`, `FUC-II`, …) — the municipality's own label. */
    readonly etiqueta: string;
    /** The subcategory's designation as the regulamento names it (used for the text FALLBACK only). */
    readonly designacao: string;
    /** Additional legend phrases that name this subcategory in the CRUS harmonisation, if known. */
    readonly legendAliases?: readonly string[];
    /** The regulamento — instrument + version + in-force date; `article` is the CHAPTER seat, per-value articles below. */
    readonly instrument: PtInstrumentRef;
    /** Text the C1 inference reads (doctrine step 8) — the designação plus any alinhamento language. */
    readonly c1Text: string;
    readonly Iu: PtRegulamentoNumber | null;
    /** Io in PERCENT (DR 5/2019) — `typeCheckPtToken` rejects a ratio offered here. */
    readonly Io_pct: PtRegulamentoNumber | null;
    /** H — altura da edificação, metres above S. ⛔ `cércea` in a PT regulamento IS H, never Hf (doctrine §9). */
    readonly H_m: PtRegulamentoNumber | null;
    readonly Hf_m: PtRegulamentoNumber | null;
    /** Alt — altitude máxima, ABSOLUTE metres in the national datum (doctrine §2.4). */
    readonly Alt_m: PtRegulamentoNumber | null;
    /** Número máximo de pisos (no lexicon key — see the interface note). */
    readonly pisos: PtRegulamentoNumber | null;
    readonly Re_m: PtRegulamentoNumber | null;
    readonly AfLateral_m: PtRegulamentoNumber | null;
    readonly AfTardoz_m: PtRegulamentoNumber | null;
    /** Profundidade máxima da edificação from the alinhamento (alignment family only; no lexicon key). */
    readonly profundidade_m: PtRegulamentoNumber | null;
    readonly permittedUse: readonly PermittedUse[];
    /** Doctrine §7 code 20 — is this entry the PDM's SUPLETIVO parameters for a UOPG pending its plan? */
    readonly supletivo?: boolean;
}

/** One transcribed number WITH its article — "a number without an article is not a product" (§0). */
export interface PtRegulamentoNumber {
    readonly value: number;
    readonly article: string;
}

/** The municipality's regulamento as an index — keyed by ETIQUETA, exactly as the planta keys it. */
export interface PtRegulamentoIndex {
    readonly municipio: string;
    readonly entries: readonly PtRegulamentoEntry[];
}

function normalisePt(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

export type PtEtiquetaJoin =
    | {
          /** Step 5 as the doctrine wants it: an EXACT key join. `confidence: resolved`. */
          readonly kind: 'etiqueta-join';
          readonly entry: PtRegulamentoEntry;
          readonly confidence: 'resolved';
          readonly basis: string;
          readonly watch: string;
      }
    | {
          /** No ETIQUETA in hand: the text fallback. `confidence: assumed`, basis stated. */
          readonly kind: 'text-fallback';
          readonly entry: PtRegulamentoEntry;
          readonly confidence: 'assumed';
          readonly basis: string;
          readonly assumptions: readonly string[];
      }
    | {
          readonly kind: 'unresolved';
          readonly refusalReason: string;
          /** The entries a text match found when MORE THAN ONE matched — reported, never picked. */
          readonly candidates: readonly string[];
      };

/**
 * PURE: join a polygon to its regulamento entry. ETIQUETA FIRST (exact, accent/case-insensitive on
 * the key — an ETIQUETA is a code, not prose); only when no ETIQUETA is in hand does the legend
 * text get consulted, and then ONLY as a whole-designation match against `designacao` and
 * `legendAliases` (never a substring similarity — the Porto «tipo I»/«tipo II» trap). Two text
 * hits ⇒ refused. Zero ⇒ refused. TOTAL.
 */
export function joinPtEtiqueta(
    index: PtRegulamentoIndex,
    etiqueta: string | null | undefined,
    legendText: string | null | undefined,
): PtEtiquetaJoin {
    const key = (etiqueta ?? '').trim();
    if (key.length > 0) {
        const nk = normalisePt(key);
        const hits = index.entries.filter((e) => normalisePt(e.etiqueta) === nk);
        if (hits.length === 1) {
            return {
                kind: 'etiqueta-join',
                entry: hits[0]!,
                confidence: 'resolved',
                basis: `ETIQUETA «${key}» joined exactly to the ${index.municipio} regulamento entry «${hits[0]!.designacao}» (doctrine §6: the join key, used before any text matching)`,
                watch: PT_ETIQUETA_WATCH,
            };
        }
        if (hits.length > 1) {
            return {
                kind: 'unresolved',
                refusalReason: `ETIQUETA «${key}» matches ${hits.length} regulamento entries in ${index.municipio} (${hits.map((h) => h.designacao).join(' · ')}) — a duplicated key is a TRANSCRIPTION DEFECT in the index; reported, never resolved by picking (doctrine §8 spirit).`,
                candidates: hits.map((h) => h.etiqueta),
            };
        }
        // An ETIQUETA was supplied and matched NOTHING: the polygon names a subcategory the
        // transcription does not hold. That is a coverage gap, and text must NOT rescue it — a
        // key that fails to join is a stronger signal than prose that happens to resemble a row.
        return {
            kind: 'unresolved',
            refusalReason: `ETIQUETA «${key}» is not in the ${index.municipio} regulamento index (${index.entries.length} entries). The polygon names a subcategory PRYZM has not transcribed. Text fallback is NOT attempted when a key is present and fails: a non-joining key is a coverage fact, not an invitation to guess.`,
            candidates: [],
        };
    }

    const text = (legendText ?? '').trim();
    if (text.length === 0) {
        return {
            kind: 'unresolved',
            refusalReason: 'neither an ETIQUETA nor a legend text is in hand — the polygon cannot be joined to any regulamento article (doctrine step 5).',
            candidates: [],
        };
    }
    const nt = normalisePt(text);
    // Whole-designation equality only. A CRUS legend is often «Classe - Categoria - Subcategoria»;
    // accept a match on the FULL legend or on its LAST hyphen-separated segment (the subcategory),
    // never on a substring.
    const segments = text.split(/\s[–-]\s/).map((s) => normalisePt(s));
    const last = segments[segments.length - 1] ?? nt;
    const hits = index.entries.filter((e) => {
        const names = [e.designacao, ...(e.legendAliases ?? [])].map(normalisePt);
        return names.some((n) => n === nt || n === last);
    });
    if (hits.length === 1) {
        const e = hits[0]!;
        return {
            kind: 'text-fallback',
            entry: e,
            confidence: 'assumed',
            basis: `no ETIQUETA in hand; legend «${text}» equals the designação/alias of entry «${e.etiqueta}» by whole-designation match`,
            assumptions: [
                'The polygon → article join was made by LEGEND TEXT, not by ETIQUETA (doctrine §6 names ETIQUETA as the join key and text matching as the fallback). CRUS carries no ETIQUETA; the municipal planta de ordenamento does. Confirm the ETIQUETA before relying on this entry.',
            ],
        };
    }
    if (hits.length > 1) {
        return {
            kind: 'unresolved',
            refusalReason: `legend «${text}» text-matches ${hits.length} regulamento entries (${hits.map((h) => h.etiqueta).join(', ')}) — refused rather than picked; supply the ETIQUETA.`,
            candidates: hits.map((h) => h.etiqueta),
        };
    }
    return {
        kind: 'unresolved',
        refusalReason: `legend «${text}» matches no entry of the ${index.municipio} regulamento index by whole designation (${index.entries.length} entries) and no ETIQUETA is in hand. Substring similarity is deliberately NOT attempted.`,
        candidates: [],
    };
}
