/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Colour / Visual System
 * Phase:             Phase 11 (BIM 3.0 Room Intelligence — Sprint A2)
 * Files Modified:    src/elements/rooms/RoomColourSystem.ts
 * Classification:    A
 *
 * Contract:
 *   docs/01_ELEMENTS/09_Rooms_Contract/06-ROOM-INTEGRATION-CONTRACT.md §8
 *   docs/01_ELEMENTS/09_Rooms_Contract/00-ROOM-CONTRACT-INDEX.md R-10
 *   docs/01_ELEMENTS/09_Rooms_Contract/18-BIM30-ROOM-INTELLIGENCE-ANALYSIS.md §2.5
 *
 * Resolves room fill colours from:
 *   1. Room's explicit colour override (room.colour)
 *   2. Occupancy-based palette (OCCUPANCY_PALETTE)
 *   3. Visualisation mode (resolveForMode — area heatmap, occupancy, detection)
 * Also handles selection and hover state colour mutations.
 *
 * All colours are returned as hex strings (#rrggbb).
 * Design tokens mirror the CSS variables in AppTheme.ts.
 *
 * BIM 3.0 additions:
 *   - RoomVisualisationMode type
 *   - RoomColourSystem.resolveForMode(room, mode, allRooms?)
 *   - RoomColourSystem._lerpHex() — linear interpolation for area heatmap
 *
 * Sprint J extraction (2026-05-10): moved from src/engine/subsystems/rooms/ to
 * @pryzm/room-topology. No import remapping required — file had no src/ deps.
 */

import { RoomData, RoomOccupancyType } from './RoomTypes';
// TYPE-ONLY. Erased at compile, so this adds NO runtime edge back to
// core-app-model (which imports this package from PlanViewCanvas). A value
// import here would close a module-load cycle -- see the SCC note in
// presentation/ViewRangeIntentResolver.ts.
import type { RoomColourMode } from '@pryzm/core-app-model/presentation';

// ── Visualisation Mode ────────────────────────────────────────────────────────

/**
 * Controls how room fill colours are resolved in the viewport.
 *   detection  — unique per-room colour (default, from RoomDetectionEngine palette or occupancy)
 *   occupancy  — occupancy type palette (OCCUPANCY_PALETTE), ignores colour override
 *   area       — linear heatmap: smallest room = yellow, largest = green
 *   custom     — use room.colour override; fall back to occupancy palette
 *   sync-state — G-0.2: colours rooms by SyncState (no-template/planned-only/partial/synced/conflict/derived)
 */
/**
 * §ROOM-VG-CATEGORY (L-1610) -- this is now an ALIAS of the canonical
 * `RoomColourMode` declared in `@pryzm/core-app-model/presentation`, which is
 * also the union stored on the `room` VG category and persisted with the
 * project. The historical name is kept so existing importers do not churn;
 * restating the union here would give the codebase two lists to keep in step,
 * and one of them would rot.
 *
 * Adds `uniform` -- "all white" -- which the founder asked for by name.
 */
export type RoomVisualisationMode = RoomColourMode;

/**
 * G-0.2 — SyncState → fill colour map for room overlay.
 * Mirrors the SyncState priority comments in HierarchyTypes.ts.
 * null = no-template uses the default occupancy colour so unassigned rooms
 * still render meaningfully rather than being rendered grey over the detection colour.
 */
export const SYNC_STATE_COLOURS: Record<string, string> = {
    'no-template':   '#CBD5E1',
    'planned-only':  '#E2E8F0',
    'partial':       '#93C5FD',
    'synced':        '#6EE7B7',
    'conflict':      '#FCA5A5',
    'derived':       '#FCD34D',
};

// ── CSS Design Tokens (also applied in AppTheme.ts) ──────────────────────────

/**
 * §ROOM-UNCLASSIFIED-IS-NOT-A-COLOUR (L-1610).
 *
 * The colour a room takes when the active mode CANNOT be computed for it -- no
 * measured area to place on a size ramp, no occupancy type, no user-defined
 * colour. It is deliberately the same neutral the occupancy palette already uses
 * for `unclassified`, so it READS as "not determined" rather than as a
 * determination. Failure and emptiness must not become the same value: putting
 * an un-measured room at ramp position 0 would render it as "the smallest room
 * in the building", which is a claim nobody made.
 */
export const UNCLASSIFIED_FILL = '#E0E0E0';

/** Size ramp endpoints: smallest room -> largest room. */
export const AREA_RAMP_START = '#FFEB3B';
export const AREA_RAMP_END   = '#4CAF50';

/** "All white" -- the default single colour for `uniform` mode. */
export const DEFAULT_UNIFORM_FILL = '#FFFFFF';

export const ROOM_CSS_TOKENS: Record<string, string> = {
  '--room-residential':  '#B8D4F0',
  '--room-office':       '#C8E6C9',
  '--room-retail':       '#FFE0B2',
  '--room-healthcare':   '#F8BBD9',
  '--room-education':    '#E1BEE7',
  '--room-hospitality':  '#FFF9C4',
  '--room-industrial':   '#CFD8DC',
  '--room-circulation':  '#FFCCBC',
  '--room-amenity':      '#B2EBF2',
  '--room-outdoor':      '#DCEDC8',
  '--room-unclassified': '#E0E0E0',
};

// ── Occupancy → Hex Palette ───────────────────────────────────────────────────

export const OCCUPANCY_PALETTE: Record<RoomOccupancyType, string> = {
  'bedroom':              '#B8D4F0',
  'living-room':          '#A8C8E8',
  'kitchen':              '#B8D4F0',
  'bathroom':             '#B2EBF2',
  'dining-room':          '#B8D4F0',
  'utility-room':         '#CFD8DC',
  'garage':               '#CFD8DC',
  'storage-residential':  '#CFD8DC',
  'open-office':          '#C8E6C9',
  'private-office':       '#A5D6A7',
  'meeting-room':         '#81C784',
  'reception':            '#C8E6C9',
  'breakout':             '#DCEDC8',
  'server-room':          '#B0BEC5',
  'retail-floor':         '#FFE0B2',
  'stockroom':            '#FFCC80',
  'changing-room':        '#FFE0B2',
  'patient-room':         '#F8BBD9',
  'operating-theatre':    '#F48FB1',
  'waiting-room':         '#F8BBD9',
  'consultation-room':    '#FCE4EC',
  'pharmacy':             '#F8BBD9',
  'classroom':            '#E1BEE7',
  'laboratory':           '#CE93D8',
  'lecture-hall':         '#E1BEE7',
  'library':              '#EDE7F6',
  'staff-room':           '#E1BEE7',
  'hotel-bedroom':        '#FFF9C4',
  'restaurant':           '#FFF176',
  'bar':                  '#FFEE58',
  'function-room':        '#FFF9C4',
  'spa':                  '#FFF9C4',
  'warehouse':            '#CFD8DC',
  'loading-bay':          '#B0BEC5',
  'plant-room':           '#90A4AE',
  'electrical-room':      '#78909C',
  'corridor':             '#FFCCBC',
  'stairwell':            '#FFAB91',
  'lift-lobby':           '#FF8A65',
  'entrance-lobby':       '#FFCCBC',
  'foyer':                '#FFCCBC',
  'wc':                   '#B2EBF2',
  'accessible-wc':        '#B2EBF2',
  'shower-room':          '#B2EBF2',
  'kitchen-shared':       '#B2EBF2',
  'prayer-room':          '#B2EBF2',
  'terrace':              '#DCEDC8',
  'balcony':              '#C5E1A5',
  'atrium':               '#DCEDC8',
  'courtyard':            '#AED581',
  'unclassified':         '#E0E0E0',
};

// ── Colour Resolution ─────────────────────────────────────────────────────────

type ISyncStateEngineLite = { recompute: (roomId: string) => string | undefined };

export class RoomColourSystem {

  private static _syncStateEngine: ISyncStateEngineLite | undefined;

  static setSyncStateEngine(engine: ISyncStateEngineLite | undefined): void {
    RoomColourSystem._syncStateEngine = engine;
  }

  static resolve(room: Pick<RoomData, 'colour' | 'occupancyType'>): string {
    if (room.colour) return room.colour;
    return OCCUPANCY_PALETTE[room.occupancyType] ?? UNCLASSIFIED_FILL;
  }

  static forOccupancy(occupancyType: RoomOccupancyType): string {
    return OCCUPANCY_PALETTE[occupancyType] ?? UNCLASSIFIED_FILL;
  }

  static hoverColour(baseHex: string): string {
    return RoomColourSystem._blendTowardWhite(baseHex, 0.3);
  }

  static selectionColour(baseHex: string): string {
    return RoomColourSystem._blendTowardBlack(baseHex, 0.2);
  }

  static hexToRgb01(hex: string): [number, number, number] {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return [r, g, b];
  }

  static defaultOpacity(): number {
    return 0.35;
  }

  static resolveOpacity(room: Pick<RoomData, 'opacity'>): number {
    return room.opacity ?? RoomColourSystem.defaultOpacity();
  }

  /**
   * §ROOM-VG-CATEGORY (L-1610/L-1611) -- resolve the fill colour for one room
   * under one mode.
   *
   * `allRooms` is the SCOPE the ramp is computed against (normally every room on
   * the level being drawn). `opts.uniformColour` lets the `room` VG category
   * supply the single colour for `uniform` mode.
   */
  static resolveForMode(
    room: Pick<RoomData, 'id' | 'colour' | 'occupancyType' | 'computed'>,
    mode: RoomVisualisationMode,
    allRooms?: Array<Pick<RoomData, 'computed'>>,
    opts?: { uniformColour?: string },
  ): string {
    switch (mode) {
      case 'occupancy':
        return OCCUPANCY_PALETTE[room.occupancyType] ?? UNCLASSIFIED_FILL;

      case 'custom':
        // A room nobody assigned a colour to is UNCLASSIFIED under "user-defined".
        // Falling back to the occupancy palette here is what made the palette look
        // authored when it was not -- the founder's "seemingly random".
        return room.colour ?? UNCLASSIFIED_FILL;

      case 'uniform':
        // Beats every per-room override on purpose: "all white" that leaves the
        // coloured rooms coloured is not all white.
        return opts?.uniformColour ?? DEFAULT_UNIFORM_FILL;

      case 'area': {
        // ⭐ (L-1610) The numerator used to read
        //     `(room.computed?.area ?? 0 - minA)`
        // and `??` binds LOOSER than `-`, so it parsed as `area ?? (0 - minA)`:
        // whenever the area EXISTED -- i.e. for every real room -- `minA` was
        // never subtracted and the ramp position was `area / (maxA - minA)`.
        // With areas 100/110/120 the smallest room scored t = 5, clamped to 1,
        // and rendered as the LARGEST room's colour. Exactly inverted, and
        // invisible to any test that only asserted "a hex string came back".
        const own = room.computed?.area;
        // A room with no measured area cannot be placed on a size ramp.
        if (typeof own !== 'number' || !Number.isFinite(own)) return UNCLASSIFIED_FILL;

        // ...and un-measured rooms must not pin the ramp floor at a phantom 0.
        const areas = (allRooms ?? [])
          .map(r => r.computed?.area)
          .filter((a): a is number => typeof a === 'number' && Number.isFinite(a));
        if (areas.length === 0) return UNCLASSIFIED_FILL;

        const minA = Math.min(...areas);
        const maxA = Math.max(...areas);
        // Every room the same size: the ramp carries no information, so do not
        // draw one. Mid-ramp would imply a spread that does not exist.
        if (maxA === minA) return AREA_RAMP_START;

        const t = (own - minA) / (maxA - minA);
        return RoomColourSystem._lerpHex(AREA_RAMP_START, AREA_RAMP_END, Math.max(0, Math.min(1, t)));
      }

      case 'sync-state': {
        // P4 (L-1610): this used to fall back to a window-any cast on `syncStateEngine`.
        // The engine is injected explicitly by `initDataPlatform.ts` via
        // `setSyncStateEngine()`; when it is absent the honest answer is
        // UNCLASSIFIED -- not the occupancy palette, which would show a
        // confident type colour on a control that claims to be showing sync state.
        const engine = RoomColourSystem._syncStateEngine;
        if (!engine || typeof engine.recompute !== 'function') return UNCLASSIFIED_FILL;
        const state = engine.recompute(room.id);
        if (!state) return UNCLASSIFIED_FILL;
        return SYNC_STATE_COLOURS[state] ?? UNCLASSIFIED_FILL;
      }

      case 'detection':
      default:
        return RoomColourSystem.resolve(room as Pick<RoomData, 'colour' | 'occupancyType'>);
    }
  }

  private static _blendTowardWhite(hex: string, amount: number): string {
    const [r, g, b] = RoomColourSystem.hexToRgb01(hex);
    const blend = (c: number) => Math.round((c + (1 - c) * amount) * 255);
    return `#${blend(r).toString(16).padStart(2, '0')}${blend(g).toString(16).padStart(2, '0')}${blend(b).toString(16).padStart(2, '0')}`;
  }

  private static _blendTowardBlack(hex: string, amount: number): string {
    const [r, g, b] = RoomColourSystem.hexToRgb01(hex);
    const blend = (c: number) => Math.round(c * (1 - amount) * 255);
    return `#${blend(r).toString(16).padStart(2, '0')}${blend(g).toString(16).padStart(2, '0')}${blend(b).toString(16).padStart(2, '0')}`;
  }

  static _lerpHex(hexA: string, hexB: string, t: number): string {
    const [r1, g1, b1] = RoomColourSystem.hexToRgb01(hexA);
    const [r2, g2, b2] = RoomColourSystem.hexToRgb01(hexB);
    const lerp = (a: number, b: number) => Math.round((a + (b - a) * t) * 255);
    return `#${lerp(r1, r2).toString(16).padStart(2, '0')}${lerp(g1, g2).toString(16).padStart(2, '0')}${lerp(b1, b2).toString(16).padStart(2, '0')}`;
  }
}
