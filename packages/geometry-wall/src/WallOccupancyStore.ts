/**
 * WallOccupancyStore — §OCCUPANCY Opening Placement Validator
 *
 * ─── §NO-EMPTY-MEANS-UNKNOWN · GR-14 (C78 §1.4/§20 · U-INV-4 · C71 §4.4) ────
 * The four `wall.openings ?? []` defaults this file used to carry are GONE, and
 * the reason is worth stating because it is NOT the reason most of this
 * ledger's other rows get paid.
 *
 * `WallData.openings` is declared `Opening[]` in `WallTypes.ts` — REQUIRED, not
 * optional — and `WallStore.add()` normalises it on insert while
 * `cloneWallData()` normalises it again on clone. Under `strict: true` the right
 * branch of those `??` was therefore UNREACHABLE. They were not distinguishing
 * "this wall has no openings" from "this wall's openings are unknown"; there is
 * no unknown here to distinguish. They were dead defaults whose only effect was
 * to tell a reader that a wall might arrive without its openings.
 *
 * That reading matters more here than almost anywhere else in the ledger, which
 * is why this file was taken first: `canPlace` is the C74 §2 ENFORCEMENT family
 * — the one real refusal on a real mutation path. An openings list read as
 * empty does not merely lose a check, it PERMITS the placement. A guard that
 * silently answers "clear" is worse than no guard at all.
 *
 * So this is a DELETION, not a determination, and the distinction is deliberate.
 * Where a relationship field is genuinely optional the ratified fix is a
 * discriminator returning a tagged union (see `determineBoundingWalls` /
 * `boundingWallIdsOrUnknown` in `@pryzm/core-app-model`). Minting one for a
 * field the type system already guarantees would manufacture an "undetermined"
 * branch that cannot occur, and an unreachable refusal is its own dishonesty.
 * If `openings` is ever made optional, this file needs the discriminator — not
 * the `??` back.
 *
 * MODIFICATION DECLARATION
 * Layer:          Side System (Command validation utility)
 * Phase:          Phase I — Semantic Model & Core Engine
 * Files:          src/elements/walls/WallOccupancyStore.ts
 * Classification: A — New Side System (no change to existing layers)
 * Impact:         Adds overlap detection for opening placement.
 *                 CreateWallOpeningCommand.canExecute() now rejects placements
 *                 that would overlap any existing opening on the same wall.
 *                 Undo/redo, project loading, and IFC import are unaffected —
 *                 this system reads WallStore state directly and carries no
 *                 independent state of its own.
 * Risk:           LOW — purely additive.  Existing placements are unchanged.
 *                 canExecute() validation was previously always returning ok:true
 *                 (only checked wall existence); this adds a conflict check on top.
 * Rationale:      Pascal WallSpatialGrid pattern adapted to PRYZM's stateless
 *                 architecture.  See Priority 2 in master analysis doc.
 *
 * Design principle:
 *   WallOccupancyStore is a PURE-QUERY side system.  It reads wall.openings[]
 *   directly from a frozen WallData record at query time.  It carries no
 *   independent state — WallStore is the single source of truth.
 *
 *   This means:
 *     • No register() / unregister() lifecycle management
 *     • Transparent to undo/redo (wall state reverts → occupancy query reverts)
 *     • Transparent to project loading (openings already in WallData)
 *     • Zero risk of stale state accumulation
 *
 * Contract compliance:
 *   §06-8.5  — Defines this class and its query contract
 *   §03-4.8  — canExecute() must call canPlace() before adding an opening
 *   R-1      — WallStore is source of truth; this system never writes to it
 *   §2.7     — Builder is never called from here
 */

import { COINCIDENT_M } from '@pryzm/geometry-kernel';
import { WallData, Opening } from './WallTypes';
import { wallCentrelineLength } from './WallArcParam';
// §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH (L-812) — the same predicate WallStore uses,
// so the pre-flight decline and the store's last-line guard can never disagree.
// §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH (L-812) — the SINGLE rake gate: the same one
// WallDataSchema, WallStore.update and WallStore.addOpening consult. Calling it
// here rather than re-deriving the rule means the pre-flight decline and the
// store's last-line guard cannot drift apart, and the user reads the SAME
// sentence the store would have thrown.
import { rakeAuthorability } from './WallRake';
// §PRYZM-PERF (INSTR1) — canPlace ran on EVERY pointermove and logged every time.
// Counters replace that flood; see the block at the OK return in canPlace().
import { bumpPerf, PERF_KEYS } from '@pryzm/frame-scheduler';

/**
 * ⚰ TOMBSTONE — `__pryzmLoadActive()` REMOVED 2026-08-19, superseded by §PRYZM-PERF.
 *
 * It gated the `canPlace OK` log on `__pryzmProjectLoadActive` (§LOAD-REDETECT-FREEZE,
 * 2026-06-25) and `__pryzmBuildingGenActive` (§GEN-LOG-GATING, L-369) — project restore
 * and building generation. INSTR1 replaced that log with a counter plus the existing
 * `__pryzmDebugWalls` opt-in, which leaves nothing for this predicate to guard.
 *
 * ⭐ WHY IT IS DELETED RATHER THAN KEPT "just in case": it covered the two floods that
 * mattered LEAST. The full argument is preserved at the OK return in `canPlace()` — the
 * guard never covered the interactive pointermove path (there is no flag there; that IS
 * the user) nor the whole-level rebuild in `WallRebuildCoordinator._flush`, which
 * ADR-0261 §45 names by that exact line. Three known floods, one guard, catching two.
 * Reinstating it would re-introduce a predicate that reads like protection and is not.
 */

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * §REFUSAL-IDENTITY (C58 §1.13) — the CLOSED set of reasons `canPlace` can refuse.
 * One member per refusal arm in `canPlace`, in source order. A renderer that carries
 * this code makes the refusal attributable to its rule; a renderer that drops it
 * collapses six distinct verdicts onto one sentence, which is the exact defect
 * `tools/ga-gate/check-refusal-identity.ts` exists to stop. Do NOT widen to `string`.
 */
export type CanPlaceRefusalCode =
    | 'OCC_HOST_ZERO_LENGTH'        // degenerate host — no span exists to occupy
    | 'OCC_HOST_RAKED'              // §RAKE-HOSTED-OPENING — host rake incompatible with its own shape (curved / layered / out of range)
    | 'OCC_WIDTH_NOT_POSITIVE'      // requested width ≤ 0
    | 'OCC_OFFSET_BEFORE_WALL_START'// requested span starts before the wall
    | 'OCC_SPAN_BEYOND_WALL_END'    // requested span runs past the wall end
    | 'OCC_OVERLAPS_SIBLING'        // 1-D overlap with an existing opening (conflictIds names them)
    // §C83-S1 — the WALL-SIDE mirror of the five arms above. Those all ask "may
    // this OPENING go here?"; this one asks "may this WALL go here?", and it is
    // the same question about the same volume asked from the other side, so it
    // belongs in the same closed union rather than in a rival one (C83 §1.4).
    // The precedent is `planOpeningRefit` (:395), already described in this file
    // as "the WALL-SIDE mirror of clampToWall". Produced by
    // `evaluateWallPlacement` in WallCrossesOpening.ts, never by `canPlace` —
    // `canPlace` takes ONE wall and cannot express a second wall's footprint.
    | 'OCC_CROSSES_HOSTED_OPENING'; // a proposed WALL's footprint crosses an existing door/window

export interface CanPlaceResult {
    valid:       boolean;
    conflictIds: string[];   // Opening.id values of conflicting entries
    /** Present exactly when `valid` is false — the refusal's identity (closed union). */
    code?:       CanPlaceRefusalCode;
    reason?:     string;     // Human-readable failure message (absent when valid)
}

/**
 * §REFUSAL-IDENTITY-CANPLACE (GE-09) — the CLOSED union as a VALUE, so the set can
 * be iterated (tests, exhaustiveness) as well as type-checked. Typed as
 * `readonly CanPlaceRefusalCode[]` with an `Exclude`-based completeness assertion
 * below, so adding a seventh member to the union without adding it here is a
 * COMPILE error, not a silently short roster.
 */
export const CAN_PLACE_REFUSAL_CODES = [
    'OCC_HOST_ZERO_LENGTH',
    'OCC_HOST_RAKED',
    'OCC_WIDTH_NOT_POSITIVE',
    'OCC_OFFSET_BEFORE_WALL_START',
    'OCC_SPAN_BEYOND_WALL_END',
    'OCC_OVERLAPS_SIBLING',
    'OCC_CROSSES_HOSTED_OPENING',
] as const satisfies readonly CanPlaceRefusalCode[];

/** Compile-time completeness: resolves to `never` only when the roster covers the
 *  union exactly. A missing member makes this line an error naming the gap. */
type _CanPlaceRosterIsComplete =
    Exclude<CanPlaceRefusalCode, (typeof CAN_PLACE_REFUSAL_CODES)[number]> extends never
        ? true
        : ['MISSING FROM CAN_PLACE_REFUSAL_CODES', Exclude<CanPlaceRefusalCode, (typeof CAN_PLACE_REFUSAL_CODES)[number]>];
const _canPlaceRosterIsComplete: _CanPlaceRosterIsComplete = true;
void _canPlaceRosterIsComplete;

/**
 * §REFUSAL-IDENTITY-CANPLACE (GE-09, C58 §1.13.8, C73 §4.4) — THE renderer for a
 * `canPlace` refusal.
 *
 * Why this function exists rather than `occ.reason ?? 'opening placement rejected'`
 * at each of the ~12 call sites:
 *
 *   • That fallback fires exactly when the validator refused AND said nothing.
 *     The sentence it produces has the grammatical shape of an explanation and
 *     the information content of a shrug — and, being indistinguishable from a
 *     real reason, it HIDES the under-reporting validator. C58 §1.13.8 is the
 *     rule it breaks: "the resolver's distinction MUST reach the card."
 *   • The union is a SEVEN-member closed set (six that `canPlace` itself
 *     resolves, plus the wall-side arm below). Seven distinct verdicts —
 *     "the host has no length", "the host is raked and cannot carry an opening",
 *     "the requested width is not positive", "the span starts before the wall",
 *     "the span runs past the wall end", "it overlaps siblings X and Y", and
 *     "this WALL would cross an existing door/window" — arrived at the user as
 *     ONE string. A user cannot act on the collapsed form: four are fixed by
 *     moving the opening, one by resizing it, one by unraking the wall, and one
 *     by moving the WALL.
 *
 *     ⚠ Six of the seven are produced by `canPlace`; the seventh
 *     (`OCC_CROSSES_HOSTED_OPENING`, §C83-S1) is produced by
 *     `evaluateWallPlacement` in WallCrossesOpening.ts, because `canPlace` takes
 *     ONE wall and structurally cannot express a second wall's footprint. They
 *     share this union — and therefore this renderer — because they are the same
 *     question about the same volume asked from opposite sides (C83 §1.4).
 *
 * The rendered text CARRIES the code, so the distinction survives the trip to the
 * DOM even where the sink takes only a string. A refusal that arrives with NO
 * code is reported AS unidentified (`OCC_UNIDENTIFIED`) rather than smoothed over:
 * a producer that refuses without saying why is a defect that must stay visible.
 *
 * NEVER widen `CanPlaceRefusalCode` to `string` to make this easier.
 *
 * @returns the user-facing refusal text, or `undefined` when the result is valid
 *          (there is no refusal to render).
 */
export function canPlaceRefusalText(result: CanPlaceResult): string | undefined {
    if (result.valid) return undefined;

    const detail = result.reason !== undefined && result.reason.length > 0
        ? result.reason
        : undefined;

    // The identity. `OCC_UNIDENTIFIED` is NOT a member of the closed union — it is
    // the honest name for "the producer refused without an identity", which is a
    // different fact from any of the six and must not borrow one of their names.
    const code: string = result.code ?? 'OCC_UNIDENTIFIED';

    const conflicts = result.conflictIds.length > 0
        ? ` (conflicts: ${result.conflictIds.join(', ')})`
        : '';

    const sentence = detail ?? (
        result.code === undefined
            ? 'the occupancy check refused this placement without stating a reason — that omission is the defect'
            : CAN_PLACE_DEFAULT_SENTENCE[result.code]
    );

    return `[${code}] ${sentence}${conflicts}`;
}

/**
 * The sentence used when a refusal carries its code but no prose. One arm per
 * union member — `Record<CanPlaceRefusalCode, string>` makes a missing arm a
 * compile error, so a seventh code cannot land here silently either.
 */
const CAN_PLACE_DEFAULT_SENTENCE: Record<CanPlaceRefusalCode, string> = {
    OCC_HOST_ZERO_LENGTH:         'the host wall has no length, so there is no span for an opening to occupy',
    OCC_HOST_RAKED:               "the host wall's angle (rake) is not compatible with hosting an opening",
    OCC_WIDTH_NOT_POSITIVE:       'the requested opening width is not a positive number',
    OCC_OFFSET_BEFORE_WALL_START: 'the requested opening starts before the wall does',
    OCC_SPAN_BEYOND_WALL_END:     'the requested opening runs past the end of the wall',
    OCC_OVERLAPS_SIBLING:         'the requested opening overlaps an opening already on this wall',
    // §C83-S1 — the fallback only. The real producer (`evaluateWallPlacement`)
    // always supplies prose NAMING the opening and BOTH intervals, because a
    // refusal the user cannot act on is the defect this whole family exists to
    // stop. This sentence is what they read if that prose is ever lost.
    OCC_CROSSES_HOSTED_OPENING:   'this wall would pass through a door or window opening on an existing wall',
};

/**
 * §FIX-WINDOW-OOB-OPENING-RESTORE — a hosted opening's four positional /
 * dimensional degrees of freedom along + across its host wall.
 */
export interface OpeningDims {
    offset:     number;   // LEFT-EDGE offset along the wall baseline (metres)
    width:      number;   // horizontal extent (metres)
    height:     number;   // vertical extent (metres)
    sillHeight: number;   // height of the opening base above the wall base (metres)
}

export interface ClampToWallResult extends OpeningDims {
    /** true when any field was adjusted to keep the frame inside the wall. */
    clamped: boolean;
}

/**
 * §FIX-WALL-SHRINK-REFIT (W2-1) — one opening that the candidate wall cannot
 * contain AT ALL, i.e. keeping it would require shrinking the opening's own
 * authored WIDTH or HEIGHT. Carries BOTH numbers so the refusal names them.
 */
export interface OpeningRefusal {
    openingId:  string;
    elementId?: string;
    type:       'window' | 'door';
    /** Which extent of the host is too small. */
    axis:       'length' | 'height';
    /** What the opening needs on that axis (metres). */
    requiredM:  number;
    /** What the candidate wall offers on that axis (metres). */
    availableM: number;
    /** Human-readable sentence carrying both numbers. */
    reason:     string;
}

/**
 * §FIX-WALL-SHRINK-REFIT (W2-1) — one opening that STILL FITS the candidate wall
 * but must be moved (offset and/or sillHeight) to stay inside it. Its authored
 * width/height are preserved by construction.
 */
export interface OpeningRelocation {
    /** The opening AS IT STANDS today (pre-clamp) — the caller's undo record. */
    opening: Opening;
    /** The clamped position; `width`/`height` equal `opening`'s by construction. */
    next:    OpeningDims;
}

/** §FIX-WALL-SHRINK-REFIT (W2-1) — the verdict for a whole candidate wall. */
export interface OpeningRefitPlan {
    /** true ⇔ `refusals` is empty, i.e. every hosted opening survives the edit. */
    ok:          boolean;
    refusals:    OpeningRefusal[];
    relocations: OpeningRelocation[];
}

// ─── WallOccupancyStore ───────────────────────────────────────────────────────

/**
 * Pure-query side system for opening placement validation.
 *
 * Usage:
 *   import { wallOccupancyStore } from './WallOccupancyStore';
 *   const result = wallOccupancyStore.canPlace(wall, offsetM, widthM);
 *   if (!result.valid) return { ok: false, reason: result.reason };
 */
export class WallOccupancyStore {

    // §C73-EPSILON-POLICY — "do these two opening edges sit at the same station?"
    // (so a door flush against a window is NOT a conflict) is the MODEL-SPACE
    // COINCIDENCE question, in metres along the wall, so it consumes the kernel's
    // declared `COINCIDENT_M` (1 mm, C73 §2.2) rather than the private
    // `WallOccupancyStore.EPSILON_M = 0.001` it replaces — same value, same role,
    // every verdict unchanged. That constant was `private`: no external referent.

    /**
     * §FIX-WINDOW-OOB-OPENING-RESTORE — smallest hosted-opening dimension the
     * clamp will leave when a wall is too small to fit the requested frame.
     * Keeps the opening a valid, positive, cuttable span (never zero/negative).
     */
    static readonly MIN_OPENING_M = 0.05;

    /**
     * §FIX-WINDOW-OOB-OPENING-RESTORE (L-82) — clamp a hosted opening's dimensions
     * so the frame span [offset, offset+width] × [sillHeight, sillHeight+height]
     * stays ENTIRELY within the host wall's extent (length × height).
     *
     * A window/door dimension edit (width / height / offset / sillHeight) had no
     * wall-extent guard — only the MOVE path validated via canPlace(). An
     * out-of-bounds edit produced an opening that exceeded the wall, orphaned the
     * cut, and (once desynced from the WallStore) could neither re-cut nor be
     * deleted. Guarding every dimension write through this pure clamp makes the
     * out-of-bounds state impossible: the frame can never exceed the wall, so the
     * opening is always a valid in-bounds span that the builder can cut, and any
     * later in-bounds edit recovers cleanly.
     *
     * Behaviour (mirrors WindowTool's existing placement clamp
     * `offset = max(0, min(offset, wallLength - width))`):
     *   • horizontal: width ∈ [MIN, wallLength]; offset ∈ [0, wallLength - width]
     *     — a width that fits is preserved by shifting the offset inward; only a
     *     width larger than the whole wall is itself shrunk.
     *   • vertical:   height ∈ [MIN, wallHeight]; sillHeight ∈ [0, wallHeight - height].
     *
     * PURE — reads `wall.baseLine` / `wall.curve` (planar XZ CENTRELINE length; Y
     * carries level elevation per the canonical schema) and `wall.height`;
     * writes nothing.
     *
     * §FEAT-HOSTED-ON-CURVED-WALL — the horizontal extent is the CENTRELINE ARC
     * length, not the chord. A curved wall's arc is always ≥ its chord, so the
     * old chord clamp squeezed every opening on a curved host into the chord's
     * shorter span and pushed it off the far end of the wall. For a straight
     * wall `wallCentrelineLength` returns the chord, so this is a no-op there.
     */
    clampToWall(wall: WallData, dims: OpeningDims): ClampToWallResult {
        const wallLength = wallCentrelineLength(wall);
        const wallHeight = (typeof wall.height === 'number' && wall.height > 0)
            ? wall.height
            : Number.POSITIVE_INFINITY;

        const MIN = WallOccupancyStore.MIN_OPENING_M;
        const clamp = (v: number, lo: number, hi: number): number =>
            Math.min(Math.max(v, lo), Math.max(lo, hi));

        let { offset, width, height, sillHeight } = dims;

        // Degenerate wall — cannot fit any opening; leave dims untouched so the
        // caller / builder can surface the real problem (zero-length wall).
        if (!(wallLength > 0)) {
            return { offset, width, height, sillHeight, clamped: false };
        }

        // ── Horizontal: keep the requested width if it fits by shifting offset ──
        width  = clamp(width, MIN, wallLength);
        offset = clamp(offset, 0, wallLength - width);

        // ── Vertical ────────────────────────────────────────────────────────────
        if (Number.isFinite(wallHeight)) {
            height     = clamp(height, MIN, wallHeight);
            sillHeight = clamp(sillHeight, 0, wallHeight - height);
        } else {
            height     = Math.max(height, MIN);
            sillHeight = Math.max(sillHeight, 0);
        }

        const clamped =
            offset     !== dims.offset ||
            width      !== dims.width ||
            height     !== dims.height ||
            sillHeight !== dims.sillHeight;

        return { offset, width, height, sillHeight, clamped };
    }

    /**
     * §FIX-WALL-SHRINK-REFIT (W2-1, EV-03 §2 / R-1 + R-2) — the WALL-SIDE mirror
     * of `clampToWall`.
     *
     * ── The defect this closes ──────────────────────────────────────────────
     * `clampToWall` had exactly two production callers (`WallStore.updateWindow`
     * and `UpdateWindowParameterCommand`) and BOTH are on the OPENING side: they
     * guard "the user resized the opening past its wall". Nothing guarded the
     * mirror case — "the wall shrank underneath a stationary opening". An
     * EXECUTED probe (EV-03 §2.1) left a 0.9 m door at offset 2.0 on a wall
     * shortened to 1.5 m, and a 2.1 m door in a wall lowered to 1.0 m: no clamp,
     * no refusal, no event. This method is the gate the wall-side commands were
     * missing; it is the SAME `clampToWall` maths, asked from the other side, so
     * the two directions cannot drift apart.
     *
     * ── The POLICY, and the precedent it follows ────────────────────────────
     * Three answers were available when an opening no longer fits: clamp it,
     * refuse the wall edit, or delete the opening. The codebase already answers
     * this class of question, and the answer is SPLIT BY WHAT WOULD BE LOST:
     *
     *   • POSITION can be recovered, so it is CLAMPED. `clampToWall` itself, and
     *     `WallStore.updateWindow`'s unconditional use of it, establish that
     *     silently pulling an opening back inside its host is the accepted
     *     response when the opening's authored SIZE survives. A relocation is
     *     reversible and loses no authored quantity.
     *
     *   • AUTHORED DIMENSIONS cannot be recovered, so the edit is REFUSED. The
     *     established wall-side precedent is `WallStore._updateImpl`'s
     *     `BaselineReversalError` (§WALL-DEEP-2026 B2): rather than let a wall
     *     edit silently corrupt hosted openings, the STORE THROWS, and
     *     `UpdateWallBaselineCommand` catches it, leaves the wall in its
     *     pre-drag state, toasts, and returns `success:false`. That is the
     *     policy for "this wall edit would destroy opening data": refuse the
     *     WALL edit, do not damage the opening.
     *
     *   • DELETE has no precedent on any edit path. Openings are removed only by
     *     `removeOpening` or the wall-delete cascade, both of which are explicit
     *     user intent with an undo record. Silently deleting a door because its
     *     wall got shorter is the one option the codebase never takes, and the
     *     refusal above makes it unnecessary.
     *
     * So: shrinking a 6 m wall to 3 m moves a door that no longer fits at its
     * offset (clamp); shrinking it to 0.5 m, where a 0.9 m door cannot exist at
     * any offset, is REFUSED with both numbers — never by narrowing the door to
     * 0.5 m, which would be silent loss of an authored dimension.
     *
     * PURE — reads `candidate` only; writes nothing, emits nothing. The caller
     * decides what to do with the plan, and owns the undo record for any
     * relocation it applies (`restoreSnapshot` does NOT carry `openings`).
     *
     * @param candidate The wall AS IT WOULD BE after the edit — i.e. the current
     *                  record with the new `baseLine` and/or `height` already
     *                  folded in, with its existing `openings` array intact.
     */
    planOpeningRefit(candidate: WallData): OpeningRefitPlan {
        const refusals:    OpeningRefusal[]    = [];
        const relocations: OpeningRelocation[] = [];

        const openings: Opening[] = candidate.openings;
        if (openings.length === 0) {
            return { ok: true, refusals, relocations };
        }

        const wallLength = wallCentrelineLength(candidate);
        const wallHeight = (typeof candidate.height === 'number' && candidate.height > 0)
            ? candidate.height
            : Number.POSITIVE_INFINITY;

        // A degenerate host cannot carry ANY opening, and `clampToWall`
        // deliberately returns the dims untouched in that case (it leaves the
        // zero-length wall for the caller to surface). Say so explicitly rather
        // than letting the no-op clamp read as "everything fits".
        if (!(wallLength > 0)) {
            for (const o of openings) {
                refusals.push({
                    openingId:  o.id,
                    elementId:  o.elementId,
                    type:       o.type,
                    axis:       'length',
                    requiredM:  o.width,
                    availableM: 0,
                    reason:
                        `${o.type} ${o.elementId ?? o.id} needs ${o.width.toFixed(3)} m of wall ` +
                        `length; the wall would have zero length`,
                });
            }
            return { ok: false, refusals, relocations };
        }

        for (const o of openings) {
            const c = this.clampToWall(candidate, {
                offset:     o.offset,
                width:      o.width,
                height:     o.height,
                sillHeight: o.sillHeight,
            });

            // WIDTH changed ⇒ the opening cannot exist on this wall at ANY
            // offset. Refuse rather than narrow an authored door/window.
            if (c.width !== o.width) {
                refusals.push({
                    openingId:  o.id,
                    elementId:  o.elementId,
                    type:       o.type,
                    axis:       'length',
                    requiredM:  o.width,
                    availableM: wallLength,
                    reason:
                        `${o.type} ${o.elementId ?? o.id} needs ${o.width.toFixed(3)} m of wall ` +
                        `length; the wall would be ${wallLength.toFixed(3)} m`,
                });
                continue;
            }

            // HEIGHT changed ⇒ same argument on the vertical axis.
            if (c.height !== o.height) {
                refusals.push({
                    openingId:  o.id,
                    elementId:  o.elementId,
                    type:       o.type,
                    axis:       'height',
                    requiredM:  o.height,
                    availableM: Number.isFinite(wallHeight) ? wallHeight : 0,
                    reason:
                        `${o.type} ${o.elementId ?? o.id} is ${o.height.toFixed(3)} m tall; the ` +
                        `wall would be ${Number.isFinite(wallHeight) ? wallHeight.toFixed(3) : '0.000'} m`,
                });
                continue;
            }

            // Only POSITION moved — the opening survives at its authored size.
            if (c.offset !== o.offset || c.sillHeight !== o.sillHeight) {
                relocations.push({ opening: { ...o }, next: c });
            }
        }

        return { ok: refusals.length === 0, refusals, relocations };
    }

    /**
     * §HOSTED-OPENING-HOST-MOVE (Z-3) — the ANCHOR half of the wall-side gate.
     *
     * ── The defect this closes ──────────────────────────────────────────────
     * `planOpeningRefit` asks only "does the opening still FIT the candidate
     * wall?". It is blind to WHERE the wall changed, because it never sees the
     * wall's previous baseline. That blindness is a real, user-visible defect
     * the moment a wall can be re-baselined at `baseLine[0]`:
     *
     *   C15 §2 — a hosted opening has NO independent world coordinate. Its world
     *   position is `baseLine[0] + offset x wallDir`. So moving `baseLine[0]`
     *   ALONG the wall's own axis (an extend/trim at the START end — exactly
     *   what `computeMoveReweld` issues for a partner welded at its [0]) drags
     *   every opening on that wall by the same distance, even though the part of
     *   the wall the opening sits on never moved. The offset still "fits", so
     *   `planOpeningRefit` reports OK and the door silently slides across the
     *   room. Measured: a 4 m west wall extended to 6 m at [0] moved its door
     *   2.00 m (hostedOpeningHostMoveSeam §Z-3).
     *
     * The asymmetry is the tell: the SAME user gesture leaves a door on the wall
     * welded at [1] exactly where it was (shift 0) and throws the door on the
     * wall welded at [0] across the plan. Stored endpoint ORDER is invisible to
     * the user and was never chosen by them, so it cannot be allowed to decide
     * whether their door moves.
     *
     * ── What this adds, and what it deliberately does NOT ────────────────────
     * ONE thing: it re-expresses each authored offset against the NEW
     * `baseLine[0]` so the opening's WORLD position is preserved, and then hands
     * the rebased openings to `planOpeningRefit` — the SAME clamp/refuse policy,
     * unchanged and unduplicated. Position is still recoverable (CLAMP);
     * authored width/height are still not (REFUSE). No new policy is minted.
     *
     * The rebase applies ONLY when the wall keeps its direction — an extend, a
     * trim or a translation. A wall that ROTATED has no defensible "same place
     * along the wall" answer, and inventing one would be worse than doing
     * nothing, so the shift is 0 there and the plain refit gate still applies.
     * A pure PERPENDICULAR translation also yields shift 0 by construction (the
     * displacement has no along-axis component), which is correct: the whole
     * wall moved, so the opening rides along with it.
     *
     * PURE — reads only; writes nothing, emits nothing. The caller owns the undo
     * record for any relocation it applies (`restoreSnapshot` does NOT carry
     * `openings`), and every `relocations[].opening` handed back is the
     * PRE-EDIT record, never the intermediate rebased one.
     *
     * @param current      The wall AS IT STANDS, with its current baseLine and
     *                     its `openings` array.
     * @param nextBaseLine The baseline the wall is about to be given.
     */
    planOpeningRebase(
        current: WallData,
        nextBaseLine: ReadonlyArray<{ x: number; y?: number; z: number }>,
    ): OpeningRefitPlan {
        const candidate = { ...current, baseLine: nextBaseLine } as unknown as WallData;
        const openings: Opening[] = current.openings;
        if (openings.length === 0) return this.planOpeningRefit(candidate);

        const shift = WallOccupancyStore.anchorShiftM(current.baseLine, nextBaseLine);
        if (shift === 0) return this.planOpeningRefit(candidate);

        // Rebase, then ask the EXISTING gate. It owns the whole clamp/refuse
        // policy; this method contributes only the shift.
        const rebased: Opening[] = openings.map(o => ({ ...o, offset: o.offset + shift }));
        const plan = this.planOpeningRefit(
            { ...candidate, openings: rebased } as unknown as WallData,
        );
        if (!plan.ok) {
            // Refusals name the same opening ids either way (the rebase copies
            // id/elementId/type/width verbatim), and a refused edit relocates
            // nothing.
            return { ok: false, refusals: plan.refusals, relocations: [] };
        }

        // The gate reports a relocation only when its OWN clamp moved something.
        // A rebase that fitted without clamping is still a write the caller must
        // perform, so the final position is compared against the AUTHORED one.
        const clampedById = new Map(plan.relocations.map(r => [r.opening.id, r.next]));
        const relocations: OpeningRelocation[] = [];
        for (let i = 0; i < openings.length; i++) {
            const authored = openings[i];
            const r = rebased[i];
            const next: OpeningDims = clampedById.get(r.id) ?? {
                offset:     r.offset,
                width:      r.width,
                height:     r.height,
                sillHeight: r.sillHeight,
            };
            if (next.offset !== authored.offset || next.sillHeight !== authored.sillHeight) {
                relocations.push({ opening: { ...authored }, next });
            }
        }
        return { ok: true, refusals: [], relocations };
    }

    /**
     * §HOSTED-OPENING-HOST-MOVE (Z-3) — how far the wall's measuring origin
     * (`baseLine[0]`, C15 §2) travelled ALONG the wall, signed in the direction
     * of the new baseline. Adding this to an authored offset re-expresses it
     * against the new origin, leaving the opening's world position untouched.
     *
     * Returns 0 — meaning "no rebase" — for a degenerate new baseline, a missing
     * previous baseline, and any direction change (rotation or reversal): see
     * the `planOpeningRebase` doc for why silence beats invention there. XZ
     * only, matching every other along-wall measurement in this package (walls
     * are horizontal; Y is height, not sweep).
     */
    private static anchorShiftM(
        prev: ReadonlyArray<{ x: number; y?: number; z: number }> | undefined,
        next: ReadonlyArray<{ x: number; y?: number; z: number }>,
    ): number {
        if (!prev || prev.length < 2 || !next || next.length < 2) return 0;

        const nDx = next[1].x - next[0].x;
        const nDz = next[1].z - next[0].z;
        const nLen = Math.hypot(nDx, nDz);
        if (!(nLen > 0)) return 0;

        const pDx = prev[1].x - prev[0].x;
        const pDz = prev[1].z - prev[0].z;
        const pLen = Math.hypot(pDx, pDz);
        if (!(pLen > 0)) return 0;

        // Direction must be preserved (same heading, not merely the same line):
        // a reversal swaps which endpoint offsets are measured from, and that is
        // the store's BaselineReversalError to refuse, not ours to compensate.
        const cross = (pDx * nDz - pDz * nDx) / (pLen * nLen);
        const dot   = (pDx * nDx + pDz * nDz) / (pLen * nLen);
        if (dot <= 0 || Math.abs(cross) > 1e-6) return 0;

        // Signed along-axis distance from the NEW origin to the OLD origin.
        return ((prev[0].x - next[0].x) * nDx + (prev[0].z - next[0].z) * nDz) / nLen;
    }

    /**
     * Checks whether a new opening [offsetM, offsetM + widthM] can be placed
     * on `wall` without overlapping any existing opening in wall.openings[].
     *
     * The check is purely 1-D along the wall baseline (horizontal extent).
     * Vertical stacking (different sill heights) is NOT permitted — BIM
     * semantics require each horizontal span to be exclusively owned by one
     * opening element (§06-8.5).
     *
     * @param wall        Frozen WallData — provides openings[] and baseLine
     * @param offsetM     Distance from wall start to LEFT edge of new opening (metres)
     * @param widthM      Width of the new opening (metres)
     * @param excludeId   Optional id to skip during the conflict check. Matched
     *                    against BOTH `Opening.id` AND `Opening.elementId` so a
     *                    caller may pass either the opening id OR the hosted
     *                    element id (door/window id). This is essential for the
     *                    MOVE path: a small in-place nudge of a door/window
     *                    produces a NEW range that overlaps the element's OWN
     *                    pre-move slot — without excluding it by elementId the
     *                    move is wrongly rejected as a self-conflict, because
     *                    Opening.id is distinct from the hosted element id.
     *
     * @returns  { valid: true } when placement is clear.
     *           { valid: false, conflictIds, reason } when blocked.
     */
    canPlace(
        wall:       WallData,
        offsetM:    number,
        widthM:     number,
        excludeId?: string,
    ): CanPlaceResult {

        // §PRYZM-PERF (INSTR1) — total invocations. Counted at ENTRY rather than at
        // each of the six rejection returns: one call site cannot drift out of step
        // with the others, and BLOCKED is then derived as (calls - ok) in the report,
        // which is arithmetically guaranteed to reconcile. The rate is the finding —
        // "canPlace ran 2,847 times during that drag" — not any individual verdict.
        bumpPerf(PERF_KEYS.OCCUPANCY_CANPLACE_CALLS);

        // ── Compute wall length ────────────────────────────────────────────
        // §FEAT-HOSTED-ON-CURVED-WALL — the occupancy interval [offset, offset+width]
        // is measured along the wall CENTRELINE. For a curved host that is the ARC
        // length; chord maths would under-report the available span (arc ≥ chord),
        // wrongly rejecting legal placements near the far end and mis-judging
        // overlap between two openings set out along the arc.
        // For a straight wall this is the planar chord — identical to the previous
        // 3-D `baseLine` distance, because `baseLine[*].y` carries LEVEL ELEVATION
        // (identical at both ends), never a vertical run.
        const wallLengthM = wallCentrelineLength(wall);

        if (wallLengthM <= 0) {
            return {
                valid:       false,
                conflictIds: [],
                code:        'OCC_HOST_ZERO_LENGTH',
                reason:      'Wall has zero length — cannot place openings',
            };
        }

        // ── §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH (L-812) ───────────────────────
        //
        // ⚠ §RAKE-HOSTED-OPENING (founder 2026-08-18) — READ THIS FIRST. A raked
        // wall CAN now host doors and windows; `rakeAuthorability` no longer has a
        // `hosted-openings` arm. The history below is kept because it is why this
        // check lives HERE rather than only in the store, and that reason is
        // unchanged. What this guard refuses today is narrower and still real: a
        // host whose rake is incompatible with the rest of its own shape (curved,
        // layered, or out of range). Such a wall should not exist — the schema
        // refuses to mint one — so this is defence in depth against a path that
        // wrote the wall without validating it, and it must stay a DECLINE rather
        // than becoming a throw again.
        //
        // A RAKED host cannot carry an opening: the carve is a vertical band and
        // the door/window transform assumes a vertical host face (C15, ADR-0310).
        // `WallStore.addOpening()` already refuses this — correctly — by THROWING
        // a `WallSchemaError`.
        //
        // The throw is the problem. Reported from production 2026-08-09: placing a
        // window on a raked wall produced
        //   `[CommandManager] FATAL ERROR DURING EXECUTION WallSchemaError: …`
        // and the user simply saw "windows cannot be hosted". A deliberate POLICY
        // REFUSAL was being delivered as a crash, and the carefully-written reason
        // reached the devtools console instead of the person who needed it.
        //
        // Checking it HERE fixes both. `canPlace()` is already invoked on hover by
        // every placement path (the console shows it firing continuously as the
        // cursor moves), it already returns a human-readable `reason`, and callers
        // already treat `valid:false` as an ordinary decline. So the refusal now
        // happens BEFORE the command is dispatched: no fatal error, no aborted
        // command, and the reason travels the channel built for exactly this.
        //
        // The store guard STAYS. It is the last line of defence for any path that
        // bypasses this one, and defence-in-depth on a geometric invariant is
        // cheap. What changes is that it should now be unreachable from the UI.
        //
        // ⚠ The panel already refused the RAKE ROW on a wall that hosts openings.
        // The mirror case — refusing an OPENING on a wall that is raked — was
        // simply never implemented, so the panel and the store disagreed about who
        // enforced the rule. That asymmetry was the actual defect.
        // Ask the ONE gate what the user is actually asking: may this wall, WITH an
        // opening on it, hold the rake it currently has? A one-element `openings`
        // array expresses the prospective opening — `rakeAuthorability` is a pure
        // predicate over a SHAPE, not over a store.
        //
        // ⚠ The first draft of this fix re-derived the rule with `isVerticalRake`.
        // That would have been a FOURTH copy of a rule that already has exactly one
        // home — and copy-drift is what caused this bug: the panel refused
        // rake-given-openings, nothing refused openings-given-rake. Reusing the gate
        // also means the sentence the user reads is the sentence the store authored.
        //
        // §RAKE-HOSTED-OPENING — the subject now carries the host's CURVE and
        // LAYERS as well. Before, it passed `rakeAngleDeg` + a prospective opening
        // and nothing else, which was sufficient only while "has openings" was
        // itself a refusal. With that arm gone, a subject without `curve`/`layers`
        // would have made this branch dead code. It is instead the honest question:
        // is this host's rake authorable AT ALL, given everything about it?
        const _w = wall as { rakeAngleDeg?: number; curve?: unknown; layers?: ReadonlyArray<unknown> };
        const rake = rakeAuthorability({
            rakeAngleDeg: _w.rakeAngleDeg,
            curve:        _w.curve,
            layers:       _w.layers,
            openings:     [{}],
        } as Parameters<typeof rakeAuthorability>[0]);
        if (!rake.ok) {
            return {
                valid:       false,
                conflictIds: [],
                code:        'OCC_HOST_RAKED',
                reason:
                    "This wall's angle (rake) is not compatible with hosting a door or window — " +
                    "set the wall's Vertical Angle back to 90° first. " + (rake.reason ?? ''),
            };
        }

        // ── Basic bounds validation ────────────────────────────────────────
        if (widthM <= 0) {
            return {
                valid:       false,
                conflictIds: [],
                code:        'OCC_WIDTH_NOT_POSITIVE',
                reason:      `Opening width must be > 0 (got ${widthM.toFixed(3)} m)`,
            };
        }

        if (offsetM < -COINCIDENT_M) {
            return {
                valid:       false,
                conflictIds: [],
                code:        'OCC_OFFSET_BEFORE_WALL_START',
                reason:      `Offset ${offsetM.toFixed(3)} m is before wall start`,
            };
        }

        const newEnd = offsetM + widthM;
        if (newEnd > wallLengthM + COINCIDENT_M) {
            return {
                valid:       false,
                conflictIds: [],
                code:        'OCC_SPAN_BEYOND_WALL_END',
                reason: (
                    `Opening [${offsetM.toFixed(3)} m, ${newEnd.toFixed(3)} m] ` +
                    `extends beyond wall length ${wallLengthM.toFixed(3)} m`
                ),
            };
        }

        // ── Overlap detection ─────────────────────────────────────────────
        //
        // Two 1-D intervals [a, a+wa] and [b, b+wb] overlap when:
        //   a < b + wb - ε   (new opening starts before existing ends)
        //   AND
        //   a + wa > b + ε   (new opening ends after existing starts)
        //
        // The EPSILON ensures that touching edges (a+wa == b, within 1 mm) are
        // treated as NON-overlapping so adjacent windows can share a frame edge.

        const conflicts: string[] = [];
        const openings: Opening[] = wall.openings;

        for (const existing of openings) {
            // §MOVE-EXCLUDE-SELF: skip the element's OWN slot during a move so a
            // small in-place nudge isn't rejected as a self-conflict. The MOVE
            // commands pass the hosted element id (door/window id) as excludeId,
            // which equals Opening.elementId — NOT Opening.id — so we must match
            // either field. (Create still passes the new opening id, which won't
            // exist in openings[] yet, so this is a no-op for the create path.)
            if (excludeId && (existing.id === excludeId || existing.elementId === excludeId)) continue;

            const exStart = existing.offset;
            const exEnd   = existing.offset + existing.width;

            const overlaps = (
                offsetM < exEnd   - COINCIDENT_M &&
                newEnd  > exStart + COINCIDENT_M
            );

            if (overlaps) {
                conflicts.push(existing.id);
                console.log(
                    `[WallOccupancyStore] CONFLICT: new=[${offsetM.toFixed(3)},${newEnd.toFixed(3)}]m ` +
                    `vs existing ${existing.id} [${exStart.toFixed(3)},${exEnd.toFixed(3)}]m ` +
                    `on wall ${wall.id}`
                );
            }
        }

        if (conflicts.length > 0) {
            return {
                valid:       false,
                conflictIds: conflicts,
                code:        'OCC_OVERLAPS_SIBLING',
                reason:      `Opening overlaps existing opening(s): ${conflicts.join(', ')}`,
            };
        }

        // ── §PRYZM-PERF (INSTR1) — THE INSTRUMENT MUST NOT BECOME THE PROBLEM ──
        //
        // This was an UNCONDITIONAL `console.log` with THREE `toFixed(3)` calls and a
        // template concatenation, firing on EVERY POINTERMOVE while an opening is
        // being placed — dozens of console writes per second in the hottest path in
        // the app. The founder's own capture is full of them.
        //
        // WHY THE EXISTING GUARD DID NOT SAVE IT. `__pryzmLoadActive()` covers project
        // LOAD and building GENERATION only. It does not cover the interactive
        // pointermove path (there is no flag set there — that IS the user), and it
        // does not cover the whole-level wall rebuild in `WallRebuildCoordinator._flush`,
        // which ADR-0261 §45 names by this exact line as "the canPlace OK flood".
        // Three known floods, one guard, covering the two that matter least.
        //
        // Demoted to a counter, per the founder's instruction that the measuring
        // apparatus must not be a measurable cost. The information is not lost — it
        // is now `waste.occupancyCanPlaceOk` / `...Blocked` in `pryzmPerf.report()`,
        // where a rate is more useful than a transcript anyway: nobody was reading
        // 400 individual OK lines, but "canPlace ran 2,847 times during that drag"
        // is a finding.
        //
        // The per-call detail remains available on demand, behind the SAME opt-in flag
        // `WallFragmentBuilder` already uses for this purpose (`__pryzmDebugWalls`) —
        // reusing the established debug switch rather than minting a second one.
        bumpPerf(PERF_KEYS.OCCUPANCY_CANPLACE_OK);
        if ((globalThis as { __pryzmDebugWalls?: boolean }).__pryzmDebugWalls === true) {
            console.log(
                `[WallOccupancyStore] canPlace OK: wall=${wall.id} ` +
                `offset=${offsetM.toFixed(3)}m width=${widthM.toFixed(3)}m ` +
                `wallLen=${wallLengthM.toFixed(3)}m`
            );
        }

        return { valid: true, conflictIds: [] };
    }

    /**
     * Returns all existing openings on a wall, sorted by offset.
     * Useful for tool UI that needs to display the occupied spans.
     *
     * Read-only — does not modify WallData.
     */
    getOccupiedSpans(wall: WallData): ReadonlyArray<{
        openingId: string;
        type:      'window' | 'door';
        offsetM:   number;
        endM:      number;
    }> {
        const openings: Opening[] = wall.openings;
        return openings
            .map(o => ({
                openingId: o.id,
                type:      o.type,
                offsetM:   o.offset,
                endM:      o.offset + o.width,
            }))
            .sort((a, b) => a.offsetM - b.offsetM);
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Module-level singleton — import and call directly, no constructor needed.
 *
 * @example
 *   import { wallOccupancyStore } from './WallOccupancyStore';
 *   const { valid, reason } = wallOccupancyStore.canPlace(wall, 1.2, 0.9);
 */
export const wallOccupancyStore = new WallOccupancyStore();
