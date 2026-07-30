# Jurisdiction dossier — the RATE naming convention (master reference)

> **Status**: CONVENTION — **DECIDED (founder, 2026-07-30, audit L-649)**. Authority:
> [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) (the 7-axis completion scorecard
> + dossier standard), with the per-axis inputs governed by
> [C58](../../../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (zoning / legislation),
> [C57](../../../02-decisions/contracts/C57-PARCEL-DATA-LAYER.md) (parcel), and
> [C62](../../../02-decisions/contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md) (the confidence / unknown
> vocabulary every rate composes). This is the one file that says **what each dossier file is called and why**.

This is the file the founder asked for (L-649): a single reference that fixes the naming so a number on screen
always maps to the file that justifies it. Read it before creating or renaming any dossier file.

---

## §1 — The one rule: `RATE.md` is the composite master; `<AXIS>-RATE.md` feeds it

There is exactly one **master rate** per level, and it is always called `RATE.md` (city) or `COUNTRY-RATE.md`
(country). Every other rate is a **per-axis detail rate** named `<AXIS>-RATE.md` and it **feeds** the master.

| Name | Level | What it is | Kind |
|---|---|---|---|
| **`RATE.md`** | city | the **composite master** — the 7-axis C63 completion scorecard ("how complete is this city") | MASTER |
| **`COUNTRY-RATE.md`** | country | the **composite master roll-up** — one row per tackled city, the 7 axes + overall | MASTER |
| `LEGISLATION-RATE.md` | city / country | the structured legislation / data-fill rate (zone + density + height without a PDF) | per-axis → **LEGISLATION** |
| `LOD-RATE.md` | city / country | the building / terrain LOD rate (can we obtain a faithful physical model?) | per-axis → **HEIGHTS/LOD** |

**Rule:** `RATE.md` (or `COUNTRY-RATE.md`) is **always the composite master**; any `<AXIS>-RATE.md` is a
**per-axis detail rate that FEEDS the master**. Never invert this. The two composite names differ only so a
city-level `RATE.md` and its country-level `COUNTRY-RATE.md` never clash in intent — both are "the master rate"
at their level.

### Why the rename happened (history)
C63 §5 originally named the composite face `COMPLETION.md` and used `RATE.md` for the narrower legislation
metric — two artefacts colloquially called "RATE". The founder chose the literal reading (L-649 Option B,
2026-07-30): the composite master **is** `RATE.md`, and the legislation metric became `LEGISLATION-RATE.md`.
The **semantics of the legislation metric are unchanged** — the C58 / L-449 cross-jurisdiction ruler is the
same number, only the filename moved.

---

## §2 — The dossier file set (each file · one-line purpose · axis it feeds)

Every tackled **city** dossier lives at `jurisdictions/<cc>/<cc>-<subdiv>/<code>-<slug>/` and contains
(templates: `_TEMPLATE/_CITY/` for the city-specific files, `_TEMPLATE/` for the shared ones):

| File | What it is about | Feeds C63 axis |
|---|---|---|
| **`RATE.md`** | the 7-axis composite completion scorecard — the master "how complete is this city" | — (composes all 7) |
| `LEGISLATION-RATE.md` | structured legislation / data-fill rate (the C58 comparable ruler) | LEGISLATION |
| `LOD-RATE.md` | building / terrain LOD sub-rate | HEIGHTS/LOD |
| `README.md` | what governs here · pack status · open questions | all |
| `ENVELOPE.md` | buildable-envelope solver status (ADR-0279 standard) | ENVELOPE |
| `HEIGHT.md` | building-height provenance status (BUILDING-HEIGHT-REPLICATION-STANDARD) | HEIGHTS/LOD |
| `NEXT.md` | where we stopped · blockers · TRIP-WIRES · resume steps | all |
| `RISK-REGISTER.md` | the fail-safe risk log (the honesty guardrails) | — |
| `RATE-IMPLEMENTATION-PLAN.md` | the phased plan to raise the master RATE toward 100 % | LEGISLATION (+ all) |
| `sources/SOURCES.md` | per-field citations (value · unit · article · document · URL) | LEGISLATION |
| `sources/VERIFICATION.md` | the human sign-off (L-449; gates LEGISLATION/ENVELOPE `human-reviewed`) | LEGISLATION · ENVELOPE |
| `findings/` | substantive L-NNN investigation records | — |

The 7 axes are FIXED by C63 §3 and identical in every city: **PARCEL · LEGISLATION · DATA-SOURCES · ENVELOPE ·
TERRAIN · HEIGHTS/LOD · CONTEXT**. A city MUST NOT redefine, add, or drop an axis (C63 §1.3).

### Country level vs city level

| Level | Composite master | Legislation detail | LOD detail | Roll-up target |
|---|---|---|---|---|
| **City** | `RATE.md` (7-axis scorecard) | `LEGISLATION-RATE.md` | `LOD-RATE.md` | rolls up into the country `COUNTRY-RATE.md` |
| **Country** | `COUNTRY-RATE.md` (per-city matrix) | `LEGISLATION-RATE.md` (national) | `LOD-RATE.md` (national) | rolls up into the global `master-execution-tracker.md §CITY-COMPLETION` |

A country folder additionally carries `README.md` (national data layer) + `RATE-IMPLEMENTATION-PLAN.md`
(national climb) + `sources/` + `findings/`.

> **Migration note (honesty).** This convention is authored in the templates and applied to the four shipped
> Catalan city dossiers (Barcelona, L'Hospitalet, Badalona, Sant Boi). Country folders and other city scaffolds
> that still carry the legacy `RATE.md` (legislation) name are **pending migration**, not a contradiction —
> they will be renamed to `LEGISLATION-RATE.md` when each is next worked (the L-649 audit→map→plan phases). The
> template + the four exemplars are the source of truth for the new names.

---

## §3 — The folder-naming join-key rule

The dossier folder identity MUST equal the pack `jurisdictionId` — the C58 / `jurisdictions/README.md` join key,
so a reviewer gets from a number on screen to the clause that justifies it without searching.

- **Folder:** `jurisdictions/<cc>/<cc>-<subdiv>/<code>-<slug>/` (e.g. `es/es-ct/08019-barcelona/`).
- **Folder identity:** `<code>-<slug>` (e.g. `08019-barcelona`); the pack id is `<cc>-<code>-<slug>`
  (e.g. `es-08019-barcelona`).
- **Rule:** the pack `jurisdictionId` in `packages/site-parcel-data/src/rulepacks/<jurisdictionId>.ts`
  **==** the folder path identity. `<code>` is the official municipal code (INE / INSEE / DICOFRE / LAU);
  `<slug>` is the lowercased place name.

---

## §4 — Unassessed is `not-assessed`, never a fabricated number (the honesty spine)

Every axis cell of a `RATE.md` / `COUNTRY-RATE.md`, and every headline of a `LEGISLATION-RATE.md` /
`LOD-RATE.md`, is either a **computed** value (a total function of inspectable state — C63 §1.1) or the sentinel
**`not-assessed`** carrying a typed [C62 `UnknownReason`](../../../02-decisions/contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md)
(`not-queried | pending-implementation | outside-coverage | authority-does-not-publish | adapter-limitation |
license-restriction | geometry-incomplete`).

- **`not-assessed ≠ 0 %`** (C63 §1.2): 0 % asserts "measured, and nothing is there"; `not-assessed` asserts
  "not measured". Conflating them is the §CONTEXT-DATA-HONESTY "failure vs empty are the same value" defect.
- A number **hand-typed** into a rate file (not emitted by the scorecard function / not derived from a cited
  endpoint check) is a **contract violation** — a guess presented as a measurement.
- Completion and honesty are orthogonal (C63 §3.1): a city can score **low on completion** and remain
  **100 % honest** (e.g. every buildable clau returns a cited refusal). Launch-blocking is `honestyOk`, not a
  completion threshold.

---

## §5 — See also

- [C63 — City Completion Scorecard & Dossier Standard](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) — the 7 axes, the weighting, the dossier shape (§5).
- [C58 — Zoning Rules & Buildable Envelope](../../../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) — the LEGISLATION / ENVELOPE inputs + the L-449 verification gate.
- [C57 — Parcel Data Layer](../../../02-decisions/contracts/C57-PARCEL-DATA-LAYER.md) — the PARCEL axis input + the join-key rule.
- [C62 — Data Confidence, Provenance & Unknown-Reason Model](../../../02-decisions/contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md) — the confidence / `not-assessed` vocabulary every rate composes.
- [`README.md`](../README.md) — the jurisdictions tree authoring contract + the LEGISLATION-RATE standard.
- [`MASTER-RATE-TRACKER.md`](./MASTER-RATE-TRACKER.md) — the copyable global-matrix face.

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Convention decided under audit L-649.*
