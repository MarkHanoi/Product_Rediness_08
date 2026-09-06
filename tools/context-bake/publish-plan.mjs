// ─────────────────────────────────────────────────────────────────────────────
// publish-plan.mjs — the ORDERED context publish plan, GENERATED (§PUBLISH-PLAN-IS-GENERATED)
//
// WHY THIS EXISTS. `RUNBOOK-CONTEXT-R2-PUBLISH.md` §8 was the first honest publish plan and it
// is right about the shape — but every number in it is a literal typed into prose, and this
// repo's most expensive recurring defect is exactly that (CLAUDE.md's count/range boxes, six
// recurrences). Worse, the numbers a publish plan needs ROT FASTER THAN MOST: `tiles-staging/`
// accumulates, the live manifest changes on every merge, `bake.mjs` gains rows most days (a
// sibling lane added `southkorea` while this file was being written), and Geofabrik's byte-
// serving leg comes and goes within the hour. So the plan is computed, never transcribed.
//
// WHAT IT IS AUTHORITATIVE ABOUT — and what it is NOT.
//   IS : which regions are live, which are staged, which are orphans, which need a BAKE before
//        they can be merged, the population each unpublished region serves, the predicted bake
//        wall-clock against the 330-minute job ceiling, and the per-LAYER disk arithmetic that
//        decides whether a merge can run at all.
//   NOT: whether a merge will actually fit. That needs the runner's free disk, which NOTHING in
//        this repo has ever written down (§8.6 step 1). This tool prints the requirement and the
//        one proven lower bound; it never claims a fit.
//
// EVERY INPUT IS A MEASUREMENT WITH ITS EXACT ANSWER RECORDED (C57 §1.5):
//   · the LIVE tileset manifest      — GET  <r2.dev>/tiles/tileset-manifest.json
//   · the STAGED sets                — GET  <r2.dev>/tiles-staging/<slug>/staging-manifest.json,
//                                      one per candidate slug; a 404 is a NAMED absence
//   · bake wall-clock                — GET  api.github.com/…/actions/workflows/context-bake.yml/runs,
//                                      joined to each staged set by its own `bakeRunId`
//   · Geofabrik extract sizes        — the `// N B` comments bake.mjs rows already carry (put there
//                                      by the rows' own authors from a measured Content-Length), plus
//                                      an optional live re-probe
//   · population                     — Wikidata P1082, most recent dated value, per QID
//
// ⛔ A SIZE IS NEVER ACCEPTED FROM A NON-2xx. Geofabrik answers 502/503 with a ~3.2 kB HTML body
// that carries its own Content-Length; reading that as an extract size is the failure-vs-empty
// defect this codebase keeps paying for ([[context-data-honesty-family]]).
//
// USAGE
//   node tools/context-bake/publish-plan.mjs                 # offline, from the committed snapshot
//   node tools/context-bake/publish-plan.mjs --probe         # re-measure everything, rewrite it
//   node tools/context-bake/publish-plan.mjs --probe=pbf     # re-measure only the Geofabrik sizes
//   node tools/context-bake/publish-plan.mjs --json          # the model, for a test or a script
//
// LAYERING: build/inspection tooling beside bake.mjs and merge-tiles.mjs. No OTel span (P8 applies
// to runtime exports, not to a CLI that never ships in a bundle) — same standing as
// tools/coverage-ledger/build.mjs, whose readers this file IMPORTS rather than re-parsing bake.mjs
// a second time ([[grep-for-the-existing-solver-first]]).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readBakeRegions, readBakeLayers } from '../coverage-ledger/build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const P = (p) => resolve(REPO, p);
const SNAPSHOT = P('tools/context-bake/publish-plan.probes.json');
const R2 = 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev';
const GH = 'https://api.github.com/repos/MarkHanoi/Product_Rediness_08';
const GiB = 1073741824;

// The nine renamed rows are NOT listed here — orphans are DERIVED (live manifest minus ALL_REGIONS)
// and adjudicated from git below, because a hand-written orphan list is the thing that rots.

// ─────────────────────────────────────────────────────────────────────────────
// SNAPSHOT — the committed probe record. Keyed by URL / QID / runId, never by region name, so a
// sibling lane adding a bake.mjs row never invalidates it and never lands in it.
// ─────────────────────────────────────────────────────────────────────────────
export function loadSnapshot() {
  if (!existsSync(SNAPSHOT)) return { probedAt: null, live: null, staging: {}, bakeRuns: {}, pbf: {}, population: {} };
  return JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
}

async function getText(url, init) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    const body = await res.text();
    return { ok: res.ok, status: res.status, bytes: Buffer.byteLength(body), ms: Date.now() - t0, body, headers: res.headers };
  } catch (err) {
    return { ok: false, status: null, error: String(err?.cause?.code ?? err?.message ?? err), ms: Date.now() - t0 };
  }
}

/** The live tileset — the ONE artefact that says what a user can actually see. */
export async function probeLive() {
  const url = `${R2}/tiles/tileset-manifest.json`;
  const r = await getText(url);
  const probe = `GET ${url} → HTTP ${r.status ?? r.error} · ${r.bytes ?? 0} B · ${r.ms} ms`;
  if (!r.ok) return { probe, manifest: null };
  return { probe, manifest: JSON.parse(r.body) };
}

/**
 * The staged sets. `tiles-staging/` cannot be LISTED without R2 credentials, so every candidate
 * slug is probed by name: each ALL_REGIONS row, each orphan, and each `<region>--<layer>` slug the
 * layer-scoped stage path can produce. A 404 is recorded as a NAMED absence, never as "unknown".
 */
export async function probeStaging(candidates, { concurrency = 10 } = {}) {
  const out = {};
  let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < candidates.length) {
      const slug = candidates[i++];
      const url = `${R2}/tiles-staging/${slug}/staging-manifest.json`;
      const r = await getText(url);
      // ⛔ r2.dev serves the SITE'S index.html for a miss — with a 404 status but an HTML body.
      // Accept a staged set only when the body parses as the staging manifest it claims to be.
      let manifest = null;
      if (r.ok) { try { const j = JSON.parse(r.body); if (j.schema?.startsWith('pryzm-context-staging-manifest')) manifest = j; } catch { /* not JSON */ } }
      out[slug] = { status: r.status ?? r.error, bytes: r.bytes ?? 0, ms: r.ms, manifest };
    }
  }));
  return out;
}

/** Bake wall-clock, joined to each staged set by the `bakeRunId` the bake itself wrote. */
export async function probeBakeRuns() {
  const runs = {};
  for (let page = 1; page <= 3; page++) {
    const url = `${GH}/actions/workflows/context-bake.yml/runs?per_page=100&page=${page}`;
    const r = await getText(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) { runs.__probe = `${runs.__probe ?? ''}GET ${url} → HTTP ${r.status ?? r.error}; `; break; }
    const j = JSON.parse(r.body);
    for (const run of j.workflow_runs ?? []) {
      runs[String(run.id)] = {
        started: run.run_started_at, updated: run.updated_at, conclusion: run.conclusion,
        minutes: Math.round((Date.parse(run.updated_at) - Date.parse(run.run_started_at)) / 60000),
      };
    }
    if ((j.workflow_runs ?? []).length < 100) break;
  }
  return runs;
}

/**
 * Geofabrik extract sizes. The authority is the `// N B` comment each bake.mjs row already carries
 * — put there by the row's author from a measured Content-Length — because Geofabrik's byte-serving
 * leg is intermittent (measured 2026-09-06: 206 · 502 · 503 · timeout, all within minutes, and lane
 * KOREA-FROM-NOTHING recorded the same refusal in the same hour). This re-probe FILLS GAPS; it never
 * overwrites a measured comment and never records a size from a non-206.
 */
export async function probePbf(urls, prior = {}, { concurrency = 3, attempts = 3 } = {}) {
  const out = { ...prior };
  const todo = urls.filter((u) => !(out[u]?.bytes > 0));
  let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < todo.length) {
      const url = todo[i++];
      const tries = [];
      for (let a = 0; a < attempts; a++) {
        const t0 = Date.now();
        try {
          const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, redirect: 'follow', signal: AbortSignal.timeout(45_000) });
          await res.arrayBuffer().catch(() => {});
          const cr = res.headers.get('content-range');
          tries.push(`HTTP ${res.status}${cr ? ` content-range:${cr}` : ''} ${Date.now() - t0}ms`);
          if (res.status === 206 && cr) { out[url] = { status: 206, bytes: Number(cr.split('/')[1]), lastModified: res.headers.get('last-modified'), tries }; break; }
        } catch (err) {
          tries.push(`NETWORK ${String(err?.cause?.code ?? err?.message ?? err)} ${Date.now() - t0}ms`);
        }
        await new Promise((r) => setTimeout(r, 1500 * (a + 1) ** 2));
      }
      if (!(out[url]?.bytes > 0)) out[url] = { status: null, bytes: null, tries };
    }
  }));
  return out;
}

/**
 * Population, from Wikidata P1082 (most recent DATED value per item). The QID mapping below is a
 * NAMING decision made here and checkable from the label the query returns; every NUMBER comes back
 * from the endpoint. `alaskaaleutians` is deliberately 0 — it is a second extract over the same
 * state as `alaska`, so crediting it a population would double-count.
 */
export const POPULATION_QIDS = {
  paris: ['Q90'], lyon: ['Q456'], koln: ['Q365'], greatbritain: ['Q23666'], czechia: ['Q213'],
  faroeislands: ['Q4628'], bosniaherzegovina: ['Q225'], channelislands: ['Q42314'], isleofman: ['Q9676'],
  districtofcolumbia: ['Q61'], georgia: ['Q1428'], puertoricousa: ['Q1183'], usvirginislands: ['Q11703'],
  newfoundland: ['Q2003'], yukon: ['Q2009'], northwestterritories: ['Q2007'], nunavut: ['Q2023'],
  act: ['Q3258'], gccstates: ['Q851', 'Q878', 'Q846', 'Q398', 'Q817', 'Q842'],
};
export const POPULATION_ZERO = { alaskaaleutians: 'second extract over the same state as `alaska` — crediting it would double-count Alaska' };
const WD_CLASSES = { country: 'wd:Q6256', usstate: 'wd:Q35657', caprovince: 'wd:Q11828004', caterritory: 'wd:Q1867183', austate: 'wd:Q5852411', auterritory: 'wd:Q14192234' };

export async function probePopulation() {
  const UA = 'pryzm-publish-plan/1.0 (pryzmhello@gmail.com)';
  const items = {}; const probes = [];
  const run = async (query, tag) => {
    const r = await getText(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA } });
    probes.push(`${tag} → HTTP ${r.status ?? r.error} · ${r.bytes ?? 0} B · ${r.ms} ms`);
    if (!r.ok) return [];
    return JSON.parse(r.body).results.bindings.map((b) => ({
      qid: b.item.value.split('/').pop(), label: b.itemLabel?.value ?? null,
      pop: Number(b.pop.value), date: b.date?.value ?? null,
    }));
  };
  const keep = (rows) => {
    for (const row of rows) {
      const prev = items[row.qid];
      const k = (x) => (x.date ? Date.parse(x.date) : -Infinity);
      if (!prev || k(row) > k(prev)) items[row.qid] = row;
    }
  };
  for (const [tag, cls] of Object.entries(WD_CLASSES)) {
    keep(await run(`SELECT ?item ?itemLabel ?pop ?date WHERE { ?item wdt:P31 ${cls} ; p:P1082 ?st . ?st ps:P1082 ?pop . OPTIONAL { ?st pq:P585 ?date . } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`, tag));
    await new Promise((r) => setTimeout(r, 1200));
  }
  const qids = [...new Set(Object.values(POPULATION_QIDS).flat())];
  keep(await run(`SELECT ?item ?itemLabel ?pop ?date WHERE { VALUES ?item { ${qids.map((q) => 'wd:' + q).join(' ')} } ?item p:P1082 ?st . ?st ps:P1082 ?pop . OPTIONAL { ?st pq:P585 ?date . } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`, 'overrides'));
  return { probes, items };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE ORPHAN ADJUDICATION — derived from git, never from a list
// ─────────────────────────────────────────────────────────────────────────────
const git = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/**
 * bake.mjs's OWN machine-readable table — `allLayers`, `optionalLayers` and the `pending` flag,
 * read exactly the way merge-tiles.mjs reads them (`bakeTables()`, merge-tiles.mjs:450) rather than
 * re-derived by regex here. ⛔ It must be run as a CHILD PROCESS: bake.mjs calls `main()` at module
 * scope with no `import.meta.url` guard, so `import`ing it STARTS A BAKE (that is what hung merge
 * run 34037915741 for 49 minutes). `--regions-json` prints and exits.
 */
export function bakeTables() {
  try {
    return JSON.parse(execFileSync(process.execPath, [P('tools/context-bake/bake.mjs'), '--regions-json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } catch (err) {
    return { unavailable: `bake.mjs --regions-json failed: ${String(err?.message ?? err).split('\n')[0]}` };
  }
}
const bboxNums = (b) => (b ?? '').split(',').map(Number);
/** bbox strings are `minLon,minLat,maxLon,maxLat` — the same order bake.mjs and osmium use. */
export function bboxContains(outer, inner) {
  const [a, b, c, d] = bboxNums(outer); const [w, x, y, z] = bboxNums(inner);
  if ([a, b, c, d, w, x, y, z].some((n) => !Number.isFinite(n))) return null;
  return a <= w && b <= x && c >= y && d >= z;
}

/**
 * For a region that the LIVE tileset has and `bake.mjs` no longer does: recover its last committed
 * row from git, find the current row drawn from the SAME extract, and decide RENAME vs DELETION on
 * bbox containment. Nothing here is typed — the old row comes out of the commit that removed it.
 */
export function adjudicateOrphan(name, currentRows) {
  const rowRe = new RegExp(`^\\s*\\{\\s*name:\\s*'${name}'[\\s\\S]*?\\},?\\s*(?://.*)?$`, 'm');
  let commits = [];
  try {
    commits = git(['log', '--format=%H', '-S', `name: '${name}'`, '--', 'tools/context-bake/bake.mjs']).trim().split('\n').filter(Boolean);
  } catch { /* git unavailable */ }
  for (const sha of commits) {
    let before = '';
    try { before = git(['show', `${sha}^:tools/context-bake/bake.mjs`]); } catch { continue; }
    const m = rowRe.exec(before);
    if (!m) continue;
    const row = m[0];
    const f = (k) => (new RegExp(`${k}:\\s*'([^']*)'`).exec(row) ?? [])[1] ?? null;
    const old = { bbox: f('bbox'), pbfUrl: f('pbfUrl'), heightJoin: f('heightJoin') };
    const successors = currentRows.filter((r) => r.pbfUrl && r.pbfUrl === old.pbfUrl);
    const containing = successors.filter((s) => bboxContains(s.bbox, old.bbox));
    return {
      name, removedBy: sha.slice(0, 8), old,
      successors: successors.map((s) => s.name),
      verdict: containing.length > 0 ? 'RENAME' : successors.length > 0 ? 'SAME-EXTRACT-BUT-NOT-CONTAINED' : 'DELETION',
      successor: containing[0]?.name ?? successors[0]?.name ?? null,
      successorBbox: containing[0]?.bbox ?? null,
      successorHeightJoin: containing[0]?.heightJoin ?? null,
      successorPending: containing[0] ? /\bpending:\s*true/.test(containing[0].rowText) : null,
    };
  }
  return { name, removedBy: null, old: null, successors: [], verdict: 'UNKNOWN — no commit in this history removed the row', successor: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE MODEL
// ─────────────────────────────────────────────────────────────────────────────
const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z]/g, '');
const stem = (u) => (u ?? '').split('/').pop().replace(/-latest\.osm\.pbf$/, '');

/** The `// N B` comment a bake.mjs row carries — a measured Content-Length recorded by its author. */
export function pbfSizeComments(src) {
  const out = new Map();
  for (const line of src.split(/\r?\n/)) {
    const nm = /^\s*\{\s*name:\s*'([a-z0-9]+)'/.exec(line);
    if (!nm) continue;
    const m = /\/\/\s*([\d,]{7,})\s*B\s*$/.exec(line.trimEnd());
    if (m) out.set(nm[1], Number(m[1].replace(/,/g, '')));
  }
  return out;
}

export function buildModel(snapshot, { bakeSrc = readFileSync(P('tools/context-bake/bake.mjs'), 'utf8') } = {}) {
  const rows = readBakeRegions(bakeSrc);
  const layers = readBakeLayers(bakeSrc);
  const tables = bakeTables();
  // `optionalLayers` is the merge's own word for "a region with none to give is NAMED and SKIPPED,
  // never refused" — sea · furniture · canopy today. Everything else must be present for every
  // expected region, so only those layers can carry the disk arithmetic.
  // ⚠ FALLBACK, and it must be a SAFE one. `bake.mjs --regions-json` can be unrunnable for reasons
  // that have nothing to do with this tool — measured 2026-09-06 18:22Z, a sibling lane's in-flight
  // edit had it exiting with `SyntaxError: The requested module './nationalSweep.mjs' does not
  // provide an export named 'SWISS_LV95_NATIVE_BOX'`. When that happens the layer split falls back
  // to LAYERS' own `optIn` flag, which marks only `canopy` — so `sea` and `furniture`, which the
  // MERGE treats as optional, would be counted as required and inflate every disk figure. Name them
  // here, and say out loud that the reading is degraded.
  const optional = new Set(tables.optionalLayers ?? [...layers.filter((l) => l.optIn).map((l) => l.id), 'sea', 'furniture']);
  const required = (tables.allLayers ?? layers.map((l) => l.id)).filter((l) => !optional.has(l));
  const pendingFlag = new Map((tables.allRegions ?? []).map((r) => [r.name, Boolean(r.pending)]));
  const sizes = pbfSizeComments(bakeSrc);
  const live = snapshot.live?.manifest ?? null;
  const liveRegions = new Set(Object.keys(live?.regions ?? {}));

  // A staged set may carry several regions (a comma slug); index (region → its newest staged set).
  const stagedByRegion = new Map();
  for (const [slug, s] of Object.entries(snapshot.staging ?? {})) {
    if (!s.manifest) continue;
    for (const r of s.manifest.regions ?? []) {
      const prev = stagedByRegion.get(r);
      if (!prev || Date.parse(s.manifest.bakedAt ?? 0) > Date.parse(prev.manifest.bakedAt ?? 0)) stagedByRegion.set(r, { slug, ...s });
    }
  }

  const popByQid = snapshot.population?.items ?? {};
  const byLabel = new Map();
  for (const [qid, v] of Object.entries(popByQid)) {
    if (!v.label) continue;
    const k = norm(v.label);
    if (!byLabel.has(k)) byLabel.set(k, []);
    byLabel.get(k).push({ qid, ...v });
  }
  const popOf = (name) => {
    if (POPULATION_ZERO[name]) return { pop: 0, src: `DELIBERATE 0 — ${POPULATION_ZERO[name]}` };
    const override = POPULATION_QIDS[name];
    if (override) {
      const parts = override.map((q) => popByQid[q]).filter(Boolean);
      if (parts.length !== override.length) return { pop: null, src: `PARTIAL — ${override.filter((q) => !popByQid[q]).join(',')} returned no P1082` };
      return { pop: parts.reduce((a, p) => a + p.pop, 0), src: parts.map((p) => `${p.qid}=${p.label}:${p.pop}${p.date ? '@' + p.date.slice(0, 10) : ''}`).join(' + ') };
    }
    const c = byLabel.get(norm(name));
    if (c?.length === 1) return { pop: c[0].pop, src: `${c[0].qid}=${c[0].label}:${c[0].pop}${c[0].date ? '@' + c[0].date.slice(0, 10) : ''}` };
    if (c?.length > 1) return { pop: null, src: `AMBIGUOUS — ${c.map((x) => x.qid + ':' + x.label).join(' | ')}; add it to POPULATION_QIDS` };
    return { pop: null, src: 'UNRESOLVED — no Wikidata item labelled like this row' };
  };

  const model = rows.map((r) => {
    const st = stagedByRegion.get(r.name);
    const run = st ? snapshot.bakeRuns?.[String(st.manifest.bakeRunId)] : null;
    const layerBytes = st ? Object.fromEntries(Object.entries(st.manifest.layers).map(([k, v]) => [k, v.bytes])) : null;
    const p = popOf(r.name);
    const pbfBytes = sizes.get(r.name) ?? (snapshot.pbf?.[r.pbfUrl]?.bytes ?? null);
    return {
      name: r.name, bbox: r.bbox, pbfUrl: r.pbfUrl, heightJoin: r.heightJoin || null,
      pending: pendingFlag.has(r.name) ? pendingFlag.get(r.name) : /\bpending:\s*true/.test(r.rowText),
      live: liveRegions.has(r.name),
      staged: Boolean(st), stagedSlug: st?.slug ?? null, bakedAt: st?.manifest?.bakedAt ?? null,
      bakeRunId: st?.manifest?.bakeRunId ?? null, bakeMinutes: run?.minutes ?? null,
      stagedTiles: layerBytes ? Object.values(layerBytes).reduce((a, b) => a + b, 0) : null,
      layerBytes,
      wholeExtract: norm(stem(r.pbfUrl)) === norm(r.name),
      pbfBytes, pbfSource: sizes.has(r.name) ? 'bake.mjs comment' : (snapshot.pbf?.[r.pbfUrl]?.bytes > 0 ? 'live probe' : null),
      pop: p.pop, popSrc: p.src,
    };
  });

  const orphans = [...liveRegions].filter((r) => !rows.some((x) => x.name === r)).map((n) => adjudicateOrphan(n, rows));

  // ── tiles/pbf ratio per layer. Calibrated ONLY on rows that are staged AND live AND whose bbox is
  // the WHOLE extract: a city clip (koln out of nordrhein-westfalen) divides a metro's tiles by a
  // Land's pbf and would drag the ratio to a fraction of the truth.
  //
  // ⛔ AND ONLY ON ROWS WHOSE BBOX HAS NOT MOVED SINCE THEIR BAKE. `newyork` is the live example and
  // it is not a small one: its staged tiles are the pre-`18bc20c7` MANHATTAN clip (0.02 GiB) while
  // its pbfUrl is the whole New York State extract (0.50 GB), so it contributes a 0.03× buildings
  // ratio — 20× below the set — and drags every projection down. The test is DERIVED, not a name:
  // read bake.mjs at the sha the staged set records and compare that row's bbox to HEAD's.
  const bboxAtSha = new Map();
  const bboxAt = (sha, name) => {
    const key = `${sha}:${name}`;
    if (bboxAtSha.has(key)) return bboxAtSha.get(key);
    let v = null;
    try {
      const src = git(['show', `${sha}:tools/context-bake/bake.mjs`]);
      v = (new RegExp(`\\{\\s*name:\\s*'${name}'[^\\n]*?bbox:\\s*'([^']*)'`).exec(src) ?? [])[1] ?? null;
    } catch { v = null; }
    bboxAtSha.set(key, v);
    return v;
  };
  const calCandidates = model.filter((m) => m.staged && m.live && m.wholeExtract && m.pbfBytes > 0 && m.stagedTiles > 0);
  const calExcluded = [];
  const cal = calCandidates.filter((m) => {
    const sha = stagedByRegion.get(m.name)?.manifest?.gitSha;
    if (!sha) return true;
    const then = bboxAt(sha, m.name);
    if (then && then !== m.bbox) { calExcluded.push({ name: m.name, then, now: m.bbox, sha: sha.slice(0, 8) }); return false; }
    return true;
  });
  const ratios = {};
  for (const l of required) {
    const rs = cal.map((c) => (c.layerBytes?.[l] ?? 0) / c.pbfBytes).filter((x) => x > 0).sort((a, b) => a - b);
    if (rs.length === 0) continue;
    ratios[l] = {
      n: rs.length,
      aggregate: cal.reduce((a, c) => a + (c.layerBytes?.[l] ?? 0), 0) / cal.reduce((a, c) => a + c.pbfBytes, 0),
      median: rs[Math.floor(rs.length / 2)], min: rs[0], max: rs.at(-1),
    };
  }

  // ── bake wall-clock vs pbf size. Least squares on every row that has BOTH measurements.
  const calNames = new Set(cal.map((c) => c.name));
  const wc = model.filter((m) => m.bakeMinutes != null && m.pbfBytes > 0 && calNames.has(m.name));
  let wallClock = null;
  if (wc.length >= 3) {
    const xs = wc.map((m) => m.pbfBytes / 1e9), ys = wc.map((m) => m.bakeMinutes);
    const n = xs.length, sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
    const sxx = xs.reduce((a, x) => a + x * x, 0), sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;
    const resid = ys.map((y, i) => y - (intercept + slope * xs[i]));
    wallClock = { n, intercept, slope, residMin: Math.min(...resid), residMax: Math.max(...resid), maxMeasured: Math.max(...ys), maxMeasuredRegion: wc[ys.indexOf(Math.max(...ys))].name };
  }

  return { rows, layers, required, optional: [...optional], tablesUnavailable: tables.unavailable ?? null, model, orphans, live, liveRegions: [...liveRegions], ratios, cal: cal.map((c) => c.name), calExcluded, wallClock, stagedByRegion };
}

/** Projected staged tiles for a region that has not been baked, per layer. Null where unprojectable. */
export function projectTiles(m, ratios, which = 'aggregate') {
  if (!(m.pbfBytes > 0)) return null;
  const out = {};
  for (const [l, r] of Object.entries(ratios)) out[l] = m.pbfBytes * r[which];
  return out;
}

export function predictedBakeMinutes(m, wallClock) {
  if (!wallClock || !(m.pbfBytes > 0)) return null;
  return Math.max(5, Math.round(wallClock.intercept + wallClock.slope * (m.pbfBytes / 1e9)));
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
const gb = (b) => (b == null ? '   —  ' : (b / GiB).toFixed(2).padStart(6));
const num = (n) => (n == null ? '—' : n.toLocaleString('en-US'));

async function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.some((a) => a === f || a.startsWith(f + '='));
  const val = (f) => argv.find((a) => a.startsWith(f + '='))?.split('=')[1] ?? null;

  let snap = loadSnapshot();
  if (has('--probe')) {
    const what = val('--probe') ?? 'all';
    const bakeSrc = readFileSync(P('tools/context-bake/bake.mjs'), 'utf8');
    const rows = readBakeRegions(bakeSrc);
    const layerIds = readBakeLayers(bakeSrc).map((l) => l.id);
    if (what === 'all' || what === 'live') { const r = await probeLive(); snap.live = { probe: r.probe, manifest: r.manifest ?? snap.live?.manifest ?? null }; console.error(r.probe); }
    if (what === 'all' || what === 'staging') {
      const liveNames = Object.keys(snap.live?.manifest?.regions ?? {});
      // Bare region slugs and every orphan, plus the layer-scoped slugs the stage path can produce.
      // A per-region `<region>--<layer>` stage only ever happens for the OPTIONAL layers (a required
      // layer is always baked with the rest), so those are the ones enumerated per region; `all--<layer>`
      // is enumerated for every layer because §SEA-BAKE-POLYGONS documents exactly that dispatch.
      const t = bakeTables();
      const optional = t.optionalLayers ?? layerIds.filter((l) => l === 'sea' || l === 'furniture' || l === 'canopy');
      const candidates = [...new Set([...rows.map((r) => r.name), ...liveNames, 'all',
        ...rows.map((r) => optional.map((l) => `${r.name}--${l}`)).flat(), ...layerIds.map((l) => `all--${l}`)])];
      console.error(`probing ${candidates.length} candidate staging slug(s)…`);
      snap.staging = await probeStaging(candidates);
      const hits = Object.entries(snap.staging).filter(([, s]) => s.manifest);
      console.error(`staged sets found: ${hits.length} (${Object.keys(snap.staging).length - hits.length} named absences)`);
    }
    if (what === 'all' || what === 'runs') { snap.bakeRuns = { ...snap.bakeRuns, ...(await probeBakeRuns()) }; console.error(`bake runs indexed: ${Object.keys(snap.bakeRuns).length}`); }
    if (what === 'all' || what === 'pbf') {
      const urls = [...new Set(rows.map((r) => r.pbfUrl).filter(Boolean))];
      snap.pbf = await probePbf(urls, snap.pbf ?? {});
      console.error(`pbf sizes measured: ${Object.values(snap.pbf).filter((p) => p.bytes > 0).length}/${urls.length}`);
    }
    if (what === 'all' || what === 'population') { snap.population = await probePopulation(); console.error(snap.population.probes.join('\n')); }
    snap.probedAt = new Date().toISOString();
    writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 1));
    console.error(`snapshot → ${SNAPSHOT.replace(REPO, '').replace(/\\/g, '/')}`);
  }

  const M = buildModel(snap);
  if (has('--json')) { process.stdout.write(JSON.stringify(M, null, 1)); return; }

  const L = (s = '') => console.log(s);
  L('# Context publish plan — GENERATED by tools/context-bake/publish-plan.mjs');
  L();
  if (M.tablesUnavailable) {
    L(`⚠ **DEGRADED READING** — \`bake.mjs --regions-json\` could not run (${M.tablesUnavailable}), so the`);
    L('`pending` flag and the required/optional layer split came from parsing the source instead of from');
    L("bake.mjs's own table. Fix the module graph and re-run before trusting a dispatch built on this.");
    L();
  }
  L(`snapshot probed at **${snap.probedAt ?? '(none)'}** · live manifest merged at **${M.live?.mergedAt ?? '—'}** (run \`${M.live?.mergeRunId ?? '—'}\`)`);
  L(`bake.mjs rows **${M.model.length}** · live **${M.liveRegions.length}** · of those still a row **${M.model.filter((m) => m.live).length}** · orphans **${M.orphans.length}** · staged **${M.model.filter((m) => m.staged).length}** · pending **${M.model.filter((m) => m.pending).length}**`);
  const publishableByMergeAlone = M.model.filter((m) => m.staged && !m.live);
  L(`**staged but NOT live — i.e. publishable by a MERGE ALONE: ${publishableByMergeAlone.length}**${publishableByMergeAlone.length ? ' — ' + publishableByMergeAlone.map((m) => m.name).join(', ') : ' (every other unpublished row needs a BAKE first)'}`);
  L();

  L('## Orphans — live regions `bake.mjs` no longer has (adjudicated from git, not from a list)');
  L();
  L('| orphan | removed by | successor | same extract | successor bbox contains it | height join | verdict |');
  L('|---|---|---|---|---|---|---|');
  for (const o of M.orphans) {
    const contains = o.old && o.successorBbox ? bboxContains(o.successorBbox, o.old.bbox) : null;
    L(`| \`${o.name}\` | \`${o.removedBy ?? '—'}\` | \`${o.successor ?? '—'}\` | ${o.successors.length ? 'yes' : 'no'} | ${contains === null ? '—' : contains ? 'yes' : '**NO**'} | ${o.old?.heightJoin ?? '—'} → ${o.successorHeightJoin ?? '—'} | **${o.verdict}**${o.successorPending ? ' · successor still `pending`, never baked' : ''} |`);
  }
  L();

  L('## Calibration — every projection below rests on these, and on nothing else');
  L();
  L(`tiles/pbf ratio calibration set (staged **and** live **and** whole-extract **and** a measured pbf **and** bbox unmoved since its bake): **${M.cal.length}** rows${M.cal.length ? ' — ' + M.cal.join(' ') : ''}`);
  for (const x of M.calExcluded) L(`- ⛔ EXCLUDED \`${x.name}\` — baked at \`${x.sha}\` with bbox \`${x.then}\`, the row now reads \`${x.now}\`. Its tiles and its extract describe different areas.`);
  if (Object.keys(M.ratios).length === 0) L('⛔ **NO ratio can be computed** — no row has both a measured extract size and a staged bake. Projections are WITHHELD, not guessed.');
  for (const [l, r] of Object.entries(M.ratios)) L(`- \`${l}\` n=${r.n} · aggregate **${r.aggregate.toFixed(2)}×** · median ${r.median.toFixed(2)}× · band ${r.min.toFixed(2)}–${r.max.toFixed(2)}×`);
  L();
  if (M.wallClock) {
    L(`bake wall-clock, least squares on **${M.wallClock.n}** rows carrying BOTH a measured extract size and a measured run:`);
    L(`\`minutes ≈ ${M.wallClock.intercept.toFixed(0)} + ${M.wallClock.slope.toFixed(0)} × pbfGB\` · residuals ${M.wallClock.residMin.toFixed(0)}..+${M.wallClock.residMax.toFixed(0)} min`);
    L(`longest bake ever measured: **${M.wallClock.maxMeasured} min** (\`${M.wallClock.maxMeasuredRegion}\`) against the **330-minute** job ceiling.`);
  } else {
    L('⛔ **NO wall-clock fit** — fewer than 3 rows carry both a measured extract size and a measured run.');
  }
  L();

  const pendingRows = M.model.filter((m) => !m.live).sort((a, b) => (b.pop ?? -1) - (a.pop ?? -1));
  L(`## The unpublished ${pendingRows.length}, ranked by population served`);
  L();
  L('| # | region | population | source | pbf | proj. tiles | pred. bake | vs 330 min | height join |');
  L('|---:|---|---:|---|---:|---:|---:|---|---|');
  let rank = 0;
  for (const m of pendingRows) {
    rank++;
    const proj = projectTiles(m, M.ratios);
    const projTotal = proj ? Object.values(proj).reduce((a, b) => a + b, 0) : null;
    const mins = predictedBakeMinutes(m, M.wallClock);
    const verdict = mins == null ? '—' : mins > 330 ? '⛔ **OVER**' : mins > 250 ? '⚠ tight' : '✅';
    L(`| ${rank} | \`${m.name}\` | ${num(m.pop)} | ${m.pop == null ? m.popSrc : m.popSrc.slice(0, 40)} | ${m.pbfBytes ? (m.pbfBytes / 1e9).toFixed(2) + ' GB' : '**UNMEASURED**'} | ${projTotal ? (projTotal / GiB).toFixed(2) + ' GiB' : '—'} | ${mins ?? '—'} | ${verdict} | ${m.heightJoin ?? '—'} |`);
  }
  L();
  const popKnown = pendingRows.filter((m) => m.pop != null);
  L(`population served by the unpublished set: **${num(popKnown.reduce((a, m) => a + m.pop, 0))}** across ${popKnown.length} rows · ${pendingRows.length - popKnown.length} row(s) unresolved.`);
  L();

  L('## The disk cliff, per layer');
  L();
  L('The merge is a FULL REBUILD of each layer\'s global archive from every staged region, so it holds');
  L('INPUTS **and** OUTPUT at once and its cost tracks the WHOLE tileset, not the increment. A phased');
  L('publish does not make a phase cheaper. The requirement for a layer is **≈2× its final archive**.');
  L();
  L('| layer | live today | staged today | + projected for every unpublished row | final | merge needs ≈2× |');
  L('|---|---:|---:|---:|---:|---:|');
  const stagedNow = {}; const projAll = {};
  for (const l of M.required) {
    stagedNow[l] = M.model.filter((m) => m.staged).reduce((a, m) => a + (m.layerBytes?.[l] ?? 0), 0);
    projAll[l] = pendingRows.reduce((a, m) => { const p = projectTiles(m, M.ratios); return a + (p?.[l] ?? 0); }, 0);
  }
  for (const l of M.required) {
    const liveB = M.live?.layers?.[l]?.bytes ?? null;
    const final = stagedNow[l] + projAll[l];
    L(`| \`${l}\` | ${gb(liveB)} GiB | ${gb(stagedNow[l])} GiB | ${gb(projAll[l])} GiB | ${gb(final)} GiB | **${gb(final * 2)} GiB** |`);
  }
  L();
  L('⭐ **The only measured bound on a runner\'s free disk is a LOWER one**: the roads publish (run');
  L('`33845044576`) held 23.68 GiB of inputs and wrote a 23.49 GiB archive, so ≥ 47.2 GiB was free at');
  L('that step. Nothing in this repo records the actual figure — `GET /actions/jobs/<id>/logs` answers');
  L('**HTTP 403 "Must have admin rights to Repository."** without an admin token, so it cannot be read');
  L('from here. The merge workflow\'s disk guard prints it; one cheap dispatch settles it.');
  L();
  for (const l of M.required) {
    const final = stagedNow[l] + projAll[l];
    if (final * 2 > PROVEN_FREE) L(`- ⛔ \`${l}\` ends at ${(final / GiB).toFixed(1)} GiB and needs ~${(final * 2 / GiB).toFixed(0)} GiB — beyond anything this repo has proven fits. **It must be split, or the merge must move to a bigger volume.**`);
    else L(`- ✅ \`${l}\` ends at ${(final / GiB).toFixed(1)} GiB and needs ~${(final * 2 / GiB).toFixed(0)} GiB — inside the one proven bound (${(PROVEN_FREE / GiB).toFixed(1)} GiB).`);
  }
  L();

  // ── WAVE 1 IS NOT A CHOICE. The nine orphans are RENAMES whose successors have never been
  // baked, so the FIRST merge that runs at expect=all either carries those successors or deletes
  // nine metros from a live map. Population cannot reorder this wave; it only orders what follows.
  const successors = [...new Set(M.orphans.map((o) => o.successor).filter(Boolean))];
  // `newyork` rides with them for a different reason: its row survived the rename but its bbox
  // widened from the Manhattan clip to the whole state and its join moved, so the live tiles are a
  // narrow set the merged manifest would describe as state-wide (§3b JOIN DRIFT). The merge compares
  // neither bbox nor join — only a re-bake makes the manifest true.
  const wave1 = M.model.filter((m) => successors.includes(m.name) || (m.name === 'newyork' && M.calExcluded.some((x) => x.name === 'newyork')));
  L('## Wave 1 — the re-point, which population cannot reorder');
  L();
  L(`The ${M.orphans.length} orphans are all RENAMES and **not one successor has ever been baked**. A merge at`);
  L('`expect=all` therefore has exactly two outcomes today: refuse by name (it does — proven below), or,');
  L('with `allow_region_removal`, publish 40 regions and **delete these nine metros from the live map**.');
  L('Wave 1 is the set that makes the removal a re-point instead of a deletion.');
  L();
  L('| region | why it is in wave 1 | population | pbf | pred. bake | proj. tiles |');
  L('|---|---|---:|---:|---:|---:|');
  for (const m of wave1) {
    const why = successors.includes(m.name)
      ? `successor of ${M.orphans.filter((o) => o.successor === m.name).map((o) => '`' + o.name + '`').join(' + ')}`
      : 'bbox widened after its bake — the manifest would otherwise describe tiles it does not have';
    const p = projectTiles(m, M.ratios);
    L(`| \`${m.name}\` | ${why} | ${num(m.pop)} | ${m.pbfBytes ? (m.pbfBytes / 1e9).toFixed(2) + ' GB' : '**UNMEASURED**'} | ${predictedBakeMinutes(m, M.wallClock) ?? '—'} min | ${p ? (Object.values(p).reduce((a, b) => a + b, 0) / GiB).toFixed(2) + ' GiB' : '—'} |`);
  }
  const w1mins = wave1.map((m) => predictedBakeMinutes(m, M.wallClock)).filter(Boolean);
  L();
  L(`Wave 1 bakes run CONCURRENTLY (concurrency group is \`context-bake-<region>\`), so the wave's`);
  L(`wall-clock is its LONGEST bake: **~${Math.max(...w1mins, 0)} min** predicted, against the 330-minute ceiling.`);
  L(`Per-layer it adds ${M.required.map((l) => `\`${l}\` +${(wave1.reduce((a, m) => a + (projectTiles(m, M.ratios)?.[l] ?? 0), 0) / GiB).toFixed(2)} GiB`).join(' · ')}.`);
  L();

  // ── HOW FAR DOES EACH CANDIDATE CEILING GET US? The proven figure is a LOWER bound on free
  // disk, so "we are already over it" would be false precision: it only says the next roads merge
  // needs MORE than any run has yet demonstrated. What a dispatcher actually needs is the curve —
  // for a given free-disk figure, how many regions and how many people can ship before the largest
  // layer's 2x requirement crosses it. One `df` reading turns this table into a plan.
  L('## What each candidate free-disk figure buys');
  L();
  L('| free disk on the runner | regions publishable | population served | stops at | binding layer |');
  L('|---:|---:|---:|---|---|');
  for (const ceiling of [PROVEN_FREE, 60 * GiB, 80 * GiB, 100 * GiB, 120 * GiB]) {
    const running = { ...stagedNow };
    let stopAt = null, binding = null, n = 0, pop = 0;
    for (const m of pendingRows) {
      const p = projectTiles(m, M.ratios);
      if (!p) continue;
      const next = { ...running };
      for (const l of M.required) next[l] += p[l] ?? 0;
      const over = M.required.find((l) => next[l] * 2 > ceiling);
      if (over) { stopAt = m.name; binding = over; break; }
      Object.assign(running, next); n++; pop += m.pop ?? 0;
    }
    L(`| ${(ceiling / GiB).toFixed(0)} GiB${ceiling === PROVEN_FREE ? ' *(the one proven figure — a LOWER bound)*' : ''} | ${n} of ${pendingRows.length} | ${num(pop)} | ${stopAt ? '`' + stopAt + '`' : '**all of them**'} | ${binding ? '`' + binding + '`' : '—'} |`);
  }
  L();
  L('⚠ `roads` is already the largest layer and it is a SINGLE global archive the client resolves by a');
  L('fixed flat path (`<base>/<layer>.pmtiles`, contextTiles.ts), so "split the layer" is a CLIENT');
  L('change, not a workflow input. The cheap move is the runner, and it has never been measured.');
  L();

  // ── THE ORDERED DISPATCH LIST. Printed with the literal workflow inputs so nobody has to
  // reconstruct them, and with the STOP CONDITION on each step, because every publish failure this
  // path has had was a step that ran when its precondition was not yet true.
  const removalCsv = M.orphans.map((o) => o.name).join(',');
  L('## The ordered dispatch list');
  L();
  L('⛔ **Nothing here is dispatched by this tool.** Each item names its workflow, its literal inputs,');
  L('its predicted wall-clock and the reading that must come back before the next item may run.');
  L();
  L('1. **MEASURE THE HEADROOM** — `context-merge-publish.yml` · `layer=trees` · `expect=all` ·');
  L('   `engine=js` · `publish=false` · `allow_unknown_regions=true`. ~0.4 GiB downloaded, nothing');
  L("   written to R2, and `engine=js` skips the Docker build (`if: inputs.engine != 'js'`) that is the");
  L("   run's slowest step. **Read from the disk-guard step: the surplus line, `/`'s free space, and");
  L('   whether `/mnt` exists and how big it is.** The run then REFUSES at the no-loss gate naming the');
  L(`   ${M.orphans.length} orphans — that refusal is the fix working, not a failure. **~4 min.**`);
  L('   → The number it prints selects a row from the table above. Everything below is gated on it.');
  L();
  L(`2. **BAKE WAVE 1** — ${wave1.length} × \`context-bake.yml\`, one dispatch each, \`stage=true\` · \`publish=false\` ·`);
  L(`   \`region=\` one of: ${wave1.map((m) => '`' + m.name + '`').join(' · ')}. They run CONCURRENTLY`);
  L(`   (per-region concurrency group). **~${Math.max(...w1mins, 0)} min** for the wave, bounded by \`${wave1[w1mins.indexOf(Math.max(...w1mins))]?.name ?? '?'}\`.`);
  L("   → Stop condition: each run's own §MEASURED-HEIGHT-GATE passed and its staged set is readable at");
  L('   `tiles-staging/<region>/staging-manifest.json`. A staged set that is not there did not stage.');
  L();
  L('3. **MERGE + PUBLISH, ONE DISPATCH PER LAYER** — only if step 1 showed the headroom for that layer.');
  L('   `context-merge-publish.yml` · `expect=all` · `engine=tile-join` · `publish=true` ·');
  L('   `allow_unknown_regions=true` ·');
  L(`   \`allow_region_removal=${removalCsv}\``);
  L('   — in the 2026-09-04 order, cheapest last so a mistake is cheap to repeat:');
  for (const l of M.required) {
    const staged = stagedNow[l] + wave1.reduce((a, m) => a + (projectTiles(m, M.ratios)?.[l] ?? 0), 0);
    L(`   - \`layer=${l}\` — ~${(staged / GiB).toFixed(1)} GiB staged, merge needs ~${(staged * 2 / GiB).toFixed(0)} GiB${staged * 2 > PROVEN_FREE ? ' ⚠ **above the only proven figure**' : ''}`);
  }
  L('   ⛔ The removal list is safe ONLY in a run that also carries the wave-1 successors. Runs QUEUE');
  L('   serially (concurrency group `context-bake`); watch each to a terminal conclusion.');
  L();
  L('4. **VERIFY FROM THE PUBLIC HOST, per layer** — `Last-Modified` = today (a 200 is not currency,');
  L('   §7.1) · `Range: bytes=0-127` → **206** · first 7 bytes `PMTiles`. Then');
  L('   `tools/context-height-probe/probe.mjs` at a RE-POINTED site — Chicago `41.8781,-87.6298` and');
  L('   Riyadh `24.7136,46.6753` are the two that prove the rename landed rather than removed coverage.');
  L();
  L('5. **STAMP ONCE** — bump `CONTEXT_TILESET_VERSION` in `contextTiles.ts` after the LAST layer, then');
  L('   deploy through `deploy-fly.yml`. A stamp is a claim about the whole tileset.');
  L();
  L('6. **EVERYTHING BELOW WAVE 1 IS GATED ON STEP 1, NOT ON BAKING.** Bake freely — a staged set costs');
  L('   only runner time and is the input the merge will need — but do not queue a publish past the row');
  L('   the measured free disk selects.');
}

/**
 * The only bound on a merge runner's free disk that anything in this repo has EARNED: the roads
 * publish (run 33845044576) held 23.68 GiB of staged inputs and wrote a 23.49 GiB archive, so at
 * least 47.2 GiB was free when that step began. It is a LOWER bound and it is an INFERENCE — the
 * actual figure is printed by the workflow's disk guard and has never been recorded.
 */
export const PROVEN_FREE = 47.2 * GiB;

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  await main();
}
