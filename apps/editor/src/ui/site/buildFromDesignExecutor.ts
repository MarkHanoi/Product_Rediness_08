// §BIM-FROM-THE-DESIGN — THE DISPATCH. Turns a `BuildFromDesignPlan` into real BIM elements.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ IT MINTS NO VERB AND NO BUILDER. It dispatches the EXISTING batch commands.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   · `wall.batch.create` — `CreateWallBatchHandler` parses and validates EVERY wall into `fresh[]`
//     BEFORE touching the store, then commits the set through a SINGLE `produceCommand`. So a
//     rejected wall throws with ZERO walls created, and a successful run is ONE undo entry. That
//     atomicity is why the planner had to catch short edges: an all-or-nothing handler with no
//     per-room diagnosis would have failed the founder's whole design over one bad room.
//   · `slab.batch.create` — same shape, one undo entry, its own command.
//   · `ceiling.batch.create` — same shape again, one undo entry.
//
// ⭐ §BUILD-EVERY-STOREY — ALL THREE BATCHES ARE ONE COMMAND EACH, HOWEVER MANY STOREYS.
// Every one of these handlers reads a PER-ENTRY `levelId` and falls back to the batch default
// only when an entry omits it (`CreateWallBatch.ts:132`, `CreateSlabBatch.ts:125`,
// `CreateCeilingBatch.ts:121`). So a five-storey building costs exactly the same THREE undo
// entries a one-storey building costs. ⛔ A LOOP OVER STOREYS WOULD HAVE COST ONE ENTRY PER
// FLOOR FOR NO GEOMETRIC GAIN, and `batchCoordinator.runBatch` would not have helped: it is
// undo-NEUTRAL by its own declaration (`BatchCoordinator.ts:233`) — N commands inside it are
// still N entries (C114 §6a).
//
// ⚠ SO THE HONEST UNDO COUNT IS **THREE**, NOT ONE — and it is COMPUTED, never asserted:
// `plan.undoStepCount` counts the batches this plan actually dispatches, and the panel prints
// that number before the click (C16 §8.6 B-6). There is no verb in this repo that commits walls,
// slabs and ceilings together, and inventing one would be a new command family for a cosmetic
// undo count. Three truthful steps beat one invented verb.
//
// ⛔ WALLS FIRST, AND A FAILED SLAB OR CEILING DOES NOT ROLL THEM BACK. `generateHouseFromBoundary` deletes
// its shell when a later stage fails, and that is right THERE: the shell was drawn only in order
// to ask the user a question, and a shell with no house is debris. Here the walls ARE the
// deliverable — they are the design the founder drew. Deleting them because a floor plate was
// refused would destroy the thing he asked for in order to tidy up the thing he did not. The slab
// failure is REPORTED with the store's own reason instead. (`wall.batch.delete` is also measured
// ABSENT — `ConsequencePreviewService.ts:593` — so a rollback would cost N undo entries anyway.)
//
// ⚠ THE LINK'S RESIDUAL, STATED RATHER THAN HIDDEN. `recordEnvelopeWallLinks` writes into the
// semantic graph, which is NOT an element store and is NOT part of the command's inverse patch.
// `CreateWallBatchHandler` does no graph maintenance, and `WallRebuildCoordinator._flush`'s delete
// leg calls `invalidateRegionConclusionsForDeletedElement` — which purges edges the deleted wall
// is the TARGET of, and ours has the wall as its SOURCE. ⇒ UNDOING THE WALL BATCH LEAVES THE LINK
// ROWS BEHIND, pointing at wall ids no longer in the store. That is why
// `readWallsDerivedFromEnvelope`'s contract requires the consumer to check the wall still exists
// before acting on a row, and why the cascade must never treat a row as proof of a wall.
//
// P6 — every mutation is a bus command. P4 — no `(window as any)`; the runtime arrives as an
// argument and the bus is reached through ONE structural narrowing. P8 — a span per export.

import { trace } from '@opentelemetry/api';
import { createId } from '@pryzm/schemas';
import { semanticGraphManager } from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { BuildFromDesignPlan } from './buildFromDesignPlan';
import {
    pairWallLinkRows,
    recordEnvelopeWallLinks,
    type EnvelopeWallLinkGraph,
    type EnvelopeWallLinkReport,
} from './designEnvelopeWallLink';

const _tracer = trace.getTracer('pryzm.site.buildFromDesignExecutor');

/** The narrow bus surface this module dispatches through. Typed, never `any` (P4). */
export interface BuildFromDesignBus {
    executeCommand?(type: string, payload: unknown): Promise<unknown> | undefined;
}

export interface BuildFromDesignResult {
    readonly ok: boolean;
    /** ⛔ The store's OWN reason, verbatim, on a refusal. Never replaced with a generic sentence. */
    readonly reason?: string;
    readonly wallIds?: readonly string[];
    readonly shellWallCount?: number;
    readonly partitionWallCount?: number;
    readonly slabIds?: readonly string[];
    readonly ceilingIds?: readonly string[];
    /** How many storeys this build put geometry on. */
    readonly storeyCount?: number;
    /** Named, per room, exactly as the plan named them. Repeated here so the post-build report
     *  says the same thing the pre-click sentence said. */
    readonly refusedRoomNames?: readonly string[];
    readonly link?: EnvelopeWallLinkReport | null;
    /** ⚠ Slabs refused AFTER the walls committed. The walls are still on their storeys. */
    readonly slabRefusal?: string | null;
    /** ⚠ Ceilings refused after the walls and slabs committed. Both are kept. */
    readonly ceilingRefusal?: string | null;
}

export interface BuildFromDesignExecutorDeps {
    /** Production: `(rt) => (rt as {bus?}).bus`. Injected so a spec can record the payloads. */
    readonly bus: (rt: PryzmRuntime) => BuildFromDesignBus | null;
    /** Production: `semanticGraphManager`. `null` disables the link leg and SAYS so in the report. */
    readonly graph: () => EnvelopeWallLinkGraph | null;
    /** Production: `createId`. Injected so a spec can assert the id→plan-row pairing. */
    readonly mintId: (prefix: 'wall' | 'slab' | 'ceiling') => string;
}

/** The production wiring. */
export function defaultBuildFromDesignExecutorDeps(): BuildFromDesignExecutorDeps {
    return {
        bus: (rt) => (rt as unknown as { bus?: BuildFromDesignBus } | null)?.bus ?? null,
        graph: () => semanticGraphManager as unknown as EnvelopeWallLinkGraph,
        mintId: (prefix) => createId(prefix),
    };
}

/**
 * Build the plan. Never throws — every failure comes back as `{ ok: false, reason }` carrying the
 * command's own words.
 */
export async function executeBuildFromDesign(
    runtime: PryzmRuntime | null | undefined,
    plan: BuildFromDesignPlan,
    deps: BuildFromDesignExecutorDeps,
): Promise<BuildFromDesignResult> {
    const span = _tracer.startSpan('pryzm.site.executeBuildFromDesign');
    try {
        if (!runtime) {
            return { ok: false, reason: 'PRYZM has no runtime in this session, so no command can be '
                + 'dispatched. Nothing has been created.' };
        }
        const bus = deps.bus(runtime);
        if (!bus?.executeCommand) {
            return { ok: false, reason: 'The command bus is unavailable, so no element can be created. '
                + 'This is a wiring failure, not a finding about your design. Nothing has been created.' };
        }
        // ⛔⛔ §PART-ONLY-BUILDS (L-13256) — "NOTHING TO BUILD" IS NOT THE SAME AS "NO WALLS".
        //
        // FOUNDER: *"create walls on envelope works - but slab doesnt"*. He had already built
        // 70 shell walls and then asked for the plate on its own; this guard refused, because it
        // read an empty WALL list as an empty PLAN. It is not: slabs are cut from the level
        // plate's own ring and ceilings from the room envelopes, and neither reads a wall. A
        // walls-free dispatch is a perfectly well-formed one-batch build.
        //
        // ⭐ THE HONEST TEST IS WHETHER *ANYTHING* WOULD BE DISPATCHED. Refusing on the wall count
        // made "add the plate to what I already built" unreachable by construction — the one thing
        // a user does immediately after the walls land.
        if (plan.walls.length === 0 && plan.slabs.length === 0 && plan.ceilings.length === 0) {
            return { ok: false, reason: 'The plan carries no walls, no floor plates and no '
                + 'ceilings, so there is nothing to build. Nothing has been created.' };
        }

        const wallIds = plan.walls.map(() => deps.mintId('wall'));

        // ── 1. ONE `wall.batch.create` FOR THE SHELL AND THE PARTITIONS TOGETHER ───────────────
        // Shell and partitions in ONE command, deliberately: they are one gesture, and splitting
        // them would make undo take three steps instead of two and would let a partition batch
        // fail over a shell that had already committed.
        try {
            // §PART-ONLY-BUILDS (L-13256) — SKIP the verb entirely when the projection left no
            // walls, rather than dispatching an empty batch. `CreateWallBatchHandler` validates
            // every entry before touching the store; handing it `walls: []` asks it to commit
            // nothing and still spends an undo entry on it, so a plate-only build would cost the
            // user two Ctrl+Z for one gesture. The slab arm below already guards the same way
            // (`const slab = plan.slabs[0]; if (slab) {…}`) — this makes the wall arm its peer.
            if (plan.walls.length > 0) {
                await bus.executeCommand('wall.batch.create', {
                levelId: plan.levelId,
                walls: plan.walls.map((w, i) => ({
                    id: wallIds[i]!,
                    baseLine: [
                        { x: w.a.x, y: 0, z: w.a.z },
                        { x: w.b.x, y: 0, z: w.b.z },
                    ],
                    height: w.heightM,
                    thickness: w.thicknessM,
                    // ⭐ THE WALL'S OWN STOREY. `CreateWallBatchHandler` reads this first and
                    // only falls back to the batch default when an entry omits it, which is
                    // what makes a whole multi-storey shell ONE undo entry.
                    levelId: w.levelId,
                })),
                });
            }
        } catch (e) {
            console.error('[site][build-from-design] wall.batch.create refused:', e);
            return {
                ok: false,
                reason: `The wall batch was refused: ${String(e)}. `
                    + 'The handler validates every wall before it touches the store, so NOTHING was '
                    + 'created — your level is exactly as it was.',
            };
        }

        // ── 2. THE LINK — recorded the moment the ids are real (deliverable 2) ─────────────────
        let link: EnvelopeWallLinkReport | null = null;
        try {
            const graph = deps.graph();
            if (!graph) {
                console.warn('[site][build-from-design] the semantic graph is unavailable — the '
                    + 'envelope→wall link was NOT recorded. These walls will not follow the envelope.');
            } else {
                const paired = pairWallLinkRows(plan.walls, wallIds);
                if (!paired.ok) {
                    console.warn('[site][build-from-design] link refused: ' + paired.reason);
                } else {
                    link = recordEnvelopeWallLinks(graph, paired.rows);
                    console.log(`[site][build-from-design] §BIM-FROM-THE-DESIGN link recorded: `
                        + `${link.wallsLinked}/${plan.walls.length} wall(s), ${link.edgesWritten} graph edge(s)`
                        + (link.unlinked.length > 0
                            ? `; ${link.unlinked.length} NOT linked — ` + link.unlinked.map(
                                (u) => `${u.wallId}: ${u.reason}`).join(' · ')
                            : ''));
                }
            }
        } catch (e) {
            // ⛔ NON-FATAL AND REPORTED. Graph maintenance must never undo real geometry — but a
            // link that silently did not happen is a cascade that silently will not fire.
            console.warn('[site][build-from-design] recording the envelope→wall link failed '
                + '(non-fatal; the walls exist, but they will NOT follow the envelope):', e);
        }

        // ── 3. THE FLOOR PLATES — ONE COMMAND FOR EVERY STOREY ────────────────────────────────
        // A failure here keeps the walls: they ARE the design the founder drew, and deleting them
        // to tidy up a floor plate he did not ask about would destroy the thing he did ask for.
        let slabIds: string[] = [];
        let slabRefusal: string | null = null;
        if (plan.slabs.length > 0) {
            const ids = plan.slabs.map(() => deps.mintId('slab'));
            try {
                await bus.executeCommand('slab.batch.create', {
                    levelId: plan.levelId,
                    slabs: plan.slabs.map((s, i) => ({
                        id: ids[i]!,
                        // ⭐ PER-SLAB STOREY — one plate per floor, all in one undo entry.
                        levelId: s.levelId,
                        thickness: s.thicknessM,
                        baseOffset: s.baseOffsetM,
                        boundary: s.boundary.map((p) => ({ x: p.x, y: 0, z: p.z })),
                    })),
                });
                slabIds = ids;
            } catch (e) {
                slabRefusal = String(e);
                console.warn('[site][build-from-design] slab.batch.create refused — the walls stay:', e);
            }
        }

        // ── 4. THE CEILINGS — ONE COMMAND FOR EVERY ROOM ON EVERY STOREY ──────────────────────
        // ⛔ NOT ROOM-RECORD DRIVEN, and that is the whole reason this leg can exist at all. The
        // resi pipeline's `CeilingLayoutExecutor` reads the room store because it runs AFTER a
        // detect pass. Here the room the user DREW is the boundary, so no room record is needed
        // and none is pre-empted.
        let ceilingIds: string[] = [];
        let ceilingRefusal: string | null = null;
        if (plan.ceilings.length > 0) {
            const ids = plan.ceilings.map(() => deps.mintId('ceiling'));
            try {
                await bus.executeCommand('ceiling.batch.create', {
                    levelId: plan.levelId,
                    ceilings: plan.ceilings.map((c, i) => ({
                        id: ids[i]!,
                        levelId: c.levelId,
                        ceilingHeight: c.ceilingHeightM,
                        thickness: c.thicknessM,
                        boundary: c.boundary.map((p) => ({ x: p.x, y: 0, z: p.z })),
                    })),
                });
                ceilingIds = ids;
            } catch (e) {
                ceilingRefusal = String(e);
                console.warn('[site][build-from-design] ceiling.batch.create refused — the walls and '
                    + 'slabs stay:', e);
            }
        }

        span.setAttribute('pryzm.buildFromDesign.walls', wallIds.length);
        span.setAttribute('pryzm.buildFromDesign.storeys', plan.storeyCount);
        span.setAttribute('pryzm.buildFromDesign.slabs', slabIds.length);
        span.setAttribute('pryzm.buildFromDesign.ceilings', ceilingIds.length);
        return {
            ok: true,
            wallIds,
            shellWallCount: plan.shellWallCount,
            partitionWallCount: plan.partitionWallCount,
            storeyCount: plan.storeyCount,
            slabIds,
            ceilingIds,
            slabRefusal,
            ceilingRefusal,
            refusedRoomNames: plan.refusedRooms.map((r) => r.name),
            link,
        };
    } catch (e) {
        console.error('[site][build-from-design] threw:', e);
        return {
            ok: false,
            reason: `Building from your design threw: ${String(e)}. PRYZM cannot say how much was `
                + 'created — check the model before running it again.',
        };
    } finally {
        span.end();
    }
}
