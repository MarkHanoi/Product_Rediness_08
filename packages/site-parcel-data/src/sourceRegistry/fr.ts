// SOURCE REGISTRY — FRANCE (FR). Seeded 2026-09-01 from the prose registries, verbatim
// (supplement §7): parcelProviders/registry.ts `ign-fr` row + heightSources.mjs `bdtopo`
// row + REPORT §F FR / §G FR row ("FR IGN / GPU / cadastre | Licence Ouverte / Etalab 2.0 |
// GREEN | Attribution; cadastre not survey-precise").
//
// HONEST ABSENCE: the GPU (Géoportail de l'Urbanisme — §F FR row: "GPU serves 2026 PLUs in
// weeks; prescription geometry direct incl. height-ceiling polygons") has no endpoint-level
// probe row in the prose registries this seed copies — it waits for its probe.

import { defineSources } from './defineSources.js';

export const FR_SOURCES = defineSources('FR', [
    {
        id: 'fr-ign-parcellaire-express-wfs',
        country: 'FR',
        authority: 'IGN (Géoplateforme)',
        dataset: 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle',
        endpoint: 'https://data.geopf.fr/wfs/ows',
        protocol: 'WFS2',
        licence: {
            id: 'Licence Ouverte / Etalab 2.0 — attribution; cadastre not survey-precise (§G FR row)',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-07-24',
                note: 'registry.ts ign-fr (live-probe evidence 2026-07-24): HTTP 200 application/json, real MultiPolygon (idu 75104000AE0003 @ Paris), keyless.',
            },
        ],
        theme: 'cadastre',
        coverage: 'national',
        updateFrequency: null,
        adapterStatus: 'live', // wired, proxy /api/parcel/fr
    },
    {
        id: 'fr-ign-bdtopo-batiment-wfs',
        country: 'FR',
        authority: 'IGN (Géoplateforme)',
        dataset: 'BD TOPO® batiment — hauteur (m, photogrammetry/LiDAR) + nombre_d_etages (storeys)',
        endpoint: 'https://data.geopf.fr/wfs/ows',
        protocol: 'WFS2',
        licence: { id: 'Licence Ouverte / Etalab 2.0', colour: 'GREEN', verifiedDate: null, textRef: null },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-09-01',
                note: 'REG seed (no dated live probe in the prose source): heightSources.mjs bdtopo (impl:live) — WFS 2.0 returns GeoJSON in EPSG:4326 directly, fully wireable, no reprojection; provenance tagged.',
            },
        ],
        theme: 'buildings',
        coverage: null,
        updateFrequency: null,
        adapterStatus: 'live',
    },
]);
