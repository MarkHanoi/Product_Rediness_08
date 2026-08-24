// @vitest-environment happy-dom
//
// §FIX-ORTHO-CANNOT-FALL-BACK-TO-LINEAR — ONE "ORTHO" SWITCH, TWO PANES, ONE ANGLE.
//
// FOUNDER (production, 2026-08-24): "if the wall MODE: is ORTHO — it can not -not draw
// ortho — it can not fall back to linear — okay? check and fix it!"
//
// ── THE THIRD PLACE ORTHO COULD BECOME FREE-ANGLE ────────────────────────────
//
// One user-facing switch drives two tools that do not share a mode type: the 3-D
// `WallTool` reads the `WallDrawingMode` ENUM, the plan `WallPlanToolHandler` reads a
// `WallPickerMode` STRING off `window.wallModePicker`. `ToolsAreaLayout`'s
// `activateWallTool` wrapper is the ONE bridge between them, and it was:
//
//     if (m === WallDrawingMode.POLYLINE_ORTHO) return 'ortho';
//     if (m === WallDrawingMode.POLYLINE_ARC)   return 'curved';
//     return 'linear';                            // ← everything else, silently
//
// `LINE_ORTHO` is a REAL ortho mode — `WallTool._applyOrthoLock` honours it by name —
// and it landed on that bare fall-through. One click therefore armed ORTHO in the 3-D
// pane and FREE-ANGLE in the plan pane, with no diagnostic either way.
//
// ── WHAT IS MEASURED, AND HONESTLY WHAT IS NOT ──────────────────────────────
//
// ARM 1 is the DEFECT, EXECUTABLE. The pre-fix mapper is reproduced verbatim below,
// fed through the REAL plan handler, and the committed segment's departure from the
// nearest cardinal axis is measured: 45.000°. ARM 2 runs the SAME fixture through the
// SHIPPED mapper: 0.000°.
//
// ⚠ STATED PLAINLY: this file cannot be red-on-HEAD the way the other two ORTHO42
// specs are, because the mapper it fixes was a PRIVATE CLOSURE inside a 1200-line
// layout function with no seam to import. ARM 1 is a faithful transcription of that
// closure, not a call into it — the transcription is the weak link, and it is three
// lines quoted directly above. What ARM 1 does establish beyond transcription is that
// the picker string 'linear' really does produce a 45.000° wall in the REAL handler,
// which is the half that actually matters.
//
// ⚠ ALSO STATED PLAINLY: TWO VOCABULARIES FOR ONE CONCEPT IS STILL OPEN DEBT. This
// spec pins the bridge; it does not remove the need for one. See the module header.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@pryzm/schemas', async importOriginal => ({
    ...(await importOriginal<Record<string, unknown>>()),
    createId: (p: string) => `${p}_ORTHO42BRIDGE`,
}));
vi.mock('@pryzm/snapping', () => ({ computeWallAlignmentInference: () => null }));

import { WallPlanToolHandler } from '../WallPlanToolHandler';
import type { WorldPoint } from '../PlanToolHandler';
import { WallDrawingMode } from '@pryzm/geometry-wall';
import { wallPickerModeFromDrawingMode } from '@app/ui/layout/wallPickerModeFromDrawingMode';
import { resolveWallDrawingMode } from '@pryzm/geometry-wall';

const SEG_START: WorldPoint = { worldX: 0, worldZ: 0 };
/** 45° to both axes — the loudest possible departure, so nothing is a rounding story. */
const CURSOR: WorldPoint = { worldX: 4, worldZ: 4 };
const DEG = Math.PI / 180;

/**
 * THE PRE-FIX BRIDGE, transcribed verbatim from `ToolsAreaLayout._drawingModeToPickerMode`
 * as it stood on 2026-08-24. Kept executable so the defect is a measurement in this
 * file, not a claim about a file that no longer says it.
 */
function preFixDrawingModeToPickerMode(m: WallDrawingMode): string {
    if (m === WallDrawingMode.POLYLINE_ORTHO) return 'ortho';
    if (m === WallDrawingMode.POLYLINE_ARC)   return 'curved';
    return 'linear';
}

function offAxisDeg(a: { x: number; z: number }, b: { x: number; z: number }): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (dx === 0 && dz === 0) return 0;
    const deg = Math.atan2(dz, dx) / DEG;
    return Math.abs(deg - Math.round(deg / 90) * 90);
}

/** Arm the plan surface with `pickerMode`, draw one segment, return its off-axis angle. */
function planSegmentOffAxisDeg(pickerMode: string): number {
    const dispatched: Array<{ baseLine: ReadonlyArray<{ x: number; z: number }> }> = [];
    const w = window as unknown as Record<string, unknown>;
    w.runtime = {
        bus: {
            executeCommand: (name: string, payload: { baseLine: ReadonlyArray<{ x: number; z: number }> }) => {
                if (name === 'wall.create') dispatched.push(payload);
                return Promise.resolve();
            },
        },
    };
    w.wallModePicker = { getActiveMode: () => pickerMode, getAngleStep: () => 15 };
    w.__pryzmPlanWallAlignInference = false;
    w.wallStore = { getAll: () => [] };

    const h = new WallPlanToolHandler();
    const anyH = h as unknown as Record<string, unknown>;
    anyH._ctx = { viewDef: { spatial: { levelId: 'L0' } } };
    anyH._dimInput = { isActive: false, getLengthMeters: () => null, reset() {}, dispose() {} };
    anyH._drawWallPreview = () => {};
    anyH._drawSetOutPreviewOnly = () => {};
    anyH._syncCreationHud = () => {};
    anyH._clearOverlay = () => {};

    h.onClick(SEG_START);
    h.onMouseMove(CURSOR);
    h.onClick(CURSOR);

    expect(dispatched).toHaveLength(1);
    const end = dispatched[0]!.baseLine[1]!;
    return offAxisDeg({ x: 0, z: 0 }, end);
}

describe('§FIX-ORTHO-CANNOT-FALL-BACK-TO-LINEAR — the plan/3-D mode bridge', () => {
    // ── ARM 1 — THE DEFECT, EXECUTABLE ───────────────────────────────────────
    it('ARM 1: the PRE-FIX bridge turned LINE_ORTHO into a 45.000° plan wall', () => {
        const picker = preFixDrawingModeToPickerMode(WallDrawingMode.LINE_ORTHO);
        const deg = planSegmentOffAxisDeg(picker);
        console.log('[ORTHO42 BRIDGE ARM 1] pre-fix LINE_ORTHO → %s → offAxis=%s°', picker, deg.toFixed(3));
        // The bare `return 'linear'` swallowed a real ortho mode. This is the founder's
        // sentence failing at the bridge rather than at the tool.
        expect(picker).toBe('linear');
        expect(deg).toBeCloseTo(45, 9);
    });

    // ── ARM 2 — THE SHIPPED BRIDGE ───────────────────────────────────────────
    it('ARM 2: the shipped bridge sends BOTH ortho modes to a 0.000° plan wall', () => {
        for (const m of [WallDrawingMode.LINE_ORTHO, WallDrawingMode.POLYLINE_ORTHO]) {
            const picker = wallPickerModeFromDrawingMode(m);
            const deg = planSegmentOffAxisDeg(picker);
            console.log('[ORTHO42 BRIDGE ARM 2] %s → %s → offAxis=%s°', m, picker, deg.toFixed(3));
            expect(picker, `picker mode for ${m}`).toBe('ortho');
            expect(deg, `off-axis for ${m}`).toBeLessThan(1e-9);
        }
    });

    // ── ARM 3 — the lower-case string the rail shipped, through the bridge ───
    it('ARM 3: the rail\'s old "polyline_ortho" string also reaches ORTHO, at 0.000°', () => {
        // The bridge takes `unknown` deliberately: its input arrives through
        // `runtime.tools.activate(family, mode?: string)` and `(m as WallDrawingMode)`,
        // a CAST that asserts and does not check. That is how this string got in.
        const picker = wallPickerModeFromDrawingMode('polyline_ortho');
        const deg = planSegmentOffAxisDeg(picker);
        console.log('[ORTHO42 BRIDGE ARM 3] "polyline_ortho" → %s → offAxis=%s°', picker, deg.toFixed(3));
        expect(picker).toBe('ortho');
        expect(deg).toBeLessThan(1e-9);
    });

    // ── ARM 4 — exhaustiveness, and the fall-through named ───────────────────
    it('ARM 4: every WallDrawingMode maps, and an unrecognised one is REPORTED not guessed', () => {
        const rows: string[] = [];
        for (const m of Object.values(WallDrawingMode)) {
            const picker = wallPickerModeFromDrawingMode(m);
            expect(picker, `no picker mode for ${m}`).toBeTruthy();
            rows.push(`${m} → ${picker}`);
        }
        console.log('[ORTHO42 BRIDGE ARM 4]\n  ' + rows.join('\n  '));
        // The loop modes used to fall through to 'linear', which is why ToolsAreaLayout
        // had to set the picker BY HAND at each loop call site.
        expect(wallPickerModeFromDrawingMode(WallDrawingMode.RECTANGULAR_LOOP)).toBe('rectangular');
        expect(wallPickerModeFromDrawingMode(WallDrawingMode.CIRCULAR_LOOP)).toBe('circular');
        expect(wallPickerModeFromDrawingMode(WallDrawingMode.ELLIPTICAL_LOOP)).toBe('elliptical');

        // An unknown mode still yields SOMETHING drawable — refusing to arm the tool over
        // a typo would be a worse failure — but it is NAMED, so it is not the silent
        // `return 'linear'` this replaced.
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fallback = wallPickerModeFromDrawingMode('not-a-wall-mode');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(String(spy.mock.calls[0]?.[0] ?? '')).toContain('not-a-wall-mode');
        expect(fallback).toBe('linear');
        spy.mockRestore();
    });

    // ── ARM 5 — THE ROUND-TRIP LAW: ONE VOCABULARY, ENFORCED ────────────
    it('ARM 5: the READER and the WRITER cannot drift — every picker mode round-trips', () => {
        // ⭐ THE COLLAPSE, AS A LAW. Two tables relate the two vocabularies:
        //   READER  `resolveWallDrawingMode` — every spelling → a WallDrawingMode
        //   WRITER  `wallPickerModeFromDrawingMode` — a WallDrawingMode → a picker string
        // Nothing forced them to agree, and "nothing forced two spellings to agree" is
        // the whole of L-10760. This binds them.
        //
        // ⚠ STATED IN THE DIRECTION WHERE IT MUST HOLD, not as a false bijection: the
        // relation is MANY-TO-ONE (SINGLE / POLYLINE / POLYLINE_MIXED / POLYLINE_MIXED_2
        // all mean 'linear'), so enum → picker → enum cannot round-trip and asserting it
        // would be asserting a falsehood. picker → enum → picker is the true law.
        const PICKER_MODES = ['linear', 'ortho', 'curved', 'rectangular', 'circular', 'elliptical'] as const;
        const rows: string[] = [];
        for (const p of PICKER_MODES) {
            const enumMode = resolveWallDrawingMode(p, 'ARM 5 round-trip').mode;
            const back = wallPickerModeFromDrawingMode(enumMode);
            rows.push(`${p} → ${enumMode} → ${back}`);
            expect(back, `round-trip for picker mode '${p}'`).toBe(p);
        }
        console.log('[ORTHO42 BRIDGE ARM 5] ' + rows.join('  ·  '));

        // ⛔ 'byslab' is DELIBERATELY absent from that list and from the resolver's alias
        // table. By Slab is an ACTION — it reads a selected slab and emits a whole run
        // with no pointer gesture — not a drawing mode. Mapping it onto one would arm a
        // rubber-band the user never asked for (C65 §3.9: no affordance without an
        // implementation), so it is REPORTED as unrecognised rather than silently drawn.
        const spy2 = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(resolveWallDrawingMode('byslab', 'ARM 5').recognised).toBe(false);
        expect(spy2).toHaveBeenCalledTimes(1);
        spy2.mockRestore();
    });
});
