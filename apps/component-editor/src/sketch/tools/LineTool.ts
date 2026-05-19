// LineTool — two-click line creation (S52 D1).
//
// State machine:
//   idle              — preview empty.
//   first-set(x, z)   — preview one rubber-band line from first point
//                       to the cursor.
//
// Transitions:
//   idle      + pointer-down → first-set(cursor)
//   idle      + pointer-move → idle           (no preview)
//   first-set + pointer-move → first-set      (preview updated)
//   first-set + pointer-down → idle           (commits the line)
//   any       + cancel       → idle
//
// The tool never touches DOM or the doc store directly — it commits
// via the injected `ToolDeps.commitLine` callback.

import {
  EMPTY_PREVIEW,
  type SketchTool,
  type ToolDeps,
  type ToolEvent,
  type ToolPreview,
} from './types.js';

type LineToolState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'first-set'; readonly firstX: number; readonly firstZ: number };

const IDLE: LineToolState = Object.freeze({ phase: 'idle' });

export function createLineTool(deps: ToolDeps): SketchTool {
  let state: LineToolState = IDLE;

  function makeFirstSetPreview(firstX: number, firstZ: number, x: number, z: number): ToolPreview {
    return Object.freeze({
      previewLines: Object.freeze([
        Object.freeze({ x1: firstX, z1: firstZ, x2: x, z2: z }),
      ]),
      hint: 'Click second point (Esc to cancel)',
    });
  }

  return {
    name: 'line',
    handle(event: ToolEvent): ToolPreview {
      if (event.kind === 'cancel') {
        state = IDLE;
        return EMPTY_PREVIEW;
      }
      if (state.phase === 'idle') {
        if (event.kind === 'pointer-down') {
          state = { phase: 'first-set', firstX: event.worldX, firstZ: event.worldZ };
          return Object.freeze({
            previewLines: EMPTY_PREVIEW.previewLines,
            hint: 'Click second point (Esc to cancel)',
          });
        }
        // pointer-move while idle — show a hint, no preview line yet.
        return Object.freeze({
          previewLines: EMPTY_PREVIEW.previewLines,
          hint: 'Click first point',
        });
      }
      // state.phase === 'first-set'
      if (event.kind === 'pointer-move') {
        return makeFirstSetPreview(state.firstX, state.firstZ, event.worldX, event.worldZ);
      }
      // pointer-down — commit and reset.
      const sameSpot =
        Math.hypot(event.worldX - state.firstX, event.worldZ - state.firstZ) < 1e-6;
      if (sameSpot) {
        // Degenerate click — keep the first point, ignore.
        return makeFirstSetPreview(state.firstX, state.firstZ, event.worldX, event.worldZ);
      }
      deps.commitLine({
        x1: state.firstX,
        z1: state.firstZ,
        x2: event.worldX,
        z2: event.worldZ,
      });
      state = IDLE;
      return Object.freeze({
        previewLines: EMPTY_PREVIEW.previewLines,
        hint: 'Click first point',
      });
    },
    reset(): ToolPreview {
      state = IDLE;
      return EMPTY_PREVIEW;
    },
  };
}
