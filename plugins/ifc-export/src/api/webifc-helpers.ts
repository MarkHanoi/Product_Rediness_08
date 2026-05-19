/**
 * Thin wrappers around `web-ifc` 0.0.77's write API.
 *
 * `web-ifc` exposes:
 *   - `IfcAPI.CreateIfcType(modelId, type, value)` for typed scalars
 *     (`IFCLABEL`, `IFCREAL`, `IFCBOOLEAN`, `IFCIDENTIFIER`, `IFCTEXT` …),
 *     returning a "value object" with `{ value, type, name }`.
 *   - `IfcAPI.CreateIfcEntity(modelId, type, ...attrs)` — returns an
 *     `IfcLineObject` with `expressID = -1` until `WriteLine` runs.
 *   - `IfcAPI.WriteLine(modelId, entity)` — assigns the real `expressID`
 *     in-place and persists the line.
 *   - `IfcAPI.SaveModel(modelId)` — returns a `Uint8Array` with the STEP file.
 *
 * The phase doc's pseudocode references `WebIFC.IFCString` /
 * `WebIFC.IFCInteger` constructors that **do not exist** in 0.0.77; we adapt
 * to the real API here.
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';

export type EntityRef = WebIFC.IfcLineObject;
export type ValueRef = ReturnType<IfcAPI['CreateIfcType']>;

export function label(api: IfcAPI, modelId: number, value: string): ValueRef {
  return api.CreateIfcType(modelId, WebIFC.IFCLABEL, value);
}
export function text(api: IfcAPI, modelId: number, value: string): ValueRef {
  return api.CreateIfcType(modelId, WebIFC.IFCTEXT, value);
}
export function identifier(api: IfcAPI, modelId: number, value: string): ValueRef {
  return api.CreateIfcType(modelId, WebIFC.IFCIDENTIFIER, value);
}
export function real(api: IfcAPI, modelId: number, value: number): ValueRef {
  return api.CreateIfcType(modelId, WebIFC.IFCREAL, value);
}
export function boolean(api: IfcAPI, modelId: number, value: boolean): ValueRef {
  return api.CreateIfcType(modelId, WebIFC.IFCBOOLEAN, value);
}
export function integer(api: IfcAPI, modelId: number, value: number): ValueRef {
  return api.CreateIfcType(modelId, WebIFC.IFCINTEGER, value);
}

/** Create + commit an entity in one call. */
export function writeEntity(
  api: IfcAPI,
  modelId: number,
  type: number,
  ...attrs: unknown[]
): EntityRef {
  const entity = api.CreateIfcEntity(modelId, type, ...attrs);
  api.WriteLine(modelId, entity);
  return entity;
}

/** Convenience: encode an arbitrary scalar value into the right IFC value object. */
export function valueFromScalar(
  api: IfcAPI,
  modelId: number,
  value: string | number | boolean,
): ValueRef {
  if (typeof value === 'string') return label(api, modelId, value);
  if (typeof value === 'boolean') return boolean(api, modelId, value);
  if (Number.isInteger(value)) return integer(api, modelId, value);
  return real(api, modelId, value);
}
