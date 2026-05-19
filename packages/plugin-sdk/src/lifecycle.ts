// @pryzm/plugin-sdk — lifecycle hooks (S62 D2).
//
// Spec source:
//   • phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md §2.3
//     ("Plugin Lifecycle: onActivate / onDeactivate / onUpdate hooks")
//   • phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S62 D2
//     ("SDK package skeleton beyond descriptor.ts")
//
// A plugin module exports a `default` function returning a `PluginLifecycle`.
// The host calls these hooks at well-defined moments after the iframe
// sandbox handshake.  Hooks are async-tolerant; the host awaits them with
// a 5-second budget per hook (timeout fires the kill-switch K3-C path).
//
// All hook arguments are typed; the plugin author cannot reach into the
// host directly — the only way to read state or mutate the project is
// through `ctx.hosts.*` (which themselves enforce the locked permission
// matrix per descriptor.ts).

import type { PluginManifest } from './descriptor';
import type { HostProxies } from './hosts';

/**
 * Activation context handed to a plugin's `onActivate` hook.
 * Frozen at handshake time; subsequent host changes (e.g. user switch)
 * trigger a deactivate-reactivate cycle rather than mutation in place.
 */
export interface PluginActivationContext {
  /** The validated manifest the host loaded the plugin against. */
  readonly manifest: PluginManifest;
  /** The signed-in user, redacted to the fields a plugin may read. */
  readonly user: PluginUserContext;
  /** Permission-gated proxies onto the host. */
  readonly hosts: HostProxies;
  /** Locale (BCP-47) for i18n.  Defaults to 'en-US'. */
  readonly locale: string;
}

/**
 * Per `read:user` permission scope: every field here is allowed without
 * an extra capability check.  Plugins without `read:user` see `null` for
 * `displayName` and `email`; `id` is always present (it is a plugin-scoped
 * pseudonymous ULID, not a global PRYZM user id).
 */
export interface PluginUserContext {
  /** Stable per-(plugin × user) pseudonymous id; never reveals global user id. */
  readonly id: string;
  /** Display name; `null` unless `read:user` permission is granted. */
  readonly displayName: string | null;
  /** Email; `null` unless `read:user` permission is granted. */
  readonly email: string | null;
}

/**
 * The lifecycle contract.  All hooks optional; a plugin that exports an
 * empty `{}` is valid (it can still register `tool`/`panel`/`command`
 * contributions declaratively via the manifest).
 */
export interface PluginLifecycle {
  /**
   * Called once, after iframe mount + handshake, before the user can
   * interact with the plugin's UI.  Throws / rejections fire K3-C and
   * the plugin is unmounted; the host UI shows a degraded-mode notice.
   */
  onActivate?(ctx: PluginActivationContext): void | Promise<void>;

  /**
   * Called when the user disables the plugin OR the host tab closes OR
   * the host is shutting down.  The host gives this hook 5 seconds to
   * resolve before forcibly tearing down the iframe.  Side-effect-free
   * teardown (cancel timers, close streams) belongs here.
   */
  onDeactivate?(): void | Promise<void>;

  /**
   * Called when the manifest's `version` field changes between two
   * consecutive activations.  The host upgrades plugins atomically — the
   * old version is `onDeactivate`d, the new version is `onActivate`d,
   * AND `onUpdate(prev, next)` is called BEFORE `onActivate`.  If
   * `onUpdate` throws the upgrade is rolled back to the prior version.
   */
  onUpdate?(prevVersion: string, nextVersion: string): void | Promise<void>;
}

/**
 * Helper for `pryzm dev` / the example plugins: assert at compile-time
 * that a value matches the lifecycle contract, without imposing a runtime
 * cost.  Equivalent to `(x: PluginLifecycle) => x` but with an inferred
 * generic so the caller's literal type is preserved for IDE hover-docs.
 */
export function definePlugin<T extends PluginLifecycle>(plugin: T): T {
  return plugin;
}

/**
 * Sentinel constant: the per-hook timeout in milliseconds.  The host
 * uses this; it is exported so plugin tests can assert against the same
 * number.  Per phase-doc-2 §S62 D7 ("audit must show kill-switch fires
 * within 5s of an unresponsive plugin").
 */
export const HOOK_TIMEOUT_MS = 5_000;
