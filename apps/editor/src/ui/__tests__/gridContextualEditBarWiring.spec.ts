/**
 * §GRID-CONTEXTUAL-EDIT (SV2) — the wiring invariants behind Move/Delete on a selected grid.
 *
 * WHAT THIS PINS, AND WHY THESE FOUR
 * ──────────────────────────────────
 * The founder asked for a contextual edit bar on a selected grid, "like a wall has". The
 * ordering rule for that work is absolute — the COMMAND first, the BUTTON second — and
 * three of the four invariants below are things that were measured WRONG while building
 * it. They are not hypothetical:
 *
 *   1. `ContextualEditBar` subscribed ONLY to `bim-selection-changed` and gated its whole
 *      visibility on `!!obj`, a THREE Object3D. A grid lives on `PlanViewCanvas
 *      ._selectedGridId` and announces itself on `pryzm-grid-selected`, so the bar could
 *      NEVER see a grid. The condition was unsatisfiable, not merely unwired.
 *   2. `pryzm-grid-selected` was emitted on SELECT only. All three DESELECT sites cleared
 *      the canvas field and told nobody — so a bar wired to the select edge alone would
 *      appear on a grid click and never go away.
 *   3. The bar's Delete BUTTON calls `BimService.deleteSelected()`, a THIRD delete route
 *      whose entire body is wrapped in `if (selectionManager.selectedObject)`. It has no
 *      grid arm and no refusal, so it returns silently — surfacing the bar without a grid
 *      arm here would have shipped exactly the dead button the class's own comment warns
 *      about (floor and ceiling, L-1065).
 *   4. The grid arm DISABLES Move and rewrites its tooltip. Neither is derived from
 *      `elementType`, so unless the element path clears them, a wall selected after a grid
 *      inherits a greyed-out Move button explaining that grids cannot be dragged.
 *
 * ⚠ WHAT THIS DOES NOT PROVE, stated so the file is not mistaken for full reachability.
 * These read SOURCE. `ContextualEditBar` takes a `BimService` and a tool bag and reaches
 * for `window.runtime`, `window.bimManager` and `window.commandManager` at call time;
 * standing that up would mean faking every one of them, and a bar assembled from fakes
 * built to this file's expectations could not falsify those expectations. The behavioural
 * half that CAN be measured honestly is the capability table, and it is —
 * `packages/core-app-model/src/grids/GridEditVariants.test.ts`, 9/9, including the
 * assertion that Move is refused for every grid shape so an enabled dead button cannot
 * ship. What is missing is a DOM-level test that the bar becomes visible on a real grid
 * click; that needs a harness this suite does not have, and it is named rather than faked.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const CEB_SRC = readFileSync(resolve(HERE, '../ContextualEditBar.ts'), 'utf8');
const PVI_SRC = readFileSync(
    resolve(HERE, '../../engine/views/PlanViewInteraction.ts'),
    'utf8',
);

describe('§GRID-CONTEXTUAL-EDIT — the bar can SEE a grid', () => {
    it('subscribes to the channel a grid actually announces itself on', () => {
        expect(CEB_SRC).toMatch(/events\?\.on\('pryzm-grid-selected'/);
    });

    it('its visibility is no longer gated on a THREE Object3D alone', () => {
        // The line that made the whole feature unsatisfiable was `setVisible(!!obj)`.
        expect(CEB_SRC).toMatch(/setVisible\(!!obj \|\| !!this\._selectedGridId\)/);
    });

    it('re-derives the selection from the ONE pane authority, not from the payload', () => {
        // Trusting the event payload would mint a second answer to "which grid is
        // selected", and the canvas is the one that actually holds it (C84 EI-1).
        expect(CEB_SRC).toContain('selectedGridInAnyPane');
    });
});

describe('§GRID-CONTEXTUAL-EDIT — deselection is announced, so the bar can hide', () => {
    it('PlanViewInteraction emits on the DESELECT edge too', () => {
        expect(PVI_SRC).toMatch(/gridId:\s*null[\s\S]{0,40}source:\s*'plan-view'/);
    });

    it('no site clears the canvas grid selection silently any more', () => {
        // One spelling: `_clearGridSelection()`, which is the ONLY place allowed to touch
        // the canvas field — it clears it AND emits. Any other `setSelectedGridId?.(null)`
        // is the defect returning: a deselect that tells nobody. There were THREE such
        // sites (annotation click, element click, empty-space click); there is now one
        // call, inside the helper itself, which is why this counts rather than forbids.
        const clears = PVI_SRC.match(/setSelectedGridId\?\.\(null\)/g) ?? [];
        expect(clears).toHaveLength(1);
        expect(PVI_SRC).toContain('_clearGridSelection');
        // ...and every former site now goes through the helper.
        expect((PVI_SRC.match(/this\._clearGridSelection\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    });
});

describe('§GRID-CONTEXTUAL-EDIT — Delete is a real route, not a dead button', () => {
    it('the Delete action tries the grid route BEFORE falling through to BimService', () => {
        expect(CEB_SRC).toMatch(/if \(!this\._selectedObj && this\._deleteSelectedGrid\(\)\) return;/);
    });

    it('the grid delete dispatches the command that actually exists, with undo', () => {
        expect(CEB_SRC).toContain('RemoveGridCommand');
    });

    it('a refused or impossible grid delete DECLINES OUT LOUD', () => {
        // C16 CA-18 / C84 EI-2. `_declineOperation` routes to `bim-operation-error`, which
        // the operation overlay renders — never a silent `return`.
        const arm = CEB_SRC.slice(CEB_SRC.indexOf('_deleteSelectedGrid(): boolean'));
        expect(arm).toMatch(/_declineOperation\('Delete', 'the command system is not ready'\)/);
        expect(arm).toMatch(/_declineOperation\('Delete', res\.error/);
    });

    it('handling INCLUDES refusing — it must not fall through after declining', () => {
        // Returning false after a decline would delete whatever the 3D selection happens
        // to be, which is an element the user never selected.
        const arm = CEB_SRC.slice(
            CEB_SRC.indexOf('_deleteSelectedGrid(): boolean'),
            CEB_SRC.indexOf('_refreshButtonVisibility(elementType: string)'),
        );
        expect(arm.match(/return false;/g) ?? []).toHaveLength(1); // only the "no grid selected" arm
    });
});

describe('§GRID-CONTEXTUAL-EDIT — Move is offered honestly, and leaks no state', () => {
    it('Move enablement is COMPUTED from the capability table, never hard-coded', () => {
        // So that building the drag tool flips ONE ROW in GRID_EDIT_AXES and this button
        // comes alive on its own (C84 §8.d — a comment is not a synchronisation mechanism).
        expect(CEB_SRC).toContain('gridEditAvailability');
        expect(CEB_SRC).toMatch(/gridEditAvailability\(grid, 'move'\)/);
    });

    it('the refusal REASON becomes the tooltip — the user is told why', () => {
        expect(CEB_SRC).toMatch(/verdict\.reason/);
    });

    it('the element path CLEARS the disabled state the grid path sets', () => {
        // The regression this exists for: select a grid, then a wall, and Move stays grey.
        const elementLoop = CEB_SRC.slice(
            CEB_SRC.indexOf('const show = !!elementType && canDo('),
            CEB_SRC.indexOf('§EDIT-PROFILE — show the profile editor button'),
        );
        expect(elementLoop).toContain("classList.remove('ceb-btn--disabled')");
        expect(elementLoop).toMatch(/aria-disabled', 'false'/);
        expect(elementLoop).toContain('defaultTooltip');
    });

    it('the per-button default tooltip is captured at build time', () => {
        // Without a stored default there is nothing to restore to, and the reset above
        // would be unimplementable.
        expect(CEB_SRC).toMatch(/btn\.dataset\.defaultTooltip = action\.title;/);
    });
});
