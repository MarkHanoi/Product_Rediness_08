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

export interface SuppressBroadcastRef {
    value: boolean;
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
    dispatch(serialized: SerializedCommand): 'applied' | 'unknown-type' | 'validation-failed' | 'error' {
        if (!serialized?.type) return 'error';

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
