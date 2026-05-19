/**
 * InspectorHost — same contribution pattern as `PanelHost` but tuned for the
 * top-level inspector tabs (Properties · Constraints · IFC · Analysis · AI · Issues).
 *
 * Phase 3-B Sprint S60 §6.1 — replaces `src/ui/PropertyInspector.ts` (the legacy
 * fixed-tab inspector that hard-coded the IFC + analysis surfaces inline) with
 * a tab-host that accepts plugin tabs and renders them lazily on activation.
 *
 * Lazy render is what makes the bundle-size budget (K3-B) hold: a tab is mounted
 * the first time the user clicks it, never up-front, so plugins load only when
 * the user actually opens their tab. Once mounted, the DOM stays in place so
 * tab-switching is cheap (just `display: none`).
 */

import { trace, type Tracer } from '@opentelemetry/api';
import type { PanelContext, PanelCategory } from './PanelHost.js';

export interface InspectorTabContribution {
  readonly id: string;
  readonly label: string;
  readonly category: PanelCategory;
  readonly priority: number;
  shouldShow?(context: PanelContext): boolean;
  render(container: HTMLElement, context: PanelContext): void;
  unmount?(container: HTMLElement, context: PanelContext): void;
}

export const PRYZM_INSPECTOR_HOST_TRACER = 'pryzm.ui.inspector-host';

interface MountedTab {
  readonly contribution: InspectorTabContribution;
  readonly tabButton: HTMLButtonElement;
  readonly content: HTMLElement;
  readonly context: PanelContext;
  rendered: boolean;
}

export class InspectorHost {
  private readonly tabs: InspectorTabContribution[] = [];
  private readonly mounted: Map<string, MountedTab> = new Map();
  private currentActive: string | null = null;
  private readonly tracer: Tracer;
  private strip: HTMLElement | null = null;
  private body: HTMLElement | null = null;

  constructor(tracer: Tracer = trace.getTracer(PRYZM_INSPECTOR_HOST_TRACER)) {
    this.tracer = tracer;
  }

  registerTab(tab: InspectorTabContribution): () => void {
    const existingIdx = this.tabs.findIndex(t => t.id === tab.id);
    if (existingIdx >= 0) this.tabs.splice(existingIdx, 1);
    this.tabs.push(tab);
    this.tabs.sort((a, b) => a.priority - b.priority);
    return () => this.unregisterTab(tab.id);
  }

  unregisterTab(id: string): boolean {
    const idx = this.tabs.findIndex(t => t.id === id);
    if (idx < 0) return false;
    this.tabs.splice(idx, 1);
    const m = this.mounted.get(id);
    if (m) {
      this.tearDown(m);
      this.mounted.delete(id);
      if (this.currentActive === id) this.currentActive = null;
    }
    return true;
  }

  list(): readonly InspectorTabContribution[] {
    return this.tabs.slice();
  }

  /**
   * Mount the tab strip + content host into `root`. Tab content stays unrendered
   * until the user activates the tab (lazy mount).
   */
  mount(context: PanelContext, root: HTMLElement): void {
    const span = this.tracer.startSpan('pryzm.ui.inspector-host.mount', {
      attributes: {
        element_id: context.elementId,
        element_type: context.elementType,
        tab_count: this.tabs.length,
      },
    });
    try {
      this.unmountAll();
      const doc = root.ownerDocument;
      const strip = doc.createElement('div');
      strip.className = 'inspector-tab-strip';
      strip.setAttribute('role', 'tablist');
      const body = doc.createElement('div');
      body.className = 'inspector-tab-body';
      root.appendChild(strip);
      root.appendChild(body);
      this.strip = strip;
      this.body = body;

      let firstShown: string | null = null;
      let visibleCount = 0;
      for (const tab of this.tabs) {
        if (tab.shouldShow && !tab.shouldShow(context)) continue;
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'inspector-tab-button';
        button.setAttribute('role', 'tab');
        button.dataset.tabId = tab.id;
        button.textContent = tab.label;
        button.addEventListener('click', () => this.activate(tab.id));
        strip.appendChild(button);
        const content = doc.createElement('div');
        content.className = 'inspector-tab-content';
        content.setAttribute('role', 'tabpanel');
        content.dataset.tabId = tab.id;
        content.hidden = true;
        body.appendChild(content);
        this.mounted.set(tab.id, {
          contribution: tab, tabButton: button, content, context, rendered: false,
        });
        if (firstShown == null) firstShown = tab.id;
        visibleCount++;
      }
      span.setAttribute('visible_count', visibleCount);
      if (firstShown != null) this.activate(firstShown);
      span.setStatus({ code: 1 });
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: 2, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  }

  activate(id: string): void {
    const m = this.mounted.get(id);
    if (!m) return;
    if (this.currentActive === id) return;

    if (this.currentActive) {
      const prev = this.mounted.get(this.currentActive);
      if (prev) {
        prev.content.hidden = true;
        prev.tabButton.setAttribute('aria-selected', 'false');
        prev.tabButton.classList.remove('active');
      }
    }
    if (!m.rendered) {
      const span = this.tracer.startSpan('pryzm.ui.inspector-host.lazy-render', {
        attributes: { tab_id: id, element_id: m.context.elementId },
      });
      try {
        m.contribution.render(m.content, m.context);
        m.rendered = true;
        span.setStatus({ code: 1 });
      } catch (err) {
        m.content.dataset.renderError = '1';
        m.content.textContent = `[inspector tab "${id}" render failed]`;
        span.recordException(err as Error);
        span.setStatus({ code: 2, message: (err as Error).message });
      } finally {
        span.end();
      }
    }
    m.content.hidden = false;
    m.tabButton.setAttribute('aria-selected', 'true');
    m.tabButton.classList.add('active');
    this.currentActive = id;
  }

  unmountAll(): void {
    if (this.mounted.size === 0 && this.strip === null) return;
    for (const m of this.mounted.values()) this.tearDown(m);
    this.mounted.clear();
    this.currentActive = null;
    this.strip?.remove();
    this.body?.remove();
    this.strip = null;
    this.body = null;
  }

  active(): string | null { return this.currentActive; }

  private tearDown(m: MountedTab): void {
    if (m.rendered) {
      try {
        m.contribution.unmount?.(m.content, m.context);
      } catch (err) {
        const span = this.tracer.startSpan('pryzm.ui.inspector-host.unmount-error');
        span.recordException(err as Error);
        span.end();
      }
    }
    m.tabButton.remove();
    m.content.remove();
  }
}
