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

import { describe, it, expect, beforeEach } from 'vitest';
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
