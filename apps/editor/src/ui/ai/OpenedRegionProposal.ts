/**
 * OpenedRegionProposal — §OPENED-REGION (L-880, 2026-08-14)
 *
 * The OFFER half. `@pryzm/room-topology`'s `scanForOpenedRegions` decides that a wall
 * move left a region standing open and publishes a finding; this module turns that
 * finding into a QUESTION in the RAC chat, with a Confirm and a Cancel.
 *
 * ## WHICH SURFACE, AND WHY THIS ONE
 *
 * C83 §4.1 (`docs/02-decisions/contracts/C83-SPATIAL-VALIDITY-AND-DESIGN-LOGIC.md`)
 * surveyed the repo and found FOUR live propose→consent surfaces. It names
 * `ConsequencePlan` → `ConfirmationFlow` → `ConfirmationCard` canonical, and §4.1.3
 * states how the chat half of it speaks: through the **already-shipped**
 * `ZeroTokenUiHooks.confirm(summary)` bubble — *"one plan, two prompts: the card for
 * the gesture path, the chat bubble for the founder's 'ask the user'."* This is the
 * chat prompt, reached via `chatPromptHost` (which adds the accessor those closures
 * never had, and nothing else).
 *
 * It deliberately does **NOT** build on `CommandProposal` / `commandProposalStore` /
 * `ai-proposal-added`. C83 §4.1 forbids it in terms: that type is declared twice,
 * divergently, both exported; its `validation` is `{ ok, reason? }` with no code; and
 * both of its approve paths still reach `window.commandManager` behind a P6 `TODO`.
 * An earlier draft of this module used exactly that path and was re-pointed before it
 * was committed.
 *
 * ## IT ASKS. IT NEVER EDITS. (C83 §4.3)
 *
 * Nothing here mutates the model until the user presses Confirm, and then the mutation
 * is `runtime.bus.executeCommand('wall.create', …)` — the ordinary canonical verb, the
 * ordinary bus, ONE command and therefore ONE Ctrl+Z (C83 §4.1.1: undo cost is stated
 * before consent, truthfully, and this offer fans out to exactly one command).
 *
 * ## IT REFUSES RATHER THAN GUESS (C83 §4.2 MUST NOT)
 *
 * When the detector cannot defend a position (`kind: 'position-unknown'`) there is
 * nothing to Confirm, so no card is shown at all. The finding still reaches the user —
 * as a plain assistant line naming what is unknown. Offering a nearest-fit guess with
 * a Confirm button beside it is the failure C83 §4.2 names: *"an offer carries an
 * implicit claim that the alternative is valid."*
 *
 * ## WHAT IS PROPOSED, AND WHY THAT POSITION
 *
 * The segment is the stretch of the lost region's OWN former boundary that no longer
 * has a wall on it — computed in the detector, at the coordinates the room already
 * occupied. Thickness, height and wall system type are carried from the nearest
 * surviving wall, never invented; when no donor is close enough the summary says so.
 * The anchoring (`anchoredEndpoints`) is stated verbatim, so a user confirming a
 * floating segment knows it is floating before they press the button.
 */

import { openedRegionNotifier } from '@pryzm/room-topology';
// §WD32-A-CREATE-WITHOUT-AN-ID-IS-NEVER-REPLICATED (L-10604) — see the `id`
// field on `OpenedRegionWallPayload` for why this offer must mint its own.
import { createId } from '@pryzm/schemas';
import type { OpenedRegionFinding } from '@pryzm/room-topology';
import { chatSay, chatConfirm } from './chatPromptHost';
import { projectScopeRegistry, registerProjectScopeProbe } from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { resolveActiveProjectId } from '../site/siteDispatch';

/** Fallbacks used ONLY when no surviving wall can donate the value; always disclosed. */
const FALLBACK_THICKNESS_M = 0.10;
const FALLBACK_HEIGHT_M = 2.70;

/**
 * Asking the same question again on every re-detect of the same level would turn one
 * honest offer into a stream of identical cards — the cry-wolf failure by another
 * route. One question per distinct gap per level.
 */
const lastAskedKey = new Map<string, string>();
/** Levels with a card currently on screen, so a second finding cannot stack a second card. */
const asking = new Set<string>();

let installed = false;

/**
 * The project whose LEVELS the two containers above describe. Stamped at WRITE
 * time, never at read time: by the time the probe asks, the active project may
 * already be the next one, and a read-time resolve would attribute Project A's
 * held state to Project B — the leak dressed as cleanliness. Null means "holding
 * nothing"; a held entry whose project could not be resolved answers with an
 * explicit unattributed marker instead (L-713: the two must never share a value).
 */
let _owningProjectId: string | null = null;

/**
 * Resolve the active project through the ONE canonical resolver, never a quietly
 * divergent second copy. Same idiom as `WallMoveClashProposal` / `mountedDrawingScope`.
 */
function activeProjectId(): string | null {
    try {
        const rt = (typeof window !== 'undefined' ? window.runtime : undefined) as
            PryzmRuntime | undefined;
        return rt ? resolveActiveProjectId(rt) : null;
    } catch {
        // Stamping must never break an offer. A null stamp is reported honestly by
        // the probe below — it is NOT folded into "clean".
        return null;
    }
}

/**
 * The browser globals, or `undefined`. Same idiom as `ZeroTokenChatBridge.win()` — a
 * bare `window` reference throws a ReferenceError under the node test environment, and
 * this module's pure half (decide the payload, compose the question) is exactly what
 * wants testing there.
 */
function win(): {
    bimManager?: { getLevelById?: (id: string) => { height?: number } | undefined };
    runtime?: { bus?: { executeCommand?: (type: string, payload: unknown) => Promise<unknown> } };
    // §WD32-B-DO-NOT-NAME-WHAT-WAS-NOT-RESTORED (L-10811) — read-only, one lookup,
    // used solely to decide whether the success line may name the room. See
    // `originalRecordSurvives`.
    roomStore?: { getById?: (id: string) => unknown };
} | undefined {
    return typeof window === 'undefined' ? undefined : (window as never);
}

function gapKey(f: OpenedRegionFinding): string {
    if (f.kind !== 'region-opened') return `${f.levelId}|unknown|${f.reason}|${f.roomId}`;
    const mm = (n: number): number => Math.round(n * 1000);
    return `${f.levelId}|${mm(f.gap.start.x)},${mm(f.gap.start.z)}>${mm(f.gap.end.x)},${mm(f.gap.end.z)}`;
}

/** The level's height, used only when no surviving wall donated one. */
function levelHeight(levelId: string): number | undefined {
    try {
        return win()?.bimManager?.getLevelById?.(levelId)?.height;
    } catch {
        return undefined;
    }
}

/**
 * §WD32-B-DO-NOT-NAME-WHAT-WAS-NOT-RESTORED (L-10811) — does the room this finding is
 * ABOUT still exist as a record?
 *
 * ⭐ THREE-VALUED ON PURPOSE, and the third value is the point.
 *   `true`      — the record is still in the store; naming it is truthful.
 *   `false`     — it was removed by the re-derivation; naming it would assert a
 *                 restoration that did not happen.
 *   `undefined` — there is no store to ask (a node harness, or a boot ordering where
 *                 `window.roomStore` is not yet published). **NOT the same as `false`.**
 *                 Collapsing it into `false` would state a loss that was never measured
 *                 — the §CONTEXT-DATA-HONESTY rule this contract family keeps paying
 *                 for: failure and emptiness are not the same value (C74; C94 §14 R4).
 *
 * PURE apart from the single lookup; never throws (a store that rejects an unknown id
 * is answering, not failing, and an accessor that is absent is not an error here).
 */
function originalRecordSurvives(roomId: string): boolean | undefined {
    try {
        const getById = win()?.roomStore?.getById;
        if (typeof getById !== 'function') return undefined;
        return getById(roomId) != null;
    } catch {
        return undefined;
    }
}

/** The `wall.create` payload this offer would dispatch, exactly as the wall tool builds it. */
export interface OpenedRegionWallPayload {
    /**
     * ⭐⭐ §WD32-A-CREATE-WITHOUT-AN-ID-IS-NEVER-REPLICATED (L-10604).
     *
     * THE MEASURED DEFECT, from the founder's fourth console:
     *
     *     [YjsDocAdapter] W5-3: 'wall.create' declares subject key 'id' but the
     *       payload carried NO non-empty string there. Nothing was replicated
     *       for this dispatch.
     *
     * `CreateWall.canExecute` ACCEPTS an absent id — *"omit id to auto-generate"*
     * (`CreateWall.ts:199`) — and mints a ULID inside the handler. So the command
     * succeeds, the wall appears, and the SYNC layer, which reads the subject key
     * off the PAYLOAD before the handler runs, has nothing to key on and silently
     * replicates nothing.
     *
     * ⛔ IN A SHARED PROJECT THE AUTHOR SEES THIS WALL AND A COLLABORATOR DOES
     * NOT. That is a silent divergence, and it is C68 / P8 territory, not merely
     * a wall one.
     *
     * ⚠ MEASURED, so the scope is not overstated: this is the ONLY production
     * `wall.create` dispatcher that omitted the id. `WallPlanToolHandler.ts:618`,
     * `PreviewManager.ts:312` and `CopyPlanToolHandler.ts:320` all mint one with
     * `createId('wall')` first, and `WallPlanToolHandler.ts:540` states the rule
     * in a comment. This offer was written against the HANDLER's contract, which
     * permits omission, rather than against the SYNC layer's, which does not —
     * and the two contracts disagree. **The disagreement itself is the finding**
     * and is recorded in C85 §12 W-R-4; this field closes the one live hole.
     */
    readonly id: string;
    readonly levelId: string;
    readonly baseLine: readonly [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
    readonly thickness: number;
    readonly height: number;
    readonly systemTypeId?: string;
}

export interface OpenedRegionOffer {
    /** The Confirm/Cancel summary, as the user will read it. */
    readonly summary: string;
    /** The canonical bus verb. One command, one undo entry. */
    readonly commandType: 'wall.create';
    readonly payload: OpenedRegionWallPayload;
}

/**
 * Compose the question and the command it would run. Returns `undefined` when the
 * finding cannot be turned into an offer — in which case the caller says what is
 * unknown instead of showing a button.
 *
 * PURE: reads the level height from `bimManager` when a donor wall supplied none, and
 * touches nothing else.
 */
export function buildOpenedRegionOffer(finding: OpenedRegionFinding): OpenedRegionOffer | undefined {
    if (finding.kind !== 'region-opened') return undefined;
    const { gap } = finding;
    if (!(gap.lengthM > 0.05)) return undefined;

    // ⭐⭐ §WD32-A-PROPOSAL-NEEDS-BOTH-ANCHORS (L-10603) — THE SAME PRECONDITION,
    //    ASSERTED AGAIN AT THE CONSUMER.
    //
    // `scanForOpenedRegions` now refuses to emit a `region-opened` finding below
    // two anchors, so this branch should be unreachable. It is written anyway,
    // because "should be unreachable" is what the anchor count WAS before the
    // founder accepted one at 1/2 and got a wall joined to nothing:
    //
    //     …anchored 1/2 → "a random wall not connected to any other —
    //       corrupted and angled in plan view"
    //
    // ⛔ The rule is not "warn the user about a half-anchored wall". It is that a
    // half-anchored segment has NO DEFENSIBLE ANGLE — its far end is wherever the
    // old room's boundary sampling stopped — so there is no version of it a
    // reviewer could sensibly accept. A gate that offers an unacceptable option
    // is worse than one that stays silent: it manufactures work and, on accept,
    // corrupt geometry.
    //
    // Two independent checks for one rule is deliberate here and not duplication
    // for its own sake: the DETECTOR owns "is this position determined?" and this
    // function owns "is this offer well-formed?". They are the same number this
    // once, and a future caller that builds a finding by hand meets the rule too.
    if (gap.anchoredEndpoints < 2) {
        console.warn(
            `[OpenedRegionProposal] §WD32-A-PROPOSAL-NEEDS-BOTH-ANCHORS — NOT offering a wall for ` +
            `${finding.roomName}: only ${gap.anchoredEndpoints} of the ${gap.lengthM.toFixed(2)} m ` +
            `stretch's 2 endpoints lands on a surviving wall, so the segment's angle is an artefact ` +
            `of where the old boundary stopped. Extending an existing wall is the repair; minting a ` +
            `floating one is not.`,
        );
        return undefined;
    }

    const thickness = gap.thicknessM && gap.thicknessM > 0 ? gap.thicknessM : FALLBACK_THICKNESS_M;
    const height = gap.heightM && gap.heightM > 0
        ? gap.heightM
        : (levelHeight(finding.levelId) ?? FALLBACK_HEIGHT_M);

    const provenance = gap.matchedWallId
        // Stated in FULL, not truncated: it is the evidence for the thickness and
        // height being offered, and a user who wants to check it must be able to
        // find the wall.
        ? `matching wall ${gap.matchedWallId} (${thickness.toFixed(2)} m thick, ${height.toFixed(2)} m high)`
        : `no surviving wall was close enough to copy — using ${thickness.toFixed(2)} m thickness and ${height.toFixed(2)} m height`;

    // §WD32-A-PROPOSAL-NEEDS-BOTH-ANCHORS (L-10603) — ONE SENTENCE, because there
    // is now only one state that reaches here. The two "…but check it before you
    // confirm" variants this used to carry were the defect in miniature: prose
    // asking the user to validate a geometry the system had already measured as
    // indefensible. The guard above answers it instead.
    const anchorSentence = 'Both ends meet walls that are still standing.';

    const summary =
        `${finding.detail}\n` +
        `${anchorSentence}\n` +
        `Create an interior wall along that ${gap.lengthM.toFixed(2)} m stretch, ${provenance}`;

    return {
        summary,
        commandType: 'wall.create',
        payload: {
            // §WD32-A-CREATE-WITHOUT-AN-ID-IS-NEVER-REPLICATED (L-10604) — minted
            // HERE, at the dispatch site, exactly as every other production
            // `wall.create` caller does. Not inside the handler, because the sync
            // layer reads it off the payload before the handler is ever entered.
            id: createId('wall'),
            levelId: finding.levelId,
            baseLine: [
                { x: gap.start.x, y: 0, z: gap.start.z },
                { x: gap.end.x, y: 0, z: gap.end.z },
            ],
            thickness,
            height,
            ...(gap.systemTypeId ? { systemTypeId: gap.systemTypeId } : {}),
        },
    };
}

/**
 * Present a finding: a Confirm/Cancel card carrying one bus command, or an honest line
 * saying what is unknown. Resolves once the question has been answered (or declined to
 * be asked), so the caller can await it in tests.
 */
export async function presentOpenedRegion(finding: OpenedRegionFinding): Promise<void> {
    const key = gapKey(finding);
    if (lastAskedKey.get(finding.levelId) === key) return;
    if (asking.has(finding.levelId)) return;

    if (finding.kind === 'position-unknown') {
        lastAskedKey.set(finding.levelId, key);
        _owningProjectId = activeProjectId();
        chatSay(
            `That wall move left something open. ${finding.detail} ` +
            `I am not proposing a wall for it, because I would be guessing where it goes.`,
        );
        return;
    }

    const offer = buildOpenedRegionOffer(finding);
    if (!offer) return;

    lastAskedKey.set(finding.levelId, key);
    _owningProjectId = activeProjectId();
    asking.add(finding.levelId);
    try {
        // The card appends its own "This can be undone with Ctrl+Z." tail; the summary
        // must not pre-empt it, because this offer really is exactly one command and
        // therefore exactly one undo (C83 §4.1.1).
        const answer = await chatConfirm(offer.summary);
        if (answer === undefined) {
            // §PROMPT-REACHES-A-HUMAN (L-881) — reachable ONLY with no `document` at
            // all (a node harness). `chatConfirm` opens the panel, waits for it, and
            // renders a visible fallback card before it will ever return this. It is
            // "nobody could be asked", NOT a decline, so the de-dup key stands down and
            // the question can be put again. In build a75e8e1e this branch was the
            // whole failure: it degraded to a console line, and the founder saw
            // nothing. A console line is not a user-facing message.
            lastAskedKey.delete(finding.levelId);
            console.error(
                '[OpenedRegionProposal] §PROMPT-REACHES-A-HUMAN — an opened region was found and ' +
                'there was no surface of ANY kind to put the question to. NOT asked, NOT answered, ' +
                'NOT declined.',
                { levelId: finding.levelId, roomName: finding.roomName },
            );
            return;
        }
        if (!answer) {
            chatSay('Left as it is — nothing was changed.');
            return;
        }

        const bus = win()?.runtime?.bus;
        if (!bus?.executeCommand) {
            chatSay('I could not reach the command bus, so nothing was created. Nothing has changed.');
            return;
        }
        // P6 — the ordinary canonical verb on the ordinary bus. One command, one
        // undo entry, identical to drawing the wall by hand.
        await bus.executeCommand(offer.commandType, offer.payload);
        // ⭐⭐ §WD32-B-DO-NOT-NAME-WHAT-WAS-NOT-RESTORED (L-10811) — C94 §TOBE.6 RM-2.
        //
        // This line USED TO READ, unconditionally:
        //
        //     `Done — an interior wall now closes ${finding.roomName}.`
        //
        // ⛔ `finding.roomName` is read from the BEFORE snapshot — the room record as
        // it was *prior* to the re-derivation that produced this finding. When that
        // record lost its identity claim it was REMOVED, with no snapshot, at
        // `ReDetectRoomsCommand.ts:105-112`, and the region now re-closes as a FRESH
        // `crypto.randomUUID()` with an empty name and number
        // (`RoomDetectionEngine.ts:511,515,516`). So the product announced that it had
        // closed "Room 00-004" at the exact moment there was no Room 00-004 anywhere
        // in the model — C78 §2 (element identity) failing in the one sentence the
        // user is actually reading. Measured and recorded as C94 §TOBE.1.2.
        //
        // ⚠ THE OLD LINE WAS NOT ALWAYS WRONG, which is why this is a BRANCH and not
        // a deletion. When two regions merge, exactly one of them keeps its record
        // (the `used` set at `RoomDetectionEngine.ts:1129-1131` allows one claim per
        // existing room). If THIS finding's room is the one that kept it, naming it is
        // simply true. One store lookup is what separates the two cases, and guessing
        // either way would be a §CONTEXT-DATA-HONESTY failure in the other direction.
        //
        // ⛔ It deliberately does NOT promise the name back. Restoring the authored
        // meaning of a dropped room is C94 §TOBE.6 RM-3 (the tombstone), it is not
        // built, and a sentence that implied it was would be worse than this one.
        const survived = originalRecordSurvives(finding.roomId);
        chatSay(
            survived === true
                ? `Done — an interior wall now closes ${finding.roomName}. ` +
                  `Ctrl+Z undoes it in one step.`
                : survived === false
                    ? `Done — an interior wall now closes that region. ` +
                      `It comes back as a NEW room: the name, number and occupancy that ` +
                      `${finding.roomName} carried were not restored with it. ` +
                      `Ctrl+Z undoes the wall in one step.`
                    // `undefined` = the store could not be reached, so neither branch is
                    // established. Say only what IS established (C74 — an unknown is not
                    // a no), and name neither outcome.
                    : `Done — an interior wall now closes that region. ` +
                      `Ctrl+Z undoes it in one step.`,
        );
        console.log(
            `[OpenedRegionProposal] §OPENED-REGION accepted: wall.create on level ${finding.levelId} ` +
            `(${offer.payload.thickness.toFixed(2)} m × ${offer.payload.height.toFixed(2)} m)`,
        );
    } catch (err) {
        console.warn('[OpenedRegionProposal] §OPENED-REGION offer failed (non-fatal):', err);
        chatSay('Something went wrong creating that wall, so nothing was created.');
    } finally {
        asking.delete(finding.levelId);
    }
}

/**
 * Subscribe the offer to the detector. Idempotent — a second call is a no-op, so a
 * double bootstrap cannot double-ask.
 */
export function initOpenedRegionProposals(): () => void {
    if (installed) return () => { /* already installed by an earlier bootstrap */ };
    installed = true;
    const off = openedRegionNotifier.subscribe(finding => {
        void presentOpenedRegion(finding).catch(err => {
            console.warn('[OpenedRegionProposal] failed to present finding (non-fatal):', err);
        });
    });
    // §PROMPT-REACHES-A-HUMAN (L-881) — assert the subscription actually took against
    // the SAME notifier instance the detector publishes on, and say so loudly if it
    // did not. A silently-unsubscribed offer looks exactly like a detector that never
    // fired, and that ambiguity cost a founder test cycle on build a75e8e1e.
    const count = openedRegionNotifier.listenerCount;
    if (count < 1) {
        console.error(
            '[OpenedRegionProposal] §PROMPT-REACHES-A-HUMAN — subscribe() returned but the ' +
            'notifier reports 0 listeners. The offer is NOT wired to the detector; opened ' +
            'regions will be found and never surfaced.',
        );
    } else {
        console.log(`[OpenedRegionProposal] §OPENED-REGION offer channel installed (listeners=${count})`);
    }
    return () => { off(); installed = false; };
}

// ── PROJECT SCOPE (ADR-0298) — §L-910-CLASS ──────────────────────────────────
//
// Both containers above are keyed by LEVEL ID, and level ids are not globally
// unique across projects. Carried across a project switch they do not merely
// waste memory: `lastAskedKey` SUPPRESSES a question. Project A's entry for
// level `lvl-0` silences a genuine opened-region offer on Project B's unrelated
// `lvl-0` — a wall move leaves a room standing open and the chat stays quiet.
// Same shape as the L-910 stale-projection leak: state whose only symptom is a
// correct thing that silently fails to happen.
//
// `asking` is rarer and worse in kind: a switch while a card is on screen can
// strand a level permanently in the "already asking" set, because the `finally`
// that removes it only runs when that promise settles.
//
// `installed` is deliberately NOT part of this teardown — see the reset list in
// `declaredProjectScopes.ts`. It latches the subscription to `openedRegionNotifier`,
// which is app-lifetime and MUST survive a project switch; clearing it would let
// the next bootstrap subscribe a second time and ask every question twice.

/**
 * C13 teardown — drop every per-level de-duplication record.
 *
 * Idempotent, synchronous, non-throwing (the `projectScopeRegistry` contract).
 * Clears the containers and the ownership stamp together, so the module can never
 * be left holding entries it no longer attributes.
 */
export function clearOpenedRegionProposals(): void {
    lastAskedKey.clear();
    asking.clear();
    _owningProjectId = null;
}

/** What is being held, for the leak report. Never throws. */
export function describeOpenedRegionState(): Record<string, unknown> {
    return {
        dedupedLevels: lastAskedKey.size,
        askingNow: asking.size,
        stampedProjectId: _owningProjectId,
        subscribed: installed,
    };
}

projectScopeRegistry.register({
    scopeName: 'ai.openedRegionProposal',
    clear: () => { clearOpenedRegionProposals(); },
});

registerProjectScopeProbe({
    scope: 'ai.openedRegionProposal',
    owningProjectId: () => {
        if (lastAskedKey.size === 0 && asking.size === 0) return null;
        return _owningProjectId ?? '<proposal-project-unresolved>';
    },
    describe: () => describeOpenedRegionState(),
});

/** Test seam — clears the per-level de-duplication state AND the subscription latch. */
export function __resetOpenedRegionProposalState(): void {
    clearOpenedRegionProposals();
    installed = false;
}
