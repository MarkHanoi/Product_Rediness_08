// §WALL-PROVENANCE (L-13117) — WHICH ELEMENT THIS ELEMENT CAME OUT OF.
//
// C75 · C80 §0.1(4) · C84 EI-6 · C47 §1.2. L0-pure: Zod only, no I/O, no THREE, no DOM.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY A NEW RECORD AND NOT ONE OF THE THREE THAT ALREADY EXIST
// ══════════════════════════════════════════════════════════════════════════════════════════════
// C75 §1.2 forbids restating or aliasing the five-value ORIGIN vocabulary per package, and this
// file does not: it carries no origin at all. The three neighbours were each measured and each
// answers a different question:
//
//   · `ValueProvenance` (`ValueOrigin.ts`) — *what KIND of thing produced this value*
//     (authored / observed / computed / inferred / regenerated, or UNKNOWN-with-reason).
//     ⛔ **It carries NO ELEMENT ID.** That is the exact measured gap L-13117 names: an element
//     can say "a machine computed me" and cannot say "…out of envelope E-ground, edge 3".
//   · `ProvenanceEdge` (`ProvenanceEdge.ts`, C23 §2.2) — one edge of the **AI-artefact lineage
//     DAG**. Its `fromArtefactId` is required and regex-pinned to `aia_<uuid>`, so an edge
//     rooted at an ordinary model element is UNREPRESENTABLE in it. A deterministic
//     `buildFromDesign` pass is not an AI call and must not be recorded as one.
//   · `ElementConfidence` — a different axis again (how much to TRUST the value), which C75 §1.2
//     is explicit must not be merged with either of the above.
//
// So the three compose rather than overlap: `provenance` says a machine made it, `derivedFrom`
// says out of WHAT, and `confidence` says how much to trust it.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ ABSENT MEANS **NOT RECORDED**, AND NEVER "DERIVED FROM NOTHING"
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §CONTEXT-DATA-HONESTY: failure and empty are different values. A wall saved before this field
// existed has NO `derivedFrom`, and that is *"PRYZM does not know where this wall came from"* —
// which is NOT the same claim as an EMPTY array, which is *"PRYZM looked, and this wall belongs
// to no envelope"*. Both are representable here and they mean different things:
//
//     derivedFrom === undefined   ⇒ UNKNOWN — not recorded. Legacy, or a producer that is not
//                                   instrumented. A consumer must not conclude anything.
//     derivedFrom === []          ⇒ KNOWN-EMPTY — a producer that DOES stamp this field looked
//                                   and found no source element.
//     derivedFrom === [row, …]    ⇒ KNOWN — these are the claims.
//
// ⛔ **Never `.default([])`.** A default would collapse the first two into the second on the very
// first parse of every legacy record, and would do it invisibly — the shape of the `||
// 'auto-topology'` defect C75 §0 Finding 2 records, and of L-616's "UNKNOWN constraint drawn as
// zero". It is `.optional()` with NO default, deliberately, exactly like `Wall.joinIntent`
// (C47 §1.2 additive-optional: a record written before this field existed parses unchanged and
// re-serialises byte-identically).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ AN ARRAY, NOT A SINGLE ROW — AND THAT IS LOAD-BEARING FOR C80
// ══════════════════════════════════════════════════════════════════════════════════════════════
// One wall can legitimately bound TWO sources: the shell edge of a level envelope AND the shared
// partition edge between two rooms. `designEnvelopeWallLink.ts` already records exactly that as
// `derivedFrom` + `alsoBounds[]`, and the C80 rule that two envelopes placing one wall
// differently is CONTESTED (dropped and surfaced, never last-write-wins) is only STATABLE if the
// rival claims can both be present. A single-row field would have to silently pick one, which is
// the defect wearing the shape of a schema.

import { z } from 'zod';

/**
 * Which claim this row is: the source the wall was PRIMARILY generated from, or a further
 * source whose boundary the same wall also happens to be.
 *
 * ⚠ The distinction is not decoration. A cascade may move a wall on its PRIMARY claim; an
 * `also` claim is evidence for a CONTEST, and a wall carrying two `primary` rows from
 * different sources is exactly the case C80 requires to be dropped rather than resolved.
 */
export const DerivationClaimSchema = z.enum(['primary', 'also']);
export type DerivationClaim = z.infer<typeof DerivationClaimSchema>;

/**
 * ⛔ `-1` MEANS "THE EDGE COULD NOT BE RECOVERED", AND IT IS NEVER INDEX 0.
 *
 * `designEnvelopeWallLink.ts` already uses this sentinel and states the reason: after a ring is
 * reconciled ("welded") with the wall domain, the edge a wall came from may no longer be
 * identifiable. Defaulting an unrecoverable edge to `0` would attach a real wall to the wrong
 * face and move the wrong wall on the first cascade, with nothing in the model to say why.
 */
export const EDGE_INDEX_UNRECOVERABLE = -1;

/**
 * ONE claim: *this element is edge `edgeIndex` of `sourceElementId`.*
 *
 * `.strict()` is deliberate. This record is PERSISTED and round-trips through two serialisers
 * and two loaders; a key nobody declared is a key nobody restores, and silently accepting it
 * here would let a producer believe it had recorded something the loader will drop.
 */
export const ElementDerivationSchema = z
    .object({
        /**
         * The id of the element this element was derived FROM — a space-envelope id today.
         * Never empty: a claim that names no source is not a claim.
         */
        sourceElementId: z.string().min(1),
        /**
         * What FAMILY the source belongs to, so a reader can tell which store to resolve it in
         * without parsing the id prefix. Free text rather than an enum on purpose: the set of
         * things a wall can be derived from is open (space envelope today; a room boundary, a
         * parcel edge, an imported IFC storey tomorrow), and C67/C68 pin *persisted wire
         * identifiers* — an enum here would make every new source kind a contract amendment.
         */
        sourceKind: z.string().min(1),
        /**
         * Index into the source's stored OPEN footprint ring, where edge *i* runs
         * `footprint[i] → footprint[(i + 1) % n]` — the same walk `planBuildFromDesign` and
         * `CreateWallBatchHandler` use. {@link EDGE_INDEX_UNRECOVERABLE} when the edge could not
         * be recovered.
         */
        edgeIndex: z.number().int().min(EDGE_INDEX_UNRECOVERABLE),
        /**
         * WHICH producer stamped this. Free text, because the generators are not enumerated
         * anywhere in this repository — `ElementProvenanceIndex.DeclaredGenerationRun.generator`
         * makes the same choice for the same measured reason. A reader that cannot attribute a
         * row to a producer cannot tell a stale row from a current one.
         */
        generator: z.string().min(1),
        claim: DerivationClaimSchema,
        /**
         * The role this element plays in the source — `'shell'` / `'partition'` for a wall.
         * Optional: a producer that does not distinguish roles must not be made to invent one.
         */
        role: z.string().min(1).optional(),
        /**
         * True when the source's ring had to be reconciled with the wall domain before the edge
         * index was taken. ⚠ A welded row's geometry may never have sat exactly on the ring, so
         * a consumer testing "does this wall still span its edge?" must expect a miss here for
         * reasons that are NOT a user edit. `spaceEnvelopeWallFollowPlan.ts` already treats the
         * two identically and says so; this flag is what lets a report tell them apart.
         */
        ringWelded: z.boolean().optional(),
    })
    .strict();

export type ElementDerivation = z.infer<typeof ElementDerivationSchema>;

/**
 * The field as it is added to an element schema being retrofitted: **optional, with NO
 * default**, for the reason spelled out in this file's header. Spelled out literally at each
 * `defineElement` site rather than spread from a shared constant — the same instruction
 * `RetrofittedProvenanceSchema` carries, for the same measured reason (a spread is invisible to
 * the coverage gates that read the declaring file).
 */
export const ElementDerivedFromSchema = z.array(ElementDerivationSchema).optional();
