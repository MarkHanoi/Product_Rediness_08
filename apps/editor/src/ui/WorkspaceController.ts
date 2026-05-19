/**
 * WorkspaceController — Phase 1 of PRYZM UI Architecture V2
 *
 * CSS prefix: wsc-   (claimed here per §05 §3)
 * localStorage key: pryzm-workspace-mode
 * Event dispatched: pryzm-workspace-mode  { detail: { mode: WorkspaceMode } }
 *
 * Three named workspace modes:
 *   author  (F1) — full 3D canvas; DataWorkbench hidden
 *   inspect (F2) — 50/50 split: 3D left (+ Z-Slicer + Lens Bar HUDs), AuditStack right
 *   data    (F3) — DataWorkbench full width; Three.js canvas display:none
 *                  (canvas is hidden, NOT destroyed — avoids costly re-init)
 *
 * Contract compliance:
 *   §05 §3  — CSS prefix wsc- claimed in this file
 *   §05 §8  — layout changes via class/style on existing containers only
 *   §06 §1  — no BIM engine imports; accesses DataWorkbench, DMM, scene via window globals
 *   §01 §2  — no direct store mutations
 *
 * Inspect-mode additions (Phase 1.1):
 *   - Z-Slicer HUD      (.ins-zslicer range input injected over canvas)
 *   - Lens Selector Bar (.ins-lens-bar pill buttons injected over canvas)
 *   - Space key handler — toggles lens picker radial (in inspect mode only)
 *   - pryzm-delta-updated listener — lens bar health indicator refresh
 *   - Lens events dispatched via 'pryzm-set-inspect-lens' { lens }
 *     (InspectModeCoordinator receives these and calls DiagnosticMaterialManager)
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { triggerWindowResize } from '../engine/triggerWindowResize'; // F.events.16

export type WorkspaceMode = 'author' | 'inspect' | 'data';

const LS_KEY = 'pryzm-workspace-mode';
// F.events.6 — dispatch migrated to runtime.events; EVENT const retired.

type LevelExplodeMode = 'stacked' | 'exploded' | 'solo';
const LEVEL_MODE_ORDER: LevelExplodeMode[] = ['stacked', 'exploded', 'solo'];

const LENS_DEFS = [
  { id: 'ghost',    label: 'Ghost',    icon: '◌' },
  { id: 'spatial',  label: 'Area',     icon: '⊞' },
  { id: 'openings', label: 'Openings', icon: '⊡' },
  { id: 'finishes', label: 'Finishes', icon: '◫' },
  { id: 'xray',     label: 'X-Ray',    icon: '◎' },
  { id: 'assets',   label: 'Assets',   icon: '⊕' },
] as const;

type LensId = typeof LENS_DEFS[number]['id'];

export class WorkspaceController {
  private _mode: WorkspaceMode = 'author';
  private _activeLens: LensId = 'ghost';
  private _levelExplodeMode: LevelExplodeMode = 'stacked';
  private _soloLevelId: string | undefined;
  private _keyListener:    ((e: KeyboardEvent) => void) | null = null;
  private _spaceListener:  ((e: KeyboardEvent) => void) | null = null;
  private _unsubDelta: (() => void) | null = null;
  private _lensBarEl:      HTMLElement | null = null;
  private _zSlicerEl:      HTMLElement | null = null;
  private _lensPickerEl:   HTMLElement | null = null;
  private _explodeBarEl:   HTMLElement | null = null;

  constructor() {
    this._attachKeyboardShortcuts();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  getMode(): WorkspaceMode {
    return this._mode;
  }

  setMode(mode: WorkspaceMode): void {
    if (this._mode === mode) return;
    const previous = this._mode;
    this._mode = mode;
    localStorage.setItem(LS_KEY, mode);

    if (previous === 'inspect' && mode !== 'inspect') {
      this._teardownInspectHUDs();
    }

    this._applyLayout();
    window.runtime?.events?.emit('pryzm-workspace-mode', { mode }); // F.events.6
    console.log(`[WorkspaceController] Mode → ${mode}`);
  }

  /** Restore the last saved mode from localStorage. Safe to call multiple times. */
  restoreFromStorage(): void {
    const saved = localStorage.getItem(LS_KEY) as WorkspaceMode | null;
    if (saved && saved !== this._mode) {
      this._mode = saved;
      this._applyLayout();
      window.runtime?.events?.emit('pryzm-workspace-mode', { mode: this._mode }); // F.events.6
      console.log(`[WorkspaceController] Restored mode → ${this._mode}`);
    }
  }

  dispose(): void {
    if (this._keyListener) {
      document.removeEventListener('keydown', this._keyListener);
      this._keyListener = null;
    }
    this._teardownInspectHUDs();
  }

  // ── Layout application ─────────────────────────────────────────────────────

  private _applyLayout(): void {
    const canvas    = document.getElementById('container');
    const dw        = window.dataWorkbench as { setMode: (m: string) => void } | undefined; // TODO(F.6.5): legacy dataWorkbench — replace with runtime.panelHost.get('dataWorkbench')
    const propPanel = document.querySelector('.gpp-panel') as HTMLElement | null;

    document.body.classList.toggle('pryzm-mode-inspect', this._mode === 'inspect');

    switch (this._mode) {
      case 'author':
        if (canvas) {
          canvas.style.display = 'block';
          canvas.style.width   = '';
        }
        if (dw) dw.setMode('hidden');
        if (propPanel) propPanel.style.display = '';
        break;

      case 'inspect':
        // 50/50: canvas takes left half; AuditStack panel takes right half (fixed)
        if (canvas) {
          canvas.style.display = 'block';
          canvas.style.width   = '50%';
        }
        // DataWorkbench hidden — AuditStack replaces it in inspect mode
        if (dw) dw.setMode('hidden');
        if (propPanel) propPanel.style.display = 'none';
        this._setupInspectHUDs();
        break;

      case 'data':
        if (canvas) canvas.style.display = 'none';
        if (dw) dw.setMode('hidden');
        if (propPanel) propPanel.style.display = 'none';
        break;
    }

    // Tell Three.js renderer to resize after layout shift.
    // D.7.5: routed through getFrameScheduler() instead of raw rAF.
    if (this._mode !== 'data') {
      getFrameScheduler().scheduleOnce('workspace-controller-resize', () => triggerWindowResize()); // F.events.16
    }
  }

  // ── Inspect HUDs ──────────────────────────────────────────────────────────

  private _setupInspectHUDs(): void {
    const canvas = document.getElementById('container');
    if (!canvas) return;

    // Ensure container is positioned
    if (getComputedStyle(canvas).position === 'static') {
      canvas.style.position = 'relative';
    }

    this._buildLensBar(canvas);
    this._buildZSlicer(canvas);
    this._buildLevelExplodeBar(canvas);
    this._attachSpaceKey();
    this._attachDeltaListener();
  }

  private _teardownInspectHUDs(): void {
    this._lensBarEl?.remove();
    this._lensBarEl = null;

    this._zSlicerEl?.remove();
    this._zSlicerEl = null;

    this._lensPickerEl?.remove();
    this._lensPickerEl = null;

    this._explodeBarEl?.remove();
    this._explodeBarEl = null;

    if (this._spaceListener) {
      document.removeEventListener('keydown', this._spaceListener);
      this._spaceListener = null;
    }
    // F.events.6 — pryzm-delta-updated migrated to runtime.events.
    this._unsubDelta?.();
    this._unsubDelta = null;
  }

  // ── Lens Bar ───────────────────────────────────────────────────────────────

  private _buildLensBar(container: HTMLElement): void {
    if (this._lensBarEl) this._lensBarEl.remove();

    const bar = document.createElement('div');
    bar.className = 'ins-lens-bar';

    for (const lens of LENS_DEFS) {
      const pill = document.createElement('button');
      pill.className = `ins-lens-pill ${lens.id === this._activeLens ? 'ins-lens-active' : ''}`;
      pill.dataset.lens = lens.id;
      pill.innerHTML = `<span>${lens.icon}</span>${lens.label}`;
      pill.addEventListener('click', () => this._activateLens(lens.id));
      bar.appendChild(pill);
    }

    container.appendChild(bar);
    this._lensBarEl = bar;
  }

  private _activateLens(lens: LensId): void {
    this._activeLens = lens;

    // Update pill active state
    this._lensBarEl?.querySelectorAll('.ins-lens-pill').forEach(el => {
      const btn = el as HTMLButtonElement;
      btn.classList.toggle('ins-lens-active', btn.dataset.lens === lens);
    });

    // Close lens picker if open
    this._lensPickerEl?.remove();
    this._lensPickerEl = null;

    // Dispatch event → InspectModeCoordinator will apply the lens via DMM
    window.runtime?.events?.emit('pryzm-set-inspect-lens', { lens }); // F.events.2d — DOM dispatch removed; all listeners now on runtime.events
    console.log(`[WorkspaceController] Lens → ${lens}`);
  }

  // ── Z-Slicer ──────────────────────────────────────────────────────────────

  private _buildZSlicer(container: HTMLElement): void {
    if (this._zSlicerEl) this._zSlicerEl.remove();

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:8px;top:50%;transform:translateY(-50%) rotate(-90deg);z-index:120;display:flex;align-items:center;gap:6px;';

    const label = document.createElement('span');
    label.className = 'ins-zslicer-label';
    label.textContent = 'Z SLICE';

    const slider = document.createElement('input');
    slider.type       = 'range';
    slider.className  = 'ins-zslicer';
    slider.min        = '0';
    slider.max        = '100';
    slider.value      = '100';
    slider.title      = 'Clip plane elevation';
    slider.style.cssText = 'width:120px;';

    slider.addEventListener('input', () => {
      const pct = parseInt(slider.value, 10) / 100;
      window.runtime?.events?.emit('pryzm-zslicer-change', { pct }); // F.events.2d — DOM dispatch removed; all listeners now on runtime.events
    });

    wrap.appendChild(label);
    wrap.appendChild(slider);
    container.appendChild(wrap);
    this._zSlicerEl = wrap;
  }

  // ── Level Explode HUD ─────────────────────────────────────────────────────

  /**
   * Level explode bar — positioned above the lens bar at the bottom-centre of the canvas.
   * Three mode buttons: Stacked | Exploded | Solo.
   * When Solo is active a level <select> is shown to isolate a single floor.
   *
   * Dispatches:  pryzm-inspect-level-explode  { mode, soloLevelId? }
   * Consumed by: LevelExplodeController (engine Builder layer)
   *
   * CSS prefix: ins-explode-  (extension of the ins- inspect prefix claimed in §05 §3)
   */
  private _buildLevelExplodeBar(container: HTMLElement): void {
    if (this._explodeBarEl) this._explodeBarEl.remove();

    // Sync with LevelExplodeController which resets to stacked on activate()
    this._levelExplodeMode = 'stacked';
    this._soloLevelId = undefined;

    const bar = document.createElement('div');
    bar.className = 'ins-explode-bar';

    const modeLabels: Record<LevelExplodeMode, string> = {
      stacked:  '≡ Stacked',
      exploded: '⬆ Explode',
      solo:     '◉ Solo',
    };

    const render = () => {
      bar.innerHTML = '';

      // Mode buttons
      for (const m of LEVEL_MODE_ORDER) {
        const btn = document.createElement('button');
        btn.className = `ins-explode-btn${this._levelExplodeMode === m ? ' ins-explode-active' : ''}`;
        btn.textContent = modeLabels[m];
        btn.title = m === 'stacked'
          ? 'All floors stacked (normal view)'
          : m === 'exploded'
          ? 'Separate floors vertically for inspection'
          : 'Isolate a single floor';
        btn.addEventListener('click', () => {
          this._setExplodeMode(m, render);
        });
        bar.appendChild(btn);
      }

      // Level selector for Solo mode
      if (this._levelExplodeMode === 'solo') {
        const sep = document.createElement('span');
        sep.className = 'ins-explode-sep';
        sep.textContent = '|';
        bar.appendChild(sep);

        const sel = document.createElement('select');
        sel.className = 'ins-explode-select';
        sel.title = 'Select the floor to isolate';

        const bm = window.bimManager as { getLevels(): Array<{ id: string; name?: string; elevation: number }> } | undefined; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        const levels = (bm?.getLevels() ?? []).sort((a, b) => a.elevation - b.elevation);

        if (levels.length === 0) {
          const opt = document.createElement('option');
          opt.textContent = 'No levels';
          sel.appendChild(opt);
          sel.disabled = true;
        } else {
          for (let i = 0; i < levels.length; i++) {
            const lv = levels[i];
            const opt = document.createElement('option');
            opt.value = lv.id;
            opt.textContent = lv.name ?? `Level ${i + 1}`;
            if (lv.id === this._soloLevelId) opt.selected = true;
            sel.appendChild(opt);
          }
          // Default to first level if none selected
          if (!this._soloLevelId && levels.length > 0) {
            this._soloLevelId = levels[0].id;
            sel.value = levels[0].id;
            this._dispatchExplode();
          }
        }

        sel.addEventListener('change', () => {
          this._soloLevelId = sel.value;
          this._dispatchExplode();
          console.log(`[WorkspaceController] Solo level: ${sel.value}`);
        });

        bar.appendChild(sel);
      }
    };

    render();
    container.appendChild(bar);
    this._explodeBarEl = bar;
  }

  private _setExplodeMode(mode: LevelExplodeMode, rerender: () => void): void {
    if (this._levelExplodeMode === mode) return;
    this._levelExplodeMode = mode;
    if (mode !== 'solo') this._soloLevelId = undefined;
    rerender();
    this._dispatchExplode();
    console.log(`[WorkspaceController] Level explode mode: ${mode}`);
  }

  private _dispatchExplode(): void {
    // F.events.2d — DOM dispatch removed; all listeners now on runtime.events
    window.runtime?.events?.emit('pryzm-inspect-level-explode', {
      mode:        this._levelExplodeMode,
      soloLevelId: this._soloLevelId,
    });
  }

  // ── Space key lens picker ─────────────────────────────────────────────────

  private _attachSpaceKey(): void {
    if (this._spaceListener) return;

    this._spaceListener = (e: KeyboardEvent) => {
      if (this._mode !== 'inspect') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (e.code !== 'Space') return;
      e.preventDefault();
      this._toggleLensPicker();
    };

    document.addEventListener('keydown', this._spaceListener);
  }

  private _toggleLensPicker(): void {
    if (this._lensPickerEl) {
      this._lensPickerEl.remove();
      this._lensPickerEl = null;
      return;
    }

    const picker = document.createElement('div');
    picker.style.cssText = [
      'position:fixed',
      'top:50%',
      'left:25%',
      'transform:translate(-50%,-50%)',
      'background:rgba(10,10,12,0.95)',
      'border:1px solid var(--app-border,#2a2a2e)',
      'border-radius:12px',
      'padding:10px 12px',
      'z-index:500',
      'display:flex',
      'flex-direction:column',
      'gap:4px',
      'min-width:160px',
      'backdrop-filter:blur(12px)',
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText = 'font-size:9px;font-weight:700;letter-spacing:0.1em;color:var(--app-text-muted,#888);text-transform:uppercase;padding-bottom:6px;border-bottom:1px solid var(--app-border,#2a2a2e);margin-bottom:2px;';
    title.textContent = 'SELECT LENS  (Space)';
    picker.appendChild(title);

    for (const lens of LENS_DEFS) {
      const btn = document.createElement('button');
      btn.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:8px',
        'padding:6px 8px',
        'border-radius:6px',
        'border:none',
        'background:' + (lens.id === this._activeLens ? 'rgba(124,58,237,0.25)' : 'transparent'),
        'color:' + (lens.id === this._activeLens ? 'var(--app-accent-light,#a78bfa)' : 'var(--app-text,#e8e8e8)'),
        'font-size:12px',
        'cursor:pointer',
        'text-align:left',
        'width:100%',
      ].join(';');
      btn.innerHTML = `<span style="font-size:14px;width:18px;text-align:center;">${lens.icon}</span>${lens.label}`;
      btn.addEventListener('click', () => {
        this._activateLens(lens.id);
      });
      picker.appendChild(btn);
    }

    document.body.appendChild(picker);
    this._lensPickerEl = picker;

    // Dismiss on click-outside
    const dismiss = (e: MouseEvent) => {
      if (!picker.contains(e.target as Node)) {
        picker.remove();
        this._lensPickerEl = null;
        document.removeEventListener('mousedown', dismiss);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', dismiss), 50);
  }

  // ── Delta listener ────────────────────────────────────────────────────────

  private _attachDeltaListener(): void {
    if (this._unsubDelta) return;
    // F.events.6 — migrated from DOM CustomEvent to runtime.events typed bus.
    // Handler is intentionally a no-op: InspectModeCoordinator re-applies the lens
    // independently; AuditStack also listens independently. Nothing extra needed here.
    this._unsubDelta = window.runtime?.events?.on('pryzm-delta-updated', () => {
      // no-op — see comment above
    }) ?? null;
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  private _attachKeyboardShortcuts(): void {
    this._keyListener = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      if (e.key === 'F1') { e.preventDefault(); this.setMode('author');  }
      if (e.key === 'F2') { e.preventDefault(); this.setMode('inspect'); }
      if (e.key === 'F3') { e.preventDefault(); this.setMode('data');    }
    };
    document.addEventListener('keydown', this._keyListener);
  }
}

/** Singleton — import this wherever you need to read or change the workspace mode. */
export const workspaceController = new WorkspaceController();
