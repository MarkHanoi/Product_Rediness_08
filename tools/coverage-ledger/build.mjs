#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════════
// §WORLD-COVERAGE-LEDGER — one honest page that says, per country, what PRYZM
// actually serves, GENERATED FROM THE CODE.
//
// WHY THIS EXISTS
// ---------------
// The founder keeps discovering coverage gaps BY CLICKING. Ciudad Real had no
// measured heights (the nine-metro MDS working set was the only ground in Spain
// that could ever be stamped — L-12946). The Middle East is five city boxes, not
// a region. Japan, Mexico and Canada do not exist in any table at all. Each of
// those was discoverable in five minutes from the source files, and each was
// found in production instead, because THERE IS NO SINGLE PLACE THAT ANSWERS
// "what do we have HERE?".
//
// This builds that place. It is GENERATED, never hand-written, for the reason
// CLAUDE.md records five times over about contract counts: a hand-copied list
// rots, and a rotted coverage list is worse than none — it certifies a gap as
// covered. Every number on the page is read from the table that decides it:
//
//   tools/context-bake/bake.mjs               ALL_REGIONS · heightJoin · footprintSource
//                                             · stampBboxesFor (the WORKING SET dispatch)
//                                             · FOOTPRINT_SOURCES
//   tools/context-bake/terrain.mjs            NATIONAL_REGIONS · REGIONS (per-city, incl. `blocked`)
//   tools/context-bake/heightSources.mjs      REGION_SOURCE · SOURCES (impl/provenance)
//                                             · MDS_CITY_BBOXES · DHM_CITY_BBOXES
//   tools/context-bake/heights/*.mjs          every *_BBOXES working set (the city lists)
//   apps/editor/src/ui/geospatial/terrainCoverage.ts
//                                             TERRAIN_CITY_BBOXES · TERRAIN_REGION_BBOXES
//                                             (what the CLIENT will actually attach)
//   packages/site-parcel-data/src/parcelProviders/registry.ts
//                                             PARCEL_JURISDICTIONS (kind · proxyPath)
//   server/jurisdiction/euCadastreProxy.js    EU_CADASTRE_SOURCES (does the leg EXIST server-side?)
//   https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/tileset-manifest.json
//                                             the LIVE published set — probed, with its exact answer
//                                             recorded on the page (C57 §1.5).
//
// ⚠ EVERY SOURCE IS READ AS TEXT, not imported. This is the established
// precedent in this tree (middleEastTerrainRows.spec.ts, mdsBboxCoversTerrainRegion.spec.ts,
// frBdtopoWiring.spec.ts) and it is not a shortcut: bake.mjs and terrain.mjs both
// run a top-level `main()` on import, heightSources.mjs cannot be transformed by
// vite at all, and registry.ts is TypeScript. Reading the source keeps this a
// total function of the CURRENT tables rather than a second, drifting copy.
// Row extraction is BRACE-MATCHED, never a one-line regex — frBdtopoWiring.spec.ts
// records what a one-line-row assumption costs the moment a row grows a field.
//
// HONESTY RULES ON THE PAGE (C57 §1.5/§1.9)
// -----------------------------------------
//   • A height working set that is a CITY LIST is printed as a city list WITH THE
//     TRAP NAMED: a footprint outside those boxes ships an `assumed` default that
//     is indistinguishable on the map from "the source has no data here".
//   • A country with no row anywhere is ABSENT and is SAID BY NAME, never omitted.
//   • The R2 probe's exact HTTP answer (status · bytes · content-type · first 200
//     chars) is recorded. If the probe fails the page says so and falls back to
//     the committed snapshot, labelled as a snapshot — it never invents a verdict.
//
// USAGE
//   node tools/coverage-ledger/build.mjs             # probe live R2, write the page
//   node tools/coverage-ledger/build.mjs --offline   # use the committed snapshot
//   node tools/coverage-ledger/build.mjs --check     # regenerate + diff; exit 1 if stale
//
// LAYERING: build/inspection tooling, like its bake.mjs siblings — no OTel span
// (P8 binds exported package functions, not bake tooling).
// ═════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const P = (...s) => resolve(REPO, ...s);

export const LEDGER_PATH = P('docs/04-reference/WORLD-COVERAGE-LEDGER.md');
export const SNAPSHOT_PATH = P('tools/coverage-ledger/manifest-snapshot.json');
export const MANIFEST_URL =
  'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/tileset-manifest.json';

// ─────────────────────────────────────────────────────────────────────────────
// TEXT-PARSING PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

/** Strip block + line comments so a field regex can never match a COMMENTED value. */
function decomment(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

/**
 * Brace-matched object literals at depth 1 of the array literal that follows
 * `marker`. Indifferent to formatting, which is the whole point: a row that
 * grows a second line must not fall out of the ledger silently.
 */
function arrayRows(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`coverage-ledger: marker not found: ${marker}`);
  // ⚠ The array literal is the one after `= [`, NOT the first `[` after the marker.
  // `const PARCEL_JURISDICTIONS: readonly ParcelJurisdiction[] = [` carries a `[` inside
  // its TYPE, and taking that one silently yielded ZERO rows — the exact "empty reads as
  // covered" failure this page exists to prevent, reproduced inside its own reader.
  const eq = src.indexOf('= [', start);
  let i = eq >= 0 && eq - start < 400 ? eq + 2 : src.indexOf('[', start);
  let depth = 0;
  const rows = [];
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '[') { depth++; continue; }
    if (c === ']') { depth--; if (depth === 0) break; continue; }
    if (c === '{' && depth === 1) {
      let d = 0;
      let j = i;
      for (; j < src.length; j++) {
        if (src[j] === '{') d++;
        else if (src[j] === '}') { d--; if (d === 0) break; }
      }
      rows.push(src.slice(i, j + 1));
      i = j;
    }
  }
  return rows;
}

const strField = (row, key) => {
  const m = decomment(row).match(new RegExp('\\b' + key + ":\\s*'([^']*)'"));
  return m ? m[1] : null;
};
const numArrField = (row, key) => {
  const m = decomment(row).match(new RegExp('\\b' + key + ':\\s*\\[([^\\]]*)\\]'));
  return m ? m[1].split(',').map((x) => Number(x.trim())) : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE READERS
// ─────────────────────────────────────────────────────────────────────────────

/** bake.mjs ALL_REGIONS — the context bake's unit of work. */
export function readBakeRegions(src = readFileSync(P('tools/context-bake/bake.mjs'), 'utf8')) {
  return arrayRows(src, 'const ALL_REGIONS = [').map((row) => ({
    name: strField(row, 'name'),
    bbox: strField(row, 'bbox'),
    heightJoin: strField(row, 'heightJoin'),
    footprintSource: strField(row, 'footprintSource'),
    footprintMerge: strField(row, 'footprintMerge'),
    buildingsSource: strField(row, 'buildingsSource') || 'osm',
    pbfUrl: strField(row, 'pbfUrl'),
    // §PENDING-REGION — the row's OWN statement that it has never been staged: merge-tiles.mjs
    // expects a pending row only when it IS staged, which is what let 92 rows be added without
    // breaking `expect=all`. The §8 matrix prints it beside the probe, so a WIRED cell is
    // corroborated by the source table and not only by an absence on R2 — and on the first run
    // the two agreed EXACTLY, 92 and 92.
    pending: /\bpending:\s*true/.test(decomment(row)),
    // Kept so §3b can blame THESE LINES rather than the whole 1,700-line file.
    rowText: row,
  })).filter((r) => r.name);
}

/** bake.mjs LAYERS — what a context bake actually produces per region. */
export function readBakeLayers(src = readFileSync(P('tools/context-bake/bake.mjs'), 'utf8')) {
  return arrayRows(src, 'const LAYERS = [')
    .map((row) => ({ id: strField(row, 'id'), optIn: /\boptIn:\s*true/.test(decomment(row)) }))
    .filter((l) => l.id);
}

/**
 * bake.mjs `stampBboxesFor` — heightJoin key → the CONSTANT that bounds the
 * join's working set. This is the single most load-bearing fact on the page:
 * it is the difference between "Spain has measured heights" and "nine Spanish
 * metros have measured heights and everywhere else silently ships 9 m".
 */
export function readStampDispatch(src = readFileSync(P('tools/context-bake/bake.mjs'), 'utf8')) {
  const body = src.slice(src.indexOf('function stampBboxesFor(r)'));
  const fn = body.slice(0, body.indexOf('\n}\n'));
  const out = {};
  for (const m of fn.matchAll(/heightJoin === '([a-z0-9_]+)'\)\s*return\s+([A-Z0-9_]+)/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

/** Every `export const *_BBOXES` working set under heights/ + heightSources.mjs. */
export function readWorkingSets() {
  const files = [
    P('tools/context-bake/heightSources.mjs'),
    ...readdirSync(P('tools/context-bake/heights'))
      .filter((f) => f.endsWith('.mjs'))
      .map((f) => P('tools/context-bake/heights', f)),
  ];
  const sets = {};
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/export const ([A-Z0-9_]*BBOXES)\s*=\s*(\[|[A-Z])/g)) {
      const name = m[1];
      if (sets[name]) continue;
      const isArrayLiteral = m[2] === '[';
      let places = [];
      if (isArrayLiteral) {
        places = arrayRows(src, `export const ${name} =`)
          .map((r) => strField(r, 'city') || strField(r, 'region'))
          .filter(Boolean);
      }
      sets[name] = {
        name,
        file: file.replace(REPO.replace(/\\/g, '/'), '').replace(/\\/g, '/').replace(/^\//, ''),
        // A set whose NAME says NATIONAL, or that is derived rather than a city
        // literal, is whole-country. Named, not inferred from a count.
        scope: /NATIONAL/.test(name) ? 'WHOLE-COUNTRY' : 'CITY-LIST',
        places,
      };
    }
  }
  // DE's wired subset is a FILTER over DE_LOD2_CITIES, so the literal rows live there.
  if (sets.DE_LOD2_CITY_BBOXES && sets.DE_LOD2_CITY_BBOXES.places.length === 0) {
    const src = readFileSync(P('tools/context-bake/heights/deLod2Laender.mjs'), 'utf8');
    const wired = new Set(
      [...src.matchAll(/([a-z]{2}):\s*\{[^}]*status:\s*'wired'/g)].map((m) => m[1]),
    );
    sets.DE_LOD2_CITY_BBOXES.places = arrayRows(src, 'export const DE_LOD2_CITIES = [')
      .filter((r) => wired.has(strField(r, 'land')))
      .map((r) => strField(r, 'city'))
      .filter(Boolean);
  }
  return sets;
}

/** terrain.mjs NATIONAL_REGIONS — the whole-region terrain tilesets. */
export function readTerrainNational(src = readFileSync(P('tools/context-bake/terrain.mjs'), 'utf8')) {
  return arrayRows(src, 'export const NATIONAL_REGIONS = [').map((row) => ({
    name: strField(row, 'name'),
    group: strField(row, 'group'),
    bbox: numArrField(row, 'bbox'),
    probeCity: strField(row, 'probeCity'),
  })).filter((r) => r.name);
}

/** terrain.mjs REGIONS — the per-city, legal-grade DTM tilesets (with `blocked`). */
export function readTerrainCities(src = readFileSync(P('tools/context-bake/terrain.mjs'), 'utf8')) {
  return arrayRows(src, 'export const REGIONS = [').map((row) => ({
    name: strField(row, 'name'),
    source: strField(row, 'source'),
    blocked: strField(row, 'blocked'),
  })).filter((r) => r.name);
}

/** heightSources.mjs REGION_SOURCE — region slug → height channel id (or a status object). */
export function readRegionSource(src = readFileSync(P('tools/context-bake/heightSources.mjs'), 'utf8')) {
  const body = src.slice(src.indexOf('export const REGION_SOURCE = {'));
  const block = decomment(body.slice(0, body.indexOf('\n};')));
  const out = {};
  for (const m of block.matchAll(/^\s{2}([a-z0-9_]+):\s*'([a-z0-9_]+)'/gm)) out[m[1]] = { source: m[2] };
  for (const m of block.matchAll(/^\s{2}([a-z0-9_]+):\s*\{([^}]*)\}/gm)) {
    const inner = m[2];
    out[m[1]] = {
      source: (inner.match(/source:\s*'([^']*)'/) || [])[1] ?? null,
      status: (inner.match(/status:\s*'([^']*)'/) || [])[1] ?? null,
      reason: (inner.match(/reason:\s*'([^']*)'/) || [])[1] ?? null,
    };
  }
  return out;
}

/** heightSources.mjs SOURCES — channel id → impl + provenance + country. */
export function readHeightSourceTable(src = readFileSync(P('tools/context-bake/heightSources.mjs'), 'utf8')) {
  const body = src.slice(src.indexOf('export const SOURCES = {'));
  const block = body.slice(0, body.indexOf('\n};'));
  const out = {};
  for (const m of block.matchAll(/^\s{2}([a-z0-9_]+):\s*\{/gm)) {
    const start = m.index + m[0].length - 1;
    let d = 0;
    let j = start;
    for (; j < block.length; j++) {
      if (block[j] === '{') d++;
      else if (block[j] === '}') { d--; if (d === 0) break; }
    }
    const row = block.slice(start, j + 1);
    out[m[1]] = {
      country: strField(row, 'country'),
      name: strField(row, 'name'),
      impl: strField(row, 'impl'),
      provenance: strField(row, 'provenance'),
    };
  }
  return out;
}

/** terrainCoverage.ts — what the CLIENT will actually attach. */
export function readClientTerrain(src = readFileSync(P('apps/editor/src/ui/geospatial/terrainCoverage.ts'), 'utf8')) {
  const cities = arrayRows(src, 'export const TERRAIN_CITY_BBOXES')
    .map((r) => strField(r, 'city')).filter(Boolean);
  const regions = arrayRows(src, 'export const TERRAIN_REGION_BBOXES')
    .map((r) => strField(r, 'region')).filter(Boolean);
  return { cities, regions };
}

/** registry.ts PARCEL_JURISDICTIONS — where a click resolves a real parcel. */
export function readParcelJurisdictions(
  src = readFileSync(P('packages/site-parcel-data/src/parcelProviders/registry.ts'), 'utf8'),
) {
  return arrayRows(src, 'const PARCEL_JURISDICTIONS: readonly ParcelJurisdiction[] = [').map((row) => ({
    regionCode: strField(row, 'regionCode'),
    countryName: strField(row, 'countryName'),
    providerId: strField(row, 'providerId'),
    proxyPath: strField(row, 'proxyPath'),
    kind: strField(row, 'kind'),
  })).filter((r) => r.regionCode);
}

/** server/jurisdiction — the proxy legs that EXIST, so "cadastral" can be checked, not claimed. */
export function readServerParcelLegs() {
  const proxy = readFileSync(P('server/jurisdiction/euCadastreProxy.js'), 'utf8');
  const body = proxy.slice(proxy.indexOf('export const EU_CADASTRE_SOURCES = {'));
  const legs = new Set(
    [...body.matchAll(/^\s{4}'?([a-z][a-z0-9-]*)'?:\s*\{/gm)].map((m) => m[1]),
  );
  const all = readdirSync(P('server/jurisdiction'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(P('server/jurisdiction', f), 'utf8'))
    .join('\n');
  return { legs, serverText: all };
}

/**
 * Is a registry row's proxyPath actually served? Derived, never asserted.
 * TWO channels, and both must be checked: most legs are rows in
 * `EU_CADASTRE_SOURCES`, but Spain (`parcelZoningProxy.js`) and Denmark
 * (`dkMatrikelProxy.js`) have their OWN handler files. Checking only the table
 * reported Denmark as `0/1 cadastral wired` while `DK_PARCEL_PATH` sat right
 * there — a false RED, which is the same defect class as a false GREEN.
 */
function legIsWired(proxyPath, server) {
  if (!proxyPath) return false;
  const m = proxyPath.match(/^\/api\/parcel\/(.+)$/);
  if (m && server.legs.has(m[1])) return true;
  return server.serverText.includes(`'${proxyPath}'`) || server.serverText.includes(`"${proxyPath}"`);
}

/**
 * What a `NATIONAL_REGIONS` group ACTUALLY covers. The founder's complaint
 * "the Middle East is five city boxes" is exactly this distinction, and a table
 * that prints `national riyadh jeddah` without it reads as national coverage.
 */
const GROUP_MEANS_TABLE = {
  europe: 'whole country',
  oceania: 'whole country',
  mexico: 'whole country',
  asia: 'whole country',
  usa: 'metro box',
  middleeast: 'metro box',
  australia: 'state/territory',
  canada: 'province/territory',
};

/**
 * ⚠ NEVER a bare lookup. This WAS `GROUP_MEANS[group]`, and the moment sibling lanes
 * added the `canada` / `mexico` / `asia` groups the country table rendered
 * "**13× undefined**" — a coverage page printing `undefined` at a user is worse than
 * one printing nothing, because it looks like a bug in the page rather than a fact
 * about the data. An unknown group now prints ITS OWN NAME and is treated as NOT
 * whole-country, which is the safe direction: it under-claims until someone classifies it.
 */
const GROUP_MEANS = new Proxy(GROUP_MEANS_TABLE, {
  get: (t, k) => (typeof k === 'string' ? t[k] ?? `\`${k}\`-group row` : undefined),
});

/**
 * The last commit that touched THESE LINES — used to answer the question this
 * page exists for: does what is LIVE reflect what the code SAYS? A region baked
 * BEFORE its deciding lines last changed is serving the OLD behaviour, and
 * "the code declares whole-country heights" would be a false claim about it.
 *
 * ⚠ LINE RANGES, NOT FILES, and the difference is the whole value of the signal.
 * The first cut of this used `git log -1 -- tools/context-bake/bake.mjs`, and
 * because some lane touches that file most days, it painted ALL FIFTY regions
 * STALE on the first run. A page that says everything is stale says nothing —
 * it is the stale-pessimistic failure CLAUDE.md records against the P4 cast
 * gate, manufactured here at scale. Blaming the region's OWN rows answers the
 * question actually asked.
 *
 * Degrades to `null` (printed as UNKNOWN) if git is unavailable — never a guess.
 */
function lastChangeOfRange(file, startLine, endLine) {
  try {
    const out = execFileSync(
      'git',
      ['blame', '-L', `${startLine},${endLine}`, '--line-porcelain', '--', file],
      { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 },
    );
    const times = [...out.matchAll(/^committer-time (\d+)$/gm)].map((m) => Number(m[1]));
    if (!times.length) return null;
    return new Date(Math.max(...times) * 1000).toISOString();
  } catch {
    return null;
  }
}

/** 1-indexed line range of a substring inside a source text. */
function lineRangeOf(src, snippet) {
  const at = src.indexOf(snippet);
  if (at < 0) return null;
  const start = src.slice(0, at).split('\n').length;
  return [start, start + snippet.split('\n').length - 1];
}

/** The line range of `export const NAME = [ … ];` (or its one-line derivation). */
function constRangeOf(src, name) {
  const at = src.indexOf(`export const ${name} =`);
  if (at < 0) return null;
  const nl = src.indexOf('\n', at);
  const head = src.slice(at, nl);
  let end = at;
  if (head.trimEnd().endsWith('[')) {
    const close = src.indexOf('\n];', at);
    end = close < 0 ? nl : close + 3;
  } else {
    const semi = src.indexOf(';', at);
    end = semi < 0 ? nl : semi;
  }
  const startLine = src.slice(0, at).split('\n').length;
  const endLine = src.slice(0, end).split('\n').length;
  return [startLine, endLine];
}

// ─────────────────────────────────────────────────────────────────────────────
// THE LIVE R2 PROBE — recorded with its exact answer (C57 §1.5), never assumed.
// ─────────────────────────────────────────────────────────────────────────────
export async function probeManifest({ offline = false } = {}) {
  const snapshot = existsSync(SNAPSHOT_PATH)
    ? JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
    : null;
  if (offline) {
    if (!snapshot) {
      return { ok: false, mode: 'offline', probe: 'NOT PROBED (--offline) and NO committed snapshot exists', manifest: null };
    }
    return { ok: true, mode: 'offline', probe: `NOT PROBED (--offline) — using the committed snapshot ${SNAPSHOT_PATH.replace(REPO, '').replace(/\\/g, '/')}`, manifest: snapshot.manifest, probedAt: snapshot.probedAt };
  }
  try {
    const t0 = Date.now();
    const res = await fetch(MANIFEST_URL, { signal: AbortSignal.timeout(30_000) });
    const text = await res.text();
    const probe =
      `GET ${MANIFEST_URL} → HTTP ${res.status} ${res.statusText || ''}`.trim() +
      ` · ${Buffer.byteLength(text)} B · content-type: ${res.headers.get('content-type') ?? '(none)'}` +
      ` · ${Date.now() - t0} ms · first 200 chars: ${JSON.stringify(text.slice(0, 200))}`;
    if (!res.ok) return { ok: false, mode: 'live-failed', probe, manifest: snapshot?.manifest ?? null };
    const manifest = JSON.parse(text);
    return { ok: true, mode: 'live', probe, manifest, probedAt: new Date().toISOString() };
  } catch (err) {
    return {
      ok: false,
      mode: 'live-failed',
      probe: `GET ${MANIFEST_URL} → NETWORK FAILURE: ${err?.message ?? String(err)}`,
      manifest: snapshot?.manifest ?? null,
      probedAt: snapshot?.probedAt ?? null,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §FOUNDER-MATRIX — THE R2 OBJECT PROBES (founder 2026-09-06: "make sure that ALL
// … are completed — parcels, 3d context buildings, terrain, roads, pedestrians,
// trees, water, green areas and cadastral data. IN ALL 💯")
//
// ⚠ WHY THESE EXIST WHEN §0 ALREADY PROBES A MANIFEST. The manifest is written BY
// THE MERGE. It lists the layers that merge produced, and it is therefore evidence
// about a RUN, not about the bucket. Two of today's defects are exactly that gap:
// L-12982 read an HTTP 200 staging manifest as proof a canopy had staged when its
// own layer list never contained canopy, and `rail`/`trees` answered 404 for weeks
// while every table said they were baked. So the matrix below is built from probes
// of THE OBJECTS THEMSELVES:
//
//   • `<base>/<layer>.pmtiles`      — a `Range: bytes=0-127` read, because PMTiles is
//     ENTIRELY range reads: a 200-instead-of-206 makes the archive useless even
//     though the bytes are there (the L661a scar in contextTiles.ts). The first four
//     bytes must be the PMTiles magic `504d5469`; an R2 404 is a 27 KB `text/html`
//     error page whose magic is `3c21646f` (`<!do`), and a probe that only looked at
//     `res.ok`/byte-count would read that as a healthy layer.
//   • `<base>/terrain/<slug>/layer.json` — the file `CesiumTerrainProvider.fromUrl`
//     fetches. A slug listed in `terrainCoverage.ts` whose layer.json 404s is not
//     terrain: it is flat ellipsoid ground under the whole site (§TERRAIN-ABSENT-IS-
//     NOT-UNREADABLE, L-12973). 122 declared national slugs, 38 of which answered on
//     the first run of this code — which is the single largest gap on the page.
//
// Snapshotted the same way and for the same reason as the manifest: a page a human
// regenerates must not need the network to be honest, and `--offline` must produce a
// byte-identical page so `--check` can be a staleness gate rather than a coin flip.
// ─────────────────────────────────────────────────────────────────────────────
export const R2_TILES_BASE = 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/';
export const R2_PROBE_SNAPSHOT_PATH = P('tools/coverage-ledger/r2-probe-snapshot.json');

/**
 * The client's cache-bust stamps, READ FROM THE CLIENT rather than copied. The probe must
 * fetch the URL the BROWSER fetches: `?v=` is part of the R2 key's query, and a stamp this
 * file guessed could probe a URL no user ever requests — which is the "verification artifact
 * measures the wrong subject" failure, manufactured on purpose.
 */
function readClientStamp(constName, fallback) {
  try {
    const src = readFileSync(P('apps/editor/src/ui/geospatial/contextTiles.ts'), 'utf8')
      + readFileSync(P('apps/editor/src/ui/geospatial/terrainCoverage.ts'), 'utf8');
    const m = src.match(new RegExp(`export const ${constName}\\s*=\\s*'([^']+)'`));
    return m ? m[1] : fallback;
  } catch {
    return fallback;
  }
}
export const CONTEXT_TILESET_VERSION = readClientStamp('CONTEXT_TILESET_VERSION', 'L663a');
export const TERRAIN_TILESET_VERSION = readClientStamp('TERRAIN_TILESET_VERSION', 'L639k');

/** PMTiles magic (`PMTi`) — the four bytes that separate an archive from an error page. */
export const PMTILES_MAGIC = '504d5469';

/** One probe, recorded with its exact answer and never a verdict. */
async function probeObject(url, { range = false, timeoutMs = 30_000 } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: range ? { Range: 'bytes=0-127' } : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const total = (res.headers.get('content-range') ?? '').match(/\/(\d+)$/);
    return {
      url,
      status: res.status,
      // For a range read the interesting number is the OBJECT size from Content-Range,
      // not the 128 bytes we asked for. For a 404 it is the size of the error page —
      // recorded, because "27150 B of text/html" is the fingerprint of an R2 miss.
      bytes: total ? Number(total[1]) : buf.length,
      readBytes: buf.length,
      contentType: res.headers.get('content-type') ?? null,
      lastModified: res.headers.get('last-modified') ?? null,
      magic: buf.length >= 4 ? buf.subarray(0, 4).toString('hex') : null,
      ms: Date.now() - t0,
    };
  } catch (err) {
    return { url, status: 'NETWORK-FAILURE', error: err?.message ?? String(err), ms: Date.now() - t0 };
  }
}

/** A PMTiles layer answer that a BROWSER could actually read: 206 + the magic. */
export const layerIsServed = (p) => p?.status === 206 && p?.magic === PMTILES_MAGIC;
/** A terrain answer Cesium could actually attach: 200 + a JSON body with tile bounds. */
export const terrainIsServed = (p) => p?.status === 200 && Number(p?.bytes) > 0;

/**
 * Probe every layer archive and every declared national terrain tileset.
 * `--offline` returns the committed snapshot, labelled as one.
 */
export async function probeR2Objects({ offline = false, layerIds = [], terrainSlugs = [] } = {}) {
  const snapshot = existsSync(R2_PROBE_SNAPSHOT_PATH)
    ? JSON.parse(readFileSync(R2_PROBE_SNAPSHOT_PATH, 'utf8'))
    : null;
  if (offline) {
    return {
      mode: 'offline',
      note: snapshot
        ? `NOT PROBED (--offline) — using the committed snapshot tools/coverage-ledger/r2-probe-snapshot.json, probed ${snapshot.probedAt}`
        : 'NOT PROBED (--offline) and NO committed snapshot exists — every cell below reads UNKNOWN',
      probedAt: snapshot?.probedAt ?? null,
      layers: snapshot?.layers ?? {},
      terrain: snapshot?.terrain ?? {},
    };
  }
  const layers = {};
  const terrain = {};
  // Layers first (few, large) then terrain (many, tiny) — bounded concurrency, because
  // 130 unbounded fetches against one bucket is how a probe starts measuring itself.
  for (const id of layerIds) {
    layers[id] = await probeObject(`${R2_TILES_BASE}${id}.pmtiles?v=${CONTEXT_TILESET_VERSION}`, { range: true });
  }
  for (let i = 0; i < terrainSlugs.length; i += 12) {
    const batch = terrainSlugs.slice(i, i + 12);
    const done = await Promise.all(
      batch.map((s) => probeObject(`${R2_TILES_BASE}terrain/${s}/layer.json?v=${TERRAIN_TILESET_VERSION}`)),
    );
    batch.forEach((s, k) => { terrain[s] = done[k]; });
  }
  const served = Object.values(layers).filter(layerIsServed).length;
  const terrOk = Object.values(terrain).filter(terrainIsServed).length;
  return {
    mode: 'live',
    note:
      `LIVE — ${layerIds.length} layer archive(s) range-probed at ${R2_TILES_BASE}<layer>.pmtiles?v=${CONTEXT_TILESET_VERSION}` +
      ` (${served} served a 206 with PMTiles magic) · ${terrainSlugs.length} national terrain tileset(s) probed at` +
      ` ${R2_TILES_BASE}terrain/<slug>/layer.json?v=${TERRAIN_TILESET_VERSION} (${terrOk} answered 200)`,
    probedAt: new Date().toISOString(),
    layers,
    terrain,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE COUNTRY MAP — the ONE hand-declared table on this page, and the reason it
// is safe: a slug missing from it is a HARD FAILURE (`--check` and the default
// run both exit non-zero), never a silently dropped row. That is the inverse of
// the defect this whole page exists to kill.
// ─────────────────────────────────────────────────────────────────────────────
export const COUNTRY_OF_SLUG = {
  // Europe — bake + terrain national rows are the country itself
  spain: 'ES', denmark: 'DK', netherlands: 'NL', estonia: 'EE', lithuania: 'LT',
  latvia: 'LV', poland: 'PL', luxembourg: 'LU', sweden: 'SE', finland: 'FI',
  norway: 'NO', germany: 'DE', france: 'FR', italy: 'IT', greatbritain: 'GB',
  ireland: 'IE', switzerland: 'CH', austria: 'AT', czechia: 'CZ', portugal: 'PT',
  belgium: 'BE', croatia: 'HR', slovenia: 'SI', greece: 'GR', hungary: 'HU',
  romania: 'RO', slovakia: 'SK', bulgaria: 'BG',
  // Europe — city-scoped bake rows that predate their national row
  paris: 'FR', lyon: 'FR', koln: 'DE',
  // §BAKE-SOUTHKOREA (lane KOREA-FROM-NOTHING 2026-09-06). ⚠ TWO TABLES, TWO KEYS, AND THEY ARE NOT
  // THE SAME STRING. The BAKE row resolves through ISO_OF_GEOFABRIK by its Geofabrik PATH segment
  // ('south-korea', hyphenated — added above); the TERRAIN row has no `pbfUrl` at all, so it can only
  // resolve here, by its SLUG ('southkorea', no hyphen). Supplying only one of the two still exits
  // non-zero with 'UNMAPPED slug(s)', which is the builder behaving correctly.
  southkorea: 'KR',
  // USA — metro rows, NOT the country
  newyork: 'US', sanfrancisco: 'US', chicago: 'US', austin: 'US', houston: 'US', boston: 'US',
  // Australia — state rows
  newsouthwales: 'AU', victoria: 'AU', queensland: 'AU', westernaustralia: 'AU',
  southaustralia: 'AU', tasmania: 'AU', act: 'AU', northernterritory: 'AU',
  // North America — §CA-MX (added by a sibling lane 2026-09-06 while this page was being
  // built; the builder HARD-FAILED on the unmapped slugs, which is the guard working. Canada
  // bakes as PROVINCES, Mexico as one national row — the ledger says which, because "Canada is
  // covered" and "ten provinces and three territories each have a row" are different claims.)
  mexico: 'MX',
  ontario: 'CA', quebec: 'CA', britishcolumbia: 'CA', alberta: 'CA', saskatchewan: 'CA',
  manitoba: 'CA', newbrunswick: 'CA', novascotia: 'CA', princeedwardisland: 'CA',
  newfoundland: 'CA', yukon: 'CA', northwestterritories: 'CA', nunavut: 'CA',
  // Oceania
  newzealand: 'NZ',
  // Middle East — CITY rows, not countries. Named as such on the page.
  riyadh: 'SA', jeddah: 'SA', dubai: 'AE', abudhabi: 'AE', doha: 'QA',
  // §MULTI-COUNTRY EXTRACT. `gccstates` is ONE Geofabrik extract covering SIX countries,
  // so it maps to an ARRAY and is counted under each — a shared extract is real coverage
  // for all six, and filing it under whichever sorted first would be a false claim about
  // five of them. The page labels it as shared so "Oman has context" is not read as
  // "Oman has its own bake row".
  gccstates: ['SA', 'AE', 'QA', 'KW', 'BH', 'OM'],
};

/** Slugs whose context comes from an extract SHARED with other countries. */
export const SHARED_EXTRACT_SLUGS = new Set(
  Object.entries(COUNTRY_OF_SLUG).filter(([, v]) => Array.isArray(v)).map(([k]) => k),
);

/**
 * Geofabrik extract name → ISO2. DERIVED resolution: `bake.mjs` already states each
 * region's country in its `pbfUrl`, so a new NATIONAL row maps itself and nobody has
 * to remember this file.
 *
 * ⚠ WHY THIS EXISTS AT ALL, written while it was happening. This page was first built
 * against a 50-row `ALL_REGIONS`; within the hour a sibling lane took it to 64 (Mexico +
 * 13 Canadian provinces) and then to 81 (Iceland, Faroes, Malta, Cyprus, the Balkans,
 * Ukraine, Belarus, Moldova, Andorra, Liechtenstein, the Channel Islands, the Isle of
 * Man). A per-slug hand table would have gone stale THREE TIMES IN ONE SESSION — which
 * is the count/range failure CLAUDE.md records five recurrences of, reproduced live.
 * `COUNTRY_OF_SLUG` survives for the cases a path CANNOT decide: metro rows inside a
 * national extract (`riyadh`/`dubai` both come out of `gcc-states`), and city rows that
 * predate their national row (`paris`, `koln`).
 */
export const ISO_OF_GEOFABRIK = {
  albania: 'AL', andorra: 'AD', austria: 'AT', belarus: 'BY', belgium: 'BE',
  'bosnia-herzegovina': 'BA', bulgaria: 'BG', croatia: 'HR', cyprus: 'CY',
  'czech-republic': 'CZ', denmark: 'DK', estonia: 'EE', 'faroe-islands': 'FO',
  finland: 'FI', france: 'FR', germany: 'DE', 'great-britain': 'GB', greece: 'GR',
  'guernsey-jersey': 'JE', hungary: 'HU', iceland: 'IS',
  'ireland-and-northern-ireland': 'IE', 'isle-of-man': 'IM', italy: 'IT',
  kosovo: 'XK', latvia: 'LV', liechtenstein: 'LI', lithuania: 'LT', luxembourg: 'LU',
  macedonia: 'MK', malta: 'MT', moldova: 'MD', monaco: 'MC', montenegro: 'ME',
  netherlands: 'NL', norway: 'NO', poland: 'PL', portugal: 'PT', romania: 'RO',
  'san-marino': 'SM', serbia: 'RS', slovakia: 'SK', slovenia: 'SI', spain: 'ES',
  sweden: 'SE', switzerland: 'CH', ukraine: 'UA',
  turkey: 'TR', 'israel-and-palestine': 'IL', jordan: 'JO', lebanon: 'LB',
  syria: 'SY', iraq: 'IQ', iran: 'IR', egypt: 'EG', japan: 'JP', 'south-korea': 'KR',
  // Non-European extracts in play
  australia: 'AU', canada: 'CA', mexico: 'MX', 'new-zealand': 'NZ', us: 'US',
  // ⛔ DELIBERATELY ABSENT: `gcc-states` is FIVE countries in one extract, so the path
  // cannot decide it. Its four metro rows are explicit in COUNTRY_OF_SLUG, and leaving
  // it out here is what makes a NEW Gulf row fail loudly instead of being filed under
  // whichever country happened to sort first.
};

/**
 * The countries a bake row belongs to — ALWAYS an array, possibly empty. Explicit slug
 * override first, then its Geofabrik path. An array because one extract can span several
 * countries (`gcc-states`), and collapsing that to one would silently un-cover five.
 */
export function countriesOfBakeRegion(r) {
  const explicit = COUNTRY_OF_SLUG[r.name];
  if (explicit) return Array.isArray(explicit) ? explicit : [explicit];
  const m = String(r.pbfUrl ?? '').match(/geofabrik\.de\/(.+)-latest\.osm\.pbf$/);
  if (!m) return [];
  const segs = m[1].split('/');
  const key = segs.length > 2 ? segs[1] : segs[segs.length - 1];
  const iso = ISO_OF_GEOFABRIK[key];
  return iso ? [iso] : [];
}

/** Single-country convenience for the §3 table: the first country, or null. */
export function countryOfBakeRegion(r) {
  const cs = countriesOfBakeRegion(r);
  return cs.length ? (cs.length > 1 ? `${cs.join('/')}` : cs[0]) : null;
}

export const COUNTRY_NAME = {
  ES: 'Spain', DK: 'Denmark', NL: 'Netherlands', EE: 'Estonia', LT: 'Lithuania',
  LV: 'Latvia', PL: 'Poland', LU: 'Luxembourg', SE: 'Sweden', FI: 'Finland',
  NO: 'Norway', DE: 'Germany', FR: 'France', IT: 'Italy', GB: 'United Kingdom',
  IE: 'Ireland', CH: 'Switzerland', AT: 'Austria', CZ: 'Czechia', PT: 'Portugal',
  BE: 'Belgium', HR: 'Croatia', SI: 'Slovenia', GR: 'Greece', HU: 'Hungary',
  RO: 'Romania', SK: 'Slovakia', BG: 'Bulgaria', US: 'United States',
  AU: 'Australia', NZ: 'New Zealand', SA: 'Saudi Arabia', AE: 'United Arab Emirates',
  QA: 'Qatar', TR: 'Türkiye', IL: 'Israel', KW: 'Kuwait', BH: 'Bahrain', OM: 'Oman',
  JP: 'Japan', MX: 'Mexico', CA: 'Canada', KR: 'South Korea',
  JO: 'Jordan', LB: 'Lebanon', SY: 'Syria', IQ: 'Iraq', IR: 'Iran', EG: 'Egypt',
  // §EUROPE-COMPLETION wave (landing 2026-09-06 from sibling lanes)
  IS: 'Iceland', FO: 'Faroe Islands', MT: 'Malta', CY: 'Cyprus', RS: 'Serbia',
  BA: 'Bosnia and Herzegovina', ME: 'Montenegro', MK: 'North Macedonia', AL: 'Albania',
  XK: 'Kosovo', UA: 'Ukraine', BY: 'Belarus', MD: 'Moldova', AD: 'Andorra',
  LI: 'Liechtenstein', JE: 'Channel Islands (Guernsey/Jersey)', IM: 'Isle of Man',
  MC: 'Monaco', SM: 'San Marino',
  // §FOUNDER-MATRIX — codes that appear in FOUNDER_SET and in NO source table. They exist
  // here ONLY so the matrix can print them by name: a country the founder asked for that
  // has no row must read '⛔ ABSENT' under its own name, never be omitted (C57 §1.9).
  RU: 'Russia', VA: 'Vatican City (Holy See)', GI: 'Gibraltar',
  PS: 'Palestine', YE: 'Yemen',
};

/** terrain.mjs city rows carry a COUNTRY CODE in `source` — derived, not mapped. */
const TERRAIN_SOURCE_COUNTRY = {
  nl: 'NL', fr: 'FR', it: 'IT', gb: 'GB', dk: 'DK', no: 'NO', se: 'SE', fi: 'FI',
  ee: 'EE', lu: 'LU', ch: 'CH', de: 'DE', es: 'ES', pt: 'PT', be: 'BE', sa: 'SA',
  us: 'US', at: 'AT', cz: 'CZ', si: 'SI', pl: 'PL', ie: 'IE',
};

/**
 * Countries the founder named by name ("extend everything to Japan, Mexico, Canada").
 * They are ALWAYS reported, whatever their state — a country that has since acquired
 * rows must show its real verdict, and one that still has none must be said by name
 * rather than omitted. ⚠ This list is a WATCHLIST, not a claim of absence: it read
 * `FOUNDER_NAMED_ABSENT` for about an hour, and MX/CA stopped being absent inside that
 * hour. A constant whose NAME asserts a fact goes stale the moment the fact does.
 */
export const FOUNDER_WATCHLIST = ['JP', 'MX', 'CA'];

// ─────────────────────────────────────────────────────────────────────────────
// MODEL
// ─────────────────────────────────────────────────────────────────────────────
export function buildModel({ manifest, blame = true } = {}) {
  const bakeRegions = readBakeRegions();
  const bakeLayers = readBakeLayers();
  const dispatch = readStampDispatch();
  const sets = readWorkingSets();
  const national = readTerrainNational();
  const cities = readTerrainCities();
  const regionSource = readRegionSource();
  const sourceTable = readHeightSourceTable();
  const client = readClientTerrain();
  const parcels = readParcelJurisdictions();
  const server = readServerParcelLegs();

  const unmapped = [];
  // A bake row states its own country in its Geofabrik path; a terrain row does not, so
  // it inherits from the bake row of the SAME SLUG (they are the same place by design —
  // `terrain.mjs --check-client-coverage` exists to keep those slug sets equal).
  const bakeCountry = new Map();
  for (const r of bakeRegions) {
    const cs = countriesOfBakeRegion(r);
    if (cs.length) bakeCountry.set(r.name, cs);
  }
  /** Every country a slug belongs to. Always an array; empty means UNMAPPED (refused). */
  const cc = (slug) => {
    const explicit = COUNTRY_OF_SLUG[slug];
    const cs = explicit ? (Array.isArray(explicit) ? explicit : [explicit]) : bakeCountry.get(slug) ?? [];
    if (!cs.length) unmapped.push(slug);
    return cs;
  };

  const countries = new Map();
  const ensure = (code) => {
    if (!code) return null;
    if (!countries.has(code)) {
      countries.set(code, {
        code,
        name: COUNTRY_NAME[code] ?? code,
        contextRegions: [],
        terrainNational: [],
        terrainCities: [],
        terrainBlocked: [],
        parcels: [],
      });
    }
    return countries.get(code);
  };

  for (const r of bakeRegions) for (const code of cc(r.name)) ensure(code)?.contextRegions.push(r);
  for (const r of national) for (const code of cc(r.name)) ensure(code)?.terrainNational.push(r);
  for (const r of cities) {
    const code = TERRAIN_SOURCE_COUNTRY[r.source];
    if (!code) { unmapped.push(`terrain-city-source:${r.source}`); continue; }
    const c = ensure(code);
    if (r.blocked) c.terrainBlocked.push(r); else c.terrainCities.push(r);
  }
  for (const p of parcels) {
    const code = p.regionCode.split('-')[0];
    ensure(code)?.parcels.push({ ...p, wired: legIsWired(p.proxyPath, server) });
  }
  for (const code of FOUNDER_WATCHLIST) ensure(code);

  const publishedBuildings = new Set(manifest?.layers?.buildings?.sources ?? []);
  const publishedByLayer = Object.fromEntries(
    Object.entries(manifest?.layers ?? {}).map(([k, v]) => [k, new Set(v.sources ?? [])]),
  );

  // §LIVE-VS-DECLARED — the fact this page exists to surface. A region whose LIVE
  // tiles were baked BEFORE its deciding tables last changed is serving the OLD
  // behaviour, and reading the code alone would state a FALSE fact about it. This
  // is precisely the Ciudad Real shape: `stampBboxesFor('mds')` returns
  // MDS_NATIONAL_BBOXES in the code TODAY, while the tiles a user clicks were
  // baked from the nine-metro list.
  const bakeSrc = readFileSync(P('tools/context-bake/bake.mjs'), 'utf8');
  /** The LINES that decide this region's bake: its own ALL_REGIONS row + its working set. */
  const decidingChange = (r) => {
    // §LIVE-VS-DECLARED costs one `git blame -L` per region against a 2,300-line file — ~12
    // minutes at 132 regions. Fine for a page a human regenerates; fatal for a spec, where it
    // timed out EVERY assertion at vitest's 10 s default and read as nine real failures. Only
    // this arm needs git; `joinDrift` is read from the manifest and is unaffected.
    if (!blame) return null;
    const stamps = [];
    const rowRange = lineRangeOf(bakeSrc, r.rowText);
    if (rowRange) stamps.push(lastChangeOfRange('tools/context-bake/bake.mjs', rowRange[0], rowRange[1]));
    const setName = r.heightJoin ? dispatch[r.heightJoin] : null;
    const set = setName ? sets[setName] : null;
    if (set) {
      const setSrc = readFileSync(P(set.file), 'utf8');
      const range = constRangeOf(setSrc, setName);
      if (range) stamps.push(lastChangeOfRange(set.file, range[0], range[1]));
    }
    const real = stamps.filter(Boolean);
    return real.length ? real.sort().at(-1) : null;
  };
  const staleness = {};
  for (const r of bakeRegions) {
    const live = manifest?.regions?.[r.name] ?? null;
    const lastChange = decidingChange(r);
    staleness[r.name] = {
      bakedAt: live?.bakedAt ?? null,
      bakeGitSha: live?.bakeGitSha ?? null,
      liveHeightJoin: live?.heightJoin ?? null,
      declaredHeightJoin: r.heightJoin ?? null,
      lastChange,
      stale: live?.bakedAt && lastChange ? new Date(lastChange) > new Date(live.bakedAt) : null,
      joinDrift: live ? (live.heightJoin ?? null) !== (r.heightJoin ?? null) : null,
    };
  }

  // Per-country derivation
  for (const c of countries.values()) {
    c.published = c.contextRegions.filter((r) => publishedBuildings.has(r.name)).map((r) => r.name);
    c.unpublished = c.contextRegions.filter((r) => !publishedBuildings.has(r.name)).map((r) => r.name);
    c.stale = c.published.filter((n) => staleness[n]?.stale === true);
    c.joinDrift = c.published.filter((n) => staleness[n]?.joinDrift === true);

    c.heights = c.contextRegions.map((r) => {
      const setName = r.heightJoin ? dispatch[r.heightJoin] ?? null : null;
      const set = setName ? sets[setName] ?? null : null;
      const chan = regionSource[r.name] ?? null;
      const src = chan?.source ? sourceTable[chan.source] ?? null : null;
      return {
        region: r.name,
        heightJoin: r.heightJoin,
        setName,
        scope: !r.heightJoin ? 'NONE' : set ? set.scope : 'REGION-BBOX',
        places: set?.places ?? [],
        channel: chan?.source ?? null,
        channelImpl: src?.impl ?? null,
        channelProvenance: src?.provenance ?? null,
        channelStatus: chan?.status ?? null,
        channelReason: chan?.reason ?? null,
      };
    });

    c.clientTerrainCities = c.terrainCities.filter((r) => client.cities.includes(r.name)).length;
    c.clientTerrainRegions = c.terrainNational.filter((r) => client.regions.includes(r.name)).length;

    // ── VERDICT (deterministic; the rule is printed on the page) ──
    const gaps = [];
    if (c.contextRegions.length === 0) gaps.push('no context bake row');
    if (c.unpublished.length) gaps.push(`context baked but NOT in the live tileset: ${c.unpublished.join(', ')}`);
    if (c.joinDrift?.length) {
      gaps.push(
        `HEIGHT JOIN NOT IN THE LIVE TILES — ${c.joinDrift
          .map((n) => `\`${n}\` declares \`${staleness[n].declaredHeightJoin}\` but the published tiles carry \`${staleness[n].liveHeightJoin ?? 'none'}\``)
          .join('; ')} — the code says measured, the map still shows the assumed default`,
      );
    }
    if (c.stale?.length) {
      gaps.push(
        `LIVE TILES PREDATE THE CODE — ${c.stale
          .map((n) => `\`${n}\` baked ${staleness[n].bakedAt?.slice(0, 10)} (sha ${String(staleness[n].bakeGitSha).slice(0, 8)}) but its deciding tables last changed ${staleness[n].lastChange?.slice(0, 10)}`)
          .join('; ')} — what a user clicks is the OLD behaviour`,
      );
    }
    const nationalIsCountry = c.terrainNational.some((r) => GROUP_MEANS[r.group] === 'whole country');
    if (c.terrainNational.length === 0 && c.terrainCities.length === 0) gaps.push('no terrain');
    else if (c.terrainNational.length === 0) gaps.push(`terrain is ${c.terrainCities.length} city box(es), not the country`);
    else if (!nationalIsCountry) {
      gaps.push(
        `terrain is ${c.terrainNational.length} × ${GROUP_MEANS[c.terrainNational[0].group]} (\`${c.terrainNational.map((r) => r.name).join(' ')}\`), NOT the country`,
      );
    }
    // Height gaps only make sense where context is baked at all — a country with no
    // bake row already carries "no context bake row", and repeating the default there
    // would read as a second, independent defect. One fact, one place.
    if (c.contextRegions.length) {
      const measured = [...new Map(c.heights.filter((h) => h.heightJoin).map((h) => [h.heightJoin, h])).values()];
      if (measured.length === 0) gaps.push('NO measured height join — every building ships the assumed default');
      else {
        const cityBound = measured.filter((h) => h.scope === 'CITY-LIST');
        if (cityBound.length) {
          gaps.push(
            `measured heights only inside ${cityBound
              .map((h) => `${h.places.length} box(es) [${h.places.join(' ')}]`)
              .join(' + ')} — everywhere else ships the assumed default`,
          );
        }
      }
    }
    const cadastral = c.parcels.filter((p) => p.kind === 'cadastral');
    const wired = cadastral.filter((p) => p.wired);
    if (cadastral.length === 0) gaps.push('no cadastral parcel row (click falls to the OSM footprint)');
    else if (wired.length === 0) gaps.push(`cadastral row declared but NO server leg (${cadastral.map((p) => p.regionCode).join(', ')})`);

    const absent =
      c.contextRegions.length === 0 &&
      c.terrainNational.length === 0 &&
      c.terrainCities.length === 0 &&
      c.parcels.length === 0;

    c.gaps = gaps;
    c.verdict = absent ? 'ABSENT' : gaps.length === 0 ? 'COMPLETE' : 'PARTIAL';
  }

  return {
    bakeRegions, bakeLayers, dispatch, sets, national, cities, regionSource,
    sourceTable, client, parcels, server, countries, publishedBuildings,
    publishedByLayer, staleness, unmapped: [...new Set(unmapped)],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §FOUNDER-MATRIX — THE SET AND THE LAYER TRANSLATION
//
// The founder named a SET of countries and a LIST of layers in his own words. Both
// have to be translated into the pipeline's vocabulary IN THE CODE, once, where the
// translation can be argued with — not silently in a lane's head. The two tables
// below are the translation. They are the only hand-declared thing in §8, and every
// verdict computed from them is read from a probe or a source table.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The founder's country set, 2026-09-06: "ALL European countries, Middle East,
 * Australia, New Zealand, Japan, SOUTH KOREA, USA, Canada and Mexico".
 *
 * ⚠ THIS LIST IS THE ASK, NOT THE INVENTORY. A country here with no row anywhere
 * renders as ABSENT across the whole row — which is the entire point: a set defined
 * by what the tables already contain could never show a missing country, and
 * "South Korea is absent entirely" is the most important single fact on this page.
 *
 * ⚠ TWO JUDGEMENT CALLS, STATED SO THEY CAN BE OVERRULED. **Cyprus** is filed under
 * Europe (EU member state) though it is routinely counted in the Middle East, and
 * **Türkiye** under the Middle East though it is routinely counted in Europe. Each
 * appears EXACTLY ONCE; neither is dropped, and neither is double-counted.
 */
export const FOUNDER_SET = {
  // The 44 UN-geoscheme sovereign states of Europe + Kosovo + the Holy See, then the
  // four European dependencies that already carry rows in this tree (FO/JE/IM) plus
  // Gibraltar, which does not and is therefore named as absent rather than omitted.
  Europe: [
    'AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'XK', 'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'MC',
    'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RO', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE',
    'CH', 'UA', 'GB', 'VA', 'FO', 'GI', 'JE', 'IM',
  ],
  'Middle East': [
    'BH', 'EG', 'IR', 'IQ', 'IL', 'JO', 'KW', 'LB', 'OM', 'PS', 'QA', 'SA', 'SY', 'TR',
    'AE', 'YE',
  ],
  'Named individually': ['AU', 'NZ', 'JP', 'KR', 'US', 'CA', 'MX'],
};

/** Flat, de-duplicated, order-preserving. */
export const FOUNDER_COUNTRIES = [...new Set(Object.values(FOUNDER_SET).flat())];

/**
 * §FOUNDER-LAYER-TRANSLATION — his nine words → the pipeline's real artefacts.
 *
 * `tiles` are `bake.mjs` LAYERS ids, and a cell is the WEAKEST of them (a `water`
 * cell cannot read SHIPPED while the `sea` archive 404s — the founder's "water"
 * includes the sea, and the client is currently synthesising the coastline live
 * from Overpass to cover for it). `kind` selects the evidence:
 *
 *   tiles    — the `<layer>.pmtiles` archives on R2 ∩ the manifest's per-layer
 *              `sources` for this country's region slugs
 *   terrain  — a 200 from `terrain/<slug>/layer.json` for this country's
 *              `NATIONAL_REGIONS` slugs
 *   parcels  — a `registry.ts` jurisdiction row of ANY kind whose proxy leg exists
 *   cadastre — a `kind: cadastral` row with a WIRED leg, AND official footprints
 *
 * ⛔ `heightsMatter` is what makes "3D context buildings" different from "some
 * polygons". A buildings tile with no measured height join extrudes every footprint
 * at the assumed default — indistinguishable on the map from a city of identical
 * 9 m blocks. That is not 3D context buildings, and this table refuses to score it
 * as such.
 */
export const FOUNDER_LAYER_MAP = [
  {
    founder: 'parcels',
    kind: 'parcels',
    means: 'a `registry.ts` PARCEL_JURISDICTIONS row with a server leg that exists — a click returns a real boundary (cadastral OR footprint-fallback)',
  },
  {
    founder: '3D context buildings',
    kind: 'tiles',
    tiles: ['buildings'],
    heightsMatter: true,
    means: 'the `buildings` PMTiles archive **and** a `heightJoin` whose working set covers the country — without the join every footprint extrudes at the assumed default',
  },
  {
    founder: 'terrain',
    kind: 'terrain',
    means: 'a quantized-mesh tileset answering at `terrain/<slug>/layer.json` — a declared slug whose layer.json 404s is flat ellipsoid ground (L-12973)',
  },
  { founder: 'roads', kind: 'tiles', tiles: ['roads'], means: 'the `roads` PMTiles archive (`w/highway`)' },
  {
    founder: 'pedestrians',
    kind: 'tiles',
    tiles: ['furniture'],
    means: 'the `furniture` archive (street_lamp · bench · bus_stop · bicycle_parking NODES). ⛔ §STREET-LIFE SYNTHESISES lamps and people from the road network when this layer is absent — that is SCENERY, not mapped data, and it is never counted here',
  },
  {
    founder: 'trees',
    kind: 'tiles',
    tiles: ['trees', 'canopy'],
    means: '`trees` (OSM `natural=tree` nodes) **plus** `canopy` (measured tree-cover raster, opt-in bake)',
  },
  {
    founder: 'water',
    kind: 'tiles',
    tiles: ['water', 'sea'],
    means: '`water` (lakes/rivers/coastline ways) **plus** `sea` (the osmdata water-polygons product — the open sea itself)',
  },
  {
    founder: 'green areas',
    kind: 'tiles',
    tiles: ['parks', 'landuse'],
    means: '`parks` (leisure=park · forest · wood · grass) **plus** `landuse` (the urban-grey / rural-brown ground drape)',
  },
  {
    founder: 'cadastral data',
    kind: 'cadastre',
    means: 'TWO separate things — (a) a `kind: cadastral` jurisdiction whose server proxy leg is WIRED, and (b) official building FOOTPRINTS (`footprintSource`) replacing OSM geometry',
  },
];

/** Cell states, weakest first — `worst()` below relies on this ORDER. */
export const CELL_ORDER = ['ABSENT', 'WIRED', 'PARTIAL', 'SHIPPED', 'UNKNOWN'];
const CELL_MARK = { SHIPPED: '✅', PARTIAL: '🟡', WIRED: '🟠', ABSENT: '⛔', UNKNOWN: '❔' };
const worst = (...states) => {
  const real = states.filter((s) => s && s !== 'UNKNOWN');
  if (!real.length) return states.includes('UNKNOWN') ? 'UNKNOWN' : 'ABSENT';
  return real.sort((a, b) => CELL_ORDER.indexOf(a) - CELL_ORDER.indexOf(b))[0];
};

/**
 * Combine the parts of a MULTI-ARTEFACT cell (`water` = water + sea; `trees` = trees + canopy).
 *
 * ⛔ NOT `worst()`, AND THE DIFFERENCE IS A FALSE CLAIM. `worst()` scored Bulgaria's
 * `trees` as 🟠 WIRED — a mark whose legend reads "WIRED, NOT PUBLISHED" — because
 * `canopy.pmtiles` 404s, while `trees.pmtiles` was serving Bulgarian tree points the
 * whole time. That is the founder's own complaint pointed the wrong way: a page that
 * under-reports published bytes teaches him to distrust it exactly as fast as one that
 * over-reports them, and the next lane re-bakes something that is already live.
 *
 * The rule: if ANY part has real bytes for this country (SHIPPED or PARTIAL) and any
 * other part does not, the cell is 🟡 PARTIAL — "some of what he named is here" — and
 * the missing half is NAMED in the `why`. Only when NO part has bytes does the cell
 * fall to WIRED/ABSENT.
 */
const composite = (...states) => {
  const real = states.filter((s) => s && s !== 'UNKNOWN');
  if (!real.length) return states.includes('UNKNOWN') ? 'UNKNOWN' : 'ABSENT';
  if (real.every((s) => s === real[0])) return real[0];
  return real.some((s) => s === 'SHIPPED' || s === 'PARTIAL')
    ? 'PARTIAL'
    : real.sort((a, b) => CELL_ORDER.indexOf(a) - CELL_ORDER.indexOf(b))[0];
};

/**
 * §FOUNDER-MATRIX — one row per country the founder named, one cell per layer he named.
 *
 * ⛔ THE RULE THIS FUNCTION EXISTS TO ENFORCE: a cell reads SHIPPED **only** when a
 * probe says bytes a browser can read are on R2 for a slug inside that country. A table
 * row is never evidence. 82 of 131 bake regions are wired and unpublished, and 84 of 122
 * terrain tilesets 404 — reading a row as coverage is precisely the mistake the founder
 * keeps catching by clicking.
 */
export function buildFounderMatrix(model, r2) {
  const { countries, staleness } = model;
  const manifestSources = model.publishedByLayer ?? {};

  // Slug → the countries it serves, INCLUDING slugs the code no longer has. An orphan
  // (`sanfrancisco`, `riyadh`) still has live tiles a user in that country reads today,
  // and scoring the US on its state rows alone would under-report what actually renders.
  const bakeIndex = new Map(model.bakeRegions.map((r) => [r.name, r]));
  const countriesOfSlug = (slug) => {
    const explicit = COUNTRY_OF_SLUG[slug];
    if (explicit) return Array.isArray(explicit) ? explicit : [explicit];
    const row = bakeIndex.get(slug);
    return row ? countriesOfBakeRegion(row) : [];
  };
  const liveSlugsOf = new Map();
  for (const slug of model.publishedBuildings) {
    for (const code of countriesOfSlug(slug)) {
      if (!liveSlugsOf.has(code)) liveSlugsOf.set(code, []);
      liveSlugsOf.get(code).push(slug);
    }
  }

  const rows = [];
  for (const code of FOUNDER_COUNTRIES) {
    const c = countries.get(code) ?? null;
    const declared = c?.contextRegions.map((r) => r.name) ?? [];
    const live = liveSlugsOf.get(code) ?? [];
    const orphanLive = live.filter((s) => !bakeIndex.has(s));

    /** One tile layer's state for this country. */
    const tileCell = (id) => {
      const probe = r2.layers?.[id];
      const served = layerIsServed(probe);
      const srcs = manifestSources[id] ?? new Set();
      const mine = live.filter((s) => srcs.has(s));
      if (!declared.length && !mine.length) return { state: 'ABSENT', why: `no \`${id}\` row: the country has no bake region at all` };
      if (!probe) return { state: 'UNKNOWN', why: `\`${id}.pmtiles\` was NOT PROBED` };
      if (!served) {
        return {
          state: 'WIRED',
          why: `\`${id}.pmtiles\` answered HTTP ${probe.status}${probe.contentType ? ` ${probe.contentType}` : ''}${probe.bytes ? ` ${probe.bytes} B` : ''} — the layer is declared in \`bake.mjs\` LAYERS but there are NO bytes on R2 for anyone`,
        };
      }
      if (!mine.length) {
        const pend = (c?.contextRegions ?? []).filter((r) => r.pending).map((r) => r.name);
        return {
          state: 'WIRED',
          why:
            `\`${id}.pmtiles\` is live (${probe.bytes} B) but NONE of this country's region(s) (\`${declared.join(' ') || '—'}\`) are in its \`sources\`` +
            (pend.length ? ` — and ${pend.length} of them carry \`pending: true\`, bake.mjs's own marker for "declared, never staged"` : ''),
        };
      }
      if (declared.length && declared.every((s) => srcs.has(s))) return { state: 'SHIPPED', why: `all ${declared.length} region(s) in \`${id}.sources\`` };
      const missing = declared.filter((s) => !srcs.has(s));
      return {
        state: 'PARTIAL',
        why: `${mine.length} of ${declared.length || mine.length} slug(s) in \`${id}.sources\`${missing.length ? ` — missing \`${missing.slice(0, 6).join(' ')}${missing.length > 6 ? ` +${missing.length - 6}` : ''}\`` : ''}${orphanLive.length ? ` (live only via the ORPHAN slug(s) \`${orphanLive.join(' ')}\`, which the code no longer has and the next merge drops)` : ''}`,
      };
    };

    /** Terrain: probed per declared national slug. */
    const terrainCell = () => {
      const slugs = c?.terrainNational.map((r) => r.name) ?? [];
      if (!slugs.length) {
        const cityRows = c?.terrainCities.length ?? 0;
        return cityRows
          ? { state: 'WIRED', why: `${cityRows} per-city DTM row(s) but NO national region — not probed here` }
          : { state: 'ABSENT', why: 'no `terrain.mjs` row of any kind' };
      }
      const answers = slugs.map((s) => ({ s, p: r2.terrain?.[s] }));
      if (answers.every((a) => !a.p)) return { state: 'UNKNOWN', why: 'terrain tilesets were NOT PROBED' };
      const ok = answers.filter((a) => terrainIsServed(a.p));
      const bad = answers.filter((a) => a.p && !terrainIsServed(a.p));
      if (!ok.length) {
        return {
          state: 'WIRED',
          why: `all ${slugs.length} declared tileset(s) answered ${[...new Set(bad.map((a) => `HTTP ${a.p.status}`))].join('/')} at \`terrain/<slug>/layer.json\` — the client lists them, R2 does not have them, so the site sits on flat ellipsoid ground`,
        };
      }
      if (ok.length === slugs.length) return { state: 'SHIPPED', why: `${ok.length}/${slugs.length} layer.json → HTTP 200 (${ok[0].p.bytes} B, ${ok[0].p.contentType})` };
      return {
        state: 'PARTIAL',
        why: `${ok.length}/${slugs.length} live — MISSING \`${bad.slice(0, 8).map((a) => a.s).join(' ')}${bad.length > 8 ? ` +${bad.length - 8}` : ''}\` (HTTP ${bad[0].p.status})`,
      };
    };

    /** Heights — the half of "3D context buildings" a tile probe cannot see. */
    const heightState = () => {
      if (!c || !c.contextRegions.length) return { state: 'ABSENT', why: 'no bake region' };
      const joins = [...new Map(c.heights.filter((h) => h.heightJoin).map((h) => [h.heightJoin, h])).values()];
      // ⚠ PARTIAL, not WIRED. The footprints and their positions ARE published and ARE real;
      // it is only the METRES that are invented. Marking this "not published" would be false
      // about bytes a user is looking at — the inverse of the over-claim, and just as wrong.
      if (!joins.length) return { state: 'PARTIAL', why: 'NO measured height join anywhere in the country — the footprints are real, every one of them extrudes at the ASSUMED DEFAULT' };
      const whole = joins.filter((h) => h.scope === 'WHOLE-COUNTRY');
      const drift = (c.joinDrift ?? []).length;
      if (whole.length && whole.length === joins.length && !drift) {
        return { state: 'SHIPPED', why: `\`${whole.map((h) => h.heightJoin).join(' ')}\` · working set ${whole.map((h) => h.setName).join(' ')} = WHOLE-COUNTRY` };
      }
      if (drift) {
        return { state: 'PARTIAL', why: `the LIVE tiles carry a different join than the code declares for ${drift} region(s) — the code says measured, the map still shows the assumed default` };
      }
      const bounded = joins.filter((h) => h.scope !== 'WHOLE-COUNTRY');
      return {
        state: 'PARTIAL',
        why: `measured heights only inside ${bounded.map((h) => `${h.places.length || '?'} box(es) (\`${h.heightJoin}\`)`).join(' + ')} — everywhere else in the country ships the assumed default`,
      };
    };

    const parcelCell = () => {
      const all = c?.parcels ?? [];
      if (!all.length) return { state: 'ABSENT', why: 'no `registry.ts` jurisdiction row — a click falls back to the OSM footprint' };
      const usable = all.filter((p) => p.wired || p.kind === 'footprint-fallback');
      if (!usable.length) return { state: 'WIRED', why: `${all.length} row(s) declared but NO server leg (\`${all.map((p) => p.regionCode).join(' ')}\`)` };
      if (usable.length === all.length) return { state: 'SHIPPED', why: `${usable.length} jurisdiction(s): \`${usable.map((p) => p.regionCode).join(' ')}\`` };
      return { state: 'PARTIAL', why: `${usable.length}/${all.length} row(s) have a leg — unrouted: \`${all.filter((p) => !usable.includes(p)).map((p) => p.regionCode).join(' ')}\`` };
    };

    const cadastreCell = () => {
      const cad = (c?.parcels ?? []).filter((p) => p.kind === 'cadastral');
      const wired = cad.filter((p) => p.wired);
      const fp = [...new Set((c?.contextRegions ?? []).map((r) => r.footprintSource).filter(Boolean))];
      if (!cad.length && !fp.length) return { state: 'ABSENT', why: 'no cadastral jurisdiction and no official footprint source' };
      const legs = !cad.length ? 'ABSENT' : wired.length === cad.length ? 'SHIPPED' : wired.length ? 'PARTIAL' : 'WIRED';
      // ⚠ The published manifest records `heightJoin` per region but NOT the footprint mode,
      // so R2 cannot tell us whether the live tiles were baked `--footprints official`. A
      // declared source is therefore capped at PARTIAL — never SHIPPED — and the reason is
      // printed, rather than the page inventing a verdict it has no evidence for.
      const foot = fp.length ? 'PARTIAL' : 'WIRED';
      return {
        state: worst(legs, foot),
        why:
          `register legs ${wired.length}/${cad.length} wired${cad.length ? ` (\`${cad.map((p) => p.regionCode).join(' ')}\`)` : ''}` +
          ` · official footprints ${fp.length ? `\`${fp.join(' ')}\` DECLARED — but the manifest records no footprint mode, so R2 cannot confirm the live tiles used it` : 'NONE — the tiles carry OSM geometry'}`,
      };
    };

    const cells = {};
    for (const L of FOUNDER_LAYER_MAP) {
      if (L.kind === 'tiles') {
        const parts = L.tiles.map((id) => ({ id, ...tileCell(id) }));
        let state = composite(...parts.map((p) => p.state));
        let why = parts.map((p) => `\`${p.id}\`: ${p.why}`).join(' · ');
        if (L.heightsMatter) {
          const h = heightState();
          // ⛔ NOT `composite()`, AND THIS WAS A REAL FALSE CLAIM ON THE FIRST RUN. Japan and
          // South Korea have NO slug in `buildings.sources` — nothing of either is on R2 — yet
          // `composite(WIRED, PARTIAL)` returned 🟡 PARTIAL, because Japan's `plateau_jp` height
          // join is a city list and a city list scores PARTIAL. A height join is not bytes; it is
          // a PROPERTY of the buildings tile, and a property of an archive that does not exist
          // cannot be evidence that something shipped. Heights may only make the cell WORSE:
          //   no tiles          → the tile verdict stands, heights are moot
          //   tiles + full join → the tile verdict stands
          //   tiles + anything else → floored at PARTIAL, because the footprints ARE real
          //                           and only the metres are invented
          const hasBytes = state === 'SHIPPED' || state === 'PARTIAL';
          state = !hasBytes ? state : h.state === 'SHIPPED' ? state : 'PARTIAL';
          why += ` · HEIGHTS: ${h.why}`;
        }
        cells[L.founder] = { state, why };
      } else if (L.kind === 'terrain') cells[L.founder] = terrainCell();
      else if (L.kind === 'parcels') cells[L.founder] = parcelCell();
      else cells[L.founder] = cadastreCell();
    }

    rows.push({
      code,
      name: COUNTRY_NAME[code] ?? code,
      group: Object.entries(FOUNDER_SET).find(([, list]) => list.includes(code))?.[0] ?? '—',
      modelled: Boolean(c),
      declared,
      live,
      orphanLive,
      cells,
      shipped: Object.values(cells).filter((x) => x.state === 'SHIPPED').length,
      absent: Object.values(cells).filter((x) => x.state === 'ABSENT').length,
    });
  }
  return rows;
}

/**
 * §SHORTEST-PATH — the ordered set of bakes and publishes that turns the most matrix
 * cells green per hour of runner time. DERIVED FROM THE MATRIX, so it cannot describe
 * an action that is already done.
 *
 * ⛔ WHAT A "CELL" COUNTS, AND WHY THE FIRST CUT OF THIS WAS WRONG. A step's score is
 * the number of (country × column) cells IT CAN ACTUALLY MOVE — not the number of
 * countries that carry the gap. The first version scored `sea` at "62 cells" by
 * counting every country with a bake row. But `layer=sea` runs over STAGED regions:
 * for the 30 countries whose regions have never been staged it moves NOTHING, and
 * saying otherwise would have ranked a no-op above the work that unblocks it. The
 * predicate now requires the country to have a live slug, which is the same
 * "cite the bytes" rule the matrix itself runs on, applied to the plan.
 *
 * ⚠ THE TWO CEILINGS THIS RESPECTS, both measured rather than assumed:
 *   • the 330-minute GitHub Actions job ceiling — which is why a wave is dispatched
 *     per REGION or per SHARD, never as one job;
 *   • the merge's DISK cliff — a run has already refused with "MERGE CANNOT FIT", and
 *     `context-merge-publish.yml`'s `layer` input (per-layer publishes) is the escape.
 *
 * ⚠ HOURS ARE ESTIMATES AND ARE LABELLED AS SUCH ON THE PAGE. Cells are measured;
 * runner hours are not, and mixing a measured numerator with a guessed denominator
 * silently launders the guess. The ORDER is the output — not the rate.
 */
export function buildShortestPath(matrix, model, r2) {
  const bakeIdx = new Set(model.bakeRegions.map((r) => r.name));
  const orphans = [...model.publishedBuildings].filter((s) => !bakeIdx.has(s));
  const COLS = FOUNDER_LAYER_MAP.map((L) => L.founder);
  /** Cells a step moves: (country, column) pairs matching `pred`, counted once each. */
  const cells = (pred) =>
    matrix.reduce((n, row) => n + COLS.filter((k) => pred(row, k, row.cells[k])).length, 0);
  const colOf = (layerId) => FOUNDER_LAYER_MAP.find((L) => L.tiles?.includes(layerId))?.founder ?? null;

  const steps = [];

  // ── A. Stage + merge the regions that have never been published ────────────
  // FIRST because it is the only step that unblocks the others: a per-layer bake runs
  // over STAGED regions, so `layer=sea` for Japan does nothing until Japan is staged.
  const unpublished = model.bakeRegions.filter((r) => !model.publishedBuildings.has(r.name));
  if (unpublished.length) {
    const tileCols = FOUNDER_LAYER_MAP.filter((L) => L.kind === 'tiles').map((L) => L.founder);
    const n = cells((row, k, v) => row.live.length === 0 && row.declared.length > 0 && tileCols.includes(k) && v.state !== 'SHIPPED');
    const pending = unpublished.filter((r) => r.pending).length;
    steps.push({
      cells: n,
      hours: 40,
      title: `Stage + merge the ${unpublished.length} bake regions that have NEVER been published`,
      body:
        `\`bake.mjs\` ALL_REGIONS has **${model.bakeRegions.length}** rows; the live manifest's ` +
        `\`layers.buildings.sources\` has **${model.publishedBuildings.size}**. ${unpublished.length} regions are ` +
        `invisible to every user — and TWO INDEPENDENT READINGS AGREE ON WHICH: the R2 probe says ` +
        `${unpublished.length} are absent from \`buildings.sources\`, and \`bake.mjs\` itself marks ` +
        `**${pending}** rows \`pending: true\` (its own "declared, never staged" flag)` +
        `${pending === unpublished.length ? ' — **the same set, exactly**' : ', which is a DIFFERENT number and worth investigating'}:\n\n` +
        `    ${unpublished.map((r) => r.name).join(' ')}\n\n` +
        `**This is FIRST despite the worst cells/hour, because every other tile step depends on it.** ` +
        `A per-layer bake runs over STAGED regions — \`layer=sea\` does nothing for Japan until Japan is staged.\n\n` +
        `    context-bake.yml   region=<slug>  stage=true      (one dispatch PER REGION, in parallel —\n` +
        `                                                       a serial chain is brittle and 330 min is the job ceiling)\n` +
        `    context-merge-publish.yml  expect=staged  layer=<one layer>  publish=true\n` +
        `                                                      (ONE publish PER LAYER — the "MERGE CANNOT FIT" escape)\n\n` +
        (orphans.length
          ? `⚠ \`allow_unknown_regions=true\` is required while the ${orphans.length} orphan staged set(s) remain (\`${orphans.join(' ')}\`) — ` +
            `they are renamed rows whose staged sets nothing prunes, and the merge refuses every run by name until it is told to tolerate them.`
          : ''),
    });
  }

  // ── B. The layers that do not exist on R2 for ANYONE ───────────────────────
  for (const id of ['sea', 'furniture']) {
    const p = r2.layers?.[id];
    if (layerIsServed(p)) continue;
    const col = colOf(id);
    const n = cells((row, k, v) => k === col && row.live.length > 0 && v.state !== 'SHIPPED');
    steps.push({
      cells: n,
      hours: id === 'sea' ? 3 : 4,
      title: `Bake + publish the \`${id}\` layer for the ${model.publishedBuildings.size} regions already staged`,
      body:
        `\`${id}.pmtiles\` answered **HTTP ${p?.status ?? 'NOT PROBED'}` +
        `${p?.contentType ? ` ${p.contentType}` : ''}${p?.bytes ? ` · ${p.bytes.toLocaleString()} B` : ''}** — an R2 miss, ` +
        `not an archive. The layer is declared in \`bake.mjs\` LAYERS **and** offered by \`context-bake.yml\`'s \`layer\` input, ` +
        `and has never once been published. It needs no new source, no new table and no new country — which makes it the ` +
        `cheapest real win on this page.\n\n` +
        `    context-bake.yml           layer=${id}  region=<slug>  stage=true     (per region, parallel)\n` +
        `    context-merge-publish.yml  layer=${id}  expect=staged  publish=true   (ONE per-layer publish)\n\n` +
        (id === 'sea'
          ? `⛔ Until this lands the client keeps fetching the coastline LIVE from Overpass to draw the sea — the exact ` +
            `third-party dependency the whole bake exists to remove.`
          : `⛔ Until this lands §STREET-LIFE SYNTHESISES lamps and pedestrians from the road network. That is scenery. ` +
            `It is honest in the UI and it is **not** coverage, and it is never scored as such above.`),
    });
  }

  // ── C. Terrain ─────────────────────────────────────────────────────────────
  const terrBad = Object.entries(r2.terrain ?? {}).filter(([, p]) => !terrainIsServed(p)).map(([s]) => s);
  if (terrBad.length) {
    const byGroup = {};
    for (const r of model.national) if (terrBad.includes(r.name)) (byGroup[r.group] ??= []).push(r.name);
    const n = cells((row, k, v) => k === 'terrain' && (v.state === 'WIRED' || v.state === 'PARTIAL'));
    steps.push({
      cells: n,
      hours: 20,
      title: `Publish terrain for the ${terrBad.length} declared-but-404 tilesets`,
      body:
        `${terrBad.length} of the ${Object.keys(r2.terrain ?? {}).length} \`terrain.mjs\` NATIONAL_REGIONS slugs answered ` +
        `**HTTP 404** at \`terrain/<slug>/layer.json\`. \`terrainCoverage.ts\` lists every one of them, so a site in any of ` +
        `them attaches NOTHING and sits on flat ellipsoid ground (§TERRAIN-ABSENT-IS-NOT-UNREADABLE, L-12973) — the founder ` +
        `sees a flat plate, not missing detail. By \`terrain-bake-regions.yml\` group, with the shard counts that workflow's ` +
        `own header measured at its default \`tiles_per_shard=3000\`:\n\n` +
        Object.entries(byGroup)
          .sort((a, b) => b[1].length - a[1].length)
          .map(([g, list]) => `    group=${g.padEnd(11)} ${String(list.length).padStart(2)} region(s): ${list.slice(0, 8).join(' ')}${list.length > 8 ? ` +${list.length - 8}` : ''}`)
          .join('\n') +
        `\n\n⛔ \`usa\` is 73 shards and \`canada\` 56 — the two largest waves this workflow has ever run. Dispatch them ` +
        `ALONE, one group per dispatch, never folded together.`,
    });
  }

  // ── D. Countries with no row at all ────────────────────────────────────────
  const absent = matrix.filter((row) => !row.modelled);
  if (absent.length) {
    steps.push({
      cells: absent.length * COLS.length,
      hours: 24,
      title: `Write rows for the ${absent.length} founder-named countries that have NO row in ANY table`,
      body:
        `${absent.map((r) => `**${r.name} (${r.code})**`).join(' · ')} appear in NO table: not \`bake.mjs\` ALL_REGIONS, ` +
        `not \`terrain.mjs\`, not the parcel registry. All ${absent.length * COLS.length} of their cells are ⛔ and **no bake ` +
        `and no publish can move one of them** — the rows have to be written first, which is why this is ranked by cells ` +
        `rather than by runner time.` +
        (absent.some((r) => r.code === 'KR') ? ` **South Korea is one of them, and he named it in capitals.**` : '') +
        `\n\n⚠ Several of these are a DECISION, not a bake: Russia, Syria, Iran, Iraq, Yemen and Palestine each need a ` +
        `sourcing and a sanctions answer before a row is written, and Monaco/San Marino/Vatican/Gibraltar have no ` +
        `Geofabrik extract of their own (they fall inside france/italy/spain and would be clipped boxes, not countries). ` +
        `Name the decision; do not quietly leave them off the page.`,
    });
  }

  // ── E. canopy — named, and named as BOUNDED ────────────────────────────────
  if (!layerIsServed(r2.layers?.canopy)) {
    const n = cells((row, k, v) => k === 'trees' && row.live.length > 0 && v.state !== 'SHIPPED');
    steps.push({
      cells: n,
      hours: 6,
      title: 'Decide the `canopy` scope — it CANNOT be dispatched nationally',
      body:
        `\`canopy.pmtiles\` answered **HTTP ${r2.layers?.canopy?.status ?? 'NOT PROBED'}**. It is \`optIn: true\` — excluded ` +
        `from every default bake — and \`canopy.mjs\` **REFUSES a region over 2,500 km² by name** rather than baking a ` +
        `fraction of it. So "canopy for Germany" is not a thing anyone can dispatch, and **no ordering of runs makes the ` +
        `\`trees\` column ✅ country-wide.** Either bake it per metro (\`context-bake-canopy.yml\`) and say on the page that ` +
        `trees are OSM points everywhere else, or drop \`canopy\` from what "trees" means. This is a SCOPE decision for the ` +
        `founder, not a runner-time problem — which is exactly why it is listed rather than estimated away.`,
    });
  }

  return steps.map((s) => ({ ...s, rate: s.hours ? s.cells / s.hours : s.cells }));
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const yn = (b) => (b ? 'yes' : 'no');

export function renderLedger(model, probe, r2 = null) {
  const { countries } = model;
  const rows = [...countries.values()].sort((a, b) => {
    const order = { COMPLETE: 0, PARTIAL: 1, ABSENT: 2 };
    return order[a.verdict] - order[b.verdict] || a.name.localeCompare(b.name);
  });
  const counts = {
    complete: rows.filter((r) => r.verdict === 'COMPLETE').length,
    partial: rows.filter((r) => r.verdict === 'PARTIAL').length,
    absent: rows.filter((r) => r.verdict === 'ABSENT').length,
  };
  const L = [];
  const w = (s = '') => L.push(s);

  w('# PRYZM WORLD COVERAGE LEDGER');
  w('');
  w('> ⛔ **GENERATED FILE — DO NOT HAND-EDIT.** Regenerate with');
  w('> `node tools/coverage-ledger/build.mjs`. Every number below is read from the');
  w('> table that decides it (`bake.mjs` `ALL_REGIONS` / `stampBboxesFor`, `terrain.mjs`');
  w('> `NATIONAL_REGIONS` + `REGIONS`, `heightSources.mjs` `REGION_SOURCE` + the `*_BBOXES`');
  w('> working sets, `terrainCoverage.ts`, the parcel `registry.ts`, the server proxy legs)');
  w('> plus one LIVE probe of the published R2 manifest. A hand-copied coverage list rots,');
  w('> and a rotted one **certifies a gap as covered** — which is exactly how Ciudad Real');
  w('> shipped without measured heights (L-12946).');
  w('');
  w('**This page answers one question: _what does PRYZM actually serve HERE?_**');
  w('');
  w(`Generated: ${new Date().toISOString()}`);
  w('');

  // ── §0 PROBE RECORD ──
  w('## §0 · Probe record (C57 §1.5 — the exact answer, never a claim)');
  w('');
  w('```');
  w(probe.probe);
  w('```');
  w('');
  if (!probe.ok && probe.manifest) {
    w('> ⚠ **The live probe FAILED and the published-set column below is read from the');
    w('> committed snapshot** (`tools/coverage-ledger/manifest-snapshot.json`). It is a');
    w('> snapshot, said by name — not a live reading.');
    w('');
  } else if (!probe.ok) {
    w('> ⛔ **The live probe FAILED and there is NO snapshot.** Every "published" cell below');
    w('> reads UNKNOWN. This page does not guess what is on R2.');
    w('');
  }
  if (probe.manifest) {
    w(`- manifest \`mergedAt\`: \`${probe.manifest.mergedAt}\` · \`mergeRunId\`: \`${probe.manifest.mergeRunId}\` · \`mergeGitSha\`: \`${probe.manifest.mergeGitSha}\``);
    w(`- layers on R2: ${Object.keys(probe.manifest.layers ?? {}).map((k) => `\`${k}\``).join(' · ')}`);
    w(`- regions in \`layers.buildings.sources\`: **${(probe.manifest.layers?.buildings?.sources ?? []).length}**`);
    w('');
    w('> ⚠ **The manifest records `heightJoin` per region but NOT the footprint mode.** A');
    w('> published tileset therefore cannot tell you whether it was baked with');
    w('> `--footprints osm` (the default, every run to date) or `official`. That is a real');
    w('> hole in the provenance chain, named here rather than papered over.');
    w('');
  }

  // ── §1 SUMMARY ──
  w('## §1 · Summary');
  w('');
  w(`| | count |`);
  w(`|---|---|`);
  w(`| Countries/territories with at least one row anywhere | **${rows.length - counts.absent}** |`);
  w(`| — verdict COMPLETE | **${counts.complete}** |`);
  w(`| — verdict PARTIAL | **${counts.partial}** |`);
  w(`| — verdict ABSENT (zero rows in every table) | **${counts.absent}** |`);
  w(`| Context bake regions (\`bake.mjs\` ALL_REGIONS) | **${model.bakeRegions.length}** |`);
  w(`| — of those, published in the live buildings tileset | **${model.bakeRegions.filter((r) => model.publishedBuildings.has(r.name)).length}** |`);
  w(`| — **baked in code but NOT on R2** (a region a user cannot see) | **${model.bakeRegions.filter((r) => !model.publishedBuildings.has(r.name)).length}** |`);
  w(`| Context layers baked per region | **${model.bakeLayers.filter((l) => !l.optIn).length}** default (\`${model.bakeLayers.filter((l) => !l.optIn).map((l) => l.id).join(' ')}\`) + **${model.bakeLayers.filter((l) => l.optIn).length}** opt-in (\`${model.bakeLayers.filter((l) => l.optIn).map((l) => l.id).join(' ')}\`) |`);
  w(`| Regions declaring a \`heightJoin\` | **${model.bakeRegions.filter((r) => r.heightJoin).length}** of ${model.bakeRegions.length} |`);
  w(`| — whose working set is WHOLE-COUNTRY | **${model.bakeRegions.filter((r) => r.heightJoin && model.sets[model.dispatch[r.heightJoin]]?.scope === 'WHOLE-COUNTRY').length}** |`);
  w(`| Terrain national regions (\`NATIONAL_REGIONS\`) | **${model.national.length}** |`);
  w(`| Terrain city regions (\`REGIONS\`) | **${model.cities.length}** (${model.cities.filter((c) => c.blocked).length} blocked) |`);
  w(`| Client terrain rows (\`terrainCoverage.ts\`) | **${model.client.cities.length}** cities + **${model.client.regions.length}** regions |`);
  w(`| Parcel jurisdictions registered | **${model.parcels.length}** (${model.parcels.filter((p) => p.kind === 'cadastral').length} cadastral · ${model.parcels.filter((p) => p.kind === 'footprint-fallback').length} footprint-fallback) |`);
  w(`| — cadastral rows with a WIRED server leg | **${model.parcels.filter((p) => p.kind === 'cadastral' && legIsWired(p.proxyPath, model.server)).length}** |`);
  w('');
  w('**Verdict rule** (applied mechanically, printed so it can be argued with):');
  w('');
  w('- **ABSENT** — no context row, no terrain row, no parcel row. Nothing at all.');
  w('- **COMPLETE** — every context region published live · terrain covers the country (a');
  w('  national region, not a city box) · a measured height join whose working set is');
  w('  WHOLE-COUNTRY · at least one cadastral parcel row with a wired server leg.');
  w('- **PARTIAL** — anything else. **The gap is named in the row.**');
  w('');

  // ── §2 THE COUNTRY LEDGER ──
  w('## §2 · The country ledger');
  w('');
  w('| Country | Context | Live on R2 | Terrain | Heights | Footprints | Parcels | Verdict |');
  w('|---|---|---|---|---|---|---|---|');
  for (const c of rows) {
    const ctx = c.contextRegions.length ? `${c.contextRegions.length} region(s): \`${c.contextRegions.map((r) => r.name).join(' ')}\`` : '—';
    const live = c.contextRegions.length
      ? c.unpublished.length === 0 ? `all ${c.published.length}` : `${c.published.length}/${c.contextRegions.length} — **missing \`${c.unpublished.join(' ')}\`**`
      : '—';
    const terr = c.terrainNational.length
      ? `${GROUP_MEANS[c.terrainNational[0].group] === 'whole country' ? 'national' : `**${c.terrainNational.length}× ${GROUP_MEANS[c.terrainNational[0].group]}**`} \`${c.terrainNational.map((r) => r.name).join(' ')}\`${c.terrainCities.length ? ` + ${c.terrainCities.length} city` : ''}`
      : c.terrainCities.length ? `**${c.terrainCities.length} city box(es) only**` : '—';
    const h = [...new Map(c.heights.filter((x) => x.heightJoin).map((x) => [x.heightJoin, x])).values()];
    const hCell = c.contextRegions.length === 0
      ? '—'
      : h.length
        ? h.map((x) => `\`${x.heightJoin}\` ${x.scope === 'WHOLE-COUNTRY' ? '**WHOLE-COUNTRY**' : x.scope === 'CITY-LIST' ? `**city list (${x.places.length})**` : 'region bbox'}`).join('; ')
        : '**none — assumed default**';
    const fp = c.contextRegions.some((r) => r.footprintSource)
      ? `OSM · official \`${c.contextRegions.filter((r) => r.footprintSource).map((r) => r.footprintSource).join(' ')}\` (opt-in only)`
      : c.contextRegions.some((r) => r.buildingsSource === 'overture') ? 'Overture' : c.contextRegions.length ? 'OSM' : '—';
    const cad = c.parcels.filter((p) => p.kind === 'cadastral');
    const pCell = cad.length
      ? `${cad.filter((p) => p.wired).length}/${cad.length} cadastral wired${c.parcels.length > cad.length ? ` (+${c.parcels.length - cad.length} fallback)` : ''}`
      : c.parcels.length ? `${c.parcels.length} footprint-fallback` : '—';
    const v = c.verdict === 'COMPLETE' ? '✅ COMPLETE' : c.verdict === 'ABSENT' ? '⛔ **ABSENT**' : '🟡 PARTIAL';
    w(`| **${esc(c.name)}** (${c.code}) | ${esc(ctx)} | ${esc(live)} | ${esc(terr)} | ${esc(hCell)} | ${esc(fp)} | ${esc(pCell)} | ${v} |`);
  }
  w('');
  w('### Named gaps, per country');
  w('');
  for (const c of rows) {
    if (c.verdict === 'COMPLETE') continue;
    w(`- **${c.name} (${c.code})** — ${c.gaps.length ? c.gaps.map((g) => g).join(' · ') : 'no row in any table'}`);
  }
  w('');

  // ── §3 CONTEXT REGION DETAIL ──
  w('## §3 · Context bake regions (`bake.mjs` ALL_REGIONS)');
  w('');
  w('| Region | Country | bbox | Buildings | heightJoin | Working set | Official footprints | Live on R2 |');
  w('|---|---|---|---|---|---|---|---|');
  for (const r of model.bakeRegions) {
    const code = countryOfBakeRegion(r) ?? '⛔UNMAPPED';
    const setName = r.heightJoin ? model.dispatch[r.heightJoin] : null;
    const set = setName ? model.sets[setName] : null;
    const ws = !r.heightJoin
      ? '—'
      : set
        ? set.scope === 'WHOLE-COUNTRY'
          ? `**WHOLE-COUNTRY** (\`${setName}\`)`
          : `**${set.places.length} cities** (\`${setName}\`): ${set.places.join(' ')}`
        : 'the region bbox';
    w(`| \`${r.name}\` | ${code} | \`${r.bbox}\` | ${r.buildingsSource} | ${r.heightJoin ? `\`${r.heightJoin}\`` : '—'} | ${esc(ws)} | ${r.footprintSource ? `\`${r.footprintSource}\` (${r.footprintMerge})` : '—'} | ${model.publishedBuildings.size ? yn(model.publishedBuildings.has(r.name)) : 'UNKNOWN'} |`);
  }
  w('');

  // ── §3b LIVE vs DECLARED ──
  w('## §3b · Live vs declared — is what a user clicks what the code says?');
  w('');
  w('> ⭐ **A `heightJoin` in §3 describes the CODE. It does not describe the TILES.** A');
  w('> region whose live tiles were baked BEFORE its deciding tables last changed is still');
  w('> serving the old behaviour, and reading the code alone states a FALSE fact about it.');
  w('> That is exactly the Ciudad Real shape: `stampBboxesFor(\'mds\')` returns the whole');
  w('> country in the code TODAY, while the tiles a user clicks were baked from the nine');
  w('> metros. **A region marked STALE below needs a re-bake, not a code change.**');
  w('');
  w('| Region | Live baked at | Live sha | Live heightJoin | Declared heightJoin | Deciding tables last changed | Verdict |');
  w('|---|---|---|---|---|---|---|');
  for (const r of model.bakeRegions) {
    const s = model.staleness[r.name];
    const v = !s?.bakedAt
      ? '⛔ **NOT PUBLISHED**'
      : s.joinDrift
        ? '⛔ **JOIN DRIFT** — live tiles carry a different join'
        : s.stale === true
          ? '⚠ **STALE — re-bake needed**'
          : s.stale === false ? '✅ current' : 'UNKNOWN (no git)';
    w(`| \`${r.name}\` | ${s?.bakedAt ?? '—'} | ${s?.bakeGitSha ? `\`${String(s.bakeGitSha).slice(0, 8)}\`` : '—'} | ${s?.liveHeightJoin ? `\`${s.liveHeightJoin}\`` : '—'} | ${r.heightJoin ? `\`${r.heightJoin}\`` : '—'} | ${s?.lastChange ?? 'UNKNOWN'} | ${v} |`);
  }
  w('');

  // ── §3c ORPHANS ON R2 ──
  const codeNames = new Set(model.bakeRegions.map((r) => r.name));
  const orphans = [...model.publishedBuildings].filter((n) => !codeNames.has(n));
  w('## §3c · Orphans — regions on R2 that the code no longer has');
  w('');
  w('The reverse of §3, and it is not symmetric: a region the CODE has and R2 lacks is');
  w('un-shipped work, while a region R2 has and the CODE lacks is **tiles nobody can');
  w('re-bake**. It is what a rename leaves behind (`riyadh` → `gccstates`), and the next');
  w('merge — a union of STAGED regions only, with no carry-forward — is where those tiles');
  w('quietly stop existing. Named here so the disappearance is a decision, not a surprise.');
  w('');
  w(orphans.length
    ? `**${orphans.length} orphan(s):** ${orphans.map((n) => `\`${n}\``).join(' · ')}`
    : '**None** — every region in the live tileset still has a `bake.mjs` row.');
  w('');

  // ── §4 THE HEIGHT TRAP ──
  w('## §4 · Height working sets — where a "measured height" actually exists');
  w('');
  w('> ⭐ **THE TRAP, STATED ONCE.** A footprint OUTSIDE its region\'s stamp bboxes streams');
  w('> through the join with its original OSM tags and ships an **`assumed`** default');
  w('> (9 m). On the map that is **indistinguishable from "the source has no data here"** —');
  w('> the failure-vs-empty conflation this repo has re-learned at L-422 / L-457 / L-467 /');
  w('> L-469 and, most recently, at Ciudad Real (L-12946). So a `heightJoin` in §3 does NOT');
  w('> mean the country has real heights. **This table is where they exist.**');
  w('');
  w('| heightJoin | Working set constant | Scope | Places | Channel | impl | provenance |');
  w('|---|---|---|---|---|---|---|');
  const seen = new Set();
  for (const r of model.bakeRegions) {
    if (!r.heightJoin || seen.has(r.heightJoin)) continue;
    seen.add(r.heightJoin);
    const setName = model.dispatch[r.heightJoin];
    const set = setName ? model.sets[setName] : null;
    const chan = model.regionSource[r.name];
    const src = chan?.source ? model.sourceTable[chan.source] : null;
    w(`| \`${r.heightJoin}\` | ${setName ? `\`${setName}\`` : '— (the region bbox)'} | ${set?.scope === 'WHOLE-COUNTRY' ? '**WHOLE-COUNTRY**' : set ? `**CITY LIST (${set.places.length})**` : 'region bbox'} | ${set ? set.places.join(' ') || '(derived)' : `\`${r.name}\``} | ${chan?.source ? `\`${chan.source}\`` : '—'} | ${src?.impl ?? '—'} | ${src?.provenance ?? '—'} |`);
  }
  w('');
  w('Regions with **no** `heightJoin` at all (every building ships the assumed default):');
  w('');
  w(model.bakeRegions.filter((r) => !r.heightJoin).map((r) => `\`${r.name}\``).join(' · ') || '(none)');
  w('');

  // ── §5 TERRAIN ──
  w('## §5 · Terrain');
  w('');
  w(`\`NATIONAL_REGIONS\` — **${model.national.length}** whole-region tilesets (Mapterhorn terrarium + per-post EGM2008 lift, z0..10). These are the VISUAL drape; they are never the L-584 legal sampling source.`);
  w('');
  const byGroup = {};
  for (const r of model.national) (byGroup[r.group] ??= []).push(r.name);
  w('| Group | Regions | Count |');
  w('|---|---|---|');
  for (const [g, names] of Object.entries(byGroup)) w(`| \`${g}\` | ${names.map((n) => `\`${n}\``).join(' ')} | ${names.length} |`);
  w('');
  w(`\`REGIONS\` — **${model.cities.length}** per-city tilesets from NATIONAL legal-grade DTM adapters (${model.cities.filter((c) => c.blocked).length} carried BLOCKED with a reason, never silently dropped):`);
  w('');
  w('| City | DTM country | Blocked because |');
  w('|---|---|---|');
  for (const c of model.cities.filter((x) => x.blocked)) w(`| \`${c.name}\` | ${c.source} | ${esc(c.blocked)} |`);
  w('');
  const clientCityMissing = model.cities.filter((c) => !c.blocked && !model.client.cities.includes(c.name)).map((c) => c.name);
  const clientRegionMissing = model.national.filter((r) => !model.client.regions.includes(r.name)).map((r) => r.name);
  w(`Client attach (\`terrainCoverage.ts\`): **${model.client.cities.length}** city rows + **${model.client.regions.length}** region rows.`);
  w('');
  w(`- bakeable terrain cities the client will **NOT** request (baked, never attached → wasted bake): ${clientCityMissing.length ? clientCityMissing.map((n) => `\`${n}\``).join(' ') : '**none**'}`);
  w(`- national regions the client will **NOT** request: ${clientRegionMissing.length ? clientRegionMissing.map((n) => `\`${n}\``).join(' ') : '**none**'}`);
  w('');

  // ── §6 PARCELS ──
  w('## §6 · Parcels — does a click resolve a real parcel?');
  w('');
  w('`kind: cadastral` means an open keyless register answers here. It only resolves a');
  w('click if the **server leg exists** — the `wired` column reads `EU_CADASTRE_SOURCES`');
  w('in `server/jurisdiction/euCadastreProxy.js` (or, for Spain, the literal route), so a');
  w('row that is declared-but-unrouted cannot read as covered.');
  w('');
  w('| Region code | Country | Provider | kind | Proxy route | Server leg wired |');
  w('|---|---|---|---|---|---|');
  for (const p of model.parcels) {
    const wired = legIsWired(p.proxyPath, model.server);
    w(`| \`${p.regionCode}\` | ${esc(p.countryName)} | \`${p.providerId}\` | ${p.kind === 'cadastral' ? '**cadastral**' : 'footprint-fallback'} | ${p.proxyPath ? `\`${p.proxyPath}\`` : '—'} | ${p.kind === 'cadastral' ? (wired ? '✅ yes' : '⛔ **NO**') : 'n/a'} |`);
  }
  w('');

  // ── §7 ABSENCES ──
  w('## §7 · Named absences and the founder watchlist');
  w('');
  w('A quiet omission and a refusal are different claims (C57 §1.9), so every country with');
  w('**no row in any table** is listed here by name rather than left off the page.');
  w('');
  const absent = rows.filter((r) => r.verdict === 'ABSENT');
  w(`**ABSENT (${absent.length})** — no \`bake.mjs\` region, no \`terrain.mjs\` region, no parcel jurisdiction:`);
  w('');
  w(absent.length ? absent.map((c) => `- **${c.name} (${c.code})**`).join('\n') : '- (none)');
  w('');
  w('**Founder watchlist** — the countries named in "extend everything to Japan, Mexico,');
  w('Canada". Reported whatever their state, so the answer is never inferred from silence:');
  w('');
  for (const code of FOUNDER_WATCHLIST) {
    const c = countries.get(code);
    if (!c) { w(`- **${COUNTRY_NAME[code] ?? code} (${code})** — not modelled at all.`); continue; }
    w(`- **${c.name} (${code})** — **${c.verdict}**${c.gaps.length ? ` · ${c.gaps.join(' · ')}` : ''}`);
  }
  w('');
  if (model.unmapped.length) {
    w('> ⛔ **UNMAPPED SLUGS — the build FAILED.** These slugs exist in a source table but');
    w('> have no country in `COUNTRY_OF_SLUG`, so they would have been silently dropped:');
    w('>');
    w(`> ${model.unmapped.map((s) => `\`${s}\``).join(' · ')}`);
    w('');
  }

  // ── §8 THE FOUNDER MATRIX ──
  if (r2) {
    const matrix = buildFounderMatrix(model, r2);
    w('## §8 · The founder\'s matrix — his countries × his layers');
    w('');
    w('> **The ask, 2026-09-06:** _"make sure that ALL European countries, Middle East,');
    w('> Australia, New Zealand, Japan, SOUTH KOREA, USA, Canada and Mexico are completed —');
    w('> parcels, 3d context buildings, terrain, roads, pedestrians, trees, water, green');
    w('> areas and cadastral data. IN ALL 💯"_');
    w('');
    w('⛔ **A cell reads ✅ only when a PROBE returned bytes a browser can read for a slug');
    w('inside that country.** A `bake.mjs` row is not coverage, a green test suite is not a');
    w('user capability, and an HTTP 200 on a manifest is not proof a layer is in it');
    w('(L-12976, L-12982). The probe record is §8a.');
    w('');
    w('### §8a · The probe record (C57 §1.5)');
    w('');
    w('```');
    w(r2.note);
    w('```');
    w('');
    w('| Layer archive | HTTP | object bytes | content-type | leading magic | Last-Modified | verdict |');
    w('|---|---|---|---|---|---|---|');
    for (const l of model.bakeLayers) {
      const p = r2.layers?.[l.id];
      if (!p) { w(`| \`${l.id}.pmtiles\` | — | — | — | — | — | ❔ NOT PROBED |`); continue; }
      w(
        `| \`${l.id}.pmtiles\` | ${p.status} | ${p.bytes?.toLocaleString?.() ?? p.bytes ?? '—'} | ${p.contentType ?? '—'} | \`${p.magic ?? '—'}\`` +
        ` | ${p.lastModified ?? '—'} | ${layerIsServed(p) ? '✅ served (206 + PMTiles magic)' : `⛔ **NOT SERVED** — \`${p.magic}\` is not \`${PMTILES_MAGIC}\``} |`,
      );
    }
    w('');
    const tOk = Object.values(r2.terrain ?? {}).filter(terrainIsServed).length;
    const tAll = Object.keys(r2.terrain ?? {}).length;
    w(`**Terrain tilesets:** \`terrain/<slug>/layer.json\` probed for all **${tAll}** \`NATIONAL_REGIONS\` slugs — **${tOk} answered HTTP 200, ${tAll - tOk} answered 404.** Every one of the 404s is listed in the client's \`TERRAIN_REGION_BBOXES\`, so a site there attaches nothing and sits on flat ellipsoid ground.`);
    w('');
    w('> ⚠ **NOT PROBED:** the **592 per-city** DTM tilesets (`terrain.mjs` `REGIONS`), and any');
    w('> tile BELOW `layer.json`. A 200 on `layer.json` proves the tileset was published, not');
    w('> that every tile in it renders. Said rather than implied.');
    w('');

    // ── §8b THE TRANSLATION ──
    w('### §8b · His words → the pipeline\'s artefacts');
    w('');
    w('The founder does not speak in layer ids, and translating in a lane\'s head is how');
    w('"pedestrians" quietly became "we synthesise some". The mapping is declared in');
    w('`FOUNDER_LAYER_MAP` and every verdict below is computed from it.');
    w('');
    w('| His word | The pipeline\'s reality |');
    w('|---|---|');
    for (const L of FOUNDER_LAYER_MAP) w(`| **${L.founder}** | ${L.means} |`);
    w('');
    w('A multi-artefact cell takes the **WEAKEST** of its parts. That is why no country can');
    w('read ✅ on `water` while `sea.pmtiles` 404s, or on `trees` while `canopy.pmtiles` does.');
    w('');

    // ── §8c THE MATRIX ──
    const cols = FOUNDER_LAYER_MAP.map((L) => L.founder);
    w('### §8c · The matrix');
    w('');
    w(`**${matrix.length} countries** in the founder's set · legend: ✅ SHIPPED (bytes probed) · 🟡 PARTIAL · 🟠 WIRED, NOT PUBLISHED · ⛔ ABSENT (no row anywhere) · ❔ not probed`);
    w('');
    w(`| Country | ${cols.join(' | ')} | ✅ |`);
    w(`|---|${cols.map(() => '---').join('|')}|---|`);
    for (const group of Object.keys(FOUNDER_SET)) {
      const rowsIn = matrix.filter((r) => r.group === group);
      if (!rowsIn.length) continue;
      w(`| **${group.toUpperCase()}** (${rowsIn.length}) | ${cols.map(() => ' ').join(' | ')} | |`);
      for (const r of rowsIn.sort((a, b) => b.shipped - a.shipped || a.name.localeCompare(b.name))) {
        w(`| ${esc(r.name)} (\`${r.code}\`) | ${cols.map((k) => CELL_MARK[r.cells[k].state]).join(' | ')} | ${r.shipped}/${cols.length} |`);
      }
    }
    w('');
    const tot = {};
    for (const k of cols) tot[k] = Object.fromEntries(CELL_ORDER.map((s) => [s, matrix.filter((r) => r.cells[k].state === s).length]));
    w(`| Column total (of ${matrix.length}) | ${cols.join(' | ')} |`);
    w(`|---|${cols.map(() => '---').join('|')}|`);
    for (const s of ['SHIPPED', 'PARTIAL', 'WIRED', 'ABSENT']) {
      w(`| ${CELL_MARK[s]} ${s} | ${cols.map((k) => tot[k][s]).join(' | ')} |`);
    }
    w('');
    const fullyShipped = matrix.filter((r) => r.shipped === cols.length);
    w(`**Countries complete on ALL ${cols.length} layers: ${fullyShipped.length}** — ${fullyShipped.length ? fullyShipped.map((r) => r.name).join(', ') : '**none**'}.`);
    w('');

    // ── §8d THE EVIDENCE ──
    w('### §8d · The evidence behind every non-✅ cell');
    w('');
    w('One line per country per gap, naming the artefact and the HTTP answer. This is the');
    w('part that cannot be a hand-typed table: it is regenerated from the probes each run.');
    w('');
    for (const r of matrix) {
      const gaps = Object.entries(r.cells).filter(([, v]) => v.state !== 'SHIPPED');
      if (!gaps.length) continue;
      w(`<details><summary><b>${esc(r.name)} (${r.code})</b> — ${r.shipped}/${cols.length} shipped${r.modelled ? '' : ' · <b>NO ROW IN ANY TABLE</b>'}${r.declared.length ? ` · bake rows: <code>${r.declared.slice(0, 8).join(' ')}${r.declared.length > 8 ? ` +${r.declared.length - 8}` : ''}</code>` : ''}${r.orphanLive.length ? ` · <b>live only via ORPHAN slug(s)</b>: <code>${r.orphanLive.join(' ')}</code>` : ''}</summary>`);
      w('');
      for (const [k, v] of gaps) w(`- ${CELL_MARK[v.state]} **${k}** — ${v.why}`);
      w('');
      w('</details>');
      w('');
    }

    // ── §9 THE SHORTEST PATH ──
    const steps = buildShortestPath(matrix, model, r2);
    w('## §9 · The shortest path — most cells green per hour of runner time');
    w('');
    w('Derived from §8c, so it cannot propose work that is already done. The ORDER is');
    w('DEPENDENCY-FIRST, not rate-first: a per-layer bake runs over STAGED regions, so step 1');
    w('unblocks steps 2-3 and no ordering by cells/hour would have found that.');
    w('');
    w('⚠ **The hour figures are ESTIMATES and are labelled as such; the CELL counts are');
    w('measured.** Two ceilings bind every');
    w('step: the **330-minute** GitHub Actions job limit (dispatch per region/shard, never');
    w('one job) and the merge\'s **disk cliff** — a run has already refused with "MERGE');
    w('CANNOT FIT", and `context-merge-publish.yml`\'s `layer` input (per-layer publishes)');
    w('is the escape.');
    w('');
    steps.forEach((s, i) => {
      w(`### ${i + 1}. ${s.title}`);
      w('');
      w(`**${s.cells} country-cell(s)** · ~${s.hours} runner-hour(s) *(estimate)* · **${(s.rate).toFixed(1)} cells/hour**`);
      w('');
      w(s.body);
      w('');
    });
    w('> ⛔ **This lane dispatched nothing.** Fleet rule: a lane returns an ordered dispatch');
    w('> list, it does not run workflows or deploy.');
    w('');
  }

  w('---');
  w('');
  w('Regenerate: `node tools/coverage-ledger/build.mjs` · pinned by');
  w('`tools/context-bake/__tests__/worldCoverageLedger.spec.ts` (a `bake.mjs` region that is');
  w('missing from this page fails CI).');
  w('');
  return L.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const offline = args.includes('--offline');
  const check = args.includes('--check');

  const probe = await probeManifest({ offline });
  const model = buildModel({ manifest: probe.manifest });
  // §FOUNDER-MATRIX — the layer ids and terrain slugs come from the TABLES, never a hand
  // list, so a new layer or a new terrain row is probed the first time it is declared.
  const r2 = await probeR2Objects({
    offline,
    layerIds: model.bakeLayers.map((l) => l.id),
    terrainSlugs: model.national.map((r) => r.name),
  });
  const md = renderLedger(model, probe, r2);

  if (model.unmapped.length) {
    console.error(`✖ coverage-ledger: ${model.unmapped.length} UNMAPPED slug(s) — add them to COUNTRY_OF_SLUG:`);
    for (const s of model.unmapped) console.error(`    ${s}`);
    console.error('  A slug with no country would be a SILENTLY DROPPED row. Refusing.');
    process.exitCode = 2;
    return;
  }

  if (check) {
    const on = existsSync(LEDGER_PATH) ? readFileSync(LEDGER_PATH, 'utf8') : '';
    // ⚠ `--check` asks ONE question: does the page still describe the CODE? So the two
    // parts that legitimately differ run to run are normalised away — the generated-at
    // stamp, and the whole §0 probe record (a live probe and an `--offline` snapshot read
    // write different prose about the same manifest). Without this, `--check --offline`
    // reported STALE on a page that was byte-correct, which would have trained everyone
    // to ignore the check — the worst possible outcome for a staleness gate.
    const norm = (s) =>
      s
        .replace(/^Generated: .*$/m, 'Generated: <stamp>')
        .replace(/## §0 · Probe record[\s\S]*?(?=## §1 · Summary)/, '<probe record>\n\n');
    if (norm(on) !== norm(md)) {
      console.error('✖ coverage-ledger: docs/04-reference/WORLD-COVERAGE-LEDGER.md is STALE. Run: node tools/coverage-ledger/build.mjs');
      process.exitCode = 1;
      return;
    }
    console.log('✔ coverage-ledger: the page matches the code.');
    return;
  }

  writeFileSync(LEDGER_PATH, md, 'utf8');
  // Rewrite the snapshot ONLY when the manifest itself moved. Stamping `probedAt` on
  // every run made a one-line diff on a 939-line file each time anyone regenerated —
  // pure churn in a shared tree, and churn is how a real change stops being noticed.
  if (probe.ok && probe.mode === 'live') {
    const prev = existsSync(SNAPSHOT_PATH) ? JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) : null;
    const changed = JSON.stringify(prev?.manifest ?? null) !== JSON.stringify(probe.manifest);
    if (changed) {
      writeFileSync(SNAPSHOT_PATH, JSON.stringify({ probedAt: probe.probedAt, url: MANIFEST_URL, manifest: probe.manifest }, null, 2) + '\n', 'utf8');
      console.log('  snapshot: UPDATED (the live manifest moved)');
    } else {
      console.log('  snapshot: unchanged');
    }
  }
  if (r2.mode === 'live') {
    const prevR2 = existsSync(R2_PROBE_SNAPSHOT_PATH) ? JSON.parse(readFileSync(R2_PROBE_SNAPSHOT_PATH, 'utf8')) : null;
    // Compare the ANSWERS, not the whole record: `ms` and `probedAt` move every run and
    // would rewrite a 150-region file on every regeneration — churn is how a real change
    // stops being noticed (the same reasoning as the manifest snapshot above).
    const sig = (o) => JSON.stringify(Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, [v.status, v.bytes, v.contentType, v.lastModified, v.magic]])));
    const moved = sig(prevR2?.layers) !== sig(r2.layers) || sig(prevR2?.terrain) !== sig(r2.terrain);
    if (moved) {
      writeFileSync(R2_PROBE_SNAPSHOT_PATH, JSON.stringify({ probedAt: r2.probedAt, base: R2_TILES_BASE, layers: r2.layers, terrain: r2.terrain }, null, 2) + '\n', 'utf8');
      console.log('  r2-probe snapshot: UPDATED (an object answer moved)');
    } else {
      console.log('  r2-probe snapshot: unchanged');
    }
  }

  const rows = [...model.countries.values()];
  console.log(`✔ coverage-ledger → docs/04-reference/WORLD-COVERAGE-LEDGER.md`);
  console.log(`  ${rows.length} countries · COMPLETE ${rows.filter((r) => r.verdict === 'COMPLETE').length} · PARTIAL ${rows.filter((r) => r.verdict === 'PARTIAL').length} · ABSENT ${rows.filter((r) => r.verdict === 'ABSENT').length}`);
  console.log(`  ${model.bakeRegions.length} bake regions · ${model.publishedBuildings.size} live on R2 · ${model.national.length} terrain regions · ${model.cities.length} terrain cities · ${model.parcels.length} parcel jurisdictions`);
  console.log(`  probe: ${probe.mode} · r2-objects: ${r2.mode}`);
  const fm = buildFounderMatrix(model, r2);
  const cols = FOUNDER_LAYER_MAP.length;
  console.log(`  §8 founder matrix: ${fm.length} countries × ${cols} layers · complete on ALL layers: ${fm.filter((r) => r.shipped === cols).length} · no row anywhere: ${fm.filter((r) => !r.modelled).map((r) => r.code).join(' ') || 'none'}`);
}

// CLI-ONLY guard. The spec IMPORTS this module for its tables, so `main()` must
// run for `node build.mjs` and for nothing else — an argv sniff that merely ends
// with 'build.mjs' would fire inside a test runner too.
const invokedDirectly = (() => {
  try { return resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url); }
  catch { return false; }
})();
if (invokedDirectly) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
