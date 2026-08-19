/**
 * §CENSUS-DELETESELECTED (L-1109) — THE CENSUS, AS A GATE RATHER THAN A DOCUMENT.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * L-1107 found that keyboard Delete on a selected GRID did nothing and said nothing.
 * The cause was structural, not grid-specific: `deleteSelected()` recognised exactly
 * one selection substrate — a THREE `Object3D` on `selectionManager.selectedObject` —
 * and every other substrate fell through its `!selectionManager.selectedObject`
 * early-return. The follow-up question was "if GRID had no arm, what else does not?".
 *
 * A prose census answers that once and then rots the next time somebody adds a
 * selectable thing. These tests are the census written so it CANNOT rot: they derive
 * the list of selection slots from `PlanViewCanvas` itself and require an arm for
 * each. Add `getSelectedRoomId()` tomorrow and the first test fails until Delete
 * either handles a room or refuses one by name.
 *
 * WHAT THE CENSUS FOUND (2026-08-19)
 * ──────────────────────────────────
 *   • `_selectedGridId`  — arm added by L-1107.
 *   • `_selectedLevelId` — NO ARM. `PlanViewInteraction` sets it on a datum-head or
 *     datum-line click (:891, :903), so it is fully user-reachable; Delete answered
 *     "No element selected to delete" while a level datum sat highlighted. A refusal
 *     naming the wrong reason (C84 EI-2). Arm added by L-1109.
 *   • The BIM `Object3D` arm reported SUCCESS unconditionally — see below.
 *
 * ⚠ THE BIGGER FINDING, and why two of these tests read source rather than behaviour.
 * `deleteSelected` is a closure defined inside `initUI()`, an ~3,000-line bootstrap
 * that constructs the entire editor. It is not importable and not callable in a unit
 * test, and a rewritten fake of it would be a fake built from the header — provably
 * unable to falsify the header. What CAN be pinned exactly is the two source shapes
 * that made the defect: a fire-and-forget dispatch, and a success toast that does not
 * depend on the result. Those are the regression, so those are what is asserted. The
 * same precedent is already established by `planPaneSiteContextParity.spec.ts` here
 * and `northArrowProjectContext.test.ts` in core-app-model.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const INIT_UI_SRC = readFileSync(resolve(HERE, '../initUI.ts'), 'utf8');
const VIEW_PANES_SRC = readFileSync(resolve(HERE, '../views/viewPanes.ts'), 'utf8');
const PLAN_CANVAS_SRC = readFileSync(
    resolve(HERE, '../../../../../packages/core-app-model/src/views/PlanViewCanvas.ts'),
    'utf8',
);
const DELETE_HANDLER_SRC = readFileSync(
    resolve(HERE, '../../../../../plugins/view/src/handlers/DeleteElement.ts'),
    'utf8',
);

/**
 * Every Canvas2D selection slot the plan pane exposes, derived from the canvas rather
 * than listed here. `getSelectedGridId` → `Grid`, `getSelectedLevelId` → `Level`.
 */
function canvasSelectionKinds(): string[] {
    const found = new Set<string>();
    for (const m of PLAN_CANVAS_SRC.matchAll(/\bgetSelected([A-Z]\w*?)Id\s*\(/g)) {
        found.add(m[1]!);
    }
    return [...found].sort();
}

describe('§L-1109 — the deleteSelected census: every selection kind has an arm', () => {
    it('PlanViewCanvas still exposes the two selection slots this census was built over', () => {
        // A canary, not a duplicate: if these disappear or are renamed, the derived
        // tests below would silently assert nothing at all.
        const kinds = canvasSelectionKinds();
        expect(kinds).toContain('Grid');
        expect(kinds).toContain('Level');
    });

    it('EVERY Canvas2D selection kind is resolvable through the ONE pane authority', () => {
        // A per-kind accessor must exist in viewPanes.ts — not privately in initUI,
        // which is exactly how the two views diverged in the first place (C84 EI-1).
        for (const kind of canvasSelectionKinds()) {
            expect(
                VIEW_PANES_SRC,
                `viewPanes.ts has no selected${kind}InAnyPane() — a ${kind} selection cannot be resolved across panes`,
            ).toContain(`selected${kind}InAnyPane`);
            expect(
                VIEW_PANES_SRC,
                `viewPanes.ts has no clear${kind}SelectionInAllPanes() — a deleted ${kind} would stay highlighted in the other pane`,
            ).toContain(`clear${kind}SelectionInAllPanes`);
        }
    });

    it('EVERY Canvas2D selection kind reaches deleteSelected — no kind is silently unhandled', () => {
        // THE CENSUS ASSERTION. This is the test that fails when the next selectable
        // thing is added without a delete arm.
        for (const kind of canvasSelectionKinds()) {
            expect(
                INIT_UI_SRC,
                `deleteSelected never consults selected${kind}InAnyPane() — Delete on a selected ${kind} falls through to "No element selected to delete", which is FALSE`,
            ).toContain(`selected${kind}InAnyPane`);
        }
    });

    it('every Canvas2D delete arm reports its refusal instead of returning silently', () => {
        // C16 CA-18 / C84 EI-2 — a delete that changes nothing must SAY so. Each arm
        // toasts a "<kind> not deleted — <reason>" sentence carrying the command's own
        // words; a bare `return` would be the defect this census exists to remove.
        for (const kind of canvasSelectionKinds()) {
            expect(
                INIT_UI_SRC,
                `the ${kind} delete arm has no "not deleted" refusal — a refused delete would look identical to a completed one`,
            ).toMatch(new RegExp(`${kind} not deleted`, 'i'));
        }
    });
});

describe('§L-1109 — the BIM element arm no longer reports success for a delete that did nothing', () => {
    it('the element.delete dispatch is AWAITED, not fire-and-forget', () => {
        expect(INIT_UI_SRC).toMatch(/await\s+bus\.executeCommand\(\s*'element\.delete'/);
    });

    it('the OLD fire-and-forget shape is gone', () => {
        // The exact regression: dispatch, attach `.catch(console.error)`, then toast
        // success synchronously on the next line. C80 §10.f names this shape.
        expect(INIT_UI_SRC).not.toMatch(
            /executeCommand\('element\.delete',[\s\S]{0,200}?\)\s*\n\s*\.catch\(/,
        );
    });

    it('the success toast is guarded by the refusal channel', () => {
        // `EventRecord.refusal` is the value channel C80 §1.4 minted precisely so a
        // refusal cannot be dropped on the floor. Reading it is what makes the toast
        // honest.
        expect(INIT_UI_SRC).toContain('refusal');
        expect(INIT_UI_SRC).toMatch(/if\s*\(refusal\)/);
    });

    it('a missing command bus refuses out loud rather than toasting success', () => {
        // Optional chaining used to make this case invisible: with no bus the whole
        // expression was `undefined`, nothing dispatched, and the success toast fired.
        expect(INIT_UI_SRC).toMatch(/not deleted — the command bus is not ready/);
    });
});

describe('§L-1109 — DeleteElementHandler returns a typed refusal, not an empty success', () => {
    it('no longer discards the CommandResult it gets back', () => {
        // The defect verbatim: `cm.execute(...)` called for effect, result assigned to
        // nothing, then `{ forward: [], inverse: [] }` returned regardless.
        expect(DELETE_HANDLER_SRC).toMatch(/res\s*=\s*cm\.execute\(/);
        expect(DELETE_HANDLER_SRC).toMatch(/res\.success\s*===\s*false/);
    });

    it('refuses through the C80 §1.4 constructor, so both numbers cannot be forgotten', () => {
        expect(DELETE_HANDLER_SRC).toContain('capabilityRefused');
        expect(DELETE_HANDLER_SRC).toMatch(/asked:\s*1/);
        expect(DELETE_HANDLER_SRC).toMatch(/unaccountedFor:\s*1/);
        expect(DELETE_HANDLER_SRC).toMatch(/protects:/);
    });

    it('covers all three ways the delete can fail to happen', () => {
        // Missing command system, an explicit refusal from the command, and a throw.
        // The third used to be `console.error` and nothing else.
        expect(DELETE_HANDLER_SRC).toContain('ENGINE_NOT_AVAILABLE');
        expect(DELETE_HANDLER_SRC).toContain('UNSUPPORTED_ELEMENT_TYPE');
        expect(DELETE_HANDLER_SRC).toContain('PLANNER_THREW');
    });

    it('does NOT treat an undefined CommandResult as a refusal', () => {
        // Guarding the inverse defect. Several legacy command paths return nothing on
        // the happy path; calling those refusals would report failure for deletes that
        // worked, which is the same lie pointing the other way.
        expect(DELETE_HANDLER_SRC).toMatch(/res\s*&&\s*res\.success\s*===\s*false/);
    });
});
