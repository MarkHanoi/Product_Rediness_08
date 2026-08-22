/**
 * VisibilityIntentManagerPanel — the rail panel the founder sees as **VISIBILITY INTENT**.
 *
 * §RENAME-VIEW-TEMPLATES-TO-VISIBILITY-INTENT (L-5060, lane ANNO15, founder 2026-08-22)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ⭐ THE RENAME WAS NOT THE FIX. THE STORE WAS.
 *
 * This panel was `ViewTemplateManagerPanel`. It read `viewTemplateStore`, which has
 * carried `@deprecated` in its own header since **2026-04-26**:
 *
 *   > "View Templates have been absorbed into VisibilityIntent.viewSeed.
 *   >  NEW CODE MUST NOT WRITE TO THIS STORE."
 *
 * The panel wrote to it anyway — `_ensureDefaultTemplates()` dispatched twelve
 * `viewTemplate.create` calls on first open. Those twelve rows are what the founder
 * saw (3D View, Floor Plan, Section, …), and every one of them read **VIEWS 0**.
 *
 * ⭐ **VIEWS 0 WAS NOT A BROKEN COUNT AND IT WAS NOT "NOTHING ASSIGNED YET".**
 * It was **STRUCTURALLY UNREACHABLE**, and the distinction is the whole finding
 * (C01 §6 rule 6 — ABSENT and UNREACHABLE have opposite fixes):
 *
 *   · The count read `viewDefinitionStore.getAll().filter(v => v.viewTemplateId === tpl.id)`.
 *   · The ONLY writers of `view.viewTemplateId` are `SetViewTemplateCommand` and
 *     `AssignViewTemplateToViewCommand` (`packages/command-registry/src/views/`).
 *   · Measured 2026-08-22 — `grep -rn 'AssignViewTemplateToViewCommand|SetViewTemplateCommand'
 *     --include=*.ts apps packages plugins src` → hits ONLY inside those two command files
 *     and the two barrels that re-export them. **ZERO production callers. No bus verb.**
 *
 * So no view could ever be bound to a template, and the column could never read
 * anything but 0. A panel of twelve rows all reading zero was telling the truth about
 * a model the architecture retired sixteen weeks earlier.
 *
 * ─── ONE CONCEPT, NOT TWO (the question this panel had to answer first) ──────
 *
 * "View template" and "visibility intent" are **THE SAME DOMAIN CONCEPT**. This is
 * not a judgement made here; it was ratified and is CANONICAL:
 *
 *   · [C09 §4.5](../../../../../docs/02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md)
 *     — "Visibility intents replace Revit-style view templates."
 *   · `VisibilityIntent.viewSeed` (`VisibilityIntentTypes.ts:537`) — "Replaces the legacy
 *     ViewTemplate concept (ViewTemplateStore is now `@deprecated readable`)."
 *   · `ViewTemplateToIntentMigration.ts` already folds every legacy template into an
 *     intent's `viewSeed` at project load, and re-binds the views.
 *
 * **A TEMPLATE IS A KIND OF INTENT** — specifically, an intent that carries a
 * `viewSeed`. That is why this panel lists intents and badges the seed-carrying ones,
 * rather than keeping two lists side by side.
 *
 * ─── What this panel now reads (all four are the LIVE stores) ────────────────
 *
 *   · `visibilityIntentStore`   — the intents themselves (5 system + N user).
 *   · `viewIntentInstanceStore` — the REAL view↔intent binding, via `intentUsageCount()`.
 *   · `viewTemplateStore`       — READ ONLY, and only to surface legacy rows that the
 *                                 migration has not absorbed. It is never written.
 *
 * ⚠ THE FILE WAS RENAMED; `tools/ga-gate/xss-sink-baseline.json` was keyed on the old
 * path and its entry is REMOVED rather than re-keyed, because this rewrite carries no
 * unguarded `innerHTML` interpolation at all — every dynamic value goes through
 * `textContent`. A new file with findings would exit 3 on that gate; a new file with
 * none needs no entry.
 *
 * Contract compliance:
 *   C09 §4.5 — intents replace view templates; this panel is the intent surface
 *   C09 §4.2 — intent is a DOMAIN concept; the panel is a PROJECTION, never an authority
 *   C82      — a rendered control is WIRED, or it is DISABLED WITH ITS REASON NAMED
 *   §01 §2   — all mutations via the command bus; zero direct store writes
 *   §05 §6   — zero bim-* elements; native HTML only
 *   §05 §2.3 Rule 8 — no window.prompt / confirm / alert
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import {
    visibilityIntentStore,
    intentUsageCount,
} from '@pryzm/core-app-model/presentation';
import { cloneDefaultElementGraphicsRules } from '@pryzm/core-app-model/presentation';
import { CURRENT_INTENT_SCHEMA_VERSION } from '@pryzm/core-app-model/presentation';
import type { VisibilityIntent } from '@pryzm/core-app-model/presentation';

export class VisibilityIntentManagerPanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    // §VIEW-TEMPLATE-PANEL-DISPATCH-IS-DEAD (L-1892) — ProjectBrowserPanel.ts:172
    // constructed this bare while its six sibling rail panels all forwarded
    // `this.runtime`, so `viewTemplate.create` / `viewTemplate.update` and the
    // defaults seeding dispatched into `undefined`. The class contained its own
    // evidence that this was known: `_execDeleteTemplate` is the ONE method that
    // guards on a missing bus and tells the user, three lines from siblings that
    // fail silently. The `window.runtime` fallback below kills the CLASS rather
    // than this instance — a future caller that forgets cannot re-kill it.
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime ?? window.runtime ?? null;
    }

    private _root: HTMLElement | null          = null;
    private _selectedIntentId: string | null   = null;
    private _detailView: HTMLElement | null    = null;
    private _listView: HTMLElement | null      = null;

    build(): HTMLElement {
        if (!this._root) {
            this._root = document.createElement('div');
            this._root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
            this._renderRoot();
            // Intent store events (the live model).
            window.addEventListener('vi:intent-created',   () => this._refresh());
            window.addEventListener('vi:intent-updated',   () => this._refresh());
            window.addEventListener('vi:intent-deleted',   () => this._refresh());
            window.addEventListener('vi:instance-updated', () => this._refresh());
            window.addEventListener('vi:instance-created', () => this._refresh());
            window.addEventListener('vi:instance-deleted', () => this._refresh());
            // Legacy template events — kept ONLY so the unmigrated-legacy group
            // below stays honest if a legacy path still writes. Never a source.
            window.addEventListener('vt:template-deleted', () => this._refresh());
            window.addEventListener('vt:store-loaded',     () => this._refresh());
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
        title.textContent   = 'Visibility Intent';
        header.appendChild(title);

        const newBtn = document.createElement('button');
        newBtn.textContent   = '+ New';
        newBtn.title         = 'Create a new Visibility Intent';
        newBtn.style.cssText = 'background:var(--app-gradient,linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%));color:#fff;border:none;border-radius:4px;padding:3px 9px;cursor:pointer;font-size:0.72rem;font-weight:600;font-family:inherit;';
        newBtn.onclick       = () => this._createIntent();
        header.appendChild(newBtn);

        this._root.appendChild(header);

        // WRAPPING, deliberately. A `text-overflow:ellipsis` destroyed a
        // user-facing disclosure elsewhere in this app on 2026-08-22; this line
        // is the panel's own explanation of what it governs and MUST be readable
        // in full at every rail width.
        const blurb = document.createElement('div');
        blurb.style.cssText = [
            'padding:6px 12px 8px;',
            'font-size:0.68rem;line-height:1.45;',
            'color:var(--app-text-muted,#7a8aaa);',
            'white-space:normal;overflow-wrap:anywhere;',
            'border-bottom:1px solid var(--app-border,#dde3f0);',
        ].join('');
        blurb.textContent =
            'An intent governs how every element is drawn in the views bound to it. '
            + 'VIEWS counts the views actually bound (ViewIntentInstanceStore). '
            + 'Bind the open view from its header picker, "GOVERNS THIS VIEW".';
        this._root.appendChild(blurb);

        // List view (scrollable)
        this._listView = document.createElement('div');
        this._listView.style.cssText = 'flex:1;overflow-y:auto;';
        this._root.appendChild(this._listView);

        // Detail panel (hidden until Open)
        this._detailView = document.createElement('div');
        this._detailView.style.cssText = 'display:none;flex-direction:column;flex:1;overflow:hidden;';
        this._root.appendChild(this._detailView);

        this._renderList();
    }

    // ─── List rendering ───────────────────────────────────────────────────────

    /**
     * §RENAME-VIEW-TEMPLATES-TO-VISIBILITY-INTENT — the seeding block that used to
     * live here is DELETED, not moved.
     *
     * It dispatched twelve `viewTemplate.create` calls into a store whose own header
     * says NEW CODE MUST NOT WRITE TO THIS STORE, and the rows it minted could never
     * acquire a view (see the file header). `visibilityIntentStore` needs no seeding:
     * its constructor loads the five SYSTEM intents from `SystemIntents.ts`, so this
     * list is never empty and never has to invent its own contents.
     */
    private _renderList(): void {
        const listView = this._listView;
        if (!listView) return;
        listView.innerHTML = '';

        const intents: VisibilityIntent[] = visibilityIntentStore.getAll();

        listView.appendChild(this._buildColumnHeader());

        for (const intent of intents) {
            listView.appendChild(this._buildIntentRow(intent));
        }

        const legacy = this._unmigratedLegacyTemplates();
        if (legacy.length > 0) {
            listView.appendChild(this._buildLegacyGroup(legacy));
        }
    }

    private _buildColumnHeader(): HTMLElement {
        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:grid;grid-template-columns:1fr 54px 80px 64px;gap:0;padding:4px 10px;font-size:0.68rem;font-weight:700;color:var(--app-text-muted,#7a8aaa);border-bottom:1px solid var(--app-border,#dde3f0);text-transform:uppercase;letter-spacing:0.05em;';
        const cells: ReadonlyArray<readonly [string, string]> = [
            ['Intent', 'left'], ['Views', 'center'], ['Kind', 'left'], ['Actions', 'right'],
        ];
        for (const [text, align] of cells) {
            const cell = document.createElement('span');
            cell.style.textAlign = align;
            cell.textContent     = text;
            hdr.appendChild(cell);
        }
        return hdr;
    }

    private _buildIntentRow(intent: VisibilityIntent): HTMLElement {
        const usage = intentUsageCount(intent.id);

        const row = document.createElement('div');
        row.style.cssText = [
            'padding:5px 8px 5px 10px;',
            'cursor:pointer;',
            'border-bottom:1px solid var(--app-border,#dde3f0);',
            'font-size:0.76rem;',
            'transition:background 0.1s;',
            'position:relative;',
        ].join('');
        row.style.background = this._selectedIntentId === intent.id
            ? 'var(--app-violet-soft,rgba(102,0,255,0.08))'
            : 'transparent';

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:1fr 54px 80px 64px;gap:0;align-items:center;';

        // Name + description
        const nameWrap = document.createElement('div');
        nameWrap.style.cssText = 'display:flex;flex-direction:column;gap:1px;overflow:hidden;';

        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--app-text,#1a2035);font-weight:500;';
        nameEl.textContent   = intent.name;
        nameEl.title         = intent.description || intent.name;
        nameWrap.appendChild(nameEl);

        // View count - the REAL number, from viewIntentInstanceStore.
        const countEl = document.createElement('div');
        countEl.style.cssText = 'text-align:center;color:var(--app-text-muted,#7a8aaa);';
        countEl.textContent   = String(usage.count);
        countEl.title         = usage.count === 0
            ? 'No view is bound to this intent yet.'
            : `Bound views: ${usage.viewIds.join(', ')}`;

        // Kind - SYSTEM / USER, plus SEED when the intent carries a viewSeed
        // (a viewSeed-carrying intent IS what "view template" used to mean).
        const kindEl = document.createElement('div');
        kindEl.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:0.6rem;font-weight:700;letter-spacing:0.04em;overflow:hidden;';
        kindEl.appendChild(this._badge(intent.isSystem ? 'SYSTEM' : 'USER', intent.isSystem));
        if (intent.viewSeed) {
            const seed = this._badge('SEED', false);
            seed.title = 'Carries a viewSeed - this intent doubles as a view recipe (C09 4.5: intents replace view templates).';
            kindEl.appendChild(seed);
        }

        const actionsEl = document.createElement('div');
        actionsEl.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:2px;opacity:0;transition:opacity 0.15s;';

        const openIco = this._iconBtn('M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'Open intent', () => this._openDetail(intent.id));
        const dupIco  = this._iconBtn('M4 4h8v8H4z M6 2h8v8', 'Duplicate intent', () => this._duplicateIntent(intent.id));
        // C82 - a control is WIRED, or DISABLED WITH ITS REASON NAMED. There is
        // no `vg.deleteVisibilityIntent` bus verb: `DeleteVisibilityIntentCommand`
        // exists in packages/command-registry/src/vg/ and is registered NOWHERE
        // (measured 2026-08-22, L-5062). This is UNREACHABLE, not ABSENT - the fix
        // is a handler row in initBusHandlers.ts, not a new command.
        const delIco  = this._iconBtn('M3 6h10 M8 6v7 M5 6l1-3h4l1 3 M6 9l.5 4 M10 9l-.5 4', 'Delete intent', () => undefined, 'danger');
        (delIco as HTMLButtonElement).disabled = true;
        delIco.style.opacity = '0.4';
        delIco.style.cursor  = 'not-allowed';
        delIco.title = intent.isSystem
            ? 'System intents are fixture-defined and cannot be deleted (VisibilityIntentStore.delete refuses).'
            : 'Delete is UNREACHABLE: DeleteVisibilityIntentCommand exists but no bus verb registers it (L-5062).';

        actionsEl.append(openIco, dupIco, delIco);

        row.onmouseenter = () => {
            if (this._selectedIntentId !== intent.id) row.style.background = 'var(--app-violet-soft,rgba(102,0,255,0.05))';
            actionsEl.style.opacity = '1';
        };
        row.onmouseleave = () => {
            row.style.background = this._selectedIntentId === intent.id
                ? 'var(--app-violet-soft,rgba(102,0,255,0.08))'
                : 'transparent';
            actionsEl.style.opacity = '0';
        };
        row.onclick    = () => { this._selectedIntentId = intent.id; this._renderList(); };
        row.ondblclick = () => this._openDetail(intent.id);

        grid.append(nameWrap, countEl, kindEl, actionsEl);
        row.appendChild(grid);
        return row;
    }

    private _badge(text: string, accent: boolean): HTMLElement {
        const el = document.createElement('span');
        el.style.cssText = [
            'display:inline-block;padding:1px 5px;border-radius:3px;',
            accent
                ? 'background:var(--app-violet-soft,rgba(102,0,255,0.12));color:var(--app-accent,#6600FF);'
                : 'background:var(--app-bg,#e8edf6);color:var(--app-text-2,#5a6a85);',
        ].join('');
        el.textContent = text;
        return el;
    }

    // ─── Legacy view templates (READ ONLY, never written) ─────────────────────

    /**
     * Legacy `viewTemplateStore` rows with no corresponding `migrated-vt-<id>`
     * intent. `ViewTemplateToIntentMigration` runs at PROJECT LOAD and skips
     * wholesale once any `migrated-vt-*` intent exists, so a template written
     * after load is never absorbed. Surfaced rather than hidden: silently
     * dropping a row the user authored is the worse failure.
     */
    private _unmigratedLegacyTemplates(): Array<{ id: string; name: string }> {
        const vts = window.viewTemplateStore; // read-only; @deprecated store, never written from here
        const all: Array<{ id?: string; name?: string }> = vts?.getAll?.() ?? [];
        const out: Array<{ id: string; name: string }> = [];
        for (const t of all) {
            if (!t?.id || !t?.name) continue;
            if (visibilityIntentStore.has(`migrated-vt-${t.id}`)) continue;
            out.push({ id: t.id, name: t.name });
        }
        return out;
    }

    private _buildLegacyGroup(legacy: Array<{ id: string; name: string }>): HTMLElement {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'border-top:2px solid var(--app-border,#dde3f0);margin-top:6px;';

        const hdr = document.createElement('div');
        hdr.style.cssText = 'padding:8px 10px 3px;font-size:0.66rem;font-weight:700;color:var(--app-text-muted,#7a8aaa);text-transform:uppercase;letter-spacing:0.05em;';
        hdr.textContent = `Legacy view templates (${legacy.length})`;
        wrap.appendChild(hdr);

        const note = document.createElement('div');
        note.style.cssText = 'padding:0 10px 6px;font-size:0.66rem;line-height:1.45;color:var(--app-text-muted,#7a8aaa);white-space:normal;overflow-wrap:anywhere;';
        note.textContent =
            'Not yet absorbed into an intent. The template model was retired on 2026-04-26 '
            + '(C09 4.5); these are folded into intents at the next project load. They govern nothing today.';
        wrap.appendChild(note);

        for (const t of legacy) {
            const row = document.createElement('div');
            row.style.cssText = 'padding:4px 10px;font-size:0.74rem;color:var(--app-text-muted,#7a8aaa);border-bottom:1px solid var(--app-border,#dde3f0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            row.textContent = t.name;
            row.title       = t.id;
            wrap.appendChild(row);
        }
        return wrap;
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
        // Built with createElementNS, NOT innerHTML. `pathD` is a module-private
        // literal today, but `tools/ga-gate/check-xss-guards.ts` flags the
        // interpolation regardless of provenance and it is right to: the guard is
        // the shape of the sink, not the trustworthiness of today's caller. This
        // file therefore carries ZERO unguarded sinks and needs no baseline entry.
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width', '13');
        svg.setAttribute('height', '13');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.8');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', pathD);
        svg.appendChild(path);
        btn.appendChild(svg);
        btn.onmouseenter = () => {
            if ((btn as HTMLButtonElement).disabled) return;
            btn.style.background = variant === 'danger' ? 'rgba(239,68,68,0.1)' : 'var(--app-violet-soft,rgba(102,0,255,0.08))';
            if (variant !== 'danger') btn.style.color = 'var(--app-accent,#6600FF)';
        };
        btn.onmouseleave = () => {
            btn.style.background = 'none';
            btn.style.color = color;
        };
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if ((btn as HTMLButtonElement).disabled) return;
            onClick();
        });
        return btn;
    }

    // ─── Detail view ──────────────────────────────────────────────────────────

    private _openDetail(intentId: string): void {
        const intent = visibilityIntentStore.get(intentId);
        if (!intent || !this._detailView || !this._listView || !this._root) return;

        this._listView.style.display   = 'none';
        this._detailView.style.display = 'flex';
        this._detailView.innerHTML     = '';

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
        dTitle.textContent   = intent.name;

        dHdr.append(backBtn, dTitle);
        this._detailView.appendChild(dHdr);

        if (intent.isSystem) {
            // A system intent is fixture-defined: VisibilityIntentStore.update()
            // refuses it. Say so instead of rendering inputs that discard input.
            const ro = document.createElement('div');
            ro.style.cssText = 'padding:10px 12px;font-size:0.72rem;line-height:1.45;color:var(--app-text-muted,#7a8aaa);white-space:normal;overflow-wrap:anywhere;border-bottom:1px solid var(--app-border,#dde3f0);';
            ro.textContent =
                'System intent - read only. It is defined in SystemIntents.ts and the store refuses '
                + 'writes to it. Duplicate it to author your own version.';
            this._detailView.appendChild(ro);
        } else {
            this._detailView.appendChild(this._buildDetailField('Name', intent.name, (val) => {
                this._execUpdateIntent(intentId, { name: val });
            }));
            this._detailView.appendChild(this._buildDetailField('Description', intent.description ?? '', (val) => {
                this._execUpdateIntent(intentId, { description: val });
            }));
        }

        // Usage - the honest binding report.
        const usage  = intentUsageCount(intentId);
        const useSec = document.createElement('div');
        useSec.style.cssText = 'padding:8px 12px;border-top:1px solid var(--app-border,#dde3f0);font-size:0.72rem;color:var(--app-text-2,#5a6a85);white-space:normal;overflow-wrap:anywhere;line-height:1.45;';
        useSec.textContent = usage.count === 0
            ? 'No view is bound to this intent. Bind one from the view header picker ("GOVERNS THIS VIEW").'
            : `Bound to ${usage.count} view${usage.count === 1 ? '' : 's'}: ${usage.viewIds.join(', ')}`;
        this._detailView.appendChild(useSec);

        // View seed - the absorbed "view template" half.
        const seedSec = document.createElement('div');
        seedSec.style.cssText = 'padding:8px 12px;border-top:1px solid var(--app-border,#dde3f0);font-size:0.72rem;color:var(--app-text-2,#5a6a85);white-space:normal;overflow-wrap:anywhere;line-height:1.45;';
        const seed = intent.viewSeed;
        seedSec.textContent = seed
            ? `View seed: ${[seed.discipline, seed.purpose].filter(Boolean).join(' · ') || 'present'} - this intent also acts as a view recipe.`
            : 'No view seed. This intent governs appearance only; it does not seed new views.';
        this._detailView.appendChild(seedSec);

        // NOT MEASURED HERE: the element-rule / modifier editor is the separate
        // VisibilityIntentPanel (apps/editor/src/ui/VisibilityIntentPanel.ts). This
        // rail panel is the INDEX, not the rule editor. L-5063 tracks linking them.
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
                // §PANEL-BACKDROP-UNIFY — shared scrim (was rgba(10,12,28,0.55)+blur3).
                'background:var(--pryzm-panel-backdrop);backdrop-filter:var(--pryzm-panel-backdrop-blur);-webkit-backdrop-filter:var(--pryzm-panel-backdrop-blur);',
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
            getFrameScheduler().scheduleOnce('visibility-intent-rename-focus', () => { inp.focus(); inp.select(); });
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

    /**
     * Builds the minimum legal `VisibilityIntent` payload for
     * `vg.createVisibilityIntent`.
     *
     * The bus handler forwards the WHOLE command object to
     * `new CreateVisibilityIntentCommand(cmd)`, whose `canExecute` refuses a
     * missing id, a missing name, `isSystem: true`, and a duplicate id
     * (`packages/command-registry/src/vg/CreateVisibilityIntentCommand.ts:17-21`).
     * Element rules come from `cloneDefaultElementGraphicsRules()` so a fresh
     * intent resolves exactly like the shipped default rather than rendering
     * nothing.
     */
    private _newIntentPayload(name: string, from?: VisibilityIntent): VisibilityIntent {
        const nowIso = new Date().toISOString();
        return {
            id:                crypto.randomUUID(),
            schemaVersion:     CURRENT_INTENT_SCHEMA_VERSION,
            name,
            description:       from?.description ?? '',
            version:           1,
            isSystem:          false,
            createdAt:         nowIso,
            updatedAt:         nowIso,
            elementRules:      from
                ? JSON.parse(JSON.stringify(from.elementRules))
                : cloneDefaultElementGraphicsRules(),
            viewTypeModifiers: from ? JSON.parse(JSON.stringify(from.viewTypeModifiers ?? [])) : [],
            ...(from?.viewTypeProfiles ? { viewTypeProfiles: JSON.parse(JSON.stringify(from.viewTypeProfiles)) } : {}),
            ...(from?.purposeModifiers ? { purposeModifiers: JSON.parse(JSON.stringify(from.purposeModifiers)) } : {}),
            ...(from?.planViewRange    ? { planViewRange:    JSON.parse(JSON.stringify(from.planViewRange))    } : {}),
            ...(from?.documentation    ? { documentation:    JSON.parse(JSON.stringify(from.documentation))    } : {}),
            ...(from?.viewSeed         ? { viewSeed:         JSON.parse(JSON.stringify(from.viewSeed))         } : {}),
        };
    }

    private _createIntent(): void {
        this._showNameModal({
            title:       'New Visibility Intent',
            label:       'Intent name',
            confirmText: 'Create',
        }).then((name) => {
            if (!name) return;
            this._dispatch('vg.createVisibilityIntent', this._newIntentPayload(name));
        });
    }

    private _duplicateIntent(intentId: string): void {
        const intent = visibilityIntentStore.get(intentId);
        if (!intent) return;
        this._showNameModal({
            title:        'Duplicate Intent',
            label:        'New name',
            defaultValue: `${intent.name} (copy)`,
            confirmText:  'Duplicate',
        }).then((name) => {
            if (!name) return;
            this._dispatch('vg.createVisibilityIntent', this._newIntentPayload(name, intent));
        });
    }

    private _execUpdateIntent(intentId: string, patch: Record<string, unknown>): void {
        this._dispatch('vg.updateVisibilityIntent', { intentId, patch });
    }

    /**
     * §L-1892 — this panel's ancestor dispatched into `undefined` for months because
     * `ProjectBrowserPanel` constructed it without a runtime. The bus is checked and
     * the failure is SAID, never swallowed: a silent no-op here is indistinguishable
     * from a successful write, which is the defect class this repo keeps paying for.
     */
    private _dispatch(verb: string, payload: object): void {
        const bus = this.runtime?.bus as { executeCommand?: (t: string, p: unknown) => Promise<unknown> } | undefined;
        if (!bus?.executeCommand) {
            this._showToast('Runtime bus not available - reload the app.', 'error');
            console.error(`[VisibilityIntentManagerPanel] ${verb} NOT dispatched - no runtime bus.`);
            return;
        }
        void Promise.resolve(bus.executeCommand(verb, payload)).catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : String(e);
            this._showToast(msg || `${verb} failed.`, 'error');
        });
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
