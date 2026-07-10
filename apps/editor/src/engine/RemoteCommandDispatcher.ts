/**
 * @file RemoteCommandDispatcher.ts
 * @migration S89-WIRE (2026-05-01) — moved from `src/collaboration/RemoteCommandDispatcher.ts`
 *   to `src/engine/subsystems/RemoteCommandDispatcher.ts`.
 *
 *   Layer rationale: this file is consumed exclusively by `initCollaboration.ts`
 *   (the engine-subsystem that wires the Socket.io client).  Both files depend on
 *   `src/commands/` (L7 content), so they belong together in `src/engine/subsystems/`
 *   rather than in `packages/sync-client/` (L3 pure, no command-bus access).
 *
 *   The `src/collaboration/` directory is deleted by this migration.  The sole
 *   structural importer (`src/engine/subsystems/initCollaboration.ts` line 49) has
 *   been updated: `'../../collaboration/RemoteCommandDispatcher'` → `'./RemoteCommandDispatcher'`.
 *   Import of `CommandRegistry` (sibling in same dir) remains `'./CommandRegistry'`.
 *   Cross-imports corrected to relative `'./commands'` barrel.
 *
 * RemoteCommandDispatcher
 *
 * Receives a serialized command broadcast from a remote collaborator and
 * replays it through the local CommandManager so the local model stays in sync.
 *
 * Echo-loop prevention:
 *   The dispatcher sets `suppressBroadcastRef.value = true` around each
 *   execute() call.  initCollaboration.ts checks this ref before re-emitting
 *   any command-executed socket event, ensuring remote commands are never
 *   re-broadcast back to the server.
 *
 * Conflict strategy:
 *   Last-write-wins, ordered by server receipt time.  This matches Revit
 *   worksharing semantics and is appropriate for non-overlapping BIM workflows.
 *   canExecute() validation in each command guards against impossible state
 *   (e.g. two users concurrently adding the same element ID).
 *
 * Contracts:
 *   §30-REAL-TIME-COLLABORATION §3.2 — all remote commands go through
 *     CommandManager.execute(); direct store mutation is forbidden.
 *   §01-BIM-ENGINE-CORE §2.1 — store mutations only through commands.
 */

import { CommandRegistry } from './CommandRegistry';
import type { CommandManager } from '@pryzm/command-registry';
import type { SerializedCommand } from '@pryzm/command-registry';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

export interface SuppressBroadcastRef {
    value: boolean;
}

/**
 * §DUPLICATE-ROOMS-PERSIST (2026-06-26) — true iff `serialized` is a creation
 * command whose targets are ALREADY in the element registry, so re-applying it
 * would double-create.
 *
 * WHY: collab catch-up (`replayCatchUp`) and reconnect re-send the full command
 * log. When a project is opened, its elements are hydrated into the registry
 * BEFORE replay catches up, so the replay re-executes the SAME `CREATE_*`
 * commands for ids that already exist. Two failure modes were observed:
 *   1. Duplicate ROOMS — `CreateRoomCommand.execute` does `roomStore.add()`
 *      (creating a 2nd room object for the space) and only THEN hits the throwing
 *      `registerSemantic`, which is swallowed → the duplicate room persists and
 *      shows as a generic "Room NN" twin alongside the named graph room.
 *   2. FATAL "ID already exists in ElementRegistry" — stairs/lifts whose create
 *      path registers semantics via the THROWING variant froze the whole load.
 *
 * Skipping a create whose every target id is already registered makes replay
 * IDEMPOTENT (Invariant E-2 reinforced): an already-applied create is a no-op,
 * not a double-apply or a FATAL. Conservative by design — we only skip when
 * `targetIds` is non-empty AND every id is registered, so a partially-applied
 * batch (some ids missing) still replays to fill the gap, and derived/bulk
 * creates that don't predeclare their ids (empty `targetIds`) are never skipped.
 */
export function isAlreadyAppliedCreate(serialized: SerializedCommand): boolean {
    const type = String(serialized.type ?? '');

    // ── Legacy CommandManager creates (CREATE_WALL, BATCH_CREATE_ROOMS, …) ────
    // Historic behaviour, preserved BYTE-FOR-BYTE: the id lives in `targetIds`.
    const isLegacyCreate = type.startsWith('CREATE_') || type.startsWith('BATCH_CREATE_');

    // ── §FIX-CATCHUP-DUPLICATE-CREATE (L-18) — dotted-bus create family ───────
    // Bus commands are lowercase-dotted (`furniture.create`, `lighting.create`,
    // `wall.batch.create`, …) so they fall through the CREATE_* / BATCH_CREATE_*
    // gate above. `endsWith('.create')` covers BOTH the single and the
    // `*.batch.create` forms (both end in `.create`). Their element id lives in
    // the PAYLOAD (`payload.id`, or per-entry `id` inside a batch array such as
    // `payload.furniture[]` / `payload.walls[]`), not in `targetIds`. Without
    // this branch a replayed dotted-bus create was NEVER recognised as
    // already-applied, so collab catch-up double-created the element (the
    // "duplicate sofa underneath" for furniture). Explicitly exclude other
    // `*.createXxx` verbs (e.g. `wall.createOpening`, `plumbing.createFixture`)
    // which are not element-minting creates keyed by a single element id.
    const isBusCreate = type.endsWith('.create');

    if (!isLegacyCreate && !isBusCreate) return false;

    const ids = isLegacyCreate
        ? (Array.isArray(serialized.targetIds) ? serialized.targetIds.map(String) : [])
        : collectBusCreateTargetIds(serialized);

    if (ids.length === 0) return false;
    // Conservative by design: skip ONLY when EVERY extracted id is already in the
    // registry (⇒ this create was already applied). A partially-applied batch
    // (some ids missing) still replays to fill the gap; a create whose ids cannot
    // be extracted (empty set) is never skipped.
    return ids.every((id) => elementRegistry.getStoreType(String(id)) !== undefined);
}

/**
 * §FIX-CATCHUP-DUPLICATE-CREATE — extract the element ids a dotted-bus create
 * command declares. Bus payloads carry ids inline rather than in `targetIds`:
 *   • single create  → `payload.id`
 *   • batch create   → per-entry `id` inside each top-level ARRAY field
 *                       (`payload.furniture[]`, `payload.walls[]`, `payload.slabs[]`, …)
 * `targetIds` is also unioned in for the rare bus command that populates it, so
 * this is a superset of — never a regression on — the legacy id source.
 */
function collectBusCreateTargetIds(serialized: SerializedCommand): string[] {
    const ids = new Set<string>();

    const t = (serialized as { targetIds?: unknown }).targetIds;
    if (Array.isArray(t)) for (const id of t) if (id != null) ids.add(String(id));

    const payload = (serialized as { payload?: unknown }).payload;
    if (payload && typeof payload === 'object') {
        const p = payload as Record<string, unknown>;
        if (typeof p.id === 'string' && p.id) ids.add(p.id);
        // Batch payloads: any top-level array of element records keyed by `id`.
        for (const value of Object.values(p)) {
            if (!Array.isArray(value)) continue;
            for (const entry of value) {
                const eid = (entry as { id?: unknown } | null)?.id;
                if (typeof eid === 'string' && eid) ids.add(eid);
            }
        }
    }

    return [...ids];
}

export class RemoteCommandDispatcher {
    private readonly suppressRef: SuppressBroadcastRef;

    private readonly commandManager: CommandManager;

    constructor(
        commandManager: CommandManager,
        suppressBroadcastRef: SuppressBroadcastRef,
    ) {
        this.commandManager = commandManager;
        this.suppressRef = suppressBroadcastRef;
    }

    /**
     * Attempt to apply a single remote serialized command locally.
     *
     * @returns 'applied' | 'unknown-type' | 'validation-failed' | 'error'
     */
    dispatch(serialized: SerializedCommand): 'applied' | 'unknown-type' | 'validation-failed' | 'error' | 'skipped-duplicate' {
        if (!serialized?.type) return 'error';

        // §DUPLICATE-ROOMS-PERSIST — make replay/catch-up idempotent: a CREATE
        // command whose targets are all already registered was already applied
        // (hydration before catch-up, or a re-sent log). Re-executing it would
        // double-create a room (duplicate "Room NN" twin) or FATAL on the
        // throwing registerSemantic (stair/lift). Skip it BEFORE reconstructing
        // or executing the command, so neither side effect can happen.
        if (isAlreadyAppliedCreate(serialized)) {
            console.info(
                '[RemoteCommandDispatcher] §DUPLICATE-ROOMS-PERSIST — skipping already-applied create:',
                serialized.type,
                serialized.targetIds,
            );
            return 'skipped-duplicate';
        }

        const command = CommandRegistry.create(serialized);

        if (!command) {
            console.info(
                '[RemoteCommandDispatcher] No factory for type:',
                serialized.type,
                '— toast-only',
            );
            return 'unknown-type';
        }

        // Suppress re-broadcast during this execute() call
        this.suppressRef.value = true;
        try {
            // §Wave36-U3 dual-write interim state (doc-36 §4.3):
            //
            // Phase E.5.x bridged 117/120 sites to bus handlers.  The remaining
            // ~221 command families (OI-023) do not yet have bus handlers, so
            // `commandManager.execute()` remains the authoritative replay path.
            //
            // The bus dispatch below is fire-and-forget: it wires OTel spans and
            // ring-buffer entries for families that DO have handlers, without
            // blocking the authoritative synchronous path.  Families without handlers
            // cause a rejected promise that is silently discarded (not an error —
            // the authoritative result comes from commandManager below).
            //
            // Migration path: as each remote command family gains a bus handler,
            // it can be removed from the commandManager fallback.  When ALL families
            // are covered, the commandManager.execute() line below can be removed
            // and bus.dispatch() made the sole authoritative path.
            if (window.runtime?.bus) {
                const busPayload = (command as unknown as { payload: unknown }).payload;
                window.runtime.bus.dispatch(
                    (command as { type: string }).type,
                    busPayload,
                    { source: 'REMOTE' },
                ).catch(() => {
                    // §REMOTE-EXEC-FALLBACK (founder 2026-06-19) — this family has no
                    // CommandType-keyed bus handler, so the bus dispatch rejected. The
                    // OLD code (F-1.4) silently dropped it here ("~221 families no-op on
                    // remote replay"), so any element whose move/rotate/delete command
                    // lacked a bus handler REVERTED on every catch-up (the founder's
                    // "sofa rotates back to origin"). Since we ALREADY hold the typed
                    // command reconstructed by CommandRegistry, execute it directly
                    // through the authoritative command path — contract-compliant
                    // (§01 §2.1 store mutations only through commands) and gives undo/redo.
                    // suppressRef stays true for the whole replay so this never re-broadcasts.
                    try {
                        this.suppressRef.value = true;
                        this.commandManager.execute(command);
                    } catch (e) {
                        console.warn('[RemoteCommandDispatcher] §REMOTE-EXEC-FALLBACK failed:', serialized.type, e);
                    } finally {
                        this.suppressRef.value = false;
                    }
                });
            }
            console.log('[RemoteCommandDispatcher] Applied remote command:', serialized.type);
            return 'applied';
        } catch (err) {
            console.error('[RemoteCommandDispatcher] Unexpected error applying:', serialized.type, err);
            return 'error';
        } finally {
            this.suppressRef.value = false;
        }
    }

    /**
     * §E.2 — Collaboration correctness contract for catch-up replay.
     *
     * **Invariant E-1 (seqNo ordering)**:
     * Catch-up commands MUST be applied in ascending `seqNo` order regardless
     * of the order they arrive from the server.  Out-of-order application
     * would produce a final document state that differs from the server's
     * canonical CRDT state, causing permanent divergence between clients.
     *
     * **Enforcement**: `replayCatchUp()` sorts by `(s as any).seqNo ?? 0`
     * before iterating so that missing `seqNo` fields (legacy commands) sort
     * to the front rather than breaking the invariant silently.
     *
     * **Invariant E-2 (local-user filter)**:
     * Commands emitted by the local user are filtered out via `filterOutUserId`
     * because they were already applied optimistically.  Replaying them would
     * produce a double-apply.  The Yjs CRDT layer is idempotent for most ops
     * but PRYZM native commands (WallStore, CurtainWallStore …) are NOT — a
     * second apply would create a duplicate element.
     *
     * **Invariant E-3 (resilient skip)**:
     * Unknown or failing commands are skipped (not thrown) so a single corrupt
     * catch-up message cannot stall the entire replay queue.  The `skipped`
     * count in the return value is surfaced in the §E.1 log for diagnosis.
     *
     * @returns `{ applied, skipped }` — counts for diagnostics.
     */
    replayCatchUp(
        commands: SerializedCommand[],
        filterOutUserId?: string,
    ): { applied: number; skipped: number } {
        let applied = 0;
        let skipped = 0;

        // §E.1 — Sort ascending by seqNo before applying.  Commands without
        // a seqNo field (legacy) sort to the front (seqNo treated as 0) so
        // they never cause later commands to be applied out of order.
        const ordered = [...commands].sort(
            (a, b) => ((a as any).seqNo ?? 0) - ((b as any).seqNo ?? 0),
        );

        for (const s of ordered) {
            // Skip commands from the local user — already applied locally
            if (filterOutUserId && (s as any).userId === filterOutUserId) {
                skipped++;
                continue;
            }

            const outcome = this.dispatch(s);
            if (outcome === 'applied') {
                applied++;
            } else {
                skipped++;
            }
        }

        console.log(
            `[RemoteCommandDispatcher] Catch-up complete: ${applied} applied, ${skipped} skipped`,
        );
        return { applied, skipped };
    }
}
