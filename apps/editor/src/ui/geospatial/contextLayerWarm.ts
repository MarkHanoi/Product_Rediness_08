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
import { fetchContextBakedCanopy } from './contextCanopyBaked';
import { CONTEXT_WIDE_HALF_DEG, CONTEXT_SEA_HALF_DEG } from './contextExtents';

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
        const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const layers: Array<[string, Promise<unknown>]> = [
            ['roads', fetchContextRoads(lat, lon)],
            ['water', fetchContextWater(lat, lon)],
            // The sea mask reads water at its OWN much wider extent — warm that key too.
            ['water(sea)', fetchContextWater(lat, lon, undefined, CONTEXT_SEA_HALF_DEG)],
            ['parks', fetchContextParks(lat, lon)],
            ['landuse', fetchContextLanduse(lat, lon, undefined, CONTEXT_WIDE_HALF_DEG)],
            ['rail', fetchContextRail(lat, lon)],
            ['trees', fetchContextTrees(lat, lon)],
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
