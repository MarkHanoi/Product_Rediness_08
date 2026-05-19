/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Data Workbench: Compliance Panel (Phase C-2)
 * File:             src/ui/dataworkbench/CompliancePanel.ts
 * Contract:         docs/PRYZM_MASTER_ROADMAP_2026.md § PHASE C-2
 *
 * Live compliance table that displays all ConstraintEngine validation results.
 *
 * Features:
 *   - [Run All] button triggers a fresh ConstraintEngine.run()
 *   - Table: status icon / rule ID / element name / message / regulation
 *   - Click row → dispatches 'pryzm-workbench-select' to navigate to element in 3D
 *   - Summary footer: "X errors · Y warnings · Z passing"
 *   - Auto-refreshes on 'pryzm-constraints-updated' event
 *   - Groups results by severity (errors first, then warnings, then info)
 *
 * CSS prefix: dw- (shared with Data Workbench stylesheet)
 */

import type { ValidationResult } from '@pryzm/constraint-solver/compliance';

const SEV_ICON: Record<string, string> = {
    error:   '🔴',
    warning: '⚠️',
    info:    'ℹ️',
};

const SEV_COLOUR: Record<string, string> = {
    error:   '#ef4444',
    warning: '#f59e0b',
    info:    '#3b82f6',
};

const SEV_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 };

export class CompliancePanel {
    private _container: HTMLElement;
    private _root!: HTMLElement;
    private _lastResults: ValidationResult[] = [];
    private _totalRuleCount = 12; // 7 T1 + 5 T2

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._container = container;
        this._root = document.createElement('div');
        this._root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
        this._container.appendChild(this._root);

        this._render();
        this._bindEvents();
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    refresh(): void {
        this._render();
    }

    // ── Rendering ──────────────────────────────────────────────────────────────

    private _render(): void {
        const results = this._lastResults;
        this._root.innerHTML = '';

        // Toolbar
        this._root.appendChild(this._buildToolbar(results));

        // Summary banner
        this._root.appendChild(this._buildSummary(results));

        // Results table
        const scroll = document.createElement('div');
        scroll.style.cssText = 'flex:1;overflow-y:auto;';

        if (results.length === 0) {
            scroll.appendChild(this._buildEmpty());
        } else {
            scroll.appendChild(this._buildTable(results));
        }

        this._root.appendChild(scroll);
    }

    private _buildToolbar(results: ValidationResult[]): HTMLElement {
        const toolbar = document.createElement('div');
        toolbar.className = 'dw-toolbar';

        const runBtn = document.createElement('button');
        runBtn.className = 'dw-toolbar-btn dw-toolbar-btn--primary';
        runBtn.textContent = '▶ Run All Checks';
        runBtn.title = 'Run all compliance rules against the current model';
        runBtn.addEventListener('click', () => {
            runBtn.disabled = true;
            runBtn.textContent = '⏳ Running…';
            setTimeout(() => {
                const ce = window.constraintEngine; // TODO(D.4): legacy constraintEngine — replace with runtime.scene.constraint engine
                if (ce) {
                    ce.run();
                } else {
                    runBtn.disabled = false;
                    runBtn.textContent = '▶ Run All Checks';
                }
            }, 20);
        });
        toolbar.appendChild(runBtn);

        // Export PDF button
        const pdfBtn = document.createElement('button');
        pdfBtn.className = 'dw-toolbar-btn';
        pdfBtn.textContent = '🖨 Export PDF';
        pdfBtn.title = 'Export compliance report as PDF';
        pdfBtn.style.cssText = 'font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--app-border,#e5e7eb);background:var(--app-surface,#fff);color:var(--app-text,#1e293b);cursor:pointer;';
        pdfBtn.addEventListener('click', () => this._exportPdf(results));
        toolbar.appendChild(pdfBtn);

        // Ask AI button
        const aiBtn = document.createElement('button');
        aiBtn.className = 'dw-toolbar-btn';
        aiBtn.textContent = '✦ Ask AI';
        aiBtn.title = 'Ask AI for specific element-level suggestions to fix compliance failures';
        aiBtn.style.cssText = 'font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--app-border,#e5e7eb);background:var(--app-surface,#fff);color:var(--app-text,#1e293b);cursor:pointer;';
        aiBtn.addEventListener('click', () => this._askAi(results, aiBtn));
        toolbar.appendChild(aiBtn);

        // Tier filter
        const tierSelect = document.createElement('select');
        tierSelect.className = 'dw-toolbar-select';
        tierSelect.title = 'Filter by rule tier';
        tierSelect.style.cssText = 'font-size:11px;padding:2px 4px;border-radius:4px;border:1px solid var(--app-border,#e5e7eb);background:var(--app-surface,#fff);color:var(--app-text,#1e293b);cursor:pointer;margin-left:auto;';
        [
            { value: 'all', label: 'All tiers' },
            { value: '1',   label: 'Tier 1 only' },
            { value: '2',   label: 'Tier 2 only' },
        ].forEach(({ value, label }) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            tierSelect.appendChild(opt);
        });

        // Category filter — includes Physics category from Phase H
        const catSelect = document.createElement('select');
        catSelect.className = 'dw-toolbar-select';
        catSelect.title = 'Filter by category';
        catSelect.style.cssText = 'font-size:11px;padding:2px 4px;border-radius:4px;border:1px solid var(--app-border,#e5e7eb);background:var(--app-surface,#fff);color:var(--app-text,#1e293b);cursor:pointer;';
        [
            { value: 'all',     label: 'All categories' },
            { value: 'spatial', label: 'Spatial / Code' },
            { value: 'physics', label: '⚡ Physics' },
        ].forEach(({ value, label }) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            catSelect.appendChild(opt);
        });

        const applyFilters = () => {
            const tier = tierSelect.value === 'all' ? null : parseInt(tierSelect.value) as 1 | 2;
            const cat  = catSelect.value;
            let filtered = this._lastResults;
            if (tier != null) filtered = filtered.filter(r => r.tier === tier);
            if (cat === 'physics')  filtered = filtered.filter(r => r.ruleId.startsWith('ACOUSTIC_') || r.ruleId.startsWith('DAYLIGHT_') || r.ruleId.startsWith('THERMAL_'));
            if (cat === 'spatial')  filtered = filtered.filter(r => !r.ruleId.startsWith('ACOUSTIC_') && !r.ruleId.startsWith('DAYLIGHT_') && !r.ruleId.startsWith('THERMAL_'));
            this._renderTable(filtered);
        };

        tierSelect.addEventListener('change', applyFilters);
        catSelect.addEventListener('change', applyFilters);
        toolbar.appendChild(tierSelect);
        toolbar.appendChild(catSelect);

        return toolbar;
    }

    // ── Export PDF ─────────────────────────────────────────────────────────────

    private _exportPdf(results: ValidationResult[]): void {
        const errors   = results.filter(r => r.severity === 'error').length;
        const warnings = results.filter(r => r.severity === 'warning').length;
        const passing  = Math.max(0, this._totalRuleCount - new Set(results.map(r => r.ruleId)).size);
        const date     = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

        const rows = [...results]
            .sort((a, b) => ({ error: 0, warning: 1, info: 2 }[a.severity] ?? 3) - ({ error: 0, warning: 1, info: 2 }[b.severity] ?? 3))
            .map(r => `
                <tr>
                    <td>${r.severity === 'error' ? '🔴' : r.severity === 'warning' ? '⚠️' : 'ℹ️'}</td>
                    <td style="font-family:monospace;font-size:10px;">${r.ruleId}</td>
                    <td>${r.elementType ?? '—'}</td>
                    <td>${r.message}</td>
                    <td>${r.regulation ?? '—'}</td>
                    <td>${r.suggestion ?? '—'}</td>
                </tr>`)
            .join('');

        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>PRYZM Compliance Report</title>
<style>
    body { font-family: sans-serif; font-size: 12px; color: #1e293b; padding: 32px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #64748b; font-size: 11px; margin-bottom: 24px; }
    .summary { display: flex; gap: 24px; margin-bottom: 24px; padding: 12px 16px; background: #f8fafc; border-radius: 6px; }
    .summary span { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f8fafc; padding: 6px 8px; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    @media print { body { padding: 16px; } }
</style></head><body>
<h1>PRYZM — Compliance Report</h1>
<div class="meta">Generated: ${date}</div>
<div class="summary">
    <span style="color:#ef4444">${errors} error${errors !== 1 ? 's' : ''}</span>
    <span style="color:#f59e0b">${warnings} warning${warnings !== 1 ? 's' : ''}</span>
    <span style="color:#22c55e">${passing} passing</span>
</div>
<table>
    <thead><tr><th></th><th>Rule ID</th><th>Element</th><th>Message</th><th>Regulation</th><th>Suggestion</th></tr></thead>
    <tbody>${rows.length ? rows : '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:24px;">No violations found</td></tr>'}</tbody>
</table>
</body></html>`;

        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
    }

    // ── Ask AI ─────────────────────────────────────────────────────────────────

    private async _askAi(results: ValidationResult[], btn: HTMLButtonElement): Promise<void> {
        if (results.length === 0) {
            this._showAiOverlay('No violations to advise on — run checks first.');
            return;
        }

        btn.disabled = true;
        btn.textContent = '⏳ Asking AI…';

        try {
            const token = window.authToken ?? ''; // TODO(C.3.x): legacy authToken — replace with runtime.session.authToken
            const failures = results
                .filter(r => r.severity === 'error' || r.severity === 'warning')
                .slice(0, 30)
                .map(r => ({ ruleId: r.ruleId, elementId: r.elementId, elementType: r.elementType, message: r.message, regulation: r.regulation ?? '' }));

            const worldModelAdapter = window.worldModelAdapter; // TODO(D.4): legacy worldModelAdapter — replace with runtime.scene.world-model adapter
            const complianceContext = worldModelAdapter?.getComplianceContext?.() ?? null;

            const res = await fetch('/api/ai/compliance/advise', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ failures, complianceContext }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: res.statusText }));
                this._showAiOverlay(`AI request failed: ${err.error ?? res.statusText}`);
                return;
            }

            const data = await res.json();
            this._showAiOverlay(data.rawText ?? 'No suggestions returned.');
        } catch (err) {
            this._showAiOverlay(`Error contacting AI: ${String(err)}`);
        } finally {
            btn.disabled = false;
            btn.textContent = '✦ Ask AI';
        }
    }

    private _showAiOverlay(text: string): void {
        const existing = document.getElementById('dw-compliance-ai-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'dw-compliance-ai-overlay';
        overlay.style.cssText = `
            position:absolute;inset:0;z-index:200;
            display:flex;align-items:flex-start;justify-content:center;
            padding-top:48px;
            background:rgba(0,0,0,0.45);
        `;

        const panel = document.createElement('div');
        panel.style.cssText = `
            background:var(--app-surface,#fff);
            border:1px solid var(--app-border,#e5e7eb);
            border-radius:10px;
            padding:20px 24px;
            max-width:440px;width:90%;
            box-shadow:0 8px 32px rgba(0,0,0,0.18);
            position:relative;
        `;

        const title = document.createElement('div');
        title.textContent = '✦ AI Compliance Advisor';
        title.style.cssText = 'font-weight:700;font-size:13px;margin-bottom:12px;color:var(--app-text,#1e293b);';

        const body = document.createElement('div');
        body.style.cssText = 'font-size:12px;line-height:1.6;white-space:pre-wrap;color:var(--app-text,#1e293b);max-height:320px;overflow-y:auto;';
        body.textContent = text;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'position:absolute;top:10px;right:12px;background:none;border:none;font-size:14px;cursor:pointer;color:var(--app-text-muted,#7a8aaa);';
        closeBtn.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        panel.appendChild(closeBtn);
        panel.appendChild(title);
        panel.appendChild(body);
        overlay.appendChild(panel);

        // Attach to nearest positioned ancestor
        const host = this._container.closest('[style*="position"]') ?? this._container.parentElement ?? document.body;
        (host as HTMLElement).style.position = 'relative';
        host.appendChild(overlay);
    }

    private _buildSummary(results: ValidationResult[]): HTMLElement {
        const errors   = results.filter(r => r.severity === 'error').length;
        const warnings = results.filter(r => r.severity === 'warning').length;
        const infos    = results.filter(r => r.severity === 'info').length;
        // "passing" = rule IDs that returned no violations
        const failing  = new Set(results.map(r => r.ruleId)).size;
        const passing  = Math.max(0, this._totalRuleCount - failing);

        const bar = document.createElement('div');
        bar.className = 'dw-compliance-summary';
        bar.style.cssText = `
            display:flex;gap:12px;padding:8px 12px;
            background:var(--app-surface-2,#f8fafc);
            border-bottom:1px solid var(--app-border,#e5e7eb);
            font-size:11px;font-weight:600;
        `;

        const items = [
            { label: `${errors} error${errors !== 1 ? 's' : ''}`,   colour: errors > 0 ? '#ef4444' : '#6b7280' },
            { label: `${warnings} warning${warnings !== 1 ? 's' : ''}`, colour: warnings > 0 ? '#f59e0b' : '#6b7280' },
            { label: `${infos} info`,  colour: infos > 0 ? '#3b82f6' : '#6b7280' },
            { label: `${passing} passing`, colour: passing > 0 ? '#22c55e' : '#6b7280' },
        ];

        for (const item of items) {
            const span = document.createElement('span');
            span.textContent = item.label;
            span.style.color = item.colour;
            bar.appendChild(span);
        }

        if (results.length === 0) {
            bar.innerHTML = '<span style="color:#9ca3af;font-weight:400;">Click Run All Checks to validate the model.</span>';
        }

        return bar;
    }

    private _buildEmpty(): HTMLElement {
        const div = document.createElement('div');
        div.className = 'dw-placeholder';
        div.innerHTML = `
            <div class="dw-placeholder-icon">✅</div>
            <div style="font-weight:700;font-size:13px;color:var(--app-text)">No violations found</div>
            <div style="font-size:12px;max-width:220px;text-align:center;line-height:1.5;color:var(--app-text-muted,#7a8aaa)">
                All ${this._totalRuleCount} compliance rules passed.<br>
                Click Run All Checks to re-validate.
            </div>
        `;
        return div;
    }

    private _buildTable(results: ValidationResult[]): HTMLElement {
        const sorted = [...results].sort((a, b) =>
            (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3)
        );

        const wrapper = document.createElement('div');
        wrapper.id = 'dw-compliance-table-wrapper';

        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px;';

        // Header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr style="background:var(--app-surface-2,#f8fafc);border-bottom:2px solid var(--app-border,#e5e7eb);">
                <th style="width:24px;padding:6px 8px;text-align:center;"></th>
                <th style="padding:6px 4px;text-align:left;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Rule</th>
                <th style="padding:6px 4px;text-align:left;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Element</th>
                <th style="padding:6px 4px;text-align:left;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Message</th>
                <th style="padding:6px 4px;text-align:left;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Reg.</th>
                <th style="padding:6px 4px;text-align:left;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Suggestion</th>
            </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (const result of sorted) {
            const row = this._buildRow(result);
            tbody.appendChild(row);
        }
        table.appendChild(tbody);
        wrapper.appendChild(table);
        return wrapper;
    }

    private _buildRow(result: ValidationResult): HTMLElement {
        const tr = document.createElement('tr');
        tr.style.cssText = `
            border-bottom:1px solid var(--app-border,#e5e7eb);
            cursor:pointer;
            transition:background 0.1s;
        `;
        tr.addEventListener('mouseenter', () => { tr.style.background = 'var(--app-surface-hover,rgba(102,0,255,0.04))'; });
        tr.addEventListener('mouseleave', () => { tr.style.background = ''; });

        tr.addEventListener('click', () => {
            // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
            window.runtime?.events?.emit('pryzm-workbench-select', { nodeId: result.elementId, nodeType: result.elementType });
            window.runtime?.events?.emit('pryzm-compliance-row-selected', result as unknown as { readonly [key: string]: unknown }); // F.events.16
        });

        const colour = SEV_COLOUR[result.severity] ?? '#6b7280';
        const icon   = SEV_ICON[result.severity]  ?? '•';

        tr.innerHTML = `
            <td style="padding:7px 8px;text-align:center;font-size:13px;">${icon}</td>
            <td style="padding:7px 4px;color:var(--app-text-muted,#7a8aaa);white-space:nowrap;font-family:monospace;font-size:10px;">${result.ruleId}</td>
            <td style="padding:7px 4px;color:${colour};font-weight:600;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;" title="${result.elementId}">${result.elementType}</td>
            <td style="padding:7px 4px;color:var(--app-text,#1e293b);line-height:1.4;max-width:200px;">${result.message}</td>
            <td style="padding:7px 4px;color:var(--app-text-muted,#7a8aaa);font-size:10px;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis;" title="${result.regulation ?? ''}">${result.regulation ?? '—'}</td>
            <td style="padding:7px 4px;color:#6366f1;font-size:10px;line-height:1.4;max-width:160px;">${result.suggestion ?? '—'}</td>
        `;

        return tr;
    }

    private _renderTable(results: ValidationResult[]): void {
        const wrapper = this._root.querySelector('#dw-compliance-table-wrapper');
        if (!wrapper) return;
        const parent = wrapper.parentElement;
        if (!parent) return;
        parent.removeChild(wrapper);
        if (results.length === 0) {
            parent.appendChild(this._buildEmpty());
        } else {
            parent.appendChild(this._buildTable(results));
        }
    }

    // ── Event binding ──────────────────────────────────────────────────────────

    private _bindEvents(): void {
        window.addEventListener('pryzm-constraints-updated', (e: Event) => {
            const detail = (e as CustomEvent).detail ?? {};
            this._lastResults = detail.results ?? [];
            this._totalRuleCount = detail.ruleCount ?? 12;
            this._render();

            // Re-enable run button if it was in loading state
            const btn = this._root.querySelector('.dw-toolbar-btn') as HTMLButtonElement | null;
            if (btn) {
                btn.disabled = false;
                btn.textContent = '▶ Run All Checks';
            }
        });
    }
}
