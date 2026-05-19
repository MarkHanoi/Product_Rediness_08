// PDF backend — TYPED STUB (post-2B closeout / ADR-0029 §2).
//
// Real implementation scheduled for S37 (PDF native — no SVG round-trip
// per SPEC-29 §4.3).  Until then this throws on render().

import {
  BackendNotImplementedError,
  type BackendRenderOptions,
  type PrimitiveBackend,
  type PrimitiveStream,
} from '../types.js';

export class PdfBackend implements PrimitiveBackend<Uint8Array> {
  readonly id = 'pdf';
  readonly sprintMarker = 'S37';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_stream: PrimitiveStream, _options: BackendRenderOptions): Uint8Array {
    throw new BackendNotImplementedError(this.id, this.sprintMarker);
  }
}
