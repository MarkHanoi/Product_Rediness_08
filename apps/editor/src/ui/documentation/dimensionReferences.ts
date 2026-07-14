// §FIX-DIM-ASSOCIATIVE-REFERENCES (L-287) — WHAT A DIMENSION MEASURES.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE BUG THIS CLOSES (and it is silent, and it is already in the product)
// ─────────────────────────────────────────────────────────────────────────────
// The pure engine plans ELEMENT-ANCHORED dimensions: every `DimensionString.references`
// entry is `{ elementId, anchor }` — "the left jamb of door_7", "the end of wall_3". That
// IS the associative query, and it is computed correctly today.
//
// The EXECUTOR then threw it away. `applyAutoDimensions` evaluated those references to
// world points and emitted `makePointRef(...)` — `elementType: 'point'`, a fresh random
// UUID, the position BAKED into `cachedPosition`. A point reference resolves to its own
// cache, so `AnnotationDependencyGraph` can never move it, and it is EXPLICITLY excluded
// from orphan detection ("free-floating point refs have no host element to lose").
//
// Consequence, before anyone drags anything: MOVE A WALL AND EVERY AUTO-DIMENSION KEEPS
// ITS OLD POSITION AND ITS OLD NUMBER. A drawing that is confidently wrong is worse than
// one that is obviously broken — a builder builds from it.
//
// This module is the missing half: the engine's `{elementId, anchor}` → the platform's
// `StableReference`, which `resolveReferenceToPoint()` re-derives from the LIVE stores on
// every model change. No new resolver capability is needed — the vocabulary already
// exists. It only has to be USED.
//
// ─────────────────────────────────────────────────────────────────────────────
// IT NEVER GUESSES
// ─────────────────────────────────────────────────────────────────────────────
// An anchor that has no unambiguous StableReference returns `null`, and the caller falls
// back to a point reference for THAT string alone (and says so). Inventing "the reference
// this point probably meant" is precisely the class of clever guess that produces a
// drawing that is confidently wrong — the failure mode this whole ticket exists to end.

import { makeRef, type StableReference } from '@pryzm/plugin-annotations';
import type { DimAnchor } from '@pryzm/schemas/annotation/dimension';

/** The element families a dimension can reference. Resolved from the executor's snapshot. */
export type DimElementKind = 'wall' | 'door' | 'window';

/**
 * WALL anchors → the resolver's wall sub-elements (`resolveWallPoint`).
 *
 * These are 1:1 and lossless: the resolver re-derives each from the wall's LIVE baseline,
 * thickness and layer stack, so a wall that moves, lengthens, or changes type takes its
 * dimensions with it — including the face/core planes, which is the whole reason the
 * sub-element vocabulary is richer than "start/end".
 */
const WALL_SUBELEMENT: Readonly<Partial<Record<DimAnchor, string>>> = Object.freeze({
  start:       'start',
  end:         'end',
  center:      'midpoint',
  'face-outer': 'face:exterior',
  'face-inner': 'face:interior',
  centerline:  'wall:centerline',
});

/**
 * OPENING anchors → the resolver's hosted-opening ANCHOR CODE (`openingCodeToAxis`).
 *
 * The code packs two axes into one integer, which is the resolver's existing contract:
 *   h = code % 3        → 0 = left jamb, 1 = centre, 2 = right jamb
 *   v = floor(code / 3) → 0 = wall base, 1 = sill, 2 = head, 3 = mid-height
 * It is carried in `StableReference.index` (the same slot 'param'/'edge' use).
 *
 * A door/window is HOSTED (C15): the resolver walks to its host wall and re-derives the
 * jamb from the wall's live baseline + the opening's live offset/width — so moving the
 * WALL, or sliding the DOOR along it, both move the dimension. That is the associativity
 * the founder is asking for, and it is why an opening must never be measured by a point.
 */
const OPENING_CODE: Readonly<Partial<Record<DimAnchor, number>>> = Object.freeze({
  left:   0,   // h=0, v=base  — the left jamb, in plan
  center: 1,   // h=1, v=base  — the opening centre (what a location dim ticks)
  right:  2,   // h=2, v=base  — the right jamb
  bottom: 4,   // h=1, v=sill  — the sill, at the opening's centre (elevation)
  top:    7,   // h=1, v=head  — the head (elevation)
});

/**
 * The engine's `{elementId, anchor}` → a live `StableReference`.
 *
 * Returns `null` when the anchor has no unambiguous mapping for that element kind — the
 * caller must then fall back, never invent. PURE: no stores, no THREE, no window.
 */
export function toStableReference(
  elementId: string,
  anchor: DimAnchor,
  kind: DimElementKind,
): StableReference | null {
  if (kind === 'wall') {
    const sub = WALL_SUBELEMENT[anchor];
    return sub ? makeRef('wall', elementId, sub as never) : null;
  }
  const code = OPENING_CODE[anchor];
  if (code === undefined) return null;
  // The resolver reads the CODE from `index` and ignores `subElement` for openings; we
  // still stamp 'param' so the record is self-describing rather than carrying a lie.
  return makeRef(kind, elementId, 'param', code);
}

/**
 * Map a whole string's references. All-or-nothing on purpose: a dimension with ONE live
 * end and one baked end would move one witness line and not the other — a hinge, not a
 * dimension. Either the string is associative or it is honestly not.
 */
export function toStableReferences(
  refs: readonly { readonly elementId: string; readonly anchor: DimAnchor }[],
  kindOf: (elementId: string) => DimElementKind | undefined,
): StableReference[] | null {
  const out: StableReference[] = [];
  for (const r of refs) {
    const kind = kindOf(r.elementId);
    if (!kind) return null;
    const ref = toStableReference(r.elementId, r.anchor, kind);
    if (!ref) return null;
    out.push(ref);
  }
  return out.length >= 2 ? out : null;
}
