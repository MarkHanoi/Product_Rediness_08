# Berlin (11000) — LEGISLATION (buildability rules model)

> **Captured:** 2026-07-31 · **Source:** founder research · **Status:** model defined; ZERO zones extracted.
> Every numeric planning value in this dossier is `unknown` / `PENDING` — see the reason column in `LEGISLATION.csv`.

---

## 0 — The one hard truth (keep this at the top)

**The Berlin B-Plan WFS is a plan LOCATOR, not a rule table.** GRZ / GFZ / Vollgeschosse / height / Baugrenze are **NOT present in the WFS schema** — they live ONLY in the linked Satzung PDF. So `farRatio`, `maxHeight_m`, `maxFloors`, `maxCoverage` and `setbacks` stay **`unknown`** and are **NEVER populated from GIS/WFS metadata** — only from extracted, human-verified (L-449), cited plan text attached to the exact `planid`. (See `EXTRACTION-PIPELINE.md`.)

---

## 1 — Berlin's THREE-regime model (why Berlin is the hard German test)

Berlin is the hard German test because a parcel can fall under any of three regimes with fundamentally different data models (a fourth, §35 outlying, is rare in a city-state):

### (a) §30 B-Plan (modern)
Extract Festsetzungen from the binding plan:
- **GRZ → maxCoverage**
- **GFZ → farRatio**
- **Vollgeschosse → maxFloors**
- **GH / TH / FH → maxHeight** (Gebäude-/Trauf-/Firsthöhe)
- **Baugrenze → buildable envelope geometry**

Rule kind: `coverage-and-far`. All values `unknown` until per-plan extraction + L-449.

### (b) Baunutzungsplan 1958/60 (LEGACY — Berlin-specific)
The preparatory West-Berlin land-use plan, binding per §173(3) BBauG, uses **Baustufe / Ausweisung** grading — a pre-BauNVO system. It gets a **SEPARATE parser** and is **NOT forced into the modern B-Plan schema.** It is judicially voidable as **funktionslos** (OVG Berlin-Brandenburg, Az. 2 B 10.17, 15 Sep 2020), so it ships **CAPPED at `corroborated, voidance-risk` — NEVER `structured`** (consistent with `de/COUNTRY-DATA-STRATEGY.md` Engine 5). A case-law voidance check is required per area before any figure is used.

### (c) §34 BauGB (unplanned interior)
A **cited REFUSAL** — and that is a **POSITIVE answer**, not a data gap. No numeric envelope exists by law ("Einfügen in die Eigenart der näheren Umgebung"). The correct output:
> *"This parcel lies in an unplanned interior area (§34 BauGB). No numeric building envelope is defined — buildability is assessed case-by-case."*

§34 is documented as covering large parts of former East Berlin.

---

## 2 — Honesty guardrails (identical to the Köln convention)

- **BauNVO §17 orientation values are NEVER a parcel answer.** They are national density ceilings, not a plan's Festsetzung.
- **No OSM / neighbour / uncited-OCR values.** Ever.
- **Per-FIELD confidence + source-chain provenance:** every value carries `{value → document → section → confidence}`.
- **Setbacks per BauO Bln §6 formula.** The exact multiplier is **PROBE-REQUIRED — do NOT copy NRW's 0.4H unverified for Berlin.**
- **Confidence ladder:** `unknown → extracted → corroborated → verified` (Baunutzungsplan capped at `corroborated, voidance-risk`).

---

## 3 — Status

No plan has been extracted. All zone rows are `unknown` / `PENDING` with the reason stated in `LEGISLATION.csv`. The first extraction target is fixture `plans/8-30-neukoelln/` (Bebauungsplan 8-30, Neukölln, festgesetzt 2018-11-20).

---

**Related:** `LEGISLATION.csv` · `EXTRACTION-PIPELINE.md` · `gis/bplan-source.json` · `gis/legislation-record.json` · `SOURCES.md` · `../../COUNTRY-DATA-STRATEGY.md` (Engine 5)
