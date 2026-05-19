/**
 * @file src/ui/rendering/RenderGallery.ts
 * @description Render gallery — stores, displays, and allows download of past renders.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE-CONTRACT §1):
 *  - This component is UI-only. It never mutates ElementStores.
 *  - Render blobs are stored in-memory (sessionStorage for URL persistence).
 *  - When a Supabase project is active, renders are optionally synced via
 *    POST /api/render/save (server gallery endpoint).
 *  - The gallery is self-contained and additive; no existing panels are modified.
 */

import { apiFetch } from '@pryzm/core-app-model';
import type { RenderResult } from '@pryzm/core-app-model/rendering';

interface GalleryEntry extends RenderResult {
    id: string;
    createdAt: Date;
    thumbnail: string;
    name: string;
    serverUrl?: string;
}

export class RenderGallery {
    private entries: GalleryEntry[] = [];
    private el: HTMLElement;
    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.el = this.build();
        this.restoreFromSession();
    }

    getElement(): HTMLElement { return this.el; }
    show(): void { this.el.style.display = 'flex'; }
    hide(): void { this.el.style.display = 'none'; }
    toggle(): void {
        this.el.style.display = this.el.style.display === 'none' ? 'flex' : 'none';
    }

    /**
     * Adds a completed render to the gallery.
     * Also attempts to sync with the server gallery endpoint.
     */
    async addRender(result: RenderResult, name?: string): Promise<void> {
        const thumbnail = await this.makeThumbnail(result.blobUrl);

        const entry: GalleryEntry = {
            ...result,
            id: `render-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            createdAt: new Date(),
            thumbnail,
            name: name ?? `Render ${this.entries.length + 1}`,
        };

        this.entries.unshift(entry);
        this.renderList();

        // Try to sync with server gallery (fire-and-forget)
        this.syncToServer(entry).catch(err => {
            console.warn('[RenderGallery] Server sync failed (not critical):', err);
        });
    }

    private async makeThumbnail(blobUrl: string): Promise<string> {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 200;
                canvas.height = 112;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, 200, 112);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = () => resolve('');
            img.src = blobUrl;
        });
    }

    private async syncToServer(entry: GalleryEntry): Promise<void> {
        const blob = await fetch(entry.blobUrl).then(r => r.blob()).catch(() => null);
        if (!blob) return;

        const form = new FormData();
        form.append('image', blob, `${entry.id}.png`);
        form.append('meta', JSON.stringify({
            width: entry.width,
            height: entry.height,
            samples: entry.samples,
            method: entry.method,
            durationMs: entry.durationMs,
            name: entry.name,
        }));

        const res = await apiFetch('/api/render/save', { method: 'POST', body: form });
        if (res.ok) {
            const data = await res.json();
            entry.serverUrl = data.url;
        }
    }

    private renderList(): void {
        const list = this.el.querySelector('#render-gallery-list') as HTMLElement;
        const empty = this.el.querySelector('#render-gallery-empty') as HTMLElement;
        if (!list || !empty) return;

        if (this.entries.length === 0) {
            empty.style.display = 'flex';
            list.style.display = 'none';
            return;
        }

        empty.style.display = 'none';
        list.style.display = 'grid';

        list.innerHTML = this.entries.map(entry => `
            <div class="rg-entry" data-id="${entry.id}">
                ${entry.thumbnail
                    ? `<img src="${entry.thumbnail}" style="width:100%; aspect-ratio:16/9; object-fit:cover; display:block;">`
                    : `<div style="width:100%; aspect-ratio:16/9; background:#1a1a1a; display:flex; align-items:center;
                                justify-content:center; color:#555; font-size:10px;">No preview</div>`
                }
                <div style="padding:6px 8px;">
                    <div style="font-size:11px; font-weight:600; color:#e0e0e0;
                        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${entry.name}
                    </div>
                    <div style="font-size:10px; color:#666; margin-top:2px;">
                        ${entry.width}×${entry.height} · ${entry.samples} spl
                    </div>
                    <div style="font-size:9px; color:#444; margin-top:1px;">
                        ${entry.createdAt.toLocaleTimeString()}
                    </div>
                    <div style="display:flex; gap:4px; margin-top:6px;">
                        <button class="rg-download" data-id="${entry.id}">⬇ Download</button>
                        <button class="rg-delete" data-id="${entry.id}">✕</button>
                    </div>
                </div>
            </div>
        `).join('');

        // Wire download buttons
        list.querySelectorAll('.rg-download').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.id;
                const entry = this.entries.find(en => en.id === id);
                if (entry) this.download(entry);
            });
        });

        // Wire delete buttons
        list.querySelectorAll('.rg-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.id;
                this.deleteEntry(id ?? '');
            });
        });
    }

    private download(entry: GalleryEntry): void {
        const url = entry.serverUrl ?? entry.blobUrl;
        const a = document.createElement('a');
        a.href = url;
        a.download = `${entry.name.replace(/\s+/g, '_')}_${entry.width}x${entry.height}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    private deleteEntry(id: string): void {
        const idx = this.entries.findIndex(e => e.id === id);
        if (idx === -1) return;
        const entry = this.entries[idx];
        URL.revokeObjectURL(entry.blobUrl);
        this.entries.splice(idx, 1);
        this.renderList();
    }

    private restoreFromSession(): void {
        // Gallery starts fresh each session (blob URLs don't survive page reload)
        this.renderList();
    }

    private build(): HTMLElement {
        const panel = document.createElement('div');
        panel.id = 'pryzm-render-gallery';
        panel.className = 'rg-panel';

        panel.innerHTML = `
            <div class="rg-header">
                <span class="rg-header-title">🖼 Render Gallery</span>
                <button id="gallery-close-btn" class="rg-close-btn">×</button>
            </div>

            <div class="rg-body">
                <div id="render-gallery-empty" class="rg-empty">
                    <div style="font-size:32px;">🖼</div>
                    <div style="font-size:12px; line-height:1.5;">
                        No renders yet.<br>
                        Click <strong style="color:var(--app-accent);">Generate Render</strong> to create your first.
                    </div>
                </div>

                <div id="render-gallery-list" class="rg-list"></div>
            </div>
        `;

        panel.querySelector('#gallery-close-btn')?.addEventListener('click', () => this.hide());
        return panel;
    }
}

let _galleryInstance: RenderGallery | null = null;

export function getRenderGallery(): RenderGallery {
    if (!_galleryInstance) _galleryInstance = new RenderGallery();
    return _galleryInstance;
}

export function mountRenderGallery(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime mountRenderGallery */): RenderGallery {
    void runtime; /* B-runtime-void mountRenderGallery — TODO(C.3.x): consume in Phase C — runtime threading lands when Phase C wires the panel-host slot */
    const gallery = getRenderGallery();
    container.appendChild(gallery.getElement());
    return gallery;
}
