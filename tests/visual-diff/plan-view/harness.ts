// Recording-canvas harness for plan-view backend equivalence
// (post-2B closeout / ADR-0030 / ADR-0029 §"Equivalence gate").
//
// PURE: no DOM, no THREE, no Node-only globals at runtime — fixture
// loader uses Node fs but the recorder itself is portable.

import type { Canvas2DLike } from '@pryzm/drawing-primitives';

export type RecordedCall =
  | { kind: 'set'; prop: string; value: unknown }
  | { kind: 'call'; method: string; args: readonly unknown[] };

const PROPS = [
  'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha',
  'font', 'textAlign', 'textBaseline',
] as const;

const METHODS = [
  'setLineDash', 'beginPath', 'moveTo', 'lineTo', 'closePath',
  'arc', 'stroke', 'fill', 'save', 'restore', 'translate', 'rotate',
  'fillText', 'fillRect', 'clearRect',
] as const;

export class RecordingCanvasContext {
  readonly calls: RecordedCall[] = [];
  // Mutable shadow state so reads return what was written (some
  // backends round-trip props before drawing).
  private state: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  };

  constructor() {
    for (const m of METHODS) {
      (this as Record<string, unknown>)[m] = (...args: unknown[]) => {
        this.calls.push({ kind: 'call', method: m, args });
      };
    }
    for (const p of PROPS) {
      Object.defineProperty(this, p, {
        get: () => this.state[p],
        set: (v: unknown) => {
          this.state[p] = v;
          this.calls.push({ kind: 'set', prop: p, value: v });
        },
        enumerable: true,
        configurable: true,
      });
    }
  }

  /** Read as the structural Canvas2DLike type. */
  asCanvas2DLike(): Canvas2DLike {
    return this as unknown as Canvas2DLike;
  }

  /** Stable JSON of recorded calls. */
  toJSON(): readonly RecordedCall[] {
    return this.calls;
  }
}

/** Compare two streams and return the first diff index, or -1 if equal. */
export function diffStreams(
  a: readonly RecordedCall[],
  b: readonly RecordedCall[],
): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return i;
  }
  if (a.length !== b.length) return n;
  return -1;
}
