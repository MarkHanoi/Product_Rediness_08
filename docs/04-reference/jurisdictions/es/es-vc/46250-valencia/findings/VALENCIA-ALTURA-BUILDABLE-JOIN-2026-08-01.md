# VALÈNCIA — the `altura` × BUILDABLE-LAND join, and a full-catalogue Plano C sweep

> **Date 2026-08-01.** Evidence for [`../CLOSURE-REGISTER.md`](../CLOSURE-REGISTER.md) rows **#1**,
> **#2** and **#8**. It discharges the condition those rows named as unmet.
>
> ⚠ **It does NOT change València's ENVELOPE answer.** València is still **0 % computable**. What it
> changes is the *size* of one lead, the *reason* it is still blocked, and the *strength* of the
> negative on Plano C. Read §5 before quoting anything here.

---

## 0 — What was measured, in one paragraph

Three things, all against the live municipal ArcGIS on 2026-08-01. **(1)** The whole public REST
catalogue was field-swept — **696 layers across 67 services in all 16 public folders**, widening the
earlier sweep of 70 layers in one service — and it finds no `profundidad` / `edificabilidad` /
`ocupación` / *número de plantas* field anywhere. **(2)** Layer 212's `altura` was **spatially joined
to the L-656 private-buildable denominator** — the join `CLOSURE-REGISTER` #2 named as its unmet
condition (b) — and the lead is **52,6 % of buildable land, roughly TWICE the 27,13 % figure the
register quotes as "the honest size"**. **(3)** The delegation share and the buildable denominator
were **re-derived by an independent server-side code path** and agree with the committed figures to
within 0,2 pp.

---

## 1 — ⚠ The denominator was the whole story, twice

| pass | figure | what it is a share of |
|---|---:|---|
| 2026-07-31 | **65,5 %** | layer 212's **polygon COUNT** — ⚠ corrected as an overstatement |
| 2026-08-01 (earlier) | **27,13 %** | layer 212's **own AREA** (4 213,7 ha) — recorded as *"the honest size of the lead"* |
| **2026-08-01 (this file)** | **52,6 %** | ⭐ the **L-656 PRIVATE-BUILDABLE denominator** (1 869,6 ha) |

**Both earlier numbers were wrong in the same way and for the same reason: a ratio was quoted without
its denominator.** The 27,13 % pass explicitly flagged this about itself — *"even the 27,13 % is a
share of the WRONG denominator, because layer 212 has not been spatially joined to the buildable
extent"* — and was right to. This is that join.

⚠ **The correction that "corrected" 65,5 % down to 27,13 % under-stated the lead almost exactly as
much as 65,5 % over-stated it.** A register reader who took 27,13 % as the ceiling was reading a
number about streets, parks and huerta as though it were about buildable land.

## 2 — Method, stated before the numbers

- **1 400 points** drawn uniformly at random over the canonical `tools/context-bake/terrain.mjs`
  REGIONS `valencia` bbox `[-0.43, 39.40, -0.30, 39.52]`, seeded `20260801` (re-runnable, diffable).
- Each point resolved by **ONE ArcGIS `identify`** against layers **7** (*PGOU Alineaciones*) and
  **14** (*PGOU Calificaciones*) of `Tools/FichaUrbanismo/MapServer` **at the same coordinate** — so
  the zone answer and the `altura` answer can never drift apart the way two separate queries could.
- **Retained** where `clase='SU'` ∧ `califi` ∈ Art. 6.3.1's six zones. **156 points landed on the
  denominator**; 1 244 fell outside it; **0 failed in transport**.
- Uniform-over-area sampling ⇒ the retained set is **AREA-WEIGHTED by construction**, so every figure
  below is a **land share**, not a polygon count. That is the specific error §1 exists to prevent.
- ⚠ **The trap control ran first, as always.** `where=1=1&returnCountOnly=true` → `{"count":21210}`
  (L14) and `{"count":21975}` (L7) were asserted **before** any filter; `califi='ZZZNOPE'` →
  `{"count":0}`. **The two responses are byte-identical in SHAPE.** Without the first, the second is
  indistinguishable from an outage.
- ⚠ **N = 156. This is a SAMPLE, not a census.** Every figure carries a 95 % Wilson interval and none
  may be quoted without it.

## 3 — `altura` over the L-656 private-buildable denominator (N = 156)

| `altura` value class | n | share of buildable land | 95 % CI | example |
|---|---:|---:|---|---|
| **bare integer 1…30** — the only plausible storey counts | 82 | **52,6 %** | 44,8 – 60,2 | `"4"` |
| `<=n` / `Max n` — a real storey **BOUND** | 24 | 15,4 % | 10,6 – 21,9 | `"<=5"` |
| other / junk | 22 | 14,1 % | 9,5 – 20,4 | `"BRL_MIL 0"` |
| ⚠ literal **`0`** | 16 | **10,3 %** | 6,4 – 16,0 | `"0"` |
| protection-derived | 9 | 5,8 % | 3,1 – 10,6 | `"PROTEGIDO"` |
| delegated / deferred | 2 | 1,3 % | 0,4 – 4,6 | `"PPARCIAL"` |
| floorspace / FAR | 1 | 0,6 % | 0,1 – 3,5 | `"42000m2t"` |

### Per zone

| zone | n | bare storey | `<=n` bound | `0` | other |
|---|---:|---:|---:|---:|---:|
| **ENS** (41,3 % of buildable land) | 61 | **47 (77,0 %)** | 2 | 4 | 8 |
| **EDA** (29,9 %) | 55 | 20 (36,4 %) | **20** | 9 | 6 |
| CHP (10,1 %) | 19 | 10 | 0 | 1 | 8 |
| UFA (8,2 %) | 6 | 3 | 0 | 1 | 2 |
| IND (5,6 %) | 12 | 1 | 2 | 0 | 9 |
| TER (4,9 %) | 3 | 1 | 0 | 1 | 1 |

⚠ **EDA behaves differently from ENS and the difference is systematic**: EDA's largest bucket is the
`<=n` / `Max n` **bound** (20 of 55), not a bare value. A bound is a storey statement but **not a
determination** (L-616) — so EDA is materially weaker than the headline suggests, and any future
parser must branch on the zone, not on the string alone.

### The bare-integer histogram

`1`×11 · `2`×8 · `3`×3 · `4`×9 · `5`×12 · `6`×11 · `7`×9 · `8`×17 · `9`×1 · `15`×1

⭐ **1…9 is exactly the domain of Art. 6.19.1's own eight-row table (2 → 9 graphed plantas).** That is
a strong *signal* about what the field encodes. **It is not proof** — see §5.

## 4 — ⚠⚠ The `0` bucket: a REFRAMING, and the earlier reading was the wrong shape

`0` is **34,13 % of layer 212's area** but only **10,3 % of buildable land** — a **3,3× collapse**.
Sampled geometry says why. Two probed `altura='0'` features:

- **Ruzafa** — a single polygon of **29,4 ha with 99 rings: 1 outer and 98 INTERIOR HOLES.** That is
  the *street space with the manzanas punched out of it* — the non-buildable complement of the blocks.
- **Benimaclet** — a 17 674 m² polygon that coincides **to the square metre** (same area, same
  perimeter) with a `GEL Espacios Libres` calificación polygon: designated open space.

⇒ On the land that matters, `0` is largely a **TRUE ZERO on ground nobody may build on**, not the
unknown-sentinel that the layer-relative reading made it look like.

⚠ **This corrects the emphasis of `CLOSURE-REGISTER` #2 and `VALENCIA_ALTURA_FIELD_MEASURE`**, which
call `0` *"a SENTINEL for unknown, never a storey count"* and rank the row as *"the most dangerous"*
in the register. Measured on the right denominator it is much less dangerous than that.

⚠ **It is a reframing, not an all-clear.** 10,3 % of buildable land still carries `0`, C58 §1.7a and
L-616 still forbid reading any `0` as a determination, and the geometry evidence is **four points**.

## 5 — ⛔ WHAT THIS DOES NOT ESTABLISH, AND WHY VALÈNCIA STAYS AT 0 %

The join closes condition **(b)** of `CLOSURE-REGISTER` #2. Condition **(a)** — *what the field
means* — is **untouched**, and any ONE of the following is sufficient on its own to forbid packing:

1. ❌ **Nothing documents `altura`.** 696 layers swept; layer 212's only description is *"Muestra las
   alineaciones del Plan General de Ordenación Urbana"*. That it is Art. 6.19.1's *número de plantas*
   remains an **INFERENCE**. The field is named *altura* (a HEIGHT); the article graphs a *número de
   plantas* (a COUNT). A `4` read as storeys yields 13,5 m; read as metres it yields 4 m.
2. ❌ **The `−1` convention is established for the ARTICLE, not for the FIELD.** Art. 6.19.1 defines
   Np as *«el señalado en los planos menos uno»*. Whether `altura` stores the graphed count or Np
   already is undocumented, and the two differ by **2,90 m on every ENS building**.
3. ❌ **`profundidad edificable` is published NOWHERE.** ENS needs Art. 6.18.2's depth *as well as*
   6.19.1's height. **No attribute in the entire public catalogue carries it.** This alone ends it.
4. ❌ **A computed Hc is not a ceiling.** Art. 6.19.3 can *require* exceeding it (enrase de cornisas)
   and 6.19.3.c grants ENS-2 infill an extra storey.
5. ⚠ **The `<=n` bound class (15,4 %, and EDA's largest bucket) is not a value**, and the junk +
   protection + floorspace classes (21,8 %) are not storey counts under any reading.

### The one genuinely new geometric hypothesis, recorded and NOT relied on

At **Gran Via Marqués del Turia**, the layer-231 `ENS` calificación polygon measures **4 902 m²**
(≈30,5 m mean width) and the layer-212 polygon carrying `altura="7"` **nests inside it** at **3 130 m²**
(≈17,6 m mean width) — which is what an *área de movimiento* bounded by Art. 6.18.2's ≤20 m
*profundidad edificable* would look like. **If** layer 212's polygon IS the buildable footprint, its
geometry encodes the depth and blocker (3) falls.

⛔ **It is FOUR POINTS, and it is contradicted at scale**: layer 212 totals **4 213,7 ha against a
1 869,6 ha buildable denominator — 2,25×**, which is not the shape of a tight buildable-footprint
layer. **Unmeasured. Explicitly not relied on.** Measuring it is a named next step, not a finding.

## 6 — The full-catalogue sweep: a much stronger negative on Plano C

The prior sweep read the field schema of **70 layers in ONE service**. This one reads **every public
service in every folder**: **33 folders → 16 public → 72 services → 67 MapServer/FeatureServer →
696 layers, 0 layer-level errors.**

**No layer in the public catalogue publishes `profundidad`, `edificabilidad`, `ocupación`,
`retranqueo`, or a *número de plantas* under any name.** The only envelope-parameter-shaped fields
remain `212.altura` (this file), `321.nivel_prot` (heritage protection level) and `223.nivelaltura`
(a street-axis polyline, `null` on every sampled row).

⭐ **One genuinely new service was found and it is a DEAD END, which is worth recording so nobody
re-finds it hopefully.** `Tools/FichaUrbanismo/MapServer` — the backing service of the municipality's
*ficha urbanística* — carries layers **2 "PGOU Alineaciones (TEXTOS)"** and **7 "PGOU Alineaciones"**.
The name *(TEXTOS)* is exactly what a digitised drawing's annotation layer would be called, and on a
1991 CAD plan the storey count IS drawn as text. **Measured: both return `{"count":21975}` and carry
the identical field list including `gis.gis.PGOU_AL.area` — they are the SAME source table `PGOU_AL`
as OPENDATA layer 212, republished for a different app.** No independent annotation exists.

⇒ **Plano C is not in the public REST catalogue, and that is now settled across the whole catalogue
rather than one service.** Blocker #1 needs a human and an institution.

## 7 — ⚠ 17 gated folders: RE-PROBED, still UNKNOWN

Re-probed 2026-08-01. All **17** still answer **`{"error":{"code":499,"message":"Token Required"}}`**
at the FOLDER level: `Bomberos · CIA · ConsellAgrari · FDM · Geoprocesos · GobiernoAbierto ·
GTECatastral · InspeccionTributos · Jardineria · MantInfraestructura · Mapa_Base ·
Patrimonio_Historico · PoliciaLocal · ResiduosSolidos · Sanidad · Turismo · Vivienda`.

⚠ **UNKNOWN, never absent** (L-422/457/467/469). Heritage constrains envelopes **downward**, so
recording them as "no data" would OVER-state. Their being unknown **cannot inflate a 0 %**, which is
why `CLOSURE-REGISTER` #8 does not block today — but it bounds what §6's negative proves, and it
would block the moment any envelope shipped.

## 8 — ⭐ Independent re-derivation of the delegation share (§probe-can-be-wrong-three-ways)

The committed 36,40 % came from a **client-side shoelace** over 21 210 downloaded rings.
`Tools/FichaUrbanismo` layer 14 exposes **`st_area(shape)`**, so the same quantities were re-computed
**server-side in SQL** — a different code path, a different service, the same source table.
(⚠ `Shape.STArea()` is still refused 400 on `OPENDATA/…/231`; that finding stands.)

| quantity | dossier (client-side shoelace) | **server-side `st_area`** | delta |
|---|---:|---:|---:|
| all 21 210 polygons | 14 419,8 ha | **14 419,8 ha** | 0,00 % |
| `clase='SU'` | 4 010,7 ha | **3 998,9 ha** | 0,29 % |
| **L-656 private buildable** | **1 874,9 ha** | **1 869,6 ha** | **0,28 %** |
| PGOU-ordered | 63,60 % | **63,78 %** | 0,18 pp |
| **DELEGATED** | **36,40 %** | **36,22 %** | **0,18 pp** |
| delegated excl. `MP` (floor) | 30,02 % | **30,04 %** | 0,02 pp |
| by zone | ENS 41,33 · EDA 29,94 · CHP 10,06 · UFA 8,15 · IND 5,53 · TER 4,99 | ENS 41,34 · EDA 29,92 · CHP 10,09 · UFA 8,18 · IND 5,55 · TER 4,92 | ≤0,07 pp |

⇒ **The inherited 36,40 % survives an independent method.** The committed figures are KEPT — a 0,18 pp
delta is not a re-measurement — and what is established is that the number was measured, not guessed.
The residual is consistent with the `geometryPrecision=2` rounding of the original download.

## 9 — What this file establishes, and what it does not

**ESTABLISHED**
- ⭐ The `altura` × buildable-land join: **52,6 %** [44,8–60,2] bare storey, **not** 27,13 %.
- ⭐ The `0` bucket collapses to **10,3 %** on buildable land and sits on non-buildable ground.
- ⭐ ENS alone is **77,0 %** bare storey; **EDA's largest bucket is a BOUND, not a value.**
- ⭐ Plano C is absent from **the whole public catalogue** (696 layers), not just one service.
- ⭐ `Tools/FichaUrbanismo` layers 2/7 are the SAME table as 212 — a dead end, recorded as such.
- ⭐ 36,40 % delegation and the 1 869,6 ha denominator **confirmed by an independent method**.
- ⚠ The 17 gated folders are **re-probed and still UNKNOWN**.

**NOT ESTABLISHED — do not let a later reader assume otherwise**
- ❌ That `altura` encodes Art. 6.19.1's *número de plantas*. **Still an inference** (R5).
- ❌ The `−1` convention for the FIELD.
- ❌ That layer 212's polygon is the *área de movimiento*. **Four points; contradicted 2,25× at scale.**
- ❌ Anything about the 17 token-gated folders.
- ❌ **Any envelope number for any València parcel. The measured answer is still 0 % computable.**

---
*Authority: C58 §1.2/§1.7a · C63 §1.1/§1.5/§3 · ADR-0270 · L-422/457/467/469 · L-616 · L-656 ·
§CONTEXT-DATA-HONESTY · §probe-can-be-wrong-three-ways. Probed live 2026-08-01 against
`geoportal.valencia.es`. Code: `packages/site-parcel-data/src/rulepacks/esValenciaEnvelope.ts`
§VALENCIA-ALTURA-BUILDABLE-JOIN (`VALENCIA_ALTURA_ON_BUILDABLE_LAND`), pinned by
`__tests__/valenciaRouting.test.ts`.*
