// apps/editor — Living Graph "Spaces" sentences, with determination carried in
// the type (§GR-10 · C75 §1.4 · C78 §1.4/§8.1 · C71 §4.4).
//
// THE DEFECT THIS ENDS. LivingGraphOverlay wrapped roomRelationshipSentences in
// `try { … } catch { return []; }`, and the "Spaces" inspector section is
// omitted entirely when the list is empty — so "this room has no spatial
// neighbours" (a real, determined answer) and "the sentence projection THREW
// over the cached graph" (nobody could look) rendered IDENTICALLY: no section.
// A user reading the card had no way to know the relationships were unknown
// rather than absent.
//
// Vocabulary: the closed C78 §8.1 union, imported through the shared
// `relationshipDetermination` seam — never restated (C75 §2.8).
//
// PURE: no DOM, no store access; the one dependency is the same
// @pryzm/building-graph projection the overlay already imports (L5 → L2).

import {
  roomRelationshipSentences,
  type BuildingGraph,
  type UbgNode,
} from '@pryzm/building-graph';
import type { RelationshipSentence } from '@pryzm/building-graph';
import {
  relationshipUndetermined,
  type RelationshipDetermination,
} from '../relationshipDetermination.js';

/**
 * The "Spaces" sentences for a room node, or a NAMED refusal when the
 * projection could not answer. A determined empty list is a real answer
 * ("no spatial neighbours") and renders as the section's absence, exactly as
 * before; only the undetermined arm renders differently (a visible refusal
 * row) — that visible difference is the point.
 */
export function determineRoomRelationshipSentences(
  node: UbgNode,
  graph: BuildingGraph,
): RelationshipDetermination<RelationshipSentence> {
  const scope = `spatial relationships of ${node?.id ?? '(no node)'}`;
  try {
    return { kind: 'determined', elements: roomRelationshipSentences(node, graph) };
  } catch (err) {
    return relationshipUndetermined(
      scope,
      'RELATIONSHIP_NOT_READABLE',
      `roomRelationshipSentences threw (${String((err as Error)?.message ?? err)}) — ` +
        'the room may well have neighbours; the projection could not read them.',
    );
  }
}
