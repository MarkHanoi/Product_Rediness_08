// @pryzm/plugin-dxf — PV-04 / C75 §7.7: the ValueProvenance mapping for DXF
// is ABSENT, and that absence is recorded here BY NAME rather than left blank.
//
// This package is still the F-prereq.0 shell — no DXF export pipeline lives
// here yet. The DXF that PRYZM currently writes comes from
// `packages/file-format/src/export/sheets/DxfExportService.ts`, which states
// the same absence INSIDE each exported artefact as DXF 999 comments (see
// `packages/file-format/src/export/provenanceAbsence.ts` for the register).
//
// Why this file exists in an empty shell: C75 §7.7 does not permit blank at a
// declared export surface — either the mapping exists or its absence is a
// named, accepted limitation. This is the named limitation for the plugin
// surface, binding on the F.x wiring that lands here: DXF entities carry no
// property-set slot in the current pipeline, so the C75 origin classes
// (authored / observed / computed / inferred / regenerated) do not cross this
// boundary, and NO value in a DXF file written by PRYZM may be presumed to
// carry any of them (C75 §1.4 — absence is never read as one of the five).
//
// ⛔ Never invented (C75 §1.1/§2.1): this declaration names the vocabulary
// only to state that it is NOT carried. When the F.x DXF pipeline lands here,
// it either maps `ValueProvenance` (e.g. via XDATA) and deletes this record,
// or it carries this record's statement into its output — silently dropping
// provenance is the defect this file exists to forbid.

export const DXF_PROVENANCE_MAPPING = {
    format: 'dxf',
    mapped: false,
    vocabulary: 'ValueProvenance',
    originsNotCarried: ['authored', 'observed', 'computed', 'inferred', 'regenerated'],
    contract: 'C75 §7.7',
    reason:
        'DXF entities have no property-set slot in the current export pipeline; ' +
        'the absence is stated in each artefact as 999 comments by ' +
        'packages/file-format/src/export/sheets/DxfExportService.ts.',
} as const;
