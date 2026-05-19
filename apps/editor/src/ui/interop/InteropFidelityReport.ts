/**
 * InteropFidelityReport.ts — Phase 1 (Revit & Rhino Interoperability)
 *
 * Post-import fidelity report card shown after:
 *   - An IFC import (especially from Revit) → shows IfcConversionStats
 *   - A Rhino .3DM import → shows RhinoImportStats
 *
 * Displayed as a slide-in card at the bottom-right of the screen.
 * Auto-dismisses after 12 seconds; user can also close manually.
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import type { RhinoImportStats } from '@pryzm/file-format';
import type { IfcConversionReport } from '@pryzm/file-format';

function esc(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

type BadgeStyle = 'green' | 'orange' | 'blue' | 'grey';

function badge(count: number, label: string, style: BadgeStyle = 'blue'): string {
    if (count === 0) return '';
    const colors: Record<BadgeStyle, string> = {
        green:  'background:#dcfce7;color:#166534;',
        orange: 'background:#fef3c7;color:#92400e;',
        blue:   'background:#eff6ff;color:#1e40af;',
        grey:   'background:#f1f5f9;color:#475569;',
    };
    return `<span style="${colors[style]}padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap;">${count.toLocaleString()} ${esc(label)}</span>`;
}

export function showIfcFidelityReport(report: IfcConversionReport, sourceApp?: 'revit' | 'unknown', runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime showIfcFidelityReport */): void {
    void runtime; /* B-runtime-void showIfcFidelityReport — TODO(C.3.x): once runtime.toasts is wired in the import path, replace _showCard's bespoke DOM toast with runtime.toasts.show(...) */
    const s = report.stats;
    const total = s.converted ?? 0;
    const failed = s.failed ?? 0;
    const issues = report.issues?.filter(i => i.severity === 'warn' || i.severity === 'error') ?? [];

    const appLabel = sourceApp === 'revit' ? 'Revit (via IFC)' : 'IFC model';
    const appColor = sourceApp === 'revit' ? '#0A84FF' : '#6600FF';

    const rows: string[] = [];
    const cats: [number, string][] = [
        [s.walls, 'Walls'], [s.slabs + s.floors + s.ceilings, 'Slabs / Floors'],
        [s.rooms, 'Rooms'], [s.doors, 'Doors'], [s.windows, 'Windows'],
        [s.columns, 'Columns'], [s.beams, 'Beams'], [s.stairs, 'Stairs'],
        [s.roofs, 'Roofs'], [s.curtainwalls, 'Curtain Walls'],
        [s.railings, 'Railings'], [s.furniture, 'Furniture'],
        [s.proxies, 'Reference Proxies'],
    ];
    for (const [count, label] of cats) {
        if (count > 0) rows.push(`<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #f0f2f8;"><span style="font-size:12px;color:#4a5a78;">${esc(label)}</span><span style="font-size:12px;font-weight:700;color:#1a2035;">${count.toLocaleString()}</span></div>`);
    }

    _showCard({
        sourceLabel: appLabel,
        sourceColor: appColor,
        total,
        failed,
        bodyRows: rows.join(''),
        issueCount: issues.length,
        issues: issues.slice(0, 3).map(i => `<div style="font-size:11px;color:${i.severity === 'error' ? '#dc2626' : '#92400e'};padding:3px 0;">${esc(i.message)}</div>`).join(''),
        footerNote: total > 0 ? 'Elements are now editable as native PRYZM objects.' : undefined,
    });
}

export function showRhinoFidelityReport(stats: RhinoImportStats, _fileName: string, elapsed: number, issues: string[], runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime showRhinoFidelityReport */): void {
    void runtime; /* B-runtime-void showRhinoFidelityReport — TODO(C.3.x): once runtime.toasts is wired, replace _showCard's bespoke DOM toast with runtime.toasts.show(...) */
    const rows: string[] = [
        stats.objectCount > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f2f8;"><span style="font-size:12px;color:#4a5a78;">Total objects</span><span style="font-size:12px;font-weight:700;">${stats.objectCount.toLocaleString()}</span></div>` : '',
        stats.meshCount > 0   ? `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f2f8;"><span style="font-size:12px;color:#4a5a78;">Meshes</span><span style="font-size:12px;font-weight:700;">${stats.meshCount.toLocaleString()}</span></div>` : '',
        stats.brepCount > 0   ? `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f2f8;"><span style="font-size:12px;color:#4a5a78;">Surfaces / BReps</span><span style="font-size:12px;font-weight:700;">${stats.brepCount.toLocaleString()}</span></div>` : '',
        stats.curveCount > 0  ? `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f2f8;"><span style="font-size:12px;color:#4a5a78;">Curves</span><span style="font-size:12px;font-weight:700;">${stats.curveCount.toLocaleString()}</span></div>` : '',
        stats.layerCount > 0  ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="font-size:12px;color:#4a5a78;">Layers</span><span style="font-size:12px;font-weight:700;">${stats.layerCount.toLocaleString()}</span></div>` : '',
    ].filter(Boolean);

    _showCard({
        sourceLabel: 'Rhino (.3DM)',
        sourceColor: '#00A86B',
        total: stats.objectCount,
        failed: 0,
        bodyRows: rows.join(''),
        issueCount: issues.length,
        issues: issues.slice(0, 2).map(i => `<div style="font-size:11px;color:#92400e;padding:3px 0;">${esc(i)}</div>`).join(''),
        footerNote: `Imported as reference geometry in ${(elapsed / 1000).toFixed(1)}s. Use snap to trace native walls and rooms on top.`,
        extraBadges: `${badge(stats.layerCount, 'layers', 'grey')}`,
    });
}

interface CardOptions {
    sourceLabel: string;
    sourceColor: string;
    total:       number;
    failed:      number;
    bodyRows:    string;
    issueCount:  number;
    issues:      string;
    footerNote?: string;
    extraBadges?: string;
}

function _showCard(opts: CardOptions): void {
    document.getElementById('pryzm-interop-fidelity-report')?.remove();

    const card = document.createElement('div');
    card.id = 'pryzm-interop-fidelity-report';
    card.style.cssText = [
        'position:fixed', 'bottom:24px', 'right:24px', 'z-index:999990',
        'width:min(340px,calc(100vw - 32px))',
        'border-radius:16px',
        'background:#ffffff',
        'border:1px solid #dde3f0',
        'box-shadow:0 8px 32px rgba(30,50,120,0.14),0 2px 8px rgba(30,50,120,0.07)',
        'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'overflow:hidden',
        'transform:translateY(20px)', 'opacity:0', 'transition:transform .28s ease,opacity .28s ease',
    ].join(';');

    const fidelityPct = opts.total > 0 && opts.failed === 0
        ? 100
        : opts.total > 0
        ? Math.round((opts.total / (opts.total + opts.failed)) * 100)
        : 0;

    const fidelityColor = fidelityPct >= 90 ? '#16a34a' : fidelityPct >= 70 ? '#d97706' : '#dc2626';

    card.innerHTML = `
        <div style="background:${opts.sourceColor};padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">
            <div>
                <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:1px;">Import complete</div>
                <div style="font-size:14px;font-weight:700;color:#ffffff;">${esc(opts.sourceLabel)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <div style="text-align:center;">
                    <div style="font-size:20px;font-weight:800;color:#ffffff;line-height:1;">${opts.total}</div>
                    <div style="font-size:9px;color:rgba(255,255,255,0.7);font-weight:600;">ELEMENTS</div>
                </div>
                <button id="pfr-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;" title="Close">✕</button>
            </div>
        </div>
        <div style="padding:14px 16px;">
            ${opts.total > 0 ? `
            <div style="margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                    <span style="font-size:11px;font-weight:600;color:#7a8aaa;text-transform:uppercase;letter-spacing:.06em;">Conversion fidelity</span>
                    <span style="font-size:12px;font-weight:800;color:${fidelityColor};">${fidelityPct}%</span>
                </div>
                <div style="height:5px;border-radius:999px;background:#f0f2f8;">
                    <div style="height:100%;width:${fidelityPct}%;border-radius:999px;background:${fidelityColor};transition:width .5s ease;"></div>
                </div>
                ${opts.failed > 0 ? `<div style="font-size:11px;color:#dc2626;margin-top:4px;">${opts.failed} element${opts.failed !== 1 ? 's' : ''} failed to convert</div>` : ''}
            </div>
            ` : ''}
            <div style="max-height:160px;overflow-y:auto;">${opts.bodyRows || '<div style="font-size:13px;color:#7a8aaa;text-align:center;padding:8px;">No elements found</div>'}</div>
            ${opts.issues ? `<div style="margin-top:10px;padding:8px;background:#fef9ec;border-radius:8px;border-left:3px solid #f59e0b;">${opts.issues}</div>` : ''}
            ${opts.footerNote ? `<div style="margin-top:10px;font-size:11px;color:#6b7280;line-height:1.5;">${esc(opts.footerNote)}</div>` : ''}
        </div>
        <div style="background:#fafbfd;border-top:1px solid #f0f2f8;padding:8px 16px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            ${badge(opts.total, 'converted', 'green')}
            ${opts.failed > 0 ? badge(opts.failed, 'failed', 'orange') : ''}
            ${opts.extraBadges ?? ''}
        </div>
    `;

    document.body.appendChild(card);

    // D.7.5: routed through getFrameScheduler() instead of raw rAF.
    getFrameScheduler().scheduleOnce('interop-fidelity-card-show', () => {
        card.style.transform = 'translateY(0)';
        card.style.opacity = '1';
    });

    const dismiss = () => {
        card.style.transform = 'translateY(20px)';
        card.style.opacity = '0';
        setTimeout(() => card.remove(), 300);
    };

    card.querySelector('#pfr-close')?.addEventListener('click', dismiss);
    setTimeout(dismiss, 12000);
}
