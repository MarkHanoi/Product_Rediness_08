/**
 * PV-04 / C75 §7.7 — provenance absence, RECORDED BY NAME, at the file-format
 * export boundary.
 *
 * C75 §7.7 does not permit blank: for every export surface either the C75
 * `ValueProvenance` mapping exists, or its absence is recorded by name as an
 * accepted limitation. Before this file, the DXF, PDF, GLB and legacy-IFC
 * exporters in this package silently stripped provenance — a reader of the
 * exported artefact could not tell "this format cannot carry provenance" from
 * "nobody thought about it", which is the exact §CONTEXT-DATA-HONESTY defect
 * (failure and emptiness rendered as the same value).
 *
 * What this module does:
 *   - Declares, per format, that the `ValueProvenance` mapping is ABSENT,
 *     with the format-specific reason (a typed, named record — not prose in a
 *     comment, which the gate `check-provenance-export-boundary` rightly does
 *     not count).
 *   - Provides the injection helpers that write that declaration INTO the
 *     exported artefact itself (DXF 999 comments, PDF document metadata), so
 *     the absence travels with the file rather than living only in this repo.
 *
 * What this module MUST NEVER do (C75 §1.1, §2.1): supply an origin. No value
 * in any exported file gains `authored` / `observed` / `computed` / `inferred`
 * / `regenerated` from this path — the five are named below ONLY to state that
 * they are NOT carried. An exporter that stamps an invented origin is worse
 * than one that exports nothing.
 *
 * NOTE on the deliberate absence of an `@pryzm/schemas` import: this package
 * does not currently depend on `@pryzm/schemas`, and the declaration needs the
 * vocabulary only by NAME (to record what is not carried), not by type. The
 * canonical vocabulary lives in
 * `packages/schemas/src/provenance/ValueOrigin.ts`; the mapped IFC path that
 * DOES carry it is `plugins/ifc-export/src/provenance.ts`
 * (`PRYZM_ValueProvenance` pset).
 */

/** The C75 §1.1 origin words — named here solely to record their absence. */
const THE_FIVE = ['authored', 'observed', 'computed', 'inferred', 'regenerated'] as const;

export interface ProvenanceExportAbsence {
    /** Which foreign format this declaration covers. */
    readonly format: 'dxf' | 'pdf' | 'glb' | 'ifc-legacy';
    /** Always false — this record exists precisely because no mapping does. */
    readonly mapped: false;
    /** The vocabulary that is not carried: the C75 ValueProvenance record. */
    readonly vocabulary: 'ValueProvenance';
    /** The origin classes that are not represented in the exported file. */
    readonly originsNotCarried: typeof THE_FIVE;
    /** The rule this declaration satisfies. */
    readonly contract: 'C75 §7.7';
    /** WHY the mapping is absent for this format — never a generic shrug. */
    readonly reason: string;
}

/**
 * The per-format register. §7.7's "recorded by name": each entry names the
 * format, the vocabulary, and the reason, so silence is never the record.
 */
export const PROVENANCE_EXPORT_ABSENCES: Readonly<
    Record<ProvenanceExportAbsence['format'], ProvenanceExportAbsence>
> = {
    dxf: {
        format: 'dxf',
        mapped: false,
        vocabulary: 'ValueProvenance',
        originsNotCarried: THE_FIVE,
        contract: 'C75 §7.7',
        reason:
            'DXF entities have no per-entity property-set slot in the OBC DxfExporter ' +
            'pipeline this service drives; XDATA could carry one but no consumer contract ' +
            'exists for it yet. Until then the absence is stated in the file itself as ' +
            '999 comments (see dxfProvenanceAbsenceComment).',
    },
    pdf: {
        format: 'pdf',
        mapped: false,
        vocabulary: 'ValueProvenance',
        originsNotCarried: THE_FIVE,
        contract: 'C75 §7.7',
        reason:
            'A sheet PDF is flattened presentation vectors — per-element identity does not ' +
            'survive svg2pdf, so a per-value provenance mapping has no subject. The absence ' +
            'is stated in the PDF document metadata (see applyPdfProvenanceAbsence).',
    },
    glb: {
        format: 'glb',
        mapped: false,
        vocabulary: 'ValueProvenance',
        originsNotCarried: THE_FIVE,
        contract: 'C75 §7.7',
        reason:
            'GLB export (GLBExporter.ts) carries geometry and materials only; a mapping ' +
            'onto glTF extras is possible but not built. Recorded absent rather than left ' +
            'blank; unlike DXF/PDF the artefact-level injection is not yet wired.',
    },
    'ifc-legacy': {
        format: 'ifc-legacy',
        mapped: false,
        vocabulary: 'ValueProvenance',
        originsNotCarried: THE_FIVE,
        contract: 'C75 §7.7',
        reason:
            'The legacy IFC writer in this package (src/export/ifc/) predates the mapped ' +
            'path and does not write provenance psets. The MAPPED IFC path is ' +
            'plugins/ifc-export (PRYZM_ValueProvenance pset); new work lands there, and ' +
            'this writer is recorded absent rather than silently divergent.',
    },
};

// ─── DXF — the absence travels inside the artefact as 999 comments ───────────

/**
 * A DXF 999-comment block stating the absence. Group code 999 is the DXF
 * comment mechanism (ignored by readers, visible to humans and tools), legal
 * ahead of the first SECTION — where this block is prepended.
 */
export function dxfProvenanceAbsenceComment(): string {
    const a = PROVENANCE_EXPORT_ABSENCES.dxf;
    const lines = [
        `PRYZM ${a.contract} — ${a.vocabulary} NOT MAPPED for DXF (absence recorded by name).`,
        `Value origins (${a.originsNotCarried.join('/')}) are not represented in this file;`,
        'no value in this file carries — or may be assumed to carry — any origin class.',
    ];
    return lines.map((l) => `999\n${l}`).join('\n') + '\n';
}

/** Prepend the 999 absence block to a generated DXF string. */
export function withDxfProvenanceAbsence(dxf: string): string {
    return dxfProvenanceAbsenceComment() + dxf;
}

// ─── PDF — the absence travels in the document metadata ──────────────────────

/** The minimal jsPDF surface needed; structural so tests need no jsPDF. */
export interface PdfPropertiesTarget {
    setProperties(props: { subject?: string; keywords?: string }): unknown;
}

/**
 * Record the absence in the PDF's document metadata (Subject + Keywords —
 * searchable in any PDF reader's document-properties dialog).
 */
export function applyPdfProvenanceAbsence(pdf: PdfPropertiesTarget): void {
    const a = PROVENANCE_EXPORT_ABSENCES.pdf;
    pdf.setProperties({
        subject:
            `PRYZM ${a.contract} — ${a.vocabulary} NOT MAPPED for PDF: ` +
            `value origins (${a.originsNotCarried.join('/')}) are not represented in this document.`,
        keywords: `PRYZM, ${a.vocabulary}, provenance-not-mapped, ${a.contract}`,
    });
}
