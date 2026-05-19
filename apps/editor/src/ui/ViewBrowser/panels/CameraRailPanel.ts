/**
 * CameraRailPanel — Camera section content for the left-rail system.
 *
 * Extracted from ProjectBrowserPanel._buildCameraContent().
 * Includes perspective/ortho/zoom controls, grid toggle, saved viewpoints,
 * navigation arrows (orbit / pan), and walk mode.
 *
 * Contract compliance:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* elements; pure native HTML
 *   §01      — Read-only; no direct store mutations
 */

import type { ProjectBrowserPanelProps } from '../ProjectBrowserTypes';

export class CameraRailPanel {
    private _activeMode: '3D' | 'Top' | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(private readonly _props: ProjectBrowserPanelProps, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;}

    build(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'pb-camera-container';

        // ── Camera Mode ───────────────────────────────────────────────────────
        const modeHdr = document.createElement('div');
        modeHdr.className   = 'pb-camera-vp-header';
        modeHdr.textContent = 'Camera Mode';
        container.appendChild(modeHdr);

        const modeRow = document.createElement('div');
        modeRow.style.cssText = 'display:flex;gap:4px;margin-bottom:4px;';

        const perspBtn = this._makeBtn('Perspective', 'Switch to 3D perspective view', () => {
            this._props.onActivate3D?.();
        });

        modeRow.appendChild(perspBtn);
        container.appendChild(modeRow);

        // Sync active button on view changes
        const syncMode = () => {
            perspBtn.classList.toggle('pb-camera-btn--active', this._activeMode === '3D');
        };
        window.runtime?.events?.on('view-activated', (payload: unknown) => { // F.events.8
            const mode = (payload as { mode?: string })?.mode;
            if (mode === '3D') this._activeMode = '3D';
            syncMode();
        });
        // Default to 3D on first render
        this._activeMode = '3D';
        syncMode();

        // ── View Controls ─────────────────────────────────────────────────────
        const ctrlHdr = document.createElement('div');
        ctrlHdr.className   = 'pb-camera-vp-header';
        ctrlHdr.textContent = 'View Controls';
        container.appendChild(ctrlHdr);

        const fitAllBtn = this._makeBtn('Fit All', 'Zoom to fit all elements in view', () => this._props.onZoomToAll?.());
        const homeBtn   = this._makeBtn('⌂ Home', 'Return to original home view captured on load', () => this._props.onGoToDefaultView?.());
        container.appendChild(fitAllBtn);
        container.appendChild(homeBtn);

        // ── Grid ──────────────────────────────────────────────────────────────
        const gridBtn = document.createElement('button');
        gridBtn.className = 'pb-camera-btn pb-camera-grid-btn';
        gridBtn.type      = 'button';

        const refreshGrid = (): void => {
            const on = this._props.gridToggleService?.isVisible ?? false;
            gridBtn.title = on ? 'Grid ON — click to hide' : 'Grid OFF — click to show';
            gridBtn.classList.toggle('pb-camera-grid-btn--on',  on);
            gridBtn.classList.toggle('pb-camera-grid-btn--off', !on);
            gridBtn.innerHTML = `<span class="pb-camera-grid-icon">⊞</span> Grid: ${on ? 'ON' : 'OFF'}`;
        };

        refreshGrid();
        gridBtn.addEventListener('click', () => {
            this._props.gridToggleService?.toggle();
            refreshGrid();
        });
        window.runtime?.events?.on('view-activated', () => refreshGrid()); // F.events.8
        container.appendChild(gridBtn);

        // ── Saved Viewpoints ──────────────────────────────────────────────────
        const vpHdr = document.createElement('div');
        vpHdr.className   = 'pb-camera-vp-header';
        vpHdr.textContent = 'Saved Viewpoints';
        container.appendChild(vpHdr);

        const saveBtn = document.createElement('button');
        saveBtn.className   = 'pb-camera-btn pb-camera-vp-save';
        saveBtn.type        = 'button';
        saveBtn.title       = 'Save current camera position as a viewpoint';
        saveBtn.textContent = '+ Save Viewpoint';
        saveBtn.addEventListener('click', () => this._props.onCreateViewpoint?.());
        container.appendChild(saveBtn);

        const vpList = document.createElement('div');
        vpList.className   = 'pb-camera-vp-list';
        vpList.style.cssText = 'margin-top:4px;';

        const renderViewpoints = () => {
            vpList.innerHTML = '';
            const obcVp = window.obcViewpoints; // TODO(D.4): legacy obcViewpoints — replace with runtime.scene.components viewpoints
            const entries: Array<any> = obcVp ? [...obcVp.list.values()] : [];

            if (entries.length === 0) {
                const empty = document.createElement('div');
                empty.className   = 'pb-view-empty';
                empty.textContent = 'No viewpoints saved yet.';
                vpList.appendChild(empty);
                return;
            }

            entries.forEach((vp: any, idx: number) => {
                const row = document.createElement('div');
                row.style.cssText = [
                    'display:flex',
                    'align-items:center',
                    'justify-content:space-between',
                    'padding:3px 4px',
                    'border-radius:4px',
                    'margin-bottom:2px',
                    'background:rgba(0,0,0,0.03)',
                    'font-size:11px',
                    'gap:4px',
                ].join(';');

                const name = document.createElement('span');
                name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;';
                name.title         = vp.title ?? `Viewpoint ${idx + 1}`;
                name.textContent   = vp.title ?? `Viewpoint ${idx + 1}`;
                name.contentEditable = 'true';
                name.addEventListener('blur', () => {
                    vp.title = name.textContent?.trim() || `Viewpoint ${idx + 1}`;
                });
                name.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); name.blur(); }
                    e.stopPropagation();
                });

                const goBtn = document.createElement('button');
                goBtn.type        = 'button';
                goBtn.title       = 'Go to this viewpoint';
                goBtn.textContent = '▶';
                goBtn.style.cssText = [
                    'background:var(--app-accent,#6600ff)',
                    'color:#fff',
                    'border:none',
                    'border-radius:3px',
                    'cursor:pointer',
                    'font-size:10px',
                    'padding:1px 5px',
                    'min-width:22px',
                    'height:20px',
                    'pointer-events:auto',
                ].join(';');
                goBtn.addEventListener('click', async () => {
                    try { await vp.go(true); } catch { /* noop */ }
                });

                const delBtn = document.createElement('button');
                delBtn.type        = 'button';
                delBtn.title       = 'Delete this viewpoint';
                delBtn.textContent = '×';
                delBtn.style.cssText = [
                    'background:rgba(200,0,0,0.08)',
                    'color:#c00',
                    'border:none',
                    'border-radius:3px',
                    'cursor:pointer',
                    'font-size:13px',
                    'line-height:1',
                    'padding:0 5px',
                    'min-width:22px',
                    'height:20px',
                    'pointer-events:auto',
                ].join(';');
                delBtn.addEventListener('click', () => {
                    const obcVp2 = window.obcViewpoints; // TODO(D.4): legacy obcViewpoints — replace with runtime.scene.components viewpoints
                    if (obcVp2 && vp.guid) obcVp2.list.delete(vp.guid);
                    renderViewpoints();
                });

                row.appendChild(name);
                row.appendChild(goBtn);
                row.appendChild(delBtn);
                vpList.appendChild(row);
            });
        };

        renderViewpoints();
        window.runtime?.events?.on('update-viewpoints', renderViewpoints); // F.events.10
        container.appendChild(vpList);

        // ── Navigation ────────────────────────────────────────────────────────
        const navHdr = document.createElement('div');
        navHdr.className   = 'pb-camera-vp-header';
        navHdr.textContent = 'Navigation';
        container.appendChild(navHdr);

        // Directional orbit arrows (rotate camera)
        const arrowPad = document.createElement('div');
        arrowPad.style.cssText = [
            'display:grid',
            'grid-template-columns:repeat(3,28px)',
            'grid-template-rows:repeat(2,28px)',
            'gap:2px',
            'justify-content:center',
            'margin-bottom:6px',
        ].join(';');
        arrowPad.title = 'Orbit camera (or use mouse drag in the 3D viewport)';

        const DEG15 = Math.PI / 12;
        type ArrowDef = { symbol: string; dTheta: number; dPhi: number; col: number; row: number; hint: string };
        const arrows: ArrowDef[] = [
            { symbol: '←', dTheta: -DEG15, dPhi: 0,      col: 1, row: 1, hint: 'Orbit left'  },
            { symbol: '↑', dTheta: 0,      dPhi: -DEG15, col: 2, row: 1, hint: 'Orbit up'    },
            { symbol: '↓', dTheta: 0,      dPhi:  DEG15, col: 2, row: 2, hint: 'Orbit down'  },
            { symbol: '→', dTheta:  DEG15, dPhi: 0,      col: 3, row: 1, hint: 'Orbit right' },
        ];

        for (const a of arrows) {
            const btn = document.createElement('button');
            btn.type        = 'button';
            btn.textContent = a.symbol;
            btn.title       = a.hint;
            btn.style.cssText = [
                `grid-column:${a.col}`,
                `grid-row:${a.row}`,
                'font-size:14px',
                'background:rgba(0,0,0,0.05)',
                'border:1px solid rgba(0,0,0,0.12)',
                'border-radius:4px',
                'cursor:pointer',
                'display:flex',
                'align-items:center',
                'justify-content:center',
                'padding:0',
                'width:28px',
                'height:28px',
                'line-height:1',
            ].join(';');
            btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(102,0,255,0.12)'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(0,0,0,0.05)'; });
            btn.addEventListener('click', () => {
                const cc = window.cameraControls; // TODO(D.9): legacy cameraControls — replace with runtime.cameraController
                if (!cc) return;
                cc.rotate(a.dTheta, a.dPhi, true);
            });
            arrowPad.appendChild(btn);
        }
        container.appendChild(arrowPad);

        // Orbit / Pan / Zoom hint row
        const modeHintRow = document.createElement('div');
        modeHintRow.style.cssText = [
            'display:flex',
            'gap:6px',
            'font-size:10px',
            'color:#888',
            'margin-bottom:6px',
            'justify-content:center',
        ].join(';');
        [
            { icon: '🖱️L', label: 'Orbit'  },
            { icon: '🖱️R', label: 'Pan'    },
            { icon: '⊙',   label: 'Zoom'   },
        ].forEach(({ icon, label }) => {
            const chip = document.createElement('span');
            chip.style.cssText = 'display:flex;align-items:center;gap:2px;';
            chip.innerHTML = `<span style="font-size:11px;">${icon}</span><span>${label}</span>`;
            modeHintRow.appendChild(chip);
        });
        container.appendChild(modeHintRow);

        // Walk Mode toggle
        let walkActive = false;
        let walkHint: HTMLElement | null = null;

        const walkBtn = document.createElement('button');
        walkBtn.type      = 'button';
        walkBtn.className = 'pb-camera-btn';

        const syncWalkBtn = (): void => {
            walkBtn.classList.toggle('pb-camera-btn--active', walkActive);
            walkBtn.textContent = walkActive ? '🚶 Exit Walk Mode' : '🚶 Walk Mode';
            if (walkHint) walkHint.style.display = walkActive ? 'block' : 'none';
        };

        walkBtn.addEventListener('click', async () => {
            const fpc = window.firstPersonController; // TODO(D.9): legacy firstPersonController — replace with runtime.cameraController.firstPerson
            if (!fpc) {
                console.warn('[CameraRailPanel] firstPersonController not found on window');
                return;
            }
            if (fpc.active) {
                fpc.deactivate();
                walkActive = false;
                syncWalkBtn();
            } else {
                walkBtn.disabled = true;
                walkBtn.textContent = '⌛ Entering Walk Mode…';
                try {
                    await this._props.onActivate3D?.();
                    await fpc.activate();
                    walkActive = Boolean(fpc.active);
                } catch (err: unknown) {
                    console.error('[CameraRailPanel] Walk mode activation failed:', err);
                    walkActive = false;
                } finally {
                    walkBtn.disabled = false;
                    syncWalkBtn();
                }
            }
        });

        syncWalkBtn();

        // Keep walk button in sync when ESC or other code calls deactivate().
        window.addEventListener('fw-mode-changed', (e: Event) => {
            walkActive = (e as CustomEvent).detail?.active ?? false;
            if (walkBtn.disabled) walkBtn.disabled = false;
            syncWalkBtn();
        });

        container.appendChild(walkBtn);

        const hint = document.createElement('div');
        hint.style.cssText = 'display:none;margin-top:4px;border-radius:6px;background:rgba(102,0,255,0.08);padding:8px;font-size:11px;';
        walkHint = hint;

        const hintTitle = document.createElement('div');
        hintTitle.style.cssText = 'font-weight:600;margin-bottom:4px;color:var(--app-accent,#6600ff);';
        hintTitle.textContent = 'Controls';
        hint.appendChild(hintTitle);

        const walkKeys: Array<{ key: string; label: string }> = [
            { key: 'W / S',  label: 'Forward / back'    },
            { key: 'A / D',  label: 'Strafe left / right' },
            { key: 'Q / E',  label: 'Up / down'          },
            { key: 'Arrows', label: 'Move / strafe'      },
            { key: 'Mouse',  label: 'Look around'         },
            { key: 'Shift',  label: 'Sprint'              },
            { key: 'Esc',    label: 'Exit walk mode'      },
        ];
        for (const c of walkKeys) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;padding:1px 0;';
            const keyEl = document.createElement('kbd');
            keyEl.style.cssText = 'font-size:10px;background:rgba(0,0,0,0.08);border-radius:3px;padding:0 4px;';
            keyEl.textContent = c.key;
            const lblEl = document.createElement('span');
            lblEl.style.color = '#666';
            lblEl.textContent = c.label;
            row.appendChild(keyEl);
            row.appendChild(lblEl);
            hint.appendChild(row);
        }
        container.appendChild(hint);

        return container;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _makeBtn(label: string, title: string, handler: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className   = 'pb-camera-btn';
        btn.type        = 'button';
        btn.title       = title;
        btn.textContent = label;
        btn.addEventListener('click', handler);
        return btn;
    }
}
