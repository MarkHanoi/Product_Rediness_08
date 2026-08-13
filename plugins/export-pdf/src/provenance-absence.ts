// @pryzm/plugin-export-pdf — PV-04 / C75 §7.7: the ValueProvenance mapping
// for PDF is ABSENT, and that absence is recorded here BY NAME rather than
// left blank.
//
// This package is still the F-prereq.0 shell — no PDF export pipeline lives
// here yet. The sheet PDFs PRYZM currently writes come from
// `packages/file-format/src/export/sheets/PdfExportService.ts`, which states
// the same absence INSIDE each exported document's metadata (Subject +
// Keywords; see `packages/file-format/src/export/provenanceAbsence.ts` for
// the register).
//
// Why this file exists in an empty shell: C75 §7.7 does not permit blank at a
// declared export surface — either the mapping exists or its absence is a
// named, accepted limitation. This is the named limitation for the plugin
// surface, binding on the F.x wiring that lands here: a flattened sheet PDF
// has no per-element identity after svg2pdf, so the C75 origin classes
// (authored / observed / computed / inferred / regenerated) do not cross this
// boundary, and NO value in a PDF written by PRYZM may be presumed to carry
// any of them (C75 §1.4 — absence is never read as one of the five).
//
// ⛔ Never invented (C75 §1.1/§2.1): this declaration names the vocabulary
// only to state that it is NOT carried. When the F.x PDF pipeline lands here,
// it either maps `ValueProvenance` (e.g. structured XMP metadata) and deletes
// this record, or it carries this record's statement into its output —
// silently dropping provenance is the defect this file exists to forbid.

export const PDF_PROVENANCE_MAPPING = {
    format: 'pdf',
    mapped: false,
    vocabulary: 'ValueProvenance',
    originsNotCarried: ['authored', 'observed', 'computed', 'inferred', 'regenerated'],
    contract: 'C75 §7.7',
    reason:
        'A flattened sheet PDF has no per-element identity after svg2pdf; the ' +
        'absence is stated in each document\'s metadata by ' +
        'packages/file-format/src/export/sheets/PdfExportService.ts.',
} as const;
