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
    resetAppPhaseForNewProject,
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
        // The 2026-08-18 measurement, kept live. `level-stepper` is the deliberate
        // exception and carries its reason in the table; anything else appearing
        // here is a regression.
        //
        // §UX1-VP-DEFAULT-CLOSED (founder 2026-08-19) moved `view-properties` OUT of
        // this list — it is now `closed` on the canvas — and moved
        // `view-properties-launcher` IN, which is the trade this list should make
        // visible rather than hide: the panel stopped occupying the viewport and a
        // 36 × 36 button took its place as the thing that is open. A future edit that
        // puts `view-properties` back here without removing the launcher has
        // re-created the founder's report, and this assertion is where that shows.
        const open = governedPanels()
            .filter((p) => p.byPhase.canvas === 'open')
            .map((p) => p.id)
            .sort();
        expect(open).toEqual([
            'launcher-rail',
            'level-stepper',
            'renderer-backend-toggle',
            'view-properties-launcher',
        ]);
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
            // §UX1-VP-DEFAULT-CLOSED — the file that renders `view-properties-launcher`.
            // It was missing, and this assertion was RED at HEAD saying exactly that:
            // `view-properties` had been flipped to `closed` on the canvas while the
            // only thing that could reopen it was invisible to this check. Adding the
            // path is half the fix; the other half is `phaseChrome.installPhaseChrome()`
            // now installing that launcher, so the route cannot be dropped separately
            // from the close (§UX2-REOPEN-SHIPS-WITH-CLOSE).
            'apps/editor/src/ui/layout/ViewPropertiesLauncher.ts',
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
        // Globe first (the latch is one-way, so this order is the only one that
        // can observe both phases).
        expect(panelState('site-analysis')).toBe('absent');
        expect(panelState('launcher-rail')).toBe('absent');
        setAppPhase('canvas');
        expect(panelState('site-analysis')).toBe('closed');
        expect(panelState('launcher-rail')).toBe('open');
    });

    it('panelAbsent is what callers use to skip MOUNTING, not just to hide', () => {
        expect(panelAbsent('view-properties', 'onboarding-globe')).toBe(true);
        expect(panelAbsent('view-properties', 'canvas')).toBe(false);
        // §UX1-VP-DEFAULT-CLOSED — `false` now, and the distinction this line pins is
        // the one that matters: NOT-OPEN is not the same as ABSENT. On the canvas the
        // panel is `closed`, so `panelAbsent` stays false (callers must still mount it,
        // and the launcher must still be able to reveal it) while `panelDefaultOpen`
        // goes false (it does not start on screen).
        expect(panelDefaultOpen('view-properties', 'canvas')).toBe(false);
        expect(panelPhaseDefault('view-properties', 'canvas')).toBe('closed');
    });

    it('⭐ the founder’s two rules for View Properties cannot drift apart', () => {
        // Rule 1: ABSENT on PRYZM Earth — and so is its launcher, because a button
        // that opens a panel which should not exist in that phase is worse than no
        // button. Rule 2: CLOSED but openable on the canvas — so the launcher is
        // open there. Both are read from the ONE table, which is the only reason
        // they cannot contradict each other; this asserts the pairing rather than
        // trusting the prose that claims it.
        expect(panelPhaseDefault('view-properties', 'onboarding-globe')).toBe('absent');
        expect(panelPhaseDefault('view-properties-launcher', 'onboarding-globe')).toBe('absent');
        expect(panelPhaseDefault('view-properties', 'canvas')).toBe('closed');
        expect(panelPhaseDefault('view-properties-launcher', 'canvas')).toBe('open');
    });

    it('⭐ closed-by-default SURVIVES a reload and a project switch, because nothing is stored', () => {
        // The risk this closes: a stale `open: true` written before the default
        // changed, silently winning on the next load. It cannot happen HERE, and the
        // reason is mechanical rather than declared — `panelDefaults.ts` contains no
        // storage call at all, so there is no stored value to be stale. THE TABLE
        // WINS, on every app start and every project open.
        //
        // A reload is a fresh module instance, which is what
        // `__resetPanelSessionStateForTests()` models; a project switch is
        // `resetAppPhaseForNewProject()`. Both must land back on `closed`.
        const src = readFileSync(resolve(REPO, 'apps/editor/src/ui/layout/panelDefaults.ts'), 'utf8');
        expect(src.includes('localStorage'), 'panelDefaults reached storage').toBe(false);
        expect(src.includes('sessionStorage'), 'panelDefaults reached storage').toBe(false);
        expect(PANEL_LAYOUT_PERSISTENCE).toBe('session');

        setAppPhase('canvas');
        setPanelOpen('view-properties', true);
        expect(isPanelOpen('view-properties')).toBe(true);

        // → project switch
        resetAppPhaseForNewProject();
        setAppPhase('canvas');
        expect(isPanelOpen('view-properties'), 'a project switch kept the panel open').toBe(false);

        // → reload
        setPanelOpen('view-properties', true);
        __resetPanelSessionStateForTests();
        setAppPhase('canvas');
        expect(isPanelOpen('view-properties'), 'a reload kept the panel open').toBe(false);
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

    it('⭐ the latch is ONE-WAY: reaching the canvas is permanent for the session', () => {
        // The failure this prevents: a user working on the canvas clicks the
        // "PRYZM Earth" pill to look at the site again. If the phase mirrored the
        // active view, that click would flip them to the globe phase and take the
        // launcher rail away — including the pills needed to get back. Being
        // clever about phases would have manufactured the exact unreachability
        // this lane exists to prevent.
        expect(setAppPhase('canvas')).toBe(true);
        expect(setAppPhase('onboarding-globe'), 'the latch let go').toBe(false);
        expect(appPhase()).toBe('canvas');
    });

    it('a genuinely new onboarding re-arms the latch, but only via the explicit verb', () => {
        setAppPhase('canvas');
        expect(resetAppPhaseForNewProject()).toBe(true);
        expect(appPhase()).toBe('onboarding-globe');
    });

    it('drops session overrides on a phase change — a globe choice is not a canvas choice', () => {
        setPanelOpen('site-plan-overlay', true);           // legal on the globe (closed, not absent)
        expect(isPanelOpen('site-plan-overlay')).toBe(true);
        setAppPhase('canvas');
        expect(isPanelOpen('site-plan-overlay'), 'the override survived the phase change').toBe(false);
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
