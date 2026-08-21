/**
 * @vitest-environment happy-dom
 *
 * §ELEV-SCOPE-FRAME (L-1854) — THE REACHABILITY HALF.
 *
 * Swapping the two rows in `DEFAULT_ELEVATION_VIEWS` fixes East/West for projects
 * that DO NOT EXIST YET, and for nothing else: `ensureDefaultViews()` creates each
 * elevation only `if (!viewDefinitionStore.has(elev.id))`, and
 * `_ensureElevationMarksForPlanView()` skips any mark that already exists. The
 * founder's live project already holds `vd-sys-elev-east` pointing `(+1,0,0)` with
 * its mark at `x = -24`. Without a migration the seed fix reaches him NEVER.
 * ([committed-is-not-reachable] — prove it at the layer the user experiences.)
 *
 * This file drives that migration against a project deliberately seeded with the
 * OLD, WRONG orientation, which is the only state that matters.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { viewDefinitionStore } from '../ViewDefinitionStore';
import {
    initDefaultViewsManager,
    DEFAULT_PLAN_VIEW_ID,
    DEFAULT_ELEVATION_VIEWS,
} from '../DefaultViewsManager';

const RADIUS = 24; // ELEV_MARK_RADIUS_M

interface FakeAnn { id: string; type: string; ownerViewId: string; parameters: any; geometry2D: any }

class FakeAnnotationStore {
    private _data = new Map<string, FakeAnn>();
    add(el: FakeAnn): void { if (!this._data.has(el.id)) this._data.set(el.id, el); }
    has(id: string): boolean { return this._data.has(id); }
    remove(id: string): void { this._data.delete(id); }
    getAll(): FakeAnn[] { return [...this._data.values()]; }
    getByType(type: string): FakeAnn[] { return this.getAll().filter(a => a.type === type); }
}

const EAST = DEFAULT_ELEVATION_VIEWS.find(v => v.name === 'East Elevation')!;
const WEST = DEFAULT_ELEVATION_VIEWS.find(v => v.name === 'West Elevation')!;

/** The orientation the seed table used to produce: East = +X, West = -X. */
const LEGACY = {
    [EAST.id]: { x: 1, y: 0, z: 0 },
    [WEST.id]: { x: -1, y: 0, z: 0 },
} as Record<string, { x: number; y: number; z: number }>;

/**
 * Stand up a project in the PRE-FIX state: the four default elevations exist, but
 * East/West carry the swapped direction, and their marks sit at the position that
 * direction seeded.
 */
function seedLegacyProject(anns: FakeAnnotationStore, opts?: { moveEastMarkTo?: { x: number; y: number; z: number } }): void {
    viewDefinitionStore.create({
        id: DEFAULT_PLAN_VIEW_ID, name: 'Ground Floor', viewType: 'plan',
        spatial: { levelId: 'L0' }, createdBy: 'system',
    } as any);

    for (const elev of DEFAULT_ELEVATION_VIEWS) {
        if (!viewDefinitionStore.has(elev.id)) {
            viewDefinitionStore.create({
                id: elev.id, name: elev.name, viewType: 'elevation',
                spatial: {}, createdBy: 'system',
            } as any);
        }
    }

    // ⚠ initDefaultViewsManager() registers MODULE-LEVEL `vd:view-created` listeners that
    // outlive a test. Once any earlier test has called it, the `create()` calls above
    // already ran the guarantee (and the repair) for this fresh store. So the fixture
    // asserts itself LAST and overwrites whatever that produced — otherwise the "legacy"
    // project under test would silently be a CORRECT one and every assertion below would
    // pass for the wrong reason.
    for (const elev of DEFAULT_ELEVATION_VIEWS) {
        const dir = LEGACY[elev.id] ?? { x: elev.dir.x, y: elev.dir.y, z: elev.dir.z };
        viewDefinitionStore.update(elev.id, { spatial: { projectionDirection: dir } });

        const seeded = { x: -dir.x * RADIUS, y: 0, z: -dir.z * RADIUS };
        const position = (elev.id === EAST.id && opts?.moveEastMarkTo) ? opts.moveEastMarkTo : seeded;
        for (const stale of anns.getByType('elevation-mark')) {
            if (stale.parameters?.linkedViewId === elev.id) anns.remove(stale.id);
        }
        anns.add({
            id: elev.markId, type: 'elevation-mark', ownerViewId: DEFAULT_PLAN_VIEW_ID,
            geometry2D: { modelPoints: [position, { x: position.x + dir.x, y: position.y, z: position.z + dir.z }], offset: 0 },
            parameters: { linkedViewId: elev.id, position, facingDirection: dir },
        });
    }
}

describe('§ELEV-SCOPE-FRAME (L-1854) — repairing a project seeded with swapped East/West', () => {
    let anns: FakeAnnotationStore;

    beforeEach(() => {
        viewDefinitionStore.reset();
        anns = new FakeAnnotationStore();
        (window as any).annotationStore = anns;
    });

    it('the legacy seed really is wrong — guards the fixture itself', () => {
        seedLegacyProject(anns);
        expect(viewDefinitionStore.get(EAST.id)!.spatial.projectionDirection).toEqual({ x: 1, y: 0, z: 0 });
        expect(EAST.dir).toEqual({ x: -1, y: 0, z: 0 }); // the table now disagrees with it
    });

    it('re-points the stale VIEW direction for East and West', () => {
        seedLegacyProject(anns);
        initDefaultViewsManager();

        expect(viewDefinitionStore.get(EAST.id)!.spatial.projectionDirection)
            .toEqual({ x: EAST.dir.x, y: EAST.dir.y, z: EAST.dir.z });
        expect(viewDefinitionStore.get(WEST.id)!.spatial.projectionDirection)
            .toEqual({ x: WEST.dir.x, y: WEST.dir.y, z: WEST.dir.z });
    });

    it('leaves North and South alone — they were never wrong', () => {
        seedLegacyProject(anns);
        const beforeN = { ...viewDefinitionStore.get('vd-sys-elev-north')!.spatial.projectionDirection! };
        initDefaultViewsManager();
        expect(viewDefinitionStore.get('vd-sys-elev-north')!.spatial.projectionDirection).toEqual(beforeN);
    });

    it('re-seeds an UNTOUCHED mark: facing AND anchor both move to the correct side', () => {
        seedLegacyProject(anns);
        const before = anns.getAll().find(m => m.id === EAST.markId)!;
        expect(before.parameters.position.x).toBe(-RADIUS);   // legacy: mark sat WEST of origin

        initDefaultViewsManager();

        const after = anns.getAll().find(m => m.id === EAST.markId)!;
        expect(after.parameters.facingDirection).toEqual({ x: EAST.dir.x, y: 0, z: EAST.dir.z });
        // East elevation is viewed FROM the east: the mark must now sit at +24 on X.
        expect(after.parameters.position.x).toBe(RADIUS);
        expect(after.parameters.position.z).toBe(-0);
        expect(after.geometry2D.modelPoints[0]).toEqual(after.parameters.position);
    });

    it('a mark the USER MOVED keeps its anchor; only the facing is corrected', () => {
        const moved = { x: 3.5, y: 0, z: -1.25 };
        seedLegacyProject(anns, { moveEastMarkTo: moved });

        initDefaultViewsManager();

        const after = anns.getAll().find(m => m.id === EAST.markId)!;
        expect(after.parameters.facingDirection).toEqual({ x: EAST.dir.x, y: 0, z: EAST.dir.z });
        expect(after.parameters.position).toEqual(moved);              // ⭐ user intent preserved
        expect(after.geometry2D.modelPoints[0]).toEqual(moved);
        // the arrow endpoint is re-derived from the CORRECTED facing, not the old one
        expect(after.geometry2D.modelPoints[1].x).toBeCloseTo(moved.x + EAST.dir.x, 6);
    });

    it('is idempotent — a second pass writes nothing and duplicates nothing', () => {
        seedLegacyProject(anns);
        initDefaultViewsManager();
        const first = JSON.stringify(anns.getByType('elevation-mark').map(m => m.parameters).sort());

        initDefaultViewsManager();

        expect(anns.getByType('elevation-mark')).toHaveLength(4);
        expect(JSON.stringify(anns.getByType('elevation-mark').map(m => m.parameters).sort())).toBe(first);
    });

    it('a fresh project needs no repair and gets the correct orientation directly', () => {
        initDefaultViewsManager();
        for (const elev of DEFAULT_ELEVATION_VIEWS) {
            expect(viewDefinitionStore.get(elev.id)!.spatial.projectionDirection)
                .toEqual({ x: elev.dir.x, y: elev.dir.y, z: elev.dir.z });
            const mark = anns.getAll().find(m => m.id === elev.markId)!;
            expect(mark.parameters.facingDirection).toEqual({ x: elev.dir.x, y: 0, z: elev.dir.z });
        }
        // and the four still point four distinct ways
        const dirs = anns.getByType('elevation-mark')
            .map(m => `${m.parameters.facingDirection.x},${m.parameters.facingDirection.z}`);
        expect(new Set(dirs).size).toBe(4);
    });
});
