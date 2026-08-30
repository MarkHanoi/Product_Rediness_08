/**
 * §CW90-PLAN-TYPE-PARITY (C84 EI-11) — the PLAN surface commits the SAME
 * resolved curtain-wall type the 3-D surface commits.
 *
 * ─── THE DEFECT ─────────────────────────────────────────────────────────────
 * `CurtainWallPlanToolHandler._commit()` dispatched four module constants
 * (`DEFAULT_HEIGHT`/`DEFAULT_BAY_WIDTH`/`DEFAULT_BAY_HEIGHT`/
 * `DEFAULT_MULLION_DEPTH = 0.18`) and NOTHING else — no `systemTypeId`, no
 * finishes — while the 3-D `CurtainWallTool._createSegment()` commits the
 * armed `_predrawConfig` that `PropertyPanelPreDraw.armType()` resolves via
 * `resolveCurtainWallTypeFields()`. So the founder picked a type, drew in
 * plan, and got the default grid: "plan view ignores the selected type; 3D
 * applies it correctly."
 *
 * ─── THE FIX PINNED HERE ────────────────────────────────────────────────────
 * The plan handler now reads the SAME `getPredrawConfig()` (one derivation —
 * the catalogue→fields projection runs exactly once, in the pre-draw panel)
 * and the payload CHANGES WHEN THE ARMED TYPE CHANGES. The bridge/mirror half
 * (fields surviving to the CurtainWallStore) is pinned by
 * `apps/editor/__tests__/CurtainWallBridgeCarriesAuthoredValues.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CurtainWallPlanToolHandler } from '../CurtainWallPlanToolHandler';

type Dispatched = { verb: string; payload: Record<string, unknown> };

/** Two real rows from `CurtainWallTypeStore.BUILT_IN_TYPES`, as
 *  `resolveCurtainWallTypeFields` projects them into a predraw config. */
const TYPE_A = {
    height: 3, uSpacing: 1.0, vSpacing: 3, mullionSize: 0.06,
    panelThickness: 0.02, systemTypeId: 'cw.glazed.pitch-1000',
    glazingMaterialId: 'glass-clear',
};
const TYPE_B = {
    height: 3, uSpacing: 1.5, vSpacing: 3, mullionSize: 0.1,
    panelThickness: 0.03, systemTypeId: 'cw.metal.copper-frame',
    mullionMaterialId: 'metal-copper', mullionColor: '#b87333',
    glazingMaterialId: 'metal-copper',
};

function makeHandler(armed: Record<string, unknown> | null): {
    handler: CurtainWallPlanToolHandler;
    dispatched: Dispatched[];
} {
    const dispatched: Dispatched[] = [];
    window.runtime = {
        bus: {
            executeCommand: vi.fn((verb: string, payload: Record<string, unknown>) => {
                dispatched.push({ verb, payload });
                return Promise.resolve({ success: true });
            }),
        },
    };
    const handler = new CurtainWallPlanToolHandler({
        curtainWallModePicker: { getActiveMode: () => 'linear' },
        curtainWallTool: armed ? { getPredrawConfig: () => armed } : undefined,
    });
    // Minimal draw context — only what _commit()/_clearOverlay() touch.
    (handler as any)._ctx = {
        viewDef: { spatial: { levelId: 'L0' } },
        ctx: { setTransform: () => {}, clearRect: () => {} },
        overlayCanvas: { width: 100, height: 100 },
        planCanvas: { worldToScreen: () => ({ sx: 0, sy: 0 }), getPixelsPerUnit: () => 10 },
        dpr: 1,
    };
    return { handler, dispatched };
}

function drawSegment(handler: CurtainWallPlanToolHandler): void {
    handler.onClick({ worldX: 0, worldZ: 0 });
    handler.onClick({ worldX: 6, worldZ: 0 });
}

beforeEach(() => {
    // No armed tool leaking between arms.
    delete window.curtainWallTool;
});
afterEach(() => {
    delete window.runtime;
    delete window.curtainWallTool;
});

describe('§CW90-PLAN-TYPE-PARITY — plan creation carries the armed type', () => {
    it('⭐ the dispatched payload carries the ARMED type — id, grid, mullion, finishes', () => {
        const { handler, dispatched } = makeHandler(TYPE_A);
        drawSegment(handler);

        expect(dispatched).toHaveLength(1);
        const p = dispatched[0]!.payload;
        expect(dispatched[0]!.verb).toBe('curtain-wall.create');
        expect(p['systemTypeId']).toBe('cw.glazed.pitch-1000');
        expect(p['bayWidth']).toBe(1.0);          // uSpacing → bayWidth
        expect(p['bayHeight']).toBe(3);           // vSpacing → bayHeight
        expect(p['mullionThickness']).toBe(0.06); // mullionSize → mullionThickness
        expect(p['panelThickness']).toBe(0.02);
        expect(p['glazingMaterialId']).toBe('glass-clear');
        // ⛔ The old constants must NOT win over an armed type.
        expect(p['mullionThickness']).not.toBe(0.18);
        expect(p['bayWidth']).not.toBe(1.2);
    });

    it('⭐ the payload CHANGES when the armed type changes — the founder\'s report, inverted', () => {
        let armed: Record<string, unknown> = TYPE_A;
        const dispatched: Dispatched[] = [];
        window.runtime = {
            bus: {
                executeCommand: (verb: string, payload: Record<string, unknown>) => {
                    dispatched.push({ verb, payload });
                    return Promise.resolve({ success: true });
                },
            },
        };
        const handler = new CurtainWallPlanToolHandler({
            curtainWallModePicker: { getActiveMode: () => 'linear' },
            curtainWallTool: { getPredrawConfig: () => armed },
        });
        (handler as any)._ctx = {
            viewDef: { spatial: { levelId: 'L0' } },
            ctx: { setTransform: () => {}, clearRect: () => {} },
            overlayCanvas: { width: 100, height: 100 },
            planCanvas: { worldToScreen: () => ({ sx: 0, sy: 0 }), getPixelsPerUnit: () => 10 },
            dpr: 1,
        };

        drawSegment(handler);
        handler.cancel();
        armed = TYPE_B; // the user picks a different type in the pre-draw panel
        drawSegment(handler);

        expect(dispatched).toHaveLength(2);
        const [a, b] = dispatched.map(d => d.payload);
        expect(a!['systemTypeId']).toBe('cw.glazed.pitch-1000');
        expect(b!['systemTypeId']).toBe('cw.metal.copper-frame');
        expect(a!['mullionThickness']).not.toBe(b!['mullionThickness']);
        expect(b!['mullionMaterialId']).toBe('metal-copper');
        expect(b!['mullionColor']).toBe('#b87333');
    });

    it('CONTROL — with no armed tool at all, the legacy defaults still dispatch (degraded boot unchanged)', () => {
        const { handler, dispatched } = makeHandler(null);
        drawSegment(handler);

        expect(dispatched).toHaveLength(1);
        const p = dispatched[0]!.payload;
        expect(p['height']).toBe(3.0);
        expect(p['bayWidth']).toBe(1.2);
        expect(p['bayHeight']).toBe(1.5);
        expect(p['mullionThickness']).toBe(0.18);
        expect('systemTypeId' in p).toBe(false);
        expect('glazingMaterialId' in p).toBe(false);
    });
});
