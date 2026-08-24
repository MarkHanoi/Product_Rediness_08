/**
 * §FIX-ORTHO-CANNOT-FALL-BACK-TO-LINEAR — ORTHO, measured in DEGREES OFF AXIS.
 *
 * FOUNDER REPORT (production, 2026-08-24), verbatim:
 *
 *   "if the wall MODE: is ORTHO — it can not -not draw ortho — it can not fall back
 *    to linear — okay? check and fix it!"
 *
 * He drew with ORTHO armed and got visibly diagonal walls: a long diagonal along the
 * bottom-left of the plate and several angled segments.
 *
 * ── WHY THIS ASSERTS AN ANGLE AND NOT A BOOLEAN ──────────────────────────────
 *
 * "ortho was applied" is satisfied by a wall 0.22° off axis and by a wall 45° off
 * axis alike. The founder's complaint is about the SIZE of the departure, so the
 * measure is the segment's departure from the NEAREST cardinal axis in degrees, in
 * [0, 45]. Ortho holding means 0; the defect measures 45.000 on the fixture below.
 *
 * ── WHAT WAS MEASURED, AND WHAT IT RULES OUT ────────────────────────────────
 *
 * The founder's console log shows `[WallTool] …`, never `[WallPlanToolHandler]`, so
 * the 3-D tool drew these — a different implementation from the plan handler. It
 * contains NO `§FIX-ORTHO-YIELDS-TO-OBJECT-SNAP` line, which that branch emits at
 * commit whenever it drops ortho, so L-935's snap-yield never fired and is NOT this
 * defect. It DOES contain `WallTool deactivated` right after the create — and the
 * tool only deactivates after one segment in a NON-polyline mode.
 *
 * Both facts fall out of one cause. The rail arms the tool with a mode STRING:
 *
 *   CreateRailPanel  → wallToolbarContribution.activate(runtime)
 *                    → runtime.tools.activate('wall', 'polyline_ortho')   ← lower-case
 *   ToolsAreaLayout:177 → service.activateWallTool(m as WallDrawingMode)
 *                    → ToolManager.activateWall → WallTool.activate(mode)
 *                    → this.drawingMode = mode
 *
 * `WallDrawingMode.POLYLINE_ORTHO === 'POLYLINE_ORTHO'` — UPPER-case — and `as` is a
 * CAST: it asserts a type, it converts nothing and checks nothing. So `drawingMode`
 * held `'polyline_ortho'`, which equalled no branch anywhere in `WallTool`:
 * `_applyOrthoLock`'s ortho predicate was FALSE (free angle) and the `isPolyline`
 * list was FALSE (one segment, then deactivate). ⭐ The failure and a legitimate
 * value were THE SAME VALUE — C01 §6 rule 6.
 *
 * ARM A drives the REAL `WallTool._applyOrthoLock` with the REAL string the REAL
 * production contribution passes, and measures the angle. It is RED on the pre-fix
 * head at 45.000°.
 */

import { describe, it, expect, vi } from 'vitest';
import { WallTool, WallDrawingMode } from '@pryzm/geometry-wall';
// The production contribution ITSELF, not a copy of its string. apps/editor is L7 and
// plugins/wall is L6, so this edge points DOWNWARD. The file imports nothing.
import { wallToolbarContribution } from '../../../plugins/wall/src/contributions';

/** A point 45° off both axes — the maximum possible departure, so the defect is loud. */
const START = { x: 0, y: 0, z: 0 };
const CURSOR_45 = { x: 4, y: 0, z: 4 };

/** Departure from the nearest cardinal axis, in degrees, in [0, 45]. Computed inline
 *  (not imported) so this file measures the same quantity on either side of the fix. */
function offAxisDeg(a: { x: number; z: number }, b: { x: number; z: number }): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (dx === 0 && dz === 0) return 0;
    const deg = Math.atan2(dz, dx) * (180 / Math.PI);
    return Math.abs(deg - Math.round(deg / 90) * 90);
}

/**
 * Drive the REAL private ortho lock of the REAL class with `mode` in `drawingMode` —
 * exactly what `activate()` stores. `Object.create` skips the constructor (which wants
 * a whole OBC world); `_applyOrthoLock` touches only `drawingMode`, `isOrthoOverride`
 * and `startPoint`, all set here. It reads `.x/.y/.z` off its argument, so a plain
 * object stands in for a THREE.Vector3 and this file needs no THREE import (P2).
 */
function lockedEnd(mode: string): { x: number; z: number } {
    const tool = Object.create(WallTool.prototype) as Record<string, unknown> & {
        _applyOrthoLock(p: unknown): { x: number; z: number };
    };
    tool.drawingMode = mode;
    tool.isOrthoOverride = false;
    tool.startPoint = { ...START };
    const out = tool._applyOrthoLock({ ...CURSOR_45 });
    return { x: out.x, z: out.z };
}

/** The mode string the production Wall-button contribution actually passes. */
function contributionMode(): string {
    const seen: Array<string | undefined> = [];
    wallToolbarContribution.activate({
        tools: { activate: (_family: string, mode?: string) => { seen.push(mode); } },
    });
    expect(seen).toHaveLength(1);
    return String(seen[0]);
}

describe('§FIX-ORTHO-CANNOT-FALL-BACK-TO-LINEAR — the 3-D wall tool', () => {
    // ── ARM A — THE FOUNDER'S PATH, END TO END, IN DEGREES ───────────────────
    it('ARM A: the mode the Wall button passes locks the segment to 0.000° off axis', () => {
        const mode = contributionMode();
        const end = lockedEnd(mode);
        const deg = offAxisDeg(START, end);

        console.log(
            '[ORTHO42 ARM A] contribution mode=%s  cursor=(%s, %s)  committed=(%s, %s)  offAxis=%s°',
            JSON.stringify(mode), CURSOR_45.x, CURSOR_45.z,
            end.x.toFixed(6), end.z.toFixed(6), deg.toFixed(3),
        );

        // PRE-FIX: 45.000° — the lock was inert because 'polyline_ortho' matched no
        // `=== WallDrawingMode.*`. This is the founder's diagonal, in one number.
        expect(deg).toBeLessThan(1e-9);
        // …and the lock kept the cursor's distance on the axis it chose, so ortho is
        // still a PROJECTION and not a snap-to-nothing.
        expect(Math.hypot(end.x - START.x, end.z - START.z)).toBeCloseTo(4, 12);
    });

    // ── ARM B — THE OTHER SPELLINGS OF THE SAME WORD ─────────────────────────
    it('ARM B: every spelling of ORTHO the app uses reaches 0.000° off axis', () => {
        // Left column: the literal strings that exist at real call sites and in the
        // UI vocabulary — the enum members, the picker's word, the HUD's word, and
        // the lower-case form the rail shipped. Every one of them NAMES ortho, so
        // every one of them must constrain. That is the founder's rule.
        const spellings = [
            WallDrawingMode.POLYLINE_ORTHO,
            WallDrawingMode.LINE_ORTHO,
            'polyline_ortho',      // ← what the rail passed; the defect
            'polyline-ortho',
            'ortho',               // ← WallPickerMode, read by the plan handler
            'Orthogonal',          // ← the HUD's label
        ];
        const report: string[] = [];
        for (const s of spellings) {
            const deg = offAxisDeg(START, lockedEnd(s));
            report.push(`${JSON.stringify(s)} → ${deg.toFixed(3)}°`);
        }
        console.log('[ORTHO42 ARM B] ' + report.join('  ·  '));
        for (const s of spellings) {
            expect(offAxisDeg(START, lockedEnd(s)), `mode ${JSON.stringify(s)}`).toBeLessThan(1e-9);
        }
    });

    // ── ARM C — THE OTHER DIRECTION: no invented constraints ─────────────────
    it('ARM C: a mode that does NOT name ortho is left free — 45.000° stands', () => {
        // The fix must not "solve" the report by locking everything to an axis. A
        // linear mode, and a genuinely unknown string, both keep the raw angle.
        for (const s of [WallDrawingMode.POLYLINE, WallDrawingMode.SINGLE, 'nonsense-mode']) {
            const deg = offAxisDeg(START, lockedEnd(s));
            console.log('[ORTHO42 ARM C] %s → %s°', JSON.stringify(s), deg.toFixed(3));
            expect(deg, `mode ${JSON.stringify(s)}`).toBeCloseTo(45, 9);
        }
    });

    // ── ARM D — THE SILENT DEFAULT, KILLED ───────────────────────────────────
    it('ARM D: an unrecognised mode is REPORTED by name, not silently taken as free-angle', async () => {
        // "I could not read the mode" and "the user chose free-angle" are opposite
        // facts and must not be the same value. The behaviour is unchanged (free
        // angle — inventing a constraint would be the same lie inverted); what
        // changes is that it SAYS SO, naming the value and the accepted set.
        const { resolveWallDrawingMode } = await import('@pryzm/geometry-wall');
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const bad = resolveWallDrawingMode('polyline_ortho_typo', 'ORTHO42 test');
            expect(bad.recognised).toBe(false);
            expect(spy).toHaveBeenCalledTimes(1);
            const line = String(spy.mock.calls[0]?.[0] ?? '');
            expect(line).toContain('polyline_ortho_typo');   // the value that failed
            expect(line).toContain('ORTHO42 test');          // the surface that armed it
            expect(line).toContain('POLYLINE_ORTHO');        // what to pass instead

            // …and a mode it CAN resolve stays silent.
            spy.mockClear();
            const good = resolveWallDrawingMode('polyline_ortho', 'ORTHO42 test');
            expect(good.recognised).toBe(true);
            expect(good.mode).toBe(WallDrawingMode.POLYLINE_ORTHO);
            expect(spy).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
    });
});
