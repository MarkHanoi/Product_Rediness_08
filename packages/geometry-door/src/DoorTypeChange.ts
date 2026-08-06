/**
 * DoorTypeChange — §FIX-HOSTED-TYPE-CHANGE (L-620). The DOOR half.
 *
 * ── WHAT THIS IS ──────────────────────────────────────────────────────────────
 *
 * The pure planner behind the properties-panel "Door Type" dropdown: given a PLACED
 * door record and a target `DoorSystemType.id`, produce the patch that swaps the type
 * IN PLACE — same element id, same host wall, same structural void.
 *
 * It is the deliberate sibling of `DoorTypeBackfill`, and it shares that module's ONE
 * safety rule and its ONE derivation rule:
 *
 *   • PARITY BY CONSTRUCTION (C11 §3) — the patch is NOT hand-rolled. It is derived by
 *     re-running the record through `buildDoorStoreRecord()`, the SAME chokepoint both
 *     creation paths call, with the target type supplied. A retyped door and a door
 *     freshly drawn with that type therefore agree by construction and cannot drift.
 *
 *   • THE VOID IS INVIOLATE (C15) — `offset` / `width` / `height` / `sillHeight` are
 *     the structural opening. They are mirrored on the flat `WallData.openings[]` entry
 *     that cuts the host wall's CSG, and that entry is NOT part of this operation. So
 *     they are passed through VERBATIM and the wall's opening never moves. Identity
 *     (`id` / `openingId` / `wallId`) is likewise preserved, so the hosted relationship
 *     and every reference to the element survive the swap.
 *
 * ── WHERE IT DIFFERS FROM THE BACKFILL, AND WHY ───────────────────────────────
 *
 * The backfill is a MIGRATION of records that were never typed, so it is maximally
 * conservative: it treats the frame/leaf SECTIONS (`frameThickness` / `frameDepth` /
 * `leafThickness`) as instance truth and leaves them alone.
 *
 * A type CHANGE is not a migration — it is a DELIBERATE ARCHITECTURAL DECISION. Picking
 * "Fire Door FD60" and keeping the softwood leaf section would be a door that is FD60 in
 * name only; the section IS the type. So the sections are re-resolved FROM THE TARGET
 * TYPE — achieved by simply NOT passing them to the chokepoint, whose documented rule is
 * "prefer what the opening persisted, otherwise re-resolve from the type".
 *
 * `PRESERVED_ON_TYPE_CHANGE` below is that boundary, written down: identity, the void,
 * and the instance's own topological CHOICES (leaf count, hinge side, swing direction,
 * mark) — which the type does not own and the architect set by hand.
 *
 * Pure: no DOM, no THREE, no I/O, no `window.*` (P4). P8 — every exported function
 * emits a span.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import { buildDoorStoreRecord } from './DoorOpeningFactory';
import { doorSystemTypeStore } from './DoorSystemTypeStore';
import type { DoorOpening } from './DoorTypes';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/geometry-door', '0.1.0');
    return _cachedTracer;
}

/**
 * THE BOUNDARY for a TYPE CHANGE (C15). Everything here is INSTANCE truth and is
 * carried across the swap unchanged; everything else the chokepoint emits is
 * TYPE-DERIVED and is re-seeded from the target type.
 *
 *   identity  — id / openingId / wallId  (the hosted relationship itself)
 *   the void  — offset / width / height / sillHeight  (mirrored on WallData.openings[])
 *   choices   — doorType / hingesSide / swingDirection / mark
 */
export const PRESERVED_ON_TYPE_CHANGE: ReadonlySet<string> = new Set([
    'id', 'openingId', 'wallId',
    'offset', 'width', 'height', 'sillHeight',
    'doorType', 'hingesSide', 'swingDirection',
    'mark',
]);

/** The outcome of planning a door type change. */
export interface DoorTypeChangePlan {
    readonly id: string;
    readonly wallId: string;
    readonly from: string | undefined;
    readonly to: string;
    /** Merge-patch to apply to the store record. Empty when `blockedReason` is set. */
    readonly patch: Readonly<Record<string, unknown>>;
    /**
     * Non-null when the change could NOT be planned — an unresolvable target type.
     * A finding to REPORT, never a type to invent.
     */
    readonly blockedReason: string | null;
}

/**
 * Plan a door's type change. PURE — reads the catalogue, mutates nothing. The command
 * applies it (C03 §1: mutation only through commands).
 *
 * @param door           The live store record being retyped.
 * @param targetTypeId   The `DoorSystemType.id` the architect chose.
 */
export function planDoorTypeChange(
    door: DoorOpening,
    targetTypeId: string,
): DoorTypeChangePlan {
    return _tracer().startActiveSpan('pryzm.door.planTypeChange', (span) => {
        try {
            span.setAttribute('pryzm.door.id', door.id);
            span.setAttribute('pryzm.door.targetTypeId', targetTypeId);

            const target = targetTypeId ? doorSystemTypeStore.getById(targetTypeId) : undefined;
            if (!target) {
                const reason =
                    `[DoorTypeChange] door type "${targetTypeId}" is not in doorSystemTypeStore — ` +
                    `refusing to retype door ${door.id}. Nothing changed.`;
                span.setAttribute('pryzm.door.typeChange.blocked', true);
                span.end();
                return {
                    id: door.id, wallId: door.wallId, from: door.systemTypeId,
                    to: targetTypeId, patch: {}, blockedReason: reason,
                };
            }

            // PARITY BY CONSTRUCTION — re-run through the ONE record chokepoint both
            // creation paths use. Only the PRESERVED fields are handed back to it; the
            // frame/leaf sections are DELIBERATELY omitted so the chokepoint re-resolves
            // them from the target type (see the module header).
            const canonical = buildDoorStoreRecord({
                opening: {
                    id:             door.openingId,   // the chokepoint's `opening.id` IS the openingId
                    elementId:      door.id,          // … and `opening.elementId` IS the door id
                    systemTypeId:   targetTypeId,
                    offset:         door.offset,
                    width:          door.width,
                    height:         door.height,
                    sillHeight:     door.sillHeight,
                    doorType:       door.doorType,
                    hingesSide:     door.hingesSide,
                    swingDirection: door.swingDirection,
                },
                wallId: door.wallId,
                mark:   door.mark,
            });

            const patch: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(canonical)) {
                if (PRESERVED_ON_TYPE_CHANGE.has(k)) continue;  // never move the founder's void
                if (v === undefined) continue;
                patch[k] = v;
            }

            span.setAttribute('pryzm.door.typeChange.patchKeys', Object.keys(patch).length);
            span.end();
            return {
                id: door.id,
                wallId: door.wallId,
                from: door.systemTypeId,
                to: targetTypeId,
                patch,
                blockedReason: null,
            };
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            throw err;
        }
    });
}
