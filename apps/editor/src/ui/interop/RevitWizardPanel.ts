/**
 * RevitWizardPanel.ts — Phase 1 (Revit & Rhino Interoperability)
 *
 * A compact modal that guides users through the Revit → PRYZM import workflow.
 * Resolves to `true` (user confirmed upload) or `false` (cancelled).
 *
 * Design: follows §05 / §06 contracts — violet palette only, no blue.
 * Layout: header + scrollable body + sticky footer (Continue always visible).
 */

function esc(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

const STEPS = [
    {
        n: '1',
        title: 'Export IFC from Revit',
        body: 'In Revit go to <strong>File → Export → IFC</strong>. Select <strong>IFC4</strong> (or IFC 2x3 for older practices) and click <strong>Export</strong>.',
    },
    {
        n: '2',
        title: 'Optional: free IFC Exporter add-in',
        body: 'For better fidelity, install the free <strong>Autodesk IFC Exporter</strong> from <em>github.com/Autodesk/revit-ifc</em> before exporting.',
    },
    {
        n: '3',
        title: 'Upload the .ifc file',
        body: 'Click <strong>Continue to Upload</strong> below — PRYZM will open a file picker. Import takes 10–30 s depending on model size.',
    },
];

export class RevitWizardPanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    static show(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime RevitWizardPanel.show */): Promise<boolean> {
        void runtime; /* B-runtime-void RevitWizardPanel.show — TODO(C.x): once runtime.dialogs is wired, mount the wizard via runtime.dialogs.openModal(...) instead of bespoke overlay DOM */
        return new Promise<boolean>((resolve) => {
            document.getElementById('pryzm-revit-wizard')?.remove();

            // ── Overlay ────────────────────────────────────────────────────
            const overlay = document.createElement('div');
            overlay.id = 'pryzm-revit-wizard';
            overlay.style.cssText = [
                'position:fixed', 'inset:0', 'z-index:1000000',
                'display:flex', 'align-items:center', 'justify-content:center',
                'background:rgba(5,8,18,0.55)', 'backdrop-filter:blur(4px)',
                'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            ].join(';');

            // ── Card shell — flex column, max-height capped ────────────────
            const card = document.createElement('div');
            card.style.cssText = [
                'width:min(400px,calc(100vw - 32px))',
                'max-height:min(480px,calc(100vh - 48px))',
                'display:flex', 'flex-direction:column',
                'border-radius:16px',
                'background:#ffffff',
                'box-shadow:0 8px 32px rgba(30,50,120,0.13),0 2px 8px rgba(30,50,120,0.07)',
                'overflow:hidden',
            ].join(';');

            // ── Header ─────────────────────────────────────────────────────
            const header = document.createElement('div');
            header.style.cssText = [
                'background:linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%)',
                'padding:14px 18px',
                'display:flex', 'align-items:center', 'gap:12px',
                'flex-shrink:0',
                'box-shadow:0 2px 12px rgba(102,0,255,0.35)',
            ].join(';');
            header.innerHTML = `
                <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                    <rect width="30" height="30" rx="7" fill="rgba(255,255,255,0.15)"/>
                    <path d="M7 9h16M7 15h10M7 21h7" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <div style="flex:1;">
                    <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,0.65);margin-bottom:1px;">Import from Revit</div>
                    <div style="font-size:12px;font-weight:700;color:#fff;">Revit → PRYZM via IFC</div>
                </div>
                <button id="rwp-close" style="background:rgba(255,255,255,0.15);border:none;color:#fff;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;" title="Cancel">✕</button>
            `;

            // ── Scrollable body ────────────────────────────────────────────
            const body = document.createElement('div');
            body.style.cssText = [
                'flex:1', 'overflow-y:auto', 'padding:16px 18px 12px',
                'scrollbar-width:thin', 'scrollbar-color:#c4cde0 transparent',
            ].join(';');

            const intro = document.createElement('p');
            intro.style.cssText = 'margin:0 0 14px;font-size:12px;color:#5a6a85;line-height:1.55;';
            intro.innerHTML = 'PRYZM imports Revit models via the open <strong>IFC standard</strong> — no APS tokens required. Export IFC from Revit (free), then upload here.';
            body.appendChild(intro);

            for (const s of STEPS) {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #f0f2f8;';
                row.innerHTML = `
                    <div style="width:24px;height:24px;border-radius:50%;background:#6600FF;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:1px;">${esc(s.n)}</div>
                    <div>
                        <div style="font-size:13px;font-weight:700;color:#1a2035;margin-bottom:3px;">${esc(s.title)}</div>
                        <div style="font-size:12px;line-height:1.55;color:#5a6a85;">${s.body}</div>
                    </div>
                `;
                body.appendChild(row);
            }

            const note = document.createElement('div');
            note.style.cssText = [
                'margin-top:12px', 'padding:10px 12px',
                'background:#f7f5ff', 'border-radius:10px',
                'border:1px solid rgba(102,0,255,0.12)',
                'font-size:11px', 'color:#5a6a85', 'line-height:1.5',
            ].join(';');
            note.innerHTML = '<strong style="color:#6600FF;">What carries over:</strong> geometry, rooms, levels, materials, property sets. <em>Parametric constraints and Revit families become static PRYZM elements.</em>';
            body.appendChild(note);

            // ── Sticky footer ──────────────────────────────────────────────
            const footer = document.createElement('div');
            footer.style.cssText = [
                'flex-shrink:0',
                'display:flex', 'gap:8px', 'justify-content:flex-end',
                'padding:12px 18px',
                'border-top:1px solid #f0f2f8',
                'background:#fff',
            ].join(';');
            footer.innerHTML = `
                <button id="rwp-cancel" style="padding:8px 18px;border:1px solid #dde3f0;border-radius:8px;background:#fff;color:#4a5a78;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>
                <button id="rwp-continue" style="padding:8px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#8B5CF6,#6600FF);color:#fff;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(102,0,255,0.30);">Continue to Upload →</button>
            `;

            card.appendChild(header);
            card.appendChild(body);
            card.appendChild(footer);
            overlay.appendChild(card);
            document.body.appendChild(overlay);

            const close = (result: boolean) => {
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity .18s ease';
                setTimeout(() => overlay.remove(), 200);
                resolve(result);
            };

            card.querySelector('#rwp-close')?.addEventListener('click', () => close(false));
            card.querySelector('#rwp-cancel')?.addEventListener('click', () => close(false));
            card.querySelector('#rwp-continue')?.addEventListener('click', () => close(true));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
        });
    }
}
