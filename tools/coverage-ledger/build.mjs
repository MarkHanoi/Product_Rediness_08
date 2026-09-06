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
const GROUP_MEANS = {
  europe: 'whole country',
  oceania: 'whole country',
  usa: 'metro box',
  middleeast: 'metro box',
  australia: 'state/territory',
};

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
  syria: 'SY', iraq: 'IQ', iran: 'IR', egypt: 'EG', japan: 'JP',
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
  JP: 'Japan', MX: 'Mexico', CA: 'Canada',
  JO: 'Jordan', LB: 'Lebanon', SY: 'Syria', IQ: 'Iraq', IR: 'Iran', EG: 'Egypt',
  // §EUROPE-COMPLETION wave (landing 2026-09-06 from sibling lanes)
  IS: 'Iceland', FO: 'Faroe Islands', MT: 'Malta', CY: 'Cyprus', RS: 'Serbia',
  BA: 'Bosnia and Herzegovina', ME: 'Montenegro', MK: 'North Macedonia', AL: 'Albania',
  XK: 'Kosovo', UA: 'Ukraine', BY: 'Belarus', MD: 'Moldova', AD: 'Andorra',
  LI: 'Liechtenstein', JE: 'Channel Islands (Guernsey/Jersey)', IM: 'Isle of Man',
  MC: 'Monaco', SM: 'San Marino',
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
export function buildModel({ manifest } = {}) {
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
// RENDER
// ─────────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const yn = (b) => (b ? 'yes' : 'no');

export function renderLedger(model, probe) {
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
  const md = renderLedger(model, probe);

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
  if (probe.ok && probe.mode === 'live') {
    writeFileSync(SNAPSHOT_PATH, JSON.stringify({ probedAt: probe.probedAt, url: MANIFEST_URL, manifest: probe.manifest }, null, 2) + '\n', 'utf8');
  }

  const rows = [...model.countries.values()];
  console.log(`✔ coverage-ledger → docs/04-reference/WORLD-COVERAGE-LEDGER.md`);
  console.log(`  ${rows.length} countries · COMPLETE ${rows.filter((r) => r.verdict === 'COMPLETE').length} · PARTIAL ${rows.filter((r) => r.verdict === 'PARTIAL').length} · ABSENT ${rows.filter((r) => r.verdict === 'ABSENT').length}`);
  console.log(`  ${model.bakeRegions.length} bake regions · ${model.publishedBuildings.size} live on R2 · ${model.national.length} terrain regions · ${model.cities.length} terrain cities · ${model.parcels.length} parcel jurisdictions`);
  console.log(`  probe: ${probe.mode}`);
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
