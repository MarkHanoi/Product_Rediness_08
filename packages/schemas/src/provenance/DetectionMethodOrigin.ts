// PV-08 / C75 §1.2 — the EXHAUSTIVE, TYPE-CHECKED translation from every legacy
// element-family `detectionMethod` vocabulary into the canonical five.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS
// ─────────────────────────────────────────────────────────────────────────────
// PV-08 (BIM30 gap register, C75 §1.2): *"`detectionMethod` is three non-unified
// enums across the one family that has provenance."* Measured 2026-08-14 by
// `check-provenance-coverage`'s C2 arm, which prints every declaration it finds:
//
//   RoomDetectionMethod      — packages/room-topology/src/RoomTypes.ts:136
//   RoomDetectionMethodSchema— packages/room-topology/src/RoomDataSchema.ts:57
//   FloorDetectionMethod     — packages/core-app-model/src/stores/FloorTypes.ts:58
//   CeilingDetectionMethod   — packages/core-app-model/src/stores/CeilingTypes.ts:26
//   CeilingDetectionMethodSchema
//                            — packages/core-app-model/src/stores/CeilingDataSchema.ts:70
//
// Three vocabularies, SIX declarations, in two packages, neither of them L0 —
// which is C75 §4.d exactly: provenance in a store instead of a schema, invisible
// to the exporters, the renderer and the AI host.
//
// A translation into the five DID exist before this file, and naming where it
// lived is the point: `apps/editor/src/engine/provenance/ElementProvenanceIndex.ts`
// — **L7**. Every layer beneath the editor app could see the vocabularies and none
// of them could see what the members MEANT. It was also weaker than it looked:
//
//   • typed `Readonly<Record<string, ValueProvenance>>`, so a member added to
//     `RoomDetectionMethod` upstream compiled cleanly here and silently resolved
//     to `conflicting-records` — a missing row was indistinguishable from a
//     genuine vocabulary drift, and neither produced an error anywhere;
//   • it covered `RoomDetectionMethod` ONLY. The floor and ceiling families —
//     five members each, including `ai-generated` (INFERRED) and `ifc-import`
//     (OBSERVED) — had no translation at all, in any layer.
//
// This file is that map, at L0, exhaustive **by type** in both directions.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT "TYPE-CHECKED" BUYS, PRECISELY (C75 §2.8 — unrepresentable > checked)
// ─────────────────────────────────────────────────────────────────────────────
// Each map is annotated `{ readonly [K in <Members>]: ValueProvenance }`, a
// MAPPED type over the union rather than a `Record<string, …>`. That is two
// compile errors, not a convention:
//
//   • a member with no row              → "property '<member>' is missing";
//   • a row naming a non-member         → "object literal may only specify known
//                                          properties".
//
// So the vocabulary cannot grow a member that quietly means nothing, and the map
// cannot keep a row for a member that was removed. ⚠ This is the guarantee ONLY
// for the member lists as declared **below**; keeping those in step with the
// upstream copies is a separate problem, and it is answered — not assumed — two
// sections down.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE DOES **NOT** DO — stated so absence is never inferred
// ─────────────────────────────────────────────────────────────────────────────
//  • It does not mint a SIXTH origin, or alias the five. `ValueOrigin.ts` owns
//    the vocabulary and is imported, never restated (C75 §1.2).
//  • It does not decide confidence. C62 / `ElementConfidence` owns *how sure*
//    (C75 §1.3, §4.h).
//  • It does not retire the upstream copies. Those files are `room-topology` (L3)
//    and `core-app-model` (L2); L0 may not import upward, so the canonical
//    declaration has to be here and the retirement of the duplicates is a change
//    in those packages. It is recorded IN WRITING below rather than left to be
//    inferred from this file's existence — PV-08 is not closed by a map that
//    nobody upstream points at.
//  • It does not read the elements. Nothing in `src/elements/*` carries a
//    `detectionMethod` field and none should: the element schemas carry
//    `provenance: RetrofittedProvenanceSchema` — the canonical record with an
//    honest UNKNOWN default — and this map is what translates a LEGACY store DTO
//    into that record. Copying a legacy vocabulary onto an element schema would
//    be minting the fourth and fifth declarations of it.
//
// LAYERING — L0-pure (P5): Zod + plain TS only. Zero I/O, zero THREE, zero DOM,
// no OpenTelemetry span (a span is I/O and would break purity — same reasoning as
// `ValueOrigin.ts` and `site/metadata/DataConfidence.ts`).
//
// Strategic context — docs/02-decisions/contracts/C75-PROVENANCE.md §1.2, §2.4,
// §2.8; docs/04-reference/BIM30-GAP-REGISTER.md row PV-08.

import { z } from 'zod';
import {
    authoredProvenance,
    systemProvenance,
    unknownProvenance,
    type ValueOrigin,
    type ValueProvenance,
} from './ValueOrigin.js';

// ─────────────────────────────────────────────────────────────────────────────
// KEEPING L0 AND THE UPSTREAM COPIES IN STEP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **The one-line adoption that makes vocabulary drift a COMPILE ERROR upstream.**
 *
 * L0 cannot import `RoomDetectionMethod` from `@pryzm/room-topology` (L3) or
 * `FloorDetectionMethod` from `@pryzm/core-app-model` (L2) — a layer may import
 * downward only, and `packages/schemas` is the bottom. So the canonical member
 * lists are DECLARED here, and the upstream files bind themselves to them with:
 *
 * ```ts
 * import type { AssertSameMembers, RoomDetectionMethod as L0RoomDetectionMethod }
 *   from '@pryzm/schemas/provenance';
 * // C75 §1.2 — this union and the L0 one are the same list, or this line fails.
 * const _c75: AssertSameMembers<RoomDetectionMethod, L0RoomDetectionMethod> = true;
 * ```
 *
 * A member added on either side makes the type `never`, and `true` is not
 * assignable to `never` — the error names the file that drifted. That is C75
 * §2.8's top rung (unrepresentable) reached from the only direction available:
 * L0 cannot check upward, so it ships the check for upstream to install.
 *
 * ⚠ **NOT YET ADOPTED, and therefore not yet load-bearing.** The three upstream
 * files are outside this change's territory; until each adds the line, drift is
 * caught only by `check-provenance-coverage`'s C4 arm, which checks that every
 * member literal declared upstream is NAMED in this file. That is a gate, one
 * rung below unrepresentable, and it is stated as such rather than presented as
 * the type check it is standing in for.
 */
export type AssertSameMembers<Upstream extends string, Canonical extends string> =
    [Exclude<Upstream, Canonical>] extends [never]
        ? ([Exclude<Canonical, Upstream>] extends [never] ? true : never)
        : never;

/** @internal Binds a type-level control to a value, so `tsc` has to evaluate it. */
const controlValue = <T>(v: T): T => v;

/**
 * **{@link AssertSameMembers}' negative control — evaluated by every `tsc` over
 * this package, not by a test.**
 *
 * A guard that has never been watched refusing is UNPROVEN (C75 §6.2), and this
 * one is pure type-level machinery: it produces no runtime behaviour a test could
 * observe, so a test asserting it would assert nothing. The two
 * `@ts-expect-error`s below ARE the assertions — if `AssertSameMembers` ever stops
 * catching drift in either direction, the expected error does not occur and
 * TypeScript reports the directive itself as unused. The typecheck goes red.
 *
 * ⭐ **WATCHED FAILING, 2026-08-14, with the text recorded here** (C75 §6.2 — an
 * arm never seen refusing is UNPROVEN). The guard was temporarily replaced with
 * `= true` — i.e. a version that accepts any two member sets — and
 * `pnpm --filter @pryzm/schemas typecheck` reported, before being restored:
 *
 * ```
 * src/provenance/DetectionMethodOrigin.ts(153,5): error TS2578: Unused '@ts-expect-error' directive.
 * src/provenance/DetectionMethodOrigin.ts(155,5): error TS2578: Unused '@ts-expect-error' directive.
 * Exit status 2
 * ```
 *
 * Both directions fired, not one.
 *
 * ⚠ It lives in `src/` rather than in `__tests__/` deliberately, and the reason is
 * measured rather than stylistic. This package has TWO compile configurations:
 * `tsconfig.json` (`include: ['src/**\/*']`) is what `pnpm --filter @pryzm/schemas
 * typecheck`, the package `build` and the per-package compile gate run;
 * `tsconfig.tests.json` (`src/**` + `__tests__/**`) is what the root
 * `npm run schemas:typecheck` runs. A control written beside the tests is
 * evaluated by the second only — and that config is RED at HEAD on unrelated
 * pre-existing errors, so a regression in it would arrive inside noise. In `src/`
 * the control is evaluated by BOTH, including the one that must stay green to
 * build. Exported rather than local for a similar reason: an unused local is
 * tolerated by some configurations and flagged by others; a named export is
 * checked by all of them.
 */
export const ASSERT_SAME_MEMBERS_CONTROL: readonly boolean[] = Object.freeze([
    // Positive: the same set spelled in a different order is accepted.
    controlValue<AssertSameMembers<'a' | 'b', 'b' | 'a'>>(true),
    // @ts-expect-error — a member the canonical list LACKS must be rejected.
    controlValue<AssertSameMembers<'a' | 'b', 'a'>>(true),
    // @ts-expect-error — a member ONLY the canonical list has must be rejected.
    controlValue<AssertSameMembers<'a', 'a' | 'b'>>(true),
]);

// ─────────────────────────────────────────────────────────────────────────────
// THE VOCABULARIES, AT L0
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a room boundary was established — mirrors
 * `packages/room-topology/src/RoomTypes.ts` member-for-member.
 *
 * The first five are DETERMINATIONS: each states something the system actually
 * established. The last two are not, and their presence is what let PV-01 be
 * fixed at all — a vocabulary with no way to say *"not known"* leaves
 * `|| 'auto-topology'` as the cheapest thing to write:
 *
 *  - `origin-unknown` — C75 §1.4's unknown-with-reason. **Never translated into
 *    one of the five** (see {@link ROOM_DETECTION_ORIGIN}'s key type).
 *  - `repaired-ring`  — C75 §2.3's substituted geometry.
 */
export const RoomDetectionMethodSchema = z.enum([
    'auto-topology',
    'manual-boundary',
    'point-pick',
    'ai-generated',
    'ifc-import',
    'origin-unknown',
    'repaired-ring',
]);
export type RoomDetectionMethod = z.infer<typeof RoomDetectionMethodSchema>;

/**
 * The subset a producer may claim about work it actually did — the
 * `SystemWritableOrigin` / `KnownLandBasis` narrowing idiom (C75 §2.8), and the
 * key type of {@link ROOM_DETECTION_ORIGIN}.
 *
 * ⭐ `origin-unknown` is excluded **by type**, which is the whole reason the map
 * is exhaustive and still honest: every key of that map is a determination, so
 * every row can name one of the five without a single row having to invent an
 * origin for "we do not know". A `Record<RoomDetectionMethod, …>` would have
 * demanded exactly that invention, and the cheapest way to satisfy it is the
 * defect this contract exists to forbid.
 */
export type DeterminedRoomDetectionMethod = Exclude<RoomDetectionMethod, 'origin-unknown'>;

/**
 * How a floor-finish or ceiling boundary was established.
 *
 * ⭐ **ONE list, two names — and that is a measured claim, not a tidy-up.**
 * `FloorDetectionMethod` (`FloorTypes.ts:58`) and `CeilingDetectionMethod`
 * (`CeilingTypes.ts:26`, `CeilingDataSchema.ts:70`) are character-for-character
 * identical upstream, and `check-derived-not-authored`'s own table already names
 * them as a single row (*"Floor/CeilingDetectionMethod"*). Declaring them here
 * as two separate `z.enum`s would mint two rival lists inside the very file that
 * exists to unify them; declaring one and exporting it under both names makes
 * the identity structural, so it cannot drift apart later.
 *
 * ⚠ **Note what this union LACKS, because it is the next real gap:** there is no
 * `origin-unknown` member. `RoomDetectionMethod` gained one with the C75 §7
 * fixes; the floor / ceiling family did not, so a floor DTO whose origin is
 * genuinely not known has nothing honest to store and
 * {@link classifyFinishBoundaryDetectionMethod} can only report the absence from
 * the outside. Adding the member is a change in `core-app-model` (and its two
 * Zod copies), out of L0's reach — recorded here rather than papered over.
 */
export const FinishBoundaryDetectionMethodSchema = z.enum([
    'manual-polygon',
    'from-room',
    'from-slab',
    'ai-generated',
    'ifc-import',
]);
export type FinishBoundaryDetectionMethod = z.infer<typeof FinishBoundaryDetectionMethodSchema>;

/** The floor family's vocabulary. The SAME object as {@link FinishBoundaryDetectionMethodSchema}. */
export const FloorDetectionMethodSchema = FinishBoundaryDetectionMethodSchema;
/** The ceiling family's vocabulary. The SAME object as {@link FinishBoundaryDetectionMethodSchema}. */
export const CeilingDetectionMethodSchema = FinishBoundaryDetectionMethodSchema;
export type FloorDetectionMethod = FinishBoundaryDetectionMethod;
export type CeilingDetectionMethod = FinishBoundaryDetectionMethod;

// ─────────────────────────────────────────────────────────────────────────────
// THE MAPS — exhaustive by type, in both directions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `RoomDetectionMethod` → the five. Every row is a judgement, and every judgement
 * is stated:
 *
 *  - `manual-boundary` → **authored**. The user drew the polygon (`RoomTool.ts`
 *    stamps it from the drawing tool). One of the two rows that mints `authored`,
 *    and it goes through `authoredProvenance()` — the single constructor a grep
 *    for human-authorship claims finds (C75 §2.2).
 *  - `point-pick` → **authored**. The polygon was traced by the system, but the
 *    ASSERTION that a room exists here is the user's — and that assertion is what
 *    a regeneration pass would destroy.
 *  - `auto-topology` → **computed**. Flood-fill from the wall graph: deterministic,
 *    and the same inputs reproduce it. ⛔ NOT `inferred` — C75 §1.2 forbids
 *    merging the two, and a flood fill is *entailed by* the wall graph rather than
 *    *guessed from* it.
 *  - `repaired-ring` → **inferred**, and this row is why the member exists.
 *    `repairToSimplePolygon()` substitutes the largest simple sub-ring for a
 *    self-intersecting traced one: plausible, not entailed. Mapping it to
 *    `computed` alongside `auto-topology` would be the exact COMPUTED/INFERRED
 *    collapse of C75 §0 Finding 4.
 *  - `ai-generated` → **inferred**. Judgement-bearing by construction.
 *  - `ifc-import` → **observed**. Received from a source of record, unmodified.
 *
 * ⚠ **The `auto-topology` caveat is permanent and must not be deleted on the
 * grounds that PV-01 is fixed.** `roomSnapshotUtils.ts:156` wrote `auto-topology`
 * as a `||` default until 2026-08-12. Rooms saved before that date carry a value
 * that is genuinely ambiguous between *"flood-filled from the wall graph"* and
 * *"we had no idea"*, and nothing can now separate them — the information was
 * never recorded. Fixing a fabrication stops new ones; it does not un-fabricate
 * the old, so the ambiguity travels in `detail` where a reader meets it.
 *
 * `detail` is required on every `inferred` row by `ValueProvenanceSchema`'s own
 * refinement, so those rows cannot be written without saying what produced them.
 */
const ROOM_ROWS: { readonly [K in DeterminedRoomDetectionMethod]: ValueProvenance } = {
    'manual-boundary': authoredProvenance('user drew the room boundary (RoomTool)'),
    'point-pick': authoredProvenance('user picked a point to declare this room'),
    'auto-topology': systemProvenance(
        'computed',
        'flood-filled from the wall graph (RoomDetectionEngine) — ⚠ also the || default at ' +
        'roomSnapshotUtils.ts:156 until 2026-08-12, so on a room saved before that date this ' +
        'value is ambiguous with "not recorded"',
    ),
    'repaired-ring': systemProvenance(
        'inferred',
        'boundary SUBSTITUTED by the §A.21.D58 repair — the traced ring self-intersected and its ' +
        'largest simple sub-ring was used instead; vertices were discarded, so the stored extent ' +
        'may understate the room (counts in RoomBoundary.detectionDetail)',
    ),
    'ai-generated': systemProvenance('inferred', 'placed by an AI pass from a programme description'),
    'ifc-import': systemProvenance('observed', 'imported from IFC IfcSpace geometry'),
};

/** {@link ROOM_ROWS}, frozen. Exhaustive over {@link DeterminedRoomDetectionMethod}. */
export const ROOM_DETECTION_ORIGIN = Object.freeze(ROOM_ROWS);

/**
 * `FloorDetectionMethod` / `CeilingDetectionMethod` → the five. **No translation
 * of this family existed anywhere before PV-08** — not at L0, not at L7 — so
 * every row below is new, and each is argued:
 *
 *  - `manual-polygon` → **authored**. The user drew the finish outline. The
 *    family's one authored member, and `check-derived-not-authored` already names
 *    it for exactly that reason: *"the drew-it-by-hand member of both unions — a
 *    default here mints authorship for the floor/ceiling family."*
 *  - `from-room` → **computed**. The boundary is the room polygon, taken whole.
 *    Deterministic and re-derivable from the room, so `computed` — but ⚠ note what
 *    that does NOT claim: it says nothing about where the ROOM's boundary came
 *    from. A finish derived from a hand-drawn room is `computed` here and the
 *    room stays `authored`; provenance is per value, and C75 §2.6 forbids a
 *    consumer widening one into the other.
 *  - `from-slab` → **computed**. Same reasoning, one host over: the finish
 *    inherits the structural slab's outline (`hostSlabId`, the slab-binding rule
 *    in `FloorTypes.ts`).
 *  - `ai-generated` → **inferred**. Judgement-bearing by construction.
 *  - `ifc-import` → **observed**. An `IfcCovering`/`FLOORING` (or its ceiling
 *    equivalent) received from a source of record, unmodified.
 *
 * ⚠ **This map is honest about the members, and silent about the producers.**
 * That every floor DTO in the wild actually carries the member matching how it
 * was made is NOT established by anything here — C75 §6.3.b: runtime provenance
 * is invisible to a source scan. A row translates a stored value; it cannot
 * vouch for it.
 */
const FINISH_BOUNDARY_ROWS: { readonly [K in FinishBoundaryDetectionMethod]: ValueProvenance } = {
    'manual-polygon': authoredProvenance('user drew the finish outline (FloorTool / CeilingTool)'),
    'from-room': systemProvenance(
        'computed',
        "taken from the linked room's boundary polygon (hostRoomId) — deterministic; says nothing " +
        "about the ROOM boundary's own origin",
    ),
    'from-slab': systemProvenance(
        'computed',
        'taken from the host structural slab outline (hostSlabId, the slab-binding rule) — ' +
        'deterministic and re-derivable from the slab',
    ),
    'ai-generated': systemProvenance('inferred', 'placed by an AI pass from a programme description'),
    'ifc-import': systemProvenance('observed', 'imported from an IFC covering (IfcCovering/FLOORING)'),
};

/** {@link FINISH_BOUNDARY_ROWS}, frozen. Exhaustive over {@link FinishBoundaryDetectionMethod}. */
export const FINISH_BOUNDARY_DETECTION_ORIGIN = Object.freeze(FINISH_BOUNDARY_ROWS);

/** The floor family's map. The SAME object as {@link FINISH_BOUNDARY_DETECTION_ORIGIN}. */
export const FLOOR_DETECTION_ORIGIN = FINISH_BOUNDARY_DETECTION_ORIGIN;
/** The ceiling family's map. The SAME object as {@link FINISH_BOUNDARY_DETECTION_ORIGIN}. */
export const CEILING_DETECTION_ORIGIN = FINISH_BOUNDARY_DETECTION_ORIGIN;

/**
 * The member that is C75 §1.4's unknown-with-reason rather than a determination.
 * Deliberately **not** a key of {@link ROOM_DETECTION_ORIGIN}: putting it in a
 * map of determinations would have required inventing an origin for it, which is
 * the defect this whole cluster exists to refuse.
 */
const ORIGIN_UNKNOWN_METHOD = 'origin-unknown';

// ─────────────────────────────────────────────────────────────────────────────
// READING — total functions over `unknown`, because that is what a DTO is
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translate a stored room `detectionMethod` into the canonical vocabulary.
 *
 * Takes `unknown` on purpose: the values this sees come off legacy store DTOs and
 * deserialised snapshots, where the field is typed `string` at best. A total
 * function over `unknown` is what removes the temptation to write the `as any`
 * that C75 §4.b names — there is nothing left to cast.
 *
 * The three non-determination answers are DIFFERENT answers, never merged:
 *  - absent / not a string → `not-recorded` (nothing was stored);
 *  - `origin-unknown`      → `not-recorded` (the record STATES its origin is not
 *    known; the finer reason lives in the DTO's own `detectionDetail`, which this
 *    function is not given and will not guess at);
 *  - an unrecognised value → `conflicting-records`, a POSITIVE finding: a value IS
 *    present and this translation cannot account for it. That is vocabulary drift
 *    — PV-08's own subject — and filing it as an absence would throw away the one
 *    fact actually established.
 */
export function classifyRoomDetectionMethod(method: unknown): ValueProvenance {
    if (typeof method !== 'string' || method.length === 0) {
        return unknownProvenance('not-recorded');
    }
    if (method === ORIGIN_UNKNOWN_METHOD) {
        return unknownProvenance('not-recorded');
    }
    const row = (ROOM_DETECTION_ORIGIN as Record<string, ValueProvenance | undefined>)[method];
    if (row === undefined) {
        return unknownProvenance('conflicting-records');
    }
    return row;
}

/**
 * Translate a stored floor / ceiling `detectionMethod` into the canonical
 * vocabulary. Same contract as {@link classifyRoomDetectionMethod}.
 *
 * ⚠ This family has no `origin-unknown` member (see
 * {@link FinishBoundaryDetectionMethodSchema}), so an absent field is the ONLY
 * way a floor or ceiling can currently say "not known" — and it says it by
 * omission, which C75 §1.4 is precisely against. Reported as `not-recorded`,
 * which is the honest reading of an absence, and named here as the reason the
 * upstream union should gain the member.
 */
export function classifyFinishBoundaryDetectionMethod(method: unknown): ValueProvenance {
    if (typeof method !== 'string' || method.length === 0) {
        return unknownProvenance('not-recorded');
    }
    const row = (FINISH_BOUNDARY_DETECTION_ORIGIN as Record<string, ValueProvenance | undefined>)[method];
    if (row === undefined) {
        return unknownProvenance('conflicting-records');
    }
    return row;
}

/**
 * Every mapped member, as flat rows — for a gate enumerating the translation, a
 * UI legend, or an export note. Derived from the maps rather than hand-listed, so
 * it cannot become a fourth place the vocabulary is written down.
 *
 * ⚠ `origin` is `ValueOrigin`, never `null`: this table lists DETERMINATIONS
 * only. The unknown answers are reachable through the `classify*` functions and
 * are deliberately absent here — a legend that showed "unknown" as a sixth row
 * would re-create the sixth member C75 §1.4 refuses.
 */
export interface DetectionMethodOriginRow {
    readonly vocabulary: 'RoomDetectionMethod' | 'Floor/CeilingDetectionMethod';
    readonly member: string;
    readonly origin: ValueOrigin;
    readonly detail: string | undefined;
}

/** {@link DetectionMethodOriginRow} for every member of every mapped vocabulary. */
export function detectionMethodOriginRows(): readonly DetectionMethodOriginRow[] {
    const rows: DetectionMethodOriginRow[] = [];
    for (const [member, p] of Object.entries(ROOM_DETECTION_ORIGIN)) {
        if (p.origin === null) continue;
        rows.push({ vocabulary: 'RoomDetectionMethod', member, origin: p.origin, detail: p.detail });
    }
    for (const [member, p] of Object.entries(FINISH_BOUNDARY_DETECTION_ORIGIN)) {
        if (p.origin === null) continue;
        rows.push({
            vocabulary: 'Floor/CeilingDetectionMethod',
            member,
            origin: p.origin,
            detail: p.detail,
        });
    }
    return rows;
}
