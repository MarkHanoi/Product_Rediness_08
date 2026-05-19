/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Data Workbench: Data Sheet Panel (Phase 8-A)
 * File:             src/ui/dataworkbench/DataSheetPanel.ts
 * Contract:         docs/00_PRZYM/PRYZM_DATA_PLATFORM_IMPLEMENTATION_ROADMAP.md § PHASE 8
 *                   docs/00_Contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md §3
 *
 * Renders per-node data when a hierarchy node is selected in the tree.
 *
 * Sections:
 *   1. Identity        — Name, code, type badge, sync state badge
 *   2. Template        — Assigned template or "No template" + [Assign] dropdown
 *   3. Planned data    — Editable targetArea, targetCount, description, customProperties
 *   4. Requirements    — Read-only list of all template requirements
 *   5. Model data      — Read-only computed values (area sum, door count, finishes)
 *   6. Comparison      — Template expects / Model actual / State / [Mark derived] / [Reset]
 *
 * Commands fired: UpdateHierarchyNodeCommand, AssignTemplateToNodeCommand,
 *                 UnassignTemplateCommand, MarkPropertyDerivedCommand, ClearPropertyDerivedCommand
 */

import type { AnyHierarchyEntity } from '@pryzm/core-app-model';
import type { TemplateDefinition, TemplateAssignment } from '@pryzm/core-app-model';
import { fetchBenchmark } from '@pryzm/persistence-client/portfolio';

const SYNC_COLOURS: Record<string, string> = {
    'no-template':  '#9ca3af',
    'planned-only': '#d1d5db',
    'partial':      '#3B8BD4',
    'synced':       '#1D9E75',
    'conflict':     '#E24B4A',
    'derived':      '#EF9F27',
};

const SYNC_LABELS: Record<string, string> = {
    'no-template':  'No template',
    'planned-only': 'Planned only',
    'partial':      'Partial',
    'synced':       'Synced',
    'conflict':     'Conflict',
    'derived':      'Derived',
};

const NODE_TYPE_LABELS: Record<string, string> = {
    site: 'Site', building: 'Building', level: 'Level', unit: 'Unit', room: 'Room',
};

export class DataSheetPanel {
    private _container: HTMLElement;
    private _root!: HTMLElement;
    private _currentNodeId: string | null = null;
    private _currentNodeType: string | null = null;
    private _dialogEl: HTMLElement | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._container = container;
        this._root = document.createElement('div');
        this._root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
        this._container.appendChild(this._root);

        this._renderEmpty();
        this._bindEvents();
    }

    // ── Public API ─────────────────────────────────────────────────────────

    refresh(): void {
        if (this._currentNodeId) {
            this._renderNode(this._currentNodeId, this._currentNodeType ?? 'unit');
        }
    }

    selectNode(nodeId: string, nodeType: string): void {
        this._currentNodeId = nodeId;
        this._currentNodeType = nodeType;
        this._renderNode(nodeId, nodeType);
    }

    // ── Rendering ──────────────────────────────────────────────────────────

    private _renderEmpty(): void {
        this._root.innerHTML = `
            <div class="dw-placeholder">
                <div class="dw-placeholder-icon">📋</div>
                <div style="font-size:12px;text-align:center;max-width:200px;line-height:1.5;color:var(--app-text-muted,#7a8aaa)">
                    Select a hierarchy node in the tree to view and edit its data.
                </div>
            </div>
        `;
    }

    private _renderNode(nodeId: string, _nodeType: string): void {
        const hs = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
        const ts = window.templateStore; // TODO(F.6.x): legacy templateStore — replace with runtime.viewRegistry templates
        const tas = window.templateAssignmentStore; // TODO(F.6.x): legacy templateAssignmentStore — replace with runtime.viewRegistry template-assignment

        const node: AnyHierarchyEntity | undefined = hs?.getById(nodeId);
        if (!node) {
            this._renderEmpty();
            return;
        }

        const template: TemplateDefinition | undefined = node.templateId ? ts?.getById(node.templateId) : undefined;
        const assignment: TemplateAssignment | undefined = tas?.getForNode(nodeId);

        const scroll = document.createElement('div');
        scroll.style.cssText = 'flex:1;overflow-y:auto;padding:0 0 20px;';

        // 1. Identity section
        scroll.appendChild(this._buildSection('Identity', this._buildIdentityContent(node)));

        // 2. Template section
        scroll.appendChild(this._buildSection('Template', this._buildTemplateContent(node, template, assignment)));

        // 3. Planned data section
        scroll.appendChild(this._buildSection('Planned Data', this._buildPlannedDataContent(node)));

        // 4. Template requirements (if template assigned)
        if (template) {
            scroll.appendChild(this._buildSection('Template Requirements', this._buildRequirementsContent(template)));
        }

        // 5. Model data
        scroll.appendChild(this._buildSection('Model Data', this._buildModelDataContent(node)));

        // 6. Comparison table (if template assigned)
        if (template && assignment) {
            scroll.appendChild(this._buildSection('Comparison', this._buildComparisonContent(node, template, assignment)));
        }

        this._root.innerHTML = '';
        this._root.appendChild(scroll);
    }

    // ── Section wrapper ────────────────────────────────────────────────────

    private _buildSection(title: string, content: HTMLElement): HTMLElement {
        const section = document.createElement('div');
        section.className = 'dw-sheet-section';

        const header = document.createElement('div');
        header.className = 'dw-sheet-section-header';
        header.textContent = title;

        section.appendChild(header);
        section.appendChild(content);

        return section;
    }

    // ── Section 1: Identity ────────────────────────────────────────────────

    private _buildIdentityContent(node: AnyHierarchyEntity): HTMLElement {
        const div = document.createElement('div');
        div.className = 'dw-sheet-content';

        // Type badge + sync state badge
        const badges = document.createElement('div');
        badges.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:10px;';

        const typeBadge = document.createElement('span');
        typeBadge.className = 'dw-badge';
        typeBadge.textContent = NODE_TYPE_LABELS[node.type] ?? node.type;
        typeBadge.style.background = '#6600FF22';
        typeBadge.style.color = '#6600FF';
        badges.appendChild(typeBadge);

        const syncBadge = document.createElement('span');
        syncBadge.className = 'dw-badge';
        syncBadge.textContent = SYNC_LABELS[node.syncState] ?? node.syncState;
        syncBadge.style.background = (SYNC_COLOURS[node.syncState] ?? '#9ca3af') + '22';
        syncBadge.style.color = SYNC_COLOURS[node.syncState] ?? '#9ca3af';
        badges.appendChild(syncBadge);

        div.appendChild(badges);

        // Name (editable)
        div.appendChild(this._buildEditableField('Name', node.name, (val) => {
            this._executeUpdate(node.id, { name: val });
        }));

        // Code (editable)
        div.appendChild(this._buildEditableField('Code', node.code ?? '', (val) => {
            this._executeUpdate(node.id, { code: val || undefined });
        }));

        // Description (editable)
        div.appendChild(this._buildEditableField('Description', node.description ?? '', (val) => {
            this._executeUpdate(node.id, { description: val || undefined });
        }));

        // Type-specific fields
        if (node.type === 'site') {
            div.appendChild(this._buildEditableField('Address', (node as any).address ?? '', (val) => {
                this._executeUpdate(node.id, { address: val || undefined } as any);
            }));
        }
        if (node.type === 'building') {
            div.appendChild(this._buildReadField('Building Use', (node as any).buildingUse ?? '—'));
            div.appendChild(this._buildReadField('Storeys', (node as any).numberOfStoreys?.toString() ?? '—'));
        }
        if (node.type === 'level') {
            div.appendChild(this._buildReadField('Level Number', (node as any).levelNumber ?? '—'));
            div.appendChild(this._buildReadField('Function', (node as any).levelFunction ?? '—'));
            div.appendChild(this._buildReadField('BIM Level ID', (node as any).bimLevelId ?? '—'));
        }
        if (node.type === 'unit') {
            div.appendChild(this._buildReadField('Unit Type', (node as any).unitType ?? '—'));
            div.appendChild(this._buildReadField('Unit Number', (node as any).unitNumber ?? '—'));
            div.appendChild(this._buildReadField('Department', (node as any).department ?? '—'));
        }

        // Metadata
        div.appendChild(this._buildReadField('Version', `v${node.metadata.version}`));
        div.appendChild(this._buildReadField('Modified', new Date(node.metadata.modifiedAt).toLocaleString()));

        return div;
    }

    // ── Section 2: Template ────────────────────────────────────────────────

    private _buildTemplateContent(node: AnyHierarchyEntity, template: TemplateDefinition | undefined, _assignment: TemplateAssignment | undefined): HTMLElement {
        const div = document.createElement('div');
        div.className = 'dw-sheet-content';

        const ts = window.templateStore; // TODO(F.6.x): legacy templateStore — replace with runtime.viewRegistry templates
        const scopeTemplates: TemplateDefinition[] = ts?.getByScope(node.type) ?? [];

        if (template) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px;';

            const name = document.createElement('div');
            name.style.cssText = 'flex:1;font-weight:600;font-size:13px;';
            name.textContent = template.name;
            row.appendChild(name);

            const codeBadge = document.createElement('span');
            codeBadge.className = 'dw-badge';
            codeBadge.textContent = template.code;
            codeBadge.style.background = '#6600FF22';
            codeBadge.style.color = '#6600FF';
            row.appendChild(codeBadge);

            const unassignBtn = document.createElement('button');
            unassignBtn.className = 'dw-toolbar-btn';
            unassignBtn.textContent = '✕ Remove';
            unassignBtn.style.fontSize = '11px';
            unassignBtn.addEventListener('click', async () => {
                await (this.runtime?.bus as any)?.executeCommand('template.unassign', { nodeId: node.id });
                this.refresh();
            });
            row.appendChild(unassignBtn);
            div.appendChild(row);

            div.appendChild(this._buildReadField('Scope', template.scope));
            div.appendChild(this._buildReadField('Version', `v${template.version}`));
        } else {
            const noTemplate = document.createElement('div');
            noTemplate.style.cssText = 'color:var(--app-text-muted,#7a8aaa);font-size:12px;margin-bottom:10px;font-style:italic;';
            noTemplate.textContent = 'No template assigned';
            div.appendChild(noTemplate);
        }

        // Assign template dropdown
        if (scopeTemplates.length > 0) {
            const assignRow = document.createElement('div');
            assignRow.style.cssText = 'display:flex;gap:6px;align-items:center;';

            const select = document.createElement('select');
            select.className = 'dw-dialog-select';
            select.style.flex = '1';

            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = template ? 'Change template…' : 'Assign template…';
            select.appendChild(placeholder);

            for (const t of scopeTemplates) {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = `${t.name} (${t.code})`;
                if (t.id === node.templateId) opt.selected = true;
                select.appendChild(opt);
            }

            const assignBtn = document.createElement('button');
            assignBtn.className = 'dw-toolbar-btn';
            assignBtn.textContent = 'Assign';
            assignBtn.addEventListener('click', async () => {
                const templateId = select.value;
                if (!templateId) return;
                await (this.runtime?.bus as any)?.executeCommand('template.assignToNode', {
                    nodeId: node.id, nodeType: node.type,
                    templateId, assignedBy: 'user',
                });
                this.refresh();
            });

            assignRow.appendChild(select);
            assignRow.appendChild(assignBtn);
            div.appendChild(assignRow);
        } else {
            const hint = document.createElement('div');
            hint.style.cssText = 'font-size:11px;color:var(--app-text-muted,#7a8aaa);margin-top:6px;';
            hint.textContent = `No ${node.type} templates available. Create one in the Templates tab.`;
            div.appendChild(hint);
        }

        return div;
    }

    // ── Section 3: Planned Data ────────────────────────────────────────────

    private _buildPlannedDataContent(node: AnyHierarchyEntity): HTMLElement {
        const div = document.createElement('div');
        div.className = 'dw-sheet-content';

        const pd = node.plannedData;

        div.appendChild(this._buildEditableField('Target Area (m²)',
            pd.targetArea?.toString() ?? '',
            (val) => {
                const num = parseFloat(val);
                this._executeUpdate(node.id, { plannedData: { ...pd, targetArea: isNaN(num) ? undefined : num } });
            }
        ));

        div.appendChild(this._buildEditableField('Target Count',
            pd.targetCount?.toString() ?? '',
            (val) => {
                const num = parseInt(val);
                this._executeUpdate(node.id, { plannedData: { ...pd, targetCount: isNaN(num) ? undefined : num } });
            }
        ));

        div.appendChild(this._buildEditableField('Brief Description',
            pd.description ?? '',
            (val) => {
                this._executeUpdate(node.id, { plannedData: { ...pd, description: val || undefined } });
            }
        ));

        // Custom properties
        const customKeys = Object.keys(pd.customProperties ?? {});
        if (customKeys.length > 0) {
            const header = document.createElement('div');
            header.style.cssText = 'font-size:11px;font-weight:700;color:var(--app-text-muted,#7a8aaa);text-transform:uppercase;letter-spacing:0.04em;margin-top:10px;margin-bottom:6px;';
            header.textContent = 'Custom Properties';
            div.appendChild(header);

            for (const key of customKeys) {
                const val = pd.customProperties[key];
                div.appendChild(this._buildEditableField(key, String(val ?? ''), (newVal) => {
                    const updated = { ...pd.customProperties, [key]: newVal };
                    this._executeUpdate(node.id, { plannedData: { ...pd, customProperties: updated } });
                }));
            }
        }

        return div;
    }

    // ── Section 4: Requirements ────────────────────────────────────────────

    private _buildRequirementsContent(template: TemplateDefinition): HTMLElement {
        const div = document.createElement('div');
        div.className = 'dw-sheet-content';

        const req = template.requirements;

        if (req.targetArea) {
            const { minimum, maximum, target, tolerancePercent } = req.targetArea;
            const parts: string[] = [];
            if (target != null) parts.push(`target: ${target}m²`);
            if (minimum != null) parts.push(`min: ${minimum}m²`);
            if (maximum != null) parts.push(`max: ${maximum}m²`);
            if (tolerancePercent != null) parts.push(`±${tolerancePercent}%`);
            div.appendChild(this._buildReadField('Area', parts.join(', ') || '—'));
        }

        if (req.targetCount) {
            const { minimum, maximum, exact } = req.targetCount;
            const parts: string[] = [];
            if (exact != null) parts.push(`exactly ${exact}`);
            if (minimum != null) parts.push(`min: ${minimum}`);
            if (maximum != null) parts.push(`max: ${maximum}`);
            div.appendChild(this._buildReadField('Count', parts.join(', ') || '—'));
        }

        if (req.doorRequirements?.length) {
            req.doorRequirements.forEach((d, i) => {
                const parts: string[] = [];
                if (d.typeCode) parts.push(`type: ${d.typeCode}`);
                if (d.fireRating) parts.push(`fire: ${d.fireRating}`);
                if (d.requiredCount != null) parts.push(`req: ${d.requiredCount}`);
                if (d.minimumCount != null) parts.push(`min: ${d.minimumCount}`);
                div.appendChild(this._buildReadField(`Door ${i + 1}`, parts.join(', ') || '—'));
            });
        }

        if (req.windowRequirements?.length) {
            req.windowRequirements.forEach((w, i) => {
                const parts: string[] = [];
                if (w.typeCode) parts.push(`type: ${w.typeCode}`);
                if (w.requiredCount != null) parts.push(`req: ${w.requiredCount}`);
                if (w.minimumGlazingRatio != null) parts.push(`glazing: ${(w.minimumGlazingRatio * 100).toFixed(0)}%`);
                div.appendChild(this._buildReadField(`Window ${i + 1}`, parts.join(', ') || '—'));
            });
        }

        if (req.finishRequirements?.length) {
            req.finishRequirements.forEach((f) => {
                const parts: string[] = [];
                if (f.materialId) parts.push(f.materialId);
                if (f.materialCategory) parts.push(f.materialCategory);
                div.appendChild(this._buildReadField(`Finish (${f.surface})`, parts.join(', ') || '—'));
            });
        }

        if (req.customRequirements?.length) {
            req.customRequirements.forEach((c) => {
                const val = c.expectedValue != null ? String(c.expectedValue) : '—';
                div.appendChild(this._buildReadField(c.label, val));
            });
        }

        if (!req.targetArea && !req.targetCount && !req.doorRequirements?.length
            && !req.windowRequirements?.length && !req.finishRequirements?.length
            && !req.customRequirements?.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'color:var(--app-text-muted,#7a8aaa);font-size:12px;font-style:italic;';
            empty.textContent = 'No requirements defined in this template.';
            div.appendChild(empty);
        }

        return div;
    }

    // ── Section 5: Model Data ──────────────────────────────────────────────

    private _buildModelDataContent(node: AnyHierarchyEntity): HTMLElement {
        const div = document.createElement('div');
        div.className = 'dw-sheet-content';

        const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot

        if (node.type === 'unit') {
            const rooms = rs ? rs.getAll().filter((r: any) => r.unitId === node.id) : [];
            const totalArea = rooms.reduce((sum: number, r: any) => sum + (r.computed?.area ?? 0), 0);
            div.appendChild(this._buildReadField('Actual Area', totalArea > 0 ? `${totalArea.toFixed(1)}m²` : '—'));
            div.appendChild(this._buildReadField('Room Count', String(rooms.length)));
        } else if (node.type === 'level') {
            const bimLevelId = (node as any).bimLevelId;
            const rooms = rs ? rs.getAll().filter((r: any) => r.levelId === bimLevelId) : [];
            const totalArea = rooms.reduce((sum: number, r: any) => sum + (r.computed?.area ?? 0), 0);
            div.appendChild(this._buildReadField('Total Room Area', totalArea > 0 ? `${totalArea.toFixed(1)}m²` : '—'));
            div.appendChild(this._buildReadField('Room Count', String(rooms.length)));
        } else if (node.type === 'building') {
            const hs = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
            const levels = hs?.getLevels(node.id) ?? [];
            div.appendChild(this._buildReadField('Level Count', String(levels.length)));
        } else if (node.type === 'site') {
            const hs = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
            const buildings = hs?.getBuildings(node.id) ?? [];
            div.appendChild(this._buildReadField('Building Count', String(buildings.length)));
        }

        div.appendChild(this._buildReadField('Element Code', window.elementCodeStore?.getCode(node.id)?.code ?? '—')); // TODO(C.3.x): legacy elementCodeStore — replace with runtime.projectContext element-code registry

        return div;
    }

    // ── Section 6: Comparison ──────────────────────────────────────────────

    private _buildComparisonContent(node: AnyHierarchyEntity, template: TemplateDefinition, assignment: TemplateAssignment): HTMLElement {
        const div = document.createElement('div');
        div.className = 'dw-sheet-content';

        const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
        const req = template.requirements;
        const rows: Array<{ key: string; label: string; expected: string; actual: string; state: string }> = [];

        // Area comparison
        if (req.targetArea) {
            let actualArea: number | null = null;
            if (node.type === 'unit') {
                const rooms = rs ? rs.getAll().filter((r: any) => r.unitId === node.id) : [];
                actualArea = rooms.reduce((sum: number, r: any) => sum + (r.computed?.area ?? 0), 0);
            }

            const ar = req.targetArea;
            const expected = ar.target != null ? `${ar.target}m²` : (ar.minimum != null ? `≥${ar.minimum}m²` : '—');
            const actual = actualArea != null ? `${actualArea.toFixed(1)}m²` : '—';
            let state = 'partial';
            if (actualArea != null && ar.minimum != null && actualArea < ar.minimum) {
                state = assignment.derivations['area'] ? 'derived' : 'conflict';
            } else if (actualArea != null) {
                state = 'synced';
            }

            rows.push({ key: 'area', label: 'Area', expected, actual, state });
        }

        // Count comparison
        if (req.targetCount) {
            const count = rs ? rs.getAll().filter((r: any) => r.unitId === node.id).length : 0;
            const cr = req.targetCount;
            const expected = cr.exact != null ? `exactly ${cr.exact}` : (cr.minimum != null ? `≥${cr.minimum}` : '—');
            const actual = String(count);
            let state = 'synced';
            if (cr.exact != null && count !== cr.exact) state = assignment.derivations['count'] ? 'derived' : 'conflict';
            else if (cr.minimum != null && count < cr.minimum) state = assignment.derivations['count'] ? 'derived' : 'conflict';
            rows.push({ key: 'count', label: 'Room Count', expected, actual, state });
        }

        // Finish requirements
        req.finishRequirements?.forEach((f, i) => {
            const key = `finish-${f.surface}-${i}`;
            const expected = f.materialId ?? f.materialCategory ?? '—';
            rows.push({ key, label: `Finish (${f.surface})`, expected, actual: '—', state: 'partial' });
        });

        if (rows.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'color:var(--app-text-muted,#7a8aaa);font-size:12px;font-style:italic;';
            empty.textContent = 'No comparable requirements defined.';
            div.appendChild(empty);
            return div;
        }

        // Table
        const table = document.createElement('table');
        table.className = 'dw-comparison-table';
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';

        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        ['Requirement', 'Expected', 'Actual', 'Portfolio', 'State', ''].forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            th.style.cssText = 'text-align:left;padding:4px 6px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--app-text-muted,#7a8aaa);border-bottom:1px solid var(--app-border,#dde3f0);letter-spacing:0.04em;';
            if (h === 'Portfolio') {
                th.title = 'Anonymised cross-project benchmark (synthetic data seeded from NHS HTM, NDSS, BB98)';
                th.style.color = '#6600FF';
            }
            headerRow.appendChild(th);
        });

        // Derive occupancy context for portfolio benchmark lookup (J-2)
        const unitRooms = node.type === 'unit' && rs
            ? rs.getAll().filter((r: any) => r.unitId === node.id)
            : [];
        const firstRoom = unitRooms[0];
        const roomType: string = firstRoom?.occupancyType ?? '';
        const buildingType: string = window.bimManager?.getMetadata?.()?.buildingType // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
            ?? window.projectContext?.metadata?.buildingType // TODO(C.3.x): legacy projectContext — replace with runtime.projectContext
            ?? '';

        const tbody = table.createTBody();
        for (const row of rows) {
            const tr = tbody.insertRow();
            tr.style.borderBottom = '1px solid var(--app-border-light,#eef1f8)';

            const labelTd = tr.insertCell();
            labelTd.textContent = row.label;
            labelTd.style.padding = '5px 6px';

            const expectedTd = tr.insertCell();
            expectedTd.textContent = row.expected;
            expectedTd.style.cssText = 'padding:5px 6px;color:var(--app-text-2,#5a6a85);';

            const actualTd = tr.insertCell();
            actualTd.textContent = row.actual;
            actualTd.style.padding = '5px 6px';

            // Portfolio benchmark cell (J-2)
            const portfolioTd = tr.insertCell();
            portfolioTd.style.cssText = 'padding:5px 6px;color:#6600FF;font-size:11px;';
            if (row.key === 'area' && roomType) {
                portfolioTd.textContent = '…';
                fetchBenchmark(buildingType || 'unknown', roomType).then(bm => {
                    if (!bm) { portfolioTd.textContent = '—'; return; }
                    const med = bm.area_m2?.median;
                    const label = med != null ? `${med}m²${bm.synthetic ? ' ⓢ' : ''}` : '—';
                    portfolioTd.textContent = label;
                    portfolioTd.title = bm.synthetic
                        ? `Synthetic benchmark (n=${bm.sampleSize}) — seeded from real standards`
                        : `Real benchmark (n=${bm.sampleSize})`;
                }).catch(() => { portfolioTd.textContent = '—'; });
            } else {
                portfolioTd.textContent = '—';
            }

            const stateTd = tr.insertCell();
            stateTd.style.padding = '5px 6px';
            const dot = document.createElement('span');
            dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;background:${SYNC_COLOURS[row.state] ?? '#9ca3af'};`;
            dot.title = SYNC_LABELS[row.state] ?? row.state;
            stateTd.appendChild(dot);

            const actionTd = tr.insertCell();
            actionTd.style.padding = '5px 6px';

            if (row.state === 'conflict') {
                const btn = document.createElement('button');
                btn.className = 'dw-toolbar-btn';
                btn.textContent = 'Mark derived';
                btn.style.fontSize = '10px';
                btn.addEventListener('click', () => {
                    this._showDerivedDialog(node.id, row.key);
                });
                actionTd.appendChild(btn);
            } else if (assignment.derivations[row.key]) {
                const btn = document.createElement('button');
                btn.className = 'dw-toolbar-btn';
                btn.textContent = 'Reset';
                btn.style.fontSize = '10px';
                btn.addEventListener('click', async () => {
                    await (this.runtime?.bus as any)?.executeCommand('data.clearPropertyDerived', { nodeId: node.id, key: row.key });
                    this.refresh();
                });
                actionTd.appendChild(btn);
            }

            tbody.appendChild(tr);
        }

        div.appendChild(table);

        return div;
    }

    // ── Derived dialog ─────────────────────────────────────────────────────

    private _showDerivedDialog(nodeId: string, key: string): void {
        this._closeDerivedDialog();

        const overlay = document.createElement('div');
        overlay.className = 'dw-dialog-overlay';

        overlay.innerHTML = `
            <div class="dw-dialog">
                <div class="dw-dialog-title">Mark as Derived</div>
                <div style="font-size:12px;color:var(--app-text-muted,#7a8aaa);margin-bottom:12px;">
                    A derived deviation is an intentional departure from the template requirement.
                    Please provide a reason.
                </div>
                <div class="dw-dialog-group">
                    <label class="dw-dialog-label">Reason *</label>
                    <input class="dw-dialog-input" id="dw-derived-reason" type="text" placeholder="e.g. Client approval ref. #123" />
                </div>
                <div class="dw-dialog-actions">
                    <button class="dw-dialog-btn dw-dialog-btn--cancel" id="dw-derived-cancel">Cancel</button>
                    <button class="dw-dialog-btn dw-dialog-btn--primary" id="dw-derived-ok">Mark derived</button>
                </div>
            </div>
        `;

        const input = overlay.querySelector('#dw-derived-reason') as HTMLInputElement;
        const cancelBtn = overlay.querySelector('#dw-derived-cancel') as HTMLButtonElement;
        const okBtn = overlay.querySelector('#dw-derived-ok') as HTMLButtonElement;

        cancelBtn.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        okBtn.addEventListener('click', async () => {
            const reason = input.value.trim();
            if (!reason) { input.style.borderColor = '#E24B4A'; return; }
            await (this.runtime?.bus as any)?.executeCommand('data.markPropertyDerived', { nodeId, key, reason });
            overlay.remove();
            this.refresh();
        });

        document.body.appendChild(overlay);
        this._dialogEl = overlay;
        setTimeout(() => input?.focus(), 50);
    }

    private _closeDerivedDialog(): void {
        if (this._dialogEl) { this._dialogEl.remove(); this._dialogEl = null; }
    }

    // ── Field builders ─────────────────────────────────────────────────────

    private _buildEditableField(label: string, value: string, onSave: (val: string) => void): HTMLElement {
        const group = document.createElement('div');
        group.className = 'dw-field-group';

        const labelEl = document.createElement('div');
        labelEl.className = 'dw-field-label';
        labelEl.textContent = label;

        const input = document.createElement('input');
        input.className = 'dw-dialog-input';
        input.value = value;
        input.style.marginBottom = '0';

        let saveTimeout: any;
        input.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => onSave(input.value.trim()), 800);
        });
        input.addEventListener('blur', () => {
            clearTimeout(saveTimeout);
            if (input.value.trim() !== value) onSave(input.value.trim());
        });

        group.appendChild(labelEl);
        group.appendChild(input);
        return group;
    }

    private _buildReadField(label: string, value: string): HTMLElement {
        const group = document.createElement('div');
        group.className = 'dw-field-group';

        const labelEl = document.createElement('div');
        labelEl.className = 'dw-field-label';
        labelEl.textContent = label;

        const valEl = document.createElement('div');
        valEl.className = 'dw-field-value';
        valEl.textContent = value || '—';

        group.appendChild(labelEl);
        group.appendChild(valEl);
        return group;
    }

    // ── Commands ───────────────────────────────────────────────────────────

    private async _executeUpdate(nodeId: string, updates: any): Promise<void> {
        await (this.runtime?.bus as any)?.executeCommand('hierarchy.updateNode', { id: nodeId, updates });
    }

    // ── Events ─────────────────────────────────────────────────────────────

    private _bindEvents(): void {
        window.runtime?.events?.on('pryzm-hierarchy-node-selected', (p: { nodeId: string; nodeType?: string }) => { // F.events.15
            if (p.nodeId) this.selectNode(p.nodeId, p.nodeType ?? 'unit');
        });

        window.runtime?.events?.on('pryzm-sync-state-changed', () => { // F.events.15
            if (this._currentNodeId) this.refresh();
        });

        window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
            this._currentNodeId = null;
            this._currentNodeType = null;
            this._renderEmpty();
        });
    }
}
