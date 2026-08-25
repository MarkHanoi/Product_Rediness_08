/**
 * §CW90-PLAN-ENTER-CLOSES (C87 §13.8 CW-Poly-1 — the PLAN half).
 *
 * C87 §13.8 delivered ENTER-closes for the 3-D `CurtainWallTool` (lane CW2,
 * `13bc0ba5`) and recorded the plan surface as a DECLARED ABSENCE: "no ENTER
 * handler, no polyline origin and no closure at all". This spec pins the
 * closure of that absence, mirroring the wall tool's semantics:
 *
 *   - after >= 2 committed segments, ENTER connects the chain head back to the
 *     FIRST point of the run as ONE more `curtain-wall.create` (one undo entry,
 *     exactly the wall's shape — no batch, no second command);
 *   - with no loop to close, ENTER commits the segment under the cursor
 *     (`WallPlanToolHandler`'s fallback arm);
 *   - the wall's own 0.1 m minimum guards a degenerate closing segment.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { CurtainWallPlanToolHandler } from '../CurtainWallPlanToolHandler';

type Dispatched = { verb: string; payload: Record<string, unknown> };

function makeHandler(): { handler: CurtainWallPlanToolHandler; dispatched: Dispatched[] } {
    const dispatched: Dispatched[] = [];
    (window as any).runtime = {
        bus: {
            executeCommand: (verb: string, payload: Record<string, unknown>) => {
                dispatched.push({ verb, payload });
                return Promise.resolve({ success: true });
            },
        },
    };
    const handler = new CurtainWallPlanToolHandler({
        curtainWallModePicker: { getActiveMode: () => 'linear' },
    });
    // A 2D-context double whose every method is a no-op (the preview path calls
    // save/beginPath/arc/…; none of that is under test here).
    const ctx2d = new Proxy({} as Record<string, unknown>, {
        get: (t, prop) => {
            if (prop === 'measureText') return () => ({ width: 10 });
            if (typeof prop === 'string' && !(prop in t)) return () => {};
            return t[prop as string];
        },
        set: (t, prop, v) => { t[prop as string] = v; return true; },
    });
    (handler as any)._ctx = {
        viewDef: { spatial: { levelId: 'L0' } },
        ctx: ctx2d,
        overlayCanvas: { width: 100, height: 100 },
        planCanvas: { worldToScreen: () => ({ sx: 0, sy: 0 }), getPixelsPerUnit: () => 10 },
        dpr: 1,
    };
    return { handler, dispatched };
}

const enter = () => new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });

afterEach(() => {
    delete (window as any).runtime;
    delete (window as any).curtainWallTool;
});

describe('§CW90-PLAN-ENTER-CLOSES — Enter closes a curtain-wall polyline loop in plan view', () => {
    it('⭐ after 2 segments, ENTER commits EXACTLY ONE closing segment back to the origin', () => {
        const { handler, dispatched } = makeHandler();
        handler.onClick({ worldX: 0, worldZ: 0 });   // origin
        handler.onClick({ worldX: 6, worldZ: 0 });   // segment 1
        handler.onClick({ worldX: 6, worldZ: 4 });   // segment 2
        expect(dispatched).toHaveLength(2);

        const handled = handler.onKeyDown(enter());
        expect(handled).toBe(true);
        expect(dispatched, 'the close is ONE more create — one undo entry, like the wall tool').toHaveLength(3);

        const close = dispatched[2]!.payload['baseLine'] as Array<{ x: number; z: number }>;
        expect(close[0]).toMatchObject({ x: 6, z: 4 });  // chain head
        expect(close[1]).toMatchObject({ x: 0, z: 0 });  // back to the ORIGIN

        // The run is finished: a further Enter does nothing.
        expect(handler.onKeyDown(enter())).toBe(false);
        expect(dispatched).toHaveLength(3);
    });

    it('one segment is a CHAIN, not a loop — ENTER does not close it', () => {
        const { handler, dispatched } = makeHandler();
        handler.onClick({ worldX: 0, worldZ: 0 });
        handler.onClick({ worldX: 6, worldZ: 0 });
        expect(dispatched).toHaveLength(1);

        // No cursor either, so the wall-mirror fallback has nothing to commit.
        expect(handler.onKeyDown(enter())).toBe(false);
        expect(dispatched).toHaveLength(1);
    });

    it('with no loop but a live cursor, ENTER commits the segment under the cursor (wall fallback arm)', () => {
        const { handler, dispatched } = makeHandler();
        handler.onClick({ worldX: 0, worldZ: 0 });
        handler.onMouseMove({ worldX: 3, worldZ: 0 });

        expect(handler.onKeyDown(enter())).toBe(true);
        expect(dispatched).toHaveLength(1);
        const seg = dispatched[0]!.payload['baseLine'] as Array<{ x: number; z: number }>;
        expect(seg[1]).toMatchObject({ x: 3, z: 0 });
    });

    it('a chain head already back at the origin (< 0.1 m) closes WITHOUT a degenerate segment', () => {
        const { handler, dispatched } = makeHandler();
        handler.onClick({ worldX: 0, worldZ: 0 });
        handler.onClick({ worldX: 6, worldZ: 0 });
        handler.onClick({ worldX: 6, worldZ: 4 });
        handler.onClick({ worldX: 0.05, worldZ: 0 }); // segment 3 lands ~at the origin
        expect(dispatched).toHaveLength(3);

        expect(handler.onKeyDown(enter())).toBe(true);
        expect(dispatched, 'the wall\'s 0.1 m minimum — no zero-length closing wall').toHaveLength(3);
        // And the run is reset.
        expect(handler.onKeyDown(enter())).toBe(false);
    });

    it('Escape cancels the run — a later ENTER has no stale origin to close to', () => {
        const { handler, dispatched } = makeHandler();
        handler.onClick({ worldX: 0, worldZ: 0 });
        handler.onClick({ worldX: 6, worldZ: 0 });
        handler.onClick({ worldX: 6, worldZ: 4 });
        handler.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

        expect(handler.onKeyDown(enter())).toBe(false);
        expect(dispatched).toHaveLength(2);
    });
});
