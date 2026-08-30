/**
 * resolveDeleteCommand — §DELETE-ONE-ROUTE (L-10813), C94 §13 DELTA #2 / §TOBE.6 RM-9.
 *
 * ## THE DEFECT THIS CLOSES
 *
 * **Pressing Delete on a room did nothing**, from either surface. `DeleteElementCommand`
 * self-discovers its target by probing ~16 stores and **`grep -c roomStore` on it returns
 * `0`** — re-measured at `0589a36c` — so a room fell through to its terminal refusal,
 * *"Element not found in any store"*. C94 §6 has carried this since 2026-08-18.
 *
 * ⭐ **The honesty half is already fixed and is NOT re-litigated here.** `0589a36c`
 * (§DELETE-MUST-ANSWER, L-1403) made both surfaces REPORT the refusal instead of
 * swallowing it — `BimService.deleteSelected` now keeps the selection and toasts the
 * reason, and `plugins/view` returns a `capabilityRefused`. So today a room delete is a
 * **loud refusal**, which is strictly better than the old silent no-op. **What it still
 * is not, is a delete.** This file supplies the missing capability.
 *
 * ## WHY A RESOLVER AND NOT A BRANCH
 *
 * ⛔ **`DeleteElementCommand` MUST NOT grow a room arm.** [C84 EI-4a] is *one route per
 * user intent*, and a better command already exists: `DeleteRoomCommand` snapshots the
 * whole `RoomData` and its undo restores **more than it removed** — store record,
 * `bimManager` registration, `elementRegistry` semantic entry, `roomSpatialIndex` entry
 * and the semantic-graph edges (C94 §1.2, §10: *"restore ⊇ write"*). Adding a room branch
 * to the general command would mint the rival answer EI-9 forbids while a sound command
 * sat unused.
 *
 * ⛔ **AND THE MAPPING MUST NOT BE WRITTEN TWICE.** Before this file, `plugins/view`'s
 * handler held an `opening` / `lighting` / else chain and `BimService` constructed
 * `DeleteElementCommand` **directly** — two surfaces, two answers to *"which command
 * deletes this?"*, and the room gap existed in both. That is EI-9 in its plainest form,
 * and it is why the fix is ONE function both call rather than two matching edits.
 *
 * ⚠ **This is also why `BimService` may now pass its `kind` string without violating its
 * own instruction not to branch on it.** That comment (`BimService.ts`) warns that kind
 * strings are inconsistently cased — `SlabFragmentBuilder` mints `'Slab'` while walls
 * mint `'wall'` — and that branching *there* is a trap. Handing the string to the single
 * authority that owns the mapping is the opposite of branching on it locally: the
 * inconsistency is normalised in exactly one place, below.
 *
 * ## THE CASING RULE, and what it deliberately does NOT do
 *
 * The tag is lower-cased before lookup, so `'Slab'` and `'slab'` agree. ⛔ **Anything not
 * named here still falls through to `DeleteElementCommand` exactly as before** — this
 * function adds a room route and normalises casing; it changes the answer for **no other
 * family**. Room meshes carry `elementType: 'room'` on both the overlay and the volume
 * (`RoomBoundaryBuilder.ts:342,407`), so the tag is present on whichever one is selected.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import type { Command } from './types';
import { DeleteElementCommand } from './walls/DeleteElementCommand';
import { DeleteOpeningCommand } from './slabs/DeleteOpeningCommand';
import { DeleteLightingCommand } from './lighting/DeleteLightingCommand';
import { DeleteRoomCommand } from './rooms/DeleteRoomCommand';

/**
 * The one mapping from a scene `elementType` tag to the command that deletes it.
 *
 * Families absent from this table are not unsupported — they are handled by
 * `DeleteElementCommand`'s store probe, which is the correct default and covers walls,
 * slabs, columns, beams and the rest. A family appears here only when it needs a
 * SPECIALISED command, i.e. when the general probe cannot reach its store.
 */
const SPECIALISED: Readonly<Record<string, (id: string) => Command>> = {
    opening: id => new DeleteOpeningCommand(id),
    lighting: id => new DeleteLightingCommand(id),
    // ⭐ THE ADDITION (C94 DELTA #2). `DeleteElementCommand` cannot reach `roomStore`;
    // `DeleteRoomCommand` can, and its undo restores every side-registration it removed.
    room: id => new DeleteRoomCommand(id),
};

/**
 * Which command deletes this element?
 *
 * `elementType` is the scene tag (`userData.elementType` / `userData.type`) and may be
 * absent, empty or inconsistently cased — all three are handled, and all three fall back
 * to the general store-probing command rather than refusing.
 */
export function resolveDeleteCommand(elementId: string, elementType?: string): Command {
    return _tracer().startActiveSpan('pryzm.element.resolveDeleteCommand', (span) => {
        try {
            const tag = String(elementType ?? '').toLowerCase();
            const specialised = SPECIALISED[tag];
            // The ROUTE is the fact worth tracing. `DeleteElementCommand` is the
            // correct answer for most families AND the answer an unrecognised
            // tag falls through to; a trace carrying only the resulting command
            // name could not tell "general probe, as designed" from "the tag was
            // spelled wrong and nobody noticed".
            span.setAttribute('pryzm.delete.elementId', elementId);
            span.setAttribute('pryzm.delete.elementType', tag);
            // Asked through the file's OWN exported predicate rather than by
            // re-testing `specialised` for truthiness — that is exactly what
            // `hasSpecialisedDeleteCommand` says it is exported for, and a
            // second spelling of "is this family specialised?" is the rot C84
            // EI-9 names. (It also avoids TS2774: a function value read as a
            // condition is always truthy, so the compiler rightly objects.)
            span.setAttribute(
                'pryzm.delete.route',
                hasSpecialisedDeleteCommand(elementType) ? 'specialised' : 'general-probe',
            );
            return specialised ? specialised(elementId) : new DeleteElementCommand(elementId);
        } finally {
            span.end();
        }
    });
}

// P8 / C10 §2 — same tracer idiom as `DeleteElementsBatchCommand.ts` /
// `moveReweldPreflight.ts` in this package (C84 EI-9: one tracer authority per
// package, never a second wrapper).
let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/**
 * Does this element type have a specialised delete command?
 *
 * Exported so a caller can say WHY it routed the way it did without re-deriving the
 * table, and so a test can enumerate the specialised set instead of hard-coding it —
 * a hand-copied list of these is exactly what rots (C84 EI-9).
 */
export function hasSpecialisedDeleteCommand(elementType?: string): boolean {
    return String(elementType ?? '').toLowerCase() in SPECIALISED;
}
