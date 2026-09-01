// LANE E6-PL — POLAND (PL) · source discovery: the §J `sources(): SourceDescriptor[]` leg,
// typed as E1a `SiteIntelSource` rows, on the EE shape (`countryAdapters/ee/eeSources.ts`).
//
// ⛔ NO RIVAL REGISTRY (C84 EI-9 — one authority per concept). Poland ALREADY has seeded rows
// in the thin Source Registry (`sourceRegistry/pl.ts`, lane REG): `pl-gugik-uldk-parcel-locator`,
// `pl-gugik-kieg-cadastre-wms`, `pl-bdot10k-buildings-geoparquet`. Those are IMPORTED BY
// REFERENCE, never re-typed — a second copy of a row is a second spelling of one source. This
// module adds exactly ONE row the registry deliberately does not carry (it records the reason
// verbatim: "POG sample GML — a ministry TEST file, not a service endpoint"), because every
// minted PL Plan/Zone/Rule needs a `source` id that resolves.
//
// ⚠ THE LIVE-DATA CALENDAR IS REAL AND THIS ROW STATES IT (the brief's binding instruction):
// the Rejestr Urbanistyczny transition completes 2026-11-30 and no POG WFS/CSW endpoint is
// discoverable today. The row therefore carries `adapterStatus: PL_ADAPTER_STATUS_NOT_YET_LIVE`
// and its probe log carries the FULL discovery transcript below — an adapter that ran on
// fixtures while implying live coverage would be the overstatement this wave exists to kill.

import { SiteIntelSourceSchema, type SiteIntelSource } from '@pryzm/schemas';
// LEAF import, never the `sourceRegistry/index.js` barrel: barrel access at module load is the
// documented circular-import trap in this repo (§SCC-no-barrel-access-at-module-load).
import { PL_SOURCES } from '../../sourceRegistry/pl.js';

/**
 * The named not-yet-live marker the brief requires. It EXTENDS the lane `adapterStatus`
 * vocabulary (`live` | `documented` | `blocked` | `deferred-stub`) rather than reusing one of
 * them, because none of them is true here: the channel is neither wired (`live`), nor merely
 * described (`documented` — the parser and this adapter are built and proven on the official
 * artifact), nor gated (`blocked` implies an access gate; there is no gate, there is no
 * service yet).
 */
export const PL_ADAPTER_STATUS_NOT_YET_LIVE = 'not-yet-live';

/** The date the Rejestr Urbanistyczny transition period ends (gov.pl; lane 4 §PL-1). */
export const PL_RU_TRANSITION_ENDS = '2026-11-30';

/**
 * THE ONE LIVE ENDPOINT-DISCOVERY ATTEMPT, recorded verbatim (executed 2026-09-01, this lane).
 * Kept as DATA so the next lane re-runs it instead of re-guessing it — and so the negative is
 * auditable rather than a prose claim.
 *
 * ⭐ THE CONTROL IS THE POINT. `mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaPlanowOgolnych`
 * answers HTTP 401 "Unauthorized." — which LOOKS like a found-but-gated national POG service.
 * It is not: a nonsense service name at the same base path answers with the BYTE-IDENTICAL 401
 * (96 bytes), so that 401 is the base's catch-all for any unknown service and proves nothing
 * about existence. Reporting it as a discovered gated endpoint would have been a confident
 * false positive (§GetCapabilities-is-not-an-inventory · §probe-can-be-wrong-three-ways).
 */
export const PL_RU_ENDPOINT_DISCOVERY = Object.freeze({
    date: '2026-09-01',
    verdict:
        'NOT-YET-SERVABLE — no POG/RU data endpoint discovered; expected before ' +
        '2026-11-30 (end of the Rejestr Urbanistyczny transition period)',
    attempts: Object.freeze([
        'https://rejestr-urbanistyczny.gov.pl/ -> HTTP 200, 22,530 bytes, text/html (Angular SPA shell)',
        'https://rejestr-urbanistyczny.gov.pl/{api/, wfs?...GetCapabilities, csw?...GetCapabilities, wms?...GetCapabilities, geoserver/ows?...} -> ALL HTTP 200 with the SAME 22,530-byte SPA shell (catch-all route, not a service)',
        'https://api.rejestr-urbanistyczny.gov.pl/ -> connection reset (curl 56)',
        'RU bundle main-ADGQ7UID.js -> a module-federation loader only; /assets/federation.manifest.json lists FIVE FRONT-END remotes (published-fe, eservices-fe, published-details-fe, repo-fe, notifications-fe) and NO data-service base URL',
        'https://rejestr-urbanistyczny.gov.pl/assets/{config.json, config/config.json, app-config.json, environment.json} -> SPA shell (no config served)',
        'https://integracja.gugik.gov.pl/eziudp/ -> HTTP 200, 197,045 bytes; ZERO occurrences of "urbanistyczn" in the served HTML (the eziudp register page is itself an app shell — the sweep the lane-4 OPEN ITEM asks for still needs the harvest lane)',
        'https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaPlanowOgolnych?service=WMS&request=GetCapabilities -> HTTP 401 "Unauthorized." (96 bytes). REFUTED BY CONTROL: ".../KrajowaIntegracjaPlanowOgolnychZZZNONSENSE" and ".../ZupelnieNieistniejacaUsluga123" return the BYTE-IDENTICAL 401, so the 401 is that base path catch-all and is NOT evidence the POG service exists',
        'CONTROL (positive): https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego?service=WMS&request=GetCapabilities -> HTTP 200 text/xml, Title "Krajowa Integracja Miejscowych Planow Zagospodarowania Przestrzennego" — the MPZP service DOES answer at that base, which is what made the 401 above look meaningful and is exactly why the negative control was run',
    ]),
});

/**
 * The ULDK row id — the SAME string as the `sourceRegistry/pl.ts` row, asserted below to
 * exist. Every minted PL parcel cites this id, so registry and adapter name ONE source.
 */
export const PL_ULDK_SOURCE_ID = 'pl-gugik-uldk-parcel-locator';

/** The adapter-owned APP GML 2.0 planning-act channel (POG today; MPZP when it vectorises). */
export const PL_APP_GML_SOURCE_ID = 'pl-app-gml-2-0-planning-act';

/**
 * The rows this adapter OWNS. Validated through `SiteIntelSourceSchema` at module load (a row
 * that does not parse is a build error, not a runtime surprise — the EE/registry discipline).
 */
export const PL_ADAPTER_OWN_SOURCES: readonly SiteIntelSource[] = [
    {
        id: PL_APP_GML_SOURCE_ID,
        country: 'PL',
        authority:
            'Ministerstwo Rozwoju i Technologii (schemat aplikacyjny APP 2.0) / gmina (organ uchwalający)',
        dataset:
            'app:AktPlanowaniaPrzestrzennego + app:StrefaPlanistyczna (APP GML 2.0, ' +
            'planowaniePrzestrzenne_2_0.xsd publ. 2023-11-22) — the national zone-envelope ' +
            'layer: maksNadziemnaIntensywnoscZabudowy / maksUdzialPowierzchniZabudowy / ' +
            'maksWysokoscZabudowy / minUdzialPowierzchniBiologicznieCzynnej',
        // The only servable artifact today: the ministry's official test export. NOT a service.
        endpoint: 'https://www.gov.pl/attachment/8dd6086a-88ba-44fb-be68-d43d14a15e36',
        protocol: 'bulk',
        licence: {
            // §G's PL row colours the GUGiK geodetic stack GREEN; the planning-act channel has a
            // DIFFERENT publisher and the lane files colour it nowhere — an inferred colour here
            // would be exactly the invented claim `sourceRegistry/pl.ts` refuses to make for
            // KIMPZP. Recorded as unverified, with the licence read named as the open action.
            id: 'UNVERIFIED — no licence text read for the planning-act (APP GML) channel; the §G PL GREEN row covers ULDK/KIEG/BDOT10k/3D only',
            colour: 'YELLOW',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 3, // a downloaded document parsed locally — not a live query
        gate: null,
        probes: [
            {
                date: '2026-09-01',
                note:
                    'LANE E2b: official ministry POG test GML fetched HTTP 200, 253,475 bytes, ' +
                    'sha256 17369056…5090853, pinned as a byte-identical fixture; XSD 54,226 bytes ' +
                    'sha256 9005a694…1da87b88. Parser round-trips 28 strefy + 4 OUZ + 2 OZS + ' +
                    '1 OSD + 1 akt + 1 dokument with 6,073 positions conserved.',
            },
            {
                date: '2026-09-01',
                note:
                    'LANE E6-PL live discovery — ' +
                    PL_RU_ENDPOINT_DISCOVERY.verdict +
                    '. ' +
                    PL_RU_ENDPOINT_DISCOVERY.attempts.join(' | '),
            },
        ],
        theme: 'planning',
        coverage:
            'the OFFICIAL MINISTRY SAMPLE ONLY (one synthetic gmina, PL.ZIPPZP.11111/321202-POG, ' +
            'act status "elaboration"). NOT national coverage: POG adoption ran to the 2026-08-31 ' +
            'deadline and RU publication fills to 2026-11-30',
        updateFrequency:
            'n/a — a static test artifact; the live cadence is whatever RU publishes after 2026-11-30',
        adapterStatus: PL_ADAPTER_STATUS_NOT_YET_LIVE,
    },
].map((row) => SiteIntelSourceSchema.parse(row));

/**
 * BUILD-TIME ANTI-DRIFT GUARD: the id this adapter cites for parcels must exist in the thin
 * Source Registry. If `sourceRegistry/pl.ts` ever renames that row, this module fails to load
 * NAMING the drift — instead of every minted PL parcel quietly citing a source that resolves
 * to nothing (the dangling-referent defect R1 exists to kill, applied to sources).
 */
const registryIds = new Set(PL_SOURCES.map((r) => r.id));
if (!registryIds.has(PL_ULDK_SOURCE_ID)) {
    throw new Error(
        `[pl-adapter] PL_ULDK_SOURCE_ID '${PL_ULDK_SOURCE_ID}' is not in sourceRegistry/pl.ts ` +
            `(rows: ${[...registryIds].join(', ')}) — the adapter and the registry must name ONE source`,
    );
}

/**
 * The §J `sources()` answer: the registry's PL rows (by reference) PLUS this adapter's own
 * row. No id may appear twice — asserted at module load.
 */
export const PL_ADAPTER_SOURCES: readonly SiteIntelSource[] = [
    ...PL_SOURCES,
    ...PL_ADAPTER_OWN_SOURCES,
];

const seenSourceIds = new Set<string>();
for (const row of PL_ADAPTER_SOURCES) {
    if (seenSourceIds.has(row.id)) {
        throw new Error(`[pl-adapter] duplicate source id '${row.id}' — one source, one row`);
    }
    seenSourceIds.add(row.id);
}
