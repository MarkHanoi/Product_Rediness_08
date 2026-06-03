# ADR-0056 — Briefs are typology-declared, not UI-hard-coded

**Status**: Accepted (2026-06-03)
**Tracker**: O.12.a (master-execution-tracker §3.0.3)
**Spec source**: `docs/03-execution/specs/SPEC-TYPOLOGY-BRIEF-SCHEMA.md`
**Contract**: `docs/02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md` §2.6
**Supersedes**: the free-text "tell me about the project" onboarding brief.

---

## Context

The onboarding RAC's project brief was a single free-text box: the user
typed prose ("a 2-bed apartment, open-plan kitchen, modern style") and an
NLP parse inferred the structured generation inputs (`ApartmentProgram`).
This has two structural problems:

1. **The brief is hard-coded for one typology.** The prose-parse only knows
   apartment concepts. A house brief (floors, garage, garden), an office
   brief (headcount, meeting rooms, open-plan ratio), or any future typology
   would each need bespoke parse code in the UI. The brief did not scale with
   the typology-agnostic platform spine ([[platform-spine-typology-agnostic]]).

2. **Free text is lossy and hard to manipulate.** The founder directive
   (2026-06-03) was explicit: "The project brief needs to be sound — gather
   real relevant data for the process and present it to the user easily to
   manipulate — simple sliders to move from 2 → 4 apartment bedrooms. For
   other typologies more complex — house = number of floors, etc.
   Architecturally sound and well documented (contract / strategy / spec / ADR)."

The platform already declares per-typology metadata in `TypologyManifest`
(C50). The brief is the missing typed front door to each pack.

## Decision

**The project brief is declared by the typology, not hard-coded in the UI.**

Each `TypologyManifest` carries an optional `briefSchema: BriefSchema` — an
ordered list of typed, bounded fields (`range` / `stepper` / `select` /
`multiselect` / `toggle` / `text`). The onboarding RAC renders that schema
dynamically as compact, on-brand controls (sliders, ± steppers, chips,
switches, one free-text box). The captured values become the structured
`Brief` (`Record<fieldId, value>`) that drives Stage 4 generation directly —
no NLP parse needed for the structured fields. The free-text `text` field
survives only as a supplementary hint.

The schema is **L0-pure** (`packages/schemas/src/typology/briefSchema.ts`,
Zod-only, no I/O/THREE/DOM per **P5**) and is the **single source of truth**
shared by the RAC brief step AND the O.10 "Choose a layout" picker, so they
never drift.

### Why a plain `z.union` (not `discriminatedUnion`)

The field members are keyed by `kind`, which naturally suggests
`z.discriminatedUnion`. But Zod forbids `.refine()` on the members of a
discriminated union, and we need cross-field refinements: `min ≤ max`,
`default ∈ [min, max]` (range/stepper), `default ∈ options` (select),
every `default` entry ∈ options (multiselect). A plain `z.union` permits
member-level `.refine()`, so we use it. The discrimination still works at
parse time (each member's `kind: z.literal(...)` narrows).

### masterEnSuite casing deviation from SPEC §3

SPEC §3 lists the apartment master-en-suite field as `masterEnsuite`. The
**live** `ApartmentProgram` key (in
`apps/editor/src/ui/apartment-layout/layoutRequestPayload.ts`
`DEFAULT_PROGRAM`) is `masterEnSuite` — capital **S**. Because C50 §2.6.4
binds the brief field `id`s to the pack's live generator keys (so the brief
feeds `buildLayoutCommands` directly with no remapping shim), the apartment
manifest uses `masterEnSuite`. **The live key is authoritative; the SPEC is
corrected by this ADR.** Renaming the live key instead was rejected — it
would touch the generator, the picker, and the program-rules path for a
cosmetic casing change with no behavioural payoff.

## Consequences

- **Positive.** Each typology owns its brief; adding a typology (house,
  office, school) is a manifest change, not UI parse code. The user
  manipulates structured controls (sliders) instead of prose. The brief and
  the O.10 picker bind the same field set. The schema is contract-governed
  (C50 §2.6) and Zod-validated at the L0 boundary.
- **Negative / cost.** Every typology pack must now author a `briefSchema`
  to get a structured brief (packs that omit it fall back to free text — so
  this is opt-in, not a hard break). Field `id`s must be kept in lock-step
  with the pack's live generator keys; C50 §2.6.4 makes that binding
  explicit and the apartment casing deviation documented here is the first
  proof of the coupling.
- **Backward compatibility.** `briefSchema` is `optional` on
  `TypologyManifestSchema` — existing manifests (and the manifest test
  fixtures) parse unchanged.

## Implementation (O.12.a)

- `packages/schemas/src/typology/briefSchema.ts` — `BriefField` / `BriefSchema`
  L0 Zod schema (this ADR's subject).
- `packages/schemas/src/typology/manifest.ts` — `briefSchema:
  BriefSchemaSchema.optional()` added to `TypologyManifestSchema`.
- `packages/typology-pack-apartment/src/manifest.ts` — the apartment
  `briefSchema` (7 fields).
- `docs/02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md` §2.6 — normative.
- Tests: `packages/schemas/__tests__/briefSchema.test.ts`.

Phases O.12.b (RAC renders the schema) and O.12.c (pipeline + picker read the
structured brief) are tracked separately; this ADR governs O.12.a's L0
substrate + the typology-declared principle.
