/**
 * §PL-LIVE-QUANTITIES (STR §25.7) — the live figures, the adjustable rate, and the LIVENESS
 * itself.
 *
 * ⭐ THE TEST THAT CARRIES THE LANE IS `ARM C — liveness`. Every other assertion here would pass
 * against a section that renders once and then goes stale, which is exactly what the envelope
 * card does today: its refresh triggers are a fixed event list containing no space-envelope
 * signal, so a face drag moves the 3D scene and leaves every number frozen. So ARM C drives a
 * FAKE STORE THAT BEHAVES LIKE THE REAL ONE — it notifies `subscribeDirty` after mutating its
 * own state, the way `Store.applyPatch` does on execute, undo and redo alike — and asserts the
 * rendered NUMBER changed, not that a callback fired.
 *
 * ⛔ A fake built from the header cannot falsify the header ([[fake-more-capable-than-real]]), so
 * the store fake below holds a real `Map` and the assertions read the rendered text.
 *
 * ARM D pins REACHABILITY: `mountParcelLawTab` — the function `AnalysisSurface.ts:580` calls when
 * the founder clicks the PARCEL LAW tab — puts this section in the tab body using the PRODUCTION
 * mount, not an injected fake.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    mountParcelLawQuantities,
    defaultParcelLawQuantitiesDeps,
    PARCEL_LAW_QUANTITIES_SLOT_TESTID,
    PARCEL_LAW_QUANTITIES_SUBSCRIBED_ATTR,
    type LiveEnvelopeStore,
    type ParcelLawQuantitiesDeps,
} from '../parcelLawQuantities';
import {
    mountParcelLawTab,
    PARCEL_LAW_QUANTITIES_HOST_TESTID,
    type ParcelLawTabDeps,
    type ParcelLawCapabilityHost,
} from '../parcelLawTab';
import { buildLiveQuantitiesModel } from '../../site/liveQuantitiesModel';
import { collectIntendedAreas } from '../../site/intendedAreaChannel';
import {
    buildLiveQuantitiesSection,
    LIVE_QUANTITIES_APPLY_BTN_TESTID,
    LIVE_QUANTITIES_COST_TESTID,
    LIVE_QUANTITIES_COST_AMOUNT_TESTID,
    LIVE_QUANTITIES_CURRENCY_TESTID,
    LIVE_QUANTITIES_LEVELS_TESTID,
    LIVE_QUANTITIES_NONE_TESTID,
    LIVE_QUANTITIES_RATE_INPUT_TESTID,
    LIVE_QUANTITIES_STATUS_TESTID,
    LIVE_QUANTITIES_TOTAL_TESTID,
    LIVE_QUANTITIES_UNREADABLE_TESTID,
} from '../../site/liveQuantitiesSection';
import {
    getIndicativeRate,
    parseIndicativeRateInput,
    resetIndicativeRateState,
} from '../../site/indicativeRateState';
import { estimateAtIndicativeRate } from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

// ─────────────────────────────────────────────────────────────────────────────
// A store fake with the REAL contract: a Map, and a dirty channel it notifies
// after it changes. `Store.applyPatch()` notifies on execute, undo and redo
// alike — the property `attachSpaceEnvelopeRender`'s header calls "ONE ROAD".
// ─────────────────────────────────────────────────────────────────────────────
interface FakeStore extends LiveEnvelopeStore {
    put(id: string, rec: Record<string, unknown>): void;
    remove(id: string): void;
    listenerCount(): number;
}

function fakeStore(seed: ReadonlyArray<[string, Record<string, unknown>]> = []): FakeStore {
    const state = new Map<string, Record<string, unknown>>(seed);
    const listeners = new Set<(d: { added: ReadonlySet<string>; updated: ReadonlySet<string>; removed: ReadonlySet<string> }, s: ReadonlyMap<string, unknown>) => void>();
    const notify = (diff: { added?: string[]; updated?: string[]; removed?: string[] }): void => {
        const d = {
            added: new Set(diff.added ?? []),
            updated: new Set(diff.updated ?? []),
            removed: new Set(diff.removed ?? []),
        };
        for (const l of [...listeners]) l(d, state);
    };
    return {
        getState: () => state,
        subscribeDirty(l): () => void {
            listeners.add(l);
            return () => { listeners.delete(l); };
        },
        put(id, rec): void { state.set(id, rec); notify({ updated: [id] }); },
        remove(id): void { state.delete(id); notify({ removed: [id] }); },
        listenerCount: () => listeners.size,
    };
}

const levelEnv = (id: string, levelId: string, areaM2: number): [string, Record<string, unknown>] =>
    [id, { id, role: 'level', levelId, footprintAreaM2: areaM2, height: 3 }];
const roomEnv = (
    id: string, levelId: string, areaM2: number, name: string, withinId?: string,
): [string, Record<string, unknown>] =>
    [id, { id, role: 'room', levelId, footprintAreaM2: areaM2, name, height: 2.7, withinId }];

function depsFor(store: LiveEnvelopeStore | null, levels: unknown[] = []): ParcelLawQuantitiesDeps {
    return {
        runtime: () => ({ stores: { spaceEnvelope: store } } as unknown as PryzmRuntime),
        readLevels: () => levels,
        nowIso: () => '2026-09-06T10:00:00Z',
    };
}

function mountInto(deps: ParcelLawQuantitiesDeps): { root: HTMLElement; host: HTMLElement; handle: ReturnType<typeof mountParcelLawQuantities> } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = mountParcelLawQuantities(host, deps);
    return { root: handle.element, host, handle };
}

const q = (root: ParentNode, testid: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

beforeEach(() => {
    resetIndicativeRateState();
    document.body.innerHTML = '';
});

// ═══════════════════════════════════════════════════════════════════════════
describe('ARM A — the model: the four figures, and the one sum that is forbidden', () => {
    it('projects rooms by NAME with their own net area under each level', () => {
        const store = fakeStore([
            levelEnv('L-g', 'lvl-0', 180),
            roomEnv('R-1', 'lvl-0', 24, 'Kitchen', 'L-g'),
            roomEnv('R-2', 'lvl-0', 36, 'Living', 'L-g'),
        ]);
        const model = buildLiveQuantitiesModel(collectIntendedAreas(store, [{ id: 'lvl-0', name: 'Ground', elevation: 0 }]));
        expect(model.readable).toBe(true);
        if (!model.readable) return;
        expect(model.levels).toHaveLength(1);
        expect(model.levels[0].name).toBe('Ground');
        expect(model.levels[0].brutAreaM2).toBe(180);
        expect(model.levels[0].rooms.map((r) => r.name)).toEqual(['Living', 'Kitchen']); // largest first
        expect(model.levels[0].rooms.map((r) => r.netAreaM2)).toEqual([36, 24]);
    });

    it('⛔ the room areas are NEVER added into the level or the total', () => {
        const store = fakeStore([
            levelEnv('L-g', 'lvl-0', 180),
            roomEnv('R-1', 'lvl-0', 24, 'Kitchen', 'L-g'),
            roomEnv('R-2', 'lvl-0', 36, 'Living', 'L-g'),
            levelEnv('L-1', 'lvl-1', 140),
        ]);
        const model = buildLiveQuantitiesModel(collectIntendedAreas(store, [
            { id: 'lvl-0', name: 'Ground', elevation: 0 },
            { id: 'lvl-1', name: 'First', elevation: 3 },
        ]));
        if (!model.readable) throw new Error('unreachable');
        expect(model.totalBrutM2).toBe(320);           // 180 + 140, and NOT 380.
        expect(model.totalRoomsNetM2).toBe(60);        // the display sibling
        expect(model.area?.areaM2).toBe(320);          // what the estimator multiplies
    });

    it('⭐ an UNREADABLE store yields area:null with the channel\'s own sentence — never 0 m²', () => {
        const model = buildLiveQuantitiesModel(collectIntendedAreas(null, []));
        expect(model.readable).toBe(false);
        expect(model.area).toBeNull();
        if (model.readable) return;
        expect(model.text).toContain('NOT a finding that nothing is intended');
    });

    it('an EMPTY store is readable with no levels — a finding, not a failure', () => {
        const model = buildLiveQuantitiesModel(collectIntendedAreas(fakeStore(), []));
        expect(model.readable).toBe(true);
        if (!model.readable) return;
        expect(model.levels).toHaveLength(0);
        expect(model.totalBrutM2).toBeNull();
        expect(model.area).toBeNull();
    });

    it('the area carries a BASIS naming how many envelopes it summed', () => {
        const model = buildLiveQuantitiesModel(collectIntendedAreas(
            fakeStore([levelEnv('a', 'lvl-0', 100), levelEnv('b', 'lvl-1', 100)]), []));
        if (!model.readable) throw new Error('unreachable');
        expect(model.area?.basis).toBe('Σ of 2 declared level envelopes');
        expect(model.area?.caveat).toContain('It is a STUDY.');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('ARM B — the renderer: four figures on screen, and the cost block on every arm', () => {
    const render = (model: ReturnType<typeof buildLiveQuantitiesModel>, rate = getIndicativeRate()): HTMLElement => {
        const el = document.createElement('div');
        el.innerHTML = buildLiveQuantitiesSection(model, rate, estimateAtIndicativeRate(rate, model.area));
        return el;
    };

    it('prints room names, room net areas, brut per level and the total', () => {
        const el = render(buildLiveQuantitiesModel(collectIntendedAreas(fakeStore([
            levelEnv('L-g', 'lvl-0', 180),
            roomEnv('R-1', 'lvl-0', 24, 'Kitchen', 'L-g'),
            levelEnv('L-1', 'lvl-1', 140),
        ]), [{ id: 'lvl-0', name: 'Ground', elevation: 0 }, { id: 'lvl-1', name: 'First', elevation: 3 }])));
        expect(q(el, LIVE_QUANTITIES_TOTAL_TESTID)?.textContent).toContain('320 m²');
        const levels = q(el, LIVE_QUANTITIES_LEVELS_TESTID)!;
        expect(levels.textContent).toContain('Ground');
        expect(levels.textContent).toContain('180 m² brut');
        expect(levels.textContent).toContain('First');
        expect(levels.textContent).toContain('140 m² brut');
        expect(levels.textContent).toContain('Kitchen');
        expect(levels.textContent).toContain('24 m² net');
        // ⛔ The wording that stops a reader adding the two.
        expect(levels.textContent).toContain('listed, not added');
    });

    it('⭐ renders the cost block even with NO rate — an instruction, not an emptiness', () => {
        const el = render(buildLiveQuantitiesModel(collectIntendedAreas(fakeStore([levelEnv('a', 'lvl-0', 200)]), [])));
        const cost = q(el, LIVE_QUANTITIES_COST_TESTID)!;
        expect(cost).not.toBeNull();
        expect(cost.getAttribute('data-arm')).toBe('no-rate');
        expect(cost.textContent).toContain('Type a cost per m²');
        expect(q(el, LIVE_QUANTITIES_COST_AMOUNT_TESTID)).toBeNull();
    });

    it('renders the amount and the whole statement once a rate is in force', () => {
        const rate = { amountPerM2: 1800, currency: 'EUR', source: 'user-supplied' as const, setAtIso: 'X' };
        const el = render(buildLiveQuantitiesModel(collectIntendedAreas(fakeStore([levelEnv('a', 'lvl-0', 200)]), [])), rate);
        expect(q(el, LIVE_QUANTITIES_COST_AMOUNT_TESTID)?.textContent).toContain('360,000 EUR');
        expect(q(el, LIVE_QUANTITIES_COST_TESTID)?.textContent).toContain('YOUR OWN ASSUMPTION');
    });

    it('the unreadable and none-declared arms are DIFFERENT sections with different words', () => {
        const unreadable = render(buildLiveQuantitiesModel(collectIntendedAreas(null, [])));
        const none = render(buildLiveQuantitiesModel(collectIntendedAreas(fakeStore(), [])));
        expect(q(unreadable, LIVE_QUANTITIES_UNREADABLE_TESTID)).not.toBeNull();
        expect(q(unreadable, LIVE_QUANTITIES_NONE_TESTID)).toBeNull();
        expect(q(none, LIVE_QUANTITIES_NONE_TESTID)).not.toBeNull();
        expect(q(none, LIVE_QUANTITIES_UNREADABLE_TESTID)).toBeNull();
        expect(q(none, LIVE_QUANTITIES_NONE_TESTID)!.textContent)
            .toContain('not a failure to read it');
    });

    it('⛔ C08 §3.1 — an authored room NAME is escaped, not injected', () => {
        const el = render(buildLiveQuantitiesModel(collectIntendedAreas(fakeStore([
            levelEnv('L-g', 'lvl-0', 100),
            roomEnv('R-x', 'lvl-0', 12, '<img src=x onerror=alert(1)>', 'L-g'),
        ]), [])));
        expect(el.querySelector('img')).toBeNull();
        expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('ARM C — LIVENESS: the numbers move when the envelope moves', () => {
    it('⭐ subscribes to the store dirty channel and re-renders the TOTAL on a face move', () => {
        const store = fakeStore([levelEnv('L-g', 'lvl-0', 180)]);
        const { root, handle } = mountInto(depsFor(store, [{ id: 'lvl-0', name: 'Ground', elevation: 0 }]));
        expect(root.getAttribute(PARCEL_LAW_QUANTITIES_SUBSCRIBED_ATTR)).toBe('yes');
        expect(q(root, LIVE_QUANTITIES_TOTAL_TESTID)?.textContent).toContain('180 m²');

        // A face drag: `spaceEnvelope.moveFace` → `applyPatch` → the SAME dirty channel.
        store.put('L-g', { id: 'L-g', role: 'level', levelId: 'lvl-0', footprintAreaM2: 205, height: 3 });

        expect(handle.liveRepaintCount()).toBe(1);
        expect(q(root, LIVE_QUANTITIES_TOTAL_TESTID)?.textContent).toContain('205 m²');
        handle.dispose();
    });

    it('a NEW room envelope appears in the panel without any other event', () => {
        const store = fakeStore([levelEnv('L-g', 'lvl-0', 180)]);
        const { root, handle } = mountInto(depsFor(store, [{ id: 'lvl-0', name: 'Ground', elevation: 0 }]));
        expect(root.textContent).not.toContain('Kitchen');
        store.put('R-1', { id: 'R-1', role: 'room', levelId: 'lvl-0', footprintAreaM2: 24, name: 'Kitchen', height: 2.7, withinId: 'L-g' });
        expect(root.textContent).toContain('Kitchen');
        expect(root.textContent).toContain('24 m² net');
        handle.dispose();
    });

    it('a DELETE (or an undo) is the same channel and the figure comes back down', () => {
        const store = fakeStore([levelEnv('L-g', 'lvl-0', 180), levelEnv('L-1', 'lvl-1', 140)]);
        const { root, handle } = mountInto(depsFor(store, []));
        expect(q(root, LIVE_QUANTITIES_TOTAL_TESTID)?.textContent).toContain('320 m²');
        store.remove('L-1');
        expect(q(root, LIVE_QUANTITIES_TOTAL_TESTID)?.textContent).toContain('180 m²');
        handle.dispose();
    });

    it('⛔ dispose releases the subscription — a torn-down tab does not keep repainting', () => {
        const store = fakeStore([levelEnv('L-g', 'lvl-0', 180)]);
        const { handle } = mountInto(depsFor(store, []));
        expect(store.listenerCount()).toBe(1);
        handle.dispose();
        expect(store.listenerCount()).toBe(0);
        store.put('L-g', { id: 'L-g', role: 'level', levelId: 'lvl-0', footprintAreaM2: 999, height: 3 });
        expect(handle.liveRepaintCount()).toBe(0);
    });

    it('⭐ a runtime with NO spaceEnvelope store says so LOUDLY in an attribute, and still renders', () => {
        const { root, handle } = mountInto(depsFor(null, []));
        expect(root.getAttribute(PARCEL_LAW_QUANTITIES_SUBSCRIBED_ATTR)).toBe('no:no-store');
        // …and the section is present with the honest sentence, not absent.
        expect(q(root, LIVE_QUANTITIES_UNREADABLE_TESTID)).not.toBeNull();
        handle.dispose();
    });

    it('applying a rate through the BUTTON produces the estimate — the whole gesture', () => {
        const store = fakeStore([levelEnv('L-g', 'lvl-0', 200)]);
        const { root, handle } = mountInto(depsFor(store, []));
        expect(q(root, LIVE_QUANTITIES_COST_TESTID)?.getAttribute('data-arm')).toBe('no-rate');

        const input = q(root, LIVE_QUANTITIES_RATE_INPUT_TESTID) as HTMLInputElement;
        const select = q(root, LIVE_QUANTITIES_CURRENCY_TESTID) as HTMLSelectElement;
        input.value = '1800';
        select.value = 'GBP';
        (q(root, LIVE_QUANTITIES_APPLY_BTN_TESTID) as HTMLButtonElement).click();

        expect(getIndicativeRate()?.amountPerM2).toBe(1800);
        expect(getIndicativeRate()?.currency).toBe('GBP');
        expect(q(root, LIVE_QUANTITIES_COST_AMOUNT_TESTID)?.textContent).toContain('360,000 GBP');
        expect(q(root, LIVE_QUANTITIES_STATUS_TESTID)?.textContent).toContain('your assumption');
        handle.dispose();
    });

    it('⭐ the cost FOLLOWS the geometry: change the envelope, the money changes', () => {
        const store = fakeStore([levelEnv('L-g', 'lvl-0', 200)]);
        const { root, handle } = mountInto(depsFor(store, []));
        (q(root, LIVE_QUANTITIES_RATE_INPUT_TESTID) as HTMLInputElement).value = '1000';
        (q(root, LIVE_QUANTITIES_APPLY_BTN_TESTID) as HTMLButtonElement).click();
        expect(q(root, LIVE_QUANTITIES_COST_AMOUNT_TESTID)?.textContent).toContain('200,000 EUR');
        store.put('L-g', { id: 'L-g', role: 'level', levelId: 'lvl-0', footprintAreaM2: 250, height: 3 });
        expect(q(root, LIVE_QUANTITIES_COST_AMOUNT_TESTID)?.textContent).toContain('250,000 EUR');
        handle.dispose();
    });

    it('⛔ a bad rate input leaves the previous rate UNCHANGED and says why', () => {
        const store = fakeStore([levelEnv('L-g', 'lvl-0', 200)]);
        const { root, handle } = mountInto(depsFor(store, []));
        (q(root, LIVE_QUANTITIES_RATE_INPUT_TESTID) as HTMLInputElement).value = '1200';
        (q(root, LIVE_QUANTITIES_APPLY_BTN_TESTID) as HTMLButtonElement).click();
        expect(getIndicativeRate()?.amountPerM2).toBe(1200);

        (q(root, LIVE_QUANTITIES_RATE_INPUT_TESTID) as HTMLInputElement).value = '0';
        (q(root, LIVE_QUANTITIES_APPLY_BTN_TESTID) as HTMLButtonElement).click();
        expect(getIndicativeRate()?.amountPerM2).toBe(1200);           // unchanged
        expect(q(root, LIVE_QUANTITIES_STATUS_TESTID)?.textContent).toContain('not a free building');
        handle.dispose();
    });

    it('clearing the field UNSETS the rate — an empty input is a gesture, not an error', () => {
        const parsed = parseIndicativeRateInput('   ', 'EUR', 'X');
        expect(parsed.ok).toBe(true);
        expect(parsed.ok && parsed.rate).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('ARM D — REACHABILITY: the founder\'s click reaches this section', () => {
    it('⭐ mountParcelLawTab mounts it with the PRODUCTION control, into its own slot', () => {
        const capabilityHost: ParcelLawCapabilityHost = {
            pryzmGetSiteViewState: () => ({ segment: '2D', formaMode: 'plan', buildingFidelity: 'real' }),
        };
        // Every OTHER seam is faked; `mountQuantities` is deliberately NOT provided, so the tab
        // falls through to the production `mountParcelLawQuantities`. That is the assertion.
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

        const slot = q(host, PARCEL_LAW_QUANTITIES_HOST_TESTID);
        expect(slot, 'the tab must own a slot for the §25.7 section').not.toBeNull();
        const section = q(host, PARCEL_LAW_QUANTITIES_SLOT_TESTID);
        expect(section, 'the production control must have mounted into it').not.toBeNull();
        expect(slot!.contains(section!)).toBe(true);
        // With no runtime it renders the honest wiring sentence — present, never blank.
        expect(section!.textContent).toContain('space-envelope store');
        h.dispose();
        expect(q(host, PARCEL_LAW_QUANTITIES_SLOT_TESTID)).toBeNull();
    });

    it('the production deps resolve without a window runtime and never throw', () => {
        const deps = defaultParcelLawQuantitiesDeps();
        expect(deps.runtime()).toBeFalsy();
        expect(deps.readLevels()).toEqual([]);
        expect(typeof deps.nowIso()).toBe('string');
    });
});
