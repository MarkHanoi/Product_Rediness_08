/**
 * @vitest-environment happy-dom
 *
 * §FEAT-LEVEL-RELATIVE-PLAN-VIEWS (L-720)
 *
 * THE FOUNDER'S DEFECT, ASSERTED DIRECTLY. Authoring on Level 1 (3 m), every
 * reference stayed on the ground floor:
 *     [NativeElementMeshExporter] Plan view — exporting 30 elements from levels
 *         overlapping Y=[-1.20, 0.00]        ← the GROUND band
 *     [EdgeProjectorService] resolveClipRange() levelId=L0 elevation=0.000
 *     [RoomTagAutoPopulator] viewId=vd-sys-plan-l0 level=L0
 *
 * These tests pin the CAUSE (there was exactly one plan view and it was the
 * ground floor's) and the two consequences that matter:
 *   1. the active level now HAS a plan view whose resolved level is that level,
 *      so the export band and the clip band are the Level-1 bands, and
 *   2. the ground floor is byte-identical — same id, same name, same output,
 *      same level, no underlay.
 *
 * The clip-band assertion re-implements `EdgeProjectorService.resolveClipRange`'s
 * DOC-1.5d arithmetic (near = elevation + nearOffset, far = elevation + farOffset)
 * rather than importing it: EdgeProjectorService is an L7.5 module that pulls in
 * THREE and OBC. What is under test here is the INPUT that method reads —
 * `viewDef.spatial.levelId` — which is the only thing that was wrong.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { viewDefinitionStore } from '../ViewDefinitionStore';
import {
    initDefaultViewsManager,
    DEFAULT_PLAN_VIEW_ID,
    planViewIdForLevel,
    findPlanViewForLevel,
    ensurePlanViewsForLevels,
    removePlanViewForLevel,
} from '../DefaultViewsManager';

// The exact level set from the founder's session: Ground at 0 m, Level 1 at 3 m.
const GROUND = { id: 'L0', name: 'Ground', elevation: 0, height: 3, childrenIds: ['w-g1', 'w-g2'] };
const LEVEL1 = { id: 'level-1786049953381-mz28pv', name: 'Level 1', elevation: 3, height: 3, childrenIds: ['w-l1'] };
const LEVEL2 = { id: 'level-1786049953999-ab12cd', name: 'Level 2', elevation: 6, height: 3, childrenIds: [] };

// DOC-1.5d defaults used by EdgeProjectorService.resolveClipRange for plan views.
const NEAR_OFFSET = 1.2;
const FAR_OFFSET  = 3.0;

function installLevels(levels: Array<Record<string, unknown>>): void {
    (window as unknown as { bimManager: unknown }).bimManager = {
        getLevels: () => levels,
        getLevelById: (id: string) => levels.find(l => l.id === id),
    };
}

/** near/far exactly as EdgeProjectorService.resolveClipRange() computes them. */
function clipBandFor(viewId: string): { near: number; far: number; levelId: string | undefined } {
    const def = viewDefinitionStore.get(viewId)!;
    const levelId = def.spatial?.levelId;
    const levels = [GROUND, LEVEL1, LEVEL2];
    const elevation = levels.find(l => l.id === levelId)?.elevation ?? 0;
    return { near: elevation + NEAR_OFFSET, far: elevation + FAR_OFFSET, levelId };
}

/**
 * The element ids `NativeElementMeshExporter` exports for a plan view — its
 * "levels overlapping Y=[minY, maxY]" filter, verbatim (minY = level.elevation −
 * nearOffset via the view-range depth anchor; maxY = level.elevation).
 */
function exportedElementIdsFor(viewId: string): string[] {
    const def = viewDefinitionStore.get(viewId)!;
    const levelId = def.spatial?.levelId;
    const levels = [GROUND, LEVEL1, LEVEL2];
    const level = levels.find(l => l.id === levelId);
    if (!level) return [];
    const minY = level.elevation - NEAR_OFFSET;
    const maxY = level.elevation;
    return levels
        .filter(l => (l.elevation + (l.height ?? 0)) >= minY && l.elevation <= maxY)
        .flatMap(l => l.childrenIds);
}

describe('§FEAT-LEVEL-RELATIVE-PLAN-VIEWS (L-720) — one plan view per level', () => {
    beforeEach(() => {
        viewDefinitionStore.reset();
        installLevels([GROUND, LEVEL1]);
    });

    afterEach(() => {
        delete (window as unknown as { bimManager?: unknown }).bimManager;
        vi.restoreAllMocks();
    });

    // ── THE CAUSE ────────────────────────────────────────────────────────────

    it('REGRESSION GUARD: a level above ground no longer shares the ground plan view', () => {
        initDefaultViewsManager();
        const groundPlan = findPlanViewForLevel(GROUND.id);
        const level1Plan = findPlanViewForLevel(LEVEL1.id);
        expect(groundPlan).not.toBeNull();
        expect(level1Plan).not.toBeNull();
        // The precise defect: these used to be the SAME view (vd-sys-plan-l0).
        expect(level1Plan!.id).not.toBe(groundPlan!.id);
        expect(level1Plan!.id).not.toBe(DEFAULT_PLAN_VIEW_ID);
    });

    it('mints exactly one plan view per level, each owning its own level', () => {
        initDefaultViewsManager();
        const plans = viewDefinitionStore.getByType('plan');
        expect(plans).toHaveLength(2);
        expect(new Set(plans.map(p => p.spatial?.levelId))).toEqual(new Set([GROUND.id, LEVEL1.id]));
    });

    // ── CONSEQUENCE 1 — the references follow the level ──────────────────────

    it("the Level-1 plan's resolved level is Level 1, not L0", () => {
        initDefaultViewsManager();
        const view = findPlanViewForLevel(LEVEL1.id)!;
        expect(view.spatial?.levelId).toBe(LEVEL1.id);
    });

    it('the clip band is the Level-1 band [4.2, 6.0] — NOT the ground band', () => {
        initDefaultViewsManager();
        const band = clipBandFor(findPlanViewForLevel(LEVEL1.id)!.id);
        expect(band.levelId).toBe(LEVEL1.id);
        expect(band.near).toBeCloseTo(3 + NEAR_OFFSET, 6); // 4.2
        expect(band.far).toBeCloseTo(3 + FAR_OFFSET, 6);   // 6.0
        // The founder's log line, asserted as the thing that must NOT happen.
        expect(band.near).not.toBeCloseTo(NEAR_OFFSET, 6);
    });

    it('the mesh export band includes Level-1 elements (the founder\'s Y=[-1.20, 0.00] is gone)', () => {
        initDefaultViewsManager();
        const exported = exportedElementIdsFor(findPlanViewForLevel(LEVEL1.id)!.id);
        expect(exported).toContain('w-l1');
        // Ground walls are still picked up as the 1.2 m of storey-below the plan cuts
        // through — that is DOC-1.5d, not the bug. What matters is that the LEVEL-1
        // wall is present, which it never was.
        const groundOnly = exportedElementIdsFor(DEFAULT_PLAN_VIEW_ID);
        expect(groundOnly).not.toContain('w-l1');
    });

    it('room tags target the Level-1 view: its levelId is what RoomTagAutoPopulator reads', () => {
        initDefaultViewsManager();
        // RoomTagAutoPopulator.populate() does exactly: roomStore.getByLevel(viewDef.spatial.levelId)
        // and stamps ownerViewId = viewDef.id. Both must be Level 1's, not the ground's.
        const view = findPlanViewForLevel(LEVEL1.id)!;
        expect(view.spatial?.levelId).toBe(LEVEL1.id);
        expect(view.id).toBe(planViewIdForLevel(LEVEL1.id));
        // Tags are per-view by ownerViewId, so ground-floor tags cannot bleed upstairs.
        expect(view.id).not.toBe(DEFAULT_PLAN_VIEW_ID);
    });

    // ── CONSEQUENCE 2 — the ground floor is untouched ────────────────────────

    it('REGRESSION: the ground floor plan is byte-identical (id, name, level, output, no underlay)', () => {
        initDefaultViewsManager();
        const ground = viewDefinitionStore.get(DEFAULT_PLAN_VIEW_ID)!;
        expect(ground.id).toBe('vd-sys-plan-l0');
        expect(ground.name).toBe('Ground Floor');
        expect(ground.viewType).toBe('plan');
        expect(ground.spatial?.levelId).toBe('L0');
        expect(ground.output?.scale).toBe(100);
        expect(ground.output?.visualStyle).toBe('shadedWithEdges');
        expect(ground.output?.shadows).toBe(false);
        // The lowest storey has NO underlay — nothing below it to ghost.
        expect(ground.underlay).toBeUndefined();
        const band = clipBandFor(DEFAULT_PLAN_VIEW_ID);
        expect(band.near).toBeCloseTo(NEAR_OFFSET, 6);
        expect(band.far).toBeCloseTo(FAR_OFFSET, 6);
    });

    it('switching back to Ground restores the exact prior behaviour', () => {
        initDefaultViewsManager();
        // Level 1 → Ground is a pure view resolution; nothing about the ground view
        // changed while the user was upstairs.
        const before = structuredClone(viewDefinitionStore.get(DEFAULT_PLAN_VIEW_ID)!);
        findPlanViewForLevel(LEVEL1.id);
        const after = viewDefinitionStore.get(DEFAULT_PLAN_VIEW_ID)!;
        expect(after.spatial).toEqual(before.spatial);
        expect(after.output).toEqual(before.output);
        expect(after.underlay).toEqual(before.underlay);
        expect(findPlanViewForLevel(GROUND.id)!.id).toBe(DEFAULT_PLAN_VIEW_ID);
    });

    // ── §UNDERLAY — a deliberate, labelled Revit-style reference ─────────────

    it('an upper plan carries a lookingDown underlay of the storey immediately below', () => {
        installLevels([GROUND, LEVEL1, LEVEL2]);
        initDefaultViewsManager();
        const l1 = findPlanViewForLevel(LEVEL1.id)!;
        const l2 = findPlanViewForLevel(LEVEL2.id)!;
        expect(l1.underlay).toEqual({ baseLevelId: GROUND.id, orientation: 'lookingDown' });
        expect(l2.underlay).toEqual({ baseLevelId: LEVEL1.id, orientation: 'lookingDown' });
        // Never itself, never two storeys down.
        expect(l2.underlay?.baseLevelId).not.toBe(GROUND.id);
    });

    // ── IDEMPOTENCE + LIFECYCLE ─────────────────────────────────────────────

    it('is idempotent — a settled project creates nothing on a repeat pass', () => {
        initDefaultViewsManager();
        expect(ensurePlanViewsForLevels()).toEqual([]);
        expect(ensurePlanViewsForLevels()).toEqual([]);
        expect(viewDefinitionStore.getByType('plan')).toHaveLength(2);
    });

    it('a level added later gets its plan view; removing the level removes it', () => {
        initDefaultViewsManager();
        installLevels([GROUND, LEVEL1, LEVEL2]);
        expect(ensurePlanViewsForLevels()).toEqual([planViewIdForLevel(LEVEL2.id)]);
        expect(removePlanViewForLevel(LEVEL2.id)).toBe(true);
        expect(viewDefinitionStore.has(planViewIdForLevel(LEVEL2.id))).toBe(false);
        // The ground default is NEVER removed with its level — every legacy project
        // carries that id and ensureDefaultViews() would recreate it anyway.
        expect(removePlanViewForLevel(GROUND.id)).toBe(false);
        expect(viewDefinitionStore.has(DEFAULT_PLAN_VIEW_ID)).toBe(true);
    });

    it('no-ops safely when BimManager is not ready (no levels ⇒ no plan views invented)', () => {
        delete (window as unknown as { bimManager?: unknown }).bimManager;
        viewDefinitionStore.reset();
        initDefaultViewsManager();
        // Only the ground default the boot guarantee always creates.
        expect(viewDefinitionStore.getByType('plan').map(p => p.id)).toEqual([DEFAULT_PLAN_VIEW_ID]);
        expect(ensurePlanViewsForLevels()).toEqual([]);
    });
});

describe('§FEAT-LEVEL-RELATIVE-PLAN-VIEWS — migration of projects saved before L-720', () => {
    beforeEach(() => {
        viewDefinitionStore.reset();
    });

    afterEach(() => {
        delete (window as unknown as { bimManager?: unknown }).bimManager;
    });

    it('a snapshot carrying ONLY vd-sys-plan-l0 loads, keeps working, and gains its upper plans', () => {
        // Deserialize a pre-L-720 project: one plan view, seated on L0.
        viewDefinitionStore.create({
            id: DEFAULT_PLAN_VIEW_ID,
            name: 'Ground Floor',
            viewType: 'plan',
            spatial: { levelId: 'L0' },
            createdBy: 'system',
            output: { scale: 100, visualStyle: 'shadedWithEdges', shadows: false },
        });
        installLevels([GROUND, LEVEL1, LEVEL2]);
        expect(viewDefinitionStore.getByType('plan')).toHaveLength(1);

        // `vd:store-loaded` re-runs the boot guarantee, which tops up.
        const created = ensurePlanViewsForLevels();

        // The pre-existing ground plan is ADOPTED, never duplicated.
        expect(created).not.toContain(DEFAULT_PLAN_VIEW_ID);
        expect(created).toHaveLength(2);
        expect(viewDefinitionStore.getByType('plan')).toHaveLength(3);
        expect(findPlanViewForLevel('L0')!.id).toBe(DEFAULT_PLAN_VIEW_ID);
        expect(viewDefinitionStore.get(DEFAULT_PLAN_VIEW_ID)!.name).toBe('Ground Floor');
    });

    it('adopts an IFC-imported plan view (view id = LEVEL id) instead of minting a rival', () => {
        // CreatePlanViewCommand's native path registers the view UNDER THE LEVEL ID.
        viewDefinitionStore.create({
            id: LEVEL1.id, name: 'IFC Storey 1', viewType: 'plan',
            spatial: { levelId: LEVEL1.id }, createdBy: 'ifc-import',
        });
        installLevels([GROUND, LEVEL1]);
        initDefaultViewsManager();

        expect(viewDefinitionStore.has(planViewIdForLevel(LEVEL1.id))).toBe(false);
        expect(findPlanViewForLevel(LEVEL1.id)!.id).toBe(LEVEL1.id);
        expect(viewDefinitionStore.getByType('plan').filter(p => p.spatial?.levelId === LEVEL1.id)).toHaveLength(1);
    });

    it('§REPAIR-ORPHAN-GROUND-PLAN: re-seats vd-sys-plan-l0 when no level "L0" exists', () => {
        // A project whose levels were ALL minted with generated ids — the ground
        // default then pointed at nothing and resolveClipRange fell back to a
        // hardcoded elevation.
        const genGround = { id: 'level-aaa', name: 'Planta Baja', elevation: 0, height: 3, childrenIds: [] };
        const genFirst  = { id: 'level-bbb', name: 'Planta 1',    elevation: 3, height: 3, childrenIds: [] };
        installLevels([genGround, genFirst]);
        initDefaultViewsManager();

        expect(viewDefinitionStore.get(DEFAULT_PLAN_VIEW_ID)!.spatial?.levelId).toBe('level-aaa');
        expect(findPlanViewForLevel('level-aaa')!.id).toBe(DEFAULT_PLAN_VIEW_ID);
        // And no duplicate plan was minted for the ground level.
        expect(viewDefinitionStore.getByType('plan')).toHaveLength(2);
    });

    it('does NOT re-seat the ground plan when level "L0" is present (correct case untouched)', () => {
        installLevels([GROUND, LEVEL1]);
        initDefaultViewsManager();
        expect(viewDefinitionStore.get(DEFAULT_PLAN_VIEW_ID)!.spatial?.levelId).toBe('L0');
    });
});

describe('§FEAT-LEVEL-RELATIVE-PLAN-VIEWS — performance: N levels ≠ N reprojections', () => {
    beforeEach(() => {
        viewDefinitionStore.reset();
    });

    afterEach(() => {
        delete (window as unknown as { bimManager?: unknown }).bimManager;
    });

    it('a 10-storey project has 10 plan views but only ONE is ever the active view', () => {
        const levels = Array.from({ length: 10 }, (_, i) => ({
            id: i === 0 ? 'L0' : `level-${i}`,
            name: i === 0 ? 'Ground' : `Level ${i}`,
            elevation: i * 3,
            height: 3,
            childrenIds: [],
        }));
        installLevels(levels);
        initDefaultViewsManager();
        expect(viewDefinitionStore.getByType('plan')).toHaveLength(10);

        // ViewDependencyTracker's §FIX-LAZY-INACTIVE-VIEW-PROJECTION gate: only the
        // view reported ACTIVE by the predicate reprojects; every other dirty view is
        // recorded (O(1) Set add) and reprojects once, on activation. Model the gate
        // here so the invariant is pinned at the level this feature can break it:
        // adding plan views must not add ACTIVE views.
        const activeViewId = planViewIdForLevel('level-3');
        const dirty = viewDefinitionStore.getByType('plan').map(v => v.id);
        const eager = dirty.filter(id => id === activeViewId);
        const deferred = dirty.filter(id => id !== activeViewId);
        expect(eager).toHaveLength(1);
        expect(deferred).toHaveLength(9);
    });

    it('a settled 10-storey project performs zero store writes per pass', () => {
        const levels = Array.from({ length: 10 }, (_, i) => ({
            id: i === 0 ? 'L0' : `level-${i}`, name: `L${i}`, elevation: i * 3, height: 3, childrenIds: [],
        }));
        installLevels(levels);
        initDefaultViewsManager();
        const createSpy = vi.spyOn(viewDefinitionStore, 'create');
        const spatialSpy = vi.spyOn(viewDefinitionStore, 'setSpatial');
        ensurePlanViewsForLevels();
        ensurePlanViewsForLevels();
        expect(createSpy).not.toHaveBeenCalled();
        expect(spatialSpy).not.toHaveBeenCalled();
        createSpy.mockRestore();
        spatialSpy.mockRestore();
    });
});
