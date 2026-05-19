// @pryzm/drawing-primitives — public surface (post-2B closeout / ADR-0029).

export type {
  Vec2,
  DashStyle,
  Stroke,
  Fill,
  Primitive,
  PrimitiveStream,
  PrimitiveBackend,
  BackendRenderOptions,
  LinePrimitive,
  PolylinePrimitive,
  PolygonPrimitive,
  ArcPrimitive,
  TextPrimitive,
  HatchPrimitive,
} from './types.js';

export { BackendNotImplementedError } from './types.js';

export {
  classifierToPrimitives,
  type ClassifiedEdgeShape,
  type PocheFillShape,
  type ClassifierToPrimitivesInput,
} from './classifier-to-primitives.js';

export { Canvas2DBackend, type Canvas2DLike } from './backends/canvas2d.js';
export { SvgBackend } from './backends/svg.js';
export { PdfBackend } from './backends/pdf.js';
export { PrintCanvasBackend, type PrintCanvasOutput } from './backends/print-canvas.js';
