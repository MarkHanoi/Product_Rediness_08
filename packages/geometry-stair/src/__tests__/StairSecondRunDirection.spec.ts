/**
 * §STAIR-SECOND-RUN-DIRECTION (L-10270) — the founder's "modify, afterwards, the
 * DIRECTION OF THE SECOND RUN" for L and U stairs.
 *
 * ⭐ THE TEST THAT MATTERS IS §5: the flip must SURVIVE THE REBUILD. A control
 * that flips a flag which `GenerateStairGeometryCommand` then quietly re-derives
 * away is the dead-control shape this repo has now paid for fourteen times this
 * session. So every flip here is pushed back through the SAME two reconcilers the
 * rebuild runs — `deriveStairGeometry` for a uniform stair and
 * `reconcilePathAuthoredStairLayout` for a drawn one — and the derived handedness
 * is re-read afterwards. Asserting the returned object alone would prove nothing.
 *
 * §2 pins the DRIFT that kept this control unpublished: the record's stamped
 * `turnDirection` and the built flight geometry disagree on stairs the shipping
 * plan tool creates, and the panel must follow the geometry.
 */

import { describe, it, expect } from 'vitest';
import {
    stairSecondRunField,
    stairShapeHasSecondRun,
    stairSecondRunEligibility,
    deriveStairSecondRunHandedness,
    stairStampedSecondRunHandedness,
    stairSecondRunStampIsStale,
    mirrorStairSecondRun,
} from '../StairSecondRunDirection';
import {
    deriveStairGeometry,
    reconcilePathAuthoredStairLayout,
    stairHasAuthoredFlightGeometry,
} from '../StairParameterReconciler';
import type { StairData, Vec3 } from '../StairTypes';

const LEVEL_HEIGHT = 3.0;
const WIDTH = 1.2;

function baseStair(over: Partial<StairData> = {}): StairData {
    return {
        id: 'stair-1',
        type: 'stair',
        levelId: 'l0',
        baseLevelId: 'l0',
        topLevelId: 'l1',
        baseOffset: 0,
        topOffset: 0,
        shape: 'L',
        startPosition: { x: 0, y: 0, z: 0 },
        width: WIDTH,
        riserHeight: 0.175,
        treadDepth: 0.28,
        riserCount: 17,
        flights: [{ direction: { x: 0, y: 0, z: 1 }, riserCount: 17 }],
        landings: [],
        properties: {
            riserVisible: true, nosingType: 'standard', nosingDepth: 0.025,
            stringerType: 'none', handrailLeft: true, handrailRight: true, handrailHeight: 1.05,
        },
        parameters: {},
        metadata: { createdAt: 'x', modifiedAt: 'x', version: 0, source: 'user' },
        ...over,
    };
}

/** A UNIFORM stair, built by the engine's own `deriveStairGeometry`. */
function uniform(shape: 'L' | 'U', handed: 'left' | 'right'): StairData {
    const seed = baseStair({
        shape,
        ...(shape === 'L' ? { turnDirection: handed } : { secondRunSide: handed }),
    });
    const d = deriveStairGeometry(seed, LEVEL_HEIGHT);
    expect(d).not.toBeNull();
    return { ...seed, ...d! };
}

/** Re-run the reconciler the geometry rebuild would run, and return the result. */
function rebuild(stair: StairData): StairData {
    if (stairHasAuthoredFlightGeometry(stair)) {
        const layout = reconcilePathAuthoredStairLayout(stair);
        return layout ? { ...stair, ...layout } : stair;
    }
    const d = deriveStairGeometry(stair, LEVEL_HEIGHT);
    return d ? { ...stair, ...d } : stair;
}

/** A DRAWN L stair, as StairSolver2D + StairPathAdapter emit it (per-flight tread + landing centre). */
function drawnL(dir2: Vec3, start2: Vec3, center: Vec3): StairData {
    return baseStair({
        shape: 'L',
        turnDirection: 'left',
        flights: [
            { direction: { x: 0, y: 0, z: 1 }, riserCount: 9, treadDepth: 0.6 },
            { direction: dir2, riserCount: 8, treadDepth: 0.55, startOverride: start2 },
        ],
        landings: [{ depth: WIDTH, center }],
    });
}

/** A DRAWN U stair — anti-parallel runs, run 2 offset laterally. */
function drawnU(side: 'left' | 'right'): StairData {
    const sign = side === 'left' ? 1 : -1;   // perpLeft of (0,0,1) is (-1,0,0)
    return baseStair({
        shape: 'U',
        secondRunSide: side,
        flights: [
            { direction: { x: 0, y: 0, z: 1 }, riserCount: 9, treadDepth: 0.3 },
            {
                direction: { x: 0, y: 0, z: -1 }, riserCount: 8, treadDepth: 0.3,
                startOverride: { x: -1 * sign * WIDTH, y: 0, z: 3.0 },
            },
        ],
        landings: [{ depth: 2 * WIDTH, center: { x: 0, y: 0, z: 3.2 } }],
    });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('§1 — turnDirection and secondRunSide are TWO fields, one per shape', () => {
    it('maps each shape to the field the geometry actually reads', () => {
        expect(stairSecondRunField('L')).toBe('turnDirection');
        expect(stairSecondRunField('U')).toBe('secondRunSide');
    });

    it('gives I / spiral / winder NO second-run field — a straight stair has no second run', () => {
        expect(stairSecondRunField('I')).toBeNull();
        expect(stairSecondRunField('spiral')).toBeNull();
        expect(stairSecondRunField('winder')).toBeNull();
        expect(stairShapeHasSecondRun('I')).toBe(false);
        expect(stairShapeHasSecondRun('L')).toBe(true);
        expect(stairShapeHasSecondRun('U')).toBe(true);
    });
});

describe('§2 — ⭐ THE DRIFT: the stamped field disagrees with the built geometry', () => {
    it('derives the handedness the engine itself constructs, for both shapes and both sides', () => {
        expect(deriveStairSecondRunHandedness(uniform('L', 'left'))).toBe('left');
        expect(deriveStairSecondRunHandedness(uniform('L', 'right'))).toBe('right');
        expect(deriveStairSecondRunHandedness(uniform('U', 'left'))).toBe('left');
        expect(deriveStairSecondRunHandedness(uniform('U', 'right'))).toBe('right');
    });

    it('⛔ reproduces StairPlanToolHandler:209 — it stamps "left" on a stair that turns RIGHT', () => {
        // Verbatim from the shipping handler: flight1Dir = (0,0,1) ⇒ flight2Dir = (1,0,0),
        // and `turnDirection = 'left'` is assigned unconditionally two lines above.
        // The LEFT perpendicular of (0,0,1) is (-1,0,0), so the stamp is wrong.
        const stair = drawnL({ x: 1, y: 0, z: 0 }, { x: 0.6, y: 0, z: 5.4 }, { x: 0, y: 0, z: 5.4 });
        expect(stairStampedSecondRunHandedness(stair)).toBe('left');
        expect(deriveStairSecondRunHandedness(stair)).toBe('right');
        expect(stairSecondRunStampIsStale(stair)).toBe(true);
    });

    it('reports no staleness when stamp and geometry agree, or when either is unreadable', () => {
        expect(stairSecondRunStampIsStale(uniform('L', 'right'))).toBe(false);
        expect(stairSecondRunStampIsStale(baseStair({ shape: 'I' }))).toBe(false);
    });

    it('⛔ returns null — never "left" — when the geometry carries no readable side', () => {
        // A U whose run 2 has no startOverride: the side is genuinely unknown.
        const u = baseStair({
            shape: 'U', secondRunSide: 'left',
            flights: [
                { direction: { x: 0, y: 0, z: 1 }, riserCount: 9 },
                { direction: { x: 0, y: 0, z: -1 }, riserCount: 8 },
            ],
            landings: [{ depth: 2 * WIDTH }],
        });
        expect(deriveStairSecondRunHandedness(u)).toBeNull();
    });
});

describe('§3 — eligibility is the ONE gate, and it refuses by name', () => {
    it('refuses a straight stair without pretending it could turn', () => {
        const v = stairSecondRunEligibility(baseStair({ shape: 'I' }));
        expect(v.ok).toBe(false);
        expect((v as { reason: string }).reason).toMatch(/straight stair has one run/i);
    });

    it('⭐ refuses a CURVED stair — which persists as shape "L" but carries many arc runs', () => {
        const curved = baseStair({
            shape: 'L',
            flights: Array.from({ length: 6 }, (_, i) => ({
                direction: { x: Math.sin(i * 0.2), y: 0, z: Math.cos(i * 0.2) },
                riserCount: 3, treadDepth: 0.28,
            })),
            landings: [],
        });
        const v = stairSecondRunEligibility(curved);
        expect(v.ok).toBe(false);
        expect((v as { reason: string }).reason).toContain('6 runs');
        expect(deriveStairSecondRunHandedness(curved)).toBeNull();
        expect(mirrorStairSecondRun(curved, 'right')).toBeNull();
    });

    it('refuses a 3-run U with a written NOT-YET rather than guessing which run to turn', () => {
        const u3 = baseStair({
            shape: 'U', secondRunSide: 'left',
            flights: [
                { direction: { x: 0, y: 0, z: 1 }, riserCount: 6 },
                { direction: { x: -1, y: 0, z: 0 }, riserCount: 5 },
                { direction: { x: 0, y: 0, z: -1 }, riserCount: 6 },
            ],
            landings: [{ depth: WIDTH }, { depth: WIDTH }],
        });
        const v = stairSecondRunEligibility(u3);
        expect(v.ok).toBe(false);
        expect((v as { reason: string }).reason).toMatch(/not decided yet|withheld rather than guessing/i);
    });

    it('accepts a two-run L and a two-run U, naming the owning field', () => {
        expect(stairSecondRunEligibility(uniform('L', 'left'))).toMatchObject({ ok: true, field: 'turnDirection' });
        expect(stairSecondRunEligibility(uniform('U', 'left'))).toMatchObject({ ok: true, field: 'secondRunSide' });
    });
});

describe('§4 — the mirror keeps the FIRST run pointwise fixed (so the start point survives)', () => {
    it('leaves run 1 direction, start and riser count untouched, for L and U', () => {
        for (const stair of [uniform('L', 'left'), uniform('U', 'left'), drawnU('left')]) {
            const m = mirrorStairSecondRun(stair, 'right');
            expect(m).not.toBeNull();
            expect(m!.flights[0].direction).toEqual(stair.flights[0].direction);
            expect(m!.flights[0].riserCount).toBe(stair.flights[0].riserCount);
            expect(m!.flights[0].startOverride).toEqual(stair.flights[0].startOverride);
            // The record origin is never rewritten by a turn.
            expect(stair.startPosition).toEqual({ x: 0, y: 0, z: 0 });
        }
    });

    it('flips the OWNING field only — never both', () => {
        const l = mirrorStairSecondRun(uniform('L', 'left'), 'right')!;
        expect(l.turnDirection).toBe('right');
        expect(l.secondRunSide).toBeUndefined();

        const u = mirrorStairSecondRun(uniform('U', 'left'), 'right')!;
        expect(u.secondRunSide).toBe('right');
        expect(u.turnDirection).toBeUndefined();
    });

    it('keeps a U run 2 anti-parallel (a return run stays a return run) and moves only its side', () => {
        const u = drawnU('left');
        const m = mirrorStairSecondRun(u, 'right')!;
        expect(m.flights[1].direction!.x).toBeCloseTo(0, 9);
        expect(m.flights[1].direction!.z).toBeCloseTo(-1, 9);
        expect(m.flights[1].startOverride!.x).toBeCloseTo(WIDTH, 9);   // was -WIDTH
        expect(m.flights[1].startOverride!.z).toBeCloseTo(3.0, 9);     // forward component preserved
    });

    it('returns null when the stair already faces that way — no store write, no rebuild', () => {
        expect(mirrorStairSecondRun(uniform('L', 'left'), 'left')).toBeNull();
        expect(mirrorStairSecondRun(uniform('U', 'right'), 'right')).toBeNull();
    });

    it('is an involution — flipping twice returns the original geometry', () => {
        const start = uniform('L', 'left');
        const once = { ...start, ...mirrorStairSecondRun(start, 'right')! };
        const back = { ...once, ...mirrorStairSecondRun(once, 'left')! };
        expect(deriveStairSecondRunHandedness(back)).toBe('left');
        expect(back.flights[1].direction!.x).toBeCloseTo(start.flights[1].direction!.x, 9);
        expect(back.flights[1].direction!.z).toBeCloseTo(start.flights[1].direction!.z, 9);
    });
});

describe('§5 — ⭐⭐ THE FLIP SURVIVES THE GEOMETRY REBUILD (not just the returned object)', () => {
    it('uniform L: flipped, then re-derived by deriveStairGeometry — still flipped', () => {
        const before = uniform('L', 'left');
        const flipped = { ...before, ...mirrorStairSecondRun(before, 'right')! };
        expect(deriveStairSecondRunHandedness(flipped)).toBe('right');
        expect(deriveStairSecondRunHandedness(rebuild(flipped))).toBe('right');
    });

    it('uniform U: flipped, then re-derived — still flipped', () => {
        const before = uniform('U', 'left');
        const flipped = { ...before, ...mirrorStairSecondRun(before, 'right')! };
        expect(deriveStairSecondRunHandedness(rebuild(flipped))).toBe('right');
    });

    it('⭐ DRAWN L (path-authored): the rebuild takes the RECONCILER branch and preserves the flip', () => {
        const before = drawnL({ x: -1, y: 0, z: 0 }, { x: -0.6, y: 0, z: 5.4 }, { x: 0, y: 0, z: 5.4 });
        expect(stairHasAuthoredFlightGeometry(before)).toBe(true);   // the branch that used to bail
        expect(deriveStairSecondRunHandedness(before)).toBe('left');

        const flipped = { ...before, ...mirrorStairSecondRun(before, 'right')! };
        expect(deriveStairSecondRunHandedness(flipped)).toBe('right');
        expect(deriveStairSecondRunHandedness(rebuild(flipped))).toBe('right');
    });

    it('⭐ DRAWN U: the switchback re-chain follows the flip instead of snapping back to LEFT', () => {
        // This is the §STAIR-SECOND-RUN-DIRECTION fix inside
        // reconcilePathAuthoredStairLayout — the switchback perp used to be
        // hardcoded to the LEFT, so ANY reconcile pulled a right-folded U back.
        const before = drawnU('left');
        expect(stairHasAuthoredFlightGeometry(before)).toBe(true);
        const flipped = { ...before, ...mirrorStairSecondRun(before, 'right')! };
        expect(deriveStairSecondRunHandedness(rebuild(flipped))).toBe('right');
    });

    it('the rebuild is IDEMPOTENT on an un-flipped drawn U — legacy left stairs are unchanged', () => {
        const u = drawnU('left');
        const once = rebuild(u);
        const twice = rebuild(once);
        expect(deriveStairSecondRunHandedness(once)).toBe('left');
        expect(deriveStairSecondRunHandedness(twice)).toBe('left');
        expect(twice.flights[1].startOverride!.x).toBeCloseTo(once.flights[1].startOverride!.x, 9);
        expect(twice.flights[1].startOverride!.z).toBeCloseTo(once.flights[1].startOverride!.z, 9);
    });

    it('⛔ a right-folded drawn U is no longer dragged to the LEFT by an unrelated width edit', () => {
        const u = drawnU('right');
        expect(deriveStairSecondRunHandedness(u)).toBe('right');
        const widened = rebuild({ ...u, width: 1.6 });
        expect(deriveStairSecondRunHandedness(widened)).toBe('right');
    });
});

describe('§6 — the flipped state is expressible in the PERSISTED record', () => {
    it('writes the flag AND the flights, so both the loader map and the geometry carry it', () => {
        // ProjectLoader.ts:1334-1335 and ImportProjectCommand.ts:975-976 both map
        // `turnDirection` / `secondRunSide`; `flights` / `landings` are core fields.
        // A flip that wrote only the flag would reload correctly and RENDER wrong;
        // one that wrote only the flights would render correctly and read wrong.
        const before = drawnL({ x: -1, y: 0, z: 0 }, { x: -0.6, y: 0, z: 5.4 }, { x: 0, y: 0, z: 5.4 });
        const m = mirrorStairSecondRun(before, 'right')!;
        expect(m.turnDirection).toBe('right');
        const reloaded = rebuild({ ...before, ...m });
        expect(reloaded.turnDirection).toBe('right');
        expect(deriveStairSecondRunHandedness(reloaded)).toBe('right');
        expect(stairSecondRunStampIsStale(reloaded)).toBe(false);   // stamp and geometry agree again
    });
});
