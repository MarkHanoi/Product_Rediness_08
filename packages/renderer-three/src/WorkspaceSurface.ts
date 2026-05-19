// PR 4.A.4 (Wave 4 Track A) — `WorkspaceSurface`.
//
// Anchor: `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2`
// table row 4.A.4.
//
// Why this class exists, in three sentences:
//
//   1. The legacy `(window as unknown as { platformShell?: ... }).platformShell
//      .setProjectContext(id, name, opts)` cast in `src/main.ts
//      workspaceMount.show()` is the last surviving "type-launder against
//      `window`" gesture in the project-open critical path.  The cast was
//      tolerated only because `composeRuntime()` had no typed home for the
//      workspace-surface mount target.
//
//   2. `WorkspaceSurface` is that typed home.  It owns a single optional
//      reference to a `WorkspaceSurfaceHost` (a typed PlatformShell-like
//      collaborator) and exposes the three operations the project-open
//      flow actually needs: `mount(host)` to attach, `dispose()` to
//      detach + lock, and `setProjectContext(id, name, opts?)` to
//      delegate the project hand-off.  Zero `unknown`, zero `as` casts,
//      zero `window` reach.
//
//   3. This is the SUCCESSOR concept to the deleted-in-D.4.5
//      workspace bridge (D.4) — GA gate `tools/ga-gate/check-no-workspacemountbridge.ts`
//      (gate #11 in `tools/ga-gate/run-all.ts`) enforces 0 occurrences of
//      the bridge class name across the entire codebase (hard-fail on any
//      reappearance).  We deliberately do NOT carry the
//      bridge's persistence-coupling responsibilities into this file.
//      `WorkspaceSurface` does ONE thing: marshal a typed
//      `setProjectContext(...)` call to a typed host.  Everything else
//      (project-id propagation to `runtime.persistence`, save fence,
//      RuntimeStatusPill mount) stays where it already lives — inside
//      the host's own `setProjectContext()` implementation.
//
// Why this lives in `@pryzm/renderer-three` and not in
// `@pryzm/runtime-composer`:
//
//   * The doc table names this file `packages/renderer-three/src/
//     WorkspaceSurface.ts` so future renderer-three additions (the
//     three.js scene-canvas mount path that bootstrap.render.everything
//     currently owns at L7.5) have a stable home next to it.  This is
//     the first inhabitant of the package.
//   * Keeping the class outside `@pryzm/runtime-composer` keeps the
//     composer's dependency surface honest: the composer depends on
//     this package (L4 → L5) for the typed lifecycle, not the other
//     way around.

// --------------------------------------------------------------------
//                        WorkspaceSurfaceHost
// --------------------------------------------------------------------

/** Typed surface that any object passed to `WorkspaceSurface.mount()`
 *  must satisfy.  Matches `PlatformShell.setProjectContext()`'s real
 *  signature (`src/ui/platform/PlatformShell.ts`):
 *
 *  ```ts
 *  setProjectContext(
 *    id: string,
 *    name: string,
 *    opts?: { isNewProject?: boolean; prefetchedVersion?: unknown },
 *  ): void;
 *  ```
 *
 *  Wave 7 (2026-05-01): opts widened to include `prefetchedVersion`
 *  so the runtime.persistence.openProject() chain can thread an
 *  already-fetched server bundle into PlatformShell, eliminating a
 *  redundant /api/projects/:id/latest-version round-trip.
 *
 *  Returning `void` is the production reality.  We accept
 *  `void | Promise<void>` here so test doubles can be async without
 *  forcing an `await` shape change in the host. */
export interface WorkspaceSurfaceHost {
  setProjectContext(
    id: string,
    name: string,
    opts?: { isNewProject?: boolean; prefetchedVersion?: unknown },
  ): void | Promise<void>;
}

// --------------------------------------------------------------------
//                        Typed errors
// --------------------------------------------------------------------

/** Thrown when an operation is attempted before any host is mounted.
 *
 *  Distinct typed error (not a bare `Error`) so tests + production
 *  callers can branch on `instanceof` instead of string-matching the
 *  message.  Mirrors the `RuntimeNotWiredError` convention already in
 *  `@pryzm/runtime-composer/types`. */
export class WorkspaceSurfaceNotMountedError extends Error {
  override readonly name = 'WorkspaceSurfaceNotMountedError';
  constructor(operation: string) {
    super(
      `[renderer-three/WorkspaceSurface] ${operation}() called before mount() — no host attached.`,
    );
  }
}

/** Thrown when an operation is attempted after `dispose()` has been
 *  called.  Disposed surfaces are terminally inert; remount is NOT
 *  supported (re-mounting a disposed surface would silently shadow a
 *  prior bug).  Construct a fresh `WorkspaceSurface` instead. */
export class WorkspaceSurfaceDisposedError extends Error {
  override readonly name = 'WorkspaceSurfaceDisposedError';
  constructor(operation: string) {
    super(
      `[renderer-three/WorkspaceSurface] ${operation}() called after dispose() — surface is terminally inert.`,
    );
  }
}

// --------------------------------------------------------------------
//                        WorkspaceSurface
// --------------------------------------------------------------------

/** The typed mount/dispose handle that backs `runtime.workspace.surface`.
 *
 *  Lifecycle:
 *
 *    fresh ──mount(host)──> mounted ──dispose()──> disposed (terminal)
 *      │                       │                        │
 *      │                       └──remount blocked──→ throws
 *      │                                                 │
 *      └──setProjectContext()                            │
 *           throws NotMounted                            │
 *                                              setProjectContext()
 *                                                throws Disposed
 *
 *  Re-mounting a different host on a non-disposed surface IS allowed
 *  (it's the same gesture as detaching the old one and attaching a
 *  new one); test doubles use this.  Re-mounting the SAME host is a
 *  no-op (idempotent — production callers may double-fire during
 *  startup race-conditions; we do not want the second call to count
 *  as an error or fire any side effect).
 *
 *  Constructor is intentionally argument-free: the surface is fully
 *  decoupled from any event bus, store, or cross-package singleton.
 *  The typed event emission is owned by the runtime's `composeRuntime`
 *  layer (which holds the event-bus reference); this class deliberately
 *  stays a passive lifecycle-state-machine + typed delegate. */
export class WorkspaceSurface {
  private _host: WorkspaceSurfaceHost | null = null;
  private _disposed = false;

  /** Attach a typed `WorkspaceSurfaceHost`.  Idempotent for the same
   *  host instance (production startup may race — second call no-ops).
   *  Passing a different host on an already-mounted (non-disposed)
   *  surface implicitly detaches the prior host and attaches the new
   *  one (no event, no error — symmetric with the host's own
   *  late-injection patterns). */
  mount(host: WorkspaceSurfaceHost): void {
    if (this._disposed) {
      throw new WorkspaceSurfaceDisposedError('mount');
    }
    if (this._host === host) {
      // Idempotent — production race-condition tolerance.  See
      // `_heavyWiringDone` in `src/main.ts` for the call site that
      // can fire multiple times during the boot order correction.
      return;
    }
    this._host = host;
  }

  /** Delegate a project hand-off to the mounted host.  This is the
   *  typed replacement for the `(window as unknown as { platformShell?
   *  ... }).platformShell.setProjectContext(...)` cast in
   *  `src/main.ts workspaceMount.show()`.
   *
   *  Awaits the host's return value when it is a Promise so callers
   *  that already `await` this method get the host's full async
   *  semantics; PlatformShell's production implementation returns
   *  `void` synchronously, in which case the await is a no-op.
   *
   *  Throws `WorkspaceSurfaceNotMountedError` (typed) when no host
   *  is attached and `WorkspaceSurfaceDisposedError` after `dispose()`. */
  async setProjectContext(
    id: string,
    name: string,
    opts?: { isNewProject?: boolean; prefetchedVersion?: unknown },
  ): Promise<void> {
    if (this._disposed) {
      throw new WorkspaceSurfaceDisposedError('setProjectContext');
    }
    const host = this._host;
    if (host === null) {
      throw new WorkspaceSurfaceNotMountedError('setProjectContext');
    }
    await host.setProjectContext(id, name, opts);
  }

  /** Detach the host and lock the surface against future operations.
   *  Idempotent — calling `dispose()` twice is harmless.  After this
   *  call, `mount()` and `setProjectContext()` both throw
   *  `WorkspaceSurfaceDisposedError`. */
  dispose(): void {
    this._disposed = true;
    this._host = null;
  }

  /** Read-only — `true` when a host is currently attached and the
   *  surface has not been disposed. */
  get mounted(): boolean {
    return this._host !== null && !this._disposed;
  }

  /** Read-only — the currently-attached host, or `null` when no host
   *  is attached / the surface has been disposed.  Provided for
   *  introspection (telemetry, dev panels); callers should normally
   *  use `setProjectContext()` rather than reaching into the host
   *  directly. */
  get host(): WorkspaceSurfaceHost | null {
    return this._host;
  }

  /** Read-only — terminal disposed flag.  Once `true`, never returns
   *  to `false` (no remount-after-dispose). */
  get disposed(): boolean {
    return this._disposed;
  }
}

/** Builder convention shared with `buildViewRegistrySlot` /
 *  `buildCameraControllerSlot` / `buildWorkspaceModeController`:
 *  every slot adapter has a `buildXxx()` factory so the runtime-
 *  composer wire-up reads as a uniform list of `const x = buildXxx(...)`
 *  lines.  No options today; the parameter is reserved so we can
 *  add per-runtime configuration (initial host, telemetry tag) without
 *  a signature change. */
export function buildWorkspaceSurface(): WorkspaceSurface {
  return new WorkspaceSurface();
}
