import { escHtml } from '@pryzm/ui-base';
/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Generative Design (World Model Layer 4)
 * Phase:             Phase I-3
 * Files Modified:    src/ui/generative/VariantBrowserPanel.ts
 * Classification:    A
 *
 * Displays generated layout variants in a grid of cards.
 * Each card shows an SVG plan thumbnail, GIA, adjacency score, and total score.
 *
 * Listens to:  'pryzm-generative-generate'  → runs LayoutGenerator → renders cards
 * Dispatches:  'pryzm-generative-applied'   → after GenerativeDesignApplyCommand succeeds
 *
 * CSS class prefix: dw- (DataWorkbench panel convention)
 */

import { layoutGenerator, roomColour } from '@pryzm/ai-host';
import { generativeAdvisor } from '@pryzm/ai-host';
import { GenerativeDesignApplyCommand } from '@pryzm/command-registry';
import type { GenerativeDesignBrief, GeneratedLayout, GeneratedRoom } from '@pryzm/ai-host';

export class VariantBrowserPanel {
    private _el: HTMLElement;
    private _layouts: GeneratedLayout[] = [];
    private _selected: number | null = null;
    private _loading = false;
    private _mergeMode = false;
    private _mergeA: number | null = null;
    private _mergeB: number | null = null;
    private _mergeSelected: Set<string> = new Set(); // room IDs selected from variant A
    private _lastBrief: GenerativeDesignBrief | null = null;
    private _briefPanelRef: any = null; // BriefInputPanel reference for advisory

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._el = container;
        this._renderIdle();
        this._bindEvents();
        console.log('[VariantBrowserPanel] Initialized');
    }

    setBriefPanel(panel: any): void {
        this._briefPanelRef = panel;
    }

    /** Returns the last design brief that triggered generation (or null). */
    getLastBrief(): GenerativeDesignBrief | null {
        return this._lastBrief;
    }

    // ── Event binding ─────────────────────────────────────────────────────────

    private _bindEvents(): void {
        window.runtime?.events?.on('pryzm-generative-generate', async (p: { brief: unknown }) => { // F.events.15
            if (!p.brief) return;
            this._lastBrief = p.brief as Parameters<typeof this._runGeneration>[0];
            this._layouts = [];
            this._selected = null;
            this._mergeMode = false;
            await this._runGeneration(p.brief as Parameters<typeof this._runGeneration>[0]);
        });
    }

    private async _runGeneration(brief: GenerativeDesignBrief): Promise<void> {
        this._loading = true;
        this._render();

        try {
            const layouts = await layoutGenerator.generate(brief);
            this._layouts = layouts;

            if (layouts.length === 0) {
                await this._handleNoLayouts(brief);
            } else {
                this._selected = 0;
                this._render();
            }
        } catch (err: any) {
            console.error('[VariantBrowserPanel] Generation error:', err);
            this._renderError(`Generation error: ${err.message}`);
        } finally {
            this._loading = false;
            this._render();
        }
    }

    private async _handleNoLayouts(brief: GenerativeDesignBrief): Promise<void> {
        const violations = ['No compliant layout could be placed within the bounding box.'];
        try {
            const response = await generativeAdvisor.advise(brief, violations);
            if (this._briefPanelRef?.showAdvisoryCards) {
                this._briefPanelRef.showAdvisoryCards(response.suggestions);
            }
        } catch (e) {
            console.warn('[VariantBrowserPanel] Advisor failed:', e);
        }
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    private _renderIdle(): void {
        this._el.innerHTML = `
            <div class="dw-vb-idle">
                <div class="dw-vb-idle-icon">⊛</div>
                <div class="dw-vb-idle-title">No layouts generated yet</div>
                <div class="dw-vb-idle-hint">Fill in the brief above and click<br>"Generate layouts" to begin.</div>
            </div>
        `;
    }

    private _render(): void {
        if (this._loading) { this._renderLoading(); return; }
        if (this._layouts.length === 0) { this._renderIdle(); return; }
        if (this._mergeMode) { this._renderMergeMode(); return; }

        this._el.innerHTML = '';

        // Header
        const compliant = this._layouts.filter(l => l.isCompliant).length;
        const hdr = document.createElement('div');
        hdr.className = 'dw-vb-header';
        hdr.innerHTML = `
            <span class="dw-vb-header-title">LAYOUT VARIANTS (${compliant} of ${this._layouts.length} compliant)</span>
            <span class="dw-vb-filter">All variants</span>
        `;
        this._el.appendChild(hdr);

        // Grid
        const grid = document.createElement('div');
        grid.className = 'dw-vb-grid';
        this._layouts.forEach((layout, i) => {
            grid.appendChild(this._renderCard(layout, i));
        });
        this._el.appendChild(grid);

        // Footer action bar
        if (this._selected !== null) {
            const footer = document.createElement('div');
            footer.className = 'dw-vb-footer';
            footer.innerHTML = `
                <span class="dw-vb-selected-label">Selected: Variant ${this._selected + 1}</span>
                <button class="dw-vb-apply-btn" id="vb-apply">⊛ Apply to canvas</button>
                ${this._layouts.length > 1 ? `<button class="dw-vb-merge-btn" id="vb-merge">⊕ Merge two variants</button>` : ''}
            `;
            footer.querySelector('#vb-apply')?.addEventListener('click', () => this._applySelected());
            footer.querySelector('#vb-merge')?.addEventListener('click', () => this._enterMergeMode());
            this._el.appendChild(footer);
        }
    }

    private _renderCard(layout: GeneratedLayout, index: number): HTMLElement {
        const card = document.createElement('div');
        card.className = `dw-vb-card${this._selected === index ? ' dw-vb-card--selected' : ''}${!layout.isCompliant ? ' dw-vb-card--noncompliant' : ''}`;

        const svg = this._drawPlanThumbnail(layout.rooms, layout.boundingBox, 160, 120);

        const adjOk  = layout.adjacencyResults.filter(r => r.satisfied).length;
        const adjAll = layout.adjacencyResults.length;
        const adjBadge = adjAll === 0 ? '— adj'
            : adjOk === adjAll ? `✅ ${adjOk}/${adjAll} adj`
            : `⚠ ${adjOk}/${adjAll} adj`;

        card.innerHTML = `
            <div class="dw-vb-card-thumb">${svg}</div>
            <div class="dw-vb-card-body">
                <div class="dw-vb-card-variant">Variant ${index + 1}</div>
                <div class="dw-vb-card-gia">GIA ${layout.totalGIA_m2.toFixed(0)}m²</div>
                <div class="dw-vb-card-adj">${adjBadge}</div>
                <div class="dw-vb-card-score">Score: <strong>${layout.score.total}%</strong></div>
                ${!layout.isCompliant ? `<div class="dw-vb-card-warn">⚠ ${layout.complianceViolations.length} violation${layout.complianceViolations.length > 1 ? 's' : ''}</div>` : ''}
            </div>
            <button class="dw-vb-select-btn">Select</button>
        `;

        card.addEventListener('click', () => {
            this._selected = index;
            this._render();
        });

        return card;
    }

    private _renderLoading(): void {
        this._el.innerHTML = `
            <div class="dw-vb-loading">
                <div class="dw-vb-spinner">⊛</div>
                <div>Generating layout variants…</div>
            </div>
        `;
    }

    private _renderError(msg: string): void {
        this._el.innerHTML = `<div class="dw-vb-error">${escHtml(msg)}</div>`;
    }

    // ── SVG Plan Thumbnail ────────────────────────────────────────────────────

    private _drawPlanThumbnail(
        rooms: GeneratedRoom[],
        bbox: { width_m: number; depth_m: number },
        svgW: number,
        svgH: number,
    ): string {
        if (rooms.length === 0) return `<svg width="${svgW}" height="${svgH}"></svg>`;

        const pad = 6;
        const scaleX = (svgW - pad * 2) / bbox.width_m;
        const scaleZ = (svgH - pad * 2) / bbox.depth_m;
        const scale  = Math.min(scaleX, scaleZ);

        const rects = rooms.map(r => {
            const x = pad + r.x_m * scale;
            const y = pad + r.z_m * scale;
            const w = Math.max(4, r.width_m * scale);
            const h = Math.max(4, r.depth_m * scale);
            const colour = roomColour(r.roomType);
            const label  = r.name.length > 8 ? r.name.slice(0, 7) + '…' : r.name;
            return `
                <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"
                    fill="${colour}" stroke="#94a3b8" stroke-width="0.5" rx="1"/>
                <text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 + 3).toFixed(1)}"
                    font-size="5" text-anchor="middle" fill="#334155" font-family="sans-serif"
                    style="pointer-events:none">${label}</text>
            `;
        }).join('');

        return `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${svgW}" height="${svgH}" fill="#f8fafc" rx="2"/>
            <rect x="${pad}" y="${pad}" width="${(bbox.width_m * scale).toFixed(1)}" height="${(bbox.depth_m * scale).toFixed(1)}"
                fill="none" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3,2"/>
            ${rects}
        </svg>`;
    }

    // ── Apply to canvas ───────────────────────────────────────────────────────

    private async _applySelected(): Promise<void> {
        if (this._selected === null) return;
        const layout = this._layouts[this._selected];

        const cm: any = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
        const bimManager: any = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        const stores: any = window.__stores; // TODO(C.3.x): legacy __stores — replace with runtime.stores debug handle
        const roomStore: any = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot

        if (!cm || !bimManager) {
            alert('Command system not available — ensure a project is loaded.');
            return;
        }

        // Resolve active level
        let levelId: string | null = null;
        let levelHeight = 3.0;
        try {
            const levels = bimManager.getLevels?.() ?? bimManager.getAllLevels?.() ?? [];
            if (levels.length > 0) {
                levelId = levels[0].id;
                levelHeight = levels[0].height ?? 3.0;
            }
        } catch { /* ignore */ }

        if (!levelId) {
            alert('No levels found — create at least one level before applying a layout.');
            return;
        }

        const cmd = new GenerativeDesignApplyCommand(layout, levelId, levelHeight);

        // Build CommandContext
        const ctx = {
            stores: { roomStore, ...stores },
            bimManager,
            projectContext: window.projectContext ?? null, // TODO(C.3.x): legacy projectContext — replace with runtime.projectContext
            commandManager: window.commandManager ?? cm, // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
        } as any;

        const canResult = cmd.canExecute(ctx);
        if (!canResult.ok) {
            alert(`Cannot apply layout: ${canResult.reason}`);
            return;
        }

        try {
            // E.5.7: migrated to bus-primary pattern.
            // The bus handler calls cm.execute(GenerativeDesignApplyCommand) internally.
            await (this.runtime?.bus as any)?.executeCommand('generative.applyLayout', {
                layout,
                levelId,
                levelHeight,
            });
            console.log('[VariantBrowserPanel] Applied variant', this._selected);
            this.runtime?.events?.emit('pryzm-generative-applied', { variantIndex: this._selected!, roomCount: layout.rooms.length }); // F.events.15
            // Show success
            const footer = this._el.querySelector('.dw-vb-footer');
            if (footer) {
                const ok = document.createElement('div');
                ok.className = 'dw-vb-applied-ok';
                ok.textContent = `✓ ${layout.rooms.length} rooms added to canvas`;
                footer.appendChild(ok);
                setTimeout(() => ok.remove(), 3000);
            }
        } catch (err: any) {
            alert(`Apply failed: ${err.message}`);
        }
    }

    // ── Merge mode ────────────────────────────────────────────────────────────

    private _enterMergeMode(): void {
        if (this._layouts.length < 2) return;
        this._mergeMode = true;
        this._mergeA = this._selected;
        this._mergeB = this._selected === 0 ? 1 : 0;
        this._mergeSelected = new Set();
        this._render();
    }

    private _renderMergeMode(): void {
        if (this._mergeA === null || this._mergeB === null) return;

        const layoutA = this._layouts[this._mergeA];
        const layoutB = this._layouts[this._mergeB];

        this._el.innerHTML = '';

        const hdr = document.createElement('div');
        hdr.className = 'dw-vb-header';
        hdr.innerHTML = `
            <span class="dw-vb-header-title">MERGE VARIANTS</span>
            <button class="dw-vb-back-btn" id="vb-merge-back">← Back</button>
        `;
        hdr.querySelector('#vb-merge-back')?.addEventListener('click', () => {
            this._mergeMode = false;
            this._render();
        });
        this._el.appendChild(hdr);

        // Variant selectors
        const selectors = document.createElement('div');
        selectors.className = 'dw-vb-merge-selectors';
        selectors.innerHTML = `
            <div class="dw-vb-merge-col">
                <div class="dw-vb-merge-col-title">Source A — Variant ${this._mergeA + 1}</div>
                <select class="dw-gen-select" id="vb-merge-a">
                    ${this._layouts.map((_, i) => `<option value="${i}"${i === this._mergeA ? ' selected' : ''}>Variant ${i + 1}</option>`).join('')}
                </select>
            </div>
            <div class="dw-vb-merge-col">
                <div class="dw-vb-merge-col-title">Source B — Variant ${this._mergeB + 1}</div>
                <select class="dw-gen-select" id="vb-merge-b">
                    ${this._layouts.map((_, i) => `<option value="${i}"${i === this._mergeB ? ' selected' : ''}>Variant ${i + 1}</option>`).join('')}
                </select>
            </div>
        `;
        selectors.querySelector('#vb-merge-a')?.addEventListener('change', e => {
            this._mergeA = parseInt((e.target as HTMLSelectElement).value, 10);
            this._render();
        });
        selectors.querySelector('#vb-merge-b')?.addEventListener('change', e => {
            this._mergeB = parseInt((e.target as HTMLSelectElement).value, 10);
            this._render();
        });
        this._el.appendChild(selectors);

        // Rooms from A — checkboxes to include in merge
        const hint = document.createElement('div');
        hint.className = 'dw-vb-merge-hint';
        hint.textContent = 'Tick rooms from Variant A to include. All rooms from Variant B fill the rest.';
        this._el.appendChild(hint);

        const roomList = document.createElement('div');
        roomList.className = 'dw-vb-merge-room-list';
        layoutA.rooms.forEach(r => {
            const row = document.createElement('label');
            row.className = 'dw-vb-merge-room-row';
            row.innerHTML = `
                <input type="checkbox" ${this._mergeSelected.has(r.id) ? 'checked' : ''}>
                <span style="background:${roomColour(r.roomType)};width:10px;height:10px;display:inline-block;border-radius:2px;margin:0 4px"></span>
                <span>${r.name} (${r.area_m2.toFixed(0)}m²)</span>
            `;
            const cb = row.querySelector('input')!;
            cb.addEventListener('change', () => {
                if (cb.checked) this._mergeSelected.add(r.id);
                else this._mergeSelected.delete(r.id);
            });
            roomList.appendChild(row);
        });
        this._el.appendChild(roomList);

        // Apply merged
        const applyBtn = document.createElement('button');
        applyBtn.className = 'dw-gen-generate-btn';
        applyBtn.textContent = '⊛ Apply merged layout';
        applyBtn.addEventListener('click', () => this._applyMerge(layoutA, layoutB));
        this._el.appendChild(applyBtn);
    }

    private async _applyMerge(layoutA: GeneratedLayout, layoutB: GeneratedLayout): Promise<void> {
        // Build merged room list: selected rooms from A + all rooms from B
        const roomsFromA = layoutA.rooms.filter(r => this._mergeSelected.has(r.id));
        const usedTypes  = new Set(roomsFromA.map(r => r.briefRoomType));
        const roomsFromB = layoutB.rooms.filter(r => !usedTypes.has(r.briefRoomType));

        const mergedLayout = {
            ...layoutA,
            variantIndex: -1,
            rooms: [...roomsFromA, ...roomsFromB],
            adjacencyResults: [...layoutA.adjacencyResults, ...layoutB.adjacencyResults],
        };

        this._layouts.unshift(mergedLayout as GeneratedLayout);
        this._selected = 0;
        this._mergeMode = false;
        this._render();
        await this._applySelected();
    }

}
