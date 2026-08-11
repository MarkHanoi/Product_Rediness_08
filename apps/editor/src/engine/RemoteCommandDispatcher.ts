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
 * §FIX-REPLAY-AT-MOST-ONCE (L-814) — provenance a delivered command carries.
 *
 * ROOT CAUSE this closes: `replayCatchUp` documented "Invariant E-2 (local-user
 * filter)" since Phase E.2 but `initCollaboration._triggerCatchUp` called it with
 * **no `filterOutUserId`**, and `GET /api/projects/:id/commands` returns every
 * row in the window including the caller's own. So on any reconnect — and the
 * BFCache/`transport close` cycle produces one whenever a tab sleeps and wakes —
 * the client re-requested and RE-EXECUTED its own already-applied edits. Commands
 * with an accidental duplicate guard (`ADD_OPENING` → WallOccupancyStore,
 * `CREATE_ANNOTATION` → "already exists") refused loudly; commands with none
 * (`UPDATE_ELEMENT_PARAMETER` rake, `UPDATE_WALL_SYSTEM_TYPE`,
 * `UPDATE_DOOR_SYSTEM_TYPE`) silently RE-APPLIED, which is the founder's
 * "walls spontaneously go raked / change type while I'm not touching it".
 *
 * The fix is provenance, not heuristics: every delivered command declares WHO
 * produced it and WHICH log row it is, and the dispatcher applies it at most once.
 */
export interface RemoteCommandMeta {
    /** `project_command_log.id` — the server-assigned identity of this delivery. */
    commandLogId?: string | undefined;
    /** The user whose client produced the command. */
    originUserId?: string | undefined;
}

/**
 * §FIX-REPLAY-AT-MOST-ONCE (L-814) — bounded at-most-once ledger of applied
 * command-log ids, per project.
 *
 * Persisted in `sessionStorage` so it survives a BFCache restore (the tab is
 * frozen, not torn down — the socket dies, sessionStorage does not), which is
 * exactly the reconnect that used to replay the window. Bounded to
 * {@link LEDGER_MAX} ids in insertion order so a long editing session cannot
 * grow it without limit; eviction is oldest-first, and an evicted id can only
 * ever be re-requested from a window the server has already retention-purged.
 */
const LEDGER_MAX = 2_000;

export class AppliedCommandLedger {
    private readonly storageKey: string;

    private ids: string[] = [];

    private index = new Set<string>();

    constructor(projectId: string) {
        this.storageKey = `pryzm:appliedCommands:${projectId}`;
        try {
            const raw = globalThis.sessionStorage?.getItem(this.storageKey);
            if (raw) {
                const parsed = JSON.parse(raw) as unknown;
                if (Array.isArray(parsed)) {
                    this.ids = parsed.filter((v): v is string => typeof v === 'string');
                    this.index = new Set(this.ids);
                }
            }
        } catch {
            /* corrupt or unavailable storage — start empty, never throw at construction */
        }
    }

    has(commandLogId: string): boolean {
        return this.index.has(commandLogId);
    }

    /** @returns true when this id was newly recorded, false when it was already present. */
    record(commandLogId: string): boolean {
        if (this.index.has(commandLogId)) return false;
        this.index.add(commandLogId);
        this.ids.push(commandLogId);
        if (this.ids.length > LEDGER_MAX) {
            const evicted = this.ids.splice(0, this.ids.length - LEDGER_MAX);
            for (const id of evicted) this.index.delete(id);
        }
        this.persist();
        return true;
    }

    get size(): number {
        return this.ids.length;
    }

    private persist(): void {
        try {
            globalThis.sessionStorage?.setItem(this.storageKey, JSON.stringify(this.ids));
        } catch {
            /* quota or unavailable storage — the in-memory ledger still guards this session */
        }
    }
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

export type DispatchOutcome =
    | 'applied'
    | 'unknown-type'
    | 'validation-failed'
    | 'error'
    | 'skipped-duplicate'
    | 'skipped-own-origin'
    | 'skipped-already-delivered';

export class RemoteCommandDispatcher {
    private readonly suppressRef: SuppressBroadcastRef;

    private readonly commandManager: CommandManager;

    /**
     * §FIX-REPLAY-AT-MOST-ONCE (L-814) — at-most-once ledger. Null when no project
     * is bound yet; {@link bindProject} installs one per project room.
     */
    private ledger: AppliedCommandLedger | null = null;

    /**
     * §FIX-REPLAY-AT-MOST-ONCE (L-814) — the local user id. A command whose
     * `originUserId` equals this NEVER executes: it was already applied
     * optimistically by the client that produced it (Invariant E-2).
     */
    private localUserId: string | null = null;

    /** §CONTEXT-DATA-HONESTY — duplicates are counted, not shouted. */
    private quietSkipCount = 0;

    constructor(
        commandManager: CommandManager,
        suppressBroadcastRef: SuppressBroadcastRef,
    ) {
        this.commandManager = commandManager;
        this.suppressRef = suppressBroadcastRef;
    }

    /**
     * §FIX-REPLAY-AT-MOST-ONCE (L-814) — bind the dispatcher to a project room and
     * the local identity. Called on `pryzm-project-loaded` and on every reconnect;
     * re-binding the SAME project keeps the existing ledger (a reconnect must not
     * forget what it has already applied — that forgetting is the bug), while
     * switching projects installs a fresh one.
     */
    bindProject(projectId: string, localUserId: string | null): void {
        this.localUserId = localUserId;
        if (!this.ledger || this.ledgerProjectId !== projectId) {
            this.ledger = new AppliedCommandLedger(projectId);
            this.ledgerProjectId = projectId;
        }
    }

    private ledgerProjectId: string | null = null;

    /** Test/diagnostic accessor — how many deliveries were quietly refused as duplicates. */
    get quietlySkipped(): number {
        return this.quietSkipCount;
    }

    /**
     * Attempt to apply a single remote serialized command locally.
     *
     * §FIX-REPLAY-AT-MOST-ONCE (L-814) — `meta` carries delivery provenance. A
     * delivery is executed only if it is (a) not ours and (b) not already applied.
     */
    dispatch(serialized: SerializedCommand, meta?: RemoteCommandMeta): DispatchOutcome {
        if (!serialized?.type) return 'error';

        // ── §FIX-REPLAY-AT-MOST-ONCE (L-814) — gate 1: own-origin echo ───────────
        // Invariant E-2 made real. Our own commands were applied optimistically the
        // moment the user made the edit; re-executing them re-applies the OLD value
        // over whatever the user changed it to since — the founder's walls "going
        // raked" are his own earlier rake edits coming back.
        const originUserId = meta?.originUserId ?? (serialized as { userId?: string }).userId;
        if (originUserId && this.localUserId && originUserId === this.localUserId) {
            this.quietSkipCount++;
            return 'skipped-own-origin';
        }

        // ── §FIX-REPLAY-AT-MOST-ONCE (L-814) — gate 2: at-most-once per delivery ──
        // The same log row can arrive twice: once live over the socket and again in
        // the catch-up window after a reconnect whose baseline predates it. Applying
        // it twice is a double-apply for every non-idempotent command family.
        const commandLogId = meta?.commandLogId ?? (serialized as { commandLogId?: string }).commandLogId;
        if (commandLogId && this.ledger?.has(commandLogId)) {
            this.quietSkipCount++;
            return 'skipped-already-delivered';
        }

        // §DUPLICATE-ROOMS-PERSIST — make replay/catch-up idempotent: a CREATE
        // command whose targets are all already registered was already applied
        // (hydration before catch-up, or a re-sent log). Re-executing it would
        // double-create a room (duplicate "Room NN" twin) or FATAL on the
        // throwing registerSemantic (stair/lift). Skip it BEFORE reconstructing
        // or executing the command, so neither side effect can happen.
        if (isAlreadyAppliedCreate(serialized)) {
            // §CONTEXT-DATA-HONESTY — a refused duplicate is an expected, harmless
            // outcome of at-least-once delivery, not an incident. Record it so the
            // delivery is never retried, count it, and say nothing scary.
            if (commandLogId) this.ledger?.record(commandLogId);
            this.quietSkipCount++;
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

        // §FIX-REPLAY-AT-MOST-ONCE (L-814) — record the delivery BEFORE executing,
        // not after. AT-MOST-once is the correct guarantee for a mutation: a delivery
        // whose execution throws must not be retried on the next reconnect (that
        // retry is precisely how a single bad command became a recurring, unattended
        // mutation of the founder's model). The authoritative state of record is the
        // server snapshot, not this replay.
        if (commandLogId) this.ledger?.record(commandLogId);

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
     * Commands emitted by the local user are filtered out because they were
     * already applied optimistically.  Replaying them would produce a
     * double-apply.  The Yjs CRDT layer is idempotent for most ops but PRYZM
     * native commands (WallStore, CurtainWallStore …) are NOT — a second apply
     * would create a duplicate element.
     *
     * **§FIX-REPLAY-AT-MOST-ONCE (L-814) — E-2 was documented but NOT ENFORCED.**
     * `filterOutUserId` was optional and the sole production caller
     * (`initCollaboration._triggerCatchUp`) omitted it, so every reconnect replayed
     * the local user's OWN commands back over their live edits. E-2 is now enforced
     * inside {@link dispatch} against `localUserId` bound by {@link bindProject},
     * so it holds for BOTH replay and live delivery and cannot be lost again by a
     * caller forgetting an optional argument. `filterOutUserId` remains as an
     * explicit override for tests and for callers with a non-default identity.
     *
     * **Invariant E-4 (at-most-once delivery)**:
     * A command-log row is executed at most once per client, tracked by
     * `commandLogId` in {@link AppliedCommandLedger}.  At-least-once delivery is
     * inherent to socket + catch-up (a row can arrive live AND in a later window);
     * the ledger converts it to exactly-once-or-less.
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
            // Skip commands from the local user — already applied locally.
            // §FIX-REPLAY-AT-MOST-ONCE: this explicit filter is now a redundant
            // second line of defence; `dispatch` enforces E-2 unconditionally.
            if (filterOutUserId && (s as any).userId === filterOutUserId) {
                skipped++;
                continue;
            }

            const outcome = this.dispatch(s, {
                commandLogId: (s as { commandLogId?: string }).commandLogId,
                originUserId: (s as { userId?: string }).userId,
            });
            if (outcome === 'applied') {
                applied++;
            } else {
                skipped++;
            }
        }

        // §CONTEXT-DATA-HONESTY — one quiet summary line, not one scary line per
        // refused duplicate. `skipped` here is the NORMAL steady state after a
        // reconnect: everything in the window was already applied.
        console.log(
            `[RemoteCommandDispatcher] Catch-up complete: ${applied} applied, ${skipped} skipped ` +
            `(quiet duplicate/own-origin refusals so far: ${this.quietSkipCount})`,
        );
        return { applied, skipped };
    }
}
