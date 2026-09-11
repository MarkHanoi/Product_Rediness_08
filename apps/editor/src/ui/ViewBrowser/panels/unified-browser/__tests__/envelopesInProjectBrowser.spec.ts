/**
 * @file apps/editor/src/ui/ViewBrowser/panels/unified-browser/__tests__/envelopesInProjectBrowser.spec.ts
 *
 * ⭐ §BROWSER-LISTS-ENVELOPES (L-13311) — FOUNDER, 2026-09-11: *"Envelopes they dont appear on the
 * project browser."* Said AFTER L-13252 put two envelope categories on this panel's ELEMENTS card,
 * whose specs were green.
 *
 * ─── WHY THOSE SPECS COULD NOT CATCH IT ─────────────────────────────────────────────────────────
 * They hand `determineCategoryElements` a bag WITH a runtime. Production constructs this panel with
 * `null` (`initUI.ts` → `createMainLayout(props, null)` → `ProjectBrowserPanel` → this bag), so the
 * rows read a null runtime and printed "—" (§L-12916). A fake more capable than the real thing
 * cannot falsify it. Every test here therefore MOUNTS THE REAL PANEL, in the REAL rail controller,
 * with `null` for its runtime — the value production passes — and drives envelopes through the REAL
 * `spaceEnvelope.*` handlers on a real CommandBus, undoing with the real `performUndo` (Ctrl+Z).
 *
 * ─── WHAT IS PINNED ─────────────────────────────────────────────────────────────────────────────
 *   1. The PROJECT card (the card the panel opens with) lists every envelope: Envelopes → building →
 *      envelope, by the record's own name; a room nests under the level envelope it sits within.
 *   2. The ELEMENTS card's envelope rows count the LIVE store, not "—".
 *   3. Live: create / delete / Ctrl+Z re-render the open panel through the store's dirty channel,
 *      with no other event — the project-switch `clear()` empties it — and a store the runtime no
 *      longer holds stops driving the rail (rebuilds counted, not inferred from a count).
 *   4. Row click → `selectionBus.select` → `SelectionManager.selectById(id)` (Contract 27 §4).
 *   5. CROSS-MODEL AGREEMENT: the Envelopes node, the ELEMENTS categories, the per-storey tree, the
 *      INSPECT tree of the same rail and the store hold ONE id set — and the two cards file every
 *      envelope under ONE building partition (§BROWSER-ONE-BUILDING-RULE), keyed by group id.
 *   6. Unreadable ≠ empty: no store ⇒ "—" and a sentence, never "0" (C78 §5).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, attachStores } from '@pryzm/plugin-sdk';
import { RingBufferUndoStack } from '@pryzm/command-bus';
import { SpaceEnvelopeStore, buildSpaceEnvelopeHandlerSet } from '@pryzm/plugin-space-envelope';
import { selectionBus } from '@pryzm/core-app-model';
import { performUndo } from '@app/engine/undo/performUndoRedo';
import { RailPanelController } from '../../../RailPanelController';
import type { ProjectBrowserPanelProps } from '../../../ProjectBrowserTypes';
import { UnifiedBrowserPanel } from '../../UnifiedBrowserPanel';
import { determineCategoryElements, getElementsForLevel, type UBPBag } from '../BrowserDataHelpers';
import { ENVELOPE_TREE_ROOT } from '../EnvelopeTreeSection';
import { UNFILED_ENVELOPES_LABEL, readEnvelopeTree } from '../envelopeTreeModel';
import {
    readMassingGroupRef,
    readMassingGroups,
    resolveGroupOfEnvelope,
} from '../../../../site/massingGroupRoster';
import { readLevelCandidates } from '../../../../site/adoptProposalAsEnvelope';
import { INSPECT_CATEGORIES } from '../../../../inspect/audit/inspectCategories';
import { buildProjectTreeModel } from '../../../../inspect/audit/projectTreeModel';

type Bag = Record<string, unknown>;

const AUDIT = { actorId: 'l13311', projectId: 'l13311', clientId: 'spec' } as const;

// Real prefixed ULIDs — `defineElement('spaceEnvelope')` enforces Crockford base32.
const ENV_A0 = 'spaceEnvelope_01M25DX2GJ3EFMPTAY62GAWV30';
const ENV_A1 = 'spaceEnvelope_01M25DX2GJ3EFMPTAY62GAWV31';
const ENV_P0 = 'spaceEnvelope_01M25DX2GJ3EFMPTAY62GAWV32';
const ENV_R0 = 'spaceEnvelope_01M25DX2GJ3EFMPTAY62GAWV33';
const ENV_X0 = 'spaceEnvelope_01M25DX2GJ3EFMPTAY62GAWV34';
const ENV_X1 = 'spaceEnvelope_01M25DX2GJ3EFMPTAY62GAWV35';
const ENV_R1 = 'spaceEnvelope_01M25DX2GJ3EFMPTAY62GAWV36';
const ENV_B1 = 'spaceEnvelope_01M25DX2GJ3EFMPTAY62GAWV37';
const ENV_B2 = 'spaceEnvelope_01M25DX2GJ3EFMPTAY62GAWV38';
const ENV_S0 = 'spaceEnvelope_01M25DX2GJ3EFMPTAY62GAWV39';

const BLOCK_A = { id: 'mg_blockA', label: 'Block A' };
const LEVELS = [
    { id: 'L0', name: 'Ground', elevation: 0, height: 3 },
    { id: 'L1', name: 'Level 1', elevation: 3, height: 3 },
];
const ENVELOPE_CATEGORIES = ['Level envelopes', 'Room envelopes'] as const;

/** A 4 × 4 m prism at `x0`, seated on `levelId`. Names are typed by the "user", so kept verbatim. */
function prism(id: string, extra: Bag = {}, x0 = 0) {
    return {
        spaceEnvelopeId: id,
        levelId: 'L0',
        role: 'level',
        footprint: [
            { x: x0, y: 0, z: 0 }, { x: x0 + 4, y: 0, z: 0 }, { x: x0 + 4, y: 0, z: 4 }, { x: x0, y: 0, z: 4 },
        ],
        height: 3,
        ...extra,
    };
}
/** A 2 × 2 m room strictly inside the prism at `x0`, naming it in `withinId`. Declares NO group. */
function roomInside(id: string, withinId: string, name: string, x0 = 0) {
    return {
        spaceEnvelopeId: id,
        levelId: 'L0',
        role: 'room',
        withinId,
        name,
        height: 2.7,
        footprint: [
            { x: x0 + 1, y: 0, z: 1 }, { x: x0 + 3, y: 0, z: 1 }, { x: x0 + 3, y: 0, z: 3 }, { x: x0 + 1, y: 0, z: 3 },
        ],
    };
}

/** The founder's shape: a two-storey named building, an ungrouped pavilion, and a room inside it. */
const FOUR = () => [
    prism(ENV_A0, { name: 'Tower A ground', group: BLOCK_A }),
    prism(ENV_A1, { name: 'Tower A first', levelId: 'L1', group: BLOCK_A }),
    prism(ENV_P0, { name: 'Pavilion' }, 10),
    roomInside(ENV_R0, ENV_P0, 'Pavilion lobby', 10),
];

const win = (): Bag => window as unknown as Bag;
const prior = { runtime: win()['runtime'], bimManager: win()['bimManager'] };
const detachers: Array<() => void> = [];

interface Harness { readonly store: SpaceEnvelopeStore; readonly bus: CommandBus }

/** The composed runtime's envelope slice, published where production publishes it (`window.runtime`). */
function buildHarness(): Harness {
    const store = new SpaceEnvelopeStore();
    const emitter = new PatchEmitter();
    const bus = new CommandBus({
        audit: AUDIT,
        emitter,
        undoStack: new UndoStack({ maxSize: 50 }),
        storesProvider: () => ({ spaceEnvelope: Object.fromEntries(store.getState()) }),
    });
    for (const h of buildSpaceEnvelopeHandlerSet()) bus.register(h);
    detachers.push(attachStores(emitter, { spaceEnvelope: store as never }));
    bus.setRingBuffer(new RingBufferUndoStack() as never);
    win()['runtime'] = {
        bus,
        stores: { spaceEnvelope: store },
        events: { emit: () => undefined, on: () => () => undefined },
    };
    win()['bimManager'] = { getLevels: () => LEVELS };
    return { store, bus };
}

const create = (h: Harness, envelopes: readonly Bag[]): Promise<unknown> =>
    h.bus.executeCommand('spaceEnvelope.batch.create', { envelopes });

/** Mount the REAL panel in the REAL rail, with `null` for its runtime — exactly as production does. */
function mountBrowser(): UnifiedBrowserPanel {
    const rail = new RailPanelController(null);
    const panel = new UnifiedBrowserPanel({} as ProjectBrowserPanelProps, rail, null);
    rail.open('BROWSER', 'Project Browser', () => panel.build(), { noHeader: true });
    return panel;
}

/** Let the store's dirty notification and the panel's coalesced re-render run. */
const flush = (): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

const node = (): HTMLElement => {
    const n = document.querySelector<HTMLElement>(`[data-envelope-tree="${ENVELOPE_TREE_ROOT}"]`);
    if (!n) throw new Error('the PROJECT card has NO Envelopes node');
    return n;
};
const countText = (): string | null | undefined => node().querySelector('[data-envelope-count]')?.textContent;
const rowIds = (): string[] =>
    [...node().querySelectorAll('[data-elem-id]')].map((e) => e.getAttribute('data-elem-id') ?? '');
const groupHeader = (key: string): HTMLElement => {
    const g = node().querySelector<HTMLElement>(`[data-envelope-group="${key}"] .pb-ubp-st-type-hdr`);
    if (!g) throw new Error(`no building row "${key}"`);
    return g;
};
/** Open every building of the node (folded by default when there is more than one). */
function openAllBuildings(): void {
    const keys = [...node().querySelectorAll('[data-envelope-group]')].map((g) => g.getAttribute('data-envelope-group') ?? '');
    for (const k of keys) {
        if (!node().querySelector(`[data-envelope-group="${k}"] .pb-ubp-st-type-body`)) groupHeader(k).click();
    }
}

/** The ELEMENTS card, opened, and one category row as the founder sees it. */
function elementsCategoryRow(label: string): HTMLElement {
    const cards = [...document.querySelectorAll<HTMLElement>('.pb-ubp-card')];
    const elements = cards.find((c) => c.querySelector('.pb-ubp-card-title')?.textContent?.includes('ELEMENTS'));
    if (!elements) throw new Error('no ELEMENTS card');
    const hdr = elements.querySelector<HTMLElement>('.pb-ubp-card-hdr')!;
    if (hdr.getAttribute('aria-expanded') !== 'true') hdr.click();
    const row = [...document.querySelectorAll<HTMLElement>('.pb-ubp-ec-row')]
        .find((r) => r.querySelector('.pb-ubp-ec-label')?.textContent === label);
    if (!row) throw new Error(`no ELEMENTS row "${label}"`);
    return row;
}
function elementsCategoryCount(label: string): string | null | undefined {
    return elementsCategoryRow(label).querySelector('.pb-ubp-ec-count')?.textContent;
}

/** One card's building partition: bucket key → its printed label and its envelope ids (sorted). */
type Partition = Record<string, { label: string; ids: string[] }>;

/** The PROJECT card's Envelopes node, every building opened, as RENDERED. */
function projectPartition(): Partition {
    openAllBuildings();
    const out: Partition = {};
    for (const g of node().querySelectorAll<HTMLElement>('[data-envelope-group]')) {
        out[g.getAttribute('data-envelope-group') ?? ''] = {
            label: g.querySelector('.pb-ubp-st-type-name')?.textContent ?? '',
            ids: [...g.querySelectorAll('[data-elem-id]')].map((r) => r.getAttribute('data-elem-id') ?? '').sort(),
        };
    }
    return out;
}

/** The ELEMENTS card's Level ∪ Room envelope sub-type rows, every one opened, as RENDERED. */
function elementsPartition(): Partition {
    const out: Partition = {};
    for (const cat of ENVELOPE_CATEGORIES) {
        const row = elementsCategoryRow(cat);
        const body = row.querySelector<HTMLElement>('.pb-ubp-ec-body')!;
        if (body.style.display === 'none') row.querySelector<HTMLElement>('.pb-ubp-ec-hdr')!.click();
        for (const t of row.querySelectorAll<HTMLElement>('[data-subtype-key]')) {
            const inst = t.querySelector<HTMLElement>('.pb-ubp-ec-inst-body')!;
            if (inst.style.display === 'none') t.querySelector<HTMLElement>('.pb-ubp-ec-type-hdr')!.click();
            const key = t.getAttribute('data-subtype-key') ?? '';
            const label = t.querySelector('.pb-ubp-ec-type-name')?.textContent ?? '';
            const ids = [...t.querySelectorAll('.pb-ubp-ec-inst-row')].map((r) => r.getAttribute('data-elem-id') ?? '');
            const prev = out[key];
            if (prev !== undefined && prev.label !== label) {
                throw new Error(`ELEMENTS prints building "${key}" as "${prev.label}" AND "${label}"`);
            }
            out[key] = { label, ids: [...(prev?.ids ?? []), ...ids].sort() };
        }
    }
    return out;
}

afterEach(() => {
    while (detachers.length > 0) detachers.pop()!();
    selectionBus.setSelectionManager(null);
    document.body.innerHTML = '';
    win()['runtime'] = prior.runtime;
    win()['bimManager'] = prior.bimManager;
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// THE FOUNDER'S SCREEN
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('§BROWSER-LISTS-ENVELOPES (L-13311) — the envelopes are IN the project browser', () => {
    it('⭐ the PROJECT card lists every envelope under its BUILDING, by its own name — panel runtime NULL, as in production', async () => {
        const h = buildHarness();
        await create(h, FOUR());
        mountBrowser();

        expect(countText(), 'the Envelopes node counts the store').toBe('4');
        const buildings = [...node().querySelectorAll('[data-envelope-group]')].map((g) => [
            g.getAttribute('data-envelope-group'),
            g.querySelector('.pb-ubp-st-type-name')?.textContent,
            g.querySelector('.pb-ubp-st-type-count')?.textContent,
        ]);
        expect(buildings, 'named buildings first, the ungrouped residue last (ADR-0383 D3)').toEqual([
            ['group:mg_blockA', 'Block A', '2'],
            ['ungrouped', 'Ungrouped envelopes', '2'],
        ]);

        openAllBuildings();
        const names = [...node().querySelectorAll('[data-elem-id]')].map((r) => [
            r.getAttribute('data-elem-id'),
            r.querySelector('.pb-ubp-st-elem-name')?.textContent,
            r.querySelector('.pb-ubp-ec-inst-level')?.textContent,
        ]);
        expect(names, 'storeys lowest first; the room right under the envelope it sits within').toEqual([
            [ENV_A0, 'Tower A ground', 'Ground'],
            [ENV_A1, 'Tower A first', 'Level 1'],
            [ENV_P0, 'Pavilion', 'Ground'],
            [ENV_R0, 'Pavilion lobby', 'Ground'],
        ]);
        const room = node().querySelector(`[data-elem-id="${ENV_R0}"]`)!;
        expect(room.className, 'a room renders as a CHILD row').toContain('pb-ubp-st-child-row');
        expect(room.getAttribute('data-envelope-role')).toBe('room');
    });

    it('⭐ the ELEMENTS card envelope rows count the LIVE store — "—" was the null-runtime prop (§L-12916)', async () => {
        const h = buildHarness();
        await create(h, FOUR());
        mountBrowser();
        expect(elementsCategoryCount('Level envelopes')).toBe('3');
        expect(elementsCategoryCount('Room envelopes')).toBe('1');
    });

    it('the ELEMENTS card files envelopes by BUILDING, not one "type" per unique name', async () => {
        const h = buildHarness();
        await create(h, FOUR());
        mountBrowser();
        const row = elementsCategoryRow('Level envelopes');
        row.querySelector<HTMLElement>('.pb-ubp-ec-hdr')!.click();
        const types = [...row.querySelectorAll('.pb-ubp-ec-type-name')].map((t) => t.textContent);
        expect(types, 'in the PROJECT card\'s order: named buildings first').toEqual(['Block A', 'Ungrouped envelopes']);
    });

    it('a single building opens by itself, so the founder sees the names without a click', async () => {
        const h = buildHarness();
        await create(h, [prism(ENV_P0, { name: 'Pavilion' })]);
        mountBrowser();
        expect(rowIds()).toEqual([ENV_P0]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// LIVE — the store's own dirty channel, and nothing else
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('§BROWSER-LISTS-ENVELOPES (L-13311) — live on create / delete / undo / project switch', () => {
    it('⭐ a create, a delete and ONE Ctrl+Z each re-render the OPEN browser with no other event', async () => {
        const h = buildHarness();
        mountBrowser();
        expect(countText(), 'an empty, READABLE store is a determined 0').toBe('0');

        await create(h, [prism(ENV_A0, { name: 'Tower A ground' })]);
        await flush();
        expect(countText()).toBe('1');
        expect(rowIds()).toEqual([ENV_A0]);

        await h.bus.executeCommand('spaceEnvelope.delete', { spaceEnvelopeId: ENV_A0 });
        await flush();
        expect(h.store.get(ENV_A0), 'fixture: the envelope left the store').toBeUndefined();
        expect(countText()).toBe('0');
        expect(rowIds()).toEqual([]);

        expect(performUndo().status, 'the real Ctrl+Z path').toBe('undone');
        await flush();
        expect(h.store.get(ENV_A0), 'fixture: undo restored it').toBeDefined();
        expect(countText()).toBe('1');
        expect(rowIds()).toEqual([ENV_A0]);
    });

    it('the project-switch clear() empties the open browser (C13 §3 — the store is project-scoped)', async () => {
        const h = buildHarness();
        await create(h, [prism(ENV_A0, { name: 'Tower A ground' })]);
        mountBrowser();
        expect(countText()).toBe('1');

        h.store.clear();            // what `projectScopeRegistry.clearAll()` does on a project switch
        await flush();
        expect(countText()).toBe('0');
        expect(rowIds()).toEqual([]);
    });

    it('a RECOMPOSED runtime (a new store instance) is followed on the next rebuild — and the OLD store stops driving the rail', async () => {
        const first = buildHarness();
        await create(first, [prism(ENV_A0, { name: 'Old project' })]);
        mountBrowser();
        expect(rowIds()).toEqual([ENV_A0]);

        const second = buildHarness();                     // publishes a NEW window.runtime + store
        await create(second, [prism(ENV_X0, { name: 'New project' })]);
        window.dispatchEvent(new Event('level-changed'));  // any rebuild the panel already listens to
        expect(rowIds(), 'the rail reads the LIVE store, not the handle it first saw').toEqual([ENV_X0]);

        // Positive control: a rebuild replaces the node, so node IDENTITY is a rebuild counter.
        const beforeLive = node();
        await create(second, [prism(ENV_X1, { name: 'New project 2' }, 10)]);
        await flush();
        expect(node(), 'a change on the LIVE store rebuilds the rail').not.toBe(beforeLive);
        expect(countText(), 'the subscription MOVED to the new store').toBe('2');

        // ⭐ The unsubscribe half. Counting cannot see a leak (any rebuild reads the live store and
        // still prints 2); a rebuild can. A listener left on the dead store would replace the node.
        const beforeDead = node();
        await create(first, [prism(ENV_S0, { name: 'stale', levelId: 'L1' }, 20)]);
        expect(first.store.get(ENV_S0), 'fixture: the OLD store really changed').toBeDefined();
        await flush();
        expect(node(), 'a change on the OLD store must not rebuild the rail').toBe(beforeDead);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// SELECTION — Contract 27 §4
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('§BROWSER-LISTS-ENVELOPES (L-13311) — a row click selects the envelope', () => {
    it('⭐ click → selectionBus.select(id, "project-browser") → SelectionManager.selectById(id), and the row highlights', async () => {
        const picked: string[] = [];
        selectionBus.setSelectionManager({
            selectById: (id: string) => { picked.push(id); },
            applyMarqueeHighlights: () => undefined,
            unselectAll: () => undefined,
        });
        const h = buildHarness();
        await create(h, [prism(ENV_P0, { name: 'Pavilion' })]);
        mountBrowser();

        node().querySelector<HTMLElement>(`[data-elem-id="${ENV_P0}"]`)!.click();

        expect(picked, 'the viewport selection seam received THIS envelope').toEqual([ENV_P0]);
        expect(selectionBus.currentIds).toEqual([ENV_P0]);
        expect(node().querySelector(`[data-elem-id="${ENV_P0}"]`)!.className).toContain('pb-ubp-st-elem-row--sel');
    });

    it('a click on the row\'s eye does NOT select (the control is not the row)', async () => {
        const picked: string[] = [];
        selectionBus.setSelectionManager({
            selectById: (id: string) => { picked.push(id); },
            applyMarqueeHighlights: () => undefined,
            unselectAll: () => undefined,
        });
        const h = buildHarness();
        await create(h, [prism(ENV_P0, { name: 'Pavilion' })]);
        mountBrowser();
        node().querySelector<HTMLElement>(`[data-elem-id="${ENV_P0}"] .pb-ubp-st-vis`)!.click();
        expect(picked).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// CROSS-MODEL AGREEMENT — one id set, and one building partition, however the rail is looked at
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('§BROWSER-LISTS-ENVELOPES (L-13311) — every surface of the rail agrees with the store', () => {
    it('⭐ Envelopes node == ELEMENTS (Level ∪ Room) == per-storey tree == INSPECT tree == store — and the rendered rows too', async () => {
        const h = buildHarness();
        await create(h, FOUR());
        mountBrowser();
        openAllBuildings();

        const storeIds = [...h.store.getState().values()]
            .filter((r) => r.role === 'level' || r.role === 'room')
            .map((r) => r.id).sort();
        expect(storeIds).toHaveLength(4);

        // The same bag shape production builds: runtime NULL.
        const bag = { runtime: null, roofStore: null } as unknown as UBPBag;
        const lv = determineCategoryElements(bag, 'Level envelopes');
        const rm = determineCategoryElements(bag, 'Room envelopes');
        if (lv.kind !== 'determined' || rm.kind !== 'determined') throw new Error('categories undetermined');
        const elementsIds = [...lv.elements, ...rm.elements].map((e) => String(e.id)).sort();
        const perStorey = LEVELS.flatMap((l) => getElementsForLevel(bag, l.id))
            .filter((e) => String(e.id).startsWith('spaceEnvelope_')).map((e) => String(e.id)).sort();
        const model = readEnvelopeTree(h.store, LEVELS);
        if (!model.readable) throw new Error('tree unreadable');

        expect([...model.ids].sort(), 'the Envelopes node model').toEqual(storeIds);
        expect(rowIds().sort(), 'the Envelopes node as RENDERED').toEqual(storeIds);
        expect(elementsIds, 'the ELEMENTS card categories').toEqual(storeIds);
        expect(perStorey, 'the per-storey PROJECT tree (and so the isolate id set)').toEqual(storeIds);

        // The INSPECT section of the same rail is a third registry (`INSPECT_CATEGORIES`, read by its
        // own traversal). Per label, it must hold exactly what the ELEMENTS row of that label holds.
        const inspect = buildProjectTreeModel(LEVELS.map((l) => l.id));
        const byLabel = { 'Level envelopes': lv.elements, 'Room envelopes': rm.elements } as const;
        for (const label of ENVELOPE_CATEGORIES) {
            const cat = INSPECT_CATEGORIES.find((c) => c.label === label);
            if (cat === undefined) throw new Error(`Inspect declares no "${label}" category`);
            const inspectIds = inspect.levels
                .flatMap((l) => l.groups.filter((g) => g.id === cat.id))
                .flatMap((g) => g.elements.map((e) => String(e.id)))
                .sort();
            expect(inspectIds, `Inspect "${label}" == ELEMENTS "${label}"`)
                .toEqual(byLabel[label].map((e) => String(e.id)).sort());
        }
    });

    it('⭐ the ELEMENTS card files every envelope under the SAME building as the PROJECT card — a room by its parent, two same-label groups apart', async () => {
        const h = buildHarness();
        await create(h, [
            prism(ENV_A0, { name: 'Tower A ground', group: BLOCK_A }),
            prism(ENV_A1, { name: 'Tower A first', levelId: 'L1', group: BLOCK_A }),
            roomInside(ENV_R1, ENV_A0, 'Tower A lobby'),
            prism(ENV_B1, { name: 'East B', group: { id: 'mg_b1', label: 'Block B' } }, 20),
            prism(ENV_B2, { name: 'West B', group: { id: 'mg_b2', label: 'Block B' } }, 30),
            prism(ENV_P0, { name: 'Pavilion' }, 10),
            roomInside(ENV_R0, ENV_P0, 'Pavilion lobby', 10),
        ]);
        // The two discriminating cases, stated so the fixture cannot silently stop exercising them:
        expect(readMassingGroupRef(h.store.get(ENV_R1)), 'fixture: the Block A room declares NO group').toBeNull();
        expect(readMassingGroupRef(h.store.get(ENV_B1))?.label).toBe(readMassingGroupRef(h.store.get(ENV_B2))?.label);
        mountBrowser();

        const project = projectPartition();
        expect(project, 'the PROJECT card: a room goes where its parent is; buildings keyed by group id').toEqual({
            'group:mg_blockA': { label: 'Block A', ids: [ENV_A0, ENV_A1, ENV_R1].sort() },
            'group:mg_b1': { label: 'Block B', ids: [ENV_B1] },
            'group:mg_b2': { label: 'Block B', ids: [ENV_B2] },
            ungrouped: { label: 'Ungrouped envelopes', ids: [ENV_P0, ENV_R0].sort() },
        });
        expect(elementsPartition(), 'the ELEMENTS card files every envelope under the SAME building')
            .toEqual(project);
    });

    it('the building a row is filed under IS the master-plan roster\'s answer (C84 EI-9)', async () => {
        const h = buildHarness();
        await create(h, FOUR());
        const roster = readMassingGroups(h.store, readLevelCandidates(LEVELS));
        const model = readEnvelopeTree(h.store, LEVELS);
        if (!model.readable) throw new Error('tree unreadable');
        for (const id of [ENV_A0, ENV_A1, ENV_P0]) {
            expect(model.buildingOf.get(id)?.groupId, id).toBe(resolveGroupOfEnvelope(roster, id)?.groupId);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// HONESTY — unreadable is not empty; unidentifiable is filed, never dropped
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('§BROWSER-LISTS-ENVELOPES (L-13311) — an unreadable store is not an empty project', () => {
    it('no envelope store on the runtime ⇒ "—" with the reason, never a confident "0"', () => {
        win()['runtime'] = { stores: {}, events: { emit: () => undefined, on: () => () => undefined } };
        win()['bimManager'] = { getLevels: () => LEVELS };
        mountBrowser();
        expect(countText()).toBe('—');
        const title = node().querySelector<HTMLElement>('[data-envelope-count]')!.title;
        expect(title).toContain('NOT a finding');
    });

    it('a level envelope the roster cannot identify is FILED under its own bucket, never dropped', () => {
        const loose = { id: ENV_X0, role: 'level', levelId: '', name: 'No storey' };
        const badGroup = { id: ENV_X1, role: 'level', levelId: 'L0', name: 'Bad group', group: { id: 'g1' } };
        const model = readEnvelopeTree({ getState: () => new Map([[ENV_X0, loose], [ENV_X1, badGroup]]) }, LEVELS);
        if (!model.readable) throw new Error('tree unreadable');
        expect(model.ids.slice().sort()).toEqual([ENV_X0, ENV_X1].sort());
        expect(model.groups.map((g) => g.label)).toEqual([UNFILED_ENVELOPES_LABEL]);
    });
});
