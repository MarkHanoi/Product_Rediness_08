// §RACORIENT145 — bulk curtain-wall PANEL type/material batch.
//
// Pins the same contract points the wall/kitchen batch commands already
// established:
//   1. SCOPE: a single element, a level (and no others), the whole project,
//      or an explicit pre-resolved id list (where an orientation-scoped ask
//      lands, from the upstream chat-bridge hop).
//   2. ONE undo entry restores every touched panel byte-for-byte.
//   3. §CONTEXT-DATA-HONESTY: a scope matching ZERO panels is a visible no-op
//      via canExecute (never a throw); a panel that vanishes mid-batch is
//      SKIPPED with a reason, and the rest still change ("Changed N of M").
//   4. An unknown panel TYPE refuses NAMING the real ones; an unknown MATERIAL
//      refuses naming what the resolver could not find.
//   5. LEVEL scope is host-derived (a panel has no levelId of its own) and a
//      panel whose host curtain wall has VANISHED is excluded with a reason,
//      never silently — reusing `resolveLevelScopeByHost` (@pryzm/ai-host),
//      not a second rule.

import { describe, it, expect } from 'vitest';
import { BulkUpdateCurtainPanelsCommand } from '../src/curtainwall/BulkUpdateCurtainPanelsCommand';
import type { CommandContext } from '../src/types';

interface FakePanel {
    id: string;
    curtainWallId: string;
    cellIndex: [number, number];
    panelType: string;
    materialId?: string;
    materialOverride?: string;
}

interface FakeCurtainWall {
    id: string;
    levelId: string;
}

function panel(id: string, curtainWallId: string, over: Partial<FakePanel> = {}): FakePanel {
    return { id, curtainWallId, cellIndex: [0, 0], panelType: 'SystemPanel_Glass', ...over };
}

function makePanelStore(seed: FakePanel[]) {
    const map = new Map<string, FakePanel>(seed.map((p) => [p.id, { ...p }]));
    return {
        map,
        getAll: () => [...map.values()].map((p) => ({ ...p })),
        get: (id: string) => { const p = map.get(id); return p ? { ...p } : undefined; },
        update: (id: string, updates: Partial<FakePanel>) => {
            const existing = map.get(id);
            if (existing) map.set(id, { ...existing, ...updates });
        },
    };
}

function makeCurtainWallStore(seed: FakeCurtainWall[]) {
    const map = new Map<string, FakeCurtainWall>(seed.map((c) => [c.id, c]));
    return { getById: (id: string) => map.get(id), getAll: () => [...map.values()] };
}

function makeCtx(
    panelStore: ReturnType<typeof makePanelStore>,
    cwStore: ReturnType<typeof makeCurtainWallStore>,
): CommandContext {
    return { stores: { curtainPanelStore: panelStore, curtainWallStore: cwStore } } as unknown as CommandContext;
}

const CW_L0 = { id: 'cw-1', levelId: 'L0' };
const CW_L1 = { id: 'cw-2', levelId: 'L1' };

describe('§RACORIENT145 — TYPE change', () => {
    it('changes exactly the panels an explicit id list names; a control panel is untouched', () => {
        const panels = makePanelStore([
            panel('p-w1', 'cw-1'),
            panel('p-w2', 'cw-1'),
            panel('p-n-control', 'cw-1'),
        ]);
        const ctx = makeCtx(panels, makeCurtainWallStore([CW_L0]));
        const cmd = new BulkUpdateCurtainPanelsCommand({
            scope: { kind: 'ids', panelIds: ['p-w1', 'p-w2'] },
            change: { kind: 'type', panelType: 'SystemPanel_SlatsVerticalFramed' },
        });
        const r = cmd.execute(ctx);

        expect(r.success).toBe(true);
        expect([...r.affectedElementIds].sort()).toEqual(['p-w1', 'p-w2']);
        expect(r.info?.[0]).toContain('2 of 2 curtain-wall panels');
        expect(panels.get('p-w1')!.panelType).toBe('SystemPanel_SlatsVerticalFramed');
        expect(panels.get('p-w2')!.panelType).toBe('SystemPanel_SlatsVerticalFramed');
        // The control panel (not in the resolved id list) is byte-untouched.
        expect(panels.get('p-n-control')!.panelType).toBe('SystemPanel_Glass');
    });

    it('an unknown panel type refuses, NAMING the real ones — never guesses', () => {
        const panels = makePanelStore([panel('p-1', 'cw-1')]);
        const ctx = makeCtx(panels, makeCurtainWallStore([CW_L0]));
        const cmd = new BulkUpdateCurtainPanelsCommand({
            scope: { kind: 'project' },
            change: { kind: 'type', panelType: 'SystemPanel_SpiderPointFix' }, // does not exist
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.reason).toContain('not a known curtain-panel type');
        expect(v.reason).toContain('SystemPanel_Glass');
        // Nothing changed.
        expect(panels.get('p-1')!.panelType).toBe('SystemPanel_Glass');
    });

    it('ONE undo reverts the whole batch (C16 §8.6)', () => {
        const panels = makePanelStore([panel('p-w1', 'cw-1'), panel('p-w2', 'cw-1')]);
        const ctx = makeCtx(panels, makeCurtainWallStore([CW_L0]));
        const cmd = new BulkUpdateCurtainPanelsCommand({
            scope: { kind: 'project' },
            change: { kind: 'type', panelType: 'SystemPanel_Opaque' },
        });
        cmd.execute(ctx);
        expect(panels.get('p-w1')!.panelType).toBe('SystemPanel_Opaque');
        const u = cmd.undo(ctx);
        expect(u.success).toBe(true);
        expect([...u.affectedElementIds].sort()).toEqual(['p-w1', 'p-w2']);
        expect(panels.get('p-w1')!.panelType).toBe('SystemPanel_Glass');
        expect(panels.get('p-w2')!.panelType).toBe('SystemPanel_Glass');
    });
});

describe('§RACORIENT145 — MATERIAL change (reuses resolveKitchenMaterialRef, C100 library)', () => {
    it('resolves an EXACT id from the founder\'s material picker and writes materialId, leaving panelType untouched', () => {
        const panels = makePanelStore([panel('p-1', 'cw-1', { panelType: 'SystemPanel_Opaque' })]);
        const ctx = makeCtx(panels, makeCurtainWallStore([CW_L0]));
        const cmd = new BulkUpdateCurtainPanelsCommand({
            scope: { kind: 'ids', panelIds: ['p-1'] },
            // 'wood-oak' → "Wood · Oak (Light)", one of the founder's own picker rows.
            change: { kind: 'material', materialRef: 'wood-oak' },
        });
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(panels.get('p-1')!.materialId).toBe('wood-oak');
        // The type was NOT touched by a material-only change.
        expect(panels.get('p-1')!.panelType).toBe('SystemPanel_Opaque');
    });

    it('an unresolvable material refuses, naming that it could not be found', () => {
        const panels = makePanelStore([panel('p-1', 'cw-1')]);
        const ctx = makeCtx(panels, makeCurtainWallStore([CW_L0]));
        const cmd = new BulkUpdateCurtainPanelsCommand({
            scope: { kind: 'project' },
            change: { kind: 'material', materialRef: 'unobtainium' },
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.reason).toContain("don't know a material called");
    });

    it('an AMBIGUOUS bare word ("marble" matches several library rows) refuses rather than flipping a coin', () => {
        // The library carries MULTIPLE marble rows (stone-marble-white,
        // stone-marble-carrara, stone-marble-nero-marquina, two marble tiles,
        // a marble-chip terrazzo…) — the SAME "smoked oak matched three rows"
        // shape §RACKITCHEN127's own test caught. A bare "marble" must refuse,
        // never guess which one the founder meant.
        const panels = makePanelStore([panel('p-1', 'cw-1')]);
        const ctx = makeCtx(panels, makeCurtainWallStore([CW_L0]));
        const cmd = new BulkUpdateCurtainPanelsCommand({
            scope: { kind: 'project' },
            change: { kind: 'material', materialRef: 'marble' },
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.reason).toContain("don't know a material called");
        // Nothing changed.
        expect(panels.get('p-1')!.materialId).toBeUndefined();
    });
});

describe('§RACORIENT145 — SCOPE: element / level / project', () => {
    it('level scope changes only that level\'s panels; a panel on another level is untouched', () => {
        const panels = makePanelStore([
            panel('p-l0-a', 'cw-1'),
            panel('p-l0-b', 'cw-1'),
            panel('p-l1', 'cw-2'),
        ]);
        const ctx = makeCtx(panels, makeCurtainWallStore([CW_L0, CW_L1]));
        const cmd = new BulkUpdateCurtainPanelsCommand({
            scope: { kind: 'level', levelId: 'L0' },
            change: { kind: 'type', panelType: 'SystemPanel_Opaque' },
        });
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect([...r.affectedElementIds].sort()).toEqual(['p-l0-a', 'p-l0-b']);
        expect(panels.get('p-l1')!.panelType).toBe('SystemPanel_Glass');
    });

    it('a panel whose HOST CURTAIN WALL no longer exists is EXCLUDED from a level scope by name, never classified', () => {
        const panels = makePanelStore([
            panel('p-l0', 'cw-1'),
            panel('p-orphan', 'cw-deleted'), // host vanished
        ]);
        const ctx = makeCtx(panels, makeCurtainWallStore([CW_L0])); // cw-deleted is NOT in the model
        const cmd = new BulkUpdateCurtainPanelsCommand({
            scope: { kind: 'level', levelId: 'L0' },
            change: { kind: 'type', panelType: 'SystemPanel_Opaque' },
        });
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds).toEqual(['p-l0']);
        // The orphaned panel is untouched, and its exclusion is NAMED in info.
        expect(panels.get('p-orphan')!.panelType).toBe('SystemPanel_Glass');
        expect(r.info!.some((line) => line.includes('host wall is no longer in the model'))).toBe(true);
    });

    it('project scope changes every panel regardless of level', () => {
        const panels = makePanelStore([panel('p-a', 'cw-1'), panel('p-b', 'cw-2')]);
        const ctx = makeCtx(panels, makeCurtainWallStore([CW_L0, CW_L1]));
        const cmd = new BulkUpdateCurtainPanelsCommand({
            scope: { kind: 'project' },
            change: { kind: 'type', panelType: 'SystemPanel_Opaque' },
        });
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect([...r.affectedElementIds].sort()).toEqual(['p-a', 'p-b']);
    });

    it('a ZERO-match scope is a visible honest no-op — never silent, never a throw', () => {
        const panels = makePanelStore([panel('p-1', 'cw-1')]);
        const ctx = makeCtx(panels, makeCurtainWallStore([CW_L0]));
        const cmd = new BulkUpdateCurtainPanelsCommand({
            scope: { kind: 'level', levelId: 'L9-does-not-exist' },
            change: { kind: 'type', panelType: 'SystemPanel_Opaque' },
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.reason).toContain('no curtain-wall panels on that level');
        expect(panels.get('p-1')!.panelType).toBe('SystemPanel_Glass');
    });

    it("an 'element' scope over a vanished panel declines with its own message", () => {
        const panels = makePanelStore([panel('p-1', 'cw-1')]);
        const ctx = makeCtx(panels, makeCurtainWallStore([CW_L0]));
        const cmd = new BulkUpdateCurtainPanelsCommand({
            scope: { kind: 'element', elementId: 'p-does-not-exist' },
            change: { kind: 'type', panelType: 'SystemPanel_Opaque' },
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.reason).toContain('was not found');
    });
});
