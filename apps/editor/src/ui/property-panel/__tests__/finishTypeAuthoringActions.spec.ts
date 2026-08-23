// @vitest-environment happy-dom
//
// §FEAT-HOSTED-TYPE-AUTHORING (C65) — the "Duplicate Type… / New Type…" entries
// for door/window: rendered ONLY for declared families (§3.9), and the save path
// dispatches the elementType.* COMMAND on the bus (P6) — never a store write.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    appendTypeAuthoringOptions,
    handleFinishTypeAuthoring,
    uniqueTypeName,
    DUPLICATE_TYPE_OPTION,
    NEW_TYPE_OPTION,
} from '../FinishTypeAuthoringActions';

// A minimal store double — the REAL stores are covered by the engine specs;
// here the subject is the UI protocol around them.
function makeStore(types: any[]) {
    return {
        getAll: () => types,
        getById: (id: string) => types.find(t => t.id === id),
    };
}

// ⚠ §OPENING-FINISH-IS-A-REFERENCE (L-7702, commit efe32a0d, 2026-08-23) made a
// finish slot without a `materialId` INVALID — `validate()` refuses the save with
// "Pick a library material for Frame." This fixture was last edited on 2026-08-10
// (8fa2cd0f) and carried a colour with no id, so the two save tests below had been
// RED since that commit landed: the rule shipped and its fixture did not move with
// it. Measured 2026-08-23 by lane OPENUI57 — see ISSUE-LOG L-9640.
//
// ⛔ The fix is the FIXTURE, not the rule. A door type whose frame names no library
// material cannot be scheduled, exported to IFC or given a carbon factor (C100 §2.1);
// refusing it is the behaviour under test, and the refusal now has a test of its own
// below rather than silently eating two other assertions.
const SOLID = {
    id: 'dt-solid-timber',
    name: 'Solid Timber (Default)',
    isBuiltIn: true,
    frameFinish: { name: 'Wood · Oak (Light)', materialId: 'wood-oak', materialColor: '#c8a96e' },
    leafFinish:  { name: 'Wood · Oak (Light)', materialId: 'wood-oak', materialColor: '#c8a96e' },
    glazingOpacity: 1,
    dimensions: { width: 0.926, height: 2.04 },
    metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'system', version: 1 },
};

let executeCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
    executeCommand = vi.fn().mockResolvedValue(undefined);
    (window as { runtime?: unknown }).runtime = { bus: { executeCommand } };
});

afterEach(() => {
    delete (window as { runtime?: unknown }).runtime;
    document.body.innerHTML = '';
});

describe('appendTypeAuthoringOptions (§3.9 — no affordance without an implementation)', () => {
    it('adds separator + Duplicate/New for a DECLARED family', () => {
        const sel = document.createElement('select');
        const authoring = appendTypeAuthoringOptions(sel, 'door', true);
        expect(authoring).not.toBeNull();
        const values = Array.from(sel.options).map(o => o.value);
        expect(values).toContain(DUPLICATE_TYPE_OPTION);
        expect(values).toContain(NEW_TYPE_OPTION);
        expect(sel.querySelector('.wts-opt-sep')).not.toBeNull();
        const labels = Array.from(sel.options).map(o => o.textContent);
        expect(labels).toContain('Duplicate Type…');
        expect(labels).toContain('New Type…');
    });

    it('adds NOTHING for an undeclared family — never a disabled entry', () => {
        const sel = document.createElement('select');
        expect(appendTypeAuthoringOptions(sel, 'stair', true)).toBeNull();
        expect(sel.options.length).toBe(0);
    });
});

describe('handleFinishTypeAuthoring — Duplicate (P6: command, not store write)', () => {
    it('opens the editor pre-filled with a deep copy and dispatches elementType.duplicate on save', () => {
        const store = makeStore([SOLID]);
        const onCreated = vi.fn();
        handleFinishTypeAuthoring({
            mode: 'duplicate', family: 'door', store,
            currentTypeId: 'dt-solid-timber', onCreated,
        });

        const panel = document.querySelector('.fte-panel') as HTMLElement;
        expect(panel).not.toBeNull();
        // Pre-named "(Copy)", collision-free.
        const nameInput = panel.querySelector('#fte-name') as HTMLInputElement;
        expect(nameInput.value).toBe('Solid Timber (Default) (Copy)');

        // Save.
        const saveBtn = Array.from(panel.querySelectorAll('button'))
            .find(b => b.textContent?.startsWith('Create'))!;
        saveBtn.click();

        expect(executeCommand).toHaveBeenCalledTimes(1);
        const [type, payload] = executeCommand.mock.calls[0];
        expect(type).toBe('elementType.duplicate');
        expect(payload.family).toBe('door');
        // Deep copy: the draft carries the source's structure but not its identity.
        expect(payload.draft.name).toBe('Solid Timber (Default) (Copy)');
        expect(payload.draft.id).toBeUndefined();
        expect(payload.draft.isBuiltIn).toBeUndefined();
        expect(payload.draft.frameFinish).toEqual(SOLID.frameFinish);
        expect(payload.draft.frameFinish).not.toBe(SOLID.frameFinish);
        expect(payload.draft.dimensions).toEqual(SOLID.dimensions);
    });

    it('Cancel dispatches NOTHING and closes the editor', () => {
        const store = makeStore([SOLID]);
        handleFinishTypeAuthoring({
            mode: 'duplicate', family: 'door', store,
            currentTypeId: 'dt-solid-timber', onCreated: vi.fn(),
        });
        const panel = document.querySelector('.fte-panel') as HTMLElement;
        const cancelBtn = Array.from(panel.querySelectorAll('button'))
            .find(b => b.textContent === 'Cancel')!;
        cancelBtn.click();
        expect(executeCommand).not.toHaveBeenCalled();
        expect(document.querySelector('.fte-panel')).toBeNull();
    });

    it('REFUSES to save a finish that names no library material (L-7702)', () => {
        // The state the old fixture was accidentally in, now asserted on purpose.
        const noMaterial = {
            ...SOLID,
            frameFinish: { name: 'Timber Frame', materialColor: '#c8a55a' },
            leafFinish:  { name: 'Timber Leaf',  materialColor: '#c8a55a' },
        };
        handleFinishTypeAuthoring({
            mode: 'duplicate', family: 'door', store: makeStore([noMaterial]),
            currentTypeId: 'dt-solid-timber', onCreated: vi.fn(),
        });
        const panel = document.querySelector('.fte-panel') as HTMLElement;
        const saveBtn = Array.from(panel.querySelectorAll('button'))
            .find(b => b.textContent?.startsWith('Create'))!;
        saveBtn.click();
        // Nothing dispatched, dialog stays open, and the reason is on screen —
        // C06: a refusal must name the route back.
        expect(executeCommand).not.toHaveBeenCalled();
        expect(document.querySelector('.fte-panel')).not.toBeNull();
        expect(panel.textContent).toMatch(/Pick a library material for Frame/);
    });

    it('New Type dispatches elementType.create with a template-derived draft', () => {
        const store = makeStore([SOLID]);
        handleFinishTypeAuthoring({
            mode: 'create', family: 'door', store,
            currentTypeId: null, onCreated: vi.fn(),
        });
        const panel = document.querySelector('.fte-panel') as HTMLElement;
        const nameInput = panel.querySelector('#fte-name') as HTMLInputElement;
        expect(nameInput.value).toBe('Custom Door Type');
        const saveBtn = Array.from(panel.querySelectorAll('button'))
            .find(b => b.textContent?.startsWith('Create'))!;
        saveBtn.click();
        expect(executeCommand.mock.calls[0][0]).toBe('elementType.create');
    });
});

describe('uniqueTypeName', () => {
    it('resolves collisions by suffixing, case-insensitively', () => {
        expect(uniqueTypeName('Oak', [])).toBe('Oak');
        expect(uniqueTypeName('Oak', ['oak'])).toBe('Oak 2');
        expect(uniqueTypeName('Oak', ['oak', 'oak 2'])).toBe('Oak 3');
    });
});
