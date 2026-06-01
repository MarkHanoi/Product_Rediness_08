// @migration Sprint-AC: promoted from src/engine/subsystems/spatial/RoomTypeInferenceEngine.ts
// AC-0: import of RoomOccupancyType updated from '../rooms/RoomTypes' → '@pryzm/room-topology'
/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Spatial Intelligence — Room Type Inference
 * Phase:             Phase B.2
 * Files Modified:    src/spatial/RoomTypeInferenceEngine.ts (NEW)
 * Classification:    A
 *
 * Contract:
 *   docs/01_ELEMENTS/09_Rooms_Contract/18-BIM30-ROOM-INTELLIGENCE-ANALYSIS.md §2.6
 *   docs/02-decisions/contracts/01-BIM-ENGINE-CORE-CONTRACT.md §1
 *   docs/02-decisions/contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md §1 (no `any` in public API)
 *   docs/02-decisions/contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md §1 (read-only, no store writes)
 *
 * PURPOSE:
 *   Rule-based room type inference from contained elements, area, and geometry.
 *   Surfaced in RoomPropertySection.ts as a dismissible suggestion banner.
 *
 * DATA FLOW (read-only):
 *   window.roomStore          → room data // TODO(TASK-08)
 *   window.roomQueryService   → getElementsInRoom()
 *   window.furnitureStore     → element type hints // TODO(TASK-08)
 *   window.plumbingStore      → fixture type hints // TODO(TASK-08)
 *
 * RULES:
 *   - No store writes anywhere in this file.
 *   - No THREE.js imports.
 *   - No Anthropic / fetch AI calls.
 *   - No `any` in the public API.
 *   - All store access via window.* at call time.
 *   - Registered on window as window.roomTypeInferenceEngine.
 */

import type { RoomOccupancyType } from '@pryzm/room-topology';
import { storeRegistry } from '@pryzm/core-app-model';

// ── Public Types ──────────────────────────────────────────────────────────────

export interface RoomTypeInferenceSuggestion {
  /** The suggested occupancy type. */
  suggested: RoomOccupancyType;
  /** Confidence score 0–1. */
  confidence: number;
  /** Human-readable explanation for the suggestion. */
  reason: string;
}

// ── Rule definitions ──────────────────────────────────────────────────────────

interface InferenceRule {
  /** Human-readable rule name for debugging. */
  name: string;
  /** Suggested type if this rule matches. */
  type: RoomOccupancyType;
  /** Confidence level this rule contributes. */
  confidence: number;
  /** Reason string shown to the user. */
  reason: string;
  /** Returns true if this rule applies. Receives element type counts + room area. */
  test: (
    elementCounts: Record<string, number>,
    area: number,
    perimeterToAreaRatio: number,
    furnitureNames: string[],
    plumbingTypes: string[],
  ) => boolean;
}

const INFERENCE_RULES: InferenceRule[] = [
  // ── Wet rooms ───────────────────────────────────────────────────────────────
  {
    name: 'bathroom-plumbing-small',
    type: 'bathroom',
    confidence: 0.88,
    reason: 'plumbing fixture(s) detected in a small room',
    test: (_, area, __, ___, plumbing) =>
      plumbing.length > 0 && area < 8,
  },
  {
    name: 'bathroom-toilet-sink',
    type: 'bathroom',
    confidence: 0.90,
    reason: 'toilet and sink detected',
    test: (_, __, ___, ____, plumbing) =>
      plumbing.some(t => /toilet|wc/i.test(t)) &&
      plumbing.some(t => /sink|basin/i.test(t)),
  },

  // ── Bedrooms ────────────────────────────────────────────────────────────────
  {
    name: 'bedroom-bed',
    type: 'bedroom',
    confidence: 0.90,
    reason: 'bed furniture detected',
    test: (_, __, ___, furnitureNames) =>
      furnitureNames.some(n => /\bbed\b|double\s*bed|single\s*bed|bunk/i.test(n)),
  },
  {
    name: 'bedroom-wardrobe',
    type: 'bedroom',
    confidence: 0.70,
    reason: 'wardrobe or closet detected',
    test: (_, __, ___, furnitureNames) =>
      furnitureNames.some(n => /wardrobe|closet|armoire/i.test(n)),
  },

  // ── Kitchen ─────────────────────────────────────────────────────────────────
  {
    name: 'kitchen-appliances',
    type: 'kitchen',
    confidence: 0.85,
    reason: 'kitchen appliances or sink detected',
    test: (_, __, ___, furnitureNames, plumbing) =>
      furnitureNames.some(n => /cooker|hob|oven|fridge|dishwasher|kitchen\s*unit/i.test(n)) ||
      plumbing.some(t => /kitchen\s*sink|utility\s*sink/i.test(t)),
  },

  // ── Dining ──────────────────────────────────────────────────────────────────
  {
    name: 'dining-table-chairs',
    type: 'dining-room',
    confidence: 0.72,
    reason: 'dining table and chairs detected',
    test: (_, __, ___, furnitureNames) =>
      furnitureNames.some(n => /dining\s*table|table/i.test(n)) &&
      furnitureNames.filter(n => /chair/i.test(n)).length >= 2,
  },

  // ── Living ──────────────────────────────────────────────────────────────────
  {
    name: 'living-sofa',
    type: 'living-room',
    confidence: 0.75,
    reason: 'sofa or armchair detected',
    test: (_, __, ___, furnitureNames) =>
      furnitureNames.some(n => /sofa|couch|armchair|settee/i.test(n)),
  },

  // ── Meeting / Office ─────────────────────────────────────────────────────────
  {
    name: 'meeting-chairs-table',
    type: 'meeting-room',
    confidence: 0.78,
    reason: 'meeting table with 4+ chairs detected',
    test: (_, __, ___, furnitureNames) =>
      furnitureNames.some(n => /conference|meeting\s*table/i.test(n)) ||
      (furnitureNames.filter(n => /chair/i.test(n)).length >= 4 &&
       furnitureNames.some(n => /table/i.test(n))),
  },
  {
    name: 'office-desk',
    type: 'private-office',
    confidence: 0.72,
    reason: 'office desk detected',
    test: (_, __, ___, furnitureNames) =>
      furnitureNames.some(n => /desk|workstation/i.test(n)),
  },

  // ── Storage ─────────────────────────────────────────────────────────────────
  {
    name: 'storage-small-no-furniture',
    type: 'storage-residential',
    confidence: 0.60,
    reason: 'small room with no identifiable furniture (likely storage)',
    test: (_, area, __, furnitureNames) =>
      area < 4 && furnitureNames.length === 0,
  },
  {
    name: 'storage-shelving',
    type: 'stockroom',
    confidence: 0.80,
    reason: 'shelving or racking units detected',
    test: (_, __, ___, furnitureNames) =>
      furnitureNames.some(n => /shelf|shelving|rack|cabinet/i.test(n)),
  },

  // ── Circulation ─────────────────────────────────────────────────────────────
  {
    name: 'circulation-high-ratio',
    type: 'corridor',
    confidence: 0.65,
    reason: 'high perimeter-to-area ratio suggests a corridor or lobby',
    test: (_, area, pRatio) =>
      pRatio > 3.0 && area > 2,
  },

  // ── Plant / Utility ─────────────────────────────────────────────────────────
  {
    name: 'plant-mep',
    type: 'plant-room',
    confidence: 0.75,
    reason: 'mechanical or electrical equipment detected',
    test: (_, __, ___, furnitureNames) =>
      furnitureNames.some(n => /boiler|ahu|vav|panel\s*board|switchgear|pump|cooling\s*tower/i.test(n)),
  },
];

// ── Service ───────────────────────────────────────────────────────────────────

export class RoomTypeInferenceEngine {

  /**
   * Infer the most likely room type from contents, area, and geometry.
   * Returns null if no rule matches with sufficient confidence.
   *
   * @param roomId  The ID of the room to analyse.
   */
  inferType(roomId: string): RoomTypeInferenceSuggestion | null {
    const roomStore = storeRegistry.getStoreForType("room") as any;
    const roomQueryService = window.roomQueryService;
    if (!roomStore || !roomQueryService) return null;

    const room = roomStore.getById(roomId);
    if (!room) return null;

    // ── Collect element data ─────────────────────────────────────────────────
    let elements: Array<{ id: string; type: string; levelId: string }> = [];
    try {
      elements = roomQueryService.getElementsInRoom(roomId) ?? [];
    } catch {
      elements = [];
    }

    const elementCounts: Record<string, number> = {};
    for (const el of elements) {
      elementCounts[el.type] = (elementCounts[el.type] ?? 0) + 1;
    }

    // Collect furniture display names
    const furnitureStore = storeRegistry.getStoreForType("furniture") as any;
    const furnitureNames: string[] = [];
    if (furnitureStore && typeof furnitureStore.getAll === 'function') {
      const furnitureIds = new Set(
        elements.filter(e => e.type === 'furniture').map(e => e.id),
      );
      for (const f of furnitureStore.getAll()) {
        if (furnitureIds.has(f.id)) {
          const label: string = f.name ?? f.furnitureType ?? f.type ?? '';
          if (label) furnitureNames.push(label);
        }
      }
    }

    // Collect plumbing fixture types
    const plumbingStore = storeRegistry.getStoreForType("plumbing") as any;
    const plumbingTypes: string[] = [];
    if (plumbingStore && typeof plumbingStore.getAll === 'function') {
      const plumbingIds = new Set(
        elements.filter(e => e.type === 'plumbing').map(e => e.id),
      );
      for (const p of plumbingStore.getAll()) {
        if (plumbingIds.has(p.id)) {
          const label: string = p.fixtureType ?? p.name ?? p.type ?? '';
          if (label) plumbingTypes.push(label);
        }
      }
    }

    // ── Spatial metrics ─────────────────────────────────────────────────────
    const area: number = room.computed?.area ?? 0;
    const perimeter: number = room.computed?.perimeter ?? 0;
    const perimeterToAreaRatio: number = area > 0 ? perimeter / area : 0;

    // ── Run rules ───────────────────────────────────────────────────────────
    let bestRule: InferenceRule | null = null;
    let bestConfidence = 0;

    for (const rule of INFERENCE_RULES) {
      // Skip if the room already has this occupancy type
      if (rule.type === room.occupancyType) continue;

      try {
        if (rule.test(elementCounts, area, perimeterToAreaRatio, furnitureNames, plumbingTypes)) {
          if (rule.confidence > bestConfidence) {
            bestConfidence = rule.confidence;
            bestRule = rule;
          }
        }
      } catch {
        // Rule evaluation error — skip this rule silently
      }
    }

    if (!bestRule || bestConfidence < 0.55) return null;

    return {
      suggested: bestRule.type,
      confidence: bestConfidence,
      reason: bestRule.reason,
    };
  }

  /**
   * Run inference across all rooms on a level.
   * Returns a map of roomId → suggestion (only rooms with a suggestion are included).
   *
   * @param levelId The level to scan.
   */
  inferLevel(levelId: string): Map<string, RoomTypeInferenceSuggestion> {
    const roomStore = storeRegistry.getStoreForType("room") as any;
    if (!roomStore) return new Map();

    const rooms = typeof roomStore.getByLevel === 'function'
      ? roomStore.getByLevel(levelId)
      : roomStore.getAll().filter((r: { levelId: string }) => r.levelId === levelId);

    const results = new Map<string, RoomTypeInferenceSuggestion>();

    for (const room of rooms) {
      const suggestion = this.inferType(room.id);
      if (suggestion) results.set(room.id, suggestion);
    }

    return results;
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────

export const roomTypeInferenceEngine = new RoomTypeInferenceEngine();

if (typeof window !== 'undefined') {
  window.roomTypeInferenceEngine = roomTypeInferenceEngine;
}
