# VALÈNCIA — LAND-SHARE MEASUREMENT (the L-656 denominator, measured)

> **Date 2026-08-01.** Evidence for [`../CLOSURE-REGISTER.md`](../CLOSURE-REGISTER.md) §3 and §4.
> This file records **what was measured against the live service**, the method, and the caveats that
> bound the result. It scores no RATE points; it supplies the DENOMINATOR the RATE needs.
>
> It discharges the gap
> [`../sources/PRIMARY-SOURCE-VERIFICATION-2026-08-01.md`](../sources/PRIMARY-SOURCE-VERIFICATION-2026-08-01.md)
> §7 named as **NOT ESTABLISHED**: *"what fraction of València's buildable LAND the PGOU orders
> directly vs delegates … until the València cross-tab is run, any coverage claim is unfounded."*
> ⚠ It also **CORRECTS** that file's §6 headline — see §4.

---

## 1 — Method, stated before the numbers

**Service:** `https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer`
· ArcGIS Server 10.81 · no auth on the planning folders · CRS **EPSG:25830** (ETRS89 / UTM 30N).

1. **The unfiltered count was asserted FIRST.**
   `…/231/query?where=1=1&returnCountOnly=true` → **HTTP 200**, `{"count":21210}`.
   Control: `…?where=califi='ZZZNOPE'&returnCountOnly=true` → **HTTP 200**, `{"count":0}`.
   ⚠ **The two responses are identical in shape.** Without the first, the second is
   indistinguishable from an outage or a rejected clause. This is the trap the brief names, and it
   is guarded here rather than assumed away.
2. **Server-side area was attempted and REFUSED.**
   `outStatistics=[{"statisticType":"sum","onStatisticField":"Shape.STArea()"}]` → **HTTP 400**,
   `{"error":{"code":400,"extendedCode":-2147467259,…}}`. The layer publishes **no area field**
   (17 fields, checked against `?f=json`, not against one response).
   ⇒ Areas had to be computed **client-side**, which is why geometry was downloaded.
3. **Geometry download:** `where=1=1`, `returnGeometry=true`, `outSR=25830`, `geometryPrecision=2`,
   `resultRecordCount=2000`, 11 pages (2000×10 + 1210) — **21 210 features, matching the count in
   step 1 exactly.** A short page would have meant silent truncation; it did not occur.
4. **Area per feature:** signed shoelace over the ArcGIS `rings`, summed then absolute. ArcGIS winds
   outer rings clockwise and holes counter-clockwise, so the signs cancel and holes are subtracted
   without a separate ring-classification pass.
5. **Same procedure for layer 212** (*PGOU - Alineaciones*): unfiltered count `{"count":21975}`
   asserted first, then 21 975 features downloaded with geometry.

**Reproduce:** the scripts are throwaway probes and are deliberately **not committed** — the
parameters above are the artefact, and re-deriving them is the check. Any re-run that does not first
reproduce `{"count":21210}` and `{"count":21975}` should be discarded.

## 2 — The denominator ladder (L-656)

⚠ **L-656 is ratified: score against BUILDABLE land, not all land, not clicks.** The answer moves by
a factor of ~1,8 across these three denominators, which is exactly why the ladder is written out
rather than a single number being quoted.

| denominator | area | delegated share |
|---|---:|---:|
| all 21 210 polygons | 14 419,8 ha (144,20 km²) | 20,58 % |
| `clase = SU` (suelo urbano) | 4 010,7 ha | 40,20 % |
| **`clase = SU` ∧ `califi` ∈ Art. 6.3.1's six zones** | **1 874,9 ha** | **36,40 %** |

**Why the third line is the right one.** Art. 6.3.1 of the *Normas Urbanísticas* enumerates the zones
of *calificación urbanística* **in suelo urbano** and there are exactly six: `CHP` · `ENS` · `EDA` ·
`UFA` · `TER` · `IND`. Everything else inside `SU` is *sistemas* (`RV` red viaria 18,03 % of SU,
`GRV` 10,28 %, `GTR`, `GEL`, `GSP`, `P*` parks) or another regime — **land on which the PGOU grants no
private envelope at all**. Including it would inflate the denominator with land that could never
carry an answer, which is the L-656 error in the opposite direction.

⇒ **Private buildable land = 1 874,9 ha = 46,75 % of suelo urbano.**

### Land classes, for completeness

| `clase` | polygons | area | share of layer |
|---|---:|---:|---:|
| `SNU` no urbanizable (huerta, Albufera) | 1 268 | 9 247,2 ha | 64,13 % |
| `SU` urbano | 17 693 | 4 010,7 ha | 27,81 % |
| `SUP` urbanizable programado | 1 335 | 522,5 ha | 3,62 % |
| `SUNP` urbanizable no programado | 876 | 308,3 ha | 2,14 % |
| (blank) | 11 | 286,5 ha | 1,99 % |
| `SNUC`/`SNUP`/`SUZ`/`C`/`ED1962`/`SPU`/`SUp` | 26 | 44,5 ha | 0,30 % |

⚠ **`ED1962` and `SUp` are DATA-QUALITY ARTEFACTS in a *land-class* field** — a plan reference and a
case-variant. They are 0,00 % of area and change nothing, but they are recorded because a parser that
switch-cased on `clase` and threw on the unexpected would break on València, and one that silently
defaulted would mis-classify.

## 3 — The delegation shape, by instrument

Over the **1 874,9 ha** L-656 denominator, grouped by the `origen` column's prefix:

| prefix | instrument | polygons | area | share |
|---|---|---:|---:|---:|
| **`PGOU*`** | **the General Plan itself** | 4 541 | 1 192,4 ha | **63,60 %** |
| `PE` | Plan Especial | 2 453 | 280,2 ha | 14,94 % |
| `RI` | Reforma Interior | 889 | 133,1 ha | 7,10 % |
| `MP` | Modificación Puntual | 676 | 119,7 ha | 6,38 % |
| `ED` | Estudio de Detalle | 335 | 61,6 ha | 3,28 % |
| `PRI` | Plan de Reforma Interior | 175 | 40,6 ha | 2,17 % |
| `PP` | Plan Parcial | 55 | 35,5 ha | 1,89 % |
| `CU` · `CRI` · `PEPRI` · `CE` · `UE` · blank · `PGOI` | consultas, correcciones, unidades | 72 | 11,9 ha | 0,63 % |

**⇒ DELEGATED = 36,40 %. PGOU-ORDERED = 63,60 %.**

### Three ways this number could be misread, each addressed

1. ⚠⚠ **An instrument COUNT is not a land SHARE, and here they disagree 5×.** There are **496
   distinct `origen` values**, of which ~14 are `PGOU*`. "482 of 496 are not the PGOU" reads as
   *97 % delegated*. **Fourteen `PGOU*` rows cover more ground than 482 derived plans combined**
   (the largest single derived instrument, `MP1896`, is 1,73 % of the layer). The earlier dossier
   correctly stated the count and left the share `unmeasured`; this is the measurement.
2. ⚠ **`MP` is counted as DELEGATED, which is conservative rather than obvious.** An `MP` *amends*
   the PGOU rather than replacing it, so some `MP` land is arguably still PGOU-ordered — but PRYZM
   does not hold the amending documents and cannot tell which. ⇒ **30,02 % is the FLOOR of the
   delegated range and 36,40 % the CEILING.** The code uses the ceiling, i.e. under-claims its reach.
3. ⚠ **Shares are LAYER-relative, not term-relative.** 21 210 polygons sum to **144,20 km²** against
   an official term of ≈**134,65 km²** — ~7 % more — so some polygons overlap (`PA` 16,15 %, `PM`
   15,25 % and `GIS` 18,81 % are large ámbito-shaped rows that plainly sit over other zoning). **No
   claim is made about the municipal term's area**, and none is needed: every figure here is a ratio
   within one consistently-measured layer.

### The prior was wrong, and it was wrong in the safe direction

| city | delegated share of buildable land |
|---|---:|
| Murcia (INE 30030) | 67 % |
| Barcelona (INE 08019) | 62,8 % |
| **València (INE 46250)** | **36,40 %** |

The brief predicted *"expect the same shape and MEASURE it rather than assuming"*. **Measured,
València delegates roughly half as much.** Quoting Murcia's 67 % would have been the "proxy PGOU"
error inverted — under-claiming rather than over-claiming, but still a number about a different city.

## 4 — ⚠ CORRECTION to `PRIMARY-SOURCE-VERIFICATION` §6: the `altura` lead is 2,4× smaller

That file measured layer 212's `altura` field across all 21 975 rows and reported **65,5 % bare
storey count**, correctly flagging (its own caveat 3) that *"65,5 % is a POLYGON count, not land
area … no area figure is claimed here."* **The area figure is now claimed, and it changes the
picture.**

Measured by AREA (21 975 polygons, 4 213,7 ha total):

| `altura` value class | polygons | area | share |
|---|---:|---:|---:|
| **bare integer in 1…30** — the only plausible storey counts | 10 184 | 1 143,0 ha | **27,13 %** |
| ⚠ **bare integer `0`** | **4 195** | **1 438,3 ha** | **34,13 %** |
| true junk (`-+-`, `_`, `+-`, `0*`) | 1 189 | 774,4 ha | 18,38 % |
| `<=n` / `Max n` bounded | 519 | 279,4 ha | 6,63 % |
| protection-derived (`PROTEGIDO*`, `BIC`, `BRL`, `PROT_*`) | 4 437 | 255,6 ha | 6,07 % |
| absolute floorspace (`10235m2t`) | 90 | 92,8 ha | 2,20 % |
| unrecognised (`S=39600.65m2s`, `EC`, `M15b`, `ET=1999210`) | 438 | 90,2 ha | 2,14 % |
| delegated / deferred (`PPARCIAL`, `DIFERIDO A5`, `ORD_DET`, `NORMATIVA`) | 532 | 62,8 ha | 1,49 % |
| blank | 40 | 52,1 ha | 1,24 % |
| bare integer > 30 (`2000`, `538650`, `2650406`) | 20 | 11,7 ha | 0,28 % |
| `B+n` / storeys+qualifier / fuera de ordenación | 310 | 5,4 ha | 0,12 % |

### ⚠⚠ The `0` bucket is the finding, and it is §CONTEXT-DATA-HONESTY in its purest form

**4 195 polygons — 34,13 % of the layer's area, MORE than the entire plausible bucket — carry the
literal value `0`.** A parcel cannot be lawfully built to zero storeys. `0` here is a **sentinel** for
"not applicable / not set", i.e. **UNKNOWN**. C58 §1.7a and L-616 are explicit: **`null` means
unknown and `0` never does.**

A parser matching `^\d+$` would take all 14 399 bare integers as storey counts and publish either a
**zero-height envelope on a third of València**, or — the worse branch — coerce the sentinel to a
default and publish a fabricated one. **This is the exact failure L-616 names, caught before a line
of parser was written.**

### And the units problem is worse than "four units"

`13` (storeys), `13m` (metres), `0.8m2t/m2s` (FAR) and `10235m2t` (absolute m²t) share one
`esriFieldTypeString`. Reading `13m` as 13 storeys yields `4,80 + 2,90·12 = 39,6 m` for a **13 m**
building — a **3× overstatement**. ⚠ **And it is not only the suffixed values:** bare `65936.20`,
`49846.90`, `32389.90` sit in the same field alongside `S=39600.65m2s` — **site areas wearing exactly
the clothes of a storey count.** A wrong unit is a wrong KIND (ADR-0270), not a wrong number.

⇒ **The honest size of the lead is 27,13 % of layer 212's AREA — and even that is a share of the
WRONG denominator**, because layer 212 (4 213,7 ha, alignments) has **not** been spatially joined to
the 1 874,9 ha private-buildable extent. **No coverage claim may be built on it.** Pinned in code as
`VALENCIA_ALTURA_FIELD_MEASURE` with `joinedToBuildableDenominator: false`.

## 5 — Field-level catalogue sweep: the strong negative on Plano C

⚠ **A name-level sweep is what missed `altura` the first time.** This one reads the **field schema of
every one of the 70 layers** in `OPENDATA/UrbanismoEInfraestructuras` and matches field NAMES against
`altur · plant · profund · edificab · ocupac · retranq · fondo · aprovech · far · volum · galib ·
nivel · cornis`.

**Three layers match, and only one is an envelope parameter:**

| layer | field | verdict |
|---|---|---|
| **212** *PGOU - Alineaciones* | `altura` | ⚠ the known lead — §4 |
| 321 *Catálogo Rural Líneas* | `nivel_prot` | heritage **protection level**, not an envelope parameter |
| 223 *Eixos de carrer* | `nivelaltura` | a street-axis **polyline**; `null` on every sampled row — ruled out |

**No layer in the authoritative planning service publishes `profundidad`, `edificabilidad`,
`ocupación` or `retranqueo` as an attribute, under any name.**

⇒ **Plano C is not in the public REST catalogue. That is now MEASURED at field level rather than
assumed from layer names**, and it is a permanent closure of the automated route to blocker #1: the
sheets must come from a human and an institution.

⚠ **Bounded by what was readable.** 17 folders — including `Patrimonio_Historico` and `Vivienda` —
return **ArcGIS 499 "Token Required"**. They are **UNKNOWN, not absent** (L-422/457/467/469). This
sweep covers the 70 layers of the one authoritative planning service, which is the strongest
statement the public catalogue supports.

## 6 — What this file establishes, and what it does not

**ESTABLISHED**
- The L-656 private-buildable denominator: **1 874,9 ha**, derived from the plan's own Art. 6.3.1.
- **Delegation = 36,40 %** (floor 30,02 % excluding `MP`); **PGOU-ordered = 63,60 %**.
- **Six zone codes are 100 % of buildable land**, so the 110-code vocabulary is a *routing*
  denominator, not a numeric one.
- ⚠ **CHP is 92 % delegated** — 10,06 % of buildable land, only 0,81 pp PGOU-ordered.
- The `altura` lead is **27,13 % of layer 212's area**, not 65,5 %, and its largest bucket is a
  **`0` sentinel**.
- **No envelope-parameter field exists** anywhere in the 70 public planning layers except `altura`.

**NOT ESTABLISHED — do not let a later reader assume otherwise**
- ❌ The spatial join between layer 212 and the buildable denominator. **Every `altura` percentage
  here is layer-relative and cannot be read as coverage.**
- ❌ That `altura` encodes Art. 6.19.1's *número de plantas*. Still an **inference**.
- ❌ Anything about the 17 token-gated folders.
- ❌ Any claim about the municipal TERM's area. The layer over-sums it by ~7 % through overlap.
- ❌ Any envelope number for any València parcel. **The measured answer is still 0 % computable**
  until Plano C exists as data.

*Authority: C58 §1.2/§1.7a · C63 · ADR-0270 · L-616 · L-656 · §CONTEXT-DATA-HONESTY.
Probed live 2026-08-01 against `geoportal.valencia.es`.*
