/**
 * §SITE-SCOPE F-8 (C12 §13.4 · ADR-0382 D8 · AUDIT-3D-SITE-SCOPE-CROP F-8) —
 * THE RELOAD SWAPS, IT NEVER BLANKS.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS PINS
 * ═════════════════════════════════════════════════════════════════════════════
 * `setContextScope` reloads every layer that bakes a radius into its geometry. Until
 * 2026-09-07 `loadContextBuildingsUncoalesced` called `clearContextBuildings()` BEFORE the
 * terrain round-trip that precedes placement, so between the clear and the placement the scene
 * held NO context — and any abort inside that window (a pan, a newer load, a second slider
 * release) left it empty for good. That is the L-635 "blanked Madrid" shape, and the SCOPE
 * SLIDER is a new trigger for it that fires on every drag release: the founder would watch the
 * whole neighbourhood vanish and come back each time he moved the control.
 *
 * C12 §13.4 states the rule: *"The reload MUST build the replacement before removing what is on
 * screen — a path that clears first and fetches second … is non-conformant."*
 *
 * ⚠ SOURCE-TEXT ARM, AND IT IS DELIBERATE. Instantiating `CesiumViewport` needs a WebGL2
 * context; happy-dom has none, and a fake viewer built from this file's own header could not
 * falsify that header (memory `fake-more-capable-than-real`). What is checkable without a
 * browser is the ORDER OF TWO STATEMENTS IN ONE FUNCTION BODY, and that is exactly the fact the
 * defect is about. What this CANNOT tell you is whether the swapped-in geometry is correct or
 * whether a frame is dropped between the two — only a browser can (AUDIT §7).
 *
 * ⛔ Do not "fix" a failure here by moving the assertion. The clear belongs after the last
 * `await` on the path, next to the placement that replaces it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
    resolve(__dirname, '../CesiumViewport.ts'),
    'utf8',
);

/**
 * The body of a class method, from its declaration to the next declaration at the same
 * indent. Brace-matching would be defeated by braces inside the string literals and the very
 * long comment blocks this file is full of; the next `  public|private|protected` at column 2
 * is unambiguous here and is asserted to exist.
 */
function methodBody(name: string): string {
    const decl = new RegExp(`\\n  (?:public|private|protected)[^\\n]*\\b${name}\\(`);
    const m = decl.exec(SRC);
    expect(m, `method ${name}() not found — it was renamed or removed`).not.toBeNull();
    const from = m!.index + 1;
    const rest = SRC.slice(from + 10);
    const nextDecl = /\n  (?:public|private|protected)[ \t]/.exec(rest);
    return rest.slice(0, nextDecl ? nextDecl.index : rest.length);
}

/** Source with comment lines stripped — a comment quoting the old order is not the order. */
function codeOnly(src: string): string {
    return src
        .split('\n')
        .filter((l) => {
            const t = l.trimStart();
            return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
        })
        .join('\n');
}

/**
 * Every layer `setContextScope` reloads, with the teardown that must not run before its data
 * is in hand. The pairs are the C12 §13.3 class C/D/E layers; the subject (parcel, massing,
 * envelopes, the BIM model) has no entry because it is never reloaded by a scope change.
 */
const LOADERS: ReadonlyArray<readonly [loader: string, clear: string]> = [
    ['loadContextBuildingsUncoalesced', 'clearContextBuildings'],
    ['loadContextRoads', 'clearContextRoads'],
    ['loadContextRail', 'clearContextRail'],
    ['loadContextWaterInner', 'clearContextWater'],
    ['loadContextSea', 'clearContextSea'],
    ['loadContextParks', 'clearContextParks'],
    ['loadContextLanduse', 'clearContextLanduse'],
    ['loadContextTrees', 'clearContextTrees'],
];

describe('§SITE-SCOPE F-8 — ARM A: every context loader SWAPS (clear after the data, never before)', () => {
    it.each(LOADERS)('%s clears only after its first await', (loader, clear) => {
        const body = codeOnly(methodBody(loader));

        // GUARD THE PREMISE. A loader with no `await` would pass the ordering arm vacuously —
        // and every one of these is an async fetch by construction, so a missing await means
        // the method was restructured and this arm is no longer measuring what it names.
        const firstAwait = body.indexOf('await ');
        expect(firstAwait, `${loader}() has no await — this arm would pass vacuously`).toBeGreaterThan(-1);

        const clearAt = body.indexOf(`this.${clear}()`);
        expect(clearAt, `${loader}() no longer calls ${clear}() at all`).toBeGreaterThan(-1);

        // THE RULE. Every `this.clearX()` in the body sits after the first await — including
        // the honest empty-answer clears ("no data for this area" must still drop the old
        // site's layer), which are downstream of the fetch that returned empty.
        let at = clearAt;
        while (at > -1) {
            expect(
                at,
                `${loader}() calls ${clear}() BEFORE its first await — that is the L-635 ` +
                    'blank window, reachable from the scope slider on every release (C12 §13.4).',
            ).toBeGreaterThan(firstAwait);
            at = body.indexOf(`this.${clear}()`, at + 1);
        }
    });
});

describe('§SITE-SCOPE F-8 — ARM B: the buildings path clears next to the placement, not next to the fetch', () => {
    const BODY = codeOnly(methodBody('loadContextBuildingsUncoalesced'));

    /**
     * ⚠ THERE ARE TWO CLEARS ON THIS PATH AND THEY ARE DIFFERENT FACTS.
     *   · the EMPTY-ANSWER clear — `features.length === 0`, right after the fetch: a site with
     *     no data must not keep showing the previous site's neighbours. ARM A covers it.
     *   · the PLACEMENT clear — the swap itself, and the one F-8 is about. It is the LAST one
     *     in the body and must sit after the near terrain sample, immediately before the loop
     *     that re-places. Asserting `indexOf` here would measure the empty-answer clear and
     *     report the swap as broken; that is what this arm's first draft did.
     */
    it('the PLACEMENT clear comes after the NEAR terrain sample — the last await before placing', () => {
        const sample = BODY.indexOf('await this.sampleContextGroundsBatch(nearGroundCentroids)');
        expect(sample, 'the near ground-sample await was renamed — re-derive this arm').toBeGreaterThan(-1);
        expect(BODY.lastIndexOf('this.clearContextBuildings()')).toBeGreaterThan(sample);
    });

    it('the abort check between the sample and the placement clear is still there', () => {
        // A superseded load must return BEFORE the clear, not after it: clearing on the way out
        // of a load that has been replaced is the blank window with extra steps.
        const sample = BODY.indexOf('await this.sampleContextGroundsBatch(nearGroundCentroids)');
        const clear = BODY.lastIndexOf('this.clearContextBuildings()');
        const between = BODY.slice(sample, clear);
        expect(between).toMatch(/signal\.aborted[\s\S]*return;/);
    });
});

describe('§SITE-SCOPE F-8 — ARM C: `setContextScope` itself never tears anything down', () => {
    const BODY = codeOnly(methodBody('setContextScope'));

    it('it reloads every scope-derived layer', () => {
        // C12 §13.1: every layer is cut to the ONE value, so every layer reloads when it moves.
        for (const call of [
            'this.loadContextBuildings(',
            'this.loadContextTrees(',
            'this.loadStreetLife(',
            'this.loadContextRoads(',
            'this.loadContextRail(',
            'this.loadContextParks(',
            'this.loadContextWater(',
            'this.loadContextLanduse(',
        ]) {
            expect(BODY, `setContextScope() no longer reloads ${call}`).toContain(call);
        }
    });

    it('⛔ it calls no clearContext* of its own', () => {
        // The entry point must not blank the scene and hand a reload the job of refilling it —
        // that is the same defect one level up from ARM A.
        expect(BODY).not.toMatch(/this\.clearContext[A-Za-z]*\(/);
    });

    it('an unchanged scope is a no-op, so a slider that emits continuously costs nothing', () => {
        expect(BODY).toMatch(/Math\.abs\(after - before\) < 0\.5[\s\S]{0,80}return;/);
    });
});

describe('§SITE-SCOPE F-8 — ARM D: street life swaps too (its own module, its own clear)', () => {
    /**
     * The lamps and the pedestrians are `Primitive`s owned by `contextStreetLifeRender.ts`, not by
     * the viewport, so its `clear()` is a SECOND copy of the same hazard — and it sat above the
     * `prepareGrounds` terrain round-trip, which is the longest await on that path. Pinned here
     * rather than in a sibling file because it is the same rule about the same reload.
     */
    const RENDER = readFileSync(resolve(__dirname, '../contextStreetLifeRender.ts'), 'utf8');
    const LOAD = codeOnly(
        RENDER.slice(RENDER.indexOf('public async load('), RENDER.indexOf('private viewerStillCurrent(')),
    );

    it('the load body was located', () => {
        expect(LOAD.length).toBeGreaterThan(500);
        expect(LOAD).toContain('await Promise.all');
    });

    it('the SWAP clear comes after the ground preparation, not before it', () => {
        const prepare = LOAD.indexOf('await host.prepareGrounds(');
        expect(prepare, 'prepareGrounds was renamed — re-derive this arm').toBeGreaterThan(-1);
        // The last `this.clear(viewer)` is the swap; the earlier ones are the `!this.enabled`
        // teardowns, which are a DIFFERENT fact (the layer was switched off, nothing replaces it).
        expect(LOAD.lastIndexOf('this.clear(viewer)')).toBeGreaterThan(prepare);
    });

    it('the replacement primitives are built in the same task as the clear', () => {
        const clear = LOAD.lastIndexOf('this.clear(viewer)');
        const after = LOAD.slice(clear);
        expect(after).toContain('this.buildLamps(');
        expect(after).toContain('this.buildPeople(');
        // ⛔ No await between the clear and the rebuild: an await there re-opens the window.
        expect(
            after.slice(0, after.indexOf('this.buildPeople(')),
            'an await slipped between the clear and the rebuild — the blank window is back',
        ).not.toContain('await ');
    });
});
