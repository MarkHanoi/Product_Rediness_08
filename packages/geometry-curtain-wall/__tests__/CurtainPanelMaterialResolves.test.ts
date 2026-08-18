// CurtainPanelMaterialResolves.test.ts
// §FEAT-CURTAIN-WALL-PANEL-MATERIAL (L-958 Slice B) — the panel path, proven at the
// layer that DECIDES a panel's colour.
//
// WHAT WAS WRONG. `_getPanelMaterial(panelType)` took the panel type and nothing else,
// deriving every panel's appearance from `PANEL_TYPE_DEFAULTS`. No material reference —
// per-panel or per-wall — could reach a rendered panel, whatever any bridge forwarded.
// That was a signature-level impossibility, not a missing field, which is why the earlier
// diagnosis ("the create bridge drops per-panel material") pointed at a real gap that was
// nonetheless not the cause: fixing the bridge alone would have changed nothing on screen.
//
// WHAT IS PROVEN HERE. That a panel carrying `materialId` renders with the RESOLVED
// master-catalogue material rather than its panelType default. A test asserting only that
// the field round-trips through a store would prove nothing — storing a value no renderer
// consults is precisely how this shipped as "no published type catalogue" for so long.
//
// ⚠ NO FAKE MATERIAL LIBRARY. The map is built from the REAL
// `STANDARD_MATERIAL_LIBRARY` exactly as production builds it (`initUI.ts:2241`), because
// a hand-rolled fake is how Slice A's silent no-op survived review: that suite's fake
// store exposed BOTH `get` and `getById` while the real store has only `get`, so the fake
// was more capable than its subject and the branch bailed on every real wall while the
// spec stayed green. The specific hazard here is `transparent`/`opacity`: the real
// projection sets those keys ONLY on rows that declare them (`materialLibrary.ts`
// `project()`), so a fake that always set them would hide the opaque-stone path entirely
// — the single most important case the founder asked for.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';
import { CurtainWallInstanceManager } from '../src/CurtainWallInstanceManager';
import { CurtainCell } from '../src/CurtainCellComputer';
import { CurtainPanelData, PanelType, PANEL_TYPE_DEFAULTS } from '../src/CurtainPanelTypes';

/** The production map, built the way `initUI.ts:2241` builds it. */
function productionMaterialMap() {
    return new Map(STANDARD_MATERIAL_LIBRARY.map(m => [m.id, m] as const));
}

function makeCell(i: number, j: number): CurtainCell {
    const x0 = i, x1 = i + 1, y0 = j, y1 = j + 1;
    return {
        i, j,
        corners: [
            new THREE.Vector3(x0, y0, 0),
            new THREE.Vector3(x1, y0, 0),
            new THREE.Vector3(x1, y1, 0),
            new THREE.Vector3(x0, y1, 0),
        ],
        u0: 0, u1: 1, v0: 0, v1: 1,
        width: 1, height: 1,
    };
}

function makePanel(
    id: string, i: number, j: number, panelType: PanelType, materialId?: string,
): CurtainPanelData {
    return {
        id,
        type: 'curtain-panel',
        curtainWallId: 'w',
        cellIndex: [i, j],
        panelType,
        ...(materialId !== undefined ? { materialId } : {}),
    } as CurtainPanelData;
}

/** Build one wall's panels and return the InstancedMeshes produced. */
function build(mgr: CurtainWallInstanceManager, panels: CurtainPanelData[]) {
    const cells = panels.map(p => makeCell(p.cellIndex[0], p.cellIndex[1]));
    return mgr.buildInstancedMeshes(cells, panels, 0.05, 0.024).instancedMeshes;
}

function hexOf(mesh: THREE.InstancedMesh): string {
    return `#${(mesh.material as THREE.MeshStandardMaterial).color.getHexString()}`;
}

// The rows under test, quoted from `packages/schemas/src/materials/materialCatalog.ts`
// so a drift in the catalogue fails HERE rather than silently changing a facade.
const MARBLE = { id: 'stone-marble-carrara', color: '#f2f0eb', roughness: 0.1 };
const PRECAST = { id: 'concrete-precast', color: '#d0d0ca', roughness: 0.75 };
const ZELLIGE = { id: 'tile-zellige-green', color: '#1f735c' };
const REFLECTIVE = { id: 'glass-reflective', color: '#dae7f3', opacity: 0.55 };

describe('§FEAT-CURTAIN-WALL-PANEL-MATERIAL — a panel materialId must reach the rendered material', () => {
    it('THE CLAIM: a panel with materialId renders the MASTER row, not the panelType default', () => {
        const mgr = new CurtainWallInstanceManager(productionMaterialMap());

        // Deliberately a GLASS panel type carrying a STONE material. If the panelType
        // still decided, this would render `PANEL_TYPE_DEFAULTS.SystemPanel_Glass`
        // (0x88ccff, transparent) — the exact appearance the founder reported for
        // everything. The material must win.
        const [mesh] = build(mgr, [makePanel('p1', 0, 0, 'SystemPanel_Glass', MARBLE.id)]);

        expect(hexOf(mesh)).toBe(MARBLE.color);
        expect(hexOf(mesh)).not.toBe('#88ccff');

        const mat = mesh.material as THREE.MeshStandardMaterial;
        // Not just the hue: a material carries the properties a hex cannot, which is why
        // C100 §2.1 forbids a hex as a material's home.
        expect(mat.roughness).toBe(MARBLE.roughness);
    });

    it('an OPAQUE material stays opaque — no glass invariants are forced onto panels', () => {
        // `_getFallbackPanelMaterial` re-asserts `transparent: true` + DoubleSide because
        // it only ever renders glazing. Copying that shape into the panel path would make
        // every stone, concrete and ceramic panel a ghost. This is that guard.
        const mgr = new CurtainWallInstanceManager(productionMaterialMap());
        const [mesh] = build(mgr, [makePanel('p1', 0, 0, 'SystemPanel_Glass', PRECAST.id)]);

        const mat = mesh.material as THREE.MeshStandardMaterial;
        expect(hexOf(mesh)).toBe(PRECAST.color);
        expect(mat.transparent).toBeFalsy();
        expect(mat.side).toBe(THREE.FrontSide);
        // And the panelType default it REPLACED genuinely was transparent, so this
        // assertion cannot pass by the two happening to agree.
        expect(PANEL_TYPE_DEFAULTS.SystemPanel_Glass.transparent).toBe(true);
    });

    it('a TRANSPARENT material keeps its transparency and both faces', () => {
        const mgr = new CurtainWallInstanceManager(productionMaterialMap());
        const [mesh] = build(mgr, [makePanel('p1', 0, 0, 'SystemPanel_Opaque', REFLECTIVE.id)]);

        const mat = mesh.material as THREE.MeshStandardMaterial;
        expect(hexOf(mesh)).toBe(REFLECTIVE.color);
        expect(mat.transparent).toBe(true);
        expect(mat.opacity).toBe(REFLECTIVE.opacity);
        expect(mat.side).toBe(THREE.DoubleSide);
    });

    it('DIFFERENT materials do NOT collapse into one InstancedMesh (first-one-wins guard)', () => {
        // An InstancedMesh shares ONE material by construction. Grouping by panelType
        // alone would put a marble spandrel and a zellige panel in one mesh and silently
        // render both with whichever material was resolved first — a facade that reports
        // success and shows one material, which is the bug this slice removes.
        const mgr = new CurtainWallInstanceManager(productionMaterialMap());
        const meshes = build(mgr, [
            makePanel('p1', 0, 0, 'SystemPanel_Glass', MARBLE.id),
            makePanel('p2', 1, 0, 'SystemPanel_Glass', ZELLIGE.id),
        ]);

        expect(meshes).toHaveLength(2);
        const hexes = meshes.map(hexOf).sort();
        expect(hexes).toEqual([ZELLIGE.color, MARBLE.color].sort());
    });

    it('the SAME material still batches into ONE mesh sharing ONE material (§L-312B intact)', () => {
        // The performance property that must survive: a spandrel band of N identical
        // panels is the common case. If adding materials cost a draw call per panel this
        // would be a regression dressed as a feature.
        const mgr = new CurtainWallInstanceManager(productionMaterialMap());
        const meshes = build(mgr, [
            makePanel('p1', 0, 0, 'SystemPanel_Glass', MARBLE.id),
            makePanel('p2', 1, 0, 'SystemPanel_Glass', MARBLE.id),
            makePanel('p3', 2, 0, 'SystemPanel_Glass', MARBLE.id),
        ]);

        expect(meshes).toHaveLength(1);
        expect(meshes[0].count).toBe(3);
    });

    it('an UNKNOWN materialId falls back to the panelType default — never black, never a throw', () => {
        // A miss must degrade to the previous behaviour. Rendering black or throwing
        // mid-frame would turn a typo in a catalogue row into a broken facade.
        const mgr = new CurtainWallInstanceManager(productionMaterialMap());
        const [mesh] = build(mgr, [makePanel('p1', 0, 0, 'SystemPanel_Glass', 'not-a-real-material')]);

        expect(hexOf(mesh)).toBe('#88ccff');
        expect((mesh.material as THREE.MeshStandardMaterial).transparent).toBe(true);
    });

    it('with NO library injected, behaviour is exactly what it was before this slice', () => {
        // Headless hosts and any consumer without the renderer library. The panel path
        // must not become dependent on a map it might not get.
        const mgr = new CurtainWallInstanceManager();
        const [mesh] = build(mgr, [makePanel('p1', 0, 0, 'SystemPanel_Glass', MARBLE.id)]);

        expect(hexOf(mesh)).toBe('#88ccff');
    });

    it('materialOverride is UNTOUCHED and still routes to the individual-mesh path', () => {
        // C100 forbids a hex as a material's HOME; it does not forbid an authored tint.
        // Slice B adds a sibling field and changes nothing about this one.
        const mgr = new CurtainWallInstanceManager(productionMaterialMap());
        const panel = makePanel('p1', 0, 0, 'SystemPanel_Glass');
        (panel as { materialOverride?: string }).materialOverride = '#ff0000';

        const cells = [makeCell(0, 0)];
        const { instancedMeshes, overridePanelIds } =
            mgr.buildInstancedMeshes(cells, [panel], 0.05, 0.024);

        expect(instancedMeshes).toHaveLength(0);
        expect(overridePanelIds).toEqual(['p1']);
    });
});
