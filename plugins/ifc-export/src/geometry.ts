/**
 * Minimal swept-solid geometry helpers.
 *
 * Tier 1 elements only need geometry that:
 *   - is a syntactically valid `IfcProductDefinitionShape`
 *   - declares the right `RepresentationType` ("SweptSolid")
 *   - references the project's geometric representation context
 *
 * Anything beyond that (booleans, openings, cut-outs) is out of scope for S56.
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';

import {
  label,
  real,
  writeEntity,
  type EntityRef,
} from './api/webifc-helpers.js';

interface PlacementInput {
  /** World-space origin of the element (metres). */
  position: { x: number; y: number; z: number };
  /** Rotation around Z (radians). */
  rotationZ?: number;
}

export function buildLocalPlacement(
  api: IfcAPI,
  modelId: number,
  parent: EntityRef,
  input: PlacementInput,
): EntityRef {
  const cx = input.position.x;
  const cy = input.position.y;
  const cz = input.position.z;
  const yaw = input.rotationZ ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);

  const origin = writeEntity(api, modelId, WebIFC.IFCCARTESIANPOINT, [
    real(api, modelId, cx),
    real(api, modelId, cy),
    real(api, modelId, cz),
  ]);
  const zAxis = writeEntity(api, modelId, WebIFC.IFCDIRECTION, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 1),
  ]);
  const xAxis = writeEntity(api, modelId, WebIFC.IFCDIRECTION, [
    real(api, modelId, cos),
    real(api, modelId, sin),
    real(api, modelId, 0),
  ]);
  const axis = writeEntity(api, modelId, WebIFC.IFCAXIS2PLACEMENT3D, origin, zAxis, xAxis);
  return writeEntity(api, modelId, WebIFC.IFCLOCALPLACEMENT, parent, axis);
}

export interface BoxGeometryInput {
  width: number;
  depth: number;
  height: number;
}

/**
 * Build a `SweptSolid` `IfcProductDefinitionShape` for a centred rectangular
 * box of `width` × `depth` × `height` extruded along +Z.
 */
export function buildBoxRepresentation(
  api: IfcAPI,
  modelId: number,
  representationContext: EntityRef,
  geometry: BoxGeometryInput,
): EntityRef {
  const profileOrigin = writeEntity(api, modelId, WebIFC.IFCCARTESIANPOINT, [
    real(api, modelId, 0),
    real(api, modelId, 0),
  ]);
  const profileXDir = writeEntity(api, modelId, WebIFC.IFCDIRECTION, [
    real(api, modelId, 1),
    real(api, modelId, 0),
  ]);
  // IFCAXIS2PLACEMENT2D(Location, RefDirection)
  const profilePlacement = writeEntity(
    api,
    modelId,
    WebIFC.IFCAXIS2PLACEMENT2D,
    profileOrigin,
    profileXDir,
  );

  // IFCRECTANGLEPROFILEDEF(ProfileType, ProfileName, Position, XDim, YDim)
  const profile = writeEntity(
    api,
    modelId,
    WebIFC.IFCRECTANGLEPROFILEDEF,
    'AREA', // ProfileType
    null, // ProfileName
    profilePlacement,
    real(api, modelId, geometry.width),
    real(api, modelId, geometry.depth),
  );

  const extrudeOrigin = writeEntity(api, modelId, WebIFC.IFCCARTESIANPOINT, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 0),
  ]);
  const extrudeZ = writeEntity(api, modelId, WebIFC.IFCDIRECTION, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 1),
  ]);
  const extrudeX = writeEntity(api, modelId, WebIFC.IFCDIRECTION, [
    real(api, modelId, 1),
    real(api, modelId, 0),
    real(api, modelId, 0),
  ]);
  const extrudePlacement = writeEntity(
    api,
    modelId,
    WebIFC.IFCAXIS2PLACEMENT3D,
    extrudeOrigin,
    extrudeZ,
    extrudeX,
  );
  const extrudeDirection = writeEntity(api, modelId, WebIFC.IFCDIRECTION, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 1),
  ]);

  // IFCEXTRUDEDAREASOLID(SweptArea, Position, ExtrudedDirection, Depth)
  const solid = writeEntity(
    api,
    modelId,
    WebIFC.IFCEXTRUDEDAREASOLID,
    profile,
    extrudePlacement,
    extrudeDirection,
    real(api, modelId, geometry.height),
  );

  // IFCSHAPEREPRESENTATION(ContextOfItems, RepresentationIdentifier, RepresentationType, Items)
  const shapeRep = writeEntity(
    api,
    modelId,
    WebIFC.IFCSHAPEREPRESENTATION,
    representationContext,
    label(api, modelId, 'Body'),
    label(api, modelId, 'SweptSolid'),
    [solid],
  );

  // IFCPRODUCTDEFINITIONSHAPE(Name, Description, Representations)
  return writeEntity(
    api,
    modelId,
    WebIFC.IFCPRODUCTDEFINITIONSHAPE,
    null,
    null,
    [shapeRep],
  );
}
