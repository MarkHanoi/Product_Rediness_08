// @vitest-environment happy-dom
//
// §RULING-ORTHO-IS-A-MODE-NOT-AN-AID + §FIX-ORTHO-CANNOT-FALL-BACK-TO-LINEAR
// — the plan surface, measured in DEGREES OFF THE NEAREST CARDINAL AXIS.
//
// ── THE FOUNDER, TWICE, 2026-08-24 ───────────────────────────────────────────
//
//   (1) "if the wall MODE: is ORTHO — it can not -not draw ortho — it can not fall
//        back to linear — okay? check and fix it!"
//
//   (2) shown this tool's own chip live —
//        "ortho off · snap wins · 1.9° off axis (ortho would miss 494 mm)" —
//       "why this ortho off snap wins is even available? i dont want that:
//        if ortho is in place - ortho is what need - no other cases"
//
// ⭐ WHY EVERY ASSERTION HERE IS AN ANGLE. His own chip says **1.9°**. A boolean
// ("ortho was applied") passes at 1.9° and at 45° alike, so a boolean cannot state
// this rule at all. The measure is departure from the nearest cardinal axis, in
// degrees, in [0, 45] — 0 means the rule held.
//
// ── THE TWO ARMS, AND WHAT EACH ONE IS RED AGAINST ──────────────────────────
//
// ARM 1 — THE RULING. Reproduces his chip's own numbers (a strong snap 1.9° off
//   axis, 14.9 m out, which is exactly the geometry that makes ortho "miss 494 mm")
//   and asserts the COMMITTED segment is axis-aligned. RED against 2026-08-24 HEAD
//   at 1.900°, because `_resolveConstrainedPoint` yielded ortho to the snap (L-935).
//
// ARM 2 — THE SILENT DEFAULT. `_getMode()` ended `?? 'linear'`. That turned three
//   different facts into one value: "the user picked linear", "window.wallModePicker
//   is absent", and "the picker exposes no getActiveMode". The last two are WIRING
//   FAILURES, and `'linear'` is the LEAST-CONSTRAINED mode — so failing to read the
//   mode silently produced a free-angle wall while the UI still showed ORTHO. This
//   arm arms ORTHO, draws (proving the mode was read), then removes the source and
//   draws again. RED against HEAD at 45.000°; GREEN at 0.000°, because an armed
//   ORTHO survives a frame where its source is unreachable — which is the founder's
//   sentence, literally. C01 §6 rule 6: ABSENT and a legitimate value are not the
//   same value, and the absence is reported by name.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@pryzm/schemas', async importOriginal => ({
    ...(await importOriginal<Record<string, unknown>>()),
    createId: (p: string) => `${p}_ORTHO42`,
}));
// Alignment inference is linear-mode only. Stubbed so ARM 2's post-absence draw
// measures the MODE decision and nothing else — otherwise a soft inference could
// mask or mimic the very axis-alignment under test.
vi.mock('@pryzm/snapping', () => ({ computeWallAlignmentInference: () => null }));

import { WallPlanToolHandler } from '../WallPlanToolHandler';
import type { WorldPoint } from '../PlanToolHandler';

const DEG = Math.PI / 180;

/** The founder's chip, reconstructed: a 1.9° departure at 14.9 m makes ortho miss 494 mm. */
const SNAP_OFF_AXIS_DEG = 1.9;
const SNAP_DIST_M = 14.9;

const SEG_START: WorldPoint = { worldX: 0, worldZ: 0 };

/** Departure from the nearest cardinal axis, in degrees, in [0, 45]. */
function offAxisDeg(a: { x: number; z: number }, b: { x: number; z: number }): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (dx === 0 && dz === 0) return 0;
    const deg = Math.atan2(dz, dx) / DEG;
    return Math.abs(deg - Math.round(deg / 90) * 90);
}

interface Dispatched {
    readonly baseLine: ReadonlyArray<{ x: number; y: number; z: number }>;
}

/** Install the globals the handler reads. `mode: null` ⇒ NO mode source at all. */
function installWorld(mode: string | null): Dispatched[] {
    const dispatched: Dispatched[] = [];
    const w = window as unknown as Record<string, unknown>;
    w.runtime = {
        bus: {
            executeCommand: (name: string, payload: Dispatched) => {
                if (name === 'wall.create') dispatched.push(payload);
                return Promise.resolve();
            },
        },
    };
    if (mode === null) delete w.wallModePicker;
    else w.wallModePicker = { getActiveMode: () => mode, getAngleStep: () => 15 };
    w.__pryzmPlanWallAlignInference = false;
    w.wallStore = { getAll: () => [] };
    return dispatched;
}

/**
 * A fresh handler with the canvas-bound draw calls stubbed — the geometry decision is
 * the subject, not the painting. Returned so a test can DRIVE ONE HANDLER ACROSS TWO
 * STROKES, which is what ARM 2 needs: the mode memory is deliberately an INSTANCE field
 * (module `let` would survive a project switch — C13 / `check:isolation`), so "ORTHO is
 * still armed when the source goes dark" is a fact about one drawing session.
 */
function makeHandler(): WallPlanToolHandler {
    const h = new WallPlanToolHandler();
    const anyH = h as unknown as Record<string, unknown>;
    anyH._ctx = { viewDef: { spatial: { levelId: 'L0' } } };
    anyH._dimInput = { isActive: false, getLengthMeters: () => null, reset() {}, dispose() {} };
    anyH._drawWallPreview = () => {};
    anyH._drawSetOutPreviewOnly = () => {};
    anyH._syncCreationHud = () => {};
    anyH._clearOverlay = () => {};
    return h;
}

/** Drive the REAL handler through one two-click segment and return what it dispatched. */
function drawSegment(
    mode: string | null,
    end: WorldPoint,
    handler?: WallPlanToolHandler,
): { end: { x: number; z: number }; handler: WallPlanToolHandler } {
    const dispatched = installWorld(mode);
    const h = handler ?? makeHandler();
    // A reused handler is mid-polyline (its previous endpoint is the new start); reset
    // the anchor so every stroke here is measured from the same origin.
    (h as unknown as Record<string, unknown>)._wallFirstPoint = null;

    h.onClick(SEG_START);
    h.onMouseMove(end);
    h.onClick(end);

    expect(dispatched).toHaveLength(1);
    const p = dispatched[0]!.baseLine[1]!;
    return { end: { x: p.x, z: p.z }, handler: h };
}

describe('§RULING-ORTHO-IS-A-MODE-NOT-AN-AID — the plan wall tool', () => {
    beforeEach(() => { vi.restoreAllMocks(); });

    // ── ARM 1 — THE RULING, at the founder's own numbers ─────────────────────
    it('ARM 1: with ORTHO armed, a 1.9°-off-axis strong snap commits at 0.000° off axis', () => {
        const snapped: WorldPoint = {
            worldX: SNAP_DIST_M * Math.cos(-SNAP_OFF_AXIS_DEG * DEG),
            worldZ: SNAP_DIST_M * Math.sin(-SNAP_OFF_AXIS_DEG * DEG),
            snapType: 'midpoint',
        };
        const { end } = drawSegment('ortho', snapped);
        const deg = offAxisDeg({ x: 0, z: 0 }, end);
        const missMm = Math.hypot(end.x - snapped.worldX, end.z - snapped.worldZ) * 1000;

        console.log(
            '[ORTHO42 RULING ARM 1] snap=(%s, %s) @ %s° · committed=(%s, %s) · offAxis=%s° · snap miss=%s mm',
            snapped.worldX.toFixed(4), snapped.worldZ.toFixed(4), SNAP_OFF_AXIS_DEG,
            end.x.toFixed(6), end.z.toFixed(6), deg.toFixed(3), missMm.toFixed(0),
        );

        // PRE-RULING: 1.900° — the exact number on his chip. "No other cases."
        expect(deg).toBeLessThan(1e-9);
        // The snap was PROJECTED, not discarded. ⛔ AMENDED by the SECOND ruling
        // (§RULING-ORTHO-IS-THE-PERPENDICULAR-FOOT, same day): this asserted the full
        // reach `SNAP_DIST_M` survived, because `_snapOrtho` then ROTATED the snap onto
        // the ray keeping its distance. It now takes the perpendicular FOOT, so the
        // surviving length is the axial component, 14.9 · cos(1.9°) = 14.891808 m.
        expect(Math.hypot(end.x, end.z)).toBeCloseTo(SNAP_DIST_M * Math.cos(SNAP_OFF_AXIS_DEG * DEG), 9);
        // …and the cost is his chip's other number, disclosed rather than silent. It is
        // UNCHANGED by the second ruling at this angle: 494 mm.
        expect(missMm).toBeCloseTo(494, 0);
    });

    // ── ARM 2 — THE SILENT DEFAULT, killed, measured ─────────────────────────
    it('ARM 2: ORTHO survives an unreadable mode source — 0.000°, not 45.000°, and it says so', () => {
        // The cursor is at 45° to both axes: the loudest possible departure, so the
        // difference between "held" and "fell back to linear" cannot be a rounding story.
        const cursor: WorldPoint = { worldX: 4, worldZ: 4 };

        // (a) Source present, ORTHO armed. This both proves the arm works and is the
        //     read that the handler's mode memory records.
        const armed = drawSegment('ortho', cursor);
        const armedDeg = offAxisDeg({ x: 0, z: 0 }, armed.end);
        expect(armedDeg).toBeLessThan(1e-9);

        // (b) The source becomes unreadable MID-SESSION — the CW-1 (2026-04) failure this
        //     global already has a history of (`CurtainWallPlanToolHandler.ts:14,28`).
        //     SAME handler: this is one drawing session losing its mode source, which is
        //     the real scenario and the scope the memory deliberately lives at.
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const orphaned = drawSegment(null, cursor, armed.handler);
        const orphanedDeg = offAxisDeg({ x: 0, z: 0 }, orphaned.end);

        console.log(
            '[ORTHO42 RULING ARM 2] armed offAxis=%s° · source-absent offAxis=%s° · committed=(%s, %s)',
            armedDeg.toFixed(3), orphanedDeg.toFixed(3),
            orphaned.end.x.toFixed(6), orphaned.end.z.toFixed(6),
        );

        // PRE-FIX: 45.000° — `?? 'linear'` turned "cannot read the mode" into
        // "the user chose free-angle" and drew the founder's diagonal.
        expect(orphanedDeg).toBeLessThan(1e-9);

        // AND IT SAID SO. The absence is a wiring failure and is named as one — it is
        // not allowed to look like a user choice, whatever it then does.
        expect(spy).toHaveBeenCalled();
        const line = spy.mock.calls.map(c => String(c[0] ?? '')).join('\n');
        expect(line).toContain('UNREADABLE');
        expect(line).toContain('ABSENT');
        spy.mockRestore();
    });

    // ── ARM 3 — the other direction: ortho is not applied where it was not asked ──
    it('ARM 3: LINEAR still draws free-angle — 45.000° stands', () => {
        const { end } = drawSegment('linear', { worldX: 4, worldZ: 4 });
        const deg = offAxisDeg({ x: 0, z: 0 }, end);
        console.log('[ORTHO42 RULING ARM 3] linear offAxis=%s°', deg.toFixed(3));
        // The fix must not "solve" the report by constraining everything.
        expect(deg).toBeCloseTo(45, 9);
    });
});
