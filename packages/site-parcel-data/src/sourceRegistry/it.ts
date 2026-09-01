// SOURCE REGISTRY — ITALY (IT). Seeded 2026-09-01 from the prose registries + the L5 sweep
// lane, verbatim (supplement §7): parcelProviders/registry.ts `agenzia-entrate` row + sweep
// IT ("Class A+C+D · GREEN · option 1/2 … the WFS is verified-live but still documented/
// unwired in parcelProviders/registry.ts").
//
// HONEST ABSENCES: no national building-height product exists (heightSources.mjs
// piedmont_it: "Only Piedmont/Turin has a real layer; Rome/Milan = no-source — structural
// gap, not a currency lag"); regional PGT/PRG planning mosaics are DOC-level in the sweep
// (no dated endpoint probes); numeric parameters are NTA-PDF-locked (~9-11% structured fill).

import { defineSources } from './defineSources.js';

export const IT_SOURCES = defineSources('IT', [
    {
        id: 'it-agenzia-entrate-inspire-wfs',
        country: 'IT',
        authority: 'Agenzia delle Entrate (Cartografia Catastale)',
        dataset: 'CP:CadastralParcel + CP:CadastralZoning ONLY (no buildings/addresses on the WFS), default CRS EPSG:6706 (ETRS89 ≈ WGS84 at BIM scale)',
        endpoint: 'https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php',
        protocol: 'WFS2',
        licence: { id: 'CC-BY-4.0 (declared; L5 sweep IT: GREEN)', colour: 'GREEN', verifiedDate: null, textRef: null },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-07-24',
                note: 'registry.ts agenzia-entrate: keyless CC BY 4.0, verified-live (Rome/H501, Milan/F205, Turin/L219). AP Trento + Bolzano excluded (own Catasto tavolare / Libro Fondiario).',
            },
            {
                date: '2026-08-31',
                note: 'L5 sweep IT RE-PROBED: GetCapabilities live, WFS 2.0.0; CP:CadastralParcel + CP:CadastralZoning only; national bulk of parcels+addresses since Feb 2025 (>85M parcels); geometry not survey-grade (internal caveat).',
            },
        ],
        theme: 'cadastre',
        coverage: 'national EXCEPT autonomous provinces Trento/Bolzano (own systems — hard exclusion, separate adapters)',
        updateFrequency: null,
        adapterStatus: 'documented', // sweep verbatim: verified-live but proxy /api/parcel/it not yet wired server-side
    },
]);
