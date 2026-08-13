/**
 * PV-04 / C75 §7.7 — the absence record at the file-format export boundary.
 *
 * The negative claims are the ones that matter (C74 §3.4 / C75 §1.1): the
 * absence machinery must never mint an origin. A declaration that names the
 * five only to say they are NOT carried must be impossible to read as a claim
 * that any of them applies.
 */

import { describe, expect, it } from 'vitest';

import {
    PROVENANCE_EXPORT_ABSENCES,
    applyPdfProvenanceAbsence,
    dxfProvenanceAbsenceComment,
    withDxfProvenanceAbsence,
} from '../src/export/provenanceAbsence';

describe('PV-04 §7.7 — provenance absence recorded by name', () => {
    it('every declared format records mapped=false, the vocabulary, and a reason', () => {
        const formats = Object.keys(PROVENANCE_EXPORT_ABSENCES);
        expect(formats.sort()).toEqual(['dxf', 'glb', 'ifc-legacy', 'pdf']);
        for (const a of Object.values(PROVENANCE_EXPORT_ABSENCES)) {
            expect(a.mapped).toBe(false);
            expect(a.vocabulary).toBe('ValueProvenance');
            expect(a.contract).toBe('C75 §7.7');
            expect(a.reason.length).toBeGreaterThan(40); // never a generic shrug
            expect(a.originsNotCarried).toEqual([
                'authored', 'observed', 'computed', 'inferred', 'regenerated',
            ]);
        }
    });

    it('DXF: the absence travels inside the artefact as 999 comments', () => {
        const comment = dxfProvenanceAbsenceComment();
        // Every payload line is preceded by a 999 group code (DXF comment).
        const lines = comment.trimEnd().split('\n');
        for (let i = 0; i < lines.length; i += 2) expect(lines[i]).toBe('999');
        expect(comment).toContain('ValueProvenance NOT MAPPED');
        expect(comment).toContain('C75 §7.7');

        const dxf = '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n';
        const out = withDxfProvenanceAbsence(dxf);
        expect(out.startsWith('999\n')).toBe(true);
        expect(out.endsWith(dxf)).toBe(true); // original artefact untouched
    });

    it('PDF: the absence lands in document metadata', () => {
        const calls: Array<{ subject?: string; keywords?: string }> = [];
        applyPdfProvenanceAbsence({ setProperties: (p) => calls.push(p) });
        expect(calls).toHaveLength(1);
        expect(calls[0].subject).toContain('ValueProvenance NOT MAPPED for PDF');
        expect(calls[0].keywords).toContain('provenance-not-mapped');
    });

    it('NEGATIVE (C74 §3.4): the absence record never claims an origin', () => {
        // No emitted statement may be readable as "this value IS <origin>".
        // The five appear only inside the joined not-carried list.
        const emitted = [
            dxfProvenanceAbsenceComment(),
        ];
        const capturedPdf: Array<{ subject?: string; keywords?: string }> = [];
        applyPdfProvenanceAbsence({ setProperties: (p) => capturedPdf.push(p) });
        emitted.push(`${capturedPdf[0].subject} ${capturedPdf[0].keywords}`);

        const claimShapes = [
            /origin\s*[:=]\s*(authored|observed|computed|inferred|regenerated)/i,
            /\bis\s+(authored|observed|computed|inferred|regenerated)\b/i,
        ];
        for (const text of emitted) {
            for (const shape of claimShapes) expect(text).not.toMatch(shape);
            // The five appear only as the slash-joined NOT-carried list.
            expect(text).toContain('authored/observed/computed/inferred/regenerated');
        }
    });
});
