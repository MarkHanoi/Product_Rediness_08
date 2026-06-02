/**
 * @file apps/editor/src/ui/marketing/marketingPageStyles.ts
 *
 * Shared CSS recipe for native editor marketing routes (pricing,
 * manifesto, trust). Extends the canonical `LANDING_PAGE_STYLES`
 * recipe in src/ui/styles/panels/marketingPages.ts — every colour
 * resolves through the editor's a11y token surface in src/ui/styles/
 * tokens.ts (DESIGN_TOKENS). No hardcoded hex literals beyond what
 * LANDING_PAGE_STYLES already uses.
 *
 * CONTRACT compliance:
 *   §05 §2   — CSS layer only, zero logic.
 *   §05 §7.6 — Injected through injectAppTheme(); never <style>-injected
 *              per page.
 *   C43      — All colour tokens via `var(--app-*)`; no per-page palette.
 *   ADR-055 §7 — Customer-facing marketing surface lives inside the
 *              editor; this is its shared style sheet.
 *
 * Class prefix: mkt-  (Marketing)
 *
 * The recipe is intentionally compact: the four shapes the marketing
 * pages share are (a) the top nav bar + back button, (b) the hero
 * heading + lede, (c) the section + table block, (d) the pillar grid
 * (only used by trust).  Anything specific to a single page lives in
 * its own builder.
 */

export const MARKETING_PAGE_STYLES = `
    /* ─── Shell ────────────────────────────────────────────────────────
       Reuses lp-shell's animated mesh-gradient background by sharing
       the same class on the outer element; the marketing-page-specific
       chrome below is layered on top.
    ──────────────────────────────────────────────────────────────────── */
    .mkt-page {
        position: fixed;
        inset: 0;
        background: var(--app-bg);
        color: var(--app-text);
        font-family: var(--app-font);
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        overflow-x: hidden;
        z-index: 9500;
        animation: mkt-page-in 0.22s ease;
    }
    @keyframes mkt-page-in {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
    }

    /* ─── Top nav (brand + links + sign-in + back) ────────────────────── */
    .mkt-nav {
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 0 32px;
        height: 64px;
        background: var(--app-panel-bg);
        border-bottom: 1px solid var(--app-border);
        flex-shrink: 0;
        position: sticky;
        top: 0;
        z-index: 10;
    }
    .mkt-nav-brand {
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        background: none;
        border: none;
        padding: 4px 8px;
        border-radius: var(--app-radius-sm);
        font-family: var(--app-font);
        color: var(--app-text);
        transition: background 0.12s;
    }
    .mkt-nav-brand:hover { background: var(--app-violet-soft); }
    .mkt-nav-brand-mark {
        width: 28px; height: 28px;
        flex-shrink: 0;
        filter: drop-shadow(0 1px 4px rgba(80,20,180,0.20));
    }
    .mkt-nav-brand-text {
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 3px;
        color: var(--app-text);
    }
    .mkt-nav-links {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: 1;
    }
    .mkt-nav-link {
        background: none;
        border: none;
        font-family: var(--app-font);
        font-size: 13px;
        font-weight: 500;
        color: var(--app-text-2);
        padding: 8px 14px;
        border-radius: var(--app-radius-sm);
        cursor: pointer;
        transition: background 0.12s, color 0.12s;
    }
    .mkt-nav-link:hover {
        background: var(--app-violet-soft);
        color: var(--app-violet-2);
    }
    .mkt-nav-link--active {
        color: var(--app-violet-2);
        font-weight: 600;
    }
    .mkt-nav-signin {
        background: var(--app-gradient);
        color: #ffffff;
        border: none;
        font-size: 13px;
        font-weight: 600;
        padding: 8px 16px;
        border-radius: var(--app-radius-sm);
        cursor: pointer;
        font-family: var(--app-font);
        box-shadow: var(--app-shadow-glow);
        transition: opacity 0.15s, transform 0.12s;
    }
    .mkt-nav-signin:hover { opacity: 0.88; transform: translateY(-1px); }

    .mkt-back {
        background: none;
        border: none;
        font-family: var(--app-font);
        font-size: 13px;
        font-weight: 500;
        color: var(--app-text-2);
        cursor: pointer;
        padding: 6px 10px;
        border-radius: var(--app-radius-sm);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: background 0.12s, color 0.12s;
    }
    .mkt-back:hover { background: var(--app-violet-soft); color: var(--app-violet-2); }

    /* ─── Page body (scrollable inside the shell) ─────────────────────── */
    .mkt-body {
        flex: 1;
        padding: 56px 24px 96px;
    }
    .mkt-content {
        max-width: 920px;
        margin: 0 auto;
    }
    .mkt-content--narrow {
        max-width: 760px;
    }

    /* ─── Hero (heading + lede) ───────────────────────────────────────── */
    .mkt-hero-title {
        font-size: clamp(34px, 4.6vw, 52px);
        font-weight: 800;
        letter-spacing: -0.025em;
        color: var(--app-text);
        margin: 0 0 14px;
        line-height: 1.1;
    }
    .mkt-hero-lede {
        font-size: 18px;
        color: var(--app-text-2);
        line-height: 1.6;
        margin: 0 0 40px;
    }

    /* ─── Section heading ────────────────────────────────────────────── */
    .mkt-section {
        margin: 48px 0;
    }
    .mkt-section-title {
        font-size: 22px;
        font-weight: 700;
        color: var(--app-text);
        margin: 0 0 16px;
        letter-spacing: -0.015em;
        padding-bottom: 8px;
        border-bottom: 2px solid var(--app-violet-soft);
        display: inline-block;
    }
    .mkt-section-sub {
        font-size: 16px;
        font-weight: 600;
        color: var(--app-violet-2);
        margin: 24px 0 8px;
    }
    .mkt-p {
        font-size: 15px;
        color: var(--app-text-2);
        line-height: 1.7;
        margin: 0 0 16px;
    }
    .mkt-promise {
        font-size: 18px;
        font-weight: 600;
        color: var(--app-text);
        padding: 18px 22px;
        margin: 20px 0;
        background: var(--app-violet-soft);
        border-left: 3px solid var(--app-violet-3);
        border-radius: var(--app-radius-sm);
        line-height: 1.5;
    }
    .mkt-list {
        margin: 0 0 20px;
        padding-left: 22px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .mkt-list li {
        font-size: 15px;
        color: var(--app-text-2);
        line-height: 1.6;
    }
    .mkt-list li strong { color: var(--app-text); }
    .mkt-check {
        color: var(--app-success, #16a34a);
        font-weight: 700;
        margin-right: 6px;
    }

    /* ─── Pricing — tier-summary card row ─────────────────────────────── */
    .mkt-tiers {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 12px;
        margin: 16px 0 40px;
    }
    .mkt-tier-card {
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-md);
        padding: 16px 14px;
        box-shadow: var(--app-shadow-card);
    }
    .mkt-tier-name {
        margin: 0 0 4px;
        font-size: 15px;
        font-weight: 700;
        color: var(--app-text);
    }
    .mkt-tier-key {
        font-size: 11px;
        color: var(--app-text-muted);
        font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
    }
    @media (max-width: 800px) {
        .mkt-tiers { grid-template-columns: repeat(2, 1fr); }
    }

    /* ─── Comparison + retention tables ───────────────────────────────── */
    .mkt-table {
        width: 100%;
        border-collapse: collapse;
        margin: 12px 0 24px;
        font-size: 14px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-md);
        overflow: hidden;
    }
    .mkt-table thead th {
        text-align: left;
        padding: 12px 14px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        font-weight: 700;
        color: var(--app-text-muted);
        background: var(--app-border-light);
        border-bottom: 1px solid var(--app-border);
    }
    .mkt-table thead th.mkt-th--tier {
        text-align: center;
        width: 90px;
    }
    .mkt-table tbody td {
        padding: 12px 14px;
        border-bottom: 1px solid var(--app-border-light);
        color: var(--app-text-2);
        vertical-align: top;
    }
    .mkt-table tbody tr:last-child td { border-bottom: none; }
    .mkt-table td.mkt-td--tier {
        text-align: center;
        font-size: 16px;
        line-height: 1;
    }
    .mkt-feature-name {
        font-weight: 600;
        color: var(--app-text);
        display: block;
        margin-bottom: 3px;
    }
    .mkt-feature-desc {
        font-size: 13px;
        color: var(--app-text-muted);
        line-height: 1.5;
    }
    .mkt-yes { color: var(--app-violet-3); }
    .mkt-no  { color: var(--app-text-muted); opacity: 0.5; }
    .mkt-badge--deprecated {
        display: inline-block;
        margin-left: 6px;
        padding: 1px 6px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        background: var(--vg-badge-warn-bg);
        color: var(--vg-badge-warn-color);
        border-radius: var(--app-radius-sm);
        vertical-align: middle;
    }

    /* ─── Trust — pillar grid ─────────────────────────────────────────── */
    .mkt-pillar-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
        margin: 24px 0 36px;
    }
    .mkt-pillar {
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-md);
        padding: 18px;
        box-shadow: var(--app-shadow-card);
    }
    .mkt-pillar-title {
        margin: 0 0 8px;
        font-size: 16px;
        font-weight: 700;
        color: var(--app-text);
    }
    .mkt-pillar-body {
        font-size: 14px;
        color: var(--app-text-2);
        line-height: 1.55;
        margin: 0 0 10px;
    }
    .mkt-pillar-contract {
        font-size: 12px;
        color: var(--app-violet-2);
        font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
    }

    /* ─── Colophon footer ─────────────────────────────────────────────── */
    .mkt-footer {
        margin-top: 56px;
        padding-top: 20px;
        border-top: 1px solid var(--app-border);
        font-size: 13px;
        color: var(--app-text-muted);
    }
    .mkt-footer code {
        font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
        background: var(--app-border-light);
        padding: 2px 6px;
        border-radius: var(--app-radius-sm);
        color: var(--app-violet-2);
    }

    @media (max-width: 768px) {
        .mkt-nav { padding: 0 16px; gap: 12px; }
        .mkt-nav-links { gap: 0; flex-wrap: wrap; }
        .mkt-body { padding: 36px 16px 64px; }
        .mkt-section-title { font-size: 20px; }
    }
`;
