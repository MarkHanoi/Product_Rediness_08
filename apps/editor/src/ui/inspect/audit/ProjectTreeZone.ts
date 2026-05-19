/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Inspect Mode RHS Panel (Phase 1.3 → 1.5)
 * File:             src/ui/inspect/audit/ProjectTreeZone.ts
 * Split from:       src/ui/inspect/AuditStack.ts (Wave 14 FILE 5 split)
 * Contract:         05-BIM-UI-ARCHITECTURE-CONTRACT §3 (CSS prefix: aud-)
 *
 * Zone: Mini Project Browser Tree (Building → Level → Element types → Elements).
 *
 * Exports:
 *   renderProjectTree   — full tree render into the project-tree zone container
 *   renderTreeBody      — tree body (levels + type groups) with filter support
 *   renderTypesForLevel — per-level element-type groups with expand/collapse
 *   countAllElements    — total element count across tracked stores
 *   getElementIcon      — returns inline SVG for a store key
 */

import { selectionBus } from '@pryzm/core-app-model';

// ── State bag consumed by tree zone ──────────────────────────────────────────

export interface ProjectTreeState {
  selectedRoomId:     string | null;
  selectedElementId:  string | null;
  treeExpandedLevels: Set<string>;
  treeExpandedTypes:  Map<string, Set<string>>;
  onRoomSelect:    (roomId: string) => void;
  onElementSelect: (elemId: string) => void;
}

// ── Full project tree render ──────────────────────────────────────────────────

export function renderProjectTree(container: HTMLElement, state: ProjectTreeState): void {
  container.innerHTML = '';

  const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
  if (!bimManager) {
    const msg = document.createElement('div');
    msg.className = 'aud-tree-empty';
    msg.textContent = 'Model not ready.';
    container.appendChild(msg);
    return;
  }

  // ── Breadcrumb ─────────────────────────────────────────────────────────────
  const breadcrumb = document.createElement('div');
  breadcrumb.className = 'aud-breadcrumb';
  breadcrumb.innerHTML = '<span>Project</span> › <span>Building</span> › <span>Ground</span>';
  container.appendChild(breadcrumb);

  // ── Search bar ─────────────────────────────────────────────────────────────
  const searchWrap = document.createElement('div');
  searchWrap.className = 'aud-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'aud-search';
  searchInput.placeholder = 'Search everything...';
  const treeBody = document.createElement('div');
  treeBody.className = 'aud-tree-body';
  searchInput.addEventListener('input', () => {
    renderTreeBody(treeBody, searchInput.value.toLowerCase().trim(), bimManager, state);
  });
  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);

  // ── Tree body ──────────────────────────────────────────────────────────────
  container.appendChild(treeBody);
  renderTreeBody(treeBody, '', bimManager, state);
}

// ── Tree body ─────────────────────────────────────────────────────────────────

export function renderTreeBody(
  container:  HTMLElement,
  filter:     string,
  bimManager: any,
  state:      ProjectTreeState,
): void {
  container.innerHTML = '';

  const levels: any[] = (bimManager.getLevels?.() ?? [])
    .slice()
    .sort((a: any, b: any) => a.elevation - b.elevation);

  const totalElements = countAllElements();
  const projectRow = document.createElement('div');
  projectRow.className = 'aud-tree-project-row';
  projectRow.innerHTML = `
    <span class="aud-tree-dot">●</span>
    <span class="aud-tree-row-label">PROJECT</span>
    <span class="aud-tree-row-meta">${levels.length} level${levels.length !== 1 ? 's' : ''} · ${totalElements} elements</span>
  `;
  container.appendChild(projectRow);

  const buildingRow = document.createElement('div');
  buildingRow.className = 'aud-tree-building-row';
  buildingRow.innerHTML = `
    <span class="aud-tree-icon"><svg width="13" height="13" viewBox="0 0 15 15" fill="none"><rect x="2" y="3" width="11" height="11" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M5 3V2a2.5 2.5 0 015 0v1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><rect x="5" y="8" width="2" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/><rect x="8" y="8" width="2" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/><line x1="2" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1"/></svg></span>
    <span class="aud-tree-row-label">Building</span>
  `;
  container.appendChild(buildingRow);

  const siteRow = document.createElement('div');
  siteRow.className = 'aud-tree-site-row';
  siteRow.innerHTML = `
    <span class="aud-tree-icon" style="margin-left:10px;"><svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M7.5 1.5C5.5 1.5 4 3.2 4 5.5c0 3.3 3.5 7.5 3.5 7.5s3.5-4.2 3.5-7.5c0-2.3-1.5-4-3.5-4z" stroke="currentColor" stroke-width="1.2"/><circle cx="7.5" cy="5.5" r="1.4" stroke="currentColor" stroke-width="1.1"/></svg></span>
    <span class="aud-tree-row-label">Site</span>
  `;
  container.appendChild(siteRow);

  // Auto-expand all levels on first render
  if (state.treeExpandedLevels.size === 0 && levels.length > 0) {
    levels.forEach(l => state.treeExpandedLevels.add(l.id));
    const firstLevel = levels[0];
    if (firstLevel && !state.treeExpandedTypes.has(firstLevel.id)) {
      state.treeExpandedTypes.set(firstLevel.id, new Set(['WALL', 'ROOM', 'SLAB', 'COLUMN']));
    }
  }

  // ── Level rows ─────────────────────────────────────────────────────────────
  for (const level of levels) {
    const projectCtx = window.projectContext; // TODO(C.3.x): legacy projectContext — replace with runtime.projectContext
    const isActive   = level.id === (projectCtx?.activeLevelId ?? bimManager.getActiveLevelId?.());
    const levelKey   = level.id;
    const isExpanded = state.treeExpandedLevels.has(levelKey);

    const levelRow = document.createElement('div');
    levelRow.className = 'aud-tree-level-row';

    const expandBtn = document.createElement('button');
    expandBtn.className = 'aud-tree-expand-btn';
    expandBtn.textContent = isExpanded ? '▾' : '▸';

    const levelIcon = document.createElement('span');
    levelIcon.className = 'aud-tree-icon';
    levelIcon.style.marginLeft = '16px';
    const _lvlIconColor = isActive ? '#6600FF' : '#8888aa';
    levelIcon.innerHTML = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="4" width="12" height="8" rx="1" stroke="${_lvlIconColor}" stroke-width="1.1"/><line x1="1" y1="7" x2="13" y2="7" stroke="${_lvlIconColor}" stroke-width="1"/><line x1="3" y1="2.5" x2="11" y2="2.5" stroke="${_lvlIconColor}" stroke-width="1" stroke-linecap="round"/><line x1="5" y1="1" x2="9" y2="1" stroke="${_lvlIconColor}" stroke-width="1" stroke-linecap="round"/></svg>`;

    const levelLabel = document.createElement('span');
    levelLabel.className = 'aud-tree-row-label';
    levelLabel.textContent = `${level.name} (${level.elevation}m)`;

    levelRow.appendChild(expandBtn);
    levelRow.appendChild(levelIcon);
    levelRow.appendChild(levelLabel);

    if (isActive) {
      const activeBadge = document.createElement('span');
      activeBadge.className = 'aud-tree-active-badge';
      activeBadge.textContent = 'ACTIVE';
      levelRow.appendChild(activeBadge);
    }

    container.appendChild(levelRow);

    const typeContainer = document.createElement('div');
    typeContainer.className = 'aud-tree-type-container';
    if (!isExpanded) typeContainer.style.display = 'none';
    container.appendChild(typeContainer);

    expandBtn.addEventListener('click', () => {
      const open = !state.treeExpandedLevels.has(levelKey);
      if (open) {
        state.treeExpandedLevels.add(levelKey);
      } else {
        state.treeExpandedLevels.delete(levelKey);
      }
      expandBtn.textContent = open ? '▾' : '▸';
      typeContainer.style.display = open ? '' : 'none';
    });

    levelRow.addEventListener('click', (e) => {
      if (e.target === expandBtn) return;
      expandBtn.click();
    });

    renderTypesForLevel(typeContainer, level, filter, state);
  }
}

// ── Per-level element type groups ─────────────────────────────────────────────

export function renderTypesForLevel(
  container: HTMLElement,
  level:     any,
  filter:    string,
  state:     ProjectTreeState,
): void {
  const stores: Array<{ storeKey: string; label: string; childLabel?: string; childStoreKey?: string }> = [
    { storeKey: 'roomStore',   label: 'ROOM' },
    { storeKey: 'wallStore',   label: 'WALL', childLabel: 'DOOR', childStoreKey: 'doorStore' },
    { storeKey: 'slabStore',   label: 'SLAB' },
    { storeKey: 'columnStore', label: 'COLUMN' },
  ];

  for (const { storeKey, label, childLabel, childStoreKey } of stores) {
    const store = ((window as unknown as Record<string, any>))[storeKey]; // TODO(E.<family>.S): legacy per-family window store reach — replace with runtime.stores.<family> when family stores are exposed via runtime in Phase E/F
    if (!store?.getAll) continue;

    let elements: any[] = store.getAll().filter(
      (el: any) => String(el.levelId) === String(level.id)
    );

    if (filter) {
      elements = elements.filter((el: any) => {
        const name = (el.name || el.label || el.id || '').toLowerCase();
        return name.includes(filter);
      });
    }

    if (elements.length === 0) continue;

    const isTypeExpanded = state.treeExpandedTypes.get(level.id)?.has(label) ?? false;

    const typeRow = document.createElement('div');
    typeRow.className = 'aud-tree-type-row';

    const typeExpandBtn = document.createElement('button');
    typeExpandBtn.className = 'aud-tree-expand-btn';
    typeExpandBtn.textContent = isTypeExpanded ? '▾' : '▸';
    typeExpandBtn.style.marginLeft = '24px';

    const typeLabel = document.createElement('span');
    typeLabel.className = 'aud-tree-type-label';
    typeLabel.textContent = label;

    const typeCount = document.createElement('span');
    typeCount.className = 'aud-tree-type-count';
    typeCount.textContent = String(elements.length);

    typeRow.appendChild(typeExpandBtn);
    typeRow.appendChild(typeLabel);
    typeRow.appendChild(typeCount);
    container.appendChild(typeRow);

    const elemContainer = document.createElement('div');
    elemContainer.className = 'aud-tree-elem-container';
    if (!isTypeExpanded) elemContainer.style.display = 'none';
    container.appendChild(elemContainer);

    typeExpandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !(state.treeExpandedTypes.get(level.id)?.has(label) ?? false);
      if (!state.treeExpandedTypes.has(level.id)) {
        state.treeExpandedTypes.set(level.id, new Set());
      }
      if (open) {
        state.treeExpandedTypes.get(level.id)!.add(label);
      } else {
        state.treeExpandedTypes.get(level.id)!.delete(label);
      }
      typeExpandBtn.textContent = open ? '▾' : '▸';
      elemContainer.style.display = open ? '' : 'none';
    });

    typeRow.addEventListener('click', (e) => {
      if (e.target === typeExpandBtn) return;
      typeExpandBtn.click();
    });

    for (const el of elements) {
      const elemRow = document.createElement('div');
      const isSelected = storeKey === 'roomStore'
        ? state.selectedRoomId === el.id
        : state.selectedElementId === el.id;

      elemRow.className = `aud-tree-elem-row ${isSelected ? 'aud-tree-selected' : ''}`;
      elemRow.style.marginLeft = '36px';

      const elemIcon = document.createElement('span');
      elemIcon.className = 'aud-tree-elem-icon';
      elemIcon.innerHTML = getElementIcon(storeKey);

      const elemLabel = document.createElement('span');
      elemLabel.className = 'aud-tree-elem-label';
      elemLabel.textContent = el.name || el.label || `${label} ${el.id.substring(0, 4).toUpperCase()}`;
      elemLabel.title = el.id;

      elemRow.appendChild(elemIcon);
      elemRow.appendChild(elemLabel);
      elemContainer.appendChild(elemRow);

      elemRow.addEventListener('click', () => {
        if (storeKey === 'roomStore') {
          state.onRoomSelect(el.id);
        } else {
          state.onElementSelect(el.id);
        }
        window.runtime?.events?.emit('pryzm-audit-room-select', { roomId: el.id, source: 'audit-stack' }); // F.events.12
        // F.events.6 — pryzm-inspect-room-focus migrated to runtime.events typed bus.
        window.runtime?.events?.emit('pryzm-inspect-room-focus', { roomId: el.id });
        selectionBus.select(el.id, 'inspect-panel');
      });

      // ── Children (e.g., doors inside walls) ─────────────────────────────
      if (childLabel && childStoreKey) {
        const childStore = ((window as unknown as Record<string, any>))[childStoreKey]; // TODO(E.<family>.S)
        if (childStore?.getAll) {
          const children: any[] = childStore.getAll().filter(
            (c: any) => String(c.hostWallId) === String(el.id) || String(c.wallId) === String(el.id)
          );
          for (const child of children) {
            const childRow = document.createElement('div');
            childRow.className = 'aud-tree-child-row';
            childRow.style.marginLeft = '48px';

            const childIcon = document.createElement('span');
            childIcon.className = 'aud-tree-elem-icon';
            childIcon.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="3" y="1.5" width="7" height="10" rx="0.5" stroke="#888" stroke-width="1.1"/><circle cx="9" cy="6.5" r="0.8" fill="#888"/></svg>`;

            const childLabelEl = document.createElement('span');
            childLabelEl.className = 'aud-tree-elem-label';
            childLabelEl.textContent = child.name || child.label || `${childLabel} ${child.id.substring(0, 4).toUpperCase()}`;
            childLabelEl.title = child.id;

            childRow.appendChild(childIcon);
            childRow.appendChild(childLabelEl);
            elemContainer.appendChild(childRow);
          }
        }
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function countAllElements(): number {
  let count = 0;
  for (const key of ['roomStore', 'wallStore', 'slabStore', 'columnStore', 'doorStore', 'windowStore']) {
    const store = ((window as unknown as Record<string, any>))[key]; // TODO(E.<family>.S)
    if (store?.getAll) count += store.getAll().length;
  }
  return count;
}

export function getElementIcon(storeKey: string): string {
  if (storeKey === 'roomStore')      return `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="1.5" width="10" height="10" rx="0.5" stroke="#888" stroke-width="1.1"/><path d="M1.5 6h5.5v5.5" stroke="#888" stroke-width="1" stroke-linecap="round"/></svg>`;
  if (storeKey === 'wallStore')      return `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="8" rx="0.5" stroke="#888" stroke-width="1.1"/><line x1="1.5" y1="5.5" x2="11.5" y2="5.5" stroke="#888" stroke-width="1"/><line x1="6.5" y1="5.5" x2="6.5" y2="10.5" stroke="#888" stroke-width="1"/></svg>`;
  if (storeKey === 'doorStore')      return `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="3" y="1.5" width="7" height="10" rx="0.5" stroke="#888" stroke-width="1.1"/><circle cx="9" cy="6.5" r="0.8" fill="#888"/></svg>`;
  if (storeKey === 'windowStore')    return `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="2" width="9" height="9" rx="0.5" stroke="#888" stroke-width="1.1"/><line x1="6.5" y1="2" x2="6.5" y2="11" stroke="#888" stroke-width="1"/><line x1="2" y1="6.5" x2="11" y2="6.5" stroke="#888" stroke-width="1"/></svg>`;
  if (storeKey === 'slabStore')      return `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="5" width="11" height="5" rx="0.5" stroke="#888" stroke-width="1.1"/><rect x="1" y="3" width="11" height="2" rx="0.5" stroke="#888" stroke-width="1"/></svg>`;
  if (storeKey === 'columnStore')    return `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="4.5" y="1.5" width="4" height="10" rx="0.5" stroke="#888" stroke-width="1.1"/><line x1="2" y1="2.5" x2="11" y2="2.5" stroke="#888" stroke-width="1"/><line x1="2" y1="10.5" x2="11" y2="10.5" stroke="#888" stroke-width="1"/></svg>`;
  if (storeKey === 'stairStore')     return `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 10h3V7h3V4h3V1" stroke="#888" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (storeKey === 'furnitureStore') return `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="3.5" width="9" height="8" rx="1" stroke="#888" stroke-width="1.1"/><path d="M4.5 3.5V3a1.5 1.5 0 013 0v.5" stroke="#888" stroke-width="1"/></svg>`;
  return `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="2" width="9" height="9" rx="1" stroke="#888" stroke-width="1"/></svg>`;
}
