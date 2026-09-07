// §ONE-RULE-FOR-THE-NEXT-STOREY (lane ENVELOPE-DRAW-AND-STOREYS, 2026-09-07) — L-13151.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT THIS SUITE IS FOR, AND WHY IT READS SOURCE RATHER THAN CALLING A FUNCTION
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The founder created five level envelopes and one of them was **15.3 m** tall beside four of
// 3.0 / 3.0 / 2.6 (the log line quoted in L-13146). 15.3 is a WHOLE-BUILDING figure — his parcel's
// permitted max height, confirmed by the 2.6 in the same list being `15.3 / 6 = 2.55` printed to
// one decimal. A whole-building height had reached ONE storey's `Level.height` record, and from
// there `resolveStoreyHeight`'s first rung minted an envelope that tall, forever.
//
// It got there because FOUR controls answer *"how tall is the next storey?"* and one of them
// answered differently:
//
//   · `LevelManagerPanel._addLevel`                 → the TOP storey by ELEVATION's own height ?? 3.0
//   · `GridsLevelsRailPanel`                        → the same
//   · `PlanViewToolOverlay`                         → the same
//   · `ProjectTreeSection` ("+ Level" in the browser) → ⛔ `Math.abs(elevations[n-1] − elevations[n-2])`
//
// `bimManager.getLevels()` is `Array.from(this.levels.values())` — INSERTION order, not elevation
// order — so that difference is an arbitrary pair of storeys and, when they straddle the stack,
// it is the WHOLE-BUILDING SPAN written into one storey's height.
//
// ⛔ THIS IS A SOURCE-LEVEL SPEC AND IT SAYS SO. Three of the four controls need a THREE scene, a
// `window.bimManager` and a command bus to exercise, and standing all that up would test the
// harness rather than the rule. What a source read CAN establish is exactly what was wrong here
// and what would go wrong again: that no control DERIVES a storey height from a difference between
// two elevations. ⚠ It cannot establish that the surviving rule is correct, that the controls are
// reachable, or that any of them runs — [[committed-is-not-reachable]] applies in full. It is a
// REGRESSION GUARD against a rival rule being re-introduced anywhere, which is precisely the shape
// that cost the founder his 15.3.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

/**
 * The file with every comment removed.
 *
 * ⛔ REQUIRED, NOT TIDINESS. The fix that closed L-13151 left a comment QUOTING the defect it
 * removed — a repo whose whole culture is to record what went wrong beside the code — and a probe
 * that reads raw source would flag that prose as the defect. A source-level guard that cannot tell
 * an explanation from an implementation is a guard that forces the explanation to be deleted, which
 * is the opposite of what this repo wants.
 */
const code = (rel: string): string =>
    read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');

/** The four controls that create a storey, by the path they live at. */
const ADD_LEVEL_CONTROLS: readonly string[] = [
    'apps/editor/src/ui/levels/LevelManagerPanel.ts',
    'apps/editor/src/ui/tools-panel/panels/GridsLevelsRailPanel.ts',
    'apps/editor/src/engine/views/PlanViewToolOverlay.ts',
    'apps/editor/src/ui/ViewBrowser/panels/unified-browser/ProjectTreeSection.ts',
];

describe('§ONE-RULE-FOR-THE-NEXT-STOREY (L-13151) — a storey height is never an elevation difference', () => {
    it('⛔ no add-level control derives a height from a difference between two elevations', () => {
        // The exact defect: an `elevations[i] - elevations[j]` subtraction feeding a `height`.
        // Written as two independent probes so a rename of the local cannot slip past it.
        const offenders: string[] = [];
        for (const rel of ADD_LEVEL_CONTROLS) {
            const src = code(rel);
            if (/elevations\s*\[[^\]]*\]\s*-\s*elevations\s*\[/.test(src)) offenders.push(`${rel} (elevation subtraction)`);
            if (/prevDiff/.test(src)) offenders.push(`${rel} (prevDiff)`);
        }
        expect(offenders).toEqual([]);
    });

    it('⭐ all four take the TOP storey by ELEVATION and use ITS recorded height', () => {
        // ⚠ Deliberately a SHAPE check, not a string match on one spelling: the three older
        // controls write `top?.height ?? 3.0` and the fixed one writes a typed guard, and pinning
        // one spelling would forbid the other from ever being tidied.
        for (const rel of ADD_LEVEL_CONTROLS) {
            const src = code(rel);
            expect(src, `${rel} must pick a top storey by elevation`).toMatch(/elevation\s*>\s*\w+\.elevation|\(l\.elevation \?\? 0\) > \(max\.elevation \?\? 0\)/);
            expect(src, `${rel} must fall back to 3.0, never to a derived span`).toMatch(/(\?\?\s*3\.0|:\s*3\.0)/);
        }
    });

    it('⛔ `BimKernel.addLevel` resolves `height` AFTER the spread, so an undefined key cannot win', () => {
        // `{ height: 3.0, ...{ height: undefined } }` is `{ height: undefined }` — a present-but-
        // undefined key beats a default. `AddLevelCommand.execute` always materialises that key,
        // so every caller that omitted a height minted a storey with NO recorded floor-to-floor,
        // which silently moved it onto the ordinance rung of `resolveStoreyHeight`.
        const src = code('packages/core-app-model/src/BimKernel.ts');
        const body = src.slice(src.indexOf('const safeLevel: Level = {'));
        const spreadAt = body.indexOf('...level,');
        const heightAt = body.indexOf('height:');
        expect(spreadAt).toBeGreaterThan(-1);
        expect(heightAt).toBeGreaterThan(-1);
        expect(heightAt, 'height must be resolved AFTER ...level, not before it').toBeGreaterThan(spreadAt);
        expect(body.slice(0, 400)).toContain('Number.isFinite(level.height)');
    });
});
