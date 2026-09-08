/**
 * parcelLawTypeScale — ⭐ THE ONE TYPE BASE OF THE PARCEL LAW PANEL, AS A MODULE.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/parcelLawTypeScale.ts
 * Contracts:       C115 §4.3 (`C115-36` / `C115-37` — typography is part of the vocabulary) ·
 *                  C43 / WCAG 2.2 AA (`MIN_FONT_PX = 10`) · C08 §3.1 (no HTML sink — this file
 *                  emits no DOM at all)
 * Issue log:       L-13077 (the founder's ruling) · L-13201 (this extraction)
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ⭐ WHY THIS FILE EXISTS: A THIRD SET OF NUMBERS WOULD HAVE BEEN THE THIRD DEFECT
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * Founder, 2026-09-07, on the section this lane moved: *"MAKE IT WITH THE CORRECT TEXT AND SIZE
 * TEXT OF PRYZM: LIKE THE OTHER SECTIONS."*
 *
 * Measured before the fix, `parcelLawEnvelopeAuthoring.ts` carried **15 inline `px` literals**, of
 * which **12 sat BELOW the `MIN_FONT_PX = 10` legibility floor** (7×`9.5px`, 4×`9px`,
 * 1×`font:600 9.5px`). Every one of them bypassed `uiScale.ts` — §UI-DENSITY-SCALE transforms the
 * ASSEMBLED STYLESHEET only, so an inline literal moves with nothing and clears no floor — and the
 * six unrelated sizes (9 · 9.5 · 10 · 10.5 · 11) encoded no ratio, so no reader could tell which
 * differences were meant.
 *
 * ⛔ THE FIX IS TO ADOPT THE EXISTING BASE, NEVER TO PICK NEW NUMBERS. `parcelLawFacts.ts` and
 * `parcelLawIntentAgainstCeiling.ts` already declare exactly this base, twice, held equal by the
 * founder's ruling **L-13077** and asserted equal by `parcelLawFacts.spec.ts` arm C. Hand-tuning a
 * second set of sizes is precisely how the panel became inconsistent in the first place, and a
 * THIRD hand-written copy would compound it — so the numbers move here and are imported.
 *
 * ⚠ HONEST STATUS: THIS IS THE THIRD DECLARATION TODAY, NOT YET THE ONLY ONE. The two existing
 * copies still declare their own `SCALE_BASE_PX`, because `parcelLawFacts.spec.ts` arm C reads
 * that literal out of both files with a regex and would stop being able to see either if one
 * became an import. Collapsing them onto this module is a follow-up for the lane that owns those
 * files (§1), and `parcelLawTypeScale.spec.ts` asserts THIS module equal to
 * `parcelLawIntentAgainstCeiling.ts`'s literal in the meantime, so the third copy cannot drift
 * silently either. Three declarations pinned equal by two specs is strictly better than three
 * declarations pinned by nothing; it is not the end state.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ⛔ HOW TO USE IT: ONE `px` ON THE ROOT, `em` RATIOS EVERYWHERE BELOW
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * A section declares `font-size:${PLAW_SCALE_BASE_PX}px` on its ROOT and expresses every child as
 * a ratio of it. Nothing below the root may carry a `px` font-size — that is arm A of the specs
 * that police this — and no chain of `em` steps may compound below 10 px, which is arm B.
 * `0.87em` is legal everywhere and lands at 8.7 px on a child of an already-stepped heading; only
 * a spec that resolves the whole chain can see that, so both arms are needed.
 *
 * This module contains no DOM, no I/O and no logic — it is four numbers and the reasoning behind
 * them, which is the smallest thing that can stop the fifth number being invented.
 */

/**
 * The panel's type base, in px. ⛔ Held EQUAL to `parcelLawFacts.ts`'s and
 * `parcelLawIntentAgainstCeiling.ts`'s `SCALE_BASE_PX` by the founder's ruling L-13077. A section
 * declares this ONCE, on its root, in px; nothing below it may.
 */
export const PLAW_SCALE_BASE_PX = 11.5;

/**
 * FIGURES — the measured quantities a reader came for. The base itself, 1×.
 *
 * ⛔ A ceiling's figure is the SAME size and weight as the intent beside it. De-weighting the
 * law's number hides it as effectively as deleting it, one step more deniably (C115 §4.3).
 */
export const PLAW_SCALE_FIGURE = '1em';

/** SECTION HEADINGS — one small step down from the figures, because a heading is not a value. */
export const PLAW_SCALE_HEADING = '0.96em';

/** LABELS — the prose half of a row, naming the figure beside it. One step down. */
export const PLAW_SCALE_LABEL = '0.91em';

/** PROSE — ledes, refusals, advisories, source lines, notes. Two steps down. Lands at 10.005 px. */
export const PLAW_SCALE_PROSE = '0.87em';

/**
 * The form-control font family. Inputs and buttons do NOT inherit `font-family` from their
 * ancestors in any browser, so a control that omits it renders in the UA's own face beside prose
 * that does not — which is what the `font:600 Npx system-ui` shorthands in this panel were
 * compensating for. The shorthand also RESETS `font-weight`, `line-height` and `font-family`
 * together, which is why it is replaced by longhands rather than merely re-sized.
 */
export const PLAW_CONTROL_FONT_FAMILY = 'system-ui';
