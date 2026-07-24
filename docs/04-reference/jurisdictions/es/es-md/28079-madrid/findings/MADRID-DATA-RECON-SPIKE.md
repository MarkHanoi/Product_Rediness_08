# MADRID DATA-RECON SPIKE — the reachable ArcGIS endpoints, the NZ-code, the parcel join

> **What this is.** A live technical reconnaissance (2026-07-24) of Madrid's PGOUM-97 planning-data
> ecosystem, run to UN-GATE the Madrid rule pack (`esMadridNZ1.ts`). Every row below is an assertion
> on **Content-Type + body shape** from a real `curl`/urllib call this pass — not an HTTP-200, not
> portal prose (the L-438 discipline). Where a thing is down / absent / auth-gated, it says so with
> evidence. Author: recon agent. Host confirmed serving `application/json`: `sigma.madrid.es`.
>
> **Headline:** Madrid is a **NATIVE-GIS jurisdiction** for zoning ROUTING and for the NZ-1 envelope.
> All three original blockers are RESOLVED from public, keyless endpoints. The three-way finding:
> (1) endpoint = `sigma.madrid.es/hosted/rest/services/…` (not `/arcgis/…`); (2) the NZ-code is a
> `<zona>.<grado>` string served by a *newly-found* master calificación layer, NZ-1 = `1.1…1.6`;
> (3) `CODMANZANA` has **no string relationship to the Catastro refcat** — the join is **spatial**.

---

## 0 — TL;DR for the implementer

- **Two endpoints do everything for NZ 1:**
  1. **Zone routing (which NZ is this parcel?)** →
     `…/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0` — spatial point-intersect, read
     `AMB_TX_ETIQ`. NZ-1 ⇔ `AMB_TX_ETIQ` starts `"1."`.
  2. **NZ-1 envelope geometry** →
     `…/PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer/6` — spatial point-intersect, read the ring
     (`geometry.rings`, single closed ring, `outSR=4326`) + `COEF_Z` + `CODMANZANA` + `NUMORD`.
- **The join to the clicked Catastro parcel is SPATIAL** (parcel centroid → intersect). `CODMANZANA`
  is a **planning-block key** (≤44 parcels share one), NOT a refcat substring — proven false against
  three real refcats.
- **What is machine-readable in GIS:** parcel→NZ+grado routing (ALL zones), derived-plan detection
  (APR/APE/API), and the entire NZ-1 buildable footprint. **What still needs the Compendio PDF:** the
  *parametric numbers* for NZ 4/8/5/7 (fondo edificable, retranqueos, altura), and the *semantic
  meaning* of the NZ-1 `COEF_Z` code. There are **no coded-value domains and no
  ALTURA/FONDO/RETRANQUEO attributes** anywhere in these services — verified by full field inventory.

---

## 1 — Blocker 1: the reachable ArcGIS REST endpoint (RESOLVED)

The brief's probe hit `https://sigma.madrid.es/arcgis/rest/services?f=json` → HTTP 200 but
`text/html` (the viewer). **The real REST root is a different path:**

```
https://sigma.madrid.es/hosted/rest/services            ← services directory (ArcGIS 11.3)
https://sigma.madrid.es/hosted/rest/services/PGOUM97     ← the PGOUM-97 folder (12 MapServers)
```

**Evidence (this pass):** `GET …/hosted/rest/services?f=json` → `HTTP 200 | Content-Type:
application/json; charset=UTF-8`, body `{"currentVersion":11.3,"folders":[…"PGOUM97"…],…}`. The
`?f=pjson` variant is identical. There is **no `/arcgis/` instance** — the ArcGIS Server instance
name here is `hosted` (plus a second read-only instance `sigmaayto.madrid.es/gestion/rest` seen in
Portal, not needed).

### 1.1 — The four services that matter (all VERIFIED-LIVE JSON this pass)

| Service | REST URL (append `/MapServer`) | Role |
|---|---|---|
| **PG_CONDICIONES_EDIFICACION** | `…/PGOUM97/PG_CONDICIONES_EDIFICACION` | **NZ-1 envelope**: fondo + `COEF_Z` + ficha |
| **PG_ORDENACION** | `…/PGOUM97/PG_ORDENACION` | ordenación: **ámbitos** (derived-plan detector), alineaciones |
| **NORMAS_ZONALES** ⭐ | `…/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES` | **master parcel→NZ+grado calificación** (all zones) |
| **PG_USOS_Y_ACTIVIDADES** | `…/PGOUM97/PG_USOS_Y_ACTIVIDADES` | use matrix (`Nivel de Uso`, keyed CODMANZANA/NUMORD) |
| PG_GESTION | `…/PGOUM97/PG_GESTION` | management ámbitos APE/APR + alineaciones de gestión |
| PG_EDIFICIOS_PROTEGIDOS | `…/PGOUM97/PG_EDIFICIOS_PROTEGIDOS` | protected-buildings catalogue (carries NORMATIVA + COEF_Z) |

⭐ **NORMAS_ZONALES was NOT in the PGOUM97 folder** — it lives in `DESARROLLO_URBANO_ACTUALIZADO`
and was found via the **ArcGIS Portal search** (`sigma.madrid.es/portal/sharing/rest/search?q=…&f=json`,
which returns JSON and is keyless). Portal `q="PGOUM Norma Zonal"` surfaced it as both a Map Service
and a WMS. This supersedes the previously-"down" `PG_ORDENACION` for zone routing (see §5).

### 1.2 — `PG_ORDENACION` is UP again (was HTTP 500 across two prior passes)

`GET …/PGOUM97/PG_ORDENACION/MapServer?f=json` → `HTTP 200 | application/json`, 17 layers. The
`"Service not started"` error recorded 2026-07-23 was **transient**, not a permanent absence — it
answered live this pass. (But NORMAS_ZONALES is the cleaner routing source; PG_ORDENACION is used
here only for its **ámbitos** layer, §4.)

---

## 2 — Blocker 2: the Norma-Zonal code string (RESOLVED — full vocabulary captured)

**The code is a `<zona>.<grado>[.<nivel>]` string, and Norma Zonal 1 is `"1.1" … "1.6"`.** Source =
the master layer `NORMAS_ZONALES/MapServer/0` (polygon; fields `AMB_TX_ETIQ` = code,
`AMB_TX_DENOM` = human denomination). `GET …/0/query?where=1=1&returnCountOnly=true` → `{"count":34}`;
the 34 distinct `AMB_TX_ETIQ` values, verbatim from the response:

| Zona | `AMB_TX_ETIQ` values (verbatim) | `AMB_TX_DENOM` example |
|---|---|---|
| **NZ 1** | **`1.1 1.2 1.3 1.4 1.5 1.6`** | "ZONA 1 GRADO 1º" … "GRADO 6º" |
| NZ 3 | `3.1 3.1.a 3.1.b 3.1.c 3.2` | "ZONA 3 GRADO 1º - NIVEL a" |
| NZ 4 | `4` | "NZ 4" (no grados) |
| NZ 5 | `5.1 5.2 5.3` | "ZONA 5 GRADO 3º" |
| NZ 7 | `7.1.a 7.1.b 7.2.e` | "ZONA 7 GRADO 2º - NIVEL ESPECIAL" |
| NZ 8 | `8.1.a 8.1.c 8.2.a 8.2.b 8.2.c 8.3.a 8.3.c 8.4 8.5 8.6` | "ZONA 8 GRADO 2º - NIVEL a" |
| NZ 9 | `9.1 9.2 9.3 9.4.a 9.4.b 9.5` | "ZONA 9 GRADO 4º - NIVEL b" |

(NZ 2, 6, 10, 11 are absent from this síntesis — either dissolved into others or not carried.)

**It is a working, per-parcel spatial calificación**, not just a legend. Real spatial point-queries
(`geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects`) this pass:

| Point (lon,lat) | Location | `AMB_TX_ETIQ` returned |
|---|---|---|
| `-3.707959, 40.423667` | historic core | `1.2` (ZONA 1 GRADO 2º) |
| `-3.6807, 40.4256` | Barrio de Salamanca | `1.3` (ZONA 1 GRADO 3º) |
| `-3.6737, 40.4577` | Chamartín | `3.1.a` |
| `-3.7462, 40.4760` | Mirasierra | `8.2.a` |

⇒ **For registration, `MADRID_NZ1_ZONE_CODES` should be `['1.1','1.2','1.3','1.4','1.5','1.6']`**,
matched against `AMB_TX_ETIQ`, NOT the placeholder `['NZ1']`. The routing predicate is
`AMB_TX_ETIQ.startsWith('1.')`.

### 2.1 — ⚠ CORRECTION: `COND_EDIF` is NOT the zonal grado (a probe that was wrong)

`PG_CONDICIONES_EDIFICACION/6` carries `COND_EDIF` (SmallInteger, alias *"Grado Condición
Edificación"*), and its whole-layer distribution (1→3095, 2→3064, 3→6850, 4→1736, 5→1162) matches
`PG_EDIFICIOS_PROTEGIDOS.NORMATIVA` `1.1…1.5` (3098/3062/6844/1735/1143) almost exactly, and a
per-key cross-check confirmed `NORMATIVA="1.3"` ⇔ `COND_EDIF=3` on shared `(CODMANZANA,NUMORD)`
keys. **That tempts you to read the zonal grado off `COND_EDIF`. It is WRONG.** An independent test
against the authoritative `NORMAS_ZONALES` proved it: **25/25 verified-interior NZ-1 parcels with
`COND_EDIF=5` sit in zonal grado `1.1` or `1.2`, never `1.5`.** `COND_EDIF` / `NORMATIVA` is a
*condition/catalogue* grado, a **different axis** from the Norma-Zonal grado. **Take the zonal
grado only from `NORMAS_ZONALES.AMB_TX_ETIQ`.** (This is the §probe-can-be-wrong-three-ways lesson:
the independent source overturned an internally-consistent correlation.)

---

## 3 — Blocker 3: `CODMANZANA` ↔ Catastro refcat (RESOLVED — no string join; it is SPATIAL)

**`CODMANZANA` is a municipal planning-block primary key with NO derivable relationship to the
Catastro parcel reference.** Two independent proofs:

**(a) It is a block key, not a parcel key.** `PG_CONDICIONES_EDIFICACION/6` groupBy `CODMANZANA`
shows up to **44 parcels (`NUMORD`) per `CODMANZANA`** (0102038→44, 0102088→39, 0102077→39…). The
per-parcel key is the pair **`(CODMANZANA, NUMORD)`**, and that pair is **stable across services**
(same pair joins CONDICIONES ↔ EDIFICIOS_PROTEGIDOS ↔ USOS — verified: key `0704048/12418` returns
`COEF_Z='6'` in both CONDICIONES and EDIF_PROTEGIDOS).

**(b) It is not a refcat substring.** Queried the national Catastro RC-by-coordinate service
(`ovc.catastro.meh.es/…/Consulta_RCCOOR?SRS=EPSG:4326`) at three real layer-6 interior points:

| Parcel centroid | Madrid `CODMANZANA` | Catastro refcat (pc1+pc2) | refcat[:7] == CODMANZANA? |
|---|---|---|---|
| `-3.707959,40.423667` | `0105104` | `0052817VK4705A` | **no** (`0052817`≠`0105104`) |
| `-3.69784,40.42605` | `0104032` | `0954010VK4705D` | **no** |
| `-3.70342,40.42799` | `0105025` | `0557109VK4705E` | **no** |

The three parcels even share one Catastro cartographic sheet (`VK4705`) while carrying three
distinct Madrid manzana codes — so there is not even a manzana↔sheet correspondence. **The refcat is
NOT a key into the planning data at all.**

**⇒ The resolver must join by GEOMETRY.** Take the clicked parcel's centroid (or a guaranteed
interior point) in EPSG:4326 and spatial-intersect the planning layers. Proven end-to-end this pass:
the centroid of parcel `0105104/00311`, fed back as a point query to layer 6, returned exactly
`{"CODMANZANA":"0105104","NUMORD":"00311"}`. Round-trip closed.

---

## 4 — The reverse-engineered data model (ER)

```
                         Catastro parcel (national)
                         refcat + boundary geom (EPSG:4326/25830)
                         ── NO string key into planning data ──
                                     │  SPATIAL: centroid → intersect
                                     ▼
   ┌─────────────────────────── clicked point (lon,lat, 4326) ───────────────────────────┐
   │                                   │                                                  │
   ▼ intersect                         ▼ intersect                                        ▼ intersect
 NORMAS_ZONALES/0            PG_CONDICIONES_EDIFICACION/6                      PG_ORDENACION/3
 (all-zone calificación)     (NZ-1 plane only)                                (ámbitos)
 AMB_TX_ETIQ  ── "1.2" ──┐   ring (single, closed, 4326)  ┐                   TIPOAMB ∈ {NZ, API,
 AMB_TX_DENOM            │   COEF_Z  (coded: "4","0 / 5")  │                     APE, APR, UZP,…}
                         │   CODMANZANA + NUMORD (block key)│                   CODAMBORD ("APR.17.03")
                         │   COND_EDIF (condition grado ≠ zonal grado)          NOMBRE
                         ▼                                  ▼                          │
              ROUTE: which Norma Zonal?          ENVELOPE: the buildable ring   REFUSE if TIPOAMB
              "1.*" → NZ-1 pack                   = explicit-area ringRef        ∈ {API,APE,APR}
              "4"   → NZ-4 (alignment, PDF#s)     input to solver               (derived-plan)
              "8.*" → NZ-8 (setback, PDF#s)
```

- **`(CODMANZANA, NUMORD)`** is the shared planning-parcel key across `PG_CONDICIONES_EDIFICACION`,
  `PG_USOS_Y_ACTIVIDADES` (`Nivel de Uso`/`Otras Condiciones`) and `PG_EDIFICIOS_PROTEGIDOS`. But you
  obtain it by spatial intersect, not from the refcat.
- **Derived-plan detector** = `PG_ORDENACION/MapServer/3` (*Ámbitos de Ordenación (Rotulación)*),
  field `TIPOAMB`. Whole-layer distribution: `NZ`×730 (ordenación directa → compute), `API`×275,
  `APE`×270, `APR`×136 (→ `derived-plan` refusal), plus urbanizable/no-urbanizable classes
  (`UZP,NUP,UNP,NUC,AOE,UZI,SG`). `CODAMBORD` gives the specific ámbito (e.g. `APR.17.03 ESTACIONES
  DE VILLAVERDE`). This is the machine-readable equivalent of Barcelona's derived-planning trap
  detector.
- **No coded-value DOMAINS exist** on any layer (the field inventory returned zero `domain` objects).
  The `COEF_Z`/`NORMATIVA` codes are therefore NOT self-documented — their meaning needs the plan
  legend / Compendio.

---

## 5 — Reachability matrix (this pass, 2026-07-24)

| Endpoint | State | Evidence |
|---|---|---|
| `…/hosted/rest/services?f=json` | **REACHABLE / JSON** | `application/json`, `currentVersion 11.3`, folder list |
| `…/PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer` | **REACHABLE / JSON** | serviceDescription = NZ-1 plane; 15 907 features in layer 6 |
| `…/PG_CONDICIONES_EDIFICACION/MapServer/6/query` (attrs + geom, `outSR=4326`) | **REACHABLE / JSON** | count 15 907; single closed rings; spatial round-trip verified |
| `…/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0/query` | **REACHABLE / JSON** | 34 codes; spatial point-query returns NZ+grado |
| `…/PGOUM97/PG_ORDENACION/MapServer` | **REACHABLE / JSON** (was 500) | 17 layers; the prior `Service not started` was transient |
| `…/PG_ORDENACION/MapServer/3/query` (ámbitos) | **REACHABLE / JSON** | TIPOAMB/CODAMBORD distributions pulled |
| `…/PG_ORDENACION/MapServer/7/query` (“Norma Zonal 1.5”) | **REACHABLE meta, QUERY BROKEN** | metadata OK (`NORMATIVA` field), but every where-clause → `code -2147467259 "Invalid definition expression"`. Do NOT use it; NORMAS_ZONALES replaces it. |
| `…/PG_USOS_Y_ACTIVIDADES`, `…/PG_GESTION`, `…/PG_EDIFICIOS_PROTEGIDOS`, `…/PG_ANALISIS_EDIFICACION` | **REACHABLE / JSON** | full layer/field inventory captured |
| `…/PG_CONDICIONES_EDIFICACION/FeatureServer?f=json` | **REACHABLE (HTTP 200 JSON)** | a FeatureServer exists alongside the MapServer (enables queryRelatedRecords if ever needed; MapServer suffices) |
| `sigma.madrid.es/portal/sharing/rest/search?f=json` | **REACHABLE / JSON** | keyless Portal search; found NORMAS_ZONALES |
| `ovc.catastro.meh.es/…/Consulta_RCCOOR` | **REACHABLE / XML** | returns refcat at a coordinate; used for the join test |
| coded-value domains / ALTURA·FONDO·RETRANQUEO attributes | **ABSENT** | full field inventory across 6 services; none present |

No endpoint required authentication this pass; all are keyless public GET.

---

## 6 — EXACT parameters the resolver + proxy should use

### 6.1 — Same-origin proxy routes (server BFF)

Two thin GET pass-throughs (the client cannot hit `sigma.madrid.es` cross-origin under CSP):

```
GET /api/madrid/norma-zonal?lon=<lon>&lat=<lat>
    → sigma.madrid.es/hosted/rest/services/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0/query
      ?geometry=<lon>,<lat>&geometryType=esriGeometryPoint&inSR=4326
      &spatialRel=esriSpatialRelIntersects&outFields=AMB_TX_ETIQ,AMB_TX_DENOM
      &returnGeometry=false&f=json

GET /api/madrid/condiciones?lon=<lon>&lat=<lat>      (the NZ-1 envelope ring)
    → sigma.madrid.es/hosted/rest/services/PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer/6/query
      ?geometry=<lon>,<lat>&geometryType=esriGeometryPoint&inSR=4326
      &spatialRel=esriSpatialRelIntersects
      &outFields=CODMANZANA,NUMORD,COND_EDIF,COEF_Z&returnGeometry=true&outSR=4326&f=json

GET /api/madrid/ambito?lon=<lon>&lat=<lat>           (derived-plan refusal detector)
    → sigma.madrid.es/hosted/rest/services/PGOUM97/PG_ORDENACION/MapServer/3/query
      ?geometry=<lon>,<lat>&geometryType=esriGeometryPoint&inSR=4326
      &spatialRel=esriSpatialRelIntersects&outFields=TIPOAMB,CODAMBORD,NOMBRE
      &returnGeometry=false&f=json
```

Assert on the response: `Content-Type: application/json`, body has `features[]` (not `error`), and
for `/condiciones` that `features[0].geometry.rings` exists and `rings[0][0] == rings[0][-1]`.

### 6.2 — `resolveMadridNZ1Ring` contract (provider, L2)

1. Input: clicked point (or parcel interior point) in EPSG:4326.
2. `/norma-zonal` intersect → if `AMB_TX_ETIQ` does not start `"1."`, this is not NZ-1; hand off to
   the routing table (`"4"`→NZ-4, `"8.*"`→NZ-8, else refuse). The zonal grado = `AMB_TX_ETIQ`.
3. `/ambito` intersect → if `TIPOAMB ∈ {API,APE,APR}`, return a `derived-plan` refusal citing
   `CODAMBORD`+`NOMBRE` (per-site plan PRYZM does not hold) — do this BEFORE computing an envelope.
4. `/condiciones` intersect → the `rings[0]` polygon IS the buildable ring (single, closed, 4326;
   feed straight to `solveExplicitArea`, no polyline-closing). If 0 features but step 2 said `"1."`,
   the parcel may be a *ficha específica* override (layer 1) → refuse, do not guess.
5. `COEF_Z`: classify with the existing `parseCoefZ` — `"-"`/`"--"`/`null` → **absent (not 0)**; a
   bare integer → candidate value; any `"a / b"` form → **coded/REFUSE** (`parseFloat("0 / 5")===0`
   is the silent-zero trap). ⚠ **Do NOT use `COND_EDIF` as the grado** (§2.1).
6. Provenance: the ring is `published-structured` (live municipal geometry). The `COEF_Z` numeric
   *semantics* stay behind the L-449 gate until the legend is read (§7).

---

## 7 — Machine-readable in GIS vs still needs the Compendio PDF

This is the distinction that sets how far above the ~62% engine ceiling Madrid can reach.

| Thing | GIS-native? | Source |
|---|---|---|
| Parcel → Norma Zonal + grado (ALL zones) | ✅ **YES** | `NORMAS_ZONALES/0.AMB_TX_ETIQ`, spatial |
| Derived-plan (APR/APE/API) detection | ✅ **YES** | `PG_ORDENACION/3.TIPOAMB/CODAMBORD`, spatial |
| NZ-1 buildable footprint (the envelope) | ✅ **YES** | `PG_CONDICIONES_EDIFICACION/6` ring, spatial |
| NZ-1 `COEF_Z` value (as a coded token) | ✅ **YES** | `…/6.COEF_Z` |
| NZ-1 `COEF_Z` **meaning** (m²/m² FAR? nº plantas? bajo+N?) | ❌ **NO** | needs plan legend / Compendio Cap. 8.1 |
| NZ 4/8/5/7 **fondo edificable / retranqueos / altura** (the numbers) | ❌ **NO** | Compendio 2023 Cap. 8.x, per grado — **no ALTURA/FONDO/RETRANQUEO attribute exists in any service** |
| Use matrix (usos) per parcel | 🟡 partial | `PG_USOS_Y_ACTIVIDADES/7 NIVEL` (coded; meaning needs legend) |

**So the coordinator's "maybe the rules are already GIS attributes" hypothesis is TRUE for zoning
ROUTING and for the whole NZ-1 envelope, and FALSE for the NZ 4/8/5/7 parametric numbers.** The
PDF read is still required — but ONLY for the parametric scalars of four zones, and the parcel→NZ
assignment that used to depend on the "down" calificación endpoint is now fully GIS-native.

---

## 8 — What is resolved vs what still needs a human

**Resolved by this recon (no human needed):**
- The reachable REST root + the four service URLs (§1).
- The NZ code string + full vocabulary; NZ-1 = `1.1…1.6` (§2). → un-gates `MADRID_NZ1_ZONE_CODES`.
- The parcel join is spatial, not refcat-string (§3). → un-gates the resolver design.
- The exact resolver + proxy parameters (§6), all asserted live.
- The correction that `COND_EDIF` ≠ zonal grado (§2.1). → prevents a silent zone-code bug.
- Derived-plan detection is GIS-native (§4). → NZ-3 / ámbito refusals can cite `CODAMBORD`.

**Still needs a human (unchanged by this recon):**
- **L-449 sign-off** for any envelope pack (the human-verification gate; `sources/VERIFICATION.md`).
- **NZ-1 `COEF_Z` semantics** — one legend read (Compendio Cap. 8.1) to know what `"5"` / `"0 / 5"`
  mean before the value feeds a volume calc. Until then the ring ships as a footprint; the height/FAR
  from `COEF_Z` is withheld.
- **NZ 4/8/5/7 parametric numbers** — the Compendio 2023 Cap. 8.x read, per grado (the pre-existing
  document gate; genuinely not in GIS).

**Still needs engineering (not research):** the `explicit-area` solver branch (KG-4) + the
`ComputeBuildableEnvelopeInput.explicitAreaFootprint` interface-field fix — both pre-existing,
tracked in `NEXT.md` §2a/§3.

⇒ **NZ-1 can be UN-GATED** the moment (a) `MADRID_NZ1_ZONE_CODES` is repointed to `['1.1'…'1.6']`
matched on `AMB_TX_ETIQ`, (b) the three same-origin proxies (§6.1) land, (c) the KG-4 engine work
ships, (d) L-449 is signed. That yields a real explicit-area envelope for Madrid's historic core —
the NZ-1 share of the ~62% ceiling — with the zone-code now VERIFIED, not placeholder.

---

*Evidence artefacts (this pass): all queries above were run via `curl`/urllib against
`sigma.madrid.es` and `ovc.catastro.meh.es`; responses asserted on Content-Type + body shape.
Governance: C58 §1.11 (block granularity), ADR-0270 (explicit-area), L-438 (endpoint-from-response),
L-449 (human gate), §probe-can-be-wrong-three-ways. See also `SOURCE.md`, `sources/SOURCES.md`,
`findings/L-608-MADRID-PACK-SPEC.md`, `NEXT.md`.*
