// ─────────────────────────────────────────────────────────────────────────────
// §US-3DEP-HAG (L-13314, 2026-09-11, lane DELAWARE-HEIGHTS) — the NETWORK + RASTER half of the US chain's
// LiDAR FILL tier. Every DECISION lives in heights/us3depHag.mjs (pure, fixture-tested): which STAC items
// serve a point and in what order, the SAS freshness, the pixel window, which pixels are inside the eroded
// footprint, the canopy guard, the percentile, what is plausible. This file only searches STAC, keeps SAS
// tokens fresh, opens COGs, reads windows and hands the samples to `hagDecision`.
//
// ⛔ IT NEVER WRITES A FEATURE PROPERTY. heights/usasNationalStamp.mjs passes each result to the ONE
// precedence function (`usHeightDecision`, usOpenHeights.mjs) and applies the marker in ONE place
// (`applyUsHeightDecision`). A second writer here would be a second place the marker could be decided.
//
// §CONTEXT-DATA-HONESTY — the values this half keeps DIFFERENT, per footprint:
//   • STAC refused / undecodable      → stac.status 'error' + decision 'error'.        A FAILURE.
//   • SAS token refused                → sas.errors++ ; the window read fails → 'error'. A FAILURE.
//   • COG open / window read threw     → windows.errors++ ; decision 'error'.            A FAILURE.
//   • no item covers the point         → decision 'no-item'.                              An honest EMPTY.
//   • every covering survey is nodata  → decision 'no-data' (§SURVEY-HOLE-FALLBACK).      An honest EMPTY.
//   • 'canopy' / 'implausible' / 'too-few' / 'no-returns' — hagDecision's NAMED refusals. A REFUSAL.
// Every one of them leaves the footprint with the chain's own result (its OSM tags), never a guess.
//
// ⚠ DYNAMIC IMPORTS, deliberately (the swiss stamp's scar): proj4 (via reproject.mjs) and geotiff are
// STANDALONE deps of tools/context-bake, provisioned by context-bake.yml into tools/context-bake/
// node_modules. A static import here would make every importer of usasNationalStamp.mjs fail to LOAD on a
// host without them — silently, for a region that never arms this tier.
// ─────────────────────────────────────────────────────────────────────────────
import { httpGetSafe } from '../heightSources.mjs';
import {
  US_3DEP_HAG, bboxOfRings, emptyHagStats, hagDecision, hagInteriorSampleSet, parse3depStacPage, parseSasToken,
  pick3depItem, rank3depItems, rasterWindow, sasIsFresh, signedHref, us3depHagAreasFor, us3depHagCovers, us3depStacSearchUrl,
} from './us3depHag.mjs';

/** Race a promise against a timer; a hung COG range read must not stall the national sweep. */
function raceTimeout(p, ms, what) {
  let t;
  const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what}: timed out after ${ms} ms`)), ms); });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
}

const nodataOf = (raw, fallback) => {
  const v = parseFloat(String(raw ?? ''));
  return Number.isFinite(v) ? v : fallback;
};

/**
 * One sampler per stamp run. `regionBbox` is the bake row's [w,s,e,n]; when it meets no armed working-set
 * box the sampler is DISARMED and makes no network call at all (every other US state takes exactly the
 * path it took before this tier existed).
 *
 * @returns {{ heightsFor(records): Promise<Array<object|null>>, eligible(lon, lat): boolean,
 *             noteChannelFailed(n): void, stats: object, areas: number[][] }}
 */
export function createUs3depHagSampler(regionBbox, {
  timeoutMs = 60_000, readTimeoutMs = 120_000, maxOpenImages = 48, maxStacPages = 20, boxes = undefined,
  now = () => Date.now(),
} = {}) {
  const cfg = US_3DEP_HAG;
  const areas = Array.isArray(regionBbox) && regionBbox.length === 4 ? us3depHagAreasFor(regionBbox, boxes) : [];
  const stats = emptyHagStats(areas.length > 0);
  const items = { hag: [], returns: [] };
  const sas = { hag: null, returns: null };
  const sasInFlight = { hag: null, returns: null };
  const images = new Map();   // `${kind}|${href}` → Promise<header>
  let initP = null, gtP = null, projP = null;

  const eligible = (lon, lat) => stats.armed && us3depHagCovers(lon, lat, boxes);

  async function searchAll(kind) {
    const out = new Map();
    for (const area of areas) {
      let url = us3depStacSearchUrl(cfg.collections[kind], area);
      let pages = 0;
      while (url) {
        if (pages++ >= maxStacPages) throw new Error(`STAC ${cfg.collections[kind]}: more than ${maxStacPages} page(s) — raise maxStacPages deliberately`);
        const rr = await httpGetSafe(url, { timeoutMs, headers: { Accept: 'application/geo+json, application/json' } });
        if (!rr.ok) throw new Error(`STAC ${cfg.collections[kind]} HTTP ${rr.status || 0}${rr.reason ? ` (${rr.reason})` : ''}`);
        const page = parse3depStacPage(rr.body);
        if (!page) throw new Error(`STAC ${cfg.collections[kind]}: undecodable page (${String(rr.body ?? '').slice(0, 80)})`);
        for (const it of page.items) out.set(it.id, it);
        url = page.next;
      }
    }
    return [...out.values()];
  }

  function ensureInit() {
    if (!initP) {
      initP = (async () => {
        try {
          items.hag = await searchAll('hag');
          items.returns = await searchAll('returns');
          stats.stac.status = 'ok';
          stats.stac.hagItems = items.hag.length;
          stats.stac.returnsItems = items.returns.length;
          for (const it of items.hag) stats.stac.projects[it.usgsId] = (stats.stac.projects[it.usgsId] ?? 0) + 1;
        } catch (err) {
          stats.stac.status = 'error';
          stats.stac.reason = String(err?.message ?? err);
        }
      })();
    }
    return initP;
  }

  function token(kind) {
    if (sasIsFresh(sas[kind], now())) return Promise.resolve(sas[kind]);
    if (!sasInFlight[kind]) {
      sasInFlight[kind] = (async () => {
        stats.sas.fetches++;
        const rr = await httpGetSafe(`${cfg.sasToken}/${cfg.collections[kind]}`, { timeoutMs, headers: { Accept: 'application/json' } });
        const t = rr.ok ? parseSasToken(rr.body) : null;
        if (!t) { stats.sas.errors++; return null; }
        // A rotated token invalidates every open COG of that kind: geotiff keeps the SIGNED url for its
        // later range reads, and those answer 403 once the old token expires.
        if (sas[kind] && sas[kind].token !== t.token) for (const k of [...images.keys()]) if (k.startsWith(`${kind}|`)) images.delete(k);
        sas[kind] = t;
        return t;
      })().finally(() => { sasInFlight[kind] = null; });
    }
    return sasInFlight[kind];
  }

  function openImage(kind, item) {
    const key = `${kind}|${item.href}`;
    let p = images.get(key);
    if (!p) {
      if (images.size >= maxOpenImages) images.delete(images.keys().next().value);
      p = (async () => {
        const t = await token(kind);
        if (!t) throw new Error(`SAS token for ${cfg.collections[kind]} unavailable`);
        if (!gtP) gtP = import('geotiff');
        const gt = await gtP;
        const tiff = await raceTimeout(gt.fromUrl(signedHref(item.href, t.token), { allowFullFile: false }), readTimeoutMs, `open ${item.id}`);
        const img = await raceTimeout(tiff.getImage(0), readTimeoutMs, `IFD 0 of ${item.id}`);
        return {
          img, epsg: img.getGeoKeys()?.ProjectedCSTypeGeoKey ?? null, origin: img.getOrigin(), resolution: img.getResolution(),
          size: [img.getWidth(), img.getHeight()], nodata: nodataOf(img.fileDirectory?.GDAL_NODATA, cfg.nodata),
        };
      })();
      p.catch(() => images.delete(key));   // a failed open must not poison the cache for the next cell
      images.set(key, p);
    }
    return p;
  }

  async function readWindow(kind, item, nativeBbox) {
    const head = await openImage(kind, item);
    const win = rasterWindow(head, nativeBbox, 1);
    if (!win) return null;
    const [values] = await raceTimeout(head.img.readRasters({ window: win }), readTimeoutMs, `window ${item.id}`);
    stats.windows[kind]++;
    return {
      origin: head.origin, resolution: head.resolution, window: win, width: win[2] - win[0], height: win[3] - win[1],
      values, epsg: head.epsg, nodata: head.nodata,
    };
  }

  async function projectorFor(epsg) {
    if (!projP) projP = import('../reproject.mjs');
    const m = await projP;
    return m.getProjector(`EPSG:${epsg}`);   // throws for a CRS reproject.mjs does not register → 'crs-unsupported'
  }

  const decide = (out, i, d) => {
    out[i] = d;
    if (d.reject) stats.decisions[d.reject] = (stats.decisions[d.reject] ?? 0) + 1;
    else { stats.decisions.admitted++; stats.perProject[d.usgsId] = (stats.perProject[d.usgsId] ?? 0) + 1; }
  };

  /**
   * The tier's result for ONE CELL's worth of retained footprints (`{ ext, interiors, clon, clat }`, WGS84):
   * an Array aligned with `records`, each `null` (outside the working set) or a decision — a height from
   * `hagDecision`, or a named refusal / failure.
   */
  async function heightsFor(records) {
    try {
      return await heightsForUnsafe(records);
    } catch (err) {
      // §ABORT-IS-NOT-A-CAP, one tier down — an unexpected throw here must never abort the USAS sweep that
      // hosts this fill. Every eligible footprint is failed BY NAME; the chain's own result stands.
      const out = records.map(() => null);
      records.forEach((r, i) => { if (eligible(r.clon, r.clat)) decide(out, i, { reject: 'error', reason: String(err?.message ?? err) }); });
      return out;
    }
  }

  /**
   * Sample ONE group (footprints that share a survey item this round) from that item. Returns the record
   * indexes whose interior was NODATA in this survey (a §SURVEY-HOLE-FALLBACK candidate for the next
   * round); every other record in the group is decided here.
   */
  async function sampleGroup(out, records, it, idxs) {
    let proj;
    let nat;
    let hagWin;
    try {
      const head = await openImage('hag', it);
      try { proj = await projectorFor(head.epsg); } catch {
        for (const i of idxs) decide(out, i, { reject: 'crs-unsupported', epsg: head.epsg });
        return [];
      }
      nat = idxs.map((i) => ({
        ext: records[i].ext.map(([x, y]) => proj.forward(x, y)),
        holes: (records[i].interiors ?? []).map((h) => h.map(([x, y]) => proj.forward(x, y))),
      }));
      hagWin = await readWindow('hag', it, bboxOfRings(nat.map((n) => n.ext)));
    } catch (err) {
      stats.windows.errors++;
      for (const i of idxs) decide(out, i, { reject: 'error', reason: String(err?.message ?? err) });
      return [];
    }
    if (!hagWin) return idxs;   // the item's raster does not reach these footprints at all — try the next survey

    // The canopy guard's raster: the SAME 3DEP project's returns COG (its own 5 m grid), one read per
    // returns item the group touches. A returns read that FAILS fails those footprints — it is never
    // folded into 'no-returns', which is a refusal about the DATA, not about our request.
    const byRet = new Map();
    idxs.forEach((i, k) => {
      const ri = pick3depItem(items.returns, records[i].clon, records[i].clat, { usgsId: it.usgsId });
      const g = byRet.get(ri); if (g) g.push(k); else byRet.set(ri, [k]);
    });
    const retWinOf = new Map();
    const retFailed = new Set();
    for (const [ri, ks] of byRet) {
      if (!ri) continue;
      try {
        const w = await readWindow('returns', ri, bboxOfRings(ks.map((k) => nat[k].ext)));
        if (w && w.epsg === hagWin.epsg) for (const k of ks) retWinOf.set(k, w);
      } catch {
        stats.windows.errors++;
        for (const k of ks) retFailed.add(k);
      }
    }
    const holes = [];
    idxs.forEach((i, k) => {
      if (retFailed.has(k)) { decide(out, i, { reject: 'error', reason: 'returns window read failed' }); return; }
      const { samples, nodataInside } = hagInteriorSampleSet(nat[k].ext, nat[k].holes, hagWin, retWinOf.get(k) ?? null, { erodeM: cfg.erodeM, nodata: hagWin.nodata });
      // §SURVEY-HOLE-FALLBACK — pixels inside the eroded ring and NONE finite: this survey has a hole here.
      if (samples.length === 0 && nodataInside > 0) { holes.push(i); return; }
      decide(out, i, { ...hagDecision(samples, cfg), usgsId: it.usgsId, itemId: it.id });
    });
    return holes;
  }

  async function heightsForUnsafe(records) {
    const out = records.map(() => null);
    if (!stats.armed || records.length === 0) return out;
    await ensureInit();
    const ranked = new Map();   // record index → covering items, newest first (rank3depItems)
    records.forEach((r, i) => {
      if (!us3depHagCovers(r.clon, r.clat, boxes)) return;
      if (stats.stac.status !== 'ok') { decide(out, i, { reject: 'error', reason: `STAC ${stats.stac.reason}` }); return; }
      const cands = rank3depItems(items.hag, r.clon, r.clat);
      if (!cands.length) { decide(out, i, { reject: 'no-item' }); return; }
      ranked.set(i, cands);
    });
    let pending = [...ranked.keys()];
    for (let round = 0; pending.length > 0 && round < cfg.maxSurveys; round++) {
      const groups = new Map();   // this round's survey item → record indexes
      for (const i of pending) {
        const it = ranked.get(i)[round];
        if (!it) { decide(out, i, { reject: 'no-data', reason: `all ${round} covering survey(s) hold no data inside this footprint` }); continue; }
        // A survey delivered in feet would stamp a 12 m house as 39 "m": every Delaware item reads `metre`
        // (verbatim fixture), and any other unit is refused BY NAME rather than converted on a guess.
        if (it.unit && it.unit !== 'metre') { decide(out, i, { reject: 'crs-unsupported', reason: `HAG unit "${it.unit}"` }); continue; }
        if (round > 0) stats.fallbacks++;
        const g = groups.get(it); if (g) g.push(i); else groups.set(it, [i]);
      }
      const next = [];
      for (const [it, idxs] of groups) next.push(...await sampleGroup(out, records, it, idxs));
      pending = next;
    }
    for (const i of pending) decide(out, i, { reject: 'no-data', reason: `no data inside this footprint in the first ${cfg.maxSurveys} covering survey(s)` });
    return out;
  }

  return {
    heightsFor, eligible, stats, areas,
    noteChannelFailed(n) { stats.decisions['channel-failed'] += n; },
  };
}
