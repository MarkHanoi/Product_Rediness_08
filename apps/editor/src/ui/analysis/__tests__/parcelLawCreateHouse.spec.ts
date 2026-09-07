/**
 * §PL-CREATE-HOUSE (STR §25.8) — the plan, the refusals, and the call that is actually made.
 *
 * ⭐ THE TESTS THAT CARRY THIS LANE ARE THE REFUSALS AND ARM C's ARGUMENT ASSERTION.
 *
 * The refusals matter because "Create house" draws a NEW shell: run it on a level that already
 * carries authored walls and the user gets a second shell threaded through their model, with the
 * first neither removed nor accounted for. C80 forbids that, and `already-built` is where it is
 * enforced — with the wall count in the sentence.
 *
 * ARM C matters because the whole value of this lane is that it CALLS the proven pipeline rather
 * than reimplementing it. A test that only checked "the button did something" would pass against
 * a control that built the wrong plate on the wrong level, so the fake seam records the exact
 * arguments and the assertions read them.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    planCreateHouse,
    readLevelEnvelopes,
    HOUSE_WILL_NOT_CREATE,
    type LevelEnvelopeDatum,
} from '../../site/createHousePlan';
import {
    buildCreateHouseSection,
    CREATE_HOUSE_BTN_TESTID,
    CREATE_HOUSE_PLAN_TESTID,
    CREATE_HOUSE_REFUSAL_TESTID,
    CREATE_HOUSE_STATUS_TESTID,
    CREATE_HOUSE_TESTID,
    CREATE_HOUSE_WILLNOT_TESTID,
} from '../../site/createHouseSection';
import {
    mountParcelLawCreateHouse,
    defaultParcelLawCreateHouseDeps,
    CREATE_HOUSE_SUBSCRIBED_ATTR,
    PARCEL_LAW_CREATE_HOUSE_SLOT_TESTID,
    type HouseBuildResult,
    type ParcelLawCreateHouseDeps,
} from '../parcelLawCreateHouse';
import {
    BUILD_FROM_DESIGN_TESTID,
    BUILD_FROM_DESIGN_ROOMS_TESTID,
    BUILD_FROM_DESIGN_REFUSED_ROOMS_TESTID,
    BUILD_FROM_DESIGN_LABEL,
} from '../../site/createHouseSection';
import type { BuildFromDesignResult } from '../../site/buildFromDesignExecutor';
import type { BuildFromDesignPlan } from '../../site/buildFromDesignPlan';
import {
    mountParcelLawTab,
    PARCEL_LAW_CREATE_HOUSE_HOST_TESTID,
    type ParcelLawTabDeps,
    type ParcelLawCapabilityHost,
} from '../parcelLawTab';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

const SQUARE = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];

const lvl = (over: Partial<LevelEnvelopeDatum> = {}): LevelEnvelopeDatum => ({
    id: 'E-ground',
    levelId: 'L0',
    name: 'Ground envelope',
    baseOffset: 0,
    height: 3,
    footprint: SQUARE,
    footprintAreaM2: 120,
    ...over,
});

const q = (root: ParentNode, testid: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

beforeEach(() => { document.body.innerHTML = ''; });

// ═══════════════════════════════════════════════════════════════════════════
describe('ARM A — the plan: what the pipeline will be asked to build', () => {
    it('turns the lowest level envelope into a footprint, storeys and floor-to-floor', () => {
        const out = planCreateHouse({
            levelEnvelopes: [lvl({ id: 'E-1', baseOffset: 3, height: 3 }), lvl()],
            activeLevelId: 'L0',
            authoredWallCountOnActiveLevel: 0,
        });
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.plan.sourceEnvelopeId).toBe('E-ground');   // lowest baseOffset wins
        expect(out.plan.footprint).toHaveLength(4);
        expect(out.plan.footprintAreaM2).toBe(120);
        expect(out.plan.storeyCount).toBe(2);                  // one per LEVEL envelope
        expect(out.plan.floorToFloorM).toBe(3);
        expect(out.plan.groundLevelId).toBe('L0');
        expect(out.plan.roofKind).toBe('gable');
    });

    it('⭐ NAMES what it will NOT create — columns and beams, which the founder\'s sentence lists', () => {
        const out = planCreateHouse({ levelEnvelopes: [lvl()], activeLevelId: 'L0', authoredWallCountOnActiveLevel: 0 });
        if (!out.ok) throw new Error('unreachable');
        expect(out.plan.willNotCreate).toBe(HOUSE_WILL_NOT_CREATE);
        expect(out.plan.willNotCreate.join(' ')).toContain('columns');
        expect(out.plan.willNotCreate.join(' ')).toContain('beams');
        // …and what it WILL, measured in the executor's own dispatch list.
        expect(out.plan.willCreate.join(' ')).toContain('floor slabs');
        expect(out.plan.willCreate.join(' ')).toContain('roof');
        expect(out.plan.willCreate.join(' ')).toContain('ceilings');
    });

    it('says, as an ADVISORY not a refusal, that room envelopes are not the programme', () => {
        const out = planCreateHouse({ levelEnvelopes: [lvl()], activeLevelId: 'L0', authoredWallCountOnActiveLevel: 0 });
        if (!out.ok) throw new Error('unreachable');
        expect(out.plan.advisories.join(' ')).toContain('NOT used as the room programme');
        expect(out.plan.advisories.join(' ')).toContain('left untouched');
    });

    it('advises when the storeys do not share a height — it builds ONE floor-to-floor', () => {
        const out = planCreateHouse({
            levelEnvelopes: [lvl(), lvl({ id: 'E-1', baseOffset: 3, height: 4.2 })],
            activeLevelId: 'L0',
            authoredWallCountOnActiveLevel: 0,
        });
        if (!out.ok) throw new Error('unreachable');
        expect(out.plan.advisories.join(' ')).toContain('do not all have the same height');
        expect(out.plan.floorToFloorM).toBe(3);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('ARM B — the refusals, each naming the numbers it was decided from', () => {
    it('⛔ C80 — a level that already carries walls REFUSES, and prints the wall count', () => {
        const out = planCreateHouse({ levelEnvelopes: [lvl()], activeLevelId: 'L0', authoredWallCountOnActiveLevel: 56 });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.refusal.code).toBe('already-built');
        expect(out.refusal.text).toContain('56 authored walls');
        expect(out.refusal.text).toContain('120 m² shell');       // BOTH numbers
        expect(out.refusal.text).toContain('Nothing has been created');
    });

    it('⭐ an UNREADABLE store and an EMPTY one are different refusals', () => {
        const unreadable = planCreateHouse({ levelEnvelopes: null, activeLevelId: 'L0', authoredWallCountOnActiveLevel: 0 });
        const empty = planCreateHouse({ levelEnvelopes: [], activeLevelId: 'L0', authoredWallCountOnActiveLevel: 0 });
        expect(unreadable.ok).toBe(false);
        expect(empty.ok).toBe(false);
        if (unreadable.ok || empty.ok) return;
        expect(unreadable.refusal.code).toBe('envelope-store-unreadable');
        expect(unreadable.refusal.text).toContain("gap in PRYZM's wiring");
        expect(empty.refusal.code).toBe('no-level-envelope');
        expect(empty.refusal.text).toContain('Draw a level envelope');
    });

    it('no active level refuses — the pipeline draws its shell on the active one', () => {
        const out = planCreateHouse({ levelEnvelopes: [lvl()], activeLevelId: null, authoredWallCountOnActiveLevel: 0 });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.refusal.code).toBe('no-active-level');
    });

    it('⛔ two rival ground plates REFUSE rather than picking one silently', () => {
        const out = planCreateHouse({
            levelEnvelopes: [lvl(), lvl({ id: 'E-other', footprintAreaM2: 200 })],
            activeLevelId: 'L0',
            authoredWallCountOnActiveLevel: 0,
        });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.refusal.code).toBe('ambiguous-ground-plate');
        expect(out.refusal.text).toContain('120 m²');
        expect(out.refusal.text).toContain('200 m²');
    });

    it('a degenerate ring refuses with its vertex count and its area', () => {
        const out = planCreateHouse({
            levelEnvelopes: [lvl({ footprint: [{ x: 0, z: 0 }, { x: 1, z: 0 }], footprintAreaM2: 0 })],
            activeLevelId: 'L0',
            authoredWallCountOnActiveLevel: 0,
        });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.refusal.code).toBe('degenerate-footprint');
        expect(out.refusal.text).toContain('2 vertices');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('readLevelEnvelopes — null is not empty', () => {
    it('⛔ an absent store yields null, so the refusal says "PRYZM could not read", not "you drew nothing"', () => {
        expect(readLevelEnvelopes(null)).toBeNull();
        expect(readLevelEnvelopes({} as never)).toBeNull();
        expect(readLevelEnvelopes({ getState: () => { throw new Error('boom'); } })).toBeNull();
    });

    it('skips ROOM envelopes — a room is not a storey plate', () => {
        const state = new Map<string, unknown>([
            ['a', { id: 'a', role: 'level', levelId: 'L0', baseOffset: 0, height: 3, footprint: SQUARE.map((p) => ({ ...p, y: 0 })), footprintAreaM2: 120, name: 'Ground' }],
            ['b', { id: 'b', role: 'room', levelId: 'L0', baseOffset: 0, height: 2.7, footprint: SQUARE.map((p) => ({ ...p, y: 0 })), footprintAreaM2: 20, name: 'Kitchen' }],
        ]);
        const out = readLevelEnvelopes({ getState: () => state })!;
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe('a');
        expect(out[0].footprint).toHaveLength(4);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('ARM C — the CONTROL: the button, the arguments, and the second-run gate', () => {
    function depsFor(
        envelopes: ReadonlyArray<[string, Record<string, unknown>]> | null,
        opts: {
            activeLevelId?: string | null;
            wallCount?: number;
            result?: HouseBuildResult;
            /** Runs INSIDE the fake pipeline, so a spec can make the world change as a build would. */
            onBuild?: () => void;
        } = {},
    ): { deps: ParcelLawCreateHouseDeps; calls: unknown[]; setWallCount(n: number): void } {
        const state = new Map<string, unknown>(envelopes ?? []);
        const store = envelopes === null ? null : { getState: () => state };
        const calls: unknown[] = [];
        let wallCount = opts.wallCount ?? 0;
        return {
            calls,
            setWallCount(n) { wallCount = n; },
            deps: {
                runtime: () => ({ stores: { spaceEnvelope: store } } as unknown as PryzmRuntime),
                activeLevelId: () => (opts.activeLevelId === undefined ? 'L0' : opts.activeLevelId),
                authoredWallCount: () => wallCount,
                buildHouse: async (_rt, storeyCount, o) => {
                    calls.push({ storeyCount, ...o });
                    opts.onBuild?.();
                    return opts.result ?? { ok: true, levelIds: ['L0', 'L1'] };
                },
            },
        };
    }

    const groundEnv: [string, Record<string, unknown>] = ['E-g', {
        id: 'E-g', role: 'level', levelId: 'L0', name: 'Ground envelope',
        baseOffset: 0, height: 3.2, footprintAreaM2: 120,
        footprint: SQUARE.map((p) => ({ x: p.x, y: 0, z: p.z })),
    }];

    it('⭐ the click calls the pipeline with THIS envelope\'s ring, storeys and floor-to-floor', async () => {
        const { deps, calls } = depsFor([groundEnv]);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawCreateHouse(host, deps);

        const btn = q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
        btn.click();
        await new Promise((r) => setTimeout(r, 0));

        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({
            storeyCount: 1,
            footprint: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }],
            floorToFloorM: 3.2,
            roofKind: 'gable',
        });
        expect(q(h.element, CREATE_HOUSE_STATUS_TESTID)?.textContent).toContain('House built');
        h.dispose();
    });

    it('⛔ a SECOND run is refused once the level carries walls — C80, enforced after the build', async () => {
        // The build lands, and the level now has walls — exactly as it would in the real app,
        // because `generateHouseFromBoundary` draws one `wall.create` per footprint edge.
        let ctl!: ReturnType<typeof depsFor>;
        ctl = depsFor([groundEnv], { onBuild: () => ctl.setWallCount(28) });
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawCreateHouse(host, ctl.deps);
        (q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 0));

        const btn2 = q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement;
        expect(btn2.disabled, 'a second run must not be one click away').toBe(true);
        expect(q(h.element, CREATE_HOUSE_REFUSAL_TESTID)?.textContent).toContain('28 authored walls');
        h.dispose();
    });

    it('the pipeline\'s OWN refusal reason is printed verbatim, not replaced', async () => {
        const { deps } = depsFor([groundEnv], { result: { ok: false, reason: 'shell not ready' } });
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawCreateHouse(host, deps);
        (q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 0));
        expect(q(h.element, CREATE_HOUSE_STATUS_TESTID)?.textContent).toContain('shell not ready');
        expect(q(h.element, CREATE_HOUSE_STATUS_TESTID)?.textContent).toContain('Nothing was created');
        h.dispose();
    });

    it('⛔ with no envelope the button is DISABLED, never a dead click', () => {
        const { deps, calls } = depsFor([]);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawCreateHouse(host, deps);
        const btn = q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        btn.click();
        expect(calls).toHaveLength(0);
        expect(q(h.element, CREATE_HOUSE_REFUSAL_TESTID)?.textContent).toContain('Draw a level envelope');
        h.dispose();
    });

    it('⭐ LIVE — drawing an envelope enables the button with no other event', () => {
        const state = new Map<string, unknown>();
        const listeners = new Set<(d: never, s: never) => void>();
        const store = {
            getState: () => state,
            subscribeDirty(l: never): () => void { listeners.add(l); return () => { listeners.delete(l); }; },
        };
        const deps: ParcelLawCreateHouseDeps = {
            runtime: () => ({ stores: { spaceEnvelope: store } } as unknown as PryzmRuntime),
            activeLevelId: () => 'L0',
            authoredWallCount: () => 0,
            buildHouse: async () => ({ ok: true }),
        };
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawCreateHouse(host, deps);
        expect(host.querySelector<HTMLElement>(`[data-testid="${CREATE_HOUSE_TESTID}"]`)?.getAttribute('data-arm'))
            .toBe('no-level-envelope');
        expect(h.element.getAttribute(CREATE_HOUSE_SUBSCRIBED_ATTR)).toBe('yes');

        state.set(groundEnv[0], groundEnv[1]);
        for (const l of listeners) (l as unknown as () => void)();

        expect((q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).disabled).toBe(false);
        expect(q(h.element, CREATE_HOUSE_PLAN_TESTID)?.textContent).toContain('Ground envelope');
        h.dispose();
        expect(listeners.size).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('ARM D — the renderer, and REACHABILITY from the tab', () => {
    it('the disabled arm carries the refusal\'s own words', () => {
        const el = document.createElement('div');
        el.innerHTML = buildCreateHouseSection(
            planCreateHouse({ levelEnvelopes: [lvl()], activeLevelId: 'L0', authoredWallCountOnActiveLevel: 4 }));
        expect((q(el, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).disabled).toBe(true);
        expect(q(el, CREATE_HOUSE_REFUSAL_TESTID)?.textContent).toContain('4 authored walls');
    });

    it('⭐ the enabled arm prints "Does NOT create" ON SCREEN, beside the button', () => {
        const el = document.createElement('div');
        el.innerHTML = buildCreateHouseSection(
            planCreateHouse({ levelEnvelopes: [lvl()], activeLevelId: 'L0', authoredWallCountOnActiveLevel: 0 }));
        expect(q(el, CREATE_HOUSE_WILLNOT_TESTID)?.textContent).toContain('columns');
        expect(q(el, CREATE_HOUSE_WILLNOT_TESTID)?.textContent).toContain('beams');
        // §25.0 — the copy must not promise a house in one click.
        expect(el.textContent).toContain('does not build a house in one click');
    });

    it('⛔ C08 §3.1 — an authored envelope name is escaped', () => {
        const el = document.createElement('div');
        el.innerHTML = buildCreateHouseSection(planCreateHouse({
            levelEnvelopes: [lvl({ name: '<img src=x onerror=alert(1)>' })],
            activeLevelId: 'L0',
            authoredWallCountOnActiveLevel: 0,
        }));
        expect(el.querySelector('img')).toBeNull();
        expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
    });

    it('⭐ mountParcelLawTab mounts it with the PRODUCTION control, into its own slot', () => {
        const capabilityHost: ParcelLawCapabilityHost = {
            pryzmGetSiteViewState: () => ({ segment: '2D', formaMode: 'plan', buildingFidelity: 'real' }),
        };
        // `mountCreateHouse` is deliberately NOT provided — the tab must fall through to the
        // production control. That is the reachability assertion.
        const deps: ParcelLawTabDeps = {
            capabilityHost,
            runtime: null,
            buildParcelPanel: () => ({ element: document.createElement('div'), dispose: () => { /* noop */ } }),
            mountSwitcher: () => ({ element: document.createElement('div'), repaint: () => { /* noop */ }, dispose: () => { /* noop */ } }),
            wireStrip: () => 0,
            readParcelLawModel: () => ({ kind: 'absent' } as never),
            renderParcelLawFacts: () => document.createElement('div'),
        };
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawTab(host, deps);

        const slot = q(host, PARCEL_LAW_CREATE_HOUSE_HOST_TESTID);
        expect(slot, 'the tab must own a slot for the §25.8 action').not.toBeNull();
        const section = q(host, PARCEL_LAW_CREATE_HOUSE_SLOT_TESTID);
        expect(section, 'the production control must have mounted into it').not.toBeNull();
        expect(slot!.contains(section!)).toBe(true);
        // No runtime ⇒ the store is unreadable ⇒ a DISABLED button and the wiring sentence.
        expect((q(section!, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).disabled).toBe(true);
        expect(section!.textContent).toContain('space-envelope store');
        h.dispose();
        expect(q(host, PARCEL_LAW_CREATE_HOUSE_SLOT_TESTID)).toBeNull();
    });

    it('the production deps resolve without a window runtime and never throw', () => {
        const deps = defaultParcelLawCreateHouseDeps();
        expect(deps.runtime()).toBeFalsy();
        expect(deps.activeLevelId()).toBeFalsy();
        expect(deps.authoredWallCount('L0')).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// §BIM-FROM-THE-DESIGN (L-13080) — ARM E: THE FOURTH ARM, AND THE ORDER BETWEEN THE ARMS
// ═══════════════════════════════════════════════════════════════════════════
// Founder, with 7 authored envelopes on screen: *"WHEN WE SAY — CREATE BIM — EXCLUDE THIS — WE
// ALREADY HAVE THE DESIGN."* He had drawn a level envelope and six rooms, and the click opened
// "Design your house — live" and asked him to design a house he had already designed.
//
// ⭐ THE THREE TESTS THAT CARRY THIS BLOCK ARE THE ORDER, AND THEY ARE ORDER TESTS ON PURPOSE.
// The fourth arm is only correct if it CANNOT weaken the two guarantees that already exist:
// C80's `already-built` still fires first on a level with walls, and the generator is still what
// a project with NO drawn rooms gets, advisory word for word. An arm that answered the founder by
// taking those away would be a worse defect than the one it closes.

describe('ARM E — §BIM-FROM-THE-DESIGN: build from the envelopes he already drew', () => {
    const PLATE = [{ x: 0, z: 0 }, { x: 15, z: 0 }, { x: 15, z: 12.682 }, { x: 0, z: 12.682 }];
    const rect = (x0: number, z0: number, x1: number, z1: number) =>
        [{ x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z0 }, { x: x1, y: 0, z: z1 }, { x: x0, y: 0, z: z1 }];

    const groundEnv: [string, Record<string, unknown>] = ['E-g', {
        id: 'E-g', role: 'level', levelId: 'L0', name: 'Ground envelope',
        baseOffset: 0, height: 3, footprintAreaM2: 190.23,
        footprint: PLATE.map((p) => ({ x: p.x, y: 0, z: p.z })),
    }];

    /** Six rooms in a 3 × 2 grid — the founder's own case, 76.8 m² inside 190.23 m². */
    const SIX_ROOMS: Array<[string, Record<string, unknown>]> = ([
        ['R1', 1, 1, 5, 4.2], ['R2', 5, 1, 9, 4.2], ['R3', 9, 1, 13, 4.2],
        ['R4', 1, 4.2, 5, 7.4], ['R5', 5, 4.2, 9, 7.4], ['R6', 9, 4.2, 13, 7.4],
    ] as Array<[string, number, number, number, number]>).map(([id, x0, z0, x1, z1]) => [id, {
        id, role: 'room', levelId: 'L0', name: `Room ${id.slice(1)}`, withinId: 'E-g',
        baseOffset: 0, height: 3, footprintAreaM2: 12.8, footprint: rect(x0, z0, x1, z1),
    }] as [string, Record<string, unknown>]);

    function armDeps(
        envelopes: ReadonlyArray<[string, Record<string, unknown>]> | null,
        opts: {
            wallCount?: number;
            design?: BuildFromDesignResult;
            /** Omitted on purpose in one test — an unwired host must SAY so, not fall back. */
            wireDesign?: boolean;
        } = {},
    ): {
        deps: ParcelLawCreateHouseDeps;
        generatorCalls: unknown[];
        designCalls: BuildFromDesignPlan[];
    } {
        const state = new Map<string, unknown>(envelopes ?? []);
        const store = envelopes === null ? null : { getState: () => state };
        const generatorCalls: unknown[] = [];
        const designCalls: BuildFromDesignPlan[] = [];
        const deps: ParcelLawCreateHouseDeps = {
            runtime: () => ({ stores: { spaceEnvelope: store } } as unknown as PryzmRuntime),
            activeLevelId: () => 'L0',
            authoredWallCount: () => opts.wallCount ?? 0,
            buildHouse: async (_rt, storeyCount, o) => {
                generatorCalls.push({ storeyCount, ...o });
                return { ok: true } as HouseBuildResult;
            },
            ...(opts.wireDesign === false ? {} : {
                buildFromDesign: async (_rt, plan) => {
                    designCalls.push(plan);
                    return opts.design ?? {
                        ok: true, wallIds: plan.walls.map((_, i) => `WA-${i}`),
                        shellWallCount: plan.shellWallCount,
                        partitionWallCount: plan.partitionWallCount,
                        slabId: 'SL-1', slabRefusal: null, refusedRoomNames: [],
                        link: { wallsLinked: plan.walls.length, edgesWritten: plan.walls.length * 2, unlinked: [] },
                    };
                },
            }),
        };
        return { deps, generatorCalls, designCalls };
    }

    const mount = (deps: ParcelLawCreateHouseDeps) => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        return mountParcelLawCreateHouse(host, deps);
    };

    // ── THE ORDER ──────────────────────────────────────────────────────────────────────────────

    it('⭐ WITH ROOMS DRAWN, the generator does NOT open — the fourth arm is taken', () => {
        const { deps, generatorCalls, designCalls } = armDeps([groundEnv, ...SIX_ROOMS]);
        const h = mount(deps);

        expect(h.lastArm()?.mode).toBe('build-from-design');
        expect(q(h.element, BUILD_FROM_DESIGN_TESTID)?.getAttribute('data-arm')).toBe('build-from-design');
        expect(h.element.textContent).toContain(BUILD_FROM_DESIGN_LABEL);
        // ⛔ And the generator's own advisory is NOT on screen, because it is not what happens.
        expect(h.element.textContent).not.toContain('NOT used as the room programme');

        (q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).click();
        expect(generatorCalls, 'the house generator must not run when he has a design').toHaveLength(0);
        expect(designCalls).toHaveLength(1);
        expect(designCalls[0]!.shellWallCount).toBe(4);
        expect(designCalls[0]!.partitionWallCount).toBe(17);
        expect(designCalls[0]!.slabs).toHaveLength(1);
        h.dispose();
    });

    it('⛔ WITH NO ROOMS the generator arm is kept, word for word, advisory included', () => {
        const { deps, generatorCalls, designCalls } = armDeps([groundEnv]);
        const h = mount(deps);

        expect(h.lastArm()?.mode).toBe('create-house');
        expect(q(h.element, CREATE_HOUSE_TESTID)?.getAttribute('data-arm')).toBe('ok');
        expect(h.element.textContent).toContain('NOT used as the room programme');
        expect(q(h.element, BUILD_FROM_DESIGN_TESTID)).toBeNull();

        (q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).click();
        expect(generatorCalls, 'a project with no design still gets the generator').toHaveLength(1);
        expect(designCalls).toHaveLength(0);
        h.dispose();
    });

    it('⛔ C80 FIRST AND UNCONDITIONAL — a level carrying walls refuses, rooms or no rooms', () => {
        const { deps, generatorCalls, designCalls } = armDeps([groundEnv, ...SIX_ROOMS], { wallCount: 31 });
        const h = mount(deps);

        expect(h.lastArm()?.mode).toBe('create-house');
        expect(q(h.element, CREATE_HOUSE_TESTID)?.getAttribute('data-arm')).toBe('already-built');
        expect(q(h.element, CREATE_HOUSE_REFUSAL_TESTID)?.textContent).toContain('31 authored walls');
        const btn = q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        btn.click();
        expect(generatorCalls).toHaveLength(0);
        expect(designCalls).toHaveLength(0);
        h.dispose();
    });

    it('⛔ an unreadable store gives ONE answer — the wiring refusal, never a second opinion', () => {
        const { deps } = armDeps(null);
        const h = mount(deps);
        expect(h.lastArm()?.mode).toBe('create-house');
        expect(h.element.textContent).toContain('space-envelope store');
        expect((q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).disabled).toBe(true);
        h.dispose();
    });

    // ── WHAT THE SENTENCE SAYS BEFORE THE CLICK ────────────────────────────────────────────────

    it('⭐ names the source envelope and its area, the storey, and every room with its area', () => {
        const { deps } = armDeps([groundEnv, ...SIX_ROOMS]);
        const h = mount(deps);
        const text = h.element.textContent ?? '';
        expect(text).toContain('Ground envelope');
        expect(text).toContain('190.23 m²');
        expect(text).toContain('1 storey');
        expect(q(h.element, BUILD_FROM_DESIGN_ROOMS_TESTID)?.textContent).toContain('Your 6 rooms');
        expect(q(h.element, BUILD_FROM_DESIGN_ROOMS_TESTID)?.textContent).toContain('Room 1 — 12.8 m²');
        expect(text).toContain('4 exterior shell walls');
        expect(text).toContain('17 interior partitions');
        expect(text).toContain('1 floor slab');
        h.dispose();
    });

    it('⛔ and names what it does NOT create, above all the layout it will not generate', () => {
        const { deps } = armDeps([groundEnv, ...SIX_ROOMS]);
        const h = mount(deps);
        const text = h.element.textContent ?? '';
        expect(text).toContain('you drew one');
        expect(text).toContain('roof');
        expect(text).toContain('stairs');
        expect(text).toContain('doors or windows');
        expect(text).toContain('columns or beams');
        h.dispose();
    });

    it('⛔ a room that cannot be built is NAMED BEFORE THE CLICK, and the rest stay buildable', () => {
        const broken: [string, Record<string, unknown>] = ['R9', {
            id: 'R9', role: 'room', levelId: 'L0', name: 'Utility', withinId: 'E-g',
            baseOffset: 0, height: 3, footprintAreaM2: 0.2, footprint: rect(1, 9, 1.4, 9.4),
        }];
        const { deps, designCalls } = armDeps([groundEnv, ...SIX_ROOMS, broken]);
        const h = mount(deps);
        const refused = q(h.element, BUILD_FROM_DESIGN_REFUSED_ROOMS_TESTID);
        expect(refused, 'the refused room must be on the ENABLED arm, before the click').not.toBeNull();
        expect(refused!.textContent).toContain('Utility');
        expect(refused!.textContent).toContain('0.16 m²');
        expect((q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).disabled).toBe(false);

        (q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).click();
        expect(designCalls[0]!.rooms).toHaveLength(6);
        expect(designCalls[0]!.refusedRooms).toHaveLength(1);
        h.dispose();
    });

    // ── THE CLICK ──────────────────────────────────────────────────────────────────────────────

    it('⭐ the status names both counts, the slab, the link and the TWO-step undo', async () => {
        const { deps } = armDeps([groundEnv, ...SIX_ROOMS]);
        const h = mount(deps);
        (q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 0));
        const status = q(h.element, CREATE_HOUSE_STATUS_TESTID)?.textContent ?? '';
        expect(status).toContain('4 shell walls');
        expect(status).toContain('17 partitions');
        expect(status).toContain('1 floor slab');
        expect(status).toContain('21 walls recorded as derived from your envelope');
        expect(status).toContain('Undo takes two steps');
        h.dispose();
    });

    it('⛔ a refused SLAB keeps the walls and says so — the walls ARE the design', async () => {
        const { deps } = armDeps([groundEnv, ...SIX_ROOMS], {
            design: {
                ok: true, wallIds: ['WA-0'], shellWallCount: 4, partitionWallCount: 17,
                slabId: null, slabRefusal: 'the boundary self-intersects.',
                refusedRoomNames: [], link: { wallsLinked: 21, edgesWritten: 42, unlinked: [] },
            },
        });
        const h = mount(deps);
        (q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 0));
        const status = q(h.element, CREATE_HOUSE_STATUS_TESTID)?.textContent ?? '';
        expect(status).toContain('the boundary self-intersects.');
        expect(status).toContain('were not removed');
        h.dispose();
    });

    it('⛔ a link that was NOT recorded is reported — a silent one is a cascade that never fires', async () => {
        const { deps } = armDeps([groundEnv, ...SIX_ROOMS], {
            design: {
                ok: true, wallIds: ['WA-0'], shellWallCount: 4, partitionWallCount: 17,
                slabId: 'SL-1', slabRefusal: null, refusedRoomNames: [], link: null,
            },
        });
        const h = mount(deps);
        (q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 0));
        expect(q(h.element, CREATE_HOUSE_STATUS_TESTID)?.textContent)
            .toContain('will not follow the envelope when you move a face');
        h.dispose();
    });

    it("⛔ the executor's OWN refusal is printed verbatim, not replaced", async () => {
        const { deps } = armDeps([groundEnv, ...SIX_ROOMS], {
            design: { ok: false, reason: 'The wall batch was refused: WallDimensionsError.' },
        });
        const h = mount(deps);
        (q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 0));
        expect(q(h.element, CREATE_HOUSE_STATUS_TESTID)?.textContent)
            .toContain('The wall batch was refused: WallDimensionsError.');
        h.dispose();
    });

    it('⛔ AN UNWIRED HOST SAYS SO — it does not quietly run the generator instead', () => {
        const { deps, generatorCalls } = armDeps([groundEnv, ...SIX_ROOMS], { wireDesign: false });
        const h = mount(deps);
        (q(h.element, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).click();
        expect(generatorCalls, 'falling back to the generator IS the defect this arm closes').toHaveLength(0);
        expect(q(h.element, CREATE_HOUSE_STATUS_TESTID)?.textContent)
            .toContain('not wired to the build-from-design pipeline');
        h.dispose();
    });

    it('⭐ LIVE — drawing the first room envelope switches the arm with no other event', () => {
        const state = new Map<string, unknown>([groundEnv]);
        const listeners = new Set<() => void>();
        const store = {
            getState: () => state,
            subscribeDirty(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; },
        };
        const deps: ParcelLawCreateHouseDeps = {
            runtime: () => ({ stores: { spaceEnvelope: store } } as unknown as PryzmRuntime),
            activeLevelId: () => 'L0',
            authoredWallCount: () => 0,
            buildHouse: async () => ({ ok: true }),
            buildFromDesign: async () => ({ ok: true }),
        };
        const h = mount(deps);
        expect(h.lastArm()?.mode).toBe('create-house');

        state.set(SIX_ROOMS[0]![0], SIX_ROOMS[0]![1]);
        for (const l of listeners) l();

        expect(h.lastArm()?.mode).toBe('build-from-design');
        expect(q(h.element, BUILD_FROM_DESIGN_TESTID)).not.toBeNull();
        h.dispose();
        expect(listeners.size).toBe(0);
    });

    it('the production deps expose the build-from-design producer', () => {
        expect(typeof defaultParcelLawCreateHouseDeps().buildFromDesign).toBe('function');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// ⭐ REACHABILITY — the founder's OWN gesture, through the PRODUCTION deps
// ═══════════════════════════════════════════════════════════════════════════
// [[committed-is-not-reachable]] / [[authored-but-unwired-is-the-bottleneck]]: this repo's
// dominant defect shape is a correct producer nothing reaches. Every test above this line drives
// `mountParcelLawCreateHouse` with INJECTED deps — which proves the arm works, and proves nothing
// about whether the founder can get to it. He does not call a function: he opens question 6,
// *"Take me into BIM."*, and clicks the button in its body.
//
// So this block mounts the WHOLE TAB with `mountCreateHouse` deliberately NOT provided, forcing
// `defaultParcelLawCreateHouseDeps()` — the production wiring, resolving `window.runtime` and the
// house pipeline's own active-level resolver — and asserts the fourth arm is what lands in Q6's
// slot when room envelopes exist.
describe('⭐ REACHABILITY — Q6 "Take me into BIM." reaches the FOURTH arm, not the generator', () => {
    interface WindowUnderTest {
        runtime?: unknown;
        projectContext?: { activeLevelId?: string };
    }
    const w = window as unknown as WindowUnderTest;
    let savedRuntime: unknown;
    let savedContext: { activeLevelId?: string } | undefined;

    const tabDeps = (): ParcelLawTabDeps => ({
        capabilityHost: {
            pryzmGetSiteViewState: () => ({ segment: '2D', formaMode: 'plan', buildingFidelity: 'real' }),
        } as ParcelLawCapabilityHost,
        runtime: null,
        buildParcelPanel: () => ({ element: document.createElement('div'), dispose: () => { /* noop */ } }),
        mountSwitcher: () => ({ element: document.createElement('div'), repaint: () => { /* noop */ }, dispose: () => { /* noop */ } }),
        wireStrip: () => 0,
        readParcelLawModel: () => ({ kind: 'absent' } as never),
        renderParcelLawFacts: () => document.createElement('div'),
        // ⛔ `mountCreateHouse` is NOT provided — the tab must fall through to production.
    });

    const seed = (rows: ReadonlyArray<[string, Record<string, unknown>]>): void => {
        const state = new Map<string, unknown>(rows);
        w.runtime = { stores: { spaceEnvelope: { getState: () => state } } };
        w.projectContext = { activeLevelId: 'L0' };
    };

    beforeEach(() => { savedRuntime = w.runtime; savedContext = w.projectContext; });
    afterEach(() => { w.runtime = savedRuntime; w.projectContext = savedContext; });

    const PLATE_ROW: [string, Record<string, unknown>] = ['E-g', {
        id: 'E-g', role: 'level', levelId: 'L0', name: 'Ground envelope',
        baseOffset: 0, height: 3, footprintAreaM2: 190.23,
        footprint: [{ x: 0, y: 0, z: 0 }, { x: 15, y: 0, z: 0 }, { x: 15, y: 0, z: 12.682 }, { x: 0, y: 0, z: 12.682 }],
    }];
    const ROOM_ROW: [string, Record<string, unknown>] = ['R1', {
        id: 'R1', role: 'room', levelId: 'L0', name: 'Kitchen', withinId: 'E-g',
        baseOffset: 0, height: 3, footprintAreaM2: 12.8,
        footprint: [{ x: 1, y: 0, z: 1 }, { x: 5, y: 0, z: 1 }, { x: 5, y: 0, z: 4.2 }, { x: 1, y: 0, z: 4.2 }],
    }];

    it('⭐ WITH a room drawn, Q6\'s slot carries "Create BIM from this design"', () => {
        seed([PLATE_ROW, ROOM_ROW]);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawTab(host, tabDeps());

        const slot = q(host, PARCEL_LAW_CREATE_HOUSE_HOST_TESTID)!;
        const arm = q(slot, BUILD_FROM_DESIGN_TESTID);
        expect(arm, 'the fourth arm must be reachable from question 6').not.toBeNull();
        expect(arm!.getAttribute('data-arm')).toBe('build-from-design');
        expect(slot.textContent).toContain(BUILD_FROM_DESIGN_LABEL);
        expect((q(slot, CREATE_HOUSE_BTN_TESTID) as HTMLButtonElement).disabled).toBe(false);
        // ⛔ And the generator's advisory is not on this path.
        expect(slot.textContent).not.toContain('NOT used as the room programme');
        h.dispose();
    });

    it('⛔ WITHOUT a room drawn, the SAME slot still carries the generator — unchanged', () => {
        seed([PLATE_ROW]);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawTab(host, tabDeps());

        const slot = q(host, PARCEL_LAW_CREATE_HOUSE_HOST_TESTID)!;
        expect(q(slot, BUILD_FROM_DESIGN_TESTID)).toBeNull();
        expect(q(slot, CREATE_HOUSE_TESTID)?.getAttribute('data-arm')).toBe('ok');
        expect(slot.textContent).toContain('NOT used as the room programme');
        h.dispose();
    });
});
