// SOURCE REGISTRY — FINLAND (FI). Seeded 2026-09-01 from the prose registries + the L5
// sweep lane, verbatim (supplement §7): parcelProviders/registry.ts `mml` row (endpoint from
// mmlParcelProvider.ts, the module the registry row routes to) + sweep FI ("MML OGC API
// Features, open tier CC BY 4.0, free self-service API key … Class A+C · GREEN"; Ryhti
// probe).

import { defineSources } from './defineSources.js';

export const FI_SOURCES = defineSources('FI', [
    {
        id: 'fi-mml-kiinteisto-ogcapi',
        country: 'FI',
        authority: 'Maanmittauslaitos (MML / NLS)',
        dataset: 'kiinteisto-avoin simple-features v3 — PalstanSijaintitiedot (parcel location), EPSG:3067',
        endpoint: 'https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3',
        protocol: 'OGCAPI',
        licence: {
            id: 'CC-BY-4.0 (open tier — L5 sweep FI)',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: 'free self-service MML_API_KEY (create at omatili.maanmittauslaitos.fi) carried server-side as HTTP Basic — key as username, blank password (registry.ts mml row)',
        probes: [
            {
                date: '2026-07-25',
                note: 'L5 sweep FI: INTERNAL verified 2026-07-25 (GEO-DATA-SOURCING-MASTER founder-action #2 + fi/findings/FINLAND-MASTER-DATA-SOURCE-STUDY.md). registry.ts mml row: resolves real Finnish parcels once the key is set; else null → OSM footprint. Åland excluded (own registry).',
            },
        ],
        theme: 'cadastre',
        coverage: 'national, Åland excluded (separate jurisdiction)',
        updateFrequency: null,
        adapterStatus: 'documented', // registry row + proxy /api/parcel/fi exist; key-gated until MML_API_KEY is set
    },
    {
        id: 'fi-ryhti-plan-ogcapi',
        country: 'FI',
        authority: 'SYKE (Ryhti — built-environment information system)',
        dataset: 'ryhti_plan OGC API Features — plan collections (kaavatietomalli rollout phased through 2026)',
        endpoint: 'https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1/collections',
        protocol: 'OGCAPI',
        licence: { id: 'CC-BY-4.0 (L5 sweep FI probe)', colour: 'GREEN', verifiedDate: null, textRef: null },
        accessOption: 1,
        gate: null, // the OPEN channel is anonymous; non-open products sit behind a data-permit route (ryhti@syke.fi)
        probes: [
            {
                date: '2026-08-31',
                note: 'L5 sweep FI PROBED: LIVE, ANONYMOUS, CC BY 4.0 — but the four open collections are plan INDEX layers (asemakaava/yleiskaava hakemisto + in-preparation indexes), NOT the structured kaavatietomalli plan objects; regulation-level open serving is not yet claimable from this channel.',
            },
        ],
        theme: 'planning',
        coverage: 'index layers only via the open channel; ~55-65% structured fill in Ryhti-live regions vs ~30-35% elsewhere (fi/LEGISLATION-RATE.md estimate)',
        updateFrequency: null,
        adapterStatus: 'documented',
    },
]);
