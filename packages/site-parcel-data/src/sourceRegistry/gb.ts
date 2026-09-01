// SOURCE REGISTRY — UNITED KINGDOM (GB). Seeded 2026-09-01 from the L5 sweep lane, verbatim
// (supplement §7). REPORT §F spells this row "UK"; ISO 3166-1 alpha-2 (the schema's country
// regex) is "GB" — the index carries the alias, the rows carry GB.
//
// HONEST ABSENCES:
//   • HMLR INSPIRE Index Polygons (registry.ts gb-os-inspire) — OWNERSHIP index extents with
//     GENERAL boundaries, per-LPA ATOM/GML download; registry.ts marks it
//     CONVERGENT-SECONDARY ("endpoint + OGL redistribution NOT live-probed") and the sweep
//     grades UK cadastre "YELLOW overall". No probed endpoint URL exists in the prose
//     registries — no row until the probe.
//   • OS MasterMap / Building Heights — commercial, "RED — skip" (§G; derive from EA LiDAR
//     instead). Deliberately never seeded.
//   • Scotland (RoS/ScotLIS) — access + licence gate, DNS-dead INSPIRE hosts (registry.ts
//     gb-sct-ros probe 2026-07-31); NEEDS A CREDENTIAL, no row.

import { defineSources } from './defineSources.js';

export const GB_SOURCES = defineSources('GB', [
    {
        id: 'gb-planning-data-designations',
        country: 'GB',
        authority: 'MHCLG (planning.data.gov.uk)',
        dataset: '108 designation datasets (conservation areas, green belt, listed buildings, article 4, TPOs, local plan boundaries, design codes …) — API + bulk',
        endpoint: 'https://www.planning.data.gov.uk/',
        protocol: 'REST',
        licence: { id: 'OGL-v3 (L5 sweep UK: GREEN (OGL))', colour: 'GREEN', verifiedDate: null, textRef: null },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note: 'L5 sweep UK PROBED: live, 108 datasets. FEATURE-LEVEL probe: entity.json?dataset=conservation-area&limit=1 → real entity (Napsbury, designated 1996) with MULTIPOLYGON + point + quality "authoritative"; dataset total 10,994 conservation areas. Local plan POLICIES remain PDF/HTML — the discretionary system means no by-right numeric envelope exists to extract (structural, not a data gap).',
            },
        ],
        theme: 'planning',
        coverage: 'England only, self-declared incomplete (L5 sweep UK)',
        updateFrequency: null,
        adapterStatus: 'documented',
    },
]);
