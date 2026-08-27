/**
 * @pryzm/geometry-curtain-wall — CurtainWallMoveReweldService (§CWWELD169,
 * L-12800..). Dispatch half of the CW↔CW move re-weld; the pure compute half
 * is `CurtainWallMoveReweld.ts`. Mirrors `@pryzm/geometry-wall`'s
 * `WallMoveReweldService.ts` STRUCTURE (subscribe → gate → resolve partners →
 * compute plan → dispatch ONE undoable cascade), adapted where curtain walls
 * are MEASURABLY different from walls rather than by invention (C84 EI-9).
 *
 * ══ WHERE THIS DELIBERATELY DIVERGES FROM THE WALL SERVICE, AND WHY ═══════════
 *
 * 1. NO `joinedTo` GRAPH. `SemanticGraphManager.getJoinedWalls` is a WALL
 *    graph; curtain walls have no declared-junction equivalent (measured:
 *    zero `curtainWall`/`CurtainWall` references anywhere in
 *    `packages/geometry-wall/src/WallMoveReweldService.ts` or
 *    `WallMoveReweld.ts`, and no `getJoinedCurtainWalls` exists anywhere in
 *    the repo). So this service ALWAYS takes the wall engine's "no answer"
 *    branch: every other curtain wall on the level is a candidate partner,
 *    filtered geometrically by `computeCurtainWallMoveReweldCensus`'s own
 *    `weldTol` test. This is not a shortcut taken here — it is the ONLY
 *    branch that exists for this element kind today.
 *
 * 2. NO DRAG-COALESCE MEMO. `WallMoveReweldService`'s `_dragMemo` /
 *    `DRAG_MEMO_TTL_MS` machinery (§WALL30-DRAG-COALESCE, L-10520/L-10522)
 *    exists because `PlanElementDragController._moveWall` writes `wallStore`
 *    on EVERY mousemove frame during a live 2-D plan drag. MEASURED: curtain
 *    walls have NO entry in that controller at all
 *    (`packages/core-app-model/src/views/PlanElementDragController.ts` has
 *    zero `curtainwall`/`CurtainWall` references) — a curtain wall moves only
 *    via the 3-D gizmo (`registerTransformDragHandler.ts`, which is
 *    visual-only during the drag and commits the store ONCE at mouse-up,
 *    exactly like the wall service's own comment describes for that same
 *    path) or the Plan "Move" tool's ghost-preview + single commit
 *    (`MovePlanToolHandler.ts`). Every write this service will ever see is
 *    therefore already a single, settled move — the memo this service would
 *    need does not have a bug to compensate for. If a future path starts
 *    writing curtain-wall baselines per animation frame, it will need the
 *    same fix the wall service required; it does not need it pre-emptively.
 *
 * 3. NO `isJoinResolving()` LATCH. That guards against the wall mitre pass
 *    (`WallJoinResolver`/`WallRebuildCoordinator`) reacting to its OWN
 *    render-time corrections. Curtain walls have no mitre-pass equivalent —
 *    their geometry regenerates from `gridSystem`/panels
 *    (`CurtainWallBuilder`), not from a junction-resolving corner pass — so
 *    there is no analogous self-feedback source to suppress.
 *
 * 4. `isCascadeApplying()` IS KEPT — this service's OWN cascade writes
 *    `curtainWallStore` via `UpdateCurtainWallCommand`, and without the latch
 *    those writes would re-enter `onCurtainWallUpdated` and re-cascade their
 *    own re-weld (§REENTRANT-SET, same reasoning as the wall service).
 *
 * ══ WHAT THIS DISPATCHES ═══════════════════════════════════════════════════════
 * ONE `CascadeCurtainWallBaselineCommand` per gesture (C16 §8.6 — one gesture,
 * one undo entry), injected by factory rather than imported directly
 * (`geometry-curtain-wall` ↔ `command-registry` would otherwise be a new
 * package cycle — the SAME reason `WallMoveReweldService` takes its command
 * class by factory, not import). That command composes `UpdateCurtainWallCommand`
 * per re-seated wall — THE SAME write path the curtain-wall property panel and
 * `§CWPROPS152`'s bulk parameter command already use (`UpdateCurtainWallCommand`
 * §CW-4 / C87 §13.6), so a re-weld triggers the identical `CurtainWallBuilder`
 * subscriber rebuild a manual property edit would, and never re-derives the
 * grid by a second path (C84 EI-3).
 */

import type { CurtainWallData } from './CurtainWallTypes';
import {
    computeCurtainWallMoveReweldCensus,
    MIN_CURTAIN_MOVE_M,
    type CurtainMoveReweldEntry,
    type CurtainMoveReweldPartner,
    type CurtainReweldBaseline,
} from './CurtainWallMoveReweld';

type CWEventType = 'add' | 'update' | 'remove';

/** The two CurtainWallStore surfaces this service reads. `subscribe` MUST
 *  forward prevState (§GRAPH115 / §STEP7) — without it there is no "as of
 *  before the move". */
export interface CurtainWallReweldStoreRef {
    subscribe(
        cb: (event: CWEventType, cw: CurtainWallData, prevState?: CurtainWallData) => void
    ): () => void;
    getById(id: string): CurtainWallData | undefined;
    getAll(): CurtainWallData[];
}

export interface CurtainReweldCommandLike {
    canExecute(context: unknown): { ok: boolean; reason?: string; blockingIssues?: string[] };
}

export interface CurtainReweldCommandManagerLike {
    getContext(): unknown;
    execute(command: CurtainReweldCommandLike, metadata?: unknown): unknown;
    /** True while the manager is replaying an undo/redo — a fresh forward
     *  re-weld here would compensate the user's own Ctrl+Z, mirroring
     *  `WallMoveReweldService`'s identical guard. */
    isReverting?: () => boolean;
}

/** Late-binding ref — constructed before commandManager exists, resolved live
 *  at event-fire time (same pattern the wall service and
 *  `FinishHostDependencyTracker` both use). */
export interface CurtainReweldCommandManagerRef {
    current: CurtainReweldCommandManagerLike | undefined;
}

export type CurtainReweldCascadeCommandFactory = (input: {
    entries: CurtainMoveReweldEntry[];
    cause: 'move-reweld';
}) => CurtainReweldCommandLike;

/** A re-weld consequence the user must be told about — mirrors
 *  `ReweldConsequenceReport` (§L-921's finding applied here from birth: a
 *  refusal computed and a refusal DELIVERED must never print as the same
 *  outcome). */
export interface CurtainReweldConsequenceReport {
    readonly movedCurtainWallId: string;
    readonly stage: 'plan' | 'cascade';
    readonly reason: string;
    readonly partnerIds: readonly string[];
    readonly detail: readonly string[];
}

export interface CurtainWallMoveReweldServiceDeps {
    commandManagerRef: CurtainReweldCommandManagerRef;
    makeCascadeCommand: CurtainReweldCascadeCommandFactory;
    /** True while ANY CascadeCurtainWallBaselineCommand is applying its
     *  writes — wire to `isCascadeCurtainWallBaselineApplying` (§CWWELD169,
     *  mirrors `isCascadeWallBaselineApplying`). */
    isCascadeApplying?: () => boolean;
    /** "Was welded" tolerance in metres; defaults to 0.5 (see
     *  `CurtainWallMoveReweld.ts`'s module doc for why this is a local
     *  literal rather than an import of `DEFAULT_SNAP_RADIUS`). */
    weldTol?: () => number;
    /** Where an unrepaired junction or a declined refusal goes. Absent ⇒ the
     *  finding is still logged, but no human will see it — wire it in any
     *  composition that has a chat surface (mirrors the wall service). */
    onConsequence?: (report: CurtainReweldConsequenceReport) => void;
}

function toBaseline(bl: ReadonlyArray<{ x: number; y: number; z: number }>): CurtainReweldBaseline {
    const a = bl[0] ?? { x: 0, y: 0, z: 0 };
    const b = bl[1] ?? { x: 0, y: 0, z: 0 };
    return [{ x: a.x, y: a.y, z: a.z }, { x: b.x, y: b.y, z: b.z }];
}

export class CurtainWallMoveReweldService {
    private unsubscribe?: () => void;
    /** §REENTRANT-SET: our own dispatch must not feed our own event path. */
    private propagating = false;
    private readonly isCascadeApplying: () => boolean;

    constructor(
        private readonly curtainWallStore: CurtainWallReweldStoreRef,
        private readonly deps: CurtainWallMoveReweldServiceDeps,
    ) {
        this.isCascadeApplying = deps.isCascadeApplying ?? (() => false);
        this.unsubscribe = curtainWallStore.subscribe((event, cw, prevState) => {
            if (event === 'update') this.onCurtainWallUpdated(cw, prevState);
        });
    }

    private onCurtainWallUpdated(cw: CurtainWallData, prevState?: CurtainWallData): void {
        if (this.propagating) return; // our own cascade's writes
        if (this.isCascadeApplying()) return; // the cascade's own writes, mid-apply
        if (this.deps.commandManagerRef.current?.isReverting?.()) return; // undo/redo replay

        const prevBL = prevState?.baseLine;
        const newBL = cw.baseLine;
        if (!prevBL || !newBL || prevBL.length < 2 || newBL.length < 2) return;

        const disp = Math.max(
            Math.hypot(newBL[0].x - prevBL[0].x, newBL[0].z - prevBL[0].z),
            Math.hypot(newBL[1].x - prevBL[1].x, newBL[1].z - prevBL[1].z),
        );
        if (disp < MIN_CURTAIN_MOVE_M) return; // property-only update (mullion, colour, …)

        const moved = this.curtainWallStore.getById(cw.id);
        if (!moved || !moved.baseLine || moved.baseLine.length < 2) return;

        // ── Partners: NO declared graph exists for curtain walls (see module
        //    header §1) — every other curtain wall on the level is a
        //    candidate, filtered geometrically by the pure engine's weldTol
        //    test. CW↔wall / wall↔CW joints are OUT OF SCOPE (§CWWELD169) —
        //    a wall sharing this junction is invisible here by construction.
        const levelPeers = this.curtainWallStore
            .getAll()
            .filter(other => other.id !== cw.id && other.levelId === moved.levelId);
        if (levelPeers.length === 0) return;

        const partners: CurtainMoveReweldPartner[] = levelPeers
            .filter(p => p.baseLine && p.baseLine.length >= 2)
            .map(p => ({ id: p.id, baseLine: toBaseline(p.baseLine) }));
        if (partners.length === 0) return;

        const plan = computeCurtainWallMoveReweldCensus(
            {
                id: cw.id,
                prevBaseLine: toBaseline(prevBL),
                newBaseLine: toBaseline(moved.baseLine),
            },
            partners,
            { weldTol: this.deps.weldTol?.() ?? 0.5 },
        );

        if (plan.refusals.length > 0) {
            const byReason = new Map<string, typeof plan.refusals>();
            for (const r of plan.refusals) {
                const bucket = byReason.get(r.reason);
                if (bucket) bucket.push(r); else byReason.set(r.reason, [r]);
            }
            for (const [reason, group] of byReason) {
                const detail = group.map(r =>
                    `${reason}: ${r.partnerId}: measured ${r.measuredMm} mm against a ${r.limitMm} mm limit`);
                console.warn(
                    `[CurtainWallMoveReweldService] §CWWELD169-REFUSED: moved curtain wall ${cw.id} — ` +
                    `${reason} × ${group.length}; these junctions are LEFT UNREPAIRED: ` +
                    `[${group.map(r => r.partnerId).join(', ')}]`,
                );
                this.report({
                    movedCurtainWallId: cw.id, stage: 'plan', reason,
                    partnerIds: group.map(r => r.partnerId), detail,
                });
            }
        }

        const broken = plan.notApplicable.filter(n => n.reason === 'CURTAIN_SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE');
        if (broken.length > 0) {
            const detail = broken.map(n =>
                `CURTAIN_SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE: ${n.partnerId}: this curtain wall's own ` +
                `endpoint was on partner ${n.partnerId}'s body before the move and is now ${n.measuredMm} mm ` +
                `off it. This engine has no arm that can repair it (C85 §10.7 W-M-13, mirrored) — the ` +
                `move DELIBERATELY carried the subject away, so neither snapping it back nor extending a ` +
                `partner the user never touched is the right repair.`);
            console.warn(
                `[CurtainWallMoveReweldService] §CWWELD169-JOIN-BROKEN: moved curtain wall ${cw.id} — ` +
                `${broken.length} join(s) that were CLOSED before this move are now OPEN and unrepaired: ` +
                `[${broken.map(n => n.partnerId).join(', ')}]`,
            );
            this.report({
                movedCurtainWallId: cw.id, stage: 'plan',
                reason: 'CURTAIN_SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE',
                partnerIds: broken.map(n => n.partnerId), detail,
            });
        }

        if (plan.entries.length === 0) return;

        const cm = this.deps.commandManagerRef.current;
        if (!cm) {
            console.warn(
                `[CurtainWallMoveReweldService] §CWWELD169-DISPATCH: commandManager not yet available — ` +
                `${plan.entries.length} re-weld entry/entries for moved curtain wall ${cw.id} NOT dispatched.`,
            );
            return;
        }

        this.propagating = true;
        try {
            const cmd = this.deps.makeCascadeCommand({ entries: plan.entries, cause: 'move-reweld' });
            const validation = cmd.canExecute(cm.getContext());
            if (!validation.ok) {
                console.warn(
                    `[CurtainWallMoveReweldService] move-reweld cascade refused for moved curtain wall ` +
                    `${cw.id}: ${validation.reason ?? 'unspecified'}`,
                    { blockingIssues: validation.blockingIssues },
                );
                this.report({
                    movedCurtainWallId: cw.id, stage: 'cascade',
                    reason: validation.reason ?? 'unspecified',
                    partnerIds: plan.entries.map(e => e.curtainWallId),
                    detail: validation.blockingIssues ?? [],
                });
                return;
            }
            cm.execute(cmd, { source: 'STRUCTURAL_CASCADE' });
            console.log(
                `[CurtainWallMoveReweldService] §CWWELD169-DISPATCH: moved curtain wall ${cw.id} → ` +
                `${partners.length} partner(s) considered (level-scan, no declared graph) → ` +
                `${plan.entries.length} baseline re-seat(s) ` +
                `[${plan.entries.map(e => e.curtainWallId).join(', ')}], ` +
                `${plan.refusals.length} junction(s) refused, ${broken.length} declared join(s) broken, ` +
                `${plan.notApplicable.length} not-applicable`,
            );
        } finally {
            this.propagating = false;
        }
    }

    private report(r: CurtainReweldConsequenceReport): void {
        try {
            this.deps.onConsequence?.(r);
        } catch (err) {
            console.warn('[CurtainWallMoveReweldService] consequence sink threw (non-fatal):', err);
        }
    }

    dispose(): void {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
    }
}
