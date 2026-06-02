// A.34.a (Phase A · Sprint 2) — @pryzm/a11y-tokens public surface.
//
// L2-pure (no DOM) WCAG contrast calculator + registry of every
// declared PRYZM color-token pair the editor renders. CI runs
// `auditTokenPairs()` as part of the WCAG gate per [C43 §1.5].
//
// Strategic context:
//   - docs/02-decisions/contracts/C43-ACCESSIBILITY.md §1.5
//   - docs/03-execution/plans/master-execution-tracker.md A.34

export {
    parseHexColor,
    relativeLuminance,
    contrastRatio,
    checkContrast,
    WCAG_AA_NORMAL,
    WCAG_AA_LARGE,
    WCAG_AAA_NORMAL,
    WCAG_AAA_LARGE,
    WCAG_AA_NON_TEXT,
    type Rgb,
    type ContrastCheckResult,
    type WcagLevel,
    type TextSize,
} from './contrast.js';

export {
    PRYZM_TOKENS,
    TOKEN_PAIRS,
    auditTokenPairs,
    type TokenPair,
    type AuditFinding,
    type AuditReport,
} from './tokens.js';
