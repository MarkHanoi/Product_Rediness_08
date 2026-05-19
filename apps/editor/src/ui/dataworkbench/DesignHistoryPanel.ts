/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Data Workbench (Phase G-2)
 * File:             src/ui/dataworkbench/DesignHistoryPanel.ts
 * Contract:         docs/00_PRZYM/PRYZM_WORLD_MODEL_MASTER_PLAN_2026.md § Phase G-2
 *
 * DesignHistoryPanel — Temporal design audit interface for the DataWorkbench.
 *
 * Renders inside the "History" tab of the DataWorkbench.
 * Reads directly from `temporalGraphManager` (G-1 singleton) — no network calls,
 * no mutations to live project state.
 *
 * UI layout:
 *   ┌─────────────────────────────────────────────┐
 *   │  STATS BAR: edges | mutations | sessions     │
 *   │  ── Sessions ────────────────────────────── │
 *   │  [session card] [session card] …             │
 *   │  ── Scrubber ────────────────────────────── │
 *   │  [◀─────────────────────────────────▶]      │
 *   │  label: "Showing state at 2026-04-02 14:22" │
 *   │  [Reset to now]    [👁 Ghost overlay]        │
 *   │  ── At selected time ──────────────────────  │
 *   │  Sub-tabs: [Mutations]  [Rel Diff]           │
 *   │  … scrollable log / diff view …              │
 *   └─────────────────────────────────────────────┘
 *
 * CSS: inline styles only (self-contained; no external class dependency).
 *
 * Events dispatched:
 *   pryzm-history-ghost-activate  { detail: { timestamp: number } }
 *   pryzm-history-ghost-deactivate {}
 */

import { temporalGraphManager, SessionSummary } from '@pryzm/core-app-model';
import type { TemporalEdge, NodeMutationRecord, TemporalSlice } from '@pryzm/core-app-model';
import { RationaleExporter } from '@pryzm/file-format';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(ts: number): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function fmtShort(ts: number): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function shortId(id: string): string {
    return id.slice(-8).toUpperCase();
}

function opBadge(op: string): string {
    const map: Record<string, string> = {
        create: '#22c55e', update: '#3b82f6', delete: '#ef4444',
    };
    return map[op] ?? '#9ca3af';
}

// ── Panel class ───────────────────────────────────────────────────────────────

export class DesignHistoryPanel {
    private _el: HTMLElement;
    private _root!: HTMLElement;
    private _statsEl!: HTMLElement;
    private _sessionListEl!: HTMLElement;
    private _scrubberEl!: HTMLInputElement;
    private _scrubberLabelEl!: HTMLElement;
    private _ghostBtn!: HTMLButtonElement;
    private _subTabMutBtn!: HTMLButtonElement;
    private _subTabDiffBtn!: HTMLButtonElement;
    private _mutLogEl!: HTMLElement;
    private _diffEl!: HTMLElement;
    private _activeSubTab: 'mutations' | 'diff' = 'mutations';
    private _scrubTs: number = Date.now();
    private _ghostActive = false;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._el = container;
        this._root = document.createElement('div');
        this._root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;font-family:var(--app-font,system-ui);';
        this._el.appendChild(this._root);
        this._buildDOM();
    }

    refresh(): void {
        this._renderStats();
        this._renderSessions();
        this._resetScrubber();
        this._renderSubView();
    }

    // ── DOM construction ──────────────────────────────────────────────────────

    private _buildDOM(): void {
        // ── Stats bar ──────────────────────────────────────────────────────
        this._statsEl = document.createElement('div');
        this._statsEl.style.cssText = [
            'display:flex;gap:8px;padding:10px 12px 8px;',
            'border-bottom:1px solid var(--app-border,#e2e8f0);',
            'flex-shrink:0;flex-wrap:wrap;',
        ].join('');
        this._root.appendChild(this._statsEl);

        // ── Sessions section ───────────────────────────────────────────────
        const sessHeader = this._sectionHeader('Sessions');
        this._root.appendChild(sessHeader);

        this._sessionListEl = document.createElement('div');
        this._sessionListEl.style.cssText = [
            'padding:6px 10px 4px;flex-shrink:0;',
            'display:flex;flex-direction:column;gap:4px;',
            'max-height:140px;overflow-y:auto;',
        ].join('');
        this._root.appendChild(this._sessionListEl);

        // ── Scrubber section ───────────────────────────────────────────────
        const scrubHeader = this._sectionHeader('Time Scrubber');
        this._el.appendChild(scrubHeader);

        const scrubWrap = document.createElement('div');
        scrubWrap.style.cssText = 'padding:8px 12px 4px;flex-shrink:0;';

        this._scrubberEl = document.createElement('input');
        this._scrubberEl.type = 'range';
        this._scrubberEl.style.cssText = 'width:100%;accent-color:#6366f1;cursor:pointer;';
        this._scrubberEl.addEventListener('input', () => this._onScrub());
        scrubWrap.appendChild(this._scrubberEl);

        this._scrubberLabelEl = document.createElement('div');
        this._scrubberLabelEl.style.cssText = [
            'font-size:11px;color:var(--app-text-muted,#7a8aaa);',
            'margin-top:3px;text-align:center;',
        ].join('');
        scrubWrap.appendChild(this._scrubberLabelEl);

        // Ghost + reset buttons
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:6px;margin-top:8px;';

        const resetBtn = this._mkBtn('Reset to now', '#6366f1');
        resetBtn.addEventListener('click', () => this._resetToNow());
        btnRow.appendChild(resetBtn);

        this._ghostBtn = this._mkBtn('👁 Ghost overlay', '#0ea5e9');
        this._ghostBtn.addEventListener('click', () => this._toggleGhost());
        btnRow.appendChild(this._ghostBtn);

        const exportBtn = this._mkBtn('⬇ Export Rationale', '#059669');
        exportBtn.title = 'Download a Markdown design rationale document for planning submissions';
        exportBtn.addEventListener('click', () => this._exportRationale());
        btnRow.appendChild(exportBtn);

        scrubWrap.appendChild(btnRow);
        this._el.appendChild(scrubWrap);

        // ── Sub-tabs ───────────────────────────────────────────────────────
        const subTabBar = document.createElement('div');
        subTabBar.style.cssText = [
            'display:flex;gap:0;border-bottom:1px solid var(--app-border,#e2e8f0);',
            'flex-shrink:0;margin-top:4px;',
        ].join('');

        this._subTabMutBtn = this._mkSubTab('Mutations');
        this._subTabMutBtn.addEventListener('click', () => this._setSubTab('mutations'));
        subTabBar.appendChild(this._subTabMutBtn);

        this._subTabDiffBtn = this._mkSubTab('Rel Diff');
        this._subTabDiffBtn.addEventListener('click', () => this._setSubTab('diff'));
        subTabBar.appendChild(this._subTabDiffBtn);

        this._el.appendChild(subTabBar);

        // ── Scrollable log area ────────────────────────────────────────────
        this._mutLogEl = document.createElement('div');
        this._mutLogEl.style.cssText = 'flex:1;overflow-y:auto;padding:6px 10px;';

        this._diffEl = document.createElement('div');
        this._diffEl.style.cssText = 'flex:1;overflow-y:auto;padding:6px 10px;display:none;';

        this._el.appendChild(this._mutLogEl);
        this._el.appendChild(this._diffEl);

        this._updateSubTabStyles();
        this.refresh();
    }

    // ── Stats bar ─────────────────────────────────────────────────────────────

    private _renderStats(): void {
        const ec = temporalGraphManager.edgeCount;
        const mc = temporalGraphManager.mutationCount;
        const sessions = temporalGraphManager.getSessions();
        const sc = sessions.length;

        this._statsEl.innerHTML = '';
        this._statsEl.appendChild(this._statChip('Edges', ec.toString(), '#6366f1'));
        this._statsEl.appendChild(this._statChip('Mutations', mc.toString(), '#0ea5e9'));
        this._statsEl.appendChild(this._statChip('Sessions', sc.toString(), '#10b981'));
    }

    private _statChip(label: string, value: string, color: string): HTMLElement {
        const chip = document.createElement('div');
        chip.style.cssText = [
            `background:${color}18;border:1px solid ${color}30;`,
            'border-radius:6px;padding:3px 8px;display:flex;flex-direction:column;',
            'align-items:center;gap:0px;',
        ].join('');
        chip.innerHTML = [
            `<span style="font-size:13px;font-weight:700;color:${color}">${value}</span>`,
            `<span style="font-size:10px;color:var(--app-text-muted,#7a8aaa);text-transform:uppercase;letter-spacing:.04em">${label}</span>`,
        ].join('');
        return chip;
    }

    // ── Sessions ──────────────────────────────────────────────────────────────

    private _renderSessions(): void {
        this._sessionListEl.innerHTML = '';
        const sessions = temporalGraphManager.getSessions();

        if (sessions.length === 0) {
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:11px;color:var(--app-text-muted,#7a8aaa);padding:4px 2px;';
            msg.textContent = 'No sessions recorded yet. Make some changes to the model.';
            this._sessionListEl.appendChild(msg);
            return;
        }

        for (const s of sessions) {
            this._sessionListEl.appendChild(this._sessionCard(s));
        }
    }

    private _sessionCard(s: SessionSummary): HTMLElement {
        const card = document.createElement('div');
        card.style.cssText = [
            'display:flex;align-items:center;gap:8px;padding:5px 8px;',
            'border-radius:6px;font-size:11px;cursor:pointer;',
            `background:${s.isCurrent ? '#6366f114' : 'transparent'};`,
            `border:1px solid ${s.isCurrent ? '#6366f130' : 'var(--app-border,#e2e8f0)'};`,
        ].join('');
        card.title = 'Click to jump scrubber to this session';

        const badge = document.createElement('span');
        badge.style.cssText = [
            'font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;',
            `background:${s.isCurrent ? '#6366f1' : '#94a3b8'};color:#fff;`,
            'flex-shrink:0;letter-spacing:.04em;',
        ].join('');
        badge.textContent = s.isCurrent ? 'CURRENT' : shortId(s.sessionId);
        card.appendChild(badge);

        const meta = document.createElement('span');
        meta.style.cssText = 'color:var(--app-text,#1a2035);flex:1;';
        meta.textContent = fmt(s.startedAt);
        card.appendChild(meta);

        const counts = document.createElement('span');
        counts.style.cssText = 'color:var(--app-text-muted,#7a8aaa);white-space:nowrap;';
        counts.textContent = `${s.mutationCount}m · ${s.edgeCount}e`;
        card.appendChild(counts);

        card.addEventListener('click', () => {
            this._scrubTs = s.lastActiveAt;
            this._scrubberEl.value = String(this._scrubTs);
            this._onScrub();
        });

        return card;
    }

    // ── Scrubber ──────────────────────────────────────────────────────────────

    private _resetScrubber(): void {
        const mutations = (temporalGraphManager as any)._mutations as NodeMutationRecord[];
        const now = Date.now();

        if (!mutations || mutations.length === 0) {
            this._scrubberEl.min = String(now - 3600_000);
            this._scrubberEl.max = String(now);
            this._scrubberEl.value = String(now);
            this._scrubTs = now;
            this._scrubberLabelEl.textContent = 'No history recorded yet';
            return;
        }

        const times = mutations.map(m => m.mutatedAt);
        const minT = Math.min(...times);
        const maxT = now;

        this._scrubberEl.min = String(minT);
        this._scrubberEl.max = String(maxT);
        this._scrubTs = maxT;
        this._scrubberEl.value = String(maxT);
        this._scrubberLabelEl.textContent = `Showing state at: ${fmt(maxT)} (now)`;
    }

    private _resetToNow(): void {
        const now = Date.now();
        this._scrubTs = now;
        this._scrubberEl.max = String(now);
        this._scrubberEl.value = String(now);
        this._scrubberLabelEl.textContent = `Showing state at: ${fmt(now)} (now)`;
        this._renderSubView();
        if (this._ghostActive) this._deactivateGhost();
    }

    private _onScrub(): void {
        this._scrubTs = Number(this._scrubberEl.value);
        const now = Date.now();
        const isNow = this._scrubTs >= now - 2000;
        this._scrubberLabelEl.textContent = isNow
            ? `Showing state at: ${fmt(this._scrubTs)} (now)`
            : `Showing state at: ${fmt(this._scrubTs)}`;

        this._renderSubView();

        if (this._ghostActive) {
            this.runtime?.events?.emit('pryzm-history-ghost-activate', { timestamp: this._scrubTs }); // F.events.14
        }
    }

    // ── Ghost overlay ─────────────────────────────────────────────────────────

    private _toggleGhost(): void {
        if (this._ghostActive) {
            this._deactivateGhost();
        } else {
            this._ghostActive = true;
            this._ghostBtn.style.background = '#0ea5e9';
            this._ghostBtn.style.color = '#fff';
            this._ghostBtn.textContent = '👁 Ghost: ON';
            this.runtime?.events?.emit('pryzm-history-ghost-activate', { timestamp: this._scrubTs }); // F.events.14
        }
    }

    private _deactivateGhost(): void {
        this._ghostActive = false;
        this._ghostBtn.style.background = '';
        this._ghostBtn.style.color = '';
        this._ghostBtn.textContent = '👁 Ghost overlay';
        this.runtime?.events?.emit('pryzm-history-ghost-deactivate', {}); // F.events.14
    }

    // ── G-4: Export design rationale document ─────────────────────────────────

    private _exportRationale(): void {
        try {
            // Phase B (S78-WIRE) — projectName via runtime.projectContext.
            // Falls back to the legacy globals only when running through the
            // pre-runtime boot path (e.g. older standalone smoke tests).
            const ps = (globalThis as { platformShell?: { getProjectName?: () => string }; currentProjectName?: string });
            const projectName = this.runtime?.projectContext.projectName
                ?? ps.platformShell?.getProjectName?.()
                ?? ps.currentProjectName
                ?? 'Untitled Project';
            RationaleExporter.download({ projectName });
        } catch (e) {
            console.error('[DesignHistoryPanel] RationaleExporter failed:', e);
            alert('Design rationale export failed. See console for details.');
        }
    }

    // ── Sub-tab rendering ─────────────────────────────────────────────────────

    private _setSubTab(tab: 'mutations' | 'diff'): void {
        this._activeSubTab = tab;
        this._updateSubTabStyles();
        this._renderSubView();
    }

    private _updateSubTabStyles(): void {
        const active = 'font-size:11px;padding:5px 12px;border:none;cursor:pointer;background:var(--app-border,#e2e8f0);color:var(--app-text,#1a2035);font-weight:600;flex:1;';
        const inactive = 'font-size:11px;padding:5px 12px;border:none;cursor:pointer;background:transparent;color:var(--app-text-muted,#7a8aaa);flex:1;';

        this._subTabMutBtn.style.cssText = this._activeSubTab === 'mutations' ? active : inactive;
        this._subTabDiffBtn.style.cssText = this._activeSubTab === 'diff' ? active : inactive;

        this._mutLogEl.style.display = this._activeSubTab === 'mutations' ? 'block' : 'none';
        this._diffEl.style.display = this._activeSubTab === 'diff' ? 'block' : 'none';
    }

    private _renderSubView(): void {
        const slice = temporalGraphManager.queryAt(this._scrubTs);
        if (this._activeSubTab === 'mutations') {
            this._renderMutationLog(slice);
        } else {
            this._renderRelDiff(slice);
        }
    }

    // ── Mutation log ──────────────────────────────────────────────────────────

    private _renderMutationLog(slice: TemporalSlice): void {
        this._mutLogEl.innerHTML = '';

        const muts = [...slice.mutationsUpTo].reverse().slice(0, 200);

        if (muts.length === 0) {
            this._mutLogEl.innerHTML = `<div style="font-size:11px;color:var(--app-text-muted,#7a8aaa);padding:8px 2px">No mutations recorded up to this point.</div>`;
            return;
        }

        const total = slice.mutationsUpTo.length;
        const header = document.createElement('div');
        header.style.cssText = 'font-size:10px;color:var(--app-text-muted,#7a8aaa);margin-bottom:4px;';
        header.textContent = `${total} mutations up to ${fmt(this._scrubTs)}${total > 200 ? ' (showing latest 200)' : ''}`;
        this._mutLogEl.appendChild(header);

        for (const m of muts) {
            this._mutLogEl.appendChild(this._mutRow(m));
        }
    }

    private _mutRow(m: NodeMutationRecord): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = [
            'display:flex;align-items:center;gap:6px;padding:3px 0;',
            'border-bottom:1px solid var(--app-border,#e2e8f0);font-size:11px;',
        ].join('');

        const opDot = document.createElement('span');
        opDot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${opBadge(m.mutationType)};flex-shrink:0;`;
        row.appendChild(opDot);

        const time = document.createElement('span');
        time.style.cssText = 'color:var(--app-text-muted,#7a8aaa);flex-shrink:0;width:60px;';
        time.textContent = fmtShort(m.mutatedAt);
        row.appendChild(time);

        const type = document.createElement('span');
        type.style.cssText = 'color:var(--app-text-muted,#9ca3af);flex-shrink:0;width:48px;font-size:10px;text-transform:uppercase;';
        type.textContent = m.elementType;
        row.appendChild(type);

        const id = document.createElement('span');
        id.style.cssText = 'color:var(--app-text,#1a2035);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace;font-size:10px;';
        id.textContent = m.elementId.slice(-12);
        id.title = m.elementId;
        row.appendChild(id);

        const op = document.createElement('span');
        op.style.cssText = `font-size:9px;font-weight:600;padding:1px 4px;border-radius:3px;background:${opBadge(m.mutationType)}20;color:${opBadge(m.mutationType)};flex-shrink:0;`;
        op.textContent = m.mutationType.toUpperCase();
        row.appendChild(op);

        return row;
    }

    // ── Relationship diff ─────────────────────────────────────────────────────

    private _renderRelDiff(slice: TemporalSlice): void {
        this._diffEl.innerHTML = '';

        const activeNow = temporalGraphManager.getActiveEdges();
        const atTime = new Set(slice.activeEdges.map(e => e.id));
        const nowIds = new Set(activeNow.map(e => e.id));

        // Edges active at selected time but expired since (removed since ts)
        const removed = slice.activeEdges.filter(e => !nowIds.has(e.id));
        // Edges active now but not at selected time (added after ts)
        const added = activeNow.filter(e => !atTime.has(e.id));
        // Edges active at both times (unchanged)
        const unchanged = slice.activeEdges.filter(e => nowIds.has(e.id));

        const header = document.createElement('div');
        header.style.cssText = 'font-size:10px;color:var(--app-text-muted,#7a8aaa);margin-bottom:6px;';
        header.textContent = `Comparing relationships at ${fmt(this._scrubTs)} vs. now`;
        this._diffEl.appendChild(header);

        // Summary chips
        const summary = document.createElement('div');
        summary.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;';
        summary.appendChild(this._diffChip(`+${added.length} added`, '#22c55e'));
        summary.appendChild(this._diffChip(`-${removed.length} removed`, '#ef4444'));
        summary.appendChild(this._diffChip(`${unchanged.length} unchanged`, '#6366f1'));
        this._diffEl.appendChild(summary);

        if (added.length === 0 && removed.length === 0) {
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:11px;color:var(--app-text-muted,#7a8aaa);padding:8px 2px;';
            msg.textContent = unchanged.length === 0
                ? 'No relationship edges exist at this point or now.'
                : 'No relationship changes between this point and now.';
            this._diffEl.appendChild(msg);
            return;
        }

        if (added.length > 0) {
            this._diffEl.appendChild(this._diffSection('Added after this point', added, '#22c55e', '+'));
        }
        if (removed.length > 0) {
            this._diffEl.appendChild(this._diffSection('Removed after this point', removed, '#ef4444', '−'));
        }
    }

    private _diffChip(label: string, color: string): HTMLElement {
        const chip = document.createElement('span');
        chip.style.cssText = [
            `background:${color}18;border:1px solid ${color}30;`,
            'border-radius:4px;padding:2px 6px;font-size:10px;font-weight:600;',
            `color:${color};`,
        ].join('');
        chip.textContent = label;
        return chip;
    }

    private _diffSection(title: string, edges: TemporalEdge[], color: string, prefix: string): HTMLElement {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-bottom:10px;';

        const heading = document.createElement('div');
        heading.style.cssText = `font-size:10px;font-weight:700;color:${color};margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em;`;
        heading.textContent = `${prefix} ${title.toUpperCase()} (${edges.length})`;
        wrap.appendChild(heading);

        const shown = edges.slice(0, 50);
        for (const e of shown) {
            const row = document.createElement('div');
            row.style.cssText = [
                'display:flex;align-items:center;gap:5px;font-size:10px;padding:2px 4px;',
                `border-left:2px solid ${color}40;margin-bottom:1px;`,
                'font-family:monospace;',
            ].join('');

            const src = document.createElement('span');
            src.style.cssText = `color:${color};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
            src.textContent = e.sourceId.slice(-8);
            src.title = e.sourceId;
            row.appendChild(src);

            const rel = document.createElement('span');
            rel.style.cssText = 'color:var(--app-text-muted,#7a8aaa);flex-shrink:0;padding:0 3px;font-size:9px;';
            rel.textContent = `—${e.type}→`;
            row.appendChild(rel);

            const tgt = document.createElement('span');
            tgt.style.cssText = `color:${color};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;`;
            tgt.textContent = e.targetId.slice(-8);
            tgt.title = e.targetId;
            row.appendChild(tgt);

            wrap.appendChild(row);
        }

        if (edges.length > 50) {
            const more = document.createElement('div');
            more.style.cssText = 'font-size:10px;color:var(--app-text-muted,#7a8aaa);padding:2px 4px;';
            more.textContent = `…and ${edges.length - 50} more`;
            wrap.appendChild(more);
        }

        return wrap;
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    private _sectionHeader(label: string): HTMLElement {
        const h = document.createElement('div');
        h.style.cssText = [
            'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;',
            'color:var(--app-text-muted,#7a8aaa);padding:6px 12px 2px;flex-shrink:0;',
            'border-top:1px solid var(--app-border,#e2e8f0);',
        ].join('');
        h.textContent = label;
        return h;
    }

    private _mkBtn(label: string, color: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.style.cssText = [
            `border:1px solid ${color}40;border-radius:5px;background:${color}14;`,
            `color:${color};font-size:11px;font-weight:600;padding:4px 10px;`,
            'cursor:pointer;flex:1;transition:background .15s;',
        ].join('');
        btn.textContent = label;
        btn.addEventListener('mouseenter', () => { btn.style.background = `${color}28`; });
        btn.addEventListener('mouseleave', () => { if (!this._ghostActive || btn !== this._ghostBtn) btn.style.background = `${color}14`; });
        return btn;
    }

    private _mkSubTab(label: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.textContent = label;
        return btn;
    }
}

