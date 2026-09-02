// LANE FR-ZONEID — FRANCE (FR) · the source-registry SEAM (the lt/lu pattern: consume
// `sourceRegistry/fr.ts`, mint only what it lacks, through the registry's OWN loader).
//
// ⚠ NOT A SECOND SOURCE REGISTRY (C84 EI-9). `sourceRegistry/fr.ts` exists (parcellaire
// express + BD TOPO rows) and its header records the GPU as an HONEST ABSENCE: "the GPU …
// has no endpoint-level probe row in the prose registries this seed copies — it waits for
// its probe." **The probe is now dated and executed** (2026-08-31 lane FR-1 ×3 points;
// 2026-09-01 E8 scout ×6 cities; 2026-09-02 this lane ×5 points incl. the CC and RNU rungs
// and the sea control), so the row is minted HERE, and its migration into
// `sourceRegistry/fr.ts` is queued for the orchestrator in
// `audit/demo-esfrpt/2026-09-02/barrel-additions-fr-zoneid.txt` (barrel protocol — this
// lane may not edit sourceRegistry/*). When that lands, delete this literal and re-export
// the registry's row — do NOT leave two (the LU/LT lanes left the same instruction).

import type { SiteIntelSource } from '@pryzm/schemas';
import { defineSources } from '../../sourceRegistry/defineSources.js';
import { FR_GPU_APICARTO_BASE } from './frGpuClient.js';

/** The GPU source-row id — the `source` every FR zone identity / refusal cites. */
export const FR_GPU_SOURCE_ID = 'fr-gpu-apicarto-du';

/**
 * The additive row. ONE row, deliberately: zone-urba, secteur-cc and municipality are three
 * modules of ONE national service (the Géoportail de l'urbanisme via API Carto) with one
 * licence, one authority and one transport — splitting them would invent a source
 * multiplicity the state does not have (the LU precedent).
 */
export const FR_ADAPTER_SOURCES: readonly SiteIntelSource[] = defineSources('FR', [
    {
        id: FR_GPU_SOURCE_ID,
        country: 'FR',
        authority: "IGN / Géoportail de l'urbanisme (DGALN)",
        dataset:
            'GPU documents d\'urbanisme — API Carto modules zone-urba (PLU/PLUi/POS/PSMV zones: ' +
            'libelle, typezone, idurba, nomfic/urlfic), secteur-cc (carte communale sectors) and ' +
            'municipality (commune + is_rnu flag). Identity + document metadata ONLY — the numeric ' +
            'articles live in the règlement PDF (E8 reader). REST dialect: API Carto GeoJSON ' +
            'point-in-polygon; bulk sibling is WFS data.geopf.fr wfs_du:* (5,000-feature cap).',
        endpoint: FR_GPU_APICARTO_BASE,
        protocol: 'REST',
        licence: {
            id: 'Licence Ouverte / Etalab 2.0 — attribution (IGN Géoplateforme / GPU)',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1, // live per-point query, keyless
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note:
                    'lane FR-1: zone-urba ×3 — Paris Marais → US "Zone urbaine Sauvegardée" (PSMV_75056_A); ' +
                    'Paris 11e → UG, idurba 75056_PLU_20260616; Lyon Presqu\'île → UCe1b, idurba ' +
                    '200046977_PLUI_20260326. Upload mandatory since 2020-01-01 for new/revised documents; ' +
                    'no national percent-covered figure found — record coverage per-département at bake time.',
            },
            {
                date: '2026-09-01',
                note:
                    'E8 scout: zone-urba 6/6 cities (idurba+nomfic 6/6 national); urlfic 3/6 and per-zone ' +
                    'addressable 1/6 (Marseille #page=80 on urlfic; Nice #page=64 on nomfic) — naming ≠ ' +
                    'addressing; parse #page off EITHER field.',
            },
            {
                date: '2026-09-02',
                note:
                    'FR-ZONEID lane, 5 points live: Lyon (45.7640,4.8357) zone-urba → UCe1b/U, idurba ' +
                    '200046977_PLUI_20260326, partition DU_200046977, urlfic "" ; rural Auvergne ' +
                    '(45.5636,3.1856) zone-urba → 0 features BUT secteur-cc → libelle "N", typesect "03", ' +
                    'idurba 63268_CC_20190221 (Pardines) — zone-urba alone misreads CC communes; Solignat ' +
                    '(insee 63422) municipality → is_rnu:true (RNU is an answer, not a gap); Golfe du Lion ' +
                    'sea point (42.90,3.60) municipality → 0 features (honest absent). Zero features arrives ' +
                    'HTTP 200 {"features":[],"totalFeatures":0} — an EMPTY, never conflated with a failure.',
            },
        ],
        theme: 'zoning',
        coverage: 'national (metropolitan; documents uploaded to the GPU — RNU communes answer via is_rnu)',
        updateFrequency: null,
        adapterStatus: 'server-leg (countryAdapters/fr; browser proxy not yet wired — C57 CSP)',
    },
]);
