// E7-NO — NORWAY (NO) · the source-registry SEAM.
//
// ⚠ THIS IS NOT A SECOND SOURCE REGISTRY (C84 EI-9, one authority per concept). Norway already
// HAS a typed source row: `sourceRegistry/no.ts` (`NO_SOURCES`), seeded by the registry lane
// with the Matrikkelen Teig WFS and its 2026-07-24 / 2026-08-31 probe log. This module
// RESOLVES that row and adds only what the registry lacks — the LT pattern, not the EE one
// (EE minted its own rows because it predated the registry).
//
// WHAT THE REGISTRY LACKS, AND WHY IT IS ADDITIVE RATHER THAN A CORRECTION: `sourceRegistry/
// no.ts` carries the CADASTRE and, in its own "HONEST ABSENCES" header, deliberately records
// the national plan copy as a Norge-digitalt agreement gate with NO row. That was correct on
// the evidence then available. This lane PROBED the channel and found a KEYLESS one the
// registry could not have known about: **NAP's WMS GetFeatureInfo**. So two rows are added —
// the keyless NAP plan service, and the SOSI codelist register the mirrored codes resolve
// against — and the AGREEMENT GATE is preserved as a third, explicitly gated row rather than
// deleted, because "free but gated" and "keyless" are different facts about one programme.
//
// The rows are defined HERE because `sourceRegistry/no.ts` is a SHARED file this lane may not
// edit (barrel protocol). They are built with the registry's OWN loader (`defineSources`) so
// they get identical build-time validation, and their migration is queued for the orchestrator
// in `audit/europe-site-intel/2026-08-31/impl/barrel-additions-no.txt`. When that lands, delete
// them here and re-export the registry's — never leave two.

import type { SiteIntelSource } from '@pryzm/schemas';
import { defineSources } from '../../sourceRegistry/defineSources.js';
import { NO_SOURCES } from '../../sourceRegistry/no.js';
import { NO_MATRIKKEL_WFS_BASE } from './noMatrikkelClient.js';
import {
    NO_NAP_DOWNLOAD_API,
    NO_NAP_DOWNLOAD_REQUIRED_ROLE,
    NO_NAP_REGULERINGSPLANER_WMS,
} from './noNapClient.js';

/** The Matrikkelen row id — the `source` every minted NO parcel provenance cites. */
export const NO_MATRIKKEL_SOURCE_ID = 'no-kartverket-matrikkelen-teig-wfs';

/** The NAP row id — the `source` every minted NO Plan / Zone / Prescription cites. */
export const NO_NAP_SOURCE_ID = 'no-nap-reguleringsplaner-wms';

/** The Norge-digitalt-gated bulk row id (recorded, never called). */
export const NO_NAP_BULK_SOURCE_ID = 'no-nap-reguleringsplaner-bulk';

/** The SOSI codelist register row id — where every mirrored code resolves. */
export const NO_SOSI_CODELIST_SOURCE_ID = 'no-geonorge-sosi-kodelister';

/**
 * Resolve one registry row by id, failing BY NAME at module load if the registry no longer
 * carries it. An adapter citing a source id nothing serves is the dangling-reference defect
 * the R1 referent contract exists to stop, and a build error is where it belongs.
 */
function noRegistryRow(id: string): SiteIntelSource {
    const row = NO_SOURCES.find((r) => r.id === id);
    if (!row) {
        throw new Error(
            `[no-adapter] source row '${id}' is not in sourceRegistry/no.ts — the NO adapter ` +
                'resolves its cadastre source from the registry and mints none for it; seed the ' +
                'row there (one authority per source), never re-mint it here.',
        );
    }
    return row;
}

/**
 * Endpoint DRIFT GUARD, executed at module load (DK's `assertEndpoint`, adopted verbatim in
 * shape). The client pins the endpoint it actually GETs; the registry records what the source
 * registry claims. A comment asserting they match is exactly the class of claim that rots — so
 * the disagreement is a build error naming BOTH strings.
 */
function assertEndpoint(row: SiteIntelSource, pinned: string): SiteIntelSource {
    if (row.endpoint !== pinned) {
        throw new Error(
            `[no-adapter] endpoint drift on '${row.id}': registry says '${row.endpoint}', the ` +
                `client pins '${pinned}'. One re-pin, both places, or the registry is fiction.`,
        );
    }
    return row;
}

/** The Matrikkelen row — the registry's own object, guarded against endpoint drift. */
export const NO_MATRIKKEL_SOURCE: SiteIntelSource = assertEndpoint(
    noRegistryRow(NO_MATRIKKEL_SOURCE_ID),
    NO_MATRIKKEL_WFS_BASE,
);

/** The three additive rows (see the header). Validated by the registry's own loader. */
export const NO_ADDITIVE_SOURCES: readonly SiteIntelSource[] = defineSources('NO', [
    {
        id: NO_NAP_SOURCE_ID,
        country: 'NO',
        authority: 'Direktoratet for byggkvalitet (DiBK) — NAP, Nasjonal arealplanbase',
        dataset:
            'reguleringsplaner WMS 1.3.0, 54 advertised layers across 5 vertikalnivå groups; the ' +
            'MACHINE channel is GetFeatureInfo with INFO_FORMAT=application/json, returning ' +
            'GeoJSON geometry + the full SOSI attribute bag (RpOmråde · RpArealformålOmråde · ' +
            'RbFormålOmråde · 8 hensynssone types · 7 bestemmelsesområde types · RpJuridiskLinje ' +
            '/Punkt · RpRegulertHøyde · RpPåskrift — 22 real feature types behind the 8 ' +
            'advertised _vn1 groups, enumerated via WMS DescribeLayer). CRS EPSG:25833/3857.',
        endpoint: NO_NAP_REGULERINGSPLANER_WMS,
        // REPORT §I's `protocol` enum is the coarse TRANSPORT class and is FROZEN; WMS is
        // classed REST and the exact dialect is named verbatim above (defineSources policy).
        protocol: 'REST',
        licence: {
            id:
                'NLOD / Norge digitalt — the Geonorge kartkatalog record for this dataset ' +
                '(uuid dac27348-5c2e-4a6a-9497-c4c792108cae) serves AccessConstraints, ' +
                'OtherConstraints and UseConstraints all NULL, and the WMS answers keylessly. ' +
                '⚠ The licence PAGE was not fetched verbatim this lane — confirm before ' +
                'redistribution.',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-09-01',
                note:
                    'E7-NO PROBED LIVE, keyless: GetCapabilities 1.3.0, 54 layers. GetFeatureInfo ' +
                    'EPSG:25833 at Bergen teig 4601-167/714 representasjonspunkt (-31841.977, ' +
                    '6735304.036) -> 5 features WITH GEOMETRY: RpOmråde plan 4601/65800000 ' +
                    '"BERGENHUS. BYBANEN ... DELSTREKNING 1" ikrafttredelsesdato 2023-05-31Z, ' +
                    'RpArealformålOmråde arealformål 2022 felt o_STS3, RpSikringSone 190, ' +
                    'RpBåndleggingSone H730_2, RpBestemmelseOmråde — all vertikalnivå 1. The SAME ' +
                    'point at _vn2 -> a DIFFERENT plan, 4601/5380000, ikrafttredelsesdato ' +
                    '1983-10-10Z, with NO formålområde. CQL_FILTER is supported (GeoServer ' +
                    'extension, quoted dotted names work).',
            },
            {
                date: '2026-09-01',
                note:
                    'E7-NO THREE SILENT-EMPTY TRAPS, all HTTP 200: (a) SCALE CLIFF — same feature ' +
                    'answers at half-window 400 m (1:28,289) and returns 0 features at 800 m ' +
                    '(1:56,577), against an advertised MaxScaleDenominator of 5,000,000; (b) an ' +
                    'unprobed CRS (EPSG:4326 with metre bbox) returns {"features":[]} with no ' +
                    'exception; (c) QUERY_LAYERS=arealformal_vn9 returns HTTP 200 with an XML ' +
                    'ServiceException code="LayerNotDefined", i.e. res.ok is TRUE. All three are ' +
                    'refused by name in noNapClient.ts.',
            },
            {
                date: '2026-09-01',
                note:
                    'E7-NO ⛔ MACHINE-FORMAT DATA LOSS: utnytting.utnyttingstall serialises as ' +
                    '"[Ljava.lang.Double;@<hex>" in application/json, application/vnd.ogc.gml, ' +
                    'text/xml;subtype=gml/3.1.1 AND text/plain — 6 of 6 filled instances across 3 ' +
                    'Bergen plans, hex differing per request. text/html renders the real value ' +
                    '(2,540 for objid 3062). AND utnytting.utnyttingstype — the DENOMINATOR — is ' +
                    'NOT a key on rparealformalomrade at all, while the legacy rbformalomrade DOES ' +
                    'carry it (0 of 7 filled).',
            },
            {
                date: '2026-09-01',
                note:
                    'E7-NO COVERAGE CENSUS: rpomrade_vn1 rendered over a 10 km window at nine city ' +
                    'centres — PAINTED at Bergen (425 cells), Drammen (323), Stavanger (276), ' +
                    'Trondheim (257), Tromsø (249); BLANK at Oslo, Fredrikstad, Arendal, ' +
                    'Kristiansand. 5 of 9. ⛔ OSLO — the capital, and the city already wired in ' +
                    'parcelProviders/registry.ts — has NO reguleringsplan coverage in NAP today.',
            },
            {
                date: '2026-09-01',
                note:
                    'E7-NO PREDECESSORS RETIRED: wfs.geonorge.no/skwms1/wfs.reguleringsplaner -> ' +
                    '"*** UKJENT APPLIKASJON ***"; wms.geonorge.no/skwms1/wms.reguleringsplaner -> ' +
                    'HTTP 500 msLoadMap(). ⚠ HOST: this endpoint is nap.**ft**.dibk.no, which is ' +
                    'what the Geonorge kartkatalog itself publishes; nap.dibk.no returned HTTP 523 ' +
                    'on three probes. DescribeLayer names the backend ca-opr-nap-geoserver-PROD.',
            },
        ],
        theme: 'planning',
        coverage:
            'national in principle (the download API lists 375 areas incl. "Hele landet"); ' +
            'MEASURED PARTIAL in fact — 5 of 9 sampled city windows carried reguleringsplan ' +
            'geometry, and Oslo did not',
        updateFrequency:
            'per-kommune copy; kopidata.kopidato observed 2026-02-19 and 2026-05-08 on live features',
        adapterStatus: 'live',
    },
    {
        id: NO_NAP_BULK_SOURCE_ID,
        country: 'NO',
        authority: 'Direktoratet for byggkvalitet (DiBK) — NAP nedlasting (Geonorge Nedlasting API v3)',
        dataset:
            'Reguleringsplaner + Kommuneplaner as GeoPackage / GML / PostGIS, per kommune (375 ' +
            'areas incl. "Hele landet"), EPSG:25833 — the BULK arm of the same programme as ' +
            NO_NAP_SOURCE_ID,
        endpoint: NO_NAP_DOWNLOAD_API,
        protocol: 'REST',
        licence: {
            id: 'Norge digitalt — bulk download requires the party role, see gate',
            colour: 'YELLOW',
            verifiedDate: null,
            textRef: null,
        },
        // Metadata + on-demand: the capability descriptor is public, the FILES are not.
        accessOption: 6,
        gate:
            'Norge digitalt party role "' +
            NO_NAP_DOWNLOAD_REQUIRED_ROLE +
            '" — MACHINE-DECLARED by the service itself: capabilities/<uuid> returns ' +
            '"accessConstraintRequiredRole": "' +
            NO_NAP_DOWNLOAD_REQUIRED_ROLE +
            '". This is the agreement gate the L5 sweep predicted for the national plan copy, ' +
            'now measured rather than inferred. NOT worked around; the keyless GetFeatureInfo ' +
            'channel is what this adapter uses.',
        probes: [
            {
                date: '2026-09-01',
                note:
                    'E7-NO: /services/nedlasting/api/ -> HTTP 200 keyless (version 3, link ' +
                    'templates). capabilities/dac27348-… -> supportsAreaSelection true, ' +
                    'supportsPolygonSelection false, formats GeoPackage/GML/PostGIS, and ' +
                    '"accessConstraintRequiredRole":"nd.filnedlasting". codelists/area/<uuid> -> ' +
                    '375 areas: "Hele landet" + 374 kommuner incl. Oslo 0301. NOT ordered.',
            },
        ],
        theme: 'planning',
        coverage: 'national bulk, per kommune',
        updateFrequency: null,
        adapterStatus: 'documented',
    },
    {
        id: NO_SOSI_CODELIST_SOURCE_ID,
        country: 'NO',
        authority: 'Kartverket — Geonorge register, SOSI kodelister',
        dataset:
            'the national code registers every mirrored NO code resolves against: plan/plan-felles ' +
            '(Utnyttingstype · Vertikalnivå · Eierformtype · Høydereferansesystem · TypeHøyde · ' +
            'Terrengreferanse · PåskriftType · Datafangstmetode) and plan/reguleringsplan ' +
            '(RpArealformål · RpBestemmelseHjemmel · RpJuridisklinjeType · RpJuridiskpunktType · ' +
            'Avkjørselsbestemmelse · RegulertOverflatetype · Byggverkbestemmelse). Keyless JSON.',
        endpoint: 'https://register.geonorge.no/api/sosi-kodelister/plan',
        protocol: 'REST',
        licence: {
            id: 'Geonorge register — open; licence page not fetched verbatim this lane',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-09-01',
                note:
                    'E7-NO PROBED LIVE: sosi-kodelister -> 33 subregisters; plan -> 9 (hensyn, ' +
                    'plan-felles, reguleringsplan, kommuneplan, planbestemmelser, ' +
                    'reguleringsplanforslag, planregister, pbl-1985, 5.0). ⭐ THE DECIDING PULL: ' +
                    'plan-felles/utnyttingstype.json -> 16 members — 1 BYA-87, 2 BRA-87, 3 TU, 4 U, ' +
                    '5 F, 6 BGA, 7 BFA, 10 "Ikke tillatt å bebygge", 11 "Ikke tillatt med ' +
                    'ytterligere bebyggelse", 12 %-BYA-97, 13 T-BRA, 14 %-TU, 15 BYA, 16 %-BYA, ' +
                    '17 BRA, 18 %-BRA. Six are a % of PLOT area, two a % of FLOOR area, six are ' +
                    'ABSOLUTE m2, and TWO ARE PROHIBITIONS. This is the codelist NAP omits from ' +
                    'rparealformalomrade — the measured basis for the R2 refusal. NOTE: the ' +
                    'register serves NO Plantype codelist under plan/reguleringsplan, which is why ' +
                    'the mapper does not rank on plantype.',
            },
        ],
        theme: 'planning',
        coverage: 'national code registers',
        updateFrequency: null,
        adapterStatus: 'documented',
    },
]);

/**
 * Every source this adapter knows: the registry's NO rows plus the three additive ones.
 * Consumers should read THIS, not either half — after the orchestrator migrates the rows into
 * `sourceRegistry/no.ts`, this constant keeps its meaning while the additive array empties.
 */
export const NO_ADAPTER_SOURCES: readonly SiteIntelSource[] = [...NO_SOURCES, ...NO_ADDITIVE_SOURCES];

/**
 * Endpoints this adapter actually calls, paired with the row that documents each — the
 * assertion a test can make that no endpoint is reached without a registered, probed row
 * behind it ("committed != reachable", applied to sources).
 */
export const NO_ADAPTER_ENDPOINT_BINDINGS: readonly {
    readonly sourceId: string;
    readonly endpoint: string;
}[] = [
    { sourceId: NO_MATRIKKEL_SOURCE_ID, endpoint: NO_MATRIKKEL_WFS_BASE },
    { sourceId: NO_NAP_SOURCE_ID, endpoint: NO_NAP_REGULERINGSPLANER_WMS },
];
