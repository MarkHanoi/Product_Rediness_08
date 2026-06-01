import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { CreateWallsFromSlabCommand } from './CreateWallsFromSlabCommand';
import { batchCoordinator } from '@pryzm/core-app-model';

export interface CreateWallsOnAllSlabsPayload {
    wallHeight?: number;
    wallThickness?: number;
}

export class CreateWallsOnAllSlabsCommand implements Command {
    readonly affectedStores = ["wall", "level"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_WALLS_ON_ALL_SLABS;
    readonly timestamp: number;
    targetIds: string[] = [];
    private subCommands: CreateWallsFromSlabCommand[] = [];

    constructor(private payload: CreateWallsOnAllSlabsPayload) {
        this.id = `cmd-walls-on-all-slabs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const slabStore = context.stores.slabStore;
        if (!slabStore) return { ok: false, reason: "Slab store not available" };
        const slabs = slabStore.getAll();
        if (slabs.length === 0) return { ok: false, reason: "No slabs found in model" };

        const invalidSlabs = slabs.filter(s => !s.levelId);
        if (invalidSlabs.length > 0) {
            return { ok: false, reason: `Found ${invalidSlabs.length} slabs without a levelId` };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const slabStore = context.stores.slabStore;
        if (!slabStore) return { success: false, affectedElementIds: [] };

        const slabs = slabStore.getAll();
        const wallIds: string[] = [];

        this.subCommands = [];

        // ── §FLOW8-FIX-2026-04-30 — batched event delivery ────────────────────
        // Architectural fix tracing back to:
        //   • 01-VISION.md §2 P6  — Commands are the only state mutation path;
        //                           commands of the same family must use the
        //                           same batching envelope so observers see
        //                           a single coalesced fan-out.
        //   • 01-VISION.md §5 NFT-3 (Tool latency click→visible ≤ 50 ms p95),
        //                    NFT-4 (Frame budget ≤ 16.6 ms p95),
        //                    NFT-5 (Plan-view re-render after edit ≤ 100 ms p95)
        //   • 02-ARCHITECTURE.md §1 L3 (event-bus + command-bus are owners
        //                              of the batch envelope, NOT individual
        //                              commands).
        //
        // Symptom (STATUS-2026-04-30k + the new attached log evidence):
        //   the user-attached console capture shows 10 BimManager element
        //   registrations triggering 91 REDETECT_ROOMS commands and 28
        //   LONGTASK warnings totalling ~2,493 ms of main-thread blocking.
        //   The forced-fire log line
        //     "[RoomTopologyObserver] forced fire (level=…, deadline=400ms,
        //      elapsed=5ms, resets=6)"
        //   is the exact failure mode: the per-level debounce timer in
        //   RoomTopologyObserver is reset 6× within 5 ms by a tight cascade
        //   of WallStore add events, tripping the MAX_DEBOUNCE_RESETS
        //   starvation guard and force-firing REDETECT_ROOMS mid-batch.
        //   That fan-out then dirties every dependent view, which causes
        //   EdgeProjectorService to re-project all 311 visible elements per
        //   dirty view — the observed 25 sequential 60–94 ms LONGTASKs.
        //
        // Root cause: the slab loop did NOT run inside
        // batchCoordinator.runBatch(), so:
        //   1. storeEventBus did not buffer per-wall add events (the
        //      WallBuilder rebuilt geometry per wall, not per command);
        //   2. RoomTopologyObserver._scheduleRedetect did not see
        //      `batchCoordinator.isBatching === true` and could not
        //      suppress its starvation-force-fire path;
        //   3. ViewDependencyTracker dirtied views per wall add, causing
        //      EdgeProjectorService re-projection per wall instead of once
        //      per command.
        //
        // Fix: mirror the proven CreateCurtainWallsOnAllSlabsCommand
        // pattern (lines 215-226 of that file) — wrap the slab loop in
        // `batchCoordinator.runBatch(fn, { levelIds, totalElementCount })`.
        // This guarantees:
        //   • storeEventBus buffers all wall add events; one flush per
        //     command via _executeFinalSweep() (P6 + NFT-4).
        //   • RoomTopologyObserver._scheduleRedetect early-returns at
        //     line 417 (`if (batchCoordinator.isBatching)`) — no
        //     starvation force-fire (NFT-5 + the 91 → 1 redetect collapse).
        //   • _executeFinalSweep dispatches exactly ONE REDETECT_ROOMS
        //     per affected level via the levelIds opt — same envelope
        //     that BatchCoordinator already exposes for the curtain-wall
        //     command, no novel architecture introduced.
        //
        // Rollback safety: the existing per-subCommand undo loop is kept
        // OUTSIDE the batch (in the catch block below). When fn() throws
        // inside runBatch, the contract on lines 32-42 of BatchCoordinator
        // discards the buffered events and resets `_isBatching` cleanly
        // before re-raising — so the catch block sees a clean bus and the
        // wallStore.remove() calls in subCommand.undo() fire fresh remove
        // events immediately, exactly as they did pre-fix.
        //
        // Risk: low — same envelope as the curtain-wall command which has
        // shipped with this pattern since Task 5.3 Phase 5; no API change
        // to AIService, no payload change, no command-bus signature change.
        const __t_cmd_start = performance.now();
        console.log(`[CreateWallsOnAllSlabsCommand] START slabCount=${slabs.length}`);

        // Pre-compute batch options (levelIds for the final REDETECT_ROOMS
        // sweep, totalElementCount for the rAF registration-drain pacer).
        // Mirrors CreateCurtainWallsOnAllSlabsCommand lines 217-225.
        const __validSlabs = slabs.filter(s => s.polygon && s.polygon.length >= 3 && s.levelId);
        const __affectedLevelIds = [...new Set(__validSlabs.map(s => s.levelId!))];
        const __estimatedWallCount = __validSlabs.reduce(
            (acc, s) => acc + (s.polygon ? s.polygon.length : 0),
            0
        );

        // §A40-W01 §REG-MANY-P1: accumulate wall IDs per level so the post-loop
        // trackRegistration block can call registerMany() once per level group.
        // Mirrors CreateCurtainWallsOnAllSlabsCommand lines 155–275 exactly.
        // bimManager.registerElement() is now gated in CreateWallCommand.execute()
        // (§A40-W01 guard) so these IDs won't be double-registered.
        const __regGroupMap = new Map<string, string[]>();

        const _processSlabs = () => {
            for (const slab of slabs) {
                if (!slab.polygon || slab.polygon.length < 3 || !slab.levelId) continue;

                const __t_slab_loop_start = performance.now();
                const __slabLevelId = slab.levelId;

                const subCommand = new CreateWallsFromSlabCommand({
                    slabId: slab.id,
                    wallHeight: this.payload.wallHeight,
                    wallThickness: this.payload.wallThickness
                });

                const validation = subCommand.canExecute(context);
                if (!validation.ok) continue;

                const result = subCommand.execute(context);

                if (!result?.success) {
                    throw new Error(`Subcommand execution failed for slab ${slab.id}`);
                }

                const __wallCountThisSlab = result.affectedElementIds?.length ?? 0;
                wallIds.push(...result.affectedElementIds);
                this.subCommands.push(subCommand);

                // §A40-W01: accumulate per-level registration groups.
                if (!__regGroupMap.has(__slabLevelId)) {
                    __regGroupMap.set(__slabLevelId, []);
                }
                __regGroupMap.get(__slabLevelId)!.push(...result.affectedElementIds);

                console.log(
                    `[CreateWallsOnAllSlabsCommand] slab="${slab.id}" ` +
                    `walls=${__wallCountThisSlab} ` +
                    `elapsed=${(performance.now() - __t_slab_loop_start).toFixed(1)}ms`
                );
            }

            // §A40-W01 §REG-MANY-P1: ONE trackRegistration per unique level — O(L+N) total.
            // Each lambda captures its own (lvlId, ids) pair — same closure pattern as
            // CreateCurtainWallsOnAllSlabsCommand lines 267-278.
            for (const [lvlId, ids] of __regGroupMap.entries()) {
                const capturedIds = ids.slice(); // freeze snapshot before async drain
                batchCoordinator.trackRegistration(() => {
                    context.bimManager.registerMany(capturedIds, lvlId);
                });
            }
            console.log(
                `[CreateWallsOnAllSlabsCommand] §A40-W01 registerMany: ` +
                `${__regGroupMap.size} level group(s) queued for O(L+N) batch registration.`
            );
        };

        try {
            // §FLOW8-FIX: nested-batch safety — if the caller (e.g. AIService
            // dispatching multiple commands inside its own batch) is already
            // batching, runBatch() logs a warn and runs fn() directly; this
            // is correct because the outer envelope already provides the
            // event-bus bracket and the per-level REDETECT_ROOMS sweep.
            batchCoordinator.runBatch(_processSlabs, {
                levelIds: __affectedLevelIds,
                totalElementCount: __estimatedWallCount,
            });

            this.targetIds = wallIds;

            // E.5.x P2e-walls: Dispatch wall.batch.create for event-sourcing in the
            // plugin store.  Fire-and-forget — errors must NOT affect the legacy result.
            // Mirrors CreateCurtainWallsOnAllSlabsCommand P2e (curtain-wall.batch.create)
            // exactly.  The legacy wallStore.add() path above is still the authoritative
            // geometry trigger; the bus handler writes the same data to the plugin
            // WallsState as a parallel Immer record — one undo-stack entry for the
            // entire batch, aligned with §2 P6 of 01-VISION.md.
            //
            // The specs are built from the PRYZM-1 wallStore (via context.stores) which
            // already holds the fully-resolved geometry (baseLine at world elevation,
            // resolved thickness from systemType catalogue, etc.) — no re-computation.
            //
            // Anchor: docs/archive/pryzm3-internal/04-PLAN-FORWARD/23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md §P2e-walls
            try {
                const runtimeBus = window.runtime?.bus;
                if (runtimeBus?.registry?.has?.('wall.batch.create') && wallIds.length > 0) {
                    const wallSpecs: Array<{
                        id: string;
                        start: { x: number; z: number };
                        end: { x: number; z: number };
                        levelId: string;
                        height: number;
                        thickness: number;
                        baseOffset?: number;
                        materialColor?: string;
                        materialId?: string;
                        systemTypeId?: string;
                    }> = [];
                    for (const wallId of wallIds) {
                        const wall = context.stores.wallStore.getById(wallId);
                        if (!wall?.baseLine?.[0] || !wall?.baseLine?.[1]) continue;
                        wallSpecs.push({
                            id: wall.id,
                            start: { x: wall.baseLine[0].x, z: wall.baseLine[0].z },
                            end:   { x: wall.baseLine[1].x, z: wall.baseLine[1].z },
                            levelId: wall.levelId,
                            height: wall.height,
                            thickness: wall.thickness,
                            baseOffset: wall.baseOffset,
                            materialColor: wall.materialColor,
                            materialId: wall.materialId,
                            systemTypeId: wall.systemTypeId,
                        });
                    }
                    if (wallSpecs.length > 0) {
                        runtimeBus.executeCommand('wall.batch.create', { walls: wallSpecs });
                        console.log(
                            `[CreateWallsOnAllSlabsCommand] E.5.x P2e-walls: wall.batch.create dispatched — ` +
                            `${wallSpecs.length} wall(s) committed to plugin store`
                        );
                    }
                }
            } catch (busErr) {
                console.warn('[CreateWallsOnAllSlabsCommand] E.5.x P2e-walls bus dispatch failed (non-fatal):', busErr);
            }

            console.log(
                `[CreateWallsOnAllSlabsCommand] COMPLETE total=${(performance.now() - __t_cmd_start).toFixed(1)}ms ` +
                `walls=${wallIds.length} slabs=${slabs.length} ` +
                `affectedLevels=${__affectedLevelIds.length} batched=true`
            );
            return {
                success: true,
                affectedElementIds: wallIds,
                info: [`Created ${wallIds.length} walls across ${slabs.length} slabs`]
            };

        } catch (error) {
            // 🔴 DEFENSIVE ROLLBACK - prevent catastrophic failure
            for (let i = this.subCommands.length - 1; i >= 0; i--) {
                try {
                    this.subCommands[i].undo(context);
                } catch (e) {
                    console.error("Rollback failure in subcommand:", e);
                    // Continue rolling back remaining commands despite error
                }
            }

            this.subCommands = [];
            this.targetIds = [];

            return {
                success: false,
                affectedElementIds: [],
                error: "CreateWallsOnAllSlabsCommand rolled back due to failure"
            };
        }
    }

    undo(context: CommandContext): CommandResult {
        const undoneIds: string[] = [];

        // 🛡️ DEFENSIVE UNDO - protect against subcommand failures
        for (let i = this.subCommands.length - 1; i >= 0; i--) {
            try {
                const result = this.subCommands[i].undo(context);
                if (result?.affectedElementIds) {
                    undoneIds.push(...result.affectedElementIds);
                }
            } catch (e) {
                console.error("Undo failure in subcommand:", e);
                // Continue undoing remaining commands despite error
            }
        }

        // Do NOT clear this.subCommands here (FIX-7 / M5).
        // Preserving the sub-command instances keeps their createdWallIds intact
        // so that a subsequent redo can re-use the same instances with the same
        // deterministic IDs — preventing duplicate walls on redo after undo.
        this.targetIds = [];

        return {
            success: true,
            affectedElementIds: undoneIds
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}