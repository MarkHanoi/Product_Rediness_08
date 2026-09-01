// SOURCE REGISTRY — GERMANY (DE). Seeded 2026-09-01 from the prose registries, verbatim
// (supplement §7): parcelProviders/registry.ts `alkis-nrw` row + tools/context-bake/
// heightSources.mjs `lod2de`/`lod2de_nrw` rows + REPORT §F DE / §G DE rows. Licence colour
// per REPORT §G: DL-DE-BY-2.0 GREEN ×15 Länder — with the §G Bavaria caveat carried on the
// rows, never dropped.
//
// HONEST ABSENCES (rows NOT seeded, and why):
//   • ALKIS outside NRW — per-Land licence-gated, no keyless national WFS (registry.ts DE
//     footprint-fallback row); no per-Land endpoint probed in the prose registries.
//   • BKG national LoD2 aggregate — CLOSED (§G: "federate the 15 Land downloads").
//   • XPlanung plan WFS — §F DE row records the 82k-plan NRW document index, but no
//     endpoint-level probe row exists in the prose registries this seed is allowed to copy.

import { defineSources } from './defineSources.js';

export const DE_SOURCES = defineSources('DE', [
    {
        id: 'de-nrw-alkis-wfs',
        country: 'DE',
        authority: 'GeoBasis NRW',
        dataset: 'ALKIS vereinfacht (ave:Flurstueck) — WFS 2.0, GML 3.2.1, EPSG:25832',
        endpoint: 'https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht',
        protocol: 'WFS2',
        licence: {
            id: 'DL-DE-BY-2.0',
            colour: 'GREEN',
            verifiedDate: null, // §G grades GREEN ×15 Länder; no dated licence-text read recorded
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-07-24',
                note: 'registry.ts alkis-nrw (live-probe evidence 2026-07-24): HTTP 200 GML 3.2.1, real Flurstück (flstkennz 05311000400273, 2355 m² @ Düsseldorf), keyless. Other German Länder are per-Land licence-gated → footprint fallback.',
            },
        ],
        theme: 'cadastre',
        coverage:
            'NRW only. §G DE row: DL-DE-BY-2.0 mostly, keyless 15/16 Länder — Bavaria ALKIS contract-gated (YELLOW/RED, re-verify at ship, EU HVD pressure).',
        updateFrequency: null,
        adapterStatus: 'live', // wired as parcelProviders/registry.ts `alkis-nrw`, proxy /api/parcel/de-nrw
    },
    {
        id: 'de-nrw-lod2-citygml-tiles',
        country: 'DE',
        authority: 'GeoBasis NRW (opengeodata.nrw.de)',
        dataset: 'LoD2-DE NRW — CityGML bldg:measuredHeight (m) + bldg:roofType, ETRS89/UTM32, 1 km tiles',
        endpoint: 'https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/',
        protocol: 'bulk',
        licence: { id: 'DL-DE-BY-2.0', colour: 'GREEN', verifiedDate: null, textRef: null },
        accessOption: 3,
        gate: null,
        probes: [
            {
                date: '2026-07-25',
                note: 'heightSources.mjs lod2de_nrw (impl:live): keyless open tile service, 35,022 × 1 km CityGML tiles + index.json; footprint ingest BUILT 2026-07-25 (GroundSurface posList → WGS84 rings + measuredHeight + roofType).',
            },
        ],
        theme: 'buildings',
        coverage:
            'NRW full (heightSources coverage:full). National LoD2-DE ~58M buildings is per-Land licence routing (NRW/Berlin/BW/Sachsen-Anhalt open; Bavaria/Hamburg TBD) — heightSources.mjs lod2de row, impl:documented.',
        updateFrequency: null,
        adapterStatus: 'live',
    },
]);
