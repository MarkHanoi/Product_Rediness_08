// §TERRAIN-SAMPLER-OWNERSHIP (D9 lane STARTUP, 2026-09-07) — every `sampleTerrainMostDetailed`
// call in the viewport samples THROUGH the decoded-tile memo.
//
// ⭐ THE DEFECT THIS PINS, AND WHY A SOURCE SCAN IS THE RIGHT SHAPE FOR IT. The founder's Barcelona
// start-up (build `2c12b8d5`) showed the drape waiting ~11 s in the terrain queue while the
// coalescer's own line reported `max concurrent flights 1`. Both were true. `GroundSampleBatcher`'s
// FIFO governs only the calls made THROUGH it, so FOUR bare `Cesium.sampleTerrainMostDetailed`
// calls elsewhere in `CesiumViewport` — the pre-plot framing ground, `resolveGroundBaseForContext`,
// §CAMERA-UNDERGROUND-FIX at the terrain attach, and the seat-first clamp — were second flights the
// counter could not see, and with no memo each re-downloaded the SAME site-centroid tile the drape
// flights then downloaded again. A counter that cannot observe the thing it certifies is the RAF
// grep defect in another subsystem (§RAF-GATE-COMMENT-BLIND): the number was right about its own
// denominator and wrong about the world.
//
// ⛔ SO THE ARM IS STRUCTURAL, NOT BEHAVIOURAL. No unit test can catch a NEW raw call site — it
// would simply be a code path the test does not exercise, in a 17k-line file that no headless suite
// instantiates (it needs a live WebGL Cesium viewer). Scanning the source is what actually holds
// the invariant, and it is why this file reads bytes instead of calling a function.
//
// ⚠ WHAT THIS DOES NOT CLAIM. It does not claim the terrain is fast, that the memo hits, or that
// the FIFO holds — only that no call site bypasses the memo. The hit rate is reported at runtime by
// the `Tile memo: N download(s) + M hit(s)` clause of §STARTUP-GROUND-SAMPLE-COALESCE, and THAT is
// the number to read on production.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEWPORT = resolve(HERE, '..', 'CesiumViewport.ts');

/** Call sites only — a mention inside a `//` comment is prose, not a sampler call. */
function callSites(src: string): string[] {
    return src
        .split('\n')
        .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
        .filter((line) => /Cesium\.sampleTerrainMostDetailed\s*\(/.test(line));
}

describe('§TERRAIN-SAMPLER-OWNERSHIP — no sampler call bypasses the decoded-tile memo', () => {
    const src = readFileSync(VIEWPORT, 'utf8');

    it('finds the sampler call sites at all (the scan is not silently matching nothing)', () => {
        // ⚠ A source scan that matches zero lines passes vacuously and certifies nothing
        // (§GREP-SILENCE-HAS-THREE-CAUSES). Assert the scan sees the sites before judging them.
        expect(callSites(src).length).toBeGreaterThanOrEqual(5);
    });

    it('⛔ EVERY call site goes through `samplingTerrainProvider(...)`', () => {
        const raw = callSites(src).filter((line) => !line.includes('this.samplingTerrainProvider('));
        expect(raw, `these sampler call sites bypass the tile memo:\n${raw.join('\n')}`).toEqual([]);
    });

    it('the memo is still dropped where the ground answers die — a stale city must not seat a new site', () => {
        // `level/x/y` names a piece of ground only WITHIN one tileset, so the memo is provider-scoped
        // and must be cleared with the relief. Losing this makes the optimisation a correctness bug.
        expect(src).toContain('private invalidateTerrainTileMemo()');
        const detach = src.slice(src.indexOf('private detachBakedTerrain()'));
        expect(detach.slice(0, 2000)).toContain('this.invalidateTerrainTileMemo()');
    });

    it('the memo view is NOT installed on the globe — the render path keeps the real provider', () => {
        // A sampling memo has its own lifetime policy; putting it in front of the globe would place
        // that policy on the render path, which is not what this measures or fixes.
        expect(src).not.toMatch(/terrainProvider\s*=\s*this\.samplingTerrainProvider/);
        expect(src).not.toMatch(/terrainProvider\s*=\s*memoiseTerrainTiles/);
    });
});
