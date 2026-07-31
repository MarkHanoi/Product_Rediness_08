# Hamburg (`02000`) — Architectural framing (STUB)

**Country:** `de` · **Land:** Hamburg (city-state) · **ISO 3166-2:** `DE-HH` · **AGS:** `02000000` ·
**CRS:** EPSG:25832 (ETRS89 / UTM 32N) · **Captured by:** founder-research · **Last updated:** 2026-07-31 ·
**Status:** STUB — architectural framing only. **All planning numbers UNKNOWN — DATA PENDING from
founder.**

> **This is a stub, not a dossier.** It captures the founder's framing for how Hamburg fits the
> [Germany City Adapter Contract](../../GERMANY-CITY-ADAPTER-CONTRACT.md). The full dossier awaits
> the founder's Hamburg DATA (live WFS probe + one B-Plan sample — see §7). Every GRZ/GFZ/
> Vollgeschosse/height is `null`. No numeric planning value is invented here.

> **§CONTEXT-DATA-HONESTY.** An OSM footprint is never a legal answer. Where the pipeline cannot
> cite a rule it must return a typed *refusal* (§34) or a typed *unknown*, never a fabricated value.

---

## 1 — Why Hamburg is the thesis's best validation

Hamburg's failure mode is the cleanest proof of the core PRYZM thesis:

> **The GIS exists; the missing piece is converting DOCUMENTS into cited legal rules.**

Hamburg has **excellent digital infrastructure but SHALLOW structured planning attributes.**
XPlanung is mature and Hamburg (a city-state) has full B-Plan coverage. The B-Plan WFS exposes plan
**geometry** + **plan_id** + a **PDF/document link** (`planrecht`) — but the numeric Festsetzungen
(**GRZ / GFZ / height**) are **often NOT populated** in the WFS attributes. They live in the linked
Satzung PDF. So even Germany's best-digitised city still requires **document-first extraction** — a
direct demonstration that the bottleneck is the legal document-to-rule compiler, not GIS
acquisition.

---

## 2 — Where Hamburg sits on the reuse curve

- **Reuses ~90% of the pipeline** — parcel pipeline, regime classifier, B-Plan GIS adapter pattern,
  rule-extraction engine, PDF extractor.
- **Regime classifier is EASIER than Berlin** — **no Baunutzungsplan legacy branch**. Just the
  federal §30 / §34 / §35 chain. (Hamburg's 900 pre-1960 plans are migrated into XPlanGML, not a
  separate parser; the open item is citation preservation, not a legacy code path — README §1.)

---

## 3 — GIS adapter (Geoportal Hamburg)

| Field | Value | Confidence |
|---|---|---|
| Portal | Geoportal Hamburg | founder-framing |
| Protocol | WFS (XPlanung, mature) | founder-framing |
| Endpoint hint | `geodienste.hamburg.de` (B-Plan WFS) | **mark per founder — live-probe PENDING** |
| `idField` | `plan_id` | per founder — probe |
| `documentField` | `planrecht` (PDF/document link) | per founder — probe |
| CRS | EPSG:25832 | Land-native |

**Failure mode to design around:** the WFS returns plan geometry + `plan_id` + `planrecht` link, but
GRZ/GFZ/height are often null → the `documentExtractor` slot does the real work.

---

## 4 — Hamburg-specific: the building code (HBauO §6)

- **Land building code:** **Hamburgische Bauordnung (HBauO) §6 Abstandsflächen** —
  **VERIFIED-per-founder** as the governing setback statute.
- **Exact multiplier + minimum: PROBE.** **Do NOT copy Berlin/NRW's `0.4·H` unverified for
  Hamburg.** Read HBauO §6 primary text before it gates production. (The existing README §5 offers
  ~0.4H/min 3 m only as an *expectation*, not a confirmed figure — treat it as PROBE.)

---

## 5 — Hamburg-specific: LoD2 / building height

- **Route:** Hamburg 3D-Gebäudemodell (CityGML).
- **Licence: PROBE.** If open, it is one of Germany's strongest LoD2 sources; if restricted, fall
  back to **ALKIS Traufhöhe** (eaves height). OSM footprints are context-only, never a legal height
  for the subject site.

---

## 6 — Honest rate framing (PROJECTED — no RATE cell asserted)

All figures below are **PROJECTED / CONVERGENT**. The composite [`RATE.md`](./RATE.md) is
`not-assessed` (research-only, not bake-covered) — no scorecard number is asserted here.

| Signal | Value |
|---|---|
| **LEGISLATION today** | **~30%** (legacy structured-fill prior, `LEGISLATION-RATE.md`; UNVERIFIED) |
| After adapter (projected) | **~40–60%** (PROJECTED) |
| After PDF extraction (projected) | **~60–70%** (PROJECTED) |
| Composite (projected) | **~65–75%** (PROJECTED) |

- **§34 = cited REFUSAL** — a positive machine answer for unplanned interior parcels, not a gap.
  Hamburg's §34 fraction is **UNMEASURED** (assumed small — continuous West-German fabric, full
  XPlanung migration).
- Every figure above is marked **PROJECTED/CONVERGENT**; none is a measured rate.

---

## 7 — First MVP target + what the founder must still provide

**First MVP target: Hamburg-Mitte** — dense, many B-Plans; one working, cited legal answer (not all
of Hamburg).

The stub cannot become a dossier until the founder supplies:

1. **The B-Plan WFS endpoint** — confirmed URL, feature-type name, and field names (`plan_id` /
   `planrecht`), plus a live GetCapabilities/GetFeature probe.
2. **One sample B-Plan** — a Satzung PDF plus its XPlanGML record, to validate the extractor and
   **measure the GRZ/GFZ/Höhe null-rate** (the single largest open question, README §6).
3. HBauO §6 exact multiplier + minimum (primary-text read).
4. Hamburg 3D-Gebäudemodell (LoD2 CityGML) licence terms.
5. §34 coverage fraction over the Hamburg bbox (grid-sample probe).

---

**Related:** [`../../GERMANY-CITY-ADAPTER-CONTRACT.md`](../../GERMANY-CITY-ADAPTER-CONTRACT.md) ·
[`README.md`](./README.md) (why Hamburg first, XPlanung coverage, HBauO) ·
[`RATE.md`](./RATE.md) · [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) ·
[`dossier.json`](./dossier.json) · `../../LANDS/HAMBURG.md` · `../../COUNTRY-DATA-STRATEGY.md`.

*Last updated: 2026-07-31. STUB — founder framing capture. HBauO §6 governing statute
VERIFIED-per-founder (exact multiplier PROBE — 0.4H NOT copied); rate figures PROJECTED; §34 = cited
refusal. No GRZ/GFZ/height fabricated.*
