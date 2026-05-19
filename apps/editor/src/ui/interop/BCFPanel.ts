/**
 * @file BCFPanel.ts
 * @description Wave 14 — F.11.5 — runtime.bcf wiring.
 *   Panel for importing and exporting BCF 3.0 issue files (Solibri-parity).
 *   Uses runtime.bcf.{read,write,isLoaded} as the canonical BCF facade.
 */

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

export class BCFPanel {
    private readonly _runtime: Runtime | null;
    private _el: HTMLElement | null = null;

    constructor(runtime: Runtime | null = null) {
        this._runtime = runtime;
    }

    mount(container: HTMLElement): void {
        this._el = document.createElement('div');
        this._el.className = 'bcf-panel';
        container.appendChild(this._el);
        this._buildUI();
    }

    private _buildUI(): void {
        if (!this._el) return;
        this._el.innerHTML = `
            <div class="bcf-header">BCF Issue Manager</div>
            <div class="bcf-status">BCF loaded: ${this._runtime?.bcf.isLoaded() ?? false}</div>
            <button class="bcf-import-btn">Import BCF…</button>
            <button class="bcf-export-btn">Export BCF…</button>
        `;

        this._el.querySelector('.bcf-import-btn')?.addEventListener('click', () => {
            void this._importBCF();
        });
        this._el.querySelector('.bcf-export-btn')?.addEventListener('click', () => {
            void this._exportBCF();
        });
    }

    /** F.11.5 — runtime.bcf.read wiring */
    async importBCF(file: File): Promise<unknown> {
        if (!this._runtime) throw new Error('[BCFPanel] runtime not available');
        return this._runtime.bcf.read(file);
    }

    /** F.11.5 — runtime.bcf.write wiring */
    async exportBCF(archive: unknown): Promise<Uint8Array> {
        if (!this._runtime) throw new Error('[BCFPanel] runtime not available');
        return this._runtime.bcf.write(archive);
    }

    private async _importBCF(): Promise<void> {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.bcf,.bcfzip';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file || !this._runtime) return;
            try {
                // F.11.5 — runtime.bcf.read wiring
                const result = await this._runtime.bcf.read(file);
                console.log('[BCFPanel] BCF imported:', result);
                this._runtime.toasts.success('BCF file imported successfully');
            } catch (err) {
                console.error('[BCFPanel] BCF import failed:', err);
                this._runtime?.toasts.error('BCF import failed');
            }
        };
        input.click();
    }

    private async _exportBCF(): Promise<void> {
        if (!this._runtime) return;
        try {
            // F.11.5 — runtime.bcf.write wiring
            const bytes = await this._runtime.bcf.write({});
            const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'issues.bcfzip';
            a.click();
            URL.revokeObjectURL(url);
            this._runtime.toasts.success('BCF file exported');
        } catch (err) {
            console.error('[BCFPanel] BCF export failed:', err);
            this._runtime?.toasts.error('BCF export failed');
        }
    }

    destroy(): void {
        this._el?.remove();
        this._el = null;
    }
}
