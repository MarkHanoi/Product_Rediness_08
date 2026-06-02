// A.34.a — Canonical PRYZM color tokens + their declared usage pairs.
//
// The audit gate per [C43 §1.5] is: every (fg, bg) pair the editor
// renders MUST meet WCAG 2.2 AA, with AAA on text-dense surfaces. This
// file holds the master token registry + every legal pair declaration.
// CI runs `auditTokenPairs()` against this list — adding a new combo
// is a 1-line PR; failing combos are caught at build.
//
// Strategic context: docs/02-decisions/contracts/C43-ACCESSIBILITY.md §1.5.

import { checkContrast, type ContrastCheckResult, type TextSize, type WcagLevel } from './contrast.js';

/**
 * The canonical PRYZM color tokens. Append-only — renaming an id breaks
 * downstream theme overrides. The HEX value is the canonical sRGB value;
 * tools that need lab / oklch can convert downstream.
 */
export const PRYZM_TOKENS: Readonly<Record<string, string>> = {
    // ── Brand ──────────────────────────────────────────────────────────
    'pryzm-purple': '#6600FF',          // canonical brand purple
    'pryzm-purple-darker': '#4A00B7',   // hover / pressed
    'pryzm-purple-lighter': '#8C4DFF',  // subtle accent
    // ── Surfaces (dark theme — default) ───────────────────────────────
    'ink': '#0A0A0F',                   // app background
    'paper': '#14141C',                 // panel background
    'paper-elevated': '#1C1C28',        // modal / popover background
    'border': '#2A2A36',                // panel border (decorative)
    // ── Text on dark ──────────────────────────────────────────────────
    'text-primary': '#F5F5FA',          // body copy
    'text-secondary': '#A8A8B5',        // de-emphasised
    'text-muted': '#6A6A78',            // hints / placeholders
    // ── Semantic ──────────────────────────────────────────────────────
    'success': '#00C781',
    'warning': '#FFAA00',
    'error': '#FF5252',
    'info': '#4DA6FF',
    // ── A.34.b focus + form controls (ESSENTIAL non-text per WCAG 1.4.11) ─
    'focus-ring': '#C2A4FF',            // visible focus indicator on every dark surface
    'form-border': '#7E7E94',           // resting state of form-input borders
    'form-border-focused': '#C2A4FF',   // focused state — aligns with focus-ring
    'form-border-error': '#FF5252',     // invalid state — aligns with semantic.error
};

/**
 * One legal (foreground, background) usage. The audit asserts that the
 * pair meets `minLevel` for the declared `size`.
 *
 *   - 'text-primary' on 'ink' → AA normal (this is body copy on the app bg)
 *   - 'text-muted' on 'paper' → AA normal (placeholders / hints)
 *   - 'pryzm-purple' on 'ink' → AA large (used for big CTA buttons only)
 *
 * AAA is the target for "text-dense" surfaces per [C43 §1.5]; the
 * registry uses AAA when the contract names a surface (inspect tree,
 * data panel, cost breakdown, schedule list, support detail).
 */
export interface TokenPair {
    readonly id: string;
    readonly foreground: keyof typeof PRYZM_TOKENS;
    readonly background: keyof typeof PRYZM_TOKENS;
    readonly size: TextSize;
    readonly minLevel: WcagLevel;
    readonly usage: string;
}

export const TOKEN_PAIRS: readonly TokenPair[] = [
    // ── Body copy on app background ───────────────────────────────────
    {
        id: 'body-on-ink',
        foreground: 'text-primary',
        background: 'ink',
        size: 'normal',
        minLevel: 'AA',
        usage: 'body copy across the app',
    },
    {
        id: 'body-on-paper',
        foreground: 'text-primary',
        background: 'paper',
        size: 'normal',
        minLevel: 'AA',
        usage: 'body copy inside panels',
    },
    {
        id: 'body-on-paper-elevated',
        foreground: 'text-primary',
        background: 'paper-elevated',
        size: 'normal',
        minLevel: 'AA',
        usage: 'modal / popover body text',
    },
    // ── Text-dense surfaces → AAA ─────────────────────────────────────
    {
        id: 'inspect-tree-row',
        foreground: 'text-primary',
        background: 'paper',
        size: 'normal',
        minLevel: 'AAA',
        usage: 'inspect tree row text — AAA per C43 §1.5',
    },
    {
        id: 'data-panel-cell',
        foreground: 'text-primary',
        background: 'paper',
        size: 'normal',
        minLevel: 'AAA',
        usage: 'data panel grid cell — AAA per C43 §1.5',
    },
    // ── Secondary + muted text ────────────────────────────────────────
    {
        id: 'secondary-on-paper',
        foreground: 'text-secondary',
        background: 'paper',
        size: 'normal',
        minLevel: 'AA',
        usage: 'de-emphasised text inside panels',
    },
    // ── Brand on dark — large CTA only ────────────────────────────────
    {
        id: 'cta-purple-on-ink',
        foreground: 'pryzm-purple-lighter',
        background: 'ink',
        size: 'large',
        minLevel: 'AA',
        usage: 'primary CTA button label on app background',
    },
    // ── Semantic on paper ─────────────────────────────────────────────
    {
        id: 'success-on-paper',
        foreground: 'success',
        background: 'paper',
        size: 'normal',
        minLevel: 'AA',
        usage: 'success state label',
    },
    {
        id: 'warning-on-paper',
        foreground: 'warning',
        background: 'paper',
        size: 'normal',
        minLevel: 'AA',
        usage: 'warning state label',
    },
    {
        id: 'error-on-paper',
        foreground: 'error',
        background: 'paper',
        size: 'normal',
        minLevel: 'AA',
        usage: 'error state label',
    },
    {
        id: 'info-on-paper',
        foreground: 'info',
        background: 'paper',
        size: 'normal',
        minLevel: 'AA',
        usage: 'info state label',
    },
    // ── Non-text UI controls ──────────────────────────────────────────
    //
    // NOTE: panel-border tokens (`border` on `ink` / `paper`) are NOT
    // registered. Per WCAG 1.4.11 the 3:1 non-text contrast rule applies
    // only to "essential" non-text content (focus rings, form borders,
    // status icons). PRYZM's decorative panel-edge dividers fall under
    // the exemption.
    //
    // A.34.b — ESSENTIAL non-text tokens (focus + form controls). These
    // MUST meet 3:1 vs every surface they appear on (1.4.11 + 2.4.11);
    // PRYZM aspires AAA elevation here per [C43 §1.3] so we register
    // each pair against multiple background surfaces — the audit
    // catches a regression on ANY background, not just the primary.
    {
        id: 'focus-ring-on-ink',
        foreground: 'focus-ring',
        background: 'ink',
        size: 'non-text',
        minLevel: 'AA',
        usage: 'keyboard focus indicator on app background',
    },
    {
        id: 'focus-ring-on-paper',
        foreground: 'focus-ring',
        background: 'paper',
        size: 'non-text',
        minLevel: 'AA',
        usage: 'keyboard focus indicator on panel background',
    },
    {
        id: 'focus-ring-on-paper-elevated',
        foreground: 'focus-ring',
        background: 'paper-elevated',
        size: 'non-text',
        minLevel: 'AA',
        usage: 'keyboard focus indicator on modal / popover',
    },
    {
        id: 'form-border-on-paper',
        foreground: 'form-border',
        background: 'paper',
        size: 'non-text',
        minLevel: 'AA',
        usage: 'resting border on form inputs inside panels',
    },
    {
        id: 'form-border-focused-on-paper',
        foreground: 'form-border-focused',
        background: 'paper',
        size: 'non-text',
        minLevel: 'AA',
        usage: 'focused border on form inputs',
    },
    {
        id: 'form-border-error-on-paper',
        foreground: 'form-border-error',
        background: 'paper',
        size: 'non-text',
        minLevel: 'AA',
        usage: 'invalid-state border on form inputs',
    },
];

export interface AuditFinding {
    readonly pair: TokenPair;
    readonly result: ContrastCheckResult;
}

export interface AuditReport {
    readonly passing: readonly AuditFinding[];
    readonly failing: readonly AuditFinding[];
    readonly summary: {
        readonly total: number;
        readonly passCount: number;
        readonly failCount: number;
        readonly minRatio: number;
        readonly maxRatio: number;
    };
}

/**
 * Audit the full TOKEN_PAIRS registry against the WCAG thresholds.
 * Throws on a token-id typo (programmer error). Returns the pass/fail
 * split — CI gate fails when `failing.length > 0`.
 */
export function auditTokenPairs(
    pairs: readonly TokenPair[] = TOKEN_PAIRS,
): AuditReport {
    const passing: AuditFinding[] = [];
    const failing: AuditFinding[] = [];
    let minRatio = Infinity;
    let maxRatio = -Infinity;

    for (const pair of pairs) {
        const fg = PRYZM_TOKENS[pair.foreground];
        const bg = PRYZM_TOKENS[pair.background];
        if (!fg) {
            throw new Error(`auditTokenPairs: unknown foreground token "${pair.foreground}" in pair "${pair.id}"`);
        }
        if (!bg) {
            throw new Error(`auditTokenPairs: unknown background token "${pair.background}" in pair "${pair.id}"`);
        }
        const result = checkContrast(fg, bg, {
            level: pair.minLevel,
            size: pair.size,
        });
        const finding: AuditFinding = { pair, result };
        if (result.passes) {
            passing.push(finding);
        } else {
            failing.push(finding);
        }
        if (result.ratio < minRatio) minRatio = result.ratio;
        if (result.ratio > maxRatio) maxRatio = result.ratio;
    }

    return {
        passing,
        failing,
        summary: {
            total: pairs.length,
            passCount: passing.length,
            failCount: failing.length,
            minRatio,
            maxRatio,
        },
    };
}
