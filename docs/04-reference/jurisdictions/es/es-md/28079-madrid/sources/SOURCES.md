# Madrid (INE 28079) — per-field sources

**Status: source IDENTITY verified (§0). Zone-code INVENTORY verified (§0.3). ZERO rule VALUES
carry a primary-article citation, and NOTHING is L-449-signed.** The pack MUST NOT ship a numeric
Norma-Zonal value until a row here carries the full citation atom (§0.4) *and*
[`VERIFICATION.md`](./VERIFICATION.md) records a human sign-off for it.

Per the authoring contract (JURISDICTION-PLAYBOOK §3.3): every value the pack sets needs a row here
— value · unit · governing article · document · URL. **A field with no citable source stays `null`
in the pack** and is listed under *Unverified*. Never interpolate or infer. Blog / slide /
APR-plan-specific figures are **SECONDARY** and never become a pack value.

> **Three states, never two.** Every row below is one of **VERIFIED** (read from a response or a
> primary document this repo opened), **ASSERTED-UNVERIFIED** (someone stated it; no primary read
> backs it), or **UNKNOWN** (`null` + a typed status). Collapsing ASSERTED into VERIFIED is the
> §CONTEXT-DATA-HONESTY defect this file exists to prevent. A recon pass — however good — produces
> ASSERTED rows, not VERIFIED ones.

---

## §0 — Evidence chain (provenance of this file's own claims)

*(The G11 evidence-chain pattern, mirroring `dk/`. Every downstream number must be traceable to one
of these rows, and every row names how it was obtained.)*

| # | Claim | How obtained | Date | State |
|---|---|---|---|---|
| E1 | Ordinance identity + consolidation vintage (§0.1) | live `WebFetch` of the Ayuntamiento/transparencia portal page + `curl -I` on the PDF | 2026-07-31 | **VERIFIED** |
| E2 | The Compendio's LEGAL STATUS (§0.2) | verbatim quote from the same portal page | 2026-07-31 | **VERIFIED** |
| E3 | Zone-code inventory, 34 claus (§0.3) | ArcGIS `returnCountOnly` + distinct-value read on `NORMAS_ZONALES/0` (`findings/MADRID-DATA-RECON-SPIKE.md` §2) | 2026-07-24 | **VERIFIED-LIVE** |
| E4 | NZ 1 footprint + `COEF_Z` layer/field inventory (§A) | direct `?f=json` endpoint calls | 2026-07-23 | **VERIFIED-LIVE** |
| E5 | Every NZ 4/5/7/8/9 numeric parameter (§C) | — nothing read — | — | **UNKNOWN** (`not extracted`) |
| E6 | `COEF_Z` legal meaning (§B2) | — nothing read — | — | **UNKNOWN** (quarantined) |
| E7 | Founder captures, batches 1–11 (7 files) | founder research, delivered as-is; internally conflicted (§0.6) | 2026-07-31 | **ASSERTED-UNVERIFIED** except where E1–E4/E8 independently confirm it |
| E8 | **Two** live Compendio consolidations, distinct documents (§0.1) | `curl -I` on both candidate PDFs | 2026-07-31 | **VERIFIED** |
| E9 | `AMB_TX_DENOM`, `PG_ANALISIS_EDIFICACION`, `PG_USOS_Y_ACTIVIDADES`, `PG_EDIFICIOS_PROTEGIDOS` field contents (§G) | — nothing queried — | — | **ASSERTED-UNVERIFIED** (field names are hypotheses) |

Raw captures (READ-ONLY, do not edit) — all seven, in delivery order:
[`recon`](../findings/SOURCE-founder-madrid-recon-2026-07-31.md) ·
[`roadmap`](../findings/SOURCE-founder-madrid-roadmap-2026-07-31.md) ·
[`feasibility`](../findings/SOURCE-founder-madrid-feasibility-2026-07-31.md) ·
[`execution-plan`](../findings/SOURCE-founder-madrid-execution-plan-2026-07-31.md) ·
[`planning-graph`](../findings/SOURCE-founder-madrid-planning-graph-2026-07-31.md) ·
[`spanish-compiler-and-planning-ontology`](../findings/SOURCE-founder-spanish-compiler-and-planning-ontology-2026-07-31.md) ·
[`rule-resolution-and-spain-compounding`](../findings/SOURCE-founder-rule-resolution-and-spain-compounding-2026-07-31.md).

⚠ The last two captures are **platform architecture, not Madrid data** (capture note C-26). They are
filed here only because that is where they arrived; they need re-filing at cross-jurisdiction level.
They are referenced below only where they bear on a Madrid field.

### §0.1 — The ordinance of record — **VERIFIED 2026-07-31, and it is NOT the "Compendio 2023"**

This resolves capture-note **C-1 / F4** (the 2023-vs-2025 conflict) and simultaneously corrects a
**stale citation that ran through this entire dossier**: every prior Madrid file cited "Compendio
2023". That edition has been superseded twice.

| Field | Verified value | Evidence |
|---|---|---|
| Base plan | **PGOUM-97** — Plan General de Ordenación Urbana de Madrid, aprobación definitiva 17-04-1997 (BOE 19-04-1997) | carried from the prior dossier; **not re-verified this pass** → ASSERTED |
| Current consolidation | **"Compendio 2025 de las Normas Urbanísticas del Plan General de Ordenación Urbana de Madrid de 1997 (actualizado a 24.09.2025)"** — title quoted verbatim | portal page, WebFetch 2026-07-31 |
| Consolidation cut-off | **24 September 2025** — *"desde la fecha de su aprobación definitiva hasta el 24 de septiembre de 2025"* | ↑ same |
| PDF | `COMPENDIO_MPG_NNUU_24_09_2025.pdf` — **HTTP 200 · `Content-Type: application/pdf` · ~24.5 MB · `Last-Modified: Mon, 20 Oct 2025`** | `curl -I`, 2026-07-31 |
| PDF URL | `https://transparencia.madrid.es/UnidadesDescentralizadas/UDCUrbanismo/PGOUM/CompendioNNUU/Compendio_2025_septiembre/COMPENDIO_MPG_NNUU_24_09_2025.pdf` | ↑ same |
| Portal page | `https://transparencia.madrid.es/portales/transparencia/es/Transparencia-por-sectores/Urbanismo-Obras/Planeamiento-urbanistico/Compendio-2025-...-24-09-2025-/` (also mirrored under `www.madrid.es/.../Vivienda-urbanismo-y-obras/Normativa/`) | WebFetch 2026-07-31 |

**Edition lineage observed on the portal (so a stale citation is recognisable on sight):**

`Compendio 2024 (actualizado a 24-10-2024)` → `Compendio 2025 (actualizado a 07-07-2025)` →
**`Compendio 2025 (actualizado a 24-09-2025)` ← current**.

#### ⚠ THE ACTUAL TRAP: two official Madrid portals serve **different** consolidations, both live

Capture notes **C-6 / C-16** raised a *three*-way conflict (2023 / 2025-07-07 / 2025-09-24) and
correctly insisted it be settled by **fetching both, not by reasoning about filenames or counting
mentions**. Both were fetched on 2026-07-31:

| Candidate | Host | HTTP | `Content-Length` | `Last-Modified` | Verdict |
|---|---|---|---|---|---|
| `COMPENDIO_MPG_NNUU_07_07_2025.pdf` ("COMPENDIO JULIO 2025") | **geoportal**.madrid.es | **200** `application/pdf` | **26 318 633** | **2025-09-23** | live — **but the SUPERSEDED July consolidation** |
| `COMPENDIO_MPG_NNUU_24_09_2025.pdf` | **transparencia**.madrid.es | **200** `application/pdf` | not sent (gzip) — ETag first field `188b0bb` = 25 735 355 *(inferred from Apache ETag format, not a header)* | **2025-10-20** | live — **the CURRENT September consolidation** |

**Findings, evidence-based:**

1. **Both PDFs exist and are DISTINCT documents** — different hosts, different filenames, different
   byte sizes (~583 KB apart), different `Last-Modified`. They are not one file under two names.
2. **The September edition is the later one** by every available signal: its consolidation date
   (24-09 > 07-07), its title, and its server `Last-Modified` (2025-10-20 > 2025-09-23).
3. **C-16's caution was right and the majority reading was wrong.** Three of five batches pointed at
   July; July is nonetheless the superseded edition. Weight of mentions was not evidence.
4. 🔴 **`geoportal.madrid.es` is still serving the superseded July consolidation.** This is the
   real, durable hazard — not a documentation slip. Anyone who finds the Compendio through the
   *visores urbanísticos* path gets the **older** text and has no on-page signal that a newer
   consolidation exists. **Cite the transparencia/madrid.es September PDF. Do not cite the geoportal
   PDF**, and if a future extraction quotes a `07_07_2025` filename, treat that extraction as
   version-suspect until re-checked.
5. **The "2023" edition was NOT probed.** It is plausible as an older edition in the same series but
   is recorded here as **ASSERTED-historic, unverified**. Either way it is at least two
   consolidations stale and must not be cited.

**Every extraction must record which edition it was read from** (§0.4 `readFrom`), because an
article's text can differ between consolidations — that is the entire reason consolidations exist.

⚠ **The founder's cited source [3] URL is DEAD.** The recon capture cites
`www.madrid.es/portales/munimadrid/es/Inicio/El-Ayuntamiento/Publicaciones/Listado-de-Publicaciones/Compendio-2025-…`
→ **HTTP 404** (probed 2026-07-31). The two working locators are the ones in the table above. The
founder's *claim* (that the current edition is the 2025 / 24-09-2025 consolidation) is **correct**;
only the URL was wrong. Use the verified locators, not the captured one.

⚠ **Residual, stated honestly:** what is verified is that a September-2025 consolidation exists, is
published, and is the latest *observed*. Neither PDF was **opened**; nothing in either has been read;
and no check was made for an edition later than 24-09-2025. `readFrom` must be re-confirmed at the
moment of extraction, not inherited from this row.

### §0.2 — ⚠ The Compendio is **NOT** the legal source (verbatim, and it changes the citation model)

The portal states, verbatim:

> *"El Compendio tiene carácter informativo."*
>
> *"La versión oficial de las normas, sus modificaciones o aclaraciones y la documentación que
> integra los anexos han sido publicadas en el Boletín Oficial correspondiente."*

**Consequence — this outranks the founder's §17 source hierarchy.** The roadmap capture places
"PGOUM-97 Normas Urbanísticas / Compendio" at Level 1 `PRIMARY`. The publisher itself says the
Compendio is a *consultation consolidation* and the **official text is the Boletín Oficial
publication** of the norm and of each modificación. The corrected hierarchy for Madrid is:

| Level | Source | Confidence | Use |
|---|---|---|---|
| **0** | **Boletín Oficial** publication of the PGOUM-97 NNUU and of each *modificación puntual* | `OFFICIAL` | the legal text; the only thing that fixes an `effectiveDate` |
| 1 | **Compendio 2025 (24-09-2025)** — consolidated consultation text | `PRIMARY-CONSOLIDATED` | the practical read; fixes `readFrom`, **not** `effectiveDate` |
| 2 | Official GIS (`sigma.madrid.es`) | `PUBLISHED-STRUCTURED` | spatial zone, footprint, alignment, ámbitos |
| 3 | Secondary (guides, developer summaries, consulting PDFs, APR-plan extracts) | `NOT ACCEPTABLE` | **never** a numeric engine parameter |

This is not pedantry: it is the difference between a defensible citation and one a Madrid architect
can dismiss in one sentence. It also means the Compendio's own annex — *"una relación actualizada de
los artículos que han sido modificados o aclarados desde la aprobación definitiva"* — is the index
that supplies each article's real `effectiveDate`.

### §0.3 — Zone-code inventory — the Axis-2 DENOMINATOR — **VERIFIED-LIVE, 34 claus**

Source: `…/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0`, field `AMB_TX_ETIQ`.
`returnCountOnly` on the distinct-value read returned **34** (`findings/MADRID-DATA-RECON-SPIKE.md` §2).

| Zona | `AMB_TX_ETIQ` values (verbatim) | n |
|---|---|---:|
| NZ 1 | `1.1 1.2 1.3 1.4 1.5 1.6` | 6 |
| NZ 3 | `3.1 3.1.a 3.1.b 3.1.c 3.2` | 5 |
| NZ 4 | `4` (no grados) | 1 |
| NZ 5 | `5.1 5.2 5.3` | 3 |
| NZ 7 | `7.1.a 7.1.b 7.2.e` | 3 |
| NZ 8 | `8.1.a 8.1.c 8.2.a 8.2.b 8.2.c 8.3.a 8.3.c 8.4 8.5 8.6` | 10 |
| **NZ 9** | **`9.1 9.2 9.3 9.4.a 9.4.b 9.5`** | **6** |
| | **Σ** | **34** |

⚠ **Correction to the founder's material.** The recon capture §3 A1 presents a "full observed
vocabulary" that **omits the entire NZ 9 block**. Its listed codes total **28**; the live layer
returns **34**. The 6-code difference is exactly NZ 9. The founder's list is therefore
**incomplete, not wrong** — but a rule table built from it would leave every NZ 9 parcel routing
nowhere. NZ 9 is in the inventory above and belongs in the extraction queue (low residential
priority, non-zero routing consequence).

**Zones 2, 6, 10, 11 — absent from `AMB_TX_ETIQ` (capture-notes C-5 / C-9, PARTIALLY resolved).**
Independently observed twice (this repo's 2026-07-24 recon and the founder's pass). Batch 3 supplies
a Título VIII chapter map that **includes `8.2 Norma Zonal 2` and `8.6 Norma Zonal 6`** — so those
two zones are *legally real*, with their own ordinance chapters. That **eliminates candidate (a) for
NZ 2 and NZ 6**: their absence from the GIS is not "these zones do not exist".

| Zone | Ordinance chapter | In `AMB_TX_ETIQ`? | Remaining candidate causes |
|---|---|---|---|
| **2** | `8.2` — ASSERTED (founder chapter map, not read from the PDF) | ❌ absent | (b) absent from *this* layer · (c) unobserved → **parcels routing nowhere** |
| **6** | `8.6` — ASSERTED, and ⚠ *contested*, see below | ❌ absent | (b) · (c) |
| **9** | `8.9` — **INFERRED** from the `8.n = NZ n` pattern; **absent from every founder chapter map** | ✅ present (6 codes) | — chapter unconfirmed |
| **10, 11** | none — every founder chapter map stops at `8.8` | ❌ absent | entirely unexplained |

⚠ **The founder's two chapter maps disagree with each other.** Batch 3 §3 lists `8.1 … 8.8`
(including 8.2 and 8.6); batch 6 §Stage 2 states *"Título VIII covers Norma Zonal 1, 2, 3, 4, 5, 7,
8"* — **omitting NZ 6**. And **neither map contains NZ 9**, although NZ 9 demonstrably has six live
GIS codes (above). The chapter map is therefore **ASSERTED and internally inconsistent**; it must not
be used as the extraction index without being read off the Compendio's own table of contents.

**Do not assume (a) for any of these.** The resolve step is a single read of the Compendio 2025
Título VIII table of contents — which chapters exist, `8.1` through `8.n` — cross-checked against an
unfiltered `returnCountOnly` on `NORMAS_ZONALES/0`. Candidate (c) is the one that costs: it means
parcels exist that route nowhere and would currently fall through to a blanket refusal with the wrong
stated reason.

### §0.4 — The citation atom (required shape for every future numeric row)

No numeric Norma-Zonal value enters this file without **all** of these. A missing element means the
field stays `null` with a status — never a plausible-looking article number.

```
value · unit · scope/denominator · zoneCode+grado applicability
      · article (Art. 8.x.y) · paragraph (apartado)
      · readFrom      = "Compendio 2025 (24-09-2025)"   ← which consolidation was opened
      · effectiveDate = the BOE date of the PG97 article, or of the modificación that set it
      · confidence
```

⚠ **`readFrom` ≠ `effectiveDate`.** The roadmap capture's WP2 exemplar
(`{"value":20,"unit":"m","article":"8.4.7","effective":"2023"}`) stamps a *consolidation vintage*
into an *effective-date* field. That is wrong independently of the 2023/2025 conflict: an article in
force since 1997 does not become "effective 2023" because a 2023 booklet reprinted it. Record both
fields, separately. The Compendio's modified-articles annex (§0.2) is where the real dates live.

### §0.5 — Named honesty rules binding on this file

- **`null` + status, never `0`.** `maxCoverage: 0` asserts *"no building allowed"*. The empty value
  is `{ value: null, status: "not extracted" }` (roadmap §48 — and independently **L-616**, where a
  massing ignored the FAR ceiling ~5× and drew a setback-unknown as zero).
- **Never `side = 0` for *"se permite adosamiento"*.** Encode `side: null, condition: "party_wall_allowed"`.
- **Never convert floors → metres.** `6 floors ≈ 20 m` is fabrication. `height_m: null, floors: 6`.
- **Never invent an article number.** `8.4.x` is a search target in prose, never a citation in a row.
- **Failure ≠ empty** (L-422/457/467/469). An endpoint that errored is `MEASURED-NEGATIVE`, not `0`.
- **Resolution must never INCREASE confidence** (capture-note C-27). If `height = unknown` at
  extraction, no override/precedence/resolution step may produce `22`. Unknown survives resolution.
  This governs a stage the other rules do not: a resolver that picks "the best available candidate"
  will silently launder an unsourced default into a confident answer and defeat every `null`
  discipline upstream. Same invariant as L-616, applied one layer later.
- **A value's measurement DATUM and its SAMPLING RULE are two separate required fields**
  (capture-notes C-13 / C-24, and **L-584**). Recording `measurement: "cornisa"` +
  `referencePlane: "rasante_oficial"` and stopping there **still reproduces L-584 exactly** — that
  defect was sampling one point at the block centroid where the ordinance measures at the **façade**.
  Capture *where along the reference plane the measurement is taken*, or the height is unusable.

### §0.6 — Conflicts carried forward from the captures (not resolved by assumption)

| # | Conflict | Disposition here |
|---|---|---|
| **C-1/F4/C-6/C-16** | Compendio 2023 vs 2025-07-07 vs 2025-09-24 | **RESOLVED — VERIFIED by probing both PDFs** §0.1. Current = **24-09-2025** (transparencia). July 2025 is live but **superseded**, and `geoportal.madrid.es` still serves it. 2023 not probed; at least two editions stale. |
| **C-2 / C-10** | Now **five** mutually inconsistent completeness scales across seven batches | **NOT averaged, none adopted.** Scored against C63 in [`../RATE.md`](../RATE.md); every founder figure recorded there separately as *as-supplied, differing basis*. |
| **C-3** | NZ 3 "✅" | **CARRIED FORWARD, split.** §D records refusal-logic-works and rules-unknown as two rows. A correctly-refusing zone is not a complete zone. |
| **C-4** | `COEF_Z` quarantined | **ENFORCED** §B2. Not bound to `farRatio` anywhere in this dossier. |
| **C-5 / C-9** | Zones 2/6/10/11 absent | **PARTIALLY RESOLVED** §0.3 — NZ 2 and NZ 6 have ordinance chapters, so "they don't exist" is eliminated for those two. NZ 10/11 unexplained; cause (c) *parcels routing nowhere* still open for all four. |
| **C-7** | `AMB_TX_DENOM` would close the officialDesignation gap | **RECORDED, UNVERIFIED** §G1 — nobody has queried the field. Cheapest open probe in the dossier. |
| **C-8** | Catastro/REFCAT join **reversed** between batches | **UNRESOLVED, both positions recorded** §G2. Determines whether Madrid needs a Catastro licence at all. Not picked. |
| **C-12 / C-19 / C-25 / C-31** | NZ 1 priority / "next step" flipped **five times** | **OPEN — founder's call.** [`../NEXT.md`](../NEXT.md) §3 records the NZ-1 split (engine-early vs semantics-late) and does **not** present any ordering as settled. |
| **C-17** | Four GIS layers named, **none probed** | **RECORDED as hypotheses** §G3. Every field name is unverified. |
| **C-18** | `COND_EDIF` vs Norma-Zonal grade — the silent-error class | **ENFORCED** §A + [`../RISK-REGISTER.md`](../RISK-REGISTER.md) R9. Independently proven in-repo (25/25 counter-examples). |
| **C-13 / C-24 / C-27** | measurement datum · sampling rule · resolution must not raise confidence | **RECORDED** §0.5 + §G4. The *sampling rule* gap (L-584) is named explicitly — a `referencePlane` field alone still reproduces the defect. |
| **(new)** | Founder vocabulary omits NZ 9 | **CORRECTED** §0.3 against the live 34-code inventory (28 listed vs 34 live). |
| **(new)** | Founder chapter maps disagree (NZ 6) and both omit NZ 9 | **RECORDED** §0.3 — the chapter map is ASSERTED and internally inconsistent; read the Compendio's own ToC. |
| **(new)** | Founder §17 ranks the Compendio Level-1 PRIMARY | **CORRECTED** §0.2 — the publisher says it is *informativo*; the BOE is the official text. |
| **(new)** | Founder §19/§38/§50 "engine needs `solveExplicitArea()`" | **STALE** — already shipped in PRYZM (`findings/L-608-EXPLICIT-AREA-SOLVER-SHIPPED.md`). See [`../NEXT.md`](../NEXT.md) §3. |

---

## A. VERIFIED-LIVE — NZ 1 buildable footprint + `COEF_Z` field inventory (Tier A)

Captured 2026-07-23 by direct endpoint call (`?f=json`). Per **L-438**, endpoint claims are citable
only from a RESPONSE, never from portal prose — these are responses. Host:
`sigma.madrid.es/hosted/rest/services/`.

| Item | Value | Source (response) |
|---|---|---|
| NZ 1 service | Plano de Condiciones de la Edificación, PGOUM-97 | `PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer?f=json` (serviceDescription) |
| Service scope | *"regulated under Zonal Norm 1 … special parcels with individually defined conditions"* | ↑ same |
| Fondo de la Edificación | layer **2**, `esriGeometryPolyline`, fields = `[OBJECTID]` only | `.../MapServer/2?f=json` |
| Condiciones de la Edificación | layer **6**, `esriGeometryPolygon` — **the closed buildable ring** | `.../MapServer/6?f=json` |
| Ficha Específica | layer **1**, `esriGeometryPoint` (per-parcel override) | `.../MapServer?f=json` |
| **`COEF_Z`** | field on layer 6, type **String**, alias "Coeficiente Z :" | `.../MapServer/6?f=json` (fields[]) |
| `CODMANZANA` | layer 6, String, "Número de Manzana :" — the key `COEF_Z` is per | ↑ same |
| `COND_EDIF` | layer 6, SmallInteger, "Grado Condición Edificación :" | ↑ same |
| `NUMORD` | layer 6, String, "Número de Catálogo :" | ↑ same |
| Zone routing (all zones) | `DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0`, `AMB_TX_ETIQ` | §0.3 |
| Alineaciones (official line) | `pgoum97/PG_ORDENACION_SIN_AMBITO/MapServer` layer 5; also `PG_GESTION` layer 8 | `.../PG_ORDENACION_SIN_AMBITO/MapServer?f=json` |
| CRS | service native **EPSG:25830**; `outSR=4326` supported | ↑ responses |
| Parcel join | **spatial** (parcel centroid → intersect). `CODMANZANA` is a planning-block key with **no string relationship to the Catastro refcat** — proven false against three real refcats | `findings/MADRID-DATA-RECON-SPIKE.md` |

**Field-inventory negative (VERIFIED, and load-bearing):** across all six PGOUM-97 services there is
**no `ALTURA` / `ALTURA_MAX` / `PLANTAS` / `FONDO` / `RETRANQUEO` attribute and no coded-value
domain** (`findings/MADRID-DATA-RECON-SPIKE.md`). This is a *measured negative*, not an unexplored
gap: the parametric numbers are genuinely not in GIS, so the Compendio read is unavoidable.

⚠ **`COND_EDIF` is NOT the zonal grado.** A prior probe was wrong about this and the correction is
recorded in `findings/MADRID-DATA-RECON-SPIKE.md` §2.1 (25/25 `COND_EDIF=5` parcels sit in zonal
grado `1.1`/`1.2`). Take the zonal grado from `NORMAS_ZONALES.AMB_TX_ETIQ`, never from `COND_EDIF`.

### A2 — `PG_ORDENACION` status (supersedes the "service is down" note in older files)

Recorded HTTP 500 / `Service not started` on 2026-07-23 across two passes; **answered live (HTTP 200,
17 layers) on 2026-07-24** (`findings/MADRID-DATA-RECON-SPIKE.md` §1.2). The outage was
**transient**. It is also **off the critical path**: zone routing comes from `NORMAS_ZONALES/0`, not
from `PG_ORDENACION`, which is now used only for its *ámbitos* (derived-plan) layer.

---

## B. NZ 1 pack-value rows

| Field | Value | Unit | Article / source | State |
|---|---|---|---|---|
| `geometricRule.kind` | `explicit-area` | — | published footprint (§A) | **VERIFIED** (kind) |
| `geometricRule.ringRef` | `madrid-nz1:fondo-condiciones/v-<vintage>` | — | provider resolver over §A layers | DESIGN (`findings/L-608` §4) |
| zone codes | `1.1 … 1.6` matched on `AMB_TX_ETIQ` | — | §0.3 | **VERIFIED-LIVE** |
| edificabilidad (`COEF_Z`) | *see §B2 — QUARANTINED* | — | — | **UNKNOWN (blocked)** |
| `permittedUse` | `residential` (grado 1º) | — | asserted from COAM, a SECONDARY source | **ASSERTED-UNVERIFIED** — re-cite to Compendio 2025 Cap. 8.1 |
| `maxHeight_m` / `maxFloors` / `maxCoverage` / setbacks | `null` | — | — | **UNKNOWN** (`not extracted`) |

### B2 — `COEF_Z` — **QUARANTINED** (capture-note C-4, enforced)

`COEF_Z` is the only FAR-shaped number Madrid exposes. Its legal meaning is **not established**.

- **Observed value vocabulary (VERIFIED-LIVE):** `"-"`, `"4"`, `"5"`, `"0 / 5"`, `"0 / 4"` — a
  **coded String**, not a float. `parseFloat("0 / 5") === 0` is the silent-zero trap; `parseCoefZ`
  classifies (`"-"`/blank → **absent, not zero**; single number → numeric; `"0 / 5"` → **refuse**).
- **What it means legally: UNKNOWN.** Candidates the ordinance must decide between — m²/m²
  edificabilidad · a number of *plantas* · a catalogue/condition coefficient · something else.
- **Denominator also UNKNOWN.** `COEF_Z` is attached to `CODMANZANA`, so the scope could be
  **manzana**, parcela, or catalogued area. This is the more dangerous half: a per-manzana
  coefficient applied per-parcel is wrong even if the unit is right.
- **BINDING RULE:** `COEF_Z` **must not be bound to `farRatio`** — not in a pack, not in a fixture,
  not in a doc table. Reading `COEF_Z = 5` as FAR 5.0 is the **L-616** failure mode exactly
  (massing ignored the FAR ceiling ~5× and drew unknown-setback as zero). Until Cap. 8.1 defines it:

  ```json
  { "COEF_Z": { "status": "coded-value", "meaning": "unknown", "denominator": "unknown", "blocked": true } }
  ```

- **Resolve step:** Compendio 2025 Cap. 8.1 (Norma Zonal 1), searching *coeficiente*,
  *edificabilidad*, *aprovechamiento*, *m²/m²*, *Coeficiente Z*, *tabla de grados*. If the legend is
  **not found**, the honest output is `{ "value": null, "reason": "GIS publishes a coded value;
  ordinance interpretation not verified" }` — not a guess.

---

## C. RULE VALUES — NZ 4 / 5 / 7 / 8 / 9 — **NONE VERIFIED, NONE EXTRACTED**

Governed by the **PGOUM-97 NNUU**, read from the **Compendio 2025 (24-09-2025)** (§0.1), Título 8,
Capítulos 8.x. **Grado-structured** — key any future pack on the exact `AMB_TX_ETIQ` spelling
(§0.3), never a bare NZ scalar.

> Every `—` below is `{ value: null, status: "not extracted" }`. Not zero. Not "probably null".
> The `Chapter` column names the **chapter to open**, not a citation — `Cap. 8.4` is a search
> target. A row becomes citable only once the real `Art. 8.4.<n> apartado <m>` is transcribed.

### NZ 4 — Edificación en manzana cerrada (`alignment`) — Cap. 8.4 — **highest ROI**

Zone code is the bare `"4"` — **VERIFIED: NZ 4 has no grados in the GIS síntesis.**
⚠ Founder §30's false-positive control applies: **do not invent `4.1` / `4.2`** unless the ordinance
declares them. If NZ 4 expresses its conditions some other way (frontage condition, catalogue,
street width), that is a *finding*, not a licence to fabricate grados.

| Field | Value | Unit | Chapter | State |
|---|---|---|---|---|
| `alignment.alignTo` | `official-line` | — | — | **VERIFIED** (Alineaciones published as a layer, §A) |
| `alignment.buildableDepth_m` (*fondo edificable*) | — | m | Cap. 8.4 | **UNKNOWN** — the single most valuable extraction |
| `alignment.sideTreatment` | `party-wall` (medianería) | — | Cap. 8.4 | **ASSERTED-UNVERIFIED** |
| `maxHeight_m` (*altura de cornisa*) | — | m | Cap. 8.4 | **UNKNOWN** — record `measuredFrom`/`measuredTo`; keep *cornisa* and *total* as separate fields |
| `maxFloors` (*nº plantas*) | — | count | Cap. 8.4 | **UNKNOWN** — normalise `B+5` → `{aboveGround:5, groundFloorIncluded:true}`; record *ático* / *bajo cubierta* separately |
| `maxCoverage` (*ocupación*) | — | % | Cap. 8.4 | **UNKNOWN** — **denominator mandatory** (parcela vs manzana) |
| `plotRatioFAR` (*edificabilidad*) | — | m²/m² | Cap. 8.4 | **UNKNOWN** — numerator (built / computable / total constructed) *and* denominator (parcela / propiedad / ámbito) both required |
| setbacks front / rear / side | — | m | Cap. 8.4 | **UNKNOWN** — `null` unless the article states one; *"probably null"* is not a value |
| `permittedUse` | — | — | Cap. 8.4 | **UNKNOWN** |

⚠ **The geometry warning that matters most for NZ 4** (roadmap §20, and the Barcelona
inset-collapse lesson L-529/L-581): *fondo edificable* is measured **from the official street
alignment line**, inward. **It is not a parcel shrink.** An implementation that insets the parcel
ring by the depth is a plausible-looking model that is wrong — the same class of error that produced
two confidently-wrong theories in the Barcelona depth saga.

### NZ 8 — Vivienda unifamiliar (`setback`) — Cap. 8.8

Grados (VERIFIED §0.3): `8.1.a 8.1.c 8.2.a 8.2.b 8.2.c 8.3.a 8.3.c 8.4 8.5 8.6` — **10 rows
required**, one per code. A single NZ-8 row is a category error.

| Field | Value | Unit | Chapter | State |
|---|---|---|---|---|
| `setback.front_m` / `.rear_m` / `.side_m` (*retranqueos*) | — | m | Cap. 8.8 | **UNKNOWN** — all three separately; never one scalar |
| `maxHeight_m` / `maxFloors` | — | m / count | Cap. 8.8 | **UNKNOWN** |
| `maxCoverage` (*ocupación máxima*) | — | % | Cap. 8.8 | **UNKNOWN** — denominator mandatory |
| `plotRatioFAR` | — | m²/m² | Cap. 8.8 | **UNKNOWN** |
| `minimumParcelArea_m2` (*parcela mínima*) | — | m² | Cap. 8.8 | **UNKNOWN** — may exist; capture if stated |

⚠ If the article says *"se permite adosamiento"*, encode `side: null, condition:
"party_wall_allowed"` — **not** `side: 0`.

### NZ 5 — Bloques abiertos — Cap. 8.5 — ⚠ **schema-fit risk, not just a data gap**

Grados (VERIFIED): `5.1 5.2 5.3`. All fields **UNKNOWN**.

The founder calls this "the most dangerous extraction" and the reason is a **model** question, not a
number: open-block zones often regulate ***distancia entre edificios*** (building separation), not
***retranqueo a linderos*** (parcel-edge setback). Test the ordinance's actual wording **before** any
code is written:

| Wording found | Consequence |
|---|---|
| *"retranqueo a linderos"* / *"separación a linderos"* | `SetbackRule` fits — proceed |
| *"distancia entre edificios"* / *"separación entre edificaciones"* | **`SetbackRule` does NOT fit** → needs a new `OpenBlockRule { buildingSeparation_m, towerSpacing_m, occupation }` → **raise an ADR** |

Forcing separation-based regulation into the setback triple would be a **wrong SHAPE, not a wrong
number** (ADR-0270) — the worse of the two failures. NZ 5's `geometricRule.kind` is therefore
**UNDETERMINED**, not `setback`.

### NZ 7 — Baja densidad (`setback`) — Cap. 8.7

Grados (VERIFIED): `7.1.a 7.1.b 7.2.e`. All fields **UNKNOWN**. Likely `setback + ocupación +
altura`, but verify: some low-density regimes use *parcela mínima* + *separación a linderos* instead
of occupation. Capture `minimumParcelArea_m2` if stated.

### NZ 9 — Cap. 8.9 (chapter INFERRED from the 8.n = NZ n pattern, **not confirmed**)

Grados (VERIFIED §0.3): `9.1 9.2 9.3 9.4.a 9.4.b 9.5`. **Zone name, chapter, and rule kind are all
UNKNOWN** — this block is absent from the founder's material entirely. Likely non-residential
(*actividades económicas*), so low product priority, but it is **6 of the 34 routable claus** and
must not silently route nowhere. Confirm name + chapter from the Compendio 2025 Título 8 index.

**Nothing above may be filled from memory, a blog, a lecture slide, or an APR/APE plan (which carry
site-specific overrides that contradict the general norm). Primary read + L-449 sign-off only.**

---

## D. NZ 3 — Volumetría específica — the REFUSAL (capture-note C-3, split into two claims)

Grados (VERIFIED §0.3): `3.1 3.1.a 3.1.b 3.1.c 3.2`.

**These are two different claims and must never be merged:**

| Claim | State |
|---|---|
| **(i)** The correct engine disposition for NZ 3 is a `derived-plan` refusal | **DECIDED** (architectural, roadmap §23) — a cited refusal is legally stronger than an estimate |
| **(ii)** NZ 3's zone rules are known | **FALSE.** FAR, height, floors, coverage, setbacks, permitted-use table, and the article citation are all **UNKNOWN**. Setbacks are *"probably null"* — which is not a value |

The founder's §3 "✅" scores (i). It does **not** license (ii). A correctly-refusing zone is not a
complete zone (L-422/457/467/469: a failure and an empty result are the same value unless you make
them different).

**Refusal copy (authorable now; the ordinance ref below is still ASSERTED, not article-cited):**

- `code`: `derived-plan`
- `headline`: *"Volumetría específica (Norma Zonal 3) — la edificabilidad se define por parcela."*
- `detail`: *"PGOUM-97 Norma Zonal 3 fixes the buildable volume specifically for each parcel through
  its own volumetric sheet (ficha), not through a general zone parameter. PRYZM does not hold that
  per-parcel volumetry, so no zone envelope is computed here."*
- `ordinanceRef`: *"PGOUM-97 NNUU Cap. 8.3, Norma Zonal 3 (read from Compendio 2025, 24-09-2025)."*
  — ⚠ **chapter asserted, article not transcribed**; confirm at the same read as NZ 4.
- `legallyGrounded`: `true`.

Upgrade path: if the specific volumetry is ever published as geometry (as NZ 1's footprint is), NZ 3
becomes an `explicit-area` zone.

---

## E. Overrides and precedence — **NOT MODELLED** (a real gap, newly surfaced)

The captures establish that a Madrid parcel can carry **several instruments at once**, and that
"GIS says NZ4 → apply NZ4" is therefore **incomplete**. The precedence chain (roadmap §41/§42):

```
1. Approved specific volumetry    2. Protection catalogue
3. Derived planning area (APR/APE/API)    4. Norma Zonal general rule
```

| Override | Layer | State |
|---|---|---|
| Protected buildings | `PG_EDIFICIOS_PROTEGIDOS` (exists; carries `NORMATIVA`, `COEF_Z`) | **field inventory partially seen; behaviour UNKNOWN** — does protection *replace* the envelope or *modify* parameters? Not established. Do not assume. |
| Ficha Específica (NZ 1) | `PG_CONDICIONES_EDIFICACION` layer **1** (point) | **exists, VERIFIED**; the resolver branch *"ficha exists → refuse"* is **NOT BUILT** |
| Derived ámbito (APR/APE/API) | `PG_ORDENACION` ámbitos layer | detection **VERIFIED-LIVE**; ~35 % of residential land (**share ASSERTED, unsourced**) |

⚠ Until the override branches exist, an NZ 1 parcel that also carries a ficha or a protected-building
entry would receive the general zone answer — a **known false-positive path**. It is currently masked
only because Madrid blanket-refuses; it becomes live the moment the first pack registers.

---

## F. Unverified / open (the honest residual)

- **All NZ 4/5/7/8/9 grado parameters** — not extracted (E5). The gate is one bounded human read of
  Compendio 2025 Cap. 8.1–8.9, not a data-discovery problem.
- **`COEF_Z` legal meaning and denominator** — not established (E6, §B2). Quarantined.
- **Zones 2/6/10/11 absence cause** — three candidates, none established (§0.3).
- **NZ 9 identity** — name, chapter, rule kind all unknown (§C).
- **NZ 5 rule KIND** — setback vs open-block separation, undetermined (§C).
- **PG97 approval date** — `17-04-1997 / BOE 19-04-1997` is carried from the prior dossier and was
  **not re-verified** this pass. ASSERTED.
- **`permittedUse: residential` for NZ 1 grado 1º** — SECONDARY (COAM). Re-cite or drop.
- **Land-share figures** — "~65 % directly NZ-governed", "~96 % in NZ 3/4/1/8", "~35 % derived
  ámbito" are **UNSOURCED** and must never be presented as measured coverage.
- **Override behaviour** (protected / ficha) — not established (§E).
- **Licence text** for `sigma.madrid.es` services — not established. "no auth observed" is an
  *access* observation, **not** a licence grant.
- **GIS update frequency** — unknown. Cannot be inferred.

---

## G. Asserted-but-unprobed (batches 3–6) — hypotheses, not sources

Everything in this section arrived in the founder captures and **has not been queried once**. Field
names, layer contents, and behaviours below are **hypotheses**. None may be cited, and none may be
counted toward any completeness axis, until a `MapServer` response returns it.

### G1 — `AMB_TX_DENOM` — the cheapest open probe in the dossier (capture-note C-7)

Batch 3 states that `NORMAS_ZONALES/MapServer/0` carries a second field **`AMB_TX_DENOM`** returning
the official designation per code — `ZONA 1 GRADO 3º`, `NZ 4`, `ZONA 8 GRADO 2º NIVEL a`.

- **If real, it closes a gap batch 2 scored at 70 % with no ordinance read at all** — the *"exact
  legal names per grado"* task disappears.
- **Corroboration exists in-repo:** this repo's own 2026-07-24 recon recorded `AMB_TX_DENOM` as the
  "human denomination" field on the same layer, with examples of the same shape. That raises
  confidence but is still **not a verification of the full 34-code mapping**.
- **Cost to verify:** one query returning both fields for all 34 codes.
- ⚠ **It does not move C63 Axis 2.** A designation is not a cited numeric rule, and nothing is
  L-449-signed. It closes a *labelling* gap, not a *legislation* gap. Do not let a 100 % on
  `officialDesignation` read as progress on the parameters.

### G2 — Parcel join: a direct contradiction, **NOT resolved here** (capture-note C-8)

| Batch 2 (§WS7) | Batch 3 (PART B) |
|---|---|
| Build a **Catastro connector**; `parcelSource.identifier = "REFCAT"`; flow `user click → Catastro parcel → centroid → Madrid GIS` | **"Madrid does NOT use Catastro refcat as join."** Flow `clicked coordinate → NORMAS_ZONALES → CONDICIONES_EDIFICACION`, explicitly **not** `refcat → CODMANZANA` |

**What IS verified (this repo, 2026-07-24):** `CODMANZANA` has **no string relationship to a Catastro
refcat** — disproved against three real refcats — and the planning join is **spatial**. That
confirms batch 3's *negative* claim.

**What is NOT settled:** whether Madrid needs a Catastro connector *at all*. The two positions may be
talking past each other — batch 2's Catastro need is partly about the **user-facing parcel boundary**
(the polygon the user clicks and sees), which batch 3's coordinate-first flow does not supply.
**This reading is offered as a candidate reconciliation and is deliberately NOT adopted**; it is
recorded so nobody implements either architecture on the assumption the question is closed. It
determines whether a Catastro **licence** is needed — itself an open PART-B item (§F).

### G3 — Four GIS layers named, none probed (capture-note C-17)

| Layer | Asserted purpose | State |
|---|---|---|
| **`PG_ANALISIS_EDIFICACION`** | existing building footprint / floors / volume | **NET-NEW, UNPROBED.** If real it changes the product question from *"what may be built on an empty parcel"* to *"what may be done given what already stands"* — new build vs extension vs rehab vs replacement |
| `PG_EDIFICIOS_PROTEGIDOS` | heritage catalogue; asserted fields `NORMATIVA`, `COEF_Z`, `CATALOGO`, `NIVEL` | service **exists** (seen in the service directory); **field inventory and behaviour UNPROBED** |
| `PG_USOS_Y_ACTIVIDADES` | use graph — *uso cualificado* / *uso compatible*, coded | service **exists**; **legend UNDECODED** |
| `PG_GESTION/Alineaciones` | alignment polylines (critical for NZ 4) | service **exists**; the geometry has **not** been retrieved or validated as an NZ-4 depth reference |

⚠ Two of these were also claimed to carry `COEF_Z` (`PG_EDIFICIOS_PROTEGIDOS`). If so, the §B2
quarantine applies there **too** — a coded value does not become interpretable by appearing on a
second layer.

### G4 — Structural requirements Madrid surfaces that the current schema lacks

Recorded because they change what a Madrid pack must be able to *represent*, not merely what values
it holds. These are **schema findings**, not data:

| # | Requirement | Why it matters here |
|---|---|---|
| G4.1 | **Grade inheritance** — `Zona → grado → nivel` as a three-level tree with selective override (`{ base: "Zona 8", override: "8.2.a" }`) | Barcelona's *claus* are flat and self-contained. Madrid's 10 NZ-8 codes would otherwise duplicate hundreds of rules. Third consecutive city needing a structural addition the Barcelona template lacks. |
| G4.2 | **Per-parameter resolution** — an APR may override *height* but not *coverage* | A rule stored as one atomic record with one priority **cannot express this**. The resolved value for one parameter may come from a different instrument, at a different priority, than its neighbour. |
| G4.3 | **Exception trees, not scalars** — *"retranqueo mínimo salvo parcelas inferiores a…"* | A setback is `{ default, exceptions: [{condition, value}] }`. A scalar loses the condition silently. |
| G4.4 | **Two independent grade dimensions** — `zoning.grade` vs `buildingCondition.grade` | See §A: proven in-repo. Must be a **type-level** distinction, not a naming convention. |
| G4.5 | **Per-field confidence**, not per-zone | `NZ4 confidence = 80 %` hides that `zoneCode` is 100 % and `farRatio` is 0 %. |

⚠ These belong in the shared contract / ADR-0279 discussion, **not** in a Madrid rule pack — they are
the third city's evidence that slot S4's internal structure is jurisdiction-shaped. Flagged here, not
designed here.

---

*Last updated: 2026-07-31. Ordinance identity + legal status VERIFIED this pass (§0.1/§0.2) —
supersedes every "Compendio 2023" citation previously in this dossier. Zero rule values cited; zero
signed. Maintainer: UNASSIGNED. Companion: [`VERIFICATION.md`](./VERIFICATION.md) (the L-449 gate).*
