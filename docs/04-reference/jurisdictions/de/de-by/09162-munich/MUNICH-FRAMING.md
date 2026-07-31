# Munich / München (`09162`) — Architectural framing (STUB)

**Country:** `de` · **Land:** Bayern (Bavaria) · **ISO 3166-2:** `DE-BY` · **AGS:** `09162000` ·
**CRS:** EPSG:25832 (ETRS89 / UTM 32N) · **Captured by:** founder-research · **Last updated:** 2026-07-31 ·
**Status:** STUB — architectural framing only. **All planning numbers UNKNOWN — DATA PENDING from
founder.**

> **This is a stub, not a dossier.** It captures the founder's framing for how Munich fits the
> [Germany City Adapter Contract](../../GERMANY-CITY-ADAPTER-CONTRACT.md). The full PART-A/B/C
> dossier awaits the founder's Munich DATA (endpoint probes + one B-Plan sample — see §7). Every
> GRZ/GFZ/Vollgeschosse/height is `null`. No numeric planning value is invented here.

> **§CONTEXT-DATA-HONESTY.** An OSM footprint is never a legal answer. Where the pipeline cannot
> cite a rule it must return a typed *refusal* (§34) or a typed *unknown*, never a fabricated value.

---

## 1 — Where Munich sits on the reuse curve

Munich is the **second** German city after Berlin. Per the adapter contract, it reuses the shared
engine and contributes only the Bavaria-specific 20%.

- **~80–85% of the Berlin pipeline reuses** — parcel pipeline, regime classifier (§30/§34/§35),
  B-Plan GIS adapter pattern, rule-extraction engine, PDF extractor.
- **~15–20% is Bavaria-specific** — the BayBO setback formula, the Bavarian B-Plan endpoint/field
  names, and LoD2 availability.

Munich is a **HARDER legal test than Berlin** in two ways (different building law, harder data
access) but **SIMPLER in one way**: it mostly **lacks Berlin's Baunutzungsplan 1958/60 legacy
layer** — the extra West-Berlin Baustufe parser most cities do not need. (This is *unconfirmed-
absent* for Munich, not systematically probed — see README §6.)

---

## 2 — Bavaria-specific: the building code (BayBO Art. 6 Abstandsflächen)

The citable Bavarian setback rule:

> **BayBO Art. 6 Abstandsflächen = 0.4 · H, minimum 3 m.**

- **Article:** BayBO **Art. 6** — **VERIFIED-per-founder**.
- **Exact paragraph (Absatz) + H-measurement clauses:** **PROBE** — to be read from BayBO primary
  text before it gates production. Bavaria historically applied a 1H multiplier, reduced to 0.4H in
  certain (dense-urban) configurations under Art. 6 Abs. 5; confirm the exact current wording and
  which zones the 0.4H applies to (README §5).
- **Coded once per Land.** One BayBO Abstandsflächen function serves every Bavarian municipality —
  this is the per-Land 20%, not per-city work. It is a **function of H**, so no per-zone setback
  metre is fabricated; the setback column stays `unknown` at the zone level (the correct honest
  state, mirroring NRW).

---

## 3 — Bavaria-specific: data access

Data access is **harder than Berlin**.

- **Portal:** Bayern Geoportal.
- **XPlanung population depth: uncertain — PROBE.** No Munich/Bavaria B-Plan WFS endpoint has been
  discovered; all probed paths return 404 (`LEGISLATION-RATE.md`). Whether the structured GRZ/GFZ/
  Höhe fields are populated (vs living only in the Satzung PDF) is unknown.
- **DiPlanung timing risk:** Bavaria's mandatory statewide XPlanung delivery platform (DiPlanung)
  goes live **31 October 2026**. A Munich integration built before that date targets an interim
  system. Build the B-Plan adapter over an abstraction so migrating to DiPlanung is a URL/auth
  config change, not a rewrite (README §1). Status: MONITORING.

---

## 4 — Bavaria-specific: LoD2 / building height

- **LoD2 route:** ZSHH (Bavarian survey office, Bayerische Vermessungsverwaltung).
- **Licence: UNCLEAR.** The LAND-REGISTRY already flags Bayern LoD2 as **"TBD"**. Hosting at the
  state survey office is **not** confirmation of open terms — read the `geodaten.bayern.de` /
  BayernAtlas LoD2 product page before building any LoD2 pipeline.
- **BuildingHeightProvider priority:**
  1. **Bayern LoD2** (ZSHH route — licence UNCLEAR, PROBE)
  2. **ALKIS Traufhöhe** (eaves-height fallback)
  3. **fallback** (assumed / OSM context only — **never** a legal height for the subject site)

---

## 5 — Honest rate framing (PROJECTED — no RATE cell asserted)

All figures below are **PROJECTED / CONVERGENT**. The composite [`RATE.md`](./RATE.md) keeps the
legal axes `not-assessed` — no scorecard number is asserted here.

| Signal | Today | After wiring | After extraction + rulepacks |
|---|---|---|---|
| **LEGISLATION** | **~18%** (hand-authored prior, `LEGISLATION-RATE.md`; UNVERIFIED — no signed `VERIFICATION.md`, no rule pack) | — | — |
| **HEIGHTS** | licence-blocked (Bayern LoD2 TBD) | — | — |
| **PARCEL** | partial (ALKIS Bavaria licence-gated → footprint-fallback today) | — | — |
| **Composite (projected)** | — | **~55–65%** (PROJECTED) | **~65–75%** (PROJECTED) |

- **§34 = cited REFUSAL** is the correct machine answer for unplanned interior parcels — a positive
  result, not a gap. Munich's §34 fraction is **UNMEASURED**.
- The ~18% and both projections are marked **PROJECTED/CONVERGENT**; none is a measured rate.

---

## 6 — First MVP target

**München Innenstadt — one working, cited legal answer.** Not all of Munich. A single dense-core
parcel that resolves coordinate → Flurstück → §30 B-Plan → cited Festsetzungen → envelope is the
proof the Bavaria adapter works.

---

## 7 — What the founder must still provide (Munich DATA)

This stub cannot become a dossier until the founder supplies:

1. **The B-Plan endpoint** — the Munich/Bavaria B-Plan WFS (or the DiPlanung API) URL, feature-type
   name, and field names (`planId` / `geometry` / `documentUrl` / `effectiveDate` equivalents).
2. **One sample B-Plan** — a Satzung PDF plus its XPlanGML record, to validate the document
   extractor and confirm whether GRZ/GFZ/Höhe are structured or PDF-only.
3. BayBO Art. 6 exact Absatz + H-measurement clauses (primary-text read).
4. Bavaria LoD2 (ZSHH) licence terms.
5. §34 coverage fraction over the Munich bbox (grid-sample probe).

---

**Related:** [`../../GERMANY-CITY-ADAPTER-CONTRACT.md`](../../GERMANY-CITY-ADAPTER-CONTRACT.md) ·
[`README.md`](./README.md) (pack structure, DiPlanung risk, BayBO Art. 6) ·
[`RATE.md`](./RATE.md) · [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) ·
[`dossier.json`](./dossier.json) · `../../LANDS/BAYERN.md` · `../../LAND-REGISTRY.md`.

*Last updated: 2026-07-31. STUB — founder framing capture. BayBO Art. 6 article VERIFIED-per-founder
(exact paragraph PROBE); rate figures PROJECTED; §34 = cited refusal. No GRZ/GFZ/height fabricated.*
