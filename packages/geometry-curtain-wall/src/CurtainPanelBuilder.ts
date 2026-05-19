/**
 * CurtainPanelBuilder
 *
 * Thin façade over `CurtainPanelFactory.buildPanelObject()` — kept for
 * backward compatibility with the rest of the curtain wall pipeline.
 *
 * ## Role in the Pipeline
 *
 *   CurtainWallBuilder.build()
 *     → computeCurtainCells()                 (CurtainCellComputer)
 *     → CurtainWallInstanceManager            (batches uniform flat panels)
 *     → CurtainPanelBuilder.buildPanelMesh()  (delegates to CurtainPanelFactory
 *                                              for non-batchable / override
 *                                              / LOD-400 panels)
 *
 * All panel geometry — including the LOD-400 systems (spider glass, wood
 * louvres, rattan arch, arched glass) — now lives in CurtainPanelFactory.
 *
 * ## SelectionManager Integration
 *
 * The factory stamps `userData.elementId / elementType / curtainWallId /
 * cellIndex / panelType / isSubElement` on every returned root Object3D, so
 * SelectionManager.performSelection() resolves clicks correctly without any
 * change to the existing selection contract.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { CurtainCell } from './CurtainCellComputer';
import { CurtainPanelData } from './CurtainPanelTypes';
import { buildPanelObject } from './CurtainPanelFactory';

export class CurtainPanelBuilder {
    /**
     * Build a panel Object3D from a cell and its semantic data.
     *
     * Returns null for SystemPanel_Empty (no mesh rendered).
     * Returns whatever the panel-type factory produces:
     *   - Mesh   for flat panels (Glass / Opaque)
     *   - Group  for composite panels (Door + the four wooden-slat systems:
     *            SlatsVerticalFramed, SlatsVerticalDense, SlatsVerticalOpen,
     *            SlatsHorizontal)
     *
     * The result is positioned in the curtain wall's LOCAL coordinate system;
     * the caller must add it to the curtain wall's root group.
     */
    buildPanelMesh(
        cell: CurtainCell,
        panelData: CurtainPanelData,
        mullionSize: number,
        panelThickness: number,
        levelId?: string,
    ): THREE.Object3D | null {
        return buildPanelObject({
            cell,
            panelData,
            mullionSize,
            panelThickness,
            levelId,
        });
    }
}
