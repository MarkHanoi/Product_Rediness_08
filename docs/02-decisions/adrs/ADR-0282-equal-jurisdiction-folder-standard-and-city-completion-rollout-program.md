# 0282 — An EQUAL country/city folder standard + a phased, fan-out city-completion rollout program (extend C63)

**Status**: ACCEPTED (2026-07-30 — governance ratified; C63 extended with §5.1/§5.2/§5.3/§8.2. The per-city
audit + the scorecard function that will re-derive the numbers are sequenced separately, not part of this
ratification.)
**Date**: 2026-07-30
**Deciders**: founder (city-completion rollout directive — "normalise the folders, then execute countries in
parallel") + architecture team
**Related contracts**: [C63 — City Completion & Dossier](../contracts/C63-CITY-COMPLETION-AND-DOSSIER.md)
(this ADR extends it — §5.1 equal-shape invariant, §5.2 country folder standard, §5.3 findings/sources
placement, §8.2 the rollout program), [C62 — Data Confidence / Provenance](../contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md)
(the `not-assessed` honesty spine each cell composes), [C57](../contracts/C57-PARCEL-DATA-LAYER.md) /
[C58](../contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (the axis inputs + the L-449 verification gate),
[C60](../contracts/C60-SITE-ENTRY-AND-JURISDICTION-COVERAGE.md) (coverage-is-derived precedent)
**Related ADRs**: [ADR-0281](./ADR-0281-city-completion-scorecard-and-dossier-standard.md) (minted C63 — this
extends it), [ADR-0280](./ADR-0280-data-confidence-provenance-unknown-reason-model.md) (C62), [ADR-0279](./ADR-0279-envelope-structural-pipeline-as-replication-standard.md)
(the envelope replication standard the ENVELOPE axis reads)
**Reference docs**: [SPEC-CITY-COMPLETION-ROLLOUT](../../03-execution/specs/SPEC-CITY-COMPLETION-ROLLOUT.md)
(the phased program this ADR ratifies), [SPEC-CITY-COMPLETION-SCORECARD](../../03-execution/specs/SPEC-CITY-COMPLETION-SCORECARD.md)
(the function the program populates), [`jurisdictions/_NORMALIZATION.md`](../../04-reference/jurisdictions/_NORMALIZATION.md)
(the Phase-0 move plan), [`jurisdictions/_TEMPLATE/NAMING-CONVENTION.md`](../../04-reference/jurisdictions/_TEMPLATE/NAMING-CONVENTION.md)

## Context

C63 (ADR-0281) minted the 7-axis city-completion scorecard + a **city** dossier standard (§5) and the RATE
naming convention (L-649). But mass execution — auditing ~30 cities across ~14 countries with parallel agents
— was about to begin against a tree that is **not uniform**:

1. **No normative COUNTRY folder shape.** §5 fixed the city dossier but only sketched the country folder in
   prose. Country folders diverged: every country still carries the legacy `RATE.md` (the pre-L-649
   legislation-fill name) with **no** composite `COUNTRY-RATE.md`; only `ch`/`de` carry a
   `COUNTRY-DATA-STRATEGY.md`; Zürich sits at the non-standard `ch/regions/zurich/` instead of a
   `ch-zh/…-zurich/` dossier.
2. **Loose, unstructured docs.** Barcelona has ~14 investigation/plan files (`BARCELONA-DATA-PIPELINE.md`,
   `L-525-*`, …) plus a committed `PGM-NNUU-metropolitana.pdf` at its folder root — not in `findings/`, and
   the PDF violates the "no source PDFs in the repo" rule (L-450). `es/`, `dk/`, `sa/` carry similar root-level
   research. The four Catalan cities were renamed `RATE.md → LEGISLATION-RATE.md` but never got the new
   composite `RATE.md` scaffolded.
3. **No governed program.** "Audit → map → plan" (L-649 Phases 1–3) had no fan-out unit, no single-writer
   rule for the shared matrix, and no defined batches — inviting shape drift, matrix write-collisions, and the
   hand-typed-number fabrication C63 §1.1 exists to prevent.

The founder's directive: **document the whole structure as a governed program, make an EQUAL folder standard
for every country and city, normalise the existing loose folders, THEN execute countries in parallel.**

## Decision

**Extend C63 (do not mint a new contract — the dossier standard's authority stays in one place).**

1. **The EQUAL-SHAPE invariant (C63 §5.1).** Every country folder is identical in shape to every other; every
   city dossier identical to every other. A file that exists is **either in the standard set or misplaced** —
   there is no third category. Comparability is the whole value (the folder analogue of §1.3's "same ruler").

2. **The country folder standard (C63 §5.2).** `jurisdictions/<cc>/` MUST carry: `COUNTRY-RATE.md` (composite
   master roll-up) + `README.md` + `LEGISLATION-RATE.md` + `LOD-RATE.md` + `COUNTRY-DATA-STRATEGY.md` +
   `RATE-IMPLEMENTATION-PLAN.md` + `NEXT.md` + `sources/` + `findings/` + `regions/README.md` + `topics/*` +
   the `<cc>-<subdiv>/<code>-<slug>/` **city dossiers**. The nesting country → subdivision → city is fixed;
   the city segment equals the pack `jurisdictionId`.

3. **`findings/`/`sources/` placement (C63 §5.3).** Both appear at country AND city level with identical
   meaning; a research doc or `L-NNN` record at a folder root is misplaced (home = `findings/`); source PDFs
   never live in the repo.

4. **The rollout program (C63 §8.2 + SPEC-CITY-COMPLETION-ROLLOUT).** A phased method — **Phase 0** normalise
   the existing tree, **Phase 1** per-country AUDIT (cheap axes first: DATA-SOURCES/TERRAIN/CONTEXT, then
   PARCEL/HEIGHTS, then LEGISLATION/ENVELOPE), **Phase 2** MAP into dossiers + roll-ups + the global matrix,
   **Phase 3** PLAN the per-axis climb. **Fan-out unit = one agent per country/region; the orchestrator is the
   single writer of the global matrix + the normalisation moves.** Batched over the 23 baked regions into 10
   country batches (Spain · Nordics · DACH · France · Italy · Iberia-PT · UK · BeNeLux · US · Saudi).

5. **Normalise before scale (Phase 0, `_NORMALIZATION.md`).** The one-time survey maps every loose/misplaced
   file to its standard home and lists every folder's missing standard files — a plan only; the orchestrator
   executes the moves.

## Why not the alternatives

- **A new companion contract for the folder standard.** Rejected — the dossier standard already lives in C63
  §5; splitting the country half into a separate contract would fracture the single authority and force a
  cross-contract read to answer "what shape is a jurisdiction folder?". An extension keeps one home.
- **Skip normalisation; audit the tree as-is.** Rejected — auditing a non-uniform tree bakes the divergence
  into the numbers and defeats comparability (§5.1). Normalise first, then measure a uniform tree.
- **Let each country agent write the global matrix directly.** Rejected — that is the multi-agent shared-tree
  collision the single-writer rule prevents; the orchestrator merges country roll-ups into the one matrix.
- **Let agents hand-type completeness where the state is expensive to read.** Rejected as the §CONTEXT-DATA-
  HONESTY fabrication (C63 §1.1). Cited-derivation-or-`not-assessed` is mandatory; a cited hand-audit is
  honest, a guessed number is not.
- **Equalise the folders by deleting the loose files.** Rejected — the loose files are real investigation
  records (`findings/` content that landed at the root); they are MOVED, not destroyed.

## Consequences

- **Positive.** Every country + city folder becomes comparable by construction; parallel agents cannot drift
  on shape or collide on the matrix; the honesty spine (cited-or-`not-assessed`) is enforced by the program,
  not left to each agent; the founder gets a fan-out plan that scales the rollout without fabricating numbers.
- **Cost / debt.** Phase 0 is a sizeable one-time move (~14 countries; Barcelona alone ~14 files + a PDF to
  object storage; every country's `RATE.md → LEGISLATION-RATE.md` split + a new `COUNTRY-RATE.md`; four Catalan
  cities need a composite `RATE.md` scaffolded; `gb/` and a San-Francisco dossier do not yet exist). Until the
  L-648 scorecard function ships, Phase-1 cells are cited hand-audits (honest, but review-gated not CI-gated).
- **Coverage gaps surfaced.** London is baked with no `gb/` folder; San Francisco is baked with no dossier;
  Zürich is mis-nested at `ch/regions/zurich`. All are logged (Phase 0 / batch notes), not hidden (C63 §1.7).
- **Parallel-safety note.** `jurisdictions/es/**` is being written concurrently by the Spain agent; this ADR
  and `_NORMALIZATION.md` describe the es/ target shape but do not write into es/ — the plan is framed by the
  STANDARD, not a frozen snapshot.
- **Follow-ups.** Execute Phase 0 (orchestrator); fan out the 10 batches (Spain first as the reference); wire
  `check-city-completion.ts` (C63 §6) so the equal-shape + honesty rules become CI-enforced.
