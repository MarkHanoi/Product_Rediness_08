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
// XSS: this module has NO HTML sink. The card is built with `createElement`, and every
// dynamic value — headline, qualifier, each storey line, severity, title — is assigned
// with `textContent`. The banner renders ROOM NAMES, which come from AI generation and
// from user input, so escaping here must be structural rather than remembered: the
// earlier form built an HTML string with a hand-applied local `esc()` and assigned it
// through `innerHTML`, which was safe only for as long as every future edit remembered
// the call. (§XSS-SINK-SCAN / C08 §3.1 — L-XSS, 2026-08-14.)
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

/**
 * The ONE text normalisation. Mirrors what the former `esc()` did to a value BEFORE
 * escaping it — `null`/`undefined` collapse to the empty string rather than rendering
 * the words "null"/"undefined" — and stops there, because there is nothing left to
 * escape: every dynamic value below is assigned with `textContent`, which cannot
 * produce markup by construction.
 */
function asText(v: unknown): string {
    return String(v ?? '');
}

/**
 * Build the banner card as a DOM SUBTREE. §XSS-NO-SINK (L-XSS, C08 §3.1): this used to
 * be `buildHouseCirculationBannerHtml(): string` assigned through `host.innerHTML`, with
 * every interpolation hand-routed through a local `esc()`. That was correct on the day it
 * was written and one forgotten `esc()` away from injecting AI- and user-authored ROOM
 * NAMES into the editor's DOM. Escaping is now STRUCTURAL, not remembered: structure comes
 * from `createElement`, every dynamic value goes in via `textContent`, and there is no HTML
 * sink in this module at all. Do not reintroduce one — the fix is to delete the sink, not
 * to satisfy the scanner's regex.
 *
 * Render order is CONTRACTUAL: headline, then one line per non-sound storey (EVERY
 * banner line — no bucket hidden), then the honesty qualifier. Severity weight:
 *   'blocking' → `.alm-notice--rejected` (the established error token) + role="alert"
 *   'unknown'  → `.alm-notice--reduced` (the established informative/warning purple
 *                token) + role="status" — warning weight, NEVER the success surface.
 * ('advisory' never reaches this builder — it rides a warning toast instead.)
 *
 * `doc` is injected so the builder is testable against any Document; production callers
 * omit it. Attribute-for-attribute (and order-for-order) identical to the string the
 * former builder produced — the chrome did not change, only how it is constructed.
 */
export function buildHouseCirculationBannerElement(
    banner: HouseCirculationBanner,
    doc: Document = document,
): HTMLDivElement {
    const blocking = banner.severity === 'blocking';
    const noticeTone = blocking ? 'alm-notice--rejected' : 'alm-notice--reduced';
    const role = blocking ? 'alert' : 'status';
    const icon = blocking ? '⊘' : '⚠';
    const title = blocking
        ? 'House built with sealed rooms'
        : 'House built — circulation could not be fully checked';

    const card = doc.createElement('div');
    card.className = 'alm-panel hcb-card';
    card.setAttribute('role', role);
    card.setAttribute('aria-live', blocking ? 'assertive' : 'polite');
    card.setAttribute('data-severity', asText(banner.severity));
    card.setAttribute('aria-label', title);

    const header = doc.createElement('div');
    header.className = 'alm-header hcb-header';
    header.textContent = title;
    card.appendChild(header);

    const region = doc.createElement('div');
    region.className = 'alm-notice-region hcb-region';
    card.appendChild(region);

    const notice = doc.createElement('div');
    notice.className = `alm-notice ${noticeTone} hcb-notice`;
    region.appendChild(notice);

    const iconEl = doc.createElement('span');
    iconEl.className = 'alm-notice-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = icon;
    notice.appendChild(iconEl);

    const body = doc.createElement('span');
    body.className = 'alm-notice-body';
    notice.appendChild(body);

    const headline = doc.createElement('span');
    headline.className = 'alm-notice-title hcb-headline';
    headline.setAttribute('data-role', 'hcb-headline');
    headline.textContent = asText(banner.headline);
    body.appendChild(headline);

    const lines = doc.createElement('span');
    lines.className = 'alm-notice-text hcb-lines';
    body.appendChild(lines);
    // EVERY banner line, unfiltered and untruncated (C75 §1.2) — one child per line.
    for (const l of banner.lines) {
        const line = doc.createElement('div');
        line.className = 'hcb-line';
        line.setAttribute('data-role', 'hcb-line');
        line.textContent = asText(l);
        lines.appendChild(line);
    }

    const qualifier = doc.createElement('span');
    qualifier.className = 'alm-notice-hint hcb-qualifier';
    qualifier.setAttribute('data-role', 'hcb-qualifier');
    qualifier.textContent = asText(banner.qualifier);
    body.appendChild(qualifier);

    const footer = doc.createElement('div');
    footer.className = 'alm-footer hcb-footer';
    card.appendChild(footer);

    const dismiss = doc.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'alm-select hcb-dismiss';
    dismiss.setAttribute('data-action', 'dismiss-circulation-banner');
    dismiss.textContent = 'I understand — dismiss';
    footer.appendChild(dismiss);

    return card;
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
    // §XSS-NO-SINK — appendChild of a built subtree, never `innerHTML =`. Room names
    // reaching this banner are AI- and user-authored; they are TEXT, structurally.
    host.appendChild(buildHouseCirculationBannerElement(banner, document));
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
