/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Pure function (NEW FILE) — geometry-cache key composer
 * Phase:             Project-Load-Performance Phase 7 (§8) — FOUNDATION ONLY
 * Files Modified:    src/elements/walls/composeWallGeometryHash.ts (new)
 * Classification:    A
 *
 * Impact Assessment:
 *   Store Reads:      NO — pure function over its arguments
 *   Store Writes:     NO
 *   Event Bus:        NO
 *   Builder Calls:    NO — not yet wired into WallFragmentBuilder
 *   Command Dispatch: NO
 *
 * Risk Level:   None — module is unreferenced by production code in this
 *               commit. Builder wiring is deferred to Phase 7-extension.
 *
 * Rationale:
 *   §18.2 Phase 7 critique #1 of PROJECT-LOAD-PERFORMANCE-13-PHASE-IMPLEMENTATION-PLAN.md
 *   warns that the existing in-memory `_composeCacheKey()` in
 *   WallFragmentBuilder.ts (which folds only `_renderVersion`, joinHash,
 *   and slabBaseOffsetTag) is INSUFFICIENT for cross-session persistence:
 *
 *     "Hash must include all eleven or stale hits will produce geometry
 *      that ignores opening edits — silent corruption."
 *
 *   The eleven inputs the critique lists are: baseLine, height, thickness,
 *   levelId, joinData (per-end miter/butt vector), wallSystemTypeId, and
 *   every WallOpening.{x, y, width, height, sillHeight}. This composer
 *   folds all of them, plus three extras the critique missed but the
 *   builder DOES consume:
 *
 *     - baseOffset           (vertical offset under wall — affects worldY)
 *     - curve descriptor      (straight vs arc — completely different geometry)
 *     - layers snapshot      (Contract §03-1.3 — layered walls have multi-layer geometry)
 *
 *   And one CRITICAL prefix that makes the cross-session story safe:
 *
 *     - SNAPSHOT_SCHEMA_VERSION (any schema bump invalidates every entry)
 *
 *   The `_renderVersion` field is DELIBERATELY OMITTED from this hash:
 *   it is a per-process counter that resets to 0 on reload, so two
 *   different walls in two different sessions can both sit at version
 *   `1` while having totally different geometry. Cross-session hashes
 *   must be content-addressed, not version-counter-addressed. The
 *   in-memory `_lastBuiltVersion` map continues to use `_renderVersion`
 *   for its in-process short-circuit — that's safe because the map is
 *   wiped on reload.
 *
 * Determinism:
 *   - All floats are pinned to 4 decimal places (matches the existing
 *     `_composeCacheKey` precision).
 *   - Openings are sorted by `id` before serialisation so re-orderings
 *     of the input array produce the same hash.
 *   - `levelId`, `wallSystemTypeId`, `materialId` are folded as raw
 *     strings; the caller must guarantee they are stable IDs (which
 *     WallStore does — see Contract §03-1.1).
 *
 * Output shape:
 *   `v${SNAPSHOT_SCHEMA_VERSION}|<base>|<dims>|<level>|<curve>|<openings>|<sys>|<layers>|<join>|<slabOff>`
 *   Plain ASCII string; safe as an IndexedDB key.
 */

import type { WallData, Opening } from './WallTypes';
import type { JoinData } from '@pryzm/core-app-model';
import { SNAPSHOT_SCHEMA_VERSION } from '@pryzm/core-app-model';

/** Pin a float to 4 decimal places (matches WallFragmentBuilder._composeCacheKey). */
function f(n: number | null | undefined): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return '_';
    return n.toFixed(4);
}

function hashOpening(o: Opening): string {
    // The 5 fields §18.2 lists: x, y, width, height, sillHeight.
    // The builder reads `offset` for x and synthesises y from sillHeight; we
    // include both raw fields plus type/doorType so a window→door swap also
    // invalidates. `id` is included as a tie-breaker for stable sort.
    const t = o.type === 'door' ? `d${o.doorType ?? ''}` : `w${o.windowType ?? ''}`;
    return `${o.id}:${t}:${f(o.offset)}:${f(o.width)}:${f(o.height)}:${f(o.sillHeight)}`;
}

function hashJoin(joinData: JoinData | null | undefined): string {
    if (!joinData) return '_';
    const sm = joinData.startMN ? `${f(joinData.startMN.nx)},${f(joinData.startMN.nz)}` : 'sq';
    const em = joinData.endMN   ? `${f(joinData.endMN.nx)},${f(joinData.endMN.nz)}`     : 'sq';
    const b0 = `${f(joinData.baseLine[0].x)},${f(joinData.baseLine[0].z)}`;
    const b1 = `${f(joinData.baseLine[1].x)},${f(joinData.baseLine[1].z)}`;
    return `${b0}-${b1}|${sm}|${em}`;
}

/**
 * Composes the cross-session-safe geometry-cache key for a wall.
 *
 * @param wall            The wall whose geometry will be cached.
 * @param joinData        Resolved join data from WallJoinResolver (may be null
 *                        for endpoints that are not joined to a neighbour).
 * @param slabBaseOffset  Slab base offset under the wall start (worldY shift),
 *                        defaults to 0 when undefined.
 *
 * @returns               Deterministic ASCII key suitable as an IndexedDB key.
 */
export function composeWallGeometryHash(
    wall:           WallData,
    joinData:       JoinData | null | undefined,
    slabBaseOffset: number | undefined,
): string {
    // Base — endpoint coordinates of the centreline.
    const a = wall.baseLine[0];
    const b = wall.baseLine[1];
    const base = `${f(a.x)},${f(a.y)},${f(a.z)}|${f(b.x)},${f(b.y)},${f(b.z)}`;

    // Dimensions — height, thickness, baseOffset (NOT in the §18.2 list but
    // documented in WallTypes.ts L208 as a wall-geometry input).
    const dims = `${f(wall.height)}|${f(wall.thickness)}|${f(wall.baseOffset)}`;

    // Curve descriptor — undefined → straight; present → arc with full params.
    const curveStr = wall.curve
        ? `c:${(wall.curve as unknown as { kind?: string }).kind ?? '?'}:${JSON.stringify(wall.curve)}`
        : 'straight';

    // Openings — stable-sorted by id so input array order does not affect hash.
    const sortedOpenings = [...wall.openings].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const openingsStr = sortedOpenings.length === 0
        ? 'no-op'
        : sortedOpenings.map(hashOpening).join(';');

    // System type + material — affect layer geometry and (for material) tinting
    // but not vertex positions; included so a system-type swap invalidates the
    // cache even when raw dimensions are identical.
    const sys = `${wall.systemTypeId ?? '_'}|${wall.materialId ?? '_'}`;

    // Layered-wall snapshot — Contract §03-1.3. When layers differ, the wall
    // builds with a completely different multi-layer geometry path.
    const layersStr = wall.layers && wall.layers.length > 0
        ? wall.layers.map(l => `${l.thickness ?? 0}:${l.materialId ?? '_'}`).join(',')
        : 'no-layers';

    const join    = hashJoin(joinData);
    const slabTag = f(slabBaseOffset ?? 0);

    return [
        `v${SNAPSHOT_SCHEMA_VERSION}`,
        base,
        dims,
        wall.levelId,
        curveStr,
        openingsStr,
        sys,
        layersStr,
        join,
        slabTag,
    ].join('|');
}
