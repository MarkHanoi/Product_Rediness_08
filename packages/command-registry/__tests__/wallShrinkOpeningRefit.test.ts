/**
 * §FIX-WALL-SHRINK-REFIT (W2-1, EV-03 §2 / R-1 + R-2) — the WALL-SIDE opening gate.
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * `WallOccupancyStore.clampToWall` — the correct, already-written, already-tested
 * guard for "this opening no longer fits its host" — had exactly two production
 * call sites, and BOTH were on the opening side. Nothing asked it the mirror
 * question: what happens to a stationary door when the WALL shrinks underneath
 * it? An EXECUTED probe (EV-03 §2.1) answered: nothing. A 0.9 m door at offset
 * 2.0 survived on a wall shortened to 1.5 m — entirely off the end of its host —
 * and a 2.1 m door survived in a wall lowered to 1.0 m. No clamp, no refusal, no
 * event.
 *
 * ── The policy under test ───────────────────────────────────────────────────
 * Split by what would be LOST (see the doc on `planOpeningRefit`):
 *   • POSITION is recoverable  → CLAMP  (precedent: WallStore.updateWindow)
 *   • AUTHORED SIZE is not     → REFUSE (precedent: BaselineReversalError +
 *                                        UpdateWallBaselineCommand's catch)
 *   • DELETE                   → never (no precedent on any edit path)
 * And a clamp that undo cannot reverse is just slower data loss, so the undo
 * half is asserted too — `restoreSnapshot` does NOT carry `openings`.
 *
 * Driven against the REAL `WallStore` (not a double), because the bug lived in
 * the seam between the commands and the store, and a double would have modelled
 * the seam rather than exercised it.
 */

import { describe, it, expect } from 'vitest';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData, DoorData, WindowData } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { UpdateWallBaselineCommand } from '../src/walls/UpdateWallBaselineCommand';
import { UpdateWallHeightCommand } from '../src/walls/UpdateWallHeightCommand';
import type { CommandContext } from '../src/types';

const LEVEL_ID = 'level-0';

function makeLevelProvider() {
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

interface HostSpec {
    lengthM:    number;
    heightM?:   number;
    kind?:      'door' | 'window';
    offset:     number;
    width:      number;
    openingH:   number;
    sillHeight: number;
}

function makeWorld(spec: HostSpec) {
    const kind = spec.kind ?? 'door';
    const elementId = `${kind}_1`;
    const store = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    store.add({
        id: 'w1',
        type: 'wall',
        levelId: LEVEL_ID,
        properties: {},
        childrenIds: [elementId],
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: spec.lengthM, y: 0, z: 0 }],
        height: spec.heightM ?? 3,
        thickness: 0.2,
        baseOffset: 0,
        openings: [{
            id: 'op_1', type: kind, elementId,
            offset: spec.offset, width: spec.width,
            height: spec.openingH, sillHeight: spec.sillHeight,
        }],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 't', version: 1 },
    } as unknown as WallData);

    const common = {
        id: elementId, levelId: LEVEL_ID, parentId: 'w1',
        wallId: 'w1', openingId: 'op_1',
        width: spec.width, height: spec.openingH,
        sillHeight: spec.sillHeight, offset: spec.offset,
        frameThickness: 0.15, frameWidth: 0.05,
        properties: { mark: kind === 'door' ? 'DO001' : 'WN001' },
    };
    if (kind === 'door') store.addDoor({ ...common, type: 'door' } as unknown as DoorData);
    else                 store.addWindow({ ...common, type: 'window' } as unknown as WindowData);

    const ctx = { stores: { wallStore: store } } as unknown as CommandContext;
    return { store, ctx, elementId };
}

const opening = (store: WallStore) => store.getById('w1')!.openings![0];
const wallLength = (store: WallStore) => {
    const bl = store.getById('w1')!.baseLine;
    return Math.hypot(bl[1].x - bl[0].x, bl[1].z - bl[0].z);
};

describe('§FIX-WALL-SHRINK-REFIT — shortening a wall (UpdateWallBaselineCommand)', () => {

    it('EV-03 PROBE-3 REGRESSION: a 0.9 m door never survives outside a 1.5 m wall', () => {
        // The exact probe from EV-03 §2.1 that established the bug.
        const { store, ctx } = makeWorld({ lengthM: 6, offset: 2.0, width: 0.9, openingH: 2.1, sillHeight: 0 });

        const cmd = new UpdateWallBaselineCommand({
            wallId: 'w1',
            newBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 1.5, y: 0, z: 0 }],
        });
        const verdict = cmd.canExecute(ctx);
        const result  = cmd.execute(ctx);

        // Whichever branch the policy takes, the ONE outcome that is not allowed
        // is the pre-fix one: a door hanging off the end of its wall.
        const op = opening(store);
        expect(op.offset + op.width).toBeLessThanOrEqual(wallLength(store) + 1e-9);

        // Here the door (0.9 m) DOES fit a 1.5 m wall, so the policy is CLAMP.
        expect(verdict.ok).toBe(true);
        expect(result.success).toBe(true);
        expect(op.width).toBeCloseTo(0.9, 6);           // authored size preserved
        expect(op.offset).toBeCloseTo(0.6, 6);          // 1.5 − 0.9
    });

    it('REFUSES the wall edit when the door cannot fit at ANY offset, naming both numbers', () => {
        const { store, ctx } = makeWorld({ lengthM: 6, offset: 2.0, width: 0.9, openingH: 2.1, sillHeight: 0 });

        const cmd = new UpdateWallBaselineCommand({
            wallId: 'w1',
            newBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }],
        });

        const verdict = cmd.canExecute(ctx);
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe('OPENING_DOES_NOT_FIT');
        // A typed refusal that names the offending opening AND both numbers.
        const issue = (verdict.blockingIssues ?? []).join(' ');
        expect(issue).toContain('door_1');
        expect(issue).toContain('0.900');   // what the door needs
        expect(issue).toContain('0.500');   // what the wall would offer

        // …and execute() refuses too (defence in depth for callers that skip
        // canExecute), leaving BOTH the wall and the door untouched. Never a
        // narrowed door, never a deleted one.
        const result = cmd.execute(ctx);
        expect(result.success).toBe(false);
        expect(result.error).toContain('OPENING_DOES_NOT_FIT');
        expect(wallLength(store)).toBeCloseTo(6, 6);
        expect(opening(store)).toMatchObject({ offset: 2.0, width: 0.9 });
    });

    it('a wall edit that leaves every opening in bounds is untouched by the gate', () => {
        const { store, ctx } = makeWorld({ lengthM: 6, offset: 1.0, width: 0.9, openingH: 2.1, sillHeight: 0 });
        const cmd = new UpdateWallBaselineCommand({
            wallId: 'w1',
            newBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
        });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);
        expect(opening(store)).toMatchObject({ offset: 1.0, width: 0.9 });
    });

    it('UNDO restores the pre-clamp offset — restoreSnapshot does not carry openings', () => {
        const { store, ctx } = makeWorld({ lengthM: 6, offset: 2.5, width: 0.9, openingH: 2.1, sillHeight: 0 });
        const cmd = new UpdateWallBaselineCommand({
            wallId: 'w1',
            newBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }],
        });
        expect(cmd.execute(ctx).success).toBe(true);
        expect(opening(store).offset).toBeCloseTo(2.1, 6);   // 3 − 0.9

        expect(cmd.undo(ctx).success).toBe(true);
        expect(wallLength(store)).toBeCloseTo(6, 6);
        expect(opening(store).offset).toBeCloseTo(2.5, 6);   // the authored position
        expect(store.getDoor('door_1')!.offset).toBeCloseTo(2.5, 6);
    });
});

describe('§FIX-WALL-SHRINK-REFIT — lowering a wall (UpdateWallHeightCommand)', () => {

    it('EV-03 PROBE-4 REGRESSION: a 2.1 m door never survives in a 1.0 m wall', () => {
        const { store, ctx } = makeWorld({
            lengthM: 6, heightM: 3, offset: 1.0, width: 0.9, openingH: 2.1, sillHeight: 0,
        });

        const cmd = new UpdateWallHeightCommand({ wallIds: ['w1'], newHeight: 1.0 });

        const verdict = cmd.canExecute(ctx);
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe('OPENING_DOES_NOT_FIT');
        const issue = (verdict.blockingIssues ?? []).join(' ');
        expect(issue).toContain('2.100');   // the door's height
        expect(issue).toContain('1.000');   // the wall's would-be height

        // execute() skips the refused wall rather than damaging it.
        const result = cmd.execute(ctx);
        expect(result.success).toBe(false);
        const wall = store.getById('w1')!;
        expect(wall.height).toBeCloseTo(3, 6);
        const op = opening(store);
        expect(op.sillHeight + op.height).toBeLessThanOrEqual(wall.height + 1e-9);
    });

    it('CLAMPS a sill that no longer fits, preserving the authored opening height', () => {
        // Window 1.2 m tall with sill 1.8 → top at 3.0, exactly the wall height.
        // Lower the wall to 2.4 and the sill must come down to 1.2.
        const { store, ctx } = makeWorld({
            lengthM: 6, heightM: 3, kind: 'window',
            offset: 1.0, width: 0.9, openingH: 1.2, sillHeight: 1.8,
        });

        const cmd = new UpdateWallHeightCommand({ wallIds: ['w1'], newHeight: 2.4 });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);

        const op = opening(store);
        expect(op.height).toBeCloseTo(1.2, 6);      // authored size preserved
        expect(op.sillHeight).toBeCloseTo(1.2, 6);  // 2.4 − 1.2
        expect(op.sillHeight + op.height).toBeLessThanOrEqual(2.4 + 1e-9);

        // UNDO puts the sill back where the author placed it.
        expect(cmd.undo(ctx).success).toBe(true);
        expect(store.getById('w1')!.height).toBeCloseTo(3, 6);
        expect(opening(store).sillHeight).toBeCloseTo(1.8, 6);
    });

    it('RAISING a wall is never blocked and never moves an opening', () => {
        const { store, ctx } = makeWorld({
            lengthM: 6, heightM: 3, offset: 1.0, width: 0.9, openingH: 2.1, sillHeight: 0,
        });
        const cmd = new UpdateWallHeightCommand({ wallIds: ['w1'], newHeight: 4.0 });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);
        expect(opening(store)).toMatchObject({ offset: 1.0, sillHeight: 0, height: 2.1 });
    });
});
