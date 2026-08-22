/**
 * titleBlockContext — §SHEET-TITLE-BLOCK-HAS-A-SOURCE (L-3806)
 *
 * THE ONE GATHERER of the title block facts that do not live on the sheet.
 *
 * Layer Affected:  UI — Sheet editor (L7)
 * File:            apps/editor/src/ui/SheetEditor/titleBlockContext.ts
 * ADR:             ADR-0340 (viewport interaction) · C05 (file format)
 * Issue log:       L-3806 (title block binding) · L-3807 (fields with no source)
 *
 * ─── WHY THIS IS SEPARATE FROM THE RESOLVER ────────────────────────────────
 * `resolveTitleBlockValues` (in `@pryzm/file-format/sheets`) is L3 and PURE: it
 * formats. This file is L7 and IMPURE: it reads the runtime and the site store,
 * which are the only places these facts exist. Splitting them is what lets the
 * formatting rule — *a field with no source renders EMPTY* — be unit-tested
 * without a runtime, and it keeps a cross-package dependency from being created
 * for a formatting concern.
 *
 * ⭐ THE FAILURE MODE OF THIS FILE IS THE SAFE ONE. Every read is guarded and
 * every failure yields `null`, which the resolver renders as an EMPTY field.
 * There is no path through this module that produces a plausible-looking value
 * from a failed read — which is the founder's rule:
 *
 *   "A field with no source must render EMPTY, never a placeholder that looks
 *    like data — an invented address on a drawing is worse than a blank one."
 *
 * ⛔ SO: NO FALLBACKS, NO DEFAULTS, NO 'Untitled Project'. `'Untitled Project'`
 * is a real string in `ProjectSerializer` and `MigrationEngine`, and pulling it
 * onto a drawing would print a project name that the user never chose and that
 * names nothing. It is filtered out below BY VALUE for exactly that reason.
 *
 * L7 file. No THREE (P2), no rAF (P3), no store writes (P6).
 */

import type { TitleBlockContext } from '@pryzm/file-format/sheets';

/**
 * Sentinel project names that exist in the persistence layer as placeholders
 * and must never reach a drawing.
 *
 * `ProjectSerializer.ts:1357` writes `projectName: opts.projectName ?? 'Untitled
 * Project'` and `MigrationEngine.ts:77` backfills the same literal onto any
 * snapshot missing one. Both are correct for a FILE HEADER — a file needs a
 * name. Neither is a project name a human chose, so on a title block they are
 * exactly the "placeholder that looks like data" the rule forbids.
 */
const PLACEHOLDER_PROJECT_NAMES = new Set([
    'untitled project',
    'untitled',
    'project',
    'new project',
]);

/** Narrow shape of the runtime bits this module reads. Nothing is assumed. */
interface RuntimeLike {
    projectContext?: { projectName?: string | null } | undefined;
    siteModelStore?: {
        getLocation?: () => { siteAddress?: string | null } | null;
    } | undefined;
}

/**
 * Anything → a real value or `null`. Blank and whitespace-only collapse to
 * `null` so they cannot masquerade as a filled field.
 */
function _val(v: unknown): string | null {
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Read the project name, refusing the persistence-layer placeholders.
 *
 * Case-insensitive because the sentinel is written with different casing in
 * different places, and a title block reading "untitled project" is no more
 * informative than one reading "Untitled Project".
 */
function _projectName(rt: RuntimeLike | null): string | null {
    const raw = _val(rt?.projectContext?.projectName);
    if (raw === null) return null;
    return PLACEHOLDER_PROJECT_NAMES.has(raw.toLowerCase()) ? null : raw;
}

/**
 * Read the site's postal address.
 *
 * ⚠ THIS IS THE FIELD THE FOUNDER NAMED. His console prints
 * `CL PERELLO 60 BARCELONA` — the catastro/parcel address — and his title block
 * showed ADDRESS blank, because nothing ever read it. The source is
 * `siteModelStore.getLocation()?.siteAddress` (C19 §2; the schema field is
 * `siteAddress`, NOT `address`, which is why a search for `projectAddress`
 * across the repo returns only the template definitions and no producer).
 *
 * ⛔ PII per C22. Read here, formatted in `resolveTitleBlockValues`, drawn on
 * the sheet. Never cached, never defaulted, and never synthesised from
 * latitude/longitude — a coordinate pair rendered as a street address would be
 * an invented address in its most convincing form.
 */
function _siteAddress(rt: RuntimeLike | null): string | null {
    try {
        return _val(rt?.siteModelStore?.getLocation?.()?.siteAddress);
    } catch (err) {
        // A failed read is NOT an address. Say nothing rather than something.
        console.warn('[titleBlockContext] site location read failed:', err);
        return null;
    }
}

/**
 * Gather the title block context from live application state.
 *
 * Every caller that renders or exports a title block should use this, so the
 * sheet on screen and the sheet in the PDF cannot disagree about the project
 * they document. Returns an object whose every field may legitimately be
 * `null`; the resolver turns `null` into an empty field.
 *
 * @param runtime — the composed runtime. Optional: when it is absent (headless,
 *   early boot, a test host) every field is `null` and every title block field
 *   sourced from here renders blank, which is correct rather than degraded.
 */
export function gatherTitleBlockContext(runtime?: unknown): TitleBlockContext {
    const rt = (runtime ?? null) as RuntimeLike | null;

    return {
        projectName:    _projectName(rt),
        projectAddress: _siteAddress(rt),

        // ⛔ NO SOURCE IN THE MODEL TODAY — and therefore explicitly null, not
        // quietly omitted. Nothing records who drew, checked or approved a
        // sheet, and nothing records a contract number.
        //
        // `sheet.issuedBy` EXISTS and was the obvious candidate for `drawnBy`.
        // It is deliberately NOT used: issuing and drawing are different acts,
        // and printing a real person's name against work they may not have done
        // is a fabricated attribution on a legal instrument. Tracked as L-3807;
        // the fix is a field in the sheet model and an editor for it, not a
        // guess here.
        drawnBy:    null,
        checkedBy:  null,
        approvedBy: null,
        contractNo: null,
    };
}
