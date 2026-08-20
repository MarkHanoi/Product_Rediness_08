// §FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — the ONE place that names the id of the
// auto-opening a stair punches in a slab it passes through.
//
// CreateStairCommand WRITES these openings; DeleteStairCommand REMOVES them. The
// two commands are different instances with no shared field, so the only link
// between "the hole the create punched" and "the hole the delete heals" is this
// convention. If the two sides ever disagreed on the format, delete would "remove"
// an opening that was never named the same — and the hole would stay in the floor
// forever, which is exactly the defect L-298 closed. So the convention gets one
// home and every side imports it.
//
// ─── §STAIR-VOID-EVERY-DECK (L-1433) — WHY THERE IS NOW A LEVEL PARAMETER ─────
//
// Until L-1433 a stair carved ONE void, in the slab on its TOP level, and this
// function took only a stair id because one stair could only ever own one void.
// `LevelTraversalPolicy.canTraverse` returns `ok: true` (with a warning) for a
// level-skipping stair, so a Ground→L5 stair was ACCEPTED and drove through four
// INTACT slabs. Reachable by hand: the stair parameters panel offers Top level as
// a dropdown.
//
// A stair now owns one void PER PIERCED DECK, so the id must carry the level.
//
// ⭐⭐ THE TOP LEVEL KEEPS TODAY'S EXACT STRING, AND THAT IS NOT COSMETIC.
// `opening-stair-<stairId>` is PERSISTED: every saved project on disk carries
// openings under that id, and `DeleteStairCommand`'s heal resolves them by it.
// Minting a new format for the top deck would leave every existing project's void
// unowned — the delete would stop healing it, and the reconcile would carve a
// SECOND void beside it. So the legacy string is the top level's id forever, and
// only the ADDITIONAL decks take the suffixed form. This is a data-compatibility
// carve-out living in the id convention, which is where a data-compatibility fact
// belongs; it is pinned by `stairOpeningIdStability.test.ts`.

/** The prefix every one of a stair's auto-openings shares. Also the TOP level's whole id. */
export function stairAutoOpeningIdPrefix(stairId: string): string {
    return `opening-stair-${stairId}`;
}

/**
 * The id of the void this stair carves in the slab on `levelId`.
 *
 * Omit `levelId` (or pass the stair's own `topLevelId` as `topLevelId`) to get the
 * LEGACY id — the string every project saved before L-1433 already uses.
 */
export function stairAutoOpeningId(
    stairId: string,
    levelId?: string,
    topLevelId?: string,
): string {
    const legacy = stairAutoOpeningIdPrefix(stairId);
    if (levelId === undefined || levelId === topLevelId) return legacy;
    return `${legacy}--${levelId}`;
}

/**
 * Does `openingId` name one of `stairId`'s auto-openings — on ANY deck?
 *
 * ⛔ Not a bare `startsWith`: a bare prefix test would also match a DIFFERENT
 * stair whose id happens to extend this one's. The two accepted forms are the
 * legacy id exactly, or the legacy id followed by the `--<levelId>` separator.
 */
export function isStairAutoOpeningId(openingId: string, stairId: string): boolean {
    const legacy = stairAutoOpeningIdPrefix(stairId);
    return openingId === legacy || openingId.startsWith(`${legacy}--`);
}
