/**
 * §FIX-ORTHO-CANNOT-FALL-BACK-TO-LINEAR (founder 2026-08-24) — THE BRIDGE BETWEEN THE
 * TWO WALL-MODE VOCABULARIES, and the third place "ORTHO" could silently become
 * free-angle.
 *
 * ── WHY TWO VOCABULARIES EXIST AT ALL ────────────────────────────────────────
 *
 * One user-facing "ORTHO" switch drives TWO tools that do not share a mode type:
 *
 *   • the 3-D `WallTool` reads the `WallDrawingMode` ENUM ('POLYLINE_ORTHO', …);
 *   • the PLAN `WallPlanToolHandler` reads `window.wallModePicker.getActiveMode()`,
 *     a `WallPickerMode` STRING ('ortho' | 'linear' | 'curved' | …).
 *
 * `ToolsAreaLayout`'s `activateWallTool` wrapper is the ONE place that keeps them in
 * step: it maps the enum the 3-D tool was armed with onto the picker string the plan
 * handler will read. Everything downstream of a mistake here draws the wrong mode on
 * the OTHER surface — the founder clicks a mode, switches view, and draws something
 * else (`ToolsAreaLayout.ts` line ~631 records that exact failure for the loop modes).
 *
 * ⚠ THIS IS A REAL, STILL-OPEN ARCHITECTURAL DEBT, NOT A FEATURE. Two types for one
 * concept means the bridge must be exhaustive forever, and a bridge that ends in a
 * bare `return 'linear'` is not. Collapsing them onto ONE mode source is the actual
 * fix and is out of this lane's scope; this module makes the bridge HONEST in the
 * meantime and gives that collapse a single place to happen.
 *
 * ── THE DEFECT THIS MODULE REMOVES ───────────────────────────────────────────
 *
 * The mapper was a private closure inside `ToolsAreaLayout`:
 *
 *     if (m === WallDrawingMode.POLYLINE_ORTHO) return 'ortho';
 *     if (m === WallDrawingMode.POLYLINE_ARC)   return 'curved';
 *     return 'linear';
 *
 * Three defects in five lines:
 *   1. `LINE_ORTHO` — a REAL ortho mode, and one `WallTool._applyOrthoLock` honours —
 *      fell through to `'linear'`. Arm the 3-D tool in LINE_ORTHO and the plan pane
 *      silently drew free-angle while the 3-D pane drew ortho: one switch, two answers.
 *   2. The loop modes (RECTANGULAR/CIRCULAR/ELLIPTICAL_LOOP) also fell through — which
 *      is why `ToolsAreaLayout` had to set the picker BY HAND at each loop call site.
 *   3. THE FALL-THROUGH ITSELF. `return 'linear'` answered "I do not recognise this
 *      mode" with the name of the LEAST-CONSTRAINED mode, silently — the same shape as
 *      `_getMode()`'s `?? 'linear'` and the same shape as the `'polyline_ortho'` cast.
 *      C01 §6 rule 6: a failure and a legitimate value must not be the same value.
 *
 * ⛔ Do NOT restore the bare `return 'linear'`. If a mode cannot be classified, say so.
 */

import { WallDrawingMode, resolveWallDrawingMode } from '@pryzm/geometry-wall';
import type { WallPickerMode } from '../WallModePicker';

/**
 * The 3-D drawing mode a picker string names, and the picker string a 3-D drawing mode
 * names — ONE table, read in one direction here.
 *
 * ⭐ It is keyed on `WallDrawingMode` and EXHAUSTIVE over it: TypeScript's `Record`
 * makes adding an enum member without deciding its picker string a COMPILE ERROR. That
 * is the structural half of the fix — the fall-through could not be reintroduced by
 * forgetting a case, because there are no cases to forget.
 */
const PICKER_MODE_BY_DRAWING_MODE: Record<WallDrawingMode, WallPickerMode> = {
    [WallDrawingMode.SINGLE]:           'linear',
    [WallDrawingMode.POLYLINE]:         'linear',
    [WallDrawingMode.POLYLINE_MIXED]:   'linear',
    [WallDrawingMode.POLYLINE_MIXED_2]: 'linear',
    // ⭐ BOTH ortho members. `LINE_ORTHO` used to fall through to 'linear' — the plan
    // pane drew free-angle while the 3-D pane drew ortho, from one switch.
    [WallDrawingMode.LINE_ORTHO]:       'ortho',
    [WallDrawingMode.POLYLINE_ORTHO]:   'ortho',
    [WallDrawingMode.POLYLINE_ARC]:     'curved',
    [WallDrawingMode.CURVED_WALL]:      'curved',
    [WallDrawingMode.RECTANGULAR_LOOP]: 'rectangular',
    [WallDrawingMode.CIRCULAR_LOOP]:    'circular',
    [WallDrawingMode.ELLIPTICAL_LOOP]:  'elliptical',
};

/**
 * Map whatever the wall tool was armed with onto the `WallPickerMode` string the plan
 * handler reads.
 *
 * Accepts `unknown` DELIBERATELY: the value reaching `activateWallTool` is typed
 * `WallDrawingMode` but arrives through `runtime.tools.activate(family, mode?: string)`
 * via `(m as WallDrawingMode)` — a CAST, which asserts and does not check. That is
 * precisely how `'polyline_ortho'` got in. `resolveWallDrawingMode` normalises the
 * spelling and REPORTS an unrecognised one by name; only then is the table consulted.
 */
export function wallPickerModeFromDrawingMode(mode: unknown): WallPickerMode {
    const res = resolveWallDrawingMode(mode, 'wallPickerModeFromDrawingMode (plan/3-D mode sync)');
    return PICKER_MODE_BY_DRAWING_MODE[res.mode];
}
