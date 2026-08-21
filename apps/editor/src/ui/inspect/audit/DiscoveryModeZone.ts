/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Inspect Mode RHS Panel (Phase 1.3 → 1.5)
 * File:             src/ui/inspect/audit/DiscoveryModeZone.ts
 * Split from:       src/ui/inspect/AuditStack.ts (Wave 14 FILE 5 split)
 * Contract:         05-BIM-UI-ARCHITECTURE-CONTRACT §3 (CSS prefix: aud-)
 *
 * Zone: Discovery Mode panel (shown when no brief is set; attribute heatmap of
 * measured values across rooms or other element types).
 *
 * Exports:
 *   renderDiscoveryMode          — main discovery panel render
 *   showDiscoveryTooltipFull     — hover tooltip with room dimension details
 *   hideDiscoveryTooltip         — dismiss the shared tooltip element
 *   (the heat ramp itself lives in ./heatRamp.ts — ONE definition, see §DISCOVERY-RAMP-IS-ONE)
 *   getAllRooms                  — snapshot of all rooms from legacy roomStore
 *   extractRoomAttrValue         — numeric attribute extractor (room object, key)
 *   extractRoomAttrString        — string attribute extractor (room object, key)
 */

import { selectionBus, boundingWallIdsOrUnknown } from '@pryzm/core-app-model';
import { escHtml } from '@pryzm/ui-base';
import { discoveryRampColor, publishDiscoveryRamp } from './heatRamp';
import {
  type AttrOption,
  type InspectElementType,
  getActiveAttrOption,
  buildAttributeMapping,
  renderAttributeRefusal,
} from './ElementTypeSelectorZone';

// ── State bag consumed by discovery zone ──────────────────────────────────────

export interface DiscoveryModeState {
  selectedRoomId:    string | null;
  activeAttributeKey: string | null;
  activeElementType: InspectElementType;
  setSelectedRoomId: (id: string) => void;
  onRoomSelect:      (roomId: string) => void;
}

// ── Room data helpers ─────────────────────────────────────────────────────────

export function getAllRooms(): Array<{ id: string; label: string; area: number; perimeter?: number }> {
  const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
  if (!rs?.getAll) return [];
  try {
    return rs.getAll().map((r: any) => ({
      id:        r.id,
      label:     r.name || r.label || r.id,
      area:      r.computed?.area ?? 0,
      perimeter: r.computed?.perimeter,
    }));
  } catch {
    return [];
  }
}

/**
 * ⚠ RETIRED AS A LADDER — §INSPECT-ONE-ATTRIBUTE-LADDER (L-2033), 2026-08-21.
 *
 * ⛔ THE DEFECT THIS CLOSES, measured 2026-08-21. This function was the SECOND
 * room-attribute extractor in the Inspect panel. The dropdown the user CHOOSES
 * from was built from `ELEMENT_ATTRIBUTES.rooms` (21 attributes); the list the
 * user READS was rendered by this switch (8 keys). So THIRTEEN of the twenty-one
 * room attributes were selectable and unreachable: pick "Slab Count", "Openings",
 * "Rooms Above" or "All Contents" and every row printed '—' under a full
 * Low→High ramp — the panel's own key asserting a mapping that did not exist.
 *
 * The two also DISAGREED where they overlapped: `ELEMENT_ATTRIBUTES.rooms`
 * resolves Clear Height as `computed.clearHeight ?? boundary.height`, this
 * switch read only `boundary.height`. Same label, same panel, two answers.
 *
 * `renderDiscoveryMode` now calls the ONE ladder — `getActiveAttrOption(type,
 * key).extract` — so choosing an attribute and reading it are the same fact.
 * This function is kept ONLY because it is exported and covered by existing
 * specs; it must not acquire a caller inside this file again.
 *
 * @deprecated Use `getActiveAttrOption(type, key)?.extract(record)`.
 */
export function extractRoomAttrValue(r: any, key: string): number | null {
  switch (key) {
    case 'area':           return typeof r.computed?.area === 'number'      ? r.computed.area      : null;
    case 'grossArea':      return typeof r.computed?.grossArea === 'number'  ? r.computed.grossArea  : null;
    case 'perimeter':      return typeof r.computed?.perimeter === 'number'  ? r.computed.perimeter  : null;
    case 'volume':         return typeof r.computed?.volume === 'number'     ? r.computed.volume     : null;
    case 'height':         return typeof r.boundary?.height === 'number'     ? r.boundary.height     : null;
    // §FIX-BOUNDING-WALLS-UNDETERMINED (C78 §1.4 · C71 §4.4 · C79 §5.2.0) —
    // these three read `(r.boundingWallIds ?? []).length`, so a room whose
    // bounding walls were never recorded scored a hard **0** in a discovery
    // histogram. This function ALREADY has a "cannot answer" value — `null`,
    // returned by every other branch that cannot compute — so the fix is to
    // use the vocabulary the file already speaks rather than mint another.
    // 0 and null are rendered differently by the histogram, which is the
    // observable difference C78 §1.4 demands.
    case 'wallCount':      return boundingWallIdsOrUnknown(r)?.length ?? null;
    case 'doorCount': {
      const ws = window.wallStore; // TODO(E.wall.S): legacy wallStore — replace with runtime.stores.wall
      if (!ws?.getAllDoors) return null;
      const ids = boundingWallIdsOrUnknown(r);
      if (ids === null) return null;
      const bset = new Set<string>(ids);
      return (ws.getAllDoors() as any[]).filter((d: any) => d.wallId && bset.has(d.wallId)).length;
    }
    case 'windowCount': {
      const ws = window.wallStore; // TODO(E.wall.S): legacy wallStore — replace with runtime.stores.wall
      if (!ws?.getAllWindows) return null;
      const ids = boundingWallIdsOrUnknown(r);
      if (ids === null) return null;
      const bset = new Set<string>(ids);
      return (ws.getAllWindows() as any[]).filter((w: any) => w.wallId && bset.has(w.wallId)).length;
    }
    case 'furnitureCount': {
      const fs = window.furnitureStore; // TODO(E.furniture.S): legacy furnitureStore — replace with runtime.stores.furniture
      if (!fs?.getAll) return 0;
      try {
        return (fs.getAll() as any[]).filter((f: any) => f.roomId === r.id).length;
      } catch { return 0; }
    }
    default: return null;
  }
}

export function extractRoomAttrString(r: any, key: string): string {
  switch (key) {
    case 'department': return r.department || '—';
    case 'occupancy':  return (r.occupancyType ?? '—').replace(/-/g, ' ');
    default:           return '—';
  }
}

// ── Discovery Mode render ─────────────────────────────────────────────────────

export function renderDiscoveryMode(contentZone: HTMLElement, state: DiscoveryModeState): void {
  const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
  const rawRooms: any[] = rs?.getAll?.() ?? [];
  const simpleRooms = getAllRooms();

  // F.events.5 — migrated from DOM CustomEvent to runtime.events typed bus.
  window.runtime?.events?.emit('pryzm-inspect-discovery', { rooms: simpleRooms });

  const header = document.createElement('div');
  header.className = 'aud-discovery-header';
  header.innerHTML = `
    <span class="aud-discovery-badge">◉ DISCOVERY</span>
    <span class="aud-discovery-subtitle">No brief set — showing measured values</span>
  `;
  contentZone.appendChild(header);

  if (rawRooms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'aud-discovery-empty';
    empty.textContent = 'No rooms detected. Draw rooms with the Room tool.';
    contentZone.appendChild(empty);
    return;
  }

  const attrOpt   = getActiveAttrOption(state.activeElementType, state.activeAttributeKey);
  const attrKey   = attrOpt?.key ?? 'area';
  const isNumeric = attrOpt?.numeric !== false;

  // §INSPECT-ONE-ATTRIBUTE-LADDER (L-2033) — the ONE ladder. This used to call
  // `extractRoomAttrValue`, a rival 8-key switch beside a 21-attribute dropdown;
  // see that function's header for what the other thirteen looked like.
  const attrValues: number[] = [];
  const roomAttrMap = new Map<string, number | null>();
  for (const r of rawRooms) {
    const raw = (isNumeric && attrOpt) ? attrOpt.extract(r) : null;
    const v = (typeof raw === 'number' && Number.isFinite(raw)) ? raw : null;
    roomAttrMap.set(r.id, v);
    if (v != null) attrValues.push(v);
  }

  // §CONTEXT-DATA-HONESTY (L-2034) — an attribute nobody can measure must not
  // render a Low→High ramp over a column of dashes. Refuse, name the number,
  // and say UNKNOWN rather than letting it read as "all values are zero".
  if (isNumeric && attrValues.length === 0) {
    const mapping = buildAttributeMapping(state.activeElementType, attrKey);
    renderAttributeRefusal(contentZone, mapping);
    return;
  }

  const maxVal   = attrValues.length ? Math.max(...attrValues) : 1;
  const minVal   = attrValues.length ? Math.min(...attrValues) : 0;
  const valRange = Math.max(maxVal - minVal, 0.001);

  const sorted = rawRooms.slice().sort((a: any, b: any) => {
    if (isNumeric) {
      return (roomAttrMap.get(b.id) ?? 0) - (roomAttrMap.get(a.id) ?? 0);
    }
    const sa = extractRoomAttrString(a, attrKey);
    const sb = extractRoomAttrString(b, attrKey);
    return sa.localeCompare(sb);
  });

  const legend = document.createElement('div');
  legend.className = 'aud-discovery-legend';
  publishDiscoveryRamp(legend);
  const legendMinLabel = isNumeric ? `Low ${attrOpt?.label ?? ''}` : 'A → Z';
  const legendMaxLabel = isNumeric ? `High ${attrOpt?.label ?? ''}` : '';
  legend.innerHTML = `
    <div class="aud-discovery-legend-bar">
      <span class="aud-discovery-legend-min">${legendMinLabel}</span>
      <span class="aud-discovery-legend-swatch"></span>
      ${legendMaxLabel ? `<span class="aud-discovery-legend-max">${legendMaxLabel}</span>` : ''}
    </div>
  `;
  contentZone.appendChild(legend);

  const list = document.createElement('div');
  list.className = 'aud-discovery-list';
  contentZone.appendChild(list);

  for (const r of sorted) {
    const attrNum    = roomAttrMap.get(r.id) ?? null;
    const norm       = (isNumeric && attrNum != null) ? (attrNum - minVal) / valRange : 1;
    const color      = isNumeric ? discoveryRampColor(norm) : discoveryRampColor(1);
    const isSelected = state.selectedRoomId === r.id;

    const row = document.createElement('div');
    row.className = `aud-discovery-row ${isSelected ? 'aud-discovery-selected' : ''}`;

    const swatch = document.createElement('span');
    swatch.className = 'aud-discovery-swatch';
    swatch.style.background = color;

    const displayVal = isNumeric
      ? (attrNum != null ? attrNum.toFixed(2) + (attrOpt?.unit ? ' ' + attrOpt.unit : '') : '—')
      : extractRoomAttrString(r, attrKey);
    swatch.title = `${attrOpt?.label ?? attrKey}: ${displayVal}`;

    const name = document.createElement('span');
    name.className = 'aud-discovery-name';
    name.textContent = r.name || r.label || r.id;

    const vals = document.createElement('span');
    vals.className = 'aud-discovery-vals';

    const attrValStr = isNumeric
      ? (attrNum != null ? attrNum.toFixed(2) : '—') + (attrOpt?.unit ? ` ${attrOpt.unit}` : '')
      : extractRoomAttrString(r, attrKey);

    const areaVal = r.computed?.area;
    const secondaryHtml = (attrKey !== 'area' && areaVal != null)
      ? `<span class="aud-disc-metric">Area</span><span class="aud-disc-value">${(areaVal as number).toFixed(1)} m²</span>`
      : '';

    vals.innerHTML = `
      <span class="aud-disc-metric">${escHtml(attrOpt?.label ?? attrKey)}</span>
      <span class="aud-disc-value">${escHtml(attrValStr)}</span>
      ${secondaryHtml}
    `;

    row.appendChild(swatch);
    row.appendChild(name);
    row.appendChild(vals);
    list.appendChild(row);

    row.addEventListener('click', () => {
      state.setSelectedRoomId(r.id);
      state.onRoomSelect(r.id);
      window.runtime?.events?.emit('pryzm-audit-room-select', { roomId: r.id, source: 'audit-stack' }); // F.events.12
      // F.events.6 — pryzm-inspect-room-focus migrated to runtime.events typed bus.
      window.runtime?.events?.emit('pryzm-inspect-room-focus', { roomId: r.id });
      selectionBus.select(r.id, 'inspect-panel');
    });

    row.addEventListener('mouseenter', () => {
      showDiscoveryTooltipFull(row, r, attrOpt, displayVal);
    });
    row.addEventListener('mouseleave', () => {
      hideDiscoveryTooltip();
    });
  }

  const cta = document.createElement('div');
  cta.className = 'aud-discovery-cta';
  cta.innerHTML = `
    <span>Set requirements in</span>
    <strong>F3 → Strategize</strong>
    <span>for detailed analysis</span>
  `;
  contentZone.appendChild(cta);
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

export function showDiscoveryTooltipFull(
  anchor:        HTMLElement,
  r:             any,
  attrOpt:       AttrOption | null,
  attrDisplayVal: string,
): void {
  let tooltip = document.getElementById('aud-disc-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'aud-disc-tooltip';
    tooltip.className = 'aud-disc-tooltip';
    document.body.appendChild(tooltip);
  }

  const roomName = r.name || r.label || r.id;
  const area     = r.computed?.area;
  const perim    = r.computed?.perimeter;

  const activeRow = attrOpt
    ? `<div class="aud-disc-tt-row"><span>${attrOpt.label}</span><strong>${attrDisplayVal}</strong></div>`
    : '';
  const areaRow  = area  != null && attrOpt?.key !== 'area'
    ? `<div class="aud-disc-tt-row"><span>Area</span><strong>${(area as number).toFixed(2)} m²</strong></div>`
    : '';
  const perimRow = perim != null && attrOpt?.key !== 'perimeter'
    ? `<div class="aud-disc-tt-row"><span>Perimeter</span><strong>${(perim as number).toFixed(1)} m</strong></div>`
    : '';

  tooltip.innerHTML = `
    <div class="aud-disc-tt-title">${escHtml(roomName)}</div>
    ${activeRow}${areaRow}${perimRow}
  `;

  const rect = anchor.getBoundingClientRect();
  tooltip.style.top     = `${rect.top}px`;
  tooltip.style.left    = `${Math.min(rect.right + 8, window.innerWidth - 180)}px`;
  tooltip.style.display = 'block';
}

export function hideDiscoveryTooltip(): void {
  const tooltip = document.getElementById('aud-disc-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}
