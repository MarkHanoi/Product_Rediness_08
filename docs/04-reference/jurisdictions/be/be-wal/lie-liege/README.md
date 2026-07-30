# Liège (`lie-liege`) — Jurisdiction Pack (Wallonia / CoDT)

> **Dossier note (C63 naming, L-649/L-650).** This dossier's master scorecard face is now
> [`RATE.md`](./RATE.md) — the 7-axis composite completion rate (**research-only / NOT bake-covered** →
> all axes `not-assessed`, no scorecard computed). The legislation/data-fill rate was renamed
> `RATE.md` → [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) and now FEEDS it as Axis 2 (see
> [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md)).

**Country:** `be` · **Region:** Wallonia · **ISO 3166-2:** `BE-WAL` · **NIS code:** `62063` ·
**Pack id:** `be-wal-liege` ·
**Governing instruments:** Plan de secteur (1977–1987) + Guide communal d'urbanisme (GCU, if adopted) +
bon-aménagement-des-lieux discretionary test (CoDT Art. D.IV.13) ·
**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — research complete; no pack implemented

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → plan de secteur zone → GCU (if adopted by Liège commune) → bon aménagement des lieux (CoDT Art. D.IV.13)`.
- **Rule KIND (ADR-0270 / C58 §2.2):** UNCLEAR — Wallonia is the most discretionary of the three Belgian regions. The plan de secteur supplies only a broad affectation category (zone d'habitat, activité économique, etc.); it carries no numeric height or FAR dimension. The Guide régional d'urbanisme (GRU) is explicitly indicative. Whether Liège has adopted a Guide communal d'urbanisme (GCU) with real numeric content is unknown. **Until these questions are answered, the correct output for most Wallonia parcels may be a reasoned refusal** ("zone d'habitat — no numeric ceiling published; bon aménagement des lieux applies as the operative standard") rather than a numeric rule.
- **Setback-governed vs alignment-governed:** folded entirely into the bon-aménagement-des-lieux discretionary judgment for most Wallonia parcels. No structured setback formula confirmed.
- **Legal-structure trap watch (P1):** unlike Germany (where §34 discretion applies only where no B-Plan exists), Wallonia's bon-aménagement-des-lieux test is close to the **load-bearing mechanism for most specific envelope questions** — not a rare derogation safety valve. The plan de secteur is too coarse (23 broad-category polygons for all of Wallonia) to supply numeric height/FAR, and the GRU is explicitly non-binding. The Wallonia pack must treat the discretionary test as the primary operative standard, not a fallback.

### The Wallonia instrument cascade (must resolve per parcel)

| Step | Question | Answer path |
|---|---|---|
| 1 | Which plan de secteur zone governs? | Query `LU.ZoningElement_pds` WFS (VERIFIED LIVE) for parcel centroid; returns zone affectation (e.g. `zone d'habitat`, `activité économique`, `zone agricole`) |
| 2 | Has Liège adopted a **Guide communal d'urbanisme (GCU)** with numeric provisions? | Research task — check Liège municipality's official publications; GCU adoption is commune-by-commune and not centrally tracked |
| 3 | Does the GCU (if any) contain a numeric height ceiling for this zone? | Read the GCU text if confirmed; extract any numeric provisions for the applicable zone |
| 4 | If no GCU or no numeric provision: output is **bon aménagement des lieux** refusal | CoDT Art. D.IV.13 — discretionary test; no numeric table |

Plus: **schéma de développement communal (SDC)** or **schéma d'orientation local (SOL)** layers are
confirmed in the Wallonia WMS capabilities document — these are strategic orientation tools, not
binding numeric instruments, but may contain guidance relevant to the contextual review.

---

## 2 — Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Plan de secteur zone query** | ENDPOINT LIVE — ✅ GetFeature not yet run | WFS GetFeature for a known Liège parcel returns zone affectation |
| **GCU confirmation for Liège** | NOT STARTED — research task | Confirm whether Liège has adopted a GCU; if yes, obtain text |
| **Numeric provision extraction** | NOT STARTED | GCU text read; numeric height/FAR provisions extracted (if any) |
| **Bon-aménagement-des-lieux refusal output** | NOT STARTED | Refusal kind ratified for Wallonia |
| **LiDAR / PICC building heights** | NOT STARTED | Wallonia PICC WFS probed; LiDAR terrain product confirmed and accessed |
| **Heritage overlay (AWaP)** | NOT STARTED — layer stated | SPW Géoportail AWaP layer GetCapabilities + GetFeature run for Liège area |

Refusal vocabulary: `legal` (no GCU adopted — bon aménagement des lieux is operative standard; no numeric ceiling) ·
`coverage-gap` (GCU adopted but text not yet sourced) ·
`regime-undetermined` (plan de secteur zone not yet queried)

---

## 3 — Granularity (C58 §1.11)

The plan de secteur zones are very coarse — 23 plans covering all of Wallonia, with large zone
polygons that may span an entire district or commune. The plan de secteur zone is the **ceiling of
specificity available from the structured API** — there is no Wallonia-equivalent of Germany's
parcel-level B-Plan or Spain's parcel-level clau.

A GCU (if adopted) would be more granular, typically operating at the quartier or zone level within
a commune. Confirm Liège's GCU scope (if adopted) before stating any granularity level.

**Granularity: plan de secteur zone level at best; usually: "zone d'habitat" or similar broad category — no parcel-level numeric data confirmed available anywhere in Wallonia from the structured API.**

---

## 4 — The number

**0% of clicks return a full, cited envelope (not started).** Denominator: any Liège parcel for
which (a) the plan de secteur zone query returns an affectation, AND (b) either a GCU numeric
provision or a refusal (bon aménagement des lieux as operative standard) is issued.

**The denominator itself is the research task** — confirming whether Liège has a GCU with real
numeric content is the prerequisite before any fill-rate estimate can be made.

**Research estimate for Wallonia: ~0–2%** structured-numeric-fill rate (see `LEGISLATION-RATE.md §2`). The
operative standard for most Liège envelope questions is bon aménagement des lieux, not a table.

---

## 5 — Height mechanism

Wallonia has no region-wide numeric gabarit baseline. The plan de secteur supplies only a broad
land-use affectation — no height or FAR dimension. The GRU is explicitly indicative (not binding).
The operative standard is bon aménagement des lieux (CoDT Art. D.IV.13):

> "Un permis peut être accordé en dérogation du plan de secteur ou des normes du guide régional
> d'urbanisme si la dérogation est justifiée eu égard aux spécificités du projet et à la situation
> précise des lieux — ce qui correspond à la notion de 'bon aménagement des lieux.'"
> (CoDT Art. D.IV.13 — research-confirmed paraphrase; canonical text at `walllex.be`)

This means the height question for a Liège parcel is, by default, **answered by a human assessor
applying the contextual compatibility test**, not by reading a table. The correct output for a pack
is the bon-aménagement-des-lieux refusal — explicitly acknowledging that the legal answer requires
human judgment about site, neighbourhood context, and project specifics.

---

## 6 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `sources/SOURCES.md`.

- **Whether Liège has adopted a GCU:** the most important research question for this pack. If Liège has a GCU with numeric provisions, the fill rate for Liège specifically could be higher than the Wallonia regional average.
- **Whether Liège's GCU (if any) contains numeric height/FAR provisions:** a GCU could still be primarily qualitative (design principles, historic-character guidance) rather than numeric. Confirm before assuming a GCU changes the structured fill rate.
- **Wallonia PICC building-footprint schema and LiDAR product:** not independently probed. Wallonia's LiDAR-derived terrain coverage/density vs. Flanders DHMV II is unconfirmed — required before any Liège dev-day estimate for context data.
- **AWaP heritage GIS layer on SPW Géoportail:** stated as CC-BY 4.0 in the catalogue; not independently fetched. The GetCapabilities for the AWaP layer and a GetFeature for the Liège area would confirm the layer schema and coverage.

---

**Related files:** `../../README.md` (country umbrella) · `../../NEXT.md` (blockers + resume) ·
`../../findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md §B.3` (full Liège analysis) ·
`sources/SOURCES.md` · `NEXT.md`
