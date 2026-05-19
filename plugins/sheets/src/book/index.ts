// Book module barrel (S40 / Phase 2C).
export {
  BookSchema,
  type BookData,
  addSheetToBook,
  removeSheetFromBook,
  moveSheetInBook,
  createBook,
} from './book.js';
export {
  exportBook,
  type BookExportOptions,
  type BookExportResult,
  type ExportProgress,
  type SheetPageRenderer,
  type SheetRenderRequest,
  type SheetRenderResult,
  type DocumentAssembler,
  type SheetExportFormat,
} from './book-exporter.js';
