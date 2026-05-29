// D2.1 — `validateRoomShape` pure validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29 §9.2).
//
// Pure function: room rectangle (post-subdivide, pre-doors) → DimensionalValidation.
// Checks G1 area max + G2 width max + G3 length max + G4 aspect ratio + G6
// uninterrupted-wall sanity. Returns hard + soft findings; the caller (D3.1
// enumerate.ts gate) drops candidates with any hard finding BEFORE Pareto.
//
// What this validator does NOT check:
//   • G5 furniture-fit — that's D2.2 `validateRoomFit` (runs after doors land).
//   • G7 circulation paths — partially covered by the existing §F-Sprint-5.
//   • G8 frontage allocation — that's D2.5 in the façade allocator (Tier 3).
//   • G10 kitchen work triangle — D2.3 (post-furnish).
//
// L2-pure: no THREE / DOM / RNG. Unit-tests in plain Node.

import type { RoomType } from '../types.js';
import { dimensionsFor } from './roomDimensions.js';
import type { DimensionalValidation, ValidationFinding } from './types.js';

/**
 * The minimal room shape this validator needs. Mirrors the existing
 * `RoomPlacement` (in `tgl/subdivide.ts`) — a room id + an axis-aligned
 * rectangle in metres (plan world frame `{x, z}`).
 *
 * `type` is the resolved `RoomType` (consumed from the bubble graph). `name`
 * is optional, surfaced into ValidationFinding.reason for the modal.
 */
export interface RoomShape {
    readonly id: string;
    readonly type: RoomType;
    readonly name?: string;
    /** Axis-aligned rectangle in metres. x0 < x1, z0 < z1. */
    readonly rect: { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number };
}

/**
 * Validate one room's shape against its `RoomDimensions` envelope.
 * Returns a DimensionalValidation (admissible + findings). The caller can
 * accumulate findings across all rooms with `mergeValidations` below.
 */
export function validateRoomShape(room: RoomShape): DimensionalValidation {
    const d = dimensionsFor(room.type);
    const w = room.rect.x1 - room.rect.x0;
    const h = room.rect.z1 - room.rect.z0;
    if (w <= 0 || h <= 0) {
        // Degenerate rectangle — pure-engine bug, but harden against it.
        return {
            admissible: false,
            hardFindings: [{
                roomId: room.id, severity: 'hard', metric: 'degenerate',
                reason: `room "${room.name ?? room.id}" has a non-positive footprint`,
                delta: 1.0,
            }],
            softFindings: [],
        };
    }
    const area = w * h;
    const shortSide = Math.min(w, h);
    const longSide = Math.max(w, h);
    const aspect = longSide / shortSide;
    const label = room.name ?? room.id;

    const hard: ValidationFinding[] = [];
    const soft: ValidationFinding[] = [];

    // ── G1 Area ──────────────────────────────────────────────────────────────
    if (area < d.areaMin - 1e-6) {
        hard.push({
            roomId: room.id, severity: 'hard', metric: 'areaMin', delta: 1.0,
            reason: `${label} (${room.type}) area ${area.toFixed(2)} m² < minimum ${d.areaMin} m²`,
        });
    }
    if (area > d.areaHardMax + 1e-6) {
        hard.push({
            roomId: room.id, severity: 'hard', metric: 'areaHardMax', delta: 1.0,
            reason: `${label} (${room.type}) area ${area.toFixed(2)} m² > hard max ${d.areaHardMax} m²`,
        });
    } else if (area > d.areaComfortableMax + 1e-6) {
        // Soft penalty scaled linearly between comfortable max and hard max.
        const range = Math.max(1e-6, d.areaHardMax - d.areaComfortableMax);
        const delta = Math.min(1, (area - d.areaComfortableMax) / range);
        soft.push({
            roomId: room.id, severity: 'soft', metric: 'areaComfortableMax', delta,
            reason: `${label} (${room.type}) area ${area.toFixed(2)} m² above comfortable ${d.areaComfortableMax} m²`,
        });
    } else if (area < d.areaComfortableMin - 1e-6) {
        const range = Math.max(1e-6, d.areaComfortableMin - d.areaMin);
        const delta = Math.min(1, (d.areaComfortableMin - area) / range);
        soft.push({
            roomId: room.id, severity: 'soft', metric: 'areaComfortableMin', delta,
            reason: `${label} (${room.type}) area ${area.toFixed(2)} m² below comfortable ${d.areaComfortableMin} m²`,
        });
    }

    // ── G2 Width ─────────────────────────────────────────────────────────────
    if (shortSide < d.widthMin - 1e-6) {
        hard.push({
            roomId: room.id, severity: 'hard', metric: 'widthMin', delta: 1.0,
            reason: `${label} (${room.type}) clear width ${shortSide.toFixed(2)} m < minimum ${d.widthMin} m`,
        });
    }
    if (shortSide > d.widthHardMax + 1e-6) {
        hard.push({
            roomId: room.id, severity: 'hard', metric: 'widthHardMax', delta: 1.0,
            reason: `${label} (${room.type}) width ${shortSide.toFixed(2)} m > hard max ${d.widthHardMax} m`,
        });
    } else if (shortSide < d.widthPreferredMin - 1e-6 || shortSide > d.widthPreferredMax + 1e-6) {
        soft.push({
            roomId: room.id, severity: 'soft', metric: 'widthPreferred', delta: 0.3,
            reason: `${label} (${room.type}) width ${shortSide.toFixed(2)} m outside preferred ${d.widthPreferredMin}–${d.widthPreferredMax} m`,
        });
    }

    // ── G3 Length ────────────────────────────────────────────────────────────
    if (longSide > d.lengthHardMax + 1e-6) {
        hard.push({
            roomId: room.id, severity: 'hard', metric: 'lengthHardMax', delta: 1.0,
            reason: `${label} (${room.type}) length ${longSide.toFixed(2)} m > hard max ${d.lengthHardMax} m`,
        });
    } else if (longSide > d.lengthSoftMax + 1e-6) {
        const range = Math.max(1e-6, d.lengthHardMax - d.lengthSoftMax);
        const delta = Math.min(1, (longSide - d.lengthSoftMax) / range);
        soft.push({
            roomId: room.id, severity: 'soft', metric: 'lengthSoftMax', delta,
            reason: `${label} (${room.type}) length ${longSide.toFixed(2)} m above soft max ${d.lengthSoftMax} m`,
        });
    }

    // ── G4 Aspect ratio ──────────────────────────────────────────────────────
    if (aspect > d.aspectHardMax + 1e-6) {
        hard.push({
            roomId: room.id, severity: 'hard', metric: 'aspectHardMax', delta: 1.0,
            reason: `${label} (${room.type}) aspect ${aspect.toFixed(2)}:1 > hard max ${d.aspectHardMax}:1 (tunnel room)`,
        });
    } else if (aspect > d.aspectSoftMax + 1e-6) {
        // Penalty escalates nonlinearly (squared) above the soft threshold per §4.2.
        const range = Math.max(1e-6, d.aspectHardMax - d.aspectSoftMax);
        const t = Math.min(1, (aspect - d.aspectSoftMax) / range);
        soft.push({
            roomId: room.id, severity: 'soft', metric: 'aspectSoftMax', delta: t * t,
            reason: `${label} (${room.type}) aspect ${aspect.toFixed(2)}:1 above soft max ${d.aspectSoftMax}:1`,
        });
    }

    // ── G6 Usable wall ───────────────────────────────────────────────────────
    // At this stage walls are the rectangle's 4 sides. The longest is `longSide`;
    // any required wall length ≤ longSide is satisfiable. A finer per-wall check
    // (subtracting door + window penetrations) lives in D2.2 validateRoomFit.
    if (d.usableWallMin > 0 && longSide < d.usableWallMin - 1e-6) {
        hard.push({
            roomId: room.id, severity: 'hard', metric: 'usableWallMin', delta: 1.0,
            reason: `${label} (${room.type}) longest wall ${longSide.toFixed(2)} m < required ${d.usableWallMin} m for furniture anchor`,
        });
    }

    return {
        admissible: hard.length === 0,
        hardFindings: hard,
        softFindings: soft,
    };
}

/**
 * Validate every room in a layout and return an aggregate result.
 * `admissible` is true ⇒ every room passed; false ⇒ at least one hard finding
 * across the layout. Findings preserve room order.
 */
export function validateAllRoomShapes(rooms: readonly RoomShape[]): DimensionalValidation {
    const hard: ValidationFinding[] = [];
    const soft: ValidationFinding[] = [];
    for (const r of rooms) {
        const v = validateRoomShape(r);
        hard.push(...v.hardFindings);
        soft.push(...v.softFindings);
    }
    return {
        admissible: hard.length === 0,
        hardFindings: hard,
        softFindings: soft,
    };
}
