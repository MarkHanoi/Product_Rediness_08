/**
 * @file CatalogBrowserPanel.ts
 * @description Wave 14 — F.3.5 — runtime.persistence.client catalog-search wiring.
 *   Phase F stub: panel accepts runtime and calls runtime.persistence.client.listProjects
 *   as a placeholder for the catalog search endpoint (Phase F.3.5 wires the real
 *   catalog API once @pryzm/plugin-catalog ships).
 */

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

export class CatalogBrowserPanel {
    private readonly _runtime: Runtime | null;
    private _el: HTMLElement | null = null;

    constructor(runtime: Runtime | null = null) {
        this._runtime = runtime;
    }

    mount(container: HTMLElement): void {
        this._el = document.createElement('div');
        this._el.className = 'catalog-browser-panel';
        container.appendChild(this._el);
        void this._loadCatalog();
    }

    private async _loadCatalog(): Promise<void> {
        if (!this._runtime) return;
        // F.3.5 — runtime.persistence.client wiring (catalog search)
        // TODO(F.3.5): replace listProjects with real catalog search endpoint
        // once @pryzm/plugin-catalog ships.
        const projects = await this._runtime.persistence.client.list();
        console.debug('[CatalogBrowserPanel] catalog loaded, count:', (projects as unknown[]).length);
    }

    destroy(): void {
        this._el?.remove();
        this._el = null;
    }
}
