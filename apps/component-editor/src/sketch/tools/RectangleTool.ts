// RectangleTool — two-click axis-aligned rectangle creation (S52 D1).
//
// State machine — same shape as LineTool:
//   idle                    — preview empty.
//   first-set(x, z)         — preview the four edges of the rectangle
//                             from (firstX, firstZ) to (cursorX, cursorZ).
//
// Commits four lines on the second click, in CCW order viewed from +Y.

import {
  EMPTY_PREVIEW,
  type PreviewLine,
  type SketchTool,
  type ToolDeps,
  type ToolEvent,
  type ToolPreview,
} from './types.js';

type RectangleToolState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'first-set'; readonly firstX: number; readonly firstZ: number };

const IDLE: RectangleToolState = Object.freeze({ phase: 'idle' });

function buildRectanglePreview(firstX: number, firstZ: number, x: number, z: number): readonly PreviewLine[] {
  return Object.freeze([
    Object.freeze({ x1: firstX, z1: firstZ, x2: x, z2: firstZ }),       // bottom
    Object.freeze({ x1: x, z1: firstZ, x2: x, z2: z }),                  // right
    Object.freeze({ x1: x, z1: z, x2: firstX, z2: z }),                  // top
    Object.freeze({ x1: firstX, z1: z, x2: firstX, z2: firstZ }),        // left
  ]);
}

export function createRectangleTool(deps: ToolDeps): SketchTool {
  let state: RectangleToolState = IDLE;

  function makePreview(firstX: number, firstZ: number, x: number, z: number): ToolPreview {
    return Object.freeze({
      previewLines: buildRectanglePreview(firstX, firstZ, x, z),
      hint: 'Click opposite corner (Esc to cancel)',
    });
  }

  return {
    name: 'rectangle',
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
            hint: 'Click opposite corner (Esc to cancel)',
          });
        }
        return Object.freeze({
          previewLines: EMPTY_PREVIEW.previewLines,
          hint: 'Click first corner',
        });
      }
      // state.phase === 'first-set'
      if (event.kind === 'pointer-move') {
        return makePreview(state.firstX, state.firstZ, event.worldX, event.worldZ);
      }
      // pointer-down — commit and reset.
      const w = Math.abs(event.worldX - state.firstX);
      const h = Math.abs(event.worldZ - state.firstZ);
      if (w < 1e-6 || h < 1e-6) {
        // Degenerate rectangle — keep awaiting a valid second corner.
        return makePreview(state.firstX, state.firstZ, event.worldX, event.worldZ);
      }
      const lines = buildRectanglePreview(state.firstX, state.firstZ, event.worldX, event.worldZ);
      for (const ln of lines) deps.commitLine(ln);
      state = IDLE;
      return Object.freeze({
        previewLines: EMPTY_PREVIEW.previewLines,
        hint: 'Click first corner',
      });
    },
    reset(): ToolPreview {
      state = IDLE;
      return EMPTY_PREVIEW;
    },
  };
}
