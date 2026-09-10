/**
 * IntermediateModel.ts
 * 
 * Framework-agnostic in-memory model for IFC export.
 * This model is completely independent of Three.js, Fragments, or any UI.
 * It serves as the single source of truth for IFC writing logic.
 * 
 * Data Flow:
 * FragmentReader -> IntermediateModel -> IfcModelBuilder -> IFC File
 */

import { DEFAULT_BUILDING_ID, DEFAULT_BUILDING_NAME } from '@pryzm/core-app-model';

export interface Vector3D {
    x: number;
    y: number;
    z: number;
}

export interface TriangulatedGeometry {
    vertices: Float32Array;
    indices: Uint32Array;
    normals?: Float32Array;
}

export interface PropertyValue {
    name: string;
    value: string | number | boolean;
    type: 'string' | 'real' | 'integer' | 'boolean' | 'label';
}

export interface PropertySet {
    name: string;
    properties: PropertyValue[];
}

export interface ElementColor {
    r: number;
    g: number;
    b: number;
    /** Opacity 0–1 (1 = fully opaque). Omit when fully opaque. */
    a?: number;
}

export interface ExportElement {
    id: string;
    /**
     * The IFC identity this element ALREADY carries, if any — i.e. the
     * `ifcData.guid` persisted on the element, typically because it came from an
     * imported IFC file.
     *
     * ⭐ L-8501: this used to be `guid: string` and every reader filled it with
     * `?? crypto.randomUUID()`, so an element with no persisted identity got a
     * brand-new GlobalId on EVERY export. It is now optional and readers pass
     * whatever the model actually has — including nothing. `IfcModelBuilder`
     * derives a stable GlobalId from the PRYZM element id in that case
     * (`ifcIdentity.ifcGlobalId`), so the value is identical across exports of an
     * unchanged model without anyone having to persist a mapping table.
     */
    guid?: string;
    ifcClass: string;
    name: string;
    predefinedType?: string;
    geometry: TriangulatedGeometry;
    position: Vector3D;
    rotation: Vector3D;
    propertySets: PropertySet[];
    levelId?: string;
    /**
     * ADR-0385 — which {@link ExportBuilding} contains this element.
     *
     * Resolved THROUGH the element's level, because no element schema carries a
     * building or group axis today (measured: `grep -n "group"
     * packages/schemas/src/elements/Wall.ts Slab.ts` → 0 hits) — and, on a storey
     * several blocks share, through the grouped envelope the element's world-space
     * geometry stands in (ADR-0385 §4, `buildingContainment.elementPlanSample` →
     * `resolveElementBuilding`). `undefined` means the default building, which is
     * the pre-ADR-0385 behaviour unchanged — or, on a fanned storey, an element the
     * resolver declined to place, which `IfcModelBuilder` reports as UNRESOLVED.
     */
    buildingId?: string;
    parentId?: string;
    hostWallId?: string;
    openingGeometry?: TriangulatedGeometry;
    source?: 'native' | 'ifc-import';
    /** RGB colour extracted from the Three.js material — used to write IfcStyledItem. */
    color?: ElementColor;
}

export interface ExportLevel {
    id: string;
    /** Persisted IFC identity, if any. See ExportElement.guid (L-8501). */
    guid?: string;
    name: string;
    elevation: number;
    height: number;
    /**
     * ADR-0385 — which {@link ExportBuilding} owns this storey.
     *
     * `undefined` means "not resolved", and the writer treats that as the single
     * default building — which is exactly what every project authored before
     * ADR-0385 gets, and why their storey GlobalIds do not move. Filled by
     * `FragmentReader` from `resolveLevelBuilding()`, the ONE authority
     * (`hierarchyStore`); never from `SpaceEnvelope.group` (ADR-0385 §2).
     */
    buildingId?: string;
}

export interface ExportProject {
    id: string;
    /** Persisted IFC identity, if any. See ExportElement.guid (L-8501). */
    guid?: string;
    name: string;
    description?: string;
}

export interface ExportSite {
    id: string;
    /** Persisted IFC identity, if any. See ExportElement.guid (L-8501). */
    guid?: string;
    name: string;
}

export interface ExportBuilding {
    id: string;
    /** Persisted IFC identity, if any. See ExportElement.guid (L-8501). */
    guid?: string;
    name: string;
}

export interface IntermediateModel {
    project: ExportProject;
    site: ExportSite;
    /**
     * ⭐ ADR-0385 — `IfcSite` aggregates N `IfcBuilding`, each owning its OWN
     * `IfcBuildingStorey` set (C25 §1.3 as amended).
     *
     * ⛔ This was a SINGULAR `building: ExportBuilding` hard-coded to
     * `{id:'building-1', name:'Default Building'}`, which is why a master plan of
     * three blocks exported as one building with nine storeys instead of three
     * buildings with three each. The founder's 2026-09-09 ask is that cardinality.
     *
     * ⛔ NEVER EMPTY. A model with no resolvable containment still has one
     * building — the default — so the ungrouped shape is bit-for-bit unchanged.
     * `buildBuildingRoster()` guarantees this; do not re-derive the guarantee here.
     */
    buildings: ExportBuilding[];
    levels: ExportLevel[];
    elements: ExportElement[];
}

/**
 * L-8501: the project / site / building GlobalIds used to be
 * `crypto.randomUUID()`, so the three anchors of the spatial tree changed
 * identity on every single export. They now carry no `guid` at all and
 * `IfcSpatialStructure` derives a stable one from the id.
 */
export function createDefaultIntermediateModel(): IntermediateModel {
    return {
        project: {
            id: 'project-1',
            name: 'BIM Project',
            description: 'Exported from BIM Viewer'
        },
        site: {
            id: 'site-1',
            name: 'Default Site'
        },
        // ADR-0385: the ungrouped default. `DEFAULT_BUILDING_ID` is the sentinel
        // that keeps every pre-existing storey GlobalId byte-identical — see
        // `ifcIdentity.storeySlot`. It is imported, never re-typed as a literal.
        buildings: [{
            id: DEFAULT_BUILDING_ID,
            name: DEFAULT_BUILDING_NAME
        }],
        levels: [],
        elements: []
    };
}
