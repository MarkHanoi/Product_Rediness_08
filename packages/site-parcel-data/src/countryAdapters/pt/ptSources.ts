// LANE PT-ZONEID — PORTUGAL (PT) · the source-registry SEAM (the fr/lt/lu pattern: consume
// `sourceRegistry/pt.ts`, mint only what it lacks, through the registry's OWN loader).
//
// ⚠ NOT A SECOND SOURCE REGISTRY (C84 EI-9). `sourceRegistry/pt.ts` exists (the SNIC cadastre
// row) and records the DGT LiDAR nDSM as an HONEST ABSENCE awaiting its probe. The CRUS row is
// minted HERE because ITS probe is now dated and executed (2026-09-02, twice — the shape-pinning
// pass and the inheriting lane's live re-probe, byte-identical), and its migration into
// `sourceRegistry/pt.ts` is queued for the orchestrator in
// `audit/demo-esfrpt/2026-09-02/barrel-additions-pt-zoneid.txt` (barrel protocol — this lane may
// not edit sourceRegistry/*). When that lands, delete this literal and re-export the registry's
// row — do NOT leave two (the FR/LU/LT lanes left the same instruction, verbatim, for the same
// reason).
//
// ⭐ THE SECONDARY WITNESS THAT IS DELIBERATELY NOT A ROW: the per-DICOFRE Hexagon WFS family
// (`servicos.dgterritorio.pt/SDISNITWFSCRUS_<DTCC>_1/WFService.aspx`, recon §4.7 —
// VERIFIED-LIVE at 1312/1106 but 132–204 s per request, one hard 502, per-município FeatureType
// names). It serves the SAME CRUS records (Porto's `registo_ou_deposito` came back byte-identical
// across both channels) with FEWER fields (no `registo_ou_deposito`, no `situacao_pdm`), so a row
// for it would advertise a channel no resolver should prefer; it stays documented in
// `ptCrusClient.ts`'s header and the recon, not registered. Two channels answering one question
// would need a disagreement policy nobody has specified.

import type { SiteIntelSource } from '@pryzm/schemas';
import { defineSources } from '../../sourceRegistry/defineSources.js';
import { PT_CRUS_OGCAPI_ENDPOINT } from './ptCrusClient.js';

/** The CRUS source-row id — the `source` every PT zone identity / refusal cites. */
export const PT_CRUS_SOURCE_ID = 'pt-dgt-crus-ogcapi';

/**
 * The additive row. ONE row, deliberately: the `crus` collection is one national service with
 * one licence, one authority and one transport. The numeric PDM parameters are NOT here and not
 * anywhere structured (pt/LEGISLATION-RATE.md ~0 %) — this source serves IDENTITY ONLY, which is
 * exactly what the adapter's refusal-only output type can honestly represent.
 */
export const PT_ADAPTER_SOURCES: readonly SiteIntelSource[] = defineSources('PT', [
    {
        id: PT_CRUS_SOURCE_ID,
        country: 'PT',
        authority: 'DGT — Direção-Geral do Território',
        dataset:
            'CRUS — Carta do Regime de Uso do Solo, Portugal Continental (harmonised national ' +
            'transcription of every município\'s Planta de Ordenamento; DR n.º 15/2015 vocabulary). ' +
            'OGC API — Features collection `crus`: per-polygon dtcc, municipio, ' +
            'classificacao_e_qualificacao (verbatim designation), classe_2021, categoria_2021, ' +
            'escala_origem, fonte, area_ha, autor, data_pub_origem, registo_ou_deposito (SNIT ' +
            'legal-deposit ref of the PDM), situacao_pdm (in-force stamp), codigo. GEOMETRY + ' +
            'CATEGORY ONLY — no numeric planning parameter exists on any field (the numbers live ' +
            'in each município\'s Regulamento PDF). Storage EPSG:3763, items served CRS84 [lon,lat]. ' +
            'Slow secondary witness (NOT registered, see header): per-DICOFRE Hexagon WFS family ' +
            'SDISNITWFSCRUS_<DTCC>_1, same records, fewer fields, 132–204 s/request.',
        endpoint: PT_CRUS_OGCAPI_ENDPOINT,
        protocol: 'OGCAPI',
        licence: {
            id: 'CC-BY-4.0 (SNIG record 517c5023-04cc-47a4-99f7-bb32814dd62f; licence text read 2026-09-02)',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1, // live per-point query, keyless
        gate: null,
        probes: [
            {
                date: '2026-09-02',
                note:
                    'shape-pinning pass: collection metadata → "CRUS Portugal Continental", storageCrs ' +
                    'EPSG:3763; point-bbox items ×5 — Lisboa Baixa (38.7223,−9.1393) → 2 features (zone ' +
                    'boundary through the block; containment pick REQUIRED), Porto Aliados-W (41.1579,' +
                    '−8.6291) → "Solo Urbano  – Espaços verdes e Frente atlântica e ribeirinha – Área ' +
                    'verde de fruição coletiva" (dtcc 1312, registo 01.13.12/PDM/03/2021/93, Vigente), ' +
                    'Évora (38.5667,−7.9000) → "Solo Urbano - Espaços habitacionais" (dtcc 0705), rural ' +
                    'Alentejo (38.60,−8.10) → "Solo Rústico - Espaços de proteção ambiental - Zona de ' +
                    'Especial Valor Patrimonial", Atlantic (38.50,−9.90) → 0 features (the honest sea ' +
                    'zero). 0.27–0.83 s/query. TRANSIENT IS REAL: first metadata GET of the day answered ' +
                    '502 Proxy Error (HTML), retry 200 in 0.19 s. Porto registo_ou_deposito byte-matches ' +
                    'the recon §4.4 WMS probe (IDDEPOSITO) — cross-channel identity witness.',
            },
            {
                date: '2026-09-02',
                note:
                    'inheritance re-probe (lane PT-ZONEID-FINISH): Porto point re-fetched live before ' +
                    'building on the pinned shapes — HTTP 200 in 0.97 s, fid 134801, all 14 property ' +
                    'keys and every verbatim value (en-dashes, doubled space included) byte-identical ' +
                    'to the pinned body. Pin CONFIRMED.',
            },
        ],
        theme: 'planning',
        coverage:
            'Portugal Continental only (Açores/Madeira run their own regimes — matches the ' +
            'PORTUGAL_BBOX mainland routing gate). Per-município completeness follows each PDM\'s ' +
            'CRUS transcription; a served zero inside the mainland is a genuine absence, not an outage.',
        updateFrequency: null,
        adapterStatus:
            'wired node/server-side (countryAdapters/pt); browser same-origin proxy /api/pt/crus NOT ' +
            'yet mounted — browser callers refuse endpoint-unreachable until it lands',
    },
]);
