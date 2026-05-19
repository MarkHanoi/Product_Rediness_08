// Print-Canvas backend — TYPED STUB (post-2B closeout / ADR-0029 §2).
//
// Real implementation scheduled for S40 (Sheet output: DPI-aware print
// canvas with bleed + crop marks, paired with the title-block engine).
// Until then this throws on render().

import {
  BackendNotImplementedError,
  type BackendRenderOptions,
  type PrimitiveBackend,
  type PrimitiveStream,
} from '../types.js';

export interface PrintCanvasOutput {
  readonly widthInches: number;
  readonly heightInches: number;
  readonly dpi: number;
  readonly png: Uint8Array;
}

export class PrintCanvasBackend implements PrimitiveBackend<PrintCanvasOutput> {
  readonly id = 'print-canvas';
  readonly sprintMarker = 'S40';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_stream: PrimitiveStream, _options: BackendRenderOptions): PrintCanvasOutput {
    throw new BackendNotImplementedError(this.id, this.sprintMarker);
  }
}
