// @vitest-environment happy-dom
//
// §FIX-PLAN-WALL-TYPE-ARM-ON-SELECT (L-115) — the recurring "layered wall comes out PLAIN in
// plan" bug. The Draw Wall panel showed "✓ Plain Wall ready" WHILE the WALL TYPE dropdown
// showed "Interior – Partition 100mm", with a SEPARATE Apply button. Selecting the dropdown
// did NOT arm the type — the tool stayed Plain Wall unless the user clicked Apply, so a wall
// drawn after picking the layered type dispatched systemTypeId=none → a plain wall.
//
// Fix: the dropdown is the SINGLE source of truth for the armed type. Selecting a type arms
// it IMMEDIATELY — writing the stable activeWallSystemType store (read by the plan handler,
// L-98) and window.wallTool — with NO Apply click, and the "ready" label reflects the type.
//
// Scope: the Draw Wall pre-draw panel arming + the plan handler's threading. No wall geometry.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showWallPreDraw, type PreDrawPanelHost } from '../src/ui/property-panel/PropertyPanelPreDraw';
import {
    resolveActiveWallSystemTypeId,
    setActiveWallSystemTypeId,
} from '../src/engine/views/plantools/activeWallSystemType';
import { WallPlanToolHandler } from '../src/engine/views/plantools/WallPlanToolHandler';
import type { PlanToolDrawContext, WorldPoint } from '../src/engine/views/plantools/PlanToolHandler';

const INTERIOR = {
    id: 'wt-interior-partition',
    name: 'Interior – Partition 100mm',
    totalThickness: 0.1,
    layers: [{ name: 'Core', thickness: 0.1, function: 'structure', materialColor: '#cfcfcf' }],
};

function installWallSystemTypeStore() {
    (window as any).wallSystemTypeStore = {
        getAll: () => [INTERIOR],
        getById: (id: string) => (id === INTERIOR.id ? INTERIOR : undefined),
        getTotalThickness: (id: string) => (id === INTERIOR.id ? INTERIOR.totalThickness : undefined),
    };
}

function makeHost(): PreDrawPanelHost {
    const element = document.createElement('div');
    document.body.appendChild(element);
    return {
        element,
        clearForPreDraw: () => { element.innerHTML = ''; },
        buildCloseBtn: () => document.createElement('button'),
        makeVisible: () => {},
        positionBesideModeBar: () => {},
    } as unknown as PreDrawPanelHost;
}

function makeWallTool() {
    return {
        _id: undefined as string | undefined,
        getSystemTypeId() { return this._id; },
        setSystemTypeId(id: string | undefined) { this._id = id; },
    };
}

beforeEach(() => {
    setActiveWallSystemTypeId(undefined);
    installWallSystemTypeStore();
});

afterEach(() => {
    setActiveWallSystemTypeId(undefined);
    delete (window as any).wallSystemTypeStore;
    delete (window as any).wallTool;
    delete (window as any).runtime;
    delete (window as any).wallModePicker;
    delete (window as any).__pryzmInitComplete;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('§FIX-PLAN-WALL-TYPE-ARM-ON-SELECT (L-115) — dropdown-select arms the type (no Apply)', () => {
    it('selecting the layered type in the dropdown ARMS it immediately — activeWallSystemType + wallTool + label', () => {
        (window as any).wallTool = makeWallTool();
        const host = makeHost();
        showWallPreDraw(host, (window as any).wallTool);

        // Fresh panel: Plain Wall, label says so.
        expect(resolveActiveWallSystemTypeId()).toBeUndefined();
        const hint = host.element.querySelector('div.gpp-header > div:nth-child(3)') as HTMLElement | null;
        // (the hint is the 3rd header child: badge, title, hint)

        // User picks Interior – Partition in the dropdown WITHOUT clicking Apply.
        const sel = host.element.querySelector('select') as HTMLSelectElement;
        expect(sel).toBeTruthy();
        sel.value = INTERIOR.id;
        sel.dispatchEvent(new Event('change', { bubbles: true }));

        // Armed immediately on select — the single source of truth the plan handler reads.
        expect(resolveActiveWallSystemTypeId()).toBe('wt-interior-partition');
        expect((window as any).wallTool.getSystemTypeId()).toBe('wt-interior-partition');
        // The "ready" label reflects the SELECTED type — never "Plain Wall ready" now.
        expect(hint?.textContent ?? '').toContain('Interior');
        expect(hint?.textContent ?? '').not.toContain('Plain Wall ready');
    });

    it('a pre-selected layered type is armed on panel OPEN (label reflects it, not Plain Wall)', () => {
        const tool = makeWallTool();
        tool.setSystemTypeId('wt-interior-partition'); // e.g. carried from a prior session
        (window as any).wallTool = tool;

        const host = makeHost();
        showWallPreDraw(host, tool);

        // Armed on open — no Apply, no change event needed.
        expect(resolveActiveWallSystemTypeId()).toBe('wt-interior-partition');
        const hint = host.element.querySelector('div.gpp-header > div:nth-child(3)') as HTMLElement | null;
        expect(hint?.textContent ?? '').toContain('Interior');
        expect(hint?.textContent ?? '').not.toContain('Plain Wall ready');
    });

    it('END-TO-END: pick the layered type → draw → wall.create carries systemTypeId (no Apply)', () => {
        (window as any).wallTool = makeWallTool();
        const executeCommand = vi.fn(() => ({ catch: () => {} }));
        (window as any).runtime = { bus: { executeCommand } };
        (window as any).wallModePicker = { getActiveMode: () => 'linear' };
        (window as any).__pryzmInitComplete = true;

        // 1) Panel up, user selects Interior in the dropdown (no Apply).
        const host = makeHost();
        showWallPreDraw(host, (window as any).wallTool);
        const sel = host.element.querySelector('select') as HTMLSelectElement;
        sel.value = INTERIOR.id;
        sel.dispatchEvent(new Event('change', { bubbles: true }));

        // 2) Draw a wall on the plan canvas.
        const ctx = makeCtx();
        const handler = new WallPlanToolHandler();
        handler.activate(ctx);
        handler.onClick({ worldX: 0, worldZ: 0 } as WorldPoint);
        handler.onClick({ worldX: 5, worldZ: 0 } as WorldPoint);

        // The dispatched wall carries the layered type + its 0.1 m thickness — a LAYERED wall.
        expect(executeCommand).toHaveBeenCalledTimes(1);
        const [cmd, payload] = executeCommand.mock.calls[0];
        expect(cmd).toBe('wall.create');
        expect(payload.systemTypeId).toBe('wt-interior-partition');
        expect(payload.thickness).toBeCloseTo(0.1, 6);

        handler.deactivate();
    });
});

function makeCtx(): PlanToolDrawContext {
    const overlay = document.createElement('canvas');
    overlay.width = 800; overlay.height = 600;
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
        get(_t, prop) {
            if (prop === 'measureText') return () => ({ width: 0 });
            if (prop === 'canvas') return overlay;
            return () => undefined;
        },
        set() { return true; },
    });
    const planCanvas = {
        worldToScreen: (x: number, z: number) => ({ sx: x, sy: z }),
        screenToWorld: (sx: number, sy: number) => ({ worldX: sx, worldZ: sy }),
        getPixelsPerUnit: () => 50,
    };
    return {
        overlayCanvas: overlay,
        baseCanvas: overlay,
        ctx,
        planCanvas: planCanvas as never,
        interaction: {} as never,
        viewDef: { id: 'plan-1', spatial: { levelId: 'L0' } } as never,
        dpr: 1,
        viewPlane: {} as never,
        commandManager: undefined as never,
        wallStore: undefined as never,
        runtime: undefined,
        activeOpeningTool: undefined,
    } as PlanToolDrawContext;
}
