// §OPENING-PROFILE (L-1252) — CHANGING the shape of an opening that ALREADY EXISTS.
//
// The mode bar authors NEW openings. The founder has 85 windows already placed, so an
// authoring-only capability reads as broken — this is the edit half.
//
// ⭐ THE ASSERTION THAT MATTERS IS THE WALL ONE, AND IT EXISTS BECAUSE THE HOP WAS MISSING.
// `WallStore.updateWindow` — the mirror write every dimensional edit funnels through — copies
// exactly FOUR fields onto `wall.openings[]`: width, height, sillHeight, offset. A profile change
// routed only through it would write the windowStore, report success, and leave the WALL still
// cutting a rectangle. The panel would show a circle the model does not have: the frame and the
// void diverge (C86 §11 #1), which is the defect this whole family keeps producing.
//
// So the test drives the REAL stores through the REAL command and then reads `wall.openings[0]`
// — the record the geometry arms actually consume. Asserting the windowStore alone would have
// passed against the broken version, which is exactly why it is not the assertion.

import { describe, it, expect, beforeEach } from 'vitest';
import { wallStore } from '@pryzm/geometry-wall';
import { windowStore as standaloneWindowStore } from '@pryzm/geometry-window';
import { UpdateWindowParameterCommand } from '../src/windows/UpdateWindowParameterCommand';

const WALL_ID = 'wall-profile-1';
const OPENING_ID = 'op-profile-1';
const WINDOW_ID = 'win-profile-1';

function ctx(): any {
    return { stores: { wallStore } };
}

// ADR-0318 — `WallStore` REFUSES to invent a level rather than answer with a fiction, so the
// engine half must be attached before a wall can be added. Attaching a minimal real kernel is
// the honest way to satisfy that; stubbing `WallStore` itself would stub the thing under test.
const LEVEL = { id: 'level-0', name: 'Level 0', elevation: 0, height: 3 };
const bimKernel: any = {
    getLevels: () => [LEVEL],
    getLevelById: (id: string) => (id === LEVEL.id ? LEVEL : undefined),
    registerElement: () => {},
};

function seed(curve?: unknown) {
    wallStore.attachEngine({} as never, bimKernel);
    wallStore.clear?.();
    standaloneWindowStore.clear?.();

    wallStore.add({
        id: WALL_ID,
        type: 'wall',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3,
        thickness: 0.3,
        levelId: 'level-0',
        ...(curve ? { curve } : {}),
    } as never);

    wallStore.addOpening(WALL_ID, {
        id: OPENING_ID,
        type: 'window',
        offset: 2,
        width: 1.2,
        height: 1.5,
        sillHeight: 0.9,
        elementId: WINDOW_ID,
    } as never);

    standaloneWindowStore.add({
        id: WINDOW_ID,
        openingId: OPENING_ID,
        wallId: WALL_ID,
        offset: 2,
        width: 1.2,
        height: 1.5,
        sillHeight: 0.9,
    } as never);
}

function openingNow(): any {
    return wallStore.getById(WALL_ID)?.openings?.find((o: any) => o.elementId === WINDOW_ID);
}

describe('§A — the profile reaches the WALL, not just the window record', () => {
    beforeEach(() => seed());

    it('⭐ a profile change lands on wall.openings[] — the record the geometry reads', () => {
        const cmd = new UpdateWindowParameterCommand(WINDOW_ID, { openingProfile: 'round-arch' } as never, {} as never);
        const res = cmd.execute(ctx());
        expect(res.success).toBe(true);

        // The standalone record — necessary, and NOT sufficient.
        expect(standaloneWindowStore.getById(WINDOW_ID)?.openingProfile).toBe('round-arch');
        // ⭐ The wall's own opening. Without the updateOpening hop this is still undefined and
        // the wall keeps cutting a rectangle while the panel claims otherwise.
        expect(openingNow()?.openingProfile).toBe('round-arch');
    });

    it('flipping to CIRCULAR squares the box on BOTH records', () => {
        const cmd = new UpdateWindowParameterCommand(WINDOW_ID, { openingProfile: 'circular' } as never, {} as never);
        expect(cmd.execute(ctx()).success).toBe(true);

        const win = standaloneWindowStore.getById(WINDOW_ID)!;
        // width IS the diameter (C86 §10.1 PR-8) — the 1.5 height is carried down to 1.2.
        expect(win.width).toBe(1.2);
        expect(win.height).toBe(1.2);
        expect(openingNow()?.openingProfile).toBe('circular');
        expect(openingNow()?.height).toBe(1.2);
    });

    it('⛔ NON-VACUITY — the seeded window is NOT square, so the squaring really fires', () => {
        // Without this the test above could pass on a record that was already 1.2 x 1.2.
        expect(standaloneWindowStore.getById(WINDOW_ID)!.height).toBe(1.5);
    });

    it('an edit that does NOT touch the profile leaves it alone', () => {
        new UpdateWindowParameterCommand(WINDOW_ID, { openingProfile: 'round-arch' } as never, {} as never).execute(ctx());
        new UpdateWindowParameterCommand(WINDOW_ID, { width: 1.4 } as never, {} as never).execute(ctx());
        expect(openingNow()?.openingProfile).toBe('round-arch');
        expect(openingNow()?.width).toBeCloseTo(1.4, 6);
    });
});

describe('§B — ⛔ a host that cannot carry the shape REFUSES, out loud', () => {
    beforeEach(() => seed({ control: { x: 3, y: 0, z: 1 }, segments: 12 }));

    it('a CURVED host refuses the change, naming the reason and the alternative', () => {
        const cmd = new UpdateWindowParameterCommand(WINDOW_ID, { openingProfile: 'circular' } as never, {} as never);
        const res = cmd.execute(ctx());

        expect(res.success).toBe(false);
        const reason = (res.info ?? []).join(' ').toLowerCase();
        expect(reason).toContain('curved');
        expect(reason).toContain('straight wall');   // the live alternative — C16 CA-18
    });

    it('⭐ AND THE MODEL IS UNCHANGED — a refusal must not half-apply', () => {
        new UpdateWindowParameterCommand(WINDOW_ID, { openingProfile: 'circular' } as never, {} as never).execute(ctx());
        expect(openingNow()?.openingProfile).toBeUndefined();
        expect(standaloneWindowStore.getById(WINDOW_ID)?.openingProfile).toBeUndefined();
        // and the dimensions were not squared on the way to being refused
        expect(standaloneWindowStore.getById(WINDOW_ID)?.height).toBe(1.5);
    });

    it('the same curved host still accepts a RECTANGULAR profile — non-vacuity', () => {
        // Without this the refusal above could be a blanket ban on curved hosts, which would be
        // a regression rather than a gate.
        const res = new UpdateWindowParameterCommand(WINDOW_ID, { openingProfile: 'rectangular' } as never, {} as never).execute(ctx());
        expect(res.success).toBe(true);
    });
});
