/**
 * §UX1-PANEL-DEFAULTS — the invariants of the phase-aware panel table.
 *
 * These are not "does the getter return the field" tests. Each pins a property
 * that, if it broke, would reproduce a defect this repo has already paid for:
 *
 *  · C82 §1.1/§1.2 — a panel closed with no route back is a withdrawn capability.
 *    Asserted TWICE: the reopen control must be declared AND must exist in the
 *    shipped source, and — the sharper one — the SURFACE THAT HOSTS it must not
 *    itself be absent in that phase. Hiding the launcher rail on the globe while
 *    leaving a panel merely `closed` there would silently strand it.
 *  · No row may be absent in EVERY phase: "hidden during onboarding" must never
 *    become "unreachable".
 *  · EI-9 (one question, two answers) — `panelState` is the only answer.
 *  · The persistence rule is DECLARED, so it is asserted: nothing here may reach
 *    storage. A future "just remember this one panel" is the half-persisted state
 *    D2 forbids, and it fails here.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    PANEL_REGISTRY,
    PANEL_LAYOUT_PERSISTENCE,
    APP_PHASES,
    appPhase,
    setAppPhase,
    onAppPhaseChanged,
    panelDescriptor,
    panelPhaseDefault,
    panelDefaultOpen,
    panelAbsent,
    panelState,
    panelsNeedingReopen,
    governedPanels,
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
    it('starts on the globe, because that is the shipping entry path AND the safe default', () => {
        // Getting the phase wrong in this direction hides chrome that is about to
        // be needed and self-corrects on the first setAppPhase. Defaulting to
        // `canvas` would paint model chrome over a globe with no model — the
        // exact thing reported. A surface that never declares a phase degrades
        // to "quiet", never to "wrong".
        expect(appPhase()).toBe('onboarding-globe');
    });

    it('D6 — the three founder-boxed groups are ABSENT on the globe', () => {
        for (const id of ['launcher-rail', 'renderer-backend-toggle', 'view-properties', 'level-stepper'] as PanelId[]) {
            expect(panelPhaseDefault(id, 'onboarding-globe'), id).toBe('absent');
        }
    });

    it('D6 — the founder-named KEEP set is open in BOTH phases', () => {
        for (const id of ['platform-toolbar', 'left-icon-strip', 'right-tools-spine', 'viewport'] as PanelId[]) {
            for (const ph of APP_PHASES) {
                expect(panelPhaseDefault(id, ph), `${id} @ ${ph}`).toBe('open');
            }
        }
    });

    it('D1 — no governed panel is OPEN by default on the canvas except the ones argued for', () => {
        // The 2026-08-18 measurement, kept live. `view-properties` and
        // `level-stepper` are the two deliberate exceptions and each carries its
        // reason in the table; anything else appearing here is a regression.
        const open = governedPanels()
            .filter((p) => p.byPhase.canvas === 'open')
            .map((p) => p.id)
            .sort();
        expect(open).toEqual(['launcher-rail', 'level-stepper', 'renderer-backend-toggle', 'view-properties']);
    });

    it('names every surface that stays open, with a real reason — nothing implicit', () => {
        for (const p of PANEL_REGISTRY) {
            // The reason is the deliverable. A blank or one-word `why` would let a
            // future surface escape the mechanism simply by being terse.
            expect(p.why.length, `${p.id} has no stated reason`).toBeGreaterThan(60);
            expect(p.title.trim()).not.toBe('');
            expect(p.region.trim()).not.toBe('');
        }
        const ids = PANEL_REGISTRY.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('§UX1-PANEL-DEFAULTS — C82 §1.1: no capability becomes unreachable', () => {
    it('no row is ABSENT in every phase', () => {
        const stranded = PANEL_REGISTRY
            .filter((p) => APP_PHASES.every((ph) => p.byPhase[ph] === 'absent'))
            .map((p) => p.id);
        expect(stranded, 'a surface absent everywhere is a deleted capability wearing a table row').toEqual([]);
    });

    it('every row that is CLOSED in some phase declares a reopen control', () => {
        const missing = panelsNeedingReopen().filter((p) => p.reopen.trim() === '').map((p) => p.id);
        expect(missing, 'closed with no route back').toEqual([]);
    });

    it('⭐ the reopen HOST is present in every phase where the panel is closed', () => {
        // The sharp one. `site-analysis` is `closed` on the canvas and its route
        // back is a launcher pill — so the launcher rail must not be `absent`
        // there. On the globe the rail IS absent, which is only sound because
        // `site-analysis` is absent there too. This assertion is what lets the
        // rail be hidden at all without hand-reasoning it each time.
        for (const p of PANEL_REGISTRY) {
            for (const ph of APP_PHASES) {
                if (p.byPhase[ph] !== 'closed') continue;
                if (p.reopenHost === null) {
                    throw new Error(`${p.id} is closed in ${ph} but declares no reopen host`);
                }
                if (p.reopenHost === 'self') continue; // its own persistent header
                expect(
                    panelPhaseDefault(p.reopenHost, ph),
                    `${p.id} is closed in ${ph}, but its reopen host ${p.reopenHost} is absent there`,
                ).not.toBe('absent');
            }
        }
    });

    it('every declared reopen control EXISTS in the shipped source', () => {
        // `reopen: 'site-overlay-reopen'` naming a testid no file renders is the
        // C82 §7.b defect — an artefact standing in for a reachable control.
        //
        // NB this is SOURCE evidence, not mount evidence, and says so: C82 §5.4
        // records that static occurrence is not proof of a rendered control. It
        // catches the rename/typo class, which is what actually breaks this table.
        const sources = [
            'apps/editor/src/ui/layout/GISAreaLayout.ts',
            'apps/editor/src/ui/site/overlay/SitePlanOverlayController.ts',
            'apps/editor/src/ui/geospatial/FormaSiteAnalysisControls.ts',
        ].map((rel) => {
            const abs = resolve(REPO, rel);
            expect(existsSync(abs), `${rel} not found — fix the path, do not delete the check`).toBe(true);
            return readFileSync(abs, 'utf8');
        }).join('\n');

        for (const p of panelsNeedingReopen()) {
            expect(
                sources.includes(p.reopen),
                `${p.id} declares reopen control "${p.reopen}" but no source renders it`,
            ).toBe(true);
        }
    });
});

describe('§UX1-PANEL-DEFAULTS — one question, one answer', () => {
    it('panelState follows the table in each phase', () => {
        setAppPhase('canvas');
        expect(panelState('site-analysis')).toBe('closed');
        expect(panelState('launcher-rail')).toBe('open');
        setAppPhase('onboarding-globe');
        expect(panelState('site-analysis')).toBe('absent');
        expect(panelState('launcher-rail')).toBe('absent');
    });

    it('panelAbsent is what callers use to skip MOUNTING, not just to hide', () => {
        expect(panelAbsent('view-properties', 'onboarding-globe')).toBe(true);
        expect(panelAbsent('view-properties', 'canvas')).toBe(false);
        expect(panelDefaultOpen('view-properties', 'canvas')).toBe(true);
    });

    it('setPanelOpen moves the shared answer, so a pill and a panel cannot disagree', () => {
        setAppPhase('canvas');
        setPanelOpen('site-analysis', true);
        expect(isPanelOpen('site-analysis')).toBe(true);
        setPanelOpen('site-analysis', false);
        expect(isPanelOpen('site-analysis')).toBe(false);
    });

    it('setPanelOpen REFUSES an ABSENT panel rather than silently accepting it', () => {
        // Accepting the write and ignoring it is the worst outcome: the caller
        // believes it opened something the user cannot see, and nothing errors.
        setAppPhase('onboarding-globe');
        setPanelOpen('site-analysis', true);
        expect(isPanelOpen('site-analysis')).toBe(false);
        expect(panelState('site-analysis')).toBe('absent');
    });

    it('setPanelOpen REFUSES an essential surface', () => {
        setPanelOpen('platform-toolbar', false);
        expect(isPanelOpen('platform-toolbar')).toBe(true);
    });

    it('rejects an unknown id instead of inventing a default', () => {
        expect(() => panelDescriptor('not-a-panel' as PanelId)).toThrow(/unknown panel id/);
    });
});

describe('§UX1-PANEL-DEFAULTS — phase transitions', () => {
    it('notifies subscribers, and is idempotent so callers may fire it defensively', () => {
        const seen: string[] = [];
        const off = onAppPhaseChanged((ph) => seen.push(ph));
        expect(setAppPhase('onboarding-globe')).toBe(false); // already there
        expect(setAppPhase('canvas')).toBe(true);
        expect(setAppPhase('canvas')).toBe(false);
        expect(seen).toEqual(['canvas']);
        off();
    });

    it('drops session overrides on a phase change — a canvas choice is not a globe choice', () => {
        setAppPhase('canvas');
        setPanelOpen('site-analysis', true);
        expect(isPanelOpen('site-analysis')).toBe(true);
        setAppPhase('onboarding-globe');
        setAppPhase('canvas');
        expect(isPanelOpen('site-analysis'), 'the override survived a phase round-trip').toBe(false);
    });

    it('survives a throwing phase listener — one bad subscriber may not strand the others', () => {
        let reached = false;
        const a = onAppPhaseChanged(() => { throw new Error('boom'); });
        const b = onAppPhaseChanged(() => { reached = true; });
        expect(() => setAppPhase('canvas')).not.toThrow();
        expect(reached).toBe(true);
        a(); b();
    });
});

describe('§UX1-PANEL-DEFAULTS — D2: reset exists and works', () => {
    it('restores the current phase defaults and reports WHICH panels moved', () => {
        setAppPhase('canvas');
        setPanelOpen('site-analysis', true);
        setPanelOpen('buildable-envelope', true);
        const changed = resetPanelLayout();
        expect([...changed].sort()).toEqual(['buildable-envelope', 'site-analysis']);
        expect(isPanelOpen('site-analysis')).toBe(false);
        expect(isPanelOpen('buildable-envelope')).toBe(false);
    });

    it('distinguishes "already at defaults" from "reset 2 panels" — different facts', () => {
        setAppPhase('canvas');
        expect(resetPanelLayout()).toEqual([]);
    });

    it('notifies subscribers, because a reset nothing re-applies is a table update', () => {
        let calls = 0;
        const off = onPanelLayoutReset(() => { calls += 1; });
        resetPanelLayout();
        expect(calls).toBe(1);
        off();
        resetPanelLayout();
        expect(calls).toBe(1);
    });

    it('survives a throwing subscriber', () => {
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
        // Comments stripped first: the module's own header EXPLAINS the rule in
        // prose, so a naive substring scan would fail on the documentation of the
        // very invariant it checks. A test that cannot tell a mention from a use
        // is worth nothing.
        const src = readFileSync(resolve(REPO, 'apps/editor/src/ui/layout/panelDefaults.ts'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');
        for (const sink of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
            expect(src.includes(sink), `panelDefaults reaches ${sink} — see the D2 rule in its header`).toBe(false);
        }
    });
});
