// @pryzm/plugin-boundary-line — public surface.
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7900..L-7913) · C105 · ADR-0348.
//
// The AUTHORED construction / setting-out line: what an architect draws to lay a
// scheme out at early-stage design, and then populates by hand or through RAC. It is
// a HOST — walls, slabs and columns attached to it move when it moves, and what
// cannot follow is named (C105 §3.3).
//
// ⛔ NOT `Parcel.boundary` (C19 §1.4 — the legal lot outline, ONE-SHOT IMMUTABLE and
// owned by the site subsystem). ⛔ NOT `RoomBoundingLine` (an invisible room-detection
// splitter). C105 §0.2 tabulates all three.
//
// The geometry math is in `@pryzm/geometry-boundary-line` (pure). This plugin is the
// command surface and the store. The MOVE is `MoveBoundaryLineCommand`
// (`@pryzm/command-registry`) — see `handlers/index.ts` for why it is not here.

export { BoundaryLineStore } from './store.js';
export type { BoundaryLineData, BoundaryLineAttachment, BoundaryLinesState } from './store.js';

export {
    BoundaryLineSystemError,
    BoundaryLineNotFoundError,
    BoundaryLineGeometryError,
    BoundaryLineAttachmentError,
    isBoundaryLineSystemError,
} from './errors.js';

export {
    BOUNDARY_LINE_HANDLER_TYPES,
    buildBoundaryLineHandlerSet,
    registerBoundaryLineHandlers,
    CreateBoundaryLineHandler,
    type CreateBoundaryLinePayload,
    AttachToBoundaryLineHandler,
    type AttachToBoundaryLinePayload,
    DetachFromBoundaryLineHandler,
    type DetachFromBoundaryLinePayload,
    UpdateBoundaryLineHandler,
    type UpdateBoundaryLinePayload,
    DeleteBoundaryLineHandler,
    type DeleteBoundaryLinePayload,
    type BoundaryLineHandlerType,
} from './handlers/index.js';
