// §AMB-PGM-SCOPE — WHICH PGM-1976 ARTICLES ARE METROPOLITAN, AND WHO OVERRIDES THEM.
//
// WHY THIS FILE EXISTS
// --------------------
// Four AMB municipalities (L'Hospitalet 08101, Badalona 08015, Sant Boi 08200, Cornellà 08073)
// ship a CITED REFUSAL whose stated reason is: *"Barcelona's alçada reguladora and official-
// street-width tables are Barcelona's own, not this municipality's."* That reason was written
// before anyone held the articles verbatim. Reading the primary consolidated text POSITIONALLY
// (PyMuPDF `get_text("dict")`, two-column aware) shows the reason is **partly wrong** and the
// document answers the question itself.
//
// THE MECHANISM THE DOCUMENT USES
// -------------------------------
// 1. **The base articles are metropolitan by construction.** NNUU **Art. 1.1** (PDF p.24):
//        "L'objecte d'aquest Pla General és l'ordenació urbanística del territori que integra
//         l'Entitat Municipal Metropolitana de Barcelona, definit a l'article 2.1 del Decret
//         llei 5/1974, de 24 d'agost."
//    ⚠ That is the **EMMB / Corporació Metropolitana** — the pre-2011 27-municipality body — NOT
//    today's 36-municipality AMB (Llei 31/2010). "AMB municipality" does NOT imply "PGM
//    municipality"; see `AMB_PGM_SCOPE_CAVEATS`.
// 2. **Each base article carries a numbered footnote naming every municipality that rewrote it**,
//    in the form `NN. Veure modificació per al Municipi de <X> a la pàg. <P>`, and the annex
//    (PDF pp.124-385) reproduces each modification under that municipality's own heading with its
//    own approval date + DOGC reference. So SCOPE IS DECLARED IN THE SOURCE, per article.
//
// ⇒ Absence of a municipality from an article's footnote is the strongest signal this document
//   offers that the article stands unmodified there — but it is NOT proof. See the caveats.
//
// WHAT THIS MODULE IS AND IS NOT
// ------------------------------
// It is a **transcribed index of declared legislative scope**, not a rule pack. It carries no
// dimension, no height, no setback. It answers exactly one question — *"does PGM article N stand
// in its metropolitan form on this municipality's land, or did that municipality rewrite it?"* —
// and it answers `'unknown'` whenever the document does not say.
//
// It deliberately does NOT flip any `*_ENVELOPE_VERIFIED` gate. Transcription is a legal act only
// the founder signs (L-449); this file is the evidence such a signature would rest on.
//
// PURITY: L2-pure. Frozen data + pure lookups. No I/O, no THREE, no DOM, no clock.
//
// Source of record: `docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/PGM-NNUU-metropolitana.pdf`
// (MMAMB, *Normativa Urbanística Metropolitana*, December 2010, consolidated to 31-12-2009).
// Full derivation + verbatim quotes: `docs/04-reference/jurisdictions/es/es-ct/AMB-PGM-SCOPE-MAP.md`.
//
// Strategic context — C58 §1.2/§1.4/§1.7a, C60 §3, C63, ADR-0270 (rule KIND), ADR-0271 (Art. 242.2),
// EXTRACTION-PROTOCOL.md (STATED / CONSTRUCTED / NOT-THE-RULE-KIND / UNKNOWN), §CONTEXT-DATA-HONESTY.

import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning.es.amb');

/**
 * A municipality that rewrote a base PGM article, exactly as the base text's own footnote names it.
 *
 * `printedPage` is the page number PRINTED on the sheet (what the footnote cites). `pdfPage` is the
 * 1-based page index in the repo's PDF. They differ by exactly 1 throughout this document; both are
 * carried so a reader can find the passage either way without re-deriving the offset.
 */
export interface AmbPgmModification {
    /** The municipality name AS SPELLED IN THE SOURCE FOOTNOTE (typos and all — do not "fix" it). */
    readonly municipalityInSource: string;
    /**
     * The PRYZM jurisdiction id this municipality maps to, or `null` when PRYZM does not register
     * it. `null` is a coverage statement about PRYZM, never about the law.
     */
    readonly jurisdictionId: string | null;
    /** Page number printed on the sheet, as the footnote cites it. */
    readonly printedPage: number;
    /** 1-based page index into `PGM-NNUU-metropolitana.pdf` (= `printedPage + 1`). */
    readonly pdfPage: number;
}

/** What the source declares about ONE base article. */
export interface AmbPgmArticleScope {
    /** The PGM NNUU article number. */
    readonly article: number;
    /** Footnote marker printed after the article heading, or `null` when the heading carries none. */
    readonly footnote: number | null;
    /**
     * Every municipality the footnote names. EMPTY means the heading carried no footnote marker at
     * all — i.e. this compendium records no municipal rewrite of this article.
     *
     * ⚠ EMPTY IS NOT "PROVEN UNMODIFIED". See `AMB_PGM_SCOPE_CAVEATS`.
     */
    readonly modifiedBy: readonly AmbPgmModification[];
    /** One line on what the article governs, so a reader need not open the PDF to orient. */
    readonly subject: string;
}

/** PRYZM jurisdiction ids for the AMB municipalities this map can name. */
const J_BARCELONA = 'es-08019-barcelona';
const J_BADALONA = 'es-08015-badalona';
const J_HOSPITALET = 'es-08101-hospitalet';
const J_SANT_BOI = 'es-08200-sant-boi';
const J_CORNELLA = 'es-08073-cornella-de-llobregat';

function mod(
    municipalityInSource: string,
    jurisdictionId: string | null,
    printedPage: number,
): AmbPgmModification {
    return Object.freeze({
        municipalityInSource,
        jurisdictionId,
        printedPage,
        pdfPage: printedPage + 1,
    });
}

/**
 * §AMB-PGM-SCOPE-MAP — the transcribed footnote apparatus for the articles PRYZM's Barcelona packs
 * actually rely on, plus their immediate neighbours.
 *
 * Every row was read positionally from the two-column layout and cross-checked against the annex
 * page the footnote points at. A naive `extract_text()` pass CANNOT reproduce this table: several
 * annex pages embed subset fonts with no ToUnicode map, and their glyph codes are shifted (±29),
 * so a text pass silently drops every DIGIT and reports the modification as absent.
 */
export const AMB_PGM_ARTICLE_SCOPE: ReadonlyMap<number, AmbPgmArticleScope> = new Map(
    (
        [
            {
                article: 238,
                footnote: 13,
                subject: 'Alçada reguladora — amplada de vial i condicions generals',
                modifiedBy: [mod('Badalona', J_BADALONA, 125)],
            },
            {
                article: 242,
                footnote: 15,
                subject: 'Profunditat edificable (the ADR-0271 block-derived construction)',
                modifiedBy: [mod('Badalona', J_BADALONA, 135)],
            },
            {
                article: 306,
                footnote: 37,
                subject: 'Zona subjecta a ordenació volumètrica específica (18)',
                modifiedBy: [
                    mod('Cerdanyola del Vallès', null, 287),
                    mod('Sant Cugat del Vallès', null, 348),
                ],
            },
            {
                article: 314,
                footnote: null,
                subject: 'Qualificacions zonals — declares the zones exist; states no dimension',
                modifiedBy: [],
            },
            {
                article: 316,
                footnote: null,
                subject: 'Edificabilitat — zona de nucli antic (12)',
                modifiedBy: [],
            },
            {
                article: 320,
                footnote: 46,
                subject: 'Condicions d’edificació — nucli antic (12)',
                modifiedBy: [mod('Badalona', J_BADALONA, 136), mod('Barcelona', J_BARCELONA, 274)],
            },
            {
                article: 322,
                footnote: null,
                subject:
                    'Edificabilitat — densificació urbana (13). NOT-THE-RULE-KIND: §1 defines ' +
                    'edificabilitat by the maximum volume envelope, so there is no per-parcel FAR.',
                modifiedBy: [],
            },
            {
                article: 323,
                footnote: 47,
                subject: 'Nombre màxim d’habitatges per parcel·la — densificació urbana (13)',
                modifiedBy: [
                    mod('Barcelona', J_BARCELONA, 184),
                    mod('Badalona', J_BADALONA, 128),
                    mod('Santa Coloma de Gramenet', null, 376),
                ],
            },
            {
                article: 326,
                footnote: null,
                subject:
                    'Tipus d’ordenació — densificació urbana is *segons alineacions de vial*. ' +
                    'This is the article that routes 13a/13b to the Art. 242 depth construction.',
                modifiedBy: [],
            },
            {
                article: 327,
                footnote: 49,
                subject: 'Condicions d’edificació: subzona I, intensiva (13a) — the alçada table',
                modifiedBy: [mod('Badalona', J_BADALONA, 137), mod('Barcelona', J_BARCELONA, 276)],
            },
            {
                article: 328,
                footnote: 50,
                subject: 'Condicions d’edificació: subzona II, semiintensiva (13b) — the alçada table',
                modifiedBy: [mod('Badalona', J_BADALONA, 137), mod('Barcelona', J_BARCELONA, 277)],
            },
            {
                article: 330,
                footnote: 52,
                subject: 'Edificabilitat — conservació de l’estructura urbana i edificatòria (15)',
                modifiedBy: [mod('Badalona', J_BADALONA, 128)],
            },
            {
                article: 342,
                footnote: 55,
                subject: 'Condicions d’edificació de les subzones plurifamiliars (20a/*)',
                modifiedBy: [
                    mod('Barcelona', J_BARCELONA, 179),
                    mod('Cerdanyola del Vallès', null, 281),
                    mod('Badalona', J_BADALONA, 129),
                    mod('Santa Coloma de Gramenet', null, 377),
                ],
            },
            {
                article: 343,
                footnote: 56,
                subject: 'Condicions d’edificació a les subzones unifamiliars (20a/*)',
                modifiedBy: [
                    mod('Barcelona', J_BARCELONA, 181),
                    mod('Cerdanyola del Vallès', null, 281),
                    mod('Badalona', J_BADALONA, 133),
                ],
            },
            {
                article: 345,
                footnote: null,
                subject: 'Edificabilitat — ordenació en edificació aïllada (20a)',
                modifiedBy: [],
            },
            {
                article: 350,
                footnote: null,
                subject: 'Condicions d’edificació — zona de remodelació pública (14a)',
                modifiedBy: [],
            },
            {
                article: 355,
                footnote: null,
                subject: 'Tipus d’ordenació — zona de remodelació privada (14b)',
                modifiedBy: [],
            },
            {
                article: 356,
                footnote: 57,
                subject: 'Estàndards urbanístics — remodelació privada (14b)',
                modifiedBy: [mod('Barcelona', J_BARCELONA, 151)],
            },
            {
                article: 357,
                footnote: 58,
                subject: 'Edificabilitat — remodelació privada (14b)',
                modifiedBy: [mod('Barcelona', J_BARCELONA, 151)],
            },
            {
                article: 358,
                footnote: null,
                subject: 'Condicions d’edificació — remodelació privada (14b)',
                modifiedBy: [],
            },
            {
                article: 359,
                footnote: null,
                subject: 'Definició — zona de renovació urbana: rehabilitació (16)',
                modifiedBy: [],
            },
            { article: 360, footnote: null, subject: 'Tipus d’ordenació (16)', modifiedBy: [] },
            {
                article: 361,
                footnote: null,
                subject: 'Desenvolupament del Pla General (16)',
                modifiedBy: [],
            },
            { article: 362, footnote: null, subject: 'Edificabilitat (16)', modifiedBy: [] },
            {
                article: 363,
                footnote: 59,
                subject: 'Densitat d’habitatges (16)',
                modifiedBy: [mod('Barcelona', J_BARCELONA, 187), mod('Badalona', J_BADALONA, 129)],
            },
            {
                article: 364,
                footnote: null,
                subject: 'Exigències mínimes a què hauran d’ajustar-se els plans (16)',
                modifiedBy: [],
            },
            { article: 365, footnote: null, subject: 'Condicions de l’edificació (16)', modifiedBy: [] },
            {
                article: 366,
                footnote: null,
                subject: 'Conservació i millora de l’edificació (16)',
                modifiedBy: [],
            },
            { article: 367, footnote: null, subject: 'Definició (17)', modifiedBy: [] },
            { article: 368, footnote: null, subject: 'Règim urbanístic (17)', modifiedBy: [] },
        ] as AmbPgmArticleScope[]
    ).map((s) => [s.article, Object.freeze({ ...s, modifiedBy: Object.freeze(s.modifiedBy) })]),
);

/**
 * ⚠⚠⚠ THE THREE CAVEATS THAT CAP EVERY CONCLUSION DRAWN FROM THIS MAP.
 *
 * These are quoted from the compendium's own front matter and Art. 1.1. They are the reason an
 * empty `modifiedBy` list may NOT be read as "this article is proven unmodified here", and the
 * reason the four AMB refusals still stand.
 */
export const AMB_PGM_SCOPE_CAVEATS: readonly string[] = Object.freeze([
    // PDF p.3 — the publisher's own disclaimer.
    'NOT EXHAUSTIVE. The compendium states (PDF p.3): «recull … les Normes urbanístiques del PGM ' +
        '… amb les modificacions substancials fins el 31 de desembre de 2009, relacionades per ' +
        'municipis. Amb la qual cosa NO HI FIGUREN TOTES LES MODIFICACIONS dels textos citats, ' +
        'només aquelles que s’han considerat més rellevants.» An article with no footnote may still ' +
        'have been modified by a municipality — the editors simply did not judge it "most relevant".',
    // PDF p.3 — the legal-force disclaimer.
    'NOT OFFICIAL. «No es tracta d’una publicació oficial sinó merament divulgativa. Per tant, en ' +
        'cas de discrepància, prevaldrà el redactat contingut en els textos oficialment aprovats i ' +
        'publicats en els butlletins pertinents.» The binding text is the approved instrument in the ' +
        'DOGC/BOP, not this compendium.',
    // PDF p.24, Art. 1.1 — territorial reach.
    'STALE AND NARROWER THAN THE AMB. Consolidated only to 31-12-2009 — sixteen years of later ' +
        'modificacions puntuals are absent. And Art. 1.1 scopes the PGM to the «Entitat Municipal ' +
        'Metropolitana de Barcelona, definit a l’article 2.1 del Decret llei 5/1974» — the pre-2011 ' +
        '27-municipality Corporació Metropolitana, NOT the 36-municipality AMB created by Llei ' +
        '31/2010. Membership of the AMB does NOT imply the PGM governs a municipality.',
]);

/** The instrument string any claim sourced from this map must cite. Metropolitan, never Barcelona. */
export const AMB_PGM_METROPOLITAN_INSTRUMENT =
    'PGM-1976 (Pla General Metropolità, aprovat definitivament 14-07-1976, BOP Barcelona ' +
    '19-07-1976), Normes Urbanístiques — the METROPOLITAN instrument, whose Art. 1.1 scopes it to ' +
    'the Entitat Municipal Metropolitana de Barcelona (Decret llei 5/1974, art. 2.1). Consulted via ' +
    'the MMAMB *Normativa Urbanística Metropolitana* compendium (December 2010, consolidated ' +
    '31-12-2009), which is expressly non-official and non-exhaustive.';

/** What `ambArticleScopeFor()` can conclude. Mirrors EXTRACTION-PROTOCOL.md's four-state discipline. */
export type AmbArticleScopeVerdict =
    /** The article is in the map and this municipality is NOT among those the footnote names. */
    | 'metropolitan-no-recorded-modification'
    /** The article is in the map and this municipality's own rewrite is cited. */
    | 'municipally-modified'
    /** Not transcribed, or the municipality is not one this map can name. Never guess past this. */
    | 'unknown';

/** What `ambArticleScopeFor()` returns — the verdict plus everything needed to cite it. */
export interface AmbArticleScopeAnswer {
    readonly verdict: AmbArticleScopeVerdict;
    /** The modification record when `verdict === 'municipally-modified'`, else `null`. */
    readonly modification: AmbPgmModification | null;
    /** The full transcribed row, or `null` when the article was never transcribed. */
    readonly scope: AmbPgmArticleScope | null;
    /**
     * Human-readable, citation-bearing reason. Safe to surface in a refusal card — it names the
     * article, the footnote, and (when modified) the annex page carrying the municipality's text.
     */
    readonly reason: string;
}

/** Municipalities this map can speak about at all. Anything else answers `'unknown'`. */
const KNOWN_JURISDICTIONS: readonly string[] = Object.freeze([
    J_BARCELONA,
    J_BADALONA,
    J_HOSPITALET,
    J_SANT_BOI,
    J_CORNELLA,
]);

/**
 * §AMB-PGM-SCOPE — does PGM article `article` stand in its metropolitan form on `jurisdictionId`'s
 * land, or did that municipality rewrite it?
 *
 * ⚠ `'metropolitan-no-recorded-modification'` IS NOT "VERIFIED UNMODIFIED". It means: this
 * compendium's footnote for that article does not name this municipality. Read
 * `AMB_PGM_SCOPE_CAVEATS` before letting that verdict authorise a number. It is evidence for a
 * founder signature, never a substitute for one.
 *
 * PURE, total, never throws. Unknown article or unknown municipality ⇒ `'unknown'`.
 *
 * P8 — emits `pryzm.zoning.es.amb.articleScope`.
 */
export function ambArticleScopeFor(
    article: number,
    jurisdictionId: string,
): AmbArticleScopeAnswer {
    const span = tracer.startSpan('pryzm.zoning.es.amb.articleScope');
    try {
        const scope = AMB_PGM_ARTICLE_SCOPE.get(article) ?? null;
        if (!scope) {
            return {
                verdict: 'unknown',
                modification: null,
                scope: null,
                reason:
                    `PGM Art. ${article} has not been transcribed into the AMB scope map, so PRYZM ` +
                    'cannot say whether it is metropolitan or locally rewritten here.',
            };
        }
        if (!KNOWN_JURISDICTIONS.includes(jurisdictionId)) {
            return {
                verdict: 'unknown',
                modification: null,
                scope,
                reason:
                    `PRYZM does not hold a PGM scope record for "${jurisdictionId}". Membership of ` +
                    'the AMB does not imply the PGM governs it — Art. 1.1 scopes the plan to the ' +
                    'pre-2011 Entitat Municipal Metropolitana (27 municipalities).',
            };
        }
        const hit = scope.modifiedBy.find((m) => m.jurisdictionId === jurisdictionId) ?? null;
        if (hit) {
            return {
                verdict: 'municipally-modified',
                modification: hit,
                scope,
                reason:
                    `PGM Art. ${article} (${scope.subject}) is REWRITTEN for ` +
                    `${hit.municipalityInSource}: footnote ${scope.footnote ?? '—'} on the base ` +
                    `article reads «Veure modificació per al Municipi de ${hit.municipalityInSource} ` +
                    `a la pàg. ${hit.printedPage}» (PDF p.${hit.pdfPage}). The metropolitan text does ` +
                    'NOT govern this parameter here.',
            };
        }
        const others = scope.modifiedBy.map((m) => m.municipalityInSource).join(', ');
        return {
            verdict: 'metropolitan-no-recorded-modification',
            modification: null,
            scope,
            reason:
                `PGM Art. ${article} (${scope.subject}) — this compendium records NO modification ` +
                `for ${jurisdictionId}` +
                (others ? ` (it names only: ${others})` : ' (the heading carries no footnote at all)') +
                '. ⚠ The compendium is expressly non-official and NOT exhaustive, and is ' +
                'consolidated only to 31-12-2009, so this is evidence of metropolitan force — not ' +
                'proof of it.',
        };
    } finally {
        span.end();
    }
}

/**
 * Every article this map records as rewritten by `jurisdictionId`. Empty means: within the articles
 * transcribed here, the compendium records no local rewrite for that municipality.
 *
 * P8 — emits `pryzm.zoning.es.amb.modifiedArticles`.
 */
export function ambModifiedArticlesFor(jurisdictionId: string): readonly number[] {
    const span = tracer.startSpan('pryzm.zoning.es.amb.modifiedArticles');
    try {
        const out: number[] = [];
        for (const [article, scope] of AMB_PGM_ARTICLE_SCOPE) {
            if (scope.modifiedBy.some((m) => m.jurisdictionId === jurisdictionId)) out.push(article);
        }
        return Object.freeze(out.sort((a, b) => a - b));
    } finally {
        span.end();
    }
}
