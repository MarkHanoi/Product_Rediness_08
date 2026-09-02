import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { Vec3 } from '../base/primitives.js';

/**
 * Component — a PLACED OCCURRENCE of a component definition. §COMPONENT-PLACE
 * (audit §12 Phase 4C) · **ADR-0376 D9** · C110 · C111 · C112 · C84 §6.2.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ THIS RECORD IS **THE JOIN**. It is the whole reason the family exists.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `audit/universal-component-editor/2026-09-01/ARCHITECTURE-AND-CONTRACT-AUDIT.md`
 * §3.1 states the programme's headline gap in one sentence: **no bus verb anywhere
 * in this repository places a component into a project.** `packages/file-format`
 * can author, pack, sign, migrate and unpack a `.pryzm-family` document;
 * `packages/family-runtime` can resolve its parameters and evaluate its
 * expressions; and NOTHING could put the result in a model. A definition with no
 * occurrence is a file format, not a BIM feature.
 *
 * ─── WHY THIS IS AN ELEMENT AND NOT A "COMPONENT INSTANCE" CONCEPT ──────────
 * ADR-0376 **D9**, ruled 2026-09-01, and it is worth restating because the
 * alternative is the more tempting one:
 *
 *   > A *placed* component is, by every property that matters, an element
 *   > occurrence: it needs a stable id, a level, a host, selection, persistence,
 *   > undo, a snapshot row and a graph identity. … a parallel "component
 *   > instance" concept living outside the element model would create a **second
 *   > citizenship class in the World Model** — two answers to "what is in this
 *   > project", which is C84 EI-9 at the largest possible scale.
 *
 * So there is no `ComponentInstance`. There is an ELEMENT, in the same registry,
 * with the same id discipline, the same store contract and the same snapshot
 * obligations as a wall.
 *
 * ─── ⭐ THE ONE AUTHORITY (C84 EI-1) ────────────────────────────────────────
 * The **`component` plugin DTO store** (`plugins/component/src/store.ts`) is the
 * authoritative store for this family. There is deliberately **NO legacy geometry
 * twin** — the family is new, so there is no second representation to reconcile,
 * and none may be minted later without earning it under EI-10. C84 §6.2e names
 * this obligation for this family by name: *"Section 2 (Stores) inherits EI-1's
 * one-authority rule against a family that starts with two representations — a
 * document model and an element record"*. It does not.
 *
 * ⚠ THE DEFINITION IS NOT COPIED IN HERE. `definitionId` REFERENCES a
 * `.pryzm-family` document (`FamilyManifestSchema.id`, C111); this record carries
 * the OCCURRENCE — where it is, which named type it wears, and which parameters
 * this one occurrence overrides. Copying the definition's parameters, profiles or
 * solids into the element record would make the placed copy diverge from the
 * definition the moment the definition is edited, which is precisely the
 * "instance has collapsed into the type" failure the spec's §66 twenty-instance
 * falsifier (F-2) exists to catch.
 *
 * ─── ⭐ D3: METRES, AND ONLY METRES ─────────────────────────────────────────
 * ADR-0376 **D3** — metres is canonical at every model boundary. `origin` is
 * metres. `instanceParameters` holds values ALREADY CONVERTED to canonical units
 * by `@pryzm/family-runtime`'s typed unit system; a user's `1200mm` is a
 * parse-time literal whose authored spelling is provenance, never the stored
 * value. ⛔ A millimetre in this record is a 1000× defect, which is the entire
 * reason D3 was ruled before Phase 4A.
 *
 * ─── ⭐ D5: `Component`, NEVER `Family` ─────────────────────────────────────
 * ADR-0376 **D5** — `Component` is the one canonical vocabulary and **no NEW
 * symbol may use `Family`**. The `fam_` / `typ_` / `par_` id PREFIXES below are
 * the FROZEN legacy wire spellings of `packages/file-format` (D5 freezes wire and
 * identity names under C69 §1.1); they are quoted, not adopted. Nothing minted in
 * this file is called `Family*`.
 *
 * ─── ⛔ WHAT THIS FAMILY DOES **NOT** DO — C84 §6.2c, inherited from C107 §0.2-a
 * *"A family named for a behaviour it does not have is the naming-vs-behaviour
 * defect this repository logs repeatedly."* Stated here, in the schema, so a
 * reader cannot infer a capability from an authored field:
 *
 *   1. **`hostId` IS INERT.** It records WHAT the placement gesture snapped to. It
 *      resolves no host surface, cuts no opening, re-seats nothing when the host
 *      moves, and is read by no consumer at this commit. **D11 (does a new host
 *      surface amend C15 or get a sibling mechanism?) is OPEN and is ruled in
 *      Phase 6C**, and C15 §0.1.1's own closing rule says *sibling*. Writing a
 *      host resolver here would pre-empt a ruling that has not been taken.
 *   2. **Nothing here renders.** The 3-D leg is Phase 4E's, under ADR-0376 **D10**,
 *      whose descope is PRE-AUTHORISED. A placed component is a record in the
 *      model — schedulable, selectable by id, persisted, undoable — and whether it
 *      is VISIBLE is a separate axis this schema makes no claim about.
 *   3. **No nesting.** D6 is OPEN (spec §25, Phase 8D). `childrenIds` exists
 *      because `BaseNodeShape` gives it to every element; this family writes
 *      nothing into it, and a reader must not infer sub-component ownership from
 *      an empty array that every element carries.
 *   4. **No connectors.** C112's `Connector[]` lives on the DEFINITION and stores
 *      no pose by ruling (C112 §2.3 — the host's frame is the authority). No
 *      connector is resolved, matched or joined at placement.
 */

/**
 * The definition this occurrence instantiates — the `id` of a `.pryzm-family`
 * manifest (`FamilyManifestSchema.id`, C111 §1.1-a: `fam_` + ULID).
 *
 * ⚠ SPELLED OUT AS A REGEX RATHER THAN IMPORTED. `packages/schemas` is **L0** and
 * P5 (`check-domain-purity.ts`) holds it at zero I/O, zero THREE, zero DOM; it may
 * not import `packages/file-format` (L3), which would also be an upward layer edge
 * under `check-layer-boundaries.ts`. The shape is therefore restated, and the
 * duplication is DECLARED here rather than hidden: if C111 ever re-prefixes a
 * definition id, this line and `family-schema.ts`'s `FamilyId` move together. That
 * is the same both-directions obligation the contract index carries, one level
 * down.
 */
const DefinitionRef = z
  .string()
  .regex(/^fam_[0-9A-HJKMNP-TV-Z]{26}$/, 'definitionId must be `fam_` + ULID (C111 §1.1-a)');

/** The named type within that definition (`FamilyTypeSchema.id`, `typ_` + ULID). */
const TypeRef = z
  .string()
  .regex(/^typ_[0-9A-HJKMNP-TV-Z]{26}$/, 'typeId must be `typ_` + ULID (C111 §1.1-a)');

/**
 * A parameter id key (`par_` + ULID). Used as the KEY of `instanceParameters`, so
 * the map cannot accumulate entries keyed by a display name — which is how a
 * rename silently orphans an override.
 */
const ParameterRef = z
  .string()
  .regex(/^par_[0-9A-HJKMNP-TV-Z]{26}$/, 'instanceParameters key must be `par_` + ULID');

/**
 * A resolved parameter value. The three canonical value shapes
 * `FamilyTypeSchema.values` carries, deliberately identical so an instance
 * override and a type value are the SAME kind of thing at two different rungs of
 * spec §12's ladder.
 *
 * ⛔ `null` is NOT a member. An override whose value is `null` is an override that
 * does not exist — deleting the key is how an override is removed, and admitting
 * `null` would make "cleared" and "set to nothing" the same value
 * ([[context-data-honesty-family]]).
 */
const ComponentParameterValue = z.union([z.number().finite(), z.string(), z.boolean()]);

export const Component = defineElement('component', {
  /**
   * PV-04 / C75 §2.4 — where this element's values came from. Spelled out here
   * rather than spread from a shared constant because `check-provenance-coverage`
   * measures the file that declares `defineElement('<kind>')`; an indirection
   * hides the field from the C3 retrofit-safety arm.
   */
  provenance: RetrofittedProvenanceSchema,
  /** PV-06 / C75 §1.3 — how much these values can be TRUSTED. A separate axis. */
  confidence: RetrofittedConfidenceSchema,

  /** Owning level. Every element in this model belongs to exactly one. */
  levelId: z.string().default(''),

  /**
   * ⭐ THE DEFINITION REFERENCE — the first half of the join.
   *
   * `.default('')` is deliberate and is what makes `Component.parse({})` succeed,
   * which `defineElement`'s own contract requires of every family. An EMPTY
   * definitionId is refused at the HANDLER boundary (`component.place`'s
   * `canExecute`), not here — a schema that cannot round-trip its own default is a
   * schema no snapshot can carry.
   */
  definitionId: z.union([DefinitionRef, z.literal('')]).default(''),

  /**
   * The definition's `semver` AT THE MOMENT OF PLACEMENT — provenance, never a
   * resolution input.
   *
   * ⚠ IT DOES NOT PIN. Nothing reads this to select a definition version, and
   * saying so is the point: spec §37 (*"never silently destroy historical
   * meaning"*) wants to know which definition an occurrence was placed against
   * decades later, and D12 (is `formatVersion` made comparable?) was ruled in
   * Phase 4B for the FORMAT, not for definition SELECTION. Recording the fact is
   * cheap and honest; claiming it pins would be neither.
   */
  definitionVersion: z.string().optional(),

  /**
   * ⭐ THE TYPE REFERENCE — the second half of the join, and the rung of spec §12's
   * ladder that `component.swapType` moves.
   *
   * A definition always has ≥ 1 type (`FamilyDocumentSchema.types` is `.min(1)`),
   * so a placed occurrence always wears one. Empty is the parse-time default for
   * the same reason `definitionId`'s is, and is refused by the handler.
   */
  typeId: z.union([TypeRef, z.literal('')]).default(''),

  /**
   * ⭐ THE INSTANCE OVERRIDES — the TOP rung of ADR-0376 **D4**'s precedence:
   * *instance > type > expression > definition default*.
   *
   * ⛔ ONLY OVERRIDES LIVE HERE — never the resolved values. A resolved value
   * stored is a derived value stored, and C84 §8.i is the rule it breaks: change
   * the type and the stored copy is stale, silently, on every occurrence that has
   * one. `resolveParameter()` in `@pryzm/family-runtime` is the ONE resolver, and
   * it takes `{parameters, type, instanceOverrides}` — this map is its third
   * argument and nothing more.
   *
   * ⭐ AND THAT IS EXACTLY WHAT MAKES SPEC §66's F-2 FALSIFIER TRUE BY
   * CONSTRUCTION: place twenty, override ONE, change the TYPE — the nineteen
   * follow because they hold no copy to go stale, and the twentieth does not
   * because its key is in here. Nothing had to be written to make that work; the
   * absence of a stored resolved value IS the mechanism.
   */
  instanceParameters: z.record(ParameterRef, ComponentParameterValue).default({}),

  /** Insertion point in WORLD coordinates, **metres** (ADR-0376 D3). */
  origin: Vec3.default({ x: 0, y: 0, z: 0 }),

  /** Rotation about +Y in radians — the `furniture` convention, adopted verbatim. */
  rotation: z.number().default(0),

  /**
   * What the placement gesture snapped to, if anything.
   *
   * ⛔ **INERT AT THIS COMMIT — see the header's refusal 1.** It is a plain
   * `z.string()` and NOT an `idRef`: `undefined` is a first-class state (a
   * free-standing component hosts on nothing), and `idRef` mints a DEFAULT id,
   * which would fabricate a host that does not exist. The balcony's `hostWallId`
   * carries the identical reasoning and the identical refusal to invent.
   */
  hostId: z.string().optional(),

  /** Optional material override for the whole occurrence. Unset = the type's. */
  materialId: z.string().optional(),
})
  /**
   * A component that names a type but no definition is unresolvable — the type id
   * is meaningless without the document that declares it. Refused as a PAIR rather
   * than by silently ignoring `typeId`, so "wearing type X of nothing" is
   * unrepresentable (C84 EI-2: a field the pipeline drops is a defect).
   *
   * ⚠ The mirror case is NOT refused: a definition with no type is the legal
   * parse-time default state of `Component.parse({})`, and the handler is where an
   * unnamed type is rejected.
   */
  .refine((c) => c.typeId === '' || c.definitionId !== '', {
    message: 'Component typeId names a type of definitionId, which is not set.',
  })
  /**
   * An instance override on a component with no definition cannot be resolved
   * against anything. Same argument as above, one rung down the ladder: an
   * orphaned override is not a smaller version of a working one, it is a value
   * that will never be read.
   */
  .refine((c) => Object.keys(c.instanceParameters).length === 0 || c.definitionId !== '', {
    message: 'Component instanceParameters override parameters of definitionId, which is not set.',
  });

export type Component = z.infer<typeof Component>;
