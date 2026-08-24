/**
 * RoomMeaningRestoreProposal — §ROOM-TOMBSTONE (L-10814), C94 §TOBE.6 **RM-3**.
 *
 * The ASK half of the founder's **DERIVATION + TOMBSTONE** ruling (2026-08-24):
 *
 * > Keep derivation exactly as it is. Make the LOSS durable instead of the room.
 * > **OFFER the former name / number / occupancy back — never re-apply it.**
 *
 * `roomTombstoneRegister` publishes an offer when a region that used to be an AUTHORED
 * room closes again as a brand-new one. This module turns that into a Confirm/Cancel
 * question in the RAC chat, and on Confirm dispatches ONE `room.restoreMeaning` — one
 * command, one Ctrl+Z.
 *
 * ## ⭐ THE COPY IS THE DELIVERABLE, AND IT IS CONSTRAINED
 *
 * The founder attached an honesty condition to the ruling: **the offer must say what it
 * CANNOT restore.** It restores MEANING, not IDENTITY — the recovered room has a fresh
 * `crypto.randomUUID()`, so a room tag or schedule row anchored to the lost room stays
 * pointing at nothing. That sentence comes from `describeTombstoneLimits()` in the
 * register, as ONE string rather than restated here, because a condition restated at each
 * call site is one that will drift at one of them.
 *
 * ⛔ This is the same discipline as `db165a09` (§WD32-B), which refused to promise a name
 * back before this mechanism existed. Now that it exists, the promise is made — and
 * bounded, in the same breath.
 *
 * ## IT ASKS. IT NEVER EDITS.
 *
 * Nothing is applied until Confirm. C83 §4.1.3 fixes the surface: the already-shipped
 * `ZeroTokenUiHooks` pair reached through `chatPromptHost`, which guarantees the question
 * reaches a human rather than degrading to a console line (§PROMPT-REACHES-A-HUMAN,
 * L-881). Modelled on `OpenedRegionProposal`, deliberately — two offer channels that
 * behave differently would be two things for the user to learn.
 */

import { roomMeaningNotifier, describeTombstoneLimits } from '@pryzm/command-registry';
import type { RoomMeaningOffer } from '@pryzm/command-registry';
import { chatSay, chatConfirm } from './chatPromptHost';
import { projectScopeRegistry, registerProjectScopeProbe } from '@pryzm/core-app-model';
import { resolveActiveProjectId } from '../site/siteDispatch';
import type { PryzmRuntime } from '@pryzm/runtime-composer';

let installed = false;
/** Levels with a question currently on screen — prevents a double-ask mid-answer. */
const asking = new Set<string>();
let _owningProjectId: string | null = null;

function win(): {
    runtime?: { bus?: { executeCommand?: (type: string, payload: unknown) => Promise<unknown> } };
} | undefined {
    return typeof window === 'undefined' ? undefined : (window as never);
}

/**
 * Resolve the active project through the ONE canonical resolver, never a quietly
 * divergent second copy — same idiom as `OpenedRegionProposal` / `WallMoveClashProposal`.
 */
function activeProjectId(): string | null {
    try {
        const rt = (typeof window !== 'undefined' ? window.runtime : undefined) as
            PryzmRuntime | undefined;
        return rt ? resolveActiveProjectId(rt) : null;
    } catch {
        // Stamping must never break an offer. A null stamp is reported honestly by the
        // probe below — it is NOT folded into "clean".
        return null;
    }
}

/**
 * The question, as the user reads it.
 *
 * ⭐ It names the room and its area so the user can recognise WHICH room is being talked
 * about — the same reason `§OPENED-REGION` states its gap in metres. It lists only what
 * is actually being offered, never a generic "details", so Confirm is informed consent.
 */
export function buildRestoreSummary(offer: RoomMeaningOffer): string {
    const m = offer.tombstone.meaning;
    const parts: string[] = [];
    if (m.name) parts.push(`name “${m.name}”`);
    if (m.roomNumber) parts.push(`number ${m.roomNumber}`);
    if (m.occupancyType) parts.push(`type ${m.occupancyType}`);
    if (m.department) parts.push(`department ${m.department}`);
    const listed = parts.length > 0 ? parts.join(', ') : 'its details';

    const area = offer.tombstone.census.areaM2;
    const label = m.name ?? m.roomNumber ?? 'A room';

    return (
        `${label} (${area.toFixed(1)} m²) was lost when its boundary changed, and this space `
        + `is now a new room. Restore its ${listed}? `
        + describeTombstoneLimits()
    );
}

/**
 * Present one offer. Resolves once the question has been answered or declined to be
 * asked, so a test can await it.
 */
export async function presentRoomMeaningOffer(offer: RoomMeaningOffer): Promise<void> {
    if (asking.has(offer.levelId)) return;
    asking.add(offer.levelId);
    _owningProjectId = activeProjectId();
    try {
        const answer = await chatConfirm(buildRestoreSummary(offer));
        if (answer === undefined) {
            // §PROMPT-REACHES-A-HUMAN — "nobody could be asked", NOT a decline. Reachable
            // only with no `document` at all (a node harness); `chatConfirm` escalates to
            // a visible fallback card before it would ever return this in a browser.
            console.error(
                '[RoomMeaningRestoreProposal] §PROMPT-REACHES-A-HUMAN — a room’s details could be '
                + 'restored and there was no surface to put the question to. NOT asked, NOT answered, '
                + 'NOT declined.',
                { levelId: offer.levelId, roomId: offer.roomId },
            );
            return;
        }
        if (!answer) {
            chatSay('Left as it is — the new room keeps its own name.');
            return;
        }

        const bus = win()?.runtime?.bus;
        if (!bus?.executeCommand) {
            chatSay('I could not reach the command bus, so nothing was changed.');
            return;
        }

        const m = offer.tombstone.meaning;
        // P6 — the ordinary canonical verb on the ordinary bus. ONE command, ONE undo.
        // ⛔ No `id`: the ruling granted durable LOSS, never durable identity.
        await bus.executeCommand('room.restoreMeaning', { roomId: offer.roomId, ...m });

        chatSay(
            `Done — this room is ${m.name ?? m.roomNumber ?? 'restored'} again. `
            + 'Ctrl+Z undoes it in one step.',
        );
        console.log(
            `[RoomMeaningRestoreProposal] §ROOM-TOMBSTONE restored onto ${offer.roomId} `
            + `on level ${offer.levelId}`,
        );
    } catch (err) {
        console.warn('[RoomMeaningRestoreProposal] offer failed (non-fatal):', err);
        chatSay('Something went wrong restoring those details, so nothing was changed.');
    } finally {
        asking.delete(offer.levelId);
    }
}

/**
 * Subscribe the offer to the register. Idempotent — a second bootstrap cannot double-ask.
 */
export function initRoomMeaningRestoreProposals(): () => void {
    if (installed) return () => { /* already installed by an earlier bootstrap */ };
    installed = true;
    const off = roomMeaningNotifier.subscribe(offer => {
        void presentRoomMeaningOffer(offer).catch(err => {
            console.warn('[RoomMeaningRestoreProposal] failed to present offer (non-fatal):', err);
        });
    });
    // §PROMPT-REACHES-A-HUMAN (L-881) — assert the subscription took against the SAME
    // notifier the register publishes on. A silently-unsubscribed offer looks exactly
    // like a register that never fired, and that ambiguity has already cost a founder
    // test cycle once on the §OPENED-REGION channel.
    const count = roomMeaningNotifier.listenerCount;
    if (count < 1) {
        console.error(
            '[RoomMeaningRestoreProposal] §PROMPT-REACHES-A-HUMAN — subscribe() returned but the '
            + 'notifier reports 0 listeners. Lost room details will be captured and never offered.',
        );
    } else {
        console.log(`[RoomMeaningRestoreProposal] §ROOM-TOMBSTONE offer channel installed (listeners=${count})`);
    }
    return () => { off(); installed = false; };
}

// ── PROJECT SCOPE (ADR-0298 / C13) ───────────────────────────────────────────
//
// `asking` is keyed by LEVEL ID, and level ids are not unique across projects: a switch
// while a card is on screen can strand a level permanently in the set, because the
// `finally` that clears it only runs when that promise settles — and the level would then
// never be asked again in the new project. Same shape as the leak
// `OpenedRegionProposal.ts:376-398` records for its own level-keyed maps.
//
// `installed` is deliberately NOT torn down: it latches the subscription to the
// app-lifetime notifier, and clearing it would let the next bootstrap subscribe a second
// time and ask every question twice.

export function clearRoomMeaningProposals(): void {
    asking.clear();
    _owningProjectId = null;
}

export function describeRoomMeaningProposalState(): Record<string, unknown> {
    return {
        installed,
        asking: asking.size,
        owningProjectId: _owningProjectId,
        listeners: roomMeaningNotifier.listenerCount,
    };
}

projectScopeRegistry.register({
    scopeName: 'ai.roomMeaningRestoreProposal',
    clear: () => { clearRoomMeaningProposals(); },
});

registerProjectScopeProbe({
    scope: 'ai.roomMeaningRestoreProposal',
    owningProjectId: () => {
        if (asking.size === 0) return null;
        return _owningProjectId ?? '<proposal-project-unresolved>';
    },
    describe: () => describeRoomMeaningProposalState(),
});

/** Test-only reset. */
export function __resetRoomMeaningProposalState(): void {
    clearRoomMeaningProposals();
    installed = false;
}
