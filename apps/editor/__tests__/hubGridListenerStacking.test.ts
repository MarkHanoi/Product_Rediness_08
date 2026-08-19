/**
 * @vitest-environment happy-dom
 */
// hubGridListenerStacking — §FIX-HUB-GRID-LISTENER-STACK (L-1281).
//
// ─── THE DEFECT, AS THE FOUNDER SAW IT ──────────────────────────────────────
//
// One click on one project card, in a LIVE production boot log:
//
//     [PlatformRouter] Opening project: "Untitled Site — …"      ×3
//     [PlatformRouter] §L-1186 app phase for this open: "canvas." ×3
//
// Three full `launchWorkspace` calls for one gesture. Not three gestures —
// THREE LISTENERS on one node.
//
// `ProjectHub.refreshGrid()` does `grid.innerHTML = this.renderGrid()` and then
// re-runs `attachGridListeners()`. `#ph-grid` is part of the STABLE shell markup
// and survives that assignment; only its children are replaced. So every
// delegated `grid.addEventListener('click', (e) => …)` inside
// `attachGridListeners` added ANOTHER anonymous arrow to the SAME surviving
// node. `addEventListener` de-duplicates on referential identity alone, and a
// fresh arrow is never identical to the last one.
//
// A signed-in boot refreshes the grid three times — `build()`, `_warmThenSync()`
// and `syncFromServer()` — which is precisely the ×3.
//
// ─── WHY THIS TEST IS AT THE DOM, AND NOT AT A HELPER ───────────────────────
//
// The bug is not in any function's return value. It is in how many times a
// handler is attached to a node that outlives the markup around it. A unit test
// over a pure helper could not have expressed it, and neither could a test that
// counted `addEventListener` calls on a stub — a stub records the calls the
// subject makes, not what the DOM does with them. So the assertion below is the
// one the user makes: dispatch ONE click on a REAL card in a REAL `#ph-grid`
// after N refreshes, and count the callbacks that come out.
//
// ─── STUB LEDGER (read before trusting any green below) ─────────────────────
//
// The `ProjectHub` is real and so is its DOM. The project list is seeded through
// `localStorage['bim-projects-index']`, which is the same key
// `projectRepository.listProjects()` reads in production — not a mocked
// repository. `runtime` is passed as `null`, a value the hub's own callers pass
// (see `ProjectHub`'s constructor default and the `syncFromServer` fallback
// path), so the server sync degrades exactly as it does offline. Nothing on the
// measured path — the grid node, the listener registration, the click dispatch,
// the callback — is substituted.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ProjectHub } from '../src/ui/platform/ProjectHub.js';

const USER = {
    id: 'u-1',
    email: 'founder@example.test',
    name: 'Founder',
    createdAt: 0,
} as const;

const PROJECT_ID = 'proj-1755555555555-ABCDEF';
const PROJECT_NAME = 'Untitled Site — 2026-08-19 20:00';

function seedOneProject(): void {
    localStorage.setItem(
        'bim-projects-index',
        JSON.stringify([
            {
                id: PROJECT_ID,
                name: PROJECT_NAME,
                updatedAt: Date.now(),
                versionCount: 1,
            },
        ]),
    );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    seedOneProject();
});

describe('L-1281 — one click on a hub card is ONE open, however often the grid refreshed', () => {
    it('does not stack the delegated grid listener across refreshGrid() calls', () => {
        const onOpenProject = vi.fn();
        const hub = new ProjectHub(
            document.body,
            USER as any,
            { onOpenProject, onSignOut: () => {} },
            null,
        );

        // Reproduce a normal signed-in boot: `build()` bound once already, then
        // `_warmThenSync()` and `syncFromServer()` each repaint. Three total.
        (hub as any).refreshGrid();
        (hub as any).refreshGrid();

        const card = document.querySelector<HTMLElement>(
            `#ph-grid .ph-card--project[data-project-id="${PROJECT_ID}"]`,
        );
        // If this is null the fixture is wrong, not the subject — fail loudly
        // rather than passing an assertion about zero clicks on zero cards.
        expect(card, 'the seeded project must render as a card').not.toBeNull();

        card!.dispatchEvent(new Event('click', { bubbles: true }));

        // BEFORE the fix this was 3 — one per `attachGridListeners` call, all
        // firing in the same dispatch, which no per-card `pointerEvents='none'`
        // can prevent because they share the delegation root.
        expect(onOpenProject).toHaveBeenCalledTimes(1);
        expect(onOpenProject).toHaveBeenCalledWith(PROJECT_ID, PROJECT_NAME, undefined);
    });

    it('stays at ONE even after many repaints — the count must not track refreshes', () => {
        const onOpenProject = vi.fn();
        const hub = new ProjectHub(
            document.body,
            USER as any,
            { onOpenProject, onSignOut: () => {} },
            null,
        );

        // A hub left open while sync/search/sort fire repeatedly. The pre-fix
        // handler count grew without bound, so a long-lived hub eventually
        // issued double-digit opens per click.
        for (let i = 0; i < 8; i++) (hub as any).refreshGrid();

        document
            .querySelector<HTMLElement>(`#ph-grid .ph-card--project[data-project-id="${PROJECT_ID}"]`)!
            .dispatchEvent(new Event('click', { bubbles: true }));

        expect(onOpenProject).toHaveBeenCalledTimes(1);
    });

    it('still re-binds the "New project" card, which refreshGrid genuinely REPLACES', () => {
        // The guard must be scoped to the DELEGATION ROOT only. `#ph-card-new`
        // is destroyed and recreated by every repaint, so a guard that skipped
        // its binding too would leave "+ New project" dead after the first
        // sync — trading one silent defect for another.
        const hub = new ProjectHub(
            document.body,
            USER as any,
            { onOpenProject: () => {}, onSignOut: () => {} },
            null,
        );
        const started = vi.spyOn(hub as any, 'startGuidedOnboardingDirect').mockImplementation(() => {});

        (hub as any).refreshGrid();
        (hub as any).refreshGrid();

        document.querySelector<HTMLElement>('#ph-card-new')!
            .dispatchEvent(new Event('click', { bubbles: true }));

        expect(started).toHaveBeenCalledTimes(1);
    });
});
