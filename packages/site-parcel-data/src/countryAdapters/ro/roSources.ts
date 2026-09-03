// LANE RO — ROMANIA (RO) · source discovery: the §J `sources(): SourceDescriptor[]` leg, typed as
// E1a `SiteIntelSource` rows with dated probe logs. Validated through `SiteIntelSourceSchema` at
// module load (a source row that does not parse is a build error, not a runtime surprise).
//
// ONE ROW, and it is the DEFERRED cadastre. The ANCPI geoportal is the national cadastral source
// (INSPIRE Cadastral Parcel + Construcții, GeoJSON over ArcGIS Server); this lane could not exercise
// it because the host does not resolve (GATE 1, roAncpiGate.ts). The row records that honestly: the
// endpoint is the DOCUMENTED pin, the probe log is the MEASURED NXDOMAIN, `adapterStatus` is
// `deferred-stub`.
//
// ⚠ LICENCE COLOUR = YELLOW, verifiedDate = null. The rest-of-europe sweep
// (audit/europe-site-intel/2026-08-31/lanes/rest-of-europe-sweep.md, RO row) recorded "Licence
// terms not captured" for ANCPI and rated the cadastre YELLOW-GREEN on access. The schema colour
// is a closed GREEN/YELLOW/RED enum with no UNKNOWN, so the honest pick under "terms not read yet"
// is YELLOW with `verifiedDate: null` — never GREEN, which would assert a licence nobody has read.
//
// ⚠ NO row is minted for the MDLPA Date Locale GIS-PUG norms (datelocale.mdlpa.ro). That page is a
// STANDARD DOCUMENT (v1.1/15.07.2024), not a served dataset — it prescribes structured slots for
// NEW plans but serves no plan geometry — so it is not a `SiteIntelSource` (which types data
// endpoints). It is recorded in prose on the applicability ladder (ro/index.ts) as the emerging
// rules channel, per the honest no-rule-pack path.

import { SiteIntelSourceSchema, type SiteIntelSource } from '@pryzm/schemas';
import { RO_ANCPI_ENDPOINTS } from './roAncpiGate.js';

/**
 * The ANCPI cadastre source-row id — the `source` a future minted RO Parcel would cite
 * (`SiteIntelParcel.source` → `SiteIntelSource.id`). ONE constant so the registry row, the parcel
 * provider's `source` tag and the minted entities cannot drift apart.
 */
export const RO_ANCPI_SOURCE_ID = 'ro-ancpi-eterra3-cadastre';

/**
 * The RO source registry — the national cadastre, DEFERRED. Every field is either MEASURED
 * (the probe log) or DOCUMENTED-and-labelled (the endpoint), never assumed.
 */
export const RO_SOURCES: readonly SiteIntelSource[] = [
    {
        id: RO_ANCPI_SOURCE_ID,
        country: 'RO',
        authority: 'ANCPI (Agenția Națională de Cadastru și Publicitate Imobiliară)',
        dataset:
            'INSPIRE Cadastral Parcel (Parcele cadastrale, eterra3_publish MapServer layer 1) + ' +
            'Buildings (Construcții, layer 0); INSPIRE_ID-keyed, GeoJSON over ArcGIS Server 10.8',
        endpoint: RO_ANCPI_ENDPOINTS.eterra3Parcels,
        protocol: 'REST',
        licence: {
            id: 'ANCPI geoportal terms (not captured — see sweep RO row)',
            colour: 'YELLOW',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1, // query dynamically; do NOT mirror — systematic registration is incomplete
        gate: null, // no CREDENTIAL gate documented (keyless when reachable); the block is DNS reachability, in the probes
        probes: [
            {
                date: '2026-09-02',
                note:
                    'LANE RO gate probe: geoportal.ancpi.ro NXDOMAIN @ Google (8.8.8.8) AND Cloudflare ' +
                    '(1.1.1.1) DoH (Status 3); curl eterra3_publish/MapServer/1/query + CP_View/MapServer/1 ' +
                    'both curl exit 6 (could not resolve host). CONTROL: apex ancpi.ro Status 0 → ' +
                    '104.18.9.54/104.18.8.54 (zone live, subdomain absent).',
            },
            {
                date: '2026-09-03',
                note:
                    'LANE RO re-probe (2 days later, still open): curl geoportal.ancpi.ro exit 6; Google ' +
                    'DoH {"Status":3} SOA iris.ns.cloudflare.com; CONTROL www.ancpi.ro {"Status":0} → ' +
                    '104.18.9.54/104.18.8.54. Endpoint DOCUMENTED from tangojo/ancpi-wrapper-cli + ' +
                    'notes.alinpanaitiu.com (INSPIRE_ID, f=geojson); NOT measured — no served bytes.',
            },
        ],
        theme: 'cadastre',
        coverage:
            'national but INCOMPLETE — systematic (sporadic) land registration not complete; ' +
            'queryable ≠ complete per AOI (sweep RO caveat)',
        updateFrequency: null,
        adapterStatus: 'deferred-stub', // GATE 1 (service NXDOMAIN) + GATE 2 (RO not in resolver)
    },
].map((row) => SiteIntelSourceSchema.parse(row));
