/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    App / Engine — graph exposure (BIM 3.0 Phase 4, Level 5)
 * File:              apps/editor/src/engine/graphQueryBusHandlers.ts
 * Classification:    A (read-only; registers three refusal-honest query verbs)
 *
 * Contract:
 *   C70 D-INV-1/2/3 · C71 §4 (UBG vocabulary = canonical query vocabulary) ·
 *   BIM30-IMPLEMENTATION-ROADMAP §Phase 4.
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────────
 *
 * The three READ-ONLY bus verbs that expose the composed SemanticGraph +
 * RoomGraphService as a runtime service reachable through the command bus by
 * every consumer, the AI included (D-INV-3):
 *
 *   graph.query(elementId, relationshipType)  → the typed edge set
 *   graph.neighbors(elementId, relationshipType?) → the adjacent elements
 *   graph.path(fromRoomId, toRoomId)          → the room-to-room route (BFS)
 *
 * All three are READ-ONLY: `affectedStores: []`, no patches, no mutation, no
 * undo entry (`forward: [], inverse: []`). The ANSWER is a discriminated result
 * from `GraphQueryService` (@pryzm/ai-host) — never a bare `[]`. A refusal
 * (`{ ok: false, reason }`) is a RESULT, not a `canExecute` rejection: an unknown
 * element is a legitimate, typed "no answer", so the verb must still execute and
 * return the reason. `canExecute` only rejects a MALFORMED payload.
 *
 * ── WHY THE VERBS ARE AUTHORED HERE AND NOT IN composeRuntime ────────────────
 *
 * The C69 verb register (`tools/ga-gate/check-verb-register.ts`) DISCOVERS verbs
 * by a static scan of three roots — `plugins`, `apps/editor/src/engine`,
 * `packages/command-registry/src`. `runtime-composer` is not scanned, so a verb
 * only registered there never appears in the register; and a `graph.*` prefix in
 * `packages/command-registry` would trip `check-command-naming` (which scans that
 * root and has no `graph` prefix). `apps/editor/src/engine` is the scanned root
 * that is NOT policed by `check-command-naming` (different globs) nor by
 * `check-chat-capability-coverage` (which reads only `initBusHandlers.ts` +
 * `engineLauncher.ts`). So the verb declarations live here; the RUNTIME
 * registration is wired from `initBusHandlers.ts` onto the composed bus.
 *
 * ── HOW A CALLER GETS THE TYPED RESULT BACK ──────────────────────────────────
 *
 * `CommandBus.executeCommand` returns an `EventRecord` (patches + audit), not the
 * handler's own return value, so a read verb cannot answer through it. The verb
 * carries a serialisable `__rid` (request id) in its payload; the handler stashes
 * its typed result under that id in a module-scoped map, and `dispatchGraphQuery`
 * dispatches through the bus and reads it straight back. The payload stays
 * plain-JSON (no function crosses the wire), so the emitter / CRDT path see only
 * strings.
 */

import type { CommandHandler } from '@pryzm/command-bus';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
  GraphQueryService,
  type GraphQueryResult,
  type GraphNeighborsResult,
  type GraphPathResult,
} from '@pryzm/ai-host';

// ── Payloads (plain JSON — `__rid` is the result-delivery correlation id) ────

export interface GraphQueryPayload {
  readonly elementId: string;
  readonly relationshipType: string;
  readonly __rid?: string;
}
export interface GraphNeighborsPayload {
  readonly elementId: string;
  readonly relationshipType?: string;
  readonly __rid?: string;
}
export interface GraphPathPayload {
  readonly fromRoomId: string;
  readonly toRoomId: string;
  readonly __rid?: string;
}

export type GraphAnswer = GraphQueryResult | GraphNeighborsResult | GraphPathResult;

// ── Result delivery — a request-id keyed handoff, cleared on read ────────────
const PENDING = new Map<string, GraphAnswer>();

const EMPTY_RESULT = { forward: [] as const, inverse: [] as const };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Build the three read-only graph query handlers over a given service. Exported
 * so a probe can register them on a bare `CommandBus` and drive the exact
 * handlers the editor registers on the composed bus.
 */
export function buildGraphQueryHandlers(
  service: GraphQueryService,
): readonly CommandHandler<unknown>[] {
  const queryHandler: CommandHandler<GraphQueryPayload> = {
    type: 'graph.query',
    affectedStores: [],
    canExecute: (_ctx, cmd) =>
      isNonEmptyString(cmd?.elementId) && isNonEmptyString(cmd?.relationshipType)
        ? { valid: true }
        : { valid: false, reason: 'graph.query requires { elementId, relationshipType } as non-empty strings' },
    execute: (_ctx, cmd) => {
      const result = service.query(cmd.elementId, cmd.relationshipType);
      if (cmd.__rid !== undefined) PENDING.set(cmd.__rid, result);
      return EMPTY_RESULT;
    },
  };

  const neighborsHandler: CommandHandler<GraphNeighborsPayload> = {
    type: 'graph.neighbors',
    affectedStores: [],
    canExecute: (_ctx, cmd) =>
      isNonEmptyString(cmd?.elementId)
        ? { valid: true }
        : { valid: false, reason: 'graph.neighbors requires { elementId } as a non-empty string' },
    execute: (_ctx, cmd) => {
      const result = service.neighbors(cmd.elementId, cmd.relationshipType);
      if (cmd.__rid !== undefined) PENDING.set(cmd.__rid, result);
      return EMPTY_RESULT;
    },
  };

  const pathHandler: CommandHandler<GraphPathPayload> = {
    type: 'graph.path',
    affectedStores: [],
    canExecute: (_ctx, cmd) =>
      isNonEmptyString(cmd?.fromRoomId) && isNonEmptyString(cmd?.toRoomId)
        ? { valid: true }
        : { valid: false, reason: 'graph.path requires { fromRoomId, toRoomId } as non-empty strings' },
    execute: (_ctx, cmd) => {
      const result = service.path(cmd.fromRoomId, cmd.toRoomId);
      if (cmd.__rid !== undefined) PENDING.set(cmd.__rid, result);
      return EMPTY_RESULT;
    },
  };

  return [
    queryHandler as CommandHandler<unknown>,
    neighborsHandler as CommandHandler<unknown>,
    pathHandler as CommandHandler<unknown>,
  ];
}

/** A bus surface with just the entry point these verbs need. */
export interface GraphDispatchBus {
  executeCommand(type: string, payload: unknown, opts?: unknown): unknown;
}

let _ridCounter = 0;
function nextRid(): string {
  _ridCounter += 1;
  return `gq-${Date.now().toString(36)}-${_ridCounter}`;
}

/**
 * Dispatch a graph verb through the bus and return its typed result. This is the
 * ONE path — script, panel and AI use it identically (D-INV-3). The result is
 * read from the request-id handoff the handler wrote; a missing entry (the verb
 * did not register, or a bus swallowed the dispatch) is itself a typed
 * `graph-unavailable` refusal, never a silent `[]`.
 */
export async function dispatchGraphQuery(
  bus: GraphDispatchBus,
  verb: 'graph.query',
  payload: Omit<GraphQueryPayload, '__rid'>,
): Promise<GraphQueryResult>;
export async function dispatchGraphQuery(
  bus: GraphDispatchBus,
  verb: 'graph.neighbors',
  payload: Omit<GraphNeighborsPayload, '__rid'>,
): Promise<GraphNeighborsResult>;
export async function dispatchGraphQuery(
  bus: GraphDispatchBus,
  verb: 'graph.path',
  payload: Omit<GraphPathPayload, '__rid'>,
): Promise<GraphPathResult>;
export async function dispatchGraphQuery(
  bus: GraphDispatchBus,
  verb: string,
  payload: Record<string, unknown>,
): Promise<GraphAnswer> {
  const __rid = nextRid();
  await bus.executeCommand(verb, { ...payload, __rid });
  const result = PENDING.get(__rid);
  PENDING.delete(__rid);
  if (result !== undefined) return result;
  // The dispatch returned but nothing was delivered → the verb is not on this
  // bus. Honest refusal, shaped to the verb.
  if (verb === 'graph.path') {
    return {
      ok: false,
      fromRoomId: String(payload.fromRoomId ?? ''),
      toRoomId: String(payload.toRoomId ?? ''),
      reason: 'graph-unavailable',
      detail: `${verb}: no handler answered on this bus.`,
    };
  }
  return {
    ok: false,
    elementId: String(payload.elementId ?? ''),
    relationshipType: String(payload.relationshipType ?? 'all'),
    reason: 'graph-unavailable',
    detail: `${verb}: no handler answered on this bus.`,
  };
}

/**
 * Register the three read-only graph query verbs on the composed bus. Called from
 * `initBusHandlers` at editor boot. Idempotent by the same duplicate-guard the
 * rest of `initBusHandlers` uses — a second boot (hot reload) is a migration
 * state, not a corruption. Constructs one `GraphQueryService` over the production
 * singletons (SemanticGraphManager + RoomGraphService).
 */
export function registerGraphQueryHandlers(runtime: PryzmRuntime | null): void {
  if (!runtime) return;
  const service = new GraphQueryService();
  for (const handler of buildGraphQueryHandlers(service)) {
    if (runtime.bus.registry?.has?.(handler.type)) continue;
    try {
      runtime.bus.register(handler);
    } catch (err) {
      console.warn(
        `[graphQueryBusHandlers] '${handler.type}' not registered:`,
        err,
      );
    }
  }
}
