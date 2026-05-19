/**
 * IFC metadata `PanelContribution` — wraps the existing `PsetEditorPanel`
 * (S57) inside the S60 `PanelHost` contract so the editor's
 * PropertyPanel decomposition can register it like any other panel.
 *
 * Phase 3-B Sprint S60 §6.1 (lines 1492-1505) —
 * `PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md`.
 *
 * Filtering: `shouldShow()` returns false when the supplied
 * `metaResolver(elementId)` produces null — that's the "not an IFC
 * element" case where the IFC tab is suppressed entirely.
 */

import type { PanelContribution, PanelContext } from '@pryzm/plugin-sdk';
import type { CommandBusLike, IFCInspectorMeta } from './types.js';
import { PsetEditorPanel } from './pset-editor.js';

export interface IfcPanelDeps {
  /** Resolver: PRYZM element id → IFC element meta (null when non-IFC). */
  metaResolver(elementId: string): IFCInspectorMeta | null;
  /** Command bus for `PsetUpdateCommand`s emitted by the editor inputs. */
  readonly commandBus: CommandBusLike;
}

const PRIORITY_IFC = 90; // after element-specific Parameters (1-50), before AI / Issues.

interface MountState {
  panel: PsetEditorPanel;
}

export function createIfcPanelContribution(deps: IfcPanelDeps): PanelContribution {
  const states = new WeakMap<HTMLElement, MountState>();
  return {
    id: 'ifc-metadata',
    category: 'IFC',
    priority: PRIORITY_IFC,
    shouldShow(context: PanelContext): boolean {
      return deps.metaResolver(context.elementId) !== null;
    },
    render(container: HTMLElement, context: PanelContext): void {
      const meta = deps.metaResolver(context.elementId);
      if (!meta) return;
      const panel = new PsetEditorPanel(container, deps.commandBus);
      // PsetEditorPanel.mount() takes a single `meta` argument; the elementId
      // lives inside `meta` already (IFCInspectorMeta carries it through).
      panel.mount(meta);
      states.set(container, { panel });
    },
    unmount(container: HTMLElement): void {
      const state = states.get(container);
      if (state) {
        state.panel.dispose();
        states.delete(container);
      }
    },
  };
}
