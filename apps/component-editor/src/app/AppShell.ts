/**
 * AppShell — the layout host for the PRYZM Family Creator.
 *
 * S52 D1 / S53 D1 wiring:
 *   - View-tab bar consuming the `viewTabStore`.
 *   - Three view panels (sketch / 3D / parameters); the sketch panel
 *     mounts the real `SketchCanvas` against externally-owned
 *     stores so that the constraint runtime, status bar, and
 *     toolbars all share the same `SketchDocStore` /
 *     `SelectionStore` / `ConstraintStore`.
 *   - The Family Editor runtime is the single owner of these stores;
 *     this shell mounts it once at startup and disposes on unmount.
 *   - The constraint toolbar (top of the sketch panel) and the
 *     bottom `StatusBar` are wired against the runtime.
 *
 * Constraints already enforced by this file:
 *  - No `(window as any)` — rule P6.
 *  - No `requestAnimationFrame` here — that's owned by the global
 *    `@pryzm/frame-scheduler` (rule P3).
 *  - No THREE import — that lives only in committers (rule P2).
 *  - ≤ 300 LoC per file (the §13 `family-editor-300-loc-cap` gate).
 */

import { renderAppFooter } from './appFooter.js';
import { renderAppHeader } from './appHeader.js';
import { renderSplash } from './appSplash.js';
import {
  createFamilyEditorRuntime,
  type FamilyEditorRuntime,
} from './familyEditorRuntime.js';
import { mountStatusBar, type StatusBarMount } from './StatusBar.js';
import { mountConstraintToolbar } from '../sketch/ConstraintToolbar.js';
import { mountSketchCanvas } from '../sketch/SketchCanvas.js';
import { createViewTabStore, type ViewTab, type ViewTabStore } from '../stores/viewTabStore.js';
import {
  createLiveRegion,
  createSkipLink,
  MAIN_CONTENT_ID,
  type LiveRegionMount,
} from '../a11y/index.js';

const TAB_LABELS: ReadonlyArray<{ readonly id: ViewTab; readonly label: string }> = [
  { id: 'sketch', label: 'Sketch' },
  { id: '3d', label: '3D' },
  { id: 'parameters', label: 'Parameters' },
];

export interface MountResult {
  unmount(): void;
  /** Test seam — exposes the live store so tests can drive transitions. */
  readonly viewTabStore: ViewTabStore;
  /** Test seam — exposes the family runtime (constraint store etc.). */
  readonly runtime: FamilyEditorRuntime;
  /** Test seam — exposes the screen-reader live region (S58 §19.7 #3). */
  readonly liveRegion: LiveRegionMount;
}

export function mountAppShell(root: HTMLElement): MountResult {
  root.innerHTML = '';
  root.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'height:100vh',
    'margin:0',
    'background:linear-gradient(135deg,#1a1a2e 0%,#0f0f1f 100%)',
    'color:#e8e8f0',
    'font-family:system-ui,sans-serif',
  ].join(';');

  const runtime = createFamilyEditorRuntime();
  const viewTabStore = createViewTabStore('sketch');
  const tabBar = renderTabBar(viewTabStore);
  const skipLink = createSkipLink(MAIN_CONTENT_ID);
  const liveRegion = createLiveRegion('polite');
  let activeMount = renderActivePanel(viewTabStore.get().active, runtime);
  const statusBar: StatusBarMount = mountStatusBar(root, {
    constraintStore: runtime.constraintStore,
    solverRunner: runtime.solverRunner,
    selectionStore: runtime.selectionStore,
  });
  const unsubscribe = viewTabStore.subscribe((snap) => {
    repaintTabBar(tabBar, snap.active);
    activeMount.cleanup();
    const next = renderActivePanel(snap.active, runtime);
    activeMount.element.replaceWith(next.element);
    activeMount = next;
    liveRegion.announce(`Switched to ${snap.active} view.`);
  });

  // Body assembly: skip-link → header → tabs → panel → footer → status bar →
  // live region.  Skip-link is FIRST so it is the first focusable element.
  root.append(skipLink, renderAppHeader(), tabBar, activeMount.element, renderAppFooter());
  // Re-append status bar so it lands AFTER the footer in DOM order.
  root.appendChild(statusBar.element);
  root.appendChild(liveRegion.element);

  return {
    unmount() {
      unsubscribe();
      activeMount.cleanup();
      statusBar.unmount();
      runtime.dispose();
      root.innerHTML = '';
    },
    viewTabStore,
    runtime,
    liveRegion,
  };
}

function renderTabBar(store: ViewTabStore): HTMLElement {
  const bar = document.createElement('nav');
  bar.dataset.role = 'view-tab-bar';
  bar.setAttribute('aria-label', 'View tabs');
  bar.style.cssText = [
    'display:flex',
    'gap:4px',
    'padding:8px 24px',
    'border-bottom:1px solid rgba(255,255,255,0.1)',
    'background:rgba(0,0,0,0.2)',
  ].join(';');

  for (const { id, label } of TAB_LABELS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.tab = id;
    btn.textContent = label;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(id === store.get().active));
    btn.style.cssText = tabButtonStyle(id === store.get().active);
    btn.addEventListener('click', () => store.setActive(id));
    bar.appendChild(btn);
  }
  return bar;
}

function repaintTabBar(bar: HTMLElement, active: ViewTab): void {
  for (const btn of Array.from(bar.querySelectorAll<HTMLButtonElement>('button[data-tab]'))) {
    const isActive = btn.dataset.tab === active;
    btn.setAttribute('aria-selected', String(isActive));
    btn.style.cssText = tabButtonStyle(isActive);
  }
}

function tabButtonStyle(active: boolean): string {
  return [
    `background:${active ? '#6600FF' : 'transparent'}`,
    `color:${active ? '#ffffff' : '#a8a8c0'}`,
    'border:none',
    'padding:8px 16px',
    'border-radius:6px',
    'font-weight:600',
    'cursor:pointer',
    'font-size:13px',
    'font-family:inherit',
  ].join(';');
}

interface PanelMount {
  readonly element: HTMLElement;
  cleanup(): void;
}

function renderActivePanel(active: ViewTab, runtime: FamilyEditorRuntime): PanelMount {
  const panel = document.createElement('section');
  panel.dataset.role = 'view-panel';
  panel.dataset.activeTab = active;
  panel.id = MAIN_CONTENT_ID;
  panel.setAttribute('tabindex', '-1');
  panel.setAttribute('aria-label', `${active} view`);
  panel.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;outline:none';

  if (active === 'sketch') {
    const constraintToolbar = mountConstraintToolbar({
      commandBus: runtime.commandBus,
      selectionStore: runtime.selectionStore,
      docStore: runtime.sketchDocStore,
    });
    panel.appendChild(constraintToolbar.element);
    const sketch = mountSketchCanvas(panel, {
      store: runtime.sketchDocStore,
      selectionStore: runtime.selectionStore,
    });
    return {
      element: panel,
      cleanup: () => {
        sketch.unmount();
        constraintToolbar.destroy();
      },
    };
  }
  panel.style.cssText = 'flex:1;overflow:auto';
  panel.appendChild(renderSplash(active));
  return { element: panel, cleanup: () => undefined };
}
