# NRW Abstandsflächen (setback) engine — BauO NRW 2018 §6

**Scope:** Land Nordrhein-Westfalen (`de-nw`) — reusable, **CITABLE** Land rule. Applies to Köln
(`05315`) and every other NRW municipality where the statute governs. · **C63 axis:** LEGISLATION
(setback input) · **Last updated:** 2026-07-31 ·
**Status:** RESEARCH CAPTURE — formula captured from BauO NRW 2018 §6; verify exact current wording
at `recht.nrw.de` (amendment effective 01.01.2024) before it gates production.

> **Home note.** The founder's brief offered `../../LANDS/NORDRHEIN-WESTFALEN.md` as an alternative
> home. This file keeps the reusable rule in the Köln dossier (where the extraction pipeline
> references it) and **cross-links** the Land file rather than editing it. If the rule is later
> promoted to a Land-wide asset, move it to the Land file and leave a stub here.

---

## 1 — The rule (BauO NRW 2018 §6 Abstandsflächen)

Setbacks in NRW are **height-proportional** — a fraction of the wall height **H** — **not** fixed
front / rear / side metres. The depth of the required Abstandsfläche (the open area kept clear in
front of a wall) is:

| Context (Baugebiet) | Abstandsfläche depth | Minimum |
|---|---|---|
| **Standard** (most zones) | **0.4 · H** | **3 m** |
| **GE / GI** (Gewerbe- / Industriegebiet) | **0.2 · H** | **3 m** |
| **MK** (Kerngebiet) | **0.25 · H** | **3 m** |

Where **H** = the relevant wall height (per §6 measurement rules — reference points, gable/roof
contributions, and reductions are defined in the statute; read the primary text before coding the
exact H derivation).

**Source:** BauO NRW 2018 §6, `recht.nrw.de` (Bauordnung für das Land Nordrhein-Westfalen; latest
amendment **effective 01.01.2024**). Confidence: **VERIFIED-CITABLE** for the multipliers/minimum;
the exact H-measurement clauses are **PENDING** a primary-text read.

---

## 2 — How it behaves in the engine

- **Coded ONCE per Land.** One NRW Abstandsflächen function; every NRW municipality (Köln, Düsseldorf,
  Dortmund, …) shares it. This mirrors the founder's "extractor stays identical" principle
  (`EXTRACTION-PIPELINE.md §Expansion`).
- **Applies where the statute governs** — i.e. as the default setback rule for BauO NRW parcels. A
  Bebauungsplan may override with its own Baugrenzen / Baulinien (the überbaubare Grundstücksfläche),
  which are **geometry-derived** and take precedence where set (`EXTRACTION-PIPELINE.md §mapping`).
- **Does NOT populate a per-zone setback metre.** It is a **function of H**, computed per-parcel — so
  the `setback` column in `LEGISLATION.csv` stays `unknown` at the zone level (it is not a constant).
  This is the correct honest state, not a gap.

---

## 3 — Contrast with the Spanish / metric model

Unlike a fixed "3 m rear, 3 m side" ordinance metre (as some Spanish/Catalan claus carry), NRW's
setback is **derived from building height at design time**. There is no single number to source per
zone; there is a **formula** to code once. This is why NRW's setback is *citable now* while its
GRZ/GFZ/Z values remain `unknown` until each B-Plan is read.

---

**Cross-links:** `../../LANDS/NORDRHEIN-WESTFALEN.md` (Land technical profile — cite this rule there
if promoted) · `LEGISLATION.md §6` · `EXTRACTION-PIPELINE.md §4 (field mapping)` · `SOURCES.md §A4`.

*Last updated: 2026-07-31. Source: BauO NRW 2018 §6, `recht.nrw.de` (eff. 01.01.2024). Multipliers
VERIFIED-CITABLE; exact H-measurement clauses PENDING primary-text read. No per-zone metre fabricated.*
