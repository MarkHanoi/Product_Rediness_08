import * as WEBIFC from 'web-ifc';
import { TriangulatedGeometry, ElementColor } from './IntermediateModel';

type EntityRef = WEBIFC.IfcLineObject | number;
type Vector3D  = { x: number; y: number; z: number };


export class IfcGeometryWriter {
    private api: WEBIFC.IfcAPI;
    private modelID: number;
    private contextRef: EntityRef;

    constructor(api: WEBIFC.IfcAPI, modelID: number, contextRef: EntityRef) {
        this.api        = api;
        this.modelID    = modelID;
        this.contextRef = contextRef;
    }

    private w(entity: WEBIFC.IfcLineObject): WEBIFC.IfcLineObject {
        this.api.WriteLine(this.modelID, entity);
        return entity;
    }

    createShape(geometry: TriangulatedGeometry, elevationOffset: number = 0, color?: ElementColor): EntityRef {
        const faceSetRef  = this.createTriangulatedFaceSet(geometry, elevationOffset);
        if (color) {
            this.createStyledItem(faceSetRef, color);
        }
        const shapeRepRef = this.createShapeRepresentation(faceSetRef);
        return this.createProductDefinitionShape(shapeRepRef);
    }

    createLocalPlacement(position: Vector3D, _rotation: Vector3D, parentPlacement?: EntityRef): EntityRef {
        const origin = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCCARTESIANPOINT,
            [position.x, position.z, position.y]));
        const dirZ   = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCDIRECTION,
            [0, 0, 1]));
        const dirX   = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCDIRECTION,
            [1, 0, 0]));
        const axis   = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCAXIS2PLACEMENT3D,
            origin, dirZ, dirX));
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCLOCALPLACEMENT,
            parentPlacement || null, axis));
    }

    private createTriangulatedFaceSet(geometry: TriangulatedGeometry, elevationOffset: number = 0): EntityRef {
        if (!geometry.vertices || geometry.vertices.length === 0) {
            console.error('IfcGeometryWriter: Empty vertices in geometry!');
        }

        const coords: number[][] = [];
        for (let i = 0; i < geometry.vertices.length; i += 3) {
            coords.push([
                geometry.vertices[i],
                geometry.vertices[i + 2],
                geometry.vertices[i + 1] - elevationOffset,
            ]);
        }

        const pointList = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCCARTESIANPOINTLIST3D,
            coords));

        const faces: number[][] = [];
        for (let i = 0; i < geometry.indices.length; i += 3) {
            faces.push([
                geometry.indices[i]     + 1,
                geometry.indices[i + 1] + 1,
                geometry.indices[i + 2] + 1,
            ]);
        }

        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCTRIANGULATEDFACESET,
            pointList, null, { type: WEBIFC.IFCBOOLEAN, value: 'T' }, faces, null));
    }

    /**
     * Attaches an IfcStyledItem to a face set so that IFC viewers render the
     * element in its original Three.js material colour.
     *
     * IFC appearance chain (IFC4):
     *   IfcColourRgb → IfcSurfaceStyleRendering → IfcSurfaceStyle
     *   → IfcPresentationStyleAssignment → IfcStyledItem(faceSetRef)
     *
     * Transparency in IFC is the inverse of Three.js opacity:
     *   IFC transparency 0.0 = fully opaque, 1.0 = fully transparent.
     */
    private createStyledItem(faceSetRef: EntityRef, color: ElementColor): void {
        const r = Math.max(0, Math.min(1, color.r));
        const g = Math.max(0, Math.min(1, color.g));
        const b = Math.max(0, Math.min(1, color.b));
        const transparency = color.a != null ? Math.max(0, Math.min(1, 1.0 - color.a)) : 0.0;

        const colourRgb = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCCOLOURRGB,
            null, r, g, b));

        const rendering = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSURFACESTYLERENDERING,
            colourRgb,
            transparency,
            null, null, null, null, null, null,
            { type: 3, value: 'NOTDEFINED' }));

        const surfaceStyle = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSURFACESTYLE,
            null,
            { type: 3, value: 'BOTH' },
            [rendering]));

        const styleAssignment = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCPRESENTATIONSTYLEASSIGNMENT,
            [surfaceStyle]));

        this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSTYLEDITEM,
            faceSetRef, [styleAssignment], null));
    }

    private createShapeRepresentation(geometryRef: EntityRef): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSHAPEREPRESENTATION,
            this.contextRef, 'Body', 'Tessellation', [geometryRef]));
    }

    private createProductDefinitionShape(representationRef: EntityRef): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCPRODUCTDEFINITIONSHAPE,
            null, null, [representationRef]));
    }
}
