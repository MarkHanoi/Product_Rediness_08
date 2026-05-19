// ToolRegistry — lazy tool factory registry (S09-T5).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S09-T5 (line 695):
//   "registers `WallTool` factory.  Lazy-instantiates on first
//    activation.  Mirrors the PRYZM 1 `ToolManager` registry pattern."
//
// Why lazy:  the `WallCreationTool` constructor enforces strict-
// injection — it THROWS if the CommandBus is missing.  Constructing
// the tool eagerly at module-import time would crash before the
// bootstrap had a chance to wire the bus.  Lazy means: the toolbar
// stores a FACTORY function; the tool is built only when the user
// activates it.
//
// Vanilla TS — no React, no DOM coupling.  The toolbar chrome layer
// (HTML / SVG icons) lives separately and CALLS this registry.

export interface ToolMeta {
  /** Stable id — `'wall.create'` for the wall tool (matches the
   *  command type so OTel spans correlate). */
  readonly id: string;
  /** Human-readable label — rendered as the toolbar tooltip. */
  readonly label: string;
  /** Icon URL — typically a `?url`-imported SVG.  The toolbar chrome
   *  loads this into an `<img>` or inlines as a background. */
  readonly iconUrl: string;
}

/** A live tool instance.  Concrete tools (e.g. `WallCreationTool`)
 *  conform to a STRUCTURAL subset of this — the toolbar shell only
 *  cares about the lifecycle entry/exit points.  Tool-specific
 *  pointer/key handlers stay typed on the concrete class. */
export interface ToolHandle {
  /** Called when the user activates ANOTHER tool — gives this tool a
   *  chance to drop its in-flight state (e.g. `WallCreationTool.cancel()`).
   *  Optional — bench fixtures don't need it. */
  readonly cancel?: () => void;
}

/** Builds a tool instance lazily on first activation.  The factory
 *  receives no args — it's the registrar's responsibility to close
 *  over the bus, screen-to-world callback, etc. when registering. */
export type ToolFactory<T extends ToolHandle = ToolHandle> = () => T;

export interface ToolEntry<T extends ToolHandle = ToolHandle> {
  readonly meta: ToolMeta;
  readonly factory: ToolFactory<T>;
}

/** A vanilla-TS tool registry with single-active-tool semantics.
 *
 *  Lifecycle:
 *    register(entry)        — adds a tool factory.  Multiple registrations
 *                              with the same id throw.
 *    activate(id)           — lazy-builds (or reuses) the tool, calls
 *                              the previous tool's `cancel()`, returns
 *                              the instance.
 *    deactivateActive()     — calls `cancel()` on the current active
 *                              tool, if any.  Returns true iff there
 *                              was an active tool.
 *    getActive()            — current active tool instance, or `undefined`.
 *    list()                 — all registered tool metadata (toolbar
 *                              chrome iterates this to render buttons). */
export class ToolRegistry {
  private readonly entries = new Map<string, ToolEntry>();
  private readonly instances = new Map<string, ToolHandle>();
  private activeId: string | undefined;

  register<T extends ToolHandle>(entry: ToolEntry<T>): void {
    if (this.entries.has(entry.meta.id)) {
      throw new Error(
        `[ToolRegistry] tool id '${entry.meta.id}' is already registered.`,
      );
    }
    this.entries.set(entry.meta.id, entry as unknown as ToolEntry);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  list(): readonly ToolMeta[] {
    return [...this.entries.values()].map((e) => e.meta);
  }

  /** Activate the tool with the given id.  Lazy-builds on first call,
   *  reuses the cached instance thereafter.  Throws if `id` was never
   *  registered. */
  activate<T extends ToolHandle = ToolHandle>(id: string): T {
    const entry = this.entries.get(id);
    if (entry === undefined) {
      throw new Error(`[ToolRegistry] no tool registered for id '${id}'.`);
    }

    // Cancel the previously active tool (if any) BEFORE swapping —
    // the cancelled tool may want to flush a preview render.
    if (this.activeId !== undefined && this.activeId !== id) {
      const previous = this.instances.get(this.activeId);
      previous?.cancel?.();
    }

    let instance = this.instances.get(id);
    if (instance === undefined) {
      instance = entry.factory();
      this.instances.set(id, instance);
    }
    this.activeId = id;
    return instance as T;
  }

  /** Cancel + clear the active tool.  Returns true iff there was
   *  something to deactivate. */
  deactivateActive(): boolean {
    if (this.activeId === undefined) return false;
    const instance = this.instances.get(this.activeId);
    instance?.cancel?.();
    this.activeId = undefined;
    return true;
  }

  getActive<T extends ToolHandle = ToolHandle>(): T | undefined {
    if (this.activeId === undefined) return undefined;
    return this.instances.get(this.activeId) as T | undefined;
  }

  getActiveId(): string | undefined {
    return this.activeId;
  }
}
