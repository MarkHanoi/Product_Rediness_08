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
export type { DxfLayer, DxfPolyline, DxfDocument } from './DxfParser.ts';
export { DXF_UNITS_TO_METRES, parseDxfString, parseDxfFile } from './DxfParser.ts';
export type { DxfGroupMetadata } from './DxfGeometryBuilder.ts';
export { buildDxfGeometry, setLayerVisible, setLayerColor, disposeDxfGroup } from './DxfGeometryBuilder.ts';

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
export { DxfLayerStore, dxfLayerStore } from './import/dxf/DxfLayerStore.ts';
export { dxfOverlayStore } from './import/dxf/DxfOverlayStore.ts';
export type { DxfOverlayRecord } from './import/dxf/DxfOverlayStore.ts';
export { renderDxfOnPlanView } from './import/dxf/DxfPlanViewProjector.ts';
export type { DxfPlanViewProjectorOptions, WorldToCanvasFn } from './import/dxf/DxfPlanViewProjector.ts';
export { traceDxfToWalls } from './import/dxf/DxfToBimTracer.ts';
export type { TraceOptions } from './import/dxf/DxfToBimTracer.ts';
export { DwgConversionError, convertDwgFile } from './import/dxf/DwgImportAdapter.ts';
export type { DwgConversionProgress } from './import/dxf/DwgImportAdapter.ts';

// import/ifc
export {
  isIfcImportedElement,
  deleteIfcImportedElement,
} from './import/ifc/deleteIfcElement.ts';
export type { DeleteIfcImportedElementOptions } from './import/ifc/deleteIfcElement.ts';
export { IfcGeometryRenderer } from './import/ifc/IfcGeometryRenderer.ts';
export type { IfcRenderedModel } from './import/ifc/IfcGeometryRenderer.ts';
export {
  IfcImporter,
  importFromIfcFile,
  importFromIfcBytes,
} from './import/ifc/IfcImporter.ts';
export type {
  ImportedRoom,
  ImportedHierarchyNode,
  ImportedRelationship,
  IfcStoreyRecord,
  IfcImportResult,
} from './import/ifc/IfcImporter.ts';
export { importIfcLevelsAndViews } from './import/ifc/IfcLevelImporter.ts';
export type { IfcLevelImportSummary } from './import/ifc/IfcLevelImporter.ts';
export { ifcModelStore } from './import/ifc/IfcModelStore.ts';
export type { IfcElementRecord, IfcModelData } from './import/ifc/IfcModelStore.ts';

// import/ifc/conversion
export { IfcConversionCoordinator } from './import/ifc/conversion/IfcConversionCoordinator.ts';
export type { IfcConversionStats, IfcConversionReport } from './import/ifc/conversion/IfcConversionTypes.ts';
export { ifcConversionReportStore } from './import/ifc/conversion/IfcConversionReportStore.ts';

// import/rhino
export { importRhino3DM } from './import/rhino/RhinoImporter.ts';
export type { RhinoImportStats, RhinoImportResult } from './import/rhino/RhinoImporter.ts';

// import/top-level
export { convertImageToImportResult } from './import/ImageToImportConverter.ts';
export { convertPDFPage1ToImage } from './import/PDFToImageConverter.ts';
export type { TextAnnotationItem, PDFConversionResult } from './import/PDFToImageConverter.ts';

// export/glb
export { exportFragmentsToGLB, downloadBlobUrl, revokeBlobUrl } from './export/glb/GLBExporter.ts';

// export/ifc
export { exportIFC } from './export/ifc/ExportIFC.ts';
export { auditIfcWorkflow } from './export/ifc/auditIfc.ts';
export type { AuditResult } from './export/ifc/auditIfc.ts';
export { IfcExporter } from './export/ifc/IfcExporter.ts';
export { getImportedIfcElementCount, showExportScopeModal } from './export/ifc/exportScope.ts';

// export/sheets
export { dxfExportService } from './export/sheets/DxfExportService.ts';
export type { DxfExportServiceImpl } from './export/sheets/DxfExportService.ts';
export { pdfExportService } from './export/sheets/PdfExportService.ts';
export type { PdfExportServiceImpl } from './export/sheets/PdfExportService.ts';
export { sheetExportService } from './export/sheets/SheetExportService.ts';
export type { SheetExportServiceImpl } from './export/sheets/SheetExportService.ts';
export { SVGCompositeRenderer } from './export/sheets/SVGCompositeRenderer.ts';
export { HatchPatternLibrary } from './export/sheets/HatchPatternLibrary.ts';
export { AnnotationDxfBridge, annotationDxfBridge } from './export/sheets/AnnotationDxfBridge.ts';

// export/top-level
export { RationaleExporter } from './export/RationaleExporter.ts';
