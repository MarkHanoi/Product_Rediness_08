// ─── roomWallScope — the honest "walls of this room" scope resolution ─────────
//
// GR-10 (`[]`-means-unknown ledger) — ZeroTokenChatBridge's room arm read
// `rooms.flatMap((r) => r.boundingWallIds ?? [])`, which fed a chat COMMAND
// SCOPE. A room whose bounding-wall relationship was never recorded (the C79
// §7.1 writer-hardcodes-`[]` family) contributed nothing, silently — so "paint
// the kitchen walls" would quietly act on a SUBSET of the asked-for set, or on
// nothing, while presenting as a successful resolution. C80 §1.4 / the RAC
// hard-stopper doctrine: a refusal names BOTH numbers; it never acts on a set
// it cannot account for.
//
// The discriminator is core-app-model's `boundingWallIdsOrUnknown` (bed7aa67) —
// no rival vocabulary, no second `?? []`. PURE: no store access, no I/O.

import { boundingWallIdsOrUnknown } from '@pryzm/core-app-model';

export interface RoomWallScopeRoom {
    readonly id: string;
    readonly name?: string;
    readonly boundingWallIds?: readonly string[];
}

export type RoomWallScopeResolution =
    | {
          readonly kind: 'walls';
          /** Deduped wall ids across every matched room. MAY be empty — and an
           *  empty DETERMINED set is a real answer (C71 §4.4). */
          readonly ids: readonly string[];
      }
    | {
          readonly kind: 'refused';
          /** Refusal-grade copy for the chat surface (§CONTEXT-DATA-HONESTY):
           *  names how many of the matched rooms could not be read, and which. */
          readonly error: string;
          readonly unrecordedRoomLabels: readonly string[];
      };

/**
 * Resolve the bounding walls of a set of matched rooms, or REFUSE when any
 * matched room's bounding-wall relationship was never recorded. Acting on the
 * readable subset would silently understate the user's ask — the defect this
 * module exists to end — so one unreadable room refuses the whole scope, with
 * both numbers in the copy.
 */
export function resolveRoomWallScope(
    rooms: readonly RoomWallScopeRoom[],
): RoomWallScopeResolution {
    const ids: string[] = [];
    const unrecorded: string[] = [];
    for (const r of rooms) {
        const walls = boundingWallIdsOrUnknown(r);
        if (walls === null) {
            unrecorded.push(r.name ?? r.id);
            continue;
        }
        ids.push(...walls);
    }
    if (unrecorded.length > 0) {
        return {
            kind: 'refused',
            unrecordedRoomLabels: unrecorded,
            error:
                `I can't resolve walls for ${unrecorded.length} of ${rooms.length} matching ` +
                `room(s) (${unrecorded.join(', ')}) — their bounding-wall relationship was ` +
                `never recorded, so acting now could miss walls you asked about. ` +
                `Re-run room detection, then ask again.`,
        };
    }
    return { kind: 'walls', ids: [...new Set(ids)] };
}
