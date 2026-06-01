/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Data Workbench: Template Editor Panel (Phase 8-B)
 * File:             src/ui/dataworkbench/TemplateEditorPanel.ts
 * Contract:         docs/00_PRZYM/PRYZM_DATA_PLATFORM_IMPLEMENTATION_ROADMAP.md § PHASE 8
 *                   docs/02-decisions/contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md §3
 *
 * Template list + detail editor for all TemplateDefinitions.
 *
 * List view: grouped by scope. Columns: name, code, scope badge, usage count, [Edit] [Duplicate] [Delete]
 * Detail editor: name, code, scope, description, requirements builder cards
 *
 * Commands fired: CreateTemplateCommand, UpdateTemplateCommand, DeleteTemplateCommand, DuplicateTemplateCommand
 */

import { UpdateTemplateCommand, CreateTemplateCommand, DuplicateTemplateCommand, DeleteTemplateCommand } from '@pryzm/command-registry';
import type { TemplateDefinition, TemplateScope, TemplateRequirements } from '@pryzm/core-app-model';
import { apiFetch } from '@pryzm/core-app-model';

const SCOPE_LABELS: Record<string, string> = {
    site: 'Site', building: 'Building', level: 'Level', unit: 'Unit', room: 'Room', element: 'Element',
};

const SCOPE_COLOURS: Record<string, string> = {
    site: '#6600FF', building: '#3B8BD4', level: '#1D9E75', unit: '#EF9F27', room: '#E24B4A', element: '#9ca3af',
};

export class TemplateEditorPanel {
    private _container: HTMLElement;
    private _root!: HTMLElement;
    private _view: 'list' | 'edit' = 'list';
    private _tab: 'mine' | 'library' = 'mine';
    private _editingId: string | null = null;
    private _editDraft: Partial<TemplateDefinition> | null = null;

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

    // ── Public API ─────────────────────────────────────────────────────────

    refresh(): void {
        this._render();
    }

    // ── Routing ────────────────────────────────────────────────────────────

    private _render(): void {
        if (this._view === 'edit') {
            this._renderDetail();
        } else {
            this._renderList();
        }
    }

    // ── List view ──────────────────────────────────────────────────────────

    private _renderList(): void {
        this._root.innerHTML = '';

        // ── Tab bar ────────────────────────────────────────────────────────
        const tabBar = document.createElement('div');
        tabBar.style.cssText = [
            'display:flex',
            'align-items:center',
            'border-bottom:1px solid var(--app-border-light,#eef1f8)',
            'background:var(--app-surface,#fff)',
            'flex-shrink:0',
            'padding:0 8px',
            'gap:2px',
        ].join(';');

        const makeTab = (label: string, value: 'mine' | 'library'): HTMLElement => {
            const btn = document.createElement('button');
            const active = this._tab === value;
            btn.style.cssText = [
                'border:none',
                'background:none',
                'cursor:pointer',
                'padding:8px 10px',
                'font-size:12px',
                'font-weight:' + (active ? '700' : '500'),
                'color:' + (active ? '#6600FF' : 'var(--app-text-muted,#7a8aaa)'),
                'border-bottom:2px solid ' + (active ? '#6600FF' : 'transparent'),
                'margin-bottom:-1px',
                'transition:color .15s,border-color .15s',
            ].join(';');
            btn.textContent = label;
            btn.addEventListener('click', () => {
                this._tab = value;
                this._renderList();
            });
            return btn;
        };

        tabBar.appendChild(makeTab('My Templates', 'mine'));
        tabBar.appendChild(makeTab('Shared Library', 'library'));

        // New template button only in "mine" tab
        if (this._tab === 'mine') {
            const spacer = document.createElement('span');
            spacer.style.flex = '1';
            tabBar.appendChild(spacer);

            const newBtn = document.createElement('button');
            newBtn.className = 'dw-toolbar-btn';
            newBtn.style.marginRight = '4px';
            newBtn.textContent = '+ New';
            newBtn.title = 'Create new template';
            newBtn.addEventListener('click', () => this._startCreate());
            tabBar.appendChild(newBtn);
        }

        this._root.appendChild(tabBar);

        // ── Content area ───────────────────────────────────────────────────
        const scroll = document.createElement('div');
        scroll.style.cssText = 'flex:1;overflow-y:auto;padding:6px 0;';
        this._root.appendChild(scroll);

        if (this._tab === 'library') {
            this._renderLibraryContent(scroll);
            return;
        }

        // ── My Templates ───────────────────────────────────────────────────
        const ts = window.templateStore; // TODO(F.6.x): legacy templateStore — replace with runtime.viewRegistry templates
        const tas = window.templateAssignmentStore; // TODO(F.6.x): legacy templateAssignmentStore — replace with runtime.viewRegistry template-assignment
        const templates: TemplateDefinition[] = ts?.getAll() ?? [];

        if (templates.length === 0) {
            scroll.innerHTML = `
                <div class="dw-placeholder" style="padding-top:32px;">
                    <div class="dw-placeholder-icon">📐</div>
                    <div style="font-size:12px;text-align:center;max-width:200px;line-height:1.5;color:var(--app-text-muted,#7a8aaa)">
                        No templates yet.<br>Click <strong>[+ New]</strong> to create one.
                    </div>
                </div>
            `;
        } else {
            const scopes: TemplateScope[] = ['site', 'building', 'level', 'unit', 'room', 'element'];
            for (const scope of scopes) {
                const scopeTemplates = templates.filter(t => t.scope === scope);
                if (scopeTemplates.length === 0) continue;

                const groupHeader = document.createElement('div');
                groupHeader.style.cssText = `
                    padding: 6px 12px 4px;
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: ${SCOPE_COLOURS[scope] ?? '#9ca3af'};
                    border-bottom: 1px solid var(--app-border-light,#eef1f8);
                    margin-top: 4px;
                `;
                groupHeader.textContent = SCOPE_LABELS[scope] ?? scope;
                scroll.appendChild(groupHeader);

                for (const t of scopeTemplates) {
                    const usageCount = tas?.getUsageCount(t.id) ?? 0;
                    scroll.appendChild(this._buildTemplateRow(t, usageCount));
                }
            }
        }
    }

    // ── Shared Library tab ─────────────────────────────────────────────────

    private _renderLibraryContent(container: HTMLElement): void {
        container.innerHTML = `
            <div style="padding:16px;text-align:center;color:var(--app-text-muted,#7a8aaa);font-size:12px;">
                Loading shared templates…
            </div>
        `;

        apiFetch('/api/v1/templates/registry')
            .then((res: any) => res.json())
            .then((body: any) => {
                container.innerHTML = '';
                const entries: any[] = body?.data ?? [];

                if (entries.length === 0) {
                    container.innerHTML = `
                        <div class="dw-placeholder" style="padding-top:32px;">
                            <div class="dw-placeholder-icon">🌐</div>
                            <div style="font-size:12px;text-align:center;max-width:220px;line-height:1.5;color:var(--app-text-muted,#7a8aaa)">
                                No public templates yet.<br>
                                <span style="color:#6600FF;cursor:pointer;" id="lib-publish-hint">Publish one of your templates</span>
                                to share it here.
                            </div>
                        </div>
                    `;
                    container.querySelector('#lib-publish-hint')?.addEventListener('click', () => {
                        this._tab = 'mine';
                        this._renderList();
                    });
                    return;
                }

                for (const entry of entries) {
                    container.appendChild(this._buildLibraryRow(entry));
                }
            })
            .catch((err: Error) => {
                container.innerHTML = `
                    <div style="padding:16px;color:#E24B4A;font-size:12px;">
                        Failed to load shared library: ${err.message}
                    </div>
                `;
            });
    }

    private _buildLibraryRow(entry: any): HTMLElement {
        const row = document.createElement('div');
        row.className = 'dw-tree-row';
        row.style.cssText = 'display:flex;align-items:center;padding:7px 12px;gap:6px;';

        const scope: string = entry.scope ?? entry.definition?.scope ?? 'room';
        const scopeColor = SCOPE_COLOURS[scope] ?? '#9ca3af';

        const nameCol = document.createElement('div');
        nameCol.style.cssText = 'flex:1;min-width:0;';
        nameCol.innerHTML = `
            <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${entry.name ?? 'Unnamed'}</div>
            <div style="font-size:11px;color:var(--app-text-muted,#7a8aaa);">${entry.code ?? ''}</div>
        `;
        row.appendChild(nameCol);

        const scopeBadge = document.createElement('span');
        scopeBadge.className = 'dw-badge';
        scopeBadge.textContent = SCOPE_LABELS[scope] ?? scope;
        scopeBadge.style.cssText = `background:${scopeColor}22;color:${scopeColor};`;
        row.appendChild(scopeBadge);

        const importBtn = document.createElement('button');
        importBtn.className = 'dw-toolbar-btn';
        importBtn.textContent = 'Import';
        importBtn.style.cssText = 'font-size:11px;color:#6600FF;border-color:#6600FF44;';
        importBtn.addEventListener('click', () => this._importFromRegistry(entry, importBtn));
        row.appendChild(importBtn);

        return row;
    }

    private _importFromRegistry(entry: any, btn: HTMLButtonElement): void {
        btn.disabled = true;
        btn.textContent = '…';

        apiFetch(`/api/v1/templates/registry/${entry.id}`)
            .then((res: any) => res.json())
            .then((body: any) => {
                const def: any = body?.data?.definition ?? body?.data ?? {};
                // [P6-E.5.2] Migrated: window.commandManager + window.__pryzmCommands__ → runtime.bus.
                // Uses the statically-imported CreateTemplateCommand from @pryzm/command-registry.
                if (window.runtime?.bus) {
                    const _importCmd = new CreateTemplateCommand({
                        id:           crypto.randomUUID(),
                        name:         def.name ?? entry.name ?? 'Imported Template',
                        code:         def.code ?? entry.code ?? 'IMPORTED',
                        scope:        def.scope ?? entry.scope ?? 'room',
                        description:  def.description ?? entry.description ?? '',
                        requirements: def.requirements ?? {},
                    });
                    window.runtime.bus.executeCommand(_importCmd.type, _importCmd);
                } else {
                    const ts = window.templateStore; // TODO(F.6.x): legacy templateStore — replace with runtime.viewRegistry templates
                    if (ts?.add) {
                        ts.add({
                            id:           crypto.randomUUID(),
                            name:         def.name ?? entry.name ?? 'Imported Template',
                            code:         def.code ?? entry.code ?? 'IMPORTED',
                            scope:        def.scope ?? entry.scope ?? 'room',
                            description:  def.description ?? entry.description ?? '',
                            requirements: def.requirements ?? {},
                            createdAt:    Date.now(),
                            updatedAt:    Date.now(),
                        });
                    }
                }

                btn.textContent = '✓';
                btn.style.color = '#1D9E75';
                btn.style.borderColor = '#1D9E7544';
                setTimeout(() => {
                    btn.textContent = 'Import';
                    btn.style.color = '#6600FF';
                    btn.style.borderColor = '#6600FF44';
                    btn.disabled = false;
                }, 2000);
            })
            .catch((err: Error) => {
                btn.textContent = 'Error';
                btn.style.color = '#E24B4A';
                btn.disabled = false;
                console.error('[TemplateEditorPanel] Library import failed:', err);
            });
    }

    private _buildTemplateRow(t: TemplateDefinition, usageCount: number): HTMLElement {
        const row = document.createElement('div');
        row.className = 'dw-tree-row';
        row.style.cssText = 'display:flex;align-items:center;padding:7px 12px;gap:6px;';

        const nameCol = document.createElement('div');
        nameCol.style.cssText = 'flex:1;min-width:0;';
        nameCol.innerHTML = `
            <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.name}</div>
            <div style="font-size:11px;color:var(--app-text-muted,#7a8aaa);">${t.code}${t.description ? ' — ' + t.description.substring(0, 40) : ''}</div>
        `;
        row.appendChild(nameCol);

        const usageBadge = document.createElement('span');
        usageBadge.className = 'dw-badge';
        usageBadge.textContent = `${usageCount} use${usageCount !== 1 ? 's' : ''}`;
        usageBadge.style.background = usageCount > 0 ? '#1D9E7522' : 'transparent';
        usageBadge.style.color = usageCount > 0 ? '#1D9E75' : '#9ca3af';
        row.appendChild(usageBadge);

        const editBtn = document.createElement('button');
        editBtn.className = 'dw-toolbar-btn';
        editBtn.textContent = 'Edit';
        editBtn.style.fontSize = '11px';
        editBtn.addEventListener('click', () => this._startEdit(t));
        row.appendChild(editBtn);

        const dupBtn = document.createElement('button');
        dupBtn.className = 'dw-toolbar-btn';
        dupBtn.textContent = '⎘';
        dupBtn.title = 'Duplicate';
        dupBtn.style.fontSize = '11px';
        dupBtn.addEventListener('click', () => this._duplicateTemplate(t));
        row.appendChild(dupBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'dw-toolbar-btn';
        delBtn.textContent = '✕';
        delBtn.title = 'Delete';
        delBtn.style.cssText = `font-size:11px;color:#E24B4A;border-color:#E24B4A44;`;
        delBtn.addEventListener('click', () => this._deleteTemplate(t, usageCount));
        row.appendChild(delBtn);

        return row;
    }

    // ── Detail editor ──────────────────────────────────────────────────────

    private _renderDetail(): void {
        const draft = this._editDraft ?? {};
        this._root.innerHTML = '';

        // Header
        const toolbar = document.createElement('div');
        toolbar.className = 'dw-toolbar';

        const backBtn = document.createElement('button');
        backBtn.className = 'dw-toolbar-btn';
        backBtn.textContent = '← Back';
        backBtn.addEventListener('click', () => {
            this._view = 'list';
            this._editingId = null;
            this._editDraft = null;
            this._render();
        });
        toolbar.appendChild(backBtn);

        const title = document.createElement('span');
        title.style.cssText = 'flex:1;font-size:12px;font-weight:700;color:var(--app-text,#1a2035);text-align:center;';
        title.textContent = this._editingId ? 'Edit Template' : 'New Template';
        toolbar.appendChild(title);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'dw-toolbar-btn';
        saveBtn.textContent = '✓ Save';
        saveBtn.style.cssText += 'background:var(--app-accent,#6600FF);color:#fff;border-color:var(--app-accent,#6600FF);';
        saveBtn.addEventListener('click', () => this._saveTemplate());
        toolbar.appendChild(saveBtn);

        this._root.appendChild(toolbar);

        // Form
        const scroll = document.createElement('div');
        scroll.style.cssText = 'flex:1;overflow-y:auto;padding:12px;';

        // Basic fields
        scroll.appendChild(this._buildDetailSection('Identity', this._buildIdentityFields(draft)));
        scroll.appendChild(this._buildDetailSection('Requirements', this._buildRequirementsEditor(draft)));

        this._root.appendChild(scroll);
    }

    private _buildDetailSection(title: string, content: HTMLElement): HTMLElement {
        const section = document.createElement('div');
        section.className = 'dw-sheet-section';
        const header = document.createElement('div');
        header.className = 'dw-sheet-section-header';
        header.textContent = title;
        section.appendChild(header);
        section.appendChild(content);
        return section;
    }

    private _buildIdentityFields(draft: Partial<TemplateDefinition>): HTMLElement {
        const div = document.createElement('div');
        div.className = 'dw-sheet-content';

        // Name
        div.appendChild(this._buildFormField('Name *', 'text', draft.name ?? '', 'e.g. Standard 1-bed apartment', (val) => {
            this._editDraft = { ...this._editDraft, name: val };
        }));

        // Code
        div.appendChild(this._buildFormField('Code *', 'text', draft.code ?? '', 'e.g. APT-1B', (val) => {
            this._editDraft = { ...this._editDraft, code: val };
        }));

        // Scope
        const scopeGroup = document.createElement('div');
        scopeGroup.className = 'dw-field-group';
        const scopeLabel = document.createElement('div');
        scopeLabel.className = 'dw-field-label';
        scopeLabel.textContent = 'Scope *';
        scopeGroup.appendChild(scopeLabel);

        const scopeSelect = document.createElement('select');
        scopeSelect.className = 'dw-dialog-select';
        const scopes: TemplateScope[] = ['site', 'building', 'level', 'unit', 'room', 'element'];
        for (const s of scopes) {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = SCOPE_LABELS[s] ?? s;
            if ((draft.scope ?? 'unit') === s) opt.selected = true;
            scopeSelect.appendChild(opt);
        }
        scopeSelect.addEventListener('change', () => {
            this._editDraft = { ...this._editDraft, scope: scopeSelect.value as TemplateScope };
        });
        scopeGroup.appendChild(scopeSelect);
        div.appendChild(scopeGroup);

        // Description
        div.appendChild(this._buildFormField('Description', 'text', draft.description ?? '', 'Optional description', (val) => {
            this._editDraft = { ...this._editDraft, description: val || undefined };
        }));

        return div;
    }

    private _buildRequirementsEditor(draft: Partial<TemplateDefinition>): HTMLElement {
        const div = document.createElement('div');
        div.className = 'dw-sheet-content';

        const req = (draft.requirements ?? {}) as TemplateRequirements;

        // Area requirement card
        div.appendChild(this._buildReqCard('Area Requirement', req.targetArea != null, () => {
            if (req.targetArea) {
                const { targetArea: _, ...rest } = req;
                this._editDraft = { ...this._editDraft, requirements: rest };
            } else {
                this._editDraft = { ...this._editDraft, requirements: { ...req, targetArea: { target: undefined } } };
            }
            this._render();
        }, req.targetArea ? this._buildAreaReqFields(req) : null));

        // Count requirement card
        div.appendChild(this._buildReqCard('Count Requirement', req.targetCount != null, () => {
            if (req.targetCount) {
                const { targetCount: _, ...rest } = req;
                this._editDraft = { ...this._editDraft, requirements: rest };
            } else {
                this._editDraft = { ...this._editDraft, requirements: { ...req, targetCount: {} } };
            }
            this._render();
        }, req.targetCount ? this._buildCountReqFields(req) : null));

        // Finish requirements
        const finishCount = req.finishRequirements?.length ?? 0;
        div.appendChild(this._buildReqCard(`Finish Requirements (${finishCount})`, false, () => {
            const surfaces: Array<'floor' | 'ceiling' | 'wall'> = ['floor', 'ceiling', 'wall'];
            const usedSurfaces = new Set((req.finishRequirements ?? []).map(f => f.surface));
            const nextSurface = surfaces.find(s => !usedSurfaces.has(s));
            if (nextSurface) {
                const updated = [...(req.finishRequirements ?? []), { surface: nextSurface }];
                this._editDraft = { ...this._editDraft, requirements: { ...req, finishRequirements: updated } };
                this._render();
            }
        }, this._buildFinishReqFields(req)));

        // Custom requirements
        const customCount = req.customRequirements?.length ?? 0;
        div.appendChild(this._buildReqCard(`Custom Requirements (${customCount})`, false, () => {
            const updated = [...(req.customRequirements ?? []), { key: `custom-${Date.now()}`, label: 'New requirement' }];
            this._editDraft = { ...this._editDraft, requirements: { ...req, customRequirements: updated } };
            this._render();
        }, this._buildCustomReqFields(req)));

        return div;
    }

    private _buildReqCard(title: string, active: boolean, onToggle: () => void, content: HTMLElement | null): HTMLElement {
        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid var(--app-border,#dde3f0);border-radius:6px;margin-bottom:8px;overflow:hidden;';

        const cardHeader = document.createElement('div');
        cardHeader.style.cssText = `
            display:flex;align-items:center;justify-content:space-between;
            padding:8px 10px;cursor:pointer;
            background:${active ? 'var(--app-accent,#6600FF)11' : 'var(--app-panel-bg,#fff)'};
        `;

        const cardTitle = document.createElement('span');
        cardTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--app-text,#1a2035);';
        cardTitle.textContent = title;
        cardHeader.appendChild(cardTitle);

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'dw-toolbar-btn';
        toggleBtn.textContent = content ? '− Remove' : '+ Add';
        toggleBtn.style.fontSize = '11px';
        toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); onToggle(); });
        cardHeader.appendChild(toggleBtn);

        card.appendChild(cardHeader);

        if (content) {
            const body = document.createElement('div');
            body.style.cssText = 'padding:10px;border-top:1px solid var(--app-border-light,#eef1f8);';
            body.appendChild(content);
            card.appendChild(body);
        }

        return card;
    }

    private _buildAreaReqFields(req: TemplateRequirements): HTMLElement {
        const div = document.createElement('div');
        const ar = req.targetArea ?? {};

        div.appendChild(this._buildFormField('Target (m²)', 'number', ar.target?.toString() ?? '', 'e.g. 45', (val) => {
            this._editDraft = { ...this._editDraft, requirements: { ...req, targetArea: { ...ar, target: parseFloat(val) || undefined } } };
        }));
        div.appendChild(this._buildFormField('Minimum (m²)', 'number', ar.minimum?.toString() ?? '', 'e.g. 38', (val) => {
            this._editDraft = { ...this._editDraft, requirements: { ...req, targetArea: { ...ar, minimum: parseFloat(val) || undefined } } };
        }));
        div.appendChild(this._buildFormField('Maximum (m²)', 'number', ar.maximum?.toString() ?? '', 'e.g. 55', (val) => {
            this._editDraft = { ...this._editDraft, requirements: { ...req, targetArea: { ...ar, maximum: parseFloat(val) || undefined } } };
        }));
        div.appendChild(this._buildFormField('Tolerance (%)', 'number', ar.tolerancePercent?.toString() ?? '5', 'e.g. 5', (val) => {
            this._editDraft = { ...this._editDraft, requirements: { ...req, targetArea: { ...ar, tolerancePercent: parseFloat(val) || undefined } } };
        }));

        return div;
    }

    private _buildCountReqFields(req: TemplateRequirements): HTMLElement {
        const div = document.createElement('div');
        const cr = req.targetCount ?? {};

        div.appendChild(this._buildFormField('Exact count', 'number', cr.exact?.toString() ?? '', 'e.g. 3', (val) => {
            this._editDraft = { ...this._editDraft, requirements: { ...req, targetCount: { ...cr, exact: parseInt(val) || undefined } } };
        }));
        div.appendChild(this._buildFormField('Minimum', 'number', cr.minimum?.toString() ?? '', 'e.g. 1', (val) => {
            this._editDraft = { ...this._editDraft, requirements: { ...req, targetCount: { ...cr, minimum: parseInt(val) || undefined } } };
        }));
        div.appendChild(this._buildFormField('Maximum', 'number', cr.maximum?.toString() ?? '', 'e.g. 5', (val) => {
            this._editDraft = { ...this._editDraft, requirements: { ...req, targetCount: { ...cr, maximum: parseInt(val) || undefined } } };
        }));

        return div;
    }

    private _buildFinishReqFields(req: TemplateRequirements): HTMLElement {
        const div = document.createElement('div');
        const finishes = req.finishRequirements ?? [];

        if (finishes.length === 0) return div;

        for (let i = 0; i < finishes.length; i++) {
            const f = finishes[i];
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:6px;align-items:flex-end;margin-bottom:8px;';

            const surfaceGroup = document.createElement('div');
            surfaceGroup.style.flex = '1';
            const surfaceLabel = document.createElement('div');
            surfaceLabel.className = 'dw-field-label';
            surfaceLabel.textContent = 'Surface';
            surfaceGroup.appendChild(surfaceLabel);

            const select = document.createElement('select');
            select.className = 'dw-dialog-select';
            ['floor', 'ceiling', 'wall'].forEach(s => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
                if (f.surface === s) opt.selected = true;
                select.appendChild(opt);
            });
            select.addEventListener('change', () => {
                const updated = [...finishes];
                updated[i] = { ...f, surface: select.value as any };
                this._editDraft = { ...this._editDraft, requirements: { ...req, finishRequirements: updated } };
            });
            surfaceGroup.appendChild(select);
            row.appendChild(surfaceGroup);

            const matGroup = document.createElement('div');
            matGroup.style.flex = '2';
            const matLabel = document.createElement('div');
            matLabel.className = 'dw-field-label';
            matLabel.textContent = 'Material / Category';
            matGroup.appendChild(matLabel);

            const matInput = document.createElement('input');
            matInput.className = 'dw-dialog-input';
            matInput.value = f.materialId ?? f.materialCategory ?? '';
            matInput.placeholder = 'e.g. vinyl, timber';
            matInput.addEventListener('blur', () => {
                const updated = [...finishes];
                updated[i] = { ...f, materialId: matInput.value || undefined, materialCategory: matInput.value || undefined };
                this._editDraft = { ...this._editDraft, requirements: { ...req, finishRequirements: updated } };
            });
            matGroup.appendChild(matInput);
            row.appendChild(matGroup);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'dw-toolbar-btn';
            removeBtn.textContent = '✕';
            removeBtn.style.cssText += 'color:#E24B4A;border-color:#E24B4A44;flex-shrink:0;';
            removeBtn.addEventListener('click', () => {
                const updated = finishes.filter((_, idx) => idx !== i);
                this._editDraft = { ...this._editDraft, requirements: { ...req, finishRequirements: updated } };
                this._render();
            });
            row.appendChild(removeBtn);

            div.appendChild(row);
        }

        return div;
    }

    private _buildCustomReqFields(req: TemplateRequirements): HTMLElement {
        const div = document.createElement('div');
        const customs = req.customRequirements ?? [];

        if (customs.length === 0) return div;

        for (let i = 0; i < customs.length; i++) {
            const c = customs[i];
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:6px;align-items:flex-end;margin-bottom:8px;';

            const keyGroup = document.createElement('div');
            keyGroup.style.flex = '2';
            const keyLabel = document.createElement('div');
            keyLabel.className = 'dw-field-label';
            keyLabel.textContent = 'Label';
            keyGroup.appendChild(keyLabel);

            const keyInput = document.createElement('input');
            keyInput.className = 'dw-dialog-input';
            keyInput.value = c.label;
            keyInput.addEventListener('blur', () => {
                const updated = [...customs];
                updated[i] = { ...c, label: keyInput.value };
                this._editDraft = { ...this._editDraft, requirements: { ...req, customRequirements: updated } };
            });
            keyGroup.appendChild(keyInput);
            row.appendChild(keyGroup);

            const valGroup = document.createElement('div');
            valGroup.style.flex = '1';
            const valLabel = document.createElement('div');
            valLabel.className = 'dw-field-label';
            valLabel.textContent = 'Expected';
            valGroup.appendChild(valLabel);

            const valInput = document.createElement('input');
            valInput.className = 'dw-dialog-input';
            valInput.value = c.expectedValue?.toString() ?? '';
            valInput.addEventListener('blur', () => {
                const updated = [...customs];
                updated[i] = { ...c, expectedValue: valInput.value || undefined };
                this._editDraft = { ...this._editDraft, requirements: { ...req, customRequirements: updated } };
            });
            valGroup.appendChild(valInput);
            row.appendChild(valGroup);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'dw-toolbar-btn';
            removeBtn.textContent = '✕';
            removeBtn.style.cssText += 'color:#E24B4A;border-color:#E24B4A44;flex-shrink:0;';
            removeBtn.addEventListener('click', () => {
                const updated = customs.filter((_, idx) => idx !== i);
                this._editDraft = { ...this._editDraft, requirements: { ...req, customRequirements: updated } };
                this._render();
            });
            row.appendChild(removeBtn);

            div.appendChild(row);
        }

        return div;
    }

    private _buildFormField(label: string, type: string, value: string, placeholder: string, onChange: (val: string) => void): HTMLElement {
        const group = document.createElement('div');
        group.className = 'dw-field-group';

        const labelEl = document.createElement('div');
        labelEl.className = 'dw-field-label';
        labelEl.textContent = label;
        group.appendChild(labelEl);

        const input = document.createElement('input');
        input.className = 'dw-dialog-input';
        input.type = type;
        input.value = value;
        input.placeholder = placeholder;
        input.addEventListener('input', () => onChange(input.value));
        input.addEventListener('blur', () => onChange(input.value));
        group.appendChild(input);

        return group;
    }

    // ── CRUD actions ───────────────────────────────────────────────────────

    private _startCreate(): void {
        this._editingId = null;
        this._editDraft = {
            scope: 'unit',
            name: '',
            code: '',
            description: '',
            requirements: {},
        };
        this._view = 'edit';
        this._render();
    }

    private _startEdit(template: TemplateDefinition): void {
        this._editingId = template.id;
        this._editDraft = structuredClone(template);
        this._view = 'edit';
        this._render();
    }

    private async _saveTemplate(): Promise<void> {
        const draft = this._editDraft;
        if (!draft?.name?.trim() || !draft?.code?.trim()) {
            alert('Name and Code are required.');
            return;
        }

        // [P6-E.5.2] Migrated: window.commandManager → runtime.bus (01-BIM-ENGINE-CORE-CONTRACT §1).
        if (!window.runtime?.bus) return;

        if (this._editingId) {
            const _cmd = new UpdateTemplateCommand({
                id: this._editingId,
                patch: {
                    name: draft.name,
                    code: draft.code,
                    scope: draft.scope,
                    description: draft.description,
                    requirements: draft.requirements ?? {},
                },
            });
            window.runtime.bus.executeCommand(_cmd.type, _cmd);
        } else {
            const id = crypto.randomUUID();
            const _cmd = new CreateTemplateCommand({
                id,
                name: draft.name!,
                code: draft.code!,
                scope: draft.scope ?? 'unit',
                description: draft.description,
                requirements: draft.requirements,
                isShared: false,
                createdBy: 'user',
            });
            window.runtime.bus.executeCommand(_cmd.type, _cmd);
        }

        this._view = 'list';
        this._editingId = null;
        this._editDraft = null;
        this._render();
    }

    private async _duplicateTemplate(t: TemplateDefinition): Promise<void> {
        // [P6-E.5.2] Migrated: window.commandManager → runtime.bus (01-BIM-ENGINE-CORE-CONTRACT §1).
        if (!window.runtime?.bus) return;
        const _cmd = new DuplicateTemplateCommand({ sourceId: t.id, newId: crypto.randomUUID() });
        window.runtime.bus.executeCommand(_cmd.type, _cmd);
        this._render();
    }

    private async _deleteTemplate(t: TemplateDefinition, usageCount: number): Promise<void> {
        const msg = usageCount > 0
            ? `"${t.name}" is assigned to ${usageCount} node${usageCount !== 1 ? 's' : ''}. Deleting will unassign all of them. Continue?`
            : `Delete template "${t.name}"?`;
        if (!confirm(msg)) return;

        // [P6-E.5.2] Migrated: window.commandManager → runtime.bus (01-BIM-ENGINE-CORE-CONTRACT §1).
        if (!window.runtime?.bus) return;
        const _cmd = new DeleteTemplateCommand({ id: t.id });
        window.runtime.bus.executeCommand(_cmd.type, _cmd);
        this._render();
    }

    // ── Events ─────────────────────────────────────────────────────────────

    private _bindEvents(): void {
        window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
            this._view = 'list';
            this._editingId = null;
            this._editDraft = null;
            this._render();
        });
    }
}
