// ArcTool — three-click centre/start/end arc creation (S53 D1).
//
// State machine:
//   idle                 — preview empty.
//   centre-set(cx, cz)   — preview the radius line + a half-arc hint.
//   start-set(cx,cz,sa)  — preview the arc sweeping from the start angle
//                          to the cursor angle, CCW.
//
// Click 1: centre. Click 2: arc start point (defines radius + start angle).
// Click 3: arc end point (defines end angle along the same radius).
// Esc cancels at any phase.

import {
  EMPTY_PREVIEW,
  type PreviewArc,
  type PreviewLine,
  type SketchTool,
  type ToolDeps,
  type ToolEvent,
  type ToolPreview,
} from './types.js';

type ArcToolState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'centre-set'; readonly cx: number; readonly cz: number }
  | {
      readonly phase: 'start-set';
      readonly cx: number;
      readonly cz: number;
      readonly radius: number;
      readonly startAngle: number;
    };

const IDLE: ArcToolState = Object.freeze({ phase: 'idle' });
const MIN_RADIUS_MM = 1e-3;

export function createArcTool(deps: ToolDeps): SketchTool {
  let state: ArcToolState = IDLE;

  function hintOnly(text: string): ToolPreview {
    return Object.freeze({ previewLines: EMPTY_PREVIEW.previewLines, hint: text });
  }

  function radialPreview(cx: number, cz: number, x: number, z: number): ToolPreview {
    const line: PreviewLine = Object.freeze({ x1: cx, z1: cz, x2: x, z2: z });
    return Object.freeze({
      previewLines: Object.freeze([line]) as readonly PreviewLine[],
      hint: 'Click arc start (Esc to cancel)',
    });
  }

  function arcPreview(
    cx: number,
    cz: number,
    radius: number,
    startAngle: number,
    endAngle: number,
  ): ToolPreview {
    const arc: PreviewArc = Object.freeze({ cx, cz, radius, startAngle, endAngle });
    return Object.freeze({
      previewLines: EMPTY_PREVIEW.previewLines,
      previewArcs: Object.freeze([arc]) as readonly PreviewArc[],
      hint: 'Click arc end (Esc to cancel)',
    });
  }

  return {
    name: 'arc',
    handle(event: ToolEvent): ToolPreview {
      if (event.kind === 'cancel') {
        state = IDLE;
        return EMPTY_PREVIEW;
      }
      if (state.phase === 'idle') {
        if (event.kind === 'pointer-down') {
          state = { phase: 'centre-set', cx: event.worldX, cz: event.worldZ };
          return hintOnly('Click arc start (Esc to cancel)');
        }
        return hintOnly('Click arc centre');
      }
      if (state.phase === 'centre-set') {
        if (event.kind === 'pointer-move') {
          return radialPreview(state.cx, state.cz, event.worldX, event.worldZ);
        }
        const r = Math.hypot(event.worldX - state.cx, event.worldZ - state.cz);
        if (r < MIN_RADIUS_MM) return hintOnly('Click arc start (Esc to cancel)');
        const a = Math.atan2(event.worldZ - state.cz, event.worldX - state.cx);
        state = { phase: 'start-set', cx: state.cx, cz: state.cz, radius: r, startAngle: a };
        return hintOnly('Click arc end (Esc to cancel)');
      }
      const endAngle = Math.atan2(event.worldZ - state.cz, event.worldX - state.cx);
      if (event.kind === 'pointer-move') {
        return arcPreview(state.cx, state.cz, state.radius, state.startAngle, endAngle);
      }
      if (Math.abs(((endAngle - state.startAngle + Math.PI * 2) % (Math.PI * 2))) < 1e-4) {
        return hintOnly('End angle equals start — pick a different point.');
      }
      if (!deps.commitArc) throw new Error('ArcTool: ToolDeps.commitArc is required.');
      deps.commitArc({
        cx: state.cx,
        cz: state.cz,
        radius: state.radius,
        startAngle: state.startAngle,
        endAngle,
      });
      state = IDLE;
      return hintOnly('Click arc centre');
    },
    reset(): ToolPreview {
      state = IDLE;
      return EMPTY_PREVIEW;
    },
  };
}
