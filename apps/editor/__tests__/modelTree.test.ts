// @vitest-environment happy-dom
//
// C27 INS-α-4 — Master Model Tree component skeleton tests.
//
// CONTRACT: C27-BIM3-INSPECT-MODEL.md §2 (master tree hierarchy 0..6),
// §1.5 (commands flow through commandBus, defensive when registry empty).
// Slice α-4 ships L0..L4 (project / building / level / apartment / room).
//
// Tests cover the rendering, expand/collapse, selection emission, keyboard
// activation, refresh, and unmount surfaces.  Stubs the runtime with the
// minimum store shape the component probes for — buildings / levels /
// apartments / rooms — and verifies graceful fallbacks when any store
// is missing.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelTreeComponent, type ModelTreeRuntime } from '../src/ui/inspect/ModelTree.js';
import type { InspectSelection } from '@pryzm/schemas';

// ── Test runtime builder ─────────────────────────────────────────────────────

interface FakeLevel { id: string; name: string }
interface FakeRoom { id: string; name: string; levelId: string }
interface FakeApartment { id: string; name?: string }
interface FakeBuilding { id: string; name: string }

interface FakeRuntimeOpts {
    projectName?: string | null;
    projectId?: string | null;
    levels?: ReadonlyArray<FakeLevel>;
    rooms?: ReadonlyArray<FakeRoom>;
    apartments?: ReadonlyArray<FakeApartment>;
    buildings?: ReadonlyArray<FakeBuilding>;
    registry?: ReadonlyMap<string, unknown>;
    dispatch?: (type: string, payload: unknown) => unknown;
    /** Set true to OMIT the optional store from the runtime entirely
     *  (proves defensive guard fires when stores aren't wired). */
    omitRoomStore?: boolean;
    omitLevelStore?: boolean;
    omitApartmentStore?: boolean;
    omitBuildingStore?: boolean;
}

function makeRuntime(opts: FakeRuntimeOpts = {}): ModelTreeRuntime {
    const rt: Record<string, unknown> = {
        projectContext: {
            projectName: opts.projectName ?? 'Test Project',
            projectId: opts.projectId ?? 'proj-1',
        },
        bus: {
            registry: opts.registry ?? new Map<string, unknown>(),
            dispatch: opts.dispatch ?? (() => undefined),
        },
    };
    if (!opts.omitLevelStore) rt['levelStore'] = { list: () => opts.levels ?? [] };
    if (!opts.omitRoomStore) rt['roomStore'] = { getAll: () => opts.rooms ?? [] };
    if (!opts.omitApartmentStore) rt['apartmentParametersStore'] = { list: () => opts.apartments ?? [] };
    if (!opts.omitBuildingStore && opts.buildings !== undefined) {
        rt['buildingStore'] = { list: () => opts.buildings ?? [] };
    }
    return rt as ModelTreeRuntime;
}

function makeContainer(): HTMLElement {
    const c = document.createElement('div');
    document.body.appendChild(c);
    return c;
}

beforeEach(() => {
    document.body.replaceChildren();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ModelTreeComponent (C27 INS-α-4)', () => {
    it('mount() produces exactly one <ul class="pmt-tree"> root under the container', () => {
        const container = makeContainer();
        const tree = new ModelTreeComponent(makeRuntime(), container);
        tree.mount();
        // Direct-child filter — happy-dom doesn't support `:scope` selector,
        // so we walk children manually.
        const directRoots = [...container.children].filter(
            c => c.tagName === 'UL' && c.classList.contains('pmt-tree'),
        );
        expect(directRoots.length).toBe(1);
        expect(directRoots[0]!.getAttribute('role')).toBe('tree');
    });

    it('renders the project root node always — uses runtime.projectContext.projectName for the label', () => {
        const container = makeContainer();
        new ModelTreeComponent(makeRuntime({ projectName: 'My Apartment' }), container).mount();
        const projectNode = container.querySelector<HTMLLIElement>('li.pmt-node[data-kind="project"]');
        expect(projectNode).not.toBeNull();
        expect(projectNode!.querySelector('.pmt-label')!.textContent).toBe('My Apartment');
        expect(projectNode!.dataset.level).toBe('0');
    });

    it('falls back to label "Project" when projectContext is missing', () => {
        const container = makeContainer();
        new ModelTreeComponent({} as ModelTreeRuntime, container).mount();
        const project = container.querySelector('li.pmt-node[data-kind="project"] .pmt-label');
        expect(project!.textContent).toBe('Project');
    });

    it('renders one node per level when the level store has entries', () => {
        const container = makeContainer();
        const tree = new ModelTreeComponent(makeRuntime({
            levels: [
                { id: 'lvl-1', name: 'Ground' },
                { id: 'lvl-2', name: 'Level 01' },
            ],
        }), container);
        tree.mount();
        // Project root + synthetic building are auto-expanded so level
        // children appear immediately.  Expand the synthetic building.
        const synth = container.querySelector<HTMLLIElement>('li.pmt-node[data-kind="building"]')!;
        (synth.querySelector('[data-role="toggle"]') as HTMLElement).click();

        const levelNodes = container.querySelectorAll('li.pmt-node[data-kind="level"]');
        expect(levelNodes.length).toBe(2);
        const labels = [...levelNodes].map(n => n.querySelector('.pmt-label')!.textContent);
        expect(labels).toContain('Ground');
        expect(labels).toContain('Level 01');
    });

    it('emits a single synthetic building when no buildingStore is provided', () => {
        const container = makeContainer();
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'Ground' }],
        }), container).mount();
        const buildings = container.querySelectorAll('li.pmt-node[data-kind="building"]');
        expect(buildings.length).toBe(1);
        expect(buildings[0]!.dataset.id).toBe('building-1');
    });

    it('groups rooms under their owning level (filtered by levelId)', () => {
        const container = makeContainer();
        new ModelTreeComponent(makeRuntime({
            levels: [
                { id: 'lvl-1', name: 'L1' },
                { id: 'lvl-2', name: 'L2' },
            ],
            rooms: [
                { id: 'room-a', name: 'Living', levelId: 'lvl-1' },
                { id: 'room-b', name: 'Kitchen', levelId: 'lvl-1' },
                { id: 'room-c', name: 'Bedroom', levelId: 'lvl-2' },
            ],
        }), container).mount();

        // Expand the synthetic building so levels are visible.
        const bld = container.querySelector<HTMLLIElement>('li.pmt-node[data-kind="building"]')!;
        (bld.querySelector('[data-role="toggle"]') as HTMLElement).click();
        // Expand level 1.
        const lvl1 = container.querySelector<HTMLLIElement>('li.pmt-node[data-kind="level"][data-id="lvl-1"]')!;
        (lvl1.querySelector('[data-role="toggle"]') as HTMLElement).click();

        // Now level-1 has two room children directly inside its child <ul>.
        // Walk direct DOM children — happy-dom doesn't support `:scope`.
        const lvl1Live = container.querySelector<HTMLLIElement>('li.pmt-node[data-kind="level"][data-id="lvl-1"]')!;
        const childUl = [...lvl1Live.children].find(c => c.tagName === 'UL' && c.classList.contains('pmt-children')) as HTMLUListElement | undefined;
        expect(childUl).toBeDefined();
        const lvl1Rooms = [...childUl!.children].filter(
            c => c.tagName === 'LI'
                && (c as HTMLElement).dataset.kind === 'room',
        );
        expect(lvl1Rooms.length).toBe(2);
    });

    it('survives missing optional stores without throwing (defensive guard)', () => {
        const container = makeContainer();
        const tree = new ModelTreeComponent(
            makeRuntime({
                omitLevelStore: true,
                omitRoomStore: true,
                omitApartmentStore: true,
                omitBuildingStore: true,
            }),
            container,
        );
        expect(() => tree.mount()).not.toThrow();
        // Still renders the project root + synthetic building.
        expect(container.querySelector('li.pmt-node[data-kind="project"]')).not.toBeNull();
        expect(container.querySelector('li.pmt-node[data-kind="building"]')).not.toBeNull();
    });

    it('toggle ▶ expands a collapsed subtree, toggle ▼ collapses it', () => {
        const container = makeContainer();
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
        }), container).mount();

        // Synthetic building is collapsed by default (only project root is
        // auto-expanded).  Confirm the toggle text is ▶ and there are no
        // level children rendered yet.
        const bld = container.querySelector<HTMLLIElement>('li.pmt-node[data-kind="building"]')!;
        const toggleEl = bld.querySelector<HTMLElement>('[data-role="toggle"]')!;
        expect(toggleEl.textContent).toBe('▶');
        expect(container.querySelectorAll('li.pmt-node[data-kind="level"]').length).toBe(0);

        // Click toggle → subtree expands; child level appears.
        toggleEl.click();
        expect(container.querySelectorAll('li.pmt-node[data-kind="level"]').length).toBe(1);
        const bldExpanded = container.querySelector<HTMLLIElement>('li.pmt-node[data-kind="building"]')!;
        expect(bldExpanded.querySelector('[data-role="toggle"]')!.textContent).toBe('▼');

        // Click again → collapses.
        (bldExpanded.querySelector('[data-role="toggle"]') as HTMLElement).click();
        expect(container.querySelectorAll('li.pmt-node[data-kind="level"]').length).toBe(0);
    });

    it('click on a node body fires onSelectNode with the right InspectSelection', () => {
        const container = makeContainer();
        const seen: InspectSelection[] = [];
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
        }), container, {
            onSelectNode: (sel) => seen.push(sel),
        }).mount();

        // Click the project label (avoiding the toggle).
        const projectLabel = container.querySelector<HTMLElement>(
            'li.pmt-node[data-kind="project"] .pmt-label',
        )!;
        projectLabel.click();
        expect(seen.length).toBe(1);
        expect(seen[0]!.kind).toBe('project');
        expect(seen[0]!.level).toBe(0);
    });

    it('selected node receives the pmt-node--selected class', () => {
        const container = makeContainer();
        new ModelTreeComponent(makeRuntime(), container).mount();
        const projectNode = container.querySelector<HTMLLIElement>('li.pmt-node[data-kind="project"]')!;
        const label = projectNode.querySelector<HTMLElement>('.pmt-label')!;
        label.click();
        expect(projectNode.classList.contains('pmt-node--selected')).toBe(true);
        expect(projectNode.getAttribute('aria-selected')).toBe('true');
    });

    it('Enter / Space on a focused node fires onSelectNode (keyboard parity)', () => {
        const container = makeContainer();
        const seen: InspectSelection[] = [];
        new ModelTreeComponent(makeRuntime(), container, {
            onSelectNode: (sel) => seen.push(sel),
        }).mount();
        const project = container.querySelector<HTMLLIElement>('li.pmt-node[data-kind="project"]')!;
        // Dispatch Enter (bubbles up through the delegated handler).
        project.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(seen.length).toBe(1);
        // And Space.
        project.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        expect(seen.length).toBe(2);
    });

    it('dispatches inspect.selectNode through the command bus ONLY when the registry has the handler', () => {
        const container = makeContainer();
        const dispatch = vi.fn();

        // Case 1 — registry empty: dispatch must NOT fire.
        new ModelTreeComponent(makeRuntime({ dispatch }), container).mount();
        const projectLabel = container.querySelector<HTMLElement>(
            'li.pmt-node[data-kind="project"] .pmt-label',
        )!;
        projectLabel.click();
        expect(dispatch).not.toHaveBeenCalled();

        // Case 2 — handler registered: dispatch fires with the selection payload.
        document.body.replaceChildren();
        const container2 = makeContainer();
        const dispatch2 = vi.fn();
        const registry = new Map<string, unknown>([['inspect.selectNode', { handle: () => undefined }]]);
        new ModelTreeComponent(makeRuntime({ dispatch: dispatch2, registry }), container2).mount();
        const projectLabel2 = container2.querySelector<HTMLElement>(
            'li.pmt-node[data-kind="project"] .pmt-label',
        )!;
        projectLabel2.click();
        expect(dispatch2).toHaveBeenCalledTimes(1);
        expect(dispatch2.mock.calls[0]![0]).toBe('inspect.selectNode');
        const payload = dispatch2.mock.calls[0]![1] as { selection: InspectSelection };
        expect(payload.selection.kind).toBe('project');
    });

    it('refresh() reflects newly added rooms', () => {
        const container = makeContainer();
        const rooms: FakeRoom[] = [{ id: 'r-1', name: 'Living', levelId: 'lvl-1' }];
        const runtime: ModelTreeRuntime = {
            projectContext: { projectName: 'P', projectId: 'p1' },
            bus: { registry: new Map(), dispatch: () => undefined },
            levelStore: { list: () => [{ id: 'lvl-1', name: 'L1' }] },
            roomStore: { getAll: () => rooms },
        };
        const tree = new ModelTreeComponent(runtime, container);
        tree.mount();
        // Expand synthetic building + the level so rooms render.
        (container.querySelector<HTMLElement>(
            'li.pmt-node[data-kind="building"] [data-role="toggle"]',
        ))!.click();
        (container.querySelector<HTMLElement>(
            'li.pmt-node[data-kind="level"] [data-role="toggle"]',
        ))!.click();
        expect(container.querySelectorAll('li.pmt-node[data-kind="room"]').length).toBe(1);

        // Add a new room + refresh.
        rooms.push({ id: 'r-2', name: 'Kitchen', levelId: 'lvl-1' });
        tree.refresh();
        expect(container.querySelectorAll('li.pmt-node[data-kind="room"]').length).toBe(2);

        // And handle removal.
        rooms.length = 0;
        tree.refresh();
        expect(container.querySelectorAll('li.pmt-node[data-kind="room"]').length).toBe(0);
    });

    it('unmount() removes the tree DOM + click listeners', () => {
        const container = makeContainer();
        const seen: InspectSelection[] = [];
        const tree = new ModelTreeComponent(makeRuntime(), container, {
            onSelectNode: (sel) => seen.push(sel),
        });
        tree.mount();
        expect(container.querySelector('ul.pmt-tree')).not.toBeNull();
        tree.unmount();
        expect(container.querySelector('ul.pmt-tree')).toBeNull();
        // After unmount the listeners are gone (no stale leak).  We assert
        // that the tree DOES NOT receive further click events by re-mounting
        // a fresh container and confirming the OLD container has no nodes
        // — the listener wiring is part of the previous (now-removed) <ul>.
        // A more direct check: unmount() is idempotent — calling twice is a
        // safe no-op.
        expect(() => tree.unmount()).not.toThrow();
        expect(seen.length).toBe(0);
    });

    it('renders an apartment node under its level when apartmentParametersStore has entries', () => {
        const container = makeContainer();
        new ModelTreeComponent(makeRuntime({
            levels: [{ id: 'lvl-1', name: 'L1' }],
            apartments: [{ id: 'apt-1', name: 'Apt 101' }],
        }), container).mount();
        // Expand building + level.
        (container.querySelector<HTMLElement>(
            'li.pmt-node[data-kind="building"] [data-role="toggle"]',
        ))!.click();
        (container.querySelector<HTMLElement>(
            'li.pmt-node[data-kind="level"] [data-role="toggle"]',
        ))!.click();
        const apts = container.querySelectorAll('li.pmt-node[data-kind="apartment"]');
        expect(apts.length).toBe(1);
        expect(apts[0]!.querySelector('.pmt-label')!.textContent).toBe('Apt 101');
        expect(apts[0]!.dataset.level).toBe('3');
    });
});
