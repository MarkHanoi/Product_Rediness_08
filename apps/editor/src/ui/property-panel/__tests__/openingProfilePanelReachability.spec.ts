/**
 * §OPENING-PROFILE-PANEL-REACHABILITY (L-10948) — the shape control the founder
 * could not find is REACHABLE from the panel he actually opens, and its refusal
 * REACHES HIM.
 *
 * ── THE REPORT, AND WHAT MEASURING IT CORRECTED ─────────────────────────────
 *
 * He selected a placed window (WN011) and tried to change its shape by changing
 * its TYPE. *"if i change the type of window - the profile (rectangle - circle)
 * doesnt work - why?"*
 *
 * ⛔ TYPE-DOES-NOT-CHANGE-SHAPE IS CORRECT BY DESIGN AND MUST STAY THAT WAY.
 * `WindowModePicker.ts:117-126` separates the axes deliberately: a TYPE is
 * material and glazing build-up, a PROFILE is geometry, and minting "Circular
 * Timber Casement" as a type was refused on purpose. The two axes are not
 * collapsed here and must not be.
 *
 * ⭐ AND THE BRIEF THIS TEST WAS WRITTEN FROM WAS WRONG ABOUT THE GAP. It read
 * *"grep finds NO caller in apps/editor/src/ui/property-panel … once a window is
 * placed there is no UI route to its profile at all"*. **MEASURED: THE CONTROL
 * ALREADY SHIPS.** `WindowSection` renders a **Shape** row and `DoorSection` a
 * **Head Shape** row, both driving `openingProfile`, and
 * `PropertyPanelBodyRenderer` mounts both. The grep missed it because the
 * builders live in `packages/geometry-window` / `packages/geometry-door` — the
 * property panel CALLS them, it does not contain them. Building a second control
 * would have been a rival primitive for a control that was already there.
 *
 * ⭐ THE REAL DEFECT WAS ONE HOP LATER: `dispatch()` returned `void` and sent
 * every refusal to `console.warn`. `openingProfileRefusal` states BOTH the cause
 * and the live alternative (C16 CA-18) — and none of it reached the screen, so a
 * user whose change was correctly refused saw a control that appeared to do
 * nothing, and went hunting through the type dropdown. That is C74 broken at the
 * last hop, and it is what §FIX-PANEL-REFUSAL-SWALLOWED closes.
 *
 * ── THREE ARMS, BECAUSE THE BREAK IS BETWEEN THEM ───────────────────────────
 *
 *   ARM A — the section builders load and RENDER the control against a REAL
 *           store. Not a fixture rail with a button pushed into it: the DOM is
 *           read back out of what `buildWindowSection` itself produced from a
 *           seeded record. (L-10930 shipped exactly that vacuous test —
 *           a spec that asserted an array literal contains what the same file
 *           put in it, and certified a dead button as wired.)
 *   ARM B — `PropertyPanelBodyRenderer.ts` MOUNTS those builders for the
 *           window / door element types. Source-level, and labelled as such.
 *   ARM C — ⭐ THE JOIN: the options the control offers are the LEGALITY TABLE's,
 *           and a refusal is RENDERED rather than swallowed. This is the arm the
 *           founder's report is about — a control and a command can each be
 *           perfectly correct while nothing carries the answer between them.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { wallStore, OPENING_PROFILE_LABELS, openingProfilesFor } from '@pryzm/geometry-wall';
import { windowStore, buildWindowSection, setWindowSectionCommandManager } from '@pryzm/geometry-window';
import { doorStore, buildDoorSection, setDoorSectionCommandManager } from '@pryzm/geometry-door';

const BODY_RENDERER = resolve('apps/editor/src/ui/property-panel/PropertyPanelBodyRenderer.ts');

const WALL_ID = 'wall-panel-reach';
const WINDOW_ID = 'win-panel-reach';
const DOOR_ID = 'door-panel-reach';

const LEVEL = { id: 'level-0', name: 'Level 0', elevation: 0, height: 3 };
const bimKernel: any = {
    getLevels: () => [LEVEL],
    getLevelById: (id: string) => (id === LEVEL.id ? LEVEL : undefined),
    registerElement: () => {},
};

/** A real wall with a real window and a real door hosted in it. */
function seed(): void {
    wallStore.attachEngine({} as never, bimKernel);
    wallStore.clear?.();
    windowStore.clear?.();
    doorStore.clear?.();
    wallStore.add({
        id: WALL_ID,
        type: 'wall',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
        height: 3,
        thickness: 0.3,
        levelId: 'level-0',
    } as never);
    windowStore.add({
        id: WINDOW_ID, openingId: 'op-w', wallId: WALL_ID,
        offset: 2, width: 1.2, height: 1.5, sillHeight: 0.9,
    } as never);
    doorStore.add({
        id: DOOR_ID, openingId: 'op-d', wallId: WALL_ID,
        offset: 6, width: 0.9, height: 2.1, sillHeight: 0,
    } as never);
}

/** Every `<select>` in a built section, paired with its row label. */
function selectsByLabel(section: HTMLElement): Map<string, HTMLSelectElement> {
    const out = new Map<string, HTMLSelectElement>();
    for (const row of Array.from(section.querySelectorAll('.dw-field'))) {
        const label = row.querySelector('.dw-label')?.textContent?.trim() ?? '';
        const sel = row.querySelector('select');
        if (label.length > 0 && sel) out.set(label, sel as HTMLSelectElement);
    }
    return out;
}

describe('§OPENING-PROFILE-PANEL-REACHABILITY · ARM A — the control RENDERS from the real builders', () => {
    beforeEach(seed);

    it('⭐ the WINDOW section really contains a Shape control', () => {
        const section = buildWindowSection(WINDOW_ID);
        expect(section, 'buildWindowSection returned null for a window that IS in the store').not.toBeNull();
        const shape = selectsByLabel(section!).get('Shape');
        expect(shape, 'no "Shape" row in the rendered window section').toBeDefined();
    });

    it('⭐ the DOOR section really contains a Head Shape control', () => {
        const section = buildDoorSection(DOOR_ID);
        expect(section).not.toBeNull();
        expect(selectsByLabel(section!).get('Head Shape')).toBeDefined();
    });

    it('⛔ NON-VACUITY — the builder returns null for an id the store does not hold', () => {
        expect(buildWindowSection('no-such-window')).toBeNull();
    });
});

describe('§OPENING-PROFILE-PANEL-REACHABILITY · ARM B — the panel MOUNTS those builders', () => {
    // SOURCE-LEVEL, and named as such: it cannot tell you the panel works, only
    // that the mount point exists in the file that renders the founder's panel.
    const src = readFileSync(BODY_RENDERER, 'utf8');

    it('imports both section builders', () => {
        expect(src).toMatch(/import\s*\{\s*buildWindowSection\s*\}\s*from\s*'@pryzm\/geometry-window'/);
        expect(src).toMatch(/import\s*\{\s*buildDoorSection\s*\}\s*from\s*'@pryzm\/geometry-door'/);
    });

    it('mounts them for the window and door element types', () => {
        expect(src).toContain("buildWindowSection(elementData.id)");
        expect(src).toContain("buildDoorSection(elementData.id)");
    });
});

describe('§OPENING-PROFILE-PANEL-REACHABILITY · ARM C — ⭐ THE JOIN', () => {
    beforeEach(seed);

    it('⭐ the options ARE the legality table — a DOOR IS NEVER OFFERED CIRCULAR', () => {
        const section = buildDoorSection(DOOR_ID)!;
        const values = Array.from(selectsByLabel(section).get('Head Shape')!.options).map((o) => o.value);
        expect(values).toEqual([...openingProfilesFor('door')]);
        expect(values).not.toContain('circular');
    });

    it('⛔ NON-VACUITY — a WINDOW is offered all four, so the door list is a real restriction', () => {
        const section = buildWindowSection(WINDOW_ID)!;
        const values = Array.from(selectsByLabel(section).get('Shape')!.options).map((o) => o.value);
        expect(values).toContain('circular');
        expect(values.length).toBeGreaterThan(openingProfilesFor('door').length);
    });

    it('the labels are geometry-wall\'s own, so the panel and the draw bar cannot drift', () => {
        const section = buildWindowSection(WINDOW_ID)!;
        const labels = Array.from(selectsByLabel(section).get('Shape')!.options).map((o) => o.textContent ?? '');
        for (const kind of openingProfilesFor('window')) {
            expect(labels.some((l) => l.startsWith(OPENING_PROFILE_LABELS[kind]))).toBe(true);
        }
    });

    it('⭐⭐ A REFUSAL REACHES THE SCREEN — this is the founder\'s "why?"', () => {
        // A command manager that refuses the way the real one does: with a reason.
        const REASON = 'A circular opening cannot reach the floor — raise the sill above the floor.';
        setWindowSectionCommandManager({
            execute: () => ({ success: false, affectedElementIds: [], info: [REASON] }),
        });
        const section = buildWindowSection(WINDOW_ID)!;
        const shape = selectsByLabel(section).get('Shape')!;

        shape.value = 'circular';
        shape.dispatchEvent(new Event('change'));

        const shown = section.textContent ?? '';
        expect(shown, 'the refusal reason was swallowed — this is the defect').toContain(REASON);
        // ⛔ AND THE CONTROL IS PUT BACK. A dropdown left reading "Circular" over a
        // rectangle the model kept is the panel asserting a shape the model does not
        // have — C86 §11 #1, in the UI.
        expect(shape.value).toBe('rectangular');
        setWindowSectionCommandManager(null);
    });

    it('⛔ NON-VACUITY — on SUCCESS no refusal is shown and the choice STANDS', () => {
        setWindowSectionCommandManager({
            execute: () => {
                windowStore.update(WINDOW_ID, { openingProfile: 'segmental-arch' } as never);
                return { success: true, affectedElementIds: [WINDOW_ID] };
            },
        });
        const section = buildWindowSection(WINDOW_ID)!;
        const shape = selectsByLabel(section).get('Shape')!;
        shape.value = 'segmental-arch';
        shape.dispatchEvent(new Event('change'));

        expect(section.textContent ?? '').not.toContain('⛔');
        expect(shape.value).toBe('segmental-arch');
        setWindowSectionCommandManager(null);
    });

    it('an UNREADABLE result says so, and does NOT invent a reason', () => {
        setWindowSectionCommandManager({ execute: () => ({ success: false, affectedElementIds: [] }) });
        const section = buildWindowSection(WINDOW_ID)!;
        const shape = selectsByLabel(section).get('Shape')!;
        shape.value = 'circular';
        shape.dispatchEvent(new Event('change'));
        expect(section.textContent ?? '').toMatch(/no reason was given/);
        setWindowSectionCommandManager(null);
    });

    it('the DOOR panel surfaces its refusal too', () => {
        const REASON = 'A round-arch opening cannot be cut in a CURVED wall.';
        setDoorSectionCommandManager({
            execute: () => ({ success: false, affectedElementIds: [], info: [REASON] }),
        });
        const section = buildDoorSection(DOOR_ID)!;
        const shape = selectsByLabel(section).get('Head Shape')!;
        shape.value = 'round-arch';
        shape.dispatchEvent(new Event('change'));
        expect(section.textContent ?? '').toContain(REASON);
        expect(shape.value).toBe('rectangular');
        setDoorSectionCommandManager(null);
    });
});
