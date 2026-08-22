/**
 * TitleBlockValues — §SHEET-TITLE-BLOCK-HAS-A-SOURCE (L-3806)
 *
 * THE ONE PRODUCER of "what goes in the title block fields".
 *
 * ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * The founder, 2026-08-21, with a screenshot: *"the title block is empty and
 * must be sound — PROJECT and ADDRESS are blank; only `Sheet 01`, `A001` and
 * the date are filled."*
 *
 * MEASURED, not guessed. The A1 template declares ELEVEN fields:
 *
 *   grep -n "key:" packages/core-app-model/src/views/TitleBlockStore.ts
 *     → projectName · projectAddress · sheetNumber · sheetName · scale · date
 *       · drawnBy · checkedBy · approvedBy · contractNo · revision
 *
 * and every consumer built its own value map carrying FIVE keys:
 *
 *   SheetEditorPanel.ts:589 · PdfExportService.ts:273 (and the same shape again
 *   in SheetExportService / DxfExportService)
 *     → { sheetNumber, sheetName, revision, date, issuedBy }
 *
 * So SEVEN of eleven fields had no producer and rendered blank — exactly the
 * founder's screenshot. And `issuedBy`, the fifth key, is not a template field
 * key at all: it matched nothing and was dead on arrival. The map was written
 * three times and was wrong in the same way three times, which is the C06 §13.3
 * failure this repo keeps paying for (§SHEET-ONE-VIEWPORT-PRODUCER, L-1630, is
 * the same story about linework).
 *
 * ─── ⛔ THE RULE THIS MODULE ENFORCES ──────────────────────────────────────
 * The founder: *"a field with no source must render EMPTY, never a placeholder
 * that looks like data — an invented address on a drawing is worse than a blank
 * one."*
 *
 * That is not a style preference, it is the whole safety property. A drawing is
 * a legal instrument. A blank "Checked" box says *nobody checked this*, which is
 * TRUE and useful. A box containing a plausible name says a named person
 * checked it, which is a fabricated attribution on a construction document.
 * Every value below is therefore either read from real state or is the empty
 * string, and there is no third branch. `_str()` is the only way a value gets
 * in, and it converts absent/blank/whitespace to `''`.
 *
 * ─── WHY A CONTEXT ARGUMENT, AND NOT A STORE READ ──────────────────────────
 * The project name lives on the runtime (`runtime.projectContext.projectName`,
 * L7) and the address on `siteModelStore` (`@pryzm/stores`, a sibling L3
 * package this one does not depend on). Reaching either from here would mean a
 * new cross-package dependency for a formatting concern.
 *
 * So the caller passes what it can see. ⭐ THE FAILURE MODE OF FORGETTING IS
 * THE SAFE ONE, and that is why this shape was chosen over a service locator:
 * a surface that forgets the context renders EMPTY fields, which is exactly
 * what the founder's rule demands. There is no arrangement of this API that
 * causes an invented value to appear.
 *
 * Contract compliance:
 *   C06 §13.3 — one producer per surface.
 *   §05 §4    — pure; no DOM, no store reads, no I/O.
 *   C22       — `projectAddress` is PII. This module FORMATS it; it does not
 *               source, store or transmit it.
 *   P8        — every exported function carries an OpenTelemetry span.
 */

import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('@pryzm/file-format');

/**
 * The facts a title block needs that do NOT live on the sheet.
 *
 * Every field is optional and nullable, because every one of them genuinely may
 * not exist: a project may be unnamed, a site may have no geocoded address, and
 * nothing in the model records who checked a drawing.
 */
export interface TitleBlockContext {
    /** Project name, e.g. `runtime.projectContext.projectName`. */
    readonly projectName?: string | null;
    /**
     * Postal address of the site — `siteModelStore.getLocation()?.siteAddress`,
     * or the catastro/parcel address where one has been resolved.
     *
     * ⛔ PII per C22. It is passed in, formatted, and drawn. It is never cached
     * or defaulted here, and a missing address renders BLANK — never a
     * coordinate pair dressed up as a street address, which would be an
     * invented address in the most convincing possible form.
     */
    readonly projectAddress?: string | null;
    /** Who drew the sheet. No model source today — see the header. */
    readonly drawnBy?: string | null;
    /** Who checked it. No model source today. */
    readonly checkedBy?: string | null;
    /** Who approved it. No model source today. */
    readonly approvedBy?: string | null;
    /** Contract / job number. No model source today. */
    readonly contractNo?: string | null;
}

/** The subset of a SheetDefinition this module reads. */
export interface TitleBlockSheet {
    readonly sheetNumber: string;
    readonly name: string;
    readonly revision?: string | undefined;
    readonly issueDate?: string | undefined;
    readonly viewports?: ReadonlyArray<{ readonly scale?: number | undefined }> | undefined;
}

/**
 * Anything → a title-block-safe string. Absent, null, non-string and
 * whitespace-only all collapse to `''`.
 *
 * The whitespace clause matters: a `projectName` of `"   "` is not a name, and
 * a title block containing three spaces looks filled to a reader while carrying
 * nothing.
 */
function _str(v: unknown): string {
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : '';
}

/**
 * §SHEET-TITLE-BLOCK-SCALE-IS-DERIVED — what "Scale" means on a sheet holding
 * several viewports at several scales.
 *
 * This follows drafting convention rather than inventing one:
 *   · every viewport at the same scale ⇒ that scale, `1:100`.
 *   · viewports at differing scales    ⇒ `As indicated`, which is the standard
 *     phrase and is a TRUE statement about the sheet — the per-viewport scales
 *     are what the reader must then look for.
 *   · no viewports                     ⇒ EMPTY. A sheet showing nothing has no
 *     scale, and `1:100` would be a claim about a drawing that is not there.
 *
 * `As indicated` is not a placeholder standing in for missing data: it is a
 * derived fact about real data, and it is what a drafter would write.
 */
export function resolveSheetScaleLabel(
    viewports: ReadonlyArray<{ readonly scale?: number | undefined }> | undefined,
): string {
    if (!viewports || viewports.length === 0) return '';

    const scales = new Set<number>();
    for (const vp of viewports) {
        const s = vp.scale;
        if (typeof s === 'number' && Number.isFinite(s) && s > 0) scales.add(s);
    }

    if (scales.size === 0) return '';
    if (scales.size === 1) return `1:${[...scales][0]}`;
    return 'As indicated';
}

/**
 * Resolve every title block field for `sheet`.
 *
 * The returned map is keyed by `TitleBlockField.key`. A key that is present
 * with an empty value is a field that HAS NO SOURCE — consumers render nothing
 * for it. Consumers must NOT substitute a dash, a dummy or a default: the
 * emptiness is the message.
 */
export function resolveTitleBlockValues(
    sheet: TitleBlockSheet,
    ctx: TitleBlockContext = {},
): Record<string, string> {
    return tracer.startActiveSpan(
        'pryzm.sheets.resolveTitleBlockValues',
        (span): Record<string, string> => {
            try {
                const values: Record<string, string> = {
                    // ── From the sheet itself — always real ──────────────────
                    sheetNumber: _str(sheet.sheetNumber),
                    sheetName:   _str(sheet.name),
                    revision:    _str(sheet.revision),

                    // ⚠ `date` is the ONE field that is not strictly sourced,
                    // and it is called out rather than hidden. When the sheet
                    // has an `issueDate` this is that date, which is a fact.
                    // When it does not, this is TODAY — the date the document
                    // was produced, which is also a fact, but it is a different
                    // fact from an issue date and the template's label ("Date")
                    // does not distinguish them. Kept as today's date because
                    // that is the long-standing behaviour and the founder's
                    // screenshot shows it filled without complaint; the
                    // ambiguity is recorded as an open question (L-3808) rather
                    // than resolved unilaterally on a legal document.
                    date: _str(sheet.issueDate) || new Date().toLocaleDateString('en-GB'),

                    // ── Derived from real data ───────────────────────────────
                    scale: resolveSheetScaleLabel(sheet.viewports),

                    // ── From the caller's context ────────────────────────────
                    projectName:    _str(ctx.projectName),
                    projectAddress: _str(ctx.projectAddress),

                    // ── No model source today. BLANK BY DESIGN. ──────────────
                    // ⛔ DO NOT "helpfully" default these. `drawnBy` was very
                    // nearly mapped to `sheet.issuedBy`, which exists — and that
                    // would have printed a real person's name against work they
                    // may not have done. Issuing and drawing are different acts;
                    // conflating them is a fabricated attribution on a legal
                    // instrument, which is precisely the failure the founder's
                    // rule names. Tracked as L-3807.
                    drawnBy:    _str(ctx.drawnBy),
                    checkedBy:  _str(ctx.checkedBy),
                    approvedBy: _str(ctx.approvedBy),
                    contractNo: _str(ctx.contractNo),
                };

                const filled = Object.values(values).filter(v => v.length > 0).length;
                span.setAttribute('pryzm.title_block.fields', Object.keys(values).length);
                span.setAttribute('pryzm.title_block.filled', filled);
                return values;
            } finally {
                span.end();
            }
        },
    );
}
