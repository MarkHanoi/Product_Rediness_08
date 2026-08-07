// @vitest-environment happy-dom
//
// §FIX-WALL-PREVIEW-COMMIT-LENGTH-LOCK (founder 2026-08-06).
//
// THE founder defect: while drawing a wall in plan the live preview reads a length
// (his screenshots: 1214 mm, then 1017 mm) and shows the joint landing correctly on
// an existing corner — but the COMMITTED wall is somewhere else and the joint is
// malformed. "The preview computes the correct joint. The commit does not."
//
// ROOT CAUSE: `onMouseMove` applied the typed-length lock (`_computeLockedEndPoint`)
// in the order ortho/angle → LENGTH LOCK → alignment inference. `onClick` applied
// ortho/angle → alignment inference and OMITTED the length lock entirely. The Enter
// commit path did apply it. So with a typed length active, the preview drew the wall
// at the locked distance while a MOUSE CLICK committed the raw, unlocked cursor point.
// The committed endpoint therefore lands an arbitrary cursor-distance from where the
// preview showed it — which is how a wall drawn INTO an existing corner ends up tens
// or hundreds of millimetres off it, and the junction solver sees a near-but-not-
// coincident cluster instead of a shared vertex.
//
// This suite locks: (a) with a typed length, the CLICK-committed baseline end equals
// the point the preview last drew, to float precision; (b) with NO typed length the
// committed point is byte-identical to the raw resolved cursor (free-hand drawing is
// completely unchanged — the lock is inert).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@pryzm/schemas', async importOriginal => ({
    ...(await importOriginal<Record<string, unknown>>()),
    createId: (p: string) => `${p}_TEST`,
}));
vi.mock('@pryzm/snapping', () => ({ computeWallAlignmentInference: () => null }));

import { WallPlanToolHandler } from '../WallPlanToolHandler';

interface Dispatched { baseLine: Array<{ x: number; y: number; z: number }> }

const TYPED_LENGTH_M = 1.017;   // the founder's second screenshot: 1017 mm

function harness(typedLength: number | null) {
    const dispatched: Dispatched[] = [];
    const w = window as any;
    w.runtime = {
        bus: {
            executeCommand: (name: string, payload: Dispatched) => {
                if (name === 'wall.create') dispatched.push(payload);
                return Promise.resolve();
            },
        },
    };
    // Linear mode: no ortho projection, no angle step — isolates the length lock.
    w.wallModePicker = { getActiveMode: () => 'linear', getAngleStep: () => 15 };
    // Alignment inference OFF so the length-lock stage is measured in isolation.
    w.__pryzmPlanWallAlignInference = false;

    const h = new WallPlanToolHandler();
    // Minimal draw context: _commitWall only reads viewDef.spatial.levelId from it.
    (h as any)._ctx = { viewDef: { spatial: { levelId: 'L0' } } };
    // Drive the real handler; stub ONLY the typed-dimension input (its own suite covers it)
    // and the canvas/DOM-bound overlay draws, which need a 2D context we do not have here.
    (h as any)._dimInput = {
        isActive: typedLength !== null,
        getLengthMeters: () => typedLength,
        reset() {},
        dispose() {},
    };
    (h as any)._drawWallPreview = () => {};
    (h as any)._drawSetOutPreviewOnly = () => {};
    (h as any)._syncCreationHud = () => {};
    (h as any)._clearOverlay = () => {};
    return { h, dispatched };
}

describe('WallPlanToolHandler — §FIX-WALL-PREVIEW-COMMIT-LENGTH-LOCK', () => {
    beforeEach(() => { vi.restoreAllMocks(); });

    it('a typed length: the CLICK-committed end equals the point the PREVIEW drew', () => {
        const { h, dispatched } = harness(TYPED_LENGTH_M);
        h.onClick({ worldX: 0, worldZ: 0 });

        // The cursor sits 3 m out along +x — far past the typed 1.017 m.
        const cursor = { worldX: 3, worldZ: 0 };
        h.onMouseMove(cursor);
        const preview = (h as any)._wallCursorPoint as { worldX: number; worldZ: number };

        // The preview honoured the typed length.
        expect(Math.hypot(preview.worldX, preview.worldZ)).toBeCloseTo(TYPED_LENGTH_M, 12);

        h.onClick(cursor);
        expect(dispatched).toHaveLength(1);
        const end = dispatched[0]!.baseLine[1]!;

        // THE LOCK: the committed end IS the previewed point.
        expect(end.x).toBeCloseTo(preview.worldX, 12);
        expect(end.z).toBeCloseTo(preview.worldZ, 12);
        // …and therefore carries the typed length, not the 3 m raw cursor distance.
        expect(Math.hypot(end.x, end.z)).toBeCloseTo(TYPED_LENGTH_M, 12);
    });

    it('NO typed length: free-hand drawing is unchanged (the lock is inert)', () => {
        const { h, dispatched } = harness(null);
        h.onClick({ worldX: 0, worldZ: 0 });
        const cursor = { worldX: 3, worldZ: 1.5 };
        h.onMouseMove(cursor);
        h.onClick(cursor);
        expect(dispatched).toHaveLength(1);
        const end = dispatched[0]!.baseLine[1]!;
        expect(end.x).toBe(3);
        expect(end.z).toBe(1.5);
    });
});
