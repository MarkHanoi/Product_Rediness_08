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
    WallData,
} from '@pryzm/geometry-wall';
import { wallCrossesOpeningRefusalText } from '@pryzm/geometry-wall';
import { chatSay, chatConfirm } from './chatPromptHost';
import {
    projectScopeRegistry,
    registerProjectScopeProbe,
    semanticGraphManager,
    storeRegistry,
} from '@pryzm/core-app-model';
// §L-921-ATOMIC-GESTURE — "would the junction re-weld refuse this move?", asked
// BEFORE the wall is committed, by building the REAL cascade command.
import {
    previewMoveReweld,
    type MoveReweldPreflightResult,
} from '@pryzm/command-registry';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { resolveActiveProjectId } from '../site/siteDispatch';

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

/**
 * The project whose walls the de-duplication state above describes. Stamped at
 * WRITE time, not read time, because by the time the probe asks, the active
 * project may already be the NEXT one — a read-time resolve would report the
 * new project as the owner of the old project's state, which is the leak
 * dressed as cleanliness. Null means "holding nothing"; a held entry whose
 * project could not be resolved answers with an explicit unattributed marker
 * instead, never null (L-713: the two must never share a value).
 */
let _owningProjectId: string | null = null;

/**
 * Resolve the active project through the ONE canonical resolver, never a
 * quietly-divergent second copy. Same idiom as `mountedDrawingScope.ts`.
 */
function activeProjectId(): string | null {
    try {
        const rt = (typeof window !== 'undefined' ? window.runtime : undefined) as
            PryzmRuntime | undefined;
        return rt ? resolveActiveProjectId(rt) : null;
    } catch {
        // Stamping must never break a refusal offer. A null stamp is reported
        // honestly by the probe below — it is NOT folded into "clean".
        return null;
    }
}

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
    offers: readonly WallCrossingOffer[] = [],
): string {
    // §L-921-ONE-CHANNEL (founder: *"I WANT THE MESSAGE ONLY ON THE AI CHAT — THE
    // OTHER PANEL INFORMATION SHOULD BE IN THE AI CHAT"*).
    //
    // This used to render its OWN prose from the same violations the card
    // rendered — two surfaces telling one story twice, in two wordings, and the
    // chat's copy silently dropped the `[OCC_CROSSES_HOSTED_OPENING]` identity
    // the card carried. Now the chat speaks through the SHARED renderer, so:
    //
    //   · the panel's information IS the chat's information, to the character;
    //   · §REFUSAL-IDENTITY survives the move to the new sink — the code is
    //     inside the sentence, which is what `check-refusal-identity` ARM B
    //     requires of a `…RefusalText(` renderer;
    //   · no number can be lost in the consolidation, because none is re-typed.
    //
    // The only thing added is the SUBJECT: the shared sentence says "this wall",
    // which is unambiguous beside a card pointed at the wall and ambiguous in a
    // transcript. So it is named.
    const shared = wallCrossesOpeningRefusalText(violations, offers);
    return `Wall ${wallId} was not moved. ${shared}`;
}

// ── §L-921-ATOMIC-GESTURE — the SECOND refusal, which used to reach nobody ────

/** The wall store the gate and the cascade both read (ADR-0318 singleton). */
function readWallStore(): {
    getById(id: string): WallData | undefined;
    getAll(): WallData[];
} | null {
    try {
        const s = storeRegistry.getStoreForType('wall') as {
            getById?: (id: string) => unknown;
            getAll?: () => unknown[];
        } | undefined;
        if (!s || typeof s.getAll !== 'function' || typeof s.getById !== 'function') return null;
        return s as { getById(id: string): WallData | undefined; getAll(): WallData[] };
    } catch {
        return null;
    }
}

/**
 * The partners as the SERVICE resolves them, through the same graph call, so the
 * pre-flight and the cascade cannot disagree about who is joined to what.
 * `undefined` ⇒ the graph has no answer; the pre-flight then falls back to a
 * same-level scan exactly as the service does (C71 §4.4).
 */
type ReweldJunction = {
    wallId: string;
    junctionType?: 'L' | 'T' | 'Y' | 'X' | 'N-WAY';
    junctionDegree?: number;
};

/**
 * §C83 §10.6 — ids AND the junction discriminator, together.
 *
 * ⚠ Returned as one value rather than two helpers on purpose. L-942 shipped
 * twice because the discriminator and the ids were resolved in different places
 * and one consumer read only the ids; splitting them again is how that recurs.
 * Absent `junctions` ⇒ nothing follows (§10.6.3 #1), the conservative branch.
 */
function joinedWallsOrNull(wallId: string): {
    ids: readonly string[] | null | undefined;
    junctions: readonly ReweldJunction[] | undefined;
} {
    try {
        const q = semanticGraphManager.getJoinedWalls(wallId) as
            | { ok: true; joinedWallIds: readonly string[]; junctions?: readonly ReweldJunction[] }
            | { ok: false };
        return q.ok ? { ids: q.joinedWallIds, junctions: q.junctions } : { ids: undefined, junctions: undefined };
    } catch {
        return { ids: undefined, junctions: undefined };
    }
}

/**
 * What the cascade refused, in the user's language, WITH ITS NUMBERS.
 *
 * `blockingIssues` is the array `WallMoveReweldService` drops on the floor — it
 * carries `OPENING_DOES_NOT_FIT: <wallId>: <door> needs 0.500 m of wall length;
 * the wall would be 0.355 m`. The reason code alone (all the service logged) is
 * a label; the issues are the evidence. Both are stated.
 */
export function describeReweldRefusal(
    wallId: string,
    offerLabel: string,
    pre: MoveReweldPreflightResult,
): string {
    const head =
        `I did not move wall ${wallId} ${offerLabel}. That position is clear of every opening, ` +
        `but the junction re-weld it depends on cannot be done soundly, and moving without it ` +
        `would leave the corner open — so I did neither. Nothing has changed.`;

    const arms: string[] = [];

    // C83 §10.2.2 — stated FIRST, because it is the stronger claim: this one is
    // forbidden even when the cascade would happily execute it.
    if (pre.incumbentBreach) {
        arms.push(
            `[C83 §10.2.2 JOINT-AUTHORITY-IS-THE-INCUMBENT] closing that corner would move the ` +
            `baseline of ${pre.incumbentWallIds.length === 1 ? 'wall' : 'walls'} ` +
            `${pre.incumbentWallIds.join(', ')} — by up to ${pre.maxIncumbentShiftMm} mm — and ` +
            `${pre.incumbentWallIds.length === 1 ? 'that wall was' : 'those walls were'} already ` +
            `correctly joined. An existing junction is authoritative: the wall being moved adapts ` +
            `to it, never the other way round.`,
        );
    }
    if (!pre.ok) {
        const issues = (pre.blockingIssues ?? []).map((s) => `  • ${s}`).join('\n');
        arms.push(
            `[${pre.reason ?? 'unspecified'}] the re-weld is also refused on its own terms:\n${issues}`,
        );
    }

    return (
        `${head}\n${arms.join('\n')}\n` +
        `To make this position available: move the wall somewhere that breaks no existing ` +
        `junction, or move the opening in the way first.`
    );
}

/** Millimetres between where a re-weld should have landed and where it is. */
function unrepairedGapMm(
    store: { getById(id: string): WallData | undefined },
    entries: readonly { wallId: string; newBaseLine: readonly { x: number; z: number }[] }[],
): { wallId: string; gapMm: number }[] {
    const out: { wallId: string; gapMm: number }[] = [];
    for (const e of entries) {
        const w = store.getById(e.wallId);
        const bl = w?.baseLine as readonly { x: number; z: number }[] | undefined;
        if (!bl || bl.length < 2) continue;
        const d = Math.max(
            Math.hypot(bl[0].x - e.newBaseLine[0].x, bl[0].z - e.newBaseLine[0].z),
            Math.hypot(bl[1].x - e.newBaseLine[1].x, bl[1].z - e.newBaseLine[1].z),
        );
        const gapMm = Math.round(d * 1000);
        if (gapMm > 0) out.push({ wallId: e.wallId, gapMm });
    }
    return out;
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
    _owningProjectId = activeProjectId();

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

            // ── §L-921-ATOMIC-GESTURE — ASK THE REPAIR BEFORE MOVING ─────────
            //
            // THE FOUNDER'S ASK 3, at its root. Accepting an offer used to
            // dispatch the move unconditionally; the junction re-weld then ran
            // as a store subscriber, refused `OPENING_DOES_NOT_FIT`, and said so
            // to the console. The wall moved, the corner stayed open, and the
            // transcript closed with "Done". §MEASURED-HALF-EXECUTED pins that
            // at a 2096 mm open L junction.
            //
            // One gesture is one atomic unit (C78/C70). The repair is part of
            // the gesture, so it gets a vote BEFORE the gesture, not a console
            // line after it. The pre-flight builds the REAL cascade command and
            // asks its REAL `canExecute` against the model as it will stand the
            // instant the cascade runs — no second copy of the rule.
            //
            // A refusal here is NOT the end of the conversation: the other
            // direction may weld perfectly well, so this `continue`s to the next
            // candidate exactly as a decline does.
            const store = readWallStore();
            let preflight: MoveReweldPreflightResult | null = null;
            if (store) {
                preflight = previewMoveReweld({
                    wallStore: store,
                    wallId,
                    prevBaseLine: [
                        { x: args.prevBaseLine[0].x, y: args.prevBaseLine[0].y ?? 0, z: args.prevBaseLine[0].z },
                        { x: args.prevBaseLine[1].x, y: args.prevBaseLine[1].y ?? 0, z: args.prevBaseLine[1].z },
                    ],
                    newBaseLine: [
                        { x: offer.baseLine[0].x, y: offer.baseLine[0].y ?? 0, z: offer.baseLine[0].z },
                        { x: offer.baseLine[1].x, y: offer.baseLine[1].y ?? 0, z: offer.baseLine[1].z },
                    ],
                    joinedWallIds: joinedWallsOrNull(wallId).ids,
                    junctions: joinedWallsOrNull(wallId).junctions,
                });
                // ⚠ `allowed`, NOT `ok`. MEASURED: this line read `!preflight.ok`
                // and the L-921 incumbent case DISPATCHED THE MOVE ANYWAY —
                // `previewMoveReweld` returns `ok: true` for a C83 §10.2.2 breach
                // ("the cascade itself never got to object") and carries the
                // verdict in `allowed = ok && !incumbentBreach`. Its own docstring
                // says callers gate on `allowed` *"and nothing else, so the gate
                // and the chat accept path cannot drift into disagreeing about
                // whether a move may proceed"*; they had drifted. `gateWallMove`
                // reads `allowed`; this now reads the same field.
                if (!preflight.allowed) {
                    console.warn(
                        `[WallMoveClashProposal] §L-921-ATOMIC-GESTURE refusing the WHOLE gesture ` +
                        `for wall ${wallId} (${offer.label}): the move-reweld cascade would refuse ` +
                        `${preflight.reason ?? 'unspecified'} (cascade ok=${preflight.ok}, ` +
                        `incumbentBreach=${preflight.incumbentBreach}) — nothing dispatched.`,
                        { blockingIssues: preflight.blockingIssues, partnerIds: preflight.partnerIds },
                    );
                    chatSay(describeReweldRefusal(wallId, offer.label, preflight));
                    continue; // the other direction may still weld cleanly
                }
            }

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
            // ── §L-921-NO-SILENT-HALF — verify the repair actually landed ────
            //
            // The pre-flight above asks the same predicate the cascade will ask,
            // so it should never disagree. "Should never" is not a guarantee,
            // and the outcome this lane exists to abolish is SILENCE — so the
            // claim is checked against the model rather than asserted. If any
            // re-weld this move required did not land, the transcript says so,
            // names the wall, and gives the gap in millimetres.
            //
            // This is the belt to the pre-flight's braces: even a cascade that
            // refuses for a reason the pre-flight could not foresee now REACHES
            // THE USER instead of a console.warn.
            const unrepaired =
                store && preflight && preflight.entries.length > 0
                    ? unrepairedGapMm(store, preflight.entries)
                    : [];
            if (unrepaired.length > 0) {
                const list = unrepaired
                    .map((u) => `wall ${u.wallId} (open by ${u.gapMm} mm)`)
                    .join('; ');
                console.warn(
                    `[WallMoveClashProposal] §L-921-NO-SILENT-HALF: wall ${wallId} moved but ` +
                    `${unrepaired.length} junction re-weld(s) did NOT land: ${list}`,
                );
                chatSay(
                    `Wall ${wallId} moved ${offer.label}, clear of the opening — but the junction ` +
                    `re-weld did NOT complete, so the corner is still open at ${list}. ` +
                    `The model is not as I intended it. Ctrl+Z undoes the move in one step; ` +
                    `otherwise those wall ends need joining by hand.`,
                );
                return;
            }
            chatSay(
                `Done — wall ${wallId} moved ${offer.label}, clear of the opening` +
                (preflight && preflight.entries.length > 0
                    ? `, and its ${preflight.entries.length === 1 ? 'junction was' : 'junctions were'} re-welded`
                    : '') +
                `. Ctrl+Z undoes it in one step.`,
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

// ── PROJECT SCOPE (ADR-0298) — §L-910-CLASS ──────────────────────────────────
//
// The two containers above are keyed by WALL ID, and wall ids are not globally
// unique across projects. Carried across a project switch they do not merely
// waste memory: `lastAskedKey` SUPPRESSES a question. Project A's entry for
// wall `w-12` silences a genuine, defensible clash offer on project B's
// unrelated `w-12` — the user drags into a real clash and the chat stays quiet.
// That is the same shape as the L-910 stale-projection leak: state whose only
// symptom is a correct thing that silently fails to happen.
//
// `asking` is worse in kind if rarer: a switch while a card is on screen can
// leave a wall permanently in the "already asking" set, because the `finally`
// that removes it only runs when that promise settles.

/**
 * C13 teardown — drop every de-duplication record.
 *
 * Idempotent, synchronous, non-throwing (the `projectScopeRegistry` contract).
 * There is nothing to detach here, so unlike a scene-parenting scope this
 * cannot half-fail; it clears the containers and the ownership stamp together,
 * so the module can never be left holding entries it no longer attributes.
 */
export function clearWallMoveClashProposals(): void {
    lastAskedKey.clear();
    asking.clear();
    _owningProjectId = null;
}

/** What is being held, for the leak report. Never throws. */
export function describeWallMoveClashState(): Record<string, unknown> {
    return {
        dedupedWalls: lastAskedKey.size,
        askingNow: asking.size,
        stampedProjectId: _owningProjectId,
    };
}

projectScopeRegistry.register({
    scopeName: 'ai.wallMoveClashProposal',
    clear: () => { clearWallMoveClashProposals(); },
});

registerProjectScopeProbe({
    scope: 'ai.wallMoveClashProposal',
    owningProjectId: () => {
        if (lastAskedKey.size === 0 && asking.size === 0) return null;
        return _owningProjectId ?? '<proposal-project-unresolved>';
    },
    describe: () => describeWallMoveClashState(),
});

/** Test seam — clears the de-duplication state. */
export function __resetWallMoveClashState(): void {
    clearWallMoveClashProposals();
}
