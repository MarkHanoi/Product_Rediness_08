/**
 * PanelHost — generic panel that accepts contributions from plugins.
 *
 * Phase 3-B Sprint S60 §6.1
 * (PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md lines 1394-1454).
 *
 * Replaces the inline element-type switch inside `src/ui/property-panel/PropertyPanel.ts`
 * (3,339 LOC) with a contribution registry. Each plugin owns the rendering + lifecycle
 * for its own element families (or its own cross-cutting tab — IFC metadata, BCF issues,
 * AI critique, …) by registering a `PanelContribution`.
 *
 * The host is intentionally framework-free — no React, no Vue. It mounts plain DOM
 * children produced by `contribution.render(container, context)` so a plugin can use
 * any rendering tech inside its container without cross-pollination.
 *
 * Visual stability gate (G19, S60 exit criterion line 1511): mount/unmount must
 * leave the parent container in the exact same shape it found it — no leftover nodes,
 * no detached listeners — so the visual diff stays < 2 px on the 30-case fixture.
 */

import { trace, type Tracer } from '@opentelemetry/api';

export type PanelCategory = 'Parameters' | 'Constraints' | 'IFC' | 'Analysis' | 'AI' | 'Issues';

export interface PanelContext {
  /** PRYZM element id (ULID). */
  readonly elementId: string;
  /** PRYZM element type — `'wall'`, `'door'`, `'window'`, `'ifc-proxy'`, … */
  readonly elementType: string;
  /** Optional read-only metadata bag for cross-cutting contributions (IFC tab, BCF tab). */
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface PanelContribution {
  /** Stable id used for diffing + de-duplication. Two registrations with the same id replace each other. */
  readonly id: string;
  /** Rough grouping for the UI — host may render category headers. */
  readonly category: PanelCategory;
  /** Lower = shown first. Ties broken by registration order. */
  readonly priority: number;
  /** Optional filter — return false to skip mount for this context (e.g. IFC tab on non-IFC element). */
  shouldShow?(context: PanelContext): boolean;
  /** Mount DOM into the supplied container. Synchronous — async work goes in a follow-up tick. */
  render(container: HTMLElement, context: PanelContext): void;
  /** Tear down listeners / observers / timers. Container removal is the host's job. */
  unmount?(container: HTMLElement, context: PanelContext): void;
}

interface MountedRecord {
  readonly contribution: PanelContribution;
  readonly container: HTMLElement;
  readonly context: PanelContext;
}

export const PRYZM_PANEL_HOST_TRACER = 'pryzm.ui.panel-host';

export class PanelHost {
  private readonly contributions: PanelContribution[] = [];
  private readonly mounted: Map<string, MountedRecord> = new Map();
  private readonly tracer: Tracer;

  constructor(tracer: Tracer = trace.getTracer(PRYZM_PANEL_HOST_TRACER)) {
    this.tracer = tracer;
  }

  /**
   * Register a contribution. Replaces any prior contribution sharing the same id.
   * Returns an `unregister` thunk for plugin cleanup.
   */
  register(contribution: PanelContribution): () => void {
    const existingIdx = this.contributions.findIndex(c => c.id === contribution.id);
    if (existingIdx >= 0) {
      this.contributions.splice(existingIdx, 1);
    }
    this.contributions.push(contribution);
    this.contributions.sort((a, b) => a.priority - b.priority);
    return () => this.unregister(contribution.id);
  }

  unregister(id: string): boolean {
    const idx = this.contributions.findIndex(c => c.id === id);
    if (idx < 0) return false;
    this.contributions.splice(idx, 1);
    if (this.mounted.has(id)) {
      const record = this.mounted.get(id)!;
      this.tearDown(record);
      this.mounted.delete(id);
    }
    return true;
  }

  /** Snapshot of the registered contributions sorted by priority. Read-only. */
  list(): readonly PanelContribution[] {
    return this.contributions.slice();
  }

  /**
   * Mount every applicable contribution into `parentContainer` for the given element.
   * Idempotent: calling mount() twice in a row produces the same DOM.
   */
  mount(context: PanelContext, parentContainer: HTMLElement): void {
    const span = this.tracer.startSpan('pryzm.ui.panel-host.mount', {
      attributes: {
        element_id: context.elementId,
        element_type: context.elementType,
        contribution_count: this.contributions.length,
      },
    });
    try {
      this.unmountAll();
      let mountedCount = 0;
      for (const contrib of this.contributions) {
        if (contrib.shouldShow && !contrib.shouldShow(context)) continue;
        const container = parentContainer.ownerDocument.createElement('div');
        container.className = 'panel-contribution';
        container.dataset.contributionId = contrib.id;
        container.dataset.category = contrib.category;
        parentContainer.appendChild(container);
        try {
          contrib.render(container, context);
        } catch (err) {
          // Loud-fail-soft: one bad plugin must not take the whole panel down.
          // The container stays mounted with an error sentinel so QA notices.
          container.dataset.renderError = '1';
          container.textContent = `[panel contribution "${contrib.id}" render failed]`;
          span.recordException(err as Error);
          continue;
        }
        this.mounted.set(contrib.id, { contribution: contrib, container, context });
        mountedCount++;
      }
      span.setAttribute('mounted_count', mountedCount);
      span.setStatus({ code: 1 });
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: 2, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  }

  /** Unmount everything currently mounted. Safe to call when nothing is mounted. */
  unmountAll(): void {
    if (this.mounted.size === 0) return;
    const span = this.tracer.startSpan('pryzm.ui.panel-host.unmount-all', {
      attributes: { mounted_count: this.mounted.size },
    });
    try {
      for (const record of this.mounted.values()) {
        this.tearDown(record);
      }
      this.mounted.clear();
      span.setStatus({ code: 1 });
    } finally {
      span.end();
    }
  }

  /** Inspector for tests — returns the container of a mounted contribution or null. */
  containerFor(id: string): HTMLElement | null {
    return this.mounted.get(id)?.container ?? null;
  }

  private tearDown(record: MountedRecord): void {
    try {
      record.contribution.unmount?.(record.container, record.context);
    } catch (err) {
      // Same loud-fail-soft policy — record but keep going so the caller's mount loop completes.
      const span = this.tracer.startSpan('pryzm.ui.panel-host.unmount-error');
      span.recordException(err as Error);
      span.setStatus({ code: 2, message: (err as Error).message });
      span.end();
    }
    record.container.remove();
  }
}
