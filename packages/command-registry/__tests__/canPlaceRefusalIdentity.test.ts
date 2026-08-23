/**
 * §REFUSAL-IDENTITY-CANPLACE (GE-09, C58 §1.13 / §1.13.8) — REACHABILITY at the
 * command seam, EXECUTED.
 *
 * What this proves: the six command-registry consumers of
 * `WallOccupancyStore.canPlace()` no longer drop the `CanPlaceRefusalCode` on the
 * way to `CommandValidationResult.reason`. Each test drives a REAL refusal arm
 * through the REAL command's `canExecute()` and asserts the reason string CARRIES
 * the `[OCC_*]` identity token — the closed-union verdict a user (or the gate)
 * can attribute to its rule. Before GE-09 every one of these sites read the
 * boolean/prose and discarded `code`, so six distinct verdicts arrived as one
 * sentence ("Position occupied or out of bounds").
 *
 * What this does NOT prove — stated so nobody mistakes this file for the full
 * reachability arm:
 *   • the hop from `CommandValidationResult.reason` to the DOM (CommandManagerImpl
 *     renders `validation.reason || 'Validation failed'`; both fragments are still
 *     named in check-refusal-identity's baseline);
 *   • the DoorTool / WindowTool HUD hop (`setHudState` → `.th-overlay` textContent)
 *     — threaded in the same GE-09 pass, but instantiating the tools needs an
 *     OBC.World harness this suite does not have. The static gate now at least
 *     SEES that sink (USER_SINK_RE includes `HudState(`).
 */

import { describe, it, expect } from 'vitest';
import { SetWindowOffsetCommand } from '../src/windows/SetWindowOffsetCommand';
import { MoveWindowCommand } from '../src/windows/MoveWindowCommand';
import { CenterWindowInWallCommand } from '../src/windows/CenterWindowInWallCommand';
import { SetDoorOffsetCommand } from '../src/doors/SetDoorOffsetCommand';
import { MoveDoorCommand } from '../src/doors/MoveDoorCommand';
import { CreateWallOpeningCommand } from '../src/walls/CreateWallOpeningCommand';
import type { CommandContext } from '../src/types';

// ─── minimal real-shape fixtures (mirrors createWindowsParametricBatch.test.ts) ──

type Pt = { x: number; y: number; z: number };
const p = (x: number, z: number): Pt => ({ x, y: 0, z });

interface Op {
    id: string; elementId: string; type: 'window' | 'door';
    offset: number; width: number; height: number; sillHeight: number;
}
const op = (id: string, elementId: string, type: 'window' | 'door', offset: number, width: number): Op =>
    ({ id, elementId, type, offset, width, height: 1.2, sillHeight: 1 });

interface W {
    id: string; levelId: string; baseLine: [Pt, Pt]; thickness: number;
    height: number; openings: Op[]; childrenIds: string[]; rakeAngleDeg?: number;
}
const wall = (id: string, len: number, openings: Op[] = [], over: Partial<W> = {}): W => ({
    id, levelId: 'L0', baseLine: [p(0, 0), p(len, 0)], thickness: 0.2, height: 3,
    openings, childrenIds: openings.map(o => o.elementId), ...over,
});

interface Hosted { windows?: Record<string, unknown>; doors?: Record<string, unknown> }
function ctxOf(walls: W[], hosted: Hosted = {}): CommandContext {
    const map = new Map(walls.map(w => [w.id, w]));
    return {
        stores: {
            wallStore: {
                getAll:    () => [...map.values()],
                getById:   (id: string) => map.get(id),
                getWindow: (id: string) => hosted.windows?.[id],
                getDoor:   (id: string) => hosted.doors?.[id],
            },
        },
    } as unknown as CommandContext;
}

/** The identity token the render must carry (closed union + the honest
 *  OCC_UNIDENTIFIED absence marker — which none of these arms may produce). */
const IDENTITY = /^\[OCC_[A-Z_]+\]/;

describe('§REFUSAL-IDENTITY-CANPLACE — the six command consumers carry the code (GE-09)', () => {

    it('SetWindowOffsetCommand: span past the wall end refuses AS [OCC_SPAN_BEYOND_WALL_END]', () => {
        const ctx = ctxOf([wall('w1', 5)], { windows: { win1: { id: 'win1', wallId: 'w1', offset: 1, width: 1 } } });
        const v = new SetWindowOffsetCommand('win1', 10, 1).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(IDENTITY);
        expect(v.reason).toMatch(/^\[OCC_SPAN_BEYOND_WALL_END\]/);
    });

    it('SetDoorOffsetCommand: overlap refuses AS [OCC_OVERLAPS_SIBLING] and NAMES the sibling', () => {
        const w = wall('w1', 10, [op('op-d1', 'd1', 'door', 1, 1), op('op-b', 'b1', 'window', 5, 2)]);
        const ctx = ctxOf([w], { doors: { d1: { id: 'd1', wallId: 'w1', offset: 1, width: 1 } } });
        const v = new SetDoorOffsetCommand('d1', 5.5, 1).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/^\[OCC_OVERLAPS_SIBLING\]/);
        // conflictIds must survive too — the refusal names WHAT it overlaps.
        expect(v.reason).toContain('op-b');
    });

    it('MoveWindowCommand: moving onto a sibling refuses AS [OCC_OVERLAPS_SIBLING]', () => {
        const w = wall('w1', 10, [op('op-win1', 'win1', 'window', 1, 1), op('op-block', 'other', 'window', 5, 2)]);
        const ctx = ctxOf([w], { windows: { win1: { id: 'win1', wallId: 'w1', offset: 1, width: 1 } } });
        const v = new MoveWindowCommand('win1', 4, 'right').canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/^\[OCC_OVERLAPS_SIBLING\]/);
    });

    it('MoveDoorCommand: moving onto a sibling refuses AS [OCC_OVERLAPS_SIBLING]', () => {
        const w = wall('w1', 10, [op('op-d1', 'd1', 'door', 1, 1), op('op-block', 'other', 'window', 5, 2)]);
        const ctx = ctxOf([w], { doors: { d1: { id: 'd1', wallId: 'w1', offset: 1, width: 1 } } });
        const v = new MoveDoorCommand('d1', 4, 'right').canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/^\[OCC_OVERLAPS_SIBLING\]/);
    });

    it('CenterWindowInWallCommand: a blocked centre refuses AS [OCC_OVERLAPS_SIBLING]', () => {
        const w = wall('w1', 10, [op('op-win1', 'win1', 'window', 0, 1), op('op-mid', 'mid', 'window', 4.5, 2)]);
        const ctx = ctxOf([w], { windows: { win1: { id: 'win1', wallId: 'w1', offset: 0, width: 1 } } });
        const v = new CenterWindowInWallCommand('win1').canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/^\[OCC_OVERLAPS_SIBLING\]/);
    });

    it('CreateWallOpeningCommand: a raked host whose rake is UNBUILDABLE refuses AS [OCC_HOST_RAKED]', () => {
        // §RAKE-HOSTED-OPENING (founder 2026-08-18) — a plain raked host is now
        // ACCEPTED (the case below), so the subject here is a raked host whose rake
        // cannot be built at all. The point of this suite is the CODE, not the rule:
        // the refusal must stay attributable to its own arm.
        //
        // ⚠ THE FIXTURE WAS STALE AND THIS TEST WAS RED — corrected 2026-08-23 (OPEN38,
        //   L-7402). It read `{ rakeAngleDeg: 70, curve: { control: { x: 4, y: 0, z: 1 },
        //   segments: 12 } }` and was written when `rakeAuthorability` refused EVERY curved
        //   rake. §FEAT-RAKE-CURVED (L-1062, 2026-08-19) lifted that arm — a raked curved
        //   wall ships as a CONE — and left behind only the narrow `curved-collapse` arm,
        //   which this fixture does not trip: measured, its top edge shifts **1.092 m**
        //   against a tightest turn radius of **16.006 m**. It is a perfectly buildable
        //   wall, so the refusal it asserted had simply ceased to exist.
        //
        //   ⚠ AND THE COLLAPSE ARM COULD NOT HAVE FIRED EVEN ON A WALL THAT DID COLLAPSE,
        //   which is the finding worth keeping: `canPlace` supplied `rakeAuthorability`
        //   neither `height` nor `curveMinRadiusM`, so the arm was structurally unreachable
        //   from every placement path in the repo (L-7401, fixed in `WallOccupancyStore`).
        //   A stale fixture was therefore hiding a dead gate — the test failed for a reason
        //   NEXT TO the real defect, which is the most expensive kind of red.
        //
        //   The subject is now a rake that is unbuildable BY ITS OWN NUMBER (5° is outside
        //   [15, 165]), so it cannot go stale behind another lifted arm. The genuine
        //   collapse case — a tight arc at 20°, shift 8.242 m against radius 2.675 m — is
        //   asserted where the fix lives, in `OPEN38CanPlaceVerticalArm.test.ts`.
        const ctx = ctxOf([wall('w1', 8, [], { rakeAngleDeg: 5 })]);
        const v = new CreateWallOpeningCommand({ wallId: 'w1', openingData: { type: 'door', width: 1, offset: 1 } }).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/^\[OCC_HOST_RAKED\]/);
    });

    it('CreateWallOpeningCommand: a plain RAKED host is ACCEPTED — §RAKE-HOSTED-OPENING', () => {
        // Non-vacuity for the change above: OCC_HOST_RAKED must not have become a
        // code that fires on every leaning wall, which would make the founder's
        // feature unreachable while this suite still went green on the code.
        const ctx = ctxOf([wall('w1', 8, [], { rakeAngleDeg: 70 })]);
        const v = new CreateWallOpeningCommand({ wallId: 'w1', openingData: { type: 'window', width: 1, offset: 1 } }).canExecute(ctx);
        expect(v.ok).toBe(true);
    });

    it('CreateWallOpeningCommand: a non-positive width refuses AS [OCC_WIDTH_NOT_POSITIVE]', () => {
        const ctx = ctxOf([wall('w1', 8)]);
        const v = new CreateWallOpeningCommand({ wallId: 'w1', openingData: { type: 'window', width: -1, offset: 0 } }).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/^\[OCC_WIDTH_NOT_POSITIVE\]/);
    });

    it('CreateWallOpeningCommand: a zero-length host refuses AS [OCC_HOST_ZERO_LENGTH]', () => {
        const ctx = ctxOf([wall('w1', 0)]);
        const v = new CreateWallOpeningCommand({ wallId: 'w1', openingData: { type: 'window', width: 1, offset: 0 } }).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/^\[OCC_HOST_ZERO_LENGTH\]/);
    });

    it('positive control: a legal placement passes with NO refusal to render', () => {
        const ctx = ctxOf([wall('w1', 8)]);
        const v = new CreateWallOpeningCommand({ wallId: 'w1', openingData: { type: 'window', width: 1, offset: 3 } }).canExecute(ctx);
        expect(v.ok).toBe(true);
        expect(v.reason).toBeUndefined();
    });
});
