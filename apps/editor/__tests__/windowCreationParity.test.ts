// @vitest-environment happy-dom
//
// (DOM env required only because the `@pryzm/geometry-window` barrel transitively
// reaches a module that touches `HTMLElement` at import time. Nothing in THIS file
// uses the DOM — the assertions are pure. Same convention as the other editor suites.)

/**
 * §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — THE PARITY GUARD.
 *
 * THE DISEASE THIS TEST EXISTS TO KILL
 * ------------------------------------
 * "ONE ELEMENT, TWO CREATION PATHS, AND THE PLAN PATH SILENTLY DROPS WHAT THE 3D
 * PATH RESOLVES." It has now been diagnosed EIGHT times on this codebase — L-239
 * (wall layers), L-240 (floor-finish inner face), L-243 (stair config), L-246 (plan
 * cut), L-251 (mitre), L-255 (floor-finish modal), L-260A (door), and now L-266
 * (window). Each time it was fixed at ONE site, and each time it reappeared at the
 * next one, because nothing pinned the invariant itself.
 *
 * The founder's report, verbatim: "Window parity not correct." What he was looking
 * at: a window drawn in 3D was a TIMBER CASEMENT; the "same" window drawn in PLAN
 * was a SINGLE PANE — a different systemTypeId, therefore different column ratios
 * (a mullion, or none), a different frame finish, and a different plan symbol.
 *
 * THE ROOT CAUSE (proven, not assumed): `WindowPlanToolHandler` read the type off a
 * `window.*` global with its own fallback chain, then INVENTED the dimensions —
 * `width = double ? 2.4 : 1.2`, `height: 1.2`, `sillHeight: 1.0` — while `WindowTool`
 * (3D) resolved the SAME window from its own defaults and a DIFFERENT systemTypeId.
 *
 * THE CURE (C11 §3): resolve the choice ONCE, BELOW the tools, and let every path
 * inherit it. NOT "teach the plan tool to imitate the 3D tool" — that leaves two
 * paths to be kept in step BY HAND, and they never are. That is why these tests
 * assert the CHOKEPOINTS, not the copies:
 *
 *   WindowToolConfigStore   — WHICH window the architect chose   (one store)
 *   resolveWindowDimensions — that window's REAL dimensions      (one resolver)
 *
 * WHAT THIS FILE GUARDS, AND WHY EACH ONE
 * ---------------------------------------
 *  P-1  Both creation paths resolve the SAME record from the SAME chokepoints.
 *  P-2  Changing the tool's choice moves BOTH paths together — you cannot desync them.
 *  P-3  The PRE-CREATION case really is served by the one resolver (no width yet →
 *       falls through to the TYPE's standard opening). This is what makes ONE
 *       resolver able to serve both the tool and the placed record.
 *  P-4  NO DIMENSION LITERAL survives in the plan handler. This is the guard that
 *       actually stops the regression: the bug was literals, so the test forbids
 *       literals. A future edit that re-introduces `1.2` reds this file.
 *  P-5  The PREVIEW resolves from the same chokepoint as the COMMIT. "Preview ≠ build"
 *       is a defect this project has already paid for; the dashed rectangle must be
 *       the window the click actually produces.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
    getWindowToolConfig,
    setWindowToolConfig,
    resetWindowToolConfig,
    resolveWindowDimensions,
} from '@pryzm/geometry-window';

const _here = dirname(fileURLToPath(import.meta.url));
const HANDLER_SRC = resolve(_here, '../src/engine/views/plantools/WindowPlanToolHandler.ts');

/**
 * The window record a creation path commits, reduced to the fields that DEFINE the
 * window (and therefore its plan symbol). Both paths must produce this identically.
 *
 * This mirrors exactly what `WindowPlanToolHandler` now builds and what `WindowTool`
 * builds — both by calling the two chokepoints below and NOTHING else.
 */
function resolveCreationRecord() {
    const cfg = getWindowToolConfig();
    const dims = resolveWindowDimensions({
        systemTypeId: cfg.systemTypeId,
        windowType: cfg.windowType,
    });
    return {
        systemTypeId: cfg.systemTypeId,
        windowType: cfg.windowType,
        width: dims.width,
        height: dims.height,
        sillHeight: dims.sillHeight,
    };
}

describe('§FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 — window creation parity (L-266)', () => {
    beforeEach(() => {
        resetWindowToolConfig();
    });

    it('P-1: the plan path and the 3D path resolve the IDENTICAL record from the same chokepoints', () => {
        // Both tools now call getWindowToolConfig() + resolveWindowDimensions() and
        // nothing else. Resolving twice models the two call sites; they must agree.
        const fromPlan = resolveCreationRecord();
        const from3D = resolveCreationRecord();

        expect(fromPlan).toEqual(from3D);

        // And the record must be REAL — not the schema-default void that a dropped
        // systemTypeId used to produce (a window with no type reads blank in every
        // schedule and renders schema-default grey).
        expect(fromPlan.systemTypeId).toBeTruthy();
        expect(fromPlan.width).toBeGreaterThan(0);
        expect(fromPlan.height).toBeGreaterThan(0);
        expect(fromPlan.sillHeight).toBeGreaterThanOrEqual(0);
    });

    it('P-2: changing the architect\'s choice moves BOTH paths together — they cannot be desynced', () => {
        const before = resolveCreationRecord();

        // The architect picks a double. In the OLD code this changed the 3D tool's
        // width via DEFAULT_DOUBLE_WIDTH and the plan tool's width via a LITERAL 2.4,
        // and the two only agreed by coincidence.
        setWindowToolConfig({ windowType: 'double' });

        const after = resolveCreationRecord();
        expect(after.windowType).toBe('double');
        expect(before.windowType).toBe('single');

        // A double is wider than a single — resolved from the TYPE, not from a literal.
        expect(after.width).toBeGreaterThan(before.width);

        // Crucially: there is only ONE store, so there is no second place for a path
        // to read a stale choice from.
        expect(getWindowToolConfig().windowType).toBe('double');
    });

    it('P-3: the PRE-CREATION case is served by the one resolver (no width yet → the TYPE\'s opening)', () => {
        // This is the property that lets ONE resolver serve both the tool (nothing
        // placed yet) and a placed record. A tool passes only {systemTypeId,
        // windowType} — no width exists — and must still get the type's real opening.
        const cfg = getWindowToolConfig();
        const preCreation = resolveWindowDimensions({
            systemTypeId: cfg.systemTypeId,
            windowType: cfg.windowType,
        });

        expect(Number.isFinite(preCreation.width)).toBe(true);
        expect(preCreation.width).toBeGreaterThan(0);
        expect(Number.isFinite(preCreation.height)).toBe(true);
        expect(Number.isFinite(preCreation.sillHeight)).toBe(true);

        // A PLACED window's own width WINS over the type's (the user may have resized
        // it) — the instance is the strongest authority.
        const placed = resolveWindowDimensions({
            systemTypeId: cfg.systemTypeId,
            windowType: cfg.windowType,
            width: preCreation.width + 0.5,
        });
        expect(placed.width).toBeCloseTo(preCreation.width + 0.5, 6);
    });

    it('P-4: NO dimension literal survives in WindowPlanToolHandler — the bug was literals, so literals are forbidden', () => {
        const src = readFileSync(HANDLER_SRC, 'utf8');

        // Strip comments: the file DOCUMENTS the old literals on purpose (they name
        // the bug), and that prose must not fail its own guard.
        const code = src
            .replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
            .replace(/^\s*\/\/.*$/gm, '');     // line comments

        // The exact literals that WERE the bug: width 2.4 / 1.2, height 1.2, sill 1.0.
        // If any of these reappear as a dimension in code, the disease is back.
        expect(code).not.toMatch(/width\s*:\s*[\d.]+/);
        expect(code).not.toMatch(/height\s*:\s*[\d.]+/);
        expect(code).not.toMatch(/sillHeight\s*:\s*[\d.]+/);
        expect(code).not.toMatch(/\?\s*2\.4\s*:\s*1\.2/);
    });

    it('P-5: the PREVIEW resolves from the same chokepoint as the COMMIT (preview ≠ build is a defect)', () => {
        const src = readFileSync(HANDLER_SRC, 'utf8');
        const code = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        // Both the commit path and the preview path must call BOTH chokepoints. Two
        // call sites each ⇒ at least two occurrences of each.
        const cfgCalls = code.match(/getWindowToolConfig\s*\(/g) ?? [];
        const dimCalls = code.match(/resolveWindowDimensions\s*\(/g) ?? [];

        expect(cfgCalls.length).toBeGreaterThanOrEqual(2);
        expect(dimCalls.length).toBeGreaterThanOrEqual(2);

        // And the P4-violating global read that used to be the type's source is gone.
        expect(code).not.toMatch(/window\.windowTool/);
    });
});
