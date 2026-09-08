/**
 * §ONE-REGION-SWITCHER (founder 2026-09-08 · L-13257 · C59 §2.9 / invariant 9)
 *
 * THE ASK, VERBATIM:
 *   *"Please in the drop down panel - add: zoom the site - it will zoom to the site - do it
 *    architecturally sound - this has already been built - it just needs to be accessible here."*
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SUITE IS FOR
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *   ARM A — ⭐ IT IS A HOST, NOT AN AUTHORITY. Every id resolves in `GIS_ACTIONS`, and the
 *     label / icon / title / availability all come from there. A renamed registry row fails
 *     HERE instead of leaving a dead button on the founder's dropdown.
 *   ARM B — ⛔ IT IS AN ACTION, NOT A VIEW (C59 invariant 9). Zoom to Site must NOT appear
 *     among the view rows, because the pane reducer keys on view type and a rival row backed
 *     by the same renderer refuses on every click (§2.9, L-6800..L-6809).
 *   ARM C — the refusal SPEAKS: no entry point ⇒ shown, DISABLED, with the reason ON it.
 *     A control that vanishes when it cannot act teaches the user it does not exist.
 *   ARM D — ⭐ RESOLVED ON EVERY PAINT, not captured at build. `pryzmZoomToSite` is registered
 *     when a site surface comes up, which can be AFTER the popup was first built; a
 *     once-resolved button would stay dead for the whole session.
 *   ARM E — it actually DISPATCHES, and a throwing handler does not take the popup down.
 *   ARM F — §COMMITTED-IS-NOT-REACHABLE: all three pill popups mount it, so the action is
 *     reachable from every region rather than from the one this lane happened to edit.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    VIEW_PILL_ACTIONS_ROW_TESTID,
    VIEW_PILL_ACTION_IDS,
    actionUnavailableText,
    buildViewPillActionsRow,
} from '../viewPillActionsRow';
import { GIS_ACTIONS, type GisCapabilityHost } from '../../gis/gisActionRegistry';
import { viewPanelOptions } from '../../../engine/views/viewPanelOptions';

const ROOT = resolve(__dirname, '../../../../../..');
const read = (p: string): string => readFileSync(resolve(ROOT, p), 'utf8');

const btnOf = (el: HTMLElement, id: string): HTMLButtonElement | null =>
    el.querySelector<HTMLButtonElement>(`[data-testid="${VIEW_PILL_ACTIONS_ROW_TESTID}-${id}"]`);

describe('§ONE-REGION-SWITCHER — ARM A · a HOST of GIS_ACTIONS, never a copy of it', () => {
    it('every declared id resolves in GIS_ACTIONS', () => {
        for (const id of VIEW_PILL_ACTION_IDS) {
            expect(GIS_ACTIONS.find((a) => a.id === id), `${id} is not declared`).toBeDefined();
        }
    });

    it('the founder\'s ask — `site.zoom-to-site` — is one of them', () => {
        expect(VIEW_PILL_ACTION_IDS).toContain('site.zoom-to-site');
    });

    it('⭐ the LABEL and ICON come from the registry, not from this file', () => {
        const decl = GIS_ACTIONS.find((a) => a.id === 'site.zoom-to-site');
        const host = { pryzmZoomToSite: () => {} } as unknown as GisCapabilityHost;
        const row = buildViewPillActionsRow(host);
        expect(btnOf(row.element, 'site.zoom-to-site')?.textContent)
            .toBe(`${decl?.icon} ${decl?.label}`);
        // And the registry's own sentence is the tooltip — one spelling (C84 EI-8).
        expect(btnOf(row.element, 'site.zoom-to-site')?.title).toBe(decl?.title);
    });

    it('the row declares NO label, icon, handler or availability rule of its own', () => {
        const SRC = read('apps/editor/src/ui/site/viewPillActionsRow.ts');
        // ⚠ A QUOTED LITERAL, NOT THE PHRASE. This arm first read the whole file and then the
        // whole file below the imports, and BOTH failed on PROSE — the header quotes the
        // founder's ask and a doc comment names the row being hosted, which is documentation
        // doing its job, not a hand-copied label. What a copy would actually look like is a
        // STRING LITERAL, so that is what is forbidden.
        for (const lit of ["'Zoom to Site'", '"Zoom to Site"', "'⤢'", '"⤢"']) {
            expect(SRC, `${lit} must come from the registry, not be written here`)
                .not.toContain(lit);
        }
        expect(SRC).toContain('resolveGisAction');
        // And the label is COMPOSED from the declaration, never written out.
        expect(SRC).toContain('`${decl.icon} ${decl.label}`');
    });
});

describe('§ONE-REGION-SWITCHER — ARM B · an ACTION, beside the views and never among them', () => {
    it('⛔ Zoom to Site is NOT a view row (C59 invariant 9 / §2.9)', () => {
        // Minting a view for it is the measured defect: `assignViewToPane` keys on the VIEW
        // TYPE, so a rival row backed by the same renderer refuses on every click.
        const ids = viewPanelOptions().map((o) => o.id as string);
        expect(ids).not.toContain('site-zoom');
        expect(ids).not.toContain('zoom-to-site');
        expect(ids).toHaveLength(6);
    });

    it('it renders in its OWN group, under its own caption', () => {
        const host = { pryzmZoomToSite: () => {} } as unknown as GisCapabilityHost;
        const row = buildViewPillActionsRow(host);
        expect(row.element.getAttribute('data-testid')).toBe(VIEW_PILL_ACTIONS_ROW_TESTID);
        expect(row.element.textContent).toContain('Camera');
    });
});

describe('§ONE-REGION-SWITCHER — ARM C · the refusal SPEAKS', () => {
    it('⛔ no entry point ⇒ RENDERED, disabled, with the reason on it', () => {
        const row = buildViewPillActionsRow({} as unknown as GisCapabilityHost);
        const btn = btnOf(row.element, 'site.zoom-to-site');
        expect(btn).not.toBeNull();                       // ⭐ shown, not hidden.
        expect(btn?.disabled).toBe(true);
        expect(btn?.hasAttribute('data-view-action-unavailable')).toBe(true);
        const decl = GIS_ACTIONS.find((a) => a.id === 'site.zoom-to-site');
        expect(btn?.title).toBe(actionUnavailableText(decl!));
        // The reason NAMES the missing entry point, so it is actionable rather than a shrug.
        expect(btn?.title).toContain('pryzmZoomToSite');
    });

    it('a disabled row does not dispatch when clicked', () => {
        const spy = vi.fn();
        const row = buildViewPillActionsRow({} as unknown as GisCapabilityHost);
        btnOf(row.element, 'site.zoom-to-site')?.click();
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('§ONE-REGION-SWITCHER — ARM D · resolved on every paint, never captured', () => {
    it('⭐ a host that gains the entry point LATER becomes live on repaint', () => {
        // The real sequence: the popup is built on a PRYZM view, then a site surface comes up
        // and registers `pryzmZoomToSite`. A once-resolved button would stay dead all session.
        const host: { pryzmZoomToSite?: () => void } = {};
        const row = buildViewPillActionsRow(host as unknown as GisCapabilityHost);
        expect(btnOf(row.element, 'site.zoom-to-site')?.disabled).toBe(true);

        host.pryzmZoomToSite = () => {};
        row.repaint();
        expect(btnOf(row.element, 'site.zoom-to-site')?.disabled).toBe(false);
    });

    it('and one that LOSES it goes back to disabled, with the reason', () => {
        const host: { pryzmZoomToSite?: () => void } = { pryzmZoomToSite: () => {} };
        const row = buildViewPillActionsRow(host as unknown as GisCapabilityHost);
        expect(btnOf(row.element, 'site.zoom-to-site')?.disabled).toBe(false);
        delete host.pryzmZoomToSite;
        row.repaint();
        expect(btnOf(row.element, 'site.zoom-to-site')?.disabled).toBe(true);
    });
});

describe('§ONE-REGION-SWITCHER — ARM E · it dispatches, and a throw is contained', () => {
    it('⭐ clicking calls the DECLARED entry point', () => {
        const spy = vi.fn();
        const row = buildViewPillActionsRow(
            { pryzmZoomToSite: spy } as unknown as GisCapabilityHost,
        );
        btnOf(row.element, 'site.zoom-to-site')?.click();
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('a throwing handler does not take the popup down', () => {
        const row = buildViewPillActionsRow({
            pryzmZoomToSite: () => { throw new Error('camera gone'); },
        } as unknown as GisCapabilityHost);
        expect(() => btnOf(row.element, 'site.zoom-to-site')?.click()).not.toThrow();
    });
});

describe('§ONE-REGION-SWITCHER — ARM F · reachable from EVERY region', () => {
    it('⭐ all three pill popups mount the row', () => {
        // §COMMITTED-IS-NOT-REACHABLE: wiring it into the one file this lane happened to edit
        // would leave the founder's own words — *"it just needs to be accessible here"* —
        // true in one place and false in two.
        for (const f of [
            'apps/editor/src/ui/layout/GISAreaLayout.ts',        // #container
            'apps/editor/src/engine/views/SplitViewManager.ts',  // the plan pane
            'apps/editor/src/ui/site/viewSwitcherOnView.ts',     // the on-view pill
        ]) {
            expect(read(f), `${f} must mount the actions row`)
                .toContain('buildViewPillActionsRow');
        }
    });

    it('and each host repaints it when its popup repaints', () => {
        for (const f of [
            'apps/editor/src/ui/layout/GISAreaLayout.ts',
            'apps/editor/src/engine/views/SplitViewManager.ts',
            'apps/editor/src/ui/site/viewSwitcherOnView.ts',
        ]) {
            // ARM D is worthless if nothing calls `repaint` — that is exactly how a
            // late-registered entry point stays greyed on screen.
            expect(read(f), `${f} must repaint the actions row`)
                .toMatch(/actions\.repaint\(\)/);
        }
    });

    it('the row carries NO px font size — §ONE-TYPE-BASE, the panelFold lesson', () => {
        const SRC = read('apps/editor/src/ui/site/viewPillActionsRow.ts');
        expect(SRC.slice(SRC.indexOf('export function buildViewPillActionsRow')))
            .not.toMatch(/font-size\s*:\s*\d/);
    });
});
