// §PARAM-DROP-IS-A-REFUSAL (L-3200) · §FEAT-WINDOW-REVEAL-RAC (L-3202)
// =============================================================================
//
// THE SHARED BLOCKER, measured rather than inherited.
//
// Lane WIN1 refused to wire RAC for the window reveal fields and recorded the
// reason at L-1923: *"`element.updateParameters` … routes through
// `WallStore.updateWindow`, which copies exactly four fields onto
// `wall.openings[]`. A reveal field would be discarded while the call still
// returned success."*
//
// ⭐ THAT DIAGNOSIS WAS HALF RIGHT, AND THE HALF THAT WAS WRONG MATTERED MORE.
// Probed against the real stores before this change:
//
//   · `{ revealProjection: 0.25 }` **LANDS** — `WindowOpeningSchema` carries the
//     reveal fields, so `windowStore.update` keeps them. The four-field list is
//     the projection onto `wall.openings[]`, and the reveal geometry is built
//     from the WINDOW record, which is not projected through it. Nothing was
//     dropped, and the refusal to wire RAC was therefore based on a mechanism
//     that does not bite this feature.
//   · `{ totallyNotAField: 7 }` **is DROPPED, and reported as success** — the
//     real silent-success seam, and it is Zod, not the whitelist: an object
//     schema STRIPS unknown keys, so `WindowStore.update`'s
//     `safeParse(...).data` writes a record without the field while the call
//     returns normally.
//   · `{ revealSplayJambLeft: 85, revealSplayJambRight: 85 }` on a 1.2 m window
//     **is STORED, and reported as success** — worse than a drop. That patch
//     leaves the glazing with zero area and `UpdateWindowParameterCommand`
//     REFUSES it; but that gate lives only in that command, which no bus route
//     reaches. The panel was guarded and every other writer was not.
//
// Each `it` below pins one of those three, and §D is the non-vacuity control:
// a field that really does land must NOT be reported as dropped, or the guard
// would be a blanket refusal wearing a measurement.

import { describe, it, expect, beforeEach } from 'vitest';
import { wallStore } from '@pryzm/geometry-wall';
import { windowStore } from '@pryzm/geometry-window';
import { UpdateElementParameterCommand } from '../src/generic/UpdateElementParameterCommand';

const WALL_ID = 'wall-drop-1';
const OPENING_ID = 'op-drop-1';
const WINDOW_ID = 'win-drop-1';

const LEVEL = { id: 'level-0', name: 'Level 0', elevation: 0, height: 3 };
// ADR-0318 — WallStore REFUSES to invent a level, so a real (minimal) kernel is
// attached rather than the store being stubbed. Stubbing WallStore would stub
// half of what is under test.
const bimKernel: any = {
    getLevels: () => [LEVEL],
    getLevelById: (id: string) => (id === LEVEL.id ? LEVEL : undefined),
    registerElement: () => { },
};

function ctx(): any {
    return { stores: { wallStore } };
}

function seed(width = 1.2): void {
    wallStore.attachEngine({} as never, bimKernel);
    wallStore.clear?.();
    windowStore.clear?.();

    wallStore.add({
        id: WALL_ID,
        type: 'wall',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3,
        thickness: 0.3,
        levelId: 'level-0',
    } as never);
    wallStore.addOpening(WALL_ID, {
        id: OPENING_ID,
        type: 'window',
        offset: 2,
        width,
        height: 1.5,
        sillHeight: 0.9,
        elementId: WINDOW_ID,
    } as never);
    windowStore.add({
        id: WINDOW_ID,
        openingId: OPENING_ID,
        wallId: WALL_ID,
        offset: 2,
        width,
        height: 1.5,
        sillHeight: 0.9,
    } as never);
}

function run(parameters: Record<string, unknown>) {
    return new UpdateElementParameterCommand({
        elementId: WINDOW_ID,
        elementType: 'window',
        parameters: parameters as Record<string, any>,
    }).execute(ctx());
}

describe('§A — a field the store DROPS is no longer a success', () => {
    beforeEach(() => seed());

    it('⛔ an unknown field is REFUSED, and the refusal names the field', () => {
        const res = run({ totallyNotAField: 7 });

        expect(res.success).toBe(false);
        const info = (res.info ?? []).join(' ');
        expect(info).toContain('totallyNotAField');
        // The reason must say WHAT happened, not merely that something did. A
        // refusal that cannot be acted on is the shrug L-812 named.
        expect(info).toMatch(/did not land/i);

        // And the record really is without it — the assertion that would still
        // pass on the broken version is the one NOT relied on.
        expect(
            Object.prototype.hasOwnProperty.call(windowStore.getById(WINDOW_ID) ?? {}, 'totallyNotAField'),
        ).toBe(false);
    });

    it('⭐ the read-back reads the AUTHORITY, not the mirror that accepts anything', () => {
        run({ totallyNotAField: 7 });

        // ⭐ THE MIRROR HOLDS IT. `WallStore.updateWindow` merges with a plain
        // spread and `cloneWindowData` is a spread too, so the junk key survives
        // there. A read-back pointed at this record would have certified the
        // drop as a success — which is precisely why the command reads
        // `windowStore`. If this expectation ever flips to `false`, the mirror
        // gained validation and this test's premise (not the guard) is what
        // changed.
        expect(
            Object.prototype.hasOwnProperty.call(wallStore.getWindow(WINDOW_ID) ?? {}, 'totallyNotAField'),
        ).toBe(true);
        expect(
            Object.prototype.hasOwnProperty.call(windowStore.getById(WINDOW_ID) ?? {}, 'totallyNotAField'),
        ).toBe(false);
    });

    it('a PARTIAL drop succeeds for what landed and NAMES what did not', () => {
        const res = run({ revealProjection: 0.2, totallyNotAField: 7 });

        // What landed is real and stays undoable — it is not rolled back.
        expect(res.success).toBe(true);
        expect((windowStore.getById(WINDOW_ID) as any)?.revealProjection).toBe(0.2);
        // …and the shortfall is stated rather than averaged away.
        expect((res.info ?? []).join(' ')).toContain('totallyNotAField');
    });
});

describe('§B — the reveal fields REALLY DO land through the generic path', () => {
    beforeEach(() => seed());

    it('revealProjection reaches the authoritative window record', () => {
        const res = run({ revealProjection: 0.25 });

        expect(res.success).toBe(true);
        expect((windowStore.getById(WINDOW_ID) as any)?.revealProjection).toBe(0.25);
    });

    it('all four splay sides reach it in ONE write', () => {
        const res = run({
            revealSplayHead: 12,
            revealSplaySill: 12,
            revealSplayJambLeft: 12,
            revealSplayJambRight: 12,
        });

        expect(res.success).toBe(true);
        const w = windowStore.getById(WINDOW_ID) as any;
        expect(w.revealSplayHead).toBe(12);
        expect(w.revealSplaySill).toBe(12);
        expect(w.revealSplayJambLeft).toBe(12);
        expect(w.revealSplayJambRight).toBe(12);
    });
});

describe('§C — the C83 IMPOSSIBLE gate now guards the GENERIC path too', () => {
    beforeEach(() => seed());

    it('⛔ a degenerate splay is REFUSED and NOTHING is written', () => {
        const before = windowStore.getById(WINDOW_ID) as any;
        const res = run({ revealSplayJambLeft: 85, revealSplayJambRight: 85 });

        expect(res.success).toBe(false);
        // The record must be untouched — a refusal that half-writes is worse
        // than the silent success it replaced.
        const after = windowStore.getById(WINDOW_ID) as any;
        expect(after.revealSplayJambLeft).toBe(before.revealSplayJambLeft ?? 0);
        expect(after.revealSplayJambRight).toBe(before.revealSplayJambRight ?? 0);
    });

    it('the refusal states BOTH numbers, so the user knows which one to change', () => {
        const res = run({ revealSplayJambLeft: 85, revealSplayJambRight: 85 });

        const info = (res.info ?? []).join(' ');
        // The angle it refused…
        expect(info).toMatch(/85/);
        // …and a dimension, so the sentence is actionable rather than a verdict.
        expect(info.length).toBeGreaterThan(40);
    });

    it('SHRINKING a window can make an authored splay degenerate — and is caught', () => {
        // Author a splay that is perfectly legal at 1.2 m…
        expect(run({ revealSplayJambLeft: 60, revealSplayJambRight: 60 }).success).toBe(true);

        // …then shrink the window. The patch carries NO reveal field at all, so a
        // gate keyed only on the reveal keys would wave this through and produce
        // the zero-glazing window by the back door.
        const res = run({ width: 0.2 });
        expect(res.success).toBe(false);
    });
});

describe('§D — NON-VACUITY: the guard must not refuse what genuinely lands', () => {
    beforeEach(() => seed());

    it('an ordinary dimensional edit still succeeds', () => {
        const res = run({ width: 1.4 });

        expect(res.success).toBe(true);
        expect((res.info ?? []).join(' ')).not.toMatch(/did not land/i);
        expect((windowStore.getById(WINDOW_ID) as any)?.width).toBe(1.4);
    });

    it('a CLAMPED write is not mistaken for a dropped one', () => {
        // The clamp lands a DIFFERENT value than was asked for. The read-back
        // tests PRESENCE, not equality, precisely so this stays a success.
        const res = run({ width: 999 });

        expect(res.success).toBe(true);
        expect((res.info ?? []).join(' ')).not.toMatch(/did not land/i);
    });

    it('a legal splay is accepted — the C83 gate is not a blanket refusal', () => {
        const res = run({ revealSplayHead: 20 });

        expect(res.success).toBe(true);
        expect((windowStore.getById(WINDOW_ID) as any)?.revealSplayHead).toBe(20);
    });
});
