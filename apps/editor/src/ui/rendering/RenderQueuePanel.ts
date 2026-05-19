/**
 * @file src/ui/rendering/RenderQueuePanel.ts
 * @description Render queue management HUD — tracks all active and completed
 *   render/panorama/video jobs from Tiers 1–3.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE-CONTRACT §1, §3):
 *  - Prefix: `rq-`  (all CSS classes in this file use rq- only)
 *  - NO bim-* web components.
 *  - This panel is UI-only. Never writes to any ElementStore.
 *  - Listens to CustomEvents fired by RenderPanel, PanoramaPanel,
 *    and VideoExportPanel to track job state.
 *  - Provides a compact status badge (active job count) and expandable list.
 *
 * Events consumed:
 *   - 'rq-job-start'    — { detail: { id, name, type } }  (dispatched by each panel)
 *   - 'rq-job-progress' — { detail: { id, pct, status } }
 *   - 'rq-job-complete' — { detail: { id } }
 *   - 'rq-job-error'    — { detail: { id, error } }
 *   - 've-recording-started'  (from VideoExportPanel)
 *   - 've-recording-complete' (from VideoExportPanel)
 */

import { panelManager } from '../PanelManager';

export type RenderJobType   = 'render' | 'panorama' | 'video';
export type RenderJobStatus = 'queued' | 'running' | 'complete' | 'error';

export interface RenderJob {
    id:         string;
    name:       string;
    type:       RenderJobType;
    status:     RenderJobStatus;
    progress:   number;   // 0–1
    statusText: string;
    createdAt:  Date;
    completedAt?: Date;
    error?:     string;
}

const TYPE_ICONS: Record<RenderJobType, string>   = { render: '✨', panorama: '🌐', video: '🎬' };
const TYPE_LABELS: Record<RenderJobType, string>  = { render: 'Render', panorama: '360° Panorama', video: 'Video' };
const STATUS_COLORS: Record<RenderJobStatus, string> = {
    queued:   '#888',
    running:  '#a855f7',
    complete: '#22c55e',
    error:    '#ef4444',
};

export class RenderQueuePanel {
    private _el:    HTMLElement;
    private _badge: HTMLElement;
    private _jobs:  Map<string, RenderJob> = new Map();

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._badge = this._buildBadge();
        this._el    = this._build();
        this._listenToEvents();
        panelManager.register('panel:render-queue', () => this.hide());
    }

    getBadgeElement(): HTMLElement  { return this._badge; }
    getPanelElement(): HTMLElement  { return this._el;    }

    show():   void { panelManager.notifyOpened('panel:render-queue'); this._el.style.display = 'flex'; }
    hide():   void { panelManager.notifyClosed('panel:render-queue'); this._el.style.display = 'none'; }
    toggle(): void {
        this._el.style.display === 'none' ? this.show() : this.hide();
    }

    // ── Public job management API ─────────────────────────────────────────────

    /**
     * Registers a new job. Returns the job id.
     */
    addJob(name: string, type: RenderJobType): string {
        const id = `rqjob-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const job: RenderJob = {
            id, name, type,
            status:     'running',
            progress:   0,
            statusText: 'Starting…',
            createdAt:  new Date(),
        };
        this._jobs.set(id, job);
        this._render();
        this._updateBadge();
        return id;
    }

    updateJobProgress(id: string, pct: number, status: string): void {
        const job = this._jobs.get(id);
        if (!job) return;
        job.progress   = Math.max(0, Math.min(1, pct));
        job.statusText = status;
        this._renderJob(id);
        this._updateBadge();
    }

    completeJob(id: string): void {
        const job = this._jobs.get(id);
        if (!job) return;
        job.status      = 'complete';
        job.progress    = 1;
        job.statusText  = 'Complete';
        job.completedAt = new Date();
        this._renderJob(id);
        this._updateBadge();
    }

    errorJob(id: string, error: string): void {
        const job = this._jobs.get(id);
        if (!job) return;
        job.status     = 'error';
        job.statusText = 'Error';
        job.error      = error;
        this._renderJob(id);
        this._updateBadge();
    }

    clearCompleted(): void {
        this._jobs.forEach((job, id) => {
            if (job.status === 'complete' || job.status === 'error') {
                this._jobs.delete(id);
            }
        });
        this._render();
        this._updateBadge();
    }

    // ── Build ──────────────────────────────────────────────────────────────────

    private _buildBadge(): HTMLElement {
        const badge = document.createElement('div');
        badge.id = 'pryzm-rq-badge';
        badge.style.cssText = `
            display: none;
            position: fixed;
            top: 8px;
            right: 320px;
            background: #7c3aed;
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 11px;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 12px;
            cursor: pointer;
            z-index: 2900;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            user-select: none;
            transition: background .15s;
        `;
        badge.title = 'Show render queue';
        badge.addEventListener('click', () => this.toggle());
        return badge;
    }

    private _build(): HTMLElement {
        const panel = document.createElement('div');
        panel.id = 'pryzm-rq-panel';
        panel.className = 'rq-panel';
        panel.style.cssText = `
            display: none;
            flex-direction: column;
            position: fixed;
            top: 44px;
            right: 320px;
            width: 320px;
            max-height: 480px;
            background: #1a1a1a;
            color: #f0f0f0;
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.55);
            z-index: 3500;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 12px;
            overflow: hidden;
            border: 1px solid #333;
        `;

        panel.innerHTML = `
            <div class="rq-header" style="
                display:flex; align-items:center; justify-content:space-between;
                padding:10px 12px; background:#111; border-bottom:1px solid #333; flex-shrink:0;
            ">
                <span style="font-weight:600; font-size:13px;">📋 Render Queue</span>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button class="rq-clear-btn" style="
                        padding:3px 8px; background:#2a2a2a; border:1px solid #444;
                        color:#888; border-radius:4px; font-size:10px; cursor:pointer;
                    ">Clear done</button>
                    <button class="rq-close-btn" style="
                        background:none; border:none; color:#888; cursor:pointer;
                        font-size:16px; line-height:1; padding:0;
                    ">×</button>
                </div>
            </div>

            <div class="rq-list" style="
                overflow-y:auto; flex:1; min-height:0; padding:8px;
                display:flex; flex-direction:column; gap:6px;
            ">
                <div class="rq-empty" style="
                    padding:24px; text-align:center; color:#555; font-size:11px;
                ">
                    No render jobs yet.<br>
                    <span style="font-size:10px; color:#444;">
                        Jobs appear here when you generate renders, panoramas, or videos.
                    </span>
                </div>
            </div>
        `;

        panel.querySelector('.rq-close-btn')?.addEventListener('click', () => this.hide());
        panel.querySelector('.rq-clear-btn')?.addEventListener('click', () => this.clearCompleted());

        return panel;
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    private _render(): void {
        const list  = this._el.querySelector<HTMLElement>('.rq-list');
        const empty = this._el.querySelector<HTMLElement>('.rq-empty');
        if (!list || !empty) return;

        if (this._jobs.size === 0) {
            empty.style.display = 'block';
            // Remove all job rows
            list.querySelectorAll('.rq-job-row').forEach(r => r.remove());
            return;
        }

        empty.style.display = 'none';
        list.querySelectorAll('.rq-job-row').forEach(r => r.remove());

        // Render most recent first
        const sorted = Array.from(this._jobs.values()).reverse();
        for (const job of sorted) {
            list.appendChild(this._buildJobRow(job));
        }
    }

    private _buildJobRow(job: RenderJob): HTMLElement {
        const row = document.createElement('div');
        row.className = 'rq-job-row';
        row.dataset.rqId = job.id;
        row.style.cssText = `
            background: #2a2a2a; border-radius:6px; padding:8px 10px;
            border: 1px solid #333;
        `;
        this._fillJobRow(row, job);
        return row;
    }

    private _fillJobRow(row: HTMLElement, job: RenderJob): void {
        const pct  = Math.round(job.progress * 100);
        const color = STATUS_COLORS[job.status];

        row.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
                <span style="font-size:16px; flex-shrink:0;">${TYPE_ICONS[job.type]}</span>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:11px; font-weight:600; color:#e0e0e0;
                        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${job.name}
                    </div>
                    <div style="font-size:10px; color:#555; margin-top:1px;">
                        ${TYPE_LABELS[job.type]}
                        ${job.completedAt ? `· ${_fmtTime(job.completedAt)}` : ''}
                    </div>
                </div>
                <span style="
                    color:${color}; font-size:10px; font-weight:600;
                    flex-shrink:0; text-align:right; min-width:56px;
                ">${job.status === 'complete' ? '✓ Done' : job.status === 'error' ? '✕ Error' : `${pct}%`}</span>
            </div>
            ${job.status === 'running' ? `
                <div style="background:#1a1a1a; border-radius:3px; height:4px; overflow:hidden;">
                    <div style="
                        height:100%; border-radius:3px;
                        background:linear-gradient(90deg, #7c3aed, #a855f7);
                        width:${pct}%; transition:width .3s ease;
                    "></div>
                </div>
                <div style="font-size:10px; color:#666; margin-top:3px;">${job.statusText}</div>
            ` : job.status === 'error' ? `
                <div style="font-size:10px; color:#ef4444; margin-top:2px;">${job.error ?? 'Unknown error'}</div>
            ` : ''}
        `;
    }

    private _renderJob(id: string): void {
        const job = this._jobs.get(id);
        if (!job) return;

        const list = this._el.querySelector<HTMLElement>('.rq-list');
        if (!list) return;

        let row = list.querySelector<HTMLElement>(`[data-rq-id="${id}"]`);
        const empty = this._el.querySelector<HTMLElement>('.rq-empty');

        if (!row) {
            if (empty) empty.style.display = 'none';
            row = this._buildJobRow(job);
            list.insertBefore(row, list.firstChild);
        } else {
            this._fillJobRow(row, job);
        }
    }

    private _updateBadge(): void {
        const running = Array.from(this._jobs.values()).filter(j => j.status === 'running').length;

        if (running === 0 && this._jobs.size === 0) {
            this._badge.style.display = 'none';
            return;
        }

        this._badge.style.display = 'flex';

        if (running > 0) {
            this._badge.style.background = '#7c3aed';
            this._badge.textContent = `⏳ ${running} rendering…`;
        } else {
            const done  = Array.from(this._jobs.values()).filter(j => j.status === 'complete').length;
            const error = Array.from(this._jobs.values()).filter(j => j.status === 'error').length;
            this._badge.style.background = error > 0 ? '#dc2626' : '#16a34a';
            this._badge.textContent = error > 0 ? `${error} failed` : `${done} done`;
        }
    }

    // ── Event listeners ───────────────────────────────────────────────────────

    private _listenToEvents(): void {
        window.runtime?.events?.on('rq-job-start', (p: { id: string; name: string; type: RenderJobType }) => {
            if (p.id && p.name && p.type) {
                const job: RenderJob = {
                    id: p.id, name: p.name, type: p.type,
                    status:    'running',
                    progress:  0,
                    statusText: 'Starting…',
                    createdAt:  new Date(),
                };
                this._jobs.set(p.id, job);
                this._renderJob(p.id);
                this._updateBadge();
            }
        });

        window.runtime?.events?.on('rq-job-progress', (p: { id: string; pct: number; status: string }) => {
            if (p.id) this.updateJobProgress(p.id, p.pct ?? 0, p.status ?? '');
        });

        window.runtime?.events?.on('rq-job-complete', (p: { id: string }) => {
            if (p.id) this.completeJob(p.id);
        });

        window.runtime?.events?.on('rq-job-error', (p: { id: string; error: string }) => {
            if (p.id) this.errorJob(p.id, p.error ?? 'Unknown error');
        });

        // F.events.14 — ve-recording-started/complete migrated from DOM CustomEvent to runtime.events.
        window.runtime?.events?.on('ve-recording-started', () => {
            const id = `rqjob-video-${Date.now()}`;
            const job: RenderJob = {
                id, name: `Video Recording`, type: 'video',
                status:    'running',
                progress:  0,
                statusText: 'Recording…',
                createdAt:  new Date(),
            };
            this._jobs.set(id, job);
            window.__rq_video_job_id__ = id; // TODO(C.3.x): legacy __rq_video_job_id__ — replace with runtime.exports.video job-id (debug)
            this._renderJob(id);
            this._updateBadge();
        });

        window.runtime?.events?.on('ve-recording-complete', () => {
            const id = window.__rq_video_job_id__; // TODO(C.3.x): legacy __rq_video_job_id__ — replace with runtime.exports.video job-id (debug)
            if (id) {
                this.completeJob(id);
                delete window.__rq_video_job_id__; // TODO(C.3.x): legacy __rq_video_job_id__ — replace with runtime.exports.video job-id (debug)
            }
        });
    }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function _fmtTime(d: Date): string {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Singleton helpers ─────────────────────────────────────────────────────────

let _rqPanel: RenderQueuePanel | null = null;

export function getRenderQueuePanel(): RenderQueuePanel {
    if (!_rqPanel) _rqPanel = new RenderQueuePanel();
    return _rqPanel;
}

export function mountRenderQueuePanel(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime mountRenderQueuePanel */): RenderQueuePanel {
    void runtime; /* B-runtime-void mountRenderQueuePanel — TODO(C.3.x): consume in Phase C — runtime threading lands when Phase C wires the panel-host slot */
    const rq = getRenderQueuePanel();
    container.appendChild(rq.getBadgeElement());
    container.appendChild(rq.getPanelElement());
    return rq;
}
