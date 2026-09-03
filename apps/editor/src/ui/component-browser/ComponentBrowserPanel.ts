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
    type CatalogFetch,
    type MarketplaceFamilyRow,
} from '../../services/componentCatalog/index.js';
import { armComponentPlaceTool } from './componentPlaceTool';
// Lane U-SEED — the from-zero authoring path, opened from this browser's "New
// Component" button. Static import is safe: it keeps `@pryzm/file-format` LAZY
// (the U0 §5-D2 pdfjs/DOMMatrix lesson), so nothing heavy lands on this graph.
import { openNewComponentWorkspace } from './newComponent';
// Lane U3 — the definition-editor workspace, opened from this browser's
// "Edit definition…" entry (UIUX-PLAN §U3's acceptance names this exact seam).
// Static import is safe: the workspace keeps `@pryzm/file-format` LAZY (the U0
// §5-D2 pdfjs/DOMMatrix lesson), so nothing heavy lands on this panel's graph.
import { openComponentDefinitionWorkspace } from '../component-editor-workspace/index.js';
// Lane U4 — the type catalog, opened from this browser's "Types…" entry
// (UIUX-PLAN §U4: "the browser's type sub-list refinement"). Static import is safe
// for the same reason the workspace is: the catalog keeps `@pryzm/file-format` LAZY.
import { openComponentTypeCatalog } from '../component-type-catalog/index.js';
// Lane U5 — static per-definition thumbnails drawn through the SHARED
// element-preview rig (never a context per card) and cached per
// `(schemaHash, typeId)`. The panel holds the rig for its open lifetime so a
// batch of cards costs one context, created lazily on the first actual draw.
import {
    getComponentThumbnail,
    holdComponentThumbnailRig,
} from '../component-preview/index.js';

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
    /** Test seam for the STARTER-LIBRARY leg (lane U-SEED). Production omits it,
     *  so the catalogue's same-origin `fetch` reaches the live marketplace
     *  (`GET /api/v1/families`); tests inject a fetch serving the seed bytes. */
    readonly starterFetch?: CatalogFetch;
}

export class ComponentBrowserPanel {
    private readonly catalog: ComponentCatalog;
    private readonly starterFetch: CatalogFetch | undefined;
    /** Starter-library offers discovered from the marketplace, minus any already
     *  loaded into the catalogue. Empty until `_refreshStarters()` resolves — so
     *  the honest empty state renders SYNCHRONOUSLY on open regardless. */
    private starterRows: readonly MarketplaceFamilyRow[] = [];
    private overlay: HTMLElement | null = null;
    private listEl: HTMLElement | null = null;
    private statusEl: HTMLElement | null = null;
    private unsubscribe: (() => void) | null = null;
    /** Lane U5 — releases the panel's hold on the shared preview rig. */
    private rigRelease: (() => void) | null = null;
    private readonly onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') this.close();
    };

    constructor(opts: ComponentBrowserOptions = {}) {
        this.catalog = resolveCatalog(opts.catalog);
        this.starterFetch = opts.starterFetch;
    }

    isOpen(): boolean {
        return this.overlay !== null && this.overlay.isConnected;
    }

    open(): void {
        _tracer.startActiveSpan('pryzm.component_browser.open', (span) => {
            try {
                if (this.isOpen()) return;
                this._mount();
                // Lane U5 — one rig hold for the panel's whole open lifetime, so
                // per-card thumbnail draws share one lazily-created context
                // instead of churning create/destroy per card.
                this.rigRelease = holdComponentThumbnailRig();
                this._renderList();
                this.unsubscribe = this.catalog.subscribe(() => this._renderList());
                document.addEventListener('keydown', this.onKeyDown);
                // ⭐ STARTER LIBRARY (lane U-SEED) — discover the app-shipped
                // starters async; the sync render above already stands, so a slow
                // or absent marketplace never delays the honest empty state.
                void this._refreshStarters();
            } finally {
                span.end();
            }
        });
    }

    close(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.rigRelease?.();
        this.rigRelease = null;
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
            'background:#fff', 'color:#6600FF', 'border:1px solid rgba(102,0,255,0.4)',
            'padding:8px 16px', 'border-radius:6px',
            'font-weight:600', 'cursor:pointer', 'font-size:13px',
        ].join(';');
        loadBtn.addEventListener('click', () => fileInput.click());

        // Lane U-SEED — the from-zero authoring path. Mints a minimal valid
        // Component and opens U3's workspace on it (never a silent no-op click).
        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.setAttribute('data-component-browser-new', '');
        newBtn.textContent = 'New Component';
        newBtn.style.cssText = [
            'background:#6600FF', 'color:#fff', 'border:none',
            'padding:8px 16px', 'border-radius:6px',
            'font-weight:600', 'cursor:pointer', 'font-size:13px',
        ].join(';');
        newBtn.addEventListener('click', () => void this._newComponent());

        footer.append(newBtn, loadBtn, fileInput);
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
        const loadedIds = new Set(views.map((v) => v.definitionId));

        if (views.length === 0) {
            // ⭐ The honest empty state — an answer, with the live routes forward.
            const empty = document.createElement('p');
            empty.setAttribute('data-component-browser-empty', '');
            empty.style.cssText = 'margin:24px 0 12px;color:#555;font-size:14px;line-height:1.5;text-align:center';
            empty.textContent =
                'No Component definitions are loaded in this project. ' +
                'Load one from the starter library below, open one from a file, or start a new one.';
            list.appendChild(empty);
        } else {
            for (const view of views) list.appendChild(this._definitionCard(view));
        }

        // ⭐ STARTER LIBRARY — the app-shipped Components a first-time user can
        // load with one click, minus any already in the catalogue.
        const offers = this.starterRows.filter((r) => !loadedIds.has(r.id));
        if (offers.length > 0) list.appendChild(this._starterSection(offers));
    }

    private _starterSection(offers: readonly MarketplaceFamilyRow[]): HTMLElement {
        const section = document.createElement('div');
        section.setAttribute('data-component-browser-starters', '');
        section.style.cssText = 'margin:8px 0 0;border-top:1px solid #eee;padding-top:12px';

        const heading = document.createElement('h3');
        heading.textContent = 'Starter Components';
        heading.style.cssText = 'margin:0 0 8px;font-size:13px;color:#333;font-weight:600';
        section.appendChild(heading);

        for (const offer of offers) {
            const row = document.createElement('div');
            row.setAttribute('data-component-browser-starter', offer.id);
            row.style.cssText =
                'display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f2f2f2';

            const name = document.createElement('span');
            name.setAttribute('data-component-browser-starter-name', '');
            name.textContent = offer.name;
            name.style.cssText = 'font-size:13px;font-weight:600';

            const category = document.createElement('span');
            category.textContent = offer.category;
            category.style.cssText = 'font-size:11px;color:#777';

            // Provenance chip — an OFFER not yet in the catalogue reads "Starter".
            const chip = document.createElement('span');
            chip.setAttribute('data-component-browser-starter-provenance', 'starter');
            chip.textContent = 'Starter';
            chip.style.cssText = [
                'font-size:10px', 'font-weight:600', 'text-transform:uppercase',
                'letter-spacing:0.04em', 'color:#6600FF',
                'background:rgba(102,0,255,0.08)', 'border:1px solid rgba(102,0,255,0.25)',
                'border-radius:999px', 'padding:2px 8px', 'margin-left:auto',
            ].join(';');

            const load = document.createElement('button');
            load.type = 'button';
            load.setAttribute('data-component-browser-starter-load', offer.id);
            load.textContent = 'Load';
            load.style.cssText = [
                'background:#6600FF', 'color:#fff', 'border:none',
                'padding:4px 14px', 'border-radius:6px',
                'font-weight:600', 'cursor:pointer', 'font-size:12px',
            ].join(';');
            load.addEventListener('click', () => void this._loadStarter(offer.id));

            row.append(name, category, chip, load);
            section.appendChild(row);
        }

        return section;
    }

    private _definitionCard(view: CatalogView): HTMLElement {
        const card = document.createElement('div');
        card.setAttribute('data-component-browser-definition', view.definitionId);
        card.style.cssText =
            'border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:0 0 10px;' +
            'display:flex;gap:10px;align-items:flex-start';

        // ── Lane U5 — the static 3-D thumbnail (cached per definition schemaHash
        // + type). Three honest states: the image, "cannot evaluate" (the
        // evaluator's own reason), and "cannot draw right now" — never a blank box
        // pretending to be a shape.
        const thumb = document.createElement('div');
        thumb.setAttribute('data-component-browser-thumb', view.definitionId);
        thumb.style.cssText =
            'width:56px;height:56px;flex:0 0 56px;border:1px solid #eee;border-radius:8px;' +
            'display:flex;align-items:center;justify-content:center;overflow:hidden;' +
            'background:linear-gradient(160deg,#ffffff 0%,#f6f4ff 100%);' +
            'font-size:9px;line-height:1.3;color:#888;text-align:center;padding:2px';
        thumb.textContent = '…';
        void this._fillThumbnail(thumb, view.definitionId);
        card.appendChild(thumb);

        const body = document.createElement('div');
        body.style.cssText = 'flex:1;min-width:0';
        card.appendChild(body);

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

        // Lane U4 — the TYPE CATALOG for this LOADED definition. An unloaded
        // definition (a race with remove()) refuses BY NAME into this panel's own
        // status line — never a silent no-op click (C16 CA-18).
        const types = document.createElement('button');
        types.type = 'button';
        types.setAttribute('data-component-browser-types', view.definitionId);
        types.textContent = 'Types…';
        types.style.cssText = [
            'background:#fff', 'color:#6600FF', 'border:1px solid rgba(102,0,255,0.4)',
            'padding:3px 10px', 'border-radius:6px',
            'font-weight:600', 'cursor:pointer', 'font-size:11px',
        ].join(';');
        types.addEventListener('click', () => {
            const res = openComponentTypeCatalog(view.definitionId);
            if (!res.ok) { this._status(res.refusal); return; }
            this._status('');
        });

        head.append(name, semver, edit, types, chip);
        body.appendChild(head);

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
            body.appendChild(row);
        }

        return card;
    }

    /**
     * Lane U5 — resolve and place one card's thumbnail. Async and card-local: a
     * slow bake never delays the list render, and a card unmounted by a re-render
     * (the subscribe loop) drops its result on the floor via `isConnected`.
     */
    private async _fillThumbnail(box: HTMLElement, definitionId: string): Promise<void> {
        const entry = this.catalog.entry(definitionId);
        if (entry === undefined) {
            box.textContent = 'not loaded';
            box.setAttribute('data-component-browser-thumb-state', 'not-loaded');
            return;
        }
        const typeId = entry.family.document.types[0]?.id ?? null;
        const res = await getComponentThumbnail({
            family: {
                manifest: entry.family.manifest,
                document: entry.family.document,
                schemaHash: entry.family.schemaHash,
            },
            typeId,
        });
        if (!box.isConnected) return;
        if (res.ok) {
            const img = document.createElement('img');
            img.src = res.url;
            img.alt = `3-D preview of ${entry.family.manifest.name}`;
            img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
            box.replaceChildren(img);
            box.setAttribute('data-component-browser-thumb-state', res.partial ? 'partial' : 'ok');
            if (res.partial) {
                box.title = 'Partial preview — this definition declares solid features the bake refused.';
            }
        } else {
            // The NAMED reason, compact on the card, full sentence on the title.
            box.textContent = 'no 3-D preview';
            box.title = res.message;
            box.setAttribute('data-component-browser-thumb-state', 'refused');
            box.setAttribute('data-component-browser-thumb-reason', res.reason);
        }
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

    // ── Starter library leg (lane U-SEED) ──────────────────────────────────────

    /** Discover the app-shipped starters via the ONE catalogue's marketplace
     *  browse leg. Failure is HONEST — no starters, the empty state stands — and
     *  is never allowed to break the panel. */
    private async _refreshStarters(): Promise<void> {
        try {
            const res = await this.catalog.listMarketplace(
                this.starterFetch ? { fetchImpl: this.starterFetch } : {},
            );
            if (!res.ok) return; // no live marketplace: the file-open / New paths stand
            this.starterRows = [...res.rows];
            this._renderList();
        } catch {
            // Starter discovery must never take the whole browser down.
        }
    }

    /** Load one starter through the marketplace download leg (provenance
     *  `'marketplace'`). subscribe() re-renders: the definition moves into the
     *  main list and its offer row disappears. A refusal renders verbatim. */
    private async _loadStarter(definitionId: string): Promise<void> {
        this._status('');
        const res = await this.catalog.loadFromMarketplace(
            definitionId,
            this.starterFetch ? { fetchImpl: this.starterFetch } : {},
        );
        if (!res.ok) {
            this._status(res.message);
            return;
        }
        this._status('');
    }

    // ── New Component leg (lane U-SEED) ─────────────────────────────────────────

    /** Mint a minimal valid Component and open U3's definition workspace on it.
     *  A mint/pack/load refusal renders verbatim in this panel's status line —
     *  never a silent no-op click (C16 CA-18). */
    private async _newComponent(): Promise<void> {
        this._status('');
        const res = await openNewComponentWorkspace(this.catalog);
        if (!res.ok) {
            this._status(res.refusal);
            return;
        }
        // The workspace mounts its own modal above this one; close the browser so
        // the author lands on the new definition without the list behind it.
        this.close();
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
