# Germany — City Adapter Contract (reusable-pattern design)

**Country:** `de` · **Scope:** all German cities · **Kind:** DESIGN / architecture doc —
**proposed interfaces, NOT yet built** · **Last updated:** 2026-07-31 ·
**Maintainer:** UNASSIGNED · **Status:** ARCHITECTURE FRAMING (founder-directed) — no code shipped;
`packages/site-parcel-data/src/rulepacks/registry.ts` has **zero** DE packs today.

> **What this document is.** A design contract that captures the founder's strategic framing for
> scaling PRYZM across German cities. It describes **proposed** TypeScript interfaces and a shared
> pipeline. None of it is wired yet. Every per-city planning number (GRZ/GFZ/height) referenced
> anywhere in the German dossiers is `null`/`unknown` — this doc invents none.

> **§CONTEXT-DATA-HONESTY.** OSM footprints, neighbouring parcels, and typical-district rules are
> **never** a legal answer. The engine below emits a typed *refusal* or a typed *unknown* when it
> cannot cite a rule — it never fabricates a value to fill a cell.

---

## 1 — The strategic payoff

**The expensive asset is the German legal-extraction ENGINE, not each city.**

Berlin is the first German city and pays 100% of the engine cost: the parcel pipeline, the regime
classifier, the B-Plan GIS adapter pattern, the rule-extraction engine, and the PDF extractor are
all built once, for Berlin. Every subsequent German city reuses ~80% of that engine and contributes
only ~20% new code — the Land building code, the city's B-Plan endpoint/field names, its LoD2
availability, and any city-specific legacy regime.

**New-code-per-city (design projection, not measured):**

| City | New code | What is new |
|---|---|---|
| **Berlin** | **100%** (first) | builds the entire engine + its own Land code (BauO Bln) + Baunutzungsplan 1958/60 legacy branch |
| **Munich** | **~20%** | BayBO (Bavaria) setback + Bavarian B-Plan endpoint/fields + LoD2 (ZSHH) availability |
| **Hamburg** | **~20%** | HBauO (Hamburg) setback + Geoportal Hamburg endpoint/fields + Hamburg 3D LoD2 |
| **Köln** | **~20%** | BauO NRW setback (already captured) + GDI-NW ALKIS routing (already open) |
| **Stuttgart** | **~20%** | LBO BW setback + GDI-BW endpoint/fields + LoD2 BW |

> Percentages are a **design estimate of the founder's thesis**, not a code-line measurement. They
> express the shape of the investment, not a benchmarked figure.

---

## 2 — The contract

```ts
// PROPOSED — not yet built. packages/site-parcel-data/src/germany/
interface CityPlanningAdapter {
  parcelProvider:     AbstractALKISProvider;   // coordinate -> Flurstück (cadastre)
  planningProvider:   AbstractBPlanProvider;   // Flurstück -> B-Plan (plan geometry + document link)
  documentExtractor:  DocumentExtractor;       // Satzung PDF -> raw Festsetzungen (GRZ/GFZ/Z/Höhe)
  legalRuleMapper:    LegalRuleMapper;         // raw Festsetzungen -> typed rule record
  setbackProvider:    AbstractSetbackProvider; // Land Bauordnung Abstandsflächen (function of H)
}
```

The five adapter slots are the **only** per-city surface. Everything the adapters plug into is
shared.

---

## 3 — The shared engine (built once, for Berlin)

```
coordinate (lat,lon)
   │
   ▼
GermanyBoundaryResolver        ── is-in-Germany + which Land (AGS/ISO 3166-2)
   │
   ▼
Land resolver                  ── selects the Land rulepack + Bauordnung setback provider
   │
   ▼
ALKIS Flurstück lookup         ── AbstractALKISProvider (per-Land WFS, national schema)
   │
   ▼
Regime classifier (§30/§34/§35)── Germany-wide; §34 = cited REFUSAL, not a number
   │
   ▼
B-Plan extractor               ── plan geometry + planId + documentUrl + effectiveDate
   │
   ▼
Rule mapper                    ── raw Festsetzungen -> { GRZ, GFZ, Z, Höhe } typed output shape
   │
   ▼
Envelope solver                ── buildable massing under the derived constraints
```

Only the **adapters** (§2) and the **rulepacks** change per city. The classifier, the output
shapes, the solver, and the PDF extractor are constant.

---

## 4 — Reusable (~80%) vs per-city (~20%)

### Reusable across all German cities (~80%)

| Component | Why it is Germany-wide |
|---|---|
| **Parcel pipeline** (`AbstractALKISProvider`) | ALKIS Objektartenkatalog (Gemarkung / Flur / Flurstück) is a **national** schema; only the per-Land WFS endpoint + auth change |
| **B-Plan GIS adapter pattern** | every city's B-Plan service exposes the same shape — `planId` / `geometry` / `documentUrl` / `effectiveDate`; only endpoint + field names differ |
| **Regime classifier (§30/§34/§35)** | BauGB is **federal law**; the §30 / §34 / §35 branch is identical nationwide; §34 → cited refusal everywhere |
| **Rule-extraction engine** | the `{ GRZ, GFZ, Z, Höhe }` output shape (BauNVO §17 orientation ceiling is national) is constant; only the source document changes |
| **The PDF extractor** | the German Nutzungsschablone / Festsetzungen layout is standardised enough that one OCR + parser serves every city's Satzung PDF |

### Per-city / per-Land (~20%)

| Component | Why it changes per city |
|---|---|
| **The Land building code (setback formula)** | Abstandsflächen live in the **Landesbauordnung**, which differs per Land — **BauO Bln §6** (Berlin) vs **BayBO Art. 6** (Bavaria) vs **BauO NRW §6** vs **HBauO §6** (Hamburg). Each is coded once per Land, not per city. |
| **The city's B-Plan endpoint + field names** | e.g. Berlin `gdi.berlin.de/services/wfs/plu_bplan` (`inhalt`); Hamburg `geodienste.hamburg.de` (`planrecht`). Same shape, different strings. |
| **LoD2 provider availability** | per-Land: Berlin open, NRW open (VERIFIED-LIVE), Bavaria (ZSHH) licence UNCLEAR, Hamburg 3D model PROBE. |
| **City-specific legacy regimes** | Berlin's **Baunutzungsplan 1958/60** (§173(3) BBauG, Baustufe grading, voidance risk) — a whole extra parser most cities do **not** need. |

---

## 5 — Provider structure (proposed layout)

```
packages/site-parcel-data/src/germany/
  providers/
    alkis/       AbstractALKISProvider.ts     BerlinALKISProvider.ts  MunichALKISProvider.ts  ...
    planning/    AbstractBPlanProvider.ts     BerlinBPlanProvider.ts  HamburgBPlanProvider.ts ...
    buildings/   AbstractBuildingProvider.ts  <City>BuildingProvider.ts   (LoD2 / Traufhöhe)
  rulepacks/
    de/
      berlin/    munich/    hamburg/    koeln/    stuttgart/   …
```

`Abstract*.ts` = the shared contract; `<City>*.ts` = the ~20% per-city implementation.

---

## 6 — Reuse ranking after Berlin + Munich + Hamburg

Once three cities across three Länder (Berlin/BauO Bln, Munich/BayBO, Hamburg/HBauO) are working,
the reuse profile hardens. The following is the founder's design ranking — how much of each
component is expected to carry over to the **fourth** city (e.g. Köln/NRW):

| Component | Reuse to next city | Note |
|---|---:|---|
| **ALKIS routing** (coordinate → Land → Flurstück) | **100%** | national schema; add one endpoint row |
| **AGS / Land resolver** | **100%** | federal administrative keying |
| **Rule-JSON schema** (`{ GRZ, GFZ, Z, Höhe }` output shape) | **100%** | national output contract |
| **BauO setback interface** (`AbstractSetbackProvider`) | **100%** | interface constant; the *formula body* is the per-Land 20% |
| **Regime classifier (§30/§34/§35)** | **100%** | BauGB federal |
| **B-Plan geometry adapter** | **90%** | same shape; new endpoint + field-name mapping |
| **PDF extractor** | **90%** | same Nutzungsschablone parser; per-city layout tuning |
| **City-specific rules** (Land setback body, legacy regimes, LoD2 wiring) | **10–20%** | the genuine per-city cost |

**Conclusion.** Once Berlin + Munich + Hamburg work, **Köln/NRW is mostly a data-routing
exercise** — the ALKIS source is already open and captured (`de-nw/05315-koeln/PARCEL.md`,
`NRW-SETBACK-ENGINE.md`). The bottleneck across the whole programme is the **legal
document-to-rule COMPILER** (the Satzung-PDF → cited-rule extractor), **not GIS acquisition**. The
GIS exists; converting scanned Festsetzungen into cited, human-gated legal rules is the work.

---

## 7 — Honesty guardrails (binding on any future implementation)

- **No numeric planning value is asserted here.** Every GRZ/GFZ/Vollgeschosse/height in the German
  dossiers is `null`/`unknown` pending human-gated extraction (L-449).
- **§34 is a positive answer, not a gap.** For unplanned interior parcels the engine returns a
  **cited refusal** — there is no numeric envelope by law. Germany's human-review ceiling is
  ~65–70% precisely because of the permanent ~30% §34/§35 discretionary floor (see
  `COUNTRY-DATA-STRATEGY.md`).
- **Setback multipliers are per-Land and must be read from primary text.** Do **not** copy one
  Land's `0.4·H` into another Land unverified.
- **The WFS is a plan LOCATOR, not a rule table.** GRZ/GFZ/height live in the linked Satzung PDF and
  are typically **not** populated in WFS/XPlanGML metadata.

---

**Related:** `README.md` (country umbrella) · `COUNTRY-DATA-STRATEGY.md` (the ~28%/~65–70% ceiling
analysis) · `de-be/11000-berlin/` (the first-city engine build) ·
`de-by/09162-munich/MUNICH-FRAMING.md` · `de-hh/02000-hamburg/HAMBURG-FRAMING.md` ·
`de-nw/05315-koeln/NRW-SETBACK-ENGINE.md`.

*Last updated: 2026-07-31. Kind: DESIGN / architecture — proposed interfaces, not yet built.
Founder-directed framing capture. No per-city numeric value fabricated.*
