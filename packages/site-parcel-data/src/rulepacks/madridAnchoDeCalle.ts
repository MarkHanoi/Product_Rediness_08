// Madrid (INE 28079) PGOUM-97 — the *ancho de calle* → altura tables.
//
// WHY THIS EXISTS, AND WHY IT IS A SEPARATE MODULE FROM THE PACK
// -------------------------------------------------------------
// Three Madrid Normas Zonales do NOT state a maximum height at all. They state a TABLE keyed on
// the width of the street the façade fronts, and the height falls out of which band that street
// sits in. So `esMadridPgoum97.ts` correctly ships `maxHeight_m: null` / `maxFloors: null` on
// those zones, and this module is what a future resolver reads to fill them.
//
// This is structurally the SAME problem as Barcelona's *amplada de vial* (`bcnAlcadaReguladora.ts`,
// PGM Art. 327.2) and it is deliberately modelled the same way — including the refusal. What it is
// NOT is a copy of Barcelona's NUMBERS: the bands, the storey counts and the cornice heights below
// are Madrid's own, read from the Compendio 2025 de las NNUU del PGOUM-97 (24-09-2025), and the
// two cities' tables agree on nothing except that both exist.
//
// ⚠⚠ THE INPUT IS THE DANGEROUS PART — READ BEFORE FEEDING THIS A MEASURED WIDTH
// ------------------------------------------------------------------------------
// The PGOUM keys on the *ancho de calle* **measured on the vertical through the midpoint of the
// façade line**, by the criteria of Capítulo 8.4 (Art. 8.1.10, PDF p. 373: *"La medición del ancho
// de calle se realizará con los mismos criterios que para tal fin están previstos en el Capítulo
// 8.4 de este mismo Título."*). That is a LEGAL measurement rule, not "the gap between the
// buildings". PRYZM has no municipal declared-width layer for Madrid — the L-537 national probe
// found NO Spanish municipality publishing one machine-readably — so any width fed here is an
// inference, and the bands are STEPS: crossing the 12 m edge moves NZ 4 from 3 plantas / 11,50 m
// to 4 plantas / 15,00 m, a whole storey and 3,50 m.
//
// So this module REFUSES near a band edge rather than let measurement noise choose the storey.
// A refusal costs an absent height (the caller shows no constructed height and says why); a guess
// costs a confidently wrong building. Same asymmetry, same reasoning, as `bcnAlcadaReguladora.ts`.
//
// ⚠ AND THE THREE TABLES ARE NOT INTERCHANGEABLE. They have different band edges AND different
// tops. Applying NZ 4's table to an NZ 9 parcel silently grants a 6th storey the NZ 9 chapter never
// gives; applying either to NZ 1 grado 6º publishes a cornice height Capítulo 8.1 does not state
// at all. Each table therefore carries its own citation and its own `appliesToZoneCodes`.
//
// PROVENANCE: every row was machine-extracted (LLM read of the born-digital Compendio 2025 text
// layer, `tools/madrid-extract/`) with the article, apartado, PDF page and verbatim row preserved
// in `docs/04-reference/jurisdictions/es/es-md/28079-madrid/extracted/nz{1,4,9}.json`. It has NOT
// been human-verified against the source — its honest tier is `pipeline-extracted-unverified`
// (see `esMadridPgoum97.ts` and the human gate in `sources/VERIFICATION.md`).
//
// PURE + deterministic (C58 §1.1/§1.9): no I/O, no THREE, no DOM, no clock. The only runtime
// surface is the OTel span (P8; default no-op tracer performs no I/O).
//
// Strategic context: C58 §1.2/§1.4/§1.11, ADR-0270, L-525a/L-526 (the Barcelona precedent),
// docs/04-reference/jurisdictions/es/es-md/28079-madrid/findings/COMPENDIO-2025-EXTRACTION-01.md.

import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning.es.madrid');

/**
 * One row of a PGOUM *cuadro de relación ancho de calle / altura*.
 *
 * ⚠ `height_m` is NULLABLE and the nullability is load-bearing: NZ 1 grado 6º's table
 * (Art. 8.1.10.3.f.ii) gives a STOREY COUNT ONLY — Capítulo 8.1 states no cornice height in metres
 * for that grado. A `0` there would read as "no height permitted"; a borrowed metre figure from
 * NZ 4 would be a number the chapter does not contain.
 */
export interface MadridAnchoBand {
    /** INCLUSIVE lower bound of the *ancho de calle* band, metres. */
    readonly minWidth_m: number;
    /** EXCLUSIVE upper bound, metres. `Infinity` on the top band. */
    readonly maxWidth_m: number;
    /** *Altura de cornisa*, metres — or `null` where the chapter states only a storey count. */
    readonly height_m: number | null;
    /**
     * *Número de plantas*. Counted ABOVE the *cota de origen y referencia*, **planta baja
     * INCLUDED** (Art. 6.6.7). ⚠ NOT the Barcelona "PB+N" convention: `3` here means 3 storeys
     * IN TOTAL, not a ground floor plus three.
     */
    readonly floors: number;
    /** The band's own verbatim row, as printed in the Compendio. */
    readonly verbatim: string;
}

/** A whole cuadro, with the citation that makes each of its rows quotable. */
export interface MadridAnchoTable {
    /** Stable handle, for logs and derivation rows. */
    readonly id: 'nz4' | 'nz9-g1g2' | 'nz1-g6';
    /** The `AMB_TX_ETIQ` zone codes this table governs — and ONLY these. */
    readonly appliesToZoneCodes: ReadonlyArray<string>;
    readonly articulo: string;
    readonly apartado: string;
    /** Page in the Compendio 2025 PDF, and the printed page number on the sheet. */
    readonly pdfPage: number;
    readonly printedPage: number;
    /**
     * WHICH height the metre column is. ⚠ `cornisa` and `coronación` are different quantities with
     * the same units (Arts. 6.6.5/6.6.6) and NZ 5's 51 m is a *coronación* figure — never compare
     * it with these. `null` where the table states no metre column at all.
     */
    readonly heightMeasured: 'cornisa' | null;
    /**
     * The datum the metre column is measured from — *rasante de la acera en el punto medio de la
     * línea de fachada* (Arts. 6.6.8.6.a / 6.3.5.c). Recorded because a height without its datum is
     * not a height (§terrain-rasant-is-a-legal-defect / L-584).
     */
    readonly referencePlane: string;
    readonly bands: ReadonlyArray<MadridAnchoBand>;
}

/**
 * **NZ 4 — Edificación en manzana cerrada.** Art. 8.4.10, *cuadro de relación*, PDF p. 415
 * (printed 413). Four bands, top open at 24 m.
 */
export const MADRID_NZ4_ANCHO_TABLE: MadridAnchoTable = Object.freeze({
    id: 'nz4',
    appliesToZoneCodes: Object.freeze(['4']) as ReadonlyArray<string>,
    articulo: '8.4.10',
    apartado: 'cuadro de relación ancho de calle / nº de plantas / altura de cornisa',
    pdfPage: 415,
    printedPage: 413,
    heightMeasured: 'cornisa',
    referencePlane: 'rasante de la acera en el punto medio de la línea de fachada (Arts. 6.6.8.6.a / 6.3.5.c)',
    bands: Object.freeze([
        { minWidth_m: 0, maxWidth_m: 12, height_m: 11.5, floors: 3, verbatim: 'Menos de 12 | 3 | 11,50' },
        { minWidth_m: 12, maxWidth_m: 18, height_m: 15.0, floors: 4, verbatim: 'De 12 a menos de 18 | 4 | 15,00' },
        { minWidth_m: 18, maxWidth_m: 24, height_m: 18.5, floors: 5, verbatim: 'De 18 a menos de 24 | 5 | 18,50' },
        { minWidth_m: 24, maxWidth_m: Infinity, height_m: 21.5, floors: 6, verbatim: 'De 24 en adelante | 6 | 21,50' },
    ]) as ReadonlyArray<MadridAnchoBand>,
});

/**
 * **NZ 9 grados 1º y 2º — Edificación industrial (entre medianeras).** Art. 8.9.10 ap. 1,
 * PDF p. 454 (printed 452).
 *
 * ⚠ THREE bands, not four: NZ 9's table STOPS at *"A partir de 18"* → 5 plantas / 18,50 m. It has
 * no 24 m band and no 6th storey. Substituting NZ 4's table here would invent one.
 */
export const MADRID_NZ9_ANCHO_TABLE: MadridAnchoTable = Object.freeze({
    id: 'nz9-g1g2',
    appliesToZoneCodes: Object.freeze(['9.1', '9.2']) as ReadonlyArray<string>,
    articulo: '8.9.10',
    apartado: '1',
    pdfPage: 454,
    printedPage: 452,
    heightMeasured: 'cornisa',
    referencePlane: 'rasante de la acera en el punto medio de la línea de fachada (Arts. 6.6.8.6.a / 6.3.5.c)',
    bands: Object.freeze([
        { minWidth_m: 0, maxWidth_m: 12, height_m: 11.5, floors: 3, verbatim: 'Menos de 12 | 3 | 11,50' },
        { minWidth_m: 12, maxWidth_m: 18, height_m: 15.0, floors: 4, verbatim: 'De 12 a menos de 18 | 4 | 15,00' },
        { minWidth_m: 18, maxWidth_m: Infinity, height_m: 18.5, floors: 5, verbatim: 'A partir de 18 | 5 | 18,50' },
    ]) as ReadonlyArray<MadridAnchoBand>,
});

/**
 * **NZ 1 grado 6º — Protección del Patrimonio Histórico.** Art. 8.1.10 ap. 3.f)ii), PDF p. 372
 * (printed 370), applied to height by Art. 8.1.15 ap. 1.
 *
 * ⚠⚠ **STOREY COUNTS ONLY — `height_m` IS NULL ON EVERY ROW, AND THAT IS THE FINDING.** The
 * numbers in this cuadro are the *coeficiente Z*, and Art. 8.1.15.1 says that in grado 6º **and
 * only in grado 6º** the storey count coincides with Z. Capítulo 8.1 states NO cornice height in
 * metres for it. Grados 1º–5º get no table at all: their height is fixed case by case by the
 * CPPHAN (Art. 8.1.15.1) and is a discretionary determination, not a rule to encode.
 *
 * ⚠ THIS TABLE HAS FIVE BANDS AND ITS FIRST EDGE IS AT **7 m**, not 12 m. Its band structure is
 * unique among the three.
 *
 * ⚠ **NOT WIRED, AND MUST NOT BE WIRED HERE.** Norma Zonal 1 is modelled as an `explicit-area`
 * zone by `esMadridNZ1.ts` — its buildable footprint is PUBLISHED AS GEOMETRY (Fondo de la
 * Edificación + COEF_Z per manzana), a settled decision. This table is recorded so the grado-6º
 * storey rule is not lost, NOT as an invitation to re-derive NZ 1 from parameters.
 */
export const MADRID_NZ1_G6_ANCHO_TABLE: MadridAnchoTable = Object.freeze({
    id: 'nz1-g6',
    appliesToZoneCodes: Object.freeze(['1.6']) as ReadonlyArray<string>,
    articulo: '8.1.10',
    apartado: '3.f)ii) (applied to height by Art. 8.1.15 ap. 1)',
    pdfPage: 372,
    printedPage: 370,
    heightMeasured: null,
    referencePlane: 'rasante de la acera en el punto medio de la línea de fachada (Arts. 6.6.8.6.a / 6.3.5.c)',
    bands: Object.freeze([
        { minWidth_m: 0, maxWidth_m: 7, height_m: null, floors: 3, verbatim: 'Menos de 7 metros | Z = 3' },
        { minWidth_m: 7, maxWidth_m: 12, height_m: null, floors: 4, verbatim: 'De 7 metros a menos de 12 | Z = 4' },
        { minWidth_m: 12, maxWidth_m: 18, height_m: null, floors: 5, verbatim: 'De 12 metros a menos de 18 | Z = 5' },
        { minWidth_m: 18, maxWidth_m: 24, height_m: null, floors: 6, verbatim: 'De 18 metros a menos de 24 | Z = 6' },
        { minWidth_m: 24, maxWidth_m: Infinity, height_m: null, floors: 7, verbatim: 'De 24 metros en adelante | Z = 7' },
    ]) as ReadonlyArray<MadridAnchoBand>,
});

/** Every table this module publishes, so a caller (or a test) can iterate them all. */
export const MADRID_ANCHO_TABLES: ReadonlyArray<MadridAnchoTable> = Object.freeze([
    MADRID_NZ4_ANCHO_TABLE,
    MADRID_NZ9_ANCHO_TABLE,
    MADRID_NZ1_G6_ANCHO_TABLE,
]);

/**
 * How close to a band edge (metres) counts as TOO CLOSE to decide from a MEASURED width.
 *
 * 0.5 m, for the same reason `BAND_EDGE_GUARD_M` is 0.5 m in Barcelona: it prices the substitution
 * of a GIS-measured frontage gap for the legally-declared *ancho de calle* it stands in for.
 * Cadastral geometry is decimetric at best. Half a metre is comfortably inside the narrowest
 * Madrid band (5 m, the NZ 1 grado 6º 7–12 m row) so a guard can never swallow a band whole, and
 * comfortably outside plausible cadastral noise.
 *
 * ⚠ It is a FLOOR, not the whole error — see `madridEffectiveBandEdgeGuard_m`.
 */
export const MADRID_BAND_EDGE_GUARD_M = 0.5;

/**
 * §L-586's lesson, applied to Madrid: the substitution allowance above says nothing about how
 * noisy THIS measurement was. A measurement carries its own error bar (`spread_m`), and when that
 * exceeds the allowance it — not the measurement — is what would choose the storey band. So the
 * effective guard is `max(MADRID_BAND_EDGE_GUARD_M, spread_m)`. It can only ever WIDEN.
 */
export function madridEffectiveBandEdgeGuard_m(measurementSpread_m?: number | null): number {
    const span = tracer.startSpan('pryzm.zoning.es.madrid.effectiveBandEdgeGuard');
    try {
        const wider =
            typeof measurementSpread_m === 'number' &&
            Number.isFinite(measurementSpread_m) &&
            measurementSpread_m > MADRID_BAND_EDGE_GUARD_M;
        span.setAttribute('pryzm.madrid.guard.widened', wider);
        return wider ? (measurementSpread_m as number) : MADRID_BAND_EDGE_GUARD_M;
    } finally {
        span.end();
    }
}

export type MadridAlturaResolution =
    | {
          readonly ok: true;
          /** `null` on the NZ 1 grado 6º table, which states storeys only. NEVER 0. */
          readonly height_m: number | null;
          readonly floors: number;
          readonly band: MadridAnchoBand;
          readonly table: MadridAnchoTable;
      }
    | {
          readonly ok: false;
          /**
           * `band-edge`  — the width sits within the effective guard of a band boundary, so a
           *                measured value cannot choose the storey band. Needs the declared
           *                *ancho de calle*, which Madrid does not publish machine-readably.
           * `bad-input`  — not a usable positive finite width.
           * `zone-mismatch` — the table does not govern the zone code passed. A hard refusal, not
           *                a silent answer from the wrong chapter: NZ 4's table has a 6th storey
           *                NZ 9 never grants.
           */
          readonly reason: 'band-edge' | 'bad-input' | 'zone-mismatch';
          /** The candidate storey counts straddling the edge, for an honest "we cannot say". */
          readonly straddles: ReadonlyArray<number>;
      };

/**
 * Resolve a PGOUM *altura* from an *ancho de calle*.
 *
 * PURE, deterministic, never throws. Returns `ok: false` rather than a number whenever the input
 * cannot legitimately decide the answer — see the header on why refusing beats guessing here.
 *
 * P8 — emits `pryzm.zoning.es.madrid.resolveAlturaPorAnchoDeCalle`.
 *
 * @param table    the cuadro for the parcel's Norma Zonal. Pass the zone's OWN table.
 * @param ancho_m  the *ancho de calle* in metres, measured on the vertical through the midpoint of
 *                 the façade line (Art. 8.1.10 → Capítulo 8.4 criteria).
 * @param opts.zoneCode  when supplied, asserted against `table.appliesToZoneCodes`. Pass it.
 * @param opts.trustedDeclaredWidth  TRUE only for a width from a declared municipal source — none
 *                 exists for Madrid today, so this is reserved, not a convenience.
 * @param opts.measurementSpread_m  the measurement's own error bar; widens the guard, never
 *                 narrows it.
 */
export function resolveMadridAlturaPorAnchoDeCalle(
    table: MadridAnchoTable,
    ancho_m: number,
    opts: {
        readonly zoneCode?: string | null;
        readonly trustedDeclaredWidth?: boolean;
        readonly measurementSpread_m?: number | null;
    } = {},
): MadridAlturaResolution {
    const span = tracer.startSpan('pryzm.zoning.es.madrid.resolveAlturaPorAnchoDeCalle');
    try {
        span.setAttribute('pryzm.madrid.table', table.id);

        if (typeof opts.zoneCode === 'string' && opts.zoneCode.length > 0) {
            span.setAttribute('pryzm.madrid.zoneCode', opts.zoneCode);
            if (!table.appliesToZoneCodes.includes(opts.zoneCode)) {
                span.setAttribute('pryzm.madrid.refusal', 'zone-mismatch');
                return { ok: false, reason: 'zone-mismatch', straddles: [] };
            }
        }

        if (typeof ancho_m !== 'number' || !Number.isFinite(ancho_m) || ancho_m <= 0) {
            span.setAttribute('pryzm.madrid.refusal', 'bad-input');
            return { ok: false, reason: 'bad-input', straddles: [] };
        }

        const bandFor = (w: number): MadridAnchoBand =>
            table.bands.find((b) => w >= b.minWidth_m && w < b.maxWidth_m) ??
            table.bands[table.bands.length - 1]!;

        if (!opts.trustedDeclaredWidth) {
            const guard = madridEffectiveBandEdgeGuard_m(opts.measurementSpread_m);
            const low = bandFor(Math.max(Number.EPSILON, ancho_m - guard));
            const high = bandFor(ancho_m + guard);
            if (low.floors !== high.floors) {
                span.setAttribute('pryzm.madrid.refusal', 'band-edge');
                return { ok: false, reason: 'band-edge', straddles: [low.floors, high.floors] };
            }
        }

        const band = bandFor(ancho_m);
        span.setAttribute('pryzm.madrid.floors', band.floors);
        return { ok: true, height_m: band.height_m, floors: band.floors, band, table };
    } finally {
        span.end();
    }
}
