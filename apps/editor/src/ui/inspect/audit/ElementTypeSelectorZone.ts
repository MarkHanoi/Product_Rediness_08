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

// §GR-10 — the shared honesty seam (C78 §8.1 family; unknown ≠ empty).
import { relationshipArrayOrUnknown } from '../../relationshipDetermination.js';
import { discoveryRampColor } from './heatRamp';

// ── Element type definitions ──────────────────────────────────────────────────
//
// §INSPECT-EVERY-CATEGORY (L-2032) — these three were hand-written HERE, listing
// six categories while the engine published twenty element-family stores. They
// are now DERIVED from the one declaration in `inspectCategories.ts`, and a
// coverage test fails when a family store appears with no row there. Re-exported
// under their original names so every consumer reads unchanged.

export type { InspectElementType } from './inspectCategories';
export {
  ELEMENT_TYPE_LABELS,
  ELEMENT_TYPE_ICONS,
  INSPECT_CATEGORIES,
  INSPECT_CATEGORY_IDS,
  meshTypeForCategory,
  inspectCategory,
} from './inspectCategories';

import {
  type InspectElementType,
  INSPECT_CATEGORY_IDS,
  ELEMENT_TYPE_LABELS,
  ELEMENT_TYPE_STORE_KEYS,
} from './inspectCategories';

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

// §GR-10 — the honest count of a relationship id-list: a PRESENT array counts
// (even 0 — a real answer); an ABSENT field is UNKNOWN and returns null so the
// column renders '—' rather than forging a zero (C75 §1.4 · C71 §4.4). Uses
// the shared apps/editor seam; exported for the differentiating spec.
export const _lenOrUnknown = (raw: unknown): number | null => {
  const arr = relationshipArrayOrUnknown<unknown>(raw);
  return arr === null ? null : arr.length;
};
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

/**
 * §DISCOVERY-RAMP-IS-ONE (L-1742) — normalise, then defer to the ONE ramp.
 *
 * This used to interpolate its own amber(#ffaa00)→cyan(#00e5ff) scale: a fourth
 * palette, in the same panel as the discovery ramp, encoding the same idea
 * (low → high) with different colours and no legend at all. Only the HUE moves;
 * the normalisation below is the arithmetic that was already here, so the bars
 * sit at exactly the positions they sat at before.
 */
export function attributeHeatColor(value: number, min: number, max: number): string {
  const range = Math.max(max - min, 0.001);
  return discoveryRampColor((value - min) / range);
}

// ── Attributes available per element type, in display order ──────────────────

/**
 * CURATED attribute descriptors — labels, units and formatting for the fields we
 * know by name. §INSPECT-EVERY-CATEGORY (L-2032) made this `Partial`, on purpose:
 *
 * ⚠ THIS IS NO LONGER THE AUTHORITY ON WHAT A CATEGORY CAN BE MAPPED BY.
 * `resolveCategoryAttributes()` merges these with attributes DERIVED from the
 * records the panel actually reads, so a family with no row here is still fully
 * mappable by whatever it actually measures. A missing row costs you a pretty
 * label and a unit — never a whole category, which is what it used to cost.
 */
export const ELEMENT_ATTRIBUTES: Partial<Record<InspectElementType, AttributeDescriptor[]>> = {
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
      // §GR-10 (C75 §1.4 · C78 §1.4) — when the contents service cannot answer
      // AND boundingWallIds was never recorded, the count is UNKNOWN (null →
      // '—', this column's existing unknown glyph), never a hard 0. The old
      // `(el.boundingWallIds ?? []).length` printed 0 about rooms nobody
      // measured — the standing C78 §0.g example. A PRESENT empty array still
      // counts 0 (a real answer).
      extract: el => _contents(el.id)?.bounding.walls.length
        ?? _lenOrUnknown(el.boundingWallIds),
      format:  _fmtCnt,
    },
    {
      key: 'slabCount', label: 'Slab Count', unit: '', numeric: true,
      extract: el => _contents(el.id)?.bounding.slabs.length ?? null,
      format:  _fmtCnt,
    },
    {
      key: 'columnCount', label: 'Columns (bounding)', unit: '', numeric: true,
      // §GR-10 — same rule as wallCount: unrecorded ⇒ unknown ('—'), never 0.
      extract: el => _contents(el.id)?.bounding.columns.length
        ?? _lenOrUnknown(el.boundingColumnIds),
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

  // -- INSPECT-EVERY-CATEGORY (L-2032) -- the fourteen families that had no
  // category at all until 2026-08-21. Only CURATION lives here (label + unit +
  // formatting for the fields we can name); resolveCategoryAttributes() adds
  // every other numeric field it finds on the live records, so a family is
  // mappable whether or not the rows below turn out to name the right thing.
  // A descriptor naming a field the record does not carry returns null -- which
  // the panel REFUSES honestly ('not mapped'), never as a fake zero.

  beams: [
    { key: 'length',    label: 'Length',    unit: 'm',  numeric: true,
      extract: el => _spanLength(el), format: _fmtM },
    { key: 'depth',     label: 'Depth',     unit: 'm',  numeric: true,
      extract: el => el.depth ?? el.parameters?.depth ?? null, format: _fmtM },
    { key: 'width',     label: 'Width',     unit: 'm',  numeric: true,
      extract: el => el.width ?? el.parameters?.width ?? null, format: _fmtM },
  ],

  floors: [
    { key: 'area',      label: 'Area',      unit: 'm²', numeric: true,
      extract: el => el.area ?? el.computed?.area ?? el.parameters?.area ?? null, format: _fmtM2 },
    { key: 'thickness', label: 'Thickness', unit: 'mm', numeric: true,
      extract: el => _toMm(el.thickness ?? el.parameters?.thickness), format: _fmtMm },
  ],

  ceilings: [
    { key: 'area',      label: 'Area',       unit: 'm²', numeric: true,
      extract: el => el.area ?? el.computed?.area ?? el.parameters?.area ?? null, format: _fmtM2 },
    { key: 'height',    label: 'Height AFL', unit: 'm',  numeric: true,
      extract: el => el.height ?? el.elevation ?? el.parameters?.height ?? null, format: _fmtM },
    { key: 'thickness', label: 'Thickness',  unit: 'mm', numeric: true,
      extract: el => _toMm(el.thickness ?? el.parameters?.thickness), format: _fmtMm },
  ],

  roofs: [
    { key: 'area',      label: 'Area',      unit: 'm²', numeric: true,
      extract: el => el.area ?? el.computed?.area ?? el.parameters?.area ?? null, format: _fmtM2 },
    { key: 'thickness', label: 'Thickness', unit: 'mm', numeric: true,
      extract: el => _toMm(el.thickness ?? el.parameters?.thickness), format: _fmtMm },
    { key: 'pitch',     label: 'Pitch',     unit: '°', numeric: true,
      extract: el => el.pitch ?? el.slope ?? el.parameters?.pitch ?? null,
      format: v => v == null ? '—' : (v as number).toFixed(1) + '°' },
  ],

  openings: [
    { key: 'width',      label: 'Width',       unit: 'm', numeric: true,
      extract: el => el.width ?? el.parameters?.width ?? null, format: _fmtM },
    { key: 'height',     label: 'Height',      unit: 'm', numeric: true,
      extract: el => el.height ?? el.parameters?.height ?? null, format: _fmtM },
    { key: 'sillHeight', label: 'Sill Height', unit: 'm', numeric: true,
      extract: el => el.sillHeight ?? el.parameters?.sillHeight ?? null, format: _fmtM },
  ],

  curtainWalls: [
    { key: 'length', label: 'Length', unit: 'm', numeric: true,
      extract: el => _spanLength(el), format: _fmtM },
    { key: 'height', label: 'Height', unit: 'm', numeric: true,
      extract: el => el.height ?? el.parameters?.height ?? null, format: _fmtM },
  ],

  curtainPanels: [
    { key: 'width',  label: 'Width',  unit: 'm', numeric: true,
      extract: el => el.width ?? el.parameters?.width ?? null, format: _fmtM },
    { key: 'height', label: 'Height', unit: 'm', numeric: true,
      extract: el => el.height ?? el.parameters?.height ?? null, format: _fmtM },
  ],

  stairs: [
    { key: 'width',     label: 'Width',      unit: 'm', numeric: true,
      extract: el => el.width ?? el.parameters?.width ?? null, format: _fmtM },
    { key: 'rise',      label: 'Total Rise', unit: 'm', numeric: true,
      extract: el => el.totalRise ?? el.height ?? el.parameters?.totalRise ?? null, format: _fmtM },
    { key: 'stepCount', label: 'Steps',      unit: '',  numeric: true,
      extract: el => el.stepCount ?? el.riserCount ?? el.parameters?.stepCount ?? null, format: _fmtCnt },
  ],

  stairRailings: [
    { key: 'height', label: 'Height', unit: 'm', numeric: true,
      extract: el => el.height ?? el.parameters?.height ?? null, format: _fmtM },
    { key: 'length', label: 'Length', unit: 'm', numeric: true,
      extract: el => _spanLength(el), format: _fmtM },
  ],

  handrails: [
    { key: 'height', label: 'Height', unit: 'm', numeric: true,
      extract: el => el.height ?? el.parameters?.height ?? null, format: _fmtM },
    { key: 'length', label: 'Length', unit: 'm', numeric: true,
      extract: el => _spanLength(el), format: _fmtM },
  ],

  lifts: [
    { key: 'width', label: 'Width', unit: 'm', numeric: true,
      extract: el => el.width ?? el.parameters?.width ?? null, format: _fmtM },
    { key: 'depth', label: 'Depth', unit: 'm', numeric: true,
      extract: el => el.depth ?? el.parameters?.depth ?? null, format: _fmtM },
  ],

  furniture: [
    { key: 'width',  label: 'Width',  unit: 'm', numeric: true,
      extract: el => el.width ?? el.dimensions?.width ?? el.parameters?.width ?? null, format: _fmtM },
    { key: 'depth',  label: 'Depth',  unit: 'm', numeric: true,
      extract: el => el.depth ?? el.dimensions?.depth ?? el.parameters?.depth ?? null, format: _fmtM },
    { key: 'height', label: 'Height', unit: 'm', numeric: true,
      extract: el => el.height ?? el.dimensions?.height ?? el.parameters?.height ?? null, format: _fmtM },
  ],

  lighting: [
    { key: 'height', label: 'Mounting Height', unit: 'm', numeric: true,
      extract: el => el.height ?? el.mountingHeight ?? el.parameters?.height ?? null, format: _fmtM },
  ],

  plumbing: [
    { key: 'width',  label: 'Width',  unit: 'm', numeric: true,
      extract: el => el.width ?? el.parameters?.width ?? null, format: _fmtM },
    { key: 'height', label: 'Height', unit: 'm', numeric: true,
      extract: el => el.height ?? el.parameters?.height ?? null, format: _fmtM },
  ],
};

// -- Shared extractor helpers for the curated rows above ---------------------

/** Millimetres from a metres field, or UNKNOWN. Never a forged 0. */
function _toMm(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v * 1000 : null;
}

/**
 * Plan length of any element that records a two-point span, under the three
 * field spellings this codebase actually uses (`baseLine[0..1]`,
 * `startPoint`/`endPoint`, `start`/`end`). Returns null -- UNKNOWN -- when the
 * record carries none of them, so the panel refuses rather than printing 0 m.
 */
function _spanLength(el: any): number | null {
  const pairs: Array<[any, any]> = [
    [el?.baseLine?.[0], el?.baseLine?.[1]],
    [el?.startPoint,    el?.endPoint],
    [el?.start,         el?.end],
  ];
  for (const [a, b] of pairs) {
    if (!a || !b) continue;
    const dx = (b.x ?? 0) - (a.x ?? 0);
    const dy = (b.y ?? 0) - (a.y ?? 0);
    const dz = (b.z ?? 0) - (a.z ?? 0);
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (Number.isFinite(len)) return len;
  }
  return typeof el?.length === 'number' ? el.length : null;
}
// ── Derived attributes — the half a hand-written table cannot keep up with ───

/**
 * §INSPECT-EVERY-CATEGORY (L-2032) — read this category's records from its store.
 *
 * ONE place reaches for the `window.<x>Store` global; four zone files used to do
 * it independently. TODO(E.<family>.S): replace with `runtime.stores.<family>`.
 * Returns `null` — UNKNOWN — when the store is absent or throws, which is NOT
 * the same fact as an empty model and is rendered differently downstream.
 */
export function readCategoryRecords(type: InspectElementType): any[] | null {
  const key = ELEMENT_TYPE_STORE_KEYS[type];
  if (!key) return null;
  const store = ((globalThis as unknown as Record<string, any>))[key];
  if (!store?.getAll) return null;
  try {
    return Array.from(store.getAll());
  } catch {
    return null;
  }
}

/** Field names that are identity/bookkeeping rather than a measurement. */
const _NON_MEASURE_KEYS: ReadonlySet<string> = new Set([
  'timestamp', 'createdAt', 'updatedAt', 'version', 'revision', 'index',
  'order', 'seed', 'opacity', 'opacityFactor',
]);

/** Turn `sillHeight` into `Sill Height`, `frameDepth` into `Frame Depth`. */
function _humanise(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * ⭐ Derive mappable attributes from the RECORDS THEMSELVES.
 *
 * ── ⛔ THE DEFECT THIS CLOSES ────────────────────────────────────────────────
 * `ELEMENT_ATTRIBUTES` is a hand-written table. A hand-written table degrades
 * SILENTLY: add an element family, or add a measured field to an existing one,
 * and the Inspect panel simply never offers it — with no error, no warning, and
 * a panel that looks complete. That is the founder's *"all categories should be
 * mapped"* read at the attribute level rather than the category level.
 *
 * So the curated table is demoted to a CURATION layer and the base is derived:
 * every top-level finite-number field present on at least one record becomes a
 * mappable attribute, labelled from its own field name.
 *
 * ⚠ DERIVED FROM THE RECORDS, NOT FROM THE L0 ZOD SCHEMA — deliberately. The
 * panel renders records; deriving from the schema would derive from a DIFFERENT
 * authority than the one rendered, which is exactly the "two ladders that
 * disagree" shape this repo keeps re-finding (and which this same file carried:
 * see `extractRoomAttrValue` in DiscoveryModeZone, removed in L-2033).
 *
 * @param records   the live records; `null`/empty yields no derived attributes.
 * @param declared  keys the curated table already covers — never shadowed.
 * @param sampleSize how many records to scan. Fields are sparse, so scanning a
 *                  sample is a heuristic: it is why the curated table still
 *                  exists for the fields we must not miss.
 */
export function deriveNumericAttributes(
  records:  readonly any[] | null,
  declared: ReadonlySet<string>,
  sampleSize = 50,
): AttributeDescriptor[] {
  if (!records || records.length === 0) return [];
  const keys = new Set<string>();
  const limit = Math.min(records.length, sampleSize);
  for (let i = 0; i < limit; i++) {
    const rec = records[i];
    if (!rec || typeof rec !== 'object') continue;
    for (const k of Object.keys(rec)) {
      if (declared.has(k) || keys.has(k)) continue;
      if (k.startsWith('_') || _NON_MEASURE_KEYS.has(k)) continue;
      const v = (rec as Record<string, unknown>)[k];
      if (typeof v === 'number' && Number.isFinite(v)) keys.add(k);
    }
  }
  return Array.from(keys).sort().map(k => ({
    key: k,
    label: _humanise(k),
    unit: '',
    numeric: true,
    extract: (el: any) => {
      const v = el?.[k];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    },
    format: (v: number | string | null) =>
      v == null ? '—' : (typeof v === 'number' ? v.toFixed(2) : String(v)),
  }));
}

/**
 * The attributes this category can be mapped by: CURATED first (nice labels and
 * units, in the order an architect reads them), then DERIVED from the live
 * records for everything the curation does not name.
 */
export function resolveCategoryAttributes(type: InspectElementType): AttributeDescriptor[] {
  const curated = ELEMENT_ATTRIBUTES[type] ?? [];
  const declared = new Set(curated.map(a => a.key));
  return [...curated, ...deriveNumericAttributes(readCategoryRecords(type), declared)];
}

// ── Honest mapping result — "unknown" and "all zero" must not look alike ─────

/**
 * §CONTEXT-DATA-HONESTY (C75 §1.4 · C78 §1.4) applied to the Inspect ramp.
 *
 * ⛔ `buildHeatmapData()` returned `[]` for BOTH "this attribute is measured on
 * nothing" and "there are no elements", and `applyAttributeHeatmap()` returned
 * early on `[]` — so a category nobody can measure rendered a full Low→High
 * legend over a list of dashes, which reads as "every value is the same" rather
 * than "nothing here has a value". Failure and emptiness were literally the same
 * value. They are now different `status`es, and the panel renders them
 * differently.
 */
export type AttributeMappingStatus =
  /** Store missing / unreadable — we do not know whether there are elements. */
  | 'no-store'
  /** The store answered, and the model holds none of this family. */
  | 'no-elements'
  /** No attribute is selected. */
  | 'no-attribute'
  /** The attribute is a label, not a measure — a ramp is meaningless. */
  | 'not-numeric'
  /** Elements exist, but NONE of them carries a value for this attribute. */
  | 'unmeasured'
  /** Mapped. `measured` of `total` elements carry a value. */
  | 'mapped';

export interface AttributeMapping {
  readonly status:   AttributeMappingStatus;
  readonly entries:  ReadonlyArray<{ id: string; color: number }>;
  /** How many elements carry a value for this attribute. */
  readonly measured: number;
  /** How many elements of this category exist. */
  readonly total:    number;
  readonly min:      number | null;
  readonly max:      number | null;
  /** One sentence the panel can render verbatim. Never a colour, never a number alone. */
  readonly reason:   string;
}

/**
 * Build the colour mapping for one (category, attribute) — and say honestly when
 * there is nothing to map.
 */
export function buildAttributeMapping(
  activeType: InspectElementType,
  activeKey:  string | null,
): AttributeMapping {
  const label = ELEMENT_TYPE_LABELS[activeType] ?? activeType;
  const none = (status: AttributeMappingStatus, reason: string): AttributeMapping =>
    ({ status, entries: [], measured: 0, total: 0, min: null, max: null, reason });

  const records = readCategoryRecords(activeType);
  if (records === null) {
    return none('no-store', `${label} cannot be read — this is UNKNOWN, not zero.`);
  }
  if (records.length === 0) {
    return none('no-elements', `The model holds no ${label.toLowerCase()}.`);
  }
  if (!activeKey) {
    return { ...none('no-attribute', 'No attribute selected.'), total: records.length };
  }

  const desc = resolveCategoryAttributes(activeType).find(a => a.key === activeKey);
  if (!desc) {
    return {
      ...none('no-attribute', `"${activeKey}" is not an attribute of ${label.toLowerCase()}.`),
      total: records.length,
    };
  }
  if (!desc.numeric) {
    return {
      ...none('not-numeric', `"${desc.label}" is a label, not a measure — no ramp is drawn.`),
      total: records.length,
    };
  }

  const values = new Map<string, number>();
  for (const el of records) {
    const v = desc.extract(el);
    if (typeof v === 'number' && Number.isFinite(v)) values.set(el.id as string, v);
  }

  if (values.size === 0) {
    return {
      ...none('unmeasured',
        `NOT MAPPED — "${desc.label}" has no measured value on any of the ` +
        `${records.length} ${label.toLowerCase()}. This is UNKNOWN, not zero.`),
      total: records.length,
    };
  }

  const nums = Array.from(values.values());
  const min = Math.min(...nums);
  const max = Math.max(...nums);

  const entries = records.map((el: any) => {
    const v = values.get(el.id as string);
    if (v === undefined) return { id: el.id as string, color: UNMEASURED_COLOR };
    return { id: el.id as string, color: rampColorToHex(attributeHeatColor(v, min, max)) };
  });

  const reason = min === max
    ? `All ${values.size} measured ${label.toLowerCase()} share one value (${min.toFixed(2)}) — a flat ramp is the true answer.`
    : `${values.size} of ${records.length} ${label.toLowerCase()} measured.`;

  return { status: 'mapped', entries, measured: values.size, total: records.length, min, max, reason };
}

/**
 * The colour given to an element of a MAPPED category that has no value for the
 * mapped attribute. Deliberately outside the violet brand ramp so "unknown" can
 * never be mistaken for a ramp position. C75 §1.4.
 */
export const UNMEASURED_COLOR = 0x888888;

/** `rgb(r,g,b)` from the one brand ramp → a THREE hex int. */
export function rampColorToHex(rgb: string): number {
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return UNMEASURED_COLOR;
  return (parseInt(m[0], 10) << 16) | (parseInt(m[1], 10) << 8) | parseInt(m[2], 10);
}

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
  // L-2032 — curated ∪ derived, so a family with no curated row is still mappable.
  const attrs = resolveCategoryAttributes(activeType);
  for (const attr of attrs) {
    const opt = document.createElement('option');
    opt.value = attr.key;
    opt.textContent = attr.label + (attr.unit ? ` (${attr.unit})` : '');
    dropdown.appendChild(opt);
  }
  if (attrs.length === 0) {
    // A category with NOTHING measurable says so, rather than presenting an
    // empty control that looks like a loading state.
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No measurable attribute';
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
  console.log(`[AuditStack] Attribute dropdown rebuilt for "${activeType}" → ${attrs.length} attrs, active key: "${newKey}"`);
  return newKey;
}

/** Return the active AttributeDescriptor for the current type/key, or null. */
export function getActiveAttrOption(
  activeType: InspectElementType,
  activeKey:  string | null,
): AttributeDescriptor | null {
  if (!activeKey) return null;
  return resolveCategoryAttributes(activeType).find(a => a.key === activeKey) ?? null;
}

/** Map element type → store window-global key. */
export function storeKeyForType(type: InspectElementType): string {
  return ELEMENT_TYPE_STORE_KEYS[type] ?? '';
}

/**
 * Rebuild the element-type <select> dropdown based on which stores have data.
 * Returns the active element type (may change if prev type has no data).
 *
 * L-2032 — iterates the ONE category registry rather than a second hand-written
 * six-entry map that used to live here and silently disagreed with the first.
 */
export function rebuildDropdown(
  dropdown:        HTMLSelectElement,
  activeType:      InspectElementType,
  icons:           Record<InspectElementType, string>,
  labels:          Record<InspectElementType, string>,
): InspectElementType {
  dropdown.innerHTML = '';
  const present: InspectElementType[] = [];
  for (const type of INSPECT_CATEGORY_IDS) {
    const records = readCategoryRecords(type);
    const count = records?.length ?? 0;
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

/**
 * Build heatmap colour data for all elements of the given type.
 *
 * ⚠ Thin wrapper over `buildAttributeMapping()`, kept because the 3D coordinator
 * only needs the entries. Callers that must tell "unknown" from "all equal" —
 * every UI caller — read `buildAttributeMapping()` directly.
 */
export function buildHeatmapData(
  activeType: InspectElementType,
  activeKey:  string | null,
): Array<{ id: string; color: number }> {
  return buildAttributeMapping(activeType, activeKey).entries as Array<{ id: string; color: number }>;
}

// ── Honest refusal renderer ──────────────────────────────────────────────────

/**
 * §CONTEXT-DATA-HONESTY (L-2034) — render a REFUSAL, not an empty ramp.
 *
 * ⛔ THE DEFECT THIS CLOSES: both Inspect surfaces drew the Low→High legend
 * unconditionally and then filled the rows with '—'. A legend is a CLAIM that
 * the colours below it encode a value; drawing one over unmeasured data asserts
 * a mapping that does not exist, and reads to the eye as "all values are equal"
 * — the [[context-data-honesty-family]] failure, where failure and emptiness
 * are the same pixel.
 *
 * This renders the reason instead, and never a swatch. Deliberately reuses the
 * existing `aud-discovery-empty` class so it inherits the panel's empty-state
 * styling with no new CSS surface to keep in sync.
 */
export function renderAttributeRefusal(host: HTMLElement, mapping: AttributeMapping): void {
  const box = document.createElement('div');
  box.className = 'aud-discovery-empty aud-attr-refusal';
  box.dataset.refusalStatus = mapping.status;
  box.textContent = `⌀ ${mapping.reason}`;
  host.appendChild(box);
}
