// @pryzm/file-format — public surface.
//
// Implements the .pryzm v1 portable ZIP format defined by ADR-0018
// and PHASE-1D §S20.  This is the single seam through which the
// editor save flow, the headless CLI, the bake worker, and any
// future PRYZM build interoperate on disk.
export { pack } from './pack.js';
export { unpack } from './unpack.js';
export { migrate, MIGRATIONS, MigrationStubError, FutureVersionError, } from './migrations/index.js';
export { EVENT_BATCH_SIZE, PRYZM_FORMAT_SCHEMA_VERSION, PATHS, } from './types.js';
/* ------------------------------------------------------------------ */
/* .pryzm-family v1 (S55 deliverable, consumed by S56 main-editor      */
/* integration).                                                        */
/* ------------------------------------------------------------------ */
export { packFamily } from './family-pack.js';
export { unpackFamily } from './family-unpack.js';
export { FAMILY_PATHS, FAMILY_FORMAT_SCHEMA_VERSION, } from './family-types.js';
export { FamilyDocumentSchema, FamilyManifestSchema, FamilyEventSchema, FamilyParameterSchema, ProfileSchema, SolidFeatureSchema, MaterialSlotSchema, FamilyTypeSchema, ReferencePlaneSchema, 
/* --- format v1.1 (C111 §8.4-b, §10.1-a, §10.3-b, §9.1, §10.2; C112) --- */
FamilyCategorySchema, FAMILY_CATEGORIES_V1_0, FORMAT_VERSION_PATTERN, CURRENT_FORMAT_VERSION, SUPPORTED_FORMAT_VERSIONS, parseFormatVersion, compareFormatVersion, classifyFormatVersion, isSupportedFormatVersion, formatVersionRefusal, BAKEABLE_SOLID_KINDS, RepresentationSchema, RepresentationKindSchema, RepresentationSourceSchema, ConnectorSchema, ConnectorKindSchema, CONNECTOR_KINDS_WITH_WRITER, DemandedVoidSchema, PropertySetSchema, ComponentPropertySchema, FeatureEdgeSchema, FeatureEdgeKindSchema, } from './family-schema.js';
export { DXF_UNITS_TO_METRES, parseDxfString, parseDxfFile } from './DxfParser.ts';
export { buildDxfGeometry, setLayerVisible, setLayerColor, disposeDxfGroup } from './DxfGeometryBuilder.ts';
export { MigrationError, MigratorRegistry, identityMigrator, migrateFamily, PRYZM_FAMILY_MIGRATE_TRACER, makeRenameParameterMigrator, makeAddParameterMigrator, makeDeleteParameterMigrator, makeChangeParameterTypeMigrator, makeIntroduceExpressionMigrator, makeRebindIfcMigrator, makeMergeMaterialSlotsMigrator, makeSplitTypeMigrator, } from './family-migrations/index.js';
// ── Sprint AI/AJ (2026-05-12/13) — import/ + export/ → @pryzm/file-format ────────
// import/dxf — stores and utilities
export { DxfLayerStore, dxfLayerStore } from './import/dxf/DxfLayerStore.ts';
export { dxfOverlayStore } from './import/dxf/DxfOverlayStore.ts';
export { renderDxfOnPlanView } from './import/dxf/DxfPlanViewProjector.ts';
export { traceDxfToWalls } from './import/dxf/DxfToBimTracer.ts';
export { DwgConversionError, convertDwgFile } from './import/dxf/DwgImportAdapter.ts';
// import/ifc
export { isIfcImportedElement, deleteIfcImportedElement, } from './import/ifc/deleteIfcElement.ts';
export { IfcGeometryRenderer } from './import/ifc/IfcGeometryRenderer.ts';
export { IfcImporter, importFromIfcFile, importFromIfcBytes, } from './import/ifc/IfcImporter.ts';
export { importIfcLevelsAndViews } from './import/ifc/IfcLevelImporter.ts';
export { ifcModelStore } from './import/ifc/IfcModelStore.ts';
// import/ifc/conversion
export { IfcConversionCoordinator } from './import/ifc/conversion/IfcConversionCoordinator.ts';
export { ifcConversionReportStore } from './import/ifc/conversion/IfcConversionReportStore.ts';
// import/rhino
export { importRhino3DM, applyRhinoUpAxisConversion, extractRhinoLayers } from './import/rhino/RhinoImporter.ts';
// §FEAT-RHINO-CHAT-MATERIAL — material override/restore primitives for the
// rhino.setMaterial / rhino.resetMaterial chat bridge (initBusHandlers.ts).
export { applyRhinoColorOverride, restoreRhinoOriginalMaterials, snapshotRhinoMaterials, applyRhinoMaterialSnapshot, } from './import/rhino/RhinoImporter.ts';
// import/top-level
export { convertImageToImportResult } from './import/ImageToImportConverter.ts';
export { convertPDFPage1ToImage } from './import/PDFToImageConverter.ts';
// export/glb
export { exportFragmentsToGLB, downloadBlobUrl, revokeBlobUrl } from './export/glb/GLBExporter.ts';
// export/ifc
export { exportIFC } from './export/ifc/ExportIFC.ts';
export { auditIfcWorkflow } from './export/ifc/auditIfc.ts';
export { IfcExporter } from './export/ifc/IfcExporter.ts';
export { getImportedIfcElementCount, showExportScopeModal } from './export/ifc/exportScope.ts';
// export/sheets
export { dxfExportService } from './export/sheets/DxfExportService.ts';
export { pdfExportService } from './export/sheets/PdfExportService.ts';
export { sheetExportService } from './export/sheets/SheetExportService.ts';
export { SVGCompositeRenderer } from './export/sheets/SVGCompositeRenderer.ts';
export { HatchPatternLibrary } from './export/sheets/HatchPatternLibrary.ts';
export { AnnotationDxfBridge, annotationDxfBridge } from './export/sheets/AnnotationDxfBridge.ts';
// export/top-level
export { RationaleExporter } from './export/RationaleExporter.ts';
//# sourceMappingURL=index.js.map