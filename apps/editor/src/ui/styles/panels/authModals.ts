/**
 * @file src/styles/panels/authModals.ts
 *
 * CSS for Auth modal, Upgrade modal, Welcome modal, Contact Sales modal.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const AUTH_MODAL_STYLES = `
    /* ─── Overlay ─────────────────────────────────────────────────────── */
    .am-overlay {
        position: fixed;
        inset: 0;
        background: rgba(40,30,80,0.45);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        animation: am-fade 0.18s ease;
        font-family: var(--app-font);
        padding: 16px;
        box-sizing: border-box;
    }
    @keyframes am-fade { from { opacity: 0; } to { opacity: 1; } }

    /* ─── Modal card — lavender frosted glass matching reference ─────── */
    .am-modal {
        background: rgba(210,205,238,0.82);
        backdrop-filter: blur(28px) saturate(1.8);
        -webkit-backdrop-filter: blur(28px) saturate(1.8);
        border: 1px solid rgba(255,255,255,0.52);
        border-radius: 22px;
        box-shadow: 0 28px 72px rgba(60,30,140,0.22), 0 4px 16px rgba(102,0,255,0.10);
        width: 440px;
        max-width: 100%;
        padding: 32px 32px 26px;
        position: relative;
        animation: am-slide 0.24s cubic-bezier(0.22,1,0.36,1);
        max-height: 90vh;
        overflow-y: auto;
    }
    .am-modal--signup {
        width: 460px;
    }
    @keyframes am-slide { from { opacity: 0; transform: translateY(22px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }

    .am-close {
        position: absolute;
        top: 14px;
        right: 16px;
        background: rgba(255,255,255,0.22);
        border: none;
        font-size: 18px;
        color: rgba(60,40,100,0.7);
        cursor: pointer;
        line-height: 1;
        padding: 4px 8px;
        border-radius: 8px;
        font-family: var(--app-font);
        transition: background 0.12s, color 0.12s;
    }
    .am-close:hover { background: rgba(255,255,255,0.42); color: #1a0a40; }

    /* ─── Brand header — icon + PRYZM wordmark ─────────────────────── */
    .am-brand {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 14px;
        margin-bottom: 22px;
    }
    .am-brand-icon {
        width: 48px;
        height: 48px;
        display: block;
        flex-shrink: 0;
    }
    .am-brand-wordmark {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }
    .am-brand-name {
        font-family: var(--app-font);
        font-size: 20px;
        font-weight: 700;
        letter-spacing: 4px;
        color: #150830;
        line-height: 1;
    }
    .am-brand-sub {
        font-family: var(--app-font);
        font-size: 8px;
        font-weight: 400;
        letter-spacing: 5px;
        color: rgba(60,40,100,0.55);
        text-transform: uppercase;
        line-height: 1;
    }

    /* ─── Signup heading ────────────────────────────────────────────── */
    .am-signup-header { margin-bottom: 16px; }
    .am-signup-title {
        font-size: 20px;
        font-weight: 800;
        color: #0d0d1a;
        margin: 0 0 4px;
        letter-spacing: -0.3px;
        font-family: var(--app-font);
    }
    .am-signup-sub {
        font-size: 13px;
        color: rgba(60,40,100,0.65);
        margin: 0;
        line-height: 1.5;
        font-family: var(--app-font);
    }

    /* ─── Tabs ────────────────────────────────────────────────────────── */
    .am-tabs {
        display: flex;
        border-bottom: 1.5px solid rgba(150,130,200,0.28);
        margin-bottom: 20px;
        gap: 0;
    }
    .am-tab {
        flex: 1;
        background: none;
        border: none;
        padding: 8px 0 11px;
        font-size: 14px;
        font-weight: 600;
        color: rgba(80,60,120,0.52);
        cursor: pointer;
        font-family: var(--app-font);
        border-bottom: 2px solid transparent;
        margin-bottom: -1.5px;
        transition: color 0.15s, border-color 0.15s;
    }
    .am-tab--active {
        color: var(--app-accent);
        border-bottom-color: var(--app-accent);
    }
    .am-tab:hover:not(.am-tab--active) { color: rgba(80,60,120,0.80); }

    /* ─── Form ────────────────────────────────────────────────────────── */
    .am-form { display: flex; flex-direction: column; gap: 13px; }
    .am-field { display: flex; flex-direction: column; gap: 5px; }
    .am-name-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }
    .am-label {
        font-size: 12px;
        font-weight: 600;
        color: rgba(40,20,80,0.72);
        font-family: var(--app-font);
    }
    .am-input {
        padding: 11px 14px;
        border: 1.5px solid rgba(200,195,235,0.55);
        border-radius: 10px;
        font-size: 14px;
        font-family: var(--app-font);
        color: #150830;
        background: rgba(255,255,255,0.72);
        transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        outline: none;
        width: 100%;
        box-sizing: border-box;
    }
    .am-input::placeholder { color: rgba(80,60,120,0.42); }
    .am-input:focus {
        border-color: var(--app-accent);
        background: rgba(255,255,255,0.90);
        box-shadow: 0 0 0 3px rgba(102,0,255,0.10);
    }
    .am-password-wrap {
        position: relative;
        display: flex;
        align-items: center;
    }
    .am-password-wrap .am-input {
        padding-right: 44px;
    }
    .am-eye {
        position: absolute;
        right: 12px;
        background: none;
        border: none;
        cursor: pointer;
        color: rgba(80,60,120,0.55);
        padding: 0;
        display: flex;
        align-items: center;
        line-height: 1;
        transition: color 0.15s;
    }
    .am-eye:hover { color: var(--app-accent); }

    /* ─── Terms ───────────────────────────────────────────────────────── */
    .am-terms {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        cursor: pointer;
        margin-top: -2px;
    }
    .am-terms-check {
        margin-top: 2px;
        flex-shrink: 0;
        width: 15px;
        height: 15px;
        accent-color: var(--app-accent);
        cursor: pointer;
    }
    .am-terms-text {
        font-size: 13px;
        color: rgba(60,40,100,0.65);
        line-height: 1.45;
        font-family: var(--app-font);
    }
    .am-terms-link {
        color: var(--app-accent);
        text-decoration: underline;
        font-weight: 500;
    }
    .am-terms-link:hover { opacity: 0.8; }

    /* ─── Error ───────────────────────────────────────────────────────── */
    .am-error {
        font-size: 12px;
        color: #9b1c1c;
        background: rgba(255,200,200,0.45);
        border: 1px solid rgba(200,100,100,0.35);
        border-radius: 8px;
        padding: 7px 10px;
        font-family: var(--app-font);
        backdrop-filter: blur(4px);
    }

    /* ─── Submit — full-width purple gradient pill ────────────────────── */
    .am-submit {
        background: linear-gradient(135deg, #7c3aed 0%, #6600FF 55%, #5500dd 100%);
        color: #fff;
        border: none;
        border-radius: 12px;
        font-size: 15px;
        font-weight: 700;
        padding: 14px;
        cursor: pointer;
        font-family: var(--app-font);
        margin-top: 4px;
        transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
        box-shadow: 0 4px 18px rgba(102,0,255,0.38);
        width: 100%;
        letter-spacing: 0.01em;
    }
    .am-submit--continue {
        background: #1a0a40;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    }
    .am-submit--continue:hover { opacity: 0.85; transform: translateY(-1px); }
    .am-submit:not(.am-submit--continue):hover {
        opacity: 0.92;
        transform: translateY(-1px);
        box-shadow: 0 6px 24px rgba(102,0,255,0.48);
    }
    .am-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    /* ─── Footer ──────────────────────────────────────────────────────── */
    .am-footer {
        text-align: center;
        margin-top: 16px;
        font-size: 13px;
        color: rgba(60,40,100,0.65);
        font-family: var(--app-font);
    }
    .am-link {
        background: none;
        border: none;
        color: var(--app-accent);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: var(--app-font);
        padding: 0;
    }
    .am-link:hover { text-decoration: underline; }

    /* ─── OAuth Buttons — white pill style matching reference image ─────── */
    .am-oauth {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 4px;
    }
    .am-oauth-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        width: 100%;
        padding: 12px 16px;
        border: 1px solid rgba(200,195,235,0.45);
        border-radius: 12px;
        background: rgba(255,255,255,0.75);
        font-size: 14px;
        font-weight: 500;
        color: #1a0a40;
        cursor: pointer;
        font-family: var(--app-font);
        transition: background 0.14s, border-color 0.14s, box-shadow 0.14s;
        box-sizing: border-box;
    }
    .am-oauth-btn:hover {
        background: rgba(255,255,255,0.92);
        border-color: rgba(180,170,220,0.60);
        box-shadow: 0 2px 8px rgba(100,80,180,0.10);
    }
    .am-oauth-btn:active { background: rgba(240,236,252,0.90); }

    /* ─── Divider ─────────────────────────────────────────────────────────── */
    .am-divider {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 14px 0 4px;
        color: rgba(80,60,120,0.50);
        font-size: 12px;
        font-family: var(--app-font);
    }
    .am-divider::before,
    .am-divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: rgba(150,130,200,0.28);
    }

    @media (max-width: 480px) {
        .am-modal, .am-modal--signup {
            padding: 26px 20px 22px;
            border-radius: 18px;
        }
        .am-name-row {
            grid-template-columns: 1fr;
        }
    }
`;

export const UPGRADE_MODAL_STYLES = `
    .um-overlay {
        position: fixed; inset: 0; z-index: 100000;
        background: rgba(10,12,30,0.72); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        padding: 24px; box-sizing: border-box;
        opacity: 0; transition: opacity 0.2s ease;
    }
    .um-overlay--visible { opacity: 1; }
    .um-modal {
        background: #fff; border-radius: 20px;
        padding: 40px 36px 32px; max-width: 440px; width: 100%;
        box-shadow: 0 24px 64px rgba(30,50,120,0.22), 0 4px 16px rgba(102,0,255,0.14);
        position: relative; text-align: center;
        font-family: var(--app-font);
    }
    .um-close {
        position: absolute; top: 14px; right: 16px;
        background: none; border: none; font-size: 22px; cursor: pointer;
        color: var(--app-text-muted, #7a8aaa); line-height: 1;
        padding: 2px 6px; border-radius: 6px; transition: background 0.15s;
    }
    .um-close:hover { background: #f0f0f8; }
    .um-icon { font-size: 48px; margin-bottom: 12px; }
    .um-title {
        font-size: 20px; font-weight: 700; color: var(--app-text, #1a2035);
        margin: 0 0 10px; line-height: 1.3;
    }
    .um-description {
        font-size: 14px; color: var(--app-text-2, #5a6a85); margin: 0 0 20px;
        line-height: 1.6;
    }
    .um-usage-bar-wrap { margin-bottom: 20px; }
    .um-usage-label {
        display: flex; justify-content: space-between;
        font-size: 12px; color: var(--app-text-2, #5a6a85); margin-bottom: 6px;
    }
    .um-usage-bar {
        height: 6px; background: #eee; border-radius: 99px; overflow: hidden;
    }
    .um-usage-fill {
        height: 100%; background: var(--app-gradient); border-radius: 99px;
    }
    .um-plan-badge {
        display: inline-flex; align-items: center; gap: 8px;
        background: var(--app-violet-soft, rgba(102,0,255,0.08));
        border: 1.5px solid rgba(102,0,255,0.2);
        border-radius: 99px; padding: 8px 16px; margin-bottom: 24px;
    }
    .um-plan-badge-label { font-size: 12px; color: var(--app-text-2); }
    .um-plan-badge-name {
        font-size: 13px; font-weight: 700; color: var(--app-accent, #6600FF);
    }
    .um-plan-badge-price { font-size: 12px; color: var(--app-text-muted); }
    .um-actions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
    .um-btn {
        padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 600;
        font-family: var(--app-font); cursor: pointer; border: none; transition: all 0.15s;
    }
    .um-btn-primary {
        background: var(--app-gradient); color: #fff;
        box-shadow: 0 4px 14px rgba(102,0,255,0.35);
    }
    .um-btn-primary:hover { opacity: 0.9; box-shadow: 0 6px 18px rgba(102,0,255,0.45); }
    .um-btn-secondary {
        background: #f5f6fa; color: var(--app-text-2, #5a6a85);
    }
    .um-btn-secondary:hover { background: #eef0f8; }
    .um-footer { font-size: 11.5px; color: var(--app-text-muted, #7a8aaa); margin: 0; }
`;

export const WELCOME_MODAL_STYLES = `
    /* ─── Overlay ─────────────────────────────────────────────────────── */
    .wm-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15,20,50,0.60);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        font-family: var(--app-font);
        animation: wm-fade 0.22s ease;
    }
    @keyframes wm-fade { from { opacity: 0; } to { opacity: 1; } }

    /* ─── Modal shell ─────────────────────────────────────────────────── */
    .wm-modal {
        display: flex;
        width: 820px;
        max-width: 96vw;
        min-height: 520px;
        max-height: 92vh;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 32px 80px rgba(102,0,255,0.28), 0 8px 24px rgba(30,50,120,0.18);
        animation: wm-slide 0.26s cubic-bezier(0.22,1,0.36,1);
    }
    @keyframes wm-slide {
        from { opacity: 0; transform: translateY(28px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* ─── Left panel (white) ──────────────────────────────────────────── */
    .wm-left {
        flex: 1 1 0;
        background: #ffffff;
        padding: 40px 44px 36px;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
    }

    /* PRYZM logo */
    .wm-logo {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 32px;
    }
    .wm-logo-icon {
        width: 96px;
        height: 96px;
        object-fit: contain;
    }
    .wm-logo-text {
        height: 54px;
        object-fit: contain;
    }

    /* Headline */
    .wm-headline {
        font-size: 26px;
        font-weight: 800;
        line-height: 1.25;
        color: #1a1a2e;
        margin: 0 0 12px;
        letter-spacing: -0.5px;
    }
    .wm-sub {
        font-size: 14px;
        color: var(--app-text-2);
        line-height: 1.55;
        margin: 0 0 28px;
    }

    /* Role chips */
    .wm-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 32px;
    }
    .wm-chip {
        padding: 8px 16px;
        border: 1.5px solid var(--app-border);
        border-radius: 8px;
        background: #ffffff;
        font-size: 13px;
        font-weight: 600;
        color: var(--app-text);
        cursor: pointer;
        font-family: var(--app-font);
        transition: border-color 0.15s, background 0.15s, color 0.15s;
        line-height: 1;
    }
    .wm-chip:hover {
        border-color: var(--app-accent);
        background: var(--app-violet-soft);
        color: var(--app-accent);
    }
    .wm-chip--active {
        border-color: var(--app-accent);
        background: var(--app-violet-soft);
        color: var(--app-accent);
    }

    /* Submit */
    .wm-submit {
        background: var(--app-gradient);
        color: #ffffff;
        border: none;
        border-radius: 10px;
        font-size: 15px;
        font-weight: 700;
        padding: 13px 24px;
        cursor: pointer;
        font-family: var(--app-font);
        width: 100%;
        box-shadow: var(--app-shadow-glow);
        transition: opacity 0.15s, transform 0.15s;
        margin-bottom: 12px;
    }
    .wm-submit:hover { opacity: 0.88; transform: translateY(-1px); }

    /* Skip */
    .wm-skip {
        background: none;
        border: none;
        color: var(--app-text-muted);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        font-family: var(--app-font);
        padding: 0;
        text-align: center;
        width: 100%;
        transition: color 0.12s;
    }
    .wm-skip:hover { color: var(--app-text); }

    /* ─── Right panel (violet gradient) ───────────────────────────────── */
    .wm-right {
        flex: 0 0 340px;
        background: var(--app-gradient);
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }

    /* Close button (top-right of right panel) */
    .wm-close {
        position: absolute;
        top: 16px;
        right: 18px;
        background: rgba(255,255,255,0.18);
        border: none;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        font-size: 18px;
        color: #ffffff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        transition: background 0.15s;
        font-family: var(--app-font);
    }
    .wm-close:hover { background: rgba(255,255,255,0.30); }

    /* Decorative mockup */
    .wm-decor {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 24px;
        width: 100%;
    }
    .wm-decor-card {
        background: rgba(255,255,255,0.14);
        border-radius: 12px;
        padding: 14px 16px;
        backdrop-filter: blur(4px);
        border: 1px solid rgba(255,255,255,0.22);
    }
    .wm-decor-card--top {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .wm-decor-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: rgba(255,255,255,0.70);
        flex-shrink: 0;
    }
    .wm-decor-lines { display: flex; flex-direction: column; gap: 5px; flex: 1; }
    .wm-decor-line {
        height: 6px;
        border-radius: 3px;
        background: rgba(255,255,255,0.45);
    }
    .wm-decor-line--wide { width: 80%; }
    .wm-decor-line--mid  { width: 55%; }
    .wm-decor-line--short { width: 35%; }

    .wm-decor-viewport {
        background: rgba(255,255,255,0.10);
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.18);
        height: 130px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 10px;
        padding: 16px;
        position: relative;
    }
    .wm-decor-cube {
        border-radius: 4px;
        background: rgba(255,255,255,0.50);
    }
    .wm-decor-cube--a { width: 36px; height: 60px; }
    .wm-decor-cube--b { width: 36px; height: 90px; background: rgba(255,255,255,0.70); }
    .wm-decor-cube--c { width: 36px; height: 44px; }
    .wm-decor-label {
        position: absolute;
        top: 10px;
        left: 14px;
        font-size: 10px;
        font-weight: 700;
        color: rgba(255,255,255,0.60);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-family: var(--app-font);
    }

    /* ─── Responsive — stack below 640px ─────────────────────────────── */
    @media (max-width: 640px) {
        .wm-right { display: none; }
        .wm-modal { width: 96vw; }
        .wm-left  { padding: 32px 24px; }
    }
`;

export const CONTACT_SALES_MODAL_STYLES = `
    .cs-overlay {
        position: fixed;
        inset: 0;
        background: rgba(10, 10, 20, 0.6);
        backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        font-family: var(--app-font);
        opacity: 0;
        transition: opacity 0.2s ease;
    }
    .cs-overlay--visible { opacity: 1; }

    .cs-modal {
        position: relative;
        display: flex;
        width: 820px;
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 48px);
        overflow: hidden;
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 24px 64px rgba(30, 50, 120, 0.22);
        animation: cs-slide 0.24s cubic-bezier(0.22, 1, 0.36, 1);
    }
    @keyframes cs-slide {
        from { opacity: 0; transform: translateY(20px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0)    scale(1);    }
    }
    .cs-close {
        position: absolute; top: 14px; right: 16px; z-index: 2;
        background: none; border: none; font-size: 22px; cursor: pointer;
        color: var(--app-text-muted, #7a8aaa); line-height: 1;
        padding: 2px 6px; border-radius: 6px; transition: background 0.15s;
    }
    .cs-close:hover { background: rgba(0,0,0,0.06); }

    .cs-left {
        flex: 1 1 0; padding: 44px 48px 40px;
        display: flex; flex-direction: column; overflow-y: auto;
    }
    .cs-right {
        flex: 0 0 320px;
        background: linear-gradient(160deg, #8B5CF6 0%, #5500dd 100%);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 40px 32px; overflow: hidden; position: relative;
    }

    .cs-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; }
    .cs-brand-icon { width: 36px; height: 36px; display: block; flex-shrink: 0; }
    .cs-brand-name {
        font-size: 18px; font-weight: 700; letter-spacing: 3px; color: #150830;
        font-family: var(--app-font);
    }

    .cs-heading {
        font-size: 24px; font-weight: 800; color: #1a1a2e; margin: 0 0 10px;
        letter-spacing: -0.4px; line-height: 1.25; font-family: var(--app-font);
    }
    .cs-sub {
        font-size: 14px; color: var(--app-text-2, #5a6a85); margin: 0 0 28px;
        line-height: 1.55; font-family: var(--app-font);
    }

    .cs-form { display: flex; flex-direction: column; gap: 14px; }
    .cs-field { display: flex; flex-direction: column; gap: 5px; }
    .cs-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .cs-label {
        font-size: 12px; font-weight: 600;
        color: var(--app-text-2, #5a6a85); font-family: var(--app-font);
    }
    .cs-input, .cs-select, .cs-textarea {
        padding: 10px 13px;
        border: 1.5px solid var(--app-border, rgba(200,205,225,0.7));
        border-radius: 8px; font-size: 14px; font-family: var(--app-font);
        color: var(--app-text, #1a2035);
        background: rgba(255,255,255,0.65);
        transition: border-color 0.15s, box-shadow 0.15s;
        outline: none; width: 100%; box-sizing: border-box;
    }
    .cs-textarea { resize: vertical; min-height: 80px; }
    .cs-input:focus, .cs-select:focus, .cs-textarea:focus {
        border-color: var(--app-accent, #6600FF);
        box-shadow: 0 0 0 3px rgba(102,0,255,0.10);
    }
    .cs-submit {
        background: var(--app-gradient);
        color: #fff; border: none; border-radius: 10px;
        font-size: 15px; font-weight: 700; padding: 13px;
        cursor: pointer; font-family: var(--app-font);
        width: 100%; margin-top: 4px;
        box-shadow: 0 4px 14px rgba(102,0,255,0.30);
        transition: opacity 0.15s, transform 0.15s;
    }
    .cs-submit:hover { opacity: 0.9; transform: translateY(-1px); }
    .cs-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .cs-error {
        font-size: 12px; color: #c62828; background: #fff5f5;
        border: 1px solid #fecaca; border-radius: 6px;
        padding: 7px 10px; font-family: var(--app-font);
    }
    .cs-success {
        text-align: center; padding: 24px 0;
        display: flex; flex-direction: column; align-items: center; gap: 12px;
    }
    .cs-success-icon { font-size: 40px; }
    .cs-success-title {
        font-size: 18px; font-weight: 700; color: #1a1a2e;
        margin: 0; font-family: var(--app-font);
    }
    .cs-success-sub {
        font-size: 13px; color: var(--app-text-2, #5a6a85);
        margin: 0; font-family: var(--app-font); line-height: 1.5;
    }

    .cs-right-title {
        font-size: 22px; font-weight: 800; color: #fff;
        margin: 0 0 12px; text-align: center; font-family: var(--app-font);
    }
    .cs-right-sub {
        font-size: 13px; color: rgba(255,255,255,0.80);
        text-align: center; line-height: 1.55;
        font-family: var(--app-font); margin: 0 0 28px;
    }
    .cs-features { display: flex; flex-direction: column; gap: 12px; width: 100%; }
    .cs-feature {
        display: flex; align-items: center; gap: 10px;
        background: rgba(255,255,255,0.14); border-radius: 10px;
        padding: 10px 14px; border: 1px solid rgba(255,255,255,0.22);
    }
    .cs-feature-icon { font-size: 20px; flex-shrink: 0; }
    .cs-feature-text {
        font-size: 13px; font-weight: 600; color: #fff;
        font-family: var(--app-font); line-height: 1.3;
    }

    @media (max-width: 700px) {
        .cs-right { display: none; }
        .cs-modal { width: calc(100vw - 32px); }
        .cs-left  { padding: 32px 24px; }
        .cs-row   { grid-template-columns: 1fr; }
    }
`;
