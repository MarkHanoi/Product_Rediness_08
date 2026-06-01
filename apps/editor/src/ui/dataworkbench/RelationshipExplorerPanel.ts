/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Data Workbench (NEW FILE)
 * Phase:             Phase D — D-4
 * Files Modified:    src/ui/dataworkbench/RelationshipExplorerPanel.ts (new)
 * Classification:    A
 *
 * Contract:
 *   docs/02-decisions/contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md §3
 *   PRYZM_MASTER_ROADMAP_2026.md § D-4
 *
 * CSS class prefix:  `dw-` (registered §05 §3)
 * CSS source:        AppTheme.ts → dataWorkbench.ts style block
 *
 * Impact Assessment:
 *   Store Reads:      NO — reads SemanticGraph and elementRegistry only
 *   Store Writes:     NO — pure read-only panel
 *   Event Bus:        NO — listens to DOM events only
 *   Builder Calls:    NO
 *   Command Dispatch: NO
 *
 * Risk Level:   Low (read-only UI panel, no BIM mutations)
 * Rationale:
 *   Relationship Explorer — new DataWorkbench tab showing the semantic graph
 *   for any selected BIM element. Shows bounded-by walls, adjacent rooms,
 *   connections via doors, contained elements, hierarchy path, and path to exit.
 */

import { semanticGraphManager, RelationshipType } from '@pryzm/core-app-model';

// ── Label maps ────────────────────────────────────────────────────────────────

const REL_TYPE_LABEL: Record<RelationshipType, string> = {
    hosts:            'Hosts (openings)',
    hostedBy:         'Hosted by (wall)',
    connectedTo:      'Connected to (door)',
    adjacentTo:       'Adjacent to (wall)',
    boundedBy:        'Bounded by (walls)',
    contains:         'Contains',
    sitsOn:           'Sits on (slab)',
    supports:         'Supports',
    partOf:           'Part of (unit)',
    unitOf:           'Unit of (level)',
    levelOf:          'Level of (building)',
    servesZone:       'Serves zone',
    connectedByStair: 'Connected by stair',
    // ── G-1 temporal / causal / performance / lifecycle / intent ─────────────
    precededBy:          'Preceded by (version)',
    supersedes:          'Supersedes (version)',
    branchedFrom:        'Branched from',
    causedFailureOf:     'Caused failure of',
    wasMitigatedBy:      'Was mitigated by',
    measuredAt:          'Measured at',
    exceededBenchmark:   'Exceeded benchmark',
    replacedBy:          'Replaced by',
    maintainedBy:        'Maintained by',
    decommissionedBefore: 'Decommissioned before',
    decidedBy:           'Decided by',
};

const REL_ICON: Record<RelationshipType, string> = {
    hosts:            '🔩',
    hostedBy:         '🧱',
    connectedTo:      '🚪',
    adjacentTo:       '↔️',
    boundedBy:        '📐',
    contains:         '📦',
    sitsOn:           '🏗',
    supports:         '⬆',
    partOf:           '🔗',
    unitOf:           '🏢',
    levelOf:          '🏬',
    servesZone:       '🌡',
    connectedByStair: '🪜',
    // ── G-1 temporal / causal / performance / lifecycle / intent ─────────────
    precededBy:          '⏮',
    supersedes:          '⏭',
    branchedFrom:        '🌿',
    causedFailureOf:     '💥',
    wasMitigatedBy:      '🛡',
    measuredAt:          '📏',
    exceededBenchmark:   '🚨',
    replacedBy:          '🔄',
    maintainedBy:        '🔧',
    decommissionedBefore: '🗑',
    decidedBy:           '⚖️',
};

// Display priority order (lower = shown first)
const REL_ORDER: Record<RelationshipType, number> = {
    boundedBy:        1,
    adjacentTo:       2,
    connectedTo:      3,
    hosts:            4,
    hostedBy:         5,
    contains:         6,
    partOf:           7,
    unitOf:           8,
    levelOf:          9,
    sitsOn:           10,
    supports:         11,
    servesZone:       12,
    connectedByStair: 13,
    // ── G-1 temporal / causal / performance / lifecycle / intent ─────────────
    precededBy:          14,
    supersedes:          15,
    branchedFrom:        16,
    causedFailureOf:     17,
    wasMitigatedBy:      18,
    measuredAt:          19,
    exceededBenchmark:   20,
    replacedBy:          21,
    maintainedBy:        22,
    decommissionedBefore: 23,
    decidedBy:           24,
};

// ── Panel ─────────────────────────────────────────────────────────────────────

export class RelationshipExplorerPanel {
    private _container: HTMLElement;
    private _selectedElementId: string | null = null;
    private _selectedElementType: string | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._container = container;
        this._container.className = 'dw-rel-panel';
        this._render();
        this._bindEvents();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    refresh(): void {
        this._render();
    }

    selectElement(elementId: string, elementType?: string): void {
        this._selectedElementId = elementId;
        this._selectedElementType = elementType ?? null;
        this._render();
    }

    // ── DOM construction ──────────────────────────────────────────────────────

    private _render(): void {
        this._container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'dw-rel-header';
        header.innerHTML = `
            <span class="dw-rel-title">Relationship Explorer</span>
            <span class="dw-rel-count">${semanticGraphManager.size} relationships in graph</span>
        `;
        this._container.appendChild(header);

        if (!this._selectedElementId) {
            this._renderEmptyState();
            return;
        }

        // Selected element info bar
        const infoBar = document.createElement('div');
        infoBar.className = 'dw-rel-infobar';
        const shortId = this._selectedElementId.substring(0, 8);
        const typeBadge = this._selectedElementType
            ? `<span class="dw-rel-type-badge">${this._selectedElementType}</span>`
            : '';
        infoBar.innerHTML = `
            <span class="dw-rel-selected-label">Selected:</span>
            ${typeBadge}
            <span class="dw-rel-selected-id" title="${this._selectedElementId}">${shortId}…</span>
        `;
        this._container.appendChild(infoBar);

        // Relationship groups
        const relationships = semanticGraphManager.getRelationships(this._selectedElementId);

        if (relationships.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'dw-rel-no-rels';
            empty.textContent = 'No semantic relationships recorded for this element.';
            this._container.appendChild(empty);
            this._renderActions();
            return;
        }

        // Group by type
        const byType = new Map<RelationshipType, Array<{ relatedId: string; direction: 'out' | 'in'; metadata?: Record<string, string | number | boolean> }>>();

        for (const rel of relationships) {
            const direction = rel.sourceId === this._selectedElementId ? 'out' : 'in';
            const relatedId = direction === 'out' ? rel.targetId : rel.sourceId;
            const existing = byType.get(rel.type) ?? [];
            existing.push({ relatedId, direction, metadata: rel.metadata });
            byType.set(rel.type, existing);
        }

        // Sort by display priority
        const sortedTypes = Array.from(byType.keys()).sort(
            (a, b) => (REL_ORDER[a] ?? 99) - (REL_ORDER[b] ?? 99)
        );

        const list = document.createElement('div');
        list.className = 'dw-rel-list';

        for (const type of sortedTypes) {
            const items = byType.get(type)!;
            const group = this._buildGroup(type, items);
            list.appendChild(group);
        }

        this._container.appendChild(list);
        this._renderActions();
    }

    private _renderEmptyState(): void {
        const empty = document.createElement('div');
        empty.className = 'dw-rel-empty';
        empty.innerHTML = `
            <div class="dw-rel-empty-icon">🔗</div>
            <div class="dw-rel-empty-text">Select an element in the viewport or Data Sheet to explore its relationships.</div>
            <div class="dw-rel-empty-hint">
                The semantic graph tracks how walls, rooms, doors, windows, and structural elements relate to each other.
            </div>
        `;
        this._container.appendChild(empty);
    }

    private _buildGroup(
        type: RelationshipType,
        items: Array<{ relatedId: string; direction: 'out' | 'in'; metadata?: Record<string, string | number | boolean> }>
    ): HTMLElement {
        const group = document.createElement('div');
        group.className = 'dw-rel-group';

        const label = document.createElement('div');
        label.className = 'dw-rel-group-label';
        label.innerHTML = `
            <span class="dw-rel-icon">${REL_ICON[type] ?? '🔗'}</span>
            <span class="dw-rel-type-name">${REL_TYPE_LABEL[type] ?? type}</span>
            <span class="dw-rel-group-count">${items.length}</span>
        `;
        group.appendChild(label);

        const itemsEl = document.createElement('div');
        itemsEl.className = 'dw-rel-items';

        for (const item of items) {
            const row = document.createElement('div');
            row.className = 'dw-rel-item';
            row.setAttribute('data-element-id', item.relatedId);

            const dirArrow = item.direction === 'out' ? '→' : '←';
            const shortId = item.relatedId.substring(0, 8);

            // Build metadata pill if any metadata is present
            let metaPills = '';
            if (item.metadata) {
                for (const [k, v] of Object.entries(item.metadata)) {
                    metaPills += `<span class="dw-rel-meta">${k}:${String(v).substring(0, 12)}</span>`;
                }
            }

            row.innerHTML = `
                <span class="dw-rel-dir">${dirArrow}</span>
                <span class="dw-rel-id" title="${item.relatedId}">${shortId}…</span>
                ${metaPills}
                <button class="dw-rel-highlight-btn" title="Highlight in 3D" data-id="${item.relatedId}">👁</button>
            `;

            // Click to select related element
            row.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).classList.contains('dw-rel-highlight-btn')) return;
                this._highlightElement(item.relatedId);
            });

            // Highlight button
            const btn = row.querySelector('.dw-rel-highlight-btn');
            btn?.addEventListener('click', (e) => {
                e.stopPropagation();
                this._highlightElement(item.relatedId);
            });

            itemsEl.appendChild(row);
        }

        group.appendChild(itemsEl);
        return group;
    }

    private _renderActions(): void {
        if (!this._selectedElementId) return;

        const actions = document.createElement('div');
        actions.className = 'dw-rel-actions';

        // Show in 3D button
        const show3d = document.createElement('button');
        show3d.className = 'dw-rel-action-btn';
        show3d.textContent = 'Show in 3D';
        show3d.addEventListener('click', () => {
            if (this._selectedElementId) {
                window.runtime?.events?.emit('pryzm-select-element', { elementId: this._selectedElementId }); // F.events.16
            }
        });

        // Highlight all relationships button
        const highlightAll = document.createElement('button');
        highlightAll.className = 'dw-rel-action-btn dw-rel-action-btn--primary';
        highlightAll.textContent = 'Highlight relationships';
        highlightAll.addEventListener('click', () => {
            if (this._selectedElementId) {
                const allRelated = semanticGraphManager.getRelationships(this._selectedElementId)
                    .map(r => r.sourceId === this._selectedElementId ? r.targetId : r.sourceId);
                window.runtime?.events?.emit('pryzm-highlight-elements', { elementIds: [this._selectedElementId, ...allRelated] }); // F.events.16
            }
        });

        actions.appendChild(show3d);
        actions.appendChild(highlightAll);
        this._container.appendChild(actions);
    }

    private _highlightElement(elementId: string): void {
        // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
        window.runtime?.events?.emit('pryzm-workbench-select', { elementId });
        // F.events.16 — bim-selection-changed migrated to runtime.events typed bus.
        window.runtime?.events?.emit('bim-selection-changed', { elementId }); // F.events.16
    }

    // ── Events ────────────────────────────────────────────────────────────────

    private _bindEvents(): void {
        // React to element selection from 3D viewport — F.events.16 migrated to runtime.events
        window.runtime?.events?.on('bim-selection-changed', (payload: unknown) => {
            const detail = payload as { elementId?: string; elementType?: string };
            if (detail?.elementId) {
                this._selectedElementId = detail.elementId;
                this._selectedElementType = detail.elementType ?? null;
                this._render();
            }
        });

        // React to selection from other DataWorkbench panels
        // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
        window.runtime?.events?.on('pryzm-workbench-select', (payload: unknown) => {
            const p = payload as { elementId?: string; nodeId?: string; id?: string; elementType?: string; nodeType?: string; type?: string } | undefined;
            const elementId = p?.elementId ?? p?.nodeId ?? p?.id;
            if (elementId) {
                this._selectedElementId = elementId;
                this._selectedElementType = p?.elementType ?? p?.nodeType ?? p?.type ?? null;
                this._render();
            }
        });

        // React to element selected from 3D scene (existing PRYZM event)
        this.runtime?.events?.on('pryzm-element-selected', (detail) => {
            this._selectedElementId = detail.elementId;
            this._selectedElementType = detail.elementType ?? null;
            this._render();
        });
    }
}

// ── CSS injection ─────────────────────────────────────────────────────────────

/**
 * CSS is now managed by AppTheme.ts (dataWorkbench.ts style block).
 * No-op kept for any existing import references.
 */
export function injectRelationshipExplorerStyles(): void {}

