// Barcelona (INE 08019) — clau **`22@`**, *zona d'activitats 22@* (Poblenou, *Districte
// d'Activitats 22@BCN*).
//
// GOVERNING INSTRUMENT — AND IT IS **NOT** THE PGM's OWN ARTICLES
// ---------------------------------------------------------------
// `22@` is created by the **MPGM per a la renovació de les àrees industrials del Poblenou,
// districte d'activitats 22@BCN**, aprovada definitivament per Acord de la Subcomissió
// d'Urbanisme del municipi de Barcelona de **27-07-2000 (DOGC núm. 3239 de 05-10-2000)**, with
// twelve prescriptions (a–l) incorporated *d'ofici*.
//
// ⚠⚠ **AND IT WAS RE-APPROVED IN 2006. READ THE 2006 TEXT, NOT THE 2000 ONE.** A second
// *Modificació del PGM per a la renovació de les àrees industrials del Poblenou-Districte 22@bcn*
// was aprovada definitivament by the Subcomissió d'Urbanisme del Municipi de Barcelona on
// **01-03-2006 (DOGC núm. 4654 de 14-06-2006)**. It is a full re-statement of the Normes: the
// article numbering is preserved, but every *Pla Especial (de Reforma Interior)* becomes a **Pla
// de Millora Urbana**, Arts. 20–23 (execution duties, 10 % *aprofitament* cession) are NEW, and
// the legal cross-references move from Decret Legislatiu 1/1990 to the Text Refós de la Llei
// d'Urbanisme. The 2000 text's own footnote says so: *"1. Veure modificació a la pàg. 194."*
//
// EVERY FIGURE BELOW IS READ FROM THE **2006** TEXT and cross-checked against the 2000 text.
//
// ⚠⚠⚠ **THE PDF PAGES CARRYING THE 2006 TEXT DO NOT EXTRACT AS TEXT.**
// `docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/PGM-NNUU-metropolitana.pdf`:
//   • **PDF pp. 155–168** — the **2000** Normes. Text layer is intact; `get_text()` works.
//   • **PDF pp. 196–209** — the **2006** Normes. The embedded TimesNewRoman/Arial subsets carry
//     **no usable ToUnicode map**: `get_text()` returns 12 alphanumeric characters per page (the
//     running header/footer) and nothing else. `page.get_text("dict")` reports 3–12 real text
//     blocks per page, so the glyphs ARE there — only the code→character mapping is missing.
//     They were recovered by **rendering each page (`page.get_pixmap(dpi=150)`) and reading the
//     raster**. Anyone re-verifying this file must do the same; a text-extraction pass over this
//     PDF will silently report the 2006 amendment as absent and leave you transcribing the
//     superseded 2000 wording.
//
// ═══ WHAT THIS ZONE ACTUALLY IS — AND WHY THE "IT DELEGATES" ASSUMPTION IS WRONG ══════════════
//
// The standing expectation was that 22@ is *pla-de-millora-urbana* machinery end to end and that
// the honest deliverable would be a cited refusal. **The ordinance does not say that.**
//
// **MPGM 22@ Art. 8.1** (2006, identical in 2000) opens:
//
//   *"L'edificació a la zona 22@, destinada als usos industrials permesos a l'article 6, podrà
//   desenvolupar-se **directament per llicència** i s'ajustarà al coeficient d'edificabilitat
//   **per parcel·la** de 2,2 m² sostre/m² sòl."*
//
// and then states, as lettered conditions a–g, an alignment ordering, a four-band street-width
// height table, a 70 % parcel occupation cap, a 500 m² minimum parcel and a full-subsoil
// allowance. That is a **by-right, per-parcel envelope**, not a delegation — the most complete
// stated parameter set of any unpacked Barcelona clau.
//
// ⇒ **A pack is justified.** It is authored below, in full, from the primary text.
//
// ═══ AND IT IS *NOT* REGISTERED, FOR REASONS THAT ARE NOT THE ABSENCE OF NUMBERS ═══════════════
//
// See `BCN_22ARROBA_ENVELOPE_BLOCKER`. In one line: **Art. 8 states no *profunditat edificable*
// and no band**, so an alignment ordering cannot be turned into a footprint; and **three
// independent regime forks** (Art. 9 *fronts edificatoris*, Art. 16 delimited transformation
// ámbitos, Art. 8.1.a *estudi de detall* → *aïllada*) each replace Art. 8.1 with a different rule
// on parcels PRYZM cannot identify. Registering today would draw the whole plot at a height that
// may belong to another article.
//
// ⚠⚠ **§DEC-1 (FOUNDER, 2026-08-01) — AND "TODAY" IS NOW "PERMANENTLY".** The missing depth was
// researched to exhaustion and found to be **an intentional omission**, not a gap in our sourcing:
// modern 22@ resolves its geometry through PMUs, *fitxes urbanístiques* and *plànols d'ordenació*.
// `22@` therefore ships a legally-grounded `derived-plan` refusal that names Art. 8.1 and points at
// the derived instrument — see `BCN_22ARROBA_DEPTH_CLOSURE` for the evidence and for the single
// thing that would reopen it. **This pack stays out of `packsByZone`. That is the decision, not a
// deferral.**
//
// PURE + deterministic (C58 §1.1). Authority: C58 §1.2/§1.4/§1.7a/§1.11/§1.13.7, ADR-0270 (rule
// KIND), ADR-0271 (*edificabilitat* is a construction), ADR-0276 (`regime-undetermined`).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
} from '@pryzm/schemas';
import {
    effectiveBandEdgeGuard_m,
    type AlcadaBand,
    type AlcadaResolution,
} from './bcnAlcadaReguladora.js';

const tracer = trace.getTracer('pryzm.zoning.es.bcn');

/**
 * The governing citation carried on every value in this pack.
 *
 * ⚠ It names the **instrument, the approval date, the DOGC number AND the paragraph** — not
 * "the PGM". 22@ is not PGM text: the PGM's own Art. 350 governs clau `22a`, and citing it for
 * `22@` land is the L-526 failure one clau over (and is the reason `BCN_INDUSTRIAL_ZONE_CODES`
 * deliberately excludes `22@`).
 */
export const BCN_22ARROBA_ORDINANCE_REF =
    'MPGM per a la renovació de les àrees industrials del Poblenou — Districte d’Activitats ' +
    '22@BCN, clau 22@. Text vigent: modificació aprovada definitivament per la Subcomissió ' +
    'd’Urbanisme del Municipi de Barcelona en sessió d’1 de març de 2006 (DOGC núm. 4654 de ' +
    '14-06-2006), que refon i substitueix la MPGM aprovada el 27 de juliol de 2000 (DOGC núm. ' +
    '3239 de 05-10-2000). ' +
    'Règim supletori: Art. 5 — *"La zona d’activitats 22@ es defineix formalment com a una ' +
    'subzona de la zona industrial 22a i es regula pel que disposen les Normes Urbanístiques ' +
    '(NNUU) del PGM per a la zona 22a, llevat d’allò que expressament s’estableix en els articles ' +
    'següents."* ' +
    'Edificabilitat 2,2 m² sostre/m² sòl per parcel·la, per llicència directa: Art. 8.1. ' +
    'Alçada reguladora màxima i nombre de plantes (taula per amplada de carrer, 4 bandes): ' +
    'Art. 8.1.b — NOT Art. 327 (clau 13a), NOT Art. 328 (clau 13b) and NOT Art. 350.2.c ' +
    '(clau 22a); all four tables differ in bands AND in heights. ' +
    'Tipus d’ordenació — edificació alineada a vial: Art. 8.1.a. ' +
    'Ocupació màxima de parcel·la 70 %: Art. 8.1.f. Parcel·la mínima 500 m²: Art. 8.1.e. ' +
    'Ocupació total del subsòl: Art. 8.1.d. Altells i cossos sortints tancats computen dins el ' +
    'sostre edificable: Art. 8.1.c. Règim d’usos: Art. 6. ' +
    'Corroboració independent de la clau d’alçada: prescripció (j) de l’aprovació de 27-07-2000 ' +
    '— *"L’alçada reguladora màxima s’ajustarà en qualsevol cas en funció l’ample del carrer al ' +
    'que donin front les edificacions."* ' +
    'Source: MMAMB re-edition of the Normativa Urbanística Metropolitana, PDF pp. 155–168 (2000 ' +
    'text) and pp. 196–209 (2006 text), committed at docs/04-reference/jurisdictions/es/es-ct/' +
    '08019-barcelona/PGM-NNUU-metropolitana.pdf. ⚠ A manually re-typeset re-edition — primary, ' +
    'but NOT authenticated; and pp. 196–209 carry no usable ToUnicode map and were read from a ' +
    'raster render. Hence estimated-ruleset and never certified.';

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE ART. 8.1 HEIGHT TABLE — *alçada reguladora màxima i nombre de plantes*
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Verbatim, **Art. 8.1.b** (2006 text, PDF p. 199; identical wording in the 2000 text, PDF p. 157):
//
//   *"Alçada reguladora màxima i nombre de plantes: **24 m** per a carrers de **20 m d'amplada o
//   superior** amb un límit de **planta baixa i quatre pisos**; **19,20 m** per a carrers **d'11 m
//   i menys de 20 m**, amb un límit de **planta baixa i tres pisos**; **14,40 m** per a carrers de
//   **8 i menys d'11 m**, amb un límit de **planta baixa i dos pisos**; **9,60 m** per a carrers de
//   **menys de 8 metres** amb un límit de **planta baixa i un pis**. L'alçada reguladora s'aplicarà
//   segons el tipus d'ordenació d'alineació de vial."*
//
// ⚠⚠ **FOUR TABLES NOW EXIST FOR BARCELONA AND NO TWO AGREE. DO NOT REACH FOR THE WRONG ONE.**
//
//     clau   article       bands (m)                 heights (m)                        ladder
//     13a    Art. 327.2    8 / 12 / 15 / 20 / 30     8,55 11,60 14,65 17,70 20,75 23,80  3,05
//     13b    Art. 328.2a   8 / 11 / 15               7,55 10,60 13,65 16,70              3,05
//     22a    Art. 350.2.c  8 / 11                    9  13  17                           (none)
//     22@    Art. 8.1.b    8 / 11 / 20               9,60 14,40 19,20 24,00              4,80
//
// The 22@ ladder is **4,80 m per storey** — an industrial floor-to-floor, not a residential one.
// That is a CONSISTENCY CHECK on the reading (24 = 5 × 4,80; 19,20 = 4 × 4,80; 14,40 = 3 × 4,80;
// 9,60 = 2 × 4,80), **not the source of any figure here**: every number is transcribed from the
// article, and if the article had broken its own ladder the article would win.
//
// ⚠ 22@'s bands are 8 / 11 / 20 — it shares 8 and 11 with 22a and 13b, and 20 with 13a, and
// agrees with none of them on a single height. Pattern-matching between these tables is the
// specific failure `bcnAlcadaIndustrial.ts` was written to block; it applies here with four
// candidates instead of three.

/**
 * The band-edge reading convention for Art. 8.1.b.
 *
 * ⚠ **STATED BY THE ORDINANCE, not adopted.** *"de menys de 8 metres"* excludes 8,00 from the
 * bottom band; *"de 8 i menys d'11 m"* includes 8,00 and excludes 11,00; *"d'11 m i menys de
 * 20 m"* includes 11,00 and excludes 20,00; *"de 20 m d'amplada o superior"* includes 20,00 and
 * states no upper bound. Half-open `[min, max)` throughout, in the article's own words.
 */
export const BCN_22ARROBA_EDGE_CONVENTION = {
    /** `true` ⇒ `[min, max)`, lower-inclusive / upper-exclusive. */
    lowerInclusive: true,
    /** ⚠ TRUE — every one of the four edges is stated in words, not inferred. */
    statedByOrdinance: true,
    why:
        'MPGM 22@ Art. 8.1.b prints its bands as "carrers de menys de 8 metres" / "carrers de 8 i ' +
        'menys d’11 m" / "carrers d’11 m i menys de 20 m" / "carrers de 20 m d’amplada o ' +
        'superior". All four edges are stated in words, so the half-open [min, max) reading is ' +
        'the ordinance’s, not a convention we supplied. Primary source: ' +
        'PGM-NNUU-metropolitana.pdf PDF p. 199 (2006 text) / p. 157 (2000 text).',
} as const;

/**
 * MPGM 22@ **Art. 8.1.b** — the *alçada reguladora màxima* table for clau `22@`.
 *
 * ⚠ FOUR bands. ⚠ The top band is OPEN-ENDED (`maxWidth_m: Infinity`) because the article says
 * *"de 20 m d'amplada o superior"* and states no further step — **no band-edge guard applies
 * above 20 m**, because there is no edge up there to straddle. Inventing one would invent a fifth
 * band by the back door (the exact error `bcnAlcadaIndustrial.ts` records for Art. 350.2.c).
 *
 * ⚠ `floorsAboveGround` transcribes *"planta baixa i N pisos"*, i.e. the storeys ABOVE the ground
 * floor — matching `AlcadaBand`'s contract and the other three Barcelona tables. *PB + 4 P* is
 * `4`, not `5`.
 */
export const BCN_ALCADA_22ARROBA_TABLE: ReadonlyArray<AlcadaBand> = Object.freeze([
    { minWidth_m: 0, maxWidth_m: 8, height_m: 9.6, floorsAboveGround: 1 },
    { minWidth_m: 8, maxWidth_m: 11, height_m: 14.4, floorsAboveGround: 2 },
    { minWidth_m: 11, maxWidth_m: 20, height_m: 19.2, floorsAboveGround: 3 },
    { minWidth_m: 20, maxWidth_m: Infinity, height_m: 24, floorsAboveGround: 4 },
]);

/**
 * Which of the MPGM's regimes a `22@` parcel is in. **Three-valued, and `unknown` is the default**
 * — the same asymmetry `PlaParcialRegime` applies to clau `22a`, for the same reason: assuming the
 * permissive branch because we did not look would turn "we did not look" into an ordinance fact.
 *
 * • `art8-direct`   — the by-right regime of Art. 8.1: not on an Art. 9 *front edificatori*, not
 *                     inside an Art. 16 delimited transformation ámbito, no *estudi de detall*
 *                     converting the parcel to *edificació aïllada*. **This table answers.**
 * • `front-edificatori` — Art. 9.2: the parcel forms part of a housing frontage marked on plànol
 *                     núm. 3. Height is capped at **20,75 m / PB+5** on 20 m streets and otherwise
 *                     by **PGM Art. 327** (the clau 13a ladder), via a Pla de Millora Urbana.
 *                     A completely different article and a completely different table. Refuse.
 * • `transformacio` — Arts. 10 / 16 / 17: an actuació de transformació. Art. 8.3 — *"Les
 *                     condicions d'edificació en les actuacions de transformació es concretaran en
 *                     els Plans de Millora urbana previstos als articles 10, 16 i 17."* Refuse.
 * • `unknown`       — not established. Today the ONLY value any production caller can honestly
 *                     supply, because none of the three discriminators is published in a source
 *                     PRYZM consumes.
 */
export type Bcn22ArrobaRegime = 'art8-direct' | 'front-edificatori' | 'transformacio' | 'unknown';

/**
 * Resolve the *alçada reguladora màxima* for a clau `22@` parcel from an *amplada de vial*.
 *
 * PURE, deterministic, never throws. Returns `ok: false` rather than a number whenever the input
 * cannot legitimately decide the answer — the same asymmetry Arts. 327, 328 and 350.2.c apply.
 *
 * TWO GATES, IN ORDER:
 *   1. **The regime gate** (see `Bcn22ArrobaRegime`). Art. 8.1.b governs only the by-right regime.
 *      Checked BEFORE the width so a caller that cannot establish the regime gets the regime's
 *      reason and not a width complaint — two different problems, and collapsing them would hide
 *      the one actually blocking this zone.
 *   2. **The band-edge guard**, REUSED from Art. 327 (`effectiveBandEdgeGuard_m`), never
 *      re-implemented. ⚠ It matters more here than in the residential tables: an Art. 8.1.b band
 *      crossing moves the answer **4,80 m**, against 3,05 m for 13a/13b.
 *      ⚠ **No guard fires above 20 m** — the top band has no upper edge.
 *
 * @param amplada_m the street width in metres. **Pass the OFFICIAL width when you have one.**
 * @param opts.regime see `Bcn22ArrobaRegime`. Defaults to `'unknown'` ⇒ refuse. There is no
 *   permissive default.
 * @param opts.trustedOfficialWidth TRUE only when `amplada_m` came from the planning street
 *   database (the *ample oficial*), never from measuring geometry.
 * @param opts.measurementSpread_m `StreetWidthMeasurement.spread_m`. Widens the guard; never
 *   narrows it.
 */
export function resolveAlcada22Arroba(
    amplada_m: number,
    opts: {
        readonly regime?: Bcn22ArrobaRegime;
        readonly trustedOfficialWidth?: boolean;
        readonly measurementSpread_m?: number | null;
    } = {},
): AlcadaResolution {
    // P8 — every exported function carries at least one span.
    const span = tracer.startSpan('pryzm.zoning.es.bcn.resolveAlcada22Arroba');
    try {
        const regime: Bcn22ArrobaRegime = opts.regime ?? 'unknown';
        span.setAttribute('bcn.clau', '22@');
        span.setAttribute('bcn.regime', regime);

        // GATE 1 — the regime. Both non-Art.8 regimes are reported as `pla-parcial-governs`
        // (another instrument states the height) and the undetermined case as
        // `pla-parcial-unknown`. ⚠ The reason vocabulary is `AlcadaResolution`'s and is shared
        // with Art. 350; the WORD "pla parcial" is 22a's, but the shape of the refusal — "a
        // derived instrument states this height instead / we cannot tell which" — is exactly the
        // same fact, and adding a 22@-private reason string would fork a closed vocabulary for a
        // synonym. The caller's regime value is on the span and in this doc comment.
        if (regime === 'front-edificatori' || regime === 'transformacio') {
            span.setAttribute('bcn.alcada.refused', 'other-instrument-governs');
            return { ok: false, reason: 'pla-parcial-governs', straddles: [] };
        }
        if (regime !== 'art8-direct') {
            span.setAttribute('bcn.alcada.refused', 'regime-unknown');
            return { ok: false, reason: 'pla-parcial-unknown', straddles: [] };
        }

        if (typeof amplada_m !== 'number' || !Number.isFinite(amplada_m) || amplada_m <= 0) {
            span.setAttribute('bcn.alcada.refused', 'bad-input');
            return { ok: false, reason: 'bad-input', straddles: [] };
        }

        const bandFor = (w: number): AlcadaBand =>
            BCN_ALCADA_22ARROBA_TABLE.find((b) => w >= b.minWidth_m && w < b.maxWidth_m) ??
            BCN_ALCADA_22ARROBA_TABLE[BCN_ALCADA_22ARROBA_TABLE.length - 1]!;

        if (!opts.trustedOfficialWidth) {
            const guard = effectiveBandEdgeGuard_m(opts.measurementSpread_m);
            const low = bandFor(Math.max(0.000001, amplada_m - guard));
            const high = bandFor(amplada_m + guard);
            if (low.height_m !== high.height_m) {
                span.setAttribute('bcn.alcada.refused', 'band-edge');
                return { ok: false, reason: 'band-edge', straddles: [low.height_m, high.height_m] };
            }
        }

        const band = bandFor(amplada_m);
        span.setAttribute('bcn.alcada.height_m', band.height_m);
        return {
            ok: true,
            height_m: band.height_m,
            floorsAboveGround: band.floorsAboveGround,
            band,
            // NULL. The Eixample cornice increment is an *Ordenança dels Usos del Paisatge Urbà*
            // affordance for clau 13a; Art. 8.1.b states no equivalent for 22@ and borrowing one
            // would add height the article does not grant.
            corniceIncrementMax_m: null,
        };
    } catch (e) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(e) });
        throw e;
    } finally {
        span.end();
    }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHAT ART. 8.1 STATES, AS PROSE FACTS — the half of 22@ that can ship TODAY
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The Art. 8.1 by-right limits, for publication in a refusal card's PROSE (C58 §1.13.7).
 *
 * ⚠ **NONE OF THESE MAY BE WRITTEN INTO A `BuildableEnvelope` NUMERIC FIELD** while the zone is
 * refused. C58 §1.13.3: a refused envelope nulls every number, because `storeyCap`, the
 * generators and the Cesium massing path read those and will extrude one.
 *
 * ⚠ **GRANULARITY IS PART OF THE FACT, NOT A FOOTNOTE.** Art. 8.1's 2,2 is *"per parcel·la"*.
 * Art. 16.4.a states the SAME 2,2 *"aplicats sobre la superfície de **l'illa**"*. Same digits,
 * different denominator — a block-granularity index shown as a parcel index is a category error,
 * not an imprecision (C58 §1.11.2). See `BCN_22ARROBA_TRANSFORMATION_COEFFICIENTS`.
 */
export const BCN_22ARROBA_ART8_LIMITS = {
    /**
     * The paragraph that opens the by-right regime — *"podrà desenvolupar-se directament per
     * llicència"*. Held as its OWN field (not embedded in prose) so the refusal card can name the
     * article WITHOUT interpolating the figure it states. §DEC-1: a cited refusal may say *which*
     * article states a limit; it may not print the limit's digits.
     */
    byRightArticle: '8.1',
    /**
     * *Coeficient d'edificabilitat per parcel·la*, m² sostre / m² sòl — **Art. 8.1**.
     *
     * ⚠ **PER PARCEL, AND BY RIGHT.** Unlike 13a (which has no FAR at all — Art. 322.1 says the
     * envelope IS the rule) and unlike 13b (whose 1,80 is gated to PERI / estudis de detall),
     * this index is stated *per parcel·la* and attached to a *llicència directa*.
     *
     * ⚠ Its composition is stated too, and matters for amendment tracking: 2,0 is the PGM's
     * general industrial index (Art. 350) and **0,2 is an increment tied to the Pla Especial
     * d'Infrastructures** — *"s'estableix com a compensació de l'increment de costos
     * d'urbanització, vinculat al Pla Especial d'Infrastructures"*. Prescription (a) of the
     * 27-07-2000 approval says the same from the other side: *"La zona industrial, clau 22a,
     * establerta pel Pla general metropolità manté l'edificabilitat de 2 m²/m². L'augment
     * d'edificabilitat del 0,20 m²/m² … es vincula al Pla especial d'infrastructures."*
     */
    plotRatioFAR: 2.2,
    /** The paragraphs that state the 2,2 for a non-transformation parcel. Four of them. */
    plotRatioFARArticles: '8.1 · 8.2 · 17.3.d · 21.2',
    /** ⚠ PARCEL, for Art. 8.1. Art. 16.4.a's identical figure is per *illa*. */
    plotRatioFARGranularity: 'parcel',
    /** *Ocupació màxima de parcel·la* as a fraction — **Art. 8.1.f**: *"70 %"*. */
    maxCoverage: 0.7,
    /** The paragraph that states the occupation. */
    maxCoverageArticle: '8.1.f',
    /**
     * ⚠ **70 % HERE IS NOT THE 70 % OF PGM Art. 350.2.b**, which is a share of the BLOCK that may
     * be built above the ground floor. Art. 8.1.f is a share of the **parcel**, at every level.
     * The digits coincide across two articles that 22@ is simultaneously subject to (Art. 5 makes
     * the PGM's 22a rules supletory), which makes this the single most likely wrong edit to this
     * file. See `BCN_22ARROBA_OPEN_QUESTIONS.art350_2bSupletory`.
     */
    maxCoverageNotToBeConfusedWith: 'PGM Art. 350.2.b — 70 % of the BLOCK, above the ground floor',
    /** *Parcel·la mínima*, m² — **Art. 8.1.e**: *"Parcel·la mínima de 500 m²."* */
    minParcel_m2: 500,
    /** The paragraph that states the minimum parcel. §DEC-1 — the article, never the figure. */
    minParcelArticle: '8.1.e',
    /**
     * The paragraph that states the *alçada reguladora màxima* table (`BCN_ALCADA_22ARROBA_TABLE`).
     * §DEC-1 — named so a refusal can point at the table without transcribing a single height.
     */
    heightTableArticle: '8.1.b',
    /** The paragraph that orders the zone *alineada a vial*. The reason a setback triple is wrong. */
    alignmentArticle: '8.1.a',
    /** **Art. 8.1.d** — *"El subsòl pot ser ocupat en la seva totalitat."* A stated 100 %. */
    subsoilFullyOccupiable: true,
    /**
     * **Art. 8.1.c** — *"Els altells i els cossos sortints tancats computen en tot cas dins el
     * sostre edificable."*
     *
     * ⚠ A **finding about the FAR's own definition**, and the opposite of the 13a situation the
     * extraction protocol flags: in the Eixample, *cossos sortints* sit OUTSIDE the corpus and are
     * a live risk to *edificabilitat*. Here the article closes that hole itself — enclosed
     * projections and mezzanines are inside the 2,2. Recorded so nobody adds them back.
     */
    altellsAndEnclosedProjectionsCountTowardFAR: true,
} as const;

/**
 * The *actuació de transformació* coefficients — **Arts. 16.4.a and 17.1**.
 *
 * ⚠⚠ **RECORDED, NEVER SHIPPED AS A PARCEL FAR.** Art. 16.4.a: *"l'edificabilitat ve determinada
 * pels índexs d'edificabilitat nets següents, **aplicats sobre la superfície de l'illa**
 * qualificada com a zona d'activitats 22@"*. These are **BLOCK-granularity** indices reached only
 * through an approved Pla de Millora Urbana, and two of the three are **earmarked** — 0,5 is
 * *"exclusivament a activitats @"* and conditional on the PMU itself evidencing the business
 * initiatives; 0,3 is *"de titularitat municipal"* for protected housing. Presenting their sum as
 * a landowner's entitlement would over-state by roughly a third and mis-state the ownership.
 *
 * The 27-07-2000 approval's prescription (b) states the ceiling in one line: *"Les actuacions de
 * transformació mantindran amb caràcter general una edificabilitat màxima de **3 m² sostre/m²
 * sòl**"* (2,0 + 0,2 + 0,5 + 0,3), and prescription (c) adds the extra 0,20 in the six delimited
 * ámbitos ⇒ **3,2**.
 */
export const BCN_22ARROBA_TRANSFORMATION_COEFFICIENTS = {
    /** Art. 16.4.a — *"Coeficient net: 2,2 m² sostre/m² sòl."* Over the **illa**, not the parcel. */
    net: 2.2,
    /**
     * Art. 16.4.a — *"Coeficient net complementari: 0,5 m² sostre/m² sòl. Podrà addicionar-se al
     * coeficient net per destinar-se **exclusivament a activitats @**."* Conditional on the PMU
     * identifying and guaranteeing the continuity of the business initiatives.
     */
    complementaryAtActivities: 0.5,
    /**
     * Art. 16.4.a — *"Coeficient net complementari addicional: 0,3 m² sostre/m² sòl **de
     * titularitat municipal** que es destinarà a l'ús d'habitatge sotmès a algun règim de
     * protecció pública."* Art. 17.1 restates it for undelimited ámbitos, *"sense l'increment
     * previst a l'article anterior"*.
     */
    complementaryMunicipalProtectedHousing: 0.3,
    /**
     * Art. 16.4.a — the extra *"0,2 m² sostre/m² sòl, també de titularitat municipal"*, available
     * **only in the six ámbitos delimited by Art. 16.2**: Llacuna · Parc Central · Campus
     * Audiovisual · Llull-Pujades (Llevant) · Llull-Pujades (Ponent) · Perú-Pere IV.
     */
    delimitedAmbitIncrement: 0.2,
    /** The six ámbitos Art. 16.2 delimits by name. */
    delimitedAmbits: Object.freeze([
        'Llacuna',
        'Parc Central',
        'Campus Audiovisual',
        'Llull-Pujades (Llevant)',
        'Llull-Pujades (Ponent)',
        'Perú-Pere IV',
    ]),
    /** Prescription (b), 27-07-2000 — the general transformation ceiling. */
    generalCeiling: 3,
    /** Prescription (c), 27-07-2000 — the ceiling inside the six delimited ámbitos. */
    delimitedAmbitCeiling: 3.2,
    /** ⚠ **BLOCK**, not parcel. The whole reason this constant is quarantined from the pack. */
    granularity: 'block',
    /**
     * Art. 16.4.d — *"Les actuacions de transformació no superaran la densitat màxima resultant de
     * dividir el sostre destinat a habitatge per **90 m²**"*. A dwelling-count rule keyed to
     * housing floor area, not to site area — it is NOT a hab/ha figure and must not be shown as one.
     */
    dwellingModule_m2: 90,
} as const;

/**
 * What this transcription could **not** settle. Left open deliberately, with both readings
 * recorded — Step 6 of the extraction protocol. An unresolved question written down is worth more
 * than a resolved-looking guess.
 */
export const BCN_22ARROBA_OPEN_QUESTIONS = Object.freeze({
    /**
     * ⚠ **DOES PGM Art. 350.2.b's 70 %-of-block band APPLY TO 22@ SUPPLETORILY?**
     *
     * Art. 5 makes the PGM's clau 22a rules supletory *"llevat d'allò que expressament s'estableix
     * en els articles següents"*. Art. 8.1.f expressly replaces the occupation (70 % of the parcel,
     * against Art. 350.2.a's 90 %) and Art. 8.1.b expressly replaces the height table. **It says
     * nothing about the *franja concèntrica*.** Two defensible readings:
     *   (i) the band survives — it was not expressly displaced, so 22@ buildings above the ground
     *       floor must still sit inside the 70 %-of-block band, and 22@ is a `tiered-occupation`
     *       zone like 22a; or
     *  (ii) the band falls — Art. 8.1 states a *complete and closed* set of *condicions
     *       d'edificació* (a–g) for a *llicència directa*, and a supletory band would make the
     *       by-right path unusable without a block ring the licence process never asks for.
     *
     * ⚠ **THIS IS NOT AN ENGINEERING QUESTION AND MUST NOT BE ANSWERED BY AN IMPLEMENTER.** Under
     * reading (i) the envelope is two-tier; under reading (ii) it is a single prism capped at 70 %
     * of the parcel. Different SHAPE, not a different number — ADR-0270 §rule-KIND, and no
     * confidence value corrects a wrong shape. Until it is settled, `geometricRule` stays `null`.
     */
    art350_2bSupletory: 'UNRESOLVED — see the two readings above. Blocks the rule KIND.',
    /**
     * ⚠ **WHICH PARCELS ARE ON A *FRONT EDIFICATORI*?** Art. 9.2 governs housing frontages marked
     * on **plànol núm. 3** of the MPGM, with their own height rule (20,75 m / PB+5 on 20 m
     * streets, otherwise **PGM Art. 327** — the clau 13a ladder) and their own depth rule
     * (Art. 9.2.c: the mean — *terme mig* — of the consolidated buildings on the frontage). The
     * MUC returns `22@` for these parcels too. PRYZM does not hold plànol 3.
     */
    planol3Fronts: 'UNRESOLVED — plànol núm. 3 of the MPGM is not held. Gates Art. 9 vs Art. 8.',
    /**
     * ⚠ **WHICH PARCELS ARE INSIDE AN ART. 16 DELIMITED ÁMBITO?** Art. 16.2 names six and
     * delimits them on *plànol núm. 2*. Inside them Art. 8.3 hands the *condicions d'edificació*
     * to a Pla de Millora Urbana. PRYZM does not hold plànol 2 either.
     */
    planol2Ambits: 'UNRESOLVED — plànol núm. 2 of the MPGM is not held. Gates Art. 16 vs Art. 8.',
    /**
     * ⚠ **HAS THE MPGM BEEN AMENDED SINCE 2006?** The committed PDF's last 22@ entry is the
     * 01-03-2006 modification, and this file is transcribed from it. The PDF is an MMAMB
     * re-edition with a fixed cut-off, **not a live consolidation** — RPUC / AMB NUMAMB is. A
     * post-2006 MPGM/PMU touching Art. 8 would not appear here. Checking RPUC is a sourcing task
     * that has NOT been done.
     */
    post2006Amendments: 'NOT CHECKED — the committed PDF has a fixed cut-off; RPUC is the live text.',
});

/**
 * ⚠⚠ **WHY THIS PACK IS NOT IN `registry.ts`.**
 *
 * ⚠ **NOT** because the ordinance is silent. It is the most completely parameterised unpacked
 * clau in Barcelona — Art. 8.1 states a FAR, an occupation, a height table, an ordering type and a
 * minimum parcel, all *per parcel·la* and all reachable *directament per llicència*. The blockers
 * are about turning those into a SOLID and about identifying WHICH parcels Art. 8.1 governs.
 *
 * ── BLOCKER 1 · THERE IS NO *PROFUNDITAT EDIFICABLE*, SO ALIGNMENT CANNOT MAKE A FOOTPRINT ────
 *
 * Art. 8.1.a orders the zone *"Edificació alineada a vial"*. The façade sits on the street line.
 * `AlignmentRuleSchema` then requires a strictly-positive `buildableDepth_m`, and **Art. 8 states
 * none** — not a figure, not a construction, not a cap. The other kinds fail too, each for a
 * stated reason:
 *   • `block-derived-alignment` — REQUIRES `interiorFreeRatio` + `minDepth_m` + `maxDepth_m`.
 *     Art. 8 states none of the three. Supplying Art. 242's 0,30 / 11 m / 30 m would impose the
 *     Eixample article's clamps on Poblenou industrial land under a citation to Art. 8 — L-526.
 *   • `tiered-occupation` — REQUIRES `bandAreaRatioOfBlock`. The only candidate is Art. 350.2.b's
 *     70 %, and whether it reaches 22@ at all is `BCN_22ARROBA_OPEN_QUESTIONS.art350_2bSupletory`.
 *     Using it would ANSWER that open legal question by writing a number into a data file.
 *   • `setback` — Art. 8 states no distances; an alignment zone has no honest front/side/rear
 *     triple (C58 §1.7a).
 *   • `explicit-area` — the ordinance publishes no polygon for the zone.
 *
 * ⇒ `geometricRule: null`. ⚠ **AND `null` IS NOT SAFE ON THE ENGINE PATH** — it means "legacy
 * per-edge inset from `setbacks`", and this zone's setbacks are correctly `null`, so an all-null
 * inset erodes nothing and `computeBuildableEnvelope` would return `status: 'ok'` with the **whole
 * parcel** as the footprint, on a card simultaneously printing `maxCoverage 70 %` from Art. 8.1.f.
 * Self-contradicting AND over-stating. Identical to the pre-ADR-0273 clau 22a failure.
 *
 * ── BLOCKER 2 · THREE REGIME FORKS, NONE OF THEM OBSERVABLE ───────────────────────────────────
 *
 * Art. 8.1 governs only 22@ land that is (a) not on an Art. 9 *front edificatori* (plànol 3),
 * (b) not inside an Art. 16 delimited transformation ámbito (plànol 2), and (c) not converted to
 * *edificació aïllada* by an *estudi de detall* under Art. 8.1.a. **The MUC returns `22@` for all
 * of them**; neither the Catastro parcel nor `CODI_QUAL_MUC` / `DESC_QUAL_AJUNT` carries any of
 * the three discriminators. Fork (a) is the sharpest: an Art. 9 parcel's height comes from
 * **PGM Art. 327**, i.e. 8,55–23,80 m on a 3,05 m ladder, against Art. 8.1.b's 9,60–24,00 m on a
 * 4,80 m ladder. On a 10 m street that is 11,60 m against 14,40 m — a 24 % over-statement, under
 * a citation, on someone's land.
 *
 * ── ⚠⚠ §DEC-1 (FOUNDER, 2026-08-01) — THIS IS NOW A **PERMANENT** REFUSAL, NOT A BLOCKER ──────
 *
 * The list above used to end in "what unblocks it": a founder determination on the rule KIND,
 * plànols 2 and 3 as geometry, the *ample oficial* layer. **BLOCKER 1 IS CLOSED AND IT CLOSED THE
 * OTHER WAY**: the depth is not missing from our sourcing, it is **absent from the ordinance by
 * design**. See `BCN_22ARROBA_DEPTH_CLOSURE` immediately below for the founder's evidence and for
 * what would reopen it. `22@` now ships a legally-grounded `derived-plan` refusal
 * (`barcelona22ArrobaDerivedPlanRefusal` in `esBarcelonaZoneClassification.ts`), reached through
 * the registry's `refusalFor` hook — **NOT** through `packsByZone`, which stays exactly as it is.
 *
 * ⚠ The old refusal (`barcelonaNoRulePackRefusal`, whose copy said PRYZM *"has read and encoded
 * the base industrial zone (22a) but not 22@"*) **became false the moment this file was
 * authored**, exactly as 13b's and 22a's did before it. That copy is now deleted, not merely
 * bypassed — a dead-but-present false sentence about our own coverage is one refactor away from
 * being read by a user again.
 */
export const BCN_22ARROBA_ENVELOPE_BLOCKER = {
    /** Registered in `registry.ts`? **NO.** */
    registered: false,
    /**
     * The `GeometricRule` kind Art. 8.1 would need under reading (ii) of `art350_2bSupletory`: a
     * footprint driven by a parcel-coverage cap alone, with no depth and no band. It does not
     * exist, and this pack does not invent it.
     */
    missingRuleKind: 'coverage-driven (footprint from maxCoverage alone, no depth, no band)',
    reasons: Object.freeze([
        'Art. 8.1.a orders the zone *alineada a vial* but Art. 8 states NO profunditat edificable, ' +
            'so AlignmentRuleSchema’s required buildableDepth_m has no honest value and every ' +
            'other GeometricRule kind fails on a field Art. 8 does not state.',
        'Whether PGM Art. 350.2.b’s 70 %-of-block band reaches 22@ supletòriament (Art. 5) is an ' +
            'UNRESOLVED legal reading that decides the rule KIND — single prism vs two tiers. A ' +
            'wrong KIND is a wrong SHAPE and no confidence value corrects it (ADR-0270).',
        'Three regime forks are invisible to PRYZM: Art. 9 fronts edificatoris (plànol 3, height ' +
            'per PGM Art. 327), Art. 16 delimited transformation ámbitos (plànol 2, height per ' +
            'Pla de Millora Urbana), and an Art. 8.1.a estudi de detall converting the parcel to ' +
            'edificació aïllada. The MUC returns `22@` for all of them.',
        'Art. 8.1.b is keyed to the *amplada de vial*, so it inherits the official-street-width ' +
            'blocker shared with Arts. 327 / 328 / 350.2.c.',
    ]),
    /** What this transcription DID settle, so the next reader does not redo it. */
    settled: Object.freeze([
        'The governing text is the 01-03-2006 MPGM (DOGC 4654), NOT the 27-07-2000 one — and the ' +
            'pages carrying it do not extract as text; they were read from a raster render.',
        'Art. 8.1’s parameters are STATED, per parcel, and reachable by direct licence. 22@ is ' +
            'NOT a delegating clau, which is what it had been assumed to be.',
        'The Art. 8.1.b height table is a FOURTH Barcelona street-width ladder, agreeing with ' +
            'none of Arts. 327 / 328 / 350.2.c on any height.',
        'The 2,2 index is stated four times (Arts. 8.1, 8.2, 17.3.d, 21.2) for non-transformation ' +
            'parcels, so it survives the transformation question — but Art. 16.4.a’s identical ' +
            '2,2 is over the ILLA, and that granularity flip is the trap.',
    ]),
} as const;

/**
 * §DEC-1 — **THE FOUNDER CLOSED `22@` AS A PERMANENT CITED REFUSAL, 2026-08-01.**
 *
 * ⚠ READ THIS BEFORE "FINISHING" THE PACK. The missing *profunditat edificable* is NOT an open
 * sourcing task and NOT a founder decision still pending. It was researched to exhaustion and the
 * finding is that **the ordinance omits it deliberately**:
 *
 *   • MPGM 22@ **Art. 8.1** states a complete by-right, per-parcel envelope — a floor-area index,
 *     an occupation cap, a minimum parcel and a four-band street-width height table — **and no
 *     *profunditat edificable* in any form: not a figure, not a construction, not a cap.**
 *   • Independent research (founder, 2026-08-01) across BCNROC, the **2024 municipal *Instrucció***
 *     on 22@ interpretation and the **2025 MPGM amendment** found **no implementation manual, no
 *     CAD/GIS geometry and no permit guidance** defining a city-wide depth.
 *   • What it DID find is that modern 22@ implementation resolves through **PMUs, *fitxes
 *     urbanístiques* and *plànols d'ordenació*** — the geometry is **distributed by design**, not
 *     centralised and mislaid.
 *
 * ⇒ `22@` joins clau 18 and `22a`: the law points elsewhere **on purpose**, and the only correct
 * output is a machine-readable reference to the governing instrument. Hence the refusal code is
 * `derived-plan` and `legallyGrounded: true` — a statement about the ORDINANCE, not about PRYZM's
 * coverage. (`no-rule-pack` would be false: the pack above exists and is transcribed in full.)
 *
 * ⚠ **AND THE REFUSAL PUBLISHES NO FIGURE.** The Art. 8.1 limits reach the user only through
 * `BCN_22ARROBA_ORDINANCE_REF` — a citation, checkable against the article — never as a bare digit
 * in the card's prose. The precedent is the Murcia pack, where transcribed figures leaked from a
 * classification `note` into a user-facing refusal and a test now pins them out; the same pin
 * exists here (`esBarcelona22ArrobaPack.test.ts`, §DEC-1 leak test). The article-NAME fields on
 * `BCN_22ARROBA_ART8_LIMITS` (`byRightArticle`, `maxCoverageArticle`, `minParcelArticle`,
 * `heightTableArticle`, `alignmentArticle`) exist precisely so the card can name what Art. 8.1
 * states without interpolating what it states it AS.
 */
export const BCN_22ARROBA_DEPTH_CLOSURE = {
    /** Closed, permanently. NOT "open pending evidence" and NOT "awaiting a founder call". */
    status: 'CLOSED — permanent cited refusal',
    decidedBy: 'founder',
    decidedOn: '2026-08-01',
    /** ⚠ The load-bearing finding: the silence is intentional, so more sourcing cannot close it. */
    omissionIsIntentional: true,
    /** The refusal code this closure mandates. `derived-plan`, and `legallyGrounded: true`. */
    refusalCode: 'derived-plan',
    /** Where the buildable geometry actually lives, per the founder's research. */
    governingGeometryLivesIn: Object.freeze([
        'Pla de Millora Urbana (PMU) approved for the ámbito',
        'fitxa urbanística',
        'plànols d’ordenació',
    ]),
    /** The searches that came back empty. Recorded so nobody repeats them. */
    exhaustedSources: Object.freeze([
        'BCNROC (municipal planning repository)',
        'the 2024 municipal *Instrucció* on 22@ interpretation',
        'the 2025 MPGM amendment',
        'implementation manuals / permit guidance / municipal CAD + GIS geometry — none exist',
    ]),
    /**
     * ⚠ THE ONLY THING THAT REOPENS THIS. Anything short of it — another read of the same MPGM,
     * another founder ruling on `art350_2bSupletory`, a "conservative" default depth — does not.
     */
    reopensIf:
        'A published CITY-WIDE geometric specification for 22@, or an official instruction ' +
        'converting PMU / ordering-plan geometry into a computable per-parcel depth.',
    /** ⚠ Unchanged by the closure: registering the pack is still forbidden. */
    stillNotRegistered: true,
    whyStillNotRegistered:
        'Registering would send 22@ through `computeBuildableEnvelope` with `geometricRule: null`, ' +
        'i.e. legacy per-edge inset over correctly-null setbacks — the WHOLE parcel drawn as ' +
        'buildable, on a card that simultaneously states a 70 % occupation cap. Self-contradicting ' +
        'AND over-stating (§L-616).',
} as const;

/**
 * The Barcelona *zona d'activitats 22@* pack — **Art. 8.1 by-right regime**.
 *
 * ⚠ NOT REGISTERED. See `BCN_22ARROBA_ENVELOPE_BLOCKER`. It is authored, schema-validated and
 * tested so the sourcing is captured, citable and impossible to redo by guesswork.
 *
 * ⚠ `<CITY>_ENVELOPE_VERIFIED`-style acceptance is NOT claimed here. Transcription is a legal act
 * and only the founder signs it (L-449). This file is a *signable* transcription, not a signed one.
 */
export const ES_BARCELONA_22ARROBA_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: 'es-08019-barcelona',
        displayName: 'Barcelona — Zona d’activitats 22@ (MPGM 22@BCN 2006, Art. 8.1 regime)',
        source: 'catastro-muc',
        crs: 'EPSG:4326',
        lastReviewed: '2026-07-31',
        // Never `certified`. The source is a re-typeset re-edition whose 2006 pages had to be read
        // from a raster, and the per-parcel figures are not certified against an MUC/RPUC fitxa.
        defaultConfidence: 'estimated-ruleset',
        zones: [
            {
                code: '22@',
                label: 'Zona d’activitats 22@ (Districte d’Activitats 22@BCN)',
                // Art. 8.1 attaches the by-right 2,2 to *"els usos industrials permesos a
                // l'article 6"* only. Art. 6.2 admits comercial / sanitari / religiós / cultural /
                // recreatiu / esportiu / residencial ONLY in the transformation actuacions of
                // Arts. 10, 16 and 17, and habitatge only in the three cases of Art. 6 (existing
                // dwellings, industrial-building reuse, transformation). Declaring `mixed` here
                // would grant by-right what the article grants only through a derived plan.
                permittedUse: ['industrial'],

                // ── Art. 8.1.b — a PER-STREET CONSTRUCTION, not a zone scalar. ────────────────
                // Writing a scalar here would publish one street's answer for the whole zone.
                // The table is `BCN_ALCADA_22ARROBA_TABLE`, reached via `resolveAlcada22Arroba`.
                maxHeight_m: null,
                maxFloors: null,

                // ── Art. 8.1 — *"s’ajustarà al coeficient d’edificabilitat per parcel·la de
                // 2,2 m² sostre/m² sòl"*. ────────────────────────────────────────────────────
                // ⚠ PER PARCEL and BY RIGHT — genuinely a parcel entitlement, unlike 13a (no FAR
                // at all, Art. 322.1) and 13b (1,80 gated to PERI / estudis de detall).
                // ⚠ NOT the same quantity as Art. 16.4.a's 2,2, which is over the ILLA.
                plotRatioFAR: 2.2,

                // ── Art. 8.1.f — *"Ocupació màxima de parcel·la: 70 %."* ──────────────────────
                // ⚠ A fraction of the PARCEL. NOT PGM Art. 350.2.b's 70 % of the BLOCK above the
                // ground floor, and NOT Art. 350.1.2n's 70 % parcel cap for *aïllada* sectors.
                // Three unrelated quantities share these digits across the articles 22@ is
                // subject to; conflating any two is the most likely wrong edit to this file.
                maxCoverage: 0.7,

                // ── Setbacks — NULL, not zero (C58 §1.7a). ────────────────────────────────────
                // Art. 8.1.a orders the zone *alineada a vial*: the façade sits ON the street
                // line and there is no honest front/side/rear triple. `null` makes the
                // containment check SKIP the edge; `0` would assert "the ordinance requires zero
                // clearance", which Art. 8 does not say.
                setbacks: { front_m: null, side_m: null, rear_m: null },

                // ── THE MOST IMPORTANT NULL IN THIS FILE. ────────────────────────────────────
                // Not "we did not get to it": no `GeometricRule` kind can be filled from Art. 8
                // without inventing a field the article does not state, and the one candidate
                // (Art. 350.2.b's band, supletory) turns on an UNRESOLVED legal reading that
                // decides the rule KIND. See `BCN_22ARROBA_ENVELOPE_BLOCKER` blocker 1.
                geometricRule: null,

                fieldProvenance: {
                    // `ordinance-pdf` — this IS the ordinance, read directly (via a raster render
                    // for the 2006 pages). Primary but not authenticated, so it drives the amber
                    // "verify against the ordinance" affordance, never a green chip.
                    maxFAR: 'ordinance-pdf',
                    maxCoverage: 'ordinance-pdf',
                    permittedUse: 'ordinance-pdf',
                },
                ordinanceRef: BCN_22ARROBA_ORDINANCE_REF,
            },
        ],
    });

/**
 * The zone codes this pack answers for.
 *
 * ⚠ **`22@` ONLY.** Not `22a` (PGM Art. 350 — `esBarcelonaIndustrial.ts`), not `7@` (the
 * equipament type Art. 4.1 creates, whose intensity is set facility-by-facility by a Pla Especial
 * under Art. 14.1), and no speculative variants. The MUC returns what it returns; a code we have
 * not seen is a code we must not claim to answer for.
 */
export const BCN_22ARROBA_ZONE_CODES = ['22@'] as const;
