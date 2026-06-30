// Office building — the "Set up your office building" preview modal DOM controller.
//
// The SIBLING of ResidentialBuildingModal: an office tower is ONE deterministic
// result, so the modal shows the circular floor-plate preview SVG + the analytics
// panel + a Build / Cancel choice. Thin DOM shell (document.body.appendChild — NOT
// PanelManager); reuses the brand `alm-overlay`/`alm-panel` classes (white + #6600FF,
// z-index 4000); the `ob-*` CSS is injected once on first open. NO scene mutation.

import type { OfficeBuildingOk } from '@pryzm/ai-host';
import { buildOfficePlatePreviewSvg, buildOfficeAnalyticsHtml } from './officePlatePreview.js';

export interface OfficeBuildingModalCallbacks {
    readonly onBuild: () => void;
    readonly onCancel: () => void;
}

const STYLE_ID = 'pryzm-office-modal-styles';

const STYLES = `
.ob-wrap { display:flex; gap:24px; flex-wrap:wrap; align-items:flex-start; }
.ob-preview { flex:0 0 auto; }
.ob-preview svg { border-radius:12px; box-shadow:0 2px 12px #6600FF22; }
.ob-preview-caption { margin-top:8px; font-size:12px; color:#6600FF; font-weight:600; text-align:center; }
.ob-analytics { flex:1 1 320px; min-width:300px; color:#1a1a2e; }
.ob-section-title { font-size:12px; font-weight:700; color:#6600FF; text-transform:uppercase; letter-spacing:0.04em; margin:14px 0 6px; }
.ob-metrics { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
.ob-metric { background:#F7F4FF; border:1px solid #6600FF22; border-radius:10px; padding:8px 10px; }
.ob-metric-value { font-size:18px; font-weight:700; color:#1a1a2e; }
.ob-metric-label { font-size:11px; color:#555; margin-top:2px; }
.ob-rise { font-size:13px; color:#333; }
.ob-legend { display:flex; flex-direction:column; gap:4px; }
.ob-legend-row { display:flex; align-items:center; gap:8px; font-size:12px; }
.ob-swatch { width:14px; height:14px; border-radius:3px; flex:0 0 auto; }
.ob-legend-label { flex:1 1 auto; color:#222; }
.ob-legend-area { color:#6600FF; font-weight:600; white-space:nowrap; }
.ob-chips { display:flex; flex-wrap:wrap; gap:6px; }
.ob-chip { background:#EDE4FF; color:#4400AA; border-radius:999px; padding:3px 10px; font-size:11px; font-weight:600; }
`;

export class OfficeBuildingModal {
    private _el: HTMLDivElement | null = null;
    private _escHandler: ((e: KeyboardEvent) => void) | null = null;

    get isOpen(): boolean { return this._el !== null; }

    show(result: OfficeBuildingOk, cb: OfficeBuildingModalCallbacks): void {
        this.dismiss();
        this._ensureStyles();

        const a = result.analytics;
        const preview = buildOfficePlatePreviewSvg(result, 320);
        const analytics = buildOfficeAnalyticsHtml(result);

        const overlay = document.createElement('div');
        overlay.className = 'alm-overlay';
        overlay.innerHTML =
            `<div class="alm-panel" style="max-width:760px">` +
            `<h2 style="color:#6600FF;margin:0 0 4px">Set up your office building</h2>` +
            `<p style="margin:0 0 16px;color:#444">A ${a.stories}-storey circular tower — ${Math.round(a.radiusM * 2)} m diameter plate, ` +
            `${a.totalDesks.toLocaleString()} desks across ${a.officeFloors} office floors.</p>` +
            `<div class="ob-wrap">` +
            `<div class="ob-preview">${preview}<div class="ob-preview-caption">Representative open-plan floor</div></div>` +
            analytics +
            `</div>` +
            `<div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px">` +
            `<button class="alm-cancel" style="background:#fff;border:1px solid #6600FF;color:#6600FF;border-radius:8px;padding:8px 18px;cursor:pointer">Cancel</button>` +
            `<button data-action="build" style="background:#6600FF;border:none;color:#fff;border-radius:8px;padding:8px 18px;cursor:pointer;font-weight:600">Build this tower</button>` +
            `</div>` +
            `</div>`;

        overlay.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (target === overlay) { this.dismiss(); cb.onCancel(); return; }
            if (target.closest('.alm-cancel')) { this.dismiss(); cb.onCancel(); return; }
            if (target.closest('[data-action="build"]')) { this.dismiss(); cb.onBuild(); return; }
        });

        this._escHandler = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') { this.dismiss(); cb.onCancel(); }
        };
        document.addEventListener('keydown', this._escHandler);

        document.body.appendChild(overlay);
        this._el = overlay;
    }

    /** Surface a soft-fail reason as a simple error overlay (display only). */
    showError(reason: string, onDismiss: () => void): void {
        this.dismiss();
        this._ensureStyles();
        const overlay = document.createElement('div');
        overlay.className = 'alm-overlay';
        overlay.innerHTML =
            `<div class="alm-panel" style="max-width:460px">` +
            `<h2 style="color:#6600FF;margin:0 0 8px">Office building</h2>` +
            `<p style="margin:0 0 16px;color:#444">${escapeHtml(reason)}</p>` +
            `<div style="display:flex;justify-content:flex-end">` +
            `<button data-action="dismiss" style="background:#6600FF;border:none;color:#fff;border-radius:8px;padding:8px 18px;cursor:pointer;font-weight:600">OK</button>` +
            `</div></div>`;
        overlay.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (target === overlay || target?.closest('[data-action="dismiss"]')) { this.dismiss(); onDismiss(); }
        });
        document.body.appendChild(overlay);
        this._el = overlay;
    }

    dismiss(): void {
        if (this._escHandler) { document.removeEventListener('keydown', this._escHandler); this._escHandler = null; }
        if (this._el?.parentNode) this._el.parentNode.removeChild(this._el);
        this._el = null;
    }

    private _ensureStyles(): void {
        if (typeof document === 'undefined') return;
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = STYLES;
        document.head.appendChild(style);
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
    ));
}
