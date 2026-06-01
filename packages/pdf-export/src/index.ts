// C29 PDF-α-1 (PDF Vector Export) — public surface.
//
// L4 engine layer. The bytes-emitting entry point `sheetToPdfBytes` is the
// only public symbol for the α-1 slice; future slices (PDF-α-2 wiring into a
// Test dev modal; PDF-β PDF/A-3 + IFC embed) extend this barrel.

export * from './SheetToPdf.js';
