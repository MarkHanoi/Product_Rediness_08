// Phase A.6 close (2026-04-29) — toasts route through `this.runtime.toasts.show(...)`.
// Fallback to the package-owned DOM helper kicks in when `runtime` is null
// (panel was constructed by a legacy caller that hasn't been threaded yet).
import { showAppToast as _packageShowAppToast } from '@pryzm/runtime-composer/showAppToast';
import type { ToastKind } from '@pryzm/runtime-composer';

interface ImportedModelRow {
    modelId: string;
    name: string;
    fileName?: string;
    meshCount: number;
    triangleCount: number;
    totalSpaces: number;
    totalStoreys: number;
    totalRelationships: number;
    visible: boolean;
    convertedSourceVisible: boolean;
}

export class ImportedModelsPanel {
    private readonly root: HTMLElement;
    private readonly panel: HTMLElement;
    private readonly body: HTMLElement;
    private readonly badge: HTMLElement;
    private readonly models = new Map<string, ImportedModelRow>();
    private open = false;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    /**
     * Phase A.6 close — route toasts through `this.runtime.toasts.show(...)`,
     * with a fallback to the package-owned DOM helper for legacy callers
     * that pass `runtime: null`.
     */
    private _toast(message: string, kind: ToastKind = 'info', durationMs?: number): void {
        if (this.runtime) {
            this.runtime.toasts.show(message, kind, durationMs);
        } else {
            _packageShowAppToast(message, kind, durationMs);
        }
    }

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.root = document.createElement('div');
        this.root.className = 'iml-root';

        const toggle = document.createElement('button');
        toggle.className = 'iml-toggle';
        toggle.type = 'button';
        toggle.innerHTML = `<span>Import Models</span><strong>0</strong>`;
        this.badge = toggle.querySelector('strong') as HTMLElement;
        toggle.addEventListener('click', () => this.toggle());

        this.panel = document.createElement('section');
        this.panel.className = 'iml-panel';
        this.panel.style.display = 'none';
        this.panel.innerHTML = `
            <div class="iml-header">
                <div>
                    <div class="iml-title">Import Models</div>
                    <div class="iml-subtitle">Imported IFC geometry and semantic data</div>
                </div>
                <div class="iml-actions">
                    <button class="iml-secondary" type="button" data-action="import">Import IFC</button>
                    <button class="iml-close" type="button" aria-label="Close">×</button>
                </div>
            </div>
            <div class="iml-body"></div>
        `;
        this.body = this.panel.querySelector('.iml-body') as HTMLElement;

        this.panel.querySelector<HTMLElement>('[data-action="import"]')?.addEventListener('click', () => {
            window.runtime?.events?.emit('import-ifc', {});
        });
        this.panel.querySelector<HTMLElement>('.iml-close')?.addEventListener('click', () => this.close());

        this.root.appendChild(toggle);
        this.root.appendChild(this.panel);
        document.body.appendChild(this.root);

        window.runtime?.events?.on('pryzm-ifc-imported', (p: { modelId: string; modelName?: string; fileName?: string; geometry?: { meshCount: number; triangleCount: number; name?: string }; stats?: { totalSpaces: number; totalStoreys: number; totalRelationships: number; totalElements?: number }; relationships?: readonly unknown[] }) => this.handleImported(p)); // F.events.13
        window.addEventListener('pryzm-import-models-toggle', () => this.toggle(true));
        this.render();
    }

    toggle(forceOpen?: boolean): void {
        this.open = typeof forceOpen === 'boolean' ? forceOpen : !this.open;
        this.panel.style.display = this.open ? 'flex' : 'none';
    }

    close(): void {
        this.toggle(false);
    }

    private handleImported(detail: any): void {
        const geometry = detail?.geometry;
        const stats = detail?.stats ?? {};
        if (!detail?.modelId) return;

        this.models.set(detail.modelId, {
            modelId: detail.modelId,
            name: detail.modelName ?? geometry?.name ?? detail.fileName ?? 'Imported IFC',
            fileName: detail.fileName,
            meshCount: geometry?.meshCount ?? 0,
            triangleCount: geometry?.triangleCount ?? 0,
            totalSpaces: stats.totalSpaces ?? 0,
            totalStoreys: stats.totalStoreys ?? 0,
            totalRelationships: stats.totalRelationships ?? 0,
            visible: true,
            convertedSourceVisible: false,
        });

        this.open = true;
        this.panel.style.display = 'flex';
        this.render();
    }

    private render(): void {
        this.badge.textContent = String(this.models.size);
        this.body.innerHTML = '';

        if (this.models.size === 0) {
            const empty = document.createElement('div');
            empty.className = 'iml-empty';
            empty.innerHTML = `
                <div class="iml-empty-title">No IFC models imported yet</div>
                <div class="iml-empty-text">Use Import IFC to load model geometry, rooms, levels, and relationships.</div>
                <button class="iml-primary" type="button">Import IFC</button>
            `;
            empty.querySelector('button')?.addEventListener('click', () => window.runtime?.events?.emit('import-ifc', {}));
            this.body.appendChild(empty);
            return;
        }

        for (const model of this.models.values()) {
            const row = document.createElement('article');
            row.className = 'iml-row';
            row.innerHTML = `
                <div class="iml-row-main">
                    <div class="iml-model-name">${this.escape(model.name)}</div>
                    <div class="iml-model-file">${this.escape(model.fileName ?? model.modelId)}</div>
                    <div class="iml-metrics">
                        <span>${model.meshCount.toLocaleString()} meshes</span>
                        <span>${model.triangleCount.toLocaleString()} triangles</span>
                        <span>${model.totalSpaces.toLocaleString()} spaces</span>
                        <span>${model.totalStoreys.toLocaleString()} storeys</span>
                        <span>${model.totalRelationships.toLocaleString()} relationships</span>
                    </div>
                </div>
                <div class="iml-row-actions">
                    <button class="iml-secondary" type="button" data-action="dry-run">Dry Run</button>
                    <button class="iml-primary" type="button" data-action="convert">Convert Model</button>
                    <button class="iml-secondary" type="button" data-action="convert-selected">Convert Selected</button>
                    <button class="iml-secondary" type="button" data-action="report">Report</button>
                    <button class="iml-secondary" type="button" data-action="source-toggle">${model.convertedSourceVisible ? 'Hide Source' : 'Show Source'}</button>
                    <button class="iml-secondary" type="button" data-action="visibility">${model.visible ? 'Hide' : 'Show'}</button>
                    <button class="iml-danger" type="button" data-action="remove">Remove</button>
                </div>
            `;

            row.querySelector<HTMLElement>('[data-action="dry-run"]')?.addEventListener('click', () => {
                window.runtime?.events?.emit('pryzm-ifc-native-dry-run', { modelId: model.modelId }); // F.events.13
            });

            row.querySelector<HTMLElement>('[data-action="convert"]')?.addEventListener('click', () => {
                window.runtime?.events?.emit('pryzm-ifc-native-convert-model', { modelId: model.modelId }); // F.events.13
            });

            row.querySelector<HTMLElement>('[data-action="convert-selected"]')?.addEventListener('click', () => {
                window.runtime?.events?.emit('pryzm-ifc-native-convert-selected', { modelId: model.modelId }); // F.events.13
            });

            row.querySelector<HTMLElement>('[data-action="report"]')?.addEventListener('click', () => {
                window.runtime?.events?.emit('pryzm-ifc-native-report', {}); // F.events.13
            });

            row.querySelector<HTMLElement>('[data-action="source-toggle"]')?.addEventListener('click', () => {
                model.convertedSourceVisible = !model.convertedSourceVisible;
                window.runtime?.events?.emit('pryzm-ifc-native-source-visibility', { modelId: model.modelId, visible: model.convertedSourceVisible }); // F.events.13
                this.render();
            });

            row.querySelector<HTMLElement>('[data-action="visibility"]')?.addEventListener('click', () => {
                model.visible = !model.visible;
                window.runtime?.events?.emit('pryzm-import-model-visibility', { modelId: model.modelId, visible: model.visible }); // F.events.13
                this.render();
            });

            row.querySelector<HTMLElement>('[data-action="remove"]')?.addEventListener('click', () => {
                this.models.delete(model.modelId);
                window.runtime?.events?.emit('pryzm-import-model-remove', { modelId: model.modelId }); // F.events.13
                this._toast(`Removed ${model.name}`, 'info', 2500);
                this.render();
            });

            this.body.appendChild(row);
        }
    }

    private escape(value: string): string {
        return value.replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        }[char] ?? char));
    }
}