/**
 * CurtainPanelTypes
 *
 * Defines the semantic data model for curtain wall panels.
 *
 * ## Topology Context
 *
 * Each CurtainCell in the grid maps to exactly one CurtainPanelData.
 * Panels are BIM elements in their own right — independently addressable,
 * replaceable, and queryable by the AI read model.
 *
 *   CurtainWall (CurtainWallData)
 *     └─ CurtainPanel (CurtainPanelData) × N  [one per grid cell]
 *
 * The relationship is expressed by:
 *   - `curtainWallId` — parent wall ID
 *   - `cellIndex`     — (i, j) grid address within that wall's grid
 *
 * ## Panel Types (Phase 1 + Phase 2)
 *
 *   SystemPanel_Glass   — transparent glazing (default)
 *   SystemPanel_Opaque  — solid spandrel panel
 *   SystemPanel_Empty   — void / opening (no mesh rendered)
 *   SystemPanel_Door    — hosted door (Phase 2 — Revit-style curtain panel door)
 *
 * Phase 2 adds: custom panel families, embedded door/window hosts.
 * Hosted door geometry is rendered entirely within the panel cell by
 * CurtainPanelBuilder; it is NOT stored in DoorStore (which is for
 * wall-opening-hosted doors only).
 *
 * ## IFC Mapping
 *
 *   CurtainPanelData → IfcMember (predefinedType: PANEL) per ISO 16739
 *   SystemPanel_Door → IfcDoor (hosted in IfcCurtainWall) per Revit IFC export model
 */

import { z } from 'zod';
import { CoreElement } from '@pryzm/core-app-model';

/**
 * Built-in panel type registry.
 *
 * Phase 1: Glass / Opaque / Empty
 * Phase 2: Door
 * Phase 3 (LOD-400 wooden slat systems):
 *   SlatsVerticalFramed  — light-wood frame + dark vertical slats
 *   SlatsVerticalDense   — full dark frame + dense vertical slats
 *   SlatsVerticalOpen    — vertical posts joined by triangular cross-blocks, no frame
 *   SlatsHorizontal      — horizontal slats stacked between vertical metal supports
 *
 * Phase 4 (LOD-400 architectural fabric / shading panels):
 *   CurtainCornerFold    — two quads meeting at a vertical centre hinge, folded forward
 *   CurtainFlat          — single planar fabric quad with shader-driven edge fade
 *   CurtainOrganic       — vertex-deformed plane (sine + asymmetric drift) for an S-curve drape
 *   CurtainSide          — narrow flat fabric attached to one side of the cell
 *   CurtainDoubleMixed   — composite: CornerFold (left half) + Organic drape (right half)
 *
 * The runtime catalogue lives in `CurtainPanelFactory.PANEL_DEFINITIONS` —
 * any new type added here must also be registered there.
 */
export type PanelType =
    | 'SystemPanel_Glass'
    | 'SystemPanel_Opaque'
    | 'SystemPanel_Empty'
    | 'SystemPanel_Door'
    | 'SystemPanel_SlatsVerticalFramed'
    | 'SystemPanel_SlatsVerticalDense'
    | 'SystemPanel_SlatsVerticalOpen'
    | 'SystemPanel_SlatsHorizontal'
    | 'SystemPanel_CurtainCornerFold'
    | 'SystemPanel_CurtainFlat'
    | 'SystemPanel_CurtainOrganic'
    | 'SystemPanel_CurtainSide'
    | 'SystemPanel_CurtainDoubleMixed';

// ─────────────────────────────────────────────────────────────────────────────
// Hosted Door sub-record (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for a door hosted within a curtain wall panel cell.
 *
 * The door fills the panel cell. Frame sits at the cell boundary (inset by
 * mullion half-width). The leaf occupies the inner opening within the frame.
 *
 * Stored inline on CurtainPanelData.hostedDoor — not in DoorStore.
 * DoorStore is exclusively for wall-opening-hosted doors.
 */
export interface CurtainPanelHostedDoor {
    /** Hex string — frame colour. Default '#f2f0ed'. */
    frameColor: string;
    /** Hex string — leaf colour. Default '#f2f0ed'. */
    leafColor: string;
    /** Hinge side when viewed from the exterior face. Default 'left'. */
    hingesSide: 'left' | 'right';
    /** Swing direction when viewed from exterior. Default 'inward'. */
    swingDirection: 'inward' | 'outward';
    /**
     * Height above the cell base at which the door starts (0 = floor-to-top).
     * Allows transom panels above the door. Default 0 (full-height door).
     */
    sillHeight: number;
    /** Frame rail / stile width in metres. Default 0.05. */
    frameThickness: number;
}

export const DEFAULT_HOSTED_DOOR: CurtainPanelHostedDoor = {
    frameColor:     '#f2f0ed',
    leafColor:      '#c8c0b8',
    hingesSide:     'left',
    swingDirection: 'inward',
    sillHeight:     0,
    frameThickness: 0.05,
};

// ─────────────────────────────────────────────────────────────────────────────
// CurtainPanelData
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Semantic data for a single curtain wall panel.
 *
 * Extends CoreElement so it participates in:
 *   - ElementRegistry (registered as 'curtain-panel')
 *   - StoreEventBus  (CurtainPanelStore emits on all mutations) // TODO(TASK-08)
 *   - IFC export     (IfcMember with PANEL predefined type)
 */
export interface CurtainPanelData extends CoreElement {
    type: 'curtain-panel';
    /** The parent CurtainWallData.id. */
    curtainWallId: string;
    /**
     * Grid address within the parent wall's CurtainGridSystem.
     * [i] = column index (U direction), [j] = row index (V direction).
     * (0, 0) is the bottom-left panel.
     */
    cellIndex: [number, number];
    /** Visual and semantic classification of the panel. */
    panelType: PanelType;
    /** Optional hex color string override — supersedes the type default. */
    materialOverride?: string;
    /**
     * Phase 2: Door configuration — required when panelType === 'SystemPanel_Door'.
     * Rendered by CurtainPanelBuilder.buildDoorObject().
     */
    hostedDoor?: CurtainPanelHostedDoor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default rendering properties for each panel type.
 * Used by CurtainPanelBuilder and CurtainWallInstanceManager.
 * SystemPanel_Door is always rendered individually — these defaults
 * are used only as a fallback silhouette if hostedDoor is missing.
 */
export interface PanelRenderDefaults {
    color: number;
    opacity: number;
    transparent: boolean;
    metalness: number;
    roughness: number;
}

export const PANEL_TYPE_DEFAULTS: Record<PanelType, PanelRenderDefaults> = {
    SystemPanel_Glass: {
        color: 0x88ccff,
        opacity: 0.4,
        transparent: true,
        metalness: 0.1,
        roughness: 0.1
    },
    SystemPanel_Opaque: {
        color: 0x8899aa,
        opacity: 1.0,
        transparent: false,
        metalness: 0.2,
        roughness: 0.6
    },
    SystemPanel_Empty: {
        color: 0x000000,
        opacity: 0.0,
        transparent: true,
        metalness: 0.0,
        roughness: 1.0
    },
    SystemPanel_Door: {
        color: 0xd4c8bc,
        opacity: 1.0,
        transparent: false,
        metalness: 0.05,
        roughness: 0.7
    },
    SystemPanel_SlatsVerticalFramed: {
        color: 0x6b4a2e,        // light-warm wood frame tone
        opacity: 1.0,
        transparent: false,
        metalness: 0.0,
        roughness: 0.75
    },
    SystemPanel_SlatsVerticalDense: {
        color: 0x4a2a1c,        // dark mahogany frame + slats
        opacity: 1.0,
        transparent: false,
        metalness: 0.0,
        roughness: 0.7
    },
    SystemPanel_SlatsVerticalOpen: {
        color: 0x6b4a2e,        // light wood
        opacity: 1.0,
        transparent: false,
        metalness: 0.0,
        roughness: 0.75
    },
    SystemPanel_SlatsHorizontal: {
        color: 0x5a2618,        // deep wenge-red horizontal slats
        opacity: 1.0,
        transparent: false,
        metalness: 0.0,
        roughness: 0.7
    },
    // ── Architectural fabric / shading panels (Phase 4) ──
    // All curtain types share a translucent, double-sided MeshStandardMaterial
    // for the "fabric glow" look. Defaults are used when the InstanceManager
    // legend or a fallback silhouette is rendered.
    SystemPanel_CurtainCornerFold: {
        color: 0xefe9d8,
        opacity: 0.92,
        transparent: true,
        metalness: 0.0,
        roughness: 0.85
    },
    SystemPanel_CurtainFlat: {
        color: 0xf2ece0,
        opacity: 0.88,
        transparent: true,
        metalness: 0.0,
        roughness: 0.9
    },
    SystemPanel_CurtainOrganic: {
        color: 0xeae3d0,
        opacity: 0.86,
        transparent: true,
        metalness: 0.0,
        roughness: 0.92
    },
    SystemPanel_CurtainSide: {
        color: 0xece5d2,
        opacity: 0.9,
        transparent: true,
        metalness: 0.0,
        roughness: 0.9
    },
    SystemPanel_CurtainDoubleMixed: {
        color: 0xece5d2,
        opacity: 0.88,
        transparent: true,
        metalness: 0.0,
        roughness: 0.88
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All valid panel type strings for validation and AI proposals.
 */
export const VALID_PANEL_TYPES: PanelType[] = [
    'SystemPanel_Glass',
    'SystemPanel_Opaque',
    'SystemPanel_Empty',
    'SystemPanel_Door',
    'SystemPanel_SlatsVerticalFramed',
    'SystemPanel_SlatsVerticalDense',
    'SystemPanel_SlatsVerticalOpen',
    'SystemPanel_SlatsHorizontal',
    'SystemPanel_CurtainCornerFold',
    'SystemPanel_CurtainFlat',
    'SystemPanel_CurtainOrganic',
    'SystemPanel_CurtainSide',
    'SystemPanel_CurtainDoubleMixed',
];

export function isValidPanelType(value: string): value is PanelType {
    return VALID_PANEL_TYPES.includes(value as PanelType);
}

// ─────────────────────────────────────────────────────────────────────────────
// §CURTAIN-WALL-AUDIT-2026 §4.2 — Zod schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zod schema for runtime panel-type validation.
 *
 * Use at trust boundaries — incoming AI proposals, persisted scene reads,
 * postMessage / IPC payloads — anywhere a string must be coerced to a
 * `PanelType` before reaching the command pipeline.
 *
 * The list of literals is derived from VALID_PANEL_TYPES so this schema
 * cannot drift from the runtime catalogue. A static `satisfies` check at
 * module load asserts the two stay in sync.
 */
export const panelTypeSchema = z.enum(VALID_PANEL_TYPES as [PanelType, ...PanelType[]]);

export function parsePanelType(value: unknown): PanelType {
    return panelTypeSchema.parse(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// §CURTAIN-WALL-AUDIT-2026 §4.3 — Runtime catalogue ↔ defaults sync guard
// ─────────────────────────────────────────────────────────────────────────────
// Fail fast at module load time if the PANEL_TYPE_DEFAULTS table is missing
// any panel type listed in VALID_PANEL_TYPES, or has stale extras. Catching
// this on import surfaces drift to developers (and CI) before any tool tries
// to render with `undefined` material defaults at runtime.
(function assertPanelDefaultsCoverage(): void {
    const defaultKeys = new Set(Object.keys(PANEL_TYPE_DEFAULTS) as PanelType[]);
    const validSet = new Set<PanelType>(VALID_PANEL_TYPES);

    const missing: PanelType[] = [];
    for (const t of VALID_PANEL_TYPES) {
        if (!defaultKeys.has(t)) missing.push(t);
    }
    const extra: PanelType[] = [];
    for (const k of defaultKeys) {
        if (!validSet.has(k)) extra.push(k);
    }
    if (missing.length || extra.length) {
        const parts: string[] = [];
        if (missing.length) parts.push(`missing defaults for: ${missing.join(', ')}`);
        if (extra.length)   parts.push(`stale defaults for: ${extra.join(', ')}`);
        throw new Error(
            `[CurtainPanelTypes] PANEL_TYPE_DEFAULTS / VALID_PANEL_TYPES drift — ${parts.join('; ')}`
        );
    }
})();

