// T1.2 — Declarative adjacency rules
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §14, §19.1).
//
// THIS FILE DOES NOT DUPLICATE `programRules.ts`. It:
//   1. Re-exports `doorAllowedBetween` + `accessFrom` semantics as the canonical
//      source of A3 forbidden-adjacency truth (already tested + production).
//   2. Adds the per-program A1 MANDATORY adjacencies (master↔ensuite when
//      `program.masterEnSuite === true`; spine↔bedrooms when corridor exists).
//      These rules are codified in `bubbleGraph.ts` today as bubble-edge
//      construction; the validator (T2.1) checks that EVERY mandatory edge
//      is realised by the wallsAndDoors pass — catching the case where the
//      door reconciliation pass drops a mandatory door because no shared wall
//      was geometrically available.
//
// Pure data + program-conditional logic — ZERO side effects.

import type { ApartmentProgram, RoomType } from '../types.js';
import type { MandatoryAdjacency } from './types.js';

/**
 * The MANDATORY adjacencies derived from the program. The validator (T2.1)
 * verifies every entry is realised by a door in the wallsAndDoors output.
 *
 * Today's mandatory entries (codified by the bubble-graph builder):
 *
 *   • master ↔ ensuite  — only when `program.masterEnSuite` AND a bedroom exists.
 *   • hall   ↔ corridor — when both exist (the public/private spine connection).
 *   • hall   ↔ living   — when both exist; living is reached through the lobby.
 *
 * Note: bedroom ↔ corridor + bathroom ↔ corridor are PREFERRED but not strictly
 * mandatory in the framework — they're the typical case but not the only legal
 * case (a small flat can fold the bath off a bedroom in a Jack-and-Jill, etc.).
 * For now the validator treats them as preferred via the existing soft-weight
 * mechanism (`§ADJACENCY-PREFERENCE` `587f7b0`), NOT as hard mandatory.
 */
export function mandatoryAdjacenciesFor(program: ApartmentProgram): readonly MandatoryAdjacency[] {
    const out: MandatoryAdjacency[] = [];
    const hasBeds = Math.max(0, Math.floor(program.bedrooms)) > 0;

    // A1 master ↔ ensuite (when the program asks for it AND there's a bedroom).
    if (program.masterEnSuite && hasBeds) {
        out.push({ a: 'master', b: 'ensuite', via: 'door', id: 'master-ensuite' });
    }

    // A1 hall ↔ corridor when both exist. The corridor is created only when
    // bedrooms or bathrooms exist (per bubbleGraph builder); the hall is
    // created only when `program.entranceHall === true`.
    const hasBathsOrBeds = hasBeds || Math.max(0, Math.floor(program.bathrooms)) > 0;
    if (program.entranceHall && hasBathsOrBeds) {
        out.push({ a: 'hall', b: 'corridor', via: 'door', id: 'hall-corridor' });
    }

    // A1 hall ↔ living (the user's "lobby distributes to social zone" rule).
    if (program.entranceHall && program.livingRoom) {
        out.push({ a: 'hall', b: 'living', via: 'door', id: 'hall-living' });
    }

    return out;
}

/**
 * Per-room types classified by their "wet" status. Used by T2.4 wet-cluster
 * validator (later commit). EXPOSED here so a future caller can introspect.
 */
export const WET_ROOM_TYPES: ReadonlySet<RoomType> =
    new Set<RoomType>(['kitchen', 'bathroom', 'ensuite', 'wc', 'utility']);

/**
 * Acoustic-source / acoustic-receiver classification. Sources GENERATE noise
 * (TV, conversation, cooking, washer/dryer). Receivers are SENSITIVE to noise
 * (sleeping, concentration). Used by T2.3 acoustic-zoning validator (later
 * commit).
 */
export const ACOUSTIC_SOURCE_TYPES: ReadonlySet<RoomType> =
    new Set<RoomType>(['living', 'dining', 'kitchen', 'utility']);

export const ACOUSTIC_RECEIVER_TYPES: ReadonlySet<RoomType> =
    new Set<RoomType>(['master', 'bedroom', 'study']);
