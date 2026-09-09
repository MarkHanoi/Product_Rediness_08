// §MASTER-PLAN-IS-REACHABLE (lane MP-WIRE, 2026-09-09) — ⭐⭐ THE ONLY ARMS THAT MATTER HERE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔⛔ WHY A SECOND SUITE, WHEN `masterPlanSection.spec.ts` ALREADY DRIVES EVERY CONTROL
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Because on the morning of 2026-09-09 the planner, the roster, the group verbs and both selection
// channels were ALL green, ALL scramble-proven, and the founder could not create a second building
// on any surface in the product. Measured: `masterPlanAuthoringPlan` was called by nothing but its
// own spec; `getDrawnEnvelopeProfiles` by nothing but its own module. Every suite in the fleet
// asserted EXISTENCE, and the one property nobody asserted was REACHABILITY
// ([[authored-but-unwired-is-the-bottleneck]] · [[committed-is-not-reachable]]).
//
// ⭐ SO EVERY ARM BELOW STARTS FROM A SURFACE THE FOUNDER CAN OPEN and reaches DOWN. Not one of
// them imports `mountMasterPlanSection` in order to call it:
//
//   ARM A — mount the REAL Parcel Law tab (`mountParcelLawTab` + `defaultParcelLawTabDeps`) and
//           find the master-plan section IN ITS DOM, inside question 2's body.
//   ARM B — ⭐⭐ THE FOUNDER'S OWN JOURNEY: on that same real tab, with a real roster of THREE
//           profiles, type a storey count, press ONE button, and assert the REAL bus received ONE
//           `spaceEnvelope.batch.create` carrying three groups. The bus here is the runtime's; the
//           tab was never told about it.
//   ARM C — construct the REAL right-hand tools rail (`ToolsPanelController`) and assert the
//           **Master planning** category exists EXACTLY ONCE, that ADR-0383's entries are in the
//           shared registry after nothing but that construction, and that pressing one ARMS the
//           real draw gesture.
//   ARM D — the negative controls, so none of the above can pass by luck.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ WHAT THESE ARMS DO NOT ESTABLISH
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Nothing here has been seen in a browser, and the DRAW half is not exercised end-to-end: no
// Cesium globe and no MapLibre map is mounted, so the profiles are seeded through the roster
// module's own API rather than by clicking corners on a viewport. What is proven is the wire from
// the panel to the bus; C114 §14d/§14e still applies to the 3-D leg.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    MASTER_PLAN_ROOT_TESTID,
    MASTER_PLAN_CREATE_BTN_TESTID,
    MASTER_PLAN_STOREYS_INPUT_TESTID,
    MASTER_PLAN_PROFILE_ROW_TESTID,
} from '../masterPlanSection';
import {
    __resetDrawnEnvelopeFootprintForTests,
    addDrawnEnvelopeProfile,
    setDrawnEnvelopeFootprint,
    type DrawnEnvelopeFootprint,
} from '../drawnEnvelopeFootprintState';
import { __resetEnvelopeDrawArmingForTests } from '../siteEnvelopeDrawArming';
import { QUESTION_GROUP_TESTID_PREFIX, resetQuestionGroupOpenState } from '../../analysis/parcelLawQuestionGroup';
// ⚠ STATIC, NOT `await import(...)` INSIDE THE ARMS — AND THAT IS A MEASUREMENT.
// The first draft resolved these lazily and FIVE arms died on `Test timed out in 10000ms`, every
// one of them at the import rather than at an assertion: `parcelLawTab` and `ToolsPanelController`
// pull the whole editor UI graph (CreateRailPanel alone is ~1,400 lines of furniture, icons and
// tool registries) and transforming it does not fit in a per-test budget. Hoisting pays that cost
// ONCE at collection, where it belongs. ⛔ A timeout is indistinguishable from a broken wire in a
// report, which is exactly the confusion this suite exists to remove.
import { mountParcelLawTab, defaultParcelLawTabDeps } from '../../analysis/parcelLawTab';
import { ToolsPanelController } from '../../tools-panel/ToolsPanelController';
import { masterPlanningTools } from '../../tools-panel/panels/masterPlanningRailRegistry';
import { MASSING_GROUP_ROOT_TESTID } from '../massingGroupSection';
import { registerEnvelopeDrawSurface, isEnvelopeDrawArmed } from '../siteEnvelopeDrawArming';
import { getDrawnEnvelopeProfiles } from '../drawnEnvelopeFootprintState';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE WORLD — a runtime with a REAL bus seam and storeys, installed on `window` the way the app
// installs them. ⛔ The tab and the section are never handed any of this directly; they RESOLVE it,
// which is the half of the wire an injected double would skip.
// ══════════════════════════════════════════════════════════════════════════════════════════════

interface Sent { readonly type: string; readonly payload: unknown }

const LEVELS = [
    { id: 'lvl-0', name: 'Ground', elevation: 0, height: 3 },
    { id: 'lvl-1', name: 'Level 1', elevation: 3, height: 3 },
    { id: 'lvl-2', name: 'Level 2', elevation: 6, height: 3 },
];

const square = (x0: number, z0: number, s: number) => [
    { x: x0, z: z0 },
    { x: x0 + s, z: z0 },
    { x: x0 + s, z: z0 + s },
    { x: x0, z: z0 + s },
];

const footprint = (x0: number, z0: number, s = 10): DrawnEnvelopeFootprint => ({
    ring: square(x0, z0, s),
    areaM2: s * s,
    surfaceId: 'site-map-2d',
    mode: 'linear',
});

let sent: Sent[] = [];

function installWorld(): void {
    sent = [];
    const w = window as unknown as Record<string, unknown>;
    w.runtime = {
        stores: {
            // An empty, READABLE space-envelope store: nothing is on the storeys yet.
            spaceEnvelope: { getState: () => new Map<string, unknown>() },
        },
        bus: {
            registeredTypes: ['spaceEnvelope.batch.create'],
            executeCommand: (type: string, payload: unknown) => { sent.push({ type, payload }); },
        },
    };
    w.bimManager = { getLevels: () => LEVELS };
}

function clearWorld(): void {
    const w = window as unknown as Record<string, unknown>;
    delete w.runtime;
    delete w.bimManager;
}

/** THREE profiles in the session roster, well apart — the founder's own gesture, seeded. */
function threeProfiles(): void {
    setDrawnEnvelopeFootprint(footprint(0, 0));
    addDrawnEnvelopeProfile(footprint(40, 0));
    addDrawnEnvelopeProfile(footprint(80, 0));
}

const tick = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });

beforeEach(() => {
    __resetDrawnEnvelopeFootprintForTests();
    __resetEnvelopeDrawArmingForTests();
    resetQuestionGroupOpenState();
    installWorld();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    clearWorld();
    __resetDrawnEnvelopeFootprintForTests();
    __resetEnvelopeDrawArmingForTests();
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM A + B — the REAL Parcel Law tab reaches the master-plan create path', () => {
    it('⭐ ARM A — the section is IN the mounted tab, inside question 2 ("law")', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawTab(host, defaultParcelLawTabDeps());
        await tick();

        const section = h.element.querySelector(`[data-testid="${MASTER_PLAN_ROOT_TESTID}"]`);
        expect(section, 'the master-plan section is not mounted in the Parcel Law tab').not.toBeNull();

        // ⛔ AND IN THE RIGHT QUESTION. A section mounted into the tab but hung off question 6
        // would satisfy a naive "is it in the DOM" arm while sitting where nobody acts on the
        // parcel — the founder ruled question 2's scope twice (C115 §2.2 / §6).
        const law = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}law"]`);
        expect(law, 'question 2 ("law") is not in this tab').not.toBeNull();
        expect(law!.contains(section!)).toBe(true);

        h.dispose();
        host.remove();
    });

    it('⭐⭐ ARM B — THE FOUNDER\'S JOURNEY: three profiles → one button → ONE batch on the REAL bus', async () => {
        threeProfiles();
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawTab(host, defaultParcelLawTabDeps());
        await tick();

        const root = h.element.querySelector<HTMLElement>(`[data-testid="${MASTER_PLAN_ROOT_TESTID}"]`)!;
        // The roster the tab shows is the SESSION roster — nothing was handed to it.
        expect(root.querySelectorAll(`[data-testid="${MASTER_PLAN_PROFILE_ROW_TESTID}"]`)).toHaveLength(3);

        const input = root.querySelector<HTMLInputElement>(`[data-testid="${MASTER_PLAN_STOREYS_INPUT_TESTID}"]`)!;
        input.value = '2';
        input.dispatchEvent(new Event('input'));

        const btn = root.querySelector<HTMLButtonElement>(`[data-testid="${MASTER_PLAN_CREATE_BTN_TESTID}"]`)!;
        expect(btn.disabled, `the create button is disabled: ${btn.title}`).toBe(false);
        btn.click();

        // ⛔ ONE dispatch, on the runtime's OWN bus. Three would be three Ctrl+Zs (C114 §6a).
        expect(sent).toHaveLength(1);
        expect(sent[0]!.type).toBe('spaceEnvelope.batch.create');
        const payload = sent[0]!.payload as { envelopes: { group: { id: string; label: string } | null }[] };
        expect(payload.envelopes).toHaveLength(6);                       // 3 blocks × 2 storeys
        expect(new Set(payload.envelopes.map((e) => e.group?.id)).size).toBe(3);
        expect(payload.envelopes.every((e) => e.group !== null)).toBe(true);

        h.dispose();
        host.remove();
    });

    it('⭐ ARM A2 — the group ROSTER section (ADR-0383 S7) is mounted in the same question', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawTab(host, defaultParcelLawTabDeps());
        await tick();
        const law = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}law"]`)!;
        const roster = h.element.querySelector(`[data-testid="${MASSING_GROUP_ROOT_TESTID}"]`);
        expect(roster, 'the massing-group section is not mounted').not.toBeNull();
        expect(law.contains(roster!)).toBe(true);
        h.dispose();
        host.remove();
    });

    it('⛔ dispose takes the section down — no subscription outlives the tab', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawTab(host, defaultParcelLawTabDeps());
        await tick();
        expect(h.element.querySelector(`[data-testid="${MASTER_PLAN_ROOT_TESTID}"]`)).not.toBeNull();
        h.dispose();
        expect(document.querySelector(`[data-testid="${MASTER_PLAN_ROOT_TESTID}"]`)).toBeNull();
        host.remove();
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ARM C — the "Master planning" category on the REAL right-hand rail.
//
// ⭐⭐ THE NEAR-MISS THIS ARM RECORDS. On 2026-09-09 lanes SITEWORKS and MP-WIRE each added a row
// labelled *"Master planning"* to `ToolsPanelController`, minutes apart, and BOTH were in the
// working tree at once — two identical buttons on the founder's rail, on the evening he asked why
// the category did not exist at all. SITEWORKS had also built
// `masterPlanningRailRegistry.ts`, whose header measures ADR-0383's reciprocal row as MISSING and
// invites this lane to join "WITHOUT touching CreateRailPanel". MP-WIRE's rival row was DELETED
// and its content registered into that registry instead. These arms pin BOTH halves of that.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM C — the "Master planning" category on the REAL right-hand rail', () => {
    /** The props the rail asks for. Nothing the master-planning entries read is in here. */
    const railProps = (): never => ({
        bimManager: { getLevels: () => LEVELS },
        toolManager: {},
        selectionManager: {},
        wallTool: {},
        slabTool: {},
        service: {},
        projectContext: {},
        toggleShadows: async () => {},
        toggleBimVisibility: () => {},
        applyVisualStyle: async () => {},
        gisToggle: () => {},
        gisFlyTo: async () => {},
        gisPlaceBim: async () => {},
        gisGizmoMode: () => {},
        gisResetGeoreference: () => {},
        gisStartBoundaryDraw: () => {},
    }) as never;

    it('⛔⛔ EXACTLY ONE Master planning category — never two rails for one subject', () => {
        const controller = new ToolsPanelController(railProps(), null);
        const matches = Array.from(controller.element.querySelectorAll<HTMLElement>('.tp-section-btn'))
            .filter((b) => b.title === 'Master planning');
        expect(matches).toHaveLength(1);
        document.querySelector('.tpr-panel')?.remove();
    });

    it('⭐⭐ ADR-0383 entries are IN the shared registry once the rail is constructed', () => {
        // ⛔ CONSTRUCTING THE RAIL IS WHAT REGISTERS THEM — this arm never calls
        // `registerMassingRailTools` itself, because a suite that registers its own subject proves
        // registration works and nothing about whether anything DOES it.
        const controller = new ToolsPanelController(railProps(), null);
        expect(controller.element).not.toBeNull();
        const keys = masterPlanningTools().map((e) => e.key);
        expect(keys, `registry: ${keys.join(' · ')}`).toContain('massing.draw-profile');
        expect(keys).toContain('massing.add-profile');
        // ⭐ AND THE CATEGORY IS SHARED, not annexed — the siteworks half is still there.
        expect(keys.some((k) => k.startsWith('siteworks.'))).toBe(true);
        document.querySelector('.tpr-panel')?.remove();
    });

    it('⭐ pressing the registry entry ARMS THE REAL GESTURE — not a mode nothing implements', () => {
        // A surface registered through the arming module's OWN port, so the arm takes the
        // production path rather than a stub of it.
        registerEnvelopeDrawSurface({
            surfaceId: 'site-map-2d',
            groundPointFromPointer: () => null,
            drawPreview: () => {},
            clearPreview: () => {},
            arm: () => true,
            disarm: () => {},
        } as never);

        const controller = new ToolsPanelController(railProps(), null);
        expect(controller.element).not.toBeNull();
        const draw = masterPlanningTools().find((e) => e.key === 'massing.draw-profile');
        expect(draw, 'the Building Profile entry is not registered').toBeDefined();

        expect(isEnvelopeDrawArmed()).toBe(false);
        draw!.action();
        // ⛔ READ OFF THE ARMING MODULE, never off the button — C82's census is 267 pairs that
        // rendered and did nothing, and only the far end of the wire can tell them apart.
        expect(isEnvelopeDrawArmed()).toBe(true);
        document.querySelector('.tpr-panel')?.remove();
    });

    it('⭐ "Another Profile" APPENDS to the same session roster the panel reads', () => {
        const controller = new ToolsPanelController(railProps(), null);
        expect(controller.element).not.toBeNull();
        const add = masterPlanningTools().find((e) => e.key === 'massing.add-profile')!;

        // ⛔ WITH AN EMPTY ROSTER IT ADDS NOTHING — a rail button that minted a profile out of no
        // perimeter would put a block with no shape into the plan.
        add.action();
        expect(getDrawnEnvelopeProfiles()).toHaveLength(0);

        setDrawnEnvelopeFootprint(footprint(0, 0));
        add.action();
        expect(getDrawnEnvelopeProfiles().map((p) => p.label)).toEqual(['Profile 1', 'Profile 2']);
        document.querySelector('.tpr-panel')?.remove();
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ARM D — ⛔⛔ THE NEGATIVE CONTROLS. A sibling lane's scramble caught its own headline arm passing
// with the feature DELETED, because it asserted a value that was reachable by luck. These arms
// exist so the three above cannot be.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM D — the negative controls', () => {
    it('⛔ with an EMPTY roster the tab still mounts the section, and the button is DISABLED', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawTab(host, defaultParcelLawTabDeps());
        await tick();
        const root = h.element.querySelector<HTMLElement>(`[data-testid="${MASTER_PLAN_ROOT_TESTID}"]`)!;
        const btn = root.querySelector<HTMLButtonElement>(`[data-testid="${MASTER_PLAN_CREATE_BTN_TESTID}"]`)!;
        // ⭐ THE ARM THAT STOPS ARM B PASSING BY LUCK: pressing with nothing drawn dispatches NOTHING.
        expect(btn.disabled).toBe(true);
        btn.click();
        expect(sent).toHaveLength(0);
        h.dispose();
        host.remove();
    });

    it('⛔ a runtime whose bus has NO handler for the verb dispatches nothing — and says why', async () => {
        (window as unknown as { runtime: { bus: { registeredTypes: string[] } } })
            .runtime.bus.registeredTypes = ['spaceEnvelope.create'];
        threeProfiles();
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawTab(host, defaultParcelLawTabDeps());
        await tick();
        const root = h.element.querySelector<HTMLElement>(`[data-testid="${MASTER_PLAN_ROOT_TESTID}"]`)!;
        const input = root.querySelector<HTMLInputElement>(`[data-testid="${MASTER_PLAN_STOREYS_INPUT_TESTID}"]`)!;
        input.value = '2';
        input.dispatchEvent(new Event('input'));
        const btn = root.querySelector<HTMLButtonElement>(`[data-testid="${MASTER_PLAN_CREATE_BTN_TESTID}"]`)!;
        expect(btn.disabled).toBe(true);
        expect(btn.title).toContain('batch.create');
        btn.click();
        expect(sent).toHaveLength(0);
        h.dispose();
        host.remove();
    });

    it('⛔ the testid ARM B searches for is not a string this suite invented', () => {
        // A constant renamed in the section but hard-coded here would make every arm above green
        // against a section nobody can see. Both halves come from the module, so they cannot drift.
        expect(MASTER_PLAN_ROOT_TESTID).toBe('site-master-plan');
        expect(MASTER_PLAN_CREATE_BTN_TESTID).toBe('site-master-plan-create');
    });
});
