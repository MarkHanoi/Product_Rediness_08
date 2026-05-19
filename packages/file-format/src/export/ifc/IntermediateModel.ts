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
    guid: string;
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
    guid: string;
    name: string;
    elevation: number;
    height: number;
}

export interface ExportProject {
    id: string;
    guid: string;
    name: string;
    description?: string;
}

export interface ExportSite {
    id: string;
    guid: string;
    name: string;
}

export interface ExportBuilding {
    id: string;
    guid: string;
    name: string;
}

export interface IntermediateModel {
    project: ExportProject;
    site: ExportSite;
    building: ExportBuilding;
    levels: ExportLevel[];
    elements: ExportElement[];
}

export function createDefaultIntermediateModel(): IntermediateModel {
    return {
        project: {
            id: 'project-1',
            guid: crypto.randomUUID(),
            name: 'BIM Project',
            description: 'Exported from BIM Viewer'
        },
        site: {
            id: 'site-1',
            guid: crypto.randomUUID(),
            name: 'Default Site'
        },
        building: {
            id: 'building-1',
            guid: crypto.randomUUID(),
            name: 'Default Building'
        },
        levels: [],
        elements: []
    };
}
