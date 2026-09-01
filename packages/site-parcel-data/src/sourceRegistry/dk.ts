// SOURCE REGISTRY — DENMARK (DK). Seeded 2026-09-01 from the prose registries, verbatim
// (supplement §7): server/jurisdiction/plandataZoningProxy.js + providers/ByggefeltProducer.ts
// (Plandata endpoint, wired), heightSources.mjs `geodanmark` row, parcelProviders/registry.ts
// DK row (L-449 deferred stub), REPORT §F DK / §G DK rows. Licence colour per §G:
// "DK (Plandata, DAWA, Datafordeler) | CC BY 4.0 | GREEN | Keyless critical path;
// Datafordeler key server-side".

import { defineSources } from './defineSources.js';

export const DK_SOURCES = defineSources('DK', [
    {
        id: 'dk-plandata-wfs',
        country: 'DK',
        authority: 'Plan- og Landdistriktsstyrelsen (Plandata.dk)',
        dataset: 'Plandata WFS (lokalplaner / kommuneplanrammer / byggefelter — the signed offline-legislation input)',
        endpoint: 'https://geoserver.plandata.dk/geoserver/wfs',
        protocol: 'WFS2',
        licence: { id: 'CC-BY-4.0', colour: 'GREEN', verifiedDate: null, textRef: null },
        accessOption: 1,
        gate: null, // §G: keyless critical path
        probes: [
            {
                date: '2026-08-31',
                note: 'REPORT §F DK row (L2 lane): keyless Plandata + DAWA; fill measured 30.6/43.1/60.8% by layer + 100% doklink + BR18 defaults; byggefelt geometry unique. Endpoint verbatim from the wired ByggefeltProducer/plandataZoningProxy.',
            },
        ],
        theme: 'planning',
        coverage: 'national; per-layer numeric fill 30.6/43.1/60.8% (measured, REPORT §F DK row)',
        updateFrequency: null,
        adapterStatus: 'live', // wired: plandataZoningProxy + ByggefeltProducer (signed offline legislation)
    },
    {
        id: 'dk-datafordeler-geodanmark-wfs',
        country: 'DK',
        authority: 'SDFI Datafordeler (GeoDanmark + DHM)',
        dataset: 'GeoDanmark60_NOHIST_GML3 gdk60:Bygning (footprints) + DHM dhm_overflade/dhm_terraen nDSM (WCS 1.0.0 dialect, same key)',
        endpoint: 'https://wfs.datafordeler.dk/GeoDanmarkVektor/GeoDanmark60_NOHIST_GML3/1.0.0/WFS',
        protocol: 'WFS2',
        licence: { id: 'CC-BY-4.0', colour: 'GREEN', verifiedDate: null, textRef: null },
        accessOption: 1,
        gate: 'DATAFORDELER_API_KEY (&apikey= — Basic Auth RETIRED, git 1fc5bc8b; HTTP 401 without a key)',
        probes: [
            {
                date: '2026-07-25',
                note: 'heightSources.mjs geodanmark (impl:live): gdk60:Bygning carries NO scalar height — VERIFIED against the Datafordeler objekttypekatalog; real LoD1 height BUILT via DHM nDSM P90 over the eroded footprint (fetchGeoDanmarkHeights).',
            },
        ],
        theme: 'buildings',
        coverage: 'full (heightSources coverage:full)',
        updateFrequency: null,
        adapterStatus: 'live',
    },
    {
        id: 'dk-datafordeler-matriklen-wfs',
        country: 'DK',
        authority: 'SDFI Datafordeler (Matriklen)',
        dataset: 'Matrikel WFS mat:Jordstykke, EPSG:25832',
        endpoint: 'https://wfs.datafordeler.dk/MAT/MAT_WFS/1.0.0/WFS',
        protocol: 'WFS2',
        licence: { id: 'CC-BY-4.0', colour: 'GREEN', verifiedDate: null, textRef: null },
        accessOption: 1,
        gate: 'Datafordeler ADMIN bootstrap requires a Danish MitID identity — unobtainable (L-449, founder-ruled 2026-07-30; same access class as SE BankID)',
        probes: [
            {
                date: '2026-07-30',
                note: 'registry.ts matrikel-dk (L-449 founder ruling): DEFERRED STUB — the provider never attempts live access and returns null → OSM footprint, honestly labelled. Single method-body swap-in when access lands.',
            },
        ],
        theme: 'cadastre',
        coverage: 'national (when access lands)',
        updateFrequency: null,
        adapterStatus: 'deferred-stub',
    },
]);
