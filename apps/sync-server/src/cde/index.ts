// apps/sync-server/cde/index.ts — CDE legacy command schemas.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S22 line 1061 — D7 deliverable: 3 CDE legacy commands folded into
//     the new `event.append` protocol with payload-shape parity.
//   • S22 exit criterion #5 (line 1076) — "3 CDE legacy commands folded
//     into new protocol (parity with PRYZM 1 CDE)."
//
// The 3 commands the spec references — `CDE.LinkDocument`,
// `CDE.IssueComment`, `CDE.MarkupCreate` — were forward-looking when
// the spec was authored: PRYZM 1's Socket.io layer never shipped them
// under those names.  S22 ships them as schema-typed event payloads
// inside the new protocol, so when PRYZM 1's CDE workflows port over,
// they slot into the existing `event.append` channel with no protocol
// change.
//
// Each command has:
//   • A typed payload interface (the shape callers MUST send).
//   • A canonical `type` string (the value of `CommandEvent.type`).
//   • A `validate()` function — returns null on success, an error
//     message on failure.  The validators live here (NOT in
//     `@pryzm/schemas`) because they are sync-server-protocol concerns,
//     not core IR concerns.

export const CDE_EVENT_TYPES = {
  linkDocument: 'cde.linkDocument',
  issueComment: 'cde.issueComment',
  markupCreate: 'cde.markupCreate',
} as const;

export type CdeEventType = (typeof CDE_EVENT_TYPES)[keyof typeof CDE_EVENT_TYPES];

// ─── cde.linkDocument ────────────────────────────────────────────────

export interface CdeLinkDocumentPayload {
  /** Stable id of the entity (wall, level, project) the document is
   *  attached to. */
  readonly entityId: string;
  /** External document URI — typically a CDE storage URL or a Drive
   *  link.  Validated as a string-url; the actual fetch is the editor's
   *  problem. */
  readonly documentUri: string;
  /** Human label for the link target.  Optional. */
  readonly label?: string;
  /** ISO-8601 timestamp the user attached the link.  Optional — server
   *  uses `persistedAt` when this is absent. */
  readonly attachedAt?: string;
}

export function validateLinkDocument(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return 'cde.linkDocument: payload must be an object';
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.entityId !== 'string' || p.entityId.length === 0) {
    return 'cde.linkDocument: entityId must be a non-empty string';
  }
  if (typeof p.documentUri !== 'string' || p.documentUri.length === 0) {
    return 'cde.linkDocument: documentUri must be a non-empty string';
  }
  if (p.label !== undefined && typeof p.label !== 'string') {
    return 'cde.linkDocument: label, when present, must be a string';
  }
  if (p.attachedAt !== undefined && typeof p.attachedAt !== 'string') {
    return 'cde.linkDocument: attachedAt, when present, must be an ISO-8601 string';
  }
  return null;
}

// ─── cde.issueComment ────────────────────────────────────────────────

export interface CdeIssueCommentPayload {
  /** Issue thread id — opaque string, generated client-side as a ULID. */
  readonly issueId: string;
  /** Comment id — opaque string, generated client-side as a ULID.
   *  Required so two clients posting concurrently don't collide. */
  readonly commentId: string;
  /** Comment body — markdown.  Capped at 16 KiB by the server. */
  readonly body: string;
  /** When the comment is a reply, the id of the parent comment. */
  readonly parentCommentId?: string;
}

export const CDE_COMMENT_BODY_MAX_BYTES = 16 * 1024;

export function validateIssueComment(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return 'cde.issueComment: payload must be an object';
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.issueId !== 'string' || p.issueId.length === 0) {
    return 'cde.issueComment: issueId must be a non-empty string';
  }
  if (typeof p.commentId !== 'string' || p.commentId.length === 0) {
    return 'cde.issueComment: commentId must be a non-empty string';
  }
  if (typeof p.body !== 'string' || p.body.length === 0) {
    return 'cde.issueComment: body must be a non-empty string';
  }
  // UTF-8 byte length check (not character length).
  const byteLength = new TextEncoder().encode(p.body).length;
  if (byteLength > CDE_COMMENT_BODY_MAX_BYTES) {
    return `cde.issueComment: body is ${byteLength} bytes, max ${CDE_COMMENT_BODY_MAX_BYTES}`;
  }
  if (p.parentCommentId !== undefined && typeof p.parentCommentId !== 'string') {
    return 'cde.issueComment: parentCommentId, when present, must be a string';
  }
  return null;
}

// ─── cde.markupCreate ────────────────────────────────────────────────

export interface CdeMarkupCreatePayload {
  /** Markup id — opaque string, ULID. */
  readonly markupId: string;
  /** Geometry kind for now: `circle | rect | polyline | text`. */
  readonly kind: 'circle' | 'rect' | 'polyline' | 'text';
  /** Vertex list in scene-local coordinates.  Shape depends on `kind`:
   *    circle    — [center.x, center.y, center.z, radius]
   *    rect      — [min.x, min.y, min.z, max.x, max.y, max.z]
   *    polyline  — flat triplets [x0, y0, z0, x1, y1, z1, …]
   *    text      — anchor as [x, y, z] (text body lives in `label`). */
  readonly vertices: readonly number[];
  /** RGB colour, 0–1.  Defaults to red when omitted client-side. */
  readonly colour?: readonly [number, number, number];
  /** Text body — required when `kind === 'text'`. */
  readonly label?: string;
}

export function validateMarkupCreate(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return 'cde.markupCreate: payload must be an object';
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.markupId !== 'string' || p.markupId.length === 0) {
    return 'cde.markupCreate: markupId must be a non-empty string';
  }
  if (
    p.kind !== 'circle' &&
    p.kind !== 'rect' &&
    p.kind !== 'polyline' &&
    p.kind !== 'text'
  ) {
    return 'cde.markupCreate: kind must be one of circle | rect | polyline | text';
  }
  if (!Array.isArray(p.vertices) || p.vertices.length === 0) {
    return 'cde.markupCreate: vertices must be a non-empty array';
  }
  for (const v of p.vertices) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return 'cde.markupCreate: vertices must contain only finite numbers';
    }
  }
  if (p.colour !== undefined) {
    if (!Array.isArray(p.colour) || p.colour.length !== 3) {
      return 'cde.markupCreate: colour, when present, must be a [r,g,b] triplet';
    }
    for (const c of p.colour) {
      if (typeof c !== 'number' || c < 0 || c > 1) {
        return 'cde.markupCreate: colour channels must be numbers in [0,1]';
      }
    }
  }
  if (p.kind === 'text' && (typeof p.label !== 'string' || p.label.length === 0)) {
    return 'cde.markupCreate: label is required when kind === "text"';
  }
  return null;
}

// ─── Dispatch table ──────────────────────────────────────────────────

/** Registered CDE validators — keyed by canonical event type.  The
 *  AppendEvent handler runs the validator (when present) before
 *  enqueuing the event into the log; a validation failure returns an
 *  `error` message to the client and skips both the log + the bake
 *  enqueue. */
export const CDE_VALIDATORS: Readonly<Record<string, (p: unknown) => string | null>> = {
  [CDE_EVENT_TYPES.linkDocument]: validateLinkDocument,
  [CDE_EVENT_TYPES.issueComment]: validateIssueComment,
  [CDE_EVENT_TYPES.markupCreate]: validateMarkupCreate,
};

export function isCdeEventType(type: string): type is CdeEventType {
  return type in CDE_VALIDATORS;
}
