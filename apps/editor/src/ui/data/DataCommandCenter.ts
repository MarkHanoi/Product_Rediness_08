/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — F3 Data Mode shell (Phase 2.1)
 * File:             src/ui/data/DataCommandCenter.ts
 * Contract:         05-BIM-UI-ARCHITECTURE-CONTRACT §3 (CSS prefix: dcc-)
 *                   01-BIM-ENGINE-CORE-CONTRACT §2 (no direct store mutations)
 *
 * DataCommandCenter — The F3 workspace surface that REPLACES DataWorkbench.
 * Shows/hides via 'pryzm-workspace-mode' events.
 *
 * Layout (4 zones):
 *   [Bucket Rail 60px] | [Filter Tree 280px] | [Active Bucket Content ~∞] | [PIP 320px]
 *
 * Buckets:
 *   ✏️ Strategize — Define the Brief (RequirementStore write surface)
 *   🔍 Audit      — Global delta grid
 *   ⚗️ Validate   — Engineering sub-tabs
 *   🔄 Lifecycle  — Maintenance records
 *
 * CONTRACT RULES:
 *   - Never mutates stores directly
 *   - All mutations via the legacy command manager (delegated to buckets)
 *   - PIPRenderer is strictly read-only
 *   - Exposes dispose() for cleanup
 */

import * as THREE from '@pryzm/renderer-three/three';
import { comparisonEngine } from '@pryzm/core-app-model';
import { requirementStore } from '@pryzm/core-app-model';
import { StrategizeBucket }  from './buckets/StrategizeBucket';
import { AuditBucket }       from './buckets/AuditBucket';
import { ValidateBucket }    from './buckets/ValidateBucket';
import { LifecycleBucket }   from './buckets/LifecycleBucket';
import { PIPRenderer }       from './PIPRenderer';

// ── Types ─────────────────────────────────────────────────────────────────────

type BucketId = 'strategize' | 'audit' | 'validate' | 'lifecycle';

interface BucketDef {
  id:    BucketId;
  icon:  string;
  label: string;
}

const BUCKET_DEFS: BucketDef[] = [
  { id: 'strategize', icon: '✏️', label: 'STRATEGIZE' },
  { id: 'audit',      icon: '🔍', label: 'AUDIT'      },
  { id: 'validate',   icon: '⚗️', label: 'VALIDATE'   },
  { id: 'lifecycle',  icon: '🔄', label: 'LIFECYCLE'  },
];

// ── DataCommandCenter ─────────────────────────────────────────────────────────

export class DataCommandCenter {
  private _el!:         HTMLElement;
  private _railEl!:     HTMLElement;
  private _treeEl!:     HTMLElement;
  private _mainEl!:     HTMLElement;
  private _pipWrap!:    HTMLElement;

  private _activeBucket: BucketId = 'strategize';
  private _selectedRooms: Set<string> = new Set();

  private _strategize!:  StrategizeBucket;
  private _audit!:       AuditBucket;
  private _validate!:    ValidateBucket;
  private _lifecycle!:   LifecycleBucket;
  private _pipRenderer:  PIPRenderer | null = null;

  private _unsubModeHandler:  (() => void) | null = null;
  private _unsubDeltaHandler: (() => void) | null = null;

  /**
   * Phase B.18-DCC (S73-WIRE) — `dataCommandCenter` is a module-load singleton
   * (see `export const dataCommandCenter = new DataCommandCenter()` at file
   * tail) constructed BEFORE `composeRuntime()` runs.  We therefore mirror the
   * lazy-injection pattern established by `UiPreferences` (B.13-UP) and
   * `gridDrawingHUD` (B.15-GD): the runtime starts null and `wireRuntime()` is
   * called from `src/main.ts` immediately after `composeRuntime()` resolves,
   * THEN re-buckets so child buckets + PIPRenderer receive the typed handle.
   */
  private _runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null;
  get runtime(): import('@pryzm/runtime-composer/types').PryzmRuntime | null { return this._runtime; }

  wireRuntime(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null): void {
    this._runtime = runtime;
    // Re-thread runtime into already-constructed buckets (each accepts a
    // null-default ctor arg, so we re-instantiate to preserve immutability).
    if (this._strategize && this._audit && this._validate && this._lifecycle) {
      // Detach + dispose old buckets (they hold no critical state in B.18 scope).
      try { this._strategize.element.remove(); } catch {}
      try { this._audit.element.remove();      } catch {}
      try { this._validate.element.remove();   } catch {}
      try { this._lifecycle.element.remove();  } catch {}
      this._buildBuckets();
    }
  }

  constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
    this._runtime = runtime;
    this._buildDOM();
    this._buildBuckets();
    this._bindEvents();
    console.log('[DataCommandCenter] Initialized');
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get element(): HTMLElement { return this._el; }

  dispose(): void {
    this._pipRenderer?.dispose();
    this._pipRenderer = null;
    this._audit.dispose?.();

    // F.events.6 — pryzm-workspace-mode / pryzm-delta-updated migrated to runtime.events.
    this._unsubModeHandler?.();  this._unsubModeHandler = null;
    this._unsubDeltaHandler?.(); this._unsubDeltaHandler = null;

    this._el.remove();
    console.log('[DataCommandCenter] Disposed');
  }

  // ── DOM construction ───────────────────────────────────────────────────────

  private _buildDOM(): void {
    this._el = document.createElement('div');
    this._el.id        = 'dcc-shell';
    this._el.className = 'dcc-shell';
    this._el.style.cssText = 'display:none;position:fixed;inset:0;z-index:40;';

    this._railEl = this._buildBucketRail();
    this._el.appendChild(this._railEl);

    this._treeEl = this._buildFilterTree();
    this._el.appendChild(this._treeEl);

    this._mainEl = document.createElement('div');
    this._mainEl.className = 'dcc-main';
    this._el.appendChild(this._mainEl);

    this._pipWrap = this._buildPIP();
    this._el.appendChild(this._pipWrap);

    document.body.appendChild(this._el);
  }

  private _buildBucketRail(): HTMLElement {
    const rail = document.createElement('nav');
    rail.className = 'dcc-bucket-rail';
    rail.setAttribute('aria-label', 'Data buckets');

    for (const def of BUCKET_DEFS) {
      const btn = document.createElement('button');
      btn.className = `dcc-bucket-btn${def.id === this._activeBucket ? ' dcc-bucket-active' : ''}`;
      btn.dataset.bucket = def.id;
      btn.title = def.label;
      btn.setAttribute('aria-label', def.label);
      btn.innerHTML = `
        <span class="dcc-bucket-icon">${def.icon}</span>
        <span style="font-size:8px;font-weight:700;letter-spacing:0.04em;">${def.label.substring(0,6)}</span>
      `;
      btn.addEventListener('click', () => this._switchBucket(def.id));
      rail.appendChild(btn);
    }

    return rail;
  }

  private _buildFilterTree(): HTMLElement {
    const tree = document.createElement('div');
    tree.className = 'dcc-filter-tree';

    const header = document.createElement('div');
    header.className = 'dcc-filter-header';
    header.textContent = 'FILTER TREE';

    const search = document.createElement('div');
    search.className = 'dcc-filter-search';
    const searchInput = document.createElement('input');
    searchInput.type        = 'text';
    searchInput.placeholder = '🔍 Search rooms…';
    searchInput.addEventListener('input', () => this._filterTree(searchInput.value));
    search.appendChild(searchInput);

    const body = document.createElement('div');
    body.className  = 'dcc-filter-tree-body';
    body.id         = 'dcc-tree-body';

    const quickFilters = document.createElement('div');
    quickFilters.className = 'dcc-quick-filters';

    const filterDefs: { label: string; fn: () => void }[] = [
      { label: 'Show All',       fn: () => this._applyQuickFilter('all')     },
      { label: '🔴 Red Only',    fn: () => this._applyQuickFilter('red')     },
      { label: '🏢 By Dept',     fn: () => this._applyQuickFilter('dept')    },
    ];

    for (const f of filterDefs) {
      const btn = document.createElement('button');
      btn.className   = 'dcc-quick-filter-btn';
      btn.textContent = f.label;
      btn.addEventListener('click', f.fn);
      quickFilters.appendChild(btn);
    }

    tree.appendChild(header);
    tree.appendChild(search);
    tree.appendChild(body);
    tree.appendChild(quickFilters);

    return tree;
  }

  private _buildPIP(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'dcc-pip';

    const pipHeader = document.createElement('div');
    pipHeader.className = 'dcc-pip-header';
    pipHeader.textContent = 'PLAN VIEW';

    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText = 'position:absolute;inset:24px 0 0 0;';
    canvasContainer.id = 'dcc-pip-canvas';

    wrap.appendChild(pipHeader);
    wrap.appendChild(canvasContainer);
    return wrap;
  }

  // ── Buckets ────────────────────────────────────────────────────────────────

  private _buildBuckets(): void {
    // Phase B.18 (S73-WIRE) — forward composed runtime to all four buckets so
    // they can resolve typed selection / data state via runtime in C-phase.
    this._strategize = new StrategizeBucket(this._runtime);
    this._audit      = new AuditBucket(this._runtime);
    this._validate   = new ValidateBucket(this._runtime);
    this._lifecycle  = new LifecycleBucket(this._runtime);

    this._mainEl.appendChild(this._strategize.element);
    this._mainEl.appendChild(this._audit.element);
    this._mainEl.appendChild(this._validate.element);
    this._mainEl.appendChild(this._lifecycle.element);

    this._showActiveBucket();
  }

  private _switchBucket(id: BucketId): void {
    this._activeBucket = id;
    this._updateRailActive();
    this._showActiveBucket();
    console.log(`[DataCommandCenter] Switched to bucket: ${id}`);
  }

  private _updateRailActive(): void {
    this._railEl.querySelectorAll<HTMLElement>('.dcc-bucket-btn').forEach(btn => {
      btn.classList.toggle('dcc-bucket-active', btn.dataset.bucket === this._activeBucket);
    });
  }

  private _showActiveBucket(): void {
    const buckets: Record<BucketId, HTMLElement> = {
      strategize: this._strategize.element,
      audit:      this._audit.element,
      validate:   this._validate.element,
      lifecycle:  this._lifecycle.element,
    };
    Object.entries(buckets).forEach(([id, el]) => {
      el.style.display = id === this._activeBucket ? 'flex' : 'none';
    });
  }

  // ── Filter tree population ─────────────────────────────────────────────────

  private _populateTree(): void {
    const body = this._el.querySelector('#dcc-tree-body') as HTMLElement;
    if (!body) return;

    body.innerHTML = '';
    const rs       = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
    const deltaMap = comparisonEngine.getDeltaMap();

    const requirements = requirementStore.getAll();
    const seenRooms    = new Map<string, string>();

    for (const req of requirements) {
      if (seenRooms.has(req.roomId)) continue;
      const roomName = this._getRoomName(req.roomId, rs);
      seenRooms.set(req.roomId, roomName);
    }

    if (seenRooms.size === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px 10px;font-size:11px;color:var(--app-text-muted);';
      empty.textContent = 'No rooms with requirements. Define requirements in Strategize.';
      body.appendChild(empty);
      return;
    }

    for (const [roomId, roomName] of seenRooms) {
      const health    = comparisonEngine.getRoomHealthScore(roomId);
      const entries   = deltaMap.get(roomId) ?? [];
      const failCount = entries.filter(e => e.status === 'FAIL').length;

      const node = document.createElement('div');
      node.className   = 'dcc-tree-node';
      node.dataset.roomId = roomId;
      node.innerHTML = `
        <span class="dcc-tree-node-icon">🚪</span>
        <span class="dcc-tree-node-label" title="${roomId}">${roomName}</span>
        <span class="dcc-tree-health" style="color:${this._healthColor(health)};font-size:10px;font-weight:700;margin-left:auto;">${health}%</span>
        ${failCount > 0 ? `<span style="font-size:9px;color:var(--app-red,#dc2626);margin-left:4px;">${failCount}✗</span>` : ''}
      `;

      const isSelected = this._selectedRooms.has(roomId);
      if (isSelected) node.classList.add('dcc-tree-node--selected');

      node.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) {
          if (this._selectedRooms.has(roomId)) {
            this._selectedRooms.delete(roomId);
            node.classList.remove('dcc-tree-node--selected');
          } else {
            this._selectedRooms.add(roomId);
            node.classList.add('dcc-tree-node--selected');
          }
        } else {
          this._el.querySelectorAll('.dcc-tree-node').forEach(n => n.classList.remove('dcc-tree-node--selected'));
          this._selectedRooms.clear();
          this._selectedRooms.add(roomId);
          node.classList.add('dcc-tree-node--selected');

          this._focusPIP(roomId);
        }

        this._notifyBuckets();
      });

      body.appendChild(node);
    }
  }

  private _filterTree(query: string): void {
    const body = this._el.querySelector('#dcc-tree-body') as HTMLElement;
    if (!body) return;

    const q = query.toLowerCase();
    body.querySelectorAll<HTMLElement>('.dcc-tree-node').forEach(node => {
      const label = node.querySelector('.dcc-tree-node-label')?.textContent?.toLowerCase() ?? '';
      node.style.display = !q || label.includes(q) ? '' : 'none';
    });
  }

  private _applyQuickFilter(type: string): void {
    const body    = this._el.querySelector('#dcc-tree-body') as HTMLElement;
    if (!body) return;

    const deltaMap = comparisonEngine.getDeltaMap();
    this._selectedRooms.clear();
    this._el.querySelectorAll('.dcc-tree-node').forEach(n => n.classList.remove('dcc-tree-node--selected'));

    if (type === 'all') {
      this._notifyBuckets();
      return;
    }

    body.querySelectorAll<HTMLElement>('.dcc-tree-node').forEach(node => {
      const roomId  = node.dataset.roomId ?? '';
      const entries = deltaMap.get(roomId) ?? [];
      const hasFail = entries.some(e => e.status === 'FAIL');

      if (type === 'red' && hasFail) {
        this._selectedRooms.add(roomId);
        node.classList.add('dcc-tree-node--selected');
      }
    });

    this._notifyBuckets();
  }

  private _notifyBuckets(): void {
    this._strategize.setSelectedRooms(this._selectedRooms);
    this._audit.setSelectedRooms(this._selectedRooms);
    this._validate.setSelectedRooms(this._selectedRooms);
    this._lifecycle.setSelectedRooms(this._selectedRooms);
  }

  // ── PIP integration ────────────────────────────────────────────────────────

  private _mountPIP(): void {
    const container = this._el.querySelector('#dcc-pip-canvas') as HTMLElement | null;
    if (!container) return;

    const scene = window.__PRYZM_SCENE__ as THREE.Scene | undefined; // TODO(D.4): legacy __PRYZM_SCENE__ — replace with runtime.scene (debug handle)
    if (!scene) {
      console.warn('[DataCommandCenter] Main scene not found for PIP');
      return;
    }

    // Phase B.18 (S73-WIRE) — forward composed runtime so PIPRenderer can
    // resolve typed scene/camera state via runtime in C-phase.
    this._pipRenderer = new PIPRenderer(this._runtime);
    this._pipRenderer.mount(container, scene);
  }

  private _focusPIP(roomId: string): void {
    if (!this._pipRenderer) return;

    try {
      const elementRegistry = window.elementRegistry; // TODO(D.4): legacy elementRegistry — replace with runtime.scene.elementRegistry
      const bounds = elementRegistry?.getBounds?.(roomId);
      if (!bounds) return;

      const center = bounds.getCenter(new THREE.Vector3());
      this._pipRenderer.focusPoint(center);
    } catch (e) {
      console.warn('[DataCommandCenter] PIP focus error:', e);
    }
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  private _bindEvents(): void {
    // F.events.6 — pryzm-workspace-mode / pryzm-delta-updated migrated to runtime.events typed bus.
    // Uses window.runtime (globals.d.ts) so on() returns () => void (not Disposable).
    this._unsubModeHandler = window.runtime?.events?.on('pryzm-workspace-mode', (payload: unknown) => {
      const mode = (payload as { mode?: string })?.mode;
      if (mode === 'data') {
        this._show();
      } else {
        this._hide();
      }
    }) ?? null;

    this._unsubDeltaHandler = window.runtime?.events?.on('pryzm-delta-updated', () => {
      if (this._el.style.display === 'none') return;
      this._populateTree();
      this._audit.refresh();
      this._validate.refresh();
    }) ?? null;
  }

  private _show(): void {
    this._el.style.display = 'flex';
    this._populateTree();
    this._notifyBuckets();

    if (!this._pipRenderer) {
      this._mountPIP();
    }

    console.log('[DataCommandCenter] Shown');
  }

  private _hide(): void {
    this._el.style.display = 'none';
    console.log('[DataCommandCenter] Hidden');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _getRoomName(roomId: string, rs: any): string {
    if (!rs) return roomId;
    try {
      const all: any[] = rs.getAll?.() ?? [];
      const room = all.find((r: any) => r.id === roomId);
      return room?.name || room?.label || roomId;
    } catch { return roomId; }
  }

  private _healthColor(score: number): string {
    if (score >= 80) return 'var(--app-green, #16a34a)';
    if (score >= 50) return 'var(--app-amber, #d97706)';
    return 'var(--app-red, #dc2626)';
  }
}

export const dataCommandCenter = new DataCommandCenter();
