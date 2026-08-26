/**
 * §ROOMTREE139 (L-12260+) — the Inspect PRYZM tree's BY-ROOM render + the
 * level/room mode toggle.
 *
 * These specs cover what `inspectRoomTreeModel.spec.ts` does not: the DOM the
 * by-room tree draws, and — the load-bearing part — that a room ROW dispatches
 * through the exact ROOM selection path (`onRoomSelect` + the two room-shaped
 * events + `selectionBus.select`), while an ELEMENT row under it dispatches
 * through the plain element path (`onElementSelect` + `selectionBus.select`
 * ALONE, no room events). §TREE134 established this split for the by-level
 * tree; these pin that the by-room tree reuses the SAME dispatch, via the
 * shared `selectRoomNode` / `selectElementNode` helpers in `ProjectTreeZone.ts`,
 * rather than a second, independently-typed copy.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RoomContentsService } from '@pryzm/room-topology';
import { selectionBus } from '@pryzm/core-app-model';
import { renderRoomTree, type RoomTreeState } from '../inspect/audit/RoomTreeZone';
import { createTreeModeToggle } from '../inspect/audit/TreeModeToggle';

const G = globalThis as unknown as Record<string, any>;
const installed: string[] = [];

function putStore(storeKey: string, records: any[]): void {
    installed.push(storeKey);
    G[storeKey] = {
        getAll: () => records,
        getById: (id: string) => records.find((r) => String(r.id) === String(id)),
    };
}

function seedFixture(): void {
    const rooms = [
        {
            id: 'room_A', name: 'Kitchen', levelId: 'L0',
            boundary: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }] },
            boundingWallIds: ['wall_A1'],
        },
    ];
    const roomStore = {
        getAll: () => rooms,
        getById: (id: string) => rooms.find((r) => r.id === id),
        getByLevel: () => rooms,
    };
    installed.push('roomStore');
    G['roomStore'] = roomStore;

    const svc = new RoomContentsService({ roomStore, bimManager: { getLevelById: () => undefined } });
    installed.push('roomContentsService');
    G['roomContentsService'] = svc;

    putStore('wallStore', [{ id: 'wall_A1', levelId: 'L0', name: 'North Wall' }]);
    putStore('furnitureStore', [{ id: 'furniture_A1', x: 1, z: 1, name: 'Sofa' }]);
}

function makeState(overrides: Partial<RoomTreeState> = {}): RoomTreeState {
    return {
        selectedRoomId: null,
        selectedElementId: null,
        onRoomSelect: vi.fn(),
        onElementSelect: vi.fn(),
        treeExpandedRooms: new Set(['room_A']), // pre-expanded so children render
        treeExpandedRoomFamilies: new Map([['room_A', new Set(['walls', 'furniture'])]]),
        activeFamilyFilter: null,
        onFamilyFilterChange: vi.fn(),
        ...overrides,
    };
}

beforeEach(() => {
    installed.length = 0;
    (window as any).runtime = { events: { emit: vi.fn() } };
});
afterEach(() => {
    for (const k of installed) delete G[k];
    installed.length = 0;
    delete (window as any).runtime;
    vi.restoreAllMocks();
});

describe('renderRoomTree — draws rooms, families, elements and the no-room bucket', () => {
    it('renders the Kitchen room with its wall and furniture groups', () => {
        seedFixture();
        const container = document.createElement('div');
        const state = makeState();
        renderRoomTree(container, state);

        expect(container.textContent).toContain('Kitchen');
        expect(container.textContent).toContain('Walls');
        expect(container.textContent).toContain('Furniture');
        expect(container.querySelectorAll('.aud-tree-elem-row').length).toBe(2); // wall_A1 + furniture_A1
    });

    it('shows the family filter dropdown with every non-room category', () => {
        seedFixture();
        const container = document.createElement('div');
        renderRoomTree(container, makeState());
        const select = container.querySelector<HTMLSelectElement>('.aud-room-family-filter')!;
        expect(select).toBeTruthy();
        const values = Array.from(select.options).map((o) => o.value);
        expect(values).toContain('furniture');
        expect(values).not.toContain('rooms');
    });

    it('changing the family filter select calls onFamilyFilterChange', () => {
        seedFixture();
        const container = document.createElement('div');
        const state = makeState();
        renderRoomTree(container, state);
        const select = container.querySelector<HTMLSelectElement>('.aud-room-family-filter')!;
        select.value = 'furniture';
        select.dispatchEvent(new Event('change'));
        expect(state.onFamilyFilterChange).toHaveBeenCalledWith('furniture');
    });
});

describe('selection dispatch — room rows use the ROOM path, element rows use the ELEMENT path', () => {
    it('clicking a room row dispatches onRoomSelect + BOTH room events + selectionBus.select(roomId)', () => {
        seedFixture();
        const selectSpy = vi.spyOn(selectionBus, 'select');
        const container = document.createElement('div');
        const state = makeState();
        renderRoomTree(container, state);

        const roomRow = Array.from(container.querySelectorAll('.aud-tree-level-row'))
            .find((el) => el.textContent?.includes('Kitchen'))!;
        (roomRow as HTMLElement).click();

        expect(state.onRoomSelect).toHaveBeenCalledWith('room_A');
        expect(state.onElementSelect).not.toHaveBeenCalled();
        expect((window as any).runtime.events.emit).toHaveBeenCalledWith(
            'pryzm-audit-room-select', { roomId: 'room_A', source: 'audit-stack' },
        );
        expect((window as any).runtime.events.emit).toHaveBeenCalledWith(
            'pryzm-inspect-room-focus', { roomId: 'room_A' },
        );
        expect(selectSpy).toHaveBeenCalledWith('room_A', 'inspect-panel');
    });

    it('clicking an element row under a room dispatches ONLY onElementSelect + selectionBus.select — no room events', () => {
        seedFixture();
        const selectSpy = vi.spyOn(selectionBus, 'select');
        const container = document.createElement('div');
        const state = makeState();
        renderRoomTree(container, state);

        const elemRow = Array.from(container.querySelectorAll('.aud-tree-elem-row'))
            .find((el) => el.textContent?.includes('North Wall'))!;
        (elemRow as HTMLElement).click();

        expect(state.onElementSelect).toHaveBeenCalledWith('wall_A1');
        expect(state.onRoomSelect).not.toHaveBeenCalled();
        expect((window as any).runtime.events.emit).not.toHaveBeenCalled();
        expect(selectSpy).toHaveBeenCalledWith('wall_A1', 'inspect-panel');
    });

    it('an element in the "No Room" bucket ALSO uses the element path, never the room path', () => {
        seedFixture();
        putStore('doorStore', [{ id: 'door_ORPHAN', wallId: 'no-such-wall' }]);
        const selectSpy = vi.spyOn(selectionBus, 'select');
        const container = document.createElement('div');
        const state = makeState({
            treeExpandedRooms: new Set(['room_A', '__no-room__']),
            treeExpandedRoomFamilies: new Map([
                ['room_A', new Set(['walls', 'furniture'])],
                ['__no-room__', new Set(['doors'])],
            ]),
        });
        renderRoomTree(container, state);

        expect(container.textContent).toContain('No Room');
        // `title` is set on the inner `.aud-tree-elem-label`, not the row itself.
        const label = Array.from(container.querySelectorAll<HTMLElement>('.aud-tree-elem-label'))
            .find((el) => el.title === 'door_ORPHAN')!;
        expect(label, 'the orphan door must render').toBeTruthy();
        const noRoomElemRow = label.closest('.aud-tree-elem-row') as HTMLElement;
        expect(noRoomElemRow).toBeTruthy();
        noRoomElemRow.click();

        expect(state.onElementSelect).toHaveBeenCalledWith('door_ORPHAN');
        expect(state.onRoomSelect).not.toHaveBeenCalled();
        expect((window as any).runtime.events.emit).not.toHaveBeenCalled();
        expect(selectSpy).toHaveBeenCalledWith('door_ORPHAN', 'inspect-panel');
    });
});

describe('createTreeModeToggle — mirrors the panel\'s existing PRYZM/IFC tree toggle shape', () => {
    it('starts on the initial mode and flips the active class on click', () => {
        const onChange = vi.fn();
        const { element } = createTreeModeToggle('level', onChange);
        const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('button'));
        expect(buttons).toHaveLength(2);
        expect(element.getAttribute('role')).toBe('tablist');

        const levelBtn = buttons.find((b) => b.dataset.mode === 'level')!;
        const roomBtn = buttons.find((b) => b.dataset.mode === 'room')!;
        expect(levelBtn.classList.contains('aud-tree-mode-btn--active')).toBe(true);
        expect(roomBtn.classList.contains('aud-tree-mode-btn--active')).toBe(false);

        roomBtn.click();
        expect(onChange).toHaveBeenCalledWith('room');
        expect(roomBtn.classList.contains('aud-tree-mode-btn--active')).toBe(true);
        expect(levelBtn.classList.contains('aud-tree-mode-btn--active')).toBe(false);
    });

    it('setMode() updates the active button without an onChange call', () => {
        const onChange = vi.fn();
        const { element, setMode } = createTreeModeToggle('level', onChange);
        setMode('room');
        expect(onChange).not.toHaveBeenCalled();
        const roomBtn = element.querySelector<HTMLButtonElement>('[data-mode="room"]')!;
        expect(roomBtn.classList.contains('aud-tree-mode-btn--active')).toBe(true);
    });
});
