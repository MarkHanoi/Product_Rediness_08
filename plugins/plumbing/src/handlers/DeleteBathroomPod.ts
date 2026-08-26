// DeleteBathroomPodHandler — deleting a pod reaps EVERY member and orphans NONE.
//
// §BATH102 (L-11480..L-11486) · C109 §7 / R-1 / R-4 / R-7 · C104 §8 · C16 §8.6.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THE PRECEDENT IS NOT FLATTERING AND C109 §7 NAMES IT: `DeleteStairCommand`
//    CONTAINS ZERO REFERENCES TO OPENINGS, SO DELETING A STAIR LEAVES ITS VOID
//    PUNCHED THROUGH THE FLOOR PLATE FOREVER.
// ═══════════════════════════════════════════════════════════════════════════════
// A pod punches nothing (C109 §1.2 — it creates no walls, no floor, no door and no
// opening), so it CANNOT commit that defect. It can commit the MIRROR of it: leaving
// orphan fixtures standing in an empty room with a `parentId` pointing at a record
// that no longer exists. R-4 is what forbids that, and this handler is where it is
// kept.
//
// ── WHAT IS REAPED, AND WHAT IS DELIBERATELY BORROWED ──────────────────────────
//   REAPED   the pod record, and with it — in the SAME patch pair — every member
//            named in `members[]`, because the members ARE fields of that record.
//   BORROWED the ROOM. ⛔ It is never deleted. A pod BORROWS a room the way a
//            wall-hosted lift borrows a wall (C104 §8); `room` is the QUESTION the
//            solver was asked, not a room record the pod owns (C109 §4).
//   BORROWED the WALLS. A pod creates none and deletes none (C109 §1.2). ⛔ Deleting
//            them would put a second producer of walls in the model beside the wall
//            tool, and every wall it made would be un-editable by the tool that did
//            not make it.
//
// ── ⛔ REAPED BY `childrenIds`, NEVER SPATIALLY ────────────────────────────────
// C109 §7: *"delete the fixtures inside this rectangle"* is wrong the moment an
// architect hand-places a bidet in the same room. The member list comes from the
// RECORD (C109 §3.2 / R-5), and a member an architect has moved out of the room is
// STILL reaped if it is still in the list — a member that should survive must be
// removed from the pod by a COMMAND, not by dragging its mesh.
//
// ── ONE STORE, ONE PATCH PAIR, ONE UNDO ENTRY ─────────────────────────────────
// Symmetric with `CreateBathroomPod` and for the identical measured reason: see that
// file's header for why `'plumbing'` is NOT declared (it resolves to the PIPE DTO
// store on write and to the LEGACY FIXTURE store on undo — C03 §4.6 U-2b's corrupting
// case). The legacy fixture records are reaped by the SAME mirror that materialised
// them, driven off this store's `subscribeDirty()` diff, so the create and the delete
// travel one road in both directions rather than two that can disagree.

import {
    produceCommand,
    withHandlerSpan,
    type CommandHandler,
    type HandlerContext,
    type HandlerResult,
    type ValidationResult,
} from '@pryzm/plugin-sdk';
import { BathroomPodNotFoundError } from '../errors.js';
import type { BathroomPodsState } from '../bathroomPodStore.js';

export interface DeleteBathroomPodPayload {
    readonly podId: string;
}

type BathroomPodHandlerStores = Readonly<
    { bathroomPod: BathroomPodsState } & Record<string, unknown>
>;

export class DeleteBathroomPodHandler
    implements CommandHandler<DeleteBathroomPodPayload, BathroomPodHandlerStores>
{
    readonly type = 'bathroomPod.delete';

    /** The same ONE store the create wrote — the delete must be able to undo it. */
    readonly affectedStores = ['bathroomPod'] as const;

    canExecute(
        ctx: HandlerContext<BathroomPodHandlerStores>,
        cmd: DeleteBathroomPodPayload,
    ): ValidationResult {
        if (typeof cmd.podId !== 'string' || cmd.podId.length === 0) {
            return { valid: false, reason: 'podId must be a non-empty string' };
        }
        if (!ctx.stores.bathroomPod[cmd.podId]) {
            // ⭐ REFUSE, DO NOT NO-OP. A delete that quietly succeeds on an id that
            // does not exist reports the same thing as a delete that worked, and the
            // architect learns nothing from either.
            return { valid: false, reason: `bathroom pod not found: ${cmd.podId}` };
        }
        return { valid: true };
    }

    execute(
        ctx: HandlerContext<BathroomPodHandlerStores>,
        cmd: DeleteBathroomPodPayload,
    ): HandlerResult {
        return withHandlerSpan(
            this.type + '.handler',
            { 'pryzm.command.type': this.type },
            (span) => {
                const pod = ctx.stores.bathroomPod[cmd.podId];
                if (!pod) throw new BathroomPodNotFoundError(cmd.podId);

                // Read the member count BEFORE the removal, from the RECORD, so the
                // span reports what was actually reaped rather than a count derived
                // afterwards from a store that no longer holds it. ⭐ This attribute is
                // the machine-readable half of R-4: an orphan is a member that was in
                // this count and is still standing.
                //
                // ⚠ `pod.members.length` AND NOT `bathroomPodChildIds(pod).length`.
                // Those are the same fact — `bathroomPodChildIds` is a pure
                // `members.map(m => m.id)` — and reading the length directly is not a
                // rival derivation, it is the same one without an allocation. It also
                // keeps this file free of an `@pryzm/geometry-plumbing` import, which
                // matters: `check-layer-boundaries.ts`'s SDK-facade-bypass arm is a
                // SHRINK-ONLY ratchet, and a lane that adds three plugin→geometry edges
                // for one feature has to justify each one. The ID LIST derivation stays
                // single — `bathroomPodStore.childIdsOf()` and the member mirror both go
                // through `bathroomPodChildIds`.
                span.setAttribute('pryzm.bathroom_pod.members_reaped', pod.members.length);

                const [next, forward, inverse] = produceCommand<BathroomPodsState>(
                    ctx.stores.bathroomPod as BathroomPodsState,
                    (draft) => {
                        delete (draft as Record<string, unknown>)[cmd.podId];
                    },
                );
                return { forward, inverse, nextStates: { bathroomPod: next } };
            },
        ); // withHandlerSpan — CA-14 / C10 §2, merge-blocking
    }
}
