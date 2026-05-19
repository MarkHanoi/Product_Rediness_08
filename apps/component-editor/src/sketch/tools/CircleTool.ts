// CircleTool — two-click centre+radius circle creation (S53 D1).
//
// State machine:
//   idle                — preview empty.
//   centre-set(cx, cz)  — preview a rubber-band circle from centre to
//                         the cursor (radius = distance(centre, cursor)).
//
// Transitions:
//   idle        + pointer-down → centre-set(cursor)
//   idle        + pointer-move → idle           (no preview)
//   centre-set  + pointer-move → centre-set     (preview updated)
//   centre-set  + pointer-down → idle           (commits the circle)
//   any         + cancel       → idle
//
// Commits via `ToolDeps.commitCircle`. The tool throws if `commitCircle`
// is missing — the canvas is responsible for wiring it before
// activating the Circle tool.

import {
  EMPTY_PREVIEW,
  type PreviewCircle,
  type SketchTool,
  type ToolDeps,
  type ToolEvent,
  type ToolPreview,
} from './types.js';

type CircleToolState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'centre-set'; readonly cx: number; readonly cz: number };

const IDLE: CircleToolState = Object.freeze({ phase: 'idle' });
const MIN_RADIUS_MM = 1e-3;

export function createCircleTool(deps: ToolDeps): SketchTool {
  let state: CircleToolState = IDLE;

  function preview(circle: PreviewCircle, hint: string): ToolPreview {
    return Object.freeze({
      previewLines: EMPTY_PREVIEW.previewLines,
      previewCircles: Object.freeze([Object.freeze(circle)]) as readonly PreviewCircle[],
      hint,
    });
  }

  function hintOnly(text: string): ToolPreview {
    return Object.freeze({ previewLines: EMPTY_PREVIEW.previewLines, hint: text });
  }

  return {
    name: 'circle',
    handle(event: ToolEvent): ToolPreview {
      if (event.kind === 'cancel') {
        state = IDLE;
        return EMPTY_PREVIEW;
      }
      if (state.phase === 'idle') {
        if (event.kind === 'pointer-down') {
          state = { phase: 'centre-set', cx: event.worldX, cz: event.worldZ };
          return hintOnly('Click radius point (Esc to cancel)');
        }
        return hintOnly('Click circle centre');
      }
      const r = Math.hypot(event.worldX - state.cx, event.worldZ - state.cz);
      if (event.kind === 'pointer-move') {
        if (r < MIN_RADIUS_MM) return hintOnly('Click radius point (Esc to cancel)');
        return preview(
          { cx: state.cx, cz: state.cz, radius: r },
          `Radius: ${r.toFixed(2)} mm (click to commit)`,
        );
      }
      if (r < MIN_RADIUS_MM) {
        return hintOnly('Radius too small — click further from centre.');
      }
      if (!deps.commitCircle) {
        throw new Error('CircleTool: ToolDeps.commitCircle is required.');
      }
      deps.commitCircle({ cx: state.cx, cz: state.cz, radius: r });
      state = IDLE;
      return hintOnly('Click circle centre');
    },
    reset(): ToolPreview {
      state = IDLE;
      return EMPTY_PREVIEW;
    },
  };
}
