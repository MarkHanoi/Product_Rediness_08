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

import { roomMeaningNotifier, describeTombstoneLimits, isMergeOffer } from '@pryzm/command-registry';
import type { RoomMeaningOffer, RoomTombstone } from '@pryzm/command-registry';
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
    /** Read-only, one lookup - see `applyMeaning` for why the target is re-checked. */
    roomStore?: { getById?: (id: string) => unknown };
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

/** The details a candidate is offering, listed so Confirm is informed consent. */
function listDetails(t: RoomTombstone): string {
    const m = t.meaning;
    const parts: string[] = [];
    if (m.name) parts.push(`name “${m.name}”`);
    if (m.roomNumber) parts.push(`number ${m.roomNumber}`);
    if (m.occupancyType) parts.push(`type ${m.occupancyType}`);
    if (m.department) parts.push(`department ${m.department}`);
    return parts.length > 0 ? parts.join(', ') : 'its details';
}

function labelOf(t: RoomTombstone): string {
    return t.meaning.name ?? t.meaning.roomNumber ?? 'A room';
}

/** The SINGLE-LOSS question: one room died and this space is it, come home. */
export function buildRestoreSummary(offer: RoomMeaningOffer): string {
    const t = offer.candidates[0]!;
    return (
        `${labelOf(t)} (${t.census.areaM2.toFixed(1)} m²) was lost when its boundary changed, and `
        + `this space is now a new room. Restore its ${listDetails(t)}? `
        + describeTombstoneLimits()
    );
}

/**
 * The MERGE question - §MERGE-AWARDS-NOBODY (L-10815), C94 R-3.
 *
 * ⭐⭐ IT MUST SAY A MERGE HAPPENED, NOT THAT A ROOM WAS LOST. Those are different
 * events and the user needs to tell them apart: one room vanishing is a repair problem,
 * two rooms becoming one is a design change they probably made on purpose. Naming both
 * rooms is also the only way the user can see WHICH two merged.
 *
 * ⭐ AND "NEITHER" IS ONE CLICK. Cancel here ends the whole exchange - a merged space
 * very often wants a new name rather than either old one, so the cheapest answer must be
 * the one that invents nothing. Confirm opens the per-room choice.
 */
export function buildMergeSummary(offer: RoomMeaningOffer): string {
    const named = offer.candidates
        .map(t => `${labelOf(t)} (${t.census.areaM2.toFixed(1)} m²)`)
        .join(' and ');
    return (
        `Two rooms were merged here - ${named}. The merged space is a new room with no name `
        + `of its own, and neither room’s details were applied to it. Restore one of them? `
        + `Cancel to leave it unnamed, which is often the right answer for a merged space.`
    );
}

/**
 * Present one offer. Resolves once the question has been answered or declined to be
 * asked, so a test can await it.
 */
export async function presentRoomMeaningOffer(offer: RoomMeaningOffer): Promise<void> {
    if (offer.candidates.length === 0) return;
    if (asking.has(offer.levelId)) return;
    asking.add(offer.levelId);
    _owningProjectId = activeProjectId();
    try {
        if (isMergeOffer(offer.candidates)) {
            // Stage 1 - say what happened, and let "neither" be a single Cancel.
            const open = await chatConfirm(buildMergeSummary(offer));
            if (open === undefined) { reportNoSurface(offer); return; }
            if (!open) {
                chatSay('Left unnamed — the merged space keeps a fresh name of its own.');
                return;
            }
            // Stage 2 - one room at a time, in the order they were lost. Declining every
            // one lands back on "neither", so the user can never be trapped into picking.
            for (const t of offer.candidates) {
                const take = await chatConfirm(
                    `Restore ${labelOf(t)}’s details — ${listDetails(t)}? `
                    + describeTombstoneLimits(),
                );
                if (take === undefined) { reportNoSurface(offer); return; }
                if (take) { await applyMeaning(offer, t); return; }
            }
            chatSay('Left unnamed — neither room’s details were applied.');
            return;
        }

        const answer = await chatConfirm(buildRestoreSummary(offer));
        if (answer === undefined) { reportNoSurface(offer); return; }
        if (!answer) {
            chatSay('Left as it is — the new room keeps its own name.');
            return;
        }
        await applyMeaning(offer, offer.candidates[0]!);
    } catch (err) {
        console.warn('[RoomMeaningRestoreProposal] offer failed (non-fatal):', err);
        chatSay('Something went wrong restoring those details, so nothing was changed.');
    } finally {
        asking.delete(offer.levelId);
    }
}

/**
 * §PROMPT-REACHES-A-HUMAN (L-881) - "nobody could be asked", NOT a decline. Reachable
 * only with no `document` at all (a node harness); `chatConfirm` escalates to a visible
 * fallback card before it would ever return `undefined` in a browser.
 */
function reportNoSurface(offer: RoomMeaningOffer): void {
    console.error(
        '[RoomMeaningRestoreProposal] §PROMPT-REACHES-A-HUMAN — a room’s details could be '
        + 'restored and there was no surface to put the question to. NOT asked, NOT answered, '
        + 'NOT declined.',
        { levelId: offer.levelId, roomId: offer.roomId },
    );
}

/**
 * Dispatch the ONE command that puts a chosen tombstone’s meaning onto the new room.
 *
 * ⚠ IT RE-CHECKS THAT THE TARGET STILL EXISTS. Between the question being asked and
 * answered the user may have pressed Ctrl+Z, which re-runs detection and can replace the
 * room this offer names. Writing onto a vanished id would be refused by
 * `UpdateRoomCommand.canExecute` anyway, but refusing HERE lets us say what happened
 * instead of surfacing a bare command failure the user cannot act on.
 *
 * ⚠ `undefined` (no store to ask) is NOT treated as "gone" - the same three-valued
 * discipline as §WD32-B. An unknown is not a no.
 */
async function applyMeaning(offer: RoomMeaningOffer, chosen: RoomTombstone): Promise<void> {
    const w = win();
    let stillThere: boolean | undefined;
    try {
        const getById = w?.roomStore?.getById;
        stillThere = typeof getById === 'function' ? getById(offer.roomId) != null : undefined;
    } catch { stillThere = undefined; }

    if (stillThere === false) {
        chatSay(
            'That space changed again before you answered, so nothing was applied. '
            + 'Move the walls back and I will offer it again.',
        );
        return;
    }

    const bus = w?.runtime?.bus;
    if (!bus?.executeCommand) {
        chatSay('I could not reach the command bus, so nothing was changed.');
        return;
    }

    // P6 - the ordinary canonical verb on the ordinary bus. ONE command, ONE undo.
    // ⛔ No `id`: the ruling granted durable LOSS, never durable identity.
    await bus.executeCommand('room.restoreMeaning', { roomId: offer.roomId, ...chosen.meaning });

    chatSay(`Done — this room is ${labelOf(chosen)} again. Ctrl+Z undoes it in one step.`);
    console.log(
        `[RoomMeaningRestoreProposal] §ROOM-TOMBSTONE restored onto ${offer.roomId} `
        + `on level ${offer.levelId}`,
    );
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
