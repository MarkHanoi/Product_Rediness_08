# C58 — Zoning Rules & Buildable Envelope

> **Stamp**: 2026-07-17 · **Amended**: 2026-07-21 · **Status**: DRAFT
> _DRAFT. ⚠ The "**0% built**" statement carried here from the 2026-07-17 Archistar gap audit (G-ENG-1..5) is **no longer true** and is corrected rather than deleted: `packages/site-parcel-data/` now ships the engine (`ZoningRulesEngine.ts`), the solvers (`geometry/{blockDerivedDepth,blockRing,insetPolygon,streetWidth,depthBandClip}.ts`), the rule-pack registry + refusal vocabulary (`rulepacks/{registry,zoneRefusal,esBarcelonaZoneClassification}.ts`) and one real jurisdiction pack (`rulepacks/esBarcelonaEnsanche.ts`), live on the Barcelona `13a` path. **The contract nevertheless stays DRAFT and no slot is claimed ACTIVE**: measured coverage is 24.0 % of Barcelona's private buildable land (L-538), the §6 gates are not all green, and §13/§14 below record where the code does not honour this contract. Status is a statement about conformance, and conformance is not established by documentation._
> **Scope**: governs the **zoning → buildable-envelope subsystem** — the `ZoningProvider` adapter interface, the canonical zoning-rule schema, the per-jurisdiction curated **`JurisdictionZoningContract`** rule-pack, the deterministic `ZoningRulesEngine` that solves `parcel + zoning-rules → BuildableEnvelope`, the two-fidelity (structured / estimated / none) honesty model, the "explain-why" derivation trace, and the envelope → authoring hand-off. This is the core compliance value-prop contract. Companion to [C57 Parcel Data Layer](./C57-PARCEL-DATA-LAYER.md) (which fetches the parcel) and consumer of [C19](./C19-SITE-MODEL-AND-PARCEL.md)'s mutable zoning fields.
> **Depends on**: [C03](./C03-SCHEMAS-COMMANDS-AND-STATE.md), [C19](./C19-SITE-MODEL-AND-PARCEL.md), [C57](./C57-PARCEL-DATA-LAYER.md), [C12](./C12-GEOSPATIAL.md), [C10](./C10-PERFORMANCE-AND-OBSERVABILITY.md), [C23](./C23-PROVENANCE-AND-AI-AUDIT.md).
> **Downstream**: [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md) (renders the envelope + derivation trace); [C50 Typology Pipeline](./C50-TYPOLOGY-PIPELINE.md) + [C53 Generative Layout Engine](./C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) (consume the envelope as generation bounds); [C19 §1.6](./C19-SITE-MODEL-AND-PARCEL.md) (footprint-in-parcel-minus-setbacks — the envelope makes the setback numbers real).
> **Key principles**: **P5** (rule + envelope schemas pure — no THREE / no I/O), **P6** (the envelope reaches the model only via the `site.updateZoning` command bus — no direct store writes), **P8** (every exported engine / provider fn opens an OTel span `pryzm.zoning.<verb>`), **P1** (providers wired once).
> **Strategy**: [ADR-0269](../adrs/ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) (compliance-authoring pillar; Denmark-first because it has the cleanest structured zoning; jurisdiction-agnostic engine + per-jurisdiction adapters).
> **Audit context**: ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md (audit removed 2026-08-09 — recoverable from git history) (G-ENG-1..5, G-BRG-1..3 — the single largest gap to the Archistar loop), [PARCEL-ZONING-FEATURE-SCOPING.md](../../04-reference/geospatial/PARCEL-ZONING-FEATURE-SCOPING.md) §4/§6.2/§6.3/§7, [DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md](../../04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md) §2.3. **This contract fills the slot C19 §9 explicitly defers ("jurisdiction-specific building-code databases — future contract") and C19 §10.2 leaves pending (the jurisdiction-registry shape).** On ratify, C19 §10.2 should reference C58.

---

## §1 — Invariants

Binding on every PR touching zoning ingestion, the rules engine, the envelope solver, or the envelope→generation bridge. Each has an §1.N id usable in `TODO(C58.N)` and `check-zoning-*.ts` failure messages.

### §1.1 — The envelope solver is deterministic; NO AI/ML/LLM

Given the same `(parcel ring + edge classifications + resolved rule set)`, the `ZoningRulesEngine` MUST produce a **byte-identical** `BuildableEnvelope`. The solver is pure geometry + arithmetic (Turf negative buffer for the setback inset; `area × maxHeight` for the volume). It MUST NOT call an AI model, an LLM, or any RNG.

- Determinism mechanics follow [ADR-0061](../adrs/ADR-0061-building-graph-bidirectional-edit-substrate.md): stable input ordering, no wall-clock, no `Math.random`.
- The **AI boundary**: an LLM MAY (elsewhere, C09) help *curate* a rule pack from a PDF ordinance offline, but the pack it produces is a reviewed static artefact (§1.6); the runtime envelope solve reads that artefact deterministically. No model call is on the envelope path.

**Why**: a compliance number a user relies on to decide what to build MUST be reproducible and defensible. "The AI said 18 m" is not a compliance claim; "zone 22a → maxHeight 18 m, from rule-pack `es-barcelona` field `maxHeight_m`, ordinance ref X" is. Reproducibility is the product.

### §1.2 — Two input fidelities, resolved in priority order, with a mandatory confidence label

Numeric building rules are structured only in Denmark; PDF-trapped elsewhere. The engine MUST resolve the rule set in this order and stamp the result's `confidence`:

1. **`structured`** — the `ZoningProvider` returns numeric fields directly (DK Plandata `bebyggelsesprocent` / `maksbygningshoejde` / `maksantaletager` / `anvendelse`; Madrid VEDA edificabilidad; Terrara). Use directly.
2. **`estimated-ruleset`** — the provider returns only a **zone class** → look up the per-jurisdiction curated **`JurisdictionZoningContract`** (§2.2: zone code → numeric envelope). Confidence `estimated-ruleset`.
3. **`none`** — no data → **no envelope**; graceful fallback to manual setback entry / draw (C57 §1.5). The envelope is hidden, never fabricated.

Every `BuildableEnvelope` MUST carry a `confidence` field. There is no unlabelled envelope. ⚠ The three tiers listed above are the *input-fidelity* ladder only; the **complete** enum is `{ 'authoritative', 'structured', 'block-constructed', 'estimated-ruleset', 'not-determined' }` — see the two amendments below for `'block-constructed'` (L-518/L-572) and `'not-determined'` (L-550), neither of which is an input fidelity.

> **AMENDED 2026-07-21 (L-550).** The enum above is no longer complete. `EnvelopeConfidence` also
> carries **`'not-determined'`**, paired with `EnvelopeStatus: 'not-applicable'`, for the case
> §1.13 introduces: the ordinance grants no private buildable envelope here. That is neither a
> fidelity level nor an absence of data — it is a *positive legal answer*, and it must not be
> forced onto a scale that only measures how good our numbers are. See §1.13.
>
> **CLOSED 2026-07-21 (L-518 + L-572) — the tier for a CONSTRUCTED determination now exists and is
> engine-assigned.** The gap this note recorded was real: Barcelona's Art. 242.2 depth is a real
> determination *constructed* from real cadastral geometry plus an accepted rule, its derivation
> rows carry `published` fieldProvenance, and yet the top-level `confidence` landed on
> `estimated-ruleset` — an ESTIMATED badge over data that is real and cited.
>
> **`EnvelopeConfidence` therefore carries a fourth member, `'block-constructed'`**, between
> `structured` and `estimated-ruleset`: *real inputs + accepted rule + constructed geometry, and
> NOT an official municipal certificate*. The complete enum is
> `{ 'authoritative', 'structured', 'block-constructed', 'estimated-ruleset', 'not-determined' }`.
>
> **THE ASSIGNMENT RULE IS NORMATIVE, because where it happens is what makes it true (L-572).**
> The tier MUST be stamped by `ZoningRulesEngine` itself, keyed on the presence of the
> `alignment.depthBinding` derivation row (§1.3) — which the engine emits if and only if
> `solveBlockDerivedDepth` returned a binding, so it cannot appear on a fallback. It was originally
> assigned in the **L5 editor** (`siteDispatch.ts`) by re-scanning the derivation, which made the
> honesty label a property of ONE UI PATH rather than of the determination: a per-parcel report, an
> export or an API calling `computeBuildableEnvelope` directly would receive `estimated-ruleset` on
> genuinely constructed data. **An honesty label that only one caller knows how to compute is not a
> property of the answer.** No surface may re-derive or override the tier.
>
> ⚠ **The upgrade MUST be ordered BEFORE the "Estimated envelope — verify against the governing
> ordinance" caveat is pushed.** While the upgrade lived downstream, a constructed envelope carried
> that caveat *and* a "Real · constructed" badge simultaneously. This is asserted by test, not by
> convention (`blockDerivedEnvelope.test.ts`, §L-572).
>
> ⚠ **HONEST LIMIT — the tier labels the RULE, not the INPUT.** The engine is pure and cannot
> verify that the `blockRing` it was handed is real cadastral geometry; it certifies *"constructed
> from the block ring supplied, under an accepted rule"*. Per §1.6 the ring's own provenance rides
> with the caller (production: `CatastroBlockProvider`, real Catastro). This is precisely why §5.1's
> wording condition exists: the badge reads **"Real · constructed"** and MUST NOT read "verified",
> "certified" or "authoritative" (`jurisdictions/es/es-ct/08019-barcelona/RISK-REGISTER.md` R1), and it retains
> its citations and the "2008 modification not reflected" caveat.

**Why**: the honest core (scoping §6.3). Denmark's numbers are real; a Barcelona envelope is a curated estimate. Conflating them would be the single most damaging credibility failure for a compliance product.

### §1.3 — Every envelope constraint cites its source rule ("explain-why")

Each numeric constraint in a `BuildableEnvelope` (each setback, the height cap, FAR, coverage, each permitted use) MUST carry a **derivation entry** naming: the value, the `zoneCode` it came from, the rule-pack / provider `source`, the per-field provenance flag (`published-structured | ordinance-pdf | estimated`), and the `ordinanceRef` (URL / citation) where one exists.

- The engine emits a `DerivationTrace` (§2.4) alongside the envelope — a machine-readable, per-constraint "why".
- [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md) renders this trace as the user-facing "explain-why" artefact — the specific thing the Archistar category sells.

**Why**: an envelope without its citation is an assertion, not a compliance result. The derivation trace is what makes the envelope *auditable* and *actionable* (the user can verify each number against the cited ordinance).

### §1.4 — An `estimated-ruleset` envelope is NEVER presented as authoritative (L-373 credibility)

Where `confidence === 'estimated-ruleset'`, every surface MUST mark it as estimated (distinct visual style + "verify against ordinance" affordance + the `ordinanceRef` link). It MUST NOT render in an authoritative / certificate-looking style. A **CI fidelity-label gate** enforces the label is present (mirroring the shipped `check-windcfd-beta-label.ts` pattern per C54).

**Why**: the L-373 data-credibility discipline. A curated estimate shown as a legal fact is worse than no number. The label is not decoration — it is a contract invariant with a CI gate.

### §1.5 — Jurisdiction-agnostic core + per-jurisdiction adapters; no jurisdiction hardcoded in the engine

The `ZoningRulesEngine` MUST contain **zero** jurisdiction-specific logic. It consumes a `ZoningRecord` (from a provider) + a `JurisdictionZoningContract` (a data pack) + the parcel; all jurisdiction knowledge lives in **adapters** (`ZoningProvider` implementations) and **data** (rule packs). Adding Denmark or Switzerland is a new adapter + a new rule pack — never an engine edit.

**Why**: the property that lets the engine be *built on Denmark's clean data and run on Spain by an adapter+pack swap* (ADR-0269). Hardcoding freezes the engine to whichever jurisdiction ships first — the exact anti-pattern C55/ADR-0065 rejected for geodata layers.

### §1.6 — Rule packs are curated, versioned, provenance-tagged

A `JurisdictionZoningContract` (§2.2) is a **curated, versioned** artefact. It MUST carry `jurisdictionId`, `source`, `crs`, a `lastReviewed` date, and **per-field provenance** (`published-structured | ordinance-pdf | estimated`) on every numeric field. A pack whose numbers were transcribed from a PDF ordinance MUST flag those fields `ordinance-pdf` (not `published-structured`), and any inferred value `estimated`.

- Rule packs mirror the existing normative-DB pattern (`rules/programRules.ts` — the architectural-program rules database).
- A pack has a `defaultConfidence` (`structured` | `estimated-ruleset`) that seeds §1.2 resolution.

**Why**: the honesty flag must be *per field*, because a single pack can mix a published height with a PDF-derived setback. Versioning + `lastReviewed` make curation freshness auditable (curation is the real long-tail cost — ADR-0269 buy-vs-build).

### §1.7 — The envelope maps onto C19's existing mutable fields via `site.updateZoning`; no new C19 output schema

> **AMENDED 2026-07-20 (ADR-0270 option A, founder decision; L-451).** The 1:1 mapping below
> holds ONLY for setback-governed zones. **The inset POLYGON is now the persisted truth**; the
> front/side/rear triple is a DERIVED, EXPLICITLY-LOSSY summary that is `null` — never
> fabricated — for any non-`setback` geometric rule. See §1.7a.

### §1.7a — The inset polygon is the persisted truth; setbacks are a lossy summary (ADR-0270, L-451)

**Why the original §1.7 could not hold.** An `alignment` rule (*alineación a vial* +
*profundidad edificable* + party walls — verified live in L-438; Madrid publishes `Fondo de la
Edificación` as a POLYLINE) has **no front/side/rear triple that encodes it**. Writing one would
be a lossy coercion that is *invisible*, because the stored numbers look perfectly well-formed.
That is a fact of the wrong SHAPE — a hole neither §1.4 (guess-as-fact) nor §1.11
(fact-about-the-wrong-thing) closed.

**The resolution, and why it is barely a change at all.** §2.4 ALREADY computes `insetPolygon`,
and §1.8 ALREADY threads *the polygon* — not the three numbers — into generation. **The polygon
was always the load-bearing artefact; §1.7 simply had not caught up.** So:

1. The **`BuildableEnvelope.insetPolygon` is the authoritative geometric output.** It MUST be
   persisted with the parcel's mutable zoning state so it survives close+reopen (cf. L-188,
   which established site state must round-trip).
2. `setbacks.{front,side,rear}` remain on C19 for DISPLAY and for `setback` zones, where they
   are true of the zone.
3. For **any non-`setback` rule those fields MUST be `null`.** An engine or adapter MUST NOT
   synthesise "equivalent effective setbacks" — explicitly rejected in ADR-0270 as lossy by
   construction and unrecoverable. `null` is the honest answer; a fabricated triple is
   undetectably wrong downstream. The L0 helper `displaySetbacks()` enforces this at the type
   level and is the ONLY sanctioned way to derive the triple from a rule.
4. The write path is UNCHANGED: still `site.updateZoning` (P6), still no UI writing zoning
   fields directly. This amendment changes WHAT is persisted, not HOW.
5. The parcel polygon itself remains immutable (C19 §1.4). This adds a *derived* ring alongside
   the mutable zoning fields; it never edits the parcel.

**Consumer rule.** Anything asking "what may I build here" MUST read the persisted inset
polygon. Reading the three numbers and re-insetting is only valid for `setback` zones and MUST
NOT be used as a general path — it silently reproduces the pre-ADR-0270 defect.

> ⚠ **AMENDED 2026-08-19 by [§1.16](#116--a-zero-setback-re-inset-is-the-parcel-not-an-envelope-and-must-be-refused-l-1171).**
> The re-inset implementation defended itself with the argument that *"requiring all three to be
> NUMBERS is equivalent to 'this is a setback zone'"*, since an alignment zone stores its ring and
> `null` setbacks. **That test is satisfiable by a DEFAULT: `0` is a number.** A zero-filled record
> passes it exactly as a derived triple does, and at `0/0/0` the inset is the IDENTITY — the
> "buildable ring" is the parcel boundary itself, published as a legal claim. §1.16 refuses that
> case. Do not restore the numbers-only guard.

### §1.7b — An envelope MAY have MORE THAN ONE TIER, and the single-prism fields are then a lossy summary of a KNOWN kind (ADR-0273, §L-590b)

**Added 2026-07-22.** §1.7a established that the polygon, not the setback triple, is the
load-bearing artefact. This extends the same argument one step: **for a growing class of European
ordinance a single polygon-plus-height is itself the lossy summary**, because the ordinance grants
*different heights over different parts of the same parcel* and draws the dividing line itself.

The shipped case is PGM Art. 350.2 (Barcelona clau `22a`, **17.5 % of the city's private buildable
land**): the part of the parcel inside a band concentric with the BLOCK, whose area equals 70 % of
the block (Art. 350.2.b), rises to the Art. 350.2.c street-width height; the part in the block
interior beyond it is capped at 5 m, one indivisible storey (Art. 350.2.e). Two heights, one
building, and the boundary between them is constructed from the block — not chosen by a designer.

**Normative:**

1. `BuildableEnvelope` carries **`tiers: EnvelopeTier[]`** (§2.4a). **Empty is the norm and means
   "a single prism"** — it is the identity for every `setback`, `alignment` and
   `block-derived-alignment` zone, exactly as `kind: 'setback'` is the identity for a pre-ADR-0270
   pack. Absence is never "not filled in".
2. When `tiers` is non-empty, `insetPolygon` / `insetAreaM2` / `maxHeight_m` / `maxFloors` MUST
   mirror the **PRINCIPAL TIER** — the tallest, ties broken by area, a null height ranking below
   any stated one. The L0 helper `principalTier()` is the ONLY sanctioned way to select it, and
   `BuildableEnvelopeSchema` REFUSES TO PARSE an envelope where they disagree.
3. **Why the principal tier and not a merged figure.** The legacy prism is then a *real tier of the
   real solid*, so a consumer that has never heard of tiers renders something that genuinely fits
   inside the envelope. It UNDER-states (the other tiers are invisible to it) and never
   OVER-states, which is the only direction §1.4 permits. A merged or averaged prism would be a
   volume no article grants — the ADR-0272 §3.4 objection, applied to geometry.
4. A **multi-tier envelope MUST NOT be rendered as one prism without saying so.** The engine emits
   a caveat naming every tier and its height; a surface that shows only the principal tier while
   presenting it as "the envelope" repeats the §1.11 category error at solid scale.
5. **A tier's `maxHeight_m` MAY be null while its polygon is fully determined.** This is a
   finding, not a gap: Art. 350.2.c is keyed on the *amplada de vial* and gated on a legal regime,
   so the REGION can be established while the HEIGHT honestly refuses. No consumer may substitute
   a default height for a null tier (§1.4).
6. **Coverage binds a tiered envelope's VOLUME.** Where the zone states a `maxCoverage`, the study
   volume is `min(area(principal tier), maxCoverage × parcelArea) × height`. Without this a parcel
   shallower than the tier boundary publishes a footprint covering 100 % of the plot beside a
   90 % occupation cap read from the same article — see KG-3.

**Why this is not a §1.7a-style migration.** Nothing persisted changes shape: `tiers` is transient
engine output like the rest of the envelope (§1.7), and the C19 write path is untouched.


The `BuildableEnvelope` numeric results map **1:1** onto the C19 `Parcel` mutable fields (`setbacks.{front,side,rear}`, `maxFAR`, `maxHeight`, `zoning.category`, `zoning.overlays`) and reach the model **only** through the existing `site.updateZoning` command (C19 §4.1, `packages/stores/src/site-commands/siteUpdateZoning.ts`). C58 introduces **no** new persisted output schema on the Site — only the transient `BuildableEnvelope` + `DerivationTrace` (which the report renders and which may be cached, not persisted as authored model data).

- Per **P6**, the UI never writes zoning fields directly; the engine result is dispatched as `site.updateZoning`.
- The parcel polygon is untouched (C19 §1.4 immutable) — the envelope only writes the mutable zoning fields.

**Why**: the output destination already exists and is proven. Inventing a parallel envelope-persistence schema would fork the site model. C58 computes; C19 stores; one command bridges them.

### §1.8 — The envelope constrains generation (envelope → authoring bridge)

A computed `BuildableEnvelope` MUST be threadable into the generative authoring pipeline as **generation bounds**: the setback **inset polygon** as the buildable footprint boundary, and `maxHeight` / `maxFloors` as the vertical cap. The generators (`generateResidentialFromBoundary`, apartment / house / typology-pipeline C50, layout engine C53) consume these bounds so a generated building **provably fits inside the envelope**.

- This connection is threaded through the **existing** generation trigger and the **existing** engine inputs — per C53's **L-PRINCIPLE / slider-as-intent**, the envelope adjusts *generation bounds*, NEVER introduces a parallel dimension knob or a second scorer.
- Permitted-use (`anvendelse` / `qualificació`) SHOULD seed the typology brief (`briefSchema`, C50) so program is compliance-aware (§10.2 — the program hand-off is a proposed seam).
- A generated footprint outside the inset, or a height above `maxHeight`, is a C19 §1.6 violation (soft-lint at edit time, hard at IFC export).

**Why**: the competitive thesis (ADR-0269 / gap audit G-BRG-1) — "beat Archistar on authoring *of the compliant* building". A computed envelope that does not reach PRYZM's authoring strength is a disconnected half. This invariant *is* the connection.

### §1.9 — The engine is pure L2 (no THREE / DOM / I-O / RNG)

The `ZoningRulesEngine` and `computeBuildableEnvelope` live in `packages/site-parcel-data/` (**L2**), consume L0 schemas + pure geometry (Turf), and return a `BuildableEnvelope`. They perform no I/O (the `ZoningProvider` fetch is a separate impure step, proxied per C57 §1.2), no rendering, no RNG. The only impure surfaces are the provider fetch (C57 proxy) and the editor executor that dispatches `site.updateZoning` (P6).

**Why**: purity makes the engine unit-testable to byte-determinism (§1.1) and reusable headless (a future server-side pre-compute, a batch feasibility run) without a UI or renderer.

### §1.10 — Every exported engine / provider fn opens an OTel span `pryzm.zoning.<verb>`

Per **P8**: `pryzm.zoning.fetchZoning`, `pryzm.zoning.computeBuildableEnvelope`, etc. Recommended attributes: `jurisdictionId`, `zoneCode`, `confidence`, `provider`, `resultFields` (which numeric fields resolved structured vs estimated), `insetAreaM2`, `maxHeight`.

**Why**: envelope solves are compliance-relevant and per-jurisdiction; uniform spans make fidelity distribution (how often we fall to `estimated-ruleset`) and correctness observable, feeding the C23 audit trail.

---

### §1.11 — GRANULARITY is a THIRD axis, independent of confidence (L-439)

**Added 2026-07-20 after the live Spain verification pass
(`docs/04-reference/jurisdictions/es/SPAIN-ZONING-LIVE-VERIFICATION-2026-07-20.md`).**

§1.2 models fidelity (`structured` vs `estimated-ruleset`) and §1.4 models credibility. Neither
captures the failure the Spain pass exposed: **a source can be genuinely numeric, published,
and authoritative — and still be unusable, because it answers at the wrong GRANULARITY.**

Live examples:
- **Madrid VEDA** (`ANALISIS_URBANO/Visor_Edificabilidad`) publishes real `esriFieldTypeDouble`
  buildable-m² by use — at **`Ambito`** (planning-sector) granularity.
- **Valencia `InventarioSuSuz`** publishes `sup_m2` + `edif_m2` (a real, computed FAR of 0.756
  for Almassora) — at **sector** granularity, and only for *suelo urbanizable*.

Both are `structured` by §1.2 and would earn a high confidence label — yet **neither answers
"what may I build on THIS parcel."** Presenting a sector FAR as a parcel FAR is a category
error that no confidence chip corrects, because the number is not uncertain: it is *about
something else*.

**Therefore, normative:**

1. Every `ZoningRecord` and `BuildableEnvelope` MUST carry a `granularity` discriminator:
   `'parcel' | 'block' | 'sector' | 'ambito' | 'municipality' | 'unknown'`.
2. An envelope whose numbers derive from a granularity **coarser than `parcel`** MUST NOT be
   presented as a parcel envelope. It may be shown as **context** ("this sector permits
   X m² across Y m²") and MUST say so in the same sentence as the number.
3. The generator bridge (§1.8) MUST NOT consume coarser-than-parcel numbers as hard
   constraints. Building to a sector-derived FAR on one parcel silently over- or under-builds
   it, and the result would still validate against the containment check (L-428) because the
   footprint is legal — only the *quantity* is wrong.
4. `granularity: 'unknown'` is treated as coarser-than-parcel. It is never treated as parcel.

**Rationale.** §1.4 stops us presenting a guess as a fact. §1.11 stops us presenting a *fact
about the wrong thing* as a fact about this parcel — which is harder to notice precisely
because the underlying datum is correct and well-sourced.

### §1.12 — Where the ordinance states an ALGORITHM, the answer is CONSTRUCTED; a construction's INPUTS carry their own graded provenance ladder

**Added 2026-07-21 (L-525a, L-537; extends ADR-0271 from the depth to every constructed field).**

§1.2 models the case where a number is *published somewhere*. A large and growing class of
European ordinance states no number at all — it states **how to derive one**. Two are now
shipped for Barcelona and both were verified against live data before a line was written:

| Field | The ordinance | Why a lookup is impossible |
|---|---|---|
| *profunditat edificable* | PGM Art. 242 — an equidistant figure similar to the block leaving ≥ 30 % interior free space, floored at **12 m**, capped at 30 m | The answer is a function of the block and differs block to block (ADR-0271) |
| *alçada reguladora* | PGM Art. 327.2 — a table keyed on the **declared** street width (*ample oficial*) | **No declared-width dataset is published** — nationally or (probed 2026-07-21) by Barcelona; the only municipal `vial` layer is a WMS raster with no width attribute |

**Normative:**

1. **A constructed field is a first-class result, not a fallback.** It MUST carry its derivation
   (§1.3) naming the article that defines the construction, and MUST NOT be presented as a
   published figure.
2. **Every INPUT to a construction carries its own provenance tier**, and the resolver MUST
   return the tier alongside the value — never the value alone. Flattening the tiers erases the
   only thing that keeps the panel honest (the L-459 defect class: a constructed number rendering
   identically to a surveyed one). The shipped ladder for the *amplada de vial*
   (`packages/site-parcel-data/src/rulepacks/ampladaDeVial.ts`), strongest first:

   | Tier | Meaning | Status |
   |---|---|---|
   | `declared-municipal-gis` | a real planning street database | **reserved — no Spanish municipality probed publishes one machine-readably** |
   | `curated-cerda-nominal` | the hand-verified nominal figure (~26 Cerdà streets) | demoted, never deleted — still wins on its own streets |
   | `snapped-to-declared-quantum` | a measurement close enough to a value the grid demonstrably quantises on | shipped |
   | `measured-cadastral` | the raw frontage-to-frontage distance | shipped |
   | *(none)* | no width ⇒ no height | **the correct answer when we do not know** |

   Only the two strongest tiers may disarm the band-edge refusal guard.
3. **A snap to a "declared quantum" is legitimate ONLY where the quantisation has been MEASURED,
   and the quanta live in the REGION pack — never in the measurement code.** Measured over
   **6,819 frontages / 697 blocks / 5 cities** (`SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md`):
   widths do cluster (47.1 % within ±0.5 m of a round value vs a 13.0 % uniform null), **but the
   intuitive set `{10,15,20,25,30}` is FALSE for the city we ship** — Barcelona spikes ×7.55 at
   20 m and ×7.51 at 30 m, and ×0.63 / ×0.24 / ×0.00 at 10 / 15 / 25 m. Madrid is `{15,30}`,
   Valencia `{25,50}`, and **Córdoba and Sevilla quantise on nothing above ×2.8 — for them the
   honest configuration is `quanta: []`.** A region supplies its own quanta derived from its own
   probe; it MUST NOT copy another region's.
4. **A snap MUST resolve noise, never correct the data.** The nominal "50 m" Cerdà arteries
   **measure 48 m** (×6.23 at 47.75–48.25; 50 m itself ×0.90) — an offset ~3× the measurement's
   own p90 error bar of 0.63 m. Snapping 48 → 50 would be a *correction*, and is refused. The
   snap tolerance MUST be derived from the measurement's own error (shipped: **0.60 m**, the p90
   rounded down, one fifth of the narrowest Art. 327.2 band, so a snap can never cross a band by
   itself), and a measurement whose own spread exceeds it MUST be refused rather than snapped.
5. **A continuous distribution MUST NOT be snapped at all.** Barcelona's 5.5–8.5 m mass is a
   continuous ridge of pre-Cerdà streets, not a spike on a declared value, despite a ×4.10 count
   at 6 m; snapping inside a continuum manufactures precision the data does not contain.
6. **No input ⇒ no output, and the *absence* must be geometrically distinguishable.** Where the
   construction cannot resolve, the engine MUST emit `null` and the massing path MUST render a
   flat **footprint slab**, never an invented prism. The hardcoded `: 9` metre height fallback
   removed under L-525a is the anti-pattern: it produced a ~9 m volume next to real ~25 m
   neighbours and read as an answer.

**Why**: the L-529 discipline, generalised. A tuned constant standing between cadastral data and
a compliance number is the failure this subsystem spent a session unwinding; a *measured* constant
carried with its tier is not.

### §1.13 — A REFUSAL is a positive answer and MUST be representable, cited, and distinct from a coverage gap

**Added 2026-07-21 (L-550; implements BARCELONA-COMPLETE-COVERAGE-PLAN Phase 0.3).**

Before this invariant the engine had exactly two outcomes — a solved envelope or the generic
estimated pack — so a Collserola forest reserve, the Ronda de Dalt, the Parc de la Ciutadella and
a clau-`18` *volumetria específica* plot were all shown a **fabricated front/side/rear triple** in
the same card as the Eixample's real Art. 242.2 construction. That is the §CONTEXT-DATA-HONESTY
family (L-422 / L-467 / L-469) restated at the envelope layer: **a refusal and a failure rendered
as the same value.**

1. `EnvelopeStatus` carries `'not-applicable'` and `EnvelopeConfidence` carries
   `'not-determined'`, with a structured `BuildableEnvelope.refusal { code, headline, detail,
   ordinanceRef, legallyGrounded }` over a **closed** code set. A Zod refinement makes `refusal`
   present **exactly** when status is `not-applicable`, so a blank refusal card and a refusal on a
   solved envelope are both unrepresentable.
2. **`legallyGrounded: false` (the `no-rule-pack` code) MUST wear a different chip.** *"The
   ordinance grants no private buildable envelope here"* and *"PRYZM has not encoded this zone
   yet"* are **opposite claims**; collapsing them into one boolean is what put an estimate on a
   motorway. A coverage gap MUST NEVER render as a legal finding.
3. **A refused envelope MUST zero/null every numeric field and the ring** — `storeyCap`, the
   generators and the massing path all read those and will happily extrude one.
4. **A refusal's `ordinanceRef` MUST cite what was actually read.** Where the classification comes
   from a taxonomy rather than an article (the weaker `CODI_QUAL_MUC` systems classifier), the ref
   MUST name the taxonomy, not invent an article number — an invented citation on a refusal is
   still an unsourced claim about the law (the L-526 lesson).
5. **Zone → pack resolution MUST go through a registry, not a hardcoded list in an editor file.**
   Shipped: `packages/site-parcel-data/src/rulepacks/registry.ts` returns three outcomes —
   `pack` / `refusal` / `unregistered` — replacing the `BCN_ENSANCHE_ZONE_CODES.includes(clau)`
   gate in `apps/editor/src/ui/site/siteDispatch.ts`. Adding a clau, or a city, is now a **data**
   addition in L2, which is what §1.5 always required.
6. **Zone-code classification MUST be enumerated, never prefix-matched.** `13a` starts with `1`
   (port) and `22a`/`20a` with `2` (forest reserve), so a prefix table would refuse the Eixample —
   and the failure would be SILENT, rendering as a correct-looking refusal.
7. **A refusal MAY state the limits that hold REGARDLESS of what it is refusing — in prose, under
   a citation, with every numeric field still null.** *(Added 2026-07-22, §L-590c / ADR-0276,
   founder-ruled.)*

   Clauses 1–6 assume a refusal has nothing numeric to say. `regime-undetermined` breaks that
   assumption: PGM Art. 350 governs clau `22a` under **two regimes**, and some of its limits are
   stated identically in both. Withholding those would be its own dishonesty — the user would read
   *"we can tell you nothing"* while we hold the most load-bearing figure on 17.5 % of the city.

   The permission is **narrow and conditional**, because it is one step from the fabrication this
   whole invariant exists to end:

   - **Clause 3 is NOT relaxed.** `insetPolygon`, `maxHeight_m`, `maxFloors`, `maxFAR`,
     `maxCoverage`, `maxVolumeM3`, `insetAreaM2` and `tiers` stay null/empty/zero. `storeyCap`, the
     generators, the Cesium massing, the §1.8 generator bounds and `site.updateZoning` therefore
     receive **nothing** and can extrude nothing. The facts reach only `detail` + `ordinanceRef`.
   - **Prose is not a workaround — it is the only form that can carry a CONDITION.** Art. 350's
     occupation cap is 90 % on an *alineacions de vial* sector and **70 %** on an *edificació
     aïllada* one (Art. 350.1.2n). `maxCoverage: 0.9` in a field is unconditional by construction
     and would over-state by 20 pp; *"90 %, where the sector is ordered segons alineacions de
     vial"* is the true statement and does not fit in a number. **A limit whose condition cannot
     be stated alongside it MUST NOT be published at all.**
   - **NOT `knownFacts`.** That field's contract is *facts only — never a constraint, never a
     number the user could mistake for an allowance*, and it renders as bare lines with no room
     for the condition. A FAR ceiling is exactly such a number.
   - **The citation MUST be narrowed to what is actually claimed.** The `22a` card cites
     Arts. 350.1.1r / 350.1.2n / 350.2.a and **explicitly disclaims** Arts. 350.2.b and 350.2.c,
     which it is declining to apply. Carrying the pack's full `ordinanceRef` would attach an
     authoritative-looking reference to paragraphs the card does not assert — L-526 in miniature.

   ⚠ This clause licenses stating a limit **the ordinance states in every branch of the refusal's
   own uncertainty**. It does not license stating a *typical*, *likely* or *neighbouring-zone*
   value, which remains forbidden by §1.4 in every context.

**Measured result** (probe scored against the shipping `resolveZoneDisposition`): **741 of 1,014
points = 73.1 % of all Barcelona ground** now returns a cited refusal instead of a fabricated
triple; 86.1 % of all ground gets a constructed-or-cited answer.

**Why**: honesty is not achieved by hiding a number. It is achieved by making "no envelope
applies, and here is the article that says so" a *representable, first-class* result.

### §1.13.8 — A TRANSIENT fetch failure and a GENUINE data-absence are different answers; the resolver's distinction MUST reach the card (STRUCTURAL-SEAM-4, L-422/457/467/469)

**Added 2026-07-26.** §1.13 gave a *refusal* a first-class, cited representation. It left a hole one
layer down: the `EnvelopeRefusalCode` set (`BuildableEnvelope.ts:203-214`) has *legal* permanent
codes and exactly ONE transient code, `source-data-unavailable` — so a **data-path empty** ("the
source answered and there is no plan/bouwvlak at this point") has nowhere to go but the transient
code, and `isTransientRefusal` (`zoneRefusal.ts:151-153`) then dresses a permanent absence in the
"usually clears on a second attempt" card (`GISAreaLayout.ts:2372`, whose retry is itself fictional,
`:2365-2371`). Worse, the resolvers already classify — `resolveNlBestemmingsplan` returns
`endpoint-unreachable` distinct from `no-plan`/`no-bouwvlak` — but `siteDispatch.ts:1839-1845` (NL)
and `:1440-1447` (DK) **flatten every `!ok` reason into `source-data-unavailable`** before the card
sees it. That is §CONTEXT-DATA-HONESTY (failure ≠ empty) breached on the compliance path.

**Normative:**

1. `EnvelopeRefusalCode` MUST carry a **genuine-absence** code (e.g. `no-plan-at-point`) distinct
   from `source-data-unavailable`. An empty is a *durable* answer; only a genuine transient earns the
   retry affordance.
2. The dispatcher MUST **carry the resolver's transient-vs-absent status through** to the refusal —
   it MUST NOT collapse `endpoint-unreachable`/`no-plan`/`no-bouwvlak` into one code. `isTransientRefusal`
   and the card branch on the truth, not on the fact that everything was funnelled to one code.
3. A **transient MUST be auto-retried** (bounded, with backoff) at the fetch seam before it can reach
   a card (C57 §1.5 amendment); a still-failing transient surfaces as "temporarily unavailable,
   retrying", never as a refusal a user is asked to manually re-select through.
4. This rides the same shared `FetchOutcome` union C57 §1.5 mandates end-to-end; the proven
   precedent is the context-building path's `'ok'|'aborted'|'unavailable'|'disabled'`
   (`contextBuildings.ts:897-924`), which never let an empty and an unavailable share an answer.

**Why**: §1.13 stopped us from rendering a *fabrication* as a refusal. §1.13.8 stops us from
rendering a *transient failure* as a durable absence and a durable absence as a *retryable* transient
— the same "these are different answers" discipline, at the fetch boundary.

**IMPLEMENTED 2026-07-27 (STRUCTURAL-SEAM-4).** (1) `EnvelopeRefusalCode` gained the genuine-absence
code **`no-plan-at-point`** (`BuildableEnvelope.ts`), `legallyGrounded: false`, with NO retry
affordance. (2) The dispatcher no longer flattens: `siteDispatch.ts` wraps each explicit-area resolve
(Madrid/NL/DK) in `retryWhileUnreachable` and branches the refusal on the outcome —
`transient` → the retry-honest `source-data-unavailable` builders (`madridNZ1Refusal` /
`nlBestemmingsplanRefusal` / the new `dkPlandataUnreachableRefusal`); `absent` → the new
`no-plan-at-point` builders (`madridNZ1AbsentRefusal` / `nlNoPlanRefusal`; `dkPlandataNoPlanRefusal`
was moved from the transient code to `no-plan-at-point`). (3) The card (`GISAreaLayout.ts`) grows an
`isAbsent` branch ("No plan published here", no retry line) and the transient copy was corrected from
the fictional "usually clears on a second attempt" to "temporarily unavailable — retried
automatically". (4) The answerability classifier (`answerabilityClass.ts`, L-601) gained a sixth
class **`no-plan-published`** so a genuine absence never shares a colour with the transient
`construction-incomplete` nor the `zone-unencoded` coverage gap. Rides the shared `FetchOutcome`
union C57 §1.5 mandates (see that section's IMPLEMENTED note for the type + retry + proxy work). CI
gate: `packages/site-parcel-data/__tests__/fetchOutcomeHonesty.test.ts`.

### §1.14 — The massing render is a PURE TOTAL FUNCTION of the whole envelope; it MUST NOT re-derive the solid from a hand-picked field subset (L-616 seam)

**Added 2026-07-26 (STRUCTURAL-SEAM-1; grounds `SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md`
Part 3 §3.1 and `jurisdictions/ENVELOPE-REALISM-MATRIX.md`).**

Every prior §1 invariant makes the *engine's* `BuildableEnvelope` honest — non-overstating (§1.4),
tier-complete (§1.7b), zeroed on refusal (§1.13.3), with a schema refinement
(`BuildableEnvelope.ts:490–505`) that guarantees the legacy scalars never contradict `tiers[]`. None
of that binds the **3D solid the user actually sees**, and today the render throws the guarantee
away: `apps/editor/src/ui/layout/GISAreaLayout.ts` `resolveFormaEnvelope()` narrows the envelope to
`{ ring, maxHeightM, farLimitedHeightM, confidence }` and `CesiumViewport.renderFormaMassing`
(:3817–3836) accepts only those four, extruding `ring × maxHeightM` as one prism. `maxVolumeM3`,
`tiers[]`, `maxCoverage`, `footprintIsUpperBound`, `maxFloors`, `insetAreaM2` and `derivation[]` are
**discarded before they reach the render** — so the render re-derives the solid instead of consuming
the one the engine proved. Each honesty field has had to be hand-threaded into that subset one
defect at a time (`farLimitedHeight_m` per L-616; `confidence`→hue per L-608), which is the per-city
patch treadmill this invariant exists to end.

**Normative:**

1. There MUST be exactly ONE pure L2 total function `envelopeToMassing(env: BuildableEnvelope):
   MassingSolid[]` (in `packages/site-parcel-data/`, no THREE/DOM/RNG per §1.9) that maps the WHOLE
   envelope to the complete set of solids to draw. It is the render-side dual of the §490–505
   refinement.
2. The renderer (`renderFormaMassing`) MUST consume `MassingSolid[]` and rasterise each solid. It
   MUST NOT re-derive a height from a scalar, MUST NOT hold per-field knowledge of the envelope, and
   MUST NOT receive a hand-picked field subset. `resolveFormaEnvelope`'s narrowing is deleted.
3. `envelopeToMassing` MUST honour every field in one place: `tiers[]` → one solid per tier at its
   own `maxHeight_m` (§1.7b.4 — a multi-tier envelope is never one prism); `footprintIsUpperBound`
   (§1.13/L-619) → a **study** style (hatched), never a confident prism; `farLimitedHeight_m` → the
   FAR solid inside the translucent legal shell; `maxVolumeM3`/`maxCoverage` → the volume cap
   (§1.7b.6). A null height MUST render a flat footprint slab, never an invented prism (§1.12.6).
4. **A CI property test binds it for ALL packs at once** (`check-envelope-solid-never-overstates`,
   §6): for every registered rule pack's canonical parcel,
   `Σ volume(envelopeToMassing(env)) ≤ (env.maxVolumeM3 ?? Σ tier.area × tier.height)`,
   `footprintIsUpperBound ⇒ every solid carries the study style`, and `tiers.length > 1 ⇒
   solids.length > 1`. Because the shared function is the only render path and the test binds every
   pack, **no jurisdiction can overstate at the render** — the DK-render, BCN-FAR and tiers patches
   fold into one function + one test rather than N per-city fixes.

**Why**: §1.4 is a promise the engine keeps and the render breaks. The only way to make
over-statement *structurally* impossible — rather than patched pack by pack — is to make the picture
a pure function of the object the contract already guarantees, and to prove it for every pack in CI.

### §1.15 — The envelope has ONE VISIBILITY AUTHORITY, and the gate sits at the RASTERISER, not at the callers (L-1170)

**Added 2026-08-19 (lane ENV1). Grounded in a founder report on the deployed build:** *"I just
selected the Level 15 top level for roof creation and an ENVELOPE showed up — I tried to hide it
but it did not work."*

§1.14 makes the SHAPE of the drawn solid a pure function of the envelope. It says nothing about
**whether the solid is drawn at all** — and that question had **four** answers:

| # | The answer | Who could see it |
|---|---|---|
| 1 | `formaEnvelopeVisible` — a `let` inside `mountGISArea`'s ~4800-line closure | `resolveFormaEnvelope()`, and nothing else in the program |
| 2 | `CesiumViewport.formaLastMassingInput.envelope` — a **snapshot** of (1) at an earlier render | replayed without re-asking by `setVisibleFormaLevels` (**the floor selector** — the founder's "selected Level 15"), `setGlobeBuildingFidelity`, `clampTerrainThenReplace`, `rerenderFormaMassing` |
| 3 | `formaSiteOverlayEntities` — the §SITE-OVERLAY-NOT-BUILDING survival set (L-464/L-468) | exempts envelope entities from `setGlobeBuildingShown` — i.e. an already-added solid cannot be hidden |
| 4 | `ParcelBoundarySceneRenderer.buildEnvelopeVolume()` — the BIM/plan three.js volume | **consulted no toggle whatsoever**, at 9 m fallback height, on the surface the founder was actually working in |

That is [C84](C84-ELEMENT-INTEGRITY.md) **EI-1 / EI-9** — one question, four implementations — and
the symptom follows mechanically: hiding writes (1), the floor selector re-renders from (2), (3)
protects what is already there, and (4) never looks.

> ⚠ **WHICH surface produced HIS box, stated from the log rather than from plausibility.**
> `§ENVELOPE-REINSET` fires only when `getLastBuildableEnvelope()` returned null-or-not-`ok`, and
> `buildEnvelopeVolume()` reads **the same** function — so **(4) drew nothing in his session** and
> was not his box. His was the CESIUM one. (4) is a real member of this family and would have been
> unhideable the moment an envelope *did* solve; it is fixed here, but it is not the instance he
> hit. This distinction is recorded because the reverse — a confident, plausible attribution that
> the evidence does not support — is the failure mode this contract's own §1.4 exists to police.

**Normative:**

1. There MUST be exactly ONE authority for *"is the buildable envelope on screen?"*
   (`apps/editor/src/ui/site/envelopeVisibility.ts` — `isBuildableEnvelopeVisible()` /
   `setBuildableEnvelopeVisible()` / `subscribeBuildableEnvelopeVisibility()`; since §1.17 it also
   carries the FOOTPRINT axis and `getBuildableEnvelopeAxes()`, **on the same one authority**). A surface MUST NOT
   hold a local mirror of it, and a payload carrying envelope solids MUST NOT be treated as
   evidence that they should be drawn.
2. ⭐ **THE GATE SITS AT THE RASTERISER, NOT AT THE CALLERS.** `renderFormaMassing` MUST consult the
   authority *before* the entity-add loop, because every re-render route converges there. Gating at
   the callers instead re-creates the N-answers shape: a caller can be added without the gate, and
   a **replayed** payload is by construction a caller nobody re-asked.
   > ⚠ **AMENDED 2026-08-19 by [§1.17](#117--the-envelope-has-two-representations-and-two-visibility-axes-hiding-the-volume-must-not-delete-the-ground-footprint-l-1188).**
   > This clause used to quote the literal two-line gate
   > `const envHidden = !isBuildableEnvelopeVisible(); const envSolids = envHidden ? [] : (…)`.
   > **That gate is gone and MUST NOT be restored** — it suppressed the whole solid, which deleted
   > the ground footprint along with the volume (L-1188). The *placement* rule below is unchanged
   > and is the part that matters; only the expression changed:
   ```ts
   const envAxes = getBuildableEnvelopeAxes();
   const envPayloadSolids = input.envelope?.solids ?? [];
   const envSolids = applyEnvelopeVisibilityAxes(envPayloadSolids, envAxes);
   ```
   The payload may be stale; the **answer** may not be. The same rule binds every other surface
   that can put an envelope solid on screen — today `ParcelBoundarySceneRenderer`.
3. The visibility CONTROL may only **write** the authority. It MUST NOT choose a renderer, re-place
   massing, or change the active view. Surfaces repaint from the authority's subscription. (The old
   control was a three-way renderer picker whose third branch repainted the card and touched no
   scene — a control whose effect depended on which of two unrelated view-mode variables happened
   to be set.)
4. The user's choice MUST survive a massing re-render, a level/floor switch, and a **page reload**.
   It is a view preference, not project data: it does not round-trip through the document, is not
   undoable, is not part of a CRDT merge, and is deliberately NOT project-scoped.
5. **Default ON**, per §1.4 — an envelope that silently fails to arrive reads as *"there is no
   constraint here"*, which is the false negative this contract exists to forbid. Only an explicit
   user "off" may hide it.
6. **The survival set (3) is NOT a rival and MUST NOT be removed.** It answers a different question
   — *"does hiding the BUILDING hide the site CONSTRAINT?"* — and its answer (no) is correct. With
   the gate at add-time, a hidden envelope has no entity for it to protect.

**Binding artefact:** `apps/editor/__tests__/envelopeOneVisibility.test.ts`. It is deliberately part
**structural**: a behavioural test of a visibility flag is this repo's most repeated defect (the
flag reads correctly and the box is still on screen), so the test asserts the SHAPE of the source —
exactly one `const envSolids =` in `CesiumViewport.ts` and it is gated; no other path reads
`input.envelope` to draw with; the BIM renderer asks before it reads; no private copy survives in
`GISAreaLayout`; no renderer call in the toggle body.

---

### §1.16 — A ZERO-SETBACK RE-INSET IS THE PARCEL, NOT AN ENVELOPE, AND MUST BE REFUSED (L-1171)

**Added 2026-08-19 (lane ENV1). A §1.4 / §L-616 overstatement, found in the same founder capture.**

The log read `re-inset from the PERSISTED setbacks 0/0/0 m (11-pt ring)` → `maxHeight=n/a` →
`provisional grey` → one `footprint-slab@0.5m`. Read back as a **claim**, that picture states
*"the buildable envelope here is the entire parcel, to its very edge, and we cannot tell you a
height"* — an **UNKNOWN constraint drawn as ZERO**, the exact overstatement §1.4 forbids.

⭐ **§1.7a's re-inset guard was satisfiable by a DEFAULT.** It argued that all three setbacks being
NUMBERS is equivalent to *"this is a setback zone"*, because an alignment-governed zone stores its
ring (so the persisted branch already returned) and stores `null` setbacks. **`0` is a number.** A
zero-FILLED record — a default, a never-populated field, a rule pack that answered nothing — passes
that test exactly as a derived `3/1.5/3` does: failure and empty are the same value.

**And the output carries no information either way.** `insetPolygonPerEdge` at 0/0/0 is the
**identity**, so the "buildable ring" *is* `boundary.polygon` vertex for vertex — a polygon already
drawn on both surfaces as the violet parcel ring and fill. Zero new pixels, one new false legal
claim.

**Normative:**

1. `resolveRenderableBuildableEnvelope` MUST REFUSE the re-inset branch when
   `front === 0 && side === 0 && rear === 0`, and MUST say why (`§ENVELOPE-ZERO-INSET-REFUSAL`).
   Refusing is the §1.13 positive answer; drawing is a claim without evidence.
2. The refusal is **narrow by design**. A *partial* zero (front 0 with real side/rear) is a genuine
   alignment-to-street rule whose inset is strictly smaller than the parcel, and MUST still
   re-inset. Widening this to "any zero" would delete real envelopes — the opposite failure, and
   the more damaging one.
3. A genuinely zero-setback jurisdiction (Barcelona alignment; the DK/Copenhagen §L-619 case) is
   **unaffected**: it persists its solved ring, so the persisted branch answers first. This MUST be
   pinned by a test, not asserted in prose.

**Binding artefact:** `apps/editor/__tests__/buildableEnvelopeRehydrate.test.ts` — the refusal, the
partial-zero negative control, and the persisted-ring precedence.

⚠ **OPEN, not owned here:** *why* a Barcelona parcel holds `0/0/0` rather than `null` is
unanswered. §1.16 closes the render-side overstatement; it does not close the data defect that
produced the zeros. Whoever owns the BCN rule pack must establish whether a zero triple is ever
written deliberately — if it is, §1.16 will be hiding a legitimate envelope and the distinction
must move into the data (an explicit "no setbacks apply" marker) rather than being inferred from
three zeroes.

---

### §1.17 — The envelope has TWO representations and TWO visibility axes; hiding the VOLUME must not delete the GROUND FOOTPRINT (L-1188)

**Added 2026-08-19 (lane ENV2). Grounded in a founder report on the deployed build, with three
screenshots and a console capture:** *"When the envelope is OFF we should see this shade on the
GROUND."*

**This is a regression from [§1.15](#115--the-envelope-has-one-visibility-authority-and-the-gate-sits-at-the-rasteriser-not-at-the-callers-l-1170)
— correct in kind, over-suppressing in degree.** §1.15 collapsed four rival authorities into one
gate at the §1.14 rasteriser. That gate suppressed **the whole envelope solid**, and the whole
envelope solid was the only thing the envelope ever drew — so "hide the volume" silently also meant
"delete the ground answer".

**The founder's own log is the measurement, and it is unambiguous:**

| state | log |
|---|---|
| **OFF** | `§ENVELOPE-ONE-VISIBILITY — 1 envelope solid(s) in this payload SUPPRESSED` · `render diag: envelope present=n, envelope entities added=0, total massing entities=2` |
| **ON** | `§ENVELOPE-VIA-MASSING (§1.14 rasteriser) drew 1/1 solid(s): [massing@19.1m] · provisional grey` |

`entities added=0` **is** the finding: with the volume off the envelope contributes **nothing** to
the ground. The two surviving entities are `pryzm-forma-parcel-boundary` (the faint fill) and
`pryzm-forma-parcel-boundary-line` (the dashed ring) — i.e. the **424 m² PARCEL**, not the
**272 m² BUILDABLE** area. Whatever grey the user sees when the envelope is off, it is answering a
different question from the one they asked.

**The two representations answer different questions, and one is useful precisely when the other
is off:**

| | question | form | when it helps |
|---|---|---|---|
| **VOLUME** | *"what MASS may I build?"* | extruded study solid | while studying capacity; **obstructive** — it is turned off to see one's own design |
| **FOOTPRINT** | *"what AREA may I build on?"* | flat ground shade | **exactly when the volume is off** — it occludes nothing |

**Normative:**

1. The one authority (§1.15.1) MUST carry **TWO axes** — `volume` and `footprint` — not one
   boolean. `apps/editor/src/ui/site/envelopeVisibility.ts` exposes
   `getBuildableEnvelopeAxes()` alongside the per-axis reads/writes.
   ⛔ **A SECOND AUTHORITY IS NOT AN ACCEPTABLE IMPLEMENTATION.** Re-introducing a rival
   visibility source is the exact defect §1.15 spent a lane removing; two axes on one authority is
   the fix, and it is the *only* one this section permits.
2. **The two axes become geometry in exactly ONE pure L2 place** —
   `applyEnvelopeVisibilityAxes(solids, axes)` / `envelopeDrawMode(axes)` in
   `@pryzm/site-parcel-data/envelopeToMassing.ts`, beside the §1.14 seam. **Both** rasterisers (the
   Cesium §1.14 loop and the three.js `ParcelBoundarySceneRenderer`) call it. A surface that
   branches locally on one boolean is a second authority in the only sense that matters: it decides
   for itself what "off" means, and the globe and the BIM scene drift.
3. **The default meaning of the `Envelope: ON/OFF` control is: hide the VOLUME, keep the FOOTPRINT.**
   The control writes the `volume` axis only. `footprint` defaults ON. "Hide everything" stays
   expressible (`{volume:false, footprint:false}` ⇒ `'none'`) so no future need mints a fifth
   authority.
   > ⚠ **AMENDED 2026-08-22 (lane PARCEL33, L-6910) — this clause said "so no future need mints a
   > fifth authority" and stopped there. It left `{volume:false, footprint:false}` REPRESENTABLE
   > AND UNREACHABLE.** No control ever wrote the `footprint` axis:
   > `setBuildableEnvelopeFootprintVisible` shipped with this section and had **zero callers**.
   > The founder reported the consequence three days later — *"There is a bug on 'envelope off' —
   > the shade goes back."* The per-axis rule above is unchanged and correct; what was missing is
   > the surface, and it is now **[§1.18](#118--every-axis-of-the-visibility-authority-must-have-a-control-l-6910)**,
   > which this clause is subordinate to. **A state the model can hold and the UI cannot set is not
   > a design, it is a gap.**
4. ⭐ **THE FOOTPRINT SHADE IS A PROJECTION OF SOLIDS THAT ALREADY EXIST — NEVER A NEW DERIVATION.**
   It takes the ring, the hue and every honesty flag from the largest **ground-touching**
   (`baseHeightM === 0`) solid `envelopeToMassing` produced. This is what makes it safe under
   [§1.16](#116--a-zero-setback-re-inset-is-the-parcel-not-an-envelope-and-must-be-refused-l-1171)
   and §L-616: a refused / zero-inset / degenerate envelope produces **no solids**, therefore **no
   shade**, by construction. *Hiding something can never mint a claim.* It MUST NOT be derived from
   the parcel ring, from a setback, or from any scalar.
5. The shade MUST carry **`claimsVolume: false`** — it says "this is the AREA", never "this is the
   MASS" — so it contributes 0 to the §1.14.4 never-overstate sum however tall its source solid was.
   It MUST keep the source solid's hue (a "Default rule pack" envelope shades in the provisional
   grey, never the confident violet) and MUST keep the near-wireframe fill weight when
   `footprintUpperBound` or `openTop` is set: **the doubt does not become less doubtful because the
   volume was hidden.**
6. **The control MUST SAY what "OFF" does.** A button labelled bare `OFF` beside a shade that is
   still on screen invites the user to read the shade as terrain or as the parcel fill — the exact
   ambiguity the founder's report had to be disambiguated out of before it could be fixed. The card
   states that the volume is hidden, that the buildable **footprint** is still shaded, and that it
   carries the **same confidence** as the figures above it (§L-616: a shade that reads authoritative
   on a default rule pack is the overstatement defect wearing a new shape).
7. **A caller MUST NOT withhold the envelope from the render payload.** `resolveFormaEnvelope`'s
   `if (!isBuildableEnvelopeVisible()) return null;` was already forbidden by §1.15.2 and was merely
   harmless while "off" meant "draw nothing"; under this section it makes the ground shade
   **unsatisfiable** — the chokepoint would have nothing to project, however correct it was. This
   resolver chooses the SOURCE envelope; the rasteriser decides what is drawn.

> ⚠ **NOT ESTABLISHED.** Not verified in a browser by this lane. And **what the grey plane in the
> founder's OFF screenshot actually was is answered only negatively**: the envelope contributed
> **zero** entities in that state (`added=0`), so it was *not* the buildable footprint — it was the
> parcel fill and/or the Forma ground. Which of the two he pointed at is not measured, and does not
> change this section: either way the buildable **area** had no representation while the volume was
> off, and now it does.

**Binding artefact:** `apps/editor/__tests__/envelopeOneVisibility.test.ts` — 10 new cases driving
the **real** toggle (`setBuildableEnvelopeVisible`, the exact function the card's button calls)
through the **real** pure rule, plus three structural pins: the one-axis gate must not return; both
rasterisers must read the shared L2 rule and neither may branch on the volume boolean; and the
caller-side gate must stay gone. Verified RED before the fix (4 of the 10 fail on a one-axis
`applyEnvelopeVisibilityAxes`), GREEN after.


### §1.18 — EVERY AXIS of the visibility authority MUST have a control (L-6910)

**Added 2026-08-22 (lane PARCEL33). Grounded in a founder report on the deployed build, with
screenshots showing the button reading `Envelope: OFF` and a pale shade still on the plot:**
*"There is a bug on 'envelope off' — the shade goes back."*

⭐ **IT WAS NOT A LOGIC BUG. The runtime was behaving exactly as §1.17 specifies**, and the
founder's own console says so:

```
§ENVELOPE-ONE-VISIBILITY — buildable envelope VOLUME set HIDDEN by the user
   (ground footprint shade STAYS — §ENVELOPE-TWO-AXES); 2 surface(s) notified.
§ENVELOPE-ONE-VISIBILITY — … mode=ground-shade: … drawing 1 flat GROUND FOOTPRINT shade(s) instead
```

**And it was still a defect**, for a reason that has nothing to do with the rasteriser: a control
labelled **OFF** that leaves a visible artefact on the plot is misleading **however good the
reasoning behind the artefact is**. §1.17 made `{volume:false, footprint:false}` ⇒ `'none'` a real,
correct, tested state — and **no surface could set it**. That is
[[authored-but-unwired-is-the-bottleneck]] at the contract level: §1.17 §3 explicitly reserved the
footprint axis *"so a future control has exactly one place to write"*, and the future control was
never built.

**Normative:**

1. ⭐ **Every axis the visibility authority holds MUST be writable from the UI.** A persisted axis
   with no control is an unreachable state, and an unreachable state is indistinguishable from a
   bug to the person holding the mouse. This generalises: it binds any future third axis on the
   same day it is added, not three days later when a founder reports it.
2. ⛔ **The fix MUST NOT be "one control writes both axes."** That deletes the distinction §1.17
   exists to introduce and re-opens the founder's **opposite** report of 2026-08-19
   (*"When the envelope is OFF we should see this shade on the GROUND"*). Two asks in opposite
   directions: **the control grows; it does not get to pick a side.** One user gesture MUST produce
   exactly one axis write.
3. **The control is TWO labelled switches — `Volume` and `Footprint` — not a tri-state cycle.**
   Decided, with the rejected alternative recorded rather than discarded:
   - a cycle makes the CURRENT state readable only from a label and the NEXT state guessable only
     by trying, whereas the axes are genuinely **independent booleans**, not three points on a line;
   - a cycle cannot express `{volume:true, footprint:false}` — not distinguishable on screen (the
     volume's own base IS the footprint; a coplanar shade would z-fight) but a **stored preference
     that survives** and decides what appears the moment the volume is hidden;
   - a cycle needs its own ordering rule on top of two per-axis storage keys — a fifth thing that
     can disagree, which is precisely what §1.15 spent a lane removing.
4. ⚠ **Storage keys and defaults are FROZEN by this section.** `pryzm.site.buildableEnvelopeVisible`
   and `pryzm.site.buildableEnvelopeFootprintVisible`, both defaulting **ON** (§1.4: an envelope
   that silently fails to arrive reads as *"there is no constraint here"*). An existing user's
   "off" MUST survive any re-shaping of the control. The VOLUME switch MUST keep the
   `data-testid="envelope-toggle"` it has always had — `makeDraggable` excludes it by that exact
   selector, so a rename silently re-enables drag-on-click.
5. **The control's markup MUST come from ONE pure producer** —
   `apps/editor/src/ui/site/envelopeVisibilityControl.ts` — which renders the axes it is **handed**
   and reads no global. A control that reads the authority itself cannot be driven through its
   states by a test, and can display a state the host disagrees with. The host reads the authority
   once, at render, and passes it in; the producer writes nothing.
6. **The control MUST be rendered INSIDE the envelope card**, not beside it. The card is a
   singleton element re-homed between the 3D-site viewport, the GIS rail slot and the Parcel rail
   slot (C19 §1.12), so one producer inside it gives **every host the same control and the same
   state by construction** — rather than by a synchronisation rule someone has to remember.
7. **§1.17 §6 (the control MUST SAY what OFF does) is EXTENDED, not replaced.** Each arm of the
   caption MUST name what is drawn **and** what the other switch would change; the volume-off arm
   MUST say the shade can be cleared; the both-off arm MUST state that **the determination itself is
   unchanged** — hiding a constraint is not the same as there being no constraint (§1.4). The
   estimated-confidence qualifier is **retained in every arm** (§L-616: a shade that reads
   authoritative on a default rule pack is the overstatement defect wearing a new shape).
8. **The drag-exclusion selector list MUST be exported by the control**, never hand-copied at the
   `makeDraggable` call site. With two switches, a copied list is exactly how the second one keeps
   starting a drag on every click while the first does not.

> ⚠ **NOT ESTABLISHED.** Not verified in a browser by this lane. What IS measured: the L2 rule's
> `'none'` arm and both rasterisers' handling of it were already correct and unchanged — this
> section adds only the missing surface, so the risk it carries is a UI risk, not a geometry one.

**Binding artefact:** `apps/editor/src/ui/site/__tests__/envelopeVisibilityControl.spec.ts` — all
four axis combinations rendered distinctly; one click ⇒ exactly one axis write (the arm that fails
the rejected §1.18.2 fix); the caption's three distinguishable arms; the confidence qualifier
retained; the producer reads no global; and the **reachability** arm asserting `GISAreaLayout` now
calls `setBuildableEnvelopeFootprintVisible` — an arm checking only that the export exists would
have passed for the three days it had no caller.

---
### §1.19 — The envelope is AUTHORABLE ON THE VIEW, and an AUTHORED envelope is a THIRD provenance kind that must never be mistaken for a solved one (L-13031, STR §26)

> **Founder, verbatim (2026-09-06):** *"don't forget the most important — the capacity to DESIGN,
> CREATE, EDIT the buildable envelope on 2D site map view or 3D site view."*
>
> And earlier, on the same subject: *"I am still not able to create / edit the envelopes on 2D site
> view / 3D site view — architecturally sound"*, and *"it should open a panel like when you create a
> wall or a slab with the tools."*

⛔ **THIS IS A NEW AXIS FOR C58 AND IT MUST BE STATED BEFORE IT IS BUILT, BECAUSE IT CUTS ACROSS THE
WHOLE CONTRACT.** Until now C58 has been **purely generative**: the engine SOLVES an envelope from a
rule pack, and every surface in §5 exists to render that solved answer with its provenance. There has
been **no human authoring route at all** — §9 does not exclude one, it never contemplated one. A
hand-drawn envelope is therefore not covered by any existing tier, and the danger is precise and
severe: **an envelope the user drew, rendered in the same PRYZM purple as an envelope the engine
derived from a cited ordinance, is a legal claim PRYZM did not make.** That is the L-373 credibility
failure (§1.4) in its worst available shape.

**Normative:**

1. **AUTHORING IS A ROUTE, NOT A MODE.** Creating or editing an envelope on a site view is an
   element-authoring interaction like a wall or a slab (the founder's own analogy): a tool is picked,
   a panel opens, geometry is drawn or edited on the active view, and the result is committed
   **through the command bus** (P6). It is NOT a bespoke drawing surface bolted to one view, and it
   is NOT a second envelope pipeline. C16 (command authoring) and C114 (element space envelope) own
   the mechanics; C58 owns only what follows about provenance and law.
2. **IT WORKS ON WHICHEVER SITE VIEW IS OPEN.** Create and edit MUST be available on **2D Site Map**
   and **3D Site**, and the tool follows the pane's view (C59 §2.10.3 clause 4 — the tool's chrome
   belongs to its pane). ⚠ **The known wiring gap is shared with L-13016 / L-13022 and MUST be closed
   ONCE for all three:** `CesiumViewport.ts` and `SiteBoundaryMap2D.ts` import `siteGeometryHighlight`
   **zero** times, so nothing that must appear "on whichever view is open" — selection highlight,
   massing preview, or this authoring tool — can reach either surface today. One wiring, three
   features; three separate wirings would be the defect this clause exists to prevent.
3. **⛔ AN AUTHORED ENVELOPE CARRIES `confidence: 'authored'` AND MAY NEVER BORROW A SOLVED TIER.**
   It is not `published-structured`, not `block-constructed`, not `estimated-ruleset`. It is the
   user's own proposal. It renders in a visually distinct treatment from every solved tier (C58 §5.2
   / C18), its chip reads as the user's own input, and **it carries no `ordinanceRef` and no
   `DerivationTrace`** — because there is no derivation. A surface that lets an authored envelope
   badge itself "Real · constructed" is a violation of §1.4, not a styling choice.
4. **AN AUTHORED ENVELOPE DOES NOT OVERWRITE THE SOLVED ONE.** Where a rule-pack envelope exists,
   both are held: the solved envelope remains the statement of what the law permits, the authored one
   is the proposal. Where they disagree, **the disagreement is shown, with both numbers** — the
   §RAC-FREEFORM-PLUS-HARD-STOPPERS doctrine: a refusal states both figures rather than silently
   clamping. Clamping the user's drawing to the solved envelope, or silently replacing the solved
   envelope with the drawing, are both forbidden.
5. **AN AUTHORED ENVELOPE IS A FIRST-CLASS INPUT DOWNSTREAM.** §1.8's envelope → authoring bridge
   takes it exactly as it takes a solved one; generation is bounded by whichever envelope is active,
   and the active choice is the user's and is stated.

---

### §1.20 — ⛔ THE ENVELOPE IS NOT A PRECONDITION FOR THE PARCEL-LAW PROCESS (L-13032, founder ruling 2026-09-06)

> **Founder, verbatim:** *"having an envelope should not be the single pre-requisite to advance on
> going through the parcel law process — the user still should be able to."*

**This is a gating ruling and it OVERRIDES any local convenience that made the envelope a hard gate.**
The parcel-law process is the sequence a user walks to understand and act on a parcel. The buildable
envelope is **one artefact produced along the way**, not the turnstile at its entrance.

**Normative:**

1. **NO STEP OF THE PARCEL-LAW PROCESS MAY BE BLOCKED SOLELY BY THE ABSENCE OF AN ENVELOPE.** Not
   disabled, not hidden, not silently inert. If a step genuinely cannot produce a meaningful result
   without one, it says so **in the founder's own terms — what is missing and what would supply it**
   — and every step that CAN proceed still does.
2. **AND THIS IS THE SAME RULE AS §1.13, APPLIED FORWARD.** §1.13 already establishes that a REFUSAL
   is a positive answer and must be representable and distinct from a coverage gap. **A parcel whose
   envelope is refused — correctly, with citations, because the jurisdiction's rules are unknown or
   the data is absent — is a parcel PRYZM has answered honestly.** Gating the rest of the process on
   that refusal converts C58's most carefully-built honest answer into a dead end, and punishes the
   user for the very jurisdictions where PRYZM's refusal discipline is doing its best work. ⭐ This
   is the C63 ruling restated on a different axis: **a refusal is a correct answer, not an absent
   one** — and the process must be walkable on a correct answer.
3. **THE ENVELOPE-DEPENDENT AND ENVELOPE-INDEPENDENT PARTS ARE SEPARATED EXPLICITLY.** Parcel
   identity, cadastral attributes, ownership and area, the room programme (STR §25.5), the brief, and
   the record of what the user intends are **all independent of the envelope** and remain fully
   available. Only genuinely envelope-derived figures — permitted volume, storey count against a
   permitted height, percentage-of-permitted — depend on it, and those state their dependency rather
   than disabling their host.
4. **⛔ A `null` ENVELOPE IS A STATE TO RENDER, NOT A BRANCH TO SKIP.** The failure mode this clause
   exists to prevent is the one this repo has already paid for repeatedly (§CONTEXT-DATA-HONESTY,
   L-13002): a reader that answers "no envelope" and a reader that answers "envelope not yet
   computed" and a reader whose runtime was null all return the SAME falsy value, and the UI treats
   all three as "not ready". **Distinguish them at the read, and say which one it is.**

---


## §2 — Schema

Pure Zod (L0), `packages/schemas/src/site/zoning/` (per **P5**).

### §2.1 — `ZoningRecord`

What a `ZoningProvider` returns — the raw zoning at a parcel, before the engine resolves an envelope.

| Field | Type | Notes |
|---|---|---|
| `zoneCode` | `string` | jurisdiction zone code (ES MUC *clau* / Madrid *norma zonal* / DK `anvendelse` / CH zone type) |
| `zoneLabel` | `string \| null` | human label |
| `jurisdictionId` | `string` | resolves the rule pack (`'es-barcelona'`, `'dk'`, …) |
| `structuredFields` | `Partial<EnvelopeNumbers>` (§2.3) | any numeric fields the source published directly (DK case) |
| `overlays` | `string[]` | conservation / flood / heritage overlay codes |
| `provenance` | `ParcelProvenance` (C57 §2.2) | source / version / license / CRS |

### §2.2 — `JurisdictionZoningContract` (the curated rule pack)

The per-jurisdiction pack that fills PDF-trapped numbers (§1.6). Pure Zod (L0). Structure grounded in the scoping doc §7.

```ts
// packages/schemas/src/site/zoning/JurisdictionZoningContract.ts  (proposed)
JurisdictionZoningContract = {
  jurisdictionId: string;                 // 'es-barcelona' | 'es-madrid' | 'dk' | 'ch-zh-8001'
  displayName: string;
  source: 'catastro-muc' | 'madrid-pgou' | 'oereb' | 'plandata-dk' | 'terrara' | 'manual';
  crs: string;                            // EPSG of the source geometry
  lastReviewed: ISODate;                  // curation freshness (§1.6)
  defaultConfidence: 'structured' | 'estimated-ruleset';
  zones: Array<{
    code: string;                         // matches ZoningRecord.zoneCode
    label: string;
    permittedUse: Array<'residential'|'commercial'|'industrial'|'mixed'|'civic'|'green'|'other'>;
    maxHeight_m: number | null;
    maxFloors: number | null;
    plotRatioFAR: number | null;          // edificabilitat / Ausnützungsziffer / bebyggelsesprocent→ratio
    maxCoverage: number | null;           // 0..1
    setbacks: { front_m: number|null; side_m: number|null; rear_m: number|null };
    fieldProvenance: Record<string, 'published-structured'|'ordinance-pdf'|'estimated'>;  // per-field (§1.6)
    ordinanceRef: string | null;          // citation of the governing legal doc (§1.3)
  }>;
}
```

**`geometricRule` — the shipped kinds (ADR-0270 / ADR-0271 / ADR-0273).** A Zod discriminated union
on `kind`, so an unhandled kind is a COMPILE error in the exhaustive solver switch rather than a
silently-skipped compliance rule. A new jurisdiction adds a VARIANT; it never migrates a shipped
pack.

| `kind` | Geometric operation | Needs a block ring? | Shipped for |
|---|---|---|---|
| `setback` | erode inward from every edge by its classified distance | no | detached / suburban fabric (the pre-ADR-0270 identity) |
| `alignment` | inset, THEN a half-plane clip at a **stated** `buildableDepth_m` | no | *alineación a vial* + *profundidad edificable* (Madrid `Fondo de la Edificación`) |
| `block-derived-alignment` | as `alignment`, but the depth is CONSTRUCTED from the block: the largest depth leaving **at least** `interiorFreeRatio` of it free, clamped to `[minDepth_m, maxDepth_m]` | **yes** | PGM Art. 242.2 — clau `13a`/`13E`, `13b` |
| `tiered-occupation` | inset, THEN split at a depth CONSTRUCTED from the block: the depth at which a band concentric with the block has an area **equal to** `bandAreaRatioOfBlock`. Produces TWO tiers (§2.4a) with different heights | **yes** | PGM Art. 350.2 — clau `22a` (authored; registration gated on the Art. 350.1/350.2 regime, see KG-6) |
| `explicit-area` | the ordinance publishes the polygon; reference it | no | **declared, no engine branch — KG-4** |

⚠ **`tiered-occupation` is NOT `block-derived-alignment` with different numbers, and the distinction
is normative.** Art. 242.2 states a **minimum** free share and two ordinance clamps; Art. 350.2.b
states an **equality** and no bounds at all. The two constructions coincide wherever Art. 242's
clamps do not bite and diverge at both of them (measured: on a 30 m block Art. 242 refuses where
Art. 350.2.b answers cleanly; on a 400 m block Art. 242 caps at 30 m where Art. 350.2.b gives
90.5 m). Supplying Art. 242's 11 m / 30 m to a 22a parcel would publish clamps under a citation to
an article that does not contain them — the L-526 defect class. **A pack MUST NOT be given bounds
its own article does not state (§1.7a, and §1.12's "never invent an input to a construction").**

> **No jurisdiction rule VALUES are asserted in this contract.** The schema defines the slots; the numeric packs (`es-barcelona`, `dk`, …) are curated data artefacts authored + versioned separately (L-399). Where a specific DK/CH/ES value is not in a source document, the pack carries a `null` + an `estimated`/`ordinance-pdf` flag, never an invented number.

### §2.3 — `EnvelopeNumbers` (shared numeric shape)

`{ maxHeight_m, maxFloors, plotRatioFAR, maxCoverage, setbacks{front_m,side_m,rear_m}, permittedUse[] }` — the numeric core shared by `ZoningRecord.structuredFields` and the rule-pack zones.

### §2.4 — `BuildableEnvelope` + `DerivationTrace`

The engine output (transient — not persisted authored data; §1.7).

| Field | Type | Notes |
|---|---|---|
| `insetPolygon` | `LatLon[]` (WGS84) | `parcel ⊖ setbacks` (Turf negative buffer, per-edge by classification) — the buildable footprint boundary |
| `maxHeight_m` | `number \| null` | height cap |
| `maxFloors` | `number \| null` | floor cap |
| `maxFAR` | `number \| null` | plot ratio |
| `maxCoverage` | `number \| null` | ground coverage 0..1 |
| `maxVolumeM3` | `number \| null` | `area(insetPolygon) × maxHeight_m` — the 3D envelope volume (SPEC-COMPLIANCE-REPORT render) |
| `permittedUse` | `string[]` | for the typology brief hand-off (§1.8) |
| `confidence` | `'authoritative' \| 'structured' \| 'block-constructed' \| 'estimated-ruleset' \| 'not-determined'` | §1.2 — mandatory. `block-constructed` is stamped by the ENGINE (L-572), never by a UI surface; `not-determined` pairs with `status: 'not-applicable'` (§1.13) |
| `derivation` | `DerivationTrace` | §1.3 — per-constraint "why" |
| `caveats` | `string[]` | e.g. "setback estimated from zone class; verify against POUM" |
| `tiers` | `EnvelopeTier[]` | §1.7b / §2.4a — the tiers of a multi-tier envelope. **EMPTY = a single prism** (every zone before ADR-0273). Non-empty ⇒ the fields above mirror `principalTier(tiers)`, enforced by a schema refinement |

### §2.4a — `EnvelopeTier` (ADR-0273, §L-590b)

One tier of a multi-tier envelope: a footprint with its OWN height cap. Tiers are **disjoint
regions that tile the buildable footprint**, not stacked slabs — a podium/tower reading is
expressible by setting an upper tier's `baseHeight_m` to the lower one's `maxHeight_m`, but no
consumer may ASSUME nesting or containment in either direction. The only guaranteed relation is
that every tier polygon lies inside the parcel.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | stable machine id within the envelope (`'block-band'`, `'block-interior'`). Deliberately NOT a closed vocabulary — the tiers a zone produces are a property of its ordinance, and enumerating them in L0 would make every new jurisdiction a schema change (§1.5) |
| `label` | `string` | what the user reads, naming the granting paragraph |
| `polygon` | `Pt[]` | this tier's footprint, scene-XZ metres (same frame as `insetPolygon`) |
| `areaM2` | `number` | `area(polygon)`, carried so every consumer agrees |
| `baseHeight_m` | `number` | height of this tier's underside above the datum; 0 = rises from the ground |
| `maxHeight_m` | `number \| null` | this tier's cap. **Nullable, and the null is a finding** (§1.7b.5) — never a licence to extrude a default |
| `maxFloors` | `number \| null` | storey cap where the ordinance states one (Art. 350.2.e ⇒ 1) |
| `ordinanceRef` | `string \| null` | the paragraph granting THIS tier — tiers of one envelope cite different articles |

```ts
DerivationEntry = {
  constraint: 'setback.front'|'setback.side'|'setback.rear'|'maxHeight'|'maxFAR'|'maxCoverage'|'permittedUse'
            |'alignment.depth'|'alignment.offset'|'alignment.sideTreatment'|'alignment.depthBinding'
            // ADR-0273 — tiered occupation. `tier.bandDepth` is NOT `alignment.depth`: that one is
            // a limit on how deep a building may go, this one is the boundary between two lawful
            // heights, and citing either under the other's name is a §1.11 category error.
            |'tier.bandAreaRatio'|'tier.bandDepth'|'tier.interiorHeight';
  value: number | string | string[] | null;
  zoneCode: string;
  source: string;                                       // rule-pack / provider id
  fieldProvenance: 'published-structured'|'ordinance-pdf'|'estimated';
  ordinanceRef: string | null;
};
DerivationTrace = DerivationEntry[];                     // one per resolved constraint (§1.3)
```

---

## §3 — Engine, providers & package boundaries

### §3.1 — `ZoningProvider` interface (L2)

```ts
// packages/site-parcel-data/src/ZoningProvider.ts  (proposed)
export interface ZoningProvider {
  readonly id: string;
  readonly label: string;                               // attribution (C57 §1.9)
  /** Fetch the zoning at a parcel (by ref or polygon). null on miss (never throws). */
  fetchZoning(parcel: { refcat: string; ring: LatLon[]; jurisdictionId: string })
    : Promise<ZoningRecord | null>;
}
```

Adapters: `DkZoningProvider` (Plandata anonymous WFS — **structured** fields, the reference case), `MucZoningProvider` (Catalonia MUC — zone class → estimated pack), `MadridPgouProvider` (ArcGIS REST — partial structured), `OerebZoningProvider` (CH ÖREB XML — zone reference → estimated / Terrara pack), `TerraraZoningProvider` (premium, normalized numeric — gated per ADR-0269). All fetch via the C57 same-origin proxy.

### §3.2 — `ZoningRulesEngine` (pure L2)

```ts
// packages/site-parcel-data/src/ZoningRulesEngine.ts  (proposed) — PURE, deterministic (§1.1/§1.9)
export function computeBuildableEnvelope(input: {
  parcelRing: LatLon[];
  edgeClassifications: ('front'|'side'|'rear'|'unclassified')[];   // C19 §2.3
  zoning: ZoningRecord;
  rulePack: JurisdictionZoningContract | null;
}): BuildableEnvelope;   // opens pryzm.zoning.computeBuildableEnvelope span (§1.10)
```

Algorithm (deterministic): resolve numbers per §1.2 (structured fields → else rule-pack zone → else `none`); compute the per-edge setback inset via Turf negative buffer keyed by `edgeClassifications`; `maxVolumeM3 = area(inset) × maxHeight`; assemble the `DerivationTrace` (§1.3); stamp `confidence`. The result is dispatched as `site.updateZoning` by the editor executor (the only impure surface, P6) in one `runBatch` for a single undo.

### §3.3 — Package boundaries

| Component | Package | Layer |
|---|---|---|
| `ZoningRecord` / `JurisdictionZoningContract` / `BuildableEnvelope` / `DerivationTrace` (pure Zod) | `packages/schemas/src/site/zoning/` | **L0** |
| `ZoningProvider` interface + adapters + `ZoningRulesEngine` (pure) | `packages/site-parcel-data/` (shared with C57) | **L2** |
| Envelope → `site.updateZoning` dispatch; envelope → generator constraint | `packages/site-runtime` + `stores` + editor executor | **L2–L3 / L5** |
| Zoning fetch proxy route(s) | `server/jurisdiction/parcelZoningProxy.js` | server (BFF) |
| Turf (negative buffer / area) | new dependency (**not currently in tree** — verified `grep '@turf'` = ∅) | — |

> **New dependency flag**: Turf.js (MIT) is the setback-inset geometry engine and is **not yet a dependency**. Adding it requires the lockfile-sync discipline (pnpm-lock updated in the same commit) per the build/deploy governance. This is a build-sequence note, not a value claim.

---

## §4 — Commands / flow

C58 adds **no** new persisted-mutation command. The envelope reaches the model via the **existing** `site.updateZoning` (C19 §4.1), dispatched by the editor executor after the pure engine returns. Sequence (following a C57 parcel select):

1. C57: `site.parcel-boundary-set` (immutable ring).
2. `ZoningProvider.fetchZoning` (proxied) → `ZoningRecord`.
3. `computeBuildableEnvelope` (pure) → `BuildableEnvelope` + `DerivationTrace`.
4. `site.updateZoning` (P6, C19 §4.1) — writes the mutable zoning fields; emits `site.zoning-updated`.
5. (authoring) the envelope's inset + `maxHeight` thread into the generator as bounds (§1.8).

Each of steps 2–3 opens a `pryzm.zoning.*` span (§1.10).

---

## §5 — UI

The envelope render + provenance UX is specified in [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md). C58 binds only:

- **§5.1 — Confidence label mandatory** (§1.4): the envelope's `confidence` chip is always shown; `estimated-ruleset` renders in the distinct "verify against ordinance" style with the `ordinanceRef` link. CI-gated. ⚠ **`block-constructed` MUST be worded "Real · constructed"** — never "verified", "certified" or "authoritative" — and MUST keep its citations and the "2008 modification not reflected" caveat (L-518, RISK-REGISTER R1). It is a real determination, not a municipal certificate, and the tier labels the rule rather than the input (§1.2). A surface MUST NOT compute this tier for itself: it arrives already stamped by the engine (L-572).
- **§5.2 — Brand colour**: the plan setback-inset polygon and the 3D max-height volume render in PRYZM purple `#6600FF` (C18 / C19 §5.5); the translucent 3D volume uses the **existing** renderer path (no new THREE owner — P2 safe).
- **§5.3 — Explain-why surfaced** (§1.3): each envelope constraint is traceable to its `DerivationEntry` in the compliance report.
- **§5.4 — The headline confidence chip resolves to the WEAKEST field; `footprintIsUpperBound` wears its own chip** (STRUCTURAL-SEAM-3). Per-field provenance is already rendered (the card badges each derivation row EST/PUB via `buildComplianceReport`), so the "confidence is scalar" concern was largely already closed. **IMPLEMENTED 2026-07-27 (STRUCTURAL-SEAM-3).** (a) **SHIPPED — the headline chip is now a pure derivation over the per-field provenance, never the scalar `env.confidence` alone.** `resolveHeadlineProvenance(report)` (`@pryzm/site-parcel-data/complianceReport.ts`, pure L2, unit-pinned) resolves the WEAKEST per-field provenance (`published-structured > ordinance-pdf > pipeline-extracted > estimated`); the card (`GISAreaLayout.ts`) badges "Estimated" whenever ANY field is estimated — EVEN when `confidence` claims `structured`/`block-constructed` — so the header can never out-rank its own rows. It also flags the L-630 **NL smoking gun** (`confidenceUnderRatesFields`): an `estimated-ruleset` scalar over ALL-published fields, reduced by the ZONE-EXTENT footprint and NOT by any field — that case now badges "Zone extent — upper bound" (amber), carries a zone-extent caveat, and its source line states the true reason; the false "Default rule pack — real DK/ES zoning coming" caption is suppressed whenever real published fields are present. The Seam-1 amber `footprintIsUpperBound` "Max extent" chip + caveat and the Seam-4 transient/absent refusal chips are preserved and take precedence. (b) `footprintIsUpperBound` carries its distinct "Max extent" chip + caveat (delivered by Seam-1, §1.14). **NOTE — the stale SPEC enum was reconciled in place:** `SPEC-COMPLIANCE-REPORT.md` now lists the full 6-member `confidence` enum (adds `pipeline-extracted-unverified`) and the 4-member `fieldProvenance` enum (adds `pipeline-extracted`), matching `EnvelopeConfidenceSchema` / `FieldProvenanceSchema` (§1.2/§1.6).

---

## §6 — Tests / CI gates

| Gate | Path | Verifies | Ratchet |
|---|---|---|---|
| `check-zoning-determinism` | unit test in `packages/site-parcel-data/__tests__/envelope-determinism.test.ts` | Same input → byte-identical `BuildableEnvelope`; no RNG / clock / AI on the path (§1.1) | On engine land |
| `check-zoning-inset` | unit test | Setback inset correct on a rectangular **and** an L-shaped parcel; per-edge classification honoured (§3.2) | On engine land |
| `check-zoning-confidence-label` | `tools/ga-gate/check-zoning-fidelity-label.ts` (mirror `check-windcfd-beta-label.ts`) | Every rendered envelope carries a `confidence` label; `estimated-ruleset` never authoritative-styled (§1.4) | On UI land — **hard** |
| `check-zoning-derivation-complete` | unit test | Every numeric constraint in an envelope has a `DerivationEntry` with `source` + `fieldProvenance` (§1.3) | On engine land |
| `check-zoning-rulepack-provenance` | unit test | Every `JurisdictionZoningContract` zone has per-field provenance + `lastReviewed` + `ordinanceRef` where non-`estimated` (§1.6) | On first pack |
| `check-zoning-engine-purity` | `tools/ga-gate/check-zoning-purity.ts` | `ZoningRulesEngine` imports no THREE / DOM / I-O / RNG (§1.9, P5-adjacent) | On engine land |
| `check-zoning-otel-spans` | `tools/ga-gate/check-zoning-spans.ts` | Every exported engine/provider fn opens `pryzm.zoning.<verb>` (§1.10) | On engine land |
| `check-envelope-constrains-gen` | integration test | A generated footprint ⊂ `insetPolygon` and height ≤ `maxHeight` (§1.8) | After the bridge lands |
| `check-envelope-solid-never-overstates` | unit test over EVERY registered pack + `tools/ga-gate/` | `Σ volume(envelopeToMassing(env)) ≤ maxVolumeM3` (or tier-summed cap); `footprintIsUpperBound ⇒ study style`; `tiers>1 ⇒ solids>1` (§1.14) | On `envelopeToMassing` land — **hard** |

### §6.1 — Integration test (the end-to-end wedge)

`tests/integration/zoning-envelope.spec.ts` (proposed): a Copenhagen parcel (DK, structured) → `DkZoningProvider` → `computeBuildableEnvelope` → assert `confidence === 'structured'`, inset matches expected on the parcel, `maxVolumeM3 = area × maxHeight`, every constraint has a derivation entry → thread into the generator → assert the generated footprint fits inside the inset. This is the "credible competitive wedge" acceptance (ADR-0269 §credible-path).

---

## §7 — NFT targets

Per [C10](./C10-PERFORMANCE-AND-OBSERVABILITY.md).

- **§7.1 — Envelope solve < 100 ms.** `computeBuildableEnvelope` (pure, in-memory) for a ≤ 50-vertex parcel MUST complete < 100 ms on reference hardware (it is geometry + arithmetic, no I/O). Span `pryzm.zoning.computeBuildableEnvelope`.
- **§7.2 — Zoning fetch < 2 s (p95).** `ZoningProvider.fetchZoning` (proxy cache-cold) < 2 s; cache-hit < 200 ms (zoning ~24 h TTL, per scoping §6.4).
- **§7.3 — Envelope render is P2-safe.** The 3D max-height volume is one translucent extrusion via the existing renderer path — no new THREE import site, no new shader (per scoping §12; C04).

---

## §8 — Migration / build sequence

Per [ADR-0269](../adrs/ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) (L-398 → L-404), Denmark-first:

1. **L-398 (B0/B1)** — L0 schemas (`ZoningRecord`, `BuildableEnvelope`, `JurisdictionZoningContract`, `DerivationTrace`) + add Turf (lockfile-synced) + the pure `ZoningRulesEngine`.
2. **L-399 (B1)** — `DkZoningProvider` (Plandata structured) — the reference build on the cleanest data; then the curated `es-barcelona` / `dk` rule packs.
3. **L-401 (B2)** — the envelope → authoring bridge (inset + maxHeight into the generators; permitted-use → typology brief).
4. **L-402 (B3)** — the compliance report + 3D volume render + the L-373 CI fidelity-label gate.
5. **L-399 (B4)** — `MucZoningProvider` + `es-barcelona` pack (Spain breadth — adapter + pack only, no engine change).
6. **Ratify** — DRAFT → CANONICAL once the engine + §6 gates are green and the DK end-to-end wedge (§6.1) passes.

**Launch sequencing (honest risk)**: this track is **additive** and runs behind a flag; it MUST NOT ship as "launch" until the P0 launch blockers (L-334 data-integrity, L-391 collab) are closed — a compliance demo atop silent element-loss + last-write-wins collab is not launchable (gap audit §5.2 / §5.5). C58 is a Q4/Q1 competitive-wedge deliverable, not a September launch gate.

---

## §9 — What is NOT in this contract

| Concern | Owner |
|---|---|
| Fetching the parcel geometry + cadastral attributes | [C57 Parcel Data Layer](./C57-PARCEL-DATA-LAYER.md) |
| The persisted `Parcel.{setbacks,maxFAR,maxHeight,zoning}` schema + `site.updateZoning` command | [C19 Site Model & Parcel §2.3/§4.1](./C19-SITE-MODEL-AND-PARCEL.md) — C58 populates, does not redefine |
| The user-facing "explain-why" report + 3D envelope render spec | [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md) |
| The generative engines the envelope constrains (topology, solvers, scoring) | [C50 Typology Pipeline](./C50-TYPOLOGY-PIPELINE.md) + [C53 Generative Layout Engine](./C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) — C58 supplies bounds, never a parallel knob (§1.8) |
| Coordinate transforms / reprojection | [C12 Geospatial](./C12-GEOSPATIAL.md) |
| Actual numeric zoning VALUES for any jurisdiction | curated rule-pack data artefacts (L-399) — **not asserted in this contract** (§2.2) |
| Commercial buy-vs-build (Terrara) + rule-pack curation economics | [ADR-0269](../adrs/ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) + [C39 Pricing](./C39-PRICING-AND-PLAN-TIERS.md) |
| Post-edit compliance re-check ("is this edited design still compliant?") | §10.4 — a proposed future seam over the C52 edit substrate |
| Building-code (fire / egress / accessibility) compliance beyond the zoning envelope | out of scope — a future contract; C58 is zoning-envelope only |
| **Room-level HABITABILITY minima** (minimum habitable floor area / clear width per room type) | **[ADR-0352](../adrs/ADR-0352-habitability-minima-are-jurisdiction-keyed-and-carry-their-instrument.md) + [SPEC-HABITABILITY-MINIMA](../../03-execution/specs/SPEC-HABITABILITY-MINIMA.md)** (added 2026-08-22, lane JURIS11). A SECOND legal corpus, INSIDE the envelope, answering *"is this room lawful to live in?"* rather than *"what may be built on this land?"*. It **reuses C58's `resolveRegisteredJurisdictionAt` and its `jurisdictionId` vocabulary verbatim** — no second resolver, and the string coupling is CI-gated — and it applies C58 §1.4's discipline unchanged: cite the instrument or refuse, and never present a default as authoritative. ⚠ **It is NOT a rule pack and must not become one**: the sources are habitability decrees and PGOU habitability articles, not zoning ordinances, and the audit measured that **envelope maturity does not carry over** — Denmark is C58's most complete national jurisdiction and holds ZERO habitability data. |

---

## §10 — Open design questions (pending decision)

### §10.1 — pending: rule-pack storage + distribution
A `JurisdictionZoningContract` is curated data. Whether packs ship in-repo (`packages/site-parcel-data/rulepacks/`), as a versioned data package, or a served registry (updatable without a deploy) is undecided. Recommendation: in-repo static (like `rules/programRules.ts`) for the pilot; served registry when curation scales. Pending L-399.

### §10.2 — pending: permitted-use → typology-brief hand-off
§1.8 wants zoning `permittedUse` to seed the C50 typology `briefSchema`. The exact mapping (zone use-class → typology + program weights) is a new seam. Recommendation: a thin deterministic mapper, no AI. Pending C50 / L-401.

### §10.3 — pending: edge-classification dependency
The setback inset needs C19 §2.3 `edgeClassifications` (front/side/rear per edge), whose authoring is itself C19 §10.1-pending. Until edge classification exists, the engine must either apply a uniform setback (loss of fidelity) or block. Recommendation: uniform-setback fallback flagged in `caveats` until C19 §10.1 resolves. Coupled to C19 §10.1.

### §10.4 — pending: compliance re-check after edits
Archistar-grade tools re-validate an edited design against the rules (gap audit G-ENG-5). Whether C58 owns a `checkCompliance(model, envelope)` re-validator (over the C52 edit substrate) or that is a separate contract is open. Recommendation: defer to a Phase-2 seam; C58 v1 is envelope-generation only. Pending.

### §10.5 — pending: FAR/coverage as hard vs soft generation bounds
§1.8 threads inset + maxHeight as bounds; whether FAR and coverage are *hard* generation constraints (reject non-conforming) or *soft* (score + warn) — given generators optimise topology first (C53) — is undecided. Recommendation: inset + height hard; FAR/coverage soft-lint (mirrors C19 §1.6's soft-at-edit / hard-at-export split). Pending C53 integration.

---

## §11 — Cross-references

- [C00 Index](./README.md) — register the C58 row.
- [C03 Schemas, Commands & State](./C03-SCHEMAS-COMMANDS-AND-STATE.md) — L0 schemas + `site.updateZoning` follows C03 patterns.
- [C19 Site Model & Parcel](./C19-SITE-MODEL-AND-PARCEL.md) — §1.4 immutable parcel; §1.6 footprint-in-parcel-minus-setbacks (the envelope makes those numbers real); §2.3 zoning fields; §4.1 `site.updateZoning`; **fills the C19 §9/§10.2 deferred registry** (C19 §10.2 should reference C58 on ratify).
- [C57 Parcel Data Layer](./C57-PARCEL-DATA-LAYER.md) — supplies the parcel; shares `packages/site-parcel-data`.
- [C50 Typology Pipeline](./C50-TYPOLOGY-PIPELINE.md) + [C53 Generative Layout Engine](./C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) — consume the envelope as bounds; slider-as-intent preserved (§1.8).
- [C52 Editable Building Graph](./C52-EDITABLE-BUILDING-GRAPH.md) — the substrate a future compliance re-check (§10.4) would run over.
- [C12 Geospatial](./C12-GEOSPATIAL.md) · [C10 Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md) · [C23 Provenance & AI Audit](./C23-PROVENANCE-AND-AI-AUDIT.md).
- [C18 Element Preview Visual](./C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) — `#6600FF` envelope render.
- [C55 Geodata Analytical Layers](./C55-GEODATA-ANALYTICAL-LAYERS.md) — sibling pluggable-provider-over-site precedent (ADR-0065).
- [ADR-0269](../adrs/ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) · [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md).

External (non-contract): ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md (audit removed 2026-08-09 — recoverable from git history) (G-ENG/G-BRG), [PARCEL-ZONING-FEATURE-SCOPING.md](../../04-reference/geospatial/PARCEL-ZONING-FEATURE-SCOPING.md) §4/§6/§7, [DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md](../../04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md) §2.3.

---

## §12 — Contract history

| Date | Change |
|---|---|
| 2026-08-19 | **§1.17 added — the envelope has TWO representations and §1.15's one-axis gate deleted one of them (lane ENV2, L-1188).** Founder, deployed build, Barcelona 424 m² parcel: *"When the envelope is OFF we should see this shade on the GROUND."* His log measures it: OFF ⇒ `envelope entities added=0, total massing entities=2` — the two being the PARCEL fill + dashed ring (424 m²), not the BUILDABLE area (272 m²). **A regression from §1.15, correct in kind and over-suppressing in degree:** the one-axis gate suppressed the whole solid, and the whole solid was the only ground answer. §1.17 splits the question into a VOLUME axis (*"what mass may I build?"* — obstructive, turned off to see one's design) and a FOOTPRINT axis (*"what area may I build on?"* — flat, occludes nothing, useful precisely when the volume is off), on **ONE authority** (⛔ never a second — that is the shape §1.15 removed) with **ONE pure L2 rule** (`applyEnvelopeVisibilityAxes`) both rasterisers read. ⭐ The shade is a **PROJECTION of solids that already exist**, never a new derivation, so a refused / §1.16 zero-inset envelope produces no solids and therefore no shade: **hiding something can never mint a claim** (§L-616). It carries `claimsVolume: false`, the source solid's hue, and the near-wireframe weight when the footprint is upper-bound. Also removes `resolveFormaEnvelope`'s caller-side gate, which §1.15.2 already forbade and which made the shade UNSATISFIABLE. ⚠ Not browser-verified; and what the grey plane in his OFF screenshot WAS is answered only negatively (`added=0` ⇒ not the envelope). |
| 2026-08-19 | **§1.15 + §1.16 added — the envelope's VISIBILITY had four authorities, and its 0/0/0 re-inset was an overstatement (lane ENV1, L-1170/L-1171).** Founder on the deployed build: *"I selected the Level 15 top level for roof creation and an ENVELOPE showed up — I tried to hide it but it did not work."* §1.14 makes the drawn solid's SHAPE a pure function of the envelope and says nothing about **whether it is drawn**; that question had FOUR answers (a `let` inside `mountGISArea`'s closure; the `formaLastMassingInput.envelope` SNAPSHOT replayed by the floor selector and three other routes; the §SITE-OVERLAY-NOT-BUILDING survival set; and `ParcelBoundarySceneRenderer`, which consulted no toggle at all) — C84 EI-1/EI-9. **§1.15** mandates ONE authority (`ui/site/envelopeVisibility.ts`) with the gate **at the rasteriser, not at the callers**, because a replayed payload is by construction a caller nobody re-asked; the control may only WRITE; the choice must survive a re-render, a level switch and a page reload; default ON per §1.4. **§1.16** refuses the all-zero re-inset — §1.7a's numbers-only guard is satisfiable by a default, and `insetPolygonPerEdge` at 0/0/0 is the identity, so the drawn "envelope" was the parcel boundary wearing a claim that you may build to the lot edge (§L-616 overstatement). Narrow by design: a PARTIAL zero still re-insets, and a zero-setback jurisdiction that persisted its ring is untouched. Binding artefacts: `apps/editor/__tests__/envelopeOneVisibility.test.ts` (part STRUCTURAL — a behavioural test of a visibility flag is the defect this repo repeats) and three new cases in `buildableEnvelopeRehydrate.test.ts`. ⚠ Neither section is browser-VERIFIED, and **why a Barcelona parcel holds `0/0/0` rather than `null` is unanswered** — §1.16 closes the render, not the data defect. |
| 2026-07-29 | **Phase 1 (generic-engine leverage) implemented — §10.3 per-edge honesty caveat + §1.11 provider-stamped granularity.** The per-edge front/side/rear setback GEOMETRY was already wired (`insetPolygonPerEdge`/`setbackForClass` key each edge to its own value); the real gap was HONESTY — the uniform-fallback caveat (§10.3) fired only when ALL edges were unclassified, so a uniform value silently substituting on SOME edges went unflagged. Now the caveat fires whenever the fallback is actually applied (gate `allUnclassified`→`anyUnclassified`, `ZoningRulesEngine.ts:266`). §1.11 granularity: the engine now reads `ZoningRecord.granularity ?? 'parcel'` (`:902`) instead of hard-coding `'parcel'`; a coarse provider (Madrid VEDA *ámbito*, Valencia sector) stamps its own granularity, which the engine passes through to `BuildableEnvelope.granularity`. `ZoningRecord` gains an optional `granularity` field (byte-identical serialisation when absent). Barcelona NOT regressed (its setbacks are null → caveat never fires; no granularity stamp → 'parcel'); full `@pryzm/site-parcel-data` suite 948/948, both typechecks clean. |
| 2026-07-29 | **The envelope PIPELINE is now a ratified per-city REPLICATION STANDARD (ADR-0279).** Barcelona's proven flow is documented end-to-end (stages P0–P11) in the new canonical [`ENVELOPE-REPLICATION-STANDARD.md`](../../04-reference/standards/ENVELOPE-REPLICATION-STANDARD.md) — the envelope sibling of the terrain `CITY-REPLICATION-STANDARD.md`. Ratifies: the generic spine (`computeBuildableEnvelope` + the `GeometricRule` union + the two registries) is invariant; onboarding a city is a data addition at FIVE slots (parcel provider, router predicate, zone source, curated rule pack, registration) + one dispatcher branch, the rule pack being the entire human-gated legal cost; building heights are NOT an envelope prerequisite (ordinance-derived height vs context-scene measured height — the `clau 12b` crossover stays HELD); the three-axis honesty model is non-negotiable. **Records the highest-priority tracked debt: the merge-blocking CI fidelity-label gate mandated by §6 + ADR-0269 does NOT exist** (`tools/ga-gate/check-zoning-fidelity-label.ts` absent) — the "estimate never rendered as authoritative" guarantee rides on convention, not CI. No runtime change; documentation + sign-off gate before new-jurisdiction implementation. |
| 2026-07-27 | **§5.4 headline-chip rule SHIPPED (STRUCTURAL-SEAM-3, L-630).** The headline confidence chip is no longer the scalar `env.confidence`: `resolveHeadlineProvenance` (`@pryzm/site-parcel-data`, pure L2, unit-pinned) resolves the WEAKEST per-field provenance, and `GISAreaLayout.ts` badges "Estimated" whenever ANY field is estimated — so the header can never out-rank its own rows. The L-630 NL case (`estimated-ruleset` scalar over all-published fields, reduced by the zone-extent footprint) now badges "Zone extent — upper bound", carries a zone-extent caveat, and states the true reason; the false "Default rule pack — real DK/ES zoning coming" caption is suppressed whenever real published fields are present. Seam-1's amber `footprintIsUpperBound` "Max extent" chip/caveat and Seam-4's transient/absent refusal chips are preserved and take precedence. Reconciled the stale `SPEC-COMPLIANCE-REPORT.md` enums in place (6-member `confidence` + 4-member `fieldProvenance`, matching the schema). Grounds `SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md` Part 3 §3.3. |
| 2026-07-17 | Initial DRAFT — fills the C58 reserved slot (the core compliance value-prop; gap audit G-ENG-1). Fills the C19 §9/§10.2 deferred jurisdiction-registry. Grounds on the two-fidelity scoping + the Denmark structured-zoning reference. Author: compliance-authoring governance track. |
| 2026-07-21 | Corrected the stale "0 % built" stamp (the engine, solvers, registry and one real pack ship; status stays DRAFT). Amended **§1.2** with `not-determined` + the still-open constructed tier (L-518). Added **§1.12** (construction-not-lookup + the measured provenance ladder, L-525a/L-537) and **§1.13** (refusal vocabulary + rule-pack registry, L-550). Updated **KG-1**; added **KG-3** (FAR/coverage never applied, L-551), **KG-4** (`explicit-area` unsolved, L-538), **KG-5** (24.0 % measured coverage, L-538). Recorded the **L-529 violation** of "the floor is not a fallback", including the refutation of the previously-confirmed half-illa root cause. |
| 2026-07-22 | **THE ENVELOPE IS NO LONGER A SINGLE PRISM (ADR-0273, §L-590b).** Added **§1.7b** (multi-tier envelopes; the principal-tier rule and why it is the only non-over-stating summary; a tier's height may refuse while its region is determined; coverage binds a tiered volume) and **§2.4a** (`EnvelopeTier`). Added the `tiers` field to the §2.4 table and the three `tier.*` literals to `DerivationEntry`. Documented the **shipped `geometricRule` kinds as a table in §2.2**, including the new `tiered-occupation` — a contract that silently omitted a shipped rule kind is the drift C14 exists to prevent — with the normative statement that `tiered-occupation` is NOT `block-derived-alignment` with different numbers (equality vs minimum; no ordinance bounds vs two), and that a pack MUST NOT be given bounds its own article does not state. **Partially closed KG-3** (coverage now binds the study volume, on tiered envelopes only, with the reason the retro-fit was NOT taken in the same change). Added **KG-6**: clau `22a` is solved and still unregistered, and the remaining blocker is the Art. 350.1/350.2 *Pla Parcial* regime — a legal fact PRYZM does not hold, which gates the FOOTPRINT and not only the height. |
| 2026-07-22 | **A REFUSAL MAY NOW STATE THE LIMITS THAT SURVIVE ITS OWN UNCERTAINTY (ADR-0276, §L-590c, founder-ruled).** Added **§1.13.7** — narrow, conditional permission for a refusal to publish, in prose under a narrowed citation and with **every numeric field still null (§1.13.3 unrelaxed)**, the limits the ordinance states in *every branch* of what the refusal is uncertain about; with the rule that a limit whose CONDITION cannot be stated alongside it must not be published at all, and that `knownFacts` is the wrong vehicle. Added the fourth `EnvelopeRefusalCode`, **`regime-undetermined`** (the ordinance states two regimes and no public source says which governs this parcel), argued against each of `no-rule-pack` / `source-data-unavailable` / `derived-plan`. **Updated KG-6**: clau `22a` now ships the regime-neutral half of PGM Art. 350 — and **CORRECTED this contract's own earlier claim** that the FAR *and* the occupation were regime-neutral: the FAR is (all three paragraphs state it), the occupation is only conditionally so (Art. 350.1.2n caps *aïllada* sectors at 70 %). Recorded the founder ruling ("C now, B in parallel, hold A"; **option A on hold**) and the Track-B finding that Barcelona's municipal WMS *does* answer the regime question — and that on Zona Franca 22a it answers "Pla Parcial, 18,30 / 24,40 m", i.e. option A would have under-stated by ~⅓. |
| 2026-07-26 | **§1.13.8 added — a transient fetch failure ≠ a genuine data-absence (STRUCTURAL-SEAM-4).** The refusal code set has one transient code and no genuine-absence data code, so a `no-plan`/`no-bouwvlak` empty becomes the "usually clears on retry" card; and `siteDispatch.ts:1839/1440` flattens the resolver's distinct reasons into that one code. Fix: a genuine-absence code, carry the resolver status through, one bounded auto-retry, on the shared `FetchOutcome` union (C57 §1.5 sibling amendment). Grounds `SITE-FEASIBILITY-…` Part 3 §3.4. |
| 2026-07-26 | **§1.14 added — the massing render is a PURE TOTAL FUNCTION of the whole envelope (STRUCTURAL-SEAM-1, L-616 family).** The render narrows the envelope to `{ring, maxHeightM, farLimitedHeightM, confidence}` (`GISAreaLayout.resolveFormaEnvelope` → `CesiumViewport.renderFormaMassing:3817–3836`) and re-derives a single prism, discarding `maxVolumeM3`/`tiers[]`/`maxCoverage`/`footprintIsUpperBound` — so the §1.4/§1.7b guarantees the engine keeps are broken at the picture. Fix: one pure L2 `envelopeToMassing(env): MassingSolid[]`, the render rasterises it, and a `check-envelope-solid-never-overstates` CI test binds every pack at once (§6). Added **§5.4** (Seam-3 residual — headline chip = weakest field; `footprintIsUpperBound` chip; the stale 3-member SPEC enum). Grounds `SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md` Part 3 + `jurisdictions/ENVELOPE-REALISM-MATRIX.md`. |
| 2026-07-21 | **CLOSED the constructed-tier gap the row above left open (L-518 + L-572).** `'block-constructed'` is now documented as a full member of `EnvelopeConfidence` in **§1.2**, the **§4 field table** and **§5.1**; the three places that still listed a 3-member enum are corrected. Added the NORMATIVE assignment rule — the tier is stamped by `ZoningRulesEngine` keyed on the `alignment.depthBinding` derivation row, never re-derived by a UI surface, because assigning it in L5 made the honesty label a property of one UI path and would have badged a per-parcel report ESTIMATED on constructed data. Added the ordering constraint (upgrade BEFORE the estimated caveat — the two contradicted each other in shipped code, proven by a pre-fix-red test) and the honest limit that the tier labels the RULE, not the INPUT (a pure engine cannot verify its `blockRing` is real cadastral geometry; §1.6 provenance rides with the caller). |


---

## Known gaps / violations (added 2026-07-20)

### KG-1 (L-443) — the rule model cannot express alignment-governed zones

**§2.2 `JurisdictionZoningContract.zones[]` admits only
`setbacks: { front_m, side_m, rear_m }`, and §2.4 derives the envelope as
`insetPolygon = parcel ⊖ setbacks`. A large class of real Spanish ordinances is not
expressible in that shape.**

Verified live (L-438): Madrid publishes `Fondo de la Edificación` as a **POLYLINE** with no
attributes, plus `Alineaciones` — buildable depth as *a line you build up to*, not a setback
number. *Alineación a vial*, *profundidad edificable* and *altura reguladora por ancho de
calle* are standard in Spanish *ensanche* fabric.

**Consequence if unaddressed:** any adapter for such a zone must either omit it (silent
coverage gap) or coerce it into a front-setback (**a confidently wrong envelope on exactly
the dense urban fabric the product targets**). §1.4's confidence labelling does NOT mitigate
this — the output is not uncertain, it is derived from the wrong rule.

**Status (updated 2026-07-21): PARTIALLY CLOSED.** `packages/schemas/src/site/GeometricRule.ts` is
now a discriminated union of four kinds — `setback` (ADR-0270), `alignment` (ADR-0270),
`block-derived-alignment` (ADR-0271) and `explicit-area` — solved exhaustively in
`ZoningRulesEngine.ts`. The alignment family KG-1 named is expressible and shipped for Barcelona
`13a`. **What is still open is bigger than what closed**, and is measured rather than estimated —
see KG-3 and KG-4 below. Tracked as **L-443**, **L-551**, **L-538**.

### KG-2 (L-441/L-439) — granularity is modelled (§1.11) but not yet implemented
`granularity` is normative in §1.11 as of 2026-07-20 but is not yet present in the schema,
engine or UI. Until it is, nothing prevents a sector-level figure being rendered as a parcel
envelope. Tracked as **L-439**.

### KG-3 (L-551) — `plotRatioFAR` and `maxCoverage` are RESOLVED and DISPLAYED, and never applied to any geometry

`ZoningRulesEngine.ts` resolves both, emits derivation rows for both and returns both on the
`BuildableEnvelope`. **Neither ever shapes a polygon.** `maxCoverage` is displayed and nothing
else; `maxFAR` binds only downstream in `storeyCap.ts`, and only when a generator asks. So a zone
whose ordinance states intensity as *"90 % occupation, 2 m² sostre per m² sòl"* has **no way to
shape an envelope at all** and falls to the generic estimated pack — an invented setback triple on
land the ordinance never described with setbacks.

**Measured consequence (L-538 probe, 2,907 grid points over INE 08019, 275 on private buildable
land): 31.3 % of Barcelona's private buildable land** (`22a` + `22@` 18.2 %, the `20a` family
13.1 %) is blocked on this one missing capability — larger than the entire currently shipped
coverage. **Decision taken: ADR-0272 (ACCEPTED), implementation deferred to Phase 2** of
`BARCELONA-COMPLETE-COVERAGE-PLAN.md`. Until it lands, this contract's §1.8 generation-bridge
claim is only true for the geometric kinds.

⚠ ADR-0272 records a migration obligation that belongs here too: a `coverage-and-far` envelope's
`insetAreaM2` is **not** the buildable footprint, so every consumer that computes
`insetAreaM2 × maxHeight` for a study volume (the facts card does) will over-state it unless it
applies `maxCoverage`.

**PARTIALLY CLOSED 2026-07-22 (ADR-0273, §L-590b), and the remainder is stated precisely so the
gap does not read as smaller than it is.** `maxCoverage` now binds the study VOLUME — but **only
on a `tiered-occupation` envelope** (§1.7b.6), where leaving it out would have published a
100 %-of-parcel footprint beside the same article's 90 % cap on any parcel shallower than the tier
boundary. It is deliberately NOT retro-fitted to every coverage-carrying zone in the same change:
doing so silently moves the published volume of every shipped envelope, which is a product decision
owed its own before/after measurement, not a side-effect of adding a rule kind. **`maxCoverage`
still shapes no polygon anywhere, and that stays correct per ADR-0272 §3.2** — a coverage limit
constrains how much ground is occupied, never where.

### KG-6 (§L-590b) — clau `22a` is SOLVED and still UNREGISTERED, and the reason is now a legal fact rather than a modelling gap

ADR-0273 closed the modelling half: `tiered-occupation` + `EnvelopeTier` express Art. 350.2's
two-tier solid, and `esBarcelonaIndustrial.ts`'s rule is solved end to end against a real block.

**What blocks registration is that Arts. 350.2.a–f govern only industrial land *mancada de Pla
Parcial*.** Land with a definitively-approved *Pla Parcial* falls under Art. 350.1, where the PGM
imposes only the FAR and occupation ceilings and everything else comes from that plan. Neither the
Catastro parcel nor the MUC says which regime a parcel is in.

⚠ **This gates the FOOTPRINT, not only the height** — the point most likely to be missed, because
`resolveAlcadaIndustrial`'s three-valued refusal makes it look like a height-only problem. The FAR
(2 m²st/m²s) and the occupation (90 %) are restated verbatim by Art. 350.1.1r and are therefore
regime-neutral; **Art. 350.2.b's band is not.** Registering today would apply that band, cited to
Art. 350.2.b, to parcels Art. 350.1 may govern. The error would be conservative — a band only ever
restricts — and *conservative is not the test*: a confident mis-citation is precisely the harm
§1.3/§1.4 and L-526 exist to prevent, and an under-stated envelope on 17.5 % of the city is a real
cost, not a safe one.

**Unblocking is a data or legal step:** (i) a Pla-Parcial coverage layer for Barcelona's industrial
land, or (ii) a founder ruling that 22a inside the municipality is `'none'` by default. Both are
determinations about the law and are not made silently by an implementer (§1.6).

---

#### §L-590c update (2026-07-22) — the REGIME-NEUTRAL half now ships; the gap is HALF the size and precisely bounded

**Founder ruling, 2026-07-22: "C now, B in parallel, hold A."** Verbatim: *"C converts our largest
owned gap into an honest answer this week and cannot be wrong. B is the real fix and we don't yet
know its price. A is the only one that buys the 15 points, and it buys them by asserting a legal
fact we haven't verified — on the one axis (height) where we haven't established the error
direction."*

⚠ **Option A — defaulting the regime to `'none'` inside the municipality — is ON HOLD and must not
be implemented.** `resolveAlcadaIndustrial` keeps refusing on `unknown`; no permissive default may
be added anywhere.

**What ships (Track C).** Clau `22a` no longer returns the generic coverage gap — that card said
*"PRYZM has not encoded this zone's rules yet"*, which has been false since the pack was authored.
It now returns a **`regime-undetermined`** refusal (ADR-0276, the fourth refusal kind) carrying:

| | |
|---|---|
| FAR **2 m² sostre/m² sòl** | **UNCONDITIONAL.** Arts. 350.1.1r, 350.1.2n **and** 350.2.a all state it — it survives the regime question *and* the ordering-type question. |
| Occupation **90 %** | **CONDITIONAL**, and the condition ships with the number: it holds on sectors ordered *segons alineacions de vial*; Art. 350.1.**2n** caps *edificació aïllada* sectors at **70 %**. |
| Height (Art. 350.2.c) · band (Art. 350.2.b) | **Still refused**, and the citation explicitly disclaims those paragraphs. |

⚠ **A CORRECTION TO THIS GAP'S OWN EARLIER TEXT.** The paragraph above (and ADR-0273 §6) said the
FAR *and the occupation* were "restated verbatim by Art. 350.1.1r and therefore regime-neutral".
Re-reading p. 116 glyph-by-glyph on 2026-07-22 shows that is true of the FAR and **only
conditionally** true of the occupation: Art. 349.1 makes *alineacions de vial* the ordering type
only *"si no n'hi ha"* a Pla Parcial, and Art. 349.2 lets a PERI or Estudi de Detall convert sectors
to *aïllada*. So the regime question gates a **second** number, and a bare 90 % would over-state by
20 pp — the direction §1.4 forbids outright.

**The route is a REFUSAL, not a registration, and that is the safety property.** Registering the
pack would send `22a` through `computeBuildableEnvelope` with the `tiered-occupation` rule, cutting
an Art. 350.2.b band and publishing an Art. 350.2.e 5 m principal tier — both regime-gated. Going
through `refusalFor` keeps every numeric field null and every polygon empty (§1.13.3), so the two
facts reach the user as cited prose and nothing reaches the massing, the generator bounds or
`site.updateZoning`. Guarded by a named test in `esBarcelonaIndustrialPack.test.ts`.

**Track B (2026-07-22) — a source that answers the regime question DOES exist, and was not wired.**
Barcelona's own municipal planning WMS (`https://w133.bcn.cat/WMSURBANISME/service.svc/get`,
CC-BY-4.0, keyless, HTTPS, point-queryable) returns, at a clau-22a point in the Zona Franca, the
qualification polygon's `CODI_PLA` **and** the matching *àmbit de planejament* with
`TEMATICA: PP` (Pla Parcial), `DATA_AD: 16/02/1968` (definitive approval date) and
`NOM_PLA: "PP de ordenación del Polígono industrial del Consorcio Zona Franca"` — i.e. the
instrument TYPE and its DEFINITIVE APPROVAL, joined to the parcel by the qualification's own plan
code, with `REF_CADASTRAL` available from the same service. ⚠ It also publishes that plan's own
heights (**18,30 m / 24,40 m**), against Art. 350.2.c's 9 / 13 / 17 m — **so option A would have
under-stated that land by roughly a third.** The Catalan MUC, by contrast, publishes **no**
Pla-Parcial layer for Barcelona (`MUCPD_SECTOR`/`MUCPD_QUAL`: 0 features for INE 08019;
`MUCVW_MUCS_SECT`: 81, all PMU). Wiring the municipal source changes the answer to a decision that
is currently on hold and is therefore a founder re-decision, not an implementer's — see
ISSUE-LOG **L-605**.

### KG-4 (L-538) — `explicit-area` has a schema, no engine branch and no resolver

The fourth union member is declared and never solved. It is the kind that a *derived-plan*
ordinance needs — PGM Art. 306 (`18`, *volumetria específica*) states that buildability is *"that
resulting from the established volumetric ordering"*, i.e. **the ordinance points at a different
approved document per site**. Measured: `18` is **22.5 % of Barcelona's private buildable land**,
the second-largest family, and inventing a generic parameterisation for it would fabricate a
number for a fifth of the city.

**The honest near-term output is the §1.13 cited refusal, and it is shipped.** Whether
`explicit-area` ever gets an engine branch depends on a data-acquisition question that is
unresolved: does RPUC/NUMAMB expose per-site approved volumetries as data? Tracked as
BARCELONA-COMPLETE-COVERAGE-PLAN Phase 5. **This is the single most important expectation-setting
fact in the subsystem: "complete Barcelona" cannot mean "every parcel gets a constructed
envelope."**

### KG-5 (L-538) — measured coverage, so the gap is a number rather than an impression

`13a` + `13E` were the only registered packs until 2026-07-21. Probe (`fetchQualificationAtPoint`
from `server/mucZoningProxy.js`, the production function, so it cannot disagree with the live code
path): **1,014 resolutions, 44 distinct claus, 275 points on private buildable land** ⇒ **today's
engine constructs an envelope for 24.0 %** of Barcelona's private buildable land. **`13E` was
returned ZERO times in 1,014 resolutions.**

Two corollaries this contract should not lose:
- The ranking is **not** what intuition says. `18` (22.5 %) is the second-largest family and is the
  one this architecture can least express (KG-4).
- The probe measures **land area**, not parcel count. `13a`/`12` are dense small-parcel fabric and
  are under-counted per parcel; `18`/`22a`/`20a` sit on large parcels and are over-counted. A
  parcel-weighted probe has not been run.

---

## Known Violations / Pending Amendments

> Recorded per the logging protocol Step 4.3, so this contract does not silently keep
> claiming a mapping that cannot hold.

### §1.11/§5 — PENDING AMENDMENT: §1.11 is silent on CATEGORICAL attributes, and §5 mandates no LAND-CLASS row (L-663)

**This is a PENDING AMENDMENT, not a violation** — the code does not contradict §1.11 or §5; the
contract simply does not reach the case. Recorded so the silence is visible rather than assumed-settled.

**1. Does §1.11 govern categorical attributes?** §1.11 is written about *numbers* — *"An envelope whose
**numbers** derive from a granularity coarser than `parcel` MUST NOT be presented as a parcel envelope"* —
and both worked examples (Madrid VEDA `Ambito`, Valencia `InventarioSuSuz` sector) are aggregate
quantities. **Land class is not a quantity.** It is a categorical attribute **inherited by containment**:
a parcel lying wholly inside a *No Urbanizable* polygon genuinely **is** *No Urbanizable* — presenting it
as such is not the "fact about the wrong thing" error §1.11 exists to stop. But the sources answer coarse
(`server/siuClassificationProxy.js` at `municipality-polygon`; Murcia `pgou_sectores` at **sector**), and
a parcel **straddling** a class boundary is genuinely ambiguous. **§1.11 clause 2's "MUST say so in the
same sentence" therefore has no defined application here**, and today's shipping line —
`` `Clase de suelo: ${clase_suelo}` `` pushed into `EnvelopeRefusal.knownFacts`
(`murciaZoningProvider.ts:202-207`) — carries no granularity qualifier at all.
⇒ **Amendment needed:** state whether §1.11 binds categorical attributes, and if so require a
straddle flag rather than a silent pick-one-side.

**2. §5 (UI) mandates no land-class row.** §5 binds the confidence chip, `#6600FF`, explain-why and
headline provenance. It does **not** require the parcel's *clasificación* to be shown — so the fact that
decides **whether an envelope can exist at all** is displayed in exactly one card state, on one city:
`knownFacts` is read at a single site in the whole client (`GISAreaLayout.ts:2441-2448`), inside the
refusal branch, which returns at 2493. The success and reduced cards render no class.
⚠ On the founder's live Murcia measurement (3 611 in-force features), **67.2 %** of the municipality is
*No Urbanizable* + *Sistemas Generales* — land where a refusal is the **only correct answer** — and the
user cannot distinguish *"the law forbids building here"* from *"PRYZM failed"*. That is the
§CONTEXT-DATA-HONESTY family (L-422/457/467/469), in the **under**-statement direction.

**3. ⚠ `answerabilityClass.ts` MUST NOT be used as the land-class display.** It answers a different
question (*what PRYZM can say*), and its `systems-land` bucket deliberately fuses `public-system`
(*Sistemas Generales*) with `protected-soil` (*No Urbanizable*) — two distinct legal classes, 22.8 % and
44.4 % of Murcia respectively. That fusion is correct **for answerability** and is a category collapse
**for land class**. The two axes intersect (`sistemas_generales` is both a class and a refusal code) and
must occupy different visual channels.

Tracked: audit **L-663**; coverage gap logged in `MISSING-CONTRACTS-AUDIT-2026-06-01.md`; closes the
**ADR-0279 §6** debt line. **Status: OPEN — amendment not drafted; no field, no display mandate. Owner:
UNASSIGNED · TARGET: TBD** (gated on founder sign-off of the vocabulary decision + the live-vs-baked fork).

### §1.4/§10 — the CONSTRUCTED envelope FOOTPRINT overstates on Barcelona 13a (L-643)
The buildable-envelope solid must be the intersection of every *derived* constraint (§1.4 fidelity, §10 partial-data honesty). On a Barcelona zone-13a parcel marked `REAL · CONSTRUCTED`, the solved footprint equals the **whole parcel** (`412 m²`, `alignment offset 0.0 m`), extruding over the block-interior *pati d'illa* / rear-garden that 13a keeps non-buildable — "unknown/whole-parcel rendered as buildable." Same class as L-616 (footprint not inset + FAR ceiling ignored) but on the **Art-242.2 construction path** (ADR-0271), not the DK Plandata path. MUST probe whether it is inset-collapse (L-529/L-581) or a missing interior-free exclusion before fixing. Tracked: audit **L-643**. Status: OPEN — the code does not yet honour this §; not marked resolved until a probe + fix + before/after footprint measurement lands.

### §1.7 — the 1:1 mapping to `setbacks.{front,side,rear}` DOES NOT HOLD for alignment-governed zones (L-451, ADR-0270)

§1.7 asserts the envelope numeric results map 1:1 onto C19 mutable parcel fields and that C58
persists no new output schema. **That holds only while every zone is setback-governed.**

Spanish *ensanche* is governed by *alineación a vial* + *profundidad edificable* + party walls
(verified live, L-438: Madrid publishes `Fondo de la Edificación` as a POLYLINE). **No
front/side/rear triple encodes such a rule.** Any value written there for an alignment zone is a
lossy coercion that looks well-formed and is therefore invisible.

**Status (updated 2026-07-20): RESOLVED IN CONTRACT — founder chose option (A).** §1.7 is
amended and §1.7a added: the inset polygon is the persisted truth, and setbacks are `null`
(never fabricated) for non-`setback` rules. Option (B) — "equivalent effective setbacks" — was
REJECTED as lossy by construction and invisible.

**IMPLEMENTATION COMPLETE (A1c) — 2026-07-20. THE TRIPWIRE IS LIFTED.** All four persistence
requirements now hold in code, each with a test:

| Requirement | Where | Test |
|---|---|---|
| The inset ring persists on the parcel | `Parcel.buildableRing` (L0) | stores — persists / defaults null / preserved-on-omit / cleared-on-null |
| `site.updateZoning` carries it | `SiteUpdateZoningPayloadSchema.buildableRing` + preserve-on-omit | stores |
| **A producer actually SENDS it** | `siteDispatch.dispatchEnvelope` | — *this was the gap; see below* |
| Setbacks can be `null` | `ParcelSetbacksSchema` fields nullable; payload nullable; `checkFootprintContainment` SKIPS a null edge | stores + site-validators |

**⚠ HOW THIS CLAUSE WAS SILENTLY UNSATISFIED FOR A WHOLE SESSION — worth recording, because the
failure mode is structural, not a typo.** A1c was reported merged and the schema + command halves
genuinely were. But **nothing ever sent `buildableRing`, and nothing ever read it back** — a
repo-wide grep for the field under `apps/` returned zero hits, and no test asserted the
round-trip. A persisted field that no producer writes is indistinguishable, at runtime, from a
field that does not exist. It surfaced only as **L-445**, a P0 where the envelope vanished from
the 3D Site on re-entry. **A "persistence landed" claim is only true when a WRITER, a READER and
a round-trip test exist; the schema is the cheapest third of the work.**

**Setback nullability was the other half of the same gap.** `ParcelSetbacksSchema` typed
front/side/rear as plain numbers, so clause 3 above ("for any non-`setback` rule those fields MUST
be `null`") was **unsatisfiable in code** — an alignment zone had nowhere to put the honest answer
and could only store a fabricated triple or leave stale numbers from an earlier setback solve.
`null` now means "this zone is not setback-governed" and is DISTINCT from `0` ("setback-governed,
requirement zero"); the default remains `0` for parcels created without zoning, since this
amendment governs what a SOLVE may write, not what an unzoned parcel means. The validator skips a
null edge rather than coercing it to `0` (which would silently pass every footprint) or flagging a
violation (which would assert a requirement the zone never stated).

**Superseded tripwire (kept for the record):** *"the engine MUST NOT emit an `alignment` result
into `site.updateZoning` … it becomes an active violation the moment ADR-0270 P2 ships without
P3."* P3 has now shipped, so an `alignment` result has somewhere honest to land. What remains open
is P4/P5 (A1d) — the "Why these numbers?" panel must render alignment AS alignment rather than as
three setbacks, and no alignment rule pack has been authored yet.

### §2.2 — the rule model cannot express alignment-governed zones (L-443, L-451)

`setbacks: { front_m, side_m, rear_m }` is the only geometric shape. ADR-0270 proposes the
discriminated union (`setback` / `alignment` / `explicit-area`).

> **STATUS 2026-07-21 — the union shipped** with a fourth member (`block-derived-alignment`,
> ADR-0271) and is solved exhaustively in `ZoningRulesEngine.ts`. See KG-1 above for what closed
> and KG-3/KG-4 for what did not.

---

### §1.3/§1.4 — "the ordinance floor is never a fallback" WAS VIOLATED IN PRODUCTION for a full session (L-529)

**Recorded 2026-07-21 because the failure mode is the one this contract exists to prevent, and it
still got through.**

ADR-0271 states the invariant plainly: *"The floor is not a fallback — returning `minDepth_m` when
the construction fails would publish a depth the ordinance does not sanction for that block."*
That is exactly what shipped, silently, on real Barcelona parcels.

**The mechanism.** `insetPolygonPerEdge`'s greedy self-intersection cleanup
(`removeSelfIntersections`) truncated the offset ring on every fold: a 12 m inset of the real
block ring came out with **2 vertices** and was reported `degenerate`. `solveBlockDerivedDepth`
reads a degenerate inset as **zero interior free area** ⇒ Art. 242.2 unsatisfiable at any depth ⇒
clamp to the ordinance floor and flag `degenerate`. The user saw `12.0 m · binding=min-floor`,
which is a well-formed, plausible, wrong number.

**Measured, by probe on live Catastro data** (`L-525-ENVELOPE-ACCURACY-INVESTIGATION.md`, the
resolution box): the inset was clean to d = 6 (70 % free) and degenerate at **every d ≥ 8**, while
a clean 82 m control square insets fine to d = 25 — so the failure was in the code, not the
geometry. Instrumenting the gates showed the cleanup collapsing **40 vertices → 2**. An
independent distance-field solve (validated to 2 dp against an analytic control) put the depth at
**≈ 17.4 m**. **Fixed by §INSET-LOOP-DECOMPOSE**
(`packages/site-parcel-data/src/geometry/insetPolygon.ts:192`): CL Pau Claris 155 now solves to
**15.7 m · binding=interior-ratio · achievedFreeRatio 0.300 · degenerate=false**.

**⛔ THE ROOT CAUSE RECORDED IN THIS SUBSYSTEM'S DOCUMENTS BEFORE THAT PROBE WAS WRONG, AND IT WAS
RECORDED AS CONFIRMED IN THREE PLACES.** The standing explanation was that Catastro masa 02309 is
*half a Cerdà illa* and that unioning it with a sibling masa was the fix. Refuted by measurement:
the masa's bbox is 113.4 × 113.8 m with **ZERO cross-masa adjacency links** in a 444 m search —
there is no sibling to union with — and its dissolved ring is **solid**, 6,696 m², perimeter 336 m,
i.e. a genuine ~82 × 82 m block **rotated ~45°** to the Eixample grid bearing. The
"6,686 ≈ half of 12,769" arithmetic compared a rotated small block against a nominal axis-aligned
one. The legal theory (L-526, that a stale Art. 327 §2 citation explained the depth) was also
wrong — the 2008 modification is a **height** change and does not touch depth.

**The blast-radius sweep found it was never Barcelona-specific**: across 684 cases, a
flag/battle-axe lot reported "no buildable area" at the DEFAULT 3 / 1.5 / 3 m setbacks in **every**
jurisdiction, because the same greedy cleanup runs on every `setback` inset.

**Two contract-level lessons, both normative going forward:**
1. **§1.1 byte-determinism is not sufficient.** A deterministic solver fed a silently-collapsed
   polygon is deterministically wrong. A geometric stage that can degrade MUST report *why* it
   degraded (the `status: 'rejected'` / `degenerate` diagnostic discipline), and a caller MUST NOT
   convert a degradation into a floor value.
2. **Probe the geometry before theorising about the data.** The probe that demolished three
   documents' agreed root cause took ten minutes, needed no deploy, and used a keyless public WFS.

**Status: the DEFECT is fixed (L-529, v256). The INVARIANT it violated is not CI-gated** — nothing
today fails a build if a solver clamps to `minDepth_m` on a degenerate input. **OPEN.**
