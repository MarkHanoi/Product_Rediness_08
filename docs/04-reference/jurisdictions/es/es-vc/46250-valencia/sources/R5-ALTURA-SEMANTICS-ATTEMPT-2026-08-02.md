# VALÈNCIA R5 — what `MapServer/212.altura` encodes: the attempt, the evidence, the verdict

> **Date 2026-08-02.** Founder directive: *"get the ENVELOPE number as high as it will honestly go."*
> This file is the answer. It is **0 %** — and it is worth reading because **three of the four
> objections were refuted, not repeated.** The one that held is the one that decides València.
>
> Evidence for [`../CLOSURE-REGISTER.md`](../CLOSURE-REGISTER.md) rows **#1** and **#2**.
> Code: `esValenciaEnvelope.ts` §ALTURA-SEMANTICS-SETTLED — `valenciaAlturaRouteBlockers()`,
> `valenciaAlturaRouteIsPublishable()`, `VALENCIA_R5_ASK`.

---

## 0 — The verdict first

**València stays at 0 % ENVELOPE.** `ES_VALENCIA_PGOU_PACK.zones` stays `[]`.
`VALENCIA_ENVELOPE_VERIFIED` stays `false`. No engine change was made and none is warranted.

⭐ **But what València needs has changed shape completely.** The register said it needed **Plano C as
data** — a 1991 drawing set, an institution, possibly a fee, timeline unknown. That is **superseded**:

| | before 2026-08-02 | after |
|---|---|---|
| the alignments | "not published" | **published** — layer 212, 21 975 polygons |
| the buildable **depth** | "published nowhere; blocks ENS" | ⭐ **drawn in the polygon geometry** (median 15,6 m band) |
| the **storey** field | "might be metres" | ⭐ **storey-scale — the metres reading is refuted 4×** |
| ⛔ the **offset** (Np vs graphed count) | "undocumented" | ⛔ **still undocumented, and the data contradicts the simplest reading** |
| **the ask** | a dataset acquisition project | ⭐ **one written answer about a field the city already publishes** |

⇒ **València is one written answer away from a potential ~52,6 % of its buildable land — not years
away.** ⚠ *Potential*, not promised: see §4, the anomaly that answer must also explain.

## 1 — R5, attempted. Every response code recorded

⚠ **A 200 carrying an HTML notice is not documentation, and a 404 from a parked domain is not an
absence of the dataset.** Each attempt is recorded with its status AND its response SHAPE.

| # | Attempt | HTTP | Shape | Outcome |
|---|---|---:|---|---|
| 1 | `…/MapServer/212/metadata` | **200** | XML, 4 860 B, ArcGIS/ISO | ⭐ **real metadata** — gave the contact + the portal linkage. **No units.** |
| 2 | `…/MapServer/212/info/metadata` | 200 | HTML, 5 742 B | field list only, no definitions |
| 3 | `…/Tools/FichaUrbanismo/MapServer/7/info/metadata` | 200 | HTML, 6 136 B | same |
| 4 | `…/MapServer/info/iteminfo?f=json` | 200 | JSON | service-level blurb only |
| 5 | `…/MapServer/legend?f=json` (both services) | 200 | JSON, 102 KB / 9,6 KB | renderer is `simple` on 212 — **no classified legend, so no units** |
| 6 | `valencia.opendatasoft.com/api/explore/v2.1/…` ×4 | **404** | HTML, 188 436 B — *"This domain could not be found - Huwise"* | ⚠⚠ **the open-data portal named in the city's OWN ISO metadata is DEAD/parked** |
| 7 | `dadesobertes.valencia.es` · `datosabiertos.valencia.es` · `opendata.valencia.es` | **—** | DNS failure (no HTTP) | not the replacement host |
| 8 | `geoportal.valencia.es/geoserver/csw?…GetCapabilities` | **—** | network error | no CSW |
| 9 | `datos.gob.es/apidata/catalog/dataset/publisher/L01462508` | **200** | JSON | ⭐ **296 datasets enumerated — the publisher's own catalogue** |
| 10 | `geoportal.valencia.es/apps/OpenData/…/PGOU_AL.{dwg,gml,shz,json}` | **404** ×4 | HTML | ⚠ the **CAD/GML distributions advertised by the national catalogue do not exist** |

⚠ **#6 is the finding that made #9 necessary.** The city's own metadata points at a portal that has
been let go and re-registered by a domain-parking service, which answers **404 with a 188 KB HTML
page**. A probe that only checked "did I get bytes?" would have recorded a live portal.

## 2 — ⭐ The publisher's own data dictionary, found in the national catalogue

`datos.gob.es`, publisher `L01462508` (Ajuntament de València), dataset **PGOU - Alineaciones**:

> «Alineacions del Pla General d'Ordenació Urbana · **Altura: Altura del PGOU** · Protec: Nivel de
> protección.»

**This is documentation, and it is not enough.** *"Altura del PGOU"* is tautological — it attributes
the field to the plan but states **no unit** and **no convention**.

⚠ **It is decisive on exactly one point, and the proof is a sibling dataset.** *Textos de los portales
de las calles* documents its own `Altura` as:

> «**Altura: Altura de representació en plans**» — a **cartographic text height**.

So this municipality's vocabulary *does* use `altura` for a pure rendering artefact — **and documents
that case differently.** `PGOU_AL.altura` is attributed to *the PGOU*. That kills the "it might just be
a map-drawing attribute" reading, which mattered because layer 2 is literally named
*PGOU Alineaciones (**TEXTOS**)*.

## 3 — The two empirical tests

Documentation was insufficient, so the field was tested against the world.

### TEST A — storeys or metres? (`altura` vs OSM `building:levels`, same building)

**Method.** Overpass returned 3 226 buildings carrying an integer `building:levels` in the Ensanche
core (39.455–39.485 N, −0.385…−0.355 E); 140 were drawn with seed `20260802`; each centroid was
resolved by one ArcGIS `identify` against layers 7 + 14 **at the same coordinate**. **n = 105 paired**
(3 with no alineación polygon, 32 with a non-bare `altura`, **0 transport failures**).

| statistic | measured | STOREYS predicts | METRES predicts |
|---|---:|---:|---:|
| median `altura / levels` | **0,778** | ≈1,0 | ≈3,0 |
| mean | 0,907 | | |
| p90 | 1,00 | | |

⭐ **The METRES hypothesis is refuted by roughly a factor of four.** `altura` is a storey-scale count.

⚠ **Stated confound, and it runs the safe way:** the PGOU sets a MAXIMUM while OSM records what was
BUILT, so the ratio should be biased **upward**, i.e. *away* from the storeys reading. It came in
below 1 anyway — which is itself the finding of §4.

### TEST B — is the polygon the *área de movimiento*? (so the depth is drawn, not tabulated)

Art. 6.18.1: «La ocupación de la parcela edificable se ajustará a las **alineaciones definidas en el
Plano C**.» Layer 212 *is* those alineaciones. **Method:** 900 seeded random points over the canonical
bbox; retained on `clase='SU'` ∧ `califi ∈ {ENS, EDA}`; geometry fetched in **EPSG:25830 (metres)**.
**n = 86**, of which **54 carry a bare storey count**.

| measure | bare-storey ENS/EDA (n=54) | *área de movimiento* predicts | *block outline* predicts |
|---|---:|---|---|
| mean width 2A/P, median | **15,6 m** (p10 10,2 · p90 27,1) | ≲20 m (Art. 6.18.2 cap) | ≫20 m |
| larger than its calificación polygon | **0 of 54** | never | often |
| median area ratio A/C | **0,75** | <1 | ≈1 or >1 |
| carrying interior holes (*patio de manzana*) | 10 of 54 | expected | not expected |

⭐ **The alignment polygon behaves like a buildable footprint.** ⚠ 31 % exceed 20 m, which does *not*
refute it — Art. 6.18.2's 20 m applies only *«Caso de no indicarse ésta»*, so a graphed 27 m is lawful.
⚠ n = 54. This is **evidence, not proof**, and no attribute anywhere publishes a *profundidad* number —
both statements are true and must not be collapsed.

## 4 — ⛔ What held: the offset convention, and the measurement made it WORSE

Art. 6.19.1: `Hc = 4,80 + 2,90·Np`, with Np = *«el señalado en los planos menos uno»*. Whether `altura`
stores the graphed count or Np already is undocumented. Test A was expected to settle it.
**It refuted the simplest reading instead.**

| `altura − building:levels` | ≤ −3 | **−2** | −1 | 0 | +1 | ≥ +2 |
|---|---:|---:|---:|---:|---:|---:|
| buildings (n = 105) | 20 | **34** | 21 | 10 | 4 | 6 |

- **`altura` is BELOW the built storey count on 85 of 105 buildings — 81 % — modally by TWO.**
- Only **33 %** of pairs agree within ±1. The spread runs **−13 … +7**.
- A plan MAXIMUM should sit at or above what was built almost everywhere. This does not.

### ⚠⚠ Why never-overstates cannot rescue it

The tempting move is to take the lower branch and call it conservative. **It is not conservative, it
is wrong.** On a typical Ensanche block — `altura` 5 against a 7-storey building —
`Hc = 4,80 + 2,90·4 = 16,4 m` for a building already standing at roughly 21 m.

> **PRYZM would publish a buildable envelope LOWER THAN THE BUILDING ALREADY ON THE PLOT.**

For a feasibility tool that is not caution; it is a false answer that would tell an owner they may
build less than what exists. And in the **10 of 105** where `altura` exceeds the built count, the same
parser **over-states**. **A rule that is wrong in both directions has no safe branch to choose**, so
C58 §1.14.4's never-overstates invariant offers no shelter and C58 §1.4 forbids presenting any one
reading as the fact.

Three readings survive the data and PRYZM cannot distinguish them:
1. `altura` is Np, and OSM `building:levels` counts planta baja **plus** ático (→ a −2 gap);
2. `altura` is a different quantity — a height BAND, or a pre-1991 inherited code;
3. the point-in-polygon pairing is noisier than it looks (a centroid landing in a neighbour's band).

**Each implies a different envelope.** That is the definition of unpublishable.

## 5 — What single artefact unblocks València

⭐ **One written answer from the Ajuntament — not a dataset.** Contact `datosabiertos@valencia.es`
(the address in layer 212's own ISO metadata, retrieved HTTP 200) and/or the Servicio de Planeamiento.
The exact ask is pinned in code as `VALENCIA_R5_ASK` so it cannot drift:

1. Does `PGOU_AL.altura` record Art. 6.19.1's *número de plantas grafiado en el Plano C* — and does it
   store **the graphed count**, or **Np** (the graphed count minus one)?
2. What are the units of the non-integer values (`13m`, `0.8m2t/m2s`, `10235m2t`, `<=5`)?
3. Does the polygon delimit the *área de movimiento* — the ocupación bounded by the alineación
   exterior and the profundidad edificable of Art. 6.18 — or something else?
4. ⚠ **Reconcile the anomaly:** `altura` is lower than the built storey count on 81 % of sampled
   Ensanche buildings, modally by two.

⚠ **Question 4 is why this is not a formality.** An answer to 1–3 that leaves the −2 gap unexplained
does **not** unblock publication: it would mean shipping a systematic error we had already measured
and chosen to ignore. **Necessary; not proven sufficient.**

### If the answer comes back clean

The ceiling is **≤ 52,6 % of private buildable land** [95 % CI 44,8–60,2], ENS alone at 77,0 %
(measured, [`../findings/VALENCIA-ALTURA-BUILDABLE-JOIN-2026-08-01.md`](../findings/VALENCIA-ALTURA-BUILDABLE-JOIN-2026-08-01.md)).
⚠ Before any of it ships, `CLOSURE-REGISTER` **#8** becomes blocking: the 17 token-gated folders
include `Patrimonio_Historico`, and heritage constrains envelopes **downward** — an envelope published
without it would OVER-state (L-616: a SOLID must intersect ALL derived constraints).

## 6 — Established / not established

**ESTABLISHED**
- ⭐ `altura` is **storey-scale, not metres** — refuted 4× (n = 105, 0 transport failures).
- ⭐ The publisher documents it as *«Altura del PGOU»*, and documents a cartographic `altura`
  **differently** on a sibling dataset.
- ⭐ The alineación polygon behaves as an **área de movimiento**: median 15,6 m, never larger than its
  zone polygon (0/54), patio holes present ⇒ **the depth is drawn**.
- ⭐ Art. 6.19.3 is a **mitigated** caveat, not a blocker.
- ⚠ The city's own metadata points at a **dead portal**; the advertised **DWG/GML distributions 404**.

**NOT ESTABLISHED**
- ❌ The offset convention. **Blocking, and contradicted by measurement.**
- ❌ Any envelope number for any València parcel. **Still 0 % computable.**
- ❌ That the municipal answer will be sufficient — necessary, not proven sufficient (§5).

---
*Authority: C58 §1.2/§1.4/§1.7a/§1.14.4 · C11 · C63 §1.1/§1.5 · ADR-0270 · L-616 · L-656 ·
§CONTEXT-DATA-HONESTY · §probe-can-be-wrong-three-ways. Probed live 2026-08-02 against
`geoportal.valencia.es`, `datos.gob.es` and OpenStreetMap. Pinned by
`packages/site-parcel-data/__tests__/valenciaRouting.test.ts` (65 tests).*
