/**
 * §GE-06-ROOF-WALL-WIRE — the adapter that makes `clash-run` genuinely DETECT.
 *
 * `roofWallClash.ts` next door is the algorithm: pure, oracle-tested (13 tests),
 * and — until this file — reachable from exactly ONE place, the level-reconcile
 * announcer in `apps/editor`. No USER-INVOKED verb could reach it. GE-06's row
 * called that state `EXISTS_BUT_UNWIRED`, and it is the "authored-but-unwired"
 * shape this repository keeps paying for: the code exists, the test is green,
 * and the button still does nothing.
 *
 * This module is the missing half. It turns the detector into the shape the
 * command bus's `ClashRunner` port consumes, so `clash-run` stops refusing and
 * starts answering — for the `roof×wall` pair ONLY, which it says out loud.
 *
 * ── WHY THE TYPES ARE RESTATED HERE RATHER THAN IMPORTED ────────────────────
 * The consuming port lives in `@pryzm/command-bus` (L1); this package is L2 and
 * does NOT depend on it. Adding that dependency to import two plain interfaces
 * would buy a package edge for a type alias, and would put a lockfile change in
 * a geometry lane. So the outcome is PLAIN DATA, structurally compatible with
 * `ClashRunnerOutcome` by construction:
 *
 *   { kind: 'ran',         findings: RoofWallClashRecord[] }
 *   { kind: 'unavailable', reason: 'RELATIONSHIP_NOT_READABLE', detail: string }
 *
 * The compatibility is not left to hope — `apps/editor/__tests__/
 * RoofWallClashVerbReach.test.ts` imports BOTH sides and assigns one to the
 * other, so a drift in either shape fails a real test rather than rotting.
 *
 * ── THE INVARIANT THIS FILE EXISTS TO HOLD (C70 L-INV-1) ────────────────────
 * `findings: []` here means **the model was read and nothing clashed**. It NEVER
 * means "the model could not be read". Every path that cannot reach a verdict
 * returns `kind: 'unavailable'` instead — including the three that are easiest
 * to get wrong, because each of them has a plausible-looking empty answer:
 *
 *   · no level source at all           → unavailable (not "no clashes")
 *   · a roof whose footprint is absent → unavailable (not "that roof is fine")
 *   · a level with no readable elevation → unavailable
 *
 * A model that genuinely contains no roofs IS a readable model with zero
 * roof×wall clashes, and returns `ran` with `[]`. That is the one empty this
 * file is allowed to produce, and the distinction is the whole point.
 *
 * PURE: no THREE, no DOM, no I/O, no Date, no Math.random. Deterministic —
 * identical input ⇒ deep-equal output, in level order then roof order.
 *
 * @file packages/geometry-roof/src/pure/roofWallClashRunner.ts
 */

import { offsetPolygonOrSelf, type Pt2 } from './polygonOffset.js';
import {
    detectRoofWallClashes,
    type RoofClashRoof,
    type RoofClashWall,
} from './roofWallClash.js';

/** The pair id this runner reports coverage of. Must match the bus manifest. */
export const ROOF_WALL_PAIR = 'roof×wall';

// ─── The model this runner reads, as a PORT ─────────────────────────────────
//
// Structural subsets, not store imports: the runner must be constructible from
// a test fixture as easily as from the live RoofStore/WallStore, or the only
// proof available is a mock proving itself.

/** The roof-record fields the runner reads (a structural subset of RoofData). */
export interface RoofClashSourceRoof {
    readonly id?: string;
    readonly footprint?: { readonly polygon?: ReadonlyArray<Pt2> };
    readonly roofType?: string;
    readonly slope?: number;
    readonly overhang?: number;
    readonly baseOffset?: number;
    readonly thickness?: number;
}

/** The wall-record fields the runner reads (a structural subset of WallData). */
export interface RoofClashSourceWall {
    readonly id?: string;
    readonly baseLine?: ReadonlyArray<{ readonly x?: number; readonly z?: number }>;
    readonly height?: number;
}

/**
 * Where the runner gets the model.
 *
 * `levelIds` is enumerated rather than inferred so that "there are no levels"
 * is a READABLE fact (a level source that returns `[]`) and distinguishable
 * from "there is no level source" (the whole object absent ⇒ unavailable).
 */
export interface RoofWallClashSource {
    /** Every level to sweep, in a deterministic order. */
    readonly levelIds: () => readonly string[];
    /** Roofs hosted on a level. */
    readonly roofsOnLevel: (levelId: string) => readonly RoofClashSourceRoof[];
    /** Walls hosted on a level — the walls BENEATH those roofs (same level). */
    readonly wallsOnLevel: (levelId: string) => readonly RoofClashSourceWall[];
    /**
     * World elevation of a level, metres. `undefined` ⇒ UNREADABLE, and the
     * run refuses. It must NOT default to 0: a roof measured against a
     * fabricated 0 elevation reads clean whenever the real elevation happens to
     * be positive, which is a green false-clean — the §L-616 shape.
     */
    readonly levelElevation: (levelId: string) => number | undefined;
}

/** One clash, in the bus's `CapabilityFindingRecord` shape (see header). */
export interface RoofWallClashRecord {
    readonly scope: string;
    readonly aId: string;
    readonly bId: string;
    readonly kind: string;
    readonly magnitudeM: number;
    readonly detail: string;
}

/** Structurally compatible with the bus's `ClashRunnerOutcome`. */
export type RoofWallClashRunOutcome =
    | { readonly kind: 'ran'; readonly findings: readonly RoofWallClashRecord[] }
    | { readonly kind: 'unavailable'; readonly reason: 'RELATIONSHIP_NOT_READABLE'; readonly detail: string };

/** Structurally compatible with the bus's `ClashRunner`. */
export interface RoofWallClashRunner {
    readonly pairs: readonly string[];
    run(): RoofWallClashRunOutcome;
}

function unreadable(detail: string): RoofWallClashRunOutcome {
    return { kind: 'unavailable', reason: 'RELATIONSHIP_NOT_READABLE', detail };
}

/**
 * Build the `roof×wall` clash runner over a model source.
 *
 * The returned runner reports `pairs: ['roof×wall']` — exactly what it looks
 * at, so the bus can compute the UNCHECKED remainder from its own manifest and
 * the report cannot over-claim.
 */
export function createRoofWallClashRunner(source: RoofWallClashSource): RoofWallClashRunner {
    return {
        pairs: [ROOF_WALL_PAIR],
        run(): RoofWallClashRunOutcome {
            // ── Guard 1: is there a model at all? ────────────────────────────
            // An absent source is "I could not look". Returning [] here would be
            // the defect this whole module is built to prevent.
            if (
                typeof source?.levelIds !== 'function' ||
                typeof source.roofsOnLevel !== 'function' ||
                typeof source.wallsOnLevel !== 'function' ||
                typeof source.levelElevation !== 'function'
            ) {
                return unreadable(
                    'the model source is incomplete — levels, roofs, walls or elevations are not readable from this build.',
                );
            }

            const levelIds = source.levelIds();
            if (!Array.isArray(levelIds)) {
                return unreadable('the level list could not be read (levelIds() did not return a list).');
            }

            const findings: RoofWallClashRecord[] = [];

            for (const levelId of levelIds) {
                const roofs = source.roofsOnLevel(levelId) ?? [];
                // A level with no roofs contributes no roof×wall pair to check.
                // This is a READ that found nothing, not a failure to read.
                if (roofs.length === 0) continue;

                const elevation = source.levelElevation(levelId);
                if (typeof elevation !== 'number' || !Number.isFinite(elevation)) {
                    // A roof exists here and we cannot place it in space. Any
                    // verdict would be invented, so the WHOLE run refuses —
                    // partial silence over an unreadable level would let the
                    // remaining levels' `[]` speak for this one too.
                    return unreadable(
                        `level "${levelId}" hosts ${roofs.length} roof(s) but has no readable elevation, ` +
                        `so their height above the walls cannot be established.`,
                    );
                }

                const wallRecords = source.wallsOnLevel(levelId) ?? [];
                const walls: RoofClashWall[] = [];
                for (const w of wallRecords) {
                    const bl = w?.baseLine;
                    if (!w?.id || !bl || bl.length < 2 || typeof w.height !== 'number') continue;
                    const a = bl[0]!;
                    const b = bl[bl.length - 1]!;
                    walls.push({
                        id: w.id,
                        start: [a.x ?? 0, a.z ?? 0],
                        end: [b.x ?? 0, b.z ?? 0],
                        baseElevationY: elevation,
                        heightM: w.height,
                    });
                }
                // No walls beneath ⇒ no roof×wall pair on this level. Read, empty.
                if (walls.length === 0) continue;

                for (const r of roofs) {
                    const poly = r?.footprint?.polygon;
                    if (!r?.id || !poly || poly.length < 3) {
                        // A roof we cannot outline cannot be cleared. Refuse for
                        // the run rather than skip it silently: a skipped roof
                        // would be indistinguishable from a clean one.
                        return unreadable(
                            `roof "${r?.id ?? '(unidentified)'}" on level "${levelId}" has no readable ` +
                            `footprint polygon, so nothing can be said about the walls beneath it.`,
                        );
                    }
                    const overhang = r.overhang ?? 0;
                    // The same expansion RoofGeometryBuilder._applyOverhang makes,
                    // so eave membership matches the geometry actually built.
                    const eavePolygon =
                        overhang > 0 ? offsetPolygonOrSelf(poly, overhang).polygon : poly;

                    const roof: RoofClashRoof = {
                        id: r.id,
                        eavePolygon,
                        form: r.roofType === 'flat' ? 'flat' : 'pitched',
                        originY: elevation + (r.baseOffset ?? 0),
                        thicknessM: r.thickness ?? 0,
                        slope: r.slope ?? 0,
                    };

                    for (const f of detectRoofWallClashes(roof, walls)) {
                        findings.push({
                            scope: ROOF_WALL_PAIR,
                            aId: f.roofId,
                            bId: f.wallId,
                            kind: f.kind,
                            magnitudeM: f.magnitudeM,
                            detail:
                                f.kind === 'penetrates'
                                    ? `wall "${f.wallId}" penetrates the underside of roof "${f.roofId}" by ` +
                                      `${f.magnitudeM.toFixed(3)} m on level "${levelId}".`
                                    : `wall "${f.wallId}" stops ${f.magnitudeM.toFixed(3)} m short of roof ` +
                                      `"${f.roofId}" on level "${levelId}", leaving a gap.`,
                        });
                    }
                }
            }

            // Reached ONLY when every level was readable. `[]` here is a real
            // zero: the model was read and the roof×wall pair is clean.
            return { kind: 'ran', findings };
        },
    };
}
