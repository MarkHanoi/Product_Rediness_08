// MADRID CAPITAL — the municipal branch, and the honest limit of what it can say.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE FINDING THAT PRODUCED THIS FILE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The capital is **8.86 %** on `NM_ALTURA` against a **79.42 %** regional median — a nine-fold
// gap. Two readings were possible and they lead to opposite programmes:
//   (a) the parameters live in the CITY's own service, unprobed; or
//   (b) they are absent everywhere and the capital is simply thin.
//
// **(a) WAS TESTED BEFORE (b) WAS CONCLUDED**, at census scale, on 2026-08-02:
// `probe/00-capital-field-sweep.mjs` walked **41 folders · 447 services · 3,591 layers · 24,718
// fields** of `sigma.madrid.es` and scored every field name and alias against a parametric lexeme
// set deliberately wider than the obvious one — `profundidad` beside `fondo`, `retiro` beside
// `retranqueo` — because Málaga defines *profundidad edificable* and every prior Spanish depth
// probe searched `fondo` alone, and a field missed by VOCABULARY reads exactly like a field that
// does not exist.
//
//   ⛔ **`depth: 0`. `setback: 0`.** Not one field in 24,718 matches any depth or setback lexeme.
//   The 17 `height` and 77 `storeys` hits are trees, car-park levels, POI floor numbers and
//   cartographic label heights — not one is a planning parameter. 10 services were access-gated
//   (`499 Token Required`) and are recorded as UNKNOWN, never as absence.
//
// ⇒ **(b) IS THE ANSWER FOR HEIGHT, DEPTH AND SETBACKS.** The prior 6-service claim in
// `MADRID-DATA-RECON-SPIKE.md` §5 held, and it is now a census rather than a sample of the six
// places we happened to look.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ BUT THE SWEEP FOUND SOMETHING SIX PRIOR MADRID PASSES NEVER OPENED
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `ANALISIS_URBANO/Visor_Edificabilidad_enero_2026/MapServer/14` «Planeamiento Vigente» —
// **19,833 polygons, 92.62 km²**, carrying:
//
//   `UUBV_NM_ED`  a buildability QUANTITY — positive on **96.17 %** of rows
//   `UNI_TX_DEN`  ⭐ **ITS UNIT, STATED AS A COLUMN**
//   `AMB_TX_ETI`  the governing ámbito — Norma-Zonal codes AND development codes in ONE column
//   `USP_TX_DEN`  the use · `UBOV_TX_ET` the zone label · `ZURV_TX_NO` the *zona urbanística*
//
// ⚠⚠ **A UNIT COLUMN IS THE THING VALÈNCIA DIED FOR.** València's entire city is blocked because
// `altura` carries no published unit and no offset convention, the error is two-sided, and
// ADR-0287 forbids engineering around missing authority. Madrid states the unit per row. **That
// does not make the number usable — it makes it CHECKABLE**, and checking it is what this file does.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ AND CHECKING IT DISQUALIFIES 57.7 % OF THE ROWS, WHICH IS THE POINT
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The service describes itself as *«…la **edificabilidad disponible**»* — AVAILABLE buildability.
// `UNI_TX_DEN` is therefore a PROVENANCE column, not a unit in the physics sense. Measured over
// the 19,074 rows with `UUBV_NM_ED > 0`:
//
//   | `UNI_TX_DEN`   | rows  | share  | what it is | verdict |
//   |---|---:|---:|---|---|
//   | `m² Cat`       | 8,100 | 42.47 % | CATASTRO-derived — floorspace that EXISTS | ⛔ REFUSE |
//   | `m² Plan`      | 5,591 | 29.31 % | absolute floorspace FROM THE PLAN | ✅ accept |
//   | `m² Est`       | 2,888 | 15.14 % | the publisher's own ESTIMATE | ⛔ REFUSE |
//   | `m²/m² Plan`   | 2,321 | 12.17 % | a plot ratio FROM THE PLAN | ✅ accept |
//   | `m² Rev`       |   174 |  0.91 % | undocumented token | ⛔ REFUSE (unknown) |
//   | `m² Libre`     |    60 |  0.31 % | undocumented token | ⛔ REFUSE (unknown) |
//
// `m² Cat` is the same `not-the-rule-KIND` error as Murcia's `RB`/`RU` and València's
// protection-derived `altura`: a measurement of the built city read as a statement of what the
// plan ALLOWS (ADR-0270 — a wrong KIND, not a wrong number). `m² Est` has no article behind it and
// therefore cannot be cited, which C58 §1.3 requires of every published number.
//
// ⭐ **THE 57.7 % THIS DISCARDS IS 57.7 % PRYZM WOULD OTHERWISE HAVE PUBLISHED WRONGLY AND NEVER
// KNOWN.** Madrid is the first source in this dossier that labels its own provenance per row.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔⛔ AND THE DECISIVE LIMIT: THIS IS FLOORSPACE, NOT AN ENVELOPE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Joint census (`probe/02-unit-and-routing-crosstab.mjs`, server-side, no sampling):
//
//   routing   norma-zonal 59.52 % · development 40.29 % · unrecognised 0.19 %
//   ⭐ SURVIVORS (plan-sourced ∧ norma-zonal) = **2,005 rows · 10.51 % of rows · 18.85 % of area**
//      refused ROUTING 40.48 % · refused PROVENANCE 49.00 %
//
// ⚠ The marginals must NOT be multiplied — 96 % × 42 % assumes the provenance classes are spread
// evenly across ámbitos, and they are not. 10.51 % is a JOINT count.
//
// **A FAR OR A FLOORSPACE CAP IS NOT A SOLID.** With no height anywhere in 24,718 municipal fields
// and 8.86 % on the regional layer, an envelope cannot be drawn on ANY of these 2,005 parcels
// without inventing a storey height — and inventing one is the L-616 fabrication verbatim.
//
// ⇒ **THE CAPITAL YIELDS A CITED BUILDABLE-FLOORSPACE DETERMINATION AND NO ENVELOPE.** That is a
// real product answer — floorspace is the first number a developer asks for — and it is honestly
// NOT the thing the ENVELOPE axis scores. **The capital does not close for envelopes, and the
// proving municipality falls back to the periphery.** Said explicitly, per instruction: a labelled
// fallback is legitimate, a silent substitution is not.
//
// PURE. No I/O, no clock. Total, never throws.

import type { Refusal } from '../../packages/site-parcel-data/src/rulepacks/esMadridSpacmSchema.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE PROVENANCE VOCABULARY
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** What `UUBV_NM_ED` is, per the publisher's own `UNI_TX_DEN` token. */
export type CapitalQuantityKind =
    /** `m² Plan` — absolute buildable floorspace stated by the plan. */
    | 'floorspace-m2-plan'
    /** `m²/m² Plan` — a plot ratio stated by the plan. */
    | 'plot-ratio-plan'
    /** ⛔ `m² Cat` — floorspace measured from the CADASTRE. What EXISTS, not what is allowed. */
    | 'floorspace-m2-cadastral'
    /** ⛔ `m² Est` — the publisher's own estimate. No article behind it, so not citable. */
    | 'floorspace-m2-estimated'
    /** ⛔ Any other token. UNKNOWN — never defaulted, never coerced. */
    | 'unknown-token';

/**
 * Classify `UNI_TX_DEN`.
 *
 * ⚠ EXACT MATCHING ON THE PUBLISHER'S OWN SPELLING, superscript `²` included. A fuzzy match that
 * accepted `m2 Plan` would also accept a token the publisher introduces later and means something
 * else by — and the failure would be silent, on a number we then cite.
 */
export function classifyCapitalUnit(uniTxDen: string | null | undefined): CapitalQuantityKind {
    switch ((uniTxDen ?? '').trim()) {
        case 'm² Plan': return 'floorspace-m2-plan';
        case 'm²/m² Plan': return 'plot-ratio-plan';
        case 'm² Cat': return 'floorspace-m2-cadastral';
        case 'm² Est': return 'floorspace-m2-estimated';
        default: return 'unknown-token';
    }
}

/** Is this quantity PLAN-SOURCED, i.e. citable to the ordinance? Only two tokens are. */
export function isPlanSourced(kind: CapitalQuantityKind): boolean {
    return kind === 'floorspace-m2-plan' || kind === 'plot-ratio-plan';
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE ROW AND THE RESULT
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** One `ANALISIS_URBANO/Visor_Edificabilidad_enero_2026/MapServer/14` feature's attributes. */
export interface CapitalPlaneamientoRow {
    readonly OBJECTID?: unknown;
    readonly UBOV_TX_ET?: unknown;
    readonly USP_TX_DEN?: unknown;
    readonly UUBV_NM_ED?: unknown;
    readonly UNI_TX_DEN?: unknown;
    readonly AMB_TX_ETI?: unknown;
    readonly AMB_TX_DEN?: unknown;
    readonly ZURV_TX_NO?: unknown;
    readonly UBOV_SN_NZ?: unknown;
    readonly ['Shape.STArea()']?: unknown;
}

/**
 * What the capital can say about one *parcela urbanística*.
 *
 * ⚠ `envelope` is DELIBERATELY ABSENT FROM THIS TYPE. There is no field to put one in, because
 * there is no height to build one from, and a nullable field would invite a future author to fill
 * it with a storey assumption.
 */
export interface CapitalDetermination {
    readonly zoneLabel: string | null;
    readonly use: string | null;
    readonly ambito: string | null;
    readonly ambitoName: string | null;
    readonly area_m2: number | null;
    readonly quantity: number | null;
    readonly quantityKind: CapitalQuantityKind;
    /** ⭐ Buildable floorspace in m², where it is BOTH plan-sourced AND computable. Else null. */
    readonly buildableFloorspace_m2: number | null;
    /** How `buildableFloorspace_m2` was obtained, stated so it is never mistaken for measured. */
    readonly floorspaceBasis: 'stated-by-plan' | 'plot-ratio × published parcel area' | null;
    readonly refusals: readonly Refusal[];
    readonly provenance: {
        readonly source: string;
        readonly dataset: string;
        readonly recordId: string | number | null;
        readonly document: string;
        readonly fields: readonly string[];
    };
    /** ⚠ ALWAYS true today. No height exists at any granularity ⇒ no solid may be drawn. */
    readonly envelopeRefused: true;
}

const SOURCE = 'sigma.madrid.es/hosted/rest/services';
const DATASET = 'ANALISIS_URBANO/Visor_Edificabilidad_enero_2026/MapServer/14 «Planeamiento Vigente»';
const DOCUMENT = 'PGOUM-97 (Plan General de Ordenación Urbana de Madrid, BOE 19-04-1997) — '
    + 'ámbitos vigentes y edificabilidad disponible, municipal publication, vintage enero 2026';

const NORMA_ZONAL_CODE = /^\d+(\.\d+)*(\.[a-z])?$/;

const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
};

/**
 * Adapt one capital *parcela urbanística* row.
 *
 * ⛔ ALWAYS returns `envelopeRefused: true`. The floorspace determination and the envelope refusal
 * are BOTH returned, because they are different answers to different questions and a card that
 * showed only one would mislead in one of two directions.
 */
export function adaptCapitalRow(row: CapitalPlaneamientoRow): CapitalDetermination {
    const kind = classifyCapitalUnit(str(row.UNI_TX_DEN));
    const quantity = num(row.UUBV_NM_ED);
    const area = num(row['Shape.STArea()']);
    const ambito = str(row.AMB_TX_ETI);

    const refusals: Refusal[] = [];

    // ── ROUTING ──────────────────────────────────────────────────────────────────────────────
    // ⚠ `AMB_TX_ETI` mixes Norma-Zonal codes and development codes in ONE column, 664 distinct
    // values. Anything that is not a Norma-Zonal code is a development instrument or unreadable,
    // and neither may proceed on the base plan.
    if (ambito === null) {
        refusals.push({
            reason: 'routing-token-unrecognised', legallyGrounded: false,
            headline: 'This parcel carries no planning reference, so PRYZM cannot establish which '
                + 'document governs it.',
            ordinanceRef: null, retryable: false,
        });
    } else if (!NORMA_ZONAL_CODE.test(ambito)) {
        refusals.push({
            reason: 'development-ambito-governs', legallyGrounded: true,
            headline: `A development instrument «${ambito}»`
                + `${str(row.AMB_TX_DEN) ? ` (${str(row.AMB_TX_DEN)})` : ''} governs this parcel, `
                + 'not the base PGOUM. That instrument sets its own buildability and PRYZM does not '
                + 'hold it.',
            ordinanceRef: `PGOUM-97 — delegación a planeamiento de desarrollo, ámbito ${ambito}`,
            retryable: false,
        });
    }

    // ── PROVENANCE ───────────────────────────────────────────────────────────────────────────
    if (kind === 'floorspace-m2-cadastral') {
        refusals.push({
            reason: 'value-is-existing-derived', legallyGrounded: false,
            headline: 'The buildability figure published for this parcel is measured from the '
                + 'cadastre — it describes the building that EXISTS, not what the plan allows.',
            ordinanceRef: null, retryable: false,
        });
    } else if (kind === 'floorspace-m2-estimated') {
        refusals.push({
            reason: 'value-is-publisher-estimate', legallyGrounded: false,
            headline: 'The buildability figure published for this parcel is marked by the city as an '
                + 'estimate. PRYZM does not republish another body\'s estimate as a determination.',
            ordinanceRef: null, retryable: false,
        });
    } else if (kind === 'unknown-token') {
        refusals.push({
            reason: 'value-unit-undocumented', legallyGrounded: false,
            headline: `The unit of the buildability figure («${str(row.UNI_TX_DEN) ?? 'blank'}») is not `
                + 'documented, so PRYZM cannot tell what quantity it is.',
            ordinanceRef: null, retryable: false,
        });
    }

    // ⛔ `> 0` — a stored `0` on a buildability field is an absence wearing a number's clothes.
    // 759 of the 19,833 rows carry exactly that.
    if (quantity === null || quantity <= 0) {
        refusals.push({
            reason: 'required-parameter-unknown', legallyGrounded: false,
            headline: 'No positive buildability figure is published for this parcel.',
            ordinanceRef: null, retryable: false,
        });
    }

    // ── THE FLOORSPACE, where and only where everything above passed ─────────────────────────
    let floorspace: number | null = null;
    let basis: CapitalDetermination['floorspaceBasis'] = null;
    if (refusals.length === 0 && quantity !== null) {
        if (kind === 'floorspace-m2-plan') {
            floorspace = quantity;
            basis = 'stated-by-plan';
        } else if (kind === 'plot-ratio-plan' && area !== null && area > 0) {
            // ⚠ `Shape.STArea()` is the PLANNING polygon's area in EPSG:25830 metres — the
            // *parcela urbanística*, which is NOT necessarily the cadastral parcel. The basis
            // string says so, because a figure whose denominator is misunderstood is worse than
            // no figure (L-656: state the denominator every time).
            floorspace = quantity * area;
            basis = 'plot-ratio × published parcel area';
        } else if (kind === 'plot-ratio-plan') {
            refusals.push({
                reason: 'required-parameter-unknown', legallyGrounded: false,
                headline: 'A plot ratio is published for this parcel but its area is not, so the '
                    + 'buildable floorspace cannot be computed.',
                ordinanceRef: null, retryable: false,
            });
        }
    }

    // ── ⛔ THE ENVELOPE REFUSAL — unconditional, and it is the honest headline ────────────────
    refusals.push({
        reason: 'required-parameter-unknown',
        legallyGrounded: false,
        headline: 'PRYZM cannot draw a buildable volume for this Madrid parcel: no maximum height '
            + 'or storey count is published for it anywhere. A buildable floor area is published '
            + 'and is shown; how tall the building may be is not, and PRYZM will not assume it.',
        ordinanceRef: null,
        retryable: false,
    });

    return {
        zoneLabel: str(row.UBOV_TX_ET),
        use: str(row.USP_TX_DEN),
        ambito,
        ambitoName: str(row.AMB_TX_DEN),
        area_m2: area,
        quantity,
        quantityKind: kind,
        buildableFloorspace_m2: floorspace,
        floorspaceBasis: basis,
        refusals,
        provenance: {
            source: SOURCE,
            dataset: DATASET,
            recordId: (row.OBJECTID as string | number | undefined) ?? null,
            document: DOCUMENT,
            fields: ['UBOV_TX_ET', 'USP_TX_DEN', 'UUBV_NM_ED', 'UNI_TX_DEN', 'AMB_TX_ETI',
                'AMB_TX_DEN', 'Shape.STArea()'],
        },
        envelopeRefused: true,
    };
}

/**
 * ⭐ The joint measurement, as data so a test can pin it and a report cannot drift from it.
 * Source: `out/02-unit-and-routing-crosstab.json`, server-side census, 2026-08-02.
 */
export const CAPITAL_MEASURED_2026_08_02 = {
    measuredAt: '2026-08-02',
    service: DATASET,
    /** Rows with `UUBV_NM_ED > 0`. The denominator of every share below. */
    denominatorRows: 19074,
    denominatorAreaKm2: 92.62,
    routing: { normaZonalPct: 59.52, developmentPct: 40.29, unrecognisedPct: 0.19 },
    provenance: {
        cadastralPct: 42.47, planAbsolutePct: 29.31, estimatedPct: 15.14,
        planRatioPct: 12.17, revisionPct: 0.91,
    },
    /** ⭐ Plan-sourced ∧ norma-zonal. A JOINT count — never the product of the marginals. */
    survivorRows: 2005,
    survivorPctOfRows: 10.51,
    survivorPctOfArea: 18.85,
    refusedRoutingPct: 40.48,
    refusedProvenancePct: 49.0,
    /** ⛔ Zero, and it is the whole point: a floorspace cap is not a solid. */
    drawableEnvelopePct: 0,
    /** The municipal field census that closed hypothesis (a). */
    municipalFieldSweep: {
        folders: 41, services: 447, layers: 3591, fields: 24718,
        accessGatedServices: 10,
        depthFieldHits: 0, setbackFieldHits: 0,
        planningHeightFieldHits: 0,
    },
} as const;
