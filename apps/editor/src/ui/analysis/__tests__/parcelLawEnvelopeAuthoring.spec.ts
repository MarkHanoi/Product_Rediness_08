// §PL-ENVELOPE-AUTHORING — the REACHABILITY half. A green planner suite is not a user capability.
//
// ⭐ WHAT THIS FILE IS FOR. `envelopeAuthoringPlan.spec.ts` pins the DECISION. These cases pin the
// CHAIN the founder actually walks: the section is mounted by the Parcel Law tab · the create
// button dispatches the ONE command · the live law check re-renders on the SAME store channel the
// 3-D scene renders from · the perimeter-edit button reaches the shipped outline editor.
//
// ⛔ WHAT IT STILL DOES NOT ESTABLISH, stated so a green run is not misread (C114 §14d/§14e):
// nothing here has been seen in a browser. The bus, the store and the profile-edit tool are FAKES
// of the SEAM. The last link — that a created envelope is DRAWN — belongs to
// `attachSpaceEnvelopeRender`, which subscribes the same store this section writes through.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    AUTHORING_CREATE_BTN_TESTID,
    AUTHORING_CREATED_TESTID,
    AUTHORING_EDIT_PERIMETER_ATTR,
    AUTHORING_LAWCHECK_TESTID,
    AUTHORING_LAWCHECK_LEDE_TESTID,
    AUTHORING_SLOT_TESTID,
    AUTHORING_SOURCE_TESTID,
    AUTHORING_STATUS_TESTID,
    AUTHORING_STOREYS_INPUT_TESTID,
    AUTHORING_SUBSCRIBED_ATTR,
    AUTHORING_ADVISORY_TESTID,
    buildLiveLawCheck,
    mountParcelLawEnvelopeAuthoring,
    resolveFootprintSource,
    type ParcelLawEnvelopeAuthoringDeps,
} from '../parcelLawEnvelopeAuthoring';
import type { ParcelLawModel } from '../../site/parcel/parcelLawModel';
import { __resetTargetFootprintProposalForTests } from '../../site/targetFootprintAreaState';

const RING = [
    { x: 0, z: 0 },
    { x: 20, z: 0 },
    { x: 20, z: 10 },
    { x: 0, z: 10 },
];

/** A model shaped like the founder's worked example: 1,200 m² parcel · 200 m² footprint · FAR ⇒ 320. */
function model(over: Partial<ParcelLawModel> = {}): ParcelLawModel {
    return {
        identity: null,
        identityAbsence: 'none',
        committedAreaM2: 1200,
        geometry: {
            areaM2: 1200,
            perimeterM: 140,
            bboxWidthM: 40,
            bboxDepthM: 30,
            edgeCount: 4,
            frontageClause: 'x',
            frontEdgeCount: 1,
        },
        geometryAbsence: null,
        envelopeState: 'full',
        refusal: null,
        ordinance: {
            zoneCode: 'generic-urban',
            buildableDepthM: null,
            depthIsBlockGranular: false,
            depthTerm: 'depth',
            alignmentOffsetM: null,
            maxHeightM: 12,
            maxFloors: 4,
            maxFAR: 320 / 1200,
            maxCoveragePct: 50,
            setbackFrontM: null,
            setbackSideM: null,
            setbackRearM: null,
            citation: null,
            sourceId: null,
        },
        massing: {
            footprintM2: 200,
            footprintIsUpperBound: false,
            coveragePct: 16.7,
            footprintPerimeterM: 60,
            gfaM2: 800,
            studyVolumeM3: 2400,
        },
        perStorey: null,
        capacity: null,
        confidence: null,
        determinedAtIso: null,
        ...over,
    } as ParcelLawModel;
}

interface Harness {
    readonly deps: ParcelLawEnvelopeAuthoringDeps;
    readonly executed: { type: string; payload: unknown }[];
    /** Drive the store's dirty channel, as `applyPatch` does on execute / undo / redo. */
    fire(): void;
    /** What the store currently holds, keyed by id. */
    readonly state: Map<string, unknown>;
    readonly enterProfileEditMode: ReturnType<typeof vi.fn>;
}

function harness(over: Partial<ParcelLawEnvelopeAuthoringDeps> = {}, storeOk = true): Harness {
    const executed: { type: string; payload: unknown }[] = [];
    const state = new Map<string, unknown>();
    const listeners: (() => void)[] = [];
    const enterProfileEditMode = vi.fn();
    const store = storeOk
        ? {
            getState: () => state,
            subscribeDirty: (fn: () => void) => { listeners.push(fn); return () => { }; },
        }
        : undefined;
    const runtime = {
        bus: {
            executeCommand: (type: string, payload: unknown) => {
                executed.push({ type, payload });
                // Mirror what the real handler does, so the live law check has something to read.
                const p = payload as { envelopes: { spaceEnvelopeId: string; levelId: string }[] };
                for (const e of p.envelopes) {
                    state.set(e.spaceEnvelopeId, {
                        id: e.spaceEnvelopeId,
                        levelId: e.levelId,
                        role: 'level',
                        footprintAreaM2: 200,
                        withinId: null,
                    });
                }
                for (const l of listeners) l();
            },
        },
        stores: { spaceEnvelope: store },
    };
    let idn = 0;
    const deps: ParcelLawEnvelopeAuthoringDeps = {
        runtime: () => runtime as never,
        readLevels: () => [
            { id: 'lvl-0', name: 'Ground', elevation: 0, height: 3 },
            { id: 'lvl-1', name: 'Level 1', elevation: 3, height: 3 },
            { id: 'lvl-2', name: 'Level 2', elevation: 6, height: 3 },
            { id: 'lvl-3', name: 'Level 3', elevation: 9, height: 3 },
        ],
        readModel: () => model(),
        readEnvelopeRing: () => RING,
        mintId: () => `se-${++idn}`,
        capabilityHost: {
            spaceEnvelopeTool: {
                enterProfileEditMode,
                profileEditAvailability: () => ({ ok: true }),
            },
        },
        ...over,
    };
    return {
        deps,
        executed,
        state,
        enterProfileEditMode,
        fire: () => { for (const l of listeners) l(); },
    };
}

const q = <T extends Element>(sel: string): T | null => document.querySelector<T>(sel);
const byTestId = <T extends Element>(id: string): T | null => q<T>(`[data-testid="${id}"]`);

beforeEach(() => {
    document.body.innerHTML = '';
    __resetTargetFootprintProposalForTests();
});

describe('mountParcelLawEnvelopeAuthoring — the create chain', () => {
    it('mounts a section that names the ring it will extrude and offers a live create button', () => {
        const h = harness();
        mountParcelLawEnvelopeAuthoring(document.body, h.deps);
        expect(byTestId(AUTHORING_SLOT_TESTID)).not.toBeNull();
        expect(byTestId(AUTHORING_SOURCE_TESTID)!.textContent)
            .toContain('200 m² permitted buildable footprint');
        const btn = byTestId<HTMLButtonElement>(AUTHORING_CREATE_BTN_TESTID)!;
        expect(btn.disabled).toBe(false);
    });

    it('⭐ ONE click = ONE `spaceEnvelope.batch.create` carrying N level envelopes', () => {
        const h = harness();
        mountParcelLawEnvelopeAuthoring(document.body, h.deps);
        const input = byTestId<HTMLInputElement>(AUTHORING_STOREYS_INPUT_TESTID)!;
        input.value = '3';
        input.dispatchEvent(new Event('input'));
        byTestId<HTMLButtonElement>(AUTHORING_CREATE_BTN_TESTID)!.click();

        expect(h.executed).toHaveLength(1);                       // ⛔ ONE command = ONE Ctrl+Z
        expect(h.executed[0]!.type).toBe('spaceEnvelope.batch.create');
        const payload = h.executed[0]!.payload as { envelopes: unknown[] };
        expect(payload.envelopes).toHaveLength(3);
        expect(byTestId(AUTHORING_STATUS_TESTID)!.getAttribute('data-state')).toBe('done');
        expect(byTestId(AUTHORING_STATUS_TESTID)!.textContent).toContain('One undo removes all of it');
    });

    it('offers one "Edit perimeter" button per created storey, reaching the SHIPPED editor', () => {
        const h = harness();
        mountParcelLawEnvelopeAuthoring(document.body, h.deps);
        const input = byTestId<HTMLInputElement>(AUTHORING_STOREYS_INPUT_TESTID)!;
        input.value = '2';
        input.dispatchEvent(new Event('input'));
        byTestId<HTMLButtonElement>(AUTHORING_CREATE_BTN_TESTID)!.click();

        const buttons = Array.from(
            byTestId(AUTHORING_CREATED_TESTID)!.querySelectorAll<HTMLButtonElement>(
                `[${AUTHORING_EDIT_PERIMETER_ATTR}]`,
            ),
        );
        expect(buttons).toHaveLength(2);
        buttons[0]!.click();
        expect(h.enterProfileEditMode).toHaveBeenCalledTimes(1);
        expect(h.enterProfileEditMode.mock.calls[0]![0]).toBe(
            buttons[0]!.getAttribute('data-space-envelope-id'),
        );
    });

    it('⛔ DISABLES the perimeter button with the tool\'s own reason rather than shipping a dead click', () => {
        const h = harness({
            capabilityHost: {
                spaceEnvelopeTool: {
                    enterProfileEditMode: vi.fn(),
                    profileEditAvailability: () => ({ ok: false, reason: 'no frame' }),
                },
            },
        });
        mountParcelLawEnvelopeAuthoring(document.body, h.deps);
        const input = byTestId<HTMLInputElement>(AUTHORING_STOREYS_INPUT_TESTID)!;
        input.value = '1';
        input.dispatchEvent(new Event('input'));
        byTestId<HTMLButtonElement>(AUTHORING_CREATE_BTN_TESTID)!.click();
        const btn = document.querySelector<HTMLButtonElement>(`[${AUTHORING_EDIT_PERIMETER_ATTR}]`)!;
        expect(btn.disabled).toBe(true);
        expect(btn.title).toBe('no frame');
    });

    it('says so when the outline editor is unreachable, and offers no button at all', () => {
        const h = harness({ capabilityHost: {} });
        mountParcelLawEnvelopeAuthoring(document.body, h.deps);
        const input = byTestId<HTMLInputElement>(AUTHORING_STOREYS_INPUT_TESTID)!;
        input.value = '1';
        input.dispatchEvent(new Event('input'));
        byTestId<HTMLButtonElement>(AUTHORING_CREATE_BTN_TESTID)!.click();
        expect(document.querySelector(`[${AUTHORING_EDIT_PERIMETER_ATTR}]`)).toBeNull();
        expect(byTestId(AUTHORING_CREATED_TESTID)!.textContent).toContain('not reachable in this session');
        // ⛔ And it does NOT claim the create failed — the envelopes exist.
        expect(byTestId(AUTHORING_STATUS_TESTID)!.getAttribute('data-state')).toBe('done');
    });

    it('⛔ refuses without dispatching, and prints both numbers, when there are too few storeys', () => {
        const h = harness();
        mountParcelLawEnvelopeAuthoring(document.body, h.deps);
        const input = byTestId<HTMLInputElement>(AUTHORING_STOREYS_INPUT_TESTID)!;
        input.value = '9';
        input.dispatchEvent(new Event('input'));
        byTestId<HTMLButtonElement>(AUTHORING_CREATE_BTN_TESTID)!.click();
        expect(h.executed).toHaveLength(0);
        const status = byTestId(AUTHORING_STATUS_TESTID)!;
        expect(status.getAttribute('data-state')).toBe('refused');
        expect(status.textContent).toContain('You asked for 9 floor levels');
        expect(status.textContent).toContain('this project has 4 storeys');
    });

    it('⭐ ADVISES — and still creates — when the ask exceeds the derived storey count', () => {
        const h = harness();
        mountParcelLawEnvelopeAuthoring(document.body, h.deps);
        const input = byTestId<HTMLInputElement>(AUTHORING_STOREYS_INPUT_TESTID)!;
        input.value = '4';                       // maxFloors is 4 → within; now push past it
        input.dispatchEvent(new Event('input'));
        byTestId<HTMLButtonElement>(AUTHORING_CREATE_BTN_TESTID)!.click();
        expect(byTestId(AUTHORING_ADVISORY_TESTID)!.hidden).toBe(true);

        document.body.innerHTML = '';
        const h2 = harness({ readModel: () => model({
            ordinance: { ...model().ordinance!, maxFloors: 2 },
        }) });
        mountParcelLawEnvelopeAuthoring(document.body, h2.deps);
        const i2 = byTestId<HTMLInputElement>(AUTHORING_STOREYS_INPUT_TESTID)!;
        i2.value = '3';
        i2.dispatchEvent(new Event('input'));
        byTestId<HTMLButtonElement>(AUTHORING_CREATE_BTN_TESTID)!.click();
        expect(h2.executed).toHaveLength(1);                                   // ⛔ NOT refused
        expect((h2.executed[0]!.payload as { envelopes: unknown[] }).envelopes).toHaveLength(3);
        const adv = byTestId(AUTHORING_ADVISORY_TESTID)!;
        expect(adv.hidden).toBe(false);
        expect(adv.textContent).toContain('You asked for 3 floor levels');
        expect(adv.textContent).toContain('derives 2');
    });

    it('withholds the control, with the reason, when there is no ring to extrude', () => {
        const h = harness({
            readEnvelopeRing: () => null,
            readModel: () => model({ massing: null }),
        });
        mountParcelLawEnvelopeAuthoring(document.body, h.deps);
        expect(byTestId<HTMLButtonElement>(AUTHORING_CREATE_BTN_TESTID)!.disabled).toBe(true);
        expect(byTestId(AUTHORING_SOURCE_TESTID)!.textContent)
            .toContain('NOT a finding that nothing may be built');
    });

    it('admits a missing bus as PRYZM\'s gap and creates nothing', () => {
        const h = harness({ runtime: () => ({ stores: {} } as never) });
        mountParcelLawEnvelopeAuthoring(document.body, h.deps);
        const input = byTestId<HTMLInputElement>(AUTHORING_STOREYS_INPUT_TESTID)!;
        input.value = '1';
        input.dispatchEvent(new Event('input'));
        byTestId<HTMLButtonElement>(AUTHORING_CREATE_BTN_TESTID)!.click();
        const status = byTestId(AUTHORING_STATUS_TESTID)!;
        expect(status.getAttribute('data-state')).toBe('refused');
        expect(status.textContent).toContain('gap in the wiring, not a refusal about your design');
    });
});

describe('the LIVE law check', () => {
    it('subscribes the SAME dirty channel the 3-D scene renders from', () => {
        const h = harness();
        const handle = mountParcelLawEnvelopeAuthoring(document.body, h.deps);
        expect(byTestId(AUTHORING_SLOT_TESTID)!.getAttribute(AUTHORING_SUBSCRIBED_ATTR)).toBe('yes');
        expect(handle.liveRepaintCount()).toBe(0);
        h.fire();
        expect(handle.liveRepaintCount()).toBe(1);
    });

    it('⛔ names WHICH half is missing when the store cannot be subscribed', () => {
        const h = harness({}, false);
        mountParcelLawEnvelopeAuthoring(document.body, h.deps);
        expect(byTestId(AUTHORING_SLOT_TESTID)!.getAttribute(AUTHORING_SUBSCRIBED_ATTR)).toBe('no:no-store');
        // ⛔ FAILURE IS NOT EMPTINESS — the channel's own sentence, never a table of zeros.
        expect(byTestId(AUTHORING_LAWCHECK_TESTID)!.textContent).toContain('NOT a finding that nothing is intended');
    });

    it('⭐ moves the remainder as envelopes are created — the founder\'s 200 / 320 / 120 example', () => {
        const h = harness();
        mountParcelLawEnvelopeAuthoring(document.body, h.deps);
        // Nothing drawn: the total is stated and nothing is allocated yet.
        expect(byTestId(AUTHORING_LAWCHECK_TESTID)!.textContent).toContain('320 m² total buildable');

        const input = byTestId<HTMLInputElement>(AUTHORING_STOREYS_INPUT_TESTID)!;
        input.value = '1';
        input.dispatchEvent(new Event('input'));
        byTestId<HTMLButtonElement>(AUTHORING_CREATE_BTN_TESTID)!.click();

        // 200 m² drawn on the ground ⇒ 120 m² remains for the floors above. THE FOUNDER'S SENTENCE.
        const law = byTestId(AUTHORING_LAWCHECK_TESTID)!;
        expect(law.textContent).toContain('You have allocated 200 m² of the 320 m² total buildable area');
        expect(law.textContent).toContain('120 m² remains for the floors above');
    });

    it('states how the table must be READ, in the open — a drawn envelope is not deleted', () => {
        const h = harness();
        mountParcelLawEnvelopeAuthoring(document.body, h.deps);
        const lede = byTestId(AUTHORING_LAWCHECK_LEDE_TESTID)!;
        expect(lede.textContent).toContain('nothing was deleted or trimmed');
    });

    it('⛔ renders an UNKNOWN total as an admission, never as zero remaining', () => {
        const h = harness({
            readModel: () => model({
                ordinance: { ...model().ordinance!, maxFAR: null, maxFloors: null },
            }),
        });
        mountParcelLawEnvelopeAuthoring(document.body, h.deps);
        const law = byTestId(AUTHORING_LAWCHECK_TESTID)!;
        expect(law.textContent).toContain('does not know the TOTAL');
        expect(law.textContent).toContain('will not guess');
        expect(law.textContent).not.toContain('0 m² remains');
    });
});

describe('buildLiveLawCheck — what is DRAWN becomes the allocation', () => {
    it('gives a storey with no envelope its CEILING, which answers "what can I build up there?"', () => {
        const m = model();
        const out = buildLiveLawCheck(
            m,
            [
                { id: 'lvl-0', name: 'Ground', elevation: 0, height: 3 },
                { id: 'lvl-1', name: 'Level 1', elevation: 3, height: 3 },
            ],
            {
                readable: true,
                byLevel: [{
                    levelId: 'lvl-0',
                    name: 'Ground',
                    elevation: 0,
                    levelEnvelopeCount: 1,
                    intendedAreaM2: 200,
                    rooms: [],
                    roomsSubtotalM2: 0,
                }],
                roomEnvelopeCount: 0,
                roomsOnStoreysWithoutLevel: 0,
                skippedCount: 0,
                totalIntendedM2: 200,
            },
        );
        expect(out.allocatedM2).toBe(200);
        expect(out.remainingM2).toBeCloseTo(120, 6);
        const first = out.rows.find((r) => r.levelId === 'lvl-1')!;
        expect(first.requestedM2).toBeNull();
        expect(first.ceilingM2).toBeCloseTo(120, 6);      // ⭐ "only 120 m² on the first floor"
        expect(first.ceilingSource).toBe('remaining-brut');
    });
});

describe('resolveFootprintSource', () => {
    it('names an UPPER-BOUND footprint as one rather than presenting it as buildable', () => {
        const src = resolveFootprintSource(
            model({ massing: { ...model().massing!, footprintIsUpperBound: true } }),
            RING,
        );
        expect(src.ring).toBe(RING);
        expect(src.text).toContain('upper bound, not a buildable area');
    });

    it('returns no ring, and a reason, when nothing has been solved or fitted', () => {
        const src = resolveFootprintSource(model({ massing: null }), null);
        expect(src.ring).toBeNull();
        expect(src.text).toContain('NOT a finding that nothing may be built');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE LINK THE FOUNDER ACTUALLY WALKS: the PARCEL LAW TAB mounts this section.
//
// This is the assertion that separates "the module exists" from "a user can reach it". It drives
// the REAL `mountParcelLawTab` with fakes only for the OTHER producers, and leaves `mountAuthoring`
// unset — so what is exercised is the PRODUCTION default (`defaultParcelLawTabDeps` →
// `mountParcelLawEnvelopeAuthoring`), on a runtime with no space-envelope store, which is the
// state every session is in before the engine composes.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('REACHABILITY — the Parcel Law tab hosts the authoring section', () => {
    it('mounts it into its own slot, through the production default, without a runtime', async () => {
        const { mountParcelLawTab, PARCEL_LAW_AUTHORING_HOST_TESTID } = await import('../parcelLawTab');
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const handle = mountParcelLawTab(hostEl, {
            capabilityHost: {},
            runtime: null,
            buildParcelPanel: () => ({ element: document.createElement('div'), dispose: () => { } }),
            mountSwitcher: () => ({
                element: document.createElement('div'),
                repaint: () => { },
                dispose: () => { },
            }),
            wireStrip: () => 0,
        });
        const slot = hostEl.querySelector(`[data-testid="${PARCEL_LAW_AUTHORING_HOST_TESTID}"]`);
        expect(slot).not.toBeNull();
        // The section itself is INSIDE that slot — the slot alone would be an empty promise.
        expect(slot!.querySelector(`[data-testid="${AUTHORING_SLOT_TESTID}"]`)).not.toBeNull();
        // ⛔ And with no store it says so rather than rendering a table of zeros.
        expect(slot!.querySelector(`[data-testid="${AUTHORING_LAWCHECK_TESTID}"]`)!.textContent)
            .toContain('NOT a finding that nothing is intended');
        handle.dispose();
        expect(hostEl.querySelector(`[data-testid="${AUTHORING_SLOT_TESTID}"]`)).toBeNull();
    });
});
