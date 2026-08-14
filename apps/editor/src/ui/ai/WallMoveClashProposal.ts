/**
 * WallMoveClashProposal — §C83-S1-MOVE-OFFER (ISSUE-LOG L-904, 2026-08-14)
 *
 * The OFFER half of the wall-move clash refusal. `1e80e3a2` shipped the REFUSAL:
 * a wall moved so its path crosses another wall's hosted door/window is refused
 * at `UpdateWallBaselineCommand.canExecute` (`OCC_CROSSES_HOSTED_OPENING`) and
 * surfaced on the ConfirmationCard + toast. The founder's twice-repeated ask is
 * the half beyond that: *"the chat must OPEN and offer a solution — move the
 * wall to the left or right, but NOT where it is planned to be moved."*
 *
 * ## WHICH SURFACE (the same one, deliberately)
 *
 * The `a75e8e1e`/`fa261daf` chat-offer seam: `chatPromptHost`'s `say`/`confirm`
 * pair — the accessor over the already-shipped `ZeroTokenUiHooks` closures, with
 * the §PROMPT-REACHES-A-HUMAN guarantee (opens the panel, waits for a transcript
 * that can render, and falls back to a VISIBLE card rather than a console line).
 * This module adds no new surface, no new message shape, no new store.
 *
 * ## WHERE THE CANDIDATES COME FROM (and why they are defensible)
 *
 * `verdict.offers` — computed by `computeWallCrossingOffers` in
 * `@pryzm/geometry-wall` (C83 §4.2): the complement of
 * `WallOccupancyStore.getOccupiedSpans(crossedWall)` along the crossed wall,
 * the nearest clear interval on EITHER side of the refused position, and each
 * candidate is re-run through the WHOLE placement predicate against every wall
 * on the level before it may be offered — the same `canPlace` occupancy
 * convention that produced the refusal. An offer that cannot be defended is not
 * emitted, so `offers` arriving empty here MEANS "no defensible candidate", and
 * this module then refuses with the reason and offers NOTHING (C83 §4.2 MUST
 * NOT: "an offer carries an implicit claim that the alternative is valid").
 *
 * ## IT ASKS. IT NEVER AUTO-APPLIES. (C83 §4.3 + founder doctrine)
 *
 * Nothing here mutates the model until the user presses Confirm, and then the
 * mutation is ONE ordinary `wall.updateBaseline` on the ordinary bus with
 * `_recordUndo: true` — the same payload shape the 3D gizmo's drag-end
 * dispatches (§FIX-WALL-MOVE-UNDO-CAPTURE, L-49), so the accepted candidate is
 * ONE history entry and one Ctrl+Z restores the wall to where it stood.
 * `prevBaseLine` is the store's pre-drag baseline — at proposal time the
 * refused move was never applied, so the store still holds it.
 *
 * ## DETECTION SCOPE — stated so nobody over-reads it
 *
 * This fires on wall MOVES only (`gateWallMove`, the seam both the 3D gizmo and
 * the plan drag funnel through). A CREATE refusal keeps its card-rendered
 * alternatives; extending the chat offer to creates is a separate decision.
 */

import type {
    WallPlacementVerdict,
    WallCrossingOffer,
    WallCrossingViolation,
} from '@pryzm/geometry-wall';
import { chatSay, chatConfirm } from './chatPromptHost';

/** A point as the gate carries it; `y` is level elevation. */
interface Pt {
    readonly x: number;
    readonly y?: number;
    readonly z: number;
}

export interface WallMoveClashArgs {
    /** The wall the user tried to move. */
    readonly wallId: string;
    /** Where the wall STILL STANDS — the refused move was never applied. */
    readonly prevBaseLine: readonly [Pt, Pt];
    /** The baseline the user asked for — refused; used only for de-duplication. */
    readonly attemptedBaseLine: readonly [Pt, Pt];
    /** The blocked verdict, carrying violations and the pre-validated offers. */
    readonly verdict: WallPlacementVerdict;
}

/**
 * One question per distinct refused position per wall. Dragging into the SAME
 * clash twice must not stack two identical asks (the cry-wolf failure); a drag
 * to a DIFFERENT clashing position is a new question.
 */
const lastAskedKey = new Map<string, string>();
/** Walls with a question currently on screen, so asks cannot stack. */
const asking = new Set<string>();

function mm(n: number): number {
    return Math.round(n * 1000);
}

function clashKey(args: WallMoveClashArgs): string {
    const [a, b] = args.attemptedBaseLine;
    return `${args.wallId}|${mm(a.x)},${mm(a.z)}>${mm(b.x)},${mm(b.z)}`;
}

/** The browser globals, or `undefined` — same idiom as OpenedRegionProposal. */
function win(): {
    runtime?: { bus?: { executeCommand?: (type: string, payload: unknown) => Promise<unknown> } };
} | undefined {
    return typeof window === 'undefined' ? undefined : (window as never);
}

/**
 * The finding, as the chat states it: NAMES the opening element, its host wall,
 * and BOTH intervals — the same quantities the refusal card renders, so the two
 * surfaces cannot tell two different stories about one refusal.
 */
export function describeWallMoveClash(
    wallId: string,
    violations: readonly WallCrossingViolation[],
): string {
    const parts = violations.map((v) => {
        const [o0, o1] = v.openingSpanM;
        const [c0, c1] = v.crossingSpanM;
        return (
            `the ${v.openingType} ${v.openingElementId} on wall ${v.hostWallId} ` +
            `(the ${v.openingType} occupies ${o0.toFixed(3)}–${o1.toFixed(3)} m along that wall; ` +
            `the moved wall would occupy ${c0.toFixed(3)}–${c1.toFixed(3)} m, ` +
            `overlapping by ${v.overlapM.toFixed(3)} m)`
        );
    });
    return (
        `I did not move wall ${wallId} — at that position it would pass straight through ` +
        `${parts.join('; and through ')}. A wall and a ${violations[0]?.openingType ?? 'door'} ` +
        `opening cannot occupy the same volume.`
    );
}

/** The Confirm/Cancel question for one candidate. The card adds its own Ctrl+Z tail. */
export function describeWallMoveOffer(wallId: string, offer: WallCrossingOffer): string {
    return (
        `Move wall ${wallId} ${offer.label} instead — that position has been checked ` +
        `and is clear of every opening`
    );
}

/**
 * Present a refused wall move as a chat question with the two nearest CLEAR
 * stations (or fewer, when fewer can be defended; or none, with the reason).
 *
 * Resolves once the question has been answered (or declined to be asked), so a
 * test can await it. Never throws.
 */
export async function presentWallMoveClash(args: WallMoveClashArgs): Promise<void> {
    const { wallId, verdict } = args;
    // Silence controls — this module speaks ONLY on a real refusal.
    if (!verdict || verdict.valid || verdict.violations.length === 0) return;

    const key = clashKey(args);
    if (lastAskedKey.get(wallId) === key) return;
    if (asking.has(wallId)) return;
    lastAskedKey.set(wallId, key);

    const clashLine = describeWallMoveClash(wallId, verdict.violations);

    if (verdict.offers.length === 0) {
        // C83 §4.2 — no defensible candidate ⇒ refuse with the reason, offer
        // NOTHING. No Confirm button may appear beside a guess.
        chatSay(
            `${clashLine} No clear position on that wall could be validated for it, so I am ` +
            `not proposing one — move the wall somewhere else, or move the opening first. ` +
            `Nothing was changed.`,
        );
        return;
    }

    asking.add(wallId);
    try {
        // The finding first, so the user reads WHY before the first question.
        chatSay(clashLine);

        for (const offer of verdict.offers) {
            const answer = await chatConfirm(describeWallMoveOffer(wallId, offer));
            if (answer === undefined) {
                // §PROMPT-REACHES-A-HUMAN — no DOM at all. "Nobody could be
                // asked" is NOT a decline: stand the de-dup key down so the
                // question can be put again when a surface exists.
                lastAskedKey.delete(wallId);
                console.error(
                    '[WallMoveClashProposal] §PROMPT-REACHES-A-HUMAN — a wall-move clash offer ' +
                    'had no surface of ANY kind to ask on. NOT asked, NOT answered, NOT declined.',
                    { wallId },
                );
                return;
            }
            if (!answer) continue; // declined this direction — offer the other, if any

            const bus = win()?.runtime?.bus;
            if (!bus?.executeCommand) {
                chatSay('I could not reach the command bus, so the wall was not moved. Nothing has changed.');
                return;
            }
            // ONE ordinary undoable command — the same verb and payload shape the
            // drag gesture itself dispatches. `_recordUndo: true` routes the
            // forward/inverse PatchPair onto the unified ring buffer (L-49), so
            // one Ctrl+Z restores the pre-move position verbatim.
            const newBaseLine = [
                { x: offer.baseLine[0].x, y: offer.baseLine[0].y ?? 0, z: offer.baseLine[0].z },
                { x: offer.baseLine[1].x, y: offer.baseLine[1].y ?? 0, z: offer.baseLine[1].z },
            ];
            const prevBaseLine = [
                { x: args.prevBaseLine[0].x, y: args.prevBaseLine[0].y ?? 0, z: args.prevBaseLine[0].z },
                { x: args.prevBaseLine[1].x, y: args.prevBaseLine[1].y ?? 0, z: args.prevBaseLine[1].z },
            ];
            const result = (await bus.executeCommand('wall.updateBaseline', {
                wallId,
                newBaseLine,
                prevBaseLine,
                _recordUndo: true,
            })) as { success?: boolean } | undefined;
            if (result && result.success === false) {
                // The model changed between the offer and the acceptance and the
                // command's own canExecute refused. Honest report, no pretence.
                chatSay(
                    'That position was clear when I offered it, but the model has changed and ' +
                    'the move was refused on re-check. Nothing has changed.',
                );
                return;
            }
            chatSay(
                `Done — wall ${wallId} moved ${offer.label}, clear of the opening. ` +
                `Ctrl+Z undoes it in one step.`,
            );
            console.log(
                `[WallMoveClashProposal] §C83-S1-MOVE-OFFER accepted: wall.updateBaseline ` +
                `(${offer.label}) on wall ${wallId}`,
            );
            return;
        }

        // Every candidate declined — honour the dismissal (C83 §5.4).
        chatSay('Left as it is — the wall stays where it was.');
    } catch (err) {
        console.warn('[WallMoveClashProposal] offer failed (non-fatal):', err);
        chatSay('Something went wrong offering that move, so nothing was changed.');
    } finally {
        asking.delete(wallId);
    }
}

/** Test seam — clears the de-duplication state. */
export function __resetWallMoveClashState(): void {
    lastAskedKey.clear();
    asking.clear();
}
