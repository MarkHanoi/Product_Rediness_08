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
            {
                date: '2026-09-01',
                note: 'LANE DK re-pin, anonymous (no key, no token, no auth header): both baseline parcels answered. CPH 12.5530,55.6940 -> ramme R24.B.3.40 bebygpct=150 bebygpctaf=4 maxbygnhjd=24 planstatus=V datoikraft=20241212, lokalplan layer 0 features (genuine absence). Aarhus 10.2107,56.1572 -> ramme 010109CY bebygpct=180 bebygpctaf=1 maxetager=4 eareal=16800 datoikraft=20260119 + lokalplan 591 all-dimensional-nulls kompleks=false SERVED. AXIS: a lon,lat bbox answers; the lat,lon bbox returns 0 features SILENTLY on every layer (HTTP 200) - a wrong axis order must never read as "no plan here". Wrong layer name -> HTTP 400 ows:ExceptionReport naming the layer. bebygpctaf national fill (resulttype=hits): served on 99.8/100.0/100.0% of populated bebygpct; parcel-scoped (codes 3+4) only 15.2/15.5/28.1% by layer.',
            },
        ],
        theme: 'planning',
        coverage: 'national; per-layer numeric fill 30.6/43.1/60.8% (measured, REPORT §F DK row)',
        updateFrequency: null,
        adapterStatus: 'live', // wired: plandataZoningProxy + ByggefeltProducer (signed offline legislation)
    },
    {
        // LANE DK 2026-09-01 — the KEYLESS parcel side-door. The critical path's parcel step
        // needs no key at all; only Datafordeler (the two rows below) is gated. Seeded here,
        // and NOT re-minted inside the country adapter — one registry, one row per source.
        id: 'dk-dawa-jordstykker',
        country: 'DK',
        authority: 'SDFI / Dataforsyningen (DAWA - Danmarks Adressers Web API)',
        dataset: 'jordstykker (cadastral parcel at a WGS84 point: matrikelnr + ejerlav + kommune + BFE + registreretareal + vejareal)',
        endpoint: 'https://api.dataforsyningen.dk/jordstykker',
        protocol: 'REST',
        licence: { id: 'CC-BY-4.0', colour: 'GREEN', verifiedDate: '2026-08-31', textRef: null },
        accessOption: 1,
        gate: null, // keyless - probed anonymously twice
        probes: [
            {
                date: '2026-08-31',
                note: 'lane 2 §DK-4: keyless parcel lookup probed CPH + Aarhus (matrikelnr, ejerlav, kommune, BFE). WARNING its sibling `bygninger` endpoint answered HTTP 200 with an EMPTY array at two central-CPH points - NOT reliable for buildings; buildings come from BBR/GeoDanmark (keyed rows below).',
            },
            {
                date: '2026-09-01',
                note: 'LANE DK live: x=12.5530&y=55.6940 -> matr. 4801 Udenbys Klaedebo Kvarter (ejerlav 2000173), kommune 0101 Koebenhavn, BFE 6021259, registreretareal 3776 m2, vejareal 0. x=10.2107&y=56.1572 -> matr. 7000ad Aarhus Bygrunde (ejerlav 2006351), kommune 0751, BFE 5625716, registreretareal 8293 m2, vejareal 8293 (vejareal == registreretareal: a ROAD parcel, as the 20-parcel table records).',
            },
        ],
        theme: 'cadastre',
        coverage: 'national (parcel-at-point); keyless',
        updateFrequency: null,
        adapterStatus: 'live', // countryAdapters/dk/dkParcelProvider.ts
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
