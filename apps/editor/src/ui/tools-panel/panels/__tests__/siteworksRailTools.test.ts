/**
 * @vitest-environment happy-dom
 */
// siteworksRailTools — the Master planning rail entries ARM THE DRAW TOOL, they do not
// merely render. C82 · C116 §11 · ADR-0384 D1 / D7 · P6.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ WHY AN ACTIVATION TEST AND NOT A RENDER TEST
// ═══════════════════════════════════════════════════════════════════════════════
//
// C82's ribbon census measured **267 of 280 toolbar pairs SILENTLY DEAD**. Every one
// of them rendered. A test that asserted "the Master planning category has three
// entries with the right labels" would have passed on all 267 of those too.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ REWRITTEN 2026-09-10 — THE SUBJECT CHANGED, AND THE PREVIOUS SUITE WAS GREEN
// ═══════════════════════════════════════════════════════════════════════════════
//
// The earlier revision of this file pressed each entry and read a record back OUT of a
// real store, through a real `CommandBus`, driven by the real handlers. Eight arms,
// all passing, all measuring the right thing about the wrong behaviour: what the
// entries did was PLACE a 40 m surface at world (0,0), and the founder — looking at a
// plan scrolled anywhere else — reported *"the element doesn't create anything on
// neither PRYZM 2D view or PRYZM 3D view."*
//
// ⚠ THAT IS WORTH RECORDING RATHER THAN QUIETLY REPLACING. The suite was not weak; it
// was AIMED AT THE DISPATCH and the defect was in the GESTURE. `[[committed-is-not-reachable]]`
// in its purest form: the record existed, the store held it, the undo entry was real,
// and the product was unusable. The entries now ARM `SiteworksPlanToolHandler` on every
// attached plan surface, so THIS suite's subject is the ARM — and the record-reaches-the-store
// half moved DOWN to where the gesture now lives, `siteworksPointerReach.spec.ts`,
// which starts from a real DOM click on a real overlay. Neither file is sufficient
// alone and both are named here so nobody reads one as both.
//
// ⚠ WHAT IS SUBSTITUTED, DECLARED: the two plan overlays are doubles here (they record
// `setActiveTool` calls). The REAL overlay leg — `svpPlanToolOverlay` attached to a
// canvas, real `MouseEvent`s, the real handler map from `createPlanToolHandlers()` — is
// `apps/editor/src/engine/views/plantools/__tests__/siteworksPointerReach.spec.ts`.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { SITEWORKS_ROLES, SITEWORKS_DEFAULT_WIDTH_M } from '@pryzm/schemas';
import {
    masterPlanningTools,
    registerMasterPlanningTool,
    __resetMasterPlanningToolsForTest,
} from '../masterPlanningRailRegistry.js';
import {
    registerSiteworksRailTools,
    armSiteworks,
    siteworksRailTooltip,
    SITEWORKS_TOOL_ID,
    SITEWORKS_RAIL_LABEL,
} from '../siteworksRailTools.js';
import {
    resolveActiveSiteworksRole,
    __resetActiveSiteworksAuthoringForTests,
} from '@app/engine/views/plantools/activeSiteworksAuthoring';
import { endPlanOnlyToolSession } from '@app/ui/create/activatePlanOnlyTool';
import { setAppPhase } from '@app/ui/layout/panelDefaults';
import { PLAN_TOOL_KEYS } from '@app/engine/views/plantools/planToolHandlerRegistry';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** What each fake plan overlay was told to arm, in order. */
let mainArmed: string[] = [];
let svpArmed: string[] = [];
/** Every toast the rail put in front of a person. */
let toasts: Array<{ message: string; kind?: string }> = [];

function installOverlays(opts: { main: boolean; svp: boolean }): void {
    const w = window as any;
    w.planViewToolOverlay = opts.main
        ? { isAttached: () => true, setActiveTool: (t: string) => { mainArmed.push(t); }, hasActiveStroke: () => false }
        : undefined;
    w.svpPlanToolOverlay = opts.svp
        ? { isAttached: () => true, setActiveTool: (t: string) => { svpArmed.push(t); }, hasActiveStroke: () => false }
        : undefined;
}

beforeEach(() => {
    // The shared `DrawingModeBar` refuses to render during onboarding
    // (§AUTHORING-CONTEXT-GATE, L-5103) and the default phase is `onboarding-globe`.
    setAppPhase('canvas');
    __resetMasterPlanningToolsForTest();
    __resetActiveSiteworksAuthoringForTests();
    mainArmed = [];
    svpArmed = [];
    toasts = [];
    const w = window as any;
    w.runtime = {
        toasts: { show: (message: string, kind?: string) => { toasts.push({ message, kind }); } },
        events: { emit: () => undefined },
    };
    w.selectionManager = { setEnabled: () => undefined, getSelectedId: () => null };
    installOverlays({ main: true, svp: true });
    registerSiteworksRailTools();
});

afterEach(() => {
    endPlanOnlyToolSession();
    __resetMasterPlanningToolsForTest();
    const w = window as any;
    delete w.planViewToolOverlay;
    delete w.svpPlanToolOverlay;
    delete w.runtime;
});

const byKey = (k: string) => masterPlanningTools().find((e) => e.key === k)!;

describe('the Master planning registry (ADR-0384 D7)', () => {
    it('carries one entry per SCHEMA role — generated, never hand-listed', () => {
        // ⭐ The expectation is derived from `SITEWORKS_ROLES`, the L0 union, so a
        // fourth role added to the schema fails HERE rather than shipping unreachable.
        expect(masterPlanningTools().map((e) => e.key))
            .toEqual(SITEWORKS_ROLES.map((r) => `siteworks.${r}`));
    });

    it('⭐ is a REGISTRY the other master-planning lane can join without touching the rail', () => {
        registerMasterPlanningTool({
            key: 'massing.block', label: 'Block', icon: 'x', action: () => {},
        });
        expect(masterPlanningTools().map((e) => e.key)).toContain('massing.block');
        expect(masterPlanningTools()).toHaveLength(4);
    });

    it('⛔ re-registering REPLACES rather than duplicating — one owner per key', () => {
        const before = masterPlanningTools().length;
        registerSiteworksRailTools();
        expect(masterPlanningTools()).toHaveLength(before);
    });

    it('⛔ ONE tool id for three entries (ADR-0384 D1) — not three families', () => {
        // Minting `siteworks-road` / `-parking` / `-pedestrian` would be the
        // `railing`/`handrail` split (L-4601) committed deliberately, and would put
        // three rows in ELEMENT_CREATION_MATRIX for one element kind.
        expect(PLAN_TOOL_KEYS).toContain(SITEWORKS_TOOL_ID);
        expect(PLAN_TOOL_KEYS.filter((k) => k.startsWith('siteworks'))).toEqual(['siteworks']);
    });
});

describe('⛔ THE C82 BAR — each entry ARMS the real plan tool on EVERY attached surface', () => {
    it('Road arms `siteworks` on BOTH plan surfaces (the L-73 parity guarantee)', () => {
        expect(byKey('siteworks.road').action()).toBeUndefined();
        expect(mainArmed).toEqual([SITEWORKS_TOOL_ID]);
        expect(svpArmed).toEqual([SITEWORKS_TOOL_ID]);
    });

    it('⭐ each entry sets its ROLE — the second authoring axis, before the arm', () => {
        for (const role of SITEWORKS_ROLES) {
            __resetActiveSiteworksAuthoringForTests();
            byKey(`siteworks.${role}`).action();
            expect(resolveActiveSiteworksRole()).toBe(role);
        }
    });

    it('⭐ the role SURVIVES the arm — it is not reset by the session', () => {
        byKey('siteworks.parking').action();
        expect(resolveActiveSiteworksRole()).toBe('parking');
        // Arming a second time (the same tool) reuses the session; the role must move.
        byKey('siteworks.pedestrian').action();
        expect(resolveActiveSiteworksRole()).toBe('pedestrian');
    });

    it('⛔ NOTHING is dispatched by pressing an entry — arming is not a mutation (P6)', () => {
        // A rail entry that created something on click is what the previous revision
        // did, and it is what the founder could not see. There is deliberately no bus
        // on `window.runtime` here: if any entry tried to dispatch, it would have to
        // find one, and the refusal toast below would name the missing bus instead of
        // the missing plan pane.
        byKey('siteworks.road').action();
        expect(toasts.some((t) => /command bus/i.test(t.message))).toBe(false);
    });
});

describe('no plan surface — the refusal', () => {
    it('⛔ refuses OUT LOUD and arms nothing — never a silent dead button (C82)', () => {
        installOverlays({ main: false, svp: false });
        expect(armSiteworks('road')).toBe(false);
        expect(mainArmed).toEqual([]);
        expect(svpArmed).toEqual([]);
        // C16 CA-18 — the reason AND the route back to success.
        const err = toasts.find((t) => t.kind === 'error');
        expect(err, 'a refusal that reaches nobody is not a refusal').toBeTruthy();
        expect(err!.message).toMatch(/plan view/i);
        expect(err!.message).toMatch(/Road/);
    });

    it('arms on the SPLIT pane alone when that is the only surface open', () => {
        installOverlays({ main: false, svp: true });
        expect(armSiteworks('pedestrian')).toBe(true);
        expect(svpArmed).toEqual([SITEWORKS_TOOL_ID]);
        expect(mainArmed).toEqual([]);
    });
});

describe('the cited defaults reach the user-facing text', () => {
    it('⭐ the tooltip quotes the SCHEMA width, never a retyped number', () => {
        for (const role of SITEWORKS_ROLES) {
            const cited = SITEWORKS_DEFAULT_WIDTH_M[role].valueM.toFixed(2);
            expect(siteworksRailTooltip(role)).toContain(cited);
            expect(siteworksRailTooltip(role)).toContain(SITEWORKS_RAIL_LABEL[role]);
        }
        // The three are genuinely different numbers, so a tooltip that had hard-coded
        // one of them would fail on the other two rather than pass by coincidence.
        expect(new Set(SITEWORKS_ROLES.map((r) => SITEWORKS_DEFAULT_WIDTH_M[r].valueM)).size).toBe(3);
    });
});

// ── SCRAMBLE CONTROLS (L-586) ────────────────────────────────────────────────
describe('SCRAMBLE — the arms above can fail', () => {
    it('an overlay that is NOT attached is not armed, even though it exists', () => {
        // The predicate is `isAttached()`, not "the object is on window". A test that
        // only checked for the object would pass against a detached pane.
        (window as any).planViewToolOverlay = {
            isAttached: () => false,
            setActiveTool: (t: string) => { mainArmed.push(t); },
        };
        armSiteworks('road');
        expect(mainArmed).toEqual([]);
        expect(svpArmed).toEqual([SITEWORKS_TOOL_ID]);
    });

    it('a DIFFERENT tool id would not satisfy the arms above', () => {
        armSiteworks('road');
        expect(mainArmed).not.toContain('boundary-line');
        expect(mainArmed).not.toContain('slab');
    });
});
