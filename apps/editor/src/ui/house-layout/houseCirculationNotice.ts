// §CI-1-BANNER wiring (SPEC-49 §4 CI-1, founder decision 2026-08-13) — the editor half
// of the house circulation verdict. The engine half (30fae370) made
// `HouseLayoutResult.circulation` a REQUIRED `HouseCirculationReport`; THIS module is
// the consumer that `enumerate.ts`'s old console.warn ("Surface the failing rule(s) to
// the user") was addressed to and that did not exist.
//
// THE DECISION IT ENFORCES AT THE SURFACE:
//   banner null       → the success toast, BYTE-IDENTICAL to the pre-wiring text.
//   'blocking'        → NO success toast. A persistent, dismiss-required banner naming
//                       the sealed rooms and the failed rule (headline → lines →
//                       qualifier), on the established ERROR token.
//   'unknown'         → the SAME banner surface at WARNING weight. NOT MEASURED is
//                       never rendered as success (C70 §2.2).
//   'advisory'        → a warning toast carrying the headline. Never success.
//
// A STOREY BUCKET IS NEVER HIDDEN: the banner's `lines` carry one pre-rendered line per
// non-sound storey (sealed AND unsound AND not-measured), and this module renders every
// one of them, unfiltered and untruncated — a silently shortened list understates the
// defect (C75 §1.2).
//
// CHROME: the shared apartment/house/residential `alm-*` brand classes (white + #6600FF;
// error = the established `.alm-notice--rejected` token, warning weight = the
// established informative `.alm-notice--reduced` purple token — NO new ad-hoc palette),
// exactly as `residentialError.ts` does. The card itself is the same persistent
// fixed-position notification pattern `ConflictDisclosureBanner` uses, minus its
// auto-hide: THIS banner never times out — the user must dismiss it.
//
// TYPES: the `@pryzm/ai-host` ROOT barrel exports `HouseLayoutResult` but not (yet) the
// circulation types themselves, and this lane's territory does not include the barrel.
// `circulation` is a REQUIRED field of the exported type, so the types are derived by
// indexed access — structurally identical to the engine's own declarations in
// `packages/ai-host/src/workflows/houseLayout/circulationBanner.ts`, with no deep
// import and no SDK bypass. Type-only, so this module stays PURE apart from the one
// DOM-mounting function (which guards on `typeof document`) — same convention as every
// other pure module in these generator folders.

import type { HouseLayoutResult } from '@pryzm/ai-host';

/** The whole-house circulation verdict (engine shape, re-derived — see header). */
export type HouseCirculationReport = HouseLayoutResult['circulation'];
/** The house-scale banner payload. Null when every storey measured SOUND — only then. */
export type HouseCirculationBanner = NonNullable<HouseCirculationReport['banner']>;
/** One storey's verdict (three room sets carried apart, never merged — C75 §1.2). */
export type StoreyCirculationVerdict = HouseCirculationReport['storeys'][number];

/** Toast emitter shape — mirrors the executor's local `toast` closure exactly. */
export type HouseToastFn = (message: string, severity: 'info' | 'success' | 'error' | 'warn') => void;

/**
 * The success-toast text, extracted VERBATIM from `HouseLayoutExecutor.execute()` so
 * the clean path stays byte-identical and the byte-identity is pinned by test. Do not
 * "fix" the `stair(s)` pluralisation — that would break the identity this exists for.
 */
export function houseBuildSuccessMessage(storeyCount: number, stairCount: number): string {
    return `Built ${storeyCount}-storey house — ${stairCount} stair(s), roof on top. Finishing storeys…`;
}

/** Minimal HTML-escape for interpolated engine text (mirrors residentialError.ts). */
function esc(s: unknown): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
}

/**
 * Build the banner card's inner HTML. PURE (string in → string out, XSS-guarded) so it
 * unit-tests in plain Node like `residentialError.ts`'s builders.
 *
 * Render order is CONTRACTUAL: headline, then one line per non-sound storey (EVERY
 * banner line — no bucket hidden), then the honesty qualifier. Severity weight:
 *   'blocking' → `.alm-notice--rejected` (the established error token) + role="alert"
 *   'unknown'  → `.alm-notice--reduced` (the established informative/warning purple
 *                token) + role="status" — warning weight, NEVER the success surface.
 * ('advisory' never reaches this builder — it rides a warning toast instead.)
 */
export function buildHouseCirculationBannerHtml(banner: HouseCirculationBanner): string {
    const blocking = banner.severity === 'blocking';
    const noticeTone = blocking ? 'alm-notice--rejected' : 'alm-notice--reduced';
    const role = blocking ? 'alert' : 'status';
    const icon = blocking ? '⊘' : '⚠';
    const title = blocking
        ? 'House built with sealed rooms'
        : 'House built — circulation could not be fully checked';
    const lineItems = banner.lines
        .map((l) => `<div class="hcb-line" data-role="hcb-line">${esc(l)}</div>`)
        .join('');
    return (
        `<div class="alm-panel hcb-card" role="${role}" aria-live="${blocking ? 'assertive' : 'polite'}" ` +
        `data-severity="${esc(banner.severity)}" aria-label="${esc(title)}">` +
        `<div class="alm-header hcb-header">${esc(title)}</div>` +
        '<div class="alm-notice-region hcb-region">' +
        `<div class="alm-notice ${noticeTone} hcb-notice">` +
        `<span class="alm-notice-icon" aria-hidden="true">${icon}</span>` +
        '<span class="alm-notice-body">' +
        `<span class="alm-notice-title hcb-headline" data-role="hcb-headline">${esc(banner.headline)}</span>` +
        `<span class="alm-notice-text hcb-lines">${lineItems}</span>` +
        `<span class="alm-notice-hint hcb-qualifier" data-role="hcb-qualifier">${esc(banner.qualifier)}</span>` +
        '</span>' +
        '</div>' +
        '</div>' +
        '<div class="alm-footer hcb-footer">' +
        '<button type="button" class="alm-select hcb-dismiss" data-action="dismiss-circulation-banner">' +
        'I understand — dismiss</button>' +
        '</div>' +
        '</div>'
    );
}

// ── The thin DOM surface ─────────────────────────────────────────────────────
// Fixed-position persistent card, NO scrim (the build DID ship — the user may keep
// working under it) and NO auto-hide (dismiss-required; the ConflictDisclosureBanner
// pattern minus its timeout). Singleton: a re-run replaces the previous card.

const HOST_ID = 'hcb-circulation-banner-host';
const STYLE_ID = 'hcb-circulation-banner-styles';

/** Positioning + list styles ONLY — colour/weight comes from the shared `alm-*`
 *  tokens (AppTheme), so brand stays white + #6600FF by construction. */
const HCB_STYLES = `
#${HOST_ID} {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 4001; /* one above the alm-overlay modals (4000) — it must not sink under them */
  max-width: 460px;
  min-width: 320px;
}
#${HOST_ID} .hcb-card { display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(102,0,255,0.25); }
#${HOST_ID} .hcb-lines { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
#${HOST_ID} .hcb-line { font-size: 12px; line-height: 1.45; }
#${HOST_ID} .hcb-qualifier { margin-top: 6px; display: block; }
#${HOST_ID} .hcb-footer { display: flex; justify-content: flex-end; }
`;

/** Remove any mounted circulation banner. Idempotent. */
export function dismissHouseCirculationBanner(): void {
    if (typeof document === 'undefined') return;
    document.getElementById(HOST_ID)?.remove();
}

/**
 * Mount the persistent banner. Dismiss ONLY via its explicit button — no timeout, no
 * scrim-click, deliberately no Escape (a blocking verdict must be read, not reflexed
 * away). Replaces any previous instance. No-ops outside a DOM (plain-Node tests).
 */
export function presentHouseCirculationBanner(banner: HouseCirculationBanner): void {
    if (typeof document === 'undefined') return;
    dismissHouseCirculationBanner();

    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = HCB_STYLES;
        document.head.appendChild(style);
    }

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.innerHTML = buildHouseCirculationBannerHtml(banner);
    host.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('[data-action="dismiss-circulation-banner"]')) {
            dismissHouseCirculationBanner();
        }
    });
    document.body.appendChild(host);
    console.log(
        '[house-layout] §CI-1-BANNER mounted —', banner.severity,
        '·', banner.lines.length, 'storey line(s) · failed rules:', banner.failedRules.join(', ') || '(none named)',
    );
}

/**
 * §CI-1-BANNER — THE seam `HouseLayoutExecutor.execute()` calls where the
 * unconditional success toast used to fire. The ONLY place the four severities are
 * routed to a surface; there is deliberately no default branch that lands on the
 * success toast (C70 §2.2 — the same no-reassuring-default rule the engine's
 * `judgeStoreyCirculation` enforces).
 *
 * `present` is injectable for plain-Node tests; production callers omit it.
 */
export function announceHouseCirculation(
    circulation: HouseCirculationReport,
    successMessage: string,
    toast: HouseToastFn,
    present: (banner: HouseCirculationBanner) => void = presentHouseCirculationBanner,
): void {
    const banner = circulation.banner;
    if (banner === null) {
        // Every storey measured SOUND — and only then. Byte-identical clean path.
        toast(successMessage, 'success');
        return;
    }
    switch (banner.severity) {
        case 'blocking':
        case 'unknown':
            // NO success toast — the persistent, dismiss-required surface instead.
            // 'unknown' rides the SAME surface at warning weight: an unmeasured storey
            // that raised only a transient toast would be indistinguishable, ten
            // seconds later, from a storey that passed.
            present(banner);
            return;
        case 'advisory':
            // A measured hard-rule failure with no sealed room: warning toast carrying
            // the engine's own headline. Never the success text.
            toast(banner.headline, 'warn');
            return;
    }
}
