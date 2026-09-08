/**
 * §ONE-REGION-SWITCHER (founder 2026-09-08 · L-13257 · C59 §1.5) — 3D PRYZM IS REACHABLE FROM
 * THE ROWS THE FOUNDER ACTUALLY CLICKS.
 *
 * THE ASK, VERBATIM (after L-13254 had already shipped a fix for this):
 *   *"I still don't see 3d pryzm accessible (at least on project start up): why?"* — with two
 *   screenshots showing the row greyed in BOTH panes.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⛔⛔ WHY THE PREVIOUS FIX DID NOT SHOW UP — THE FIFTH RECURRENCE OF ONE SHAPE
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * L-13254 taught `describePaneViewOptions` that a `paneHostable: false` view carrying a
 * `fullScreenRoute` is REACHABLE, and wired `PaneViewPicker`'s own option renderer to dispatch
 * it. Both were correct and both shipped. **But the rows in the founder's screenshot are not
 * those rows.** The popup's MAIN list is `siteViewQuickToggleModel` — provably so, because it
 * is the only model that carries `2D Satellite` and `3D Globe`, which are `viewPanelOptions()`
 * VARIANTS and not registry view types — and that file carried its OWN copy of the
 * `!paneHostable ⇒ disabled` rule, with no knowledge of `fullScreenRoute`.
 *
 * One rule, two implementations, and the fix landed in the one the user was not looking at.
 * Same shape as the project-isolation leak, the Inspect categories, the left-rail categories
 * and the third view switcher — a newer rule invisible to an older parallel implementation.
 *
 *   ARM A — ⭐ the quick-toggle model, which paints the visible rows, now OFFERS 3D PRYZM.
 *   ARM B — ⛔ and it does NOT emit a pane intent for it: `view.pane.assign` on a
 *     `paneHostable: false` view is what `validatePaneLayout` rejects, so falling through
 *     would turn a greyed row into a row that logs a refusal — visibly the same bug.
 *   ARM C — ⭐ THE TWO MODELS AGREE. This is the arm that would have caught L-13254's gap.
 *   ARM D — the DOM layer dispatches the declared whole-screen route.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    describeSiteViewQuickToggle,
    segmentClickIntents,
    siteViewQuickToggleAgreesWithPaneOptions,
} from '../views/siteViewQuickToggleModel';
import { describePaneViewOptions } from '../views/paneViewOptions';
import { LEFT_PANE, RIGHT_PANE } from '../views/paneViewModel';

const ROOT = resolve(__dirname, '../../../../..');
const read = (p: string): string => readFileSync(resolve(ROOT, p), 'utf8');

/** The founder's live startup layout: 2D map left, 3D Site right. */
const LAYOUT = { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: 'site-3d' } as never;

const modelFor = (paneId: string | null) =>
    describeSiteViewQuickToggle({ layout: LAYOUT, paneId, canRestoreSplit: false } as never);

const pryzm3dOf = (paneId: string | null) =>
    modelFor(paneId).segments.find((s) => s.viewType === 'bim-3d');

describe('§ONE-REGION-SWITCHER — ARM A · the rows the founder clicks offer 3D PRYZM', () => {
    for (const pane of [LEFT_PANE, RIGHT_PANE, null]) {
        it(`⭐ pane=${pane ?? 'whole-screen'} — 3D PRYZM is ENABLED, not greyed`, () => {
            const seg = pryzm3dOf(pane);
            expect(seg, '3D PRYZM must be a row').toBeDefined();
            expect(seg?.enabled, 'the founder photographed this greyed in BOTH panes').toBe(true);
            expect(seg?.fullScreenRoute).toBe('3D');
        });
    }

    it('and the row still SAYS it leaves the split, before the click', () => {
        // STR §26.1.1 — the consequence is read first, not discovered after.
        expect(pryzm3dOf(LEFT_PANE)?.reason).toMatch(/full screen|FULL SCREEN/);
    });

    it('⛔ a non-hostable view with NO route stays honestly disabled', () => {
        // Elevation and Section have no `fullScreenRoute`, so this lane must not have made
        // every refusal disappear — only the ones that had a way out all along (L-942).
        for (const vt of ['bim-elevation-2d', 'bim-section-2d']) {
            const seg = modelFor(LEFT_PANE).segments.find((s) => s.viewType === vt);
            if (!seg) continue;   // not a promoted panel row — nothing to assert.
            expect(seg.enabled, `${vt} has no route and must stay disabled`).toBe(false);
            expect(seg.reason, `${vt} must say why`).toBeTruthy();
        }
    });
});

describe('§ONE-REGION-SWITCHER — ARM B · it emits NO pane intent', () => {
    it('⛔ clicking 3D PRYZM produces zero `view.pane.*` intents', () => {
        const seg = pryzm3dOf(LEFT_PANE)!;
        // `view.pane.assign` for a `paneHostable: false` view is exactly what
        // `validatePaneLayout` rejects — the click would resolve to a logged refusal and
        // look, to the user, like the greyed row he was already complaining about.
        expect(segmentClickIntents(seg, LAYOUT)).toEqual([]);
    });

    it('a normal row still produces its intents — the guard is narrow', () => {
        const seg = modelFor(LEFT_PANE).segments.find((s) => s.viewType === 'site-3d')!;
        expect(segmentClickIntents(seg, LAYOUT).length).toBeGreaterThan(0);
    });
});

describe('§ONE-REGION-SWITCHER — ARM C · the two models AGREE', () => {
    for (const pane of [LEFT_PANE, RIGHT_PANE]) {
        it(`⭐ pane=${pane} — no view is offered by one model and greyed by the other`, () => {
            // ⛔ THIS IS THE ARM THAT WOULD HAVE CAUGHT L-13254's GAP. It compares the model
            // that paints the MAIN list against the one that paints MORE VIEWS.
            const findings = siteViewQuickToggleAgreesWithPaneOptions(
                modelFor(pane).segments,
                describePaneViewOptions({ layout: LAYOUT, paneId: pane } as never),
            );
            expect(findings.map((f) => `${f.viewType}: ${f.detail}`).join('\n')).toBe('');
        });
    }
});

describe('§ONE-REGION-SWITCHER — ARM D · the DOM dispatches the declared route', () => {
    it('⭐ the quick toggle routes through the ONE orchestrator', () => {
        const SRC = read('apps/editor/src/engine/views/SiteViewQuickToggle.ts');
        expect(SRC).toContain('fullScreenRoute');
        expect(SRC).toContain('pryzmActivateBimView');
        // ⛔ and it returns BEFORE the intent loop, so no pane dispatch can follow it.
        const at = SRC.indexOf('seg.fullScreenRoute !== undefined');
        const loop = SRC.indexOf('for (const intent of segmentClickIntents', at);
        expect(at).toBeGreaterThan(-1);
        expect(loop).toBeGreaterThan(at);
    });

    it('a missing orchestrator is NAMED, never a silent no-op', () => {
        const SRC = read('apps/editor/src/engine/views/SiteViewQuickToggle.ts');
        expect(SRC).toMatch(/cannot open .* full/);
    });
});
