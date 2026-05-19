import { RoofData, RoofMetadata } from './RoofTypes';

export interface SerializableRoofSnapshot {
    id: string;
    type: 'roof';
    levelId: string;
    parentId?: string;
    footprint: {
        polygon: [number, number][];
        centroid: [number, number];
    };
    roofType: string;
    slope?: number;
    ridgeOffset?: number;
    overhang: number;
    thickness: number;
    baseOffset: number;
    fascia?: number;
    materialId?: string;
    materialColor?: string;
    properties: Record<string, any>;
    ifcData?: { guid: string; ifcClass: string; predefinedType?: string };
    metadata: RoofMetadata;
}

export function serializeRoofSnapshot(roof: RoofData): SerializableRoofSnapshot {
    return {
        id:           roof.id,
        type:         'roof',
        levelId:      roof.levelId,
        parentId:     roof.parentId,
        footprint: {
            polygon:  roof.footprint.polygon.map(([x, z]) => [x, z] as [number, number]),
            centroid: [roof.footprint.centroid[0], roof.footprint.centroid[1]],
        },
        roofType:     roof.roofType,
        slope:        roof.slope,
        ridgeOffset:  roof.ridgeOffset,
        overhang:     roof.overhang,
        thickness:    roof.thickness,
        baseOffset:   roof.baseOffset,
        fascia:       roof.fascia,
        materialId:   roof.materialId,
        materialColor: roof.materialColor,
        properties:   { ...roof.properties },
        ifcData:      roof.ifcData ? { ...roof.ifcData } : undefined,
        metadata: {
            createdAt:   roof.metadata.createdAt,
            modifiedAt:  roof.metadata.modifiedAt,
            createdBy:   roof.metadata.createdBy,
            version:     roof.metadata.version,
            tags:        roof.metadata.tags ? [...roof.metadata.tags] : undefined,
            description: roof.metadata.description,
        },
    };
}

export function cloneRoofData(roof: RoofData): RoofData {
    const clone: RoofData = {
        ...roof,
        footprint: {
            polygon:  roof.footprint.polygon.map(([x, z]) => [x, z] as [number, number]),
            centroid: [roof.footprint.centroid[0], roof.footprint.centroid[1]],
        },
        metadata: { ...roof.metadata },
        properties: { ...roof.properties },
    };
    if (roof.ifcData) {
        clone.ifcData = { ...roof.ifcData };
    }
    if (roof.layers) {
        clone.layers = roof.layers.map(l => ({ ...l }));
    }
    return clone;
}
