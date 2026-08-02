#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// C63 CITY-COMPLETION SCORECARD — the IMPURE compute function (L-648, Phase-4 enabler).
//
// WHY THIS EXISTS
// ---------------
// C63 §1.1: every axis percentage MUST be a TOTAL FUNCTION of inspectable state — never a hand-typed
// number. This tool is that function: it reads the state that is ALREADY inspectable (the wired
// parcel-provider registry, the mounted zoning proxies, the height-source `impl` flags, the terrain +
// context bake declarations) plus — since L-658 — a REAL parcel sample, and emits a
// `CityCompletionScorecard` (the L0 schema in
// `packages/schemas/src/site/completion/CityCompletionScorecard.ts`).
//
// FOUR axes are now computable: DATA-SOURCES, TERRAIN, CONTEXT (config reads) and **PARCEL** (a live
// sample drawn by the sibling `parcelSampleProbe.mjs`). HEIGHTS / LEGISLATION / ENVELOPE stay
// honestly `not-assessed` with a typed C62 `UnknownReason` until their sampling / audit run lands.
// §CONTEXT-DATA-HONESTY: an unmeasured axis is `null` + a reason, never 0.
//
// ⚠ THE PARCEL DENOMINATOR IS RATIFIED (L-656, founder 2026-07-31): private BUILDABLE land — not
// all municipal land and not all clicks. `computeParcelConfidence` therefore REQUIRES the caller to
// state its denominator, and the axis reads only the sample's `buildable` frame. The sample's
// `allclicks` frame answers a different question (click coverage) and is never blended in.
//
// WHAT IT READS (the "where the number comes from", C63 §3)
// ---------------------------------------------------------
//   • parcel-provider registry  — packages/site-parcel-data/src/parcelProviders/registry.ts
//                                  (cadastral vs footprint-fallback per country → cadastre slot).
//   • mounted zoning proxies    — server.js `app.get(<X>_PATH …)` × ZONE_GIS_SOURCES below
//                                  (regional-zone-GIS slot; an UNMOUNTED proxy serves nobody).
//   • height sources            — tools/context-bake/heightSources.mjs SOURCES[*].impl +
//                                  sourceForRegion() (building-height slot + terrain-source cross-ref).
//   • terrain bake              — tools/context-bake/terrain.mjs REGIONS (baked quantized-mesh set).
//   • context bake              — tools/context-bake/bake.mjs REGIONS (OSM extract) + LAYERS (the
//                                  9-layer checklist ids).
//   • parcel sample (optional)  — tools/city-completion/samples/<city>.parcel-sample.json, produced
//                                  by parcelSampleProbe.mjs. Absent ⇒ PARCEL stays `not-assessed`.
// heightSources.mjs guards its CLI (import-safe); terrain.mjs / bake.mjs run a top-level `main()` (or
// pull in proj4) and are therefore read as TEXT and parsed — genuinely reading the current source of
// truth without triggering a bake, and staying a total function of that state.
//
// USAGE
//   node computeScorecard.mjs --all                       # the whole measured board, one table
//   node computeScorecard.mjs --region barcelona --cc es --jurisdiction es-ct-08019-barcelona
//   node computeScorecard.mjs --region oslo --cc no --jurisdiction no-03-0301-oslo
//   node computeScorecard.mjs --region paris --cc fr --sample samples/paris.parcel-sample.json
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
    // L-658: the zone-GIS slot's inspectable state. `server.js` is the ONE place a zoning proxy
    // becomes reachable — an unmounted handler is inert code, exactly like an unregistered parcel
    // provider (L-651). So the slot is derived from the MOUNT, never from the module's existence.
    serverJs: resolve(HERE, '../../server.js'),
};

// ── The scorecard version stamp (C63 §6 / SPEC §6 — the CI gate re-runs + diffs this). ───────────
// 1.1 (L-664) — the ENVELOPE axis became SCOREABLE: `axisEnvelope` + the tier-weight ladder.
// 1.2 (L-677) — §STATED-DENOMINATOR: the ENVELOPE derivation prints the measurement record's OWN
//               denominator instead of asserting L-656 over shares measured against something else
//               (Madrid: Norma-Zonal-governed land — the substitution that kept its record unwritten).
export const SCORECARD_VERSION = '1.2';

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
// §ENVELOPE-CONFIDENCE-LADDER (L-664) — the ENVELOPE-axis tier weights (C63 §3 Axis 4 / §3.2).
//
// ⚠ WHY THIS EXISTS AS A MIRROR. Before L-664 the ENVELOPE axis could not be scored AT ALL: C63 §3
// named `certified` / `constructed-amber`, and NEITHER is an `EnvelopeConfidence` member — the
// contract described a vocabulary the code never implemented, so no defensible tier → weight map
// existed. The contract was amended to the schema's six tiers; this is the tool-side mirror of
// `ENVELOPE_AXIS_TIER_WEIGHT` in `packages/schemas/src/site/completion/EnvelopeAxisWeight.ts`. The
// tool cannot import the TS schema at runtime, so — exactly as with CITY_COMPLETION_WEIGHTS above —
// the unit test asserts the two are byte-identical (drift = test failure).
// ─────────────────────────────────────────────────────────────────────────────
export const ENVELOPE_AXIS_TIER_WEIGHT = {
    'authoritative': 1.0,
    'structured': 0.9,
    'block-constructed': 0.7,
    'estimated-ruleset': 0.4,
    'pipeline-extracted-unverified': 0.1,
    'not-determined': 0.0,
    'no-pack': 0.0,
};
export const ENVELOPE_AXIS_TIER_WEIGHT_VERSION = 'provisional-2026-08-01-L664';

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
        zoningMounts: parseServerZoningMounts(readFileSync(P.serverJs, 'utf8')),
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

/**
 * bake.mjs's region declaration → Set<name>.
 *
 * ⚠ §EMPTY-PARSE-IS-NOT-AN-ABSENCE (L-676). This read USED to look only for `const REGIONS = [`.
 * `bake.mjs` §BAKE-BY-REGION later renamed that array to `ALL_REGIONS` and rebound `REGIONS` to a
 * `--region`-filtered IIFE (`const REGIONS = (() => {`), so the marker stopped matching and this
 * function returned an EMPTY SET — silently, for EVERY city. Downstream that read as a MEASURED
 * absence: `contextExtractSlot` reported `none` and `axisContext` reported "not a baked context
 * region → 0 layers present (measured)". A parser miss was being published as a fact about the world,
 * which is §CONTEXT-DATA-HONESTY's failure-vs-empty collapse (L-422/457/467/469) inside the very tool
 * that exists to prevent it — and it under-stated every city on the board by a full axis.
 *
 * Two defences, because the rename will happen again:
 *   1. `ALL_REGIONS` is read FIRST (it is bake.mjs's full declared set — the honest answer to "is
 *      this city inside a baked region?", independent of how one run was scoped), falling back to
 *      `REGIONS` for tools that still use that name.
 *   2. **It FAILS LOUD rather than returning empty.** bake.mjs applies exactly this discipline to its
 *      own `--region` typo guard ("a silently-empty region set would bake nothing … and report
 *      success"). An empty parse here is a BUG in this reader, never a world without baked regions.
 */
export function parseBakeRegions(text) {
    const set = new Set();
    for (const marker of ['const ALL_REGIONS = [', 'const REGIONS = [']) {
        for (const m of sliceArray(text, marker).matchAll(/name:\s*'([^']+)'/g)) set.add(m[1]);
        if (set.size > 0) return set;
    }
    throw new Error(
        'computeScorecard.parseBakeRegions: matched NO region name in bake.mjs. The declaration was '
        + 'renamed or reformatted — fix this reader. Returning an empty set would publish a parser '
        + 'miss as "this city has no baked context" (§EMPTY-PARSE-IS-NOT-AN-ABSENCE, L-676).');
}

/**
 * bake.mjs LAYERS → Set<layer id>.
 *
 * ⚠ Same §EMPTY-PARSE-IS-NOT-AN-ABSENCE guard as `parseBakeRegions`: an empty parse would render the
 * CONTEXT axis as `0/9 present` — a fabricated measured zero — instead of failing.
 */
export function parseBakeLayers(text) {
    const block = sliceArray(text, 'const LAYERS = [');
    const set = new Set();
    for (const m of block.matchAll(/\{\s*id:\s*'([^']+)'/g)) set.add(m[1]);
    if (set.size === 0) {
        throw new Error(
            'computeScorecard.parseBakeLayers: matched NO layer id in bake.mjs LAYERS — fix this '
            + 'reader. An empty set would publish a parser miss as "0 of 9 context layers present" '
            + '(§EMPTY-PARSE-IS-NOT-AN-ABSENCE, L-676).');
    }
    return set;
}

/**
 * server.js `app.get(<CONST>, …)` → Set<mounted route CONST>. A zoning proxy module that exists but
 * is never mounted serves nobody — the same "built but unwired" failure class the parcel registry
 * hit in L-651 — so the zone-GIS slot keys on the MOUNT, which is the reachable-from-a-browser fact.
 */
export function parseServerZoningMounts(text) {
    const set = new Set();
    for (const m of text.matchAll(/app\.(?:get|post|use)\(\s*([A-Z][A-Z0-9_]*_PATH)\b/g)) set.add(m[1]);
    return set;
}

/**
 * ZONE-GIS DECLARATIONS — which mounted proxy serves the machine-readable ZONING for a region, and
 * what it forwards to. Mirrors the shape of `tools/context-bake/heightSources.mjs` SOURCES (a
 * declared table whose `impl`/reachability is a separate, checkable fact) rather than inventing a
 * new pattern. The SCORE never comes from this table alone: a row only counts `live` when its
 * `mountConst` is actually mounted in `server.js` (verified by `parseServerZoningMounts`).
 *
 * ⚠ A region ABSENT from this table scores the slot `none` — a MEASURED absence ("no zone-GIS
 * wired here"), which is the correct reading for e.g. Oslo, where no Norwegian zoning proxy exists.
 */
export const ZONE_GIS_SOURCES = {
    barcelona: { mountConst: 'MUC_ZONING_PATH', module: 'server/mucZoningProxy.js', upstream: 'https://sig.gencat.cat/ows/MUC/wms', label: 'Generalitat MUC WMS (per-parcel clau, CODI_QUAL_AJUNT)' },
    madrid: { mountConst: 'MADRID_CONDICIONES_PATH', module: 'server/madridCondicionesProxy.js', upstream: 'https://sigma.madrid.es/hosted/rest/services/PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer/6/query', label: 'sigma.madrid.es PGOUM-97 CONDICIONES (explicit buildable footprint + COEF_Z)' },
    murcia: { mountConst: 'MURCIA_PGOU_PATH', module: 'server/murciaPgouProxy.js', upstream: 'https://geoserver.murcia.es/geoserver/wfs', label: 'Ayuntamiento de Murcia GeoServer WFS (PGOU zoning)' },
    paris: { mountConst: 'PARIS_PLU_PATH', module: 'server/parisPluProxy.js', upstream: 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/plub_hauteur/records', label: 'Paris Open Data PLU bioclimatique (plub_* layers) + GPU' },
    amsterdam: { mountConst: 'NL_BESTEMMINGSPLAN_PATH', module: 'server/nlBestemmingsplanProxy.js', upstream: 'https://service.pdok.nl/kadaster/ruimtelijke-plannen/wms/v1_0', label: 'PDOK Ruimtelijke Plannen WMS (bestemmingsplan)' },
    zurich: { mountConst: 'CH_ZURICH_BZO_PATH', module: 'server/chZurichBzoProxy.js', upstream: 'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Nutzungsplanung___kommunale_Bau__und_Zonenordnung__BZO_', label: 'Stadt Zürich OGD WFS — kommunale Bau- und Zonenordnung (BZO)' },
    // DOCUMENTED-BUT-UNWIRED rows (`mountConst: null`). C63 Axis 3's slot vocabulary distinguishes
    // `documented` ("the authoritative source EXISTS and is characterised, nothing is built") from
    // `none` ("no source"). Collapsing the two would score a country that publishes its zoning the
    // same as one that does not — the same failure-vs-absence collapse this file guards elsewhere.
    oslo: {
        mountConst: null, module: null,
        upstream: 'Oslo Planinnsyn / Geonorge planregister (SOSI Plan)',
        label: 'national SOSI Plan is legally mandated and Oslo Planinnsyn is live, but it is a '
            + 'click-viewer, not a queryable WFS; no PRYZM proxy exists',
    },
    // ⚠ València was ABSENT from this table, and absence scores the slot `none` — "no zone-GIS wired
    // here", a MEASURED-ABSENCE claim. For València that claim is FALSE and it under-stated the city:
    // the municipal ArcGIS service is live, KEYLESS and fully characterised (CLOSURE-REGISTER §1
    // E1–E11; re-probed 2026-08-01, `where=1=1&returnCountOnly=true` → `{"count":21210}` asserted
    // before any filter, with a `califi='ZZZNOPE'` → `{"count":0}` control of identical SHAPE). What
    // does NOT exist is a PRYZM proxy — CLOSURE-REGISTER #4 is open — which is exactly what
    // `documented` means and exactly what `none` does not.
    valencia: {
        mountConst: null, module: null,
        upstream: 'https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/231/query',
        label: 'Ajuntament de València ArcGIS REST — PGOU Calificaciones, 21 210 polygons, keyless, '
            + 'carrying califi + tipoca + origen on ONE row (no second spatial join); no PRYZM proxy exists',
    },
};

/**
 * The regional-zone-GIS slot for a region, derived from inspectable state:
 * declared row × actually-mounted route. `input.zoneGis` (a caller override) still wins, so a probe
 * that CONTRADICTS the config can be recorded without editing the table.
 */
export function zoneGisSlot(regionKey, mounts) {
    const d = ZONE_GIS_SOURCES[regionKey];
    if (!d) return { state: 'none', note: `no zone-GIS source declared for region '${regionKey}'` };
    if (d.mountConst === null) {
        return { state: 'documented', note: `source characterised but NOT wired: ${d.upstream} — ${d.label}` };
    }
    if (!mounts.has(d.mountConst)) {
        return { state: 'documented', note: `${d.module} exists but ${d.mountConst} is NOT mounted in server.js — unreachable` };
    }
    return { state: 'live', note: `${d.mountConst} mounted → ${d.module} → ${d.upstream} (${d.label})` };
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
            ? { state: input.zoneGis, note: 'supplied by caller (overrides the config read — e.g. a live probe that contradicts the declaration)' }
            : zoneGisSlot(regionKey, state.zoningMounts),
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

/**
 * PARCEL axis from a `parcelSampleProbe.mjs` record. Reads ONLY the `buildable` frame — the
 * ratified L-656 denominator (private buildable land). The record's `allclicks` frame is a
 * DIFFERENT question ("what does a random user see?") and is deliberately NOT mixed in here; the
 * two are reported side by side in the dossier, never blended into one headline.
 */
export function axisParcelFromSample(sample, norm, state, opts = {}) {
    const b = sample?.buildable ?? {};
    const reg = state.parcelByCc[norm.cc];
    const provider = {
        providerId: sample?.providerId ?? reg?.providerId ?? 'unknown',
        kind: sample?.kind ?? reg?.kind ?? 'unknown',
    };
    return computeParcelConfidence(sample?.bbox ?? norm.bbox, provider, {
        counts: b.counts,
        failures: b.failures,
        denominator: sample?.frame?.denominator ?? 'UNSTATED DENOMINATOR',
        measuredAt: sample?.measuredAt,
        now: opts.now,
    });
}

/**
 * The ENVELOPE axis (C63 §3 Axis 4) — buildable-envelope solver coverage.
 *
 * ⚠ THE RULER, NOT THE MEASUREMENT. L-664 fixed the *vocabulary* blocker: there is now an
 * exhaustive tier → weight map, so the axis CAN be scored. It is still only scored when the caller
 * supplies a real coverage breakdown (`input.envelopeCoverage`) — the per-clau × buildable-land-share
 * measurement is a data task (the `BARCELONA-COMPLETE-COVERAGE-PLAN` +% table / the per-city
 * certifiability survey), and inventing one here would be precisely the §1.1 fabrication this whole
 * contract exists to forbid. Without it the axis stays honestly `not-assessed`.
 *
 * `input.envelopeCoverage` = [{ zoneCode, tier, buildableLandShare }] where `tier` is an
 * `EnvelopeConfidence` or the `'no-pack'` sentinel, and `buildableLandShare` is that clau's fraction
 * of the city's PRIVATE-BUILDABLE land (the L-656 denominator — NOT all municipal ground).
 *
 * Renormalised over the MEASURED shares (C63 §1.5 one level down): unmeasured buildable land shrinks
 * the denominator and is named in the derivation; it is never zero-filled.
 */
function axisEnvelope(input, stamp) {
    const slices = Array.isArray(input.envelopeCoverage) ? input.envelopeCoverage : null;
    if (!slices || slices.length === 0) {
        return axisNotAssessed('envelope', 'pending-implementation',
            'no per-clau × buildable-land-share coverage breakdown supplied for this jurisdiction — '
            + 'the tier→weight ladder exists (C63 §3.2, L-664) but the MEASUREMENT does not (C58)', stamp);
    }
    let measuredShare = 0;
    let weighted = 0;
    const unknownTiers = [];
    for (const s of slices) {
        const w = ENVELOPE_AXIS_TIER_WEIGHT[s.tier];
        if (w === undefined) { unknownTiers.push(s.tier); continue; }
        measuredShare += s.buildableLandShare;
        weighted += s.buildableLandShare * w;
    }
    // ⚠ FAIL LOUD, NEVER DEFAULT. An unmapped tier is a vocabulary drift between this mirror and the
    // L0 map — silently scoring it (the "default branch" C63 §3.2 forbids) is how a scorecard starts
    // reporting a number for a tier nobody defined.
    if (unknownTiers.length > 0) {
        throw new Error(
            `computeScorecard: unmapped EnvelopeConfidence tier(s) [${unknownTiers.join(', ')}] — `
            + 'ENVELOPE_AXIS_TIER_WEIGHT must be TOTAL over the schema enum (C63 §3.2, L-664)');
    }
    if (measuredShare <= 0) {
        return axisNotAssessed('envelope', 'not-queried',
            'the supplied coverage breakdown sums to zero buildable-land share — nothing was measured', stamp);
    }
    const detail = slices.map((s) => `${s.zoneCode}=${s.tier}@${s.buildableLandShare}`).join(', ');
    // §STATED-DENOMINATOR (L-677). This string hard-coded "the PRIVATE-BUILDABLE denominator
    // (L-656)" for EVERY city. L-656 is the ratified denominator, but it is not automatically the
    // one a city can MEASURE: València CONSTRUCTED its 18.696 M m² by intersecting suelo urbano with
    // six calificación codes, while Madrid can only offer Norma-Zonal-GOVERNED land (149,577,170 m²,
    // L-676) because `PG_ORDENACION/4 Ámbitos de Ordenación` is polyline-with-OBJECTID-only and the
    // private-buildable census cannot be derived from it. Printing L-656 over Madrid's shares would
    // emit a DERIVATION STRING THAT IS FALSE — which is exactly why Madrid's measurement record was
    // deliberately WITHHELD rather than written (`CLOSURE-REGISTER.md` row 9). The number was never
    // the problem; the tool's claim about it was.
    // ⚠ A SUBSTITUTED DENOMINATOR IS NOT A LESSER SIN THAN A WRONG FIGURE — the axis is comparable
    // between cities ONLY when the denominator is, so a substitution must travel WITH the figure and
    // be loud, never normalised away into a uniform sentence.
    const denom = typeof input.envelopeDenominator === 'string' && input.envelopeDenominator.trim()
        ? `STATED denominator: ${input.envelopeDenominator.trim()}`
        : 'PRIVATE-BUILDABLE denominator (L-656) — ⚠ ASSUMED: the measurement record stated none';
    return mkAxis('envelope', {
        score: weighted / measuredShare,
        validationState: 'auto-validated',
        derivation:
            `Σ(share×tierWeight)/Σ(share) over ${(measuredShare * 100).toFixed(1)}% of the `
            + `${denom}, weights ${ENVELOPE_AXIS_TIER_WEIGHT_VERSION}: ${detail}`
            + (measuredShare < 1 - 1e-9 ? ' — PARTIAL: unmeasured buildable land is excluded, not scored 0' : ''),
        provenance: [prov('rulepacks/registry.ts', 'generated')],
        stamp,
    });
}

/**
 * The LEGISLATION axis (C63 §3 Axis 2) — `verified_cited_claus / total_claus_present`.
 *
 * ⚠ THE DENOMINATOR IS THE CLAU INVENTORY THE ZONE-GIS RETURNS FOR THE MUNICIPALITY, not the packs
 * we happen to have written. Scoring `cited/authored` would report 100 % for a city where we
 * authored one clau out of forty — precisely the Hospitalet "Barcelona-borrow" trap C63 §3 Axis 2
 * names. So `totalClausPresent` is REQUIRED and the axis refuses to score without it.
 *
 * `validationState` reaches `human-reviewed` ONLY when a signed `sources/VERIFICATION.md` covers the
 * cited rows (C63 §1.6 / L-449). Signature is NOT a score multiplier — an unsigned citation is still
 * a citation — but an unsigned city can never present as human-reviewed, and §CLOSURE reads that
 * field, not the number.
 *
 * input.legislationAudit = {
 *   citedVerifiedClaus, totalClausPresent, signedVerification: bool,
 *   documentInRepo?: bool,   // ⚠ a citation whose DOCUMENT we cannot retrieve is a DATA-SOURCES gap,
 *                            //   recorded here and scored on Axis 3 — never silently on this axis.
 *   supersessionChecked?: bool, source, note,
 * }
 */
function axisLegislation(input, stamp) {
    const a = input.legislationAudit;
    if (!a) {
        return axisNotAssessed('legislation', 'not-queried',
            'per-clau sources/SOURCES.md citation audit ∩ signed VERIFICATION.md not run '
            + '(human-gated, C58 L-449)', stamp);
    }
    const total = a.totalClausPresent;
    if (typeof total !== 'number' || total <= 0) {
        // L-661: "not found" ≠ "does not exist". We know we hold N cited claus; we do NOT know the
        // municipality's clau inventory, so the FRACTION is unknown — and a fraction whose
        // denominator we invented is the C63 §1.1 fabrication.
        return axisNotAssessed('legislation', 'not-queried',
            `${a.citedVerifiedClaus ?? '?'} cited+verified clau(s) held, but the municipality's TOTAL `
            + 'clau inventory was never enumerated — the denominator is unknown, so the fraction is '
            + `unknown (scoring cited/authored would report ~100 % for one clau out of forty). ${a.note ?? ''}`,
            stamp);
    }
    const cited = a.citedVerifiedClaus ?? 0;
    const supersession = a.supersessionChecked === true ? ''
        : ' — ⚠ SUPERSESSION UNEXAMINED: a cited article that a later instrument repealed still counts here';
    const docGap = a.documentInRepo === false
        ? ' — ⚠ the cited DOCUMENT is not retrievable in-repo (scored on DATA-SOURCES, not here)' : '';
    return mkAxis('legislation', {
        score: Math.min(1, cited / total),
        validationState: a.signedVerification === true ? 'human-reviewed' : 'auto-validated',
        derivation:
            `verified_cited_claus/total_claus_present = ${cited}/${total} (C63 §3 Axis 2). `
            + `DENOMINATOR: the clau inventory the zone-GIS returns for the municipality, NOT the packs `
            + `we authored. VERIFICATION.md signed=${a.signedVerification === true}. `
            + `${a.note ?? ''}${supersession}${docGap}`,
        provenance: [prov(a.source ?? 'sources/SOURCES.md', 'regional-gis')],
        stamp,
    });
}

/**
 * The HEIGHTS/LOD axis (C63 §3 Axis 6) — `tagged_count / total_count` over the baked context
 * buildings in the city bbox. v1 counts `tagged` ONLY; `derived-levels` earns no partial credit
 * (C63 §3 Axis 6 + §8 open founder decision — until it is ratified, giving it 0.5 would be this
 * tool ratifying a weighting the founder has not).
 *
 * ⚠ §SIZE-IS-NOT-PROVENANCE. `input.heightsSample` must carry MEASURED vs ASSUMED COUNTS. A bake
 * that produced a large file, a green CI job, or a present tileset is NOT evidence of a single
 * measured height — a previous check asserted file size and shipped zero measured heights on a
 * green bake. `{ bakeGreen: true }` alone is therefore rejected below, loudly.
 *
 * input.heightsSample = { tagged, derivedLevels?, assumed?, total, bbox?, source, note }
 */
function axisHeightsLod(input, stamp) {
    const h = input.heightsSample;
    if (!h) {
        return axisNotAssessed('heightsLod', 'not-queried',
            'no per-building heightProvenance histogram read for the city bbox (Phase-4 sampling move)',
            stamp);
    }
    const total = h.total ?? ((h.tagged ?? 0) + (h.derivedLevels ?? 0) + (h.assumed ?? 0));
    if (typeof h.tagged !== 'number' || typeof total !== 'number' || total <= 0) {
        return axisNotAssessed('heightsLod', 'not-queried',
            'a heights declaration was supplied but it carries NO measured-vs-assumed per-building '
            + 'counts — §SIZE-IS-NOT-PROVENANCE: a green bake, a present tileset or a file size is '
            + `not evidence of one measured height. ${h.note ?? ''}`, stamp);
    }
    const derived = h.derivedLevels ?? 0;
    return mkAxis('heightsLod', {
        score: Math.min(1, h.tagged / total),
        validationState: 'auto-validated',
        derivation:
            `tagged/total = ${h.tagged}/${total} (C63 §3 Axis 6, v1 counts \`tagged\` ONLY; `
            + `derived-levels=${derived} earns NO partial credit until the §8 founder decision lands). `
            + `${h.note ?? ''}`,
        provenance: [prov(h.source ?? 'context PMTiles heightProvenance', 'generated')],
        stamp,
    });
}

// ── the not-yet-measured axes (honest not-assessed, C63 §1.2 / §5 sequencing). ──────────────────
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
//   zoneGis?,            // 'live'|'documented'|'blocked'|'none' — OVERRIDE for the regional
//                        //   zone-GIS slot (else derived from ZONE_GIS_SOURCES × server.js mounts)
//   parcelSample?,       // a parcelSampleProbe.mjs record → scores the PARCEL axis from its
//                        //   `buildable` frame (the L-656 buildable-land denominator)
//   zoneGis?,            // 'live'|'documented'|'blocked'|'none' — regional zone-GIS slot, if known
//   envelopeCoverage?,   // L-664 — [{ zoneCode, tier, buildableLandShare }] per-clau ENVELOPE
//                        //   coverage over the PRIVATE-BUILDABLE denominator (L-656). Absent ⇒ the
//                        //   axis stays honestly `not-assessed` (the ladder exists; the measurement
//                        //   is a data task, and inventing one here is the §1.1 fabrication).
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
        parcel: input.parcelSample
            ? axisParcelFromSample(input.parcelSample, norm, state, opts)
            : axisNotAssessed('parcel', 'not-queried',
                'no parcel sample drawn — run `node parcelSampleProbe.mjs --city <city>` and feed the result as input.parcelSample', stamp),
        legislation: axisLegislation(norm, stamp),
        dataSources: axisDataSources(norm, state, stamp),
        envelope: axisEnvelope(norm, stamp),
        terrain: axisTerrain(norm, state, stamp),
        heightsLod: axisHeightsLod(norm, stamp),
        context: axisContext(norm, state, stamp),
    };

    const overall = renormalizedOverall(axes, CITY_COMPLETION_WEIGHTS);
    const honesty = auditHonesty(axes);
    return {
        jurisdictionId: input.jurisdictionId,
        axes,
        overall,
        honestyOk: honesty.ok,
        honestyViolations: honesty.violations,
        weightsVersion: CITY_COMPLETION_WEIGHTS_VERSION,
    };
}

/**
 * §3.1 — `honestyOk` is LAUNCH-BLOCKING, so it must be COMPUTED, not asserted.
 *
 * ⚠ THIS USED TO BE THE LITERAL `honestyOk: true`. A hard-coded honesty scalar is the exact defect
 * class the whole contract exists to forbid: a field that claims "nothing here is fabricated"
 * without checking. It now audits the emitted card against the three structural honesty rules and
 * NAMES each violation, so a fabricated cell flips the launch gate instead of riding along.
 *
 *   H1  a null score MUST carry a typed C62 UnknownReason  (C63 §1.2 — mirrors the schema refine)
 *   H2  a numeric score MUST NOT also carry an unknownReason (the symmetric contradiction)
 *   H3  every axis MUST carry a non-empty derivation — the "where the number comes from" (§1.1);
 *       a scored axis with no derivation is a hand-typed number by definition.
 *
 * Note it does NOT flip on INCOMPLETENESS: a city measured at 0 % on every axis is perfectly
 * honest. Completion and honesty are two different questions (§3.1), and conflating them is how a
 * refusal gets scored as a failure.
 */
export function auditHonesty(axes) {
    const violations = [];
    for (const id of AXIS_IDS) {
        const ax = axes[id];
        if (!ax) { violations.push(`${id}: axis missing from the card`); continue; }
        if (ax.score === null || ax.score === undefined) {
            if (ax.unknownReason === undefined) {
                violations.push(`${id}: score is null with NO typed unknownReason (C63 §1.2 H1)`);
            }
        } else if (ax.unknownReason !== undefined) {
            violations.push(`${id}: numeric score ${ax.score} ALSO claims unknownReason='${ax.unknownReason}' (H2)`);
        }
        if (!ax.derivation || ax.derivation.length === 0) {
            violations.push(`${id}: no derivation — a number with no stated origin is hand-typed (C63 §1.1 H3)`);
        }
    }
    return { ok: violations.length === 0, violations };
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
    // L-656: the denominator is NOT free text the caller may omit — a percentage without its
    // denominator is not a number (the Barcelona audit found one headline resting on two of them).
    const denom = opts.denominator ?? 'UNSTATED DENOMINATOR';
    const measuredAt = opts.measuredAt ? ` measured ${opts.measuredAt}` : '';

    const counts = opts.counts ?? tally(opts.sample);
    // FOUR scored buckets, not three. `none` = the service answered correctly and there is
    // genuinely NO parcel at that point — a MEASURED ABSENCE, which scores 0 and STAYS IN the
    // denominator (a real coverage gap). Distinct from `failures`, which are transport failures:
    // a claim about OUR NETWORK, excluded from the denominator entirely and never scored
    // (§CONTEXT-DATA-HONESTY — a failed probe must never become a low score).
    const failures = opts.failures ?? {};
    const failureCount = Object.values(failures).reduce((s, v) => s + v, 0);
    const failureNote = failureCount === 0 ? '' :
        `; ${failureCount} probe(s) EXCLUDED as transport failures (${Object.entries(failures).map(([k, v]) => `${k}:${v}`).join(', ')}) — excluded, never scored 0`;
    const n = (counts.high ?? 0) + (counts.medium ?? 0) + (counts.low ?? 0) + (counts.none ?? 0);
    if (n === 0) {
        // ⚠ C62 `UnknownReasonSchema` has NO member for "queried, and the authority did not answer"
        // (an upstream outage). `not-queried` is the closest typed reason; the outage is recorded
        // verbatim in the derivation so failure and absence stay distinguishable to a reader.
        // Reported as a schema gap rather than papered over with an invented enum member.
        const why = failureCount > 0
            ? `${failureCount} probe(s) issued against ${providerId} and EVERY ONE failed in transport (${Object.entries(failures).map(([k, v]) => `${k}:${v}`).join(', ')}) — a claim about OUR NETWORK, not about the data, so the axis is NOT scored low`
            : `no parcel sample drawn against ${providerId} in bbox ${fmtBbox(bbox)} — network sampling is the caller's Phase-4 move`;
        return mkAxis('parcel', {
            score: null,
            unknownReason: 'not-queried',
            validationState: 'not-checked',
            derivation: `not-assessed (not-queried): ${why}. Denominator would have been: ${denom}${measuredAt}`,
            provenance: [prov(providerId, authorityRank)],
            stamp,
        });
    }
    const score = ((counts.high ?? 0) * 1 + (counts.medium ?? 0) * 0.5 + (counts.low ?? 0) * 0 + (counts.none ?? 0) * 0) / n;
    // A footprint-fallback provider is capped-low by construction (a footprint is never a legal
    // parcel — C57 §L-640): its matches cannot be 'high', so the sample scores itself honestly.
    return mkAxis('parcel', {
        score,
        validationState: 'auto-validated',
        derivation: `mean over N=${n} sample of {high:1, medium:.5, low:0, no-parcel-here:0} `
            + `(high=${counts.high ?? 0}, medium=${counts.medium ?? 0}, low=${counts.low ?? 0}, none=${counts.none ?? 0}) `
            + `via ${providerId} (${kind}) in bbox ${fmtBbox(bbox)}. DENOMINATOR: ${denom}${measuredAt}${failureNote}`,
        provenance: [prov(providerId, authorityRank)],
        stamp,
    });
}

/**
 * The 95 % Wilson score interval for a proportion — reported beside every axis score so a
 * small-N measurement cannot be read as a precise one. Pure; no I/O.
 * (Wilson, not normal-approximation: it does not misbehave at p→0 or p→1, which is exactly where
 * these samples sit — Paris measured 100 % high.)
 */
export function wilson95(successes, n) {
    if (n <= 0) return null;
    const z = 1.959964;
    const p = successes / n;
    const d = 1 + (z * z) / n;
    const centre = p + (z * z) / (2 * n);
    const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return { lo: Math.max(0, (centre - half) / d), hi: Math.min(1, (centre + half) / d) };
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
    const { existsSync, mkdirSync, writeFileSync } = await import('node:fs');
    const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
    const quiet = process.argv.includes('--quiet');

    // The CLI is no longer Barcelona-hardcoded: `--all` walks the measured board, reading each
    // city's identity from `parcelSampleProbe.mjs` CITY_BOARD (one source of truth for bbox +
    // regionKey + provider) and auto-loading its sample file when one exists.
    const sampleDir = resolve(HERE, arg('--samples') ?? 'samples');
    const loadSample = (city) => {
        const f = resolve(sampleDir, `${city}.parcel-sample.json`);
        return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : undefined;
    };

    // ── §PER-CITY-MEASUREMENTS (L-662) ────────────────────────────────────────────────────────
    // The three EXPENSIVE axes (LEGISLATION 25 · ENVELOPE 20 · HEIGHTS 10 = 55 % of the ratified
    // weight) cannot be derived from a config read — they are AUDITS. So each city carries a
    // COMMITTED, reviewable measurement record at `measurements/<city>.measurements.json`, and the
    // CLI feeds it in. Absent ⇒ those axes stay honestly `not-assessed`; that is the point.
    //
    // ⚠ WHY A FILE AND NOT A TABLE IN THIS TOOL. A measurement is EVIDENCE with a date, a
    // denominator and a source. Inlining it here would make it indistinguishable from the tool's
    // own logic and impossible to re-date — and a stale number that LOOKS like code is exactly how
    // the tracker documents went stale (the ROI board said "fix in flight" ten days after the fix
    // landed). A file diffs, carries `measuredAt`, and can be regenerated.
    const measureDir = resolve(HERE, arg('--measurements') ?? 'measurements');
    const loadMeasurements = (city) => {
        const f = resolve(measureDir, `${city}.measurements.json`);
        return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : undefined;
    };
    /** A measurement record → the `computeScorecard` input fields it supplies. Absent keys stay absent. */
    const fromMeasurements = (m) => {
        if (!m) return {};
        const out = {};
        // ⚠ `status: 'measured'` is the ONLY key that unlocks an axis. A record that says
        // `unmeasured` (or omits the block) leaves the axis not-assessed — a measurement file must
        // never be able to score an axis by merely EXISTING.
        if (m.envelope?.status === 'measured' && Array.isArray(m.envelope.coverage)) {
            out.envelopeCoverage = m.envelope.coverage;
            // §STATED-DENOMINATOR (L-677) — carry the record's OWN denominator into the derivation.
            // Without it the tool asserted L-656 over shares measured against something else.
            if (typeof m.envelope.denominator === 'string') out.envelopeDenominator = m.envelope.denominator;
        }
        if (m.legislation?.status === 'measured') out.legislationAudit = m.legislation;
        if (m.heightsLod?.status === 'measured') out.heightsSample = m.heightsLod;
        if (m.terrainProbe?.status === 'measured') out.terrainProbe = m.terrainProbe;
        if (m.contextProbe?.status === 'measured') out.contextProbe = m.contextProbe;
        if (m.zoneGis) out.zoneGis = m.zoneGis;
        return out;
    };

    // ⚠ SENSITIVITY LEVER, and it matters: the CONTEXT axis defaults to a DECLARATION-based read of
    // `bake.mjs` LAYERS (what the bake CAN produce) with `validationState: not-checked`, which is
    // 8/9 today. Barcelona's L-649 audit tile-VERIFIED only 5/9 (rail + trees config-added but the
    // re-bake never landed). `--context-layers` forces the tile-verified set so a composite can be
    // reported both ways instead of silently riding the optimistic one.
    const ctxLayers = arg('--context-layers');
    const contextProbe = ctxLayers ? { presentLayers: ctxLayers.split(',').map((s) => s.trim()) } : undefined;

    const { CITY_BOARD } = await import('./parcelSampleProbe.mjs');
    const boardFor = (city) => CITY_BOARD.find((c) => c.city === city);

    /** One board row (or a bare `--region`) → a full computeScorecard input, measurements folded in. */
    const targetFor = (city, overrides = {}) => {
        const b = boardFor(city);
        if (!b && !overrides.cc) {
            throw new Error(
                `computeScorecard --city ${city}: not on the CITY_BOARD and no --cc given. Add the city `
                + 'to parcelSampleProbe.mjs CITY_BOARD (bbox from tools/context-bake/terrain.mjs REGIONS) '
                + `or pass --cc/--jurisdiction explicitly. Board: ${CITY_BOARD.map((c) => c.city).join(', ')}`);
        }
        const m = loadMeasurements(city);
        return {
            jurisdictionId: b?.jurisdictionId ?? overrides.jurisdictionId ?? `${overrides.cc}-${city}`,
            cc: b?.cc ?? overrides.cc,
            regionKey: b?.regionKey ?? city,
            slug: city,
            bbox: b?.bbox,
            parcelSample: overrides.parcelSample ?? loadSample(city),
            ...fromMeasurements(m),
            // an explicit CLI flag OUTRANKS the measurement file (a live probe that contradicts it)
            ...(contextProbe ? { contextProbe } : {}),
            ...(overrides.zoneGis ? { zoneGis: overrides.zoneGis } : {}),
            _measurementsFile: m ? `measurements/${city}.measurements.json` : null,
        };
    };

    let targets;
    if (process.argv.includes('--all')) {
        targets = CITY_BOARD.map((c) => targetFor(c.city));
    } else if (arg('--cities')) {
        // ⚠ THE FIX L-662 ASKED FOR. Before this, the only per-city entry point was `--region`,
        // which defaulted to Barcelona and required the caller to re-type cc + jurisdictionId by
        // hand — so a four-city verdict meant four hand-assembled identities, and a typo'd
        // `--jurisdiction` silently scored the wrong city's dossier. `--city`/`--cities` resolve
        // identity from the ONE board.
        targets = arg('--cities').split(',').map((s) => targetFor(s.trim()));
    } else if (arg('--city')) {
        targets = [targetFor(arg('--city'), { zoneGis: arg('--zone-gis') })];
    } else {
        const region = arg('--region') ?? 'barcelona';
        const cc = arg('--cc') ?? 'es';
        const explicit = arg('--sample');
        targets = [targetFor(region, {
            cc,
            jurisdictionId: arg('--jurisdiction'),
            zoneGis: arg('--zone-gis'),
            parcelSample: explicit ? JSON.parse(readFileSync(resolve(explicit), 'utf8')) : undefined,
        })];
    }

    // Committed output artefacts (C63 §6): `--out <dir>` writes `<jurisdictionId>.scorecard.json`
    // per city, so the board is re-runnable AND diffable in review — the same discipline
    // `tools/murcia-coverage-crosstab/out-crosstab.json` already follows.
    const outDir = arg('--out') ? resolve(HERE, arg('--out')) : null;
    if (outDir) mkdirSync(outDir, { recursive: true });

    const rows = [];
    for (const t of targets) {
        const card = computeScorecard(t);
        if (outDir) {
            writeFileSync(
                resolve(outDir, `${t.jurisdictionId}.scorecard.json`),
                JSON.stringify({ ...card, measurementsFile: t._measurementsFile }, null, 2) + '\n',
            );
        }
        if (!quiet && targets.length === 1) console.log(JSON.stringify(card, null, 2));
        if (!card.honestyOk) {
            console.error(`\n⛔ honestyOk=FALSE for ${t.jurisdictionId} — LAUNCH-BLOCKING (C63 §3.1):`);
            for (const v of card.honestyViolations) console.error(`   • ${v}`);
        }
        const o = card.overall;
        const assessedWeight = o.assessedAxes.reduce((s, a) => s + CITY_COMPLETION_WEIGHTS[a], 0);
        rows.push({
            jurisdiction: t.jurisdictionId,
            overall: o.score === null ? 'n/a' : (o.score * 100).toFixed(1) + '%',
            weightAssessed: (assessedWeight * 100).toFixed(0) + '%',
            ...Object.fromEntries(AXIS_IDS.map((a) => [
                a, card.axes[a].score === null ? '—' : (card.axes[a].score * 100).toFixed(0) + '%',
            ])),
            honestyOk: card.honestyOk,
        });
    }
    console.log('\n▶ C63 CITY-COMPLETION — renormalised over the ASSESSED subset only'
        + ' (an unassessed axis shrinks the denominator; it is NEVER scored 0):');
    console.table(rows);
}
