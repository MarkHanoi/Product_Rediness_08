/**
 * CurtainSubElementTypes
 *
 * Shared type definition for the transient window-level sub-element cache
 * used to communicate a clicked panel or mullion from SelectionManager to
 * PropertyPanel without modifying SelectionManager's core selection logic.
 *
 * ## Architecture (per Feasibility Study — Classification A)
 *
 * window.__curtainSubElement is:
 *   - Written by SelectionManager.performSelection() AFTER resolving to parent
 *   - Read AND cleared by PropertyPanel.showElement() on first access
 *   - Cleared by SelectionManager.unselectAll()
 *
 * Contract compliance:
 *   §01: No store writes here. All mutations use existing commands.
 *   §03: No relationships stored inside elements.
 *   §04: Additive only — no existing handlers changed.
 *   §05: UI reads this via PropertyPanel only.
 *
 * Risk: Low — additive read-only cache, zero impact on selection logic.
 */

import { CurtainPanelData } from './CurtainPanelTypes';

export interface CurtainSubElementPanel {
    type: 'panel';
    /** CurtainPanelData.id */
    id: string;
    /** Parent CurtainWallData.id */
    parentCwId: string;
    /** Full semantic data from CurtainPanelStore (may be undefined if not yet synced) */
    panelData?: CurtainPanelData;
    /** Grid address — convenience copy from panelData.cellIndex */
    cellIndex?: [number, number];
    /** Panel type — convenience copy from panelData.panelType */
    panelType?: string;
}

export interface CurtainSubElementMullion {
    type: 'mullion';
    /** Stable synthetic ID: `${cwId}-mullion-u-${lineId}` or `${cwId}-mullion-v-${lineId}` */
    id: string;
    /** Parent CurtainWallData.id */
    parentCwId: string;
    /** 'u' = vertical mullion (divides wall along U/horizontal axis) */
    /** 'v' = horizontal mullion (divides wall along V/vertical axis) */
    mullionAxis: 'u' | 'v';
    /** Normalized position (0..1) along the axis */
    mullionT?: number;
}

export type CurtainSubElement = CurtainSubElementPanel | CurtainSubElementMullion;
