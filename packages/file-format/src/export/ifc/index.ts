/**
 * IFC Export Module
 * 
 * Modular IFC exporter for converting BIM elements to IFC format.
 * 
 * Architecture:
 * - FragmentReader: Read-only adapter for element stores
 * - IntermediateModel: Framework-agnostic data model
 * - IfcSpatialStructure: Creates Project/Site/Building hierarchy
 * - IfcGeometryWriter: Converts geometry to IFC representations
 * - IfcPropertyWriter: Maps property sets to IFC properties
 * - IfcModelBuilder: Creates IFC building elements
 * - IfcFileWriter: Serializes to STEP format
 * - IfcExporter: Public API
 * 
 * Usage:
 * ```typescript
 * import { IfcExporter, exportIfc, IfcFileWriter } from './export/ifc';
 * 
 * // Option 1: Using class
 * const exporter = new IfcExporter(stores, { scene });
 * const data = await exporter.export();
 * IfcFileWriter.downloadFile(data, 'model.ifc');
 * 
 * // Option 2: Using function
 * const data = await exportIfc(stores, { scene });
 * ```
 */

export { IfcExporter, exportIfc } from './IfcExporter';
export type { ExportOptions } from './IfcExporter';
export { FragmentReader } from './FragmentReader';
export type { StoreRegistry, SceneRegistry } from './FragmentReader';
export {
    createDefaultIntermediateModel
} from './IntermediateModel';
export type {
    IntermediateModel,
    ExportElement,
    ExportLevel,
    ExportProject,
    ExportSite,
    ExportBuilding,
    TriangulatedGeometry,
    PropertySet,
    PropertyValue,
    Vector3D
} from './IntermediateModel';
export { IfcSpatialStructure } from './IfcSpatialStructure';
export type { SpatialRefs } from './IfcSpatialStructure';
export { IfcGeometryWriter } from './IfcGeometryWriter';
export { IfcPropertyWriter } from './IfcPropertyWriter';
export { IfcModelBuilder } from './IfcModelBuilder';
export { IfcFileWriter } from './IfcFileWriter';
