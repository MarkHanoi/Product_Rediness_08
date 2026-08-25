/**
 * §LIFT94 (L-11344 / L-11345) — SPACE MOVES THE LANDING DOORS, AND THE COMMIT AGREES.
 *
 * THE FOUNDER, TWO COMPLAINTS THAT TURN OUT TO BE ONE SEAM:
 *   · *"i can not click 'space' on preview to change the location of the door"*
 *   · *"it can not be rotated"*
 *
 * MEASURED 2026-08-25, BEFORE THE FIX:
 *   · `LiftPlanToolHandler.onKeyDown` handled `Escape` and returned `false` for
 *     everything else. SPACE was UNBOUND — the handler existed, the key did not reach
 *     it. (Not "no handler", which would have been a different fix.)
 *   · `rotation` is NOT a missing schema field. `LiftCompoundTypes.ts:118` declares it,
 *     `lift.created` carries it, `LiftAssembly` and `LiftCompoundMeshBuilder` both
 *     honour it. It was computed from the host wall's bearing at
 *     `LiftPlanToolHandler.ts` and never adjustable. So this is a WIRING gap, not a
 *     schema addition — and the two complaints are one control, because
 *     `LiftCompound.rotation`'s own doc says *"Local -Z is the LANDING side"*: for a
 *     lift, where the doors are IS the rotation.
 *
 * ⚠ THE ASSERTION THAT MATTERS IS THE THIRD ONE. Rotating only the preview would be a
 * WORSE bug than the one reported: SPACE would appear to work and place an unrotated
 * lift. The angle had been computed TWICE — once in `_draw`, once in `_commit` — which
 * is exactly the shape that produces that (C84 EI-1). These tests pin that the
 * DISPATCHED PAYLOAD carries the turned angle, not just the purple rectangle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiftPlanToolHandler } from '../LiftPlanToolHandler';

const HALF_PI = Math.PI / 2;

// The handler reads `window.runtime` as its fallback bus (and `window.*Store` for host
// resolution). This suite runs in Node, and an EMPTY window is the right stand-in: it
// forces every dispatch through the INJECTED `c.runtime.bus`, so the payload asserted
// below is unambiguously the one the tool built, not one a global supplied.
beforeEach(() => { (globalThis as unknown as { window?: unknown }).window = {}; });
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

/** A canvas 2-D context that records nothing but answers every call. */
function stubCtx(): CanvasRenderingContext2D {
    const noop = () => {};
    return new Proxy({} as CanvasRenderingContext2D, {
        get: (_t, k) => (k === 'canvas' ? {} : typeof k === 'string' ? noop : undefined),
        set: () => true,
    });
}

/**
 * The tool context, with just enough for `_commit` to reach a dispatch. No wall store
 * and no slabs: the lift lands `standalone-glass` with a base angle of 0, so the angle
 * the payload carries is EXACTLY the user's quarter-turns and nothing else is mixed in.
 */
function makeCtx(dispatch: ReturnType<typeof vi.fn>) {
    return {
        ctx: stubCtx(),
        overlayCanvas: { width: 800, height: 600 },
        dpr: 1,
        planCanvas: {
            worldToScreen: (x: number, z: number) => ({ sx: x * 10, sy: z * 10 }),
            hitTest: () => null,
        },
        viewPlane: 'plan',
        viewDef: { spatial: { levelId: 'level-1' } },
        runtime: {
            bus: { executeCommand: dispatch },
            stores: {},
        },
        bimManager: { getLevels: () => [{ id: 'level-1', elevation: 0 }] },
    } as never;
}

function place(turns: number): Record<string, unknown> {
    const dispatch = vi.fn(() => Promise.resolve({ ok: true }));
    const h = new LiftPlanToolHandler();
    h.activate(makeCtx(dispatch));
    h.onMouseMove({ worldX: 3, worldZ: 4 } as never);
    for (let i = 0; i < turns; i++) {
        h.onKeyDown({ code: 'Space', key: ' ' } as KeyboardEvent);
    }
    h.onClick({ worldX: 3, worldZ: 4 } as never);
    expect(dispatch, 'the tool dispatched lift.create').toHaveBeenCalled();
    const [verb, payload] = dispatch.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(verb).toBe('lift.create');
    return payload;
}

describe('§LIFT94 — SPACE is BOUND during lift placement (L-11344)', () => {
    it('R-1: onKeyDown CONSUMES Space — it no longer falls through to the page', () => {
        const h = new LiftPlanToolHandler();
        h.activate(makeCtx(vi.fn()));
        h.onMouseMove({ worldX: 0, worldZ: 0 } as never);
        // ⭐ THIS RETURNED `false` BEFORE THE FIX. `PlanViewToolOverlay._onKeyDown`
        // reads the boolean to decide whether to preventDefault, so `false` meant the
        // page scrolled and no lift control ran — the founder's "nothing happens".
        expect(h.onKeyDown({ code: 'Space', key: ' ' } as KeyboardEvent)).toBe(true);
    });

    it('R-2: all three SPACE spellings are accepted (code / key / legacy Spacebar)', () => {
        for (const e of [{ code: 'Space' }, { key: ' ' }, { key: 'Spacebar' }]) {
            const h = new LiftPlanToolHandler();
            h.activate(makeCtx(vi.fn()));
            h.onMouseMove({ worldX: 0, worldZ: 0 } as never);
            expect(h.onKeyDown(e as KeyboardEvent), JSON.stringify(e)).toBe(true);
        }
    });

    it('R-3: an unrelated key is still NOT consumed', () => {
        // The negative control: a fix that swallowed every key would break every other
        // shortcut while the lift tool is armed.
        const h = new LiftPlanToolHandler();
        h.activate(makeCtx(vi.fn()));
        h.onMouseMove({ worldX: 0, worldZ: 0 } as never);
        expect(h.onKeyDown({ code: 'KeyA', key: 'a' } as KeyboardEvent)).toBe(false);
    });
});

describe('§LIFT94 — the DISPATCHED payload carries the turn, not just the preview (L-11345)', () => {
    it('R-4: zero presses ⇒ rotation 0 — the baseline is unchanged', () => {
        expect(place(0)['rotation']).toBeCloseTo(0, 10);
    });

    it('R-5: each SPACE adds exactly one quarter-turn to `rotation`', () => {
        // ⭐ THE ASSERTION THE OLD DUPLICATED-ANGLE SHAPE WOULD HAVE FAILED. Before
        // §LIFT94 the angle was computed independently in `_draw` and `_commit`; a
        // preview-only fix passes R-1..R-3 and fails here.
        expect(place(1)['rotation']).toBeCloseTo(HALF_PI, 10);
        expect(place(2)['rotation']).toBeCloseTo(Math.PI, 10);
        expect(place(3)['rotation']).toBeCloseTo(3 * HALF_PI, 10);
    });

    it('R-6: the turn WRAPS at four — a lift cannot be rotated off the compass', () => {
        expect(place(4)['rotation']).toBeCloseTo(0, 10);
        expect(place(5)['rotation']).toBeCloseTo(HALF_PI, 10);
    });

    it('R-7: Escape resets the turn — "start over" means start over', () => {
        const dispatch = vi.fn(() => Promise.resolve({}));
        const h = new LiftPlanToolHandler();
        h.activate(makeCtx(dispatch));
        h.onMouseMove({ worldX: 1, worldZ: 1 } as never);
        h.onKeyDown({ code: 'Space' } as KeyboardEvent);
        h.onKeyDown({ key: 'Escape' } as KeyboardEvent);
        h.onMouseMove({ worldX: 1, worldZ: 1 } as never);
        h.onClick({ worldX: 1, worldZ: 1 } as never);
        const [, payload] = dispatch.mock.calls[0] as unknown as [string, Record<string, unknown>];
        expect(payload['rotation']).toBeCloseTo(0, 10);
    });

    it('R-8: the turn is STICKY across placements — a bank of lifts faces one way', () => {
        const dispatch = vi.fn(() => Promise.resolve({}));
        const h = new LiftPlanToolHandler();
        h.activate(makeCtx(dispatch));
        h.onMouseMove({ worldX: 1, worldZ: 1 } as never);
        h.onKeyDown({ code: 'Space' } as KeyboardEvent);
        h.onClick({ worldX: 1, worldZ: 1 } as never);
        h.onMouseMove({ worldX: 5, worldZ: 1 } as never);
        h.onClick({ worldX: 5, worldZ: 1 } as never);
        expect(dispatch).toHaveBeenCalledTimes(2);
        for (const call of dispatch.mock.calls) {
            const payload = (call as unknown as [string, Record<string, unknown>])[1];
            expect(payload['rotation'], 'both lifts face the same way').toBeCloseTo(HALF_PI, 10);
        }
    });
});
