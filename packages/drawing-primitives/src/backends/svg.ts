// SVG backend — TYPED STUB (post-2B closeout / ADR-0029 §2).
//
// Real implementation scheduled for S55 (post-OBC removal — SVG export
// is wanted by the IFC plugin).  Until then this throws
// `BackendNotImplementedError` on `render()` so any caller fails loudly
// rather than silently dropping to no-op.
//
// The class signature is real so consumers can take a `PrimitiveBackend`
// type-side dependency today.

import {
  BackendNotImplementedError,
  type BackendRenderOptions,
  type PrimitiveBackend,
  type PrimitiveStream,
} from '../types.js';

export class SvgBackend implements PrimitiveBackend<string> {
  readonly id = 'svg';
  /** Sprint marker for the not-yet-implemented error message. */
  readonly sprintMarker = 'S55';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_stream: PrimitiveStream, _options: BackendRenderOptions): string {
    throw new BackendNotImplementedError(this.id, this.sprintMarker);
  }
}
