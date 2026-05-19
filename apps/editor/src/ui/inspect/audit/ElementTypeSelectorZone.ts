/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Inspect Mode RHS Panel (Phase 1.3 → 1.5)
 * File:             src/ui/inspect/audit/ElementTypeSelectorZone.ts
 * Split from:       src/ui/inspect/AuditStack.ts (Wave 14 FILE 5 split)
 * Contract:         05-BIM-UI-ARCHITECTURE-CONTRACT §3 (CSS prefix: aud-)
 *
 * Zone: Element-type selector dropdown, attribute descriptor definitions,
 * attribute dropdown management, heatmap data builder.
 *
 * Exports re-used by sibling zones:
 *   InspectElementType, AttributeDescriptor, AttrOption,
 *   ELEMENT_TYPE_LABELS, ELEMENT_TYPE_ICONS, ELEMENT_ATTRIBUTES,
 *   attributeHeatColor, getActiveAttrOption, storeKeyForType
 */

// ── Element type definitions ──────────────────────────────────────────────────

export type InspectElementType = 'rooms' | 'walls' | 'doors' | 'windows' | 'slabs' | 'columns';

export const ELEMENT_TYPE_LABELS: Record<InspectElementType, string> = {
  rooms:   'Rooms',
  walls:   'Walls',
  doors:   'Doors',
  windows: 'Windows',
  slabs:   'Slabs',
  columns: 'Columns',
};

export const ELEMENT_TYPE_ICONS: Record<InspectElementType, string> = {
  rooms:   '▪',
  walls:   '▬',
  doors:   '🚪',
  windows: '⬜',
  slabs:   '▭',
  columns: '▮',
};

// ── Attribute descriptor ──────────────────────────────────────────────────────

export interface AttributeDescriptor {
  key:     string;
  label:   string;
  unit:    string;
  numeric: boolean;
  extract: (el: any) => number | string | null;
  format:  (raw: number | string | null) => string;
}

export type AttrOption = AttributeDescriptor;

// Shared format helpers
const _fmtM   = (v: number | string | null) => v == null ? '—' : `${(v as number).toFixed(2)} m`;
const _fmtM2  = (v: number | string | null) => v == null ? '—' : `${(v as number).toFixed(2)} m²`;
const _fmtM3  = (v: number | string | null) => v == null ? '—' : `${(v as number).toFixed(2)} m³`;
const _fmtMm  = (v: number | string | null) => v == null ? '—' : `${(v as number).toFixed(0)} mm`;
const _fmtCnt = (v: number | string | null) => v == null ? '—' : String(v);
const _fmtStr = (v: number | string | null) => (v == null || v === '') ? '—' : String(v);

// ─── §6.4 Room Containment Query Contract ──────────────────────────────────
// Per-frame memoised wrapper around RoomContentsService so the descriptor
// extractors below can ask once per (room,id) without recomputing N times
// across the column rendering loop. Cache cleared whenever any room mutation
// fires; until then a single getContents() call is reused.
type _RoomContents = ReturnType<any>;
const _contentsCache = new Map<string, _RoomContents>();
let _contentsCacheVersion = 0;
function _bumpContentsCache(): void {
  _contentsCacheVersion++;
  _contentsCache.clear();
}
if (typeof window !== 'undefined') {
  ['bim-room-added','bim-room-updated','bim-room-removed',
   'bim-wall-updated','bim-wall-removed','bim-wall-added',
   'bim-furniture-updated','bim-furniture-removed','bim-furniture-added',
   'bim-slab-added','bim-slab-updated','bim-slab-removed',
   'bim-column-added','bim-column-updated','bim-column-removed',
   'bim-door-added','bim-door-removed','bim-window-added','bim-window-removed',
   'bim-plumbing-added','bim-plumbing-removed',
   'bim-lighting-added','bim-lighting-removed',
   'bim-beam-added','bim-beam-removed',
  ].forEach(evt => window.addEventListener(evt, _bumpContentsCache));
}
function _contents(roomId: string): any | null {
  const svc = (typeof window !== 'undefined') ? window.roomContentsService : null; // TODO(E.18-R): legacy roomContentsService — replace with runtime.rooms.contentsService
  if (!svc?.getContents || !roomId) return null;
  const cached = _contentsCache.get(roomId);
  if (cached !== undefined) return cached;
  try {
    const c = svc.getContents(roomId);
    _contentsCache.set(roomId, c);
    return c;
  } catch {
    _contentsCache.set(roomId, null);
    return null;
  }
}

// ── Attribute heatmap colour helper ──────────────────────────────────────────

export function attributeHeatColor(value: number, min: number, max: number): string {
  // amber (#ffaa00) at low → cyan (#00e5ff) at high
  const range = Math.max(max - min, 0.001);
  const t = Math.min(Math.max((value - min) / range, 0), 1);
  const r = Math.round(255 + (0   - 255) * t);
  const g = Math.round(170 + (229 - 170) * t);
  const b = Math.round(0   + (255 - 0  ) * t);
  return `rgb(${r},${g},${b})`;
}

// ── Attributes available per element type, in display order ──────────────────

export const ELEMENT_ATTRIBUTES: Record<InspectElementType, AttributeDescriptor[]> = {
  rooms: [
    {
      key: 'area', label: 'Area', unit: 'm²', numeric: true,
      extract: el => el.computed?.area ?? null,
      format:  _fmtM2,
    },
    {
      key: 'grossArea', label: 'Gross Area', unit: 'm²', numeric: true,
      extract: el => el.computed?.grossArea ?? null,
      format:  _fmtM2,
    },
    {
      key: 'perimeter', label: 'Perimeter', unit: 'm', numeric: true,
      extract: el => el.computed?.perimeter ?? null,
      format:  _fmtM,
    },
    {
      key: 'volume', label: 'Volume', unit: 'm³', numeric: true,
      extract: el => el.computed?.volume ?? null,
      format:  _fmtM3,
    },
    {
      key: 'height', label: 'Clear Height', unit: 'm', numeric: true,
      extract: el => el.computed?.clearHeight ?? el.boundary?.height ?? null,
      format:  _fmtM,
    },
    // ── Containment counts (§6.4 Room Containment Query Contract) ─────────
    {
      key: 'wallCount', label: 'Wall Count', unit: '', numeric: true,
      extract: el => _contents(el.id)?.bounding.walls.length ?? (el.boundingWallIds ?? []).length,
      format:  _fmtCnt,
    },
    {
      key: 'slabCount', label: 'Slab Count', unit: '', numeric: true,
      extract: el => _contents(el.id)?.bounding.slabs.length ?? null,
      format:  _fmtCnt,
    },
    {
      key: 'columnCount', label: 'Columns (bounding)', unit: '', numeric: true,
      extract: el => _contents(el.id)?.bounding.columns.length ?? (el.boundingColumnIds ?? []).length,
      format:  _fmtCnt,
    },
    {
      key: 'curtainWallCount', label: 'Curtain Walls', unit: '', numeric: true,
      extract: el => _contents(el.id)?.bounding.curtainWalls.length ?? null,
      format:  _fmtCnt,
    },
    {
      key: 'doorCount', label: 'Door Count', unit: '', numeric: true,
      extract: el => _contents(el.id)?.hosted.doors.length ?? null,
      format: _fmtCnt,
    },
    {
      key: 'windowCount', label: 'Window Count', unit: '', numeric: true,
      extract: el => _contents(el.id)?.hosted.windows.length ?? null,
      format: _fmtCnt,
    },
    {
      key: 'openingCount', label: 'Openings', unit: '', numeric: true,
      extract: el => _contents(el.id)?.hosted.openings.length ?? null,
      format: _fmtCnt,
    },
    {
      key: 'furnitureCount', label: 'Furniture', unit: '', numeric: true,
      extract: el => _contents(el.id)?.contained.furniture.length ?? 0,
      format: _fmtCnt,
    },
    {
      key: 'columnsContained', label: 'Columns (free-standing)', unit: '', numeric: true,
      extract: el => _contents(el.id)?.contained.columns.length ?? null,
      format: _fmtCnt,
    },
    {
      key: 'plumbingCount', label: 'Plumbing', unit: '', numeric: true,
      extract: el => _contents(el.id)?.contained.plumbing.length ?? null,
      format: _fmtCnt,
    },
    {
      key: 'lightingCount', label: 'Lighting', unit: '', numeric: true,
      extract: el => _contents(el.id)?.contained.lighting.length ?? null,
      format: _fmtCnt,
    },
    {
      key: 'beamCount', label: 'Beams', unit: '', numeric: true,
      extract: el => _contents(el.id)?.contained.beams.length ?? null,
      format: _fmtCnt,
    },
    {
      key: 'roomsAbove', label: 'Rooms Above', unit: '', numeric: true,
      extract: el => _contents(el.id)?.vertical.above.length ?? null,
      format: _fmtCnt,
    },
    {
      key: 'roomsBelow', label: 'Rooms Below', unit: '', numeric: true,
      extract: el => _contents(el.id)?.vertical.below.length ?? null,
      format: _fmtCnt,
    },
    {
      key: 'totalContents', label: 'All Contents', unit: '', numeric: true,
      extract: el => _contents(el.id)?.totals.total ?? null,
      format: _fmtCnt,
    },
    {
      key: 'department', label: 'Department', unit: '', numeric: false,
      extract: el => el.department ?? null,
      format:  _fmtStr,
    },
    {
      key: 'occupancy', label: 'Occupancy', unit: '', numeric: false,
      extract: el => el.occupancyType ?? null,
      format:  _fmtStr,
    },
  ],
  walls: [
    {
      key: 'length', label: 'Length', unit: 'm', numeric: true,
      extract: el => {
        if (el.baseLine?.[0] && el.baseLine?.[1]) {
          try {
            const _b0 = el.baseLine[0], _b1 = el.baseLine[1];
            return Math.sqrt((_b1.x-_b0.x)**2 + (_b1.y-_b0.y)**2 + (_b1.z-_b0.z)**2);
          } catch {
            const dx = el.baseLine[1].x - el.baseLine[0].x;
            const dz = el.baseLine[1].z - el.baseLine[0].z;
            return Math.sqrt(dx * dx + dz * dz);
          }
        }
        if (el.startPoint && el.endPoint) {
          const dx = el.endPoint.x - el.startPoint.x;
          const dz = el.endPoint.z - el.startPoint.z;
          return Math.sqrt(dx * dx + dz * dz);
        }
        return null;
      },
      format: _fmtM,
    },
    {
      key: 'height', label: 'Height', unit: 'm', numeric: true,
      extract: el => el.height ?? el.parameters?.height ?? null,
      format:  _fmtM,
    },
    {
      key: 'thickness', label: 'Thickness', unit: 'mm', numeric: true,
      extract: el => {
        const t = el.thickness ?? el.parameters?.thickness ?? null;
        return t != null ? t * 1000 : null;
      },
      format: _fmtMm,
    },
  ],
  doors: [
    {
      key: 'width', label: 'Width', unit: 'm', numeric: true,
      extract: el => el.width ?? el.parameters?.width ?? null,
      format:  _fmtM,
    },
    {
      key: 'height', label: 'Height', unit: 'm', numeric: true,
      extract: el => el.height ?? el.parameters?.height ?? null,
      format:  _fmtM,
    },
    {
      key: 'sillHeight', label: 'Sill Height', unit: 'm', numeric: true,
      extract: el => el.sillHeight ?? el.parameters?.sillHeight ?? null,
      format:  _fmtM,
    },
  ],
  windows: [
    {
      key: 'width', label: 'Width', unit: 'm', numeric: true,
      extract: el => el.width ?? el.parameters?.width ?? null,
      format:  _fmtM,
    },
    {
      key: 'height', label: 'Height', unit: 'm', numeric: true,
      extract: el => el.height ?? el.parameters?.height ?? null,
      format:  _fmtM,
    },
    {
      key: 'sillHeight', label: 'Sill Height', unit: 'm', numeric: true,
      extract: el => el.sillHeight ?? el.parameters?.sillHeight ?? null,
      format:  _fmtM,
    },
  ],
  slabs: [
    {
      key: 'thickness', label: 'Thickness', unit: 'mm', numeric: true,
      extract: el => {
        const t = el.thickness ?? el.parameters?.thickness ?? null;
        return t != null ? t * 1000 : null;
      },
      format: _fmtMm,
    },
    {
      key: 'area', label: 'Area', unit: 'm²', numeric: true,
      extract: el => el.area ?? el.parameters?.area ?? null,
      format:  _fmtM2,
    },
  ],
  columns: [
    {
      key: 'height', label: 'Height', unit: 'm', numeric: true,
      extract: el => el.height ?? el.parameters?.height ?? null,
      format:  _fmtM,
    },
    {
      key: 'width', label: 'Width', unit: 'm', numeric: true,
      extract: el => el.width ?? el.parameters?.width ?? null,
      format:  _fmtM,
    },
    {
      key: 'depth', label: 'Depth', unit: 'm', numeric: true,
      extract: el => el.depth ?? el.parameters?.depth ?? null,
      format:  _fmtM,
    },
  ],
};

// ── Exported zone functions ───────────────────────────────────────────────────

/**
 * Rebuild the attribute <select> dropdown for the given element type.
 * Returns the new active attribute key (may change if prev key no longer valid).
 */
export function rebuildAttributeDropdown(
  dropdown:        HTMLSelectElement,
  activeType:      InspectElementType,
  activeAttrKey:   string | null,
): string | null {
  dropdown.innerHTML = '';
  const attrs = ELEMENT_ATTRIBUTES[activeType] ?? [];
  for (const attr of attrs) {
    const opt = document.createElement('option');
    opt.value = attr.key;
    opt.textContent = attr.label + (attr.unit ? ` (${attr.unit})` : '');
    dropdown.appendChild(opt);
  }
  const prevKey    = activeAttrKey;
  const stillValid = prevKey && attrs.some(a => a.key === prevKey);
  let newKey: string | null;
  if (stillValid && prevKey) {
    dropdown.value = prevKey;
    newKey = prevKey;
  } else {
    newKey = attrs[0]?.key ?? null;
    if (newKey) dropdown.value = newKey;
  }
  console.log(`[AuditStack] Attribute dropdown rebuilt for "${activeType}" → active key: "${newKey}"`);
  return newKey;
}

/** Return the active AttributeDescriptor for the current type/key, or null. */
export function getActiveAttrOption(
  activeType: InspectElementType,
  activeKey:  string | null,
): AttributeDescriptor | null {
  if (!activeKey) return null;
  return ELEMENT_ATTRIBUTES[activeType]?.find(a => a.key === activeKey) ?? null;
}

/** Map element type → store window-global key. */
export function storeKeyForType(type: InspectElementType): string {
  const map: Record<InspectElementType, string> = {
    rooms:   'roomStore',
    walls:   'wallStore',
    doors:   'doorStore',
    windows: 'windowStore',
    slabs:   'slabStore',
    columns: 'columnStore',
  };
  return map[type];
}

/**
 * Rebuild the element-type <select> dropdown based on which stores have data.
 * Returns the active element type (may change if prev type has no data).
 */
export function rebuildDropdown(
  dropdown:        HTMLSelectElement,
  activeType:      InspectElementType,
  icons:           Record<InspectElementType, string>,
  labels:          Record<InspectElementType, string>,
): InspectElementType {
  const map: Record<InspectElementType, string> = {
    rooms:   'roomStore',
    walls:   'wallStore',
    doors:   'doorStore',
    windows: 'windowStore',
    slabs:   'slabStore',
    columns: 'columnStore',
  };
  dropdown.innerHTML = '';
  const present: InspectElementType[] = [];
  for (const type of (Object.keys(map) as InspectElementType[])) {
    const store = ((window as unknown as Record<string, any>))[map[type]]; // TODO(E.<family>.S): legacy per-family window store reach — replace with runtime.stores.<family> when family stores are exposed via runtime in Phase E/F
    let count = 0;
    try { count = Array.from(store?.getAll?.() ?? []).length; } catch { count = 0; }
    if (count > 0) {
      present.push(type);
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = `${icons[type]}  ${labels[type]}  (${count})`;
      dropdown.appendChild(opt);
    }
  }
  if (present.length === 0) {
    const opt = document.createElement('option');
    opt.value = 'rooms';
    opt.textContent = `${icons.rooms}  ${labels.rooms}  (0)`;
    dropdown.appendChild(opt);
    present.push('rooms');
  }
  const finalType = present.includes(activeType) ? activeType : present[0];
  dropdown.value = finalType;
  console.log(`[AuditStack] Element dropdown rebuilt — types: [${present.join(', ')}]`);
  return finalType;
}

/** Build heatmap colour data for all elements of the given type. */
export function buildHeatmapData(
  activeType: InspectElementType,
  activeKey:  string | null,
): Array<{ id: string; color: number }> {
  const storeKey = storeKeyForType(activeType);
  const store    = ((window as unknown as Record<string, any>))[storeKey]; // TODO(E.<family>.S)
  if (!store?.getAll) return [];
  const schema   = ELEMENT_ATTRIBUTES[activeType];
  const attrDesc = schema.find(a => a.key === activeKey);
  if (!attrDesc?.numeric) return [];
  let elements: any[];
  try { elements = Array.from(store.getAll()); } catch { return []; }
  const vals: number[] = [];
  for (const el of elements) {
    const v = attrDesc.extract(el);
    if (typeof v === 'number') vals.push(v);
  }
  if (vals.length === 0) return [];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return elements.map((el: any) => {
    const v = attrDesc.extract(el);
    if (typeof v !== 'number') return { id: el.id as string, color: 0x888888 };
    const hexStr = attributeHeatColor(v, min, max);
    const m = hexStr.match(/\d+/g);
    if (!m) return { id: el.id as string, color: 0x888888 };
    const color = (parseInt(m[0]) << 16) | (parseInt(m[1]) << 8) | parseInt(m[2]);
    return { id: el.id as string, color };
  });
}
