// @vitest-environment happy-dom
//
// C27 INS-α-9 — Master Model Tree L5 (Element Type) extension tests.
//
// CONTRACT: C27-BIM3-INSPECT-MODEL.md §2 (master tree hierarchy 0..6,
// level 5 = elementType groupings).  Sister test to `modelTree.test.ts`
// (α-4) which covers L0..L4.  This file exercises ONLY the α-9 surface:
// grouping element instances by `element.elementType` under the room
// (or level, for room-less elements).
//
// Element instances are NOT rendered here — α-10 lands the per-instance
// list.  The L5 expanded body is a single `<li class="pmt-leaf">`
// placeholder carrying the count.

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelTreeComponent, type ModelTreeRuntime } from '../src/ui/inspect/ModelTree.js';
import type { InspectSelection } from '@pryzm/schemas';

// ── Test runtime builder ─────────────────────────────────────────────────────

interface FakeLevel { id: string; name: string }
interface FakeRoom { id: string; name: string; levelId: string }
interface FakeElement {
    id: string;
    elementType: unknown; // intentionally unknown — test covers non-string skip
    roomId?: string;
    levelId?: string;
}

interface FakeRuntimeOpts {
    levels?: ReadonlyArray<FakeLevel>;
    rooms?: ReadonlyArray<FakeRoom>;
    elements?: ReadonlyArray<FakeElement>;
    omitElementStore?: boolean;
}

function makeRuntime(opts: FakeRuntimeOpts = {}): ModelTreeRuntime {
    const elementStore = new Map<string, FakeElement>();
    for (const e of opts.elements ?? []) elementStore.set(e.id, e);
    const rt: Record<string, unknown> = {
        projectContext: { projectName: 'Test Project', projectId: 'proj-1' },
        bus: { registry: new Map<string, unknown>(), dispatch: () => undefined },
        levelStore: { list: () => opts.levels ?? [] },
        roomStore: { getAll: () => opts.rooms ?? [] },
        apartmentParametersStore: { list: () => [] },
    };
    if (!opts.omitElementStore) {
        // Mirror the base Store<T> shape — `getState()` returns a Map.
        rt['elementStore'] = { getState: () => elementStore };
    }
    return rt as ModelTreeRuntime;
}

function makeContainer(): HTMLElement {
    const c = document.createElement('div');
    document.body.appendChild(c);
    return c;
}

/** Expand the synthetic building + the named level so the room/level
 *  children are visible.  Returns the live <li> for the level. */
function expandBuildingAndLevel(container: HTMLElement, levelId: string): HTMLLIElement {
    const bld = container.querySelector<HTMLLIElement>('li.pmt-node[data-kind="building"]')!;
    (bld.querySelector('[data-role="toggle"]') as HTMLElement).click();
    const lvl = container.querySelector<HTMLLIElement>(
        `li.pmt-node[data-kind="level"][data-id="${levelId}"]`,
    )!;
    (lvl.querySelector('[data-role="toggle"]') as HTMLElement).click();
    return container.querySelector<HTMLLIElement>(
        `li.pmt-node[data-kind="level"][data-id="${levelId}"]`,
    )!;
}

function expandRoom(container: HTMLElement, roomId: string): HTMLLIElement {
    const room = container.querySelector<HTMLLIElement>(
        `li.pmt-node[data-kind="room"][data-id="${roomId}"]`,
    )!;
    (room.querySelector('[data-role="toggle"]') as HTMLElement).click();
    return container.querySelector<HTMLLIElement>(
        `li.pmt-node[data-kind="room"][data-id="${roomId}"]`,
    )!;
}

beforeEach(() => {
    document.body.replaceChildren();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ModelTreeComponent L5 element-type groupings (C27 INS-α-9)', () => {
    it('groups walls in a room into a single "Walls (5)" L5 node', () => {
        const container = makeContainer();
        const elements: FakeElement[] = Array.from({ length: 5 }, (_, i) => ({
            id: `w-${i + 1}`,
            elementType: 'wall',
            roomId: 'room-a',
        }));
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
            rooms: [{ id: 'room-a', name: 'Living', levelId: 'lvl-1' }],
            elements,
        }), container).mount();

        expandBuildingAndLevel(container, 'lvl-1');
        const room = expandRoom(container, 'room-a');

        const childUl = [...room.children].find(
            c => c.tagName === 'UL' && c.classList.contains('pmt-children'),
        ) as HTMLUListElement | undefined;
        expect(childUl).toBeDefined();
        const typeNodes = [...childUl!.children].filter(
            c => c.tagName === 'LI' && (c as HTMLElement).dataset.kind === 'elementType',
        );
        expect(typeNodes.length).toBe(1);
        const label = (typeNodes[0] as HTMLElement).querySelector('.pmt-label')!.textContent;
        expect(label).toBe('Walls (5)');
        expect((typeNodes[0] as HTMLElement).dataset.level).toBe('5');
    });

    it('groups multiple types into separate L5 nodes ("Doors (3)" + "Windows (2)")', () => {
        const container = makeContainer();
        const elements: FakeElement[] = [
            { id: 'd-1', elementType: 'door', roomId: 'room-a' },
            { id: 'd-2', elementType: 'door', roomId: 'room-a' },
            { id: 'd-3', elementType: 'door', roomId: 'room-a' },
            { id: 'win-1', elementType: 'window', roomId: 'room-a' },
            { id: 'win-2', elementType: 'window', roomId: 'room-a' },
        ];
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
            rooms: [{ id: 'room-a', name: 'Living', levelId: 'lvl-1' }],
            elements,
        }), container).mount();

        expandBuildingAndLevel(container, 'lvl-1');
        const room = expandRoom(container, 'room-a');
        const childUl = [...room.children].find(
            c => c.tagName === 'UL' && c.classList.contains('pmt-children'),
        ) as HTMLUListElement;
        const typeNodes = [...childUl.children].filter(
            c => c.tagName === 'LI' && (c as HTMLElement).dataset.kind === 'elementType',
        );
        expect(typeNodes.length).toBe(2);
        const labels = typeNodes.map(n => (n as HTMLElement).querySelector('.pmt-label')!.textContent);
        expect(labels).toContain('Doors (3)');
        expect(labels).toContain('Windows (2)');
    });

    it('an empty room (no elements) renders no L5 children — room is a leaf', () => {
        const container = makeContainer();
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
            rooms: [{ id: 'room-a', name: 'Empty', levelId: 'lvl-1' }],
            elements: [],
        }), container).mount();

        expandBuildingAndLevel(container, 'lvl-1');
        const room = container.querySelector<HTMLLIElement>(
            'li.pmt-node[data-kind="room"][data-id="room-a"]',
        )!;
        // The room toggle should be in leaf mode (no expandable subtree).
        const toggle = room.querySelector<HTMLElement>('[data-role="toggle"]')!;
        expect(toggle.classList.contains('pmt-toggle--leaf')).toBe(true);
        expect(toggle.textContent).toBe('');
    });

    it('elements with no roomId but with levelId are grouped under the LEVEL (not under any room)', () => {
        const container = makeContainer();
        const elements: FakeElement[] = [
            // Structural walls outside any room.
            { id: 'sw-1', elementType: 'wall', levelId: 'lvl-1' },
            { id: 'sw-2', elementType: 'wall', levelId: 'lvl-1' },
        ];
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
            rooms: [{ id: 'room-a', name: 'Living', levelId: 'lvl-1' }],
            elements,
        }), container).mount();

        const lvl = expandBuildingAndLevel(container, 'lvl-1');
        const childUl = [...lvl.children].find(
            c => c.tagName === 'UL' && c.classList.contains('pmt-children'),
        ) as HTMLUListElement;
        // Direct L5 children of the level (NOT inside any nested room ul).
        const lvlDirectKinds = [...childUl.children]
            .filter(c => c.tagName === 'LI')
            .map(c => (c as HTMLElement).dataset.kind);
        expect(lvlDirectKinds).toContain('elementType');
        expect(lvlDirectKinds).toContain('room');

        // The L5 walls group under the level carries the "level"-scoped
        // synthetic id (`lvl-1::type::wall`).
        const lvlWalls = container.querySelector<HTMLLIElement>(
            'li.pmt-node[data-kind="elementType"][data-id="lvl-1::type::wall"]',
        );
        expect(lvlWalls).not.toBeNull();
        expect(lvlWalls!.querySelector('.pmt-label')!.textContent).toBe('Walls (2)');

        // And NO L5 group hangs off room-a (no in-room elements).
        const room = container.querySelector<HTMLLIElement>(
            'li.pmt-node[data-kind="room"][data-id="room-a"]',
        )!;
        expect(room.querySelector('[data-role="toggle"]')!.classList.contains('pmt-toggle--leaf')).toBe(true);
    });

    it('click on an L5 node fires onSelectNode with the right synthetic id + kind="elementType"', () => {
        const container = makeContainer();
        const seen: InspectSelection[] = [];
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
            rooms: [{ id: 'room-a', name: 'Living', levelId: 'lvl-1' }],
            elements: [
                { id: 'w-1', elementType: 'wall', roomId: 'room-a' },
                { id: 'w-2', elementType: 'wall', roomId: 'room-a' },
            ],
        }), container, {
            onSelectNode: (sel) => seen.push(sel),
        }).mount();

        expandBuildingAndLevel(container, 'lvl-1');
        expandRoom(container, 'room-a');
        const walls = container.querySelector<HTMLLIElement>(
            'li.pmt-node[data-kind="elementType"][data-id="room-a::type::wall"]',
        )!;
        const label = walls.querySelector<HTMLElement>('.pmt-label')!;
        label.click();
        expect(seen.length).toBe(1);
        expect(seen[0]!.kind).toBe('elementType');
        expect(seen[0]!.id).toBe('room-a::type::wall');
        expect(seen[0]!.level).toBe(5);
    });

    it('L5 selection lands the pmt-node--selected class + aria-selected on the L5 row', () => {
        const container = makeContainer();
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
            rooms: [{ id: 'room-a', name: 'Living', levelId: 'lvl-1' }],
            elements: [{ id: 'd-1', elementType: 'door', roomId: 'room-a' }],
        }), container).mount();

        expandBuildingAndLevel(container, 'lvl-1');
        expandRoom(container, 'room-a');
        const doors = container.querySelector<HTMLLIElement>(
            'li.pmt-node[data-kind="elementType"][data-id="room-a::type::door"]',
        )!;
        (doors.querySelector<HTMLElement>('.pmt-label')!).click();
        expect(doors.classList.contains('pmt-node--selected')).toBe(true);
        expect(doors.getAttribute('aria-selected')).toBe('true');
    });

    it('clicking the L4 room (label, NOT its toggle) still selects the ROOM — L5 children unaffected', () => {
        const container = makeContainer();
        const seen: InspectSelection[] = [];
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
            rooms: [{ id: 'room-a', name: 'Living', levelId: 'lvl-1' }],
            elements: [{ id: 'd-1', elementType: 'door', roomId: 'room-a' }],
        }), container, { onSelectNode: (sel) => seen.push(sel) }).mount();

        expandBuildingAndLevel(container, 'lvl-1');
        const room = container.querySelector<HTMLLIElement>(
            'li.pmt-node[data-kind="room"][data-id="room-a"]',
        )!;
        room.querySelector<HTMLElement>('.pmt-label')!.click();
        // Room itself selected — not the L5 child.
        expect(seen.length).toBe(1);
        expect(seen[0]!.kind).toBe('room');
        expect(seen[0]!.id).toBe('room-a');
    });

    it('defensive — missing elementStore leaves the L0..L4 tree intact + emits NO L5 nodes', () => {
        const container = makeContainer();
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
            rooms: [{ id: 'room-a', name: 'Living', levelId: 'lvl-1' }],
            elements: [],
            omitElementStore: true,
        }), container).mount();
        expandBuildingAndLevel(container, 'lvl-1');
        expect(container.querySelector('li.pmt-node[data-kind="room"]')).not.toBeNull();
        expect(container.querySelectorAll('li.pmt-node[data-kind="elementType"]').length).toBe(0);
    });

    it('defensive — element with non-string elementType is skipped (no L5 group emitted)', () => {
        const container = makeContainer();
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
            rooms: [{ id: 'room-a', name: 'Living', levelId: 'lvl-1' }],
            elements: [
                { id: 'broken-1', elementType: undefined, roomId: 'room-a' },
                { id: 'broken-2', elementType: 42 as unknown as string, roomId: 'room-a' },
                { id: 'broken-3', elementType: '', roomId: 'room-a' },
                // One valid wall so we know the path is exercised.
                { id: 'w-1', elementType: 'wall', roomId: 'room-a' },
            ],
        }), container).mount();
        expandBuildingAndLevel(container, 'lvl-1');
        expandRoom(container, 'room-a');
        const typeNodes = container.querySelectorAll('li.pmt-node[data-kind="elementType"]');
        expect(typeNodes.length).toBe(1);
        expect(typeNodes[0]!.querySelector('.pmt-label')!.textContent).toBe('Walls (1)');
    });

    it('refresh() reflects added/removed elements (add 2 walls → "Walls (2)"; remove all → no L5 node)', () => {
        const container = makeContainer();
        const elementStore = new Map<string, FakeElement>();
        const runtime: ModelTreeRuntime = {
            projectContext: { projectName: 'P', projectId: 'p1' },
            bus: { registry: new Map(), dispatch: () => undefined },
            levelStore: { list: () => [{ id: 'lvl-1', name: 'L1' }] },
            roomStore: { getAll: () => [{ id: 'room-a', name: 'Living', levelId: 'lvl-1' }] },
            elementStore: { getState: () => elementStore },
        };
        const tree = new ModelTreeComponent(runtime, container);
        tree.mount();
        expandBuildingAndLevel(container, 'lvl-1');
        expandRoom(container, 'room-a');
        // Initially no L5 nodes.
        expect(container.querySelectorAll('li.pmt-node[data-kind="elementType"]').length).toBe(0);

        // Add two walls + refresh.
        elementStore.set('w-1', { id: 'w-1', elementType: 'wall', roomId: 'room-a' });
        elementStore.set('w-2', { id: 'w-2', elementType: 'wall', roomId: 'room-a' });
        tree.refresh();
        const after = container.querySelectorAll('li.pmt-node[data-kind="elementType"]');
        expect(after.length).toBe(1);
        expect(after[0]!.querySelector('.pmt-label')!.textContent).toBe('Walls (2)');

        // Remove all + refresh → node disappears.
        elementStore.clear();
        tree.refresh();
        expect(container.querySelectorAll('li.pmt-node[data-kind="elementType"]').length).toBe(0);
    });

    it('expanding an L5 node renders L6 element-instance leaves (α-10 replaces the α-9 placeholder)', () => {
        const container = makeContainer();
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
            rooms: [{ id: 'room-a', name: 'Living', levelId: 'lvl-1' }],
            elements: [
                { id: 'w-1', elementType: 'wall', roomId: 'room-a' },
                { id: 'w-2', elementType: 'wall', roomId: 'room-a' },
                { id: 'w-3', elementType: 'wall', roomId: 'room-a' },
            ],
        }), container).mount();
        expandBuildingAndLevel(container, 'lvl-1');
        expandRoom(container, 'room-a');
        const walls = container.querySelector<HTMLLIElement>(
            'li.pmt-node[data-kind="elementType"][data-id="room-a::type::wall"]',
        )!;
        // Initially collapsed — no children rendered yet.
        expect(walls.querySelector('li.pmt-node[data-kind="elementInstance"]')).toBeNull();
        // Expand → α-10 element-instance leaves appear.
        (walls.querySelector('[data-role="toggle"]') as HTMLElement).click();
        const live = container.querySelector<HTMLLIElement>(
            'li.pmt-node[data-kind="elementType"][data-id="room-a::type::wall"]',
        )!;
        const instances = live.querySelectorAll('li.pmt-node[data-kind="elementInstance"]');
        expect(instances.length).toBe(3);
        // No legacy placeholder leaf survives.
        expect(live.querySelector('.pmt-leaf:not(.pmt-leaf--overflow)')).toBeNull();
    });

    it('L5 nodes are sorted by elementType for stable rendering (doors before walls)', () => {
        const container = makeContainer();
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
            rooms: [{ id: 'room-a', name: 'Living', levelId: 'lvl-1' }],
            elements: [
                { id: 'w-1', elementType: 'wall', roomId: 'room-a' },
                { id: 'd-1', elementType: 'door', roomId: 'room-a' },
            ],
        }), container).mount();
        expandBuildingAndLevel(container, 'lvl-1');
        const room = expandRoom(container, 'room-a');
        const childUl = [...room.children].find(
            c => c.tagName === 'UL' && c.classList.contains('pmt-children'),
        ) as HTMLUListElement;
        const typeNodes = [...childUl.children].filter(
            c => c.tagName === 'LI' && (c as HTMLElement).dataset.kind === 'elementType',
        );
        // door < wall alphabetically → "Doors" comes first.
        const labels = typeNodes.map(n => (n as HTMLElement).querySelector('.pmt-label')!.textContent);
        expect(labels[0]).toBe('Doors (1)');
        expect(labels[1]).toBe('Walls (1)');
    });

    it('furniture (irregular plural / uncountable) renders without a stray "s"', () => {
        const container = makeContainer();
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
            rooms: [{ id: 'room-a', name: 'Living', levelId: 'lvl-1' }],
            elements: [
                { id: 'f-1', elementType: 'furniture', roomId: 'room-a' },
                { id: 'f-2', elementType: 'furniture', roomId: 'room-a' },
            ],
        }), container).mount();
        expandBuildingAndLevel(container, 'lvl-1');
        expandRoom(container, 'room-a');
        const node = container.querySelector<HTMLLIElement>(
            'li.pmt-node[data-kind="elementType"][data-id="room-a::type::furniture"]',
        );
        expect(node).not.toBeNull();
        expect(node!.querySelector('.pmt-label')!.textContent).toBe('Furniture (2)');
    });
});
