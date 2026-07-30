# Country Data Strategy — Germany (`de`)

<!-- Instantiation of ../_TEMPLATE/COUNTRY-DATA-STRATEGY-TEMPLATE.md for Germany. Sits ABOVE RATE.md
(the number) and RATE-IMPLEMENTATION-PLAN.md (the climb). Every <…> filled from the 2026-07-24 live
spike (findings/GERMANY-DATA-RECON-SPIKE.md). No honesty rule deleted. -->

**Country:** Germany · **ISO 3166-1:** `DE` · **National join key:** AGS (Amtlicher Gemeindeschlüssel, 8-digit) ·
**Legal-plan unit:** Bebauungsplan (B-Plan, §30 BauGB) — but see the regime split below: a B-Plan governs
only ~60% of parcels; §34/§35 govern the rest ·
**Fragmentation:** 16 Länder × 16 ALKIS licence regimes × per-Land XPlanung delivery platforms; ~11,000 municipalities ·
**Proven-minimum rate:** ~28% (see `RATE.md`) · **Realistic ceiling:** ~35–40% (scan-corpus / PDF path) → ~55–65% (content-vectorised path, conditional) · **Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> **The question this country must answer, per parcel:** which of four legal **regimes** governs it →
> then, only for §30 parcels, zone/use · a density metric (GRZ + **Z storeys**, rarely GFZ/height-m) ·
> setbacks (Abstandsflächen, a per-Land formula). The rate is *how many parcels get all of those as
> machine-readable data, with no human opening a PDF.* Germany's twist vs France: the **regime
> classification runs first**, and for ~30% of parcels (§34) the correct machine-readable answer is a
> **cited refusal**, not a number.

---

## Step (a) — Inventory every authoritative machine-readable dataset

<!-- Every layer probed LIVE 2026-07-24 (findings/GERMANY-DATA-RECON-SPIKE.md). "Structured?" = does it
deliver a numeric BUILDING PARAMETER, or only geometry / a code / a PDF link? -->

| Layer | Authoritative source + endpoint | Licence | Live-probe result (2026-07-24 · sample field=value) | Delivers a numeric building param? |
|---|---|---|---|---|
| Parcel geometry | ALKIS `Flurstück`, per-Land WFS (schema federal, access per-Land) | Varies per Land (NRW/Sachsen-Anhalt/GDI-BE open; Bavaria fee/registration) | schema standardised; Hamburg/Bavaria endpoints not re-probed this pass | geometry only |
| Zoning code + plan link (georeferenced corpus) | Hamburg `geodienste.hamburg.de/HH_WFS_Bebauungsplaene`; Berlin `gdi.berlin.de/services/wfs/bplan` | open (Berlin: *"keine Zugriffsbeschränkungen"*) | HH `planrecht=…/bplan/TB3.pdf`; BE `scan_www=…/0100002b.pdf`, `inhalt="Kerngebiet…"` | ❌ plan outline + PDF link; use-type in prose; **no GRZ/GFZ/Höhe** |
| Structured numeric rules (content-vectorised corpus) | Per-Land XPlanung WFS serving the full content model, e.g. MV `demo.bauleitplaene-mv.de/ows/xplanung` (`ms:bp_baugebietsteilflaeche_polygons`) | open | `grz=0.4`, `z=1`, `allgartderbaulnutzung=WohnBauflaeche`, `dachform=Satteldach…` — **populated on ~1/3 of features** | ✅ GRZ + storeys (GFZ ~5%, metric height 0%) — **where the plan was content-vectorised** |
| National density table | BauNVO §17 `gesetze-im-internet.de/baunvo/__17.html` | federal statute (public) | heading = *"Orientierungswerte…"*; GRZ/GFZ/BMZ per Baugebiet (full table in spike §7) | ✅ but **national orientation values for upper limits**, not a parcel rule |
| Overlays — heritage / flood / conservation | Denkmalschutz (Land Denkmalamt, mostly non-GIS); Erhaltungsverordnung (per district); Überschwemmungsgebiet (INSPIRE WMS/WFS, patchy) | per-Land | not re-probed this pass (README §4 characterises) | overlay geometry where it exists; the discretionary rule stays in text |
| Context buildings + height | LoD2-DE CityGML, per-Land tiles; NRW `opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/` | NRW open (national ZSHH feed INSPIRE-restricted) | HTTP 200 `application/json` product index — open, free | ✅ existing-building height (context, not rule) |
| Terrain (DGM/LiDAR) | Per-Land DGM (e.g. NRW opengeodata) | per-Land | not re-probed this pass | datum only |

**Two-denominator note (mandatory).** State **zone-identification** coverage AND **numeric-fill**
coverage separately. **Germany answers "which regime + which zone" for a much larger fraction than "what
numbers":** for the georeferenced corpus (Hamburg, Berlin) the zone/use type is present in prose
(`inhalt="Kerngebiet"`) and the plan outline is geometry — so *zone-ID is high* — while *numeric fill is
~0%* (numbers are in the scanned Satzung PDF). Quoting the zone-ID fraction as the headline is the
§CONTEXT-DATA-HONESTY failure C58 §1.2/§1.4 forbids. **The headline is always the numeric fill: ~28%.**

---

## Step (b) — Measure how many parcel questions the data answers DIRECTLY

<!-- Field-by-field derivation of the RATE.md headline. Score = fraction of parcels the field is
machine-readable for. Benchmark row set kept in sync (RATE.md). -->

| Field | Structured? | Source / where the number actually lives | Coverage | Score |
|---|---|---|---|---|
| Parcel geometry | ✅ | ALKIS per-Land WFS | most Länder (access varies) | ~55% |
| Regime (§30/§34/§35) | ⚠ derivable | presence/absence of a covering B-Plan polygon in XPlanung WFS + §34-interior / §35-outlying inference | WFS confirmed HH/BE/MV | ~50% |
| Zone / use code (BauNVO type) | ⚠ | XPlanGML `allgArtDerBaulNutzung` (content-vectorised) **or** prose `inhalt` (georeferenced) **or** the Satzung PDF | taxonomy national; attribution needs the plan | ~40% |
| Density — GRZ | ⚠ split | **content-vectorised**: XPlanGML `grz` (MV: populated ~33%). **Georeferenced**: Satzung PDF only (HH/BE: absent) | low nationally; high in content-vectorised Länder | ~0% (HH/BE) … ~33% (MV corpus) |
| Density — GFZ | ❌ mostly | XPlanGML `gfz` where populated (MV: ~5%); else PDF | German density is usually GRZ+Z, not GFZ | ~0–5% |
| "Height" — Z (Vollgeschosse / storeys) | ⚠ split | XPlanGML `z` (MV: populated ~30%); else PDF. **This IS the German height rule for most plans** | content-vectorised corpus only | ~0% (HH/BE) … ~30% (MV corpus) |
| Height in metres | ❌ | XPlanGML `hoehenangabe` — **0/162 in the MV sample**; rarely set | very rare | ~0% |
| Setbacks (Abstandsflächen) | ✅ formula | per-Land LBO statute formula (e.g. BayBO Art. 6: 0.4H, min 3 m — VERIFIED) — code once per Land | national concept, 16 configs | ~35% |
| Overlays (heritage/flood) | ⚠ | Denkmalamt (non-GIS mostly) / INSPIRE flood WFS (patchy) | fragmented | ~20% |
| Existing-building height (context) | ✅ | LoD2-DE CityGML per-Land tiles | some Länder open (NRW confirmed) | ~30% |

**Composite → headline.** The buildable envelope needs regime + density + height. Numerically that
resolves for a parcel only when (i) a B-Plan covers it AND (ii) the plan is content-vectorised with
`grz`/`z` populated. Nationally, weighting the ~0% georeferenced big-city corpus against the
content-vectorised Länder and the BauNVO §17 national table (a ceiling, not a parcel value), the numeric
fill is **~28%** — the `RATE.md` headline. The §34 fraction (~30%) is *correctly* excluded from the
numerator (it has no number by law), not counted as a miss.

---

## Step (c) — Identify what remains only in legal text

| Numeric field | Lives only in | Why it is not data | Extractable by pipeline? |
|---|---|---|---|
| GRZ / GFZ / Z (georeferenced corpus) | the scanned B-Plan **Satzung PDF** (HH `TB3.pdf`, BE `0100002b.pdf`) | the plan was migrated as a georeferenced scan + boundary, not vectorised to the content model | **yes** — OCR + Nutzungsschablone parser (Engine 2) |
| Height in metres | Satzung PDF text/Nutzungsschablone (rarely a structured field even when vectorised) | German plans usually regulate storeys (`Z`) + roof form, not metric height | partly — but prefer `Z` + roof-form → derived height |
| Setbacks | per-Land LBO **statute** (BauBO/HBauO/BauO Bln §6) | a formula, not a per-plan number | **N/A — code the formula once per Land** (Engine 1) |
| §34 "Einfügen" envelope | **nowhere — it is not a number** | BauGB §34 delegates to *"Eigenart der näheren Umgebung"* — a discretionary fit-the-neighbourhood judgement | **NO — refuse, never fabricate.** (Engine 4 may offer transparent precedent evidence — research horizon) |
| Baunutzungsplan Baustufen (Berlin 1958/60) | historic plan legend + case-law | pre-BauNVO grading, judicially voidable as *funktionslos* | partly — but ships only at `corroborated, voidance-risk` (Engine 5 caps it) |

**Document-shape count (depth-vs-breadth lever).**

| Shape | Description | Germany |
|---|---|---|
| **A** — old scanned typewriter walls | high OCR burden | Hamburg's pre-1960 corpus (900 plans) + older Satzungen; the georeferenced big-city corpus is scan-backed |
| **B** — modern consolidated, clean/born-digital | low burden, transfers | **content-vectorised XPlanGML plans (MV proven; DiPlanung-authored plans going forward)** — the high-leverage shape |
| **C** — a national/general plan governs directly | no pipeline needed | **BauNVO §17** (national density orientation table) + per-Land LBO setback formulas — free federal breadth |

---

## Step (d) — Extraction-pipeline design for this country

The shared engine is **`docs/04-reference/standards/ORDINANCE-EXTRACTION-PIPELINE.md`** (`@pryzm/ordinance-extraction`,
Stages 0–6 → **L-449 human gate** → emit at `pipeline-extracted-unverified`). Germany supplies only:

1. **Enumerator** — list in-force B-Plans + supersession via the per-Land XPlanung WFS: query the
   `festgesetzt`/`festgestellt` feature type; `bp_rechtsstand="In Kraft getreten"` + `aul_ende` filter the
   in-force set; the `ersetztdurch*` fields carry supersession. Route by AGS.
2. **Article/section grammar adapter** — the German rule carrier is the **Nutzungsschablone** (the
   density box on the plan) + the textual Festsetzungen, mapped ONE-parser-per-field to C58:
   | Local carrier | Governs | → C58 field |
   |---|---|---|
   | Nutzungsschablone `GRZ` / XPlanGML `grz` | ground coverage | `maxCoverage` (GRZ) |
   | Nutzungsschablone `GFZ` / `grz`+`z` | floor-area ratio / storeys | `far` (GFZ) / `storeys` (Z) |
   | `Z` / `zzwingend` + Traufhöhe/Firsthöhe | height (storeys → derived metres) | `maxHeight_m` (derived) / `storeys` |
   | LBO §6 Abstandsflächen | setback | `setback` (height-proportional, per-Land multiplier) |
   | `allgArtDerBaulNutzung` / `inhalt` prose | BauNVO zone type | `zoneType` (→ §17 ceiling sanity-check) |
3. **Locale + algorithm-detector settings** — decimal comma (`0,4` = 0.4); phrases like *"Höhe nach
   Maßgabe der Umgebung"* / *"gemäß Einfügungsgebot §34"* → emit `null`/`derived`, **never a number**.
   `Z` (storeys) is a first-class height determinant — do **not** emit `null` for height merely because
   `hoehenangabe` (metres) is empty.
4. **Efficiency unit** — transcribe at the **plan** level, but prioritise **Länder that publish the
   content-vectorised WFS** (MV-style): those need *ingestion*, not OCR. Reserve the OCR pipeline for the
   georeferenced scan corpus (Hamburg, Berlin). The content-vectorised fraction is the lever — measure it
   per Land first (see the new Phase 1 in `RATE-IMPLEMENTATION-PLAN.md`).

⚠ **L-449 gate + `pipeline-extracted-unverified` tier are non-negotiable.** A machine-extracted GRZ from
a Satzung PDF ships permanently BELOW `estimated-ruleset` until a human signs it off against the signed
Satzung (the German signature gate, README §2.7). It never silently graduates.

---

## Step (e) — The green / amber / red model

| Band | Meaning | Confidence tier | Counts toward the rate? |
|---|---|---|---|
| 🟢 **GREEN — structured data** | XPlanGML `grz`/`z` populated (MV-style content-vectorised WFS) | `structured` | ✅ yes — this IS the rate |
| 🟠 **AMBER — compiled from law** | GRZ/GFZ transcribed from the scanned Satzung PDF (Engine 2), or a Baunutzungsplan Baustufe translated, human-verified | `ordinance-pdf` (human) / `pipeline-extracted-unverified` (machine, pre-sign-off) | ✅ once human-verified (L-449); Baunutzungsplan capped at `corroborated, voidance-risk` |
| 🔴 **RED — needs a human / is not a number** | §34 "Einfügen" parcel; §35 outlying; a Denkmalschutz sign-off; an un-voidance-checked Baunutzungsplan figure | `not-determined` → a cited **refusal** | ❌ no — and correctly so |

**The invariant:** RED is never dressed as GREEN. **A §34 parcel returns *"unplanned interior area
(§34 BauGB) — buildability is assessed case-by-case against the character of the surroundings; no numeric
envelope exists"*, never a plausible GRZ.** That refusal is a POSITIVE, legally-correct, cited answer
(C58 §1.4) — the single most important German output, not a gap.

---

## Step (f) — The honest ceiling method

1. **Proven minimum = today's measured `RATE.md` number: ~28%.** Green-band only, live-probed
   (Hamburg/Berlin GRZ/GFZ/Höhe confirmed absent; BauNVO §17 national; MV structured path proven but not
   yet a shipped German pack). Never inflated by a hypothesis.
2. **Extraction / content-vectorisation lever = a HYPOTHESIS, stated as conditional.** *IF* the pipeline
   ingests the content-vectorised XPlanung WFS where Länder publish it, **and** OCR-transcribes the
   georeferenced Satzung corpus of the target cities behind the L-449 gate, the amber+green band rises to
   **~35–40%** (PDF-path-bound) and, for the Länder/cities whose corpus is largely content-vectorised, up
   to **~55–65%**. This is a projection to be *measured* (the content-vectorised fraction per Land; the
   OCR precision + confident-wrong rate), **not** a landed claim.
3. **Human-review ceiling ≈ 95–99%, NEVER 100%.** Germany's residuum is *structurally larger* than
   France's because of the **permanent ~30% §34 floor** — a legal design choice, not a data gap — plus
   Berlin's voidable Baunutzungsplan stratum, plus Denkmalschutz sign-offs. Even with every §30 B-Plan
   digitised and every setback formula coded, ~30% of Germany resolves to a cited refusal **forever**,
   absent a BauGB amendment. **A doc that promises 100% German coverage is the dishonesty this framework
   exists to prevent.**

| Ceiling step | Germany | Basis |
|---|---|---|
| Proven minimum (green today) | ~28% | live-probed 2026-07-24 |
| + extraction / content-vectorisation lever (conditional) | ~35–40% (national) → ~55–65% (content-vectorised Länder/cities) | projected; measure the content-vectorised fraction + OCR precision |
| Human-review ceiling | ~65–70% *(not ~95–99%)* | **capped by the ~30% §34 floor** — §34 + §35 + Denkmal + voidable Baunutzungsplan stay red by law |

> ⚠ **Germany is the sharpest test of the North Star's "never 100%" honesty.** Its ceiling is not held
> below 100% by a residuum of a few percent (as France) but by a **legally-mandated ~30% discretionary
> floor**. The realistic top for Germany is **~65–70%**, not ~95%. See `PLANNING-COMPILER-NORTH-STAR.md` —
> Germany is why the discretionary layer must be modelled as *transparent precedent evidence*
> (Engine 4, research horizon), never a hidden prediction.

---

## Step (g) — The multi-source layer harvesting checklist

- [ ] **Regime classification FIRST** — query the per-Land XPlanung WFS for a covering B-Plan polygon →
      §30 if present; else §34 (interior) / §35 (outlying) inference. **No numeric sourcing before this.**
- [ ] **Parcel geometry** — ALKIS per-Land WFS → the ring the envelope is inset from.
- [ ] **Zone code + plan link** — XPlanung WFS `allgArtDerBaulNutzung` / `inhalt` prose + the Satzung PDF (`planrecht`/`scan_www`).
- [ ] **Structured numeric rule** (content-vectorised Länder only) — `ms:bp_baugebietsteilflaeche` `grz`/`gfz`/`z`.
- [ ] **National sanity ceiling** — BauNVO §17 orientation values for the zone type (a *check*, never the parcel rule).
- [ ] **Setback formula** — per-Land LBO §6 (BayBO confirmed; HBauO / BauO Bln to read) → Abstandsflächen.
- [ ] **Overlay: Denkmalschutz** — Land Denkmalamt → **refuse-with-warning** on intersection (mostly non-GIS — flag as high-risk).
- [ ] **Overlay: Erhaltungsverordnung / flood (Überschwemmungsgebiet)** — per-district / INSPIRE WFS.
- [ ] **Context buildings + real height** — LoD2-DE per-Land tiles (NRW open) → LOD2 massing.
- [ ] **Terrain (DGM/LiDAR)** — per-Land DGM → the datum height is measured from.
- [ ] **Supersession / in-force check** — WFS `bp_rechtsstand` + `ersetztdurch*` → never extract from a repealed plan; the **signed Satzung** is authoritative (README §2.7).

---

## The five engines — the founder's decomposition, mapped onto (a)→(f)

<!-- Germany's buildable answer is produced by five distinct "engines". Two are shippable now; two are
research-horizon; one is a national-law lookup. This is the German-specific overlay on the country-agnostic
method above — it says WHICH engine produces each field, and how honest each can be. -->

| # | Engine | What it produces for a German parcel | Sources it draws on (Steps a/b) | Output honesty | Shippable? |
|---|---|---|---|---|---|
| **1** | **Explicit Law** | GRZ/GFZ/Z where a content-vectorised WFS serves them; BauNVO §17 orientation ceilings; per-Land Abstandsflächen formula | MV-style XPlanung WFS (`grz`/`z`); `baunvo/__17.html`; LBO §6 | 🟢 `structured` / `published` (formula) | **YES — now** |
| **2** | **Legal-Text Compilation** | GRZ/GFZ/Z transcribed from the scanned Satzung PDF for the georeferenced corpus (Hamburg, Berlin, pre-1960) | `@pryzm/ordinance-extraction` OCR + Nutzungsschablone parser on `planrecht`/`scan_www` PDFs | 🟠 `pipeline-extracted-unverified` → `ordinance-pdf` after L-449 | **YES — via the shared pipeline + human gate** |
| **3** | **Spatial Reality** | existing building heights/massing, parcel ring, terrain datum, §34-neighbourhood built-fabric survey | LoD2-DE (NRW open), ALKIS, per-Land DGM | 🟢 `structured` (context, not rule) | **YES — now** |
| **4** | **Administrative Precedent** | for a §34 parcel: *transparent similarity/precedent evidence* — "neighbouring built fabric shows GRZ≈X, ~N storeys" — as **evidence, never a predicted envelope** | LoD2-DE + ALKIS built-fabric statistics over the *nähere Umgebung* | 🔴 **refusal + cited precedent evidence** — NEVER a fabricated number | **RESEARCH HORIZON** (the founder's discretionary-layer direction; document, do not ship as a value) |
| **5** | **Jurisprudence** | voidance status of a Baunutzungsplan figure (Berlin *funktionslos*); §17 derogation validity; §34/§35 boundary disputes | OVG/BVerwG rulings; per-area case-law search | 🔴 caps the tier (`corroborated, voidance-risk`) or forces a refusal | **RESEARCH HORIZON** — no queryable case-law-to-parcel index exists |

**The load-bearing split:** Engines **1 and 3 are shippable now** and produce the ~28% proven floor plus
the context massing. Engine **2** lifts the georeferenced corpus into amber behind the L-449 gate — this
is the Barcelona-style OCR programme, bounded by human-review throughput. Engines **4 and 5 are the
North-Star horizon**: they address exactly the ~30% §34 + the Berlin voidance stratum that keep Germany's
ceiling at ~65–70%. **Engine 4 is the founder's key research direction — model §34 discretion as
transparent precedent evidence a human weighs, never as a hidden numeric prediction.** Building Engine 4
as a predictor (rather than an evidence surface) would be the §CONTEXT-DATA-HONESTY failure at national
scale: presenting *"the neighbourhood suggests GRZ 0.5"* as a rule when §34 grants none.

---

*Governing: **C58** §1.2 (fidelity) / §1.4 (never a guess) / §1.6 (per-field provenance) / §1.11
(granularity) · **ADR-0269** (curate-then-serve) · **ADR-0270** (GeometricRule union) · **L-449**
(human-verification gate). Engine: `../../ORDINANCE-EXTRACTION-PIPELINE.md`. Trackers: `RATE.md`,
`RATE-IMPLEMENTATION-PLAN.md`. Evidence: `findings/GERMANY-DATA-RECON-SPIKE.md`. Aspiration:
`../../PLANNING-COMPILER-NORTH-STAR.md`. Probe discipline: `../../PROBE-DISCIPLINE.md`. Worked sibling:
France `../fr/`.*
