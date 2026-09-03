// LANE HR — CROATIA (HR) · source discovery: the §J `sources(): SourceDescriptor[]` leg, typed as
// E1a `SiteIntelSource` rows (REPORT §I: the per-row probe notes are a working source registry —
// this is that registry's typed form). Every row validates through `SiteIntelSourceSchema` at
// module load (a row that does not parse is a build error, not a runtime surprise).
//
// PROVENANCE: endpoints discovered via the NIPP register (registri.nipp.hr/api/izvori/, the
// Croatian NSDI source register, 1,686 sources) and probed live 2026-09-03. Transcripts:
// audit/europe-adapters-2/2026-09-02/hr-transcripts/PROBES.md.

import { SiteIntelSourceSchema, type SiteIntelSource } from '@pryzm/schemas';
import { HR_CP_WFS_BASE } from './hrWfsClient.js';

/** The parcel source-row id — the provenance every minted HR parcel cites. ONE constant. */
export const HR_PARCEL_SOURCE_ID = 'hr-dgu-dkp-cp-wfs';

/**
 * The HR source registry — every endpoint this adapter knows, each with its dated probe log.
 */
export const HR_SOURCES: readonly SiteIntelSource[] = [
    {
        // THE PARCEL CHANNEL (the deliverable) — simple-feature WFS behind the DGU INSPIRE WMS.
        id: HR_PARCEL_SOURCE_ID,
        country: 'HR',
        authority: 'Državna geodetska uprava (DGU) / Uređena zemlja',
        dataset: 'cp_wms:CP.CadastralParcel (Digitalni katastarski plan — simple cadastral parcels)',
        endpoint: HR_CP_WFS_BASE,
        protocol: 'WFS2',
        licence: {
            // NIPP src 1129 access condition: "uz registraciju i prihvaćanje uvjeta korištenja"
            // — yet the endpoint answered KEYLESS this session. YELLOW until the licence TEXT is
            // read (the sweep's "Licence id not captured — confirm at implementation").
            id: 'Croatia INSPIRE download-service terms (uz registraciju) — keyless in practice; confirm at implementation',
            colour: 'YELLOW',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1, // live keyless query; INSPIRE ATOM bulk (below) is the option-3 mirror path
        gate: null, // keyless in practice (register states registration; not enforced on this endpoint)
        theme: 'cadastre',
        coverage: 'national (Republika Hrvatska)',
        updateFrequency: null,
        adapterStatus: 'live',
        probes: [
            {
                date: '2026-09-03',
                note: 'lane HR: GetCapabilities 200 (WFS 2.0.0, cp_wms:CP.CadastralParcel + CP.CadastralZoning, DefaultCRS EPSG:3765), keyless. GetFeature @ Zagreb (WGS84 bbox urn:4326 lat,lon; no srsName → native 3765 out) → 1 Polygon: BROJ_CESTICE "2379" / MATICNI_BROJ_KO 335240 (k.o. CENTAR) / ID 21609461. Cross-confirmed via WMS GetFeatureInfo keyless.',
            },
        ],
    },
    {
        // THE STANDARDS INSPIRE channel — harmonized cp:CadastralParcel — currently DEGRADED.
        id: 'hr-dgu-dkp-inspire-cp-wfs',
        country: 'HR',
        authority: 'Državna geodetska uprava (DGU) / Uređena zemlja',
        dataset: 'cp:CadastralParcel (INSPIRE Cadastral Parcels 4.0 complex feature — nationalCadastralReference)',
        endpoint: 'https://api.uredjenazemlja.hr/services/inspire/cp/wfs',
        protocol: 'WFS2',
        licence: {
            id: 'Croatia INSPIRE download-service terms (uz registraciju) — confirm at implementation',
            colour: 'YELLOW',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        theme: 'cadastre',
        coverage: 'national (Republika Hrvatska)',
        updateFrequency: null,
        adapterStatus: 'blocked',
        probes: [
            {
                date: '2026-09-03',
                note: 'lane HR: GetCapabilities + DescribeFeatureType 200 keyless (standard INSPIRE cp 4.0 app-schema). But GetFeature → HTTP 400 ows:ExceptionReport "ORA-01000: maximum open cursors exceeded" on EVERY attempt incl. bare COUNT=1; 26 backoff retries over ~520 s never cleared — the app-schema→Oracle mapping saturates cursors. NOT usable; the adapter uses the simple cp_wms channel instead.',
            },
        ],
    },
    {
        // THE OPEN DKP BULK channel — INSPIRE ATOM, GREEN licence (the option-3 mirror).
        id: 'hr-dgu-dkp-atom',
        country: 'HR',
        authority: 'Državna geodetska uprava (DGU) / Uređena zemlja (OSS)',
        dataset: 'Digitalni katastarski plan — INSPIRE ATOM predefined-dataset feed (per cadastral municipality)',
        endpoint: 'https://oss.uredjenazemlja.hr/oss/public/atom/atom_feed.xml',
        protocol: 'ATOM',
        licence: {
            id: 'Otvorena dozvola (data.gov.hr Open Licence)',
            colour: 'GREEN',
            verifiedDate: null, // NIPP src 1712 names the open licence; licence text not yet read
            textRef: null,
        },
        accessOption: 3, // bulk download mirror (per-KO); not a point query
        gate: null,
        theme: 'cadastre',
        coverage: 'national (Republika Hrvatska), per cadastral municipality',
        updateFrequency: null,
        adapterStatus: 'documented',
        probes: [
            {
                date: '2026-09-03',
                note: 'lane HR: NIPP src 1712 "Digitalni katastarski plan - ATOM" names this feed under the data.gov.hr Otvorena dozvola (OPEN). Free bulk since June 2023 (sweep). Not wired — the point-query WFS above serves the click path; recorded here as the open-licence mirror.',
            },
        ],
    },
    {
        // ENVELOPE-GEOMETRY channel (the RULES half — NOTED for the rule-pack lane, NOT the parcel
        // deliverable). Screening-grade construction-area polygons; NOT a machine-readable rule pack.
        id: 'hr-mgipu-gradjevinska-podrucja-wfs',
        country: 'HR',
        authority: 'Ministarstvo prostornoga uređenja, graditeljstva i državne imovine (MPGI/MGIPU)',
        dataset: 'Građevinska područja (construction-area polygons — Gradj_podrucje_naselje + _izvan_naselja)',
        endpoint: 'https://gis4.mgipu.hr/srv1/GradjPodrucje_MGIPU_Public/wfs',
        protocol: 'WFS2',
        licence: {
            id: 'NIPP src 244 "Nema uvjeta za pristup i korištenje" (no conditions) — naselje set; izvan-naselja set says "zahtjev mailom"',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        theme: 'planning-envelope-screening',
        coverage: 'national (89,911 settlement construction-area polygons); vintage: plans in force Sept 2020',
        updateFrequency: null,
        adapterStatus: 'documented',
        probes: [
            {
                date: '2026-09-02',
                note: 'census (south-east): GetCapabilities 200 (WFS 2.0.0, EPSG:3765), GetFeature numberMatched 89911, real member gml:id Gradj_podrucje_naselje.765566 (jls_ime ŽUMBERAK, ozn_namjen GPN, ozn_ispu ref). ⚠ SCREENING-GRADE ONLY — register: interpretation of plans, "ne smiju [se] koristiti u svrhu izdavanja akata". A first-gate buildable mask, NEVER the legal envelope; the numeric provisions (odredbe) stay per-plan PDF.',
            },
        ],
    },
].map((row) => SiteIntelSourceSchema.parse(row));
