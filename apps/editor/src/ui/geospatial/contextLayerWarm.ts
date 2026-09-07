// contextLayerWarm.ts — §CTX-WARM-ALL-LAYERS (founder 2026-08-10, GIS speed: "location entered →
// 2D GIS + 3D Site split WAY quicker").
//
// THE MEASURED DEFECT this closes: the §CTX-PMTILES-READER FIRST reads ran per-layer and late —
// buildings 3,570 ms, then water 8,157 · roads 8,442 · parks 8,916 · landuse 9,079 ms — because
// only BUILDINGS were warmed during the camera flight (`warmContextCache` →
// `fetchContextBuildingsNearAndFar`); every other layer's first read started only when the 3D-Site
// pane mounted and `CesiumViewport` kicked its seven `loadContext*` calls. Repeat reads are 3–4 ms
// (tile-level in-memory cache), so the whole cost is WHEN the first read starts.
//
// THE FIX: warm EVERY layer the 3D Site will render, in parallel, the moment the geocode resolves
// (the same instant the buildings warm fires) — using EXACTLY the bbox extents `CesiumViewport`
// will later ask for (`contextExtents.ts` is the shared authority), so each warm read populates
// the very tile-cache keys the render path reads. The reveal gate is UNCHANGED: it awaits ONLY
// the near-buildings read (`OnboardingStepController.contextWarm`); everything warmed here is
// fire-and-forget and simply streams in behind the reveal.
//
// HONESTY: every fetcher below never throws, reports failure vs empty distinctly downstream, and
// §CTX-KNOWN-MISSING keeps a 404'd layer (rail/trees on v=L660a) to ONE probe per session — the
// render path still logs its honest "rendering NO rail" line.
//
// P8: the exported function carries an OTel span.

import { trace } from '@opentelemetry/api';
import { fetchContextRoads } from './contextRoads';
import { fetchContextWater } from './contextWater';
import { fetchContextParks } from './contextParks';
import { fetchContextLanduse } from './contextLanduse';
import { fetchContextRail } from './contextRail';
import { fetchContextTrees } from './contextTrees';
import { fetchContextFurniture } from './contextFurniture';
import { fetchContextBakedCanopy } from './contextCanopyBaked';
import { CONTEXT_WIDE_HALF_DEG, CONTEXT_SEA_HALF_DEG } from './contextExtents';
import { groundFetchHalfDeg } from './contextExtentBudget';
import { primeContextTilesetManifest } from './contextTiles';

const _tracer = trace.getTracer('pryzm.gis.context-layer-warm');

/**
 * Fire-and-forget warm of every NON-building context layer for `lat/lon`, in parallel. Never
 * throws; never awaited by callers (the reveal gates only on near-buildings). Each call lands in
 * the per-bbox + per-tile caches the 3D-Site render path reads, so the later real loads are
 * cache hits instead of cold first reads.
 */
export function warmAllContextLayers(lat: number, lon: number): void {
    const span = _tracer.startSpan('pryzm.gis.context-layer-warm.warmAll');
    try {
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
        // §CTX-MANIFEST-KNOWN-MISSING (L-13111) — ⛔ FIRST LINE, AND THE ORDER IS THE POINT. The nine
        // reads below are created synchronously and each would otherwise be the one to start the
        // manifest read, putting it BEHIND their own requests in the same-origin queue. Issued here
        // it goes out first, and the layers that are not published (`canopy`, `sea`, `furniture` —
        // measured 404s costing ~2 requests each per session) never probe their archive headers at
        // all. Not awaited: `readContextTilesOnce` holds the deadlined gate, and `buildings` — the
        // one read the reveal waits on — is exempt from it by name.
        void primeContextTilesetManifest();
        const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        // §CTX-WARM-READS-THE-RENDER-EXTENT (L-13079, founder Barcelona 2026-09-07) — ⚠ THE WARM
        // AND THE RENDER MUST ASK FOR THE SAME BOX, and for ROADS and PARKS they had stopped doing so.
        //
        // THE DIVERGENCE, MEASURED. This module's own header promises "using EXACTLY the bbox extents
        // `CesiumViewport` will later ask for". §SITE-SCOPE F-2 then moved the ROADS and PARKS render
        // reads onto `groundFetchHalfDeg(scope)` — `CesiumViewport.loadContextRoads` / `loadContextParks`,
        // both marked "read to the rim" — and left this file on the NEAR default. At the default scope
        // that is **0.008° warmed against 0.016° read**: half the linear extent, a QUARTER of the area.
        // The founder's Barcelona console shows both halves of it: the warm read `parks 214 / 25 tiles`
        // and the render read `parks 800 green area(s) from 81 baked tile(s) in 1173 ms`. 25 of 81 —
        // the warm was covering 31 % of the tiles it exists to cover, and the render paid for the
        // other 56 on the critical path, ahead of the drape that cannot start until the read lands.
        //
        // ⛔ NOTHING IS READ THAT WAS NOT GOING TO BE READ. The wide box is a strict SUPERSET of the
        // near one at the same zoom (`zoomForExtent` picks z16 for both under `scopeReadFanOutCap`'s
        // 112-tile cap), and §CTX-TILE-DECODE-CACHE is keyed PER TILE — so this warms the exact tiles
        // the render was already going to fetch, 6 s earlier, in a window where the user is watching a
        // loading page. It is the same bytes, moved; it renders no more and no fewer features.
        //
        // ⚠ WHAT IT DOES NOT COVER, SAID PLAINLY: the warm runs before any viewport exists, so it uses
        // the DEFAULT scope. A user with a wider persisted scope still reads wider at render time and
        // warms only that subset — fewer tiles warmed, never wrong ones, because a subset of a
        // per-tile cache is always valid.
        const groundHalfDeg = groundFetchHalfDeg();
        const layers: Array<[string, Promise<unknown>]> = [
            ['roads', fetchContextRoads(lat, lon, undefined, groundHalfDeg)],
            ['water', fetchContextWater(lat, lon)],
            // The sea mask reads water at its OWN much wider extent — warm that key too.
            ['water(sea)', fetchContextWater(lat, lon, undefined, CONTEXT_SEA_HALF_DEG)],
            ['parks', fetchContextParks(lat, lon, undefined, groundHalfDeg)],
            ['landuse', fetchContextLanduse(lat, lon, undefined, CONTEXT_WIDE_HALF_DEG)],
            ['rail', fetchContextRail(lat, lon)],
            ['trees', fetchContextTrees(lat, lon)],
            // §STREET-LIFE (L-12936) — mapped street lamps; an un-baked archive is memoised absent
            // by §CTX-KNOWN-MISSING on this one probe, so the render path pays no second round-trip.
            ['furniture', fetchContextFurniture(lat, lon)],
            // §VEG-REAL-CANOPY-BAKE (L-12935) — the MEASURED canopy cells the tree primitive merges
            // with the mapped trees. Warmed on the same key `fetchContextCanopySet` later reads, so a
            // baked site pays no cold read; an un-baked archive is memoised absent by
            // §CTX-KNOWN-MISSING on this one probe and the woods-fill synthesis carries the site.
            ['canopy', fetchContextBakedCanopy(lat, lon)],
        ];
        for (const [name, p] of layers) {
            void p.then(() => {
                const dt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
                console.log(`[gis] §CTX-WARM-ALL-LAYERS ${name} warmed in ${dt.toFixed(0)} ms (parallel, behind the reveal).`);
            }).catch(() => { /* best-effort warm — the render path re-asks and reports honestly */ });
        }
    } finally {
        span.end();
    }
}
