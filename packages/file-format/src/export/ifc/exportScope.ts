import type { IfcExportScope } from './IfcExporter';

export function getImportedIfcElementCount(): number {
    const importedModels = window.ifcModelStore?.getAll?.() ?? []; // TODO(TASK-08)
    return importedModels.reduce((total: number, model: any) => total + (model.elements?.length ?? 0), 0);
}

/**
 * Shows a PRYZM-styled modal to let the user choose an IFC export scope.
 * Returns the chosen scope, or null if the user cancelled.
 *
 * Replaces the old window.confirm() approach.
 */
export function showExportScopeModal(): Promise<IfcExportScope | null> {
    const importedCount = getImportedIfcElementCount();

    document.getElementById('pryzm-export-scope-modal')?.remove();

    return new Promise<IfcExportScope | null>((resolve) => {
        // ── Overlay ────────────────────────────────────────────────────────────
        const overlay = document.createElement('div');
        overlay.id = 'pryzm-export-scope-modal';
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:1000000',
            'display:flex', 'align-items:center', 'justify-content:center',
            'background:rgba(5,8,18,0.52)', 'backdrop-filter:blur(4px)',
            'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        ].join(';');

        // ── Card ───────────────────────────────────────────────────────────────
        const card = document.createElement('div');
        card.style.cssText = [
            'width:min(380px,calc(100vw - 32px))', 'border-radius:16px',
            'background:#ffffff', 'color:#1a2035',
            'box-shadow:0 8px 32px rgba(30,50,120,0.13),0 2px 8px rgba(30,50,120,0.07)',
            'overflow:hidden',
        ].join(';');

        // ── Header ─────────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.style.cssText = [
            'background:linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%)',
            'padding:11px 14px', 'display:flex', 'align-items:center', 'gap:10px',
            'box-shadow:0 2px 12px rgba(102,0,255,0.35)',
        ].join(';');
        header.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2" style="flex-shrink:0">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <div>
                <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:1px;">IFC Export</div>
                <div style="font-size:12px;font-weight:600;color:#fff;line-height:1.2;">Choose export scope</div>
            </div>
        `;

        // ── Body ───────────────────────────────────────────────────────────────
        const body = document.createElement('div');
        body.style.cssText = 'padding:12px 14px 14px;';

        const infoHtml = importedCount > 0
            ? `<div style="background:rgba(102,0,255,0.06);border:1px solid rgba(102,0,255,0.18);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:11px;line-height:1.5;color:#5a6a85;">
                <strong style="color:#6600FF;">${importedCount.toLocaleString()} imported IFC element${importedCount !== 1 ? 's' : ''}</strong> are present and can be included in the export.
               </div>`
            : `<div style="background:#f4f7fc;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:11px;line-height:1.5;color:#7a8aaa;">
                No imported IFC elements — only native PRYZM elements will be exported.
               </div>`;

        body.innerHTML = infoHtml;

        // ── Option buttons ─────────────────────────────────────────────────────
        const btnNative = document.createElement('button');
        btnNative.style.cssText = [
            'width:100%', 'padding:10px 12px', 'border-radius:10px', 'border:none',
            'background:linear-gradient(135deg,#8B5CF6,#6600FF)', 'color:#fff',
            'font-size:12px', 'font-weight:700', 'cursor:pointer',
            'display:flex', 'align-items:center', 'gap:10px', 'margin-bottom:8px',
            'box-shadow:0 2px 10px rgba(102,0,255,0.30)', 'text-align:left',
            'transition:opacity .15s',
        ].join(';');
        btnNative.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            <div>
                <div>Export native elements only</div>
                <div style="font-size:11px;font-weight:400;opacity:.75;margin-top:2px;">PRYZM-authored walls, slabs, columns, doors, windows…</div>
            </div>
        `;
        btnNative.addEventListener('mouseenter', () => { btnNative.style.opacity = '0.88'; });
        btnNative.addEventListener('mouseleave', () => { btnNative.style.opacity = '1'; });

        const btnAll = document.createElement('button');
        const allDisabled = importedCount <= 0;
        btnAll.style.cssText = [
            'width:100%', 'padding:10px 12px', 'border-radius:10px',
            'border:1px solid rgba(102,0,255,0.25)', 'color:#1a2035',
            'background:#f4f7fc',
            'font-size:12px', 'font-weight:700', 'cursor:' + (allDisabled ? 'not-allowed' : 'pointer'),
            'display:flex', 'align-items:center', 'gap:10px', 'margin-bottom:12px',
            'opacity:' + (allDisabled ? '0.38' : '1'),
            'text-align:left', 'transition:background .15s',
        ].join(';');
        btnAll.disabled = allDisabled;
        btnAll.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6600FF" stroke-width="2" style="flex-shrink:0">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <div>
                <div>Export all in view</div>
                <div style="font-size:11px;font-weight:400;color:#7a8aaa;margin-top:2px;">Native elements + ${importedCount.toLocaleString()} imported IFC element${importedCount !== 1 ? 's' : ''} retained in scene</div>
            </div>
        `;
        if (!allDisabled) {
            btnAll.addEventListener('mouseenter', () => { btnAll.style.background = 'rgba(102,0,255,0.08)'; });
            btnAll.addEventListener('mouseleave', () => { btnAll.style.background = '#f4f7fc'; });
        }

        // ── Cancel ─────────────────────────────────────────────────────────────
        const btnCancel = document.createElement('button');
        btnCancel.style.cssText = [
            'width:100%', 'padding:10px 18px', 'border-radius:10px',
            'border:1px solid #dde3f0', 'color:#7a8aaa',
            'background:transparent', 'font-size:13px', 'font-weight:600',
            'cursor:pointer', 'transition:background .15s',
        ].join(';');
        btnCancel.textContent = 'Cancel';
        btnCancel.addEventListener('mouseenter', () => { btnCancel.style.background = '#f4f7fc'; });
        btnCancel.addEventListener('mouseleave', () => { btnCancel.style.background = 'transparent'; });

        body.appendChild(btnNative);
        body.appendChild(btnAll);
        body.appendChild(btnCancel);

        card.appendChild(header);
        card.appendChild(body);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        // ── Resolve helpers ────────────────────────────────────────────────────
        function close(result: IfcExportScope | null) {
            overlay.style.transition = 'opacity .2s ease';
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 220);
            resolve(result);
        }

        btnNative.addEventListener('click', () => close('native-only'));
        btnAll.addEventListener('click', () => { if (!allDisabled) close('native-and-imported'); });
        btnCancel.addEventListener('click', () => close(null));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    });
}

/** @deprecated Use showExportScopeModal() instead */
export function chooseIfcExportScope(): IfcExportScope {
    const importedCount = getImportedIfcElementCount();
    if (importedCount <= 0) return 'native-only';
    return window.confirm(
        `Choose IFC export scope:\n\nOK: Native + ${importedCount.toLocaleString()} imported IFC element(s)\nCancel: Native elements only`,
    ) ? 'native-and-imported' : 'native-only';
}
