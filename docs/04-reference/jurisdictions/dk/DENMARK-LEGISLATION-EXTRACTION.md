# Denmark — LEGISLATION extraction (the signed Plandata FIELD→C63 mapping)

> **What this is.** The founder's standard per-country legislation extraction, for **Denmark** —
> the **structured-data exemplar**, the one country where ~100% legislation fill is genuinely
> *reachable* because Plandata.dk is machine-readable and the **L-449 mapping is SIGNED**.
>
> **The honest nuance that makes Denmark different (read this first).** Denmark's legislation is
> **per-PLAN** (`lokalplan` / `lokalplandelområde` / `kommuneplanramme`), **NOT per-zone-table** like
> Zürich's BZO or Madrid's Normas Zonales. So the founder's "one row per zone" worksheet **does not
> cleanly map**. Denmark's structure is: a parcel → its **governing plan** (resolved by the instrument
> chain) → **that plan's Plandata fields**. The extraction is therefore **not a static zone
> dictionary** — it is the **signed Plandata FIELD→C63 mapping, applied per-plan**. This document is
> that mapping, per the standard **PART A / PART B / PART C** schema.
>
> **THE RULE (identical to every jurisdiction): field-cited, or it does not ship.** Every mapped
> output below carries its **BR18 §** or its **Plandata WFS field**. A field Plandata leaves empty is
> honest **`unknown`** — never a guess, never `0` for an absent value (`null` ≠ `0`). This is the same
> L-449 gate Barcelona passed clau-by-clau and Zürich passed for its BZO table.
>
> **Companion machine form:** [`DENMARK-LEGISLATION-EXTRACTION.json`](./DENMARK-LEGISLATION-EXTRACTION.json)
> (`schema: jurisdiction-legislation-extraction/part-abc`). **Signed source:**
> [`dk-PLANDATA-ENVELOPE-MAPPING.md`](./dk-PLANDATA-ENVELOPE-MAPPING.md) (L-449). **Gap roadmap:**
> [`DENMARK-GAP-ROADMAP.md`](./DENMARK-GAP-ROADMAP.md). **National rate:**
> [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (~96%). **Sign-off gate:**
> [`sources/VERIFICATION.md`](./sources/VERIFICATION.md).

---

## Why there is no per-zone table (the per-plan structure)

The founder's exemplar worksheet (Madrid/Zürich) is **one row per zone** — a fixed dictionary keyed
on a zone code (`NZ4.1`, `W2b`). **Denmark has no such dictionary.** A Danish parcel is governed by
the **tightest instrument that publishes a number**, selected along the chain:

```
point → byggefelt (footprint) → lokalplandelområde → lokalplan → kommuneplanramme
        (§USABLE-FALLBACK: fall through to the richer framework where the tighter one is silent, L-608)
```

Each of the ~66k delområder / ~38k lokalplaner / ~51k rammer carries **its own** `bebygpct`,
`maxbygnhjd`, `maxetager`, `anvendelsegenerel`. There is no finite set of "zones" to transcribe — the
values live on **plan features**, resolved live per parcel. So the extraction that ships is the
**MAPPING** (which is fixed and signed), not a values table (which is per-plan and machine-read at
query time). This is exactly the shape that makes Denmark the ceiling: the numbers already exist as
data; the only thing a human had to sign was **how each field maps to a C63 envelope output**.

---

## PART A — LEGISLATION: the reachable win (Plandata field → C63, `structured`)

The signed L-449 mapping. Each Plandata WFS attribute → a C63 `structuredFields` output, with its
BR18/Plandata basis, its densityScope treatment, and its confidence. **`structured`** = Plandata
delivers the field machine-readably (no PDF read) — this is the **~96%** that IS reachable.
**`unknown`** = the field is legitimately empty/unencoded for the governing plan (a per-plan
data-quality residual), **not a code gap**.

| Plandata WFS field | Legal name (BR18 / Plandata) | → C63 output | Rule | densityScope | Confidence | `unknown` when |
|---|---|---|---|---|---|---|
| **`bebygpct`** | *bebyggelsesprocent* (`maksbebyggelsesprocent`) | `plotRatioFAR` (FAR / maxUtilisation) | **`FAR = bebygpct / 100`** | **scope-gated** (parcel → FAR; property / planningArea / unknown → **withheld**) | **`structured`** | field empty **or** scope ≠ parcel / unencoded |
| **`maxbygnhjd`** | *maks. bygningshøjde* (`maksbygningshøjde`) | `maxHeight_m` | direct passthrough (**metres**, per BR18 measurement) | n/a — absolute cap, scope-independent | **`structured`** | field empty |
| **`maxetager`** | *maks. antal etager* | `maxFloors` | floor to an int (e.g. `3.5` incl. attic → `3`; never over-stated) | n/a — absolute cap | **`structured`** | field empty |
| **`anvendelsegenerel` / `anvgen`** | *generel anvendelse* (permitted use) | `permittedUse[]` | classify onto the C58 closed vocabulary (`mapPlandataToZoningRecord`) | n/a | **`structured`** | use absent/unclassifiable |
| **`doklink`** | plan-document link | `ordinanceRef` | governing-document PDF citation (C58 §1.3) | n/a | **`structured`** | — |
| *(no field)* | *grundoverdækning* (ground coverage %) | `maxCoverage` | **`null` — no plan-field source** (bebygpct is FAR, not coverage; reusing it = fabrication) | n/a | **`unknown`** (`no-source`) | always today (see roadmap G3/G7) |
| *(no field)* | *byggelinjer* (per-edge setbacks) | `setbacks` | **`null` — separate dataset**, not on the plan feature; `null` ≠ `0` | n/a | **`unknown`** (`separate-dataset`) | always today (see roadmap G2) |

### A.1 — The `FAR = bebyggelsesprocent / 100` basis (BR18 §168–186)

BR18 (bygningsreglementet.dk §168–186) defines *bebyggelsesprocent* as **"etagearealets procentvise
andel af grundens areal"** — gross floor area ÷ site area × 100. That **is** a floor-area ratio as a
percentage, so `FAR = bebygpct / 100` (40 % → 0.40; 120 % → 1.20). It is **NOT** ground coverage → it
maps to `plotRatioFAR` **only**; `maxCoverage` stays `null`.

### A.2 — The densityScope HARD REQUIREMENT (the FAR denominator)

`bebyggelsesprocent` is a **ratio**, and BR18 makes its **denominator legally variable**. The same
40 % means three different things:

| `densityScope` | Danish basis | The % is *of* | Envelope treatment |
|---|---|---|---|
| `parcel` | *det enkelte matrikelnummer* / *grundens areal* | this parcel | **FAR = pct/100** (a real number the envelope may use) |
| `property` | *den enkelte ejendom* (may span several matrikler) | the whole property | **FAR WITHHELD** (`null` + cited reason) |
| `planningArea` | *området som helhed / under ét* | the whole plan area (shared budget) | **FAR WITHHELD** (`null` + cited reason) |

**Height and storeys are absolute caps → scope-independent → always pass through. Only the FAR ratio
is scope-gated.** The engine's FAR denominator (`farLimitedHeight.ts::computeFarLimitedHeight`,
`maxGFA = maxFAR × parcelAreaM2`) is **hardwired to the parcel**, so the only FAR value correct to feed
it is a **parcel-scoped** one. **Unknown ≠ parcel** — if the scope attribute is not ingested, FAR is
**withheld**, so the volume is honestly under-stated rather than confidently over-stated (the
*envelope-solid-overstates-partial-data* failure class). This is roadmap **G1**, and the current rule
is CORRECT — keep it.

### A.3 — What is `structured` vs `unknown` (the honest split)

- **`structured` (the ~96% reachable win):** `bebygpct` (FAR, scope-permitting), `maxbygnhjd`
  (height), `maxetager` (storeys), `anvendelsegenerel` (use), `doklink` (citation). Plandata delivers
  these as first-class WFS attributes; ≈87% of byzone clicks return ≥1 usable dimension purely
  structured (L-609), rising to the ~96–97% born-digital-text ceiling (L-611). No PDF read.
- **`unknown` (honest, per-plan, NOT a code gap):** any of the above where **Plandata leaves the field
  empty** for the governing plan (a data-entry / data-quality residual at source), **plus** `maxCoverage`
  (no plan-field source) and `setbacks` (separate `byggelinjer` dataset). `null` ≠ `0`.

---

## PART B — PARCEL: matrikel-dk (survey-grade, credential-DEFERRED)

| | |
|---|---|
| **Register** | **Matriklen / matrikel-dk** (`jordstykke` parcels) — national, **survey-grade** |
| **Authority** | SDFI (Matriklen2) · CRS EPSG:25832 |
| **Access** | **DEFERRED** — Datafordeler administrator/service-user bootstrap requires a Danish **MitID** identity PRYZM cannot obtain (same access class as Swedish **BankID**) |
| **Access status** | **access-deferred — a MitID/BankID-class access gap, NOT a code gap** (C58 §1.4, not fabricatable). **Never claim live.** |
| **Fallback** | **OSM building footprint** — graceful, honestly labelled, never a fabricated parcel |
| **Code** | `parcelProviders/dkMatrikelParcelProvider.ts` — a **deferred stub**: `fetchParcelAtPoint` returns `null` (no live access attempted), never-throws, typed OTel span. The Datafordeler adapter is a **single method-body swap** behind the `// DEFERRED:` seam. Registry key `matrikel-dk` (`isInDenmark`). |

The parcel geometry exists nationally and is survey-grade; the only blocker is the credential gate.
See roadmap **G8** (3 solution paths: official Datafordeler / municipal-open mirrors / partner
ingestion).

---

## PART C — META: Plandata.dk WFS (keyless, national, machine-readable)

| | |
|---|---|
| **Register** | **Plandata.dk** — the Danish national plan register (Erhvervsstyrelsen / Danish Business Authority) |
| **Endpoint** | `https://geoserver.plandata.dk/geoserver/wfs` — **WFS 2.0, keyless / open** |
| **Machine-readable** | **YES** — first-class WFS attributes on the adopted plan features (the whole reason Denmark is the ceiling) |
| **Coverage** | **National** — one register, no per-municipality schema variation; resolves anywhere in DK |
| **CRS** | EPSG:25832 (ETRS89 / UTM 32N) — metric; shoelace yields m² directly |
| **License** | Open public data (Plandata.dk) |
| **Verified** | **VERIFIED-LIVE 2026-07-23** (unauthenticated GetCapabilities + DescribeFeatureType + `resultType=hits`) |
| **Code** | `server/plandataZoningProxy.js` (keyless same-origin proxy) → `DkZoningProvider.ts` → `mapPlandataToZoningRecord.ts` (pure field→ZoningRecord mapping) |

Layers used (national feature counts, `resultType=hits`, 2026-07-23): `lokalplandelområde` 66,220 ·
`lokalplan` 37,974 · `kommuneplanramme` 50,627 · `byggefelt` 57,031 · `zonekort_samlet_v` (byzone) 98.

---

## The one remaining measurement (the honest residual to close Denmark)

Denmark's legislation is **structured + signed** → the C63 **LEGISLATION axis is DERIVED-READY** as a
**`structured-national-prior`** (~96% national ceiling). **What is NOT yet done, and must not be
hand-typed:** the **per-city Plandata-population fraction** — the fraction of *that city's*
lokalplaner / rammer with **populated** Plandata fields. That is a **MEASUREMENT** (a byzone
click-weighted fill scoped to the city bbox), not a number to type. Until it is run per city, each
city's LEGISLATION cell stays `not-assessed` — **borrowing the ~96% country prior would be the
§CONTEXT-DATA-HONESTY country-borrow trap**. Running that measurement (per 0101/0751/0461/0851 bbox) +
landing the Danish-planner sign-off is what closes Denmark to its ~96% ceiling.

**The ~96% legislation rate is unchanged by any of the gaps below** — those are ENVELOPE-realism gaps,
not legislation-fill gaps.

---

*Authority: C58 (fidelity/provenance) · C63 §3/§4 (LEGISLATION axis, 25% weight) · ADR-0269
(curate-then-serve) · ADR-0270 (setback/alignment/explicit-area rule union) · L-449 (the human sign-off)
· BR18 §168–186 (primary legal source). Feeds: `COUNTRY-RATE.md` Axis 2 · `LEGISLATION-RATE.md`.
Companions: `dk-PLANDATA-ENVELOPE-MAPPING.md` (signed source) · `DENMARK-GAP-ROADMAP.md` (10-gap
envelope-realism roadmap) · `DENMARK-LEGISLATION-EXTRACTION.json` (machine form) · `sources/SOURCES.md`
+ `sources/VERIFICATION.md`. Created 2026-07-30. Maintainer: UNASSIGNED.*
