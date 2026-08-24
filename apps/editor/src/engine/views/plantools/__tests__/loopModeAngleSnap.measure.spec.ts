// @vitest-environment happy-dom
//
// §LOOP-MODES-GET-AN-UNASKED-15-DEGREE-LOCK — a MEASUREMENT of a LIVE DEFECT.
//
// ⛔⛔ THIS SPEC IS GREEN ON A BEHAVIOUR THAT IS WRONG. Do not read a passing run as
// "correct". It pins TODAY's numbers so the defect is reproducible and so the fix,
// when it is ruled on, has a before column. ⛔ When the defect is fixed, these
// assertions MUST be inverted — they are not a contract.
//
// ── HOW IT WAS FOUND ─────────────────────────────────────────────────────────
//
// L-10764 asked a reachability question: `WallPlanToolHandler._snapAngle` (the
// configurable degree-step lock, default 15°) still ROTATES after
// §RULING-ORTHO-IS-THE-PERPENDICULAR-FOOT, so it now disagrees with ortho. The
// instruction was "reachability comes before geometry": if nothing can reach
// `_snapAngle`, the divergence is theoretical and needs no decision.
//
// ⭐ IT IS REACHABLE, AND NOT BY AN EDGE CASE. `_resolveConstrainedPoint` routes to the
// angle-step branch on `mode !== 'linear' && mode !== 'curved' && mode !== 'byslab'`,
// and it is called at `onClick` BEFORE the closed-loop dispatch (`_wallLoopMode(mode)`
// is read on the NEXT line). So all three shipped loop modes — RECTANGULAR, CIRCULAR,
// ELLIPTICAL — have their second click silently snapped to a 15° multiple.
//
// ── WHAT THAT COSTS, MEASURED ────────────────────────────────────────────────
//
// The user clicks the opposite corner of a rectangular wall run at (5, 1) — 11.31° off
// +X. `_snapAngle` rotates it to the nearest 15° ray, KEEPING the 5.0990 m radius, so
// the committed corner is (4.9253, 1.3197):
//
//     RECTANGULAR   asked for 5.000 × 1.000 m   committed 4.9253 × 1.3197 m
//                   → 75 mm short in X, 320 mm long in Z, silently
//     CIRCULAR      asked for r = 5.0990 m      committed r = 5.0990 m   (unharmed)
//
// ⭐ THE IRONY IS EXACTLY THE ROTATION PROPERTY THE FOUNDER JUST RULED AGAINST.
// Rotation preserves the RADIAL DISTANCE, and a circle defined by centre + rim point
// depends on nothing else — so the circle survives untouched while the rectangle, which
// depends on BOTH components, is deformed. The same property is harmless in one mode
// and a silent geometry error in the next.
//
// ── ⛔ NOT FIXED HERE, AND WHY ───────────────────────────────────────────────
//
// The founder ruled on ORTHO. `_snapAngle` is a different function on a different
// branch with its own history, and "what should constrain a rectangular loop's second
// corner — nothing, ortho, or a degree step?" is a founder-facing question about
// spatial behaviour. His standing rule is ASK, never auto-edit. Extending a ruling past
// what was ruled is how a second undocumented rival rule gets minted, which is the
// whole shape of L-10760.
//
// The call site's own comment says the intent was SNAP support — "The anchor still
// resolves through the shared constraint chain, so a drum can be snapped onto existing
// geometry" — not an angle lock. That reads as an unintended side effect, but reading
// intent is not the same as being told, so it goes to him with the numbers.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@pryzm/schemas', async importOriginal => ({
    ...(await importOriginal<Record<string, unknown>>()),
    createId: (p: string) => `${p}_LOOPANGLE`,
}));
vi.mock('@pryzm/snapping', () => ({ computeWallAlignmentInference: () => null }));

import { WallPlanToolHandler } from '../WallPlanToolHandler';
import type { WorldPoint } from '../PlanToolHandler';

interface Dispatched { readonly baseLine: ReadonlyArray<{ x: number; z: number }>; }

/** Drive the REAL handler through a two-click closed-loop run in `mode`. */
function loopRun(mode: string, second: WorldPoint): Dispatched[] {
    const w = window as unknown as Record<string, unknown>;
    const seen: Dispatched[] = [];
    w.runtime = {
        bus: {
            executeCommand: (n: string, p: Dispatched) => {
                if (n === 'wall.create') seen.push(p);
                return Promise.resolve();
            },
        },
    };
    w.wallModePicker = { getActiveMode: () => mode, getAngleStep: () => 15 };
    w.__pryzmPlanWallAlignInference = false;
    w.wallStore = { getAll: () => [] };

    const h = new WallPlanToolHandler();
    const a = h as unknown as Record<string, unknown>;
    a._ctx = { viewDef: { spatial: { levelId: 'L0' } } };
    a._dimInput = { isActive: false, getLengthMeters: () => null, reset() {}, dispose() {} };
    a._drawWallPreview = () => {};
    a._drawSetOutPreviewOnly = () => {};
    a._syncCreationHud = () => {};
    a._clearOverlay = () => {};

    h.onClick({ worldX: 0, worldZ: 0 });
    h.onClick(second);
    return seen;
}

const span = (runs: Dispatched[], axis: 'x' | 'z') => {
    const vs = runs.flatMap(r => r.baseLine.map(p => p[axis]));
    return Math.max(...vs) - Math.min(...vs);
};

describe('§LOOP-MODES-GET-AN-UNASKED-15-DEGREE-LOCK — measured, NOT endorsed', () => {
    it('RECTANGULAR: the committed run is NOT the rectangle the user clicked', () => {
        const runs = loopRun('rectangular', { worldX: 5, worldZ: 1 });
        const spanX = span(runs, 'x');
        const spanZ = span(runs, 'z');
        console.log(
            '[ORTHO42 LOOP] rectangular: asked 5.0000 x 1.0000 m, committed %s x %s m ' +
            '(%s mm short in X, %s mm long in Z) across %d walls',
            spanX.toFixed(4), spanZ.toFixed(4),
            ((5 - spanX) * 1000).toFixed(0), ((spanZ - 1) * 1000).toFixed(0), runs.length,
        );
        expect(runs.length).toBe(4);
        // ⛔ THE DEFECT, PINNED. The user clicked (5, 1); 11.31° rotates to the 15° ray
        // keeping the 5.0990 m radius → (4.9253, 1.3197).
        expect(spanX).toBeCloseTo(4.9253, 3);
        expect(spanZ).toBeCloseTo(1.3197, 3);
        // …and the error is far outside anything a user would call a snap.
        expect(Math.abs(spanZ - 1) * 1000).toBeGreaterThan(300);
    });

    it('CIRCULAR: unharmed — rotation preserves the radius, which is all a circle needs', () => {
        const runs = loopRun('circular', { worldX: 5, worldZ: 1 });
        const maxX = Math.max(...runs.flatMap(r => r.baseLine.map(p => p.x)));
        console.log('[ORTHO42 LOOP] circular: r asked %s m, committed %s m across %d walls',
            Math.hypot(5, 1).toFixed(4), maxX.toFixed(4), runs.length);
        // The same rotation that deforms the rectangle leaves the circle exact.
        expect(maxX).toBeCloseTo(Math.hypot(5, 1), 9);
    });

    it('CONTROL: the FIRST click is unconstrained — only the second is snapped', () => {
        // `_resolveConstrainedPoint` returns early when there is no anchor yet, so the
        // origin is placed exactly where the user clicked. The defect is entirely in
        // the second click, which is the one that defines the shape.
        const runs = loopRun('rectangular', { worldX: 5, worldZ: 1 });
        const xs = runs.flatMap(r => r.baseLine.map(p => p.x));
        const zs = runs.flatMap(r => r.baseLine.map(p => p.z));
        expect(Math.min(...xs)).toBeCloseTo(0, 9);
        expect(Math.min(...zs)).toBeCloseTo(0, 9);
    });
});
