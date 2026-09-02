import { z } from 'zod';
/** `MAJOR.MINOR`.  Deliberately admits values this build cannot read, so
 *  that an unreadable-but-well-formed file is REFUSED BY NAME rather than
 *  reported as malformed (C111 §8.4-c). */
export declare const FORMAT_VERSION_PATTERN: RegExp;
/** The version this build WRITES. */
export declare const CURRENT_FORMAT_VERSION = "1.1";
/** Every version this build can READ without migrating. */
export declare const SUPPORTED_FORMAT_VERSIONS: readonly ["1.0", "1.1"];
export interface ParsedFormatVersion {
    readonly major: number;
    readonly minor: number;
}
/** Parse `MAJOR.MINOR`.  Returns `null` — never throws, and never
 *  guesses — when the string is not a version at all. */
export declare function parseFormatVersion(value: string): ParsedFormatVersion | null;
/** Total order over well-formed versions.  `null` when either side is
 *  unparseable — ⛔ a comparison against a non-version is NOT `0`, and a
 *  caller that treats it as `0` has re-created the defect §8.1 names. */
export declare function compareFormatVersion(a: string, b: string): -1 | 0 | 1 | null;
/** The closed set of readings a version string can produce.  ⛔ Each is a
 *  DISTINCT value: `unparseable` (not a version) and `future-major` (a
 *  version this build cannot read) are different facts and a reader that
 *  collapses them tells the user the wrong thing — which is exactly what
 *  C111 §8.1 Consequence 2 measured. */
export type FormatVersionSupport = 'supported' | 'future-minor' | 'future-major' | 'past-major' | 'unparseable';
export declare function classifyFormatVersion(value: string): FormatVersionSupport;
/** True iff this build can read `value` without migrating it. */
export declare function isSupportedFormatVersion(value: string): boolean;
/** The refusal message for a version this build cannot read.  ⛔ C16 CA-18 /
 *  C112 §7: a refusal names BOTH numbers and the route back. */
export declare function formatVersionRefusal(value: string): string;
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
    Wall: "Wall";
    Floor: "Floor";
    Roof: "Roof";
    Ceiling: "Ceiling";
    CurtainWall: "CurtainWall";
    Column: "Column";
    Beam: "Beam";
    Stair: "Stair";
    Railing: "Railing";
    Equipment: "Equipment";
    MEPComponent: "MEPComponent";
    CustomSystem: "CustomSystem";
}>;
export type FamilyCategory = z.infer<typeof FamilyCategorySchema>;
/** The eight members that existed at format v1.0.  Exported so a
 *  migrator or a gate can assert that none was dropped, rather than
 *  trusting a comment. */
export declare const FAMILY_CATEGORIES_V1_0: readonly ["Door", "Window", "Furniture", "Casework", "Fixture", "Lighting", "Plumbing", "Generic"];
export declare const FamilyManifestSchema: z.ZodObject<{
    formatVersion: z.ZodString;
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
        Wall: "Wall";
        Floor: "Floor";
        Roof: "Roof";
        Ceiling: "Ceiling";
        CurtainWall: "CurtainWall";
        Column: "Column";
        Beam: "Beam";
        Stair: "Stair";
        Railing: "Railing";
        Equipment: "Equipment";
        MEPComponent: "MEPComponent";
        CustomSystem: "CustomSystem";
    }>;
    semanticClassId: z.ZodOptional<z.ZodString>;
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
    supersededDefault: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
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
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"boolean">;
    op: z.ZodEnum<{
        union: "union";
        subtract: "subtract";
        intersect: "intersect";
    }>;
    subjectSolidId: z.ZodString;
    toolSolidId: z.ZodString;
    materialSlotId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    lod: z.ZodObject<{
        coarse: z.ZodDefault<z.ZodBoolean>;
        medium: z.ZodDefault<z.ZodBoolean>;
        fine: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
}, z.core.$strip>], "kind">;
export type SolidFeature = z.infer<typeof SolidFeatureSchema>;
/** ⚠ DECLARED ABSENCE (C84 EI-6, C111 §10.1).  `bakeFamilyInstance`
 *  implements `extrude` ONLY; `sweep`, `loft`, `revolve` and now
 *  `boolean` return a structured `unsupported-feature` per solid and the
 *  bake completes the rest.  ⭐ C111 §10.1: *"That refusal is spec §75
 *  already satisfied. Do not 'fix' it by substituting an extrude."*
 *  Adding the KIND makes the intent expressible and persistable; it does
 *  NOT make it bakeable, and this comment exists so the next reader does
 *  not mistake the one for the other. Wiring the bake is lane 4D's. */
export declare const BAKEABLE_SOLID_KINDS: readonly ["extrude"];
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
/** ⛔ `derived` is the DEFAULT and `authored` is the OVERRIDE — C111
 *  §10.3-b states the direction explicitly: *"derived is the default and
 *  an authored plan symbol is the override, NEVER THE ONLY PATH."*  A
 *  representation that exists only as authored artwork is a drawing, not
 *  a model, and the World Model cannot answer spec §69 from it. */
export declare const RepresentationSourceSchema: z.ZodEnum<{
    derived: "derived";
    authored: "authored";
}>;
export declare const RepresentationKindSchema: z.ZodEnum<{
    mesh: "mesh";
    plan: "plan";
    elevation: "elevation";
    section: "section";
    symbolic: "symbolic";
    analysis: "analysis";
}>;
export declare const RepresentationSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<{
        mesh: "mesh";
        plan: "plan";
        elevation: "elevation";
        section: "section";
        symbolic: "symbolic";
        analysis: "analysis";
    }>;
    source: z.ZodDefault<z.ZodEnum<{
        derived: "derived";
        authored: "authored";
    }>>;
    lod: z.ZodDefault<z.ZodObject<{
        coarse: z.ZodDefault<z.ZodBoolean>;
        medium: z.ZodDefault<z.ZodBoolean>;
        fine: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    authoredProfileId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Representation = z.infer<typeof RepresentationSchema>;
/** C112 §2.2 — the vocabulary opens with the members that have a WRITER;
 *  the rest are PARKED on the C71 §2.2 precedent.  ⛔ Parked is not a gap
 *  (C71 §2.3) and a parked member may NOT be deleted (C71 §2.4). */
export declare const ConnectorKindSchema: z.ZodEnum<{
    insertion: "insertion";
    opening: "opening";
    mep: "mep";
    structural: "structural";
    facade: "facade";
    attachment: "attachment";
}>;
export type ConnectorKind = z.infer<typeof ConnectorKindSchema>;
/** The two connector kinds that have a writer in the Window slice.
 *  Exported so a gate can assert the parked members stayed parked
 *  instead of a comment asserting it. */
export declare const CONNECTOR_KINDS_WITH_WRITER: readonly ["insertion", "opening"];
/** The opening a connector requires its host to provide (C112 §2.5).
 *  ⛔ ALL LENGTHS ARE METRES (ADR-0376 D3, C112 §2.1).  A connector field
 *  carrying millimetres is a D3 defect, not a local convention.
 *  ⛔ This DECLARES A DEMAND.  The host's `Opening` record remains the
 *  single authority for the void actually cut; where the two disagree
 *  THE CUT VOID IS THE FACT and the disagreement is a refusal naming
 *  both numbers (C112 §7), never a silent reconciliation. */
export declare const DemandedVoidSchema: z.ZodObject<{
    width: z.ZodNumber;
    height: z.ZodNumber;
    sillHeight: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const ConnectorSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    kind: z.ZodEnum<{
        insertion: "insertion";
        opening: "opening";
        mep: "mep";
        structural: "structural";
        facade: "facade";
        attachment: "attachment";
    }>;
    allowedHostClasses: z.ZodOptional<z.ZodArray<z.ZodString>>;
    demandedVoid: z.ZodOptional<z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
        sillHeight: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Connector = z.infer<typeof ConnectorSchema>;
/** ⛔ A PROPERTY IS NOT A PARAMETER, AND THE TWO ARE NOT COLLAPSED
 *  (C111 §9.1-a).  Spec §8: a PARAMETER controls generation
 *  (`FrameWidth = 75 mm`); a PROPERTY describes (`FrameMaterial =
 *  Aluminium`).  ⛔ A property MUST NOT be smuggled in as a `string`
 *  parameter, and a parameter MUST NOT be re-labelled a property to
 *  dodge the expression engine.  That is why this is a SEPARATE
 *  collection and not a flag on `FamilyParameter`.
 *
 *  ⭐ `dataType` REUSES `FamilyParameterDataTypeSchema` rather than
 *  minting a second quantity vocabulary.  C111 §9.1-b is explicit that
 *  the quantity-kind answer is C110's and C113's subject and "a declared
 *  gap here so NO LANE INVENTS A THIRD ANSWER" — and C110 §3.4 binds the
 *  runtime's `CanonicalKind` to this very enum.  One declaration, three
 *  consumers.
 *
 *  ⚠ NO `.passthrough()` — spec §33 forbids uncontrolled text, and an
 *  open bag here is how a classification vocabulary gets minted by
 *  accident.  Zod strips unknown keys by default; keep it that way. */
export declare const ComponentPropertySchema: z.ZodObject<{
    name: z.ZodString;
    dataType: z.ZodEnum<{
        string: "string";
        number: "number";
        boolean: "boolean";
        length: "length";
        angle: "angle";
        count: "count";
    }>;
    value: z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodBoolean, z.ZodNull]>;
}, z.core.$strip>;
export type ComponentProperty = z.infer<typeof ComponentPropertySchema>;
export declare const PropertySetSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    properties: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        dataType: z.ZodEnum<{
            string: "string";
            number: "number";
            boolean: "boolean";
            length: "length";
            angle: "angle";
            count: "count";
        }>;
        value: z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodBoolean, z.ZodNull]>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type PropertySet = z.infer<typeof PropertySetSchema>;
/** ⛔ DOCUMENT ORDER IS NOT A DEPENDENCY GRAPH (C111 §10.2-a), and no
 *  consumer may treat it as one (§1.1-c: never use an array position as
 *  semantic identity).  `FamilyDocument.solids` is a FLAT array evaluated
 *  in document order with no dependency edges — this array makes the
 *  dependency EXPLICIT so the ordering stops being load-bearing.
 *
 *  ⚠ DECLARED INERT ON ARRIVAL, and the declaration is the honest part.
 *  C111 §10.2-b: the feature graph is spec §16's subject and D7 is OPEN —
 *  it governs how a feature graph reconciles with an undo model that
 *  forbids selective undo.  ⛔ "Do not plan it on the undo stack."  So
 *  this format now PERSISTS the edges and NOTHING EXECUTES THEM.  An
 *  emitter with no consumer is a declared gap (C84 EI-13), not a working
 *  feature; a lane that reads these edges to order a rebuild before D7
 *  rules is deciding D7 by writing code. */
export declare const FeatureEdgeKindSchema: z.ZodEnum<{
    consumes: "consumes";
    dependsOn: "dependsOn";
}>;
export declare const FeatureEdgeSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    kind: z.ZodEnum<{
        consumes: "consumes";
        dependsOn: "dependsOn";
    }>;
}, z.core.$strip>;
export type FeatureEdge = z.infer<typeof FeatureEdgeSchema>;
export declare const FamilyDocumentSchema: z.ZodObject<{
    formatVersion: z.ZodString;
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
        supersededDefault: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
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
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodLiteral<"boolean">;
        op: z.ZodEnum<{
            union: "union";
            subtract: "subtract";
            intersect: "intersect";
        }>;
        subjectSolidId: z.ZodString;
        toolSolidId: z.ZodString;
        materialSlotId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        lod: z.ZodObject<{
            coarse: z.ZodDefault<z.ZodBoolean>;
            medium: z.ZodDefault<z.ZodBoolean>;
            fine: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>;
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
    representations: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<{
            mesh: "mesh";
            plan: "plan";
            elevation: "elevation";
            section: "section";
            symbolic: "symbolic";
            analysis: "analysis";
        }>;
        source: z.ZodDefault<z.ZodEnum<{
            derived: "derived";
            authored: "authored";
        }>>;
        lod: z.ZodDefault<z.ZodObject<{
            coarse: z.ZodDefault<z.ZodBoolean>;
            medium: z.ZodDefault<z.ZodBoolean>;
            fine: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>>;
        authoredProfileId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    connectors: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        kind: z.ZodEnum<{
            insertion: "insertion";
            opening: "opening";
            mep: "mep";
            structural: "structural";
            facade: "facade";
            attachment: "attachment";
        }>;
        allowedHostClasses: z.ZodOptional<z.ZodArray<z.ZodString>>;
        demandedVoid: z.ZodOptional<z.ZodObject<{
            width: z.ZodNumber;
            height: z.ZodNumber;
            sillHeight: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
    propertySets: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        properties: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            dataType: z.ZodEnum<{
                string: "string";
                number: "number";
                boolean: "boolean";
                length: "length";
                angle: "angle";
                count: "count";
            }>;
            value: z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodBoolean, z.ZodNull]>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>>;
    featureEdges: z.ZodDefault<z.ZodArray<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        kind: z.ZodEnum<{
            consumes: "consumes";
            dependsOn: "dependsOn";
        }>;
    }, z.core.$strip>>>;
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