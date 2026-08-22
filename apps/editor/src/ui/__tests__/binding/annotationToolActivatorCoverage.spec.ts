/**
 * annotationToolActivatorCoverage.spec.ts
 *
 * §ANNOTATION-PALETTE-IS-WIRED (L-5000..L-5003, lane ANNO15, founder 2026-08-22)
 *
 * ─── Why this exists, and why it is a TEST and not a new GA gate ─────────────
 *
 * The founder asked whether all nineteen annotation palette entries are wired.
 * The failure shape being hunted is the one PERF13's
 * `tools/ga-gate/check-tool-activator-coverage.ts` was written for on the SAME
 * DAY: a palette entry that REPORTS activation and activates nothing ("Stair
 * tool is active" with no stair, L-4601).
 *
 * ⭐ ANNOTATIONS CANNOT BE ENROLLED IN THAT GATE AS IT IS WRITTEN, and saying so
 * precisely is the finding. Measured 2026-08-22 — that gate's two subjects are:
 *
 *     MATRIX_FILE   = apps/editor/src/engine/views/plantools/elementCreationMatrix.ts
 *     REGISTER_FILE = apps/editor/src/ui/layout/ToolsAreaLayout.ts
 *
 * Neither mentions any annotation id. Annotations are declared in a DIFFERENT
 * registry (`toolRegistry` from `@pryzm/input-host`, section 'ANNOTATION') and
 * dispatched by a DIFFERENT surface (`AnnotationRailPanel._dispatchTool`). All
 * nineteen ids are, in fact, in that gate's exclusion list
 * `NON_CREATION_PLAN_TOOLS` — they are outside its denominator by design.
 *
 * Enrolling them means adding an ARM C to that gate whose subjects are
 * `initAnnotationTools.ts` and `AnnotationRailPanel.ts`. That file is UNCOMMITTED
 * WORK IN A LIVE LANE at the time of writing, so editing it would collide. This
 * spec asserts exactly what that arm would assert, in this lane's own scope, and
 * L-5003 records the fold-in as the follow-up. It is deliberately NOT a rival
 * gate: it mints no `tools/ga-gate/check-*.ts`.
 *
 * ─── What it checks (SETS, never a count) ────────────────────────────────────
 *
 * The same lesson PERF13's gate records: on 2026-08-22 the palette declared 19
 * ids and `_dispatchTool` carried 19 `case` labels. **19 == 19, and a
 * count-based check would pass forever** while a single renamed id armed
 * nothing. These are set comparisons.
 *
 *   ARM A — every declared palette id has a `case` in `_dispatchTool`.
 *   ARM B — every `case` in `_dispatchTool` is a declared palette id
 *           (a case nothing can reach is dead wiring that LOOKS like coverage).
 *   ARM C — every `toolManager.activateX()` named by `_dispatchTool` exists as a
 *           method on `ToolManager`. This is the arm that would have caught the
 *           stair defect's annotation twin.
 *   F0    — floors: a regex that rots and finds nothing must MISCONFIGURE, never
 *           report a clean sweep of nothing (§CONTEXT-DATA-HONESTY).
 *
 * ⚠ SCOPE, STATED HONESTLY. This proves WIRING, not BEHAVIOUR. A green reading
 * means "no palette button dispatches into a name that does not exist". It does
 * NOT mean a click places anything, that the placement persists, that it renders
 * in plan, or that it reaches the PDF. Those are measured per-entry in
 * `docs/02-decisions/contracts/C101-ANNOTATION-INTEGRITY.md` §7 and four of them
 * are RED there.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../../../..');

const INIT_FILE = resolve(REPO, 'apps/editor/src/engine/initAnnotationTools.ts');
const RAIL_FILE = resolve(REPO, 'apps/editor/src/ui/tools-panel/panels/AnnotationRailPanel.ts');
const TM_FILE = resolve(REPO, 'packages/input-host/src/ToolManager.ts');

function read(path: string): string {
    const src = readFileSync(path, 'utf8');
    if (src.trim() === '') throw new Error(`MISCONFIGURED — empty: ${path}`);
    return src;
}

/** ids passed to `toolRegistry.register({ id: '<id>', … section: 'ANNOTATION' })`. */
function declaredPaletteIds(src: string): Set<string> {
    const out = new Set<string>();
    for (const m of src.matchAll(/toolRegistry\.register\(\{\s*id:\s*'([a-z][a-z0-9-]*)'/g)) {
        out.add(m[1]!);
    }
    return out;
}

/** `case '<id>':` labels inside AnnotationRailPanel._dispatchTool. */
function dispatchCaseIds(src: string): Set<string> {
    const start = src.indexOf('private _dispatchTool(');
    if (start < 0) throw new Error('MISCONFIGURED — _dispatchTool not found in AnnotationRailPanel.ts');
    const body = src.slice(start);
    const end = body.indexOf('\n    }');
    const scoped = end > 0 ? body.slice(0, end) : body;
    const out = new Set<string>();
    for (const m of scoped.matchAll(/case\s+'([a-z][a-z0-9-]*)'\s*:/g)) out.add(m[1]!);
    return out;
}

/** `toolManager.activateX()` names invoked by _dispatchTool. */
function activatorNames(src: string): Set<string> {
    const start = src.indexOf('private _dispatchTool(');
    const body = src.slice(start);
    const end = body.indexOf('\n    }');
    const scoped = end > 0 ? body.slice(0, end) : body;
    const out = new Set<string>();
    for (const m of scoped.matchAll(/toolManager\.(activate[A-Za-z]+)\s*\(/g)) out.add(m[1]!);
    return out;
}

/** method names declared on ToolManager. */
function toolManagerMethods(src: string): Set<string> {
    const out = new Set<string>();
    for (const m of src.matchAll(/^\s{4}(?:public\s+|async\s+)*(activate[A-Za-z]+)\s*\(/gm)) out.add(m[1]!);
    return out;
}

/**
 * Two palette entries are deliberately NOT `toolManager.activateX` calls, and an
 * exemption is a STATEMENT, not a suppression — each says why routing it through
 * ToolManager would be WRONG, not merely unbuilt.
 */
const NON_TOOLMANAGER_ENTRIES: Readonly<Record<string, string>> = {
    'annotation-visibility':
        'Opens AnnotationVisibilityPanel — a PANEL, not a placement tool. It arms no ' +
        'pointer gesture, so ToolManager (which disables SelectionManager on activate) ' +
        'is the wrong owner. ⚠ It is also the ONE entry of the nineteen with no command ' +
        'at all: AnnotationVisibilityPanel calls store.show()/hide() DIRECTLY, so a ' +
        'hide survives save/load but Ctrl+Z cannot reverse it (L-5001).',
    'annotate-view-ai':
        'Fires AnnotateViewCommand — a macro that mints N CreateAnnotationCommands. ' +
        'It is not a tool and has no armed state. ⚠ It silently drops 23 of the 27 ' +
        'annotation kinds: _specToAnnotation handles linear-dim / text-note / tag / ' +
        'spot-elevation and returns null otherwise, with no user-visible refusal (L-5002).',
};

describe('annotation palette — activator coverage (SETS, never a count)', () => {
    const initSrc = read(INIT_FILE);
    const railSrc = read(RAIL_FILE);
    const tmSrc = read(TM_FILE);

    const declared = declaredPaletteIds(initSrc);
    const cases = dispatchCaseIds(railSrc);
    const activators = activatorNames(railSrc);
    const methods = toolManagerMethods(tmSrc);

    // ── F0 — floors. A rotted regex must MISCONFIGURE, never read clean. ──────
    it('F0: every sweep finds a plausible population', () => {
        expect(declared.size, 'declaredPaletteIds regex rotted').toBeGreaterThanOrEqual(19);
        expect(cases.size, 'dispatchCaseIds regex rotted').toBeGreaterThanOrEqual(17);
        expect(activators.size, 'activatorNames regex rotted').toBeGreaterThanOrEqual(17);
        expect(methods.size, 'toolManagerMethods regex rotted').toBeGreaterThanOrEqual(17);
    });

    it('F0: the palette the founder sees is exactly nineteen entries', () => {
        expect([...declared].sort()).toEqual([
            'angular-dimension', 'annotate-view-ai', 'annotation-visibility',
            'callout-detail', 'diameter-dimension', 'door-tag', 'element-tag',
            'elevation-mark', 'grid-bubble', 'keynote', 'level-tag',
            'linear-dimension', 'radius-dimension', 'revision-cloud',
            'section-mark', 'slope-dimension', 'spot-elevation', 'text-note',
            'window-tag',
        ]);
    });

    // ── ARM A — declared ⊆ dispatched. ───────────────────────────────────────
    it('ARM A: every declared palette id has a dispatch case', () => {
        const uncovered = [...declared].filter((id) => !cases.has(id)).sort();
        expect(
            uncovered,
            'These palette buttons render and dispatch NOTHING. Add a case to ' +
            'AnnotationRailPanel._dispatchTool — this is a WIRE, not a build.',
        ).toEqual([]);
    });

    // ── ARM B — dispatched ⊆ declared. ───────────────────────────────────────
    it('ARM B: every dispatch case is a declared palette id (no dead wiring)', () => {
        const phantom = [...cases].filter((id) => !declared.has(id)).sort();
        expect(
            phantom,
            'Nothing can reach these cases — dead wiring that LOOKS like coverage.',
        ).toEqual([]);
    });

    // ── ARM C — every named activator exists on ToolManager. ─────────────────
    it('ARM C: every toolManager.activateX() named by the panel exists', () => {
        const missing = [...activators].filter((n) => !methods.has(n)).sort();
        expect(
            missing,
            'The panel calls a ToolManager method that does not exist. This is the ' +
            'exact shape of L-4601: the click reports success and arms nothing.',
        ).toEqual([]);
    });

    // ── Exemptions must stay TRUE. A stale exemption is itself a lie. ────────
    it('the two non-ToolManager entries are still non-ToolManager entries', () => {
        for (const id of Object.keys(NON_TOOLMANAGER_ENTRIES)) {
            expect(declared.has(id), `${id} is no longer a declared palette id`).toBe(true);
            expect(cases.has(id), `${id} lost its dispatch case`).toBe(true);
        }
        // 17 of 19 route through ToolManager; the two above do not.
        expect(declared.size - Object.keys(NON_TOOLMANAGER_ENTRIES).length).toBe(17);
    });
});
