import { z } from 'zod';
export declare const FamilyIfcEntitySchema: z.ZodEnum<{
    IfcDoor: "IfcDoor";
    IfcWindow: "IfcWindow";
    IfcFurniture: "IfcFurniture";
    IfcFurnishingElement: "IfcFurnishingElement";
    IfcBuildingElementProxy: "IfcBuildingElementProxy";
    IfcPlate: "IfcPlate";
    IfcMember: "IfcMember";
    IfcDistributionElement: "IfcDistributionElement";
    IfcFlowTerminal: "IfcFlowTerminal";
    IfcLightFixture: "IfcLightFixture";
    IfcSanitaryTerminal: "IfcSanitaryTerminal";
}>;
export type FamilyIfcEntity = z.infer<typeof FamilyIfcEntitySchema>;
export declare const FamilyCategorySchema: z.ZodEnum<{
    Door: "Door";
    Window: "Window";
    Furniture: "Furniture";
    Casework: "Casework";
    Fixture: "Fixture";
    Lighting: "Lighting";
    Plumbing: "Plumbing";
    Generic: "Generic";
}>;
export type FamilyCategory = z.infer<typeof FamilyCategorySchema>;
export declare const FamilyManifestSchema: z.ZodObject<{
    formatVersion: z.ZodLiteral<"1.0">;
    id: z.ZodString;
    name: z.ZodString;
    semver: z.ZodString;
    author: z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
    }, z.core.$strip>;
    description: z.ZodDefault<z.ZodString>;
    ifcEntity: z.ZodEnum<{
        IfcDoor: "IfcDoor";
        IfcWindow: "IfcWindow";
        IfcFurniture: "IfcFurniture";
        IfcFurnishingElement: "IfcFurnishingElement";
        IfcBuildingElementProxy: "IfcBuildingElementProxy";
        IfcPlate: "IfcPlate";
        IfcMember: "IfcMember";
        IfcDistributionElement: "IfcDistributionElement";
        IfcFlowTerminal: "IfcFlowTerminal";
        IfcLightFixture: "IfcLightFixture";
        IfcSanitaryTerminal: "IfcSanitaryTerminal";
    }>;
    category: z.ZodEnum<{
        Door: "Door";
        Window: "Window";
        Furniture: "Furniture";
        Casework: "Casework";
        Fixture: "Fixture";
        Lighting: "Lighting";
        Plumbing: "Plumbing";
        Generic: "Generic";
    }>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    minPRYZMVersion: z.ZodDefault<z.ZodString>;
    schemaHash: z.ZodString;
    createdAt: z.ZodString;
    lastModifiedAt: z.ZodString;
}, z.core.$strip>;
export type FamilyManifest = z.infer<typeof FamilyManifestSchema>;
export declare const IfcParameterMappingSchema: z.ZodObject<{
    parameterId: z.ZodString;
    psetName: z.ZodString;
    propertyName: z.ZodString;
}, z.core.$strip>;
export type IfcParameterMapping = z.infer<typeof IfcParameterMappingSchema>;
export declare const IfcMappingFileSchema: z.ZodObject<{
    formatVersion: z.ZodLiteral<"1.0">;
    predefinedType: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    parameters: z.ZodDefault<z.ZodArray<z.ZodObject<{
        parameterId: z.ZodString;
        psetName: z.ZodString;
        propertyName: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type IfcMappingFile = z.infer<typeof IfcMappingFileSchema>;
export declare const ReferencePlaneSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    origin: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        z: z.ZodNumber;
    }, z.core.$strip>;
    normal: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        z: z.ZodNumber;
    }, z.core.$strip>;
    isHost: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type ReferencePlane = z.infer<typeof ReferencePlaneSchema>;
export declare const FamilyParameterDataTypeSchema: z.ZodEnum<{
    string: "string";
    number: "number";
    boolean: "boolean";
    length: "length";
    angle: "angle";
    count: "count";
}>;
export declare const FamilyParameterKindSchema: z.ZodEnum<{
    type: "type";
    instance: "instance";
}>;
export declare const FamilyParameterSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    kind: z.ZodEnum<{
        type: "type";
        instance: "instance";
    }>;
    dataType: z.ZodEnum<{
        string: "string";
        number: "number";
        boolean: "boolean";
        length: "length";
        angle: "angle";
        count: "count";
    }>;
    defaultValue: z.ZodDefault<z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodNull]>>;
    expression: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    ifcMapping: z.ZodDefault<z.ZodUnion<readonly [z.ZodObject<{
        psetName: z.ZodString;
        propertyName: z.ZodString;
    }, z.core.$strip>, z.ZodNull]>>;
    exposed: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type FamilyParameter = z.infer<typeof FamilyParameterSchema>;
export declare const ProfileEntitySchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<{
        point: "point";
        line: "line";
        arc: "arc";
        circle: "circle";
        spline: "spline";
    }>;
    data: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodBoolean, z.ZodNull]>>;
}, z.core.$strip>;
export declare const ProfileConstraintSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<{
        angle: "angle";
        coincident: "coincident";
        parallel: "parallel";
        perpendicular: "perpendicular";
        horizontal: "horizontal";
        vertical: "vertical";
        tangent: "tangent";
        distance: "distance";
        radius: "radius";
        diameter: "diameter";
        equalLength: "equalLength";
        distancePointLine: "distancePointLine";
    }>;
    entityIds: z.ZodArray<z.ZodString>;
    parameterRef: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    value: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
}, z.core.$strip>;
export declare const ProfileSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    planeId: z.ZodString;
    entities: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<{
            point: "point";
            line: "line";
            arc: "arc";
            circle: "circle";
            spline: "spline";
        }>;
        data: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodBoolean, z.ZodNull]>>;
    }, z.core.$strip>>>;
    constraints: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<{
            angle: "angle";
            coincident: "coincident";
            parallel: "parallel";
            perpendicular: "perpendicular";
            horizontal: "horizontal";
            vertical: "vertical";
            tangent: "tangent";
            distance: "distance";
            radius: "radius";
            diameter: "diameter";
            equalLength: "equalLength";
            distancePointLine: "distancePointLine";
        }>;
        entityIds: z.ZodArray<z.ZodString>;
        parameterRef: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        value: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type Profile = z.infer<typeof ProfileSchema>;
export declare const SolidFeatureSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"extrude">;
    profileId: z.ZodString;
    materialSlotId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    lod: z.ZodObject<{
        coarse: z.ZodDefault<z.ZodBoolean>;
        medium: z.ZodDefault<z.ZodBoolean>;
        fine: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
    lengthExpression: z.ZodString;
    direction: z.ZodDefault<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        z: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"sweep">;
    profileId: z.ZodString;
    pathProfileId: z.ZodString;
    materialSlotId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    lod: z.ZodObject<{
        coarse: z.ZodDefault<z.ZodBoolean>;
        medium: z.ZodDefault<z.ZodBoolean>;
        fine: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"loft">;
    profileIds: z.ZodArray<z.ZodString>;
    materialSlotId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    lod: z.ZodObject<{
        coarse: z.ZodDefault<z.ZodBoolean>;
        medium: z.ZodDefault<z.ZodBoolean>;
        fine: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"revolve">;
    profileId: z.ZodString;
    materialSlotId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    lod: z.ZodObject<{
        coarse: z.ZodDefault<z.ZodBoolean>;
        medium: z.ZodDefault<z.ZodBoolean>;
        fine: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
    sweepDeg: z.ZodDefault<z.ZodNumber>;
    segments: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>], "kind">;
export type SolidFeature = z.infer<typeof SolidFeatureSchema>;
export declare const MaterialSlotSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    defaultCategory: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type MaterialSlot = z.infer<typeof MaterialSlotSchema>;
export declare const FamilyTypeSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    values: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodBoolean]>>>;
    checksum: z.ZodString;
}, z.core.$strip>;
export type FamilyType = z.infer<typeof FamilyTypeSchema>;
export declare const FamilyDocumentSchema: z.ZodObject<{
    formatVersion: z.ZodLiteral<"1.0">;
    referencePlanes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        origin: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodNumber;
        }, z.core.$strip>;
        normal: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodNumber;
        }, z.core.$strip>;
        isHost: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>>;
    parameters: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        kind: z.ZodEnum<{
            type: "type";
            instance: "instance";
        }>;
        dataType: z.ZodEnum<{
            string: "string";
            number: "number";
            boolean: "boolean";
            length: "length";
            angle: "angle";
            count: "count";
        }>;
        defaultValue: z.ZodDefault<z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodNull]>>;
        expression: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        ifcMapping: z.ZodDefault<z.ZodUnion<readonly [z.ZodObject<{
            psetName: z.ZodString;
            propertyName: z.ZodString;
        }, z.core.$strip>, z.ZodNull]>>;
        exposed: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>>;
    profiles: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        planeId: z.ZodString;
        entities: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<{
                point: "point";
                line: "line";
                arc: "arc";
                circle: "circle";
                spline: "spline";
            }>;
            data: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodBoolean, z.ZodNull]>>;
        }, z.core.$strip>>>;
        constraints: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<{
                angle: "angle";
                coincident: "coincident";
                parallel: "parallel";
                perpendicular: "perpendicular";
                horizontal: "horizontal";
                vertical: "vertical";
                tangent: "tangent";
                distance: "distance";
                radius: "radius";
                diameter: "diameter";
                equalLength: "equalLength";
                distancePointLine: "distancePointLine";
            }>;
            entityIds: z.ZodArray<z.ZodString>;
            parameterRef: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            value: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>>;
    solids: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodLiteral<"extrude">;
        profileId: z.ZodString;
        materialSlotId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        lod: z.ZodObject<{
            coarse: z.ZodDefault<z.ZodBoolean>;
            medium: z.ZodDefault<z.ZodBoolean>;
            fine: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>;
        lengthExpression: z.ZodString;
        direction: z.ZodDefault<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodLiteral<"sweep">;
        profileId: z.ZodString;
        pathProfileId: z.ZodString;
        materialSlotId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        lod: z.ZodObject<{
            coarse: z.ZodDefault<z.ZodBoolean>;
            medium: z.ZodDefault<z.ZodBoolean>;
            fine: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodLiteral<"loft">;
        profileIds: z.ZodArray<z.ZodString>;
        materialSlotId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        lod: z.ZodObject<{
            coarse: z.ZodDefault<z.ZodBoolean>;
            medium: z.ZodDefault<z.ZodBoolean>;
            fine: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodLiteral<"revolve">;
        profileId: z.ZodString;
        materialSlotId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        lod: z.ZodObject<{
            coarse: z.ZodDefault<z.ZodBoolean>;
            medium: z.ZodDefault<z.ZodBoolean>;
            fine: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>;
        sweepDeg: z.ZodDefault<z.ZodNumber>;
        segments: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>], "kind">>>;
    materialSlots: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        defaultCategory: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>>;
    types: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        values: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodBoolean]>>>;
        checksum: z.ZodString;
    }, z.core.$strip>>;
    defaults: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodBoolean, z.ZodNull]>>>;
}, z.core.$strip>;
export type FamilyDocument = z.infer<typeof FamilyDocumentSchema>;
export declare const FamilyEventSchema: z.ZodObject<{
    id: z.ZodString;
    ts: z.ZodString;
    kind: z.ZodString;
    payload: z.ZodUnknown;
}, z.core.$strip>;
export type FamilyEvent = z.infer<typeof FamilyEventSchema>;
//# sourceMappingURL=family-schema.d.ts.map