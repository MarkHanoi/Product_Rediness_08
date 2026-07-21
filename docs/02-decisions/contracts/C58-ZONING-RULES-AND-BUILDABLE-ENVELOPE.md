# C58 — Zoning Rules & Buildable Envelope

> **Stamp**: 2026-07-17 · **Amended**: 2026-07-21 · **Status**: DRAFT
> _DRAFT. ⚠ The "**0% built**" statement carried here from the 2026-07-17 Archistar gap audit (G-ENG-1..5) is **no longer true** and is corrected rather than deleted: `packages/site-parcel-data/` now ships the engine (`ZoningRulesEngine.ts`), the solvers (`geometry/{blockDerivedDepth,blockRing,insetPolygon,streetWidth,depthBandClip}.ts`), the rule-pack registry + refusal vocabulary (`rulepacks/{registry,zoneRefusal,esBarcelonaZoneClassification}.ts`) and one real jurisdiction pack (`rulepacks/esBarcelonaEnsanche.ts`), live on the Barcelona `13a` path. **The contract nevertheless stays DRAFT and no slot is claimed ACTIVE**: measured coverage is 24.0 % of Barcelona's private buildable land (L-538), the §6 gates are not all green, and §13/§14 below record where the code does not honour this contract. Status is a statement about conformance, and conformance is not established by documentation._
> **Scope**: governs the **zoning → buildable-envelope subsystem** — the `ZoningProvider` adapter interface, the canonical zoning-rule schema, the per-jurisdiction curated **`JurisdictionZoningContract`** rule-pack, the deterministic `ZoningRulesEngine` that solves `parcel + zoning-rules → BuildableEnvelope`, the two-fidelity (structured / estimated / none) honesty model, the "explain-why" derivation trace, and the envelope → authoring hand-off. This is the core compliance value-prop contract. Companion to [C57 Parcel Data Layer](./C57-PARCEL-DATA-LAYER.md) (which fetches the parcel) and consumer of [C19](./C19-SITE-MODEL-AND-PARCEL.md)'s mutable zoning fields.
> **Depends on**: [C03](./C03-SCHEMAS-COMMANDS-AND-STATE.md), [C19](./C19-SITE-MODEL-AND-PARCEL.md), [C57](./C57-PARCEL-DATA-LAYER.md), [C12](./C12-GEOSPATIAL.md), [C10](./C10-PERFORMANCE-AND-OBSERVABILITY.md), [C23](./C23-PROVENANCE-AND-AI-AUDIT.md).
> **Downstream**: [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md) (renders the envelope + derivation trace); [C50 Typology Pipeline](./C50-TYPOLOGY-PIPELINE.md) + [C53 Generative Layout Engine](./C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) (consume the envelope as generation bounds); [C19 §1.6](./C19-SITE-MODEL-AND-PARCEL.md) (footprint-in-parcel-minus-setbacks — the envelope makes the setback numbers real).
> **Key principles**: **P5** (rule + envelope schemas pure — no THREE / no I/O), **P6** (the envelope reaches the model only via the `site.updateZoning` command bus — no direct store writes), **P8** (every exported engine / provider fn opens an OTel span `pryzm.zoning.<verb>`), **P1** (providers wired once).
> **Strategy**: [ADR-0269](../adrs/ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) (compliance-authoring pillar; Denmark-first because it has the cleanest structured zoning; jurisdiction-agnostic engine + per-jurisdiction adapters).
> **Audit context**: [ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md](../../04-reference/ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md) (G-ENG-1..5, G-BRG-1..3 — the single largest gap to the Archistar loop), [PARCEL-ZONING-FEATURE-SCOPING.md](../../04-reference/PARCEL-ZONING-FEATURE-SCOPING.md) §4/§6.2/§6.3/§7, [DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md](../../04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md) §2.3. **This contract fills the slot C19 §9 explicitly defers ("jurisdiction-specific building-code databases — future contract") and C19 §10.2 leaves pending (the jurisdiction-registry shape).** On ratify, C19 §10.2 should reference C58.

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
> "certified" or "authoritative" (`spain/barcelona-catalonia/RISK-REGISTER.md` R1), and it retains
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
(`docs/04-reference/spain/SPAIN-ZONING-LIVE-VERIFICATION-2026-07-20.md`).**

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

**Measured result** (probe scored against the shipping `resolveZoneDisposition`): **741 of 1,014
points = 73.1 % of all Barcelona ground** now returns a cited refusal instead of a fabricated
triple; 86.1 % of all ground gets a constructed-or-cited answer.

**Why**: honesty is not achieved by hiding a number. It is achieved by making "no envelope
applies, and here is the article that says so" a *representable, first-class* result.

## §2 — Schema

Pure Zod (L0), `packages/schemas/src/elements/site/zoning/` (per **P5**).

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
// packages/schemas/src/elements/site/zoning/JurisdictionZoningContract.ts  (proposed)
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

```ts
DerivationEntry = {
  constraint: 'setback.front'|'setback.side'|'setback.rear'|'maxHeight'|'maxFAR'|'maxCoverage'|'permittedUse';
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
| `ZoningRecord` / `JurisdictionZoningContract` / `BuildableEnvelope` / `DerivationTrace` (pure Zod) | `packages/schemas/src/elements/site/zoning/` | **L0** |
| `ZoningProvider` interface + adapters + `ZoningRulesEngine` (pure) | `packages/site-parcel-data/` (shared with C57) | **L2** |
| Envelope → `site.updateZoning` dispatch; envelope → generator constraint | `packages/site-runtime` + `stores` + editor executor | **L2–L3 / L5** |
| Zoning fetch proxy route(s) | `server/parcelZoningProxy.js` | server (BFF) |
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

External (non-contract): [ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md](../../04-reference/ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md) (G-ENG/G-BRG), [PARCEL-ZONING-FEATURE-SCOPING.md](../../04-reference/PARCEL-ZONING-FEATURE-SCOPING.md) §4/§6/§7, [DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md](../../04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md) §2.3.

---

## §12 — Contract history

| Date | Change |
|---|---|
| 2026-07-17 | Initial DRAFT — fills the C58 reserved slot (the core compliance value-prop; gap audit G-ENG-1). Fills the C19 §9/§10.2 deferred jurisdiction-registry. Grounds on the two-fidelity scoping + the Denmark structured-zoning reference. Author: compliance-authoring governance track. |
| 2026-07-21 | Corrected the stale "0 % built" stamp (the engine, solvers, registry and one real pack ship; status stays DRAFT). Amended **§1.2** with `not-determined` + the still-open constructed tier (L-518). Added **§1.12** (construction-not-lookup + the measured provenance ladder, L-525a/L-537) and **§1.13** (refusal vocabulary + rule-pack registry, L-550). Updated **KG-1**; added **KG-3** (FAR/coverage never applied, L-551), **KG-4** (`explicit-area` unsolved, L-538), **KG-5** (24.0 % measured coverage, L-538). Recorded the **L-529 violation** of "the floor is not a fallback", including the refutation of the previously-confirmed half-illa root cause. |
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
