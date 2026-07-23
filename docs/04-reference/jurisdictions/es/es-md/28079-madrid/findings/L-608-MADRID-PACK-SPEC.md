# L-608 — Madrid (INE 28079) first-pack SPEC: the four Normas Zonales, their geometricRule kinds, and what is document-gated

> **What this is.** The P4/P5/P6-stage record for Madrid: the rule-kind decision per Norma
> Zonal, the ArcGIS live-probe results that decide DATA-vs-DOCUMENT per field, the `explicit-area`
> `ringRef` resolver design for NZ 1, the pack SPEC, and the honest first-pack resolution with its
> named denominator. Author: research agent, 2026-07-23. Status: **SPEC — not a shippable pack.**
> Confidence tier on every claim below is labelled (§CONTEXT-DATA-HONESTY).
>
> **Governance:** C58 §1.2/§1.4/§1.7a/§1.11/§2.2, ADR-0270/0271, JURISDICTION-PLAYBOOK P4–P6.
> **The honesty rule that outranks the rest:** *failure and empty are the same VALUE and must
> never be the same ANSWER.* Where I could not source a value, it stays `null` and is listed
> unverified — never interpolated.

---

## 0 — TL;DR

- **Four Normas Zonales, three geometricRule kinds, and they are NOT interchangeable:**
  NZ 1 → `explicit-area`, NZ 4 → `alignment`, NZ 8 (+ 5, 7) → `setback`, NZ 3 → a **cited
  refusal** (`derived-plan`), not an envelope.
- **NZ 1 is the only one whose numbers are DATA, not document** — and it is the *first real use
  of `explicit-area`*: Madrid publishes the buildable footprint (`Fondo de la Edificación`) and
  the edificabilidad (`COEF_Z`) as **live queryable ArcGIS geometry+attributes** (verified this
  pass). **But it is BLOCKED on an engine branch that does not exist** — `explicit-area` is
  declared in the schema and has **no solver** (C58 §2.2 table: *"declared, no engine branch —
  KG-4"*). So NZ 1 is *sourceable* and *un-shippable* at the same time, and the honest state
  records both.
- **NZ 4 / 8 / 5 / 7 are DOCUMENT-gated.** Their operative numbers (fondo edificable, retranqueos,
  alturas, ocupación) sit in the PGOUM-97 NNUU (Compendio 2023), are **grado-structured** (each NZ
  has several *grados* with different parameters), and I could not transcribe them citeably from a
  primary read this pass. They stay `null`. **The Zod schema itself blocks a placeholder pack**:
  `AlignmentRuleSchema.buildableDepth_m` must be `.positive()` and `SetbackRuleSchema` needs the
  full front/side/rear triple — so there is literally no way to author a *functional* NZ 4/8 pack
  without the sourced numbers. That is a feature: the schema enforces the honesty gate.
- **Honest first-pack ENVELOPE resolution shippable TODAY ≈ 0 %** (SPEC only). The *ceiling* once
  the four are sourced+solvable is **≈ 60–62 % of Madrid residential clicks** (derivation in §6).
  The per-NZ land-share split is **UNSOURCED** — I do not assert which of the four is largest
  beyond the qualitative fact that NZ 4 (manzana cerrada) is central Madrid's dominant residential
  typology.

---

## 1 — The eleven Normas Zonales, and why only four matter (Tier: VERIFIED-DOC)

The PGOUM-97, in the *Área de Ordenación Directa en Suelo Urbano*, establishes **eleven** Normas
Zonales (COAM summary of the NNUU, secondary but consistent with the Compendio 2023 index):

| NZ | Name (NNUU) | Typology | Residential? |
|----|-------------|----------|--------------|
| 1 | Protección del Patrimonio Histórico | historic core, footprint published per-manzana | yes (core) |
| 2 | Protección de Colonias Históricas | protected historic garden-colonies | yes (minor) |
| **3** | **Volumetría específica** | volume fixed per-parcel by ficha/approved volumetry | yes |
| **4** | **Edificación en manzana cerrada** | *ensanche*: alineación a vial + fondo edificable + medianería | yes (dominant) |
| 5 | Edificación en bloques abiertos | open blocks, real separations | yes |
| 6 | Edificación en cascos anexionados | annexed old-town cores | yes |
| 7 | Edificación en baja densidad | low-density | yes |
| **8** | **Edificación en vivienda unifamiliar** | detached / row single-family, real retranqueos | yes |
| 9 | Actividades económicas | industrial / tertiary | no |
| 10 | Ejes terciarios | tertiary axes | no |
| 11 | Remodelación | remodelling areas | mixed |

Prior assessment (VERIFIED-LIVE, carried in the task brief): **~65 % of Madrid residential land is
governed DIRECTLY by a Norma Zonal** (the other ~35 % sits in a derived *ámbito* — an APR/APE/API/
Plan Parcial — which is the Madrid equivalent of Barcelona's 62.8 % derived-planning trap, and is
a `derived-plan` refusal, not an envelope). **Of the directly-governed residential land, NZ 3/4/1/8
≈ 96 %.** Hence the first pack targets exactly those four.

⚠ The task brief's rule-kind hint (*"NZ1→explicit-area, NZ4→alignment, NZ8/5/7→setback"*) is
**confirmed by the typology column above** and justified per-NZ in §3.

---

## 2 — LIVE ArcGIS probe (Tier: VERIFIED-LIVE, this pass 2026-07-23)

All rows below are **endpoint RESPONSES**, not portal prose (the L-438 discipline). Host:
`sigma.madrid.es/hosted/rest/services/`. Folder `pgoum97` holds 12 services.

### 2.1 — NZ 1 numbers ARE served as data — `PGOUM97/PG_CONDICIONES_EDIFICACION`

Service description (verbatim from `?f=json`): *"indicates building foundations and weighted
buildability coefficients for new construction or restructuring projects **regulated under Zonal
Norm 1**, plus special parcels with individually defined conditions via detailed specification
sheets."* This is the NZ 1 plane, and only NZ 1.

| Layer | Name | Geometry | Carries |
|---|---|---|---|
| 1 | Ficha Específica | point | parcels with **individually-defined** conditions (override) |
| 2 | **Fondo de la Edificación** | **polyline** | the rear buildable-depth line (the footprint boundary) |
| 6 | **Condiciones de la Edificación** | **polygon** | the fields below, per manzana |
| 10 | Fondo | polygon | (closed fondo area — candidate ring) |

**Layer 6 field schema (verbatim `fields[]`):**

| Field | Type | Alias |
|---|---|---|
| `CODMANZANA` | String | "Número de Manzana :" |
| `NUMORD` | String | "Número de Catálogo :" |
| `COND_EDIF` | SmallInteger | "Grado Condición Edificación :" |
| **`COEF_Z`** | **String** | **"Coeficiente Z :"** |

⇒ **NZ 1 edificabilidad (`COEF_Z`) and buildable footprint (`Fondo de la Edificación`) are LIVE
QUERYABLE DATA.** This is the exact case `ExplicitAreaRuleSchema`'s docstring names (*"Madrid's
Fondo de la Edificación polyline"*). Two honest caveats, both load-bearing:
- `COEF_Z` is typed **String**, keyed on **`CODMANZANA`** ⇒ it is **per-manzana** (block
  granularity, C58 §1.11) and may be a coded value, not a bare float. Its parsing must be
  **verified before use** — an un-asserted `parseFloat` on a coded string is a silent-zero risk.
- `Fondo de la Edificación` is a **polyline** (layer 2) with only `OBJECTID` — it is the rear line,
  **not a closed ring**. The buildable AREA is the polygon between the *alineación oficial* (front)
  and this fondo (rear). Layer 6 (polygon) or layer 10 ("Fondo", polygon) may already BE that
  closed area — **which one is the ring is UNVERIFIED** and is the first thing the ringRef resolver
  (§4) must pin down.

### 2.2 — the Norma-Zonal calificación plane — PARTIAL this pass

`pgoum97/PG_ORDENACION` (the calificación / uso pormenorizado plane) returned **HTTP 500
"Service not started"** on three attempts this pass — so I could **not** re-confirm the
per-parcel Norma-Zonal query endpoint live today. The prior assessment recorded it VERIFIED-LIVE
(*"Madrid publishes calificación as a LIVE queryable ArcGIS point service"*); I am **not**
downgrading that, but I am flagging that **this pass did not re-verify it** (Tier: PRIOR-VERIFIED,
not re-confirmed). What I *did* see live: `pgoum97/PG_ORDENACION_SIN_AMBITO` layer 4 is a dedicated
`Norma Zonal 1.5` polygon, and layer 5 is `Alineaciones` (polyline) — so the alineación plane NZ 4
needs (§3.2) is served.

**Resume step:** retry `pgoum97/PG_ORDENACION/MapServer/layers?f=json` when the service is up;
identify the layer + field carrying the NZ code (`NORMA_ZONAL`/`CALIF`/`USO`), and run a
`GetFeatureInfo`/`query` at a known central-Madrid residential coordinate. Assert on response
shape; **run an unfiltered `returnCountOnly` before believing any zero** (task mandate).

### 2.3 — other planes seen live
- `ANALISIS_URBANO/Visor_Edificabilidad` — edificabilidad at **ámbito** granularity (Jan-2024
  "ámbitos vigentes"), EPSG:25830. **NOT parcel-level** ⇒ C58 §1.11 says it may be shown as
  context but must never be a parcel envelope. It is the wrong-granularity trap the granularity
  discriminator exists for; **do not** feed it to the generator.
- `pgoum97/PG_GESTION` layer 8 `Alineaciones` (polyline) — the official alignment plane.

---

## 3 — geometricRule decision per NZ (C58 §2.2 kinds), justified

### 3.1 — NZ 1 → `explicit-area`  (the first real use)

**Why.** Madrid does not state NZ 1 as parameters — it **publishes the buildable polygon
directly** (§2.1). `ExplicitAreaRuleSchema` exists precisely for *"when the document IS the polygon,
transcribing it into parameters is a lossy re-derivation of something already authoritative"*.
Coercing NZ 1 into `alignment` (front + depth) would re-derive, badly, a footprint the city already
draws. The rule carries only `ringRef: string`; the geometry is resolved at the provider boundary
(§4). Edificabilidad rides as `plotRatioFAR`-like data from `COEF_Z` **at block granularity**.

⚠ **BLOCKED, and this is the honest headline for NZ 1.** `explicit-area` has **no engine solver
branch** (C58 §2.2 KG-4). The discriminated-union solver switch is exhaustive, so *adding* NZ 1 to
a solved path is a **compile error** until the branch exists — which is the safe failure, not a bug.
NZ 1 is therefore *sourced* (data live) but *un-solvable* until: (a) the engine grows an
`explicit-area` case, and (b) the §4 ringRef resolver ships.

### 3.2 — NZ 4 → `alignment`  (manzana cerrada = ensanche)

**Why.** *Edificación en manzana cerrada* is the canonical *alineación a vial* + *fondo edificable*
+ *medianería* fabric: the façade sits ON the official alignment line, the mass extends to a
maximum buildable **depth** measured from it, and the sides are party walls. This is a **different
geometric OPERATION** from a setback (inset-then-half-plane-clip, not erode-from-all-edges) —
ADR-0270's whole reason to exist. It maps 1:1 onto `AlignmentRuleSchema`:
`alignTo: 'official-line'` (Madrid publishes *alineaciones* as their own layer — the schema's
`'official-line'` note names Madrid explicitly), `alignmentOffset_m: 0`, `sideTreatment:
'party-wall'`, `buildableDepth_m` = the **fondo edificable** (a *stated* number per grado — this is
the key contrast with Barcelona 13a, whose depth is *constructed* per block via Art. 242 and needs
`block-derived-alignment`; Madrid states it, so plain `alignment` is correct).

⚠ **DOCUMENT-gated.** The fondo edificable is grado-structured and I did not source it citeably
this pass (§5). `buildableDepth_m` must be `.positive()` ⇒ **no NZ 4 pack can be authored until the
number is read from the NNUU and human-verified.** The schema is the gate.

### 3.3 — NZ 8 → `setback`  (and NZ 5, NZ 7 alongside)

**Why.** *Vivienda unifamiliar* (NZ 8), *bloques abiertos* (NZ 5) and *baja densidad* (NZ 7) are
detached/open fabric governed by **real separation distances** — front/side/rear retranqueos to the
parcel boundaries. That is the **native** `setback` shape (`parcel ⊖ {front, side, rear}`), exactly
as Barcelona 20a turned out to be. No alignment, no block ring. `SetbackRuleSchema` requires the
full non-negative triple.

⚠ **DOCUMENT-gated**, grado-structured, not sourced this pass ⇒ `null`, no pack.

### 3.4 — NZ 3 → a cited **refusal** (`derived-plan`), not an envelope

**Why.** *Volumetría específica* means the buildable volume is **specifically defined per parcel**
— by the existing/approved volume captured in a ficha, not by a general parametric zone rule. There
is no zone-level FAR/height/depth to encode; the "rule" is *"see this parcel's specific volumetry"*.
The honest output is the `derived-plan` refusal (*"the general plan points at a per-site document
PRYZM does not hold"*) — a **positive, cited answer**, not a fabricated envelope. **Upgrade path:**
if the specific volumetry is ever published as geometry (as NZ 1's footprint is), NZ 3 becomes an
`explicit-area` zone; until then it refuses. (The 2016 NNUU modification of Cap. 8.3 set grado-1º
qualified use to *residential* — citeable for `permittedUse` on the refusal card, nothing more.)

**Summary table:**

| NZ | kind | needs block ring? | numbers are… | authorable today? |
|----|------|------|------|------|
| 1 | `explicit-area` | no (needs ringRef resolver) | **DATA (live)** | declaration only — **engine-blocked (KG-4)** |
| 3 | *refusal* `derived-plan` | — | none (per-parcel ficha) | **yes** (refusal copy) |
| 4 | `alignment` | no | **DOCUMENT** (fondo edificable, per grado) | no — schema needs positive depth |
| 8 (5,7) | `setback` | no | **DOCUMENT** (retranqueos, per grado) | no — schema needs the triple |

---

## 4 — The `explicit-area` `ringRef` resolver design (reusable asset — playbook-flagged)

`ExplicitAreaRuleSchema` deliberately carries only `ringRef: string` — *"geometry is never inlined
here"*. `ringRef` names a **provider-side resolver** that produces the buildable RING for the
clicked parcel. This is the reusable asset the JURISDICTION-PLAYBOOK flags (any jurisdiction that
publishes a buildable footprint reuses it). Proposed:

- **`ringRef` value:** `"madrid-nz1:fondo-condiciones/v-<vintage>"` (a stable, versioned handle —
  never inlined geometry, so the pack stays small and diffable).
- **Resolver contract (provider layer, L2 — NOT the pure engine):**
  1. From the parcel's `CODMANZANA`, fetch the manzana's **buildable polygon**. Candidate source,
     in order of preference, to be settled by §2.1's open verification: (a) layer 6 `Condiciones de
     la Edificación` polygon if it is the buildable area; (b) layer 10 `Fondo` polygon; (c)
     **constructed** ring = close the `Fondo de la Edificación` polyline (layer 2, rear) against the
     `Alineaciones` polyline (front), clipped to the manzana. Option (c) is the fallback and is the
     part that makes this genuinely reusable (fondo-line + alignment-line → ring is a general op).
  2. Attach `COEF_Z` (layer 6) as the edificabilidad, **granularity `block`** (C58 §1.11), with its
     String value **parsed under assertion** — refuse (not zero) on an unparseable code.
  3. Check `Ficha Específica` (layer 1): if a point falls in the parcel, its conditions are
     **individually defined** ⇒ the general resolver must **defer** (a per-parcel ficha PRYZM does
     not hold) — refuse with a specific reason, never guess.
  4. Return the ring to the (future) `explicit-area` engine branch, which clips the parcel to it.
- **Provenance:** `published-structured` (this is live municipal geometry, not ordinance-pdf) — the
  one Madrid field that earns a green chip rather than the amber estimate badge.
- **Granularity:** `block` for `COEF_Z`; the footprint is the legal per-parcel answer but is
  *derived from* per-manzana geometry, so the card must say "block-published footprint".

⚠ Ordering: the ringRef resolver is **useless without the engine branch**, and the engine branch is
**useless without the resolver**. Both are one unit of work (KG-4), and both are **out of scope for
a data-only pack** — hence NZ 1 ships as a *declaration*, not a solve.

---

## 5 — What is DOCUMENT-gated (the human sourcing queue)

The operative numbers for NZ 4 / 8 / 5 / 7 live in the **PGOUM-97 NNUU, Compendio 2023** (the living
consolidated text: `madrid.es/.../CompendioNNUU/Compendio 2023/1 Compendio 2023.pdf`), Capítulos
8.x, and are **grado-structured** (a single scalar per NZ would be the bare-`20a` category error —
NZ grados differ materially). This pass could **not** transcribe them citeably:
- The `madridlicencias.com/.../PGOUM-97.pdf` compendio returned as compressed/encoded streams the
  fetch could not read (saved locally, no text layer extractable via WebFetch).
- Web-search hits mixed a **specific APR plan's** values (e.g. a 16 m fondo, BAJO+IV) with the
  general norm — **secondary and unsafe**; not promoted (the exact trap the Barcelona SOURCES.md
  §C.6 names).

⇒ Per NZ, the human gate must read Cap. 8.x of the Compendio 2023 and extract, **per grado**:
fondo edificable (NZ 4), retranqueos front/side/rear (NZ 8/5/7), altura de cornisa / nº plantas,
ocupación máxima, usos cualificados/compatibles. Each becomes a `SOURCES.md` row or stays `null`.

---

## 6 — Honest first-pack resolution, with named denominator

**Denominator:** a Madrid **residential parcel click** (a user dropping a pin on a residential plot
and asking "what can I build here?").

| Layer | Fraction | Tier |
|---|---|---|
| Residential land governed DIRECTLY by a Norma Zonal | ~65 % | PRIOR-VERIFIED (task brief) |
| …of which NZ 3/4/1/8 | ~96 % | PRIOR-VERIFIED (task brief) |
| ⇒ **NZ 3/4/1/8 share of residential clicks (the CEILING)** | **~62 %** | derived (0.65 × 0.96) |

**Honest resolution TODAY (what ships from citeable sources this pass):**
- Envelopes: **~0 %.** NZ 4/8 (the parametric envelope zones) are document-gated → no pack. NZ 1 is
  data-live but engine-blocked → no solve.
- Cited *answers* (envelope OR cited refusal): NZ 3's share can ship **now** as a `derived-plan`
  refusal, and the ~35 % derived-ámbito land also refuses honestly — but **a refusal is not an
  envelope**, and the founder metric is envelopes.

**Realistic first ENVELOPE pack** (after the §5 human sourcing of NZ 4's fondo edificable + NZ 8's
retranqueos, the two cleanest parametric zones): **NZ 4 alone** is central Madrid's dominant
residential typology and is the single highest-leverage source-and-ship. **I do not assert its
exact %** — the per-NZ land-share split within the 96 % is **UNSOURCED**, and inventing it is the
category the honesty rule forbids. The pair (NZ 4 + NZ 8) is the credible route to "most of the
~62 % ceiling"; NZ 1 adds the historic core **only after the KG-4 engine work**.

**One-line honest number for README/NEXT:** *"First Madrid pack SPEC complete; shippable envelope
resolution today ≈ 0 % (NZ 4/8 document-gated, NZ 1 engine-gated). Ceiling once the four are sourced
and NZ 1's explicit-area solver ships ≈ 60–62 % of residential clicks; per-NZ split unsourced."*

---

## 7 — What remains (mapped to the pipeline gates)

- **P4 (rule extraction):** NZ 4/8/5/7 numbers — **human read of Compendio 2023 Cap. 8.x, per
  grado.** Merge-blocking for any envelope pack.
- **P5 (rule-kind):** ✅ done (§3), and each kind is schema-expressible today **except** the NZ 1
  path needs the KG-4 engine branch.
- **P6 (pack authoring):** blocked by P4 for NZ 4/8; NZ 1 authorable as a declaration but not
  solvable (KG-4); NZ 3 authorable as a refusal now.
- **Engine (KG-4):** add the `explicit-area` solver branch + the §4 ringRef resolver. This is the
  reusable unlock the playbook flags — do it once, NZ 1 and every future footprint-publishing
  jurisdiction benefits.
- **Calificación endpoint:** re-verify `PG_ORDENACION` live (§2.2) — currently PRIOR-VERIFIED only.
