// @pryzm/plugin-sdk — host proxies barrel (S62 D3).
//
// The host proxies are the SDK's public interface to the editor's
// internals.  Each proxy is permission-gated against the manifest that
// activated the plugin: a plugin without `write:project` cannot dispatch
// a mutating command, even if it gets a CommandBusProxy reference.
//
// Internal renaming note (per ADR-0038 §Decision C): the existing
// `apps/editor/src/PluginRegistry.ts:PluginDescriptor` interface is
// scheduled for rename to `InternalPluginRecord` in this S62 D3 work.
// The rename is co-located with the host-proxy implementation in
// apps/editor (consumed by bootstrapWithEverything), not here in the
// public SDK; this barrel only re-exports the public proxy CONTRACTS.

export type { CommandBusProxy, CommandHandle, CommandResult } from './command-bus';
export type {
  StoresProxy,
  StoreSnapshot,
  StoreSubscription,
  ElementRef,
} from './stores';
export type { ViewsProxy, ViewRef, ViewKind } from './views';
export type { SelectionProxy, SelectionSubscription } from './selection';
export type { AiProxy, AiWorkflowResult, AiWorkflowRef } from './ai';
export type {
  FormatProxy,
  FormatImporterRegistration,
  FormatExporterRegistration,
  ImporterHandler,
  ExporterHandler,
} from './format';

import type { CommandBusProxy } from './command-bus';
import type { StoresProxy } from './stores';
import type { ViewsProxy } from './views';
import type { SelectionProxy } from './selection';
import type { AiProxy } from './ai';
import type { FormatProxy } from './format';

/**
 * The aggregate handed to a plugin's `onActivate(ctx)` via `ctx.hosts`.
 * Each field is its own narrowly-scoped proxy; a plugin with only
 * `read:project` sees stub stand-ins for `commandBus.dispatch` etc.
 * (each method throws `PluginPermissionError` when called).
 */
export interface HostProxies {
  readonly commandBus: CommandBusProxy;
  readonly stores: StoresProxy;
  readonly views: ViewsProxy;
  readonly selection: SelectionProxy;
  readonly ai: AiProxy;
  readonly format: FormatProxy;
}

/**
 * Thrown by every proxy when a plugin invokes an operation its manifest
 * does not grant permission for.  Caught by the iframe sandbox bridge
 * and surfaced to the plugin's catch handler as a structured rejection
 * (so the plugin can render a "permission required" error in its panel
 * rather than crashing).
 */
export class PluginPermissionError extends Error {
  constructor(
    public readonly required: string,
    public readonly granted: readonly string[],
  ) {
    super(
      `Plugin permission '${required}' is required for this operation; ` +
        `granted permissions are: [${granted.join(', ') || '(none)'}]`,
    );
    this.name = 'PluginPermissionError';
  }
}
