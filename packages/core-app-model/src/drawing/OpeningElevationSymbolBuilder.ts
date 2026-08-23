/**
 * OpeningElevationSymbolBuilder — §ELEV-SYMBOL-OPENING (L-1240)
 *
 * **THE INJECTION SEAM for the authored door/window elevation symbol.** It is the sibling of
 * `PlumbingElevationSymbolBuilder` (L-221 P3) — the only prior elevation symbol builder in the
 * tree — and it is deliberately the SAME seam, in the same order, so there is one way an
 * elevation symbol reaches a drawing rather than two:
 *
 *     local set-out → world transform → toDrawingSpace → addProjectionLines → registerSegmentUUID
 *
 * ⭐ **WHERE IT DIFFERS FROM THE PLUMBING PRECEDENT, AND WHY THAT DIFFERENCE IS THE POINT.**
 * `PlumbingElevationSymbolBuilder` injects onto a FLAT `'A-PLMB'` — a layer with no zone suffix,
 * which `drawingZoneFromLayerName()` classifies as `null`. That is the zone ladder being
 * flattened at the last mile, and it is the SAME shape as the L-280 defect this family already
 * shipped once (`SymbolicRuleRenderer`'s header records it at length). This builder emits onto
 * ZONE-SUFFIXED layers — `A-GLAZ-SYM:proj`, `A-DOOR-SYM:hidden` — so every injected line
 * arrives at `PlanViewCanvas` carrying a real zone, resolves its pen through
 * `graphicsRulesEngine.resolveStyle()` like every other line in the drawing, and a per-view or
 * per-element override reaches it. ⛔ Do not "simplify" these to a flat layer.
 *
 * ⭐ **AND IT STAMPS `elementUUID`.** That is not bookkeeping: `PlanViewCanvas` reads it back to
 * key the ELEMENT-tier (priority 10000) graphics rule, so *"re-weight THIS window"* reaches
 * these lines. The founder has already lived the opposite — L-280's *"the founder could
 * re-weight his windows and watch nothing happen"* — and `PenOverrideReachesElevationSymbol`
 * in `OpeningElevationSymbol.test.ts` is the differentiating test for it.
 *
 * ── THE `-SYM` LAYER SUFFIX IS A SAFETY PROPERTY, NOT A NAMING TASTE ─────────────────────────
 * `symbolicRuleForLayer()`'s elevation arm requires `-SYM` before it will route anything. Only
 * linework this builder injects carries it. So enabling the elevation arm cannot re-route a
 * single line that already exists on `A-GLAZ:proj` / `A-DOOR:proj` — it can only route lines
 * that did not exist before this builder ran. That is what makes the change additive by
 * construction rather than by inspection.
 *
 * ⚠ **WHAT THIS DOES NOT DO, STATED SO IT IS NOT ASSUMED.** It does NOT suppress the existing
 * raw mesh edge-dump for doors and windows in elevation. Until that suppression lands (the
 * `skipInElevation` sibling, in `EdgeProjectorService`), an elevation shows the authored symbol
 * ON TOP OF the solid's wireframe — strictly more correct linework, and strictly no less
 * clutter. Both halves are named in L-1240; shipping the symbol first is what makes the
 * suppression provable rather than a swap of one unverified drawing for another.
 *
 * Contract compliance:
 *   C09 §4.6.1 / §4.6.4b — zone-suffixed layers; the pen table stays the only pen authority
 *   C86 §10.1 PR-1       — the outline comes from ONE producer; nothing is re-derived here
 *   C86 §10.2            — head and sill horizontal in every elevation
 *   C05 §4               — no DOM; THREE + OBC only, as every drawing-side builder uses
 *
 * @module OpeningElevationSymbolBuilder
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import {
    resolveWallBaseYOrLevel,
    rakeShearPerMetre,
    hasWallProfile,
    computeStations,
} from '@pryzm/geometry-wall';
import * as THREEForStations from '@pryzm/renderer-three/three';
import {
    buildWallElevationSymbol,
    wallNearFaceSign,
    type WallStationSample,
} from './WallElevationSymbol';
import { storeRegistry } from '../StoreRegistry';
import { registerSegmentUUID } from '../views/DrawingSelectionIndex';
import { layerForZone, type DrawingZone } from './DrawingZone';
// §ELEV-SYMBOL-KEEPS-THE-DEPTH (L-5303) — the ONE name of the depth stamp an occluder is
// ordered by. Imported rather than re-spelt: a second literal 'viewDepth' here would be a
// second authority for the key, and the engine that reads it is the only one entitled to name it.
import { VIEW_DEPTH_KEY } from './HiddenLineRemoval';
import {
    buildOpeningElevationSymbol,
    nearFaceSign,
    type ElevationSymbolOpening,
    type SymbolDetail,
} from './OpeningElevationSymbol';

/** The two base layers. The `-SYM` token is what the elevation symbol arm keys on. */
export const GLAZ_SYM_LAYER = 'A-GLAZ-SYM';
export const DOOR_SYM_LAYER = 'A-DOOR-SYM';
/** §ELEV-SYMBOL-WALL (L-1242) — the wall's own authored elevation linework. */
export const WALL_SYM_LAYER = 'A-WALL-SYM';

interface ReadableWallStore {
    getAll: () => Array<{
        id: string;
        levelId?: string;
        baseLine: Array<{ x: number; y?: number; z: number }>;
        thickness: number;
        baseOffset?: number;
        rakeAngleDeg?: number | null;
        height?: number;
        // ⚠ THE FIELD IS `curve`, NOT `arc`. The first cut of this file read `wall.arc`,
        // which does not exist on `WallData` — so `curved` was ALWAYS false and the C86
        // §10.1 PR-5 curved-host refusal could never fire. Found by the L-1242 dump, which
        // had to build a curved wall and went looking for the real field name.
        curve?: { control?: { x: number; y?: number; z: number }; segments?: number } | null;
        /**
         * ⚠ THE FIELD IS `wallProfile`, NOT `profile` — corrected 2026-08-23 (OPEN38, L-7404),
         * and it is THE SAME DEFECT the `curve` note directly above records, in the same
         * declaration, found the same way and missed the first time.
         *
         * `WallData` declares `wallProfile` (`WallTypes.ts:398`); `WallStore` writes
         * `wallProfile`; the take-off reads `w.wallProfile?.ring`. This block declared
         * `profile`, so `hasWallProfile(wall.profile)` was ALWAYS FALSE — which made the
         * `PROFILED_TOP` refusal at `WallElevationSymbol.ts:216` unreachable in production
         * while its own test passed, because that test hands `hasProfile: true` in by hand
         * and therefore cannot see the name.
         *
         * ⛔ THE CONSEQUENCE WAS NOT A MISSING REFUSAL, IT WAS A FALSE DRAWING. The symbol
         * emits a flat-topped rectangle from `host.height`, AND the builder suppresses the
         * wall's true projected linework (`coveredElementIds.add(wall.id)`). So a gabled wall
         * was drawn in elevation as a rectangle with its real outline removed — exactly the
         * *"replace a cluttered TRUE drawing with a clean FALSE one"* this file's own header
         * forbids by name. A typo, not a design decision, and it cost the more expensive half.
         */
        wallProfile?: unknown;
        openings?: Array<{
            id: string;
            type: 'window' | 'door';
            offset: number;
            width: number;
            height: number;
            sillHeight: number;
            elementId?: string;
            doorType?: 'single' | 'double';
            windowType?: 'single' | 'double';
            openingProfile?: unknown;
        }>;
    }>;
}

interface ReadableDoorStore {
    getAll?: () => Array<{
        id: string;
        openingId?: string;
        hingesSide?: 'left' | 'right';
        swingDirection?: 'inward' | 'outward';
    }>;
}

/** Minimal view shape — deliberately structural, so the builder needs no L4 view type. */
export interface ElevationSymbolViewDef {
    readonly id: string;
    readonly viewType?: string;
    readonly spatial?: {
        readonly levelId?: string;
        readonly projectionDirection?: { x: number; y?: number; z: number };
        readonly detailLevel?: unknown;
    };
}

/**
 * §ELEV-DIAG — WHICH OF D1 / D2 / D3 IS THIS VIEW EXHIBITING?
 *
 * ⭐ **AN INSTRUMENT, NOT ANOTHER ROUND OF GUESSING.** The founder's screenshot proves an opening
 * is malformed; it does not say WHICH of the three measured mechanisms produced it, and this lane
 * could not determine that from a picture. Rather than leave the question to argument, the view
 * reports its own answer — the same move that made the original dump beat the lane brief's theory.
 *
 * Read it from the console line `[ELEV-DIAG]`, or from this record.
 */
export interface ElevationDiagnosis {
    /**
     * **D1 — THE SKEW.** True when this view's projection direction is NOT one of the six axes
     * OBC's `orientTo` handles, i.e. when the drawing WOULD have kept the identity quaternion and
     * drawn a PLAN before `ElevationViewBasis` landed. ⚠ This reports the CONDITION, not a live
     * defect: the basis fix means the view now draws correctly either way. It is here so a
     * founder screenshot can be attributed.
     */
    readonly nonCardinalView: boolean;
    /** The view direction, echoed so a report names the input rather than describing it. */
    readonly directionXZ: readonly [number, number];
    /**
     * **D2 — THE LEAN.** How many opening-bearing hosts in this view are BOTH raked AND oblique to
     * the sheet. Their jambs lean by `atan(cot(rake)·sin(bearing))` — and that lean is a CORRECT
     * projection of a genuinely leaning solid, so a non-zero count here means the drawing may be
     * right and the expectation is what needs reconciling.
     */
    readonly rakedObliqueHosts: number;
    /** The largest such lean, in degrees. 0 when `rakedObliqueHosts` is 0. */
    readonly maxJambTiltDeg: number;
    /** **D3 — THE WIREFRAME.** Openings that received an authored symbol. */
    readonly symbolsInjected: number;
    /** **D3.** Raw projected linework layers removed because their element gained a symbol. */
    readonly rawLayersSuppressed: number;
    /**
     * §ELEV-SYMBOL-WALL (L-1242) — walls that received an authored symbol.
     *
     * ⭐ Reported separately from `symbolsInjected` because the founder's two reports were
     * *"the WINDOWS [render correctly], but the WALL not"* — the two families are the thing being
     * distinguished, so one combined count would hide exactly the distinction he drew.
     */
    readonly wallSymbolsInjected: number;
    /** Walls REFUSED a symbol (profiled top, degenerate arc) — these KEEP their linework. */
    readonly wallSymbolsRefused: number;
    /** Curved walls symbolised — each one is `2 x (segments + 1)` verticals NOT drawn. */
    readonly curvedWallsSymbolised: number;
}

export interface InjectResult {
    /** Openings whose symbol was emitted. */
    readonly injected: number;
    /**
     * Openings the producer REFUSED, with their reasons.
     *
     * ⛔ Returned rather than swallowed. C16 CA-18: a refusal the caller cannot see is a silent
     * narrowing, and this family already has the precedent — an envelope hard-reject that fell
     * through to `[]` and looked exactly like "no constraints apply".
     */
    readonly refusals: ReadonlyArray<{ openingId: string; code: string; reason: string }>;
    /**
     * ⭐ **THE ELEMENTS WHOSE SYMBOL WAS ACTUALLY EMITTED — the key to the suppression.**
     *
     * `suppressSymbolisedElementLinework()` removes raw projected linework for exactly these ids
     * and no others. That is a DERIVED rule, not a remembered one: there is no list of "element
     * types that have elevation symbols" to fall out of date, an opening the builder skipped or
     * REFUSED keeps its wireframe automatically, and a future family that gains a symbol is
     * covered the day it does with no edit here.
     */
    readonly coveredElementIds: ReadonlySet<string>;
    /** §ELEV-DIAG — which of D1 / D2 / D3 this view is exhibiting. */
    readonly diagnosis: ElevationDiagnosis;
}

export class OpeningElevationSymbolBuilder {
    /**
     * Inject the authored elevation symbol for every opening visible in this elevation.
     *
     * Filters by the view's level when it carries one; a building-wide elevation (no `levelId`)
     * takes every opening and lets the crop and the occlusion pass cull — the same rule
     * `PlumbingElevationSymbolBuilder` uses, restated rather than re-decided.
     */
    inject(drawing: OBC.TechnicalDrawing, viewDef: ElevationSymbolViewDef): InjectResult {
        const levelId = viewDef.spatial?.levelId;
        const dir = viewDef.spatial?.projectionDirection ?? { x: 0, y: 0, z: -1 };
        const dirX = Number(dir.x) || 0;
        const dirZ = Number(dir.z) || 0;
        const coveredElementIds = new Set<string>();
        let rakedObliqueHosts = 0;
        let maxJambTiltDeg = 0;
        let wallSymbolsInjected = 0;
        let wallSymbolsRefused = 0;
        let curvedWallsSymbolised = 0;
        const diagnose = (rawLayersSuppressed: number, n: number): ElevationDiagnosis => ({
            nonCardinalView: !_isCardinalXZ(dirX, dirZ),
            directionXZ: [dirX, dirZ],
            rakedObliqueHosts,
            maxJambTiltDeg,
            symbolsInjected: n,
            rawLayersSuppressed,
            wallSymbolsInjected,
            wallSymbolsRefused,
            curvedWallsSymbolised,
        });

        const wallStore = storeRegistry.getStoreForType('wall') as unknown as ReadableWallStore | undefined;
        if (!wallStore || typeof wallStore.getAll !== 'function') {
            return { injected: 0, refusals: [], coveredElementIds, diagnosis: diagnose(0, 0) };
        }

        const detail = _resolveDetail(viewDef.spatial?.detailLevel);
        const swingByOpening = _readSwings();

        let injected = 0;
        const refusals: Array<{ openingId: string; code: string; reason: string }> = [];

        for (const wall of wallStore.getAll()) {
            const openings = wall.openings;
            // ⚠ THE `continue` THAT USED TO BE HERE READ `if (!openings?.length) continue;`.
            // That was right while this builder only drew OPENINGS. §ELEV-SYMBOL-WALL (L-1242)
            // draws the WALL too, and a blank wall — no openings at all — is exactly the one a
            // founder notices drawing as a doubled wireframe with nothing on top of it. The
            // opening loop below is now the thing that is skipped, not the whole wall.
            if (levelId && wall.levelId && wall.levelId !== levelId) continue;
            const a = wall.baseLine?.[0];
            const b = wall.baseLine?.[1];
            if (!a || !b) continue;

            // §WALL-Y-DATUM (L-968) — THE PUBLISHED datum, never a second derivation. A wall on
            // a raised slab has a base plane no wall record can express, and re-deriving it as
            // `level.elevation + baseOffset` is exactly how a hosted element came to be seated
            // from the wrong rise once already.
            const baseY = resolveWallBaseYOrLevel(wall.id, Number(a.y) || 0, wall.baseOffset);
            const host = {
                baseStart: { x: a.x, z: a.z },
                baseEnd:   { x: b.x, z: b.z },
                baseY,
                thickness: wall.thickness,
                rakeAngleDeg: wall.rakeAngleDeg ?? null,
                curved: wall.curve != null,
            };
            const faceSign = nearFaceSign(host, { x: dirX, z: dirZ });

            // §ELEV-DIAG D2 — does THIS host lean on THIS sheet, and by how much? The jamb of an
            // opening in a raked wall tilts by `atan(cot(rake) * sin(bearing))`, where `bearing`
            // is the angle between the wall and the picture plane. BOTH factors are needed: a
            // raked wall square-on leans by nothing (probe case B), and an oblique wall with no
            // rake leans by nothing (case E). Measured from the SAME host record the symbol is
            // set out from, so the diagnosis cannot disagree with the drawing.
            const tilt = _jambTiltDeg(host, dirX, dirZ);
            if (tilt > 1e-9) {
                rakedObliqueHosts++;
                if (tilt > maxJambTiltDeg) maxJambTiltDeg = tilt;
            }

            // ── §ELEV-SYMBOL-WALL (L-1242) — THE WALL ITSELF ─────────────────
            //
            // Measured root (`WallElevationSymbol.probe.test.ts`): a wall OBLIQUE to the sheet
            // draws BOTH its faces, `thickness x sin(bearing)` apart, plus the depth edges
            // between them — and a CURVED wall additionally draws `2 x (segments + 1)`
            // tessellation seams as verticals. The authored symbol draws the near face ONCE and
            // traces the arc continuously, and the L-1240 suppression below takes the solid away.
            const wallSym = buildWallElevationSymbol({
                id: wall.id,
                baseStart: host.baseStart,
                baseEnd: host.baseEnd,
                baseY,
                height: Number(wall.height) || 0,
                thickness: wall.thickness,
                rakeAngleDeg: wall.rakeAngleDeg ?? null,
                stations: _wallStations(wall, a, b),
                // A profiled wall REFUSES and keeps its raw linework — the symbol draws a FLAT
                // top and would otherwise draw a top the wall does not have.
                hasProfile: hasWallProfile(wall.wallProfile),
            }, { faceSign: wallNearFaceSign(host, { x: dirX, z: dirZ }) });

            if (wallSym.refusal) {
                wallSymbolsRefused++;
                refusals.push({
                    openingId: wall.id,
                    code: wallSym.refusal.code,
                    reason: `${wallSym.refusal.reason} — ${wallSym.refusal.alternative}`,
                });
            } else if (wallSym.polylines.length > 0) {
                if (_emit(drawing, WALL_SYM_LAYER, wallSym.polylines, wall.id)) {
                    wallSymbolsInjected++;
                    if (wall.curve != null) curvedWallsSymbolised++;
                    // Same covered set, same suppression. ⛔ NOT a second mechanism — reusing the
                    // one that is already pinned both ways is what makes "a wall the builder
                    // skipped keeps its linework" true for walls without re-proving it.
                    coveredElementIds.add(wall.id);
                }
            }

            if (!openings?.length) continue;

            for (const op of openings) {
                const swing = op.elementId ? swingByOpening.get(op.elementId) : undefined;
                const symOpening: ElevationSymbolOpening = {
                    id: op.id,
                    type: op.type === 'door' ? 'door' : 'window',
                    offset: op.offset,
                    width: op.width,
                    height: op.height,
                    sillHeight: op.sillHeight,
                    openingProfile: op.openingProfile,
                    leafCount: (op.type === 'door' ? op.doorType : op.windowType) ?? null,
                    hingesSide: swing?.hingesSide ?? null,
                    swingDirection: swing?.swingDirection ?? null,
                };

                const result = buildOpeningElevationSymbol(symOpening, host, { detail, faceSign });
                if (result.refusal) {
                    refusals.push({
                        openingId: op.id,
                        code: result.refusal.code,
                        reason: `${result.refusal.reason} — ${result.refusal.alternative}`,
                    });
                    continue;
                }
                if (result.polylines.length === 0) continue;

                const base = symOpening.type === 'door' ? DOOR_SYM_LAYER : GLAZ_SYM_LAYER;
                const uuid = op.elementId ?? op.id;
                // §TRUE-PROJECTION-HOST-NEVER-HIDES-ITS-OPENING (L-6013) — `wall.id` IS the host
                // of every opening in this loop, by construction of the loop itself.
                if (_emit(drawing, base, result.polylines, uuid, wall.id)) {
                    injected++;
                    // RECORDED ONLY ON A SUCCESSFUL EMIT. A refusal `continue`s above and a
                    // zero-polyline result returns before this, so an opening that got NO symbol
                    // is never in this set and therefore keeps its raw linework. That is the
                    // both-ways safety property, and it is a consequence of WHERE this line sits.
                    coveredElementIds.add(uuid);
                }
            }
        }

        if (refusals.length > 0) {
            // §ELEV-SHEAR-SURVIVES-THE-PROXY (L-10140) — "opening(s)" was a MISLABEL. Since
            // §ELEV-SYMBOL-WALL (L-1242) this array also carries WALL refusals (`PROFILED_TOP`,
            // `DEGENERATE_HOST`, `DEGENERATE_ARC`, pushed at `:329` under a field still named
            // `openingId`), so a founder grepping his console for a refused WALL found a line
            // that said no wall had been refused. The verb is unchanged; only the noun is now
            // true. ⭐ And the second clause is the part that matters: a refusal here is not a
            // hole in the drawing — the element KEEPS its projected linework, which is why
            // `coveredElementIds` is only ever added to on a successful emit.
            console.warn(
                `[OpeningElevationSymbolBuilder] ${refusals.length} element(s) (openings and/or `
                + `walls) REFUSED a symbol in view ${viewDef.id} — each KEEPS its projected `
                + `linework: ` + refusals.map(r => `${r.openingId} (${r.code}) — ${r.reason}`).join(' · '),
            );
        }
        if (injected > 0) {
            console.log(
                `[OpeningElevationSymbolBuilder] §ELEV-SYMBOL-OPENING injected ${injected} `
                + `opening elevation symbol(s) into view ${viewDef.id}`,
            );
        }
        return { injected, refusals, coveredElementIds, diagnosis: diagnose(0, injected) };
    }
}

/**
 * THE OTHER HALF OF THE FIX: THE AUTHORED SYMBOL *REPLACES* THE SOLID'S LINEWORK.
 *
 * Removes the raw projected linework of exactly those elements whose elevation symbol was
 * emitted -- the `coveredElementIds` {@link OpeningElevationSymbolBuilder.inject} returns.
 *
 * WHY IT IS KEYED ON THE EMITTED SET AND NOT ON A LIST OF TYPES
 *
 * The obvious implementation is *"in an elevation, skip meshes whose `elementType` is Door or
 * Window"*. That is a REMEMBERED rule -- a hand-listed set of types ASSUMED to have symbols --
 * and it fails in BOTH directions:
 *
 *   - an opening the builder skipped, REFUSED (C86 10.1 PR-5, curved host), or could not reach
 *     because the wall store was absent would have its linework DELETED AND NOTHING DRAWN IN ITS
 *     PLACE -- a silent disappearance, which is worse than the clutter it replaced;
 *   - a family that gains an elevation symbol later is not covered until somebody remembers to
 *     edit the list.
 *
 * Keying on what was ACTUALLY EMITTED DERIVES the rule instead. There is no enumeration to fall
 * out of date -- which matters because a stale hand-written enumeration is this repo's most
 * repeated defect shape (an event list missing eleven families; a cache keyed on an event with
 * zero emitters; a restore path that grew a fifth member nobody updated).
 *
 * `-SYM` LAYERS ARE NEVER REMOVED. The symbol's own linework carries the same `elementUUID`, so
 * without that guard this function would delete the very thing it exists to protect.
 *
 * NOT MEASURED -- the occlusion consequence. Running before `applyOcclusion()` means a symbolised
 * opening's SOLID no longer contributes a projection occluder, and the injected symbol carries no
 * `viewDepth` stamp so it cannot become one either (an unstamped `:proj` layer is silently
 * disqualified -- `HiddenLineRemoval`'s own rule). The host WALL's occluder is untouched and a
 * window is mostly glazing, so the practical change is small -- but it IS a change, it is
 * unmeasured, and it is recorded rather than assumed away.
 *
 * @returns what was removed, for the caller's diagnosis line.
 */
export function suppressSymbolisedElementLinework(
    drawing: OBC.TechnicalDrawing,
    coveredElementIds: ReadonlySet<string>,
): { removedLayers: number; removedSegments: number } {
    if (coveredElementIds.size === 0) return { removedLayers: 0, removedSegments: 0 };
    const container = (drawing as unknown as { three?: THREE.Object3D }).three;
    if (!container) return { removedLayers: 0, removedSegments: 0 };

    const doomed: THREE.Object3D[] = [];
    // §ELEV-SYMBOL-KEEPS-THE-DEPTH (L-5303) — see the note below the loop.
    const solidDepth  = new Map<string, number>();
    const symbolNodes = new Map<string, THREE.LineSegments[]>();
    let removedSegments = 0;
    for (const child of container.children) {
        const ls = child as THREE.LineSegments;
        if (!(ls as unknown as { isLineSegments?: boolean }).isLineSegments) continue;
        const uuid = ls.userData?.elementUUID as string | undefined;
        if (!uuid || !coveredElementIds.has(uuid)) continue;
        const layerName = String(ls.userData?.layerName ?? ls.name ?? '');
        // Never the symbol's own linework -- it carries the same elementUUID by design.
        if (SYM_LAYER_RE.test(layerName)) {
            const bucket = symbolNodes.get(uuid);
            if (bucket) bucket.push(ls); else symbolNodes.set(uuid, [ls]);
            continue;
        }
        const d = ls.userData?.[VIEW_DEPTH_KEY];
        if (typeof d === 'number' && Number.isFinite(d)) {
            const prev = solidDepth.get(uuid);
            if (prev === undefined || d < prev) solidDepth.set(uuid, d);
        }
        removedSegments += ((ls.geometry?.getAttribute('position')?.count ?? 0) / 2) | 0;
        doomed.push(ls);
    }

    for (const d of doomed) {
        container.remove(d);
        const geo = (d as THREE.LineSegments).geometry;
        if (geo && typeof geo.dispose === 'function') geo.dispose();
    }

    // ── §ELEV-SYMBOL-KEEPS-THE-DEPTH (L-5303) — THE SYMBOL INHERITS THE SOLID'S DEPTH ──
    //
    // ⚠ This closes the consequence the header above recorded as *"NOT MEASURED"*, and the
    // reasoning it offered — *"the host WALL's occluder is untouched"* — is TRUE for an
    // OPENING symbol and FALSE for a WALL symbol (§ELEV-SYMBOL-WALL, L-1242), where the host
    // IS the element whose linework this function just deleted.
    //
    // Measured consequence before this block: a symbolised façade wall occluded NOTHING.
    // `_emit()` stamps `layerName` and `elementUUID` on the injected symbol and never
    // `viewDepth`, and `HiddenLineRemoval.buildOccluderList()` refuses an unstamped `:proj`
    // node as an occluder — correctly, since an unordered projection occluder could hide
    // geometry that is actually NEARER than it. So the solid occluder was deleted here and
    // its replacement could not become one. The founder's interior door then drew with
    // PROJECTION lines through a façade, which is his report verbatim.
    //
    // The transfer is the only honest source for the number: the symbol REPLACES that solid,
    // stands where it stood, and therefore has exactly its nearest depth along the view
    // direction. Nothing is invented — an element whose solid carried no stamp leaves its
    // symbol unstamped, and the engine goes on refusing to guess. An existing stamp on a
    // symbol is never overwritten.
    if (solidDepth.size > 0) {
        for (const [uuid, depth] of solidDepth) {
            for (const sym of symbolNodes.get(uuid) ?? []) {
                if (typeof sym.userData[VIEW_DEPTH_KEY] === 'number') continue;
                sym.userData[VIEW_DEPTH_KEY] = depth;
            }
        }
    }

    return { removedLayers: doomed.length, removedSegments };
}

/**
 * A curved wall's stations, from `computeStations` — THE sampler `buildCurvedLayerGeometry`
 * builds the body from.
 *
 * ⭐ Calling the body's own sampler is the point. A second arc sampler here would be a second
 * answer to *"where along the wall is this?"*, and `CurvedWallLayerBuilder`'s header names that
 * as the shape of every join defect this subsystem has had. Returns `null` for a straight wall.
 *
 * ⚠ `computeStations` returns centreline points RELATIVE TO `start`, so they are re-based here.
 */
function _wallStations(
    wall: { curve?: { control?: { x: number; y?: number; z: number }; segments?: number } | null },
    a: { x: number; y?: number; z: number },
    b: { x: number; y?: number; z: number },
): WallStationSample[] | null {
    const curve = wall.curve;
    if (!curve?.control) return null;
    const segments = Number(curve.segments);
    if (!Number.isFinite(segments) || segments < 2) {
        // Curved but unusable — return a one-entry list so the symbol REFUSES (DEGENERATE_ARC)
        // rather than silently drawing the chord where the building has an arc.
        return [{ x: a.x, z: a.z, nx: 0, nz: 0 }];
    }
    const V = THREEForStations.Vector3;
    const st = computeStations(
        new V(a.x, 0, a.z),
        new V(b.x, 0, b.z),
        new V(curve.control.x, 0, curve.control.z),
        Math.round(segments),
    );
    if (!st || st.length < 2) return [{ x: a.x, z: a.z, nx: 0, nz: 0 }];
    return st.map(s => ({ x: a.x + s.cx, z: a.z + s.cz, nx: s.nx, nz: s.nz }));
}

/** The token that marks INJECTED symbol linework. Shared with `symbolicRuleForLayer`'s arm. */
const SYM_LAYER_RE = /-SYM\b/i;

/** The six directions OBC's `orientTo` handles. Used ONLY to diagnose, never to decide. */
function _isCardinalXZ(x: number, z: number): boolean {
    const l = Math.hypot(x, z);
    if (!(l > 1e-9)) return true;               // vertical => a plan, and orientTo handles +/-Y
    const nx = Math.abs(x / l), nz = Math.abs(z / l);
    return nx > 0.999 || nz > 0.999;
}

/**
 * ELEV-DIAG D2 -- the jamb lean of an opening in `host`, drawn on a sheet whose view direction is
 * `(dirX, dirZ)`, in degrees. Zero for an unraked host AND for a host parallel to the sheet.
 *
 * `cot(rake)` comes from the ONE canonical predicate. The second factor is how much of the wall's
 * own normal lies IN the picture plane -- which is exactly the fraction of the rake displacement
 * the sheet can see.
 */
function _jambTiltDeg(
    host: {
        baseStart: { x: number; z: number };
        baseEnd: { x: number; z: number };
        rakeAngleDeg?: number | null;
    },
    dirX: number, dirZ: number,
): number {
    const k = rakeShearPerMetre(host.rakeAngleDeg);
    if (k === 0) return 0;
    const dx = host.baseEnd.x - host.baseStart.x;
    const dz = host.baseEnd.z - host.baseStart.z;
    const wl = Math.hypot(dx, dz);
    const vl = Math.hypot(dirX, dirZ);
    if (!(wl > 1e-9) || !(vl > 1e-9)) return 0;
    // leftPerp of the wall -- the direction the rake displaces the top along.
    const lpx = -dz / wl, lpz = dx / wl;
    // Square-on => |dot| = 1 => in-plane component 0 => no visible lean (probe case B).
    const dot = (lpx * dirX + lpz * dirZ) / vl;
    const inPlane = Math.sqrt(Math.max(0, 1 - dot * dot));
    return (Math.atan(Math.abs(k) * inPlane) * 180) / Math.PI;
}

/**
 * One emitted polyline, as `_emit` needs it.
 *
 * ⭐ Deliberately STRUCTURAL rather than a union of `ElevationSymbolPolyline |
 * WallElevationSymbolPolyline`. The two differ only in their `role` vocabulary, which `_emit`
 * never reads — and a union here would have to be widened again for every family that gains an
 * elevation symbol, which is the hand-maintained enumeration L-1240 removed from the suppression.
 * What `_emit` actually requires is a zone, some points and whether they close.
 */
interface EmittablePolyline {
    readonly zone: DrawingZone;
    readonly points: readonly { x: number; y: number; z: number }[];
    readonly closed: boolean;
}

/** Group by zone so each zone's polylines share one LineSegments — one pen resolution each. */
function _emit(
    drawing: OBC.TechnicalDrawing,
    baseLayer: string,
    polylines: readonly EmittablePolyline[],
    elementUUID: string,
    /**
     * §TRUE-PROJECTION-HOST-NEVER-HIDES-ITS-OPENING (L-6013) — the id of the WALL this symbol
     * is hosted in (C15), or `undefined` for the wall's own symbol.
     *
     * ⭐ THIS PARAMETER IS WHY THE FIX REACHES THE FOUNDER'S BUILD AT ALL. In an ELEVATION an
     * opening's linework is NOT the projected solid — this builder injects the authored symbol
     * and `suppressSymbolisedElementLinework` takes the wireframe away. So the `hostId` the
     * exporter stamps onto the mesh wrapper never arrives on the linework the occlusion engine
     * actually traverses for a façade window, and stamping only there would have been a green
     * test over a path the founder's build does not take (memory: `committed-is-not-reachable`).
     * The relation is free here: this loop already has `wall.id` in hand as the host of every
     * opening it emits.
     */
    hostId?: string,
): boolean {
    const byZone = new Map<DrawingZone, number[]>();
    for (const pl of polylines) {
        const pts = pl.points;
        if (pts.length < 2) continue;
        const buf = byZone.get(pl.zone) ?? [];
        const n = pts.length;
        const last = pl.closed ? n : n - 1;
        for (let i = 0; i < last; i++) {
            const p0 = pts[i]!;
            const p1 = pts[(i + 1) % n]!;
            buf.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
        }
        byZone.set(pl.zone, buf);
    }
    if (byZone.size === 0) return false;

    for (const [zone, positions] of byZone) {
        if (positions.length === 0) continue;
        const layer = layerForZone(baseLayer, zone);
        if (!drawing.layers.has(layer)) drawing.layers.create(layer);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x000000 }));
        lines.updateWorldMatrix(true, false);

        const projected = OBC.TechnicalDrawing.toDrawingSpace(lines, drawing);
        projected.name = layer;
        projected.userData.layerName = layer;
        // The ELEMENT tier (priority 10000) of the graphics-rules chain keys on this. Without
        // it a per-element pen override cannot reach an injected symbol — L-280, exactly.
        projected.userData.elementUUID = elementUUID;
        // §TRUE-PROJECTION-HOST-NEVER-HIDES-ITS-OPENING (L-6013) — see the parameter doc.
        if (hostId !== undefined && hostId !== elementUUID) projected.userData.hostId = hostId;
        drawing.addProjectionLines(projected, layer);
        registerSegmentUUID(drawing, projected, elementUUID);
        geo.dispose();
        (lines.material as THREE.Material).dispose();
    }
    return true;
}

function _resolveDetail(v: unknown): SymbolDetail {
    const s = typeof v === 'string' ? v.toLowerCase() : '';
    if (s === 'coarse' || s === 'medium' || s === 'fine') return s;
    // Matches DEFAULT_DETAIL_LEVEL — raised to 'fine' by L-252, not re-decided here.
    return 'fine';
}

/**
 * Door swing, keyed by the door's element id.
 *
 * Returns an EMPTY map when the door store is absent or shaped differently — and that is a
 * deliberate, visible outcome: {@link buildOpeningElevationSymbol} draws NO swing indicator
 * when the hand is unknown, rather than defaulting to `'left'` as the door schema does. A
 * defaulted hinge side on a construction drawing is a construction error.
 */
function _readSwings(): Map<string, { hingesSide?: 'left' | 'right'; swingDirection?: 'inward' | 'outward' }> {
    const out = new Map<string, { hingesSide?: 'left' | 'right'; swingDirection?: 'inward' | 'outward' }>();
    const store = storeRegistry.getStoreForType('door') as unknown as ReadableDoorStore | undefined;
    if (!store || typeof store.getAll !== 'function') return out;
    try {
        for (const d of store.getAll()) {
            if (!d?.id) continue;
            out.set(d.id, { hingesSide: d.hingesSide, swingDirection: d.swingDirection });
        }
    } catch {
        // A store that throws is a store that cannot answer — the same value as absent, and the
        // symbol correctly omits the swing rather than inventing one.
    }
    return out;
}

/** Singleton, mirroring `plumbingElevationSymbolBuilder`. */
export const openingElevationSymbolBuilder = new OpeningElevationSymbolBuilder();
