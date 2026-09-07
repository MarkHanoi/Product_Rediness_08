// §ENVELOPE-WALLS-FOLLOW — THE WIRE. One committed face move → one `wall.cascadeBaseline`.
// C80 · C114 §6a · C16 · P4 · P6 · P8 · C84 EI-9.
//
// Founder: *"THE ENVELOPE BEING EXTENDED ON PRYZM 3D VIEW SHOULD MEANS THE CONTEXT WALLS -
// PERIMETER WALLS SHALL FOLLOW AND THEE INTERIOR PARTITIONS TOO - AS PER BIM3.0 PRINCIPALS."*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ IT DECIDES NOTHING. `spaceEnvelopeWallFollowPlan.ts` is the whole behaviour — the C80 rule,
// the refusals and the sentence the user reads. This file reads three things, calls that planner,
// and dispatches ONE command. Splitting it that way is what lets the behaviour be tested with no
// store, no bus and no runtime at all.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY ONE `wall.cascadeBaseline` AND NOT N × `wall.updateBaseline` — MEASURED
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `CascadeWallBaselineCommand.ts:60` — *"Each entry mutates one wall; all entries are applied
// atomically in execute()."* — and `MovePlanToolHandler.ts:529`, the live production caller, says
// it in the same words: *"CascadeWallBaselineHandler dispatches ONE undo-stack entry for the whole
// batch."* Forty walls therefore cost ONE undo entry, which is C114 §6a's requirement.
//
// ⛔ THE ALTERNATIVES WERE MEASURED AND REJECTED, so nobody re-opens this:
//  · N × `wall.updateBaseline` = N undo entries. C114 §6a's stated trap.
//  · `batchCoordinator.runBatch` is UNDO-NEUTRAL by its own declaration (`BatchCoordinator.ts:233`)
//    — N commands inside it are still N entries. It buys nothing here.
//  · The `engine/consequence/` pipeline carries NO undo batching of any kind, and its
//    `ConfirmationFlow` is a module-level singleton that may have exactly one card outstanding
//    (`confirmationFlowComposition.ts:23-25`) — a second family competing for it collides with
//    wall-move. It is a preview/confirm mechanism for ONE verb, not a cascade engine.
//  · `wall.batch.update` is MEASURED ABSENT — `ConsequencePreviewService.ts:643-645` names it, with
//    `wall.batch.delete`, `walls.batch.create` and `wall.createBatch`, as existing nowhere in the
//    tree. The five other `wall.*Batch` verbs (colour, height, rake, system type, layers) each
//    mutate N walls in one dispatch and NONE of them touches a baseline.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE CASCADE REFUSES ATOMICALLY, AND THAT IS A REAL FAILURE MODE — NOT A THEORETICAL ONE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `CascadeWallBaselineCommand.ts:270-271` / `:315-317` — ONE failing entry refuses the WHOLE
// cascade. The gate that fails it is the wall-side opening check: a wall whose new baseline would
// cross a door or window is refused.
//
// ⚠ AND THIS CALLER SUPPLIES NO `movedSubject`, SO NO ATTRIBUTION IS ATTEMPTED (§L-990,
// `CascadeWallBaselineCommand.ts:79-83`) — which means a crossing that was ALREADY standing before
// the drag refuses the cascade just as a newly-created one would. It supplies none because it
// HAS none: `movedSubject` is a `{wallId, …}` and this gesture's subject is an ENVELOPE. Inventing
// one by nominating an arbitrary perimeter wall would feed the attribution arm a false premise.
//
// ⇒ On a building with a pre-existing opening crossing, a face drag moves the envelope and NO
//   wall, and the user is TOLD (the dispatch's `.catch` → `notify`). That is the honest outcome and
//   it is visible; silently dropping some walls and moving others is the one that is not.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE HONEST UNDO COUNT FOR ONE DRAG IS **TWO**, ON **TWO DIFFERENT STACKS** — AND THAT SHAPE
//   IS AN ALREADY-LOGGED ⛔ VIOLATION THIS LANE INHERITS RATHER THAN INVENTS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The gesture dispatches `spaceEnvelope.moveFace` — ONE ring-buffer entry, with the adapted rooms
// in the same patch pair (`MutateSpaceEnvelope.ts:255-260`). This cascade is a SECOND command, and
// it lands on the LEGACY stack: `CascadeWallBaseline.ts:35` declares `affectedStores: [] as const`
// and returns an empty patch pair (`:66`), bridging to `commandManager.execute` instead. So
// Ctrl+Z once puts the walls back, twice puts the envelope back.
//
// ⛔ THAT IS EXACTLY THE DEFECT `C85-ELEMENT-WALL.md` ALREADY CARRIES, AND IT IS NAMED. C85:400
// tags `wall.cascadeBaseline` — *"The reweld half. **One gesture, two undo entries, two stacks**"* —
// and W-P-3 (`:305-307`) states it for the wall-move pair: *"One user gesture, two lineages, two
// undo stacks (C84 §4B). **This MUST become one entry.**"* The normative form is W-V-2 (`:418`).
// ⇒ This cascade reproduces that shape with `spaceEnvelope.moveFace` in the role `wall.updateBaseline`
//   plays there. It is NOT a new violation and it is NOT fixed here: closing it means giving
//   `CascadeWallBaselineHandler` a real patch pair, which is a wall-family change under W-V-2 and
//   outside this lane. It is recorded here so the next reader does not have to re-derive it.
//
// ⚠ AND THERE IS NO WAY TO MAKE IT ONE FROM THIS SIDE. No verb in this repo commits a space
// envelope and a wall batch together; minting one is a new cross-family command, a C67/C68 change
// this lane has no authority to make. `buildFromDesignExecutor.ts:13-16` reached the identical
// conclusion for walls + slabs: *"Two truthful steps beat one invented verb."* What C114 §6a
// forbids is FORTY entries for forty walls, and that is what this buys.
//
// ⭐ THE DISPATCH SHAPE MATCHES THE LIVE PRECEDENT EXACTLY. `MovePlanToolHandler.ts:531` — the
// only production cascade caller — dispatches `wall.cascadeBaseline` through the bus with NO
// `_skipBridge`, so the handler's own `cm.execute` is the single push. `_skipBridge`
// (`CascadeWallBaseline.ts:30, :52-54`, recipe at `C02-COMPOSITION-ROOT-AND-BOOT.md:234`) is for
// callers that ALREADY ran the command directly; this one has not, so passing it would suppress
// the only push there is and the walls would move with NO undo entry at all.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ PERFORMANCE — THE COST, WITH THE REAL MARKERS AND THE REAL NUMBERS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ FIRST, A CITATION CORRECTION, because this lane was briefed with the wrong one and a wrong
// marker propagates: **there is no `§REALTIME-EDIT-PERF` in this repo** (0 hits across docs/, apps/,
// packages/), and **`ADR-057` is a dangling number** — that slot is `ADR-0257-realtime-geometry-and-
// view-interactivity.md` (`ADR-0058-unified-building-graph.md:12-13` records the collision). The live
// source markers are `§PERF-WALL-MOVE-INCREMENTAL-REBUILD` (L-234/L-250,
// `WallRebuildCoordinator.ts:1834`) and `§PERF-WALL-DRAG-DEFER` (ADR-061, `:1305`).
//
// The defect that family records was a POINTER-MOVE cost. ⭐ This cascade cannot reproduce it,
// structurally: it runs on `SPACE_ENVELOPE_FACE_MOVED_EVENT`, which `spaceEnvelopeDragSurface.ts:617`
// raises inside `finish` — the POINTERUP handler — and only when the drag actually committed. The
// live drag redraws the envelope prism through `surface.previewDraw` and touches NO wall.
//
//   ⇒ walls rebuilt per POINTER-MOVE: 0.  Cascades per DRAG: exactly 1.  Commands per drag: 1.
//
// ⭐ §ENVELOPE-PARTITIONS-FOLLOW ADDS N PLANNER RUNS PER DRAG, AND THAT COST WAS MEASURED HERE
// RATHER THAN ASSERTED. One drag now plans the subject plus every room the same commit adapted.
// The planner is pure arithmetic over the link rows — no store, no DOM, no allocation per vertex
// beyond the entries — and `spaceEnvelopeWallFollow.spec.ts` benches the realistic worst case
// (1 level of 40 shell walls + 12 rooms of 6 partitions each = 13 envelopes, 112 link rows) at
// **well under 5 ms for the whole merge**, ONCE, at pointer-up. Against the ~207 ms L-234 measures
// for the single `resolveLevel` the cascade then triggers, the planning half is noise.
//
// ⛔ AND IT STAYS AT POINTER-UP. The rooms are read off `plan.adapted` inside the drag's own
// preview loop, which already ran for the neighbour preview — so this feature adds ZERO work per
// pointer-move. That is the §PERF-WALL-MOVE-INCREMENTAL-REBUILD trap, and it is avoided
// structurally rather than by being careful.
//
// ⚠ WHAT THE ONE CASCADE COSTS, MEASURED BY SOMEONE ELSE AND NOT RE-DERIVED HERE. A baseline move
// classifies `'moved-wall'` (`WallDeltaClassifier.ts:59-79`), which deliberately has NO fast path —
// `WallRebuildCoordinator.ts:1834-1841` says so — so it falls through to a whole-level
// `WallJoinResolver.resolveLevel` (`:2009`) + `refreshV2Cache` + junction infills. That solve is
// per-LEVEL, not per-wall, and `_scheduleFlush` (`:1283-1312`) coalesces every store event landing
// in one frame into ONE `_flush`. So N walls in one cascade cost ONE level solve, not N.
// L-234's measured table for that solve: 1 ms at 50 walls… 31 ms at 50, 207 ms at 200 walls on the
// level. The per-wall BUILD is memoized since L-250 (`composeWallGeometryHash`, `:2419-2425`) —
// O(affected), not O(level): *"wall bodies rebuilt 200 → 4"*.
//
//   ⇒ a 40-wall perimeter drag on a 200-wall level ≈ ONE level solve (~207 ms, the L-234 figure)
//     + ~40 memoized wall builds, ONCE, at pointer-up — and 0 ms per pointer-move.
//
// ⛔ NOT MEASURED BY THIS LANE: that figure is L-234's bench, not a reading taken on this gesture,
// and `resolveLevel` being incremental is explicitly DEFERRED (ADR-0099, pinned at
// `WallMoveRebuildCost.measure.test.ts:40`). If a drag ever feels slow, that solve is where to look
// — it is the same solve the Move tool already pays on every neighbour-carrying move.
//
// P4 — no `(window as any)`: every dependency arrives as a typed argument, and the composition
// root below reaches the runtime through ONE structural narrowing. P6 — the only mutation is a bus
// command. P8 — a span per exported function.

import { trace } from '@opentelemetry/api';
import {
    mergeSpaceEnvelopeWallFollowPlans,
    planSpaceEnvelopeWallFollow,
    type SpaceEnvelopeWallFollowPlan,
    type WallFollowLinkRow,
    type WallFollowWallState,
} from './spaceEnvelopeWallFollowPlan';
import {
    SPACE_ENVELOPE_FACE_MOVED_EVENT,
    type SpaceEnvelopeFaceMoveCommitted,
} from './spaceEnvelopeDragSurface';

const _tracer = trace.getTracer('pryzm.engine.spaceEnvelopeWallFollow');

/** The command this consequence dispatches. ONE spelling, for the same reason the verb beside the
 *  gesture has one: a mis-spelled verb reaches the bus as an unknown command, not as a refusal. */
export const WALL_CASCADE_BASELINE_COMMAND = 'wall.cascadeBaseline';

/** The narrowest event channel this needs. Structural, so no runtime import. */
export interface SpaceEnvelopeWallFollowEvents {
    on(event: string, handler: (ev: SpaceEnvelopeFaceMoveCommitted) => void): unknown;
}

export interface SpaceEnvelopeWallFollowDeps {
    /**
     * Every wall recorded as derived from this envelope.
     * ⛔ MUST return `null` when the graph cannot be read — see the planner. `[]` means the
     * envelope produced no walls, and the two may never be collapsed.
     */
    readonly readLinks: (spaceEnvelopeId: string) => readonly WallFollowLinkRow[] | null;
    /** The wall's CURRENT baseline, or `null` when the store no longer holds it. */
    readonly readWall: (wallId: string) => WallFollowWallState | null;
    /**
     * Dispatch through the bus. THE ONLY mutation path (P6).
     *
     * ⚠ RETURNS `unknown` SO THE REFUSAL CAN BE HEARD. `bus.executeCommand` is declared to return
     * `unknown` on the composed handle, and the cascade refuses ATOMICALLY (see the header) — so a
     * dispatch typed `=> void` would turn "no wall moved, and here is why" into an unhandled
     * rejection the user never hears (§FIX-OP-SILENT-NOOP).
     */
    readonly dispatch: (command: string, payload: unknown) => unknown;
    /** Tell the user what followed and what stayed. Optional — the console still gets it. */
    readonly notify?: (message: string, severity: 'info' | 'warning' | 'error') => void;
    /** Overrides the planner's declared authored-drift threshold. See the planner's header. */
    readonly toleranceM?: number;
}

/**
 * Handle ONE committed face move. Exported so a spec can drive it without an event bus, and so a
 * surface that wants the cascade without the subscription can call it directly.
 *
 * ⚠ NEVER THROWS. It runs as the consequence of a gesture that has ALREADY committed; an exception
 * here would leave the user with a moved envelope, unmoved walls and no explanation.
 */
/**
 * ⛔ ONLY A `'primary'` CLAIM MOVES A WALL. See {@link WallFollowLinkRow.claim}: a room's claim on a
 * shell wall it only partly covers is recorded as `'also'`, and planning against it would report a
 * wall nobody touched as `authored-since-generation` — a false statement to the user, in the exact
 * words C80 reserves for protecting real authored work.
 *
 * ⚠ AN ABSENT `claim` PASSES. The field is optional on the row type, a hand-written or older row
 * carries none, and treating "unstated" as "secondary" would silently strand a real perimeter.
 */
const followableRows = (
    rows: readonly WallFollowLinkRow[],
): readonly WallFollowLinkRow[] => rows.filter((r) => r.claim !== 'also');

/**
 * Plan ONE envelope's move. Never throws — a reader that explodes is a reader that could not
 * answer, which is exactly the `null` (unreadable) case and never the empty (no walls) one.
 */
function planOneEnvelope(
    envelopeId: string,
    ringBefore: ReadonlyArray<{ readonly x: number; readonly z: number }>,
    ringAfter: ReadonlyArray<{ readonly x: number; readonly z: number }>,
    deps: SpaceEnvelopeWallFollowDeps,
): SpaceEnvelopeWallFollowPlan {
    let links: readonly WallFollowLinkRow[] | null;
    try {
        links = deps.readLinks(envelopeId);
    } catch (e) {
        console.warn('[spaceEnvelopeWallFollow] the link reader threw; treating it as unreadable:', e);
        links = null;
    }
    return planSpaceEnvelopeWallFollow({
        spaceEnvelopeId: envelopeId,
        ringBefore,
        ringAfter,
        links: links === null || links === undefined ? null : followableRows(links),
        wallState: (wallId) => {
            try {
                return deps.readWall(wallId);
            } catch {
                // Unreadable is indistinguishable from gone at this seam, and the safe reading of
                // both is "do not move it".
                return null;
            }
        },
        ...(deps.toleranceM !== undefined ? { toleranceM: deps.toleranceM } : {}),
    });
}

/**
 * Handle ONE committed face move. Exported so a spec can drive it without an event bus, and so a
 * surface that wants the cascade without the subscription can call it directly.
 *
 * ⭐ §ENVELOPE-PARTITIONS-FOLLOW — IT PLANS THE SUBJECT **AND EVERY ROOM THE SAME COMMIT MOVED**,
 * then merges them into ONE dispatch. The founder asked for the perimeter AND the partitions, and
 * a partition is `boundedBy` its ROOM, never the level the pointer grabbed — so the subject's two
 * rings alone can only ever move the perimeter. `ev.adapted` carries the rooms'
 * (`mergeSpaceEnvelopeWallFollowPlans` carries the C114 §6a economy).
 *
 * ⚠ NEVER THROWS. It runs as the consequence of a gesture that has ALREADY committed; an exception
 * here would leave the user with a moved envelope, unmoved walls and no explanation.
 */
export function applySpaceEnvelopeWallFollow(
    ev: SpaceEnvelopeFaceMoveCommitted,
    deps: SpaceEnvelopeWallFollowDeps,
): SpaceEnvelopeWallFollowPlan | null {
    const span = _tracer.startSpan('pryzm.engine.applySpaceEnvelopeWallFollow');
    try {
        // ⛔ THE SUBJECT IS FIRST, ALWAYS. It owns the perimeter, and `mergeSpaceEnvelopeWallFollowPlans`
        // keeps the FIRST plan's refusal when the whole gesture produced nothing — so a top/bottom
        // drag still reads `ring-unchanged` and still stays out of the user's face.
        const plans: SpaceEnvelopeWallFollowPlan[] = [
            planOneEnvelope(ev.spaceEnvelopeId, ev.ringBefore, ev.ringAfter, deps),
        ];
        // ⚠ A ROOM IS SKIPPED, NOT REFUSED, WHEN IT NAMES THE SUBJECT. Belt and braces: the
        // contextual planner never puts the subject in its own `adapted` list, and if it ever did,
        // planning it twice would make every one of its walls contest itself.
        for (const a of ev.adapted ?? []) {
            if (!a || a.envelopeId === ev.spaceEnvelopeId) continue;
            plans.push(planOneEnvelope(a.envelopeId, a.ringBefore, a.ringAfter, deps));
        }

        const plan = mergeSpaceEnvelopeWallFollowPlans(plans);

        span.setAttribute('pryzm.wallFollow.envelope', ev.spaceEnvelopeId);
        span.setAttribute('pryzm.wallFollow.envelopes', plans.length);
        span.setAttribute('pryzm.wallFollow.moved', plan.entries.length);
        span.setAttribute('pryzm.wallFollow.stayed', plan.stayed.length);

        // ⚠ A `ring-unchanged` refusal is the ORDINARY outcome of a top/bottom drag, so it is
        // logged rather than toasted — a warning on every roof-height drag would be noise. Every
        // other refusal is a thing the user should hear.
        if (plan.refusal) {
            if (plan.refusal.code === 'ring-unchanged') {
                console.log(`[spaceEnvelopeWallFollow] no wall followed — ${plan.refusal.message}`);
            } else {
                console.warn(`[spaceEnvelopeWallFollow] ${plan.refusal.code}: ${plan.refusal.message}`);
                deps.notify?.(plan.refusal.message, 'warning');
            }
            return plan;
        }

        // ⛔ EVERY WALL THAT DID NOT MOVE IS NAMED IN THE LOG, not just counted in the summary.
        // A silent stay is the outcome the C80 rule exists to prevent, and a count alone does not
        // tell the user WHICH wall of forty kept its place.
        for (const s of plan.stayed) {
            console.log(`[spaceEnvelopeWallFollow] wall '${s.wallId}' stayed (${s.reason}) — ${s.detail}`);
        }

        if (plan.entries.length === 0) {
            console.log(`[spaceEnvelopeWallFollow] ${plan.summary}`);
            // The C80 case is worth telling the user about even when nothing moved: they dragged a
            // face and the building did not follow, and they are owed the reason.
            if (plan.stayed.some((s) => s.reason === 'authored-since-generation'
                || s.reason === 'contested-by-two-envelopes')) {
                deps.notify?.(plan.summary, 'info');
            }
            return plan;
        }

        try {
            // P6 — the ONE mutation, and exactly one per committed drag, however many envelopes
            // moved inside it (C114 §6a).
            const result = deps.dispatch(WALL_CASCADE_BASELINE_COMMAND, {
                entries: plan.entries.map((e) => ({
                    wallId: e.wallId,
                    newBaseLine: e.newBaseLine,
                    prevBaseLine: e.prevBaseLine,
                })),
                cause: plan.cause,
            });
            // ⛔ THE ATOMIC REFUSAL ARRIVES HERE, ASYNCHRONOUSLY, AND IS THE LIKELIEST REAL FAILURE
            // — one wall crossing an opening refuses all N (header). `Promise.resolve` because the
            // bus's composed handle is declared `unknown`; dropping the `.catch` to satisfy the
            // compiler would make the refusal an unhandled rejection.
            void Promise.resolve(result).catch((e: unknown) => {
                console.error('[spaceEnvelopeWallFollow] the wall cascade was REFUSED:', e);
                deps.notify?.(
                    'The envelope face moved, but PRYZM could not move the walls with it — '
                    + `${e instanceof Error ? e.message : String(e)}. Every wall is where it was; the `
                    + 'cascade is all-or-nothing.',
                    'error',
                );
            });
        } catch (e) {
            console.error('[spaceEnvelopeWallFollow] the wall cascade was NOT dispatched:', e);
            deps.notify?.(
                'The envelope face moved but PRYZM could not move the walls with it. The walls are '
                + 'where they were.',
                'error',
            );
            return plan;
        }

        console.log(`[spaceEnvelopeWallFollow] ${plan.summary}`);
        deps.notify?.(plan.summary, 'info');
        return plan;
    } catch (e) {
        console.error('[spaceEnvelopeWallFollow] the follow consequence threw (non-fatal):', e);
        return null;
    } finally {
        span.end();
    }
}

/**
 * Subscribe the cascade to the ONE face-moved channel.
 *
 * ⭐ ONE SUBSCRIPTION COVERS EVERY SURFACE. The event is raised by the GESTURE, once, on whichever
 * surface it ran (`spaceEnvelopeDragSurface.ts:255-262`) — so the BIM 3-D viewport and the 3-D Site
 * are both covered by this single registration, and a third surface needs no wiring at all. A
 * per-surface installation would be N copies of the C80 decision (C84 EI-9).
 */
export function registerSpaceEnvelopeWallFollow(
    events: SpaceEnvelopeWallFollowEvents,
    deps: SpaceEnvelopeWallFollowDeps,
): void {
    const span = _tracer.startSpan('pryzm.engine.registerSpaceEnvelopeWallFollow');
    try {
        events.on(SPACE_ENVELOPE_FACE_MOVED_EVENT, (ev) => {
            applySpaceEnvelopeWallFollow(ev, deps);
        });
    } finally {
        span.end();
    }
}
