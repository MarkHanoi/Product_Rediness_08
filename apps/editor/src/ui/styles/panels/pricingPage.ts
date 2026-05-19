/**
 * @file src/styles/panels/pricingPage.ts
 *
 * CSS for the Pricing Page (pp- prefix).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const PRICING_PAGE_STYLES = `
    .pr-page {
        position: fixed; inset: 0; z-index: 99999;
        background: #f4f6fb; overflow-y: auto;
        font-family: var(--app-font); color: var(--app-text, #1a2035);
        box-sizing: border-box;
    }
    /* ─── Header ─── */
    .pr-header {
        position: sticky; top: 0; z-index: 10;
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 32px; background: rgba(255,255,255,0.92);
        backdrop-filter: blur(12px); border-bottom: 1px solid var(--app-border, #dde3f0);
    }
    .pr-back-btn {
        display: flex; align-items: center; gap: 6px;
        background: none; border: none; font-size: 14px; font-weight: 500;
        color: var(--app-text-2, #5a6a85); cursor: pointer; padding: 6px 10px;
        border-radius: 8px; font-family: var(--app-font); transition: background 0.15s;
    }
    .pr-back-btn:hover { background: #f0f0f8; color: var(--app-text); }
    .pr-logo-mark { height: 28px; width: auto; }
    .pr-logo-text { height: 18px; width: auto; margin-left: 8px; }
    /* ─── Hero ─── */
    .pr-hero {
        text-align: center; padding: 56px 32px 40px;
    }
    .pr-hero-title {
        font-size: 40px; font-weight: 800; letter-spacing: -0.03em;
        background: var(--app-gradient); -webkit-background-clip: text;
        -webkit-text-fill-color: transparent; background-clip: text; margin: 0 0 12px;
    }
    .pr-hero-subtitle {
        font-size: 16px; color: var(--app-text-2, #5a6a85); margin: 0 0 28px;
    }
    /* ─── Billing toggle ─── */
    .pr-billing-toggle {
        display: inline-flex; align-items: center; gap: 12px;
        background: #fff; border: 1.5px solid var(--app-border, #dde3f0);
        border-radius: 99px; padding: 6px 16px;
    }
    .pr-billing-label {
        font-size: 13px; font-weight: 500; color: var(--app-text-muted);
        cursor: pointer; display: flex; align-items: center; gap: 6px;
        transition: color 0.15s;
    }
    .pr-billing-label--active { color: var(--app-text, #1a2035); font-weight: 600; }
    .pr-billing-switch {
        width: 36px; height: 20px; background: #e0e4f0; border-radius: 99px;
        position: relative; cursor: pointer; transition: background 0.2s;
    }
    .pr-billing-switch[data-annual="true"] { background: var(--app-accent, #6600FF); }
    .pr-billing-knob {
        position: absolute; top: 2px; left: 2px;
        width: 16px; height: 16px; background: #fff; border-radius: 50%;
        transition: transform 0.2s; box-shadow: 0 1px 4px rgba(0,0,0,0.18);
    }
    .pr-billing-switch[data-annual="true"] .pr-billing-knob { transform: translateX(16px); }
    .pr-save-badge {
        background: #dcfce7; color: #166534; font-size: 10px; font-weight: 700;
        padding: 2px 6px; border-radius: 99px;
    }
    /* ─── Plan cards ─── */
    .pr-plans {
        display: flex; gap: 16px; padding: 0 32px 48px;
        max-width: 1280px; margin: 0 auto; flex-wrap: wrap;
        justify-content: center;
    }
    .pr-plan-card {
        background: #fff; border-radius: 18px; padding: 28px 24px;
        border: 2px solid var(--app-border, #dde3f0);
        min-width: 210px; flex: 1; max-width: 240px;
        display: flex; flex-direction: column; position: relative;
        transition: box-shadow 0.2s, border-color 0.2s;
    }
    .pr-plan-card:hover { box-shadow: 0 8px 32px rgba(30,50,120,0.1); }
    .pr-plan-card--highlighted {
        border-color: var(--app-accent, #6600FF);
        box-shadow: 0 8px 32px rgba(102,0,255,0.15);
    }
    .pr-plan-card--current { border-color: #22c55e; }
    .pr-popular-badge {
        position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
        background: var(--app-gradient); color: #fff; font-size: 11px; font-weight: 700;
        padding: 3px 12px; border-radius: 99px; white-space: nowrap;
    }
    .pr-current-badge {
        position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
        background: #22c55e; color: #fff; font-size: 11px; font-weight: 700;
        padding: 3px 12px; border-radius: 99px; white-space: nowrap;
    }
    .pr-plan-header { margin-bottom: 20px; }
    .pr-plan-name {
        font-size: 18px; font-weight: 700; margin: 0 0 4px; color: var(--app-text);
    }
    .pr-plan-tagline {
        font-size: 12px; color: var(--app-text-muted, #7a8aaa);
        margin: 0 0 16px; line-height: 1.5;
    }
    .pr-plan-price { display: flex; align-items: baseline; gap: 2px; margin-bottom: 6px; }
    .pr-plan-price-amount {
        font-size: 32px; font-weight: 800; color: var(--app-text);
    }
    .pr-plan-price-period {
        font-size: 14px; color: var(--app-text-muted); font-weight: 500;
    }
    .pr-plan-meta {
        font-size: 11px; color: var(--app-text-muted); line-height: 1.4;
    }
    /* ─── Plan CTA buttons ─── */
    .pr-plan-btn {
        width: 100%; padding: 11px; border-radius: 10px; font-size: 13px;
        font-weight: 600; cursor: pointer; border: 2px solid var(--app-border);
        background: #fff; color: var(--app-text-2); font-family: var(--app-font);
        margin-bottom: 20px; transition: all 0.15s;
    }
    .pr-plan-btn:hover:not(:disabled) { border-color: var(--app-accent); color: var(--app-accent); }
    .pr-plan-btn--highlighted {
        background: var(--app-gradient); color: #fff; border-color: transparent;
        box-shadow: 0 4px 14px rgba(102,0,255,0.35);
    }
    .pr-plan-btn--highlighted:hover:not(:disabled) {
        opacity: 0.9; box-shadow: 0 6px 18px rgba(102,0,255,0.45);
    }
    .pr-plan-btn--current {
        background: #f0fdf4; color: #22c55e; border-color: #22c55e; cursor: default;
    }
    .pr-plan-btn:disabled { opacity: 0.7; cursor: default; }
    /* ─── Feature list ─── */
    .pr-feature-list {
        list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px;
    }
    .pr-feature-item {
        display: flex; gap: 8px; font-size: 12.5px;
        color: var(--app-text-2, #5a6a85); line-height: 1.4; align-items: flex-start;
    }
    .pr-feature-check {
        color: #22c55e; font-weight: 700; flex-shrink: 0; font-size: 13px;
    }
    /* ─── AI Add-ons ─── */
    .pr-addons-section {
        max-width: 900px; margin: 0 auto 64px; padding: 0 32px; text-align: center;
    }
    .pr-addons-title {
        font-size: 26px; font-weight: 700; margin: 0 0 8px; color: var(--app-text);
    }
    .pr-addons-subtitle {
        font-size: 14px; color: var(--app-text-2); margin: 0 0 32px;
    }
    .pr-addons-grid {
        display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;
    }
    .pr-addon-card {
        background: #fff; border: 1.5px solid var(--app-border); border-radius: 16px;
        padding: 24px 20px; min-width: 160px; text-align: center;
        transition: box-shadow 0.2s;
    }
    .pr-addon-card:hover { box-shadow: 0 6px 24px rgba(30,50,120,0.1); }
    .pr-addon-icon { font-size: 32px; margin-bottom: 10px; }
    .pr-addon-actions { font-size: 15px; font-weight: 700; color: var(--app-text); margin-bottom: 4px; }
    .pr-addon-price { font-size: 26px; font-weight: 800; color: var(--app-accent); }
    .pr-addon-period { font-size: 11px; color: var(--app-text-muted); margin-bottom: 16px; }
    .pr-addon-btn {
        background: var(--app-gradient); color: #fff; border: none;
        border-radius: 8px; padding: 9px 18px; font-size: 13px; font-weight: 600;
        cursor: pointer; font-family: var(--app-font); transition: opacity 0.15s;
    }
    .pr-addon-btn:hover { opacity: 0.88; }
    /* ─── FAQ ─── */
    .pr-faq-section {
        max-width: 900px; margin: 0 auto 64px; padding: 0 32px;
    }
    .pr-faq-title {
        font-size: 26px; font-weight: 700; text-align: center; margin: 0 0 32px;
    }
    .pr-faq-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
    }
    @media (max-width: 700px) { .pr-faq-grid { grid-template-columns: 1fr; } }
    .pr-faq-item {
        background: #fff; border: 1.5px solid var(--app-border); border-radius: 12px;
        padding: 18px 20px;
    }
    .pr-faq-question { font-size: 14px; font-weight: 600; margin-bottom: 8px; color: var(--app-text); }
    .pr-faq-answer { font-size: 13px; color: var(--app-text-2); line-height: 1.6; }
    /* ─── Footer CTA ─── */
    .pr-footer-cta {
        text-align: center; padding: 32px 32px 64px;
    }
    .pr-footer-cta-text {
        font-size: 15px; color: var(--app-text-2); margin: 0 0 8px;
    }
    .pr-footer-cta-link {
        font-size: 15px; font-weight: 600; color: var(--app-accent);
        text-decoration: none;
    }
    .pr-footer-cta-link:hover { text-decoration: underline; }
    /* ─── Plan badge (ProjectHub header) ─── */
    .ph-plan-badge {
        font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px;
        letter-spacing: 0.02em; text-transform: uppercase;
    }
    .ph-plan-badge--free { background: #f0f0f0; color: #6b7280; }
    .ph-plan-badge--architect { background: #ede9fe; color: #7c3aed; }
    .ph-plan-badge--studio { background: #fef3c7; color: #d97706; }
    .ph-plan-badge--firm { background: #dcfce7; color: #16a34a; }
    .ph-plan-badge--enterprise { background: var(--app-gradient); color: #fff; }
    /* ─── Upgrade button (ProjectHub header) ─── */
    .ph-upgrade-btn {
        font-size: 12px; font-weight: 700; padding: 5px 14px; border-radius: 99px;
        background: var(--app-gradient); color: #fff; border: none; cursor: pointer;
        font-family: var(--app-font); box-shadow: 0 2px 8px rgba(102,0,255,0.28);
        transition: opacity 0.15s, box-shadow 0.15s; white-space: nowrap;
    }
    .ph-upgrade-btn:hover { opacity: 0.88; box-shadow: 0 4px 12px rgba(102,0,255,0.4); }

    /* ── Stream 2 — Bespoke / Enterprise band ────────────────────────── */
    .pr-bespoke-band {
        max-width: 1100px;
        margin: 48px auto 0;
        padding: 0 32px;
        box-sizing: border-box;
    }
    .pr-bespoke-band-inner {
        background: var(--app-violet-soft);
        border-radius: var(--app-radius-lg);
        padding: 48px;
        display: flex;
        gap: 48px;
        align-items: flex-start;
    }
    .pr-bespoke-content { flex: 1; }
    .pr-bespoke-heading {
        font-size: 22px;
        font-weight: 700;
        color: var(--app-text);
        margin: 0 0 12px;
        letter-spacing: -0.2px;
    }
    .pr-bespoke-desc {
        font-size: 14px;
        color: var(--app-text-2);
        line-height: 1.6;
        margin: 0 0 20px;
    }
    .pr-bespoke-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .pr-bespoke-list li {
        font-size: 13px;
        color: var(--app-text-2);
        padding-left: 18px;
        position: relative;
        line-height: 1.5;
    }
    .pr-bespoke-list li::before {
        content: "✓";
        position: absolute;
        left: 0;
        color: var(--app-violet-1);
        font-weight: 700;
    }
    .pr-bespoke-cta-wrap {
        display: flex;
        align-items: center;
        flex-shrink: 0;
    }
    .pr-bespoke-cta-wrap button {
        background: var(--app-gradient);
        color: #fff;
        padding: 14px 28px;
        border-radius: var(--app-radius-sm);
        border: none;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        font-family: var(--app-font);
        white-space: nowrap;
        box-shadow: var(--app-shadow-glow);
        transition: opacity 0.15s, transform 0.12s;
    }
    .pr-bespoke-cta-wrap button:hover { opacity: 0.88; transform: translateY(-1px); }
    @media (max-width: 768px) {
        .pr-bespoke-band-inner { flex-direction: column; padding: 32px 24px; }
    }
`;

