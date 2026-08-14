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
import type { OpenedRegionFinding } from '@pryzm/room-topology';
import { chatSay, chatConfirm } from './chatPromptHost';

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
 * The browser globals, or `undefined`. Same idiom as `ZeroTokenChatBridge.win()` — a
 * bare `window` reference throws a ReferenceError under the node test environment, and
 * this module's pure half (decide the payload, compose the question) is exactly what
 * wants testing there.
 */
function win(): {
    bimManager?: { getLevelById?: (id: string) => { height?: number } | undefined };
    runtime?: { bus?: { executeCommand?: (type: string, payload: unknown) => Promise<unknown> } };
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

/** The `wall.create` payload this offer would dispatch, exactly as the wall tool builds it. */
export interface OpenedRegionWallPayload {
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

    const anchorSentence = gap.anchoredEndpoints === 2
        ? 'Both ends meet walls that are still standing.'
        : gap.anchoredEndpoints === 1
            ? 'One end meets a wall that is still standing; the other does not — check it before you confirm.'
            : 'NEITHER end meets a surviving wall. This is the boundary the room used to have, but nothing currently joins it.';

    const summary =
        `${finding.detail}\n` +
        `${anchorSentence}\n` +
        `Create an interior wall along that ${gap.lengthM.toFixed(2)} m stretch, ${provenance}`;

    return {
        summary,
        commandType: 'wall.create',
        payload: {
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
        chatSay(
            `That wall move left something open. ${finding.detail} ` +
            `I am not proposing a wall for it, because I would be guessing where it goes.`,
        );
        return;
    }

    const offer = buildOpenedRegionOffer(finding);
    if (!offer) return;

    lastAskedKey.set(finding.levelId, key);
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
        chatSay(
            `Done — an interior wall now closes ${finding.roomName}. ` +
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
    console.log('[OpenedRegionProposal] §OPENED-REGION offer channel installed');
    return () => { off(); installed = false; };
}

/** Test seam — clears the per-level de-duplication state. */
export function __resetOpenedRegionProposalState(): void {
    lastAskedKey.clear();
    asking.clear();
    installed = false;
}
