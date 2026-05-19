// @pryzm/file-format — public surface.
//
// Implements the .pryzm v1 portable ZIP format defined by ADR-0018
// and PHASE-1D §S20.  This is the single seam through which the
// editor save flow, the headless CLI, the bake worker, and any
// future PRYZM build interoperate on disk.

export { pack } from './pack.js';
export { unpack } from './unpack.js';
export {
  migrate,
  MIGRATIONS,
  MigrationStubError,
  FutureVersionError,
  type MigrationStep,
} from './migrations/index.js';
export {
  EVENT_BATCH_SIZE,
  PRYZM_FORMAT_SCHEMA_VERSION,
  PATHS,
  type PackInput,
  type PackResult,
  type PackTelemetry,
  type PackErrorReason,
  type UnpackInput,
  type UnpackResult,
  type UnpackTelemetry,
  type UnpackErrorReason,
} from './types.js';

/* ------------------------------------------------------------------ */
/* .pryzm-family v1 (S55 deliverable, consumed by S56 main-editor      */
/* integration).                                                        */
/* ------------------------------------------------------------------ */

export { packFamily } from './family-pack.js';
export { unpackFamily } from './family-unpack.js';
export {
  FAMILY_PATHS,
  FAMILY_FORMAT_SCHEMA_VERSION,
  type FamilyPackInput,
  type FamilyPackResult,
  type FamilyPackTelemetry,
  type FamilyPackErrorReason,
  type FamilyUnpackInput,
  type FamilyUnpackResult,
  type FamilyUnpackTelemetry,
  type FamilyUnpackErrorReason,
  type FamilyIfcBindingExport,
} from './family-types.js';
export {
  FamilyDocumentSchema,
  FamilyManifestSchema,
  FamilyEventSchema,
  FamilyParameterSchema,
  ProfileSchema,
  SolidFeatureSchema,
  MaterialSlotSchema,
  FamilyTypeSchema,
  ReferencePlaneSchema,
  type FamilyDocument,
  type FamilyManifest,
  type FamilyEvent,
  type FamilyParameter,
  type Profile,
  type SolidFeature,
  type MaterialSlot,
  type FamilyType,
  type ReferencePlane,
  type FamilyIfcEntity,
  type FamilyCategory,
} from './family-schema.js';

/* ------------------------------------------------------------------ */
/* .pryzm-family migration framework (S57 deliverable, plan §5.5 +     */
/* §19.6 — `family-migration` gate).                                   */
/* ------------------------------------------------------------------ */

// ── Sprint AH (2026-05-12) — DXF parsing + geometry ─────────────────────────
export type { DxfLayer, DxfPolyline, DxfDocument } from './DxfParser.js';
export { DXF_UNITS_TO_METRES, parseDxfString, parseDxfFile } from './DxfParser.js';
export type { DxfGroupMetadata } from './DxfGeometryBuilder.js';
export { buildDxfGeometry, setLayerVisible, setLayerColor, disposeDxfGroup } from './DxfGeometryBuilder.js';

export {
  type Migrator,
  type RawFamily,
  type ChainResult,
  type ChainStep,
  MigrationError,
  MigratorRegistry,
  identityMigrator,
  migrateFamily,
  PRYZM_FAMILY_MIGRATE_TRACER,
  type MigrateFamilyOptions,
  type MigrateFamilyResult,
  makeRenameParameterMigrator,
  type RenameParameterParams,
  makeAddParameterMigrator,
  type AddParameterParams,
  makeDeleteParameterMigrator,
  type DeleteParameterParams,
  makeChangeParameterTypeMigrator,
  type ChangeParameterTypeParams,
  type FamilyParameterDataType,
  makeIntroduceExpressionMigrator,
  type IntroduceExpressionParams,
  makeRebindIfcMigrator,
  type RebindIfcParams,
  makeMergeMaterialSlotsMigrator,
  type MergeMaterialSlotsParams,
  makeSplitTypeMigrator,
  type SplitTypeParams,
} from './family-migrations/index.js';
// ── Sprint AI/AJ (2026-05-12/13) — import/ + export/ → @pryzm/file-format ────────

// import/dxf — stores and utilities
export { DxfLayerStore, dxfLayerStore } from './import/dxf/DxfLayerStore.js';
export { dxfOverlayStore } from './import/dxf/DxfOverlayStore.js';
export type { DxfOverlayRecord } from './import/dxf/DxfOverlayStore.js';
export { DxfPlanViewProjector } from './import/dxf/DxfPlanViewProjector.js';
export { renderDxfOnPlanView } from './import/dxf/DxfPlanViewProjector.js';
export type { DxfPlanViewProjectorOptions, WorldToCanvasFn } from './import/dxf/DxfPlanViewProjector.js';
export { traceDxfToWalls } from './import/dxf/DxfToBimTracer.js';
export type { TraceOptions } from './import/dxf/DxfToBimTracer.js';
export { DwgConversionError, convertDwgFile } from './import/dxf/DwgImportAdapter.js';
export type { DwgConversionProgress } from './import/dxf/DwgImportAdapter.js';
export { DwgImportAdapter } from './import/dxf/DwgImportAdapter.js';

// import/ifc
export {
  isIfcImportedElement,
  deleteIfcImportedElement,
} from './import/ifc/deleteIfcElement.js';
export type { DeleteIfcImportedElementOptions } from './import/ifc/deleteIfcElement.js';
export { IfcGeometryRenderer } from './import/ifc/IfcGeometryRenderer.js';
export type { IfcRenderedModel } from './import/ifc/IfcGeometryRenderer.js';
export {
  IfcImporter,
  importFromIfcFile,
  importFromIfcBytes,
} from './import/ifc/IfcImporter.js';
export type {
  ImportedRoom,
  ImportedHierarchyNode,
  ImportedRelationship,
  IfcStoreyRecord,
  IfcImportResult,
} from './import/ifc/IfcImporter.js';
export { importIfcLevelsAndViews } from './import/ifc/IfcLevelImporter.js';
export type { IfcLevelImportSummary } from './import/ifc/IfcLevelImporter.js';
export { ifcModelStore } from './import/ifc/IfcModelStore.js';
export type { IfcElementRecord, IfcModelData } from './import/ifc/IfcModelStore.js';

// import/ifc/conversion
export { IfcConversionCoordinator } from './import/ifc/conversion/IfcConversionCoordinator.js';
export type { IfcConversionStats, IfcConversionReport } from './import/ifc/conversion/IfcConversionTypes.js';
export { ifcConversionReportStore } from './import/ifc/conversion/IfcConversionReportStore.js';

// import/rhino
export { importRhino3DM } from './import/rhino/RhinoImporter.js';
export type { RhinoImportStats, RhinoImportResult } from './import/rhino/RhinoImporter.js';

// import/top-level
export { ImageToImportConverter, convertImageToImportResult } from './import/ImageToImportConverter.js';
export { PDFToImageConverter, convertPDFPage1ToImage } from './import/PDFToImageConverter.js';
export type { TextAnnotationItem, PDFConversionResult } from './import/PDFToImageConverter.js';

// export/glb
export { exportFragmentsToGLB, downloadBlobUrl, revokeBlobUrl } from './export/glb/GLBExporter.js';

// export/ifc
export { exportIFC } from './export/ifc/ExportIFC.js';
export { auditIfcWorkflow } from './export/ifc/auditIfc.js';
export type { AuditResult } from './export/ifc/auditIfc.js';
export { IfcExporter } from './export/ifc/IfcExporter.js';
export { getImportedIfcElementCount, showExportScopeModal } from './export/ifc/exportScope.js';

// export/sheets
export { dxfExportService } from './export/sheets/DxfExportService.js';
export type { DxfExportServiceImpl } from './export/sheets/DxfExportService.js';
export { pdfExportService } from './export/sheets/PdfExportService.js';
export type { PdfExportServiceImpl } from './export/sheets/PdfExportService.js';
export { sheetExportService } from './export/sheets/SheetExportService.js';
export type { SheetExportServiceImpl } from './export/sheets/SheetExportService.js';
export { SVGCompositeRenderer } from './export/sheets/SVGCompositeRenderer.js';
export { HatchPatternLibrary } from './export/sheets/HatchPatternLibrary.js';
export { AnnotationDxfBridge, annotationDxfBridge } from './export/sheets/AnnotationDxfBridge.js';

// export/top-level
export { RationaleExporter } from './export/RationaleExporter.js';
