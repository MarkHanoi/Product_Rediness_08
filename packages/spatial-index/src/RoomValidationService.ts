// @migration Sprint-AC: promoted from src/engine/subsystems/spatial/RoomValidationService.ts
/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Spatial Intelligence — Room Validation
 * Phase:             Phase 11 (BIM 3.0 Room Intelligence — Sprint A1)
 * Files Modified:    src/spatial/RoomValidationService.ts (NEW)
 * Classification:    A
 *
 * Contract:
 *   docs/01_ELEMENTS/09_Rooms_Contract/18-BIM30-ROOM-INTELLIGENCE-ANALYSIS.md §2.7
 *   docs/01_ELEMENTS/09_Rooms_Contract/00-ROOM-CONTRACT-INDEX.md R-1
 *   docs/02-decisions/contracts/01-BIM-ENGINE-CORE-CONTRACT.md §1.3
 *
 * Pure read-only validation service — never writes to any store.
 * Computes ephemeral validation issues from live data at call time.
 * Registered on window as window.roomValidationService.
 *
 * Validation rules implemented:
 *   ROOM_UNNAMED         — room.name is empty
 *   ROOM_NO_DOOR         — no door connection in the room graph
 *   ROOM_AREA_TOO_SMALL  — area < systemType.minArea for this occupancy
 *   ROOM_NO_PLUMBING     — wet-room type with no plumbing fixtures inside
 *   ROOM_AREA_OVER_TARGET — area > systemType.targetArea * 1.5 (info only)
 *
 * Compliance:
 *   - Read-only: never writes to any store.
 *   - No THREE.js imports.
 *   - All store access via window.* at call time — never at import time.
 *   - Registered on window as window.roomValidationService.
 */

import { storeRegistry } from '@pryzm/core-app-model';

// ── Public Types ──────────────────────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface RoomValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  suggestedFix?: string;
}

// ── Occupancy types that must have plumbing ───────────────────────────────────

const WET_ROOM_TYPES = new Set([
  'bathroom',
  'wc',
  'accessible-wc',
  'shower-room',
]);

// ── Service ───────────────────────────────────────────────────────────────────

export class RoomValidationService {

  /**
   * Compute all validation issues for a room.
   * Returns an empty array if the room cannot be found.
   * Results are ephemeral — not persisted to any store.
   */
  validate(roomId: string): RoomValidationIssue[] {
    const roomStore         = storeRegistry.getStoreForType("room") as any;
    const roomQueryService  = window.roomQueryService;
    const roomGraphService  = window.roomGraphService;
    const roomSystemTypeStore = window.roomSystemTypeStore; // TODO(TASK-08)
    const plumbingStore     = storeRegistry.getStoreForType("plumbing") as any;

    if (!roomStore) return [];

    const room = roomStore.getById(roomId);
    if (!room) return [];

    const issues: RoomValidationIssue[] = [];

    // ── ROOM_UNNAMED ────────────────────────────────────────────────────────
    if (!room.name || room.name.trim() === '') {
      issues.push({
        code: 'ROOM_UNNAMED',
        severity: 'warning',
        message: 'Room has no name',
        suggestedFix: 'Enter a name in the Identity section above',
      });
    }

    // ── ROOM_NO_DOOR ────────────────────────────────────────────────────────
    // Try via roomQueryService first (preferred), fall back to graph service directly.
    let doorConnectionCount = -1;

    if (roomQueryService && typeof roomQueryService.getConnectedRooms === 'function') {
      try {
        const connected = roomQueryService.getConnectedRooms(roomId);
        doorConnectionCount = connected.length;
      } catch {
        doorConnectionCount = -1;
      }
    }

    if (doorConnectionCount === -1 && roomGraphService) {
      try {
        const levelId = roomGraphService.getLevelForRoom?.(roomId);
        if (levelId) {
          const graph = roomGraphService.getGraph(levelId);
          const node  = graph?.nodes?.get?.(roomId);
          if (node) doorConnectionCount = node.connectedRooms.length;
        }
      } catch {
        doorConnectionCount = -1;
      }
    }

    if (doorConnectionCount === 0) {
      issues.push({
        code: 'ROOM_NO_DOOR',
        severity: 'error',
        message: 'Room has no door — isolated from the rest of the building',
        suggestedFix: 'Place a door in one of the bounding walls',
      });
    }

    // ── ROOM_AREA_TOO_SMALL / ROOM_AREA_OVER_TARGET ─────────────────────────
    if (roomSystemTypeStore && typeof roomSystemTypeStore.getByOccupancy === 'function') {
      try {
        const systemTypes = roomSystemTypeStore.getByOccupancy(room.occupancyType);
        const best = systemTypes?.[0];
        if (best) {
          const area = room.computed?.area ?? 0;
          if (typeof best.minArea === 'number' && area < best.minArea) {
            issues.push({
              code: 'ROOM_AREA_TOO_SMALL',
              severity: 'warning',
              message: `Area ${area.toFixed(1)} m² is below the minimum ${best.minArea} m² for ${room.occupancyType.replace(/-/g, ' ')}`,
              suggestedFix: 'Expand the room boundary or choose a different room type',
            });
          }
          if (typeof best.targetArea === 'number' && area > best.targetArea * 1.5) {
            issues.push({
              code: 'ROOM_AREA_OVER_TARGET',
              severity: 'info',
              message: `Area ${area.toFixed(1)} m² is significantly above the target of ${best.targetArea} m²`,
              suggestedFix: 'Consider subdividing or reviewing the room programme',
            });
          }
        }
      } catch {
        // System type store not available — skip area checks
      }
    }

    // ── ROOM_NO_PLUMBING ────────────────────────────────────────────────────
    if (WET_ROOM_TYPES.has(room.occupancyType)) {
      let hasPlumbing = false;

      if (plumbingStore && typeof plumbingStore.getAll === 'function') {
        const allPlumbing = plumbingStore.getAll();
        if (allPlumbing.length > 0 && roomQueryService) {
          try {
            const elements = roomQueryService.getElementsInRoom(roomId);
            hasPlumbing = elements.some((el: any) => el.type === 'plumbing');
          } catch {
            // If query fails, assume plumbing is present (don't false-alarm)
            hasPlumbing = true;
          }
        } else if (allPlumbing.length === 0) {
          // No plumbing on the project at all — definitely none in this room
          hasPlumbing = false;
        } else {
          // plumbingStore present but roomQueryService not available — skip
          hasPlumbing = true;
        }
      }

      if (!hasPlumbing) {
        issues.push({
          code: 'ROOM_NO_PLUMBING',
          severity: 'error',
          message: `${room.occupancyType.replace(/-/g, ' ')} room has no plumbing fixtures`,
          suggestedFix: 'Add sanitary fixtures using the Plumbing tool',
        });
      }
    }

    return issues;
  }

  /**
   * Validate all rooms on a level and return a summary count.
   * Useful for the global validation sweep (badge counts on toolbar).
   */
  validateLevel(levelId: string): { errors: number; warnings: number; info: number } {
    const roomStore = storeRegistry.getStoreForType("room") as any;
    if (!roomStore) return { errors: 0, warnings: 0, info: 0 };

    const rooms = typeof roomStore.getByLevel === 'function'
      ? roomStore.getByLevel(levelId)
      : roomStore.getAll().filter((r: any) => r.levelId === levelId);

    let errors = 0;
    let warnings = 0;
    let info = 0;

    for (const room of rooms) {
      const issues = this.validate(room.id);
      for (const issue of issues) {
        if (issue.severity === 'error')   errors++;
        if (issue.severity === 'warning') warnings++;
        if (issue.severity === 'info')    info++;
      }
    }

    return { errors, warnings, info };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const roomValidationService = new RoomValidationService();

// Register on window so UI layers can access without circular imports
if (typeof window !== 'undefined') {
  window.roomValidationService = roomValidationService;
}
