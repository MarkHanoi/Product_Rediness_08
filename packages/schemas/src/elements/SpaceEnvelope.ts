// SpaceEnvelope — the L0 record for the space-envelope element family.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 · ADR-0380 · C84 · C11 · C03.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS, AND THE THREE THINGS IT IS NOT
// ═══════════════════════════════════════════════════════════════════════════════
//
// A space envelope is an AUTHORED spatial volume placed BEFORE any wall exists —
// the founder's *"basic and initial representation of spaces as living entities,
// aware of their surroundings"* (STR-ENVELOPE-AS-FIRST-CLASS-ELEMENT §3). It is a
// prism: a footprint ring on the level's XZ plane, lifted by `baseOffset` and
// extruded by `height`.
//
// ⛔ IT IS NOT `BuildableEnvelope` (`../site/zoning/BuildableEnvelope.ts`). That is
//    the SOLVED legal ceiling — a study with a mandatory `EnvelopeConfidence`, a
//    derivation trace and a refusal vocabulary, produced by the zoning engine and
//    never authored. ADR-0380 D2 declines to promote it to an element precisely so
//    that a user can never drag the thing the product calls the law. `role:
//    'maximumBuildable'` is DECLARED here and REFUSED at the create verb — see the
//    role field.
//
// ⛔ IT IS NOT `Room` (`./Room.ts`). ADR-0380 D1 rules it a separate kind for a
//    MEASURED reason, not a taxonomic one: C84 EI-7e records that
//    `RoomTopologyObserver` discharges suppressed commits on `resume()`, so *"after
//    any wall undo, room boundaries are recomputed from the post-undo wall set, not
//    restored"*. A wall-free volume in the room store would be recomputed away by
//    the room detector — and that recompute is the CORRECT behaviour of that
//    subsystem. The founder's *"maybe they ARE rooms"* is honoured as a promotion
//    VERB (`spaceEnvelope.promoteToRoom`, C114 §6), not as a shared record.
//    ⚠ `Room.multiLevelSpan` STAYS PINNED `null`. Nothing here un-pins it.
//
// ⛔ IT IS NOT A PARAMETER ENVELOPE (`../apartment/ApartmentParameters.ts`, where
//    "envelope" means a `[min, max]` numeric band). Same English word, unrelated
//    concept. The kind is spelled `spaceEnvelope`, never bare `envelope`, so a grep
//    for one never returns the other (C84 EI-8).
//
// ─── LAYERING ────────────────────────────────────────────────────────────────
// L0-pure (P5): Zod + plain TS only. Zero I/O, zero THREE, zero DOM, no OTel span
// (a span is I/O). Enforced by `tools/ga-gate/check-domain-purity.ts`.

import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { Vec3 } from '../base/primitives.js';

// ─────────────────────────────────────────────────────────────────────────────
// THE ROLE VOCABULARY — ADR-0380 D2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The three envelope types the founder's directive names (§2.5), as a CLOSED
 * union with a value roster so a new member is a compile error at every
 * exhaustive switch.
 *
 * ⭐ ONE KIND WITH A ROLE, NOT THREE KINDS. C83 §2.1 states the cost of the
 * alternative directly — *"A new element kind must not require 30 new
 * decisions"* — and C83 §2 is the standing instruction that rules key on ROLES
 * rather than kinds. A level envelope and a room envelope differ in nothing a
 * geometry pipeline can see; they differ in what they MEAN.
 */
export const SPACE_ENVELOPE_ROLES = ['level', 'room', 'maximumBuildable'] as const;

export const SpaceEnvelopeRoleSchema = z.enum(SPACE_ENVELOPE_ROLES);
export type SpaceEnvelopeRole = z.infer<typeof SpaceEnvelopeRoleSchema>;

/**
 * The roles a user may actually author. ⛔ `maximumBuildable` is deliberately
 * absent, and `spaceEnvelope.create` refuses it by name.
 *
 * **Why the member is declared at all** (ADR-0380 D2): a persisted `role` value
 * is a file-format value (C47) and a verb payload is a wire identifier that is
 * replayed out of `project_command_log` (C69 §1.1). Adding a member to a closed
 * union LATER is a migration; declaring it NOW, with a refusal that names its
 * reason, costs one string. A refusal that names its reason is a correct answer
 * (C16 `CA-DOCTRINE-A`), and C84 EI-3 polices the UI CONTROL that offers a
 * gesture — so no surface offers this one.
 */
export const AUTHORABLE_SPACE_ENVELOPE_ROLES = ['level', 'room'] as const;
export type AuthorableSpaceEnvelopeRole = (typeof AUTHORABLE_SPACE_ENVELOPE_ROLES)[number];

/** True iff a user (or the RAC) may mint an envelope in this role. */
export function isAuthorableSpaceEnvelopeRole(
    role: SpaceEnvelopeRole,
): role is AuthorableSpaceEnvelopeRole {
    return role === 'level' || role === 'room';
}

/**
 * The refusal a create verb MUST use when handed `role: 'maximumBuildable'`.
 * Declared beside the union so the sentence and the rule cannot drift, and
 * exported so the handler NEVER re-types it (C84 EI-8a: a licensed copy is
 * pinned by a test, never by a comment — the cheapest way to have no copy is to
 * have no second string).
 */
export const MAXIMUM_BUILDABLE_IS_NOT_AUTHORED =
    'The maximum buildable volume is SOLVED from the zoning rules, not drawn. '
    + 'PRYZM will not let a study be authored by hand, because a hand-drawn volume '
    + 'that calls itself the legal ceiling cannot be told apart from one the law '
    + 'produced. Draw a LEVEL envelope instead — it records what you intend to '
    + 'build, and PRYZM reports it against the permitted study rather than as it.';

// ─────────────────────────────────────────────────────────────────────────────
// THE HONESTY DECLARATION — the directive's §7, extended not rivalled
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⭐ THE ONE STANDING LITERAL. An authored space envelope is **design intent**
 * and never a permission, and the type system says so: this is a one-member
 * literal, so no code path can widen it to `'permitted'` or `'approved'` without
 * a schema edit that a reviewer will see.
 *
 * ⛔ IT IS NOT A MEMBER OF `EnvelopeStatusSchema` OR `EnvelopeConfidenceSchema`
 * (`../site/zoning/`). This follows the ratified precedent exactly:
 * `CONTEXT_DERIVED_STUDY_STATUS` became its OWN standalone literal rather than a
 * seventh confidence tier, and its header says why — the zoning enums are
 * *"CI-gated, contract-bound closed enums with consumers that key decisions off
 * them directly"*. A new honesty class gets a new channel; it is never smuggled
 * into an old one (ADR-0380 D5).
 */
export const SPACE_ENVELOPE_STANDING = 'design-intent' as const;
export type SpaceEnvelopeStanding = typeof SPACE_ENVELOPE_STANDING;

/**
 * What the envelope was drawn AGAINST — a citation, never a copy.
 *
 * ⛔ THE STUDY'S `EnvelopeConfidence` IS DELIBERATELY NOT STORED HERE, AND THE
 * OMISSION IS THE POINT. `capEnvelopeConfidenceToPackDefault` is a MINIMUM, so a
 * pack can demote a confidence but never certify itself; a tier copied onto this
 * record at authoring time could therefore only ever drift in the GENEROUS
 * direction — the envelope would keep claiming a confidence the live
 * determination had since downgraded. C69 §3.2 states the general rule (*"cites,
 * and never copies, data another artefact owns"*). The reader resolves the
 * current confidence from the live `BuildableEnvelope`; if there is no live
 * determination, the honest answer is that there is none, which is exactly what
 * a null basis says.
 */
export const SpaceEnvelopeBasisSchema = z.object({
    /** The zone code the study resolved from, echoed for display only. */
    zoneCode: z.string().min(1).nullable().default(null),
    /** ISO instant at which the author drew this against that study. */
    citedAtIso: z.string().min(1).nullable().default(null),
});
export type SpaceEnvelopeBasis = z.infer<typeof SpaceEnvelopeBasisSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// THE THIRD IDENTITY AXIS — ADR-0383 D1 (massing groups / master planning)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⭐ **WHICH BUILDING THIS ENVELOPE BELONGS TO.** ADR-0383 D1.
 *
 * Before this, `SpaceEnvelope` carried exactly two identity axes — `levelId`
 * (which storey) and `role` (what it means) — so every *"is there already one
 * here?"* question in the product was **`levelId`-only**. That is correct for one
 * building and fatally wrong for a master plan: `resolveLevelEnvelopeSupersession`
 * treats every envelope on a storey as a RIVAL (§L-13038, on the founder's own
 * instruction), so drawing Block B on Ground either deleted Block A or refused.
 * Master planning was not a missing feature bolted onto a working one — it was a
 * feature the current, deliberately-correct rule forbade.
 *
 * ⛔ A NEW ELEMENT KIND WAS REJECTED (ADR-0383 D1). C83 §2.1 states the cost
 * directly — *"a new element kind must not require 30 new decisions"* — and a
 * massing group has **no geometry of its own**. Its "volume" would be a function
 * of its members, i.e. a cache, i.e. C84 EI-9, i.e. two answers to *"where is
 * Block A"*.
 *
 * ⛔ A SECOND STORE WAS REJECTED, and that is the load-bearing constraint rather
 * than a preference. `PluginRegistration` binds ONE plugin to ONE `storeKey` with
 * one `buildStore`, so a second store means a second plugin registration for one
 * element family — C84 §1's *"five rival representations per family"* created
 * deliberately. Keeping the group on the MEMBER keeps *"3 profiles × 5 storeys =
 * 15 envelopes"* a single `produceCommand` → a single Immer patch pair → a single
 * Ctrl+Z, which is the entire reason C114 §6a exists.
 *
 * ⚠ **THE COST IS NAMED, NOT HIDDEN: `label` is DENORMALISED across the group's
 * members.** N copies of one string can drift. Three things close it, and none of
 * them is discipline:
 *   1. **`spaceEnvelope.group.rename` is the ONLY writer**, and it rewrites every
 *      member inside one `produceCommand` — a rename is atomic and is one undo.
 *   2. **A test asserts every `group.id` in a store resolves to exactly one
 *      distinct `label`** (`spaceEnvelopeGroups.test.ts`).
 *   3. ⭐ **The READER refuses to paper over a disagreement.** `readMassingGroups`
 *      (`@pryzm/plugin-space-envelope`) takes the label from the lowest-seated
 *      member and, when members disagree, REPORTS the disagreement rather than
 *      silently picking one (§CONTEXT-DATA-HONESTY, L-581/L-616). A drift becomes
 *      visible, not invisible.
 *
 * ⛔ THE ID IS OPAQUE AND MINTED BY THE CALLER (C16 CA-2). `execute()` runs again
 * on REDO, so a group id minted inside a handler would differ the second time and
 * orphan every member that named the first. It is deliberately NOT a
 * `defineElement` branded id: a group is not an element, and giving it an element
 * id would invite exactly the second store this decision declines.
 */
export const SpaceEnvelopeGroupSchema = z.object({
    /** Stable, caller-minted, opaque. Equality on this is what "same building" means. */
    id: z.string().min(1),
    /** The user-facing building name. ⚠ Denormalised — see the schema doc above. */
    label: z.string().min(1),
});
export type SpaceEnvelopeGroup = z.infer<typeof SpaceEnvelopeGroupSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// THE ELEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const SpaceEnvelope = defineElement('spaceEnvelope', {
    /**
     * PV-04 / C75 §2.4 — where this element's values came from. Spelled out at
     * the point of use rather than spread from a shared constant, because
     * `check-provenance-coverage` measures the file that declares
     * `defineElement('<kind>')` and an indirection hides the field from its C3
     * retrofit-safety arm.
     */
    provenance: RetrofittedProvenanceSchema,
    /** PV-06 / C75 §1.3 — how much these values can be TRUSTED. A separate axis. */
    confidence: RetrofittedConfidenceSchema,

    /**
     * The storey this envelope is seated on. Its `baseOffset` and `height` are
     * measured from that level's datum, never from the terrain.
     *
     * ⚠ L-584 IS NOT RE-IMPORTED HERE, AND THE OMISSION IS DELIBERATE. The
     * ordinance measures the rasante AT THE FAÇADE; PRYZM samples ONE terrain
     * point at the centroid. A space envelope therefore records **no terrain
     * relationship at all** — it is level-relative and says so. Whatever answers
     * "what does this mean against the ground" must state which datum it used
     * (ADR-0377, `HEIGHT_DATUM_CAVEAT`), and that answer does not belong in a
     * field that would make a single sampled point look like a measured one.
     */
    levelId: z.string().default(''),

    /** User-facing name. Never generated from the role alone. */
    name: z.string().default('Space envelope'),

    /**
     * WHAT THIS ENVELOPE IS FOR. See {@link SpaceEnvelopeRoleSchema}.
     * Default `'room'` so `SpaceEnvelope.parse({})` yields the smaller, safer
     * thing rather than a level-wide one.
     */
    role: SpaceEnvelopeRoleSchema.default('room'),

    // ── GEOMETRY — a prism, and only a prism ────────────────────────────────

    /**
     * The footprint ring on the level's XZ plane, in metres, OPEN (the closing
     * vertex is implied) and counter-clockwise by convention.
     *
     * ⚠ `y` IS REQUIRED TO BE EXACTLY 0 AND IS CHECKED (see the refine below).
     * `Vec3` is used because that is what the two nearest element neighbours use
     * — `Room.boundary` and `BoundaryLine.vertices` — and minting a fourth
     * ground-plane point vocabulary would be C84 EI-8. But an ignored component
     * is a silent-narrowing landmine (EI-2.d), so the invariant is ENFORCED
     * rather than documented: the vertical extent lives in `baseOffset` and
     * `height`, and there is no second place for it to hide.
     */
    footprint: z
        .array(Vec3)
        .min(3)
        .default([
            { x: 0, y: 0, z: 0 },
            { x: 4, y: 0, z: 0 },
            { x: 4, y: 0, z: 4 },
            { x: 0, y: 0, z: 4 },
        ]),

    /** Metres above the owning level's datum at which the prism starts. */
    baseOffset: z.number().default(0),

    /**
     * Metres of vertical extent. STRICTLY POSITIVE — a zero-height envelope is
     * a footprint pretending to be a volume, and every consumer that divides by
     * it would produce a confidently wrong number.
     */
    height: z.number().positive().default(3),

    // ── MEMBERSHIP — ADR-0380 D3 ────────────────────────────────────────────

    /**
     * The envelope this one is declared to sit WITHIN — a room envelope naming
     * its level envelope. AUTHORED, never inferred.
     *
     * ⭐ THIS IS THE ONLY STORED RELATION, AND THAT IS THE RULING. "Around"
     * (adjacency) and "on top of" (stacking) are FUNCTIONS of the two prisms and
     * are computed on demand — storing them would be a cache, and a cache is a
     * second answer to a question the geometry already answers (C84 EI-9). The
     * living-graph projection maps this field to the EXISTING `bounds` edge and
     * computed adjacency to the EXISTING `adjacentTo`; `UBG_EDGE_TYPES` gains no
     * member (ADR-0380 D3, C71 §2.5/§2.6).
     *
     * ⛔ CONTAINMENT IS NOT ENFORCED BY THIS FIELD. A room envelope may be
     * declared within a level envelope and stick out of it — that is an
     * ADVISORY finding (C83 INADVISABLE), not a refusal, because it usually
     * means the level envelope needs to grow. See C114 §12.
     */
    withinId: z.string().nullable().default(null),

    /**
     * ⭐ WHICH BUILDING (massing group) this envelope belongs to — ADR-0383 D1.
     * See {@link SpaceEnvelopeGroupSchema} for the whole ruling and its named cost.
     *
     * **`null` ⇒ UNGROUPED, which is every envelope that exists today.** ⛔ That is
     * the WHOLE migration: no data migration, no backfill, no file-format break — a
     * record written before ADR-0383 parses with `group: null` and behaves exactly as
     * it did, because ungrouped is its own supersession bucket (ADR-0383 D3). The
     * existing single-building flow is a master plan with exactly one unnamed group.
     *
     * ⛔ AN EMPTY GROUP IS NOT REPRESENTABLE, AND THAT IS CORRECT, NOT A LIMITATION
     * (ADR-0383 D2). A group exists because its envelopes carry its id; delete every
     * member and the group is gone. A group with no envelopes is a profile you have
     * not built, and the transient authoring roster
     * (`apps/editor/src/ui/site/drawnEnvelopeFootprintState.ts`) is what holds those.
     *
     * ⛔ IT IS NOT `withinId`, AND THE TWO MUST NEVER BE CONFLATED. `withinId` is
     * CONTAINMENT (a room inside a level envelope) and is refined to `null` for
     * `role: 'level'`; `group` is IDENTITY (which building), and a level envelope is
     * exactly the record that carries it. A rule that read one for the other would
     * make "Block A" mean "inside Block A's ground floor".
     */
    group: SpaceEnvelopeGroupSchema.nullable().default(null),

    /**
     * Optional programme tag — the same spellings `RoomOccupancyType` uses, held
     * as a free string here because L0 may not import L2 (`@pryzm/room-topology`
     * is where the 55-member union lives). The guard that keeps the two equal is
     * `SPACE_ENVELOPE_OCCUPANCY_MATCHES_ROOM` in `@pryzm/geometry-space-envelope`,
     * pinned by a test against the room-topology source — the
     * `BoundaryLine.drawMode` pattern, for the same reason (C84 EI-8a: a licensed
     * copy is pinned by a test, never by a comment).
     */
    occupancy: z.string().optional(),

    // ── HONESTY — the directive's §7 ────────────────────────────────────────

    /**
     * ⭐ ALWAYS `'design-intent'`. See {@link SPACE_ENVELOPE_STANDING}. Present
     * as a field, rather than left implicit in the element kind, so that every
     * serialised record, every export and every panel row carries the statement
     * with it — C75's whole thesis is that provenance which stops at a boundary
     * protects nothing past it.
     */
    standing: z.literal(SPACE_ENVELOPE_STANDING).default(SPACE_ENVELOPE_STANDING),

    /** What this was drawn against. A CITATION, never a copy — see the schema. */
    basis: SpaceEnvelopeBasisSchema.nullable().default(null),

    // ── DERIVED CACHE ───────────────────────────────────────────────────────

    /**
     * Footprint area in m², cached in lockstep with `footprint`.
     *
     * ⚠ THIS IS NOT A GROSS FLOOR AREA AND MUST NEVER BE SUMMED INTO ONE.
     * ADR-0380 D5: `measureAuthoredDesign` is the ONE authority for *"how much
     * has been BUILT"* and it refuses (`overlapping-floor-plates`,
     * `unattributed-floor-plate`, `no-floor-plates`) rather than guessing.
     * This number answers a DIFFERENT question — *"how much is INTENDED"* — and
     * blending the two would make the panel's built-area headline change when
     * nothing was built.
     */
    footprintAreaM2: z.number().nonnegative().default(0),

    /** `footprintAreaM2 × height`, cached in lockstep. Same rider as above. */
    volumeM3: z.number().nonnegative().default(0),

    /** Optional display tint. The renderer supplies the default. */
    materialColor: z.string().optional(),
})
    .refine(
        (e) => e.footprint.every((p) => p.y === 0),
        {
            message:
                'SpaceEnvelope.footprint vertices must have y === 0 — the ring lies on the '
                + "level's XZ plane and the vertical extent is baseOffset + height. A non-zero "
                + 'y would be information carried in a field no consumer reads (C84 EI-2).',
        },
    )
    .refine(
        (e) => e.withinId === null || e.withinId !== e.id,
        { message: 'SpaceEnvelope.withinId must not name the envelope itself.' },
    )
    .refine(
        (e) => !(e.role === 'level' && e.withinId !== null),
        {
            message:
                'A LEVEL envelope has no containing envelope — withinId must be null. Its '
                + 'relationship to the permitted study is `basis`, which is a citation, not '
                + 'containment (ADR-0380 D2).',
        },
    );

export type SpaceEnvelope = z.infer<typeof SpaceEnvelope>;
