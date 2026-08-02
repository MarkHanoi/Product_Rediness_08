// §AMB-REFOS-MUNICIPALITIES — THE DATASET'S OWN SCOPE, READ FROM THE DATASET.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The AMB "Refós de Planejament" ArcGIS service (`qualificacio_refos_3857`) is a METROPOLITAN
// dataset: its `QU_Trames` (layer 16, qualification) and `OV_Trames` (layer 17, volumetric
// ordering) layers carry a `CODI_INE` column and publish polygons for **36 municipalities**, not
// for Barcelona. Until this file existed, `bcnRefosOVProvider.ts` hardcoded `CODI_INE='08019'`, so
// 35 of the 36 were unreachable — the dataset was metropolitan and the code was municipal.
//
// This module is the ONE statement of that scope, and it is the key every consumer of the Refós
// parameterises on. It is DATA, not a rule pack: it carries no dimension, no height, no setback,
// and it authorises nothing (see §WHAT REACHABILITY IS NOT).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// PROVENANCE — measured, not compiled from a wiki
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Every row below was read from the SERVICE on **2026-08-02**:
//
//   curl "$AMB/17/query" --data-urlencode "where=1=1" \
//        --data-urlencode "outFields=CODI_INE,NOMMUNI" \
//        --data "returnDistinctValues=true&returnGeometry=false&f=json"
//
// It returned **37 rows over 36 distinct `CODI_INE` values**, `exceededTransferLimit` absent (the
// layer's `maxRecordCount` is 2 000, so 37 is nowhere near truncation — the count is complete, and
// that check is made explicitly because a silently-capped enumeration is exactly how a scope table
// comes to be confidently short).
//
// ⚠ **THE 37th ROW IS AN EMPTY-NAME DEFECT IN THE SOURCE, AND IT IS RECORDED, NOT SWALLOWED.**
// `08019` appears TWICE: once as `NOMMUNI = 'Barcelona'` and once with `NOMMUNI = ''`. A
// name-keyed enumeration would therefore produce a blank municipality that resolves to Barcelona's
// polygons. Keying on `CODI_INE` — as this module and the provider both do — is immune, and that
// immunity is a REASON for the key, not a lucky property of it. See `AMB_REFOS_SOURCE_DEFECTS`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §WHAT REACHABILITY IS NOT — read before adding a `jurisdictionId`
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A row here says the AMB PUBLISHES POLYGONS for that municipality. It says NOTHING about whether
// PRYZM may draw an envelope there. Those are different questions and conflating them is the
// L-665 defect this package just inverted the default to prevent:
//
//   • `jurisdictionId: null` — PRYZM registers no jurisdiction for this municipality. Its land is
//     answered by the Catalonia regional cited refusal, and `envelopeAuthorisation.ts` refuses it
//     `unknown-jurisdiction` because it is in neither authorisation table.
//   • `jurisdictionId: '<id>'` — PRYZM registers a jurisdiction. **Publication is STILL gated** by
//     `isEnvelopePublicationAuthorised(id)`, which fails closed. Four of the five ids named below
//     carry a SHUT gate today (`LHOSPITALET/BADALONA/SANT_BOI/CORNELLA_ENVELOPE_VERIFIED` are all
//     `false`) and therefore publish nothing.
//
// ⇒ Parameterising the Barcelona hardcodes on `CODI_INE` moves 35 municipalities from
//   **unassessed** to **reachable AND GATED**. It moves nothing into *published*. If you are here
//   because you want a number in Gavà, the missing thing is a SIGNATURE and a rule pack, not a
//   wiring edit — and `esBadalona.ts` explains at length why Barcelona's tables may not simply be
//   pointed at another municipality's land.
//
// ⚠ SIG-3 certifies a DATASET VINTAGE over the whole service, so extending the READ to another
// municipality needs no new signature. Extending the PUBLICATION does. That asymmetry is the whole
// design.
//
// PURITY: L2-pure (C58 §1.1/§1.9) — frozen data + total pure lookups. No I/O, no clock, no RNG.
//
// Strategic context — C58 §1.5, C60 §2, L-449, L-665, ADR-0270,
// `findings/BARCELONA-GIS-AUDIT-SPIKE.md`, `esAmbPgmScope.ts` (which articles reach which town).

import { trace } from '@opentelemetry/api';
import { ineCodeLiteral, type IneCode } from './esMunicipalCode.js';

const tracer = trace.getTracer('pryzm.zoning.es.amb');

/**
 * One municipality the AMB Refós service publishes polygons for.
 *
 * ⚠ `ineCode` is a branded `IneCode`, NOT a string — the AMB column is `CODI_INE` and it is the
 * INE vocabulary. A Catastro `DgcCode` is not assignable here, which is the compile-time half of
 * the `08196` interlock (`esMunicipalCode.ts`).
 */
export interface AmbMunicipality {
    /** The service's own `CODI_INE` value — the query key, and the only reliable identity here. */
    readonly ineCode: IneCode;
    /** `NOMMUNI` exactly as the service spells it (accents, articles and all — do not "fix" it). */
    readonly nameInSource: string;
    /**
     * The PRYZM jurisdiction id for this municipality, or `null` when PRYZM registers none.
     *
     * ⚠ A NON-NULL VALUE IS A ROUTING FACT, NEVER A PUBLICATION ONE. See §WHAT REACHABILITY IS NOT.
     */
    readonly jurisdictionId: string | null;
}

/**
 * An AMB municipality PRYZM registers a jurisdiction for. The narrowed type the dispatch requires,
 * so a municipality with no jurisdiction cannot be routed into a pack path by accident — it is a
 * `tsc` error rather than a `?? BCN_JURISDICTION_ID` fallback that silently cites Barcelona on
 * another town's land (the §JURISDICTION-SPECIFICITY / L-652 defect, restated at the dispatch seam).
 */
export type AmbRegisteredMunicipality = AmbMunicipality & { readonly jurisdictionId: string };

function muni(ine: string, nameInSource: string, jurisdictionId: string | null): AmbMunicipality {
    return Object.freeze({ ineCode: ineCodeLiteral(ine), nameInSource, jurisdictionId });
}

// The five PRYZM jurisdiction ids that exist for AMB municipalities today. Written as literals
// here rather than imported from `registry.ts`/the packs to keep this module import-free of L3
// rule packs (it is read BY them); `ambMunicipalities.test.ts` asserts every one of these equals
// the pack constant it names, so the two cannot drift.
const J_BARCELONA = 'es-08019-barcelona';
const J_BADALONA = 'es-08015-badalona';
const J_CORNELLA = 'es-08073-cornella-de-llobregat';
const J_HOSPITALET = 'es-08101-hospitalet';
const J_SANT_BOI = 'es-08200-sant-boi';

/**
 * §AMB-REFOS-SCOPE — all 36 municipalities the AMB Refós publishes, ordered by `CODI_INE`.
 *
 * Read from the service 2026-08-02 (see the header for the exact query and the completeness check).
 * `jurisdictionId` is non-null for exactly the five PRYZM registers; the other 31 are `null`, which
 * is a statement about PRYZM's coverage and never about the land.
 */
export const AMB_REFOS_MUNICIPALITIES: readonly AmbMunicipality[] = Object.freeze([
    muni('08015', 'Badalona', J_BADALONA),
    muni('08019', 'Barcelona', J_BARCELONA),
    muni('08020', 'Begues', null),
    muni('08054', 'Castellbisbal', null),
    muni('08056', 'Castelldefels', null),
    muni('08068', 'Cervelló', null),
    muni('08072', 'Corbera de Llobregat', null),
    muni('08073', 'Cornellà de Llobregat', J_CORNELLA),
    muni('08077', 'Esplugues de Llobregat', null),
    muni('08089', 'Gavà', null),
    muni('08101', "L'Hospitalet de Llobregat", J_HOSPITALET),
    muni('08123', 'Molins de Rei', null),
    muni('08125', 'Montcada i Reixac', null),
    muni('08126', 'Montgat', null),
    muni('08157', 'Pallejà', null),
    muni('08158', 'El Papiol', null),
    muni('08169', 'El Prat de Llobregat', null),
    muni('08180', 'Ripollet', null),
    muni('08194', 'Sant Adrià de Besòs', null),
    // ⚠ 08196 — a MEASURED INE/DGC COLLISION. INE 08196 = Sant Andreu de la Barca (this row, and
    // it HAS polygons here). DGC 08196 = Sant Andreu de Llavaneres, on the Maresme coast, ~40 km
    // away and NOT in the AMB. See `ES_MUNICIPAL_CODE_COLLISIONS`; this is why `ineCode` is branded.
    muni('08196', 'Sant Andreu de la Barca', null),
    muni('08200', 'Sant Boi de Llobregat', J_SANT_BOI),
    muni('08204', 'Sant Climent de Llobregat', null),
    muni('08205', 'Sant Cugat del Vallès', null),
    muni('08211', 'Sant Feliu de Llobregat', null),
    muni('08217', 'Sant Joan Despí', null),
    muni('08221', 'Sant Just Desvern', null),
    muni('08244', 'Santa Coloma de Cervelló', null),
    muni('08245', 'Santa Coloma de Gramenet', null),
    muni('08252', 'Barberà del Vallès', null),
    muni('08263', 'Sant Vicenç dels Horts', null),
    muni('08266', 'Cerdanyola del Vallès', null),
    muni('08282', 'Tiana', null),
    muni('08289', 'Torrelles de Llobregat', null),
    muni('08301', 'Viladecans', null),
    muni('08904', 'Badia del Vallès', null),
    muni('08905', 'La Palma de Cervelló', null),
]);

/**
 * Defects MEASURED in the AMB Refós source on 2026-08-02, recorded so they are not re-discovered
 * as bugs in PRYZM. Each is a property of the PUBLISHER's data, not of this code.
 */
export const AMB_REFOS_SOURCE_DEFECTS: readonly string[] = Object.freeze([
    'EMPTY `NOMMUNI` ON A DUPLICATE 08019 ROW. A distinct-values query over (CODI_INE, NOMMUNI) on ' +
        'layer 17 returns 37 rows for 36 municipalities: `08019` appears both as "Barcelona" and ' +
        'with an EMPTY name. Any enumeration keyed on NOMMUNI yields a blank municipality that ' +
        'nonetheless owns Barcelona polygons. Keying on CODI_INE is immune — which is why this ' +
        'module and `bcnRefosOVProvider.ts` both do, deliberately rather than incidentally.',
    'NO EDITION DATE, NO CUT-OFF, NO CURRENCY DECLARATION on either layer — the L-526 trap, and the ' +
        'limit SIG-3 was signed under. It is mitigated by the `estimated-ruleset` tier and the ' +
        'source caveat, not eliminated.',
]);

/** Barcelona — the reference municipality, and the ONLY one whose OV transcription is authorised. */
export const AMB_BARCELONA: AmbRegisteredMunicipality = AMB_REFOS_MUNICIPALITIES.find(
    (m) => m.ineCode === '08019',
) as AmbRegisteredMunicipality;

/** Index by INE code. Built from the array so the two cannot disagree. */
const BY_INE: ReadonlyMap<string, AmbMunicipality> = new Map(
    AMB_REFOS_MUNICIPALITIES.map((m) => [m.ineCode as string, m]),
);

/**
 * The AMB municipality with this INE code, or `null` when the Refós publishes nothing for it.
 *
 * ⚠ `null` is a REACHABILITY answer ("this service does not cover that municipality"), which is
 * operationally distinct from "that municipality has no OV footprint at this point". The provider
 * keeps them apart as `unknown-municipality` vs `no-feature` — collapsing them would be the
 * §CONTEXT-DATA-HONESTY failure this package keeps hitting (L-422/457/467/469).
 *
 * P8 — emits `pryzm.zoning.es.amb.municipalityByIne`.
 */
export function ambMunicipalityByIne(ine: IneCode): AmbMunicipality | null {
    const span = tracer.startSpan('pryzm.zoning.es.amb.municipalityByIne');
    try {
        const hit = BY_INE.get(ine as string) ?? null;
        span.setAttribute('ineCode', ine as string);
        span.setAttribute('inAmbScope', hit !== null);
        return hit;
    } finally {
        span.end();
    }
}

/**
 * Narrow an `AmbMunicipality` to one PRYZM registers a jurisdiction for.
 *
 * ⚠ THIS IS THE GUARD THAT KEEPS THE 31 UNREGISTERED MUNICIPALITIES OUT OF THE PACK PATH. It is a
 * routing test only — a `true` here still says nothing about publication, which
 * `isEnvelopePublicationAuthorised` decides and which fails closed.
 *
 * P8 — emits `pryzm.zoning.es.amb.isRegistered`.
 */
export function isAmbRegisteredMunicipality(
    m: AmbMunicipality | null | undefined,
): m is AmbRegisteredMunicipality {
    const span = tracer.startSpan('pryzm.zoning.es.amb.isRegistered');
    try {
        const ok = !!m && typeof m.jurisdictionId === 'string' && m.jurisdictionId.length > 0;
        span.setAttribute('registered', ok);
        if (m) span.setAttribute('ineCode', m.ineCode as string);
        return ok;
    } finally {
        span.end();
    }
}
