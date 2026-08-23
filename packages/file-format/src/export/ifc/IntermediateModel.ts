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
    building: ExportBuilding;
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
        building: {
            id: 'building-1',
            name: 'Default Building'
        },
        levels: [],
        elements: []
    };
}
