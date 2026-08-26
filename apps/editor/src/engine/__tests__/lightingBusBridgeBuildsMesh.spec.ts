/**
 * §LIGHT121 (L-11902) — founder: "I can't remove some lighting fixtures, e.g.
 * terracotta lamp table."
 *
 * `initTools.ts`'s `lighting.created` bridge is the ONE path every bus-created
 * fixture takes (PLAN tool, copy/duplicate-to-level, AI lighting-layout — see
 * `packages/geometry-lighting/__tests__/busCreatedFixtureReachesMeshAndDeletes
 * .test.ts` for the behavioural proof of the mechanism this pins). The bridge
 * cannot be imported and driven directly — it is inline in a several-thousand-
 * line composition function closing over a dozen runtime singletons — so this
 * suite reads the source, the same escape hatch `lightingPlacementArming.spec
 * .ts` uses for the ToolManager wiring in this same lane.
 *
 * Before this fix the bridge called `LightingStore.add()` alone and NEVER
 * `LightingFragmentBuilder.add()`, so a bus-created fixture got a store record
 * and a plan symbol but no scene mesh — `SelectionManager.selectById`'s
 * scene-scan found nothing, so it was never selectable and therefore never
 * deletable. This suite fails against that shape and passes against the fix
 * (`_builder.add(_data)` immediately after `_ls.add(_data)`, mirroring
 * `CreateLightingCommand.execute()`'s `store.add(data); builder.add(data);`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd().endsWith('apps/editor') || process.cwd().endsWith('apps\\editor')
    ? resolve(process.cwd(), '../..')
    : process.cwd();

const SRC = readFileSync(resolve(ROOT, 'apps/editor/src/engine/initTools.ts'), 'utf8');

/** Isolate the `lighting.created` bridge body so assertions cannot false-positive on unrelated code. */
function bridgeBody(src: string): string {
    const start = src.indexOf("runtime.events.on('lighting.created'");
    expect(start, "the §FT-LIGHTING bridge — runtime.events.on('lighting.created', ...) — must exist").toBeGreaterThan(-1);
    // The next bridge registered after it (§FT-FURNITURE) bounds the slice.
    const end = src.indexOf("runtime.events.on('furniture.created'", start);
    expect(end, 'the furniture bridge that follows it must exist, to bound the slice').toBeGreaterThan(start);
    return src.slice(start, end);
}

describe('§LIGHT121 / L-11902 — the lighting.created bridge builds a mesh, not just a store record', () => {
    const body = bridgeBody(SRC);

    it('calls LightingStore.add() — the half that was always present', () => {
        expect(/_ls\.add\(/.test(body), 'store.add() must still be called — this is not a regression of the working half').toBe(true);
    });

    it('THE FIX: also calls LightingFragmentBuilder.add() so the scene gets a mesh', () => {
        // Anchored on the builder variable's own declaration so a rename of `_data`
        // cannot silently defeat this by matching some unrelated `.add(`.
        expect(
            /const _builder = window\.lightingBuilder[\s\S]{0,200}_builder\.add\(_data\)/.test(body),
            'the bridge must call `_builder.add(_data)` — without it, every bus-created ' +
            'fixture (PLAN tool / copy-duplicate / AI lighting-layout) gets a store record ' +
            'and no scene mesh, and is silently unselectable and undeletable',
        ).toBe(true);
    });

    it('the store.add() and builder.add() share the SAME data object (_data), not two independently-built literals', () => {
        // Two separately-constructed object literals could drift (e.g. one seated,
        // one not) even if both calls exist. Both must reference the one `_data` const.
        const dataDecl = /const _data: LightingData = \{/.test(body);
        const storeUsesData = /_ls\.add\(_data\)/.test(body);
        const builderUsesData = /_builder\.add\(_data\)/.test(body);
        expect(dataDecl, 'a single `_data` object must be constructed').toBe(true);
        expect(storeUsesData, '_ls.add must be called with _data').toBe(true);
        expect(builderUsesData, '_builder.add must be called with the SAME _data').toBe(true);
    });

    it('a missing builder is NOT silently swallowed — it is named in a console.error naming the fixture id', () => {
        expect(
            /if \(_builder\?\.add\) \{[\s\S]{0,60}_builder\.add\(_data\);[\s\S]{0,60}\} else \{[\s\S]{0,300}console\.error/.test(body),
            'when window.lightingBuilder is unavailable the bridge must say so, not fail open silently (C74)',
        ).toBe(true);
    });

    it('REGRESSION GUARD: the correction is on record — the old fiction is quoted as HISTORY, not stated as current fact', () => {
        // The retracted claim ("LightingStore.add() fires bim-lighting-added →
        // LightingFragmentBuilder builds the 3D fixture mesh") stays in the comment
        // as a quoted correction — that is fine, and expected. What must NOT
        // happen is the sentence appearing un-quoted / uncorrected, which would
        // mean the fiction is being asserted as fact again. It must appear
        // wrapped in a quote/correction marker (*"…"* or "was FICTION").
        // The quote lives in the COMMENT ABOVE the handler registration, not inside
        // `body` (which starts at the registration call itself) — search the whole file.
        const idx = SRC.indexOf('LightingStore.add() fires');
        expect(idx, 'the historical claim should still be quoted for context').toBeGreaterThan(-1);
        const excerpt = SRC.slice(Math.max(0, idx - 20), idx + 400);
        expect(
            /\*"|FICTION/.test(excerpt),
            'the retracted claim must be marked as a quoted correction, not restated as current fact',
        ).toBe(true);
    });
});
