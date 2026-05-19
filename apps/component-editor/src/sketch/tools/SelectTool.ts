// SelectTool — clickable entity selection (S53 D1).
//
// Each pointer-down hits the topmost entity within `pickRadiusMm`
// and dispatches it to a `SelectionStore`. Modifier keys (Shift)
// toggle additive selection; bare clicks replace.
//
// Pure tool — no DOM, no THREE. Hit-test is delegated to `hitTest.ts`
// so the tool stays under the file-LoC cap and remains unit-testable.

import type { EntityId, SketchEntity } from '../entities.js';
import { hitTest } from '../hitTest.js';
import {
  EMPTY_PREVIEW,
  type SketchTool,
  type ToolEvent,
  type ToolPreview,
} from './types.js';

export interface SelectToolDeps {
  /** Live entity provider — the canvas hands the current snapshot. */
  readonly entitiesNow: () => readonly SketchEntity[];
  /** Replace the selection with `id` (single-pick). */
  readonly replaceWith: (id: EntityId) => void;
  /** Toggle `id` in the selection (additive / shift-click). */
  readonly toggle: (id: EntityId) => void;
  /** Drop the selection (empty hit on a bare click). */
  readonly clear: () => void;
  /** Default tolerance in mm (the canvas converts pixels). */
  readonly defaultTolMm: () => number;
}

export interface SelectToolOptions {
  /** Tracks Shift modifier — supplied by the canvas key handler. */
  readonly isAdditive?: () => boolean;
}

const HOVER_HINT = 'Click to select (Shift to add); empty space clears.';

export function createSelectTool(
  deps: SelectToolDeps,
  opts: SelectToolOptions = {},
): SketchTool {
  function preview(hint: string): ToolPreview {
    return Object.freeze({
      previewLines: EMPTY_PREVIEW.previewLines,
      hint,
    });
  }

  return {
    name: 'select',
    handle(event: ToolEvent): ToolPreview {
      if (event.kind !== 'pointer-down') return preview(HOVER_HINT);
      const tol = Math.max(1e-3, deps.defaultTolMm());
      const hit = hitTest({
        x: event.worldX,
        z: event.worldZ,
        entities: deps.entitiesNow(),
        tolMm: tol,
      });
      const additive = opts.isAdditive?.() ?? false;
      if (hit.id === null) {
        if (!additive) deps.clear();
        return preview(HOVER_HINT);
      }
      if (additive) deps.toggle(hit.id);
      else deps.replaceWith(hit.id);
      return preview(HOVER_HINT);
    },
    reset(): ToolPreview {
      return preview(HOVER_HINT);
    },
  };
}
