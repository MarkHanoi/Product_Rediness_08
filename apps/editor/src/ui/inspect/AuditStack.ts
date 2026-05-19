/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Inspect Mode RHS Panel (Phase 1.3 → 1.5)
 * File:             src/ui/inspect/AuditStack.ts
 * Contract:         05-BIM-UI-ARCHITECTURE-CONTRACT §3 (CSS prefix: aud-)
 *                   01-BIM-ENGINE-CORE-CONTRACT §1 (UI reads stores via window globals)
 *                   04-BIM-AI-MODIFICATION-PROTOCOL §2 (Classification: B — Enhancement)
 *
 * AuditStack — shell (Wave 14 FILE 5 split). Holds class fields, DOM skeleton,
 * event wiring, and state. All rendering logic lives in the audit/ zone files:
 *
 *   audit/ProjectTreeZone.ts        — mini project browser tree
 *   audit/ElementTypeSelectorZone.ts — element-type / attribute dropdowns + descriptors
 *   audit/DiscoveryModeZone.ts      — discovery heatmap (no brief)
 *   audit/AuditGridZone.ts          — audit grid + polymorphic matrix + fix bar (P6 fixed)
 *
 * Data flow:
 *   ComparisonEngine.getDeltaMap()   → health scores + comparison rows (brief mode)
 *   window.roomStore        → room names + computed metrics // TODO(E.18-R.S): legacy
 *   window.bimManager       → levels for project tree // TODO(D.4): legacy
 *   window.wallStore        → walls + wall inspect // TODO(E.wall.S): legacy
 *   window.commandManager   → canExecute context only (mutation path: runtime.commandBus) // TODO(E.5.x)
 *
 * Events dispatched / consumed: see audit/ zone files.
 */

import { comparisonEngine } from '@pryzm/core-app-model';

import {
  type InspectElementType,
  ELEMENT_TYPE_LABELS,
  ELEMENT_TYPE_ICONS,
  rebuildAttributeDropdown,
  rebuildDropdown,
} from './audit/ElementTypeSelectorZone';

import {
  type ProjectTreeState,
  renderProjectTree,
} from './audit/ProjectTreeZone';

import {
  type DiscoveryModeState,
  renderDiscoveryMode,
  getAllRooms,
} from './audit/DiscoveryModeZone';

import {
  type AuditGridState,
  renderAuditMode,
  renderPolymorphicMatrix,
  renderGlobalFixBar,
  onGlobalFix,
} from './audit/AuditGridZone';

import type { DeltaCategory } from '@pryzm/core-app-model';

// ── AuditStack class ──────────────────────────────────────────────────────────

export class AuditStack {
  // Main containers
  private _el!:              HTMLElement;
  private _projectTreeZone!: HTMLElement;
  private _elementDropdown!: HTMLSelectElement;
  private _attributeDropdown!: HTMLSelectElement;
  private _contentZone!:     HTMLElement;

  // Audit grid sub-elements (brief mode)
  private _globalFixBar!:  HTMLElement;
  private _healthSummary!: HTMLElement;

  // State
  private _selectedRoomId:     string | null = null;
  private _selectedElementId:  string | null = null;
  private _activeCategories:   Set<DeltaCategory> = new Set();
  private _activeElementType:  InspectElementType = 'rooms';
  private _activeAttributeKey: string | null = null;
  private _treeExpandedLevels: Set<string> = new Set();
  private _treeExpandedTypes:  Map<string, Set<string>> = new Map();

  /** Phase B (S73-WIRE) — runtime threaded by parent. */
  public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

  constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
    this.runtime = runtime;
    this._buildDOM();
    this._bindEvents();
    console.log('[AuditStack] Initialized v1.6 — Polymorphic Auditor');
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get element(): HTMLElement {
    return this._el;
  }

  refresh(): void {
    if (this._activeAttributeKey === null) {
      this._activeAttributeKey = rebuildAttributeDropdown(
        this._attributeDropdown,
        this._activeElementType,
        this._activeAttributeKey,
      );
    }
    this._activeElementType = rebuildDropdown(
      this._elementDropdown,
      this._activeElementType,
      ELEMENT_TYPE_ICONS,
      ELEMENT_TYPE_LABELS,
    );
    this._renderProjectTree();
    this._renderContent();
  }

  // ── DOM construction ───────────────────────────────────────────────────────

  private _buildDOM(): void {
    this._el = document.createElement('div');
    this._el.id = 'aud-stack';

    const panel = document.createElement('div');
    panel.className = 'aud-panel';

    // ── Header ────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'aud-header';
    header.innerHTML = `
      <span>INSPECT</span>
      <div class="aud-header-actions">
        <button class="aud-header-btn" id="aud-refresh-btn" title="Refresh">↺</button>
      </div>
    `;
    panel.appendChild(header);

    // ── Project Browser Section ───────────────────────────────────────────
    const treeSection = document.createElement('div');
    treeSection.className = 'aud-tree-section';

    const treeSectionHeader = document.createElement('div');
    treeSectionHeader.className = 'aud-section-header';
    treeSectionHeader.innerHTML = `
      <span class="aud-section-title">PROJECT BROWSER</span>
      <button class="aud-section-collapse" id="aud-tree-collapse" title="Collapse">▾</button>
    `;
    treeSection.appendChild(treeSectionHeader);

    this._projectTreeZone = document.createElement('div');
    this._projectTreeZone.className = 'aud-project-tree';
    this._projectTreeZone.id = 'aud-project-tree';
    treeSection.appendChild(this._projectTreeZone);
    panel.appendChild(treeSection);

    // ── Element Type Selector ─────────────────────────────────────────────
    const elementSelector = document.createElement('div');
    elementSelector.className = 'aud-element-selector';

    const selectorLabel = document.createElement('span');
    selectorLabel.className = 'aud-selector-label';
    selectorLabel.textContent = 'INSPECT:';

    this._elementDropdown = document.createElement('select');
    this._elementDropdown.className = 'aud-element-dropdown';
    this._elementDropdown.title = 'Select element type to inspect';

    (Object.keys(ELEMENT_TYPE_LABELS) as InspectElementType[]).forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = `${ELEMENT_TYPE_ICONS[type]}  ${ELEMENT_TYPE_LABELS[type]}`;
      this._elementDropdown.appendChild(opt);
    });
    this._elementDropdown.value = 'rooms';
    this._elementDropdown.addEventListener('change', () => {
      this._activeElementType  = this._elementDropdown.value as InspectElementType;
      this._activeAttributeKey = null;
      this._selectedRoomId     = null;
      this._selectedElementId  = null;
      this._activeAttributeKey = rebuildAttributeDropdown(
        this._attributeDropdown, this._activeElementType, null,
      );
      this._renderContent();
      // F.events.6 — pryzm-inspect-element-type migrated to runtime.events typed bus.
      this.runtime?.events?.emit('pryzm-inspect-element-type', { elementType: this._activeElementType });
    });

    elementSelector.appendChild(selectorLabel);
    elementSelector.appendChild(this._elementDropdown);
    panel.appendChild(elementSelector);

    // ── Attribute Selector ────────────────────────────────────────────────
    const attrSelector = document.createElement('div');
    attrSelector.className = 'aud-attr-selector';

    const attrLabel = document.createElement('span');
    attrLabel.className = 'aud-selector-label';
    attrLabel.textContent = 'ATTR:';

    this._attributeDropdown = document.createElement('select');
    this._attributeDropdown.className = 'aud-attr-dropdown';
    this._attributeDropdown.title = 'Select attribute to colour-code';
    this._attributeDropdown.addEventListener('change', () => {
      this._activeAttributeKey = this._attributeDropdown.value || null;
      this._renderContent();
    });

    attrSelector.appendChild(attrLabel);
    attrSelector.appendChild(this._attributeDropdown);
    panel.appendChild(attrSelector);

    // ── Content Zone ──────────────────────────────────────────────────────
    this._contentZone = document.createElement('div');
    this._contentZone.className = 'aud-content-zone';
    panel.appendChild(this._contentZone);

    // ── Global Fix Bar ────────────────────────────────────────────────────
    this._globalFixBar = document.createElement('div');
    this._globalFixBar.className = 'aud-global-fix-bar';
    this._healthSummary = document.createElement('span');
    this._healthSummary.className = 'aud-health-summary';
    this._healthSummary.textContent = 'Select an element to inspect';
    this._globalFixBar.appendChild(this._healthSummary);

    const globalFixBtn = document.createElement('button');
    globalFixBtn.className = 'aud-global-fix-btn';
    globalFixBtn.id = 'aud-global-fix-btn';
    globalFixBtn.innerHTML = '⚡ FIX ALL';
    this._globalFixBar.appendChild(globalFixBtn);
    panel.appendChild(this._globalFixBar);

    this._el.appendChild(panel);
    document.body.appendChild(this._el);

    header.querySelector('#aud-refresh-btn')?.addEventListener('click', () => this.refresh());

    treeSectionHeader.querySelector('#aud-tree-collapse')?.addEventListener('click', () => {
      const isOpen = !this._projectTreeZone.classList.contains('aud-project-tree--collapsed');
      this._projectTreeZone.classList.toggle('aud-project-tree--collapsed', isOpen);
      const btn = treeSectionHeader.querySelector<HTMLButtonElement>('#aud-tree-collapse');
      if (btn) btn.textContent = isOpen ? '▸' : '▾';
    });

    globalFixBtn.addEventListener('click', () => {
      onGlobalFix(this._makeGridState());
    });
  }

  // ── Event binding ──────────────────────────────────────────────────────────

  private _bindEvents(): void {
    // F.events.6 — pryzm-workspace-mode migrated to runtime.events typed bus.
    this.runtime?.events?.on('pryzm-workspace-mode', (payload: unknown) => {
      const mode = (payload as { mode?: string })?.mode;
      if (mode === 'inspect') {
        this._show();
      } else {
        this._hide();
      }
    });

    // F.events.6 — pryzm-delta-updated migrated to runtime.events typed bus.
    this.runtime?.events?.on('pryzm-delta-updated', () => {
      if (this._el.classList.contains('aud-stack--visible')) this.refresh();
    });

    this.runtime?.events?.on('pryzm-audit-room-select', ({ roomId, source }) => { // F.events.12
      if (roomId && source !== 'audit-stack') {
        this._selectedRoomId = roomId;
        this._renderProjectTree();
        this._renderContent();
      }
    });

    // F.events.16 — bim-selection-changed migrated to runtime.events typed bus.
    window.runtime?.events?.on('bim-selection-changed', (payload: unknown) => {
      const obj  = (payload as { object?: { userData?: { id?: string; type?: string } } | null })?.object;
      const id   = obj?.userData?.id ?? null;
      if (!id || !this._el.classList.contains('aud-stack--visible')) return;
      const type = ((obj?.userData?.type ?? '') as string).toLowerCase();
      if (type === 'room') {
        if (this._selectedRoomId !== id) {
          this._selectedRoomId = id;
          this._renderProjectTree();
        }
      } else {
        if (this._selectedElementId !== id) {
          this._selectedElementId = id;
          this._renderProjectTree();
        }
      }
    });

    const refreshAll = () => {
      if (this._el.classList.contains('aud-stack--visible')) this.refresh();
    };
    window.addEventListener('wall:walls-changed',  refreshAll);
    window.addEventListener('bim-room-added',       refreshAll);
    window.addEventListener('bim-room-updated',     refreshAll);
    window.addEventListener('bim-room-removed',     refreshAll);
    window.addEventListener('level-changed',        refreshAll);
    window.runtime?.events?.on('model-updated', () => refreshAll()); // F.events.8
  }

  // ── Show / Hide ────────────────────────────────────────────────────────────

  private _show(): void {
    this._el.classList.add('aud-stack--visible');
    this.refresh();
    this._dispatchInspectMode();
  }

  private _hide(): void {
    this._el.classList.remove('aud-stack--visible');
  }

  private _dispatchInspectMode(): void {
    const deltaMap = comparisonEngine.getDeltaMap();
    if (deltaMap.size === 0 && this._activeElementType === 'rooms') {
      const rooms = getAllRooms();
      // F.events.5 — migrated from DOM CustomEvent to runtime.events typed bus.
      this.runtime?.events?.emit('pryzm-inspect-discovery', { rooms, elementType: this._activeElementType });
    }
  }

  // ── Rendering delegates ────────────────────────────────────────────────────

  private _renderProjectTree(): void {
    const treeState: ProjectTreeState = {
      selectedRoomId:     this._selectedRoomId,
      selectedElementId:  this._selectedElementId,
      treeExpandedLevels: this._treeExpandedLevels,
      treeExpandedTypes:  this._treeExpandedTypes,
      onRoomSelect: (roomId) => {
        this._selectedRoomId = roomId;
        if (this._activeElementType !== 'rooms') {
          this._activeElementType = 'rooms';
          this._elementDropdown.value = 'rooms';
          // F.events.6 — pryzm-inspect-element-type migrated to runtime.events typed bus.
          this.runtime?.events?.emit('pryzm-inspect-element-type', { elementType: 'rooms' });
        }
        this._renderProjectTree();
        this._renderContent();
      },
      onElementSelect: (elemId) => {
        this._selectedElementId = elemId;
        this._renderProjectTree();
        this._renderContent();
      },
    };
    renderProjectTree(this._projectTreeZone, treeState);
  }

  private _renderContent(): void {
    this._contentZone.innerHTML = '';
    this._globalFixBar.style.display = 'none';

    if (this._activeElementType === 'rooms') {
      const deltaMap = comparisonEngine.getDeltaMap();
      if (deltaMap.size === 0) {
        renderDiscoveryMode(this._contentZone, this._makeDiscoveryState());
      } else {
        const tableBodyRef   = { current: null as HTMLElement | null };
        const filterPillsRef = { current: null as HTMLElement | null };
        renderAuditMode(this._contentZone, this._makeGridState(), tableBodyRef, filterPillsRef);
        this._globalFixBar.style.display = '';
        renderGlobalFixBar(this._globalFixBar, this._healthSummary, this._makeGridState());
      }
    } else {
      renderPolymorphicMatrix(this._contentZone, this._makeGridState());
      const fixBtn = this._globalFixBar.querySelector<HTMLButtonElement>('#aud-global-fix-btn');
      if (fixBtn) {
        fixBtn.disabled = true;
        fixBtn.style.opacity = '0.35';
        fixBtn.title = 'Auto-remediation for non-room elements — coming in Phase 4';
      }
      this._globalFixBar.style.display = '';
    }
  }

  // ── State bag factories ────────────────────────────────────────────────────

  private _makeDiscoveryState(): DiscoveryModeState {
    return {
      selectedRoomId:    this._selectedRoomId,
      activeAttributeKey: this._activeAttributeKey,
      activeElementType: this._activeElementType,
      setSelectedRoomId: (id) => { this._selectedRoomId = id; },
      onRoomSelect: (roomId) => {
        this._selectedRoomId = roomId;
        this._renderProjectTree();
        this._renderContent();
      },
    };
  }

  private _makeGridState(): AuditGridState {
    return {
      selectedRoomId:     this._selectedRoomId,
      activeCategories:   this._activeCategories,
      activeElementType:  this._activeElementType,
      activeAttributeKey: this._activeAttributeKey,
      attributeDropdown:  this._attributeDropdown,
      runtime:            this.runtime,
      setSelectedRoomId:  (id) => { this._selectedRoomId = id; },
      setActiveCategories: (cats) => { this._activeCategories = cats; },
      onRenderContent:    () => this._renderContent(),
      onRenderGrid:       (_tb) => { /* tableBody managed by zone refs */ },
    };
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────
// NOTE: runtime is null until instantiation site passes a live runtime.
// TODO(E.5.x): Wire live runtime at instantiation site (Layout.ts or initUI.ts)
// so runtime.commandBus.dispatch() in _dispatchFix is not a silent no-op.
export const auditStack = new AuditStack();
