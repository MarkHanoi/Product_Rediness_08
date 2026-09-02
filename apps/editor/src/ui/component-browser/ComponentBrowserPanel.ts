/**
 * ComponentBrowserPanel — Lane U1 (§COMPONENT-BROWSER) · UIUX-PLAN §U1 ·
 * ADR-0376 D5/D9/D10 · C111 §3.1 · C16 CA-18 · spec §59/§63/§75.
 *
 * The COMPONENT BROWSER: the panel that lists the project's loaded component
 * definitions (name, provenance chip, types) and hands the chosen
 * `(definitionId, typeId)` pair to the place tool. It replaces the
 * "Generic Component" → `familyCreatorPlaceholder` console-log dead end on BOTH
 * create surfaces (`CreatePanelLayout` + `CreateRailPanel` — L-1380).
 *
 * ─── DATA: THE ONE CATALOGUE, NEVER A COPY (C84 EI-9 · lane U0 §3) ────────────
 * Rows come from `componentCatalog.list()` — the U0 seam PluginRegistry injects
 * into the `component.*` handlers and contributes to the BOOTSTRAP result's
 * `auxiliaries` bag. ⚠ Measured 2026-09-02: `composeRuntime()`'s returned
 * runtime carries NO `auxiliaries` key (the bag stays on the bootstrap result),
 * so the probe below is future-proofing and the process-default import is the
 * live path — the SAME instance either way. The panel holds NO copy: every
 * render re-reads `list()`, and `subscribe()` re-renders on register/remove/
 * clear.
 *
 * ─── ⭐ HONEST EMPTY STATE ([[context-data-honesty-family]]) ───────────────────
 * `list() === []` is an ANSWER: "No Component definitions are loaded in this
 * project" plus the live affordance (the file-open leg the catalogue ships,
 * C111 §3.1 — there is no corpus, so loading is explicit). A failed LOAD is a
 * typed refusal rendered verbatim beside the affordance — the loader's own
 * sentence, never a silent no-op (spec §75).
 *
 * ─── D5 — every user-facing string says Component, never Family ───────────────
 * The FILE FORMAT keeps its frozen name (`.pryzm-family` in the file-picker
 * accept attribute — a wire name, not copy); everything a person reads says
 * Component.
 */

import { trace } from '@opentelemetry/api';
import {
    componentCatalog as defaultCatalog,
    type ComponentCatalog,
} from '../../services/componentCatalog/index.js';
import { armComponentPlaceTool } from './componentPlaceTool';
// Lane U3 — the definition-editor workspace, opened from this browser's
// "Edit definition…" entry (UIUX-PLAN §U3's acceptance names this exact seam).
// Static import is safe: the workspace keeps `@pryzm/file-format` LAZY (the U0
// §5-D2 pdfjs/DOMMatrix lesson), so nothing heavy lands on this panel's graph.
import { openComponentDefinitionWorkspace } from '../component-editor-workspace/index.js';

const _tracer = trace.getTracer('@pryzm/editor.component-browser', '0.1.0');

const PANEL_ID = 'pryzm-component-browser';

/** The provenance chip copy — the catalogue's recorded fact, worded for people. */
const PROVENANCE_LABEL: Record<string, string> = {
    project: 'Project',
    marketplace: 'Marketplace',
    builtin: 'Built-in',
};

type CatalogView = ReturnType<ComponentCatalog['list']>[number];

function resolveCatalog(explicit?: ComponentCatalog): ComponentCatalog {
    if (explicit) return explicit;
    const aux = (window as {
        runtime?: { auxiliaries?: { componentCatalog?: ComponentCatalog } };
    }).runtime?.auxiliaries?.componentCatalog;
    return aux ?? defaultCatalog;
}

export interface ComponentBrowserOptions {
    /** Test seam — production uses the runtime's advertised catalogue. */
    readonly catalog?: ComponentCatalog;
}

export class ComponentBrowserPanel {
    private readonly catalog: ComponentCatalog;
    private overlay: HTMLElement | null = null;
    private listEl: HTMLElement | null = null;
    private statusEl: HTMLElement | null = null;
    private unsubscribe: (() => void) | null = null;
    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') this.close();
    };

    constructor(opts: ComponentBrowserOptions = {}) {
        this.catalog = resolveCatalog(opts.catalog);
    }

    isOpen(): boolean {
        return this.overlay !== null && this.overlay.isConnected;
    }

    open(): void {
        _tracer.startActiveSpan('pryzm.component_browser.open', (span) => {
            try {
                if (this.isOpen()) return;
                this._mount();
                this._renderList();
                this.unsubscribe = this.catalog.subscribe(() => this._renderList());
                document.addEventListener('keydown', this.onKeyDown);
            } finally {
                span.end();
            }
        });
    }

    close(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
        document.removeEventListener('keydown', this.onKeyDown);
        this.overlay?.remove();
        this.overlay = null;
        this.listEl = null;
        this.statusEl = null;
    }

    // ── DOM ───────────────────────────────────────────────────────────────────

    private _mount(): void {
        const overlay = document.createElement('div');
        overlay.id = PANEL_ID;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', `${PANEL_ID}-title`);
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:10000',
            'display:flex', 'align-items:center', 'justify-content:center',
            'background:var(--pryzm-panel-backdrop, rgba(15,15,30,0.55))',
            'font-family:system-ui,sans-serif',
        ].join(';');
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });

        const card = document.createElement('div');
        card.style.cssText = [
            'width:min(560px, calc(100% - 48px))', 'max-height:min(640px, calc(100% - 48px))',
            'display:flex', 'flex-direction:column',
            'background:#fff', 'color:#1a1a2e',
            'border-radius:12px', 'padding:24px',
            'box-shadow:0 24px 64px rgba(0,0,0,0.35)',
        ].join(';');

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:0 0 12px';
        const title = document.createElement('h2');
        title.id = `${PANEL_ID}-title`;
        title.textContent = 'Components';
        title.style.cssText = 'margin:0;font-size:20px;color:#6600FF';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('data-component-browser-close', '');
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.style.cssText =
            'background:none;border:none;font-size:22px;line-height:1;cursor:pointer;color:#555;padding:4px 8px';
        closeBtn.addEventListener('click', () => this.close());
        header.append(title, closeBtn);

        const list = document.createElement('div');
        list.setAttribute('data-component-browser-list', '');
        list.style.cssText = 'flex:1;overflow-y:auto;min-height:80px';

        const status = document.createElement('p');
        status.setAttribute('data-component-browser-status', '');
        status.setAttribute('role', 'status');
        status.style.cssText = 'margin:8px 0 0;font-size:12px;color:#b91c1c;min-height:1em;white-space:pre-wrap';

        const footer = document.createElement('div');
        footer.style.cssText = 'margin-top:16px;display:flex;gap:8px;align-items:center';

        // The file-open leg — the catalogue's own load affordance (lane U0 §1.1).
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        // ⚠ Wire name, not copy: the on-disk format keeps its frozen extension.
        fileInput.accept = '.pryzm-family';
        fileInput.style.display = 'none';
        fileInput.setAttribute('data-component-browser-file-input', '');
        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0];
            if (file) void this._loadFile(file);
            fileInput.value = '';
        });

        const loadBtn = document.createElement('button');
        loadBtn.type = 'button';
        loadBtn.setAttribute('data-component-browser-load', '');
        loadBtn.textContent = 'Load Component…';
        loadBtn.style.cssText = [
            'background:#6600FF', 'color:#fff', 'border:none',
            'padding:8px 16px', 'border-radius:6px',
            'font-weight:600', 'cursor:pointer', 'font-size:13px',
        ].join(';');
        loadBtn.addEventListener('click', () => fileInput.click());

        footer.append(loadBtn, fileInput);
        card.append(header, list, status, footer);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.listEl = list;
        this.statusEl = status;
    }

    private _renderList(): void {
        const list = this.listEl;
        if (!list) return;
        list.textContent = '';

        const views = this.catalog.list();
        if (views.length === 0) {
            // ⭐ The honest empty state — an answer, with the live route forward.
            const empty = document.createElement('p');
            empty.setAttribute('data-component-browser-empty', '');
            empty.style.cssText = 'margin:24px 0;color:#555;font-size:14px;line-height:1.5;text-align:center';
            empty.textContent =
                'No Component definitions are loaded in this project. ' +
                'Use “Load Component…” below to load one from a file.';
            list.appendChild(empty);
            return;
        }

        for (const view of views) list.appendChild(this._definitionCard(view));
    }

    private _definitionCard(view: CatalogView): HTMLElement {
        const card = document.createElement('div');
        card.setAttribute('data-component-browser-definition', view.definitionId);
        card.style.cssText =
            'border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:0 0 10px';

        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;gap:8px;margin:0 0 8px';

        const name = document.createElement('strong');
        name.setAttribute('data-component-browser-name', '');
        name.textContent = view.name;
        name.style.cssText = 'font-size:14px';

        const semver = document.createElement('span');
        semver.textContent = view.semver;
        semver.style.cssText = 'font-size:11px;color:#777';

        // Provenance chip — a recorded fact, never an authority ranking (U0).
        const chip = document.createElement('span');
        chip.setAttribute('data-component-browser-provenance', view.provenance);
        chip.textContent = PROVENANCE_LABEL[view.provenance] ?? view.provenance;
        chip.style.cssText = [
            'font-size:10px', 'font-weight:600', 'text-transform:uppercase',
            'letter-spacing:0.04em', 'color:#6600FF',
            'background:rgba(102,0,255,0.08)', 'border:1px solid rgba(102,0,255,0.25)',
            'border-radius:999px', 'padding:2px 8px', 'margin-left:auto',
        ].join(';');

        // Lane U3 — open the definition-editor workspace for this LOADED definition.
        // An unloaded definition (a race with remove()) refuses BY NAME into this
        // panel's own status line — never a silent no-op click (C16 CA-18).
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.setAttribute('data-component-browser-edit', view.definitionId);
        edit.textContent = 'Edit definition…';
        edit.style.cssText = [
            'background:#fff', 'color:#6600FF', 'border:1px solid rgba(102,0,255,0.4)',
            'padding:3px 10px', 'border-radius:6px',
            'font-weight:600', 'cursor:pointer', 'font-size:11px',
        ].join(';');
        edit.addEventListener('click', () => {
            const res = openComponentDefinitionWorkspace(view.definitionId);
            if (!res.ok) { this._status(res.refusal); return; }
            this._status('');
        });

        head.append(name, semver, edit, chip);
        card.appendChild(head);

        for (const t of view.types) {
            const row = document.createElement('div');
            row.setAttribute('data-component-browser-type', t.id);
            row.style.cssText =
                'display:flex;align-items:center;justify-content:space-between;padding:4px 0;gap:8px';

            const label = document.createElement('span');
            label.textContent = t.name;
            label.style.cssText = 'font-size:13px';

            const place = document.createElement('button');
            place.type = 'button';
            place.setAttribute('data-component-browser-place', `${view.definitionId}:${t.id}`);
            place.textContent = 'Place';
            place.style.cssText = [
                'background:#fff', 'color:#6600FF', 'border:1px solid #6600FF',
                'padding:4px 14px', 'border-radius:6px',
                'font-weight:600', 'cursor:pointer', 'font-size:12px',
            ].join(';');
            place.addEventListener('click', () => {
                const armed = armComponentPlaceTool({
                    definitionId: view.definitionId,
                    typeId: t.id,
                    definitionVersion: view.semver,
                    definitionName: view.name,
                    typeName: t.name,
                });
                // Close only when a plan surface took the tool; on refusal the
                // explain toast already fired and the browser stays put.
                if (armed) this.close();
            });

            row.append(label, place);
            card.appendChild(row);
        }

        return card;
    }

    // ── Load leg ──────────────────────────────────────────────────────────────

    private async _loadFile(file: File): Promise<void> {
        this._status('');
        const res = await this.catalog.loadFromFile(file);
        if (!res.ok) {
            // ⭐ The LOADER's named refusal, verbatim (U0 — this panel adds no
            // vocabulary of its own for load failures).
            this._status(res.message);
            return;
        }
        // subscribe() already re-rendered the list; the status line confirms.
        this._status('');
    }

    private _status(message: string): void {
        if (this.statusEl) this.statusEl.textContent = message;
    }
}

// ── The one production opener (both create surfaces route here) ──────────────

let _singleton: ComponentBrowserPanel | null = null;

/** Open the Components browser (idempotent — one panel, re-focused not stacked). */
export function openComponentBrowser(): ComponentBrowserPanel {
    if (_singleton?.isOpen()) return _singleton;
    _singleton = new ComponentBrowserPanel();
    _singleton.open();
    return _singleton;
}
