/**
 * ViewTemplateManagerPanel — Phase 12-C (refactored)
 *
 * Rail panel section surfacing all ViewTemplates. Two sub-views:
 *   1. Template list — one default template per view type; shows each template
 *      with view count, aggregate sync state, and inline row actions.
 *      Row actions: [Open] [Duplicate] [Delete] — NO bottom toolbar.
 *   2. Template detail — opened per-template; shows editable fields + VG table.
 *
 * Row also shows a sheet-name badge when any view using that template is placed
 * on a sheet.
 *
 * All mutations go through CommandManager — no direct store writes (§01 §2).
 * Native HTML only — no bim-* or BUI elements (§05 §6).
 * CSS tokens: var(--app-*) from AppTheme (§05 §7.6).
 * NO native browser dialogs (window.prompt / confirm / alert) — §05 §2.3 Rule 8.
 *
 * Contract compliance:
 *   §01 §2   — All mutations via CommandManager
 *   §05 §6   — Zero bim-* elements
 *   §05 §9   — File under src/ui/views/
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';

const LOCKED_FIELD_OPTIONS = ['scale', 'detailLevel', 'visualStyle', 'phaseFilter', 'vgTemplate'];

type TemplateDiscipline = 'architecture' | 'structure' | 'mep' | 'all';

/** Default view templates seeded on first open — one per view type. */
const DEFAULT_TEMPLATES: Array<{ name: string; discipline: TemplateDiscipline; viewType: string }> = [
    { name: '3D View',        discipline: 'all',          viewType: '3d' },
    { name: 'Floor Plan',     discipline: 'architecture', viewType: 'plan' },
    { name: 'Section',        discipline: 'architecture', viewType: 'section' },
    { name: 'Elevation',      discipline: 'architecture', viewType: 'elevation' },
    { name: 'Ceiling Plan',   discipline: 'architecture', viewType: 'ceiling-plan' },
    { name: 'Structural',     discipline: 'structure',    viewType: 'structural-plan' },
    { name: 'Detail',         discipline: 'all',          viewType: 'detail' },
    { name: 'Drafting',       discipline: 'all',          viewType: 'drafting' },
    { name: 'Legend',         discipline: 'all',          viewType: 'legend' },
    { name: 'Render',         discipline: 'all',          viewType: 'render' },
    { name: 'Walkthrough',    discipline: 'all',          viewType: 'walkthrough' },
    { name: 'Analysis View',  discipline: 'all',          viewType: 'analysis' },
];

export class ViewTemplateManagerPanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private _root: HTMLElement | null       = null;
    private _selectedTemplateId: string | null = null;
    private _detailView: HTMLElement | null = null;
    private _listView: HTMLElement | null   = null;
    private _defaultsSeeded                 = false;

    build(): HTMLElement {
        if (!this._root) {
            this._root = document.createElement('div');
            this._root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
            this._renderRoot();
            window.addEventListener('vt:template-updated', () => this._refresh());
            window.addEventListener('vt:template-deleted', () => this._refresh());
            window.addEventListener('vt:template-created', () => this._refresh());
            window.addEventListener('vd:sync-state-changed', () => this._refresh());
        }
        return this._root;
    }

    private _renderRoot(): void {
        if (!this._root) return;
        this._root.innerHTML = '';

        // Header row
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px 6px;border-bottom:1px solid var(--app-border,#dde3f0);flex-shrink:0;';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:0.78rem;font-weight:700;color:var(--app-text,#1a2035);letter-spacing:0.04em;text-transform:uppercase;';
        title.textContent   = 'View Templates';
        header.appendChild(title);

        const newBtn = document.createElement('button');
        newBtn.textContent   = '+ New';
        newBtn.style.cssText = 'background:var(--app-gradient,linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%));color:#fff;border:none;border-radius:4px;padding:3px 9px;cursor:pointer;font-size:0.72rem;font-weight:600;font-family:inherit;';
        newBtn.onclick       = () => this._createTemplate();
        header.appendChild(newBtn);

        this._root.appendChild(header);

        // List view (scrollable)
        this._listView = document.createElement('div');
        this._listView.style.cssText = 'flex:1;overflow-y:auto;';
        this._root.appendChild(this._listView);

        // Detail panel (hidden until Open)
        this._detailView = document.createElement('div');
        this._detailView.style.cssText = 'display:none;flex-direction:column;flex:1;overflow:hidden;';
        this._root.appendChild(this._detailView);

        // Seed default templates then render list
        this._ensureDefaultTemplates().then(() => this._renderList());
    }

    // ─── Default template seeding ─────────────────────────────────────────────

    /**
     * Auto-seeds one default template per view type if none exist yet.
     * Uses CommandManager so the operation is undoable and observable.
     */
    private async _ensureDefaultTemplates(): Promise<void> {
        if (this._defaultsSeeded) return;
        this._defaultsSeeded = true;

        // Wait for stores to be ready (they are registered on window by the app)
        const vts = window.viewTemplateStore; // TODO(F.6.x): legacy viewTemplateStore — replace with runtime.viewRegistry templates
        if (!vts) return;

        const existing: any[] = vts.getAll?.() ?? [];
        if (existing.length > 0) return; // Already has templates — don't override user data

        const bus = (this.runtime?.bus as any);
        for (const tpl of DEFAULT_TEMPLATES) {
            bus?.executeCommand('viewTemplate.create', {
                id:          crypto.randomUUID(),
                name:        tpl.name,
                discipline:  tpl.discipline,
                description: `Default template for ${tpl.name} views.`,
                lockedFields: [],
                source:      'SYSTEM',
            });
        }
    }

    // ─── List rendering ───────────────────────────────────────────────────────

    private _renderList(): void {
        const listView = this._listView;
        if (!listView) return;
        listView.innerHTML = '';

        const vts      = window.viewTemplateStore; // TODO(F.6.x): legacy viewTemplateStore — replace with runtime.viewRegistry templates
        const vds      = window.viewDefinitionStore; // TODO(F.6.x): legacy viewDefinitionStore — replace with runtime.viewRegistry definitions
        const sheets   = window.sheetStore; // TODO(F.6.x): legacy sheetStore — replace with runtime.sheets store
        const templates: any[] = vts?.getAll?.() ?? [];
        const allViews: any[]  = vds?.getAll?.() ?? [];

        if (!templates.length) {
            listView.innerHTML = `
                <div style="padding:24px 16px;text-align:center;font-size:0.76rem;color:var(--app-text-muted,#7a8aaa);">
                    No view templates yet.<br>Click <strong>+ New</strong> to create one.
                </div>`;
            return;
        }

        // Column header
        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:grid;grid-template-columns:1fr 54px 80px 64px;gap:0;padding:4px 10px 4px 10px;font-size:0.68rem;font-weight:700;color:var(--app-text-muted,#7a8aaa);border-bottom:1px solid var(--app-border,#dde3f0);text-transform:uppercase;letter-spacing:0.05em;';
        hdr.innerHTML = '<span>Template</span><span>Views</span><span>Sync</span><span style="text-align:right;">Actions</span>';
        listView.appendChild(hdr);

        templates.forEach((tpl) => {
            const viewsUsing  = allViews.filter((v: any) => v.viewTemplateId === tpl.id || v.vgTemplateId === tpl.id);
            const syncSummary = this._computeAggregateSyncState(viewsUsing);

            // Collect sheet names for views using this template
            const sheetBadgeText = this._resolveSheetBadge(viewsUsing, sheets);

            const row = document.createElement('div');
            row.style.cssText = [
                'padding:5px 8px 5px 10px;',
                'cursor:pointer;',
                'border-bottom:1px solid var(--app-border,#dde3f0);',
                'font-size:0.76rem;',
                'transition:background 0.1s;',
                'position:relative;',
            ].join('');
            row.style.background = this._selectedTemplateId === tpl.id
                ? 'var(--app-violet-soft,rgba(102,0,255,0.08))'
                : 'transparent';

            row.onmouseenter = () => {
                if (this._selectedTemplateId !== tpl.id) row.style.background = 'var(--app-violet-soft,rgba(102,0,255,0.05))';
                actionsEl.style.opacity = '1';
            };
            row.onmouseleave = () => {
                row.style.background = this._selectedTemplateId === tpl.id
                    ? 'var(--app-violet-soft,rgba(102,0,255,0.08))'
                    : 'transparent';
                actionsEl.style.opacity = '0';
            };
            row.onclick = () => {
                this._selectedTemplateId = tpl.id;
                this._renderList();
            };
            row.ondblclick = () => this._openDetail(tpl.id);

            // Main info row (grid)
            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid;grid-template-columns:1fr 54px 80px 64px;gap:0;align-items:center;';

            // Template name + optional sheet badge
            const nameWrap = document.createElement('div');
            nameWrap.style.cssText = 'display:flex;flex-direction:column;gap:1px;overflow:hidden;';

            const nameEl = document.createElement('div');
            nameEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--app-text,#1a2035);font-weight:500;';
            nameEl.textContent   = tpl.name;
            nameWrap.appendChild(nameEl);

            if (sheetBadgeText) {
                const badge = document.createElement('div');
                badge.style.cssText = [
                    'display:inline-flex;align-items:center;gap:3px;',
                    'font-size:0.6rem;font-weight:600;',
                    'color:var(--app-accent,#6600FF);',
                    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
                ].join('');
                badge.title       = sheetBadgeText;
                badge.innerHTML   = `<svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><line x1="5" y1="6" x2="11" y2="6"/><line x1="5" y1="9" x2="8" y2="9"/></svg>${sheetBadgeText}`;
                nameWrap.appendChild(badge);
            }

            // View count
            const countEl = document.createElement('div');
            countEl.style.cssText = 'text-align:center;color:var(--app-text-muted,#7a8aaa);';
            countEl.textContent   = String(viewsUsing.length);

            // Sync summary
            const syncEl = document.createElement('div');
            syncEl.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:0.65rem;overflow:hidden;';
            syncEl.innerHTML     = syncSummary;

            // Action icons (always in DOM, opacity toggled on hover)
            const actionsEl = document.createElement('div');
            actionsEl.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:2px;opacity:0;transition:opacity 0.15s;';

            const openIco  = this._iconBtn('M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'Open template', () => this._openDetail(tpl.id));
            const dupIco   = this._iconBtn('M4 4h8v8H4z M6 2h8v8', 'Duplicate template', () => this._duplicateTemplate(tpl.id));
            const delIco   = this._iconBtn('M3 6h10 M8 6v7 M5 6l1-3h4l1 3 M6 9l.5 4 M10 9l-.5 4', 'Delete template', () => this._deleteTemplate(tpl.id), 'danger');

            actionsEl.append(openIco, dupIco, delIco);

            grid.append(nameWrap, countEl, syncEl, actionsEl);
            row.appendChild(grid);
            listView.appendChild(row);
        });
    }

    /** Returns a short sheet-name string for views using this template, or empty. */
    private _resolveSheetBadge(viewsUsing: any[], sheets: any): string {
        if (!sheets || !viewsUsing.length) return '';
        const allSheets: any[] = sheets.getAll?.() ?? [];
        const sheetNames = new Set<string>();
        for (const view of viewsUsing) {
            for (const sheet of allSheets) {
                const vps: any[] = sheet.viewports ?? [];
                if (vps.some((vp: any) => vp.viewId === view.id)) {
                    sheetNames.add(`${sheet.sheetNumber}`);
                }
            }
        }
        if (!sheetNames.size) return '';
        const names = [...sheetNames].slice(0, 3).join(', ');
        return sheetNames.size > 3 ? `${names} +${sheetNames.size - 3}` : names;
    }

    /** Builds a small SVG icon button for row actions. */
    private _iconBtn(pathD: string, title: string, onClick: () => void, variant: 'default' | 'danger' = 'default'): HTMLElement {
        const btn = document.createElement('button');
        const color = variant === 'danger' ? '#ef4444' : 'var(--app-text-muted,#7a8aaa)';
        btn.title       = title;
        btn.style.cssText = [
            'background:none;border:none;padding:3px;cursor:pointer;',
            `color:${color};`,
            'border-radius:3px;display:flex;align-items:center;justify-content:center;',
            'transition:background 0.1s,color 0.1s;',
        ].join('');
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${pathD}"/></svg>`;
        btn.onmouseenter = () => {
            btn.style.background = variant === 'danger' ? 'rgba(239,68,68,0.1)' : 'var(--app-violet-soft,rgba(102,0,255,0.08))';
            if (variant !== 'danger') btn.style.color = 'var(--app-accent,#6600FF)';
        };
        btn.onmouseleave = () => {
            btn.style.background = 'none';
            btn.style.color = color;
        };
        btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
        return btn;
    }

    private _computeAggregateSyncState(views: any[]): string {
        if (!views.length) return '<span style="color:var(--app-text-muted,#7a8aaa);">—</span>';
        const counts: Record<string, number> = {};
        views.forEach(v => {
            const s = (v as any).viewSyncState ?? 'no-template';
            counts[s] = (counts[s] ?? 0) + 1;
        });
        const parts: string[] = [];
        if (counts.conflict)   parts.push(`<span style="color:#ef4444;">● ${counts.conflict}</span>`);
        if (counts.derived)    parts.push(`<span style="color:#f97316;">● ${counts.derived}</span>`);
        if (counts.synced)     parts.push(`<span style="color:#22c55e;">● ${counts.synced}</span>`);
        if (counts.partial)    parts.push(`<span style="color:#eab308;">● ${counts.partial}</span>`);
        return parts.join(' ') || '<span style="color:#22c55e;">●</span>';
    }

    // ─── Detail view ──────────────────────────────────────────────────────────

    private _openDetail(templateId: string): void {
        const vts  = window.viewTemplateStore; // TODO(F.6.x): legacy viewTemplateStore — replace with runtime.viewRegistry templates
        const tpl  = vts?.get?.(templateId);
        if (!tpl || !this._detailView || !this._listView || !this._root) return;

        this._listView.style.display = 'none';
        this._detailView.style.display = 'flex';
        this._detailView.innerHTML = '';

        // Detail header
        const dHdr = document.createElement('div');
        dHdr.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--app-border,#dde3f0);flex-shrink:0;';

        const backBtn = document.createElement('button');
        backBtn.textContent   = '← Back';
        backBtn.style.cssText = this._btnStyle() + 'flex-shrink:0;';
        backBtn.onclick       = () => {
            this._detailView!.style.display = 'none';
            this._listView!.style.display   = 'block';
        };

        const dTitle = document.createElement('div');
        dTitle.style.cssText = 'font-size:0.8rem;font-weight:700;color:var(--app-text,#1a2035);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
        dTitle.textContent   = tpl.name;

        dHdr.append(backBtn, dTitle);
        this._detailView.appendChild(dHdr);

        // Editable name field
        const nameSection = this._buildDetailField('Name', tpl.name, (val) => {
            this._execUpdateTemplate(templateId, { name: val });
        });
        this._detailView.appendChild(nameSection);

        // Description field
        const descSection = this._buildDetailField('Description', tpl.description ?? '', (val) => {
            this._execUpdateTemplate(templateId, { description: val || null });
        });
        this._detailView.appendChild(descSection);

        // Locked fields table
        const lfSection = document.createElement('div');
        lfSection.style.cssText = 'padding:8px 12px;border-top:1px solid var(--app-border,#dde3f0);';

        const lfTitle = document.createElement('div');
        lfTitle.style.cssText = 'font-size:0.7rem;font-weight:700;color:var(--app-text-muted,#7a8aaa);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;';
        lfTitle.textContent   = 'Locked Fields (VG)';
        lfSection.appendChild(lfTitle);

        const currentLocked: string[] = tpl.lockedFields ?? [];

        LOCKED_FIELD_OPTIONS.forEach(field => {
            const rowEl = document.createElement('label');
            rowEl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;font-size:0.76rem;color:var(--app-text,#1a2035);';

            const checkbox = document.createElement('input');
            checkbox.type    = 'checkbox';
            checkbox.checked = currentLocked.includes(field);
            checkbox.style.cssText = 'accent-color:var(--app-accent,#6600FF);';
            checkbox.addEventListener('change', () => {
                const updatedFields = LOCKED_FIELD_OPTIONS.filter(f => {
                    const cb = lfSection.querySelector<HTMLInputElement>(`[data-field="${f}"]`);
                    return cb?.checked ?? false;
                });
                this._execUpdateTemplate(templateId, { lockedFields: updatedFields as any });
            });
            checkbox.dataset.field = field;

            rowEl.appendChild(checkbox);
            rowEl.appendChild(document.createTextNode(field));
            lfSection.appendChild(rowEl);
        });

        this._detailView.appendChild(lfSection);
    }

    private _buildDetailField(label: string, value: string, onChange: (val: string) => void): HTMLElement {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 12px;border-top:1px solid var(--app-border,#dde3f0);';

        const lbl = document.createElement('div');
        lbl.style.cssText = 'font-size:0.7rem;font-weight:700;color:var(--app-text-muted,#7a8aaa);text-transform:uppercase;min-width:80px;';
        lbl.textContent   = label;
        wrap.appendChild(lbl);

        const input = document.createElement('input');
        input.type      = 'text';
        input.value     = value;
        input.style.cssText = 'flex:1;background:var(--app-panel-bg,#ffffff);border:1px solid var(--app-border,#dde3f0);border-radius:var(--app-radius-sm,6px);padding:4px 8px;color:var(--app-text,#1a2035);font-size:0.76rem;font-family:inherit;outline:none;';
        input.addEventListener('focus', () => { input.style.borderColor = 'var(--app-accent,#6600FF)'; });
        input.addEventListener('blur',  () => { input.style.borderColor = 'var(--app-border,#dde3f0)'; });
        input.addEventListener('change', () => onChange(input.value.trim()));
        wrap.appendChild(input);

        return wrap;
    }

    // ─── Styled inline modals ─────────────────────────────────────────────────

    private _showNameModal(opts: {
        title:        string;
        label:        string;
        defaultValue?: string;
        confirmText?: string;
    }): Promise<string | null> {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = [
                'position:fixed;inset:0;z-index:99999;',
                'display:flex;align-items:center;justify-content:center;',
                'background:rgba(10,12,28,0.55);backdrop-filter:blur(3px);',
            ].join('');

            const card = document.createElement('div');
            card.style.cssText = [
                'background:var(--app-panel-bg,#ffffff);',
                'border-radius:var(--app-radius-lg,16px);',
                'box-shadow:var(--app-shadow-panel,0 8px 32px rgba(30,50,120,0.18));',
                'width:340px;max-width:calc(100vw - 40px);',
                'overflow:hidden;',
                'font-family:var(--app-font,Inter,sans-serif);',
            ].join('');

            const hdr = document.createElement('div');
            hdr.style.cssText = [
                'background:var(--app-gradient,linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%));',
                'padding:12px 18px;color:#fff;',
                'font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;',
            ].join('');
            hdr.textContent = opts.title;

            const body = document.createElement('div');
            body.style.cssText = 'padding:18px 18px 10px;';

            const lbl = document.createElement('label');
            lbl.style.cssText = 'display:block;font-size:0.72rem;font-weight:600;color:var(--app-text-muted,#7a8aaa);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:7px;';
            lbl.textContent = opts.label;

            const inp = document.createElement('input');
            inp.type        = 'text';
            inp.value       = opts.defaultValue ?? '';
            inp.placeholder = opts.label;
            inp.style.cssText = [
                'width:100%;box-sizing:border-box;',
                'background:var(--app-bg,#e8edf6);',
                'border:1px solid var(--app-border,#dde3f0);',
                'border-radius:var(--app-radius-sm,6px);',
                'padding:8px 11px;font-size:0.82rem;font-family:inherit;',
                'color:var(--app-text,#1a2035);outline:none;transition:border-color 0.15s;',
            ].join('');
            inp.addEventListener('focus', () => { inp.style.borderColor = 'var(--app-accent,#6600FF)'; });
            inp.addEventListener('blur',  () => { inp.style.borderColor = 'var(--app-border,#dde3f0)'; });

            body.append(lbl, inp);

            const footer = document.createElement('div');
            footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:10px 18px 16px;';

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent   = 'Cancel';
            cancelBtn.style.cssText = [
                'background:transparent;border:1px solid var(--app-border,#dde3f0);',
                'border-radius:var(--app-radius-sm,6px);padding:7px 18px;',
                'font-size:0.8rem;font-weight:500;font-family:inherit;',
                'color:var(--app-text-2,#5a6a85);cursor:pointer;transition:background 0.15s;',
            ].join('');
            cancelBtn.onmouseenter = () => { cancelBtn.style.background = 'var(--app-bg,#e8edf6)'; };
            cancelBtn.onmouseleave = () => { cancelBtn.style.background = 'transparent'; };
            cancelBtn.onclick = () => { overlay.remove(); resolve(null); };

            const confirmBtn = document.createElement('button');
            confirmBtn.textContent   = opts.confirmText ?? 'Create';
            confirmBtn.style.cssText = [
                'background:var(--app-gradient,linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%));',
                'border:none;border-radius:var(--app-radius-sm,6px);padding:7px 20px;',
                'font-size:0.8rem;font-weight:700;font-family:inherit;color:#fff;cursor:pointer;',
                'box-shadow:var(--app-shadow-glow,0 4px 16px rgba(102,0,255,0.35));',
                'transition:opacity 0.15s;',
            ].join('');
            confirmBtn.onmouseenter = () => { confirmBtn.style.opacity = '0.88'; };
            confirmBtn.onmouseleave = () => { confirmBtn.style.opacity = '1'; };

            const doConfirm = () => {
                const val = inp.value.trim();
                if (!val) { inp.style.borderColor = '#ef4444'; inp.focus(); return; }
                overlay.remove();
                resolve(val);
            };

            confirmBtn.onclick = doConfirm;
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter')  { e.preventDefault(); doConfirm(); }
                if (e.key === 'Escape') { e.preventDefault(); overlay.remove(); resolve(null); }
            });

            overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } };

            footer.append(cancelBtn, confirmBtn);
            card.append(hdr, body, footer);
            overlay.appendChild(card);
            document.body.appendChild(overlay);
            // D.7.5: routed through getFrameScheduler() instead of raw rAF.
            getFrameScheduler().scheduleOnce('view-template-rename-focus', () => { inp.focus(); inp.select(); });
        });
    }

    private _showConfirmModal(opts: {
        title:        string;
        message:      string;
        confirmText?: string;
        danger?:      boolean;
    }): Promise<boolean> {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = [
                'position:fixed;inset:0;z-index:99999;',
                'display:flex;align-items:center;justify-content:center;',
                'background:rgba(10,12,28,0.55);backdrop-filter:blur(3px);',
            ].join('');

            const card = document.createElement('div');
            card.style.cssText = [
                'background:var(--app-panel-bg,#ffffff);',
                'border-radius:var(--app-radius-lg,16px);',
                'box-shadow:var(--app-shadow-panel,0 8px 32px rgba(30,50,120,0.18));',
                'width:340px;max-width:calc(100vw - 40px);overflow:hidden;',
                'font-family:var(--app-font,Inter,sans-serif);',
            ].join('');

            const hdr = document.createElement('div');
            hdr.style.cssText = [
                'background:var(--app-gradient,linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%));',
                'padding:12px 18px;color:#fff;',
                'font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;',
            ].join('');
            hdr.textContent = opts.title;

            const msgEl = document.createElement('div');
            msgEl.style.cssText = 'padding:18px 18px 6px;font-size:0.82rem;color:var(--app-text,#1a2035);line-height:1.5;';
            msgEl.textContent = opts.message;

            const footer = document.createElement('div');
            footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:12px 18px 16px;';

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent   = 'Cancel';
            cancelBtn.style.cssText = [
                'background:transparent;border:1px solid var(--app-border,#dde3f0);',
                'border-radius:var(--app-radius-sm,6px);padding:7px 18px;',
                'font-size:0.8rem;font-weight:500;font-family:inherit;',
                'color:var(--app-text-2,#5a6a85);cursor:pointer;',
            ].join('');
            cancelBtn.onclick = () => { overlay.remove(); resolve(false); };

            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = opts.confirmText ?? 'Confirm';
            const dangerStyle = opts.danger
                ? 'background:#ef4444;box-shadow:none;'
                : 'background:var(--app-gradient,linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%));box-shadow:var(--app-shadow-glow,0 4px 16px rgba(102,0,255,0.35));';
            confirmBtn.style.cssText = [
                dangerStyle,
                'border:none;border-radius:var(--app-radius-sm,6px);padding:7px 20px;',
                'font-size:0.8rem;font-weight:700;font-family:inherit;color:#fff;cursor:pointer;',
            ].join('');
            confirmBtn.onclick = () => { overlay.remove(); resolve(true); };

            overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } };

            footer.append(cancelBtn, confirmBtn);
            card.append(hdr, msgEl, footer);
            overlay.appendChild(card);
            document.body.appendChild(overlay);
            confirmBtn.focus();
        });
    }

    private _showToast(message: string, variant: 'error' | 'info' = 'error'): void {
        const toast = document.createElement('div');
        const bg = variant === 'error'
            ? 'background:#ef4444;'
            : 'background:var(--app-gradient,linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%));';
        toast.style.cssText = [
            'position:fixed;bottom:24px;right:24px;z-index:99999;',
            bg,
            'color:#fff;border-radius:var(--app-radius-md,12px);',
            'padding:12px 18px;max-width:320px;',
            'font-family:var(--app-font,Inter,sans-serif);font-size:0.82rem;line-height:1.5;',
            'box-shadow:0 4px 20px rgba(0,0,0,0.25);animation:vtToastIn 0.2s ease;',
        ].join('');
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; }, 3500);
        setTimeout(() => toast.remove(), 3900);
    }

    // ─── Command actions ──────────────────────────────────────────────────────

    private _createTemplate(): void {
        this._showNameModal({
            title:       'New View Template',
            label:       'Template name',
            confirmText: 'Create',
        }).then((name) => {
            if (!name) return;
            (this.runtime?.bus as any)?.executeCommand('viewTemplate.create', { id: crypto.randomUUID(), name, discipline: 'all' });
        });
    }

    private _duplicateTemplate(templateId: string): void {
        const vts = window.viewTemplateStore; // TODO(F.6.x): legacy viewTemplateStore — replace with runtime.viewRegistry templates
        const tpl = vts?.get?.(templateId);
        if (!tpl) return;
        this._showNameModal({
            title:        'Duplicate Template',
            label:        'New name',
            defaultValue: `${tpl.name} (copy)`,
            confirmText:  'Duplicate',
        }).then((name) => {
            if (!name) return;
            (this.runtime?.bus as any)?.executeCommand('viewTemplate.create', {
                id:           crypto.randomUUID(),
                name,
                discipline:   tpl.discipline,
                description:  tpl.description,
                lockedFields: tpl.lockedFields ? [...tpl.lockedFields] : [],
            });
        });
    }

    private _deleteTemplate(templateId: string): void {
        const vts = window.viewTemplateStore; // TODO(F.6.x): legacy viewTemplateStore — replace with runtime.viewRegistry templates
        const tpl = vts?.get?.(templateId);
        if (!tpl) return;
        this._showConfirmModal({
            title:       'Delete View Template',
            message:     `Delete "${tpl.name}"? This cannot be undone if views still use it.`,
            confirmText: 'Delete',
            danger:      true,
        }).then((confirmed) => {
            if (!confirmed) return;
            const bus = (this.runtime?.bus as any);
            if (!bus) { this._showToast('Runtime bus not available — reload the app.', 'error'); return; }
            bus.executeCommand('viewTemplate.delete', { templateId })
                .then(() => { this._selectedTemplateId = null; })
                .catch((e: any) => {
                    this._showToast(e?.message ?? 'Cannot delete template — check that no views use it.', 'error');
                });
        });
    }

    private _execUpdateTemplate(templateId: string, patch: Record<string, any>): void {
        (this.runtime?.bus as any)?.executeCommand('viewTemplate.update', { templateId, patch });
    }

    private _refresh(): void {
        if (!this._listView) return;
        this._renderList();
    }

    private _btnStyle(variant: 'default' | 'danger' = 'default'): string {
        const bg = variant === 'danger'
            ? 'background:transparent;border:1px solid var(--app-status-error,#ef4444);color:var(--app-status-error,#ef4444);'
            : 'background:var(--app-panel-bg,#ffffff);border:1px solid var(--app-border,#dde3f0);color:var(--app-text-2,#5a6a85);';
        return `${bg}border-radius:4px;padding:3px 9px;cursor:pointer;font-size:0.72rem;font-family:inherit;`;
    }
}
