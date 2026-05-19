// Shared Canvas2D mock used by widget + view-renderer tests (S39).
//
// Records every method call into `ops` so tests can assert "this widget
// drew N rectangles, M strokes, K texts at Y" without a real DOM.

export interface RecordedOp {
  readonly op: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface MockCtx {
  readonly ops: RecordedOp[];
  // CanvasRenderingContext2D-shaped (subset).
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(a: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, s: number, e: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  closePath(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  clip(): void;
  setLineDash(d: number[]): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  drawImage(...args: unknown[]): void;
}

export function createMockCtx(): MockCtx {
  const ops: RecordedOp[] = [];
  const noop = (op: string) => (...args: unknown[]) => { ops.push({ op, args }); };

  const ctx: MockCtx = {
    ops,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    save: noop('save'),
    restore: noop('restore'),
    translate: noop('translate'),
    scale: noop('scale'),
    rotate: noop('rotate'),
    setTransform: noop('setTransform'),
    beginPath: noop('beginPath'),
    moveTo: noop('moveTo'),
    lineTo: noop('lineTo'),
    arc: noop('arc'),
    rect: noop('rect'),
    fill: noop('fill'),
    stroke: noop('stroke'),
    closePath: noop('closePath'),
    clearRect: noop('clearRect'),
    fillRect: noop('fillRect'),
    strokeRect: noop('strokeRect'),
    fillText: noop('fillText'),
    strokeText: noop('strokeText'),
    measureText: (text: string) => {
      ops.push({ op: 'measureText', args: [text] });
      // Naive: 2.5 mm per char (lines up with default font size in tests).
      return { width: text.length * 2.5 };
    },
    clip: noop('clip'),
    setLineDash: noop('setLineDash'),
    quadraticCurveTo: noop('quadraticCurveTo'),
    drawImage: noop('drawImage'),
  };
  return ctx;
}

/** Find every recorded `fillText` call. */
export function texts(ops: RecordedOp[]): string[] {
  return ops.filter((o) => o.op === 'fillText').map((o) => String(o.args[0]));
}

export function counts(ops: RecordedOp[], op: string): number {
  return ops.filter((o) => o.op === op).length;
}
