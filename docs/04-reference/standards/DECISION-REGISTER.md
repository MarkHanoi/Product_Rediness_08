# DECISION REGISTER

**Status**: BINDING (founder directive, 2026-08-02)
**Companion to**: [MACHINE-READABLE-EVIDENCE-REGISTER.md](./MACHINE-READABLE-EVIDENCE-REGISTER.md)
**Related**: [BLOCKER-CLASSIFICATION-STANDARD.md](./BLOCKER-CLASSIFICATION-STANDARD.md) · [ADR-0283](../../02-decisions/adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) · [ADR-0288](../../02-decisions/adrs/ADR-0288-machine-readable-is-not-publishable.md)

> *"One tells you **what exists**; the other tells you **what the programme has decided**. Together, they
> prevent future teams from reopening settled questions."* — founder, 2026-08-02

## Rules

1. **Immutable.** A decision record is never edited. It is **superseded** by a new record that cites it.
2. **Every row carries a `Reopens if`.** A decision with no reopening condition is either wrong or a law of
   nature. This column is what makes the register safe to trust — it says exactly what new fact would
   change the answer, so nobody has to re-derive the whole question to find out.
3. **`Basis` names the evidence**, not the reasoning. An article with its number; a survey with its date; a
   signature with its identifier.
4. **A decision is not a coverage number.** Coverage is an output that moves; a decision is a settled
   question. Never record a percentage as a decision.
5. **Check here before reopening anything.** Same mandate as the evidence register.

## The register

| ID | City | Decision | Basis | Reopens if |
|---|---|---|---|---|
| **D-001** | **Madrid** | **NZ-3 is resolved BY LAW. No municipal zone envelope is computable under the current ordinance.** Art. 8.3.1 defines the regime (*aprovechamiento* exhausted; consolidation *«sin imponer un nuevo modelo»*); Art. 8.3.5 *«Obras admisibles»* operates **within** it and presupposes an existing building. Existing-building works are not authority for a parcel-level zoning envelope. Vacant land has no general computable entitlement (8.3.3.1.b: *«espacios libres sin aprovechamiento urbanístico»*). **60.458 % of Madrid answered permanently — a determination, not a gap.** | PGOUM-97 Compendio 2025, Arts. 8.3.1 · 8.3.3.1.b · 8.3.5.3.a).i) · 8.3.5.3.b — five verbatim anchors, pp. 397–399 | The ordinance is amended. ⚠ The outstanding BOCM texts of **MPG 00/343 + 00/335** are **verification of continued validity, NOT an invitation to reopen engineering.** |
| **D-002** | **Córdoba** | **No authoritative zoning geometry has been demonstrated as published.** ⛔ **Vectorisation is NOT authorised.** The earlier pre-approval rested on *"the source data are already public"* — measured false: **41 of 49 urban CUS sheets return a 69-byte "Server under construction" page**, only 8 are live (6 already vectorised), and **no world file or `.prj` is served for any sheet**, so "georeferenceable" was an assumption. Under ADR-0283 a non-georeferenced raster is not authoritative published geometry. **This is a publication/access issue with GMU, not an engineering task.** | One-shot six-avenue survey, 2026-08-02 (`findings/MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md`). `GMU_Services` was **George Mason University**, an acronym collision 6,148 km away. Schema-leak test returned a clean negative: PostGIS ids, no `OBJECTID`/`GlobalID`/`Shape_Area`, heterogeneous coordinate precision ⇒ hand-traced, no internal schema to request | **GMU publishes the remaining sheets** (or refuses in writing). Not on any new search — the search is CLOSED. |
| **D-003** | **Murcia** | **Street-width computation is ACCEPTED as an implementation of the ordinance.** The PGOU makes width the legal criterion and prescribes no measurement methodology; computing it from published *alineaciones* is implementation, not amendment. Published at `estimated-ruleset`, citing Arts. 5.3.3 · 5.5.3 · 5.7.3 · 5.9.3, under four binding conditions (reproducible · labelled constructed · article-cited · refuses at band edges). | **SIG-MU2**, founder, 2026-08-02 → generalised as [ADR-0285](../../02-decisions/adrs/ADR-0285-computing-an-observable-criterion-is-implementation.md) | The ordinance is amended, or a prescribed measurement methodology is found in the instrument. |
| **D-004** | **València** | **`altura` semantics are UNRESOLVED and no envelope ships.** The field is proven not to be metres (n=105, median ratio 0.78 vs ≈3.0 predicted) but sits **below** the built storey count on 81 % of sampled Ensanche buildings, modally by two, and **above** it on a minority — error is two-sided, so no conservative branch exists. | Measured 2026-08-02; [ADR-0287](../../02-decisions/adrs/ADR-0287-resolvers-refuse-when-uncertainty-changes-the-legal-outcome.md) | An **official municipal interpretation** is received that also reconciles the −2 gap (Q4 of `VALENCIA_R5_ASK`). |
| **D-005** | **València** | **Buildable depth is RESOLVED through published geometry.** Art. 6.18.1 — *«La ocupación … se ajustará a las alineaciones definidas en el Plano C»* — and Layer 212 **is** those alignments. The polygon is an *área de movimiento*: the depth is **drawn, not tabulated**, so no separate depth attribute is required. R1 is **Superseded**, not closed: the original premise ("profundidad edificable is unpublished") was false. | Founder decision, 2026-08-02, on measurement n=54: median mean-width 15.6 m, never larger than its own calificación polygon (0/54), *patio de manzana* holes on 10 | Contrary evidence that Layer 212 is not the Art. 6.18.1 alignment set. **Do not reopen on a search for "Plano C".** |
| **D-006** | **Barcelona** | **The 22a corpus boundary is SIGNED.** Publish the municipal framework, the **measured** delegation (98.92 % of clau-22a land governed by a *pla derivat*; 15.43 % of the city's private buildable land), and an explicit corpus boundary. ~2,600 partial plans are **outside verified scope unless individually analysed**; delegated land receives a cited refusal naming its instrument. **Scoping delegation out did not raise the ENVELOPE axis** — `not-determined` at 0.0 remains correct (36.5 % → 36.5 %). | **SIG-4**, founder, 2026-08-02; 81-polygon AMB Refós `PLAN` census | A delegated plan is individually analysed and admitted to the corpus. ⚠ **22@ is a SEPARATE regime (Art. 8.1 MPGM) and is NOT covered by this decision** — it needs its own signature. |
| **D-007** | **corpus-wide** | **Doctrine B — evidence-bounded publication.** *"PRYZM may assert only what authoritative publication demonstrates. Where evidence is incomplete **or legally insufficient**, PRYZM returns Unknown rather than inferring entitlement."* Inside published geometry → deterministic envelope permitted; outside → Unknown. | **SIG-M2**, founder, 2026-08-02 → [ADR-0283](../../02-decisions/adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) | Never, on evidence. Superseded only by an explicit new doctrine ADR. |

## Open — awaiting a decision, recorded so they are not mistaken for settled

| ID | City | Question | Owner | What unblocks it |
|---|---|---|---|---|
| **P-001** | Madrid | **SIG-M1** — certify the transcription itself, not merely the process | the founder | A cover sheet: records reviewed **by risk class** · issues found · issues corrected · unresolved items. *"If that summary is clean, I would sign the transcription."* |
| **P-002** | Barcelona | **Refós `PLAN`/`*` marker** — `PD*` covers **70.69 %** of buildable land incl. **68.6 % of clau 13a**, a family published at tier 0.7. Does the marker mean the derived plan **displaces** Art. 242.2, or merely **assigns the clau**? | documentary interpretation | One documentary answer. ⚠ **Do not touch coverage until the marker is understood** — moving the axis on an unread field is the inference Doctrine B forbids. |
| **P-003** | Barcelona | **22@** — a separate regime under Art. 8.1 MPGM, not covered by D-006 | the founder | Its own signature, if inclusion is intended. |
| **P-004** | Madrid | **Legal-computation-mode classification** — is NZ-3's pattern unique, or do other Normas Zonales also resolve to existing-building / instrument / refusal rather than envelope? | Madrid | A per-Norma table: envelope · existing-building · instrument · refusal. |
