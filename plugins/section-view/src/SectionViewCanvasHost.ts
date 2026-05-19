// SectionViewCanvasHost — live canvas host (W-09; promoted from S37 shell).
//
// Spec: `phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` §W-09.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// Owns: a single Canvas2D draw target.  Drives:
//   1. the kernel-pure `produceSectionCut` producer,
//   2. the `SectionViewRenderer` that paints the result.
//
// The host stays decoupled from the DOM constructor: callers pass a
// `CanvasLike` (real `HTMLCanvasElement` in the browser, fake in Node
// tests).  This matches `PlanViewCanvasHost`'s test-friendly shape.

import {
  produceSectionCut,
  type AabbForSection,
  type SectionCutResult,
  type SectionLine,
} from '@pryzm/plugin-sdk';
import {
  SectionViewRenderer,
  type CanvasLike,
  type SectionRenderViewport,
  type RenderStats,
} from './SectionViewRenderer.js';

export interface SectionViewHostOptions {
  readonly line: SectionLine;
  /** Element source — the host calls `getState()` once per render(). */
  readonly aabbSource: { getState(): readonly AabbForSection[] };
  /** Optional draw target — omit in headless/unit-test contexts. */
  readonly target?: CanvasLike;
  /** Optional viewport rect for the renderer.  Defaults to a sensible
   *  10m × 5m box centred on the section line origin. */
  readonly viewport?: SectionRenderViewport;
}

export class SectionViewCanvasHost {
  private readonly options: SectionViewHostOptions;
  private readonly renderer: SectionViewRenderer;
  private lastResult: SectionCutResult = { cutEdges: [], beyondEdges: [] };
  private renderCount = 0;

  constructor(options: SectionViewHostOptions) {
    this.options = options;
    this.renderer = new SectionViewRenderer();
    if (options.viewport) this.renderer.setViewport(options.viewport);
  }

  render(): SectionCutResult {
    const elements = this.options.aabbSource.getState();
    this.lastResult = produceSectionCut(this.options.line, elements);
    if (this.options.target) this.renderer.draw(this.options.target, this.lastResult);
    this.renderCount++;
    return this.lastResult;
  }

  snapshot(): {
    readonly cutCount: number;
    readonly beyondCount: number;
    readonly renderCount: number;
    readonly renderStats: RenderStats;
  } {
    return {
      cutCount: this.lastResult.cutEdges.length,
      beyondCount: this.lastResult.beyondEdges.length,
      renderCount: this.renderCount,
      renderStats: this.renderer.snapshot(),
    };
  }
}
