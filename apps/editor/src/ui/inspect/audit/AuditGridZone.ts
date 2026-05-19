/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Inspect Mode RHS Panel (Phase 1.3 → 1.5)
 * File:             src/ui/inspect/audit/AuditGridZone.ts
 * Split from:       src/ui/inspect/AuditStack.ts (Wave 14 FILE 5 split)
 * Contract:         05-BIM-UI-ARCHITECTURE-CONTRACT §3 (CSS prefix: aud-)
 *                   01-BIM-ENGINE-CORE-CONTRACT §1 (P6 — mutations via commandBus only)
 *
 * Zone: Audit Mode grid (brief present — health scores, delta rows, polymorphic
 * element matrix, global fix bar, per-entry fix buttons).
 *
 * P6 fix applied here:
 *   `window.the legacy command manager`
 *   → `runtime.commandBus.dispatch(cmd)`
 *   Metadata preserved via console note per TODO(E.5.x).
 *
 * Exports:
 *   renderAuditMode         — full audit mode panel (brief present)
 *   buildFilterPills        — category pill bar
 *   renderPolymorphicMatrix — non-room element type matrix table
 *   renderGrid              — per-room comparison rows
 *   renderGlobalFixBar      — fix-all bar with health summary
 *   dispatchFix             — P6-fixed command dispatch
 *   computeHealthScore      — % pass for a set of DeltaEntry
 *   healthBadgeColor        — colour token for a health score
 *   getRoomLabel            — room display name from store
 *   formatValue             — number/string cell formatter
 */

import { comparisonEngine, type DeltaEntry, type DeltaCategory } from '@pryzm/core-app-model';
import { AutoRemediateCommand } from '@pryzm/core-app-model';
import {
  type InspectElementType,
  ELEMENT_TYPE_LABELS,
  ELEMENT_ATTRIBUTES,
  attributeHeatColor,
  storeKeyForType,
  buildHeatmapData,
} from './ElementTypeSelectorZone';

// ── Filter category labels ────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<DeltaCategory, string> = {
  spatial:  'Area',
  openings: 'Openings',
  finishes: 'Finishes',
  systems:  'Systems',
  physics:  'Physics',
  assets:   'Assets',
  safety:   'Safety',
};

// ── State bags ────────────────────────────────────────────────────────────────

export interface AuditGridState {
  selectedRoomId:    string | null;
  activeCategories:  Set<DeltaCategory>;
  activeElementType: InspectElementType;
  activeAttributeKey: string | null;
  attributeDropdown: HTMLSelectElement;
  runtime:           import('@pryzm/runtime-composer/types').PryzmRuntime | null;
  setSelectedRoomId: (id: string) => void;
  setActiveCategories: (cats: Set<DeltaCategory>) => void;
  onRenderContent:   () => void;
  onRenderGrid:      (tableBody: HTMLElement) => void;
}

// ── Health helpers ────────────────────────────────────────────────────────────

export function computeHealthScore(entries: readonly DeltaEntry[]): number {
  if (entries.length === 0) return 100;
  const pass = entries.filter(e => e.status === 'PASS').length;
  return Math.round((pass / entries.length) * 100);
}

export function healthBadgeColor(score: number): string {
  if (score >= 80) return 'var(--app-green, #00ff88)';
  if (score >= 50) return 'var(--app-amber, #ffee00)';
  return 'var(--app-red, #ff3344)';
}

// ── Room label helper ─────────────────────────────────────────────────────────

export function getRoomLabel(roomId: string, rs: any): string {
  if (!rs) return roomId;
  try {
    const all: any[] = rs.getAll?.() ?? [];
    const room = all.find((r: any) => r.id === roomId);
    return room?.name || room?.label || roomId;
  } catch {
    return roomId;
  }
}

// ── Value formatter ───────────────────────────────────────────────────────────

export function formatValue(val: number | string): string {
  if (val === undefined || val === null) return '—';
  if (typeof val === 'number') return val % 1 === 0 ? String(val) : val.toFixed(2);
  return String(val);
}

// ── P6-fixed command dispatch ─────────────────────────────────────────────────

export function dispatchFix(
  entries:     readonly DeltaEntry[],
  roomId:      string,
  runtime:     import('@pryzm/runtime-composer/types').PryzmRuntime | null,
): void {
  if (!runtime?.bus) {
    console.warn('[AuditStack] runtime.bus not available — fix skipped');
    return;
  }

  const cmd = new AutoRemediateCommand({ roomId, entries });

  // canExecute still reads legacy commandManager context — TODO(E.5.x): migrate when
  // runtime.bus exposes its own execution context.
  const ctx        = (window.commandManager?.getContext?.() ?? {}) // TODO(TASK-06);
  const validation = cmd.canExecute(ctx);
  if (!validation.ok) {
    console.warn(`[AuditStack] AutoRemediateCommand canExecute failed: ${validation.reason}`);
    return;
  }

  // NOTE: { source: 'HUMAN_DIRECT' } metadata preserved via log.
  // TODO(E.5.x): embed source in AutoRemediateCommand constructor when command schema is updated.
  console.log('[AuditStack] dispatch source: HUMAN_DIRECT — TODO(E.5.x): embed source in AutoRemediateCommand ctor');
  runtime.bus.executeCommand(cmd.type, cmd);
  console.log(`[AuditStack] AutoRemediateCommand dispatched for room ${roomId}`);
}

// ── Audit Mode ────────────────────────────────────────────────────────────────

export function renderAuditMode(
  contentZone: HTMLElement,
  state:       AuditGridState,
  tableBodyRef: { current: HTMLElement | null },
  filterPillsRef: { current: HTMLElement | null },
): void {
  const subHeader = document.createElement('div');
  subHeader.className = 'aud-audit-subheader';
  subHeader.innerHTML = `<span class="aud-audit-badge">◈ AUDIT</span><span class="aud-audit-subtitle">Click a room to compare against brief</span>`;
  contentZone.appendChild(subHeader);

  const filterPills = document.createElement('div');
  filterPills.className = 'aud-filter-pills';
  filterPillsRef.current = filterPills;
  buildFilterPills(filterPills, state, tableBodyRef);
  contentZone.appendChild(filterPills);

  const deltaMap = comparisonEngine.getDeltaMap();
  const rs       = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
  const roomTreeWrap = document.createElement('div');
  roomTreeWrap.className = 'aud-audit-room-list';
  contentZone.appendChild(roomTreeWrap);

  deltaMap.forEach((entries, roomId) => {
    const score      = computeHealthScore(entries);
    const roomLabel  = getRoomLabel(roomId, rs);
    const failCount  = entries.filter(e => e.status === 'FAIL').length;
    const isSelected = state.selectedRoomId === roomId;

    const node = document.createElement('div');
    node.className = `aud-audit-room-row ${isSelected ? 'aud-tree-selected' : ''}`;

    const dot = document.createElement('span');
    dot.className = 'aud-audit-room-dot';
    dot.style.background = healthBadgeColor(score);

    const lbl = document.createElement('span');
    lbl.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;font-size:11px;';
    lbl.title       = roomId;
    lbl.textContent = roomLabel;

    const badge = document.createElement('span');
    badge.className   = 'aud-health-badge';
    badge.textContent = `${score}%`;
    badge.style.background = healthBadgeColor(score);
    badge.style.color      = score >= 50 ? '#000' : '#fff';

    node.appendChild(dot);
    node.appendChild(lbl);
    node.appendChild(badge);

    if (failCount > 0) {
      const fb = document.createElement('span');
      fb.style.cssText = 'margin-left:4px;font-size:9px;color:var(--app-red,#ff3344);flex-shrink:0;';
      fb.textContent = `${failCount}✗`;
      node.appendChild(fb);
    }

    node.addEventListener('click', () => {
      state.setSelectedRoomId(roomId);
      state.onRenderContent();
      window.runtime?.events?.emit('pryzm-audit-room-select', { roomId, source: 'audit-stack' }); // F.events.12
      // F.events.6 — pryzm-inspect-room-focus migrated to runtime.events typed bus.
      window.runtime?.events?.emit('pryzm-inspect-room-focus', { roomId });
    });

    roomTreeWrap.appendChild(node);
  });

  const tableWrap = document.createElement('div');
  tableWrap.className = 'aud-table';

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;';

  const thead = document.createElement('thead');
  thead.className = 'aud-table-head';
  thead.innerHTML = `
    <tr>
      <th></th>
      <th>Metric</th>
      <th>Required</th>
      <th>Actual</th>
      <th>Delta</th>
      <th></th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  tbody.className = 'aud-table-body';
  tableBodyRef.current = tbody;
  table.appendChild(tbody);

  tableWrap.appendChild(table);
  contentZone.appendChild(tableWrap);

  renderGrid(tbody, state);
}

// ── Filter pills ──────────────────────────────────────────────────────────────

export function buildFilterPills(
  filterPills:   HTMLElement,
  state:         AuditGridState,
  tableBodyRef:  { current: HTMLElement | null },
): void {
  filterPills.innerHTML = '';

  const allPill = document.createElement('button');
  allPill.className = `aud-filter-pill ${state.activeCategories.size === 0 ? 'aud-filter-active' : ''}`;
  allPill.textContent = 'All';
  allPill.addEventListener('click', () => {
    state.activeCategories.clear();
    buildFilterPills(filterPills, state, tableBodyRef);
    if (tableBodyRef.current) renderGrid(tableBodyRef.current, state);
  });
  filterPills.appendChild(allPill);

  (Object.keys(CATEGORY_LABELS) as DeltaCategory[]).forEach(cat => {
    const pill     = document.createElement('button');
    const isActive = state.activeCategories.has(cat);
    pill.className   = `aud-filter-pill ${isActive ? 'aud-filter-active' : ''}`;
    pill.textContent = CATEGORY_LABELS[cat];
    pill.addEventListener('click', () => {
      if (state.activeCategories.has(cat)) {
        state.activeCategories.delete(cat);
      } else {
        state.activeCategories.add(cat);
      }
      buildFilterPills(filterPills, state, tableBodyRef);
      if (tableBodyRef.current) renderGrid(tableBodyRef.current, state);
    });
    filterPills.appendChild(pill);
  });
}

// ── Comparison grid ───────────────────────────────────────────────────────────

export function renderGrid(tableBody: HTMLElement, state: AuditGridState): void {
  tableBody.innerHTML = '';

  if (!state.selectedRoomId) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.style.cssText = 'text-align:center;padding:20px;color:var(--app-text-muted,#888);font-size:11px;';
    td.textContent = 'Click a room above to view its delta analysis';
    tr.appendChild(td);
    tableBody.appendChild(tr);
    return;
  }

  const deltaMap = comparisonEngine.getDeltaMap();
  const entries  = deltaMap.get(state.selectedRoomId) ?? [];
  const filtered = state.activeCategories.size === 0
    ? entries
    : entries.filter(e => state.activeCategories.has(e.category));

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.style.cssText = 'text-align:center;padding:16px;color:var(--app-text-muted,#888);font-size:11px;';
    td.textContent = entries.length === 0
      ? 'No requirements defined for this room'
      : 'No entries match the active filters';
    tr.appendChild(td);
    tableBody.appendChild(tr);
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    const order = { FAIL: 0, WARN: 1, CODE: 2, MISSING: 3, PASS: 4 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });

  for (const entry of sorted) {
    const tr = document.createElement('tr');

    const tdDot = document.createElement('td');
    tdDot.style.width = '20px';
    const dot = document.createElement('span');
    dot.className = `aud-status-badge aud-status-${entry.severity}`;
    tdDot.appendChild(dot);

    const tdMetric = document.createElement('td');
    tdMetric.textContent = entry.metric;
    tdMetric.title = `Category: ${entry.category}`;

    const tdReq = document.createElement('td');
    tdReq.textContent = formatValue(entry.required);
    tdReq.style.color = 'var(--app-text-muted,#888)';

    const tdActual = document.createElement('td');
    tdActual.textContent = formatValue(entry.actual);
    tdActual.style.color = entry.status === 'PASS'
      ? 'var(--app-green,#00ff88)'
      : entry.status === 'FAIL'
        ? 'var(--app-red,#ff3344)'
        : 'var(--app-amber,#ffee00)';

    const tdDelta = document.createElement('td');
    const deltaVal = typeof entry.delta === 'number'
      ? (entry.delta > 0 ? `+${entry.delta.toFixed(2)}` : entry.delta.toFixed(2))
      : String(entry.delta);
    tdDelta.textContent = deltaVal;
    tdDelta.style.color = 'var(--app-text-muted,#888)';

    const tdFix = document.createElement('td');
    if (entry.status === 'FAIL') {
      const fixBtn = document.createElement('button');
      fixBtn.className   = 'aud-fix-btn';
      fixBtn.textContent = 'FIX';
      fixBtn.title = `Auto-remediate: ${entry.metric}`;
      fixBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (state.selectedRoomId) {
          dispatchFix([entry], state.selectedRoomId, state.runtime);
        }
      });
      tdFix.appendChild(fixBtn);
    }

    tr.append(tdDot, tdMetric, tdReq, tdActual, tdDelta, tdFix);
    tableBody.appendChild(tr);
  }
}

// ── Global fix bar ────────────────────────────────────────────────────────────

export function renderGlobalFixBar(
  globalFixBar:  HTMLElement,
  healthSummary: HTMLElement,
  state:         AuditGridState,
): void {
  if (!state.selectedRoomId) {
    healthSummary.textContent = 'Select a room to view delta analysis';
    return;
  }

  const deltaMap  = comparisonEngine.getDeltaMap();
  const entries   = deltaMap.get(state.selectedRoomId) ?? [];
  const score     = computeHealthScore(entries);
  const failCount = entries.filter(e => e.status === 'FAIL').length;
  const rs        = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
  const roomLabel = getRoomLabel(state.selectedRoomId, rs);

  healthSummary.textContent =
    `${roomLabel} — Score: ${score}%  |  Fails: ${failCount}  |  Total: ${entries.length}`;

  const globalFixBtn = globalFixBar.querySelector<HTMLButtonElement>('#aud-global-fix-btn');
  if (globalFixBtn) {
    globalFixBtn.disabled     = failCount === 0;
    globalFixBtn.style.opacity = failCount === 0 ? '0.4' : '1';
  }
}

export function onGlobalFix(state: AuditGridState): void {
  if (!state.selectedRoomId) return;
  const deltaMap = comparisonEngine.getDeltaMap();
  const entries  = deltaMap.get(state.selectedRoomId) ?? [];
  dispatchFix(entries as DeltaEntry[], state.selectedRoomId, state.runtime);
}

// ── Polymorphic Matrix (non-room element types) ───────────────────────────────

export function renderPolymorphicMatrix(contentZone: HTMLElement, state: AuditGridState): void {
  const type     = state.activeElementType;
  const storeKey = storeKeyForType(type);
  const store    = ((window as unknown as Record<string, any>))[storeKey]; // TODO(E.<family>.S)
  const schema   = ELEMENT_ATTRIBUTES[type] ?? [];

  const subHeader = document.createElement('div');
  subHeader.className = 'aud-audit-subheader';
  subHeader.innerHTML = `<span class="aud-audit-badge">◈ INSPECT</span><span class="aud-audit-subtitle">${ELEMENT_TYPE_LABELS[type]} — measured properties</span>`;
  contentZone.appendChild(subHeader);

  if (!store?.getAll) {
    const empty = document.createElement('div');
    empty.className = 'aud-discovery-empty';
    empty.textContent = `No ${ELEMENT_TYPE_LABELS[type].toLowerCase()} in model.`;
    contentZone.appendChild(empty);
    return;
  }

  let elements: any[];
  try { elements = Array.from(store.getAll()); } catch { elements = []; }

  if (elements.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'aud-discovery-empty';
    empty.textContent = `No ${ELEMENT_TYPE_LABELS[type].toLowerCase()} found.`;
    contentZone.appendChild(empty);
    return;
  }

  const activeDesc    = schema.find(a => a.key === state.activeAttributeKey);
  const numericVals: number[] = [];
  const elemValMap    = new Map<string, number | string | null>();
  for (const el of elements) {
    const v = activeDesc ? activeDesc.extract(el) : null;
    elemValMap.set(el.id, v);
    if (activeDesc?.numeric && typeof v === 'number') numericVals.push(v);
  }
  const minVal = numericVals.length ? Math.min(...numericVals) : 0;
  const maxVal = numericVals.length ? Math.max(...numericVals) : 1;

  const sorted = (activeDesc?.numeric && numericVals.length > 0)
    ? elements.slice().sort((a, b) => {
        const av = elemValMap.get(a.id);
        const bv = elemValMap.get(b.id);
        return (typeof bv === 'number' ? bv : -Infinity) - (typeof av === 'number' ? av : -Infinity);
      })
    : elements;

  const countBadge = document.createElement('div');
  countBadge.className   = 'aud-poly-count';
  countBadge.textContent = `${elements.length} ${ELEMENT_TYPE_LABELS[type].toLowerCase()}`;
  contentZone.appendChild(countBadge);

  const tableWrap = document.createElement('div');
  tableWrap.className    = 'aud-table';
  tableWrap.style.overflowX = 'auto';

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px;';

  const thead     = document.createElement('thead');
  thead.className = 'aud-table-head';
  const headerRow = document.createElement('tr');

  const thName = document.createElement('th');
  thName.textContent = 'Name';
  headerRow.appendChild(thName);

  for (const desc of schema) {
    const th       = document.createElement('th');
    const isActive = desc.key === state.activeAttributeKey;
    th.className   = `aud-matrix-th${isActive ? ' aud-matrix-th-active' : ''}`;
    th.textContent = desc.label + (desc.unit ? ` (${desc.unit})` : '');
    th.title       = `Sort / heatmap by ${desc.label}`;
    th.addEventListener('click', () => {
      state.activeAttributeKey = desc.key;
      state.attributeDropdown.value = desc.key;
      const heatmap = buildHeatmapData(type, desc.key);
      // F.events.6 — pryzm-inspect-attribute-focus migrated to runtime.events typed bus.
      window.runtime?.events?.emit('pryzm-inspect-attribute-focus', { elementType: type, attributeKey: desc.key, heatmap });
      state.onRenderContent();
    });
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody     = document.createElement('tbody');
  tbody.className = 'aud-table-body';

  for (const el of sorted) {
    const isSelected = state.selectedRoomId === el.id;
    const tr = document.createElement('tr');
    if (isSelected) tr.classList.add('aud-row-hover');

    const tdName = document.createElement('td');
    tdName.textContent = el.name || el.label
      || `${ELEMENT_TYPE_LABELS[type]} ${(el.id as string).substring(0, 4).toUpperCase()}`;
    tdName.title = el.id;
    tr.appendChild(tdName);

    for (const desc of schema) {
      const td         = document.createElement('td');
      const isActiveCol = desc.key === state.activeAttributeKey;
      if (isActiveCol) td.className = 'aud-matrix-cell-active';
      const raw = desc.extract(el);
      td.textContent = desc.format(raw);
      if (isActiveCol && desc.numeric && typeof raw === 'number') {
        const bar = document.createElement('div');
        bar.className    = 'aud-matrix-heat-bar';
        bar.style.background = attributeHeatColor(raw, minVal, maxVal);
        td.appendChild(bar);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);

    tr.addEventListener('click', () => {
      state.setSelectedRoomId(el.id);
      state.onRenderContent();
      window.runtime?.events?.emit('pryzm-audit-room-select', { roomId: el.id, source: 'audit-stack' }); // F.events.12
    });
  }

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  contentZone.appendChild(tableWrap);
}
