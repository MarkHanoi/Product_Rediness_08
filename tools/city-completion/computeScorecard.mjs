#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// C63 CITY-COMPLETION SCORECARD — the IMPURE compute function (L-648, Phase-4 enabler).
//
// WHY THIS EXISTS
// ---------------
// C63 §1.1: every axis percentage MUST be a TOTAL FUNCTION of inspectable state — never a hand-typed
// number. This tool is that function's first, cheap slice: it reads the state that is ALREADY
// inspectable (the wired parcel-provider registry, the height-source `impl` flags, the terrain +
// context bake declarations) and emits a `CityCompletionScorecard` (the L0 schema in
// `packages/schemas/src/site/completion/CityCompletionScorecard.ts`). The three CHEAP axes
// (DATA-SOURCES, TERRAIN, CONTEXT) are computed now; PARCEL / HEIGHTS / LEGISLATION / ENVELOPE stay
// honestly `not-assessed` with a typed C62 `UnknownReason` until their sampling / audit run lands
// (the next Phase-4 moves). §CONTEXT-DATA-HONESTY: an unmeasured axis is `null` + a reason, never 0.
//
// WHAT IT READS (the "where the number comes from", C63 §3)
// ---------------------------------------------------------
//   • parcel-provider registry  — packages/site-parcel-data/src/parcelProviders/registry.ts
//                                  (cadastral vs footprint-fallback per country → cadastre slot).
//   • height sources            — tools/context-bake/heightSources.mjs SOURCES[*].impl +
//                                  sourceForRegion() (building-height slot + terrain-source cross-ref).
//   • terrain bake              — tools/context-bake/terrain.mjs REGIONS (baked quantized-mesh set).
//   • context bake              — tools/context-bake/bake.mjs REGIONS (OSM extract) + LAYERS (the
//                                  9-layer checklist ids).
// heightSources.mjs guards its CLI (import-safe); terrain.mjs / bake.mjs run a top-level `main()` (or
// pull in proj4) and are therefore read as TEXT and parsed — genuinely reading the current source of
// truth without triggering a bake, and staying a total function of that state.
//
// USAGE
//   node computeScorecard.mjs --region barcelona --cc es --jurisdiction es-ct-08019-barcelona
//   node computeScorecard.mjs --region oslo --cc no --jurisdiction no-03-0301-oslo
//   (import { computeScorecard, computeParcelConfidence } from './computeScorecard.mjs')
//
// LAYERING: a build/inspection tool, NOT a layered package — no OTel span (mirrors the sibling
// context-bake tools). The PURE arithmetic (weights + renormalisation) mirrors the L0 schema's
// CITY_COMPLETION_WEIGHTS / renormalizedOverall; the unit test asserts the two stay identical.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, sourceForRegion } from '../context-bake/heightSources.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const P = {
    registry: resolve(HERE, '../../packages/site-parcel-data/src/parcelProviders/registry.ts'),
    terrain: resolve(HERE, '../context-bake/terrain.mjs'),
    bake: resolve(HERE, '../context-bake/bake.mjs'),
};

// ── The scorecard version stamp (C63 §6 / SPEC §6 — the CI gate re-runs + diffs this). ───────────
export const SCORECARD_VERSION = '1.0';

// ── The RATIFIED weight vector (C63 §4, founder 2026-07-30 L-649). MIRRORS the L0 schema's
// CITY_COMPLETION_WEIGHTS — the tool cannot import the TS schema at runtime, so the unit test
// asserts these two are byte-identical (drift = test failure). ──────────────────────────────────
export const CITY_COMPLETION_WEIGHTS = {
    legislation: 0.25,
    envelope: 0.2,
    parcel: 0.15,
    dataSources: 0.15,
    heightsLod: 0.1,
    terrain: 0.1,
    context: 0.05,
};
export const CITY_COMPLETION_WEIGHTS_VERSION = 'ratified-2026-07-30-L649';
export const AXIS_IDS = [
    'parcel', 'legislation', 'dataSources', 'envelope', 'terrain', 'heightsLod', 'context',
];

// The FIXED 9-layer context checklist (C63 §3 Axis 7). Same ruler in every city.
export const CONTEXT_CHECKLIST = [
    'buildings', 'roads', 'water', 'parks', 'landuse', 'rail', 'trees', 'pedestrian', 'sea',
];

// Whole-country context bakes: a city anywhere in these ccs is covered by the national OSM extract
// (bake.mjs `spain` / `denmark` / `netherlands` REGIONS), so it need not be its own bake row. The
// map is the honest read of those three country-level REGIONS (their names carry no cc).
const WHOLE_COUNTRY_BAKE_CC = { es: 'spain', dk: 'denmark', nl: 'netherlands' };

// A per-slot disposition → its completion sub-score (C63 §3 Axis 3). `unknown` is EXCLUDED from the
// mean (renormalised over assessed slots), never scored 0 — the same honesty rule one level down.
const SLOT_SCORE = { live: 1, documented: 0.5, blocked: 0, none: 0 };

// ─────────────────────────────────────────────────────────────────────────────
// STATE READERS (parse the current source of truth; cached per process).
// ─────────────────────────────────────────────────────────────────────────────
let _cache = null;
function readState() {
    if (_cache) return _cache;
    _cache = {
        parcelByCc: parseParcelRegistry(readFileSync(P.registry, 'utf8')),
        terrain: parseTerrainRegions(readFileSync(P.terrain, 'utf8')),
        bakeRegions: parseBakeRegions(readFileSync(P.bake, 'utf8')),
        bakeLayers: parseBakeLayers(readFileSync(P.bake, 'utf8')),
    };
    return _cache;
}
/** Test seam: force a re-read (e.g. after fixture edits). */
export function _resetStateCache() { _cache = null; }

/** registry.ts → { cc: { regionCode, providerId, kind } } (best per country, cadastral preferred). */
export function parseParcelRegistry(text) {
    const out = {};
    const re = /regionCode:\s*'([^']+)'[\s\S]*?providerId:\s*'([^']+)'[\s\S]*?kind:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const [, regionCode, providerId, kind] = m;
        const cc = regionCode.split('-')[0].toLowerCase();
        if (cc === '??') continue; // the universal footprint fallback — not a country.
        const prior = out[cc];
        // Prefer a cadastral registration over a footprint one for the same country (DE-NW beats DE).
        if (!prior || (prior.kind !== 'cadastral' && kind === 'cadastral')) {
            out[cc] = { regionCode, providerId, kind };
        }
    }
    return out;
}

/** A `{ name, source, bbox }`-list block from a .mjs REGIONS array → [{ name, source, blocked }]. */
function sliceArray(text, marker) {
    const start = text.indexOf(marker);
    if (start < 0) return '';
    // The array closes on the first line that is exactly `];` (the sibling tools format that way).
    const end = text.indexOf('\n];', start);
    return end < 0 ? text.slice(start) : text.slice(start, end);
}

/** terrain.mjs REGIONS → Map<name, { source, blocked }>. */
export function parseTerrainRegions(text) {
    const block = sliceArray(text, 'export const REGIONS = [');
    const map = new Map();
    for (const line of block.split('\n')) {
        const m = line.match(/name:\s*'([^']+)',\s*source:\s*'([^']+)'/);
        if (m) map.set(m[1], { source: m[2], blocked: /blocked/i.test(line) });
    }
    return map;
}

/** bake.mjs REGIONS → Set<name>. */
export function parseBakeRegions(text) {
    const block = sliceArray(text, 'const REGIONS = [');
    const set = new Set();
    for (const m of block.matchAll(/name:\s*'([^']+)'/g)) set.add(m[1]);
    return set;
}

/** bake.mjs LAYERS → Set<layer id>. */
export function parseBakeLayers(text) {
    const block = sliceArray(text, 'const LAYERS = [');
    const set = new Set();
    for (const m of block.matchAll(/\{\s*id:\s*'([^']+)'/g)) set.add(m[1]);
    return set;
}

// ─────────────────────────────────────────────────────────────────────────────
// SLOT DISPOSITIONS (each → live | documented | blocked | none | unknown).
// ─────────────────────────────────────────────────────────────────────────────
function cadastreSlot(cc, parcelByCc) {
    const j = parcelByCc[cc];
    if (!j) return { state: 'none', note: `no parcel jurisdiction registered for cc=${cc}` };
    if (j.kind === 'cadastral') {
        // A credential-gated cadastre (DK Matrikel) is wired but not keyless → documented, not live.
        const gated = j.providerId === 'matrikel-dk';
        return { state: gated ? 'documented' : 'live', note: `${j.providerId} (${j.kind}${gated ? ', credential-gated' : ''})` };
    }
    return { state: 'blocked', note: `${j.providerId} (${j.kind} — cadastre exists but unreachable keylessly)` };
}

function heightSlot(regionKey) {
    const v = sourceForRegion(regionKey);
    const status = v?.status;
    const impl = v?.source ? SOURCES[v.source]?.impl : undefined;
    const state =
        status === 'ok' || status === 'live' || impl === 'live' ? 'live'
        : status === 'documented' || impl === 'documented' ? 'documented'
        : status === 'blocked' || impl === 'blocked' ? 'blocked'
        : status === 'no-source' ? 'none'
        : 'unknown';
    return { state, note: `sourceForRegion(${regionKey})=${v?.source ?? 'none'} status=${status ?? '?'} impl=${impl ?? '?'}` };
}

function terrainSlot(regionKey, terrain) {
    const t = terrain.get(regionKey);
    if (!t) return { state: 'none', note: `${regionKey} not in terrain.mjs REGIONS` };
    return { state: t.blocked ? 'blocked' : 'live', note: `terrain source=${t.source}${t.blocked ? ' (blocked)' : ''}` };
}

function contextExtractSlot(regionKey, cc, bakeRegions) {
    if (bakeRegions.has(regionKey)) return { state: 'live', note: `bake.mjs REGION '${regionKey}'` };
    const whole = WHOLE_COUNTRY_BAKE_CC[cc];
    if (whole && bakeRegions.has(whole)) return { state: 'live', note: `covered by whole-country bake REGION '${whole}'` };
    return { state: 'none', note: `${regionKey}/cc=${cc} not covered by any bake REGION` };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE CHEAP AXES.
// ─────────────────────────────────────────────────────────────────────────────
function axisDataSources(input, state, stamp) {
    const { cc, regionKey } = input;
    const slots = {
        'cadastre-parcel': cadastreSlot(cc, state.parcelByCc),
        'regional-zone-GIS': input.zoneGis
            ? { state: input.zoneGis, note: 'supplied by caller (siteDispatch parse is the sequenced follow-up)' }
            : { state: 'unknown', note: 'zone-GIS wiring not inspected (siteDispatch parse sequenced)' },
        'building-height': heightSlot(regionKey),
        'terrain-DEM': terrainSlot(regionKey, state.terrain),
        'context-OSM-extract': contextExtractSlot(regionKey, cc, state.bakeRegions),
    };
    const assessed = Object.entries(slots).filter(([, s]) => s.state !== 'unknown');
    const score = assessed.length === 0
        ? null
        : assessed.reduce((sum, [, s]) => sum + SLOT_SCORE[s.state], 0) / assessed.length;
    const detail = Object.entries(slots).map(([k, s]) => `${k}=${s.state}`).join(', ');
    return mkAxis('dataSources', {
        score,
        unknownReason: score === null ? 'not-queried' : undefined,
        validationState: 'auto-validated',
        derivation: `mean over ${assessed.length}/5 assessed slots {live:1,documented:.5,blocked/none:0}: ${detail}`,
        provenance: [
            prov('parcelProviders/registry.ts', 'national-cadastre'),
            prov('heightSources.mjs', 'generated'),
            prov('terrain.mjs', 'generated'),
            prov('bake.mjs', 'osm'),
        ],
        stamp,
    });
}

function axisTerrain(input, state, stamp) {
    const { regionKey } = input;
    const probe = input.terrainProbe;
    const t = state.terrain.get(regionKey);
    let score, validationState, why;
    if (probe?.verifyPass === true) {
        score = 1; validationState = 'cross-validated';
        why = 'terrain.verify.mjs independent-decoder round-trip PASS (C12 §10)';
    } else if (probe?.layerJsonOk === true) {
        score = 0.5; validationState = 'auto-validated';
        why = `layer.json HTTP 200 (baked, unverified)${probe.whiteMask ? ' — WHITE-MASK defect flagged' : ''}`;
    } else if (t && !t.blocked) {
        score = 0.5; validationState = 'auto-validated';
        why = `declared in terrain.mjs REGIONS (source=${t.source}); no round-trip verify probe supplied → capped at baked-unverified`;
    } else if (t && t.blocked) {
        score = 0; validationState = 'auto-validated';
        why = `terrain.mjs REGIONS marks ${regionKey} blocked (source=${t.source})`;
    } else {
        score = 0; validationState = 'auto-validated';
        why = `${regionKey} absent from terrain.mjs REGIONS coverage → no baked terrain (measured 'none', not not-assessed)`;
    }
    return mkAxis('terrain', {
        score, validationState,
        derivation: `rung {none:0, baked-unverified:.5, verified+lit:1} = ${score}: ${why}`,
        provenance: [prov('terrain.mjs', 'generated'), ...(probe ? [prov('terrain.verify.mjs', 'generated')] : [])],
        stamp,
    });
}

function axisContext(input, state, stamp) {
    const { regionKey, cc } = input;
    const baked = state.bakeLayers;
    const cityBaked = state.bakeRegions.has(regionKey)
        || (WHOLE_COUNTRY_BAKE_CC[cc] && state.bakeRegions.has(WHOLE_COUNTRY_BAKE_CC[cc]));
    let present, validationState, why;
    if (Array.isArray(input.contextProbe?.presentLayers)) {
        present = CONTEXT_CHECKLIST.filter((l) => input.contextProbe.presentLayers.includes(l));
        validationState = 'auto-validated';
        why = `per-layer tile probe at bbox → present: [${present.join(', ')}]`;
    } else if (cityBaked) {
        // Declaration-based: which of the 9 the bake CAN produce. `sea` rides the water layer
        // (w/natural=coastline); `pedestrian` is not baked anywhere yet (honest absence, L-642).
        present = CONTEXT_CHECKLIST.filter((l) => baked.has(l) || (l === 'sea' && baked.has('water')));
        validationState = 'not-checked'; // declared bakeable, not per-tile verified
        why = `declaration-based from bake.mjs LAYERS [${[...baked].join(', ')}] (+sea via water); pedestrian not baked. No per-tile probe → not-checked`;
    } else {
        present = [];
        validationState = 'auto-validated';
        why = `${regionKey}/cc=${cc} is not a baked context region → 0 layers present (measured)`;
    }
    return mkAxis('context', {
        score: present.length / CONTEXT_CHECKLIST.length,
        validationState,
        derivation: `present_layers/9 = ${present.length}/9: ${why}`,
        provenance: [prov('bake.mjs', 'osm')],
        stamp,
    });
}

// ── the four not-yet-measured axes (honest not-assessed, C63 §1.2 / §5 sequencing). ─────────────
function axisNotAssessed(axis, reason, why, stamp) {
    return mkAxis(axis, {
        score: null,
        unknownReason: reason,
        validationState: 'not-checked',
        derivation: `not-assessed (${reason}): ${why}`,
        stamp,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: compute a full CityCompletionScorecard for one city.
//
// input = {
//   jurisdictionId,      // REQUIRED — dossier folder identity (C63 §1.7)
//   cc,                  // ISO alpha-2, lowercase ('es','fr','nl','no','ch',…)
//   regionKey,           // the bake/terrain/height region slug ('barcelona','oslo','paris',…);
//                        //   defaults to `slug` then the jurisdiction's last segment.
//   slug?, subdiv?, code?, bbox?,
//   zoneGis?,            // 'live'|'documented'|'blocked'|'none' — regional zone-GIS slot, if known
//   terrainProbe?,       // { layerJsonOk?, verifyPass?, whiteMask? } — optional network/verify probe
//   contextProbe?,       // { presentLayers: string[] } — optional per-layer tile probe
// }
// opts.now — inject a fixed ISO timestamp for deterministic tests.
// ─────────────────────────────────────────────────────────────────────────────
export function computeScorecard(input, opts = {}) {
    if (!input || !input.jurisdictionId) throw new Error('computeScorecard: input.jurisdictionId is required (C63 §1.7)');
    const cc = (input.cc ?? '').toLowerCase();
    const regionKey = input.regionKey ?? input.slug ?? String(input.jurisdictionId).split('-').pop();
    const norm = { ...input, cc, regionKey };
    const stamp = `scorecard@${SCORECARD_VERSION} ${opts.now ?? new Date().toISOString()}`;
    const state = readState();

    const axes = {
        parcel: axisNotAssessed('parcel', 'not-queried',
            'no parcel sample drawn — call computeParcelConfidence(bbox, provider) over N parcels (Phase-4 FR/NL/NO/CH move)', stamp),
        legislation: axisNotAssessed('legislation', 'not-queried',
            'per-clau sources/SOURCES.md citation audit ∩ signed VERIFICATION.md not run (human-gated, C58 L-449)', stamp),
        dataSources: axisDataSources(norm, state, stamp),
        envelope: axisNotAssessed('envelope', 'pending-implementation',
            'no rulepacks/registry.ts × buildable-land coverage measurement built for this jurisdiction (C58)', stamp),
        terrain: axisTerrain(norm, state, stamp),
        heightsLod: axisNotAssessed('heightsLod', 'not-queried',
            'no per-building heightProvenance histogram read for the city bbox (Phase-4 sampling move)', stamp),
        context: axisContext(norm, state, stamp),
    };

    const overall = renormalizedOverall(axes, CITY_COMPLETION_WEIGHTS);
    return {
        jurisdictionId: input.jurisdictionId,
        axes,
        overall,
        honestyOk: true, // nothing fabricated — every unmeasured axis is null + a typed reason.
        weightsVersion: CITY_COMPLETION_WEIGHTS_VERSION,
    };
}

/**
 * PARCEL axis helper (C63 §3 Axis 1) — the stub the FR/NL/NO/CH "measure" moves call. Given an
 * N-parcel sample resolved against a WIRED provider, it scores the distribution
 * `{high:1, medium:.5, low:0}` (C57 `ParcelConfidence.match`). Without a sample it returns an honest
 * `not-assessed` AxisScore — the network sampling (draw N points in the bbox, hit the provider proxy,
 * read `ParcelConfidence.match` + containment) is the caller's Phase-4 move, not fabricated here.
 *
 *   provider — a ParcelJurisdiction (or a `{ providerId, kind }`) from resolveParcelJurisdiction.
 *   opts.sample — string[] of 'high'|'medium'|'low', OR opts.counts = { high, medium, low }.
 */
export function computeParcelConfidence(bbox, provider, opts = {}) {
    const stamp = `scorecard@${SCORECARD_VERSION} ${opts.now ?? new Date().toISOString()}`;
    const providerId = provider?.providerId ?? provider?.source ?? String(provider ?? 'unknown');
    const kind = provider?.kind ?? 'unknown';
    const authorityRank = kind === 'cadastral' ? 'national-cadastre' : 'osm';

    const counts = opts.counts ?? tally(opts.sample);
    const n = (counts.high ?? 0) + (counts.medium ?? 0) + (counts.low ?? 0);
    if (n === 0) {
        return mkAxis('parcel', {
            score: null,
            unknownReason: 'not-queried',
            validationState: 'not-checked',
            derivation: `not-assessed (not-queried): no parcel sample drawn against ${providerId} in bbox ${fmtBbox(bbox)} — network sampling is the caller's Phase-4 move`,
            provenance: [prov(providerId, authorityRank)],
            stamp,
        });
    }
    const score = ((counts.high ?? 0) * 1 + (counts.medium ?? 0) * 0.5 + (counts.low ?? 0) * 0) / n;
    // A footprint-fallback provider is capped-low by construction (a footprint is never a legal
    // parcel — C57 §L-640): its matches cannot be 'high', so the sample scores itself honestly.
    return mkAxis('parcel', {
        score,
        validationState: 'auto-validated',
        derivation: `mean over N=${n} sample of {high:1,medium:.5,low:0} (high=${counts.high ?? 0}, medium=${counts.medium ?? 0}, low=${counts.low ?? 0}) via ${providerId} (${kind}) in bbox ${fmtBbox(bbox)}`,
        provenance: [prov(providerId, authorityRank)],
        stamp,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// PURE arithmetic + tiny builders (mirror the L0 schema; asserted identical by the unit test).
// ─────────────────────────────────────────────────────────────────────────────
export function renormalizedOverall(axes, weights = CITY_COMPLETION_WEIGHTS) {
    const assessedAxes = AXIS_IDS.filter((a) => typeof axes[a]?.score === 'number' && axes[a].score !== null);
    const wsum = assessedAxes.reduce((s, a) => s + weights[a], 0);
    const score = wsum === 0 ? null : assessedAxes.reduce((s, a) => s + axes[a].score * weights[a], 0) / wsum;
    return { score, partial: assessedAxes.length < AXIS_IDS.length, assessedAxes };
}

function mkAxis(axis, o) {
    const a = { axis, score: o.score, validationState: o.validationState ?? 'not-checked', derivation: o.derivation, generatedBy: o.stamp };
    if (o.unknownReason !== undefined) a.unknownReason = o.unknownReason;
    if (o.provenance) a.provenance = o.provenance;
    return a;
}
function prov(source, authorityRank) {
    return { source, sourceVersion: null, retrievedAt: null, license: null, authorityRank };
}
function tally(sample) {
    const c = { high: 0, medium: 0, low: 0 };
    for (const s of sample ?? []) if (s in c) c[s] += 1;
    return c;
}
const fmtBbox = (b) => (Array.isArray(b) ? `[${b.join(',')}]` : 'n/a');

// ─────────────────────────────────────────────────────────────────────────────
// CLI (guarded — import-safe).
// ─────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
    const region = arg('--region') ?? 'barcelona';
    const cc = arg('--cc') ?? 'es';
    const jurisdictionId = arg('--jurisdiction') ?? `${cc}-${region}`;
    const card = computeScorecard({ jurisdictionId, cc, regionKey: region, slug: region });
    console.log(JSON.stringify(card, null, 2));
    const o = card.overall;
    console.log(`\n▶ ${jurisdictionId}: overall=${o.score === null ? 'null' : (o.score * 100).toFixed(1) + '%'} ` +
        `(partial=${o.partial}, assessed=[${o.assessedAxes.join(', ')}]) honestyOk=${card.honestyOk}`);
}
