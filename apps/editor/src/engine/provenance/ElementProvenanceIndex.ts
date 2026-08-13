// ─── R8 · ElementProvenanceIndex — provenance at ELEMENT grain ───────────────
//
// BIM30 R8 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md, whose text is the
// specification this file answers to:
//
//   "`ElementOrigin` lands in schemas (the roadmap's provenance fields ARE this — one
//    stream, not two); regeneration becomes an authority question over it; the report's
//    provenance section goes from actor-metadata to element-grain. Generation engines gain
//    already-generated awareness (the duplicate-on-rerun defects) and the house executor's
//    silent room deletion becomes a reported, refusable consequence.
//    **Exit**: the authored-state-protection scenario (review §6) passes as an executed test."
//
// ── WHAT THIS FILE IS, AND — LOUDLY — WHAT IT IS NOT ─────────────────────────
//
// This is the READ side of R8: given an element, what does the system actually KNOW about
// where it came from, and MAY a regeneration pass overwrite it? It is deliberately a
// separate, additive index rather than a field on the element schemas, and that choice is
// the honest one available today rather than the one R8 would prefer:
//
//   • The five-value vocabulary EXISTS at L0 — `@pryzm/schemas/provenance`'s `ValueOrigin`
//     / `ValueProvenance` (landed 57f2b539, C75 §1–§2). This file does NOT define a second
//     one. C75 §1.2 forbids aliasing the five per package, and a rival union here would be
//     exactly that. Every origin this module returns is a `ValueProvenance` minted by C75's
//     OWN constructors, so `authored` can only appear where a human genuinely acted.
//
//   • ⛔ NO ELEMENT IN THIS REPOSITORY CARRIES PROVENANCE TODAY. Measured 2026-08-12:
//     every `origin:` in `packages/schemas/src/elements/*` is a geometric `Vec3` (C75 §0
//     Finding 2, re-measured and still true), and `generationId` / `generatedBy` /
//     `isGenerated` / `sourceGenerator` return ZERO hits across `packages/`, `plugins/` and
//     `apps/`. There is no field to read. This index therefore reports
//     `producer-not-instrumented` for essentially every element it is asked about, and that
//     is the CORRECT answer, not a degraded one — it is a fact about our instrumentation,
//     and C75's `ProvenanceUnknownReason` has a member for exactly this case precisely so
//     the fact can be stated rather than defaulted away.
//
//   • ⛔ IT DOES NOT INVENT AUTHORSHIP. The single most expensive thing this file could do
//     is guess. `Metadata.createdBy` defaults to the literal string `'system'`
//     (`packages/schemas/src/base/primitives.ts:43`) and is stamped by STORES, not by
//     users — so reading `createdBy !== 'system'` as "a human authored this" would mint
//     `authored` out of a store's default. That is C75 §2.2's forbidden move and the exact
//     shape of the `|| 'auto-topology'` defect (PV-01). `classify()` returns UNKNOWN with a
//     reason instead, and `systemProvenance`'s type makes the alternative unrepresentable:
//     it cannot be handed `'authored'`.
//
// ── THE AUTHORITY QUESTION (STR-06 §15 — the reason R8 is ORDERED before regeneration) ──
//
// "Regeneration is an authority question — who owns this element, who may replace it, what
// if the user edited it." {@link mayRegenerate} is that question as a total function, and
// its THIRD answer is the one that matters: an element of UNKNOWN provenance is neither
// protected nor free to overwrite. It is `unknown-authority`, and a caller must decide
// deliberately. Collapsing that third case into either of the other two is the defect —
// collapse it to `allowed` and a generator silently destroys a user's work (which is what
// `§GRAPH-CLEAR-FIRST` does today, see below); collapse it to `refused` and no generator
// can ever run on a legacy model. The whole point of R8 landing before regeneration is that
// this decision gets made ONCE, in the open, rather than per-generator by accident.
//
// ── THE LIVE DEFECT THIS MODULE MAKES VISIBLE ────────────────────────────────
//
// `apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts:1757-1766` (§GRAPH-CLEAR-FIRST)
// reads EVERY room on a level and dispatches `room.delete` for each, unfiltered:
//
//     const stale = roomStore?.getByLevel?.(levelId) ?? [];
//     for (const r of stale) {
//       try { void runtime.bus.executeCommand('room.delete', { roomId: r.id }); }
//       catch { /* non-fatal — best-effort clear */ }
//     }
//
// The block's own comment asserts the rooms are "pre-existing (detection)" artefacts. It
// cannot know that: there is no field distinguishing a detection artefact from a room a
// human named and kept, which is precisely what R8 exists to supply. A user-authored room
// on that level is deleted, the deletion is fire-and-forget (`void`, never awaited), the
// failure path is swallowed (`catch {}`), and the user is never told. R8's exit condition
// calls this out by name: "the house executor's silent room deletion becomes a reported,
// refusable consequence."
//
// {@link planRegenerationClear} is that reported, refusable form — a PURE function that
// turns a proposed clear-set into a decision with three named buckets and a refusal when
// authority is absent. It computes; it does not delete. Wiring it into the executor is a
// SEPARATE change inside another agent's live territory (`HouseLayoutExecutor.ts` is not
// mine this session), so this module ships as the answer the executor should be asking, and
// `check-authored-state-protection` drives it directly rather than through the executor.
// That is stated here so nobody reads this file's existence as a claim that the defect is
// FIXED. It is MEASURED. The gate says so on every run.
//
// ── LAYERING ────────────────────────────────────────────────────────────────
// L7 (`apps/editor`). Imports L0 `@pryzm/schemas/provenance` only — downward, and the
// single vocabulary. No store, no bus, no DOM, no THREE: every function here is pure over
// its arguments, which is what lets the gate drive the REAL functions rather than a
// re-implementation of them.

import {
    unknownProvenance,
    systemProvenance,
    authoredProvenance,
    hasKnownOrigin,
    describeProvenance,
    type ValueProvenance,
    type ProvenanceUnknownReason,
} from '@pryzm/schemas/provenance';

// ─────────────────────────────────────────────────────────────────────────────
// THE ONE ELEMENT-GRAIN PROVENANCE SIGNAL THAT ALREADY EXISTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `RoomBoundary.detectionMethod` (`packages/room-topology/src/RoomTypes.ts:100`) is the
 * ONLY element-level provenance in the repository — C75 §4.d names it and notes that it
 * lives outside L0, invisible to the exporters, the renderer and the AI host. R8 does not
 * move it (that is `packages/room-topology`, another agent's live territory this session);
 * R8 READS it, and translates it into the single L0 vocabulary so that a room's origin can
 * be compared with any other element's.
 *
 * ⭐ The translation is the interesting part, and every row is a judgement worth stating:
 *
 *  - `manual-boundary` → **authored**. The user drew the polygon (`RoomTool.ts:199` stamps
 *    it from the drawing tool). This is a human decision, and it is the ONE mapping that
 *    mints `authored` — which is why it goes through `authoredProvenance()`, the single
 *    constructor a grep for human-authorship claims finds.
 *  - `point-pick`      → **authored**. The user clicked inside a zone to declare it a room.
 *    The POLYGON was traced by the system, but the ASSERTION that a room exists here is the
 *    user's, and that assertion is what a regeneration pass would destroy.
 *  - `auto-topology`   → **computed**. Flood-fill from the wall graph: deterministic, and
 *    the same inputs reproduce it. NOT `inferred` — C75 §1.2 forbids merging the two, and
 *    a flood fill is entailed by the wall graph, not guessed from it.
 *  - `ai-generated`    → **inferred**. Judgement-bearing by construction. `detail` is
 *    REQUIRED on `inferred` by `ValueProvenanceSchema`'s own refinement, so this row cannot
 *    be written without saying what produced it — the type enforces the honesty.
 *  - `ifc-import`      → **observed**. Received from an external source of record, unmodified.
 *
 * ⚠ **PV-01 — FIXED 2026-08-12, and the residue is permanent.** `roomSnapshotUtils.ts:156`
 * used to write `auto-topology` as a `||` DEFAULT for any snapshot lacking the field. It now
 * records `origin-unknown` with a reason (C75 §7 exit condition 1), so every room loaded from
 * this day forward is honest. **But rooms already on disk are not**: a stored `auto-topology`
 * written before the fix remains genuinely ambiguous between "flood-filled from the wall
 * graph" and "we had no idea and defaulted", and NOTHING can now distinguish them — the
 * information was never recorded. {@link classifyRoomBoundary} does not pretend otherwise;
 * the `detail` on the `auto-topology` row carries the caveat, and it must NOT be removed on
 * the grounds that the defect is fixed. Fixing a fabrication stops new ones; it does not
 * un-fabricate the old.
 */
const DETECTION_METHOD_TO_ORIGIN: Readonly<Record<string, ValueProvenance>> = Object.freeze({
    'manual-boundary': authoredProvenance('user drew the room boundary (RoomTool)'),
    'point-pick': authoredProvenance('user picked a point to declare this room'),
    'auto-topology': systemProvenance(
        'computed',
        'flood-filled from the wall graph (RoomDetectionEngine) — ⚠ also the || default at roomSnapshotUtils.ts:156, so this value is ambiguous with "not recorded"',
    ),
    'ai-generated': systemProvenance('inferred', 'placed by an AI pass from a programme description'),
    'ifc-import': systemProvenance('observed', 'imported from IFC IfcSpace geometry'),
    // ─── The two members added 2026-08-12 with the C75 §7 fixes ──────────────
    // `repaired-ring` → **inferred**, and this row is the whole reason the member
    // exists. `repairToSimplePolygon()` substitutes the largest simple sub-ring
    // for a self-intersecting traced one: PLAUSIBLE, not entailed by the wall
    // graph. Mapping it to `computed` alongside `auto-topology` would be exactly
    // the COMPUTED/INFERRED merge C75 §1.2 forbids and C75 §0 Finding 4 found.
    // ⚠ The room's true extent may be LARGER than what is stored — discarded
    // vertices are discarded area — so `detail` says so rather than implying the
    // repair was lossless.
    'repaired-ring': systemProvenance(
        'inferred',
        'boundary SUBSTITUTED by §A.21.D58 repair — the traced ring self-intersected and its largest ' +
        'simple sub-ring was used instead; vertices were discarded, so the stored extent may understate ' +
        'the room (see RoomBoundary.detectionDetail for the counts)',
    ),
});

/**
 * `origin-unknown` is deliberately **NOT** in the table above, and its absence is
 * the design rather than an omission.
 *
 * It is not a determination to be translated — it is C75 §1.4's unknown-with-
 * reason, already in the honest form, so it must resolve to an UNKNOWN
 * `ValueProvenance` and not to any of the five. Putting it in a
 * `Record<string, ValueProvenance>` of determinations would have required
 * inventing an origin for it, which is the defect this whole file exists to
 * refuse. {@link classifyRoomBoundary} routes it explicitly instead.
 */
const ORIGIN_UNKNOWN_METHOD = 'origin-unknown';

/**
 * Translate a room's `detectionMethod` into the L0 vocabulary, or UNKNOWN with a reason
 * when the value is absent or is not one of the five members.
 *
 * An UNRECOGNISED value returns `conflicting-records` rather than `not-recorded`: a value
 * IS present and this translation cannot account for it, which is a positive finding about a
 * vocabulary drift (C75 §PV-08's three non-unified enums), not an absence.
 */
export function classifyRoomBoundary(detectionMethod: unknown): ValueProvenance {
    if (typeof detectionMethod !== 'string' || detectionMethod.length === 0) {
        return unknownProvenance('not-recorded');
    }
    // C75 §1.4 — the room STATES that its origin is not known. Carry that
    // through as an UNKNOWN; never translate it into one of the five. Reported
    // as `not-recorded` because that is what the member means at element grain:
    // the producer had a place to state an origin and there is none. (The finer
    // reason — `predates-provenance` vs `conflicting-records` — lives in the
    // room's own `detectionDetail`; this index reads `detectionMethod` alone and
    // does not reach for it, so it reports the coarser truth rather than
    // guessing the finer one.)
    if (detectionMethod === ORIGIN_UNKNOWN_METHOD) {
        return unknownProvenance('not-recorded');
    }
    const mapped = DETECTION_METHOD_TO_ORIGIN[detectionMethod];
    if (mapped === undefined) {
        return unknownProvenance('conflicting-records');
    }
    return mapped;
}

// ─────────────────────────────────────────────────────────────────────────────
// WHAT THE INDEX CAN BE TOLD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The minimum an element must expose for {@link classify} to say anything at all.
 * Deliberately structural (not an import of a concrete element type): rooms, walls,
 * doors and windows live in four different stores with four different shapes, and R8's
 * question is the same for all of them.
 */
export interface ProvenanceReadable {
    readonly id: string;
    /**
     * The store-stamped metadata block. `createdBy` is present on every element in the
     * repo — and it is NOT evidence of human authorship (see the file header).
     */
    readonly metadata?: { readonly createdBy?: string } | undefined;
    /**
     * Where a *future* provenance field would live once the schemas are retrofitted
     * (roadmap Phase 8 / C75 §3's coverage ratchet). Read OPTIONALLY and defensively so
     * this module starts answering truthfully the day the field lands, without a change
     * here — and reports `producer-not-instrumented` until then.
     */
    readonly provenance?: ValueProvenance | undefined;
    /**
     * Rooms only — the one element-grain provenance signal that exists at HEAD. Read
     * structurally so this module needs no dependency on `@pryzm/room-topology` (an L3
     * package; this is L7 and could import it, but a structural read keeps the index usable
     * over any element that grows a comparable field). See {@link classifyRoomBoundary}.
     */
    readonly boundary?: { readonly detectionMethod?: unknown } | undefined;
}

/**
 * A record of a generator run, supplied by a caller that HAS one. This is the
 * "already-generated awareness" half of R8's exit condition, in the only form available
 * without persisted markers: the caller states which ids its previous pass minted.
 *
 * ⚠ Stated plainly: this is WEAKER than a persisted `generationId` on the element, and it
 * is weaker in a way that matters — it survives no reload, so a generator re-run in a fresh
 * session has no awareness at all. It is not a substitute for the schema field; it is the
 * interface that field will feed. Named `declared` rather than `known` so no reader mistakes
 * a caller's claim for a model fact.
 */
export interface DeclaredGenerationRun {
    /** Which generator. Free text, because the generators are not enumerated anywhere yet. */
    readonly generator: string;
    /** Element ids this generator states it produced. */
    readonly produced: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFY — what do we actually know?
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The element-grain provenance of one element, as a C75 {@link ValueProvenance}.
 *
 * Resolution order, each step justified:
 *  1. **A real provenance field**, if the element carries one. Once the schemas are
 *     retrofitted this is the only branch that ever fires, and this function becomes a
 *     pass-through — which is the intended end state.
 *  2. **A declared generation run** naming this id → `computed`, with the generator named
 *     in `detail`. `computed`, never `inferred`: a deterministic layout pass over stated
 *     inputs is entailed by them. (A generator that is genuinely judgement-bearing — an AI
 *     floorplan proposal — should declare `inferred` itself once it can; this function will
 *     not guess which kind a generator is, so it reports what it can defend.)
 *  3. **A room's `detectionMethod`** → {@link classifyRoomBoundary}. The one element-grain
 *     signal that exists at HEAD, and the reason the authored-protection scenario is
 *     executable for ROOMS today and for nothing else.
 *  4. **Otherwise UNKNOWN**, with `producer-not-instrumented` — the producing path exists
 *     but writes no provenance. ⛔ Never `authored`. Never `computed`. The absence of a
 *     marker is not evidence in either direction, and this is the branch that fires for
 *     essentially every element in the repository today.
 *
 * @param element the element to classify
 * @param runs generation runs the caller can vouch for (may be empty — the common case)
 */
export function classify(
    element: ProvenanceReadable,
    runs: readonly DeclaredGenerationRun[] = [],
): ValueProvenance {
    if (element.provenance !== undefined) return element.provenance;

    for (const run of runs) {
        if (run.produced.includes(element.id)) {
            return systemProvenance(
                'computed',
                `produced by generator '${run.generator}' (declared by the caller; not persisted on the element)`,
            );
        }
    }

    // Step 3 — a room's `detectionMethod`, the one element-grain signal at HEAD.
    if (element.boundary?.detectionMethod !== undefined) {
        return classifyRoomBoundary(element.boundary.detectionMethod);
    }

    // ⛔ THE BRANCH THAT MUST NOT BECOME A GUESS. `metadata.createdBy` is read ONLY to
    // sharpen the REASON — never to mint an origin. Both outcomes are UNKNOWN.
    const reason: ProvenanceUnknownReason = 'producer-not-instrumented';
    return unknownProvenance(reason);
}

// ─────────────────────────────────────────────────────────────────────────────
// THE AUTHORITY QUESTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * May a regeneration pass overwrite or delete this element?
 *
 * THREE answers, and the third is load-bearing:
 *  - `allowed`        — the system produced it and may replace it (`computed` / `inferred`
 *                       / `regenerated` / `observed`… anything but a human's decision).
 *  - `refused`        — `authored`. A human stated this. C75 §2.2/§2.6: only `authored`
 *                       earns the claim that it is the user's, and it is the one origin a
 *                       machine pass may not silently discard.
 *  - `unknown-authority` — provenance is not known. **Neither protected nor free.** The
 *                       caller must decide in the open and say what it decided.
 */
export type RegenerationAuthority =
    | { readonly kind: 'allowed'; readonly provenance: ValueProvenance }
    | { readonly kind: 'refused'; readonly provenance: ValueProvenance; readonly because: string }
    | { readonly kind: 'unknown-authority'; readonly provenance: ValueProvenance; readonly because: string };

/**
 * {@link RegenerationAuthority} for one element. A total function — every element gets an
 * answer, and "we do not know" is one of them rather than a thrown error or a `false`.
 */
export function mayRegenerate(
    element: ProvenanceReadable,
    runs: readonly DeclaredGenerationRun[] = [],
): RegenerationAuthority {
    const provenance = classify(element, runs);

    if (!hasKnownOrigin(provenance)) {
        return {
            kind: 'unknown-authority',
            provenance,
            because:
                `provenance of '${element.id}' is not known (${provenance.unknownReason}) — ` +
                'it is neither protected as authored nor established as generated, so overwriting it ' +
                'is a decision the caller must make explicitly rather than one this index can make for it',
        };
    }

    if (provenance.origin === 'authored') {
        return {
            kind: 'refused',
            provenance,
            because:
                `'${element.id}' is AUTHORED — a human stated it. C75 §2.2: a regeneration pass ` +
                'may not silently replace a human decision',
        };
    }

    return { kind: 'allowed', provenance };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE REPORTED, REFUSABLE CLEAR — R8's named defect, as a decision
// ─────────────────────────────────────────────────────────────────────────────

/** One element's place in a proposed clear, with the reason it landed there. */
export interface ClearDecision {
    readonly id: string;
    readonly authority: RegenerationAuthority;
    /** The one-line human sentence, for the consequence report and the confirmation card. */
    readonly sentence: string;
}

/**
 * The decision a generator's clear-first step SHOULD produce instead of an unfiltered
 * `for (…) void bus.executeCommand('room.delete', …)`.
 *
 * ⭐ Note what makes this reportable where the executor's loop is not: nothing is deleted,
 * NOTHING IS SILENT, and the three buckets are separate. `protected` is the set a human
 * would lose; `unknownAuthority` is the set nobody can vouch for. Today, with no element
 * carrying provenance, EVERY id lands in `unknownAuthority` — and a generator that clears
 * that set anyway is now doing so visibly, against a named list, rather than by accident.
 *
 * `refuse` is `true` when the clear cannot proceed without destroying something the system
 * cannot account for. It is a REFUSAL WITH BOTH NUMBERS in the house sense: the sentence
 * carries how many were requested and how many could not be vouched for.
 */
export interface ClearPlan {
    /** Safe to remove: the system produced them and may replace them. */
    readonly clearable: readonly ClearDecision[];
    /** AUTHORED — removing these destroys a human decision. */
    readonly protected: readonly ClearDecision[];
    /** Provenance unknown — neither protected nor free. */
    readonly unknownAuthority: readonly ClearDecision[];
    /** Should the caller stop and ask? */
    readonly refuse: boolean;
    /** The sentence a report or card shows, carrying the counts. */
    readonly sentence: string;
}

/**
 * Turn a proposed clear-set into a {@link ClearPlan}. Pure: it reads the elements it is
 * given and returns a decision. It performs no deletion and dispatches no command — which
 * is exactly why a certification gate can drive it directly and why it can be consulted
 * BEFORE anything is destroyed.
 *
 * @param elements the elements a generator proposes to clear
 * @param runs generation runs the caller can vouch for
 * @param generator the generator's name, for the sentence
 */
export function planRegenerationClear(
    elements: readonly ProvenanceReadable[],
    runs: readonly DeclaredGenerationRun[] = [],
    generator = 'a generation pass',
): ClearPlan {
    const clearable: ClearDecision[] = [];
    const protectedSet: ClearDecision[] = [];
    const unknownAuthority: ClearDecision[] = [];

    for (const element of elements) {
        const authority = mayRegenerate(element, runs);
        const decision: ClearDecision = {
            id: element.id,
            authority,
            sentence:
                authority.kind === 'allowed'
                    ? `${element.id}: clearable — ${describeProvenance(authority.provenance)}`
                    : `${element.id}: ${authority.kind === 'refused' ? 'PROTECTED' : 'UNKNOWN AUTHORITY'} — ${authority.because}`,
        };
        if (authority.kind === 'allowed') clearable.push(decision);
        else if (authority.kind === 'refused') protectedSet.push(decision);
        else unknownAuthority.push(decision);
    }

    const refuse = protectedSet.length > 0 || unknownAuthority.length > 0;
    const sentence = refuse
        ? `${generator} proposed clearing ${elements.length} element(s): ` +
          `${clearable.length} clearable · ${protectedSet.length} AUTHORED (a human stated them) · ` +
          `${unknownAuthority.length} of unknown provenance. ` +
          'Clearing cannot proceed unreviewed — an authored element removed here is a user decision destroyed with no record, ' +
          'and an element of unknown provenance cannot be shown to be safe to remove.'
        : `${generator} proposed clearing ${elements.length} element(s): all ${clearable.length} are system-produced and may be replaced.`;

    return { clearable, protected: protectedSet, unknownAuthority, refuse, sentence };
}

// ─────────────────────────────────────────────────────────────────────────────
// ALREADY-GENERATED AWARENESS — the duplicate-on-rerun half
// ─────────────────────────────────────────────────────────────────────────────

/**
 * R8's second named defect: "Generation engines gain already-generated awareness (the
 * duplicate-on-rerun defects)."
 *
 * Measured 2026-08-12: `HouseLayoutExecutor` mints fresh levels with
 * `L-house-${Date.now()}-${i}-${Math.random()…}` ids on every run and clears only ROOMS —
 * walls, doors, windows, slabs, stairs, roofs, furniture and lighting from a previous run
 * are never removed, so a second run stacks a whole building on the first. Nothing tags
 * generator output, so nothing can query it.
 *
 * This is the query, in the form the substrate permits: given what a generator states it
 * produced before, which of those elements are STILL PRESENT? A non-empty answer means a
 * re-run will duplicate rather than replace.
 *
 * ⚠ `undetermined` is the answer when the caller has NO prior run to declare — and it is
 * NOT the same as "nothing was generated before". A generator with no memory cannot tell an
 * empty model from an un-instrumented one, and reporting `[]` for both is the exact defect
 * this loop exists to forbid.
 */
export type PriorGenerationQuery =
    | {
          readonly kind: 'determined';
          /** Previously-produced ids still present in the model — a re-run duplicates these. */
          readonly stillPresent: readonly string[];
          /** Previously-produced ids no longer present. */
          readonly gone: readonly string[];
      }
    | {
          readonly kind: 'undetermined';
          readonly reason: ProvenanceUnknownReason;
          readonly detail: string;
      };

/**
 * Which of a declared prior run's elements survive in the current model?
 *
 * @param runs what the caller states it produced previously (EMPTY ⇒ `undetermined`)
 * @param present ids currently in the model
 */
export function queryPriorGeneration(
    runs: readonly DeclaredGenerationRun[],
    present: ReadonlySet<string>,
): PriorGenerationQuery {
    if (runs.length === 0) {
        return {
            kind: 'undetermined',
            reason: 'producer-not-instrumented',
            detail:
                'no prior generation run was declared, and no element in this repository carries a ' +
                'persisted generation marker (generationId / generatedBy: 0 hits, measured 2026-08-12). ' +
                'Whether this model already contains generated output cannot be determined — which is NOT ' +
                'the same as determining that it does not.',
        };
    }

    const stillPresent: string[] = [];
    const gone: string[] = [];
    for (const run of runs) {
        for (const id of run.produced) {
            if (present.has(id)) stillPresent.push(id);
            else gone.push(id);
        }
    }
    return { kind: 'determined', stillPresent, gone };
}
