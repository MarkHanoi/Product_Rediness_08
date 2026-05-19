/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Data Workbench (Phase D-4)
 * File:             src/ui/dataworkbench/NLQueryPanel.ts
 * Contract:         docs/00_PRZYM/PRYZM_MASTER_ROADMAP_2026.md §D-4
 *
 * NLQueryPanel — Natural Language Query interface for the Data Workbench.
 *
 * Renders inside the "NL Query" tab of the DataWorkbench.
 * Delegates all query processing to SemanticQueryEngine (read-only, local, no network).
 * Clicking a result row dispatches pryzm-element-selected and pryzm-workbench-select
 * events so the 3D canvas and hierarchy panel respond.
 *
 * UI layout:
 *   ┌─────────────────────────────────────┐
 *   │  [input]    [Run]                   │
 *   │  ┌────── suggested queries ──────┐  │
 *   │  └──────────────────────────────┘  │
 *   │  ── results ─────────────────────  │
 *   │  [row] label        meta           │
 *   └─────────────────────────────────────┘
 *
 * CSS: inline styles only (no external class dependency for this panel).
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { semanticQueryEngine, NLQueryResult, NLQueryRow } from '@pryzm/ai-host';

const SUGGESTED_QUERIES = [
    'model summary',
    'show all rooms',
    'rooms without doors',
    'rooms smaller than 10',
    'show all walls',
    'count of beams',
    'show all doors',
    'relationship summary',
];

export class NLQueryPanel {
    private _el: HTMLElement;
    private _root!: HTMLElement;
    private _input!: HTMLInputElement;
    private _runBtn!: HTMLButtonElement;
    private _resultsEl!: HTMLElement;
    private _statusEl!: HTMLElement;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._el = container;
        this._root = document.createElement('div');
        this._root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
        this._el.appendChild(this._root);
        this._buildDOM();
    }

    refresh(): void {
        // Nothing to refresh — panel is stateless between queries
    }

    // ── DOM ───────────────────────────────────────────────────────────────────

    private _buildDOM(): void {
        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding:12px 12px 8px;border-bottom:1px solid var(--app-border,#334155);flex-shrink:0;';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--app-text-muted,#94a3b8);margin-bottom:8px;';
        title.textContent = 'Natural Language Query';
        header.appendChild(title);

        // Input row
        const inputRow = document.createElement('div');
        inputRow.style.cssText = 'display:flex;gap:6px;';

        this._input = document.createElement('input');
        this._input.type = 'text';
        this._input.placeholder = 'e.g. rooms without doors';
        this._input.style.cssText = [
            'flex:1;padding:6px 10px;border-radius:6px;',
            'border:1px solid var(--app-border,#334155);',
            'background:var(--app-surface,#1e293b);',
            'color:var(--app-text,#e2e8f0);',
            'font-size:12px;outline:none;',
        ].join('');
        this._input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._runQuery();
        });
        inputRow.appendChild(this._input);

        this._runBtn = document.createElement('button');
        this._runBtn.textContent = 'Run';
        this._runBtn.style.cssText = [
            'padding:6px 12px;border-radius:6px;border:none;cursor:pointer;',
            'background:#3B82F6;color:#fff;font-size:12px;font-weight:600;',
            'flex-shrink:0;',
        ].join('');
        this._runBtn.addEventListener('click', () => this._runQuery());
        inputRow.appendChild(this._runBtn);
        header.appendChild(inputRow);
        this._root.appendChild(header);

        // Suggested queries
        const chips = document.createElement('div');
        chips.style.cssText = 'padding:8px 12px;border-bottom:1px solid var(--app-border,#334155);flex-shrink:0;display:flex;flex-wrap:wrap;gap:4px;';

        for (const q of SUGGESTED_QUERIES) {
            const chip = document.createElement('button');
            chip.textContent = q;
            chip.style.cssText = [
                'font-size:10px;padding:3px 8px;border-radius:12px;',
                'border:1px solid var(--app-border,#334155);background:transparent;',
                'color:var(--app-text-muted,#94a3b8);cursor:pointer;',
                'transition:background .15s,color .15s;',
            ].join('');
            chip.addEventListener('mouseenter', () => {
                chip.style.background = '#3B82F6';
                chip.style.color = '#fff';
                chip.style.borderColor = '#3B82F6';
            });
            chip.addEventListener('mouseleave', () => {
                chip.style.background = 'transparent';
                chip.style.color = 'var(--app-text-muted,#94a3b8)';
                chip.style.borderColor = 'var(--app-border,#334155)';
            });
            chip.addEventListener('click', () => {
                this._input.value = q;
                this._runQuery();
            });
            chips.appendChild(chip);
        }
        this._root.appendChild(chips);

        // Status / summary bar
        this._statusEl = document.createElement('div');
        this._statusEl.style.cssText = 'padding:6px 12px;font-size:11px;color:var(--app-text-muted,#94a3b8);flex-shrink:0;min-height:24px;';
        this._root.appendChild(this._statusEl);

        // Results
        this._resultsEl = document.createElement('div');
        this._resultsEl.style.cssText = 'flex:1;overflow-y:auto;';
        this._root.appendChild(this._resultsEl);
    }

    // ── Query execution ───────────────────────────────────────────────────────

    private _runQuery(): void {
        const raw = this._input.value.trim();
        if (!raw) return;

        this._runBtn.disabled = true;
        this._runBtn.textContent = '…';
        this._statusEl.textContent = 'Querying…';
        this._resultsEl.innerHTML = '';

        // Yield to the event loop so the UI updates before potentially synchronous work.
        // D.7.5: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce('nl-query-run', () => {
            try {
                const result = semanticQueryEngine.query(raw);
                this._renderResult(result);
            } catch (err: any) {
                this._statusEl.textContent = `Error: ${err?.message ?? String(err)}`;
                this._resultsEl.innerHTML = '';
            } finally {
                this._runBtn.disabled = false;
                this._runBtn.textContent = 'Run';
            }
        });
    }

    private _renderResult(result: NLQueryResult): void {
        const durationText = result.durationMs > 0 ? ` (${result.durationMs} ms)` : '';
        this._statusEl.textContent = result.summary + durationText;

        this._resultsEl.innerHTML = '';

        if (result.rows.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:24px 12px;text-align:center;color:var(--app-text-muted,#94a3b8);font-size:12px;';
            empty.textContent = result.rows.length === 0 ? 'No results.' : '';
            this._resultsEl.appendChild(empty);
            return;
        }

        const list = document.createElement('div');
        list.style.cssText = 'padding:4px 0;';

        for (const row of result.rows) {
            list.appendChild(this._buildRow(row));
        }

        this._resultsEl.appendChild(list);
    }

    private _buildRow(row: NLQueryRow): HTMLElement {
        const el = document.createElement('div');
        el.style.cssText = [
            'display:flex;align-items:center;gap:8px;padding:7px 12px;',
            'cursor:pointer;transition:background .12s;border-bottom:1px solid var(--app-border,#1e293b33);',
        ].join('');

        el.addEventListener('mouseenter', () => { el.style.background = 'var(--app-hover,rgba(59,130,246,.08))'; });
        el.addEventListener('mouseleave', () => { el.style.background = ''; });

        // Type badge
        const badge = document.createElement('span');
        badge.textContent = this._typeBadge(row.type);
        badge.style.cssText = [
            'width:20px;height:20px;border-radius:4px;font-size:11px;',
            'display:flex;align-items:center;justify-content:center;flex-shrink:0;',
            `background:${this._typeColor(row.type)};`,
        ].join('');
        el.appendChild(badge);

        // Label
        const label = document.createElement('div');
        label.style.cssText = 'flex:1;font-size:12px;color:var(--app-text,#e2e8f0);';
        label.textContent = row.label;
        el.appendChild(label);

        // Meta
        if (row.meta) {
            const meta = document.createElement('div');
            meta.style.cssText = 'font-size:10px;color:var(--app-text-muted,#94a3b8);flex-shrink:0;';
            meta.textContent = row.meta;
            el.appendChild(meta);
        }

        // Click → select
        if (row.type !== 'stat') {
            el.title = `Select ${row.type} ${row.id}`;
            el.addEventListener('click', () => {
                this.runtime?.events?.emit('pryzm-element-selected', { elementId: row.id, elementType: row.type, source: 'nl-query-panel' });
                // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
                window.runtime?.events?.emit('pryzm-workbench-select', { id: row.id, type: row.type, source: 'nl-query-panel' });
            });
        }

        return el;
    }

    private _typeBadge(type: string): string {
        const map: Record<string, string> = {
            wall: '🧱', room: '🏠', slab: '▬', beam: '━', column: '│',
            door: '🚪', window: '🪟', stair: '🪜', furniture: '🪑',
            opening: '⬜', stat: '📊',
        };
        return map[type] ?? '◆';
    }

    private _typeColor(type: string): string {
        const map: Record<string, string> = {
            wall: '#475569', room: '#0ea5e9', slab: '#7c3aed', beam: '#b45309',
            column: '#15803d', door: '#dc2626', window: '#0891b2', stair: '#9333ea',
            furniture: '#ea580c', opening: '#6b7280', stat: '#334155',
        };
        return map[type] ?? '#334155';
    }
}
