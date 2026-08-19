/**
 * §AUDIT-UNSATISFIABLE-COUNTERS (L-1202) — every scene counter in this audit must be
 * satisfiable BY A SHAPE PRODUCTION ACTUALLY EMITS.
 *
 * THE FINDING THIS SUITE PINS. Two of the audit's three import counters keyed on
 * markers that exist nowhere outside the audit's own tests:
 *
 *   underlay (L-1197) — `name.startsWith('FloorPlanUnderlay') || ud.isFloorPlanUnderlay`
 *                       vs the real `FloorPlanUnderlayTool.create()` stamp
 *                       `{ id, type:'floor_plan_underlay', isUnderlay:true, … }`, no name.
 *   ifc      (L-1202) — `isIfcGroup || isIFCModel || ifcModelId`
 *                       vs the real `IfcGeometryRenderer` stamp
 *                       `{ modelId, name, source:'ifc-import' }`.
 *   dxf               — `isDxfOverlay || dxfId`. `DxfGeometryBuilder.ts:52` really does
 *                       set `isDxfOverlay: true`. This one was always live, and it is
 *                       included below as the POSITIVE CONTROL: without it, a suite that
 *                       only asserts the two repairs cannot tell "the arms work" from
 *                       "the assertions were written to match whatever the code does".
 *
 * ⛔ THE FIXTURES BELOW ARE COPIED FROM THE PRODUCERS, NOT FROM THE DETECTOR. A fixture
 * derived from the thing under test cannot falsify it — that is precisely how both dead
 * counters passed their own suites for months ([[fake-more-capable-than-real]]). Each
 * carries the producing file:line so a rename breaks this suite rather than silently
 * restoring the blindness.
 */

import { describe, it, expect } from 'vitest';
import { detectLeaks, type AuditInput } from './ProjectIsolationAudit';

const PROJECT = 'proj-B';

function input(sceneObjects: AuditInput['sceneObjects']): AuditInput {
    return {
        projectId: PROJECT,
        expectedIds: new Set<string>(),
        sceneObjects,
        storeElements: [],
        globals: [],
        scopeProbes: [],
        declaredScopes: [],
    };
}

function surfaces(report: ReturnType<typeof detectLeaks>): string[] {
    return (report?.findings ?? []).map(f => f.surface);
}

// ── Fixtures: verbatim from the PRODUCERS ─────────────────────────────────────

/** packages/input-host/src/FloorPlanUnderlayTool.ts:114–124 — note: NO `name`. */
const REAL_UNDERLAY_MESH = {
    type: 'Mesh',
    isRoot: true,
    userData: {
        id: 'underlay-ab12cd34-lz9',
        type: 'floor_plan_underlay',
        isUnderlay: true,
        isNonBIM: true,
        pxPerMeter: 2.23,
        widthPx: 893,
        heightPx: 893,
    },
};

/** packages/file-format/src/import/ifc/IfcGeometryRenderer.ts:66 — the model ROOT. */
const REAL_IFC_GROUP_ROOT = {
    type: 'Group',
    name: 'Imported IFC: tower.ifc',
    isRoot: true,
    userData: { modelId: 'ifc-1', name: 'tower.ifc', source: 'ifc-import' },
};

/** IfcGeometryRenderer.ts:185–205 — a MESH inside that group. Must NOT inflate the count. */
const REAL_IFC_CHILD_MESH = {
    type: 'Mesh',
    isRoot: false,
    attributedByAncestor: true,
    userData: {
        id: 'ifc-4711',
        expressID: 4711,
        modelId: 'ifc-1',
        source: 'ifc-import',
        elementType: 'ifcwall',
    },
};

/** packages/file-format/src/import/dxf/DxfGeometryBuilder.ts:52 — the POSITIVE CONTROL. */
const REAL_DXF_OVERLAY = {
    type: 'Group',
    isRoot: true,
    userData: { isDxfOverlay: true },
};

describe('§AUDIT-UNSATISFIABLE-COUNTERS — the counters must fire on REAL producer shapes', () => {
    it('POSITIVE CONTROL: the DXF arm fires on DxfGeometryBuilder output', () => {
        expect(surfaces(detectLeaks(input([REAL_DXF_OVERLAY])))).toContain('scene.dxf');
    });

    it('L-1197: the UNDERLAY arm fires on FloorPlanUnderlayTool output', () => {
        // Pre-fix this returned null — the mesh has no `name` and no `isFloorPlanUnderlay`.
        expect(surfaces(detectLeaks(input([REAL_UNDERLAY_MESH])))).toContain('scene.underlay');
    });

    it('L-1202: the IFC arm fires on IfcGeometryRenderer output', () => {
        // Pre-fix this returned null — the group stamps `modelId`, never `ifcModelId`.
        expect(surfaces(detectLeaks(input([REAL_IFC_GROUP_ROOT])))).toContain('scene.ifc');
    });

    it('L-1202: an IFC model counts ONCE, not once per mesh inside it', () => {
        const report = detectLeaks(input([
            REAL_IFC_GROUP_ROOT,
            REAL_IFC_CHILD_MESH, REAL_IFC_CHILD_MESH, REAL_IFC_CHILD_MESH,
        ]));
        const ifc = (report?.findings ?? []).find(f => f.surface === 'scene.ifc');
        expect(ifc?.count).toBe(1);
    });
});

describe('§AUDIT-UNSATISFIABLE-COUNTERS — attribution, so a clean load stays clean', () => {
    it("does NOT report this project's own restored underlay", () => {
        const owned = {
            ...REAL_UNDERLAY_MESH,
            userData: { ...REAL_UNDERLAY_MESH.userData, projectId: PROJECT },
        };
        expect(surfaces(detectLeaks(input([owned])))).not.toContain('scene.underlay');
    });

    it("does NOT report this project's own IFC import, but DOES report the previous project's", () => {
        const mine = {
            ...REAL_IFC_GROUP_ROOT,
            userData: { ...REAL_IFC_GROUP_ROOT.userData, projectId: PROJECT },
        };
        expect(surfaces(detectLeaks(input([mine])))).not.toContain('scene.ifc');

        const theirs = {
            ...REAL_IFC_GROUP_ROOT,
            userData: { ...REAL_IFC_GROUP_ROOT.userData, projectId: 'proj-A' },
        };
        expect(surfaces(detectLeaks(input([theirs])))).toContain('scene.ifc');
    });

    it('an EMPTY scene is still clean — the arms did not become unconditional', () => {
        expect(detectLeaks(input([]))).toBeNull();
    });
});
