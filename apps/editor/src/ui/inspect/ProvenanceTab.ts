/**
 * A.31.e (Phase A · Sprint 2 — IP-A5 iteration 5.2) — L5 Inspect-tree Provenance tab.
 *
 * Renders the C23 provenance graph for a selected element. Reads the
 * A.31.c ProvenanceStore + A.31.d `queryByProject` command surface.
 *
 * Layer Affected: UI — Inspect Mode (sibling of AuditStack)
 * Contract:       C23 §3.1 + §4 — provenance is read-mostly; this is
 *                 a read-only view, no commands dispatched
 *
 * CSS prefix:     pv-  (Provenance)
 *
 * Data flow:
 *   provenanceStore.listArtefactsForProject(projectId)
 *     → filter by producedElementIds.includes(elementId)
 *     → render per-artefact card with model / cost / approval
 *
 * No React. No DOM globals at module load. Pure constructor takes
 * (store, projectId) so happy-dom + Node test harnesses can drive it.
 */

import type { ProvenanceStore } from '@pryzm/stores';
import type {
    AIArtefact,
    ApprovalStatus,
} from '@pryzm/schemas/provenance';

/**
 * Filter an artefact list by the elements they produced. Returns the
 * subset whose `producedElementIds` includes the target id, ordered
 * by timestamp ascending (oldest first).
 *
 * Exported for unit testing — the same logic runs inside render().
 */
export function selectArtefactsForElement(
    artefacts: readonly AIArtefact[],
    elementId: string,
): readonly AIArtefact[] {
    return artefacts.filter((a) => a.producedElementIds.includes(elementId));
}

/**
 * Human-readable label for an approval status. Used in the badge.
 */
export function formatApprovalStatus(status: ApprovalStatus): string {
    switch (status) {
        case 'auto-applied':
            return 'Auto-applied';
        case 'user-approved':
            return 'Approved by you';
        case 'user-rejected':
            return 'Rejected by you';
        case 'pending':
            return 'Pending review';
        case 'never-applied':
            return 'Discarded';
    }
}

/**
 * CSS class for the approval-status badge. Maps to PRYZM-purple +
 * semantic tokens (success / warning / error / muted).
 */
export function approvalStatusClass(status: ApprovalStatus): string {
    switch (status) {
        case 'auto-applied':
            return 'pv-badge--info';
        case 'user-approved':
            return 'pv-badge--success';
        case 'user-rejected':
            return 'pv-badge--error';
        case 'pending':
            return 'pv-badge--warning';
        case 'never-applied':
            return 'pv-badge--muted';
    }
}

/** Format a number as USD cents with $ prefix. `0.0012` → `$0.001`. */
export function formatCostUsd(usd: number): string {
    if (!Number.isFinite(usd) || usd < 0) return '—';
    if (usd === 0) return 'free';
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    if (usd < 1) return `$${usd.toFixed(3)}`;
    return `$${usd.toFixed(2)}`;
}

/** Format an ISO timestamp as a short local string. */
export function formatTimestamp(iso: string): string {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    } catch {
        return iso;
    }
}

/**
 * One artefact rendered as a card. Exported separately so the future
 * collapse/expand iteration can re-render a single card without
 * rebuilding the whole panel.
 */
export function renderArtefactCard(artefact: AIArtefact): HTMLElement {
    const card = document.createElement('article');
    card.className = 'pv-card';
    card.setAttribute('data-testid', 'pv-artefact-card');
    card.setAttribute('data-artefact-id', artefact.id);

    const header = document.createElement('header');
    header.className = 'pv-card-header';
    const title = document.createElement('div');
    title.className = 'pv-card-title';
    title.textContent = artefact.workflowKind;
    const badge = document.createElement('span');
    badge.className = `pv-badge ${approvalStatusClass(artefact.approvalStatus)}`;
    badge.setAttribute('data-testid', 'pv-approval-badge');
    badge.textContent = formatApprovalStatus(artefact.approvalStatus);
    header.appendChild(title);
    header.appendChild(badge);
    card.appendChild(header);

    const rows = document.createElement('dl');
    rows.className = 'pv-card-rows';

    function addRow(label: string, value: string, testid?: string): void {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        if (testid) dd.setAttribute('data-testid', testid);
        dd.textContent = value;
        rows.appendChild(dt);
        rows.appendChild(dd);
    }

    addRow('Model', artefact.model, 'pv-row-model');
    addRow('Workflow version', artefact.workflowVersion);
    addRow(
        'Reproducibility',
        artefact.reproducibility === 'deterministic'
            ? `Deterministic (seed ${artefact.seed})`
            : 'Non-deterministic',
        'pv-row-repro',
    );
    addRow('Cost', formatCostUsd(artefact.costUsd), 'pv-row-cost');
    addRow(
        'Tokens',
        `${artefact.inputTokens} in · ${artefact.outputTokens} out`,
        'pv-row-tokens',
    );
    addRow('Duration', `${artefact.durationMs} ms`);
    addRow('Cache', artefact.cacheStatus);
    addRow('Timestamp', formatTimestamp(artefact.timestamp));
    addRow(
        'Prompt SHA',
        `${artefact.promptSha.slice(0, 12)}…${artefact.promptSha.slice(-4)}`,
    );
    addRow(
        'Produced elements',
        String(artefact.producedElementIds.length),
        'pv-row-elements',
    );
    card.appendChild(rows);

    if (artefact.promptPreviewRedacted) {
        const preview = document.createElement('details');
        preview.className = 'pv-card-preview';
        const summary = document.createElement('summary');
        summary.textContent = 'Prompt preview (redacted)';
        preview.appendChild(summary);
        const pre = document.createElement('pre');
        pre.className = 'pv-card-preview-text';
        pre.textContent = artefact.promptPreviewRedacted;
        preview.appendChild(pre);
        card.appendChild(preview);
    }

    return card;
}

/**
 * The Provenance tab itself. Constructed once per Inspect-panel open;
 * `render()` is called whenever the selected element changes.
 *
 * Lifecycle:
 *   const tab = new ProvenanceTab({ store, projectId });
 *   const el = tab.build();                  // returns the root element
 *   container.appendChild(el);
 *   tab.setSelectedElement('el_wall_42');    // re-render
 *   tab.dispose();                            // detach store subscription
 */
export interface ProvenanceTabOptions {
    readonly store: ProvenanceStore;
    readonly projectId: string;
    /** Optional initial element id. When set, the tab renders immediately. */
    readonly initialElementId?: string;
}

export class ProvenanceTab {
    private readonly _store: ProvenanceStore;
    private readonly _projectId: string;
    private _root: HTMLElement | null = null;
    private _selectedElementId: string | null = null;
    private _unsubscribe: (() => void) | null = null;
    private _disposed = false;

    constructor(opts: ProvenanceTabOptions) {
        this._store = opts.store;
        this._projectId = opts.projectId;
        if (opts.initialElementId !== undefined) {
            this._selectedElementId = opts.initialElementId;
        }
    }

    /** Build + return the root HTMLElement. Idempotent. */
    build(): HTMLElement {
        if (this._root) return this._root;
        const root = document.createElement('section');
        root.className = 'pv-tab';
        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', 'AI provenance for selected element');
        root.setAttribute('data-testid', 'provenance-tab');
        this._root = root;
        this._render();
        this._unsubscribe = this._store.subscribe(() => this._render());
        return root;
    }

    /** Change the selected element id + re-render. */
    setSelectedElement(elementId: string | null): void {
        if (this._disposed) return;
        if (this._selectedElementId === elementId) return;
        this._selectedElementId = elementId;
        this._render();
    }

    /** Currently selected element id, or null. Read-only. */
    getSelectedElement(): string | null {
        return this._selectedElementId;
    }

    /** Detach the store subscription + clear refs. Idempotent. */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        if (this._unsubscribe) {
            try {
                this._unsubscribe();
            } catch (err) {
                console.warn('[ProvenanceTab] unsubscribe threw:', err);
            }
            this._unsubscribe = null;
        }
        this._root = null;
    }

    // ── Internals ────────────────────────────────────────────────────────

    private _render(): void {
        if (!this._root) return;
        this._root.innerHTML = '';

        if (this._selectedElementId === null) {
            this._renderEmpty(
                'Select an element to see its AI provenance.',
                'pv-empty-no-selection',
            );
            return;
        }

        const all = this._store.listArtefactsForProject(this._projectId);
        const filtered = selectArtefactsForElement(
            all,
            this._selectedElementId,
        );

        if (filtered.length === 0) {
            this._renderEmpty(
                'No AI provenance recorded for this element.',
                'pv-empty-no-provenance',
            );
            return;
        }

        // Header chip.
        const header = document.createElement('header');
        header.className = 'pv-tab-header';
        const title = document.createElement('h3');
        title.className = 'pv-tab-title';
        title.textContent = 'AI provenance';
        const count = document.createElement('span');
        count.className = 'pv-tab-count';
        count.setAttribute('data-testid', 'pv-tab-count');
        count.textContent =
            filtered.length === 1
                ? '1 artefact'
                : `${filtered.length} artefacts`;
        header.appendChild(title);
        header.appendChild(count);
        this._root.appendChild(header);

        // Cards (newest last — matches list-by-timestamp asc).
        const list = document.createElement('div');
        list.className = 'pv-card-list';
        list.setAttribute('data-testid', 'pv-card-list');
        for (const a of filtered) {
            list.appendChild(renderArtefactCard(a));
        }
        this._root.appendChild(list);
    }

    private _renderEmpty(message: string, testid: string): void {
        if (!this._root) return;
        const empty = document.createElement('div');
        empty.className = 'pv-empty';
        empty.setAttribute('data-testid', testid);
        empty.textContent = message;
        this._root.appendChild(empty);
    }
}
