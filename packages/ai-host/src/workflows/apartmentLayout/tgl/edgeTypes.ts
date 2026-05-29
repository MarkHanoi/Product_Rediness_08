// L3-γ-1 (2026-05-29) — Semantic edge typing for the apartment bubble graph.
//
// Cognition-stack Layer 3: every bubble-graph adjacency carries not just a
// `via: open | door` (a geometric distinction) but a SEMANTIC role — the
// reason that connection exists architecturally. Seven categories:
//
//   SOCIAL_FLOW            — public↔public (living↔kitchen, kitchen↔dining).
//                            The "movement happens here" edges.
//   INTIMATE_ACCESS        — the most-private dyads (master↔ensuite). A
//                            sheltered, second-skin connection.
//   BUFFER                 — circulation↔private (corridor↔bedroom). The
//                            circulation IS the acoustic / visual buffer.
//   SERVICE_ACCESS         — anything↔wet/service (corridor↔bathroom,
//                            corridor↔utility). Routes for fixtures + drainage.
//   CEREMONIAL_THRESHOLD   — hall↔anything. The arrival-ritual edge: the
//                            hall is the threshold; every edge from it
//                            performs the "you've arrived" function.
//   VISUAL_CONNECTION      — open-plan edges with no door (hall↔living,
//                            kitchen↔dining when the openPlan toggle is on).
//                            Sightline is the architectural payload.
//   ACOUSTIC_SEPARATION    — reserved for L3-γ-3: an edge whose role is to
//                            mark two rooms as deliberately acoustically
//                            isolated even when geometrically adjacent
//                            (the classifier never returns this — only a
//                            future validator pass promotes edges into it).
//
// The classifier is pure (RoomType → PrivacyClass via the rules database,
// plus the via field) and DETERMINISTIC. Tests pin every interesting case.

import type { RoomType } from '../types.js';
import { roomRule } from '../rules/programRules.js';

export type EdgeType =
    | 'SOCIAL_FLOW'
    | 'INTIMATE_ACCESS'
    | 'BUFFER'
    | 'SERVICE_ACCESS'
    | 'CEREMONIAL_THRESHOLD'
    | 'VISUAL_CONNECTION'
    | 'ACOUSTIC_SEPARATION';

/** Full enum membership (stable order, used by tests + future axis bins). */
export const EDGE_TYPES: readonly EdgeType[] = [
    'SOCIAL_FLOW',
    'INTIMATE_ACCESS',
    'BUFFER',
    'SERVICE_ACCESS',
    'CEREMONIAL_THRESHOLD',
    'VISUAL_CONNECTION',
    'ACOUSTIC_SEPARATION',
] as const;

/** Wet-private rooms that route plumbing — drives SERVICE_ACCESS classification. */
const WET_PRIVATE: ReadonlySet<RoomType> = new Set<RoomType>(['bathroom', 'ensuite', 'wc']);

/**
 * Classify a single adjacency edge into one of the seven semantic categories.
 *
 * Decision order (top wins) — privacy intent beats plumbing role:
 *   1. either endpoint is `hall`                       → CEREMONIAL_THRESHOLD
 *   2. both endpoints are private                      → INTIMATE_ACCESS
 *      (master↔ensuite is the canonical case — the hierarchical-privacy
 *       intent dominates the fact that one side carries water.)
 *   3. either endpoint is service-class (utility)      → SERVICE_ACCESS
 *   4. either endpoint is wet-private (bath / wc)      → SERVICE_ACCESS
 *   5. via === 'open'                                  → VISUAL_CONNECTION
 *   6. exactly one endpoint is circulation +
 *      the other is private                            → BUFFER
 *   7. both endpoints are public                       → SOCIAL_FLOW
 *   8. otherwise                                       → BUFFER
 *
 * The classifier NEVER returns ACOUSTIC_SEPARATION — that category is
 * reserved for a future validator pass (L3-γ-3) that promotes specific
 * edges into the acoustic-isolation role.
 */
export function classifyEdge(
    aType: RoomType,
    bType: RoomType,
    via: 'open' | 'door',
): EdgeType {
    if (aType === 'hall' || bType === 'hall') return 'CEREMONIAL_THRESHOLD';

    const aPriv = roomRule(aType).privacy;
    const bPriv = roomRule(bType).privacy;

    if (aPriv === 'private' && bPriv === 'private') return 'INTIMATE_ACCESS';

    if (aPriv === 'service' || bPriv === 'service') return 'SERVICE_ACCESS';
    if (WET_PRIVATE.has(aType) || WET_PRIVATE.has(bType)) return 'SERVICE_ACCESS';

    if (via === 'open') return 'VISUAL_CONNECTION';

    const onePrivate = (aPriv === 'private') !== (bPriv === 'private');
    const oneCirc = (aPriv === 'circulation') !== (bPriv === 'circulation');
    if (onePrivate && oneCirc) return 'BUFFER';

    if (aPriv === 'public' && bPriv === 'public') return 'SOCIAL_FLOW';

    return 'BUFFER';
}
