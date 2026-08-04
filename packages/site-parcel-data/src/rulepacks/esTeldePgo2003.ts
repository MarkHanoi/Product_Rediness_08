// ── TELDE (INE 35026, Gran Canaria) — PGO 2003, adaptación PLENA. The Canarias PILOT pack. ──
//
// ⚠⚠ REGISTERED-AND-REFUSING. `CANARIAS_ENVELOPE_VERIFIED` is `false` with `signature: null`, so
// every zone below renders a CITED REFUSAL and NO number reaches the panel or the massing. The
// pack exists so that the ONLY missing thing is a human signature. See `esCanariasSipu.ts`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// PROVENANCE — READ BEFORE TRUSTING A DIGIT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Every value here was read from ONE source: the `EDIF` table of `EDIF.mdb` inside
// `030319-pgo-ad-itpu-150323-210504-sipu.zip`, the Gobierno de Canarias' own SIPU package for
// Telde's Aprobación Definitiva (adaptación PLENA, 2003), served from `opendata.sitcan.es`.
//
// ⭐ THIS IS **STRUCTURED PUBLISHED DATA**, NOT AN OCR PIPELINE AND NOT A PDF TRANSCRIPTION. The
// numbers are the publisher's own typed column values. That is a materially better provenance
// than Córdoba's `pipeline-extracted` — but it is STILL NOT human-verified against the *Normas
// Urbanísticas* those columns claim to summarise, and the SIPU package ships that PDF UNREAD.
// So `defaultConfidence` is `estimated-ruleset`, one tier below a read-and-signed ordinance, and
// `fieldProvenance` is `'published-structured'` where the enum allows it.
//
// ⭐⭐ THE ROW ITSELF CITES THE ARTICLE. Telde's `Obs*` columns carry, verbatim, "Art.225.
// Ordenanzas Municipales.", "Art.229. Ordenanzas Municipales.", "Art.141. Plan Estructural." …
// per parameter. So each zone below can name the governing article WITHOUT PRYZM having read the
// plan — the publisher supplied the citation alongside the number. That is unusual and it is why
// `ordinanceRef` is populated on every zone.
//
// ⚠ AND THE SAME COLUMNS CARRY A CONDITION. A non-empty `Obs*` means the parameter MAY BE
// CONDITIONAL, so a zone whose `Obs*` says more than a bare article reference is PARTIAL, never
// complete. Telde's B1/B2 `ObsPMO` reads "Art.226 … Coeficiente de ocupación, 1" — which happens
// to CONFIRM the 100 % coverage rather than qualify it; H and I carry real qualifications and are
// flagged at their entries.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT IS PACKED, AND WHAT IS DELIBERATELY REFUSED
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The Telde EDIF table has 46 rows. 31 carry a drawable rule. Packed here:
//
//  SETBACK (kind:'setback')            E · E1P · F · H · K1 · CO-UN1 · CO-UN2 · CO-PA1 · CO-PA2
//                                      CO-SI · CO-PL · CO-SER1 · CO-SER2 · IN · IS · ST · IM
//  ALIGNMENT+DEPTH (kind:'alignment')  G  (DispObl='AV', fondo 14 m)
//                                      R1 · R2 · R3 · R4 · AG  (DispObl='F' + a metric DispOblm
//                                      façade line, fondo 15 m)
//  OCCUPATION (coverage only)          B1 · B2 · K2
//
// ⛔ REFUSED, WITH THE REASON IN THE DATA — these rows are NOT packed, so they fall to a cited
// refusal rather than to a null-setback inset that would draw the WHOLE PARCEL (the L-616
// mechanism-A failure, and the single most dangerous way to "finish" this file):
//   • D1 · D2 — `DispObl = 'GRF'`. The building line is ON A PLAN SHEET. A 16 m fondo is
//     published, but PRYZM does not hold the line it is measured FROM. Substituting the cadastral
//     edge would draw a different building. → `canariasGraphedRefusal`.
//   • C — a 21 m fondo with NO alignment token at all: the datum EDGE is unknown.
//   • A1 · A2 · A3 · A4 · A5 — FAR + height only. ⛔ FAR ALONE DOES NOT DRAW (Lever 3): with no
//     setback, no coverage and no depth there is no footprint rule, and an envelope built from
//     FAR alone silently occupies the entire plot.
//   • J (Equipamientos), CO-H1, CO-H2, CO, SO, SUSO-1-3b, INDEF, T1, T2, EA, H-SUSO-1-3-5 —
//     no footprint rule, or no rule at all.
//
// PURITY: L2-pure. Zod-parsed at module load so a malformed entry is a LOAD failure, not a
// silent compliance error.
//
// Strategic context — ADR-0283, ADR-0270/0271, C58 §1.4/§1.6/§1.7a/§1.11, L-449, L-616.

import {
    type JurisdictionZoningContract,
    JurisdictionZoningContractSchema,
} from '@pryzm/schemas';
import { TELDE_JURISDICTION_ID } from './esCanariasSipu.js';

/** The one source string every `ordinanceRef` ends with, so a reader can retrieve it. */
const SRC =
    'Source: Gobierno de Canarias SIPU package 030319-pgo-ad-itpu-150323-210504-sipu ' +
    '(EDIF.mdb, tabla EDIF), opendata.sitcan.es. Article citation supplied by the publisher in ' +
    'the row’s own Obs* column.';

/**
 * ⚠ `estimated-ruleset`, NOT higher — and the reason matters.
 *
 * The numbers are PUBLISHED STRUCTURED DATA (the publisher's typed columns), which is stronger
 * than an OCR read. But nobody has checked those columns against the *Normas Urbanísticas* they
 * summarise, and the dominant sentinel `'I'` in this schema has an UNKNOWN meaning region-wide.
 * Claiming a tier that implies a verified ordinance reading would be exactly the C58 §1.11
 * failure: a fact about the wrong THING, presented with the confidence of the right one.
 */
export const TELDE_INTENDED_DEFAULT_CONFIDENCE = 'estimated-ruleset' as const;

/** Per-field provenance used on every packed value. */
const P = 'ordinance-pdf' as const;

const prov = (...keys: readonly string[]): Record<string, typeof P> =>
    Object.fromEntries(keys.map((k) => [k, P]));

/**
 * The Telde PGO-2003 pack.
 *
 * `source:'manual'` — a curated artefact. ⚠ The `ZoningPackSource` enum has no `sipu` member and
 * this file does NOT add one: widening a shared schema enum from a pilot pack is how a
 * jurisdiction-specific assumption becomes a platform-wide one. `crs` is the SIPU polygon layer's
 * own projection, so an area computed from it is metres and not degrees.
 */
export const ES_TELDE_PGO2003_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: TELDE_JURISDICTION_ID,
        displayName: 'Telde — PGO 2003 (adaptación plena), SIPU EDIF',
        source: 'manual',
        crs: 'EPSG:32628',
        lastReviewed: '2026-08-02',
        defaultConfidence: TELDE_INTENDED_DEFAULT_CONFIDENCE,
        zones: [
            // ══ SETBACK GRAMMAR — per-edge inset. The engine PRYZM already has. ══════════════
            {
                code: 'E',
                label:
                    'Ciudad jardín, edificación residencial unifamiliar aislada. Ordenanza E',
                permittedUse: ['residential'],
                maxHeight_m: 7.5, // AltMaxMP — datum: PARCEL
                maxFloors: 2,
                plotRatioFAR: 0.6,
                maxCoverage: 0.4,
                setbacks: { front_m: 5, side_m: 2, rear_m: 5 },
                fieldProvenance: prov(
                    'maxHeight',
                    'maxFloors',
                    'maxFAR',
                    'maxCoverage',
                    'setback.front',
                    'setback.side',
                    'setback.rear',
                    'permittedUse',
                ),
                ordinanceRef:
                    'PGO Telde Art. 229 Ordenanzas Municipales — SupMin 250 m², SepMinFr 5 m, ' +
                    'SepMinLt 2 m, SepMinPs 5 m, PMaxOcup 40 %, EdifMax 0,60, AltMaxPl 2, ' +
                    'AltMaxMP 7,50 m (datum: PARCELA). ' + SRC,
                geometricRule: { kind: 'setback', front_m: 5, side_m: 2, rear_m: 5 },
            },
            {
                code: 'E1P',
                label:
                    'Ciudad jardín, edificación residencial unifamiliar aislada (grado 1P). ' +
                    'Ordenanza E',
                permittedUse: ['residential'],
                maxHeight_m: 4.3,
                maxFloors: 1,
                plotRatioFAR: 0.4,
                maxCoverage: 0.4,
                setbacks: { front_m: 5, side_m: 2, rear_m: 5 },
                fieldProvenance: prov(
                    'maxHeight',
                    'maxFloors',
                    'maxFAR',
                    'maxCoverage',
                    'setback.front',
                    'setback.side',
                    'setback.rear',
                    'permittedUse',
                ),
                ordinanceRef:
                    'PGO Telde Art. 229 Ordenanzas Municipales — SupMin 300 m², PMaxOcup 40 %, ' +
                    'EdifMax 0,40, AltMaxPl 1, AltMaxMP 4,30 m (datum: PARCELA). ' + SRC,
                geometricRule: { kind: 'setback', front_m: 5, side_m: 2, rear_m: 5 },
            },
            {
                code: 'F',
                label:
                    'Ciudad jardín, edificación residencial unifamiliar entre medianeras. ' +
                    'Ordenanza F',
                permittedUse: ['residential'],
                maxHeight_m: 7.5,
                maxFloors: 2,
                plotRatioFAR: 1.0,
                maxCoverage: 0.6,
                // ⚠ `SepMinLt` is a SENTINEL for this zone, and the zone name says *entre
                // medianeras* — party walls. So side = 0 is the ORDINANCE, read from the
                // typology, not a null coerced to zero. Recorded explicitly because a silent
                // 0 here would be indistinguishable from an unknown.
                setbacks: { front_m: 3, side_m: 0, rear_m: 3 },
                fieldProvenance: prov(
                    'maxHeight',
                    'maxFloors',
                    'maxFAR',
                    'maxCoverage',
                    'setback.front',
                    'setback.rear',
                    'permittedUse',
                ),
                ordinanceRef:
                    'PGO Telde Art. 230 Ordenanzas Municipales — SupMin 200 m², SepMinFr 3 m, ' +
                    'SepMinPs 3 m, PMaxOcup 60 %, EdifMax 1,00, AltMaxPl 2, AltMaxMP 7,50 m ' +
                    '(datum: PARCELA). Side = 0 from the *entre medianeras* typology, NOT from ' +
                    'a null. ' + SRC,
                geometricRule: { kind: 'setback', front_m: 3, side_m: 0, rear_m: 3 },
            },
            {
                code: 'H',
                label: 'Polígono industrial, edificación aislada de uso industrial. Ordenanza H',
                permittedUse: ['industrial'],
                maxHeight_m: 15,
                maxFloors: 3,
                plotRatioFAR: 1.0,
                maxCoverage: null, // ⚠ PMaxOcup is a SENTINEL here. UNKNOWN, never 100 %.
                setbacks: { front_m: 5, side_m: 5, rear_m: 5 },
                fieldProvenance: prov(
                    'maxHeight',
                    'maxFloors',
                    'maxFAR',
                    'setback.front',
                    'setback.side',
                    'setback.rear',
                    'permittedUse',
                ),
                ordinanceRef:
                    'PGO Telde Art. 232 Ordenanzas Municipales — SupMin 1 000 m², SepMin 5 m ' +
                    'todas las caras, EdifMax 1,00, AltMaxPl 3, AltMaxMP 15,00 m (datum: ' +
                    'PARCELA). ⚠ ObsAMPl carries a qualification ("Dadas las especiales ' +
                    'condic…") — the height MAY BE CONDITIONAL, so this zone is PARTIAL. ' + SRC,
                geometricRule: { kind: 'setback', front_m: 5, side_m: 5, rear_m: 5 },
            },
            {
                code: 'K1',
                label: 'Edificación de uso comercial, grado 1. Ordenanza K',
                permittedUse: ['commercial'],
                maxHeight_m: 9.5,
                maxFloors: 3,
                plotRatioFAR: 1.5,
                maxCoverage: 0.75,
                // ⚠ only SepMinFr is published. side/rear are SENTINEL ⇒ UNKNOWN ⇒ null, which
                // the engine must treat as unresolved rather than as 0.
                setbacks: { front_m: 5, side_m: null, rear_m: null },
                fieldProvenance: prov(
                    'maxHeight',
                    'maxFloors',
                    'maxFAR',
                    'maxCoverage',
                    'setback.front',
                    'permittedUse',
                ),
                ordinanceRef:
                    'PGO Telde Art. 235 Ordenanzas Municipales — SupMin 1 500 m², SepMinFr 5 m, ' +
                    'PMaxOcup 75 %, EdifMax 1,50, AltMaxPl 3, AltMaxMP 9,50 m (datum: PARCELA). ' +
                    'Lateral/posterior NOT published (sentinel) — UNKNOWN, not 0. ' + SRC,
            },
            {
                code: 'CO-UN2',
                label: 'Cortijo — unifamiliares, grado 2',
                permittedUse: ['residential'],
                maxHeight_m: 5,
                maxFloors: 1,
                plotRatioFAR: 0.45,
                maxCoverage: 0.35,
                setbacks: { front_m: 5, side_m: 2, rear_m: 10 },
                fieldProvenance: prov(
                    'maxHeight',
                    'maxFloors',
                    'maxFAR',
                    'maxCoverage',
                    'setback.front',
                    'setback.side',
                    'setback.rear',
                    'permittedUse',
                ),
                ordinanceRef:
                    'PGO Telde, Anexo Ordenación de Suelos Urbanizables — SupMin 450 m², ' +
                    'SepMinFr 5 m, SepMinLt 2 m, SepMinPs 10 m, PMaxOcup 35 %, EdifMax 0,45, ' +
                    'AltMaxPl 1, AltMaxMP 5,00 m (datum: PARCELA). ' + SRC,
                geometricRule: { kind: 'setback', front_m: 5, side_m: 2, rear_m: 10 },
            },
            {
                code: 'CO-SI',
                label: 'Cortijo — singular',
                permittedUse: ['mixed'],
                maxHeight_m: 6.5,
                maxFloors: 2,
                plotRatioFAR: 1.0,
                maxCoverage: 0.75,
                setbacks: { front_m: 5, side_m: null, rear_m: 5 },
                fieldProvenance: prov(
                    'maxHeight',
                    'maxFloors',
                    'maxFAR',
                    'maxCoverage',
                    'setback.front',
                    'setback.rear',
                    'permittedUse',
                ),
                ordinanceRef:
                    'PGO Telde, Anexo Ordenación de Suelos Urbanizables — SupMin 1 000 m², ' +
                    'SepMinFr 5 m, SepMinPs 5 m, PMaxOcup 75 %, EdifMax 1,00, AltMaxPl 2, ' +
                    'AltMaxMP 6,50 m (datum: PARCELA). Lateral not published — UNKNOWN. ' + SRC,
            },
            {
                code: 'IN',
                label: 'Edificación industrial en SUSO 10a',
                permittedUse: ['industrial'],
                maxHeight_m: 10,
                maxFloors: 3,
                plotRatioFAR: 0.92,
                maxCoverage: null,
                setbacks: { front_m: 6, side_m: 3, rear_m: 3 },
                fieldProvenance: prov(
                    'maxHeight',
                    'maxFloors',
                    'maxFAR',
                    'setback.front',
                    'setback.side',
                    'setback.rear',
                    'permittedUse',
                ),
                ordinanceRef:
                    'PGO Telde, Anexo Ordenación de Suelos Urbanizables — SupMin 600 m², ' +
                    'SepMinFr 6 m, SepMinLt 3 m, SepMinPs 3 m, EdifMax 0,92, AltMaxPl 3, ' +
                    'AltMaxMP 10,00 m (datum: PARCELA). ' + SRC,
                geometricRule: { kind: 'setback', front_m: 6, side_m: 3, rear_m: 3 },
            },
            {
                code: 'ST',
                label: 'Edificación de servicios terciarios en SUSO 10a',
                permittedUse: ['commercial'],
                maxHeight_m: 10,
                maxFloors: 3,
                plotRatioFAR: 1.5,
                maxCoverage: null,
                setbacks: { front_m: 8, side_m: 3.5, rear_m: 5 },
                fieldProvenance: prov(
                    'maxHeight',
                    'maxFloors',
                    'maxFAR',
                    'setback.front',
                    'setback.side',
                    'setback.rear',
                    'permittedUse',
                ),
                ordinanceRef:
                    'PGO Telde, Anexo Ordenación de Suelos Urbanizables — SupMin 1 000 m², ' +
                    'SepMinFr 8 m, SepMinLt 3,5 m, SepMinPs 5 m, EdifMax 1,50, AltMaxPl 3, ' +
                    'AltMaxMP 10,00 m (datum: PARCELA). ' + SRC,
                geometricRule: { kind: 'setback', front_m: 8, side_m: 3.5, rear_m: 5 },
            },

            // ══ ALIGNMENT + DEPTH GRAMMAR — the Art. 242.2 machinery, unchanged. ════════════
            //
            // ⭐ THIS IS THE HALF NO OTHER SPANISH PACK IN THIS REPO GETS FROM PUBLISHED DATA.
            // `DispObl` names the alignment and `FonMaxEdm` gives the buildable depth AS A
            // NUMBER, in the same row. Barcelona has to CONSTRUCT its depth from Art. 242.2;
            // València's is on Plano C and is unavailable; Telde publishes it.
            {
                code: 'G',
                label:
                    'Edificación en bloque lineal con orientación respecto al espacio urbano. ' +
                    'Ordenanza G',
                permittedUse: ['residential', 'mixed'],
                // ⚠ DATUM: `AltMaxMV` — measured from the STREET (rasante), not from the parcel.
                // Recorded because §terrain-rasant (L-584) turns a datum mix-up into a LEGAL
                // defect, not a rounding one.
                maxHeight_m: 16.5,
                maxFloors: 5,
                plotRatioFAR: 4.8,
                maxCoverage: null,
                setbacks: { front_m: 0, side_m: null, rear_m: null },
                fieldProvenance: prov('maxHeight', 'maxFloors', 'maxFAR', 'permittedUse'),
                ordinanceRef:
                    'PGO Telde Art. 231 Ordenanzas Municipales — DispObl = AV (alineación a ' +
                    'vial), FonMaxEdm 14,00 m, EdifMax 4,80, AltMaxPl 5, AltMaxMV 16,50 m ' +
                    '(datum: VIAL/rasante de calle, NOT the parcel). ' + SRC,
                geometricRule: {
                    kind: 'alignment',
                    alignTo: 'street',
                    alignmentOffset_m: 0, // AV = the façade sits ON the street line
                    sideTreatment: 'party-wall', // bloque lineal, medianeras
                    buildableDepth_m: 14,
                },
            },
            {
                code: 'R1',
                label: 'Asentamiento de edificación ligada a carretera primaria. Ordenanza R1',
                permittedUse: ['residential'],
                maxHeight_m: 7.5,
                maxFloors: 2,
                plotRatioFAR: null, // EdifMax is a SENTINEL here — UNKNOWN, never 0.
                maxCoverage: null,
                setbacks: { front_m: 14.75, side_m: 3, rear_m: 5 },
                fieldProvenance: prov(
                    'maxHeight',
                    'maxFloors',
                    'setback.front',
                    'setback.side',
                    'setback.rear',
                    'permittedUse',
                ),
                ordinanceRef:
                    'PGO Telde Art. 141 Plan Estructural — DispObl = F con DispOblm 14,75 m ' +
                    '(línea de fachada obligatoria medida desde el eje viario), FonMaxEdm ' +
                    '15,00 m, SepMinLt 3 m, SepMinPs 5 m, AltMaxPl 2, AltMaxMP 7,50 m. ' +
                    '⚠ ObsAMPl: "2 plantas como máximo medidas en …" — CONDITIONAL, therefore ' +
                    'PARTIAL. ' + SRC,
                geometricRule: {
                    kind: 'alignment',
                    alignTo: 'street',
                    // ⭐ `DispOblm` IS the offset: the plan sets the mandatory façade line back
                    // from the road. This is precisely what `alignmentOffset_m` is documented
                    // for, so no new field and no new engine is needed.
                    alignmentOffset_m: 14.75,
                    sideTreatment: 'setback',
                    side_m: 3,
                    rear_m: 5,
                    buildableDepth_m: 15,
                },
            },
            {
                code: 'R3',
                label:
                    'Asentamiento de edificación aneja a vía secundaria o sendero. Ordenanza R3',
                permittedUse: ['residential'],
                maxHeight_m: 4.5,
                maxFloors: 1,
                plotRatioFAR: null,
                maxCoverage: null,
                setbacks: { front_m: 4, side_m: 3, rear_m: 5 },
                fieldProvenance: prov(
                    'maxHeight',
                    'maxFloors',
                    'setback.front',
                    'setback.side',
                    'setback.rear',
                    'permittedUse',
                ),
                ordinanceRef:
                    'PGO Telde Art. 143 Plan Estructural — DispObl = F con DispOblm 4,00 m, ' +
                    'FonMaxEdm 15,00 m, SepMinLt 3 m, SepMinPs 5 m, AltMaxPl 1, AltMaxMP ' +
                    '4,50 m. ' + SRC,
                geometricRule: {
                    kind: 'alignment',
                    alignTo: 'street',
                    alignmentOffset_m: 4,
                    sideTreatment: 'setback',
                    side_m: 3,
                    rear_m: 5,
                    buildableDepth_m: 15,
                },
            },
            {
                code: 'AG',
                label: 'Asentamiento agrícola. Ordenanza AG',
                permittedUse: ['residential'],
                maxHeight_m: 7.5,
                maxFloors: 2,
                plotRatioFAR: null,
                maxCoverage: null,
                setbacks: { front_m: 4.5, side_m: 3, rear_m: 5 },
                fieldProvenance: prov(
                    'maxHeight',
                    'maxFloors',
                    'setback.front',
                    'setback.side',
                    'setback.rear',
                    'permittedUse',
                ),
                ordinanceRef:
                    'PGO Telde Art. 145 Plan Estructural — DispObl = F con DispOblm 4,50 m, ' +
                    'FonMaxEdm 15,00 m, SupMin 1 000 m², SepMinFr 5 m, SepMinLt 3 m, SepMinPs ' +
                    '5 m, AltMaxPl 2, AltMaxMP 7,50 m. ⚠ ObsAMPl CONDITIONAL ⇒ PARTIAL. ' + SRC,
                geometricRule: {
                    kind: 'alignment',
                    alignTo: 'street',
                    alignmentOffset_m: 4.5,
                    sideTreatment: 'setback',
                    side_m: 3,
                    rear_m: 5,
                    buildableDepth_m: 15,
                },
            },

            // ══ OCCUPATION GRAMMAR — coverage ratio, no setback, no depth. ══════════════════
            //
            // ⚠ `PMaxOcup = 100` IS SUSPECT-NEVER-VALID **WHEN A SETBACK IS ALSO PUBLISHED** —
            // the two contradict. Here NO setback is published and the zone is *manzana
            // colmatada* (a filled traditional block), so 100 % is the ordinance, not a null
            // wearing a number. It is CORROBORATED INDEPENDENTLY: the row's own `ObsPMO` reads
            // "Art.226 … Coeficiente de ocupación, 1". That corroboration is why these are
            // packed and the A-family (FAR + height only) is not.
            {
                code: 'B1',
                label:
                    'Tipología tradicional, parcelación seriada y manzana irregular, grado 1. ' +
                    'Ordenanza B',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 11,
                maxFloors: 3,
                plotRatioFAR: 2.8,
                maxCoverage: 1.0,
                setbacks: { front_m: 0, side_m: 0, rear_m: 0 },
                fieldProvenance: prov(
                    'maxHeight',
                    'maxFloors',
                    'maxFAR',
                    'maxCoverage',
                    'permittedUse',
                ),
                ordinanceRef:
                    'PGO Telde Art. 226 Ordenanzas Municipales — SupMin 100 m², LongMin 6 m, ' +
                    'PMaxOcup 100 %, EdifMax 2,80, AltMaxPl 3, AltMaxMP 11,00 m (datum: ' +
                    'PARCELA). Coverage corroborated by the row’s own ObsPMO: "Coeficiente de ' +
                    'ocupación, 1". ' + SRC,
                geometricRule: { kind: 'setback', front_m: 0, side_m: 0, rear_m: 0 },
            },
            {
                code: 'B2',
                label:
                    'Tipología tradicional, parcelación seriada y manzana irregular, grado 2. ' +
                    'Ordenanza B',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 8.2,
                maxFloors: 2,
                plotRatioFAR: 1.9,
                maxCoverage: 1.0,
                setbacks: { front_m: 0, side_m: 0, rear_m: 0 },
                fieldProvenance: prov(
                    'maxHeight',
                    'maxFloors',
                    'maxFAR',
                    'maxCoverage',
                    'permittedUse',
                ),
                ordinanceRef:
                    'PGO Telde Art. 226 Ordenanzas Municipales — SupMin 100 m², LongMin 6 m, ' +
                    'PMaxOcup 100 %, EdifMax 1,90, AltMaxPl 2, AltMaxMP 8,20 m (datum: ' +
                    'PARCELA). ' + SRC,
                geometricRule: { kind: 'setback', front_m: 0, side_m: 0, rear_m: 0 },
            },
        ],
    });

/** Zone codes this pack keys, for the registry's `packMap()`. Derived, never restated. */
export const TELDE_PGO2003_ZONE_CODES: readonly string[] = Object.freeze(
    ES_TELDE_PGO2003_PACK.zones.map((z) => z.code),
);

/**
 * Zone codes present in Telde's EDIF table that are DELIBERATELY NOT PACKED, with the reason.
 *
 * ⛔ THIS LIST IS NOT DECORATION. Without it, a future reader sees 15 missing codes and
 * "completes" the pack by giving them null setbacks — which the engine insets by 0, drawing the
 * WHOLE PARCEL. That is L-616 mechanism-A, and it is the specific way this file could ship a
 * confidently wrong number.
 */
export const TELDE_UNPACKED_ZONES: Readonly<Record<string, string>> = Object.freeze({
    D1: 'DispObl = GRF — the building line is on a plan sheet PRYZM does not hold.',
    D2: 'DispObl = GRF — the building line is on a plan sheet PRYZM does not hold.',
    C: 'FonMaxEdm 21 m with NO alignment token — the datum EDGE is unknown, so the depth band ' +
        'cannot be placed.',
    A1: 'FAR + height only. No footprint rule ⇒ FAR alone does not draw.',
    A2: 'FAR + height only. No footprint rule ⇒ FAR alone does not draw.',
    A3: 'FAR + height only. No footprint rule ⇒ FAR alone does not draw.',
    A4: 'FAR + height only. No footprint rule ⇒ FAR alone does not draw.',
    A5: 'FAR + height only. No footprint rule ⇒ FAR alone does not draw.',
    I: 'PMaxOcup 100 % but ObsPMO carries a real qualification about sótanos — CONDITIONAL.',
    J: 'Equipamientos — no private envelope, and every parameter is a sentinel.',
    'CO-H1': 'Every parameter is a sentinel.',
    'CO-H2': 'Every parameter is a sentinel.',
    CO: 'Every parameter is a sentinel.',
    SO: 'Every parameter is a sentinel.',
    INDEF: '"Indefinida" — the plan itself declares the zone undetermined.',
});

/**
 * Zone codes whose row is `DispObl = GRF` (the building line lives on a plan sheet PRYZM does not
 * hold) — DERIVED from `TELDE_UNPACKED_ZONES`' own citation text, never re-guessed or hand-
 * restated, so the two cannot drift apart.
 *
 * ⭐ WHY THIS EXISTS: `resolveTeldeZone.ts`'s offline `EDIF.shp`/`EDIF.dbf` join reports a zone
 * CODE only — the shapefile's DBF has no `DispObl` column (that lives in `EDIF.mdb`, unparsed by
 * that resolver). Whether a zone is graphed is a property of the TYPOLOGY (invariant per code),
 * not of any individual polygon instance, so the dispatcher (`applyTeldeZoningThenFallback`) asks
 * THIS set — sourced from the same human-read `EDIF.mdb` citations already in `esTeldePgo2003.ts`
 * — instead of needing per-point `DispObl` at all.
 */
export const TELDE_GRAPHED_ZONE_CODES: ReadonlySet<string> = Object.freeze(
    new Set(
        Object.entries(TELDE_UNPACKED_ZONES)
            .filter(([, reason]) => /\bGRF\b/.test(reason))
            .map(([code]) => code),
    ),
);
