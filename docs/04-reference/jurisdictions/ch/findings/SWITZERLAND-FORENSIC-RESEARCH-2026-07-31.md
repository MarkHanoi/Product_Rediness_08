# Switzerland — Forensic Planning-Data Research (2026-07-31)

> **Status:** Founder forensic-research consolidation. Durable, browsable, DD-ready.
> **Scope:** National (AV cadastre + geodienste) + cantonal families + Zürich / Basel-Stadt /
> Geneva. Complements `SWITZERLAND-MASTER-DATA-SOURCE-STUDY.md` and `SWITZERLAND-DATA-RECON-SPIKE.md`.
> **Honesty convention:** **[CONFIRMED]** (verified / live-probed on the stated date) vs
> **[UNVERIFIED]** (asserted, needs live access). No numeric envelope value is fabricated. Density
> is typed by its true metric (AZ/BMZ/GFZ) — **never coerced to FAR**.

---

## 1 — Headline: "Belgium++", scored on the L1/L2/L3 model

Switzerland is **"Belgium++"** — the same routing strengths as Belgium, one notch better, but the
numeric envelope is still the hard part.

### 1.1 The L1/L2/L3 scoring model

| Layer | Meaning |
|---|---|
| **L1 — Spatial** | Can you *locate* the applicable rule polygon for a parcel? |
| **L2 — Legal-linkage** | Does the polygon carry a resolvable document / article link? |
| **L3 — Numeric envelope** | Are the actual envelope numbers machine-readable? |

**Switzerland score: L1 ★★★★★ · L2 ★★★★★ · L3 ★★☆☆☆** **[CONFIRMED — assessment]**

Benchmarks for calibration:

| Jurisdiction | L1 | L2 | L3 |
|---|---|---|---|
| **Denmark** | ★★★★★ | ★★★★★ | ★★★★★ |
| **Switzerland** | ★★★★★ | ★★★★★ | ★★☆☆☆ |
| **Belgium** | ★★★★★ | ★★★☆☆ | ★☆☆☆☆ |

- National **AV cadastre** wired + signed **HIGH**. **[CONFIRMED]**
- National **geodienste** = zone-ID + `dokument`; the numbers are **model/PDF-bound** (**Outcome B** —
  linkage present, numbers not machine-readable). **[CONFIRMED]**

### 1.2 LIVE PROBE VERDICT (2026-07-31)

**[CONFIRMED — live probe, 2026-07-31]**

- National **geodienste WFS is geo-blocked** to non-DACH clients (returns **400/403**).
- **Municipal Stadt Zürich BZO WFS** (`ogd.stadt-zuerich.ch`, **CC0**, **EPSG:2056**):
  - per-polygon **`rechtsvorschrift_url`** is **POPULATED** → `oerebdocs.zh.ch/getDoc?docid=N`
  - carries zone-type `typ`
  - this is a **cleaner L2 than the national surface** —
  - **BUT** it dereferences to a **raw SCANNED PDF** (not structured) → **weaker than Wallonia's
    Wallex** (which resolves to article-structured text).
- **No numbers on ANY reachable surface:**
  - **NO** `Nutzungsziffer` / AZ
  - **NO** `Gebäudehöhe`
  - **NO** floors
  - …on the cantonal ÖREB layer, on `bzo_zone_v`, and even on the dedicated derived layer
    `bzo_zone_erhoehte_az_v`.
  - **INTERLIS / XTF is NOT offered** for the municipal BZO.
  - all exports (**GPKG / GeoJSON / SHP / DXF**) mirror the WFS → **no numbers**.
- **L3 verdict = NO** — envelope numbers are **ordinance-bound, scanned; need extraction.**

---

## 2 — The three data-engineering families

The **family predicts the ceiling before extraction** — i.e. you can forecast how far automated
extraction will get *before* you start, from which structural family the canton belongs to.
**[CONFIRMED — model]**

| Family | Cantons | Pattern | Reachable ceiling | L3 |
|---|---|---|---|---|
| **(1) German-structured** | ZH · ZG · AG | `Zone → ordinance table → numbers` | ~60-70% | ★★★ |
| **(2) Urban-complex** | BS · GE | `Zone → special plans → ordinance` | ~35-50% | ★★ |
| **(3) Mountain/rural** | VS · GR · UR | (hardest) | lowest | — |

---

## 3 — Zürich (BZO 2016)

### 3.1 Grundmasse — 700.100 Art. 13

The BZO 2016 zone-basic-dimensions ("**Grundmasse**") from **700.100 Art. 13**: **[CONFIRMED — matches
the existing `chZurichBzoCatalogue.ts` pack]**

| Zone | Full floors | Building height | Density |
|---|---|---|---|
| **W2bI** | 2 | 9 m | 40% |
| **W2bII** | 2 | 9 m | 40% |
| **W2bIII** | 2 | 9 m | 45% |
| **W2** | 2 | 9 m | 60% |
| **W3** | 3 | 9.5 m | 90% |
| **W4b** | 4 | 12.5 m | 105% |
| **W4** | 4 | 12.5 m | 120% |
| **W5** | 5 | 15.5 m | 165% |
| **W6** | 6 | 18.5 m | 205% |

- **Grundgrenzabstand: 5 m.**

### 3.2 Risks

| Risk | Description |
|---|---|
| **R4 — regime ambiguity** | BZO 2016 vs BZO 91/99 **differ on height**; you must know which regime governs the parcel. **[CONFIRMED — risk]** |
| **R3 — contradictory sign-off** | The `700.100` URL **closes the source-PDF-URL item** (resolves the earlier sign-off contradiction). **[CONFIRMED]** |

---

## 4 — Setbacks are a CONSTRAINT GRAPH (not front/rear/side)

Swiss setbacks are **not** a simple front/rear/side triple. There are **4+ distinct concepts**:
**[CONFIRMED — model]**

| Concept | Meaning | Resolver type |
|---|---|---|
| **`Grenzabstand`** | Boundary distance | formula / lookup |
| **`Gebäudeabstand`** | Building ↔ building distance (**PBG §260**) | formula |
| **`Strassenabstand`** | Road distance | formula / legal |
| **`Baulinie` / alignment** | **GEOMETRIC** — front setback via distance-to-line, **GIS-solvable** where the Baulinien layer exists | geometry |

**Resolver types:** `geometry` / `formula` / `derived` / `legal+geometry`.
**Two-table model:** zone-params table + formula-rules table.

### 4.1 Zürich BZO Art. 38 — extracted rules

**[CONFIRMED — extracted]**

| Rule | Formula |
|---|---|
| **Mehrlängenzuschlag** | `facade > 12 m → + (len − 12) / 3`, **cap is zone-dependent** |
| **Kleinbauten** | 3.5 m (Art. 38(4)) |
| **Underground** | 2.5 m (Art. 38(5)) |

**UNKNOWN (honest):** the per-zone **grosser / kleiner Grundabstand** table. **[UNVERIFIED]**

### 4.2 Density typing

Density is typed **AZ / BMZ / GFZ + denominator** — **never coerced to FAR**. This resolver
architecture **≈ the existing Saudi Riyadh formula-setback resolver** (reuse the pattern).
**[CONFIRMED — typing rule + reuse]**

---

## 5 — Other cantons (honest ceilings)

| Canton | Group | Notes | Ceiling |
|---|---|---|---|
| **Basel-Stadt** | Group B | Honest unknowns, **BPG-bound** | ~45% |
| **Geneva** | Romandie / Group B | **IUS** not FAR; `gabarit` = context-height; **PLQ** special-plan overrides = the **Brussels-PPAS analogue** | ~35-45% |

**[CONFIRMED — both are Group-B assessments with the stated honest unknowns.]**

---

## 6 — Zürich → 100% plan

The remaining work is a **Swiss planning-law → executable-rule COMPILER**, **NOT data discovery**:
**[CONFIRMED — plan]**

```
BZO parser → zone-param DB → Grenzabstand/height resolvers
           → Gestaltungsplan/heritage → L-449 verification
```

- **~10 weeks → 95-98%.** 100% is blocked by **discretionary / heritage exceptions**.
- **Instrument priority:** `Gestaltungsplan > Sondernutzungsplan > BZO > PBG`.
- Feeds **`packages/constraint-solver`**.

---

## 7 — Cross-cutting architecture

The whole thing is a **planning-regime resolver + resolution-STRATEGY model** — jurisdiction-agnostic
and auditable: **[CONFIRMED — architecture]**

```
strategy: lookup | formula | ordinance_table | derived_geometry | spatial_overlay | explicitly_not_defined
```

**Recommendation:** the **C63 LEGISLATION axis should split routing-completeness vs
numeric-completeness** (the L1/L2 vs L3 distinction) — otherwise a jurisdiction with perfect routing
but scanned-PDF numbers scores misleadingly. **[CONFIRMED — recommendation]**

---

## 8 — Consolidated honesty ledger

| Claim | Status |
|---|---|
| CH = "Belgium++"; L1★★★★★ L2★★★★★ L3★★☆☆☆ | CONFIRMED (assessment) |
| National AV cadastre wired + signed HIGH | CONFIRMED |
| National geodienste = zone-ID + `dokument`, numbers model/PDF-bound (Outcome B) | CONFIRMED |
| National geodienste WFS geo-blocked non-DACH (400/403) | CONFIRMED (probe 2026-07-31) |
| Stadt Zürich BZO WFS `rechtsvorschrift_url` populated → scanned PDF | CONFIRMED (probe 2026-07-31) |
| No Nutzungsziffer/AZ, no Gebäudehöhe, no floors on any reachable surface | CONFIRMED (probe 2026-07-31) |
| INTERLIS/XTF not offered for municipal BZO; exports mirror WFS | CONFIRMED (probe 2026-07-31) |
| L3 = NO (ordinance-bound, scanned; needs extraction) | CONFIRMED |
| Three families predict ceiling before extraction | CONFIRMED (model) |
| Zürich BZO 2016 Art.13 Grundmasse table (W2bI…W6) | CONFIRMED (matches `chZurichBzoCatalogue.ts`) |
| Grundgrenzabstand 5 m | CONFIRMED |
| R4 regime ambiguity (2016 vs 91/99 height) / R3 sign-off closed | CONFIRMED |
| Setbacks = constraint graph (Grenz/Gebäude/Strassen/Baulinie) | CONFIRMED (model) |
| Zürich Art.38 Mehrlängenzuschlag / Kleinbauten 3.5 m / underground 2.5 m | CONFIRMED (extracted) |
| Per-zone grosser/kleiner Grundabstand table | UNVERIFIED |
| Density typed AZ/BMZ/GFZ + denominator, never FAR | CONFIRMED (typing rule) |
| Basel-Stadt Group B ~45% BPG-bound | CONFIRMED (assessment) |
| Geneva Group B ~35-45%; IUS/gabarit/PLQ | CONFIRMED (assessment) |
| Zürich→100% = law-compiler ~10wk → 95-98% | CONFIRMED (plan) |
| Strategy model + C63 axis split | CONFIRMED (recommendation) |

---

*Consolidated 2026-07-31 from founder forensic-research session. Cross-reference:
`ch/findings/SWITZERLAND-MASTER-DATA-SOURCE-STUDY.md`, `ch/findings/ZURICH-PARCEL-SOURCE.md`,
`ch/README.md §7`. Existing rule pack: `chZurichBzoCatalogue.ts`.*
