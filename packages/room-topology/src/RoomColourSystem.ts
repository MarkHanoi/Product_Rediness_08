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

// ── Visualisation Mode ────────────────────────────────────────────────────────

/**
 * Controls how room fill colours are resolved in the viewport.
 *   detection  — unique per-room colour (default, from RoomDetectionEngine palette or occupancy)
 *   occupancy  — occupancy type palette (OCCUPANCY_PALETTE), ignores colour override
 *   area       — linear heatmap: smallest room = yellow, largest = green
 *   custom     — use room.colour override; fall back to occupancy palette
 *   sync-state — G-0.2: colours rooms by SyncState (no-template/planned-only/partial/synced/conflict/derived)
 */
export type RoomVisualisationMode = 'detection' | 'occupancy' | 'area' | 'custom' | 'sync-state';

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
    return OCCUPANCY_PALETTE[room.occupancyType] ?? '#E0E0E0';
  }

  static forOccupancy(occupancyType: RoomOccupancyType): string {
    return OCCUPANCY_PALETTE[occupancyType] ?? '#E0E0E0';
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

  static resolveForMode(
    room: Pick<RoomData, 'id' | 'colour' | 'occupancyType' | 'computed'>,
    mode: RoomVisualisationMode,
    allRooms?: Array<Pick<RoomData, 'computed'>>,
  ): string {
    switch (mode) {
      case 'occupancy':
        return OCCUPANCY_PALETTE[room.occupancyType] ?? '#E0E0E0';

      case 'custom':
        return room.colour ?? OCCUPANCY_PALETTE[room.occupancyType] ?? '#E0E0E0';

      case 'area': {
        if (!allRooms || allRooms.length === 0) return '#90CAF9';
        const areas  = allRooms.map(r => r.computed?.area ?? 0);
        const minA   = Math.min(...areas);
        const maxA   = Math.max(...areas);
        if (maxA === minA) return '#90CAF9';
        const t = (room.computed?.area ?? 0 - minA) / (maxA - minA);
        return RoomColourSystem._lerpHex('#FFEB3B', '#4CAF50', Math.max(0, Math.min(1, t)));
      }

      case 'sync-state': {
        const engine = RoomColourSystem._syncStateEngine ?? (window as any).syncStateEngine;
        if (!engine || typeof engine.recompute !== 'function') {
            return OCCUPANCY_PALETTE[room.occupancyType] ?? '#E0E0E0';
        }
        const state: string = engine.recompute(room.id) ?? 'no-template';
        return SYNC_STATE_COLOURS[state] ?? '#CBD5E1';
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
