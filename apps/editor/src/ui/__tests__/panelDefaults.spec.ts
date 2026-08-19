/**
 * §UX1-PANEL-DEFAULTS — the invariants of the start-up panel table.
 *
 * These are not "does the getter return the field" tests. Each one pins a
 * property that, if it broke, would reproduce a defect this repo has already
 * paid for:
 *
 *  · C82 §1.1/§1.2 — a panel closed by default with no route back is a
 *    withdrawn capability. The reopen column is therefore asserted non-empty
 *    for every closable row, and asserted to name a control that EXISTS in the
 *    source (a `data-testid` nobody renders is the same lie one hop later).
 *  · EI-9 (one question, two answers) — `isPanelOpen` must be the only answer.
 *    The three surfaces used to keep private flags; the spec pins that
 *    `setPanelOpen` is what a reader sees.
 *  · The persistence rule is DECLARED, so it is asserted: nothing in this module
 *    may reach storage. A future "just remember this one panel" is the
 *    half-persisted state D2 forbids, and it would fail here.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    PANEL_REGISTRY,
    PANEL_LAYOUT_PERSISTENCE,
    panelDefaultOpen,
    panelDescriptor,
    closablePanels,
    isPanelOpen,
    setPanelOpen,
    resetPanelLayout,
    onPanelLayoutReset,
    __resetPanelSessionStateForTests,
    type PanelId,
} from '../layout/panelDefaults';

const REPO = resolve(__dirname, '../../../../..');

beforeEach(() => { __resetPanelSessionStateForTests(); });

describe('§UX1-PANEL-DEFAULTS — the table', () => {
    it('is the FOUNDER-REQUESTED start-up state: every non-essential panel is CLOSED', () => {
        // The measurement, both directions. Before this change the same three rows
        // read OPEN; a regression that re-opens one lands here, not in a screenshot.
        const open = PANEL_REGISTRY.filter((p) => !p.essential && p.defaultOpen).map((p) => p.id);
        expect(open).toEqual([]);
    });

    it('names every surface that STAYS open, with a reason — nothing implicit', () => {
        for (const p of PANEL_REGISTRY.filter((x) => x.essential)) {
            expect(p.defaultOpen, `${p.id} is essential but not open`).toBe(true);
            // The reason is the deliverable. A blank or one-word `why` would let a
            // future surface be marked essential simply to escape the mechanism.
            expect(p.why.length, `${p.id} has no stated reason`).toBeGreaterThan(60);
        }
    });

    it('has no duplicate ids and no blank titles or regions', () => {
        const ids = PANEL_REGISTRY.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const p of PANEL_REGISTRY) {
            expect(p.title.trim()).not.toBe('');
            expect(p.region.trim()).not.toBe('');
        }
    });
});

describe('§UX1-PANEL-DEFAULTS — C82 §1.1: no capability becomes unreachable', () => {
    it('every closable panel declares a reopen control', () => {
        const missing = closablePanels().filter((p) => p.reopen.trim() === '').map((p) => p.id);
        expect(missing, 'a panel closed by default with no route back').toEqual([]);
    });

    it('every declared reopen control EXISTS in the shipped source', () => {
        // The stronger half. `reopen: 'site-overlay-reopen'` naming a testid that no
        // file renders is exactly the C82 §7.b defect — an artefact standing in for a
        // reachable control. Read the real files rather than trusting the string.
        //
        // NB this is a SOURCE-level check, not a rendered-DOM one, and says so: C82
        // §5.4 records that static import/occurrence evidence is not mount evidence.
        // It catches the rename/typo class, which is what actually breaks this table.
        const sources = [
            'apps/editor/src/ui/layout/GISAreaLayout.ts',
            'apps/editor/src/ui/site/overlay/SitePlanOverlayController.ts',
            'apps/editor/src/ui/geospatial/FormaSiteAnalysisControls.ts',
        ].map((rel) => {
            const abs = resolve(REPO, rel);
            expect(existsSync(abs), `${rel} not found — fix the path, do not delete the check`).toBe(true);
            return readFileSync(abs, 'utf8');
        }).join('\n');

        for (const p of closablePanels()) {
            expect(
                sources.includes(p.reopen),
                `${p.id} declares reopen control "${p.reopen}" but no source renders it`,
            ).toBe(true);
        }
    });
});

describe('§UX1-PANEL-DEFAULTS — one question, one answer', () => {
    it('isPanelOpen starts at the declared default for every row', () => {
        for (const p of PANEL_REGISTRY) {
            expect(isPanelOpen(p.id), p.id).toBe(p.defaultOpen);
            expect(panelDefaultOpen(p.id), p.id).toBe(p.defaultOpen);
        }
    });

    it('setPanelOpen moves the shared answer, so a pill and a panel cannot disagree', () => {
        setPanelOpen('site-analysis', true);
        expect(isPanelOpen('site-analysis')).toBe(true);
        setPanelOpen('site-analysis', false);
        expect(isPanelOpen('site-analysis')).toBe(false);
    });

    it('setPanelOpen REFUSES to close an essential surface rather than silently accepting it', () => {
        // Accepting the write and then ignoring it would be the worst of both: the
        // caller believes the toolbar is hidden, the user sees it, and nothing errors.
        setPanelOpen('platform-toolbar', false);
        expect(isPanelOpen('platform-toolbar')).toBe(true);
    });

    it('rejects an unknown id instead of inventing a default', () => {
        expect(() => panelDescriptor('not-a-panel' as PanelId)).toThrow(/unknown panel id/);
    });
});

describe('§UX1-PANEL-DEFAULTS — D2: reset exists and works', () => {
    it('restores the declared defaults and reports WHICH panels moved', () => {
        setPanelOpen('site-analysis', true);
        setPanelOpen('buildable-envelope', true);
        const changed = resetPanelLayout();
        expect([...changed].sort()).toEqual(['buildable-envelope', 'site-analysis']);
        expect(isPanelOpen('site-analysis')).toBe(false);
        expect(isPanelOpen('buildable-envelope')).toBe(false);
    });

    it('distinguishes "already at defaults" from "reset 2 panels" — they are different facts', () => {
        expect(resetPanelLayout()).toEqual([]);
    });

    it('notifies subscribers, because a reset nothing re-applies is a table update, not a reset', () => {
        let calls = 0;
        const off = onPanelLayoutReset(() => { calls += 1; });
        resetPanelLayout();
        expect(calls).toBe(1);
        off();
        resetPanelLayout();
        expect(calls).toBe(1);
    });

    it('survives a throwing subscriber — one bad listener may not strand the others', () => {
        let reached = false;
        onPanelLayoutReset(() => { throw new Error('boom'); });
        onPanelLayoutReset(() => { reached = true; });
        expect(() => resetPanelLayout()).not.toThrow();
        expect(reached).toBe(true);
    });
});

describe('§UX1-PANEL-DEFAULTS — the persistence rule is the DECLARED one', () => {
    it('declares session scope', () => {
        expect(PANEL_LAYOUT_PERSISTENCE).toBe('session');
    });

    it('touches no storage at all — no half-persisted layout can creep in', () => {
        // Strip comments first. The module's own header EXPLAINS the rule in prose
        // ("not written to localStorage…"), so a naive substring scan would fail on the
        // documentation of the very invariant it is checking — a test that cannot tell
        // a mention from a use is worth nothing.
        const src = readFileSync(resolve(REPO, 'apps/editor/src/ui/layout/panelDefaults.ts'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');
        for (const sink of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
            expect(src.includes(sink), `panelDefaults reaches ${sink} — see the D2 rule in its header`).toBe(false);
        }
    });
});
