/**
 * §PERF-DEDUP-SAVES-DRAW-CALLS-NOT-COMPILES — the guard for a COST MODEL.
 *
 * ── WHY A TEST AND NOT JUST A COMMENT ─────────────────────────────────────────
 *
 * `materialSignature.ts` documents that deduplicating look-alike materials buys
 * DRAW CALLS and does NOT save a shader compile. That correction exists because a
 * sibling instrument prints the opposite on every run:
 *
 *   packages/geometry-wall/__tests__/SCENE6InstancingRejectCensus.measure.test.ts
 *     "364 distinct INSTANCES for 1 distinct VISUAL SIGNATURES
 *      ⭐ 363 redundant material objects — A SHADER COMPILE EACH"
 *
 * A prose correction to a printed number loses that argument every time — the
 * number is on screen and the prose is in a file nobody opened. So the claim is
 * pinned HERE, against the vendored `three` build itself.
 *
 * ⭐ WHAT MAKES THIS HONEST: it asserts against `node_modules/three`, the SAME
 * artefact the app ships, not against a hand-written fixture. A fake built from
 * the claim could not falsify the claim. If a `three` upgrade ever starts keying
 * a program or pipeline cache on material IDENTITY, these tests go red and the
 * cost model in `materialSignature.ts` must be revisited — which is the entire
 * point. They are deliberately allowed to break on upgrade.
 *
 * ⛔ THIS IS NOT A TEST OF OUR CODE. It is a test of an ASSUMPTION our code's
 * priority ranking rests on. Do not "fix" a failure here by loosening the regex;
 * a failure means the upstream renderer changed and a perf decision needs redoing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);

/**
 * Resolve the vendored three build directory from the installed package.
 *
 * ⛔ NOT via `require.resolve('three/package.json')` — three's `exports` map does
 * not expose `./package.json`, so that throws ERR_PACKAGE_PATH_NOT_EXPORTED. The
 * `.` entry resolves to `<pkg>/build/three.cjs`, so its dirname IS the build dir.
 */
function threeBuildDir(): string {
    return dirname(require_.resolve('three'));
}

/** Installed three version, read off disk (see above: not requireable). */
function threeVersion(): string {
    const p = join(threeBuildDir(), '..', 'package.json');
    return (JSON.parse(readFileSync(p, 'utf8')) as { version: string }).version;
}

function readBuild(file: string): string {
    const p = join(threeBuildDir(), file);
    if (!existsSync(p)) throw new Error(`vendored three build missing: ${p}`);
    return readFileSync(p, 'utf8');
}

/**
 * Slice `src` from the first line matching `startRe` for `lineCount` lines.
 * Line-based rather than brace-matching because the builds are formatted with
 * blank lines inside function bodies, which defeats naive brace counting.
 */
function sliceFrom(src: string, startRe: RegExp, lineCount: number): string {
    const lines = src.split('\n');
    const i = lines.findIndex(l => startRe.test(l));
    expect(i, `anchor not found: ${startRe}`).toBeGreaterThan(-1);
    return lines.slice(i, i + lineCount).join('\n');
}

describe('three@0.183.x keys shader caches by material VALUES, never by uuid', () => {
    it('installed three is the version this cost model was measured against', () => {
        const v = threeVersion();
        // Pinned to the major.minor the measurement was taken on. A bump is not a
        // failure of our code — it is a signal to RE-MEASURE, so it must be loud.
        expect(v.startsWith('0.183.'), `three is ${v}; re-measure §PERF-DEDUP-SAVES-DRAW-CALLS-NOT-COMPILES`).toBe(true);
    });

    it('classic WebGLRenderer: getProgramCacheKey() never reads material.uuid', () => {
        const src = readBuild('three.module.js');
        const fn = sliceFrom(src, /^\s*function getProgramCacheKey\( parameters \)/, 40);

        // It builds the key from shaderID / defines / parameter+boolean sets.
        expect(fn).toMatch(/parameters\.shaderID/);
        expect(fn).toMatch(/getProgramCacheKeyParameters/);
        expect(fn).toMatch(/getProgramCacheKeyBooleans/);

        // ⭐ THE LOAD-BEARING ASSERTION: identity is absent from the key.
        expect(fn).not.toMatch(/\buuid\b/);
    });

    it('⭐ WebGPURenderer: getMaterialCacheKey() SKIPS uuid by name', () => {
        const src = readBuild('three.webgpu.js');
        const fn = sliceFrom(src, /^\s*getMaterialCacheKey\(\)/, 20);

        // The skip-list regex three itself applies to every material property.
        // `uuid`, `name` and `userData` are excluded explicitly — so two materials
        // differing ONLY in identity produce the SAME key.
        const skipList = fn.match(/\/\^\(is\[A-Z\]\|_\)\|\^\([^/]*\)\$\//);
        expect(skipList, 'material property skip-list regex not found').not.toBeNull();
        expect(skipList![0]).toMatch(/\buuid\b/);
        expect(skipList![0]).toMatch(/\bname\b/);
        expect(skipList![0]).toMatch(/\buserData\b/);
    });

    it('WebGPURenderer: that key is what the node-builder + pipeline caches use', () => {
        const src = readBuild('three.webgpu.js');

        // getCacheKey() = getMaterialCacheKey() + getDynamicCacheKey()
        expect(sliceFrom(src, /^\s*getCacheKey\(\) \{/, 8))
            .toMatch(/getMaterialCacheKey\(\)/);

        // ...stored as initialCacheKey, and handed to the node-builder cache.
        expect(src).toMatch(/this\.initialCacheKey = this\.getCacheKey\(\)/);
        expect(sliceFrom(src, /^\s*getForRenderCacheKey\( renderObject \)/, 6))
            .toMatch(/renderObject\.initialCacheKey/);
        expect(src).toMatch(/nodeBuilderCache\.get\( cacheKey \)/);
    });

    it('⛔ the conclusion, stated so it cannot be misread', () => {
        // N materials that differ ONLY in uuid share one program on the classic
        // renderer and one nodeBuilderState + pipeline on the WebGPU renderer.
        // Therefore SharedMaterialCache saves DRAW CALLS (InstancedElementRenderer
        // hashes groups by material.uuid) and saves NO shader compiles.
        const webgpu = readBuild('three.webgpu.js');
        const classic = readBuild('three.module.js');

        // Neither cache-key path mentions uuid as an INPUT (the webgpu one mentions
        // it only inside its exclusion regex, which is the opposite of an input).
        expect(sliceFrom(classic, /^\s*function getProgramCacheKey\( parameters \)/, 40))
            .not.toMatch(/uuid/);

        const webgpuFn = sliceFrom(webgpu, /^\s*getMaterialCacheKey\(\)/, 20);
        // uuid appears exactly once, and only inside the skip-list.
        expect(webgpuFn.match(/uuid/g)?.length).toBe(1);
        expect(webgpuFn).toMatch(/continue/); // the skip-list's effect
    });
});
