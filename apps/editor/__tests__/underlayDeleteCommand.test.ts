// @vitest-environment happy-dom
//
// §FIX-UNDERLAY-DELETE-AND-STORAGE (L-45) — regression gate for the floor-plan
// underlay DELETE path.
//
// The live bug: deleting a selected underlay (plan view → Delete) dispatched
// `runtime.bus.executeCommand('DELETE_UNDERLAY', deleteCmd)` (Step6CommitView,
// P6-compliant) but NO handler was registered under the `DELETE_UNDERLAY` bus key,
// so the bus threw `CommandBusError: no handler registered for: DELETE_UNDERLAY`
// BEFORE DeleteUnderlayCommand.execute() (which owns the teardown) could run — the
// underlay was never removed and the delete was lost. CREATE_UNDERLAY had the same
// latent gap (silently losing create-undo).
//
// These tests prove that initBusHandlers() now registers the three underlay command
// types, and that dispatching DELETE_UNDERLAY reaches the teardown and is UNDOABLE
// (undo recreates the underlay via the recreate hook).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandBus } from '@pryzm/command-bus';
import { DeleteUnderlayCommand } from '@pryzm/command-registry';
import { initBusHandlers } from '../src/engine/initBusHandlers';

const baseAudit = { actorId: 'u', projectId: 'p', clientId: 'c' };

function makeBus(): CommandBus {
    return new CommandBus({ audit: baseAudit, storesProvider: () => ({}) });
}

/** A duck-typed FloorPlanUnderlayTool state, enough for capture/apply snapshot. */
function installToolStub() {
    const mesh = {
        position: { x: 1, y: 0, z: 2, set() {} },
        rotation: { x: 0, y: 0, z: 0.5, set() {} },
        scale: { x: 1, y: 1, z: 1, set() {} },
        userData: {} as Record<string, unknown>,
        matrixWorldNeedsUpdate: false,
        updateWorldMatrix() {},
    };
    const state = {
        mesh,
        pxPerMeter: 50,
        planWidthMeters: 20,
        planHeightMeters: 16,
        locked: false,
    };
    (window as any).floorPlanUnderlayTool = {
        getState: () => state,
        dispose: vi.fn(),
        setLocked: vi.fn(),
    };
    return { mesh, state };
}

beforeEach(() => {
    delete (window as any).floorPlanUnderlayTool;
    delete (window as any).__pryzmRemoveUnderlayInternal;
    delete (window as any).__pryzmRecreateUnderlayInternal;
    delete (window as any).commandManager;
    delete (window as any).floorPlanUnderlayRef;
});

describe('§FIX-UNDERLAY-DELETE-AND-STORAGE — underlay bus handlers', () => {
    it('registers CREATE / TRANSFORM / DELETE_UNDERLAY handlers on the bus', () => {
        const bus = makeBus();
        initBusHandlers({ bus } as any);
        expect(bus.has('CREATE_UNDERLAY')).toBe(true);
        expect(bus.has('TRANSFORM_UNDERLAY')).toBe(true);
        expect(bus.has('DELETE_UNDERLAY')).toBe(true);
    });

    it('dispatching DELETE_UNDERLAY no longer throws and reaches the teardown', async () => {
        const bus = makeBus();
        initBusHandlers({ bus } as any);
        installToolStub();

        const remover = vi.fn();
        (window as any).__pryzmRemoveUnderlayInternal = remover;
        // The bridge forwards the pre-built command to the legacy commandManager.
        (window as any).commandManager = { execute: (cmd: any) => cmd.execute({}) };

        const creationParams = {
            blobUrl: 'data:image/png;base64,AAAA',
            pxPerMeter: 50,
            widthPx: 1000,
            heightPx: 800,
            elevationY: 0,
        };
        const delCmd = new DeleteUnderlayCommand(creationParams as any);

        // Was: `CommandBusError: no handler registered for: DELETE_UNDERLAY`.
        await expect(bus.executeCommand('DELETE_UNDERLAY', delCmd)).resolves.toBeDefined();

        // Teardown actually ran (the silent internal remover).
        expect(remover).toHaveBeenCalledWith({ silent: true });
    });

    it('undo of DELETE_UNDERLAY recreates the underlay from captured params', async () => {
        const bus = makeBus();
        initBusHandlers({ bus } as any);
        installToolStub();

        (window as any).__pryzmRemoveUnderlayInternal = vi.fn();
        const recreate = vi.fn(async () => {});
        (window as any).__pryzmRecreateUnderlayInternal = recreate;
        (window as any).commandManager = { execute: (cmd: any) => cmd.execute({}) };

        const creationParams = {
            blobUrl: 'data:image/png;base64,BBBB',
            pxPerMeter: 50,
            widthPx: 1000,
            heightPx: 800,
            elevationY: 0,
        };
        const delCmd = new DeleteUnderlayCommand(creationParams as any);
        await bus.executeCommand('DELETE_UNDERLAY', delCmd);

        // Undo → recreate hook fires with the original creation params (+ a transform
        // snapshot captured at delete time so the underlay returns in place).
        delCmd.undo({} as any);
        await Promise.resolve();
        await Promise.resolve();

        expect(recreate).toHaveBeenCalledTimes(1);
        const arg = recreate.mock.calls[0][0] as any;
        expect(arg.blobUrl).toBe('data:image/png;base64,BBBB');
        expect(arg.pxPerMeter).toBe(50);
        expect(arg.transform).toBeTruthy(); // in-place restore snapshot
    });
});
