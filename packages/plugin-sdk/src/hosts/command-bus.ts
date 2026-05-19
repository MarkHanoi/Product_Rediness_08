// @pryzm/plugin-sdk — CommandBus proxy contract (S62 D3).
//
// Plugins issue mutations via `commandBus.dispatch({ kind, payload })`.
// The host validates permission (`write:project`), serialises, and sends
// the command to the editor's command bus (packages/command-bus/).
//
// The contract here is the PUBLIC view; the implementation lives in the
// host (apps/editor/src/plugin-runtime/) and uses postMessage as the
// transport across the iframe sandbox.  Tests against this contract
// (sdk/__tests__/hosts.test.ts) use a fake implementation that records
// calls in memory.

/**
 * A handle returned by `dispatch`.  Cancellation is best-effort — the
 * host attempts to abort but the command may have already committed.
 */
export interface CommandHandle {
  /** Server-assigned ULID; correlates with audit-log entries. */
  readonly id: string;
  /** Best-effort cancellation; resolves to `true` iff the cancel was
   *  applied before commit. */
  cancel(): Promise<boolean>;
}

/** The discriminated outcome of a dispatched command. */
export type CommandResult =
  | { ok: true; commandId: string; durationMs: number }
  | { ok: false; commandId: string; error: { code: string; message: string } };

/**
 * The proxy contract.  All methods are async — every operation crosses
 * the iframe sandbox postMessage bridge and the response is a Promise.
 *
 * Permission required for any mutating call: `write:project`.
 * Permission required for `subscribe`: `read:project`.
 */
export interface CommandBusProxy {
  /**
   * Dispatch a command to the host.  Returns a CommandResult once the
   * command has either committed or failed.  Rejections only happen for
   * transport-layer errors (host-down, sandbox unmounted); business-rule
   * failures resolve to `{ ok: false, ... }`.
   *
   * Permission: `write:project` required iff the command's `kind` is in
   * the writable-command set (per packages/command-bus/registry).
   */
  dispatch(command: { kind: string; payload: unknown }): Promise<CommandResult>;

  /**
   * Returns the historical command count for the current project, useful
   * for debug tooling.  Read-only; permission `read:project`.
   */
  history(): Promise<{ count: number; lastCommandId: string | null }>;
}
