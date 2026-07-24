# Córdoba data-recon spike — provenance, geometry, resolver, join

> **Stamp** 2026-07-24 · **Status** RESEARCH FINDINGS (live reconnaissance). **Governs nothing.**
> Evidence-tiered per §CONTEXT-DATA-HONESTY. Confidence tags on every claim:
> **VERIFIED-LIVE** = fetched this session, this is the response ·
> **NETWORK-BLOCKED** = host refused/timed out from this vantage (not proof of absence) ·
> **ABSENT** = proven negative (a service that does not exist).
>
> **Scope of this spike:** resolve **ACCESS / GEOMETRY / PROVENANCE** only. It does **NOT** resolve the
> **L-449 human verification** of the OCR'd numbers — those stay `pipeline-extracted-unverified`. The
> engineering is unblocked; the remaining blocker is the human number-verification gate (L-449).

---

## 0 — One-paragraph result

The COACo GeoServer (`geoserver.pgou.coacordoba.org`) is **not the authoritative source — it is a
downstream vectorization**. The authority is the **Gerencia Municipal de Urbanismo (GMU)**, which
publishes the PGOU-2001 **Calificación, Usos y Sistemas** plan series **municipality-wide** — but as
**77 georeferenceable raster JPG sheets** (49 urban `CUS01W…CUS49W` + 28 peripheral settlements), **not
vector**. COACo (IMDEEC-funded "first phase") **vectorized 8 of those 49 urban sheets** for **2 of ~10
districts** (Sur + Noroeste) into PostGIS and joined them to Catastro. That vector is served **live and
public** as WFS 2.0.0 / WMS 1.3.0 (EPSG:25830), HTTP 200. **The parcel→subzone join already exists
materialized** in `coaco:vcatastro_urbanismo` (5,725 parcels, each carrying `refcat` + `ordenanza`).
The **resolver and join are proven live this session** (both a refcat key-join and a spatial BBOX
returned the correct calificación). **Consequence for the ceiling:** the calificación *knowledge* and
the calificación *mapping* both exist **city-wide** (GMU raster) — the ~8% municipality-wide figure is a
**publication/vectorization artifact, not a structural limit**. Raising it is a **geometry-acquisition
programme** (vectorize the other 41+28 GMU sheets), not a "the data doesn't exist" wall.

---

## 1 — Source-provenance chain (who is authoritative, who is a mirror)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ AUTHORITY — Gerencia Municipal de Urbanismo (GMU), Ayuntamiento de Córdoba         │
│   www.gmucordoba.es  (NETWORK-BLOCKED from this vantage; content via Wayback +     │
│                       COACo-proxied rasters — see §3)                              │
│   Publishes the PGOU-2001 in force:                                                │
│     • Normativa (Usos, Ordenanzas, Urbanización) ....... PDF (the rule text)       │
│     • CALIFICACIÓN, USOS Y SISTEMAS plan series ........ 49 urban raster sheets     │
│         /documentos/.../cusw_jpg/CUS01W.JPG … CUS49W.JPG   (MUNICIPALITY-WIDE)      │
│     • + 28 peripheral-settlement calificación sheets .. Alcolea, Villarrubia,      │
│         Trassierra, Cerro Muriano, Sta. Cruz, PAU-P sectors, …  (raster JPG)        │
│     • Innovaciones/Modificaciones registry ............ /parcelaciones/            │
│         innovacion-pgou-2001  (the base-plan + increments model, §6)               │
│   ⇒ Calificación KNOWLEDGE + MAPPING both exist CITY-WIDE — but RASTER, not vector. │
└───────────────────────────────┬───────────────────────────────────────────────────┘
                                │  IMDEEC-funded digitisation — "FIRST PHASE"
                                │  (vectorised 8 of 49 urban sheets → 2 districts)
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ VECTORIZER — Colegio Oficial de Arquitectos de Córdoba (COACo)                     │
│   PostGIS workspace `coaco:` on a Hetzner box (origin 65.108.244.111:8080)         │
│   Districts: Sur (zona 01) + Noroeste (zona 02) ONLY.  Casco histórico = separate  │
│   PEPCH regime, NOT in this pilot.                                                  │
└───────────────────────────────┬───────────────────────────────────────────────────┘
                                │  public reverse proxy
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ SERVICE — geoserver.pgou.coacordoba.org/geoserver  (VERIFIED-LIVE, HTTP 200)      │
│   WFS 2.0.0 + WMS 1.3.0 · native CRS EPSG:25830 (ETRS89/UTM-30N)                   │
│   coaco:ordenanzas ............ 453 calificación polygons (ordenanza, et, link)    │
│   coaco:vcatastro_urbanismo ... 5,725 parcels, JOINED (refcat + ordenanza + …)     │
│   coaco:hojas_cus ............. index of the 8 vectorised CUS sheets (raster link) │
│   coaco:actuaciones ........... 42 derived-planning ámbitos (PP/PERI/ED/SG)        │
└───────────────────────────────┬───────────────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ VIEWER — visor.pgou.coacordoba.org  (public; also proxies the raw GMU CUS rasters │
│   at /doc/planos/cus/CUS41W.jpg — VERIFIED-LIVE image/jpeg 461 KB)                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**The headline that changes the plan:** the ~8% municipality-wide ceiling is set by the *vectorization*
being 2-district, **not** by the calificación being unpublished. GMU has published it city-wide as
raster since the plan's approval. See §7 WS2.

---

## 2 — Reachability matrix (evidence per endpoint, probed this session)

| # | Endpoint / resource | Probe | Result | Verdict |
|---|---|---|---|---|
| 1 | `geoserver.pgou.coacordoba.org/geoserver/wfs?...GetCapabilities` | WFS 2.0.0 | `200 application/xml`, 16 feature types | **VERIFIED-LIVE** |
| 2 | `.../wms?...GetCapabilities` (v1.3.0) | WMS | `200 text/xml` | **VERIFIED-LIVE** |
| 3 | `coaco:ordenanzas` Describe/hits/CSV | WFS | 453 polys; fields `geom, ordenanza, et, sup_m2, link`; **15 distinct `O_*.pdf`** | **VERIFIED-LIVE** |
| 4 | `coaco:vcatastro_urbanismo` Describe/hits | WFS | **5,725 parcels**; carries `refcat, ordenanza, sup_pc_m2, max_plantas, actuacion, uso_dominante, …` | **VERIFIED-LIVE** |
| 5 | refcat key-join `CQL_FILTER=refcat='3834946UG4933S'` | WFS | → `ordenanza=Colonia Tradicional Popular`, `zona_nom=Sur`, `sup_pc_m2=165` | **VERIFIED-LIVE** (§4) |
| 6 | spatial `BBOX=…,urn:ogc:def:crs:EPSG::4326` on vcatastro | WFS | → CTP parcels returned (matches #5 area) | **VERIFIED-LIVE** (§4) |
| 7 | `coaco:distritos` CSV | WFS | **2 rows**: Sur (01), Noroeste (02) | **VERIFIED-LIVE** |
| 8 | `coaco:hojas_cus` CSV | WFS | 8 CUS sheets → `visor…/doc/planos/cus/CUS{25,26,34,41,45,46}W.jpg` | **VERIFIED-LIVE** |
| 9 | `visor.pgou.coacordoba.org/doc/planos/cus/CUS41W.jpg` | GET | `200 image/jpeg`, 461 957 B (GMU raster, proxied) | **VERIFIED-LIVE** |
| 10 | `www.gmucordoba.es/` and `/planos` | GET :443 / :80 | `ECONNREFUSED 188.87.158.219:443` / timeout :80 | **NETWORK-BLOCKED** (see note) |
| 11 | GMU `/planos/calificacion-usos-y-sistemas` via Wayback (`20250712`) | GET | `200`; **49 `CUSnnW.JPG` + 28 peripheral JPG** links, municipality-wide | **VERIFIED-LIVE** (archived) |
| 12 | GMU `/parcelaciones/innovacion-pgou-2001` via Wayback (`20251028`) | GET | `200`; innovaciones/modificaciones registry present | **VERIFIED-LIVE** (archived) |
| 13 | `www.cordoba.es/transparencia/.../urbanismo` | GET | `200 text/html` | **VERIFIED-LIVE** |
| 14 | `ideandalucia.es/services/urbanismo/wms` / `/wms/urbanismo` | WMS caps | `404` (both paths) | **ABSENT** (no IDEA urbanismo WMS) |
| 15 | `ideandalucia.es/services/DERA_g6_usos_suelo/wms` | WMS caps | `200` — but **land-COVER** (`06_01_UsoSuelo`), not calificación | **ABSENT** (wrong layer) |
| 16 | National SIU calificación service | (prior probe, `CALIFICACION-ENDPOINT-PROBE.md §4`) | SIU serves **clasificación**, no calificación service exists | **ABSENT** (proven negative) |

> **Note on #10 (NETWORK-BLOCKED, not ABSENT):** `www.gmucordoba.es` refuses TLS from this vantage
> (`ECONNREFUSED` on :443, timeout on :80) and WebFetch/Wayback-live are also blocked to it. This is a
> **reachability limitation from our network**, NOT evidence the site is down — its content is intact via
> the Wayback Machine (#11, #12) and its raster sheets are served live through the COACo proxy (#9). A
> production fetcher on a Spanish/EU egress (or a proxy) should re-confirm direct GMU reachability before
> WS2 (geometry acquisition) relies on pulling the raw CUS sheets from GMU directly.

---

## 3 — The geometry that exists, split KNOWLEDGE vs COVERAGE

The two must never be conflated. **Verification scales per-ORDINANCE, not per-parcel.**

### 3a — KNOWLEDGE matrix (the ordinance families — CITY-WIDE, reused across all parcels)

The PGOU-2001 normativa governs the **whole municipality**. There are **~10 families / 15 subzone
documents**. Each is verified **once** (the L-449 gate is 15 documents, not 5,725 parcels) and then
reused across every parcel that binds to it, in any district, forever.

| Family (`ordenanza`) | Subzone docs (`O_*.pdf`) | Pack status |
|---|---|---|
| Manzana Cerrada | `O_MC1, O_MC2, O_MC3, O_MC4` (+ base `O_MC`) | MC-1..4 packed (partial) |
| Colonia Tradicional Popular | `O_CTP1` | CTP-1 packed (partial) |
| Ordenación Abierta | `O_OA1` | OA-1/2 packed (full) |
| Plurifamiliar aislada | `O_PAS2` | PAS-1..3 packed (full) |
| Unifamiliar Adosada | `O_UAD1, O_UAD3` | UAD-1..3 packed (full) |
| CTP1-Campo de la Verdad | `O_PTC` | NOT packed (Conjunto Histórico Tomo VI) |
| Uso Comercial | `O_COMERCIAL` | NOT packed (context overlay) |
| Uso Industrial | `O_INDUSTRIAL` | NOT packed (subzone-unbindable) |
| Elemento protegido | `O_EP` | NOT packed (preservation regime) |
| Unifamiliar Aislada | `O_UAS1` | NOT packed (dead-link content) |

**This matrix is district-independent.** Extending coverage to district 3…10 adds **zero** new
verification work here — the same 15 documents apply. (New families could appear in unvectorized
districts, but the PGOU's family set is fixed and small.)

### 3b — COVERAGE matrix (the parcel→subzone polygon binding — the actual gap)

| Layer | Coverage | Form | Reachable |
|---|---|---|---|
| `coaco:ordenanzas` (453 polys) + `vcatastro_urbanismo` (5,725 parcels) | **2 / ~10 districts** (Sur + Noroeste, ~1.63 km²) | **VECTOR** (PostGIS/WFS) | VERIFIED-LIVE |
| GMU `CUS01W…CUS49W.JPG` (49 sheets) | **whole main urban area** | **RASTER** (georeferenceable JPG) | via COACo proxy (#9) / GMU direct (blocked here) |
| GMU peripheral sheets (28: Alcolea, Villarrubia, Trassierra, PAU-P…) | **peripheral settlements** | **RASTER** | via Wayback listing (#11) |

**The coverage gap is a raster→vector gap, not a data-absence gap.** COACo vectorized `CUS{25,26,34,41,
45,46}W` (8 sheets → 2 districts). The other **41 urban + 28 peripheral** sheets are published raster
awaiting the same treatment.

---

## 4 — The resolver: `resolveCordobaSubzone(parcel) → subzoneCode`

Proven live this session. Two-step; the second step is load-bearing for subzone precision.

### Step 1 (authoritative subzone) — spatial INTERSECTS on `coaco:ordenanzas`, parse `link`

`coaco:ordenanzas` is the only layer carrying `link`, and **the subzone code lives in the `link`
basename**, not in `ordenanza` (which is the family name only). Verified `ordenanza`→`link` pairs:
`Manzana Cerrada → O_MC1|O_MC2|O_MC3|O_MC4`, `Plurifamiliar aislada → O_PAS2`, `Ordenación Abierta →
O_OA1`, `Unifamiliar Adosada → O_UAD1|O_UAD3`, `Colonia Tradicional Popular → O_CTP1`.

```
# native CRS is EPSG:25830 — issue the point in 25830 (preferred; PRYZM works projected), OR
# declare 4326 axis EXPLICITLY (this GeoServer honours the URN axis order):
GET geoserver.pgou.coacordoba.org/geoserver/wfs
  ?service=WFS&version=2.0.0&request=GetFeature
  &typeNames=coaco:ordenanzas
  &CQL_FILTER=INTERSECTS(geom, POINT(<x> <y>))       # x,y in EPSG:25830
  &propertyName=ordenanza,link&outputFormat=application/json
# → { ordenanza:"Manzana Cerrada", link:".../O_MC3.pdf" }
# subzoneCode = basename(link) "O_MC3" → "MC-3"   (O_PAS2→PAS-2, O_UAD3→UAD-3, O_CTP1→CTP-1)
```

⚠ **Why step 1 is mandatory and step 2 alone is insufficient:** `vcatastro_urbanismo.ordenanza` is the
**family name only** — verified: its distinct values are `Colonia Tradicional Popular (3027)`,
`Manzana Cerrada (1005)`, `Ordenación Abierta (607)`, … (**no `MC-3`, no subzone number**). MC-1..4
differ *materially* (MC-3 FAR = 3.50 vs MC-1/2/4 DERIVED-null). Resolving MC from the parcel-join alone
would be a **confident-wrong** subzone pick. The `ordenanzas.link` is what disambiguates it.

**Axis-order gotcha (documented so the resolver author does not lose an hour):** the layers are native
**EPSG:25830**. A `BBOX`/`INTERSECTS` in EPSG:4326 returns **empty** unless the CRS axis is declared —
`BBOX=<minLat>,<minLon>,<maxLat>,<maxLon>,urn:ogc:def:crs:EPSG::4326` works (lat/lon authority order);
a bare lon/lat BBOX and a bare `POINT(lon lat)` both silently return nothing. Simplest robust path:
**query in EPSG:25830** and skip the axis puzzle.

### Step 2 (attributes + corroboration) — refcat key-join on `coaco:vcatastro_urbanismo`

PRYZM already resolves a drawn parcel to a **Catastro `refcat`** via the national Catastro INSPIRE
service. That `refcat` is the join key — the parcel→ordenanza binding is **materialized server-side**:

```
GET …/wfs?…&typeNames=coaco:vcatastro_urbanismo
  &CQL_FILTER=refcat='3834946UG4933S'
  &propertyName=refcat,ordenanza,actuacion,sup_pc_m2,max_plantas,uso_dominante&outputFormat=csv
# VERIFIED-LIVE → 3834946UG4933S, "Colonia Tradicional Popular", , 165, …
```

This yields: **`sup_pc_m2`** (drives the CTP-1 ocupación step-function, pack WIRING-TODO 6),
**`max_plantas`** (an *independent* height corroboration source — Catastro-derived, not the ordinance —
useful for the L-449 cross-check), and **`actuacion`** (see override below).

### Override rule — derived planning supersedes base calificación

`vcatastro_urbanismo` carries **both** `ordenanza` and `actuacion`. If `actuacion` is non-empty the
parcel is inside one of the 42 `coaco:actuaciones` ámbitos (PP/PERI/ED/SG) and the **subordinate
instrument governs** — resolve to a `noRulePackRefusal`/derived-planning branch, not the base ordenanza
(the same precedence PRYZM applies in Barcelona). Base-ordenanza is the answer only when `actuacion` is
empty.

### The proxy should use

- **Base URL:** `https://geoserver.pgou.coacordoba.org/geoserver/wfs`
- **Version/CRS:** WFS `2.0.0`; query in `EPSG:25830` (or declare `urn:ogc:def:crs:EPSG::4326`).
- **Subzone (authoritative):** `INTERSECTS(coaco:ordenanzas.geom, point)` → parse `link` basename.
- **Attributes + override:** `refcat`-filter `coaco:vcatastro_urbanismo` → `sup_pc_m2`, `max_plantas`,
  `actuacion`.
- **Extent guard:** answer only inside the Sur+Noroeste bbox (`distritos` 01/02); outside → coverage-gap
  refusal (SIU clasificación is the only fallback — land class, no envelope).
- **Honesty:** re-tier every rendered envelope `pipeline-extracted-unverified` until L-449 sign-off.

---

## 5 — The Catastro → subzone join (how a parcel binds)

**Both binding paths exist and are proven:**

1. **Shared key (preferred):** the Catastro **`refcat`** (14-char parcel reference, e.g.
   `3834946UG4933S`). COACo pre-joined every pilot parcel to its calificación, so `vcatastro_urbanismo`
   is a direct `refcat → ordenanza` lookup (VERIFIED-LIVE, §4 step 2). PRYZM already obtains `refcat`
   from the national Catastro INSPIRE WFS, so this needs no spatial math.
2. **Spatial contains:** `INTERSECTS(coaco:ordenanzas.geom, parcel_point)` (VERIFIED-LIVE, §4 step 1).
   This is the authoritative subzone source (the `link`) and the fallback when a `refcat` is unknown or
   a parcel is drawn free-hand.

Coverage of the join: **5,725 parcels**, of which **422 (~7.4%) carry a blank `ordenanza`** (the
not-bound remainder — cf. the ~10.5% not-extractable figure in the pack). Outside the 2 pilot districts
there is **no parcel row** and no binding.

---

## 6 — Model Córdoba as base PGOU + incremental innovaciones (not one static PDF)

The GMU registry `/parcelaciones/innovacion-pgou-2001` (VERIFIED-LIVE via Wayback) records **innovaciones
/ modificaciones** to the 2001 base plan. The Junta (SITUA) also registers the same modifications. So the
in-force calificación at a parcel = **base PGOU-2001 ⊕ any innovación that overrides it there**. The
COACo `coaco:actuaciones` layer (42 ámbitos, with `fecha`/`instrumento`) is the *spatial* face of this;
the GMU innovaciones registry is the *documentary* face. The rule pack must therefore be versioned as a
**base ruleset + an ordered increment log**, not a single snapshot — otherwise a parcel inside a post-2001
innovación silently renders the superseded base envelope. (This mirrors the Barcelona derived-planning
precedence and is why the §4 `actuacion`-override is not optional.)

---

## 7 — The 7-workstream programme (each with a success criterion + RATE effect)

| # | Workstream | Success criterion | RATE effect | Status |
|---|---|---|---|---|
| **1** | **Source provenance** | GMU=authority (raster city-wide) vs COACo=vector pilot chain documented, endpoints proven | Enabling (0 direct) — but **reframes the ceiling from "~8% structural" to "vectorization-limited"** | **DONE (this spike)** |
| **2** | **Geometry acquisition** | Georeference + vectorize the 41 remaining urban `CUSnnW` sheets (+28 peripheral) into PostGIS calificación polygons (the treatment COACo gave 8 sheets) | **The dominant municipality-wide lever** — moves coverage 2/10 → 10/10; the only thing that lifts the ~8% | NOT STARTED — needs GMU-direct raster access (blocked from this vantage, §2 note) |
| **3** | **Ordinance compiler** | All ~15 subzone docs → machine-readable rules (OCR→pack); done for 15 as `pipeline-extracted-unverified` | Enables the numeric fill **once WS6 signs off** — district-independent (§3a) | **DONE (unverified)** (`OCR-EXTRACTION-RESULTS.md`) |
| **4** | **Spatial binding** | `resolveCordobaSubzone` live: `ordenanzas.link`→subzone, refcat-join for attrs, `actuacion`-override, extent guard | Turns geometry into parcel answers **wherever WS2 has reached** | NOT STARTED — spec proven (§4), unwired |
| **5** | **Shared street-width service** | MC per-street-width height table (Art. 13.5.3.1) → parcel height; shared with Barcelona `bcnAlcadaNucliAntic.ts` | Lifts MC (largest family) from partial → full | NOT STARTED |
| **6** | **Per-ordinance verification (L-449)** | Human sign-off of the **15 documents** (NOT 5,725 parcels) against source crops; `SOURCES.md §C` filled | `pipeline-extracted-unverified` → `estimated-ruleset`; unlocks pilot ~19% full / ~89% partial | NOT STARTED — the remaining blocker |
| **7** | **Coverage expansion** | >2 districts bound — either COACo extends the pilot, or WS2 is run in-house against GMU rasters | The municipality-wide realisation of WS2 | BLOCKED (external COACo) OR gated on WS2 |

**Critical-path insight:** WS3 (compile) and WS6 (verify) are **per-ordinance and district-independent**
— they are *already* effectively city-wide the moment they are done, because the same 15 documents govern
every district. The *only* thing that is per-district is **WS2 (geometry) + WS4 (binding)**. So the
municipality-wide unlock is **WS2**, and it is a raster-vectorization engineering task on already-published
public data — **not** a wait-on-COACo external dependency, and **not** an OCR task (OCR is solved).

---

## 8 — What is now unblocked, and what is not

**UNBLOCKED (engineering):**

- The working calificación endpoint (COACo GeoServer WFS 2.0.0), layer names, subzone field, and the 15
  ordinance links — **VERIFIED-LIVE**.
- The parcel→subzone resolver query (spatial `ordenanzas.link` + refcat-join), incl. the CRS/axis gotcha
  and the `actuacion`-override — **proven live** with a real example.
- The Catastro↔subzone join — **materialized server-side**, proven both by shared key and spatially.
- The provenance chain and the true nature of the ceiling (vectorization, not absence).

**STILL BLOCKED (the ONE remaining gate):**

- **L-449 human verification** of the OCR'd numeric values (15 documents). The numbers stay
  `pipeline-extracted-unverified` until a Spanish-planning-literate reviewer signs each off against the
  source crop. This spike does **not** touch that gate — by design.
- **Municipality-wide coverage** depends on WS2 (vectorize the other 69 GMU raster sheets) and, for
  direct GMU raster pull, on resolving the `gmucordoba.es` network block (§2 note) — a Spanish/EU egress
  or proxy.

---

## 9 — Districts beyond the 2-district pilot that are reachable

- **VECTOR calificación beyond Sur + Noroeste: NONE reachable.** `coaco:distritos` = 2 rows; no other
  district's vector calificación is served anywhere probed (IDEAndalucía urbanismo WMS 404; no national
  calificación WMS).
- **RASTER calificación beyond the 2 districts: YES, city-wide.** GMU publishes **49 urban CUS sheets +
  28 peripheral** = the whole municipality (VERIFIED-LIVE via Wayback listing; one sheet confirmed live
  `image/jpeg` through the COACo proxy). This is the raw material for WS2 and is why the municipality-wide
  ceiling is a *vectorization* number, not a data-availability one.

---

## 10 — EXACT reproduction (copy-paste)

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36"
G="https://geoserver.pgou.coacordoba.org/geoserver/wfs?service=WFS&version=2.0.0"

# endpoint + layers
curl -A "$UA" "$G&request=GetCapabilities"                                   # 200, 16 feature types
curl -A "$UA" "$G&request=DescribeFeatureType&typeNames=coaco:vcatastro_urbanismo"   # refcat, ordenanza, sup_pc_m2, actuacion…
curl -A "$UA" "$G&request=GetFeature&typeNames=coaco:vcatastro_urbanismo&resultType=hits"   # 5725
curl -A "$UA" "$G&request=GetFeature&typeNames=coaco:distritos&outputFormat=csv"            # Sur, Noroeste

# resolver — refcat key-join (attributes + override)
curl -A "$UA" "$G&request=GetFeature&typeNames=coaco:vcatastro_urbanismo&CQL_FILTER=refcat='3834946UG4933S'&propertyName=refcat,ordenanza,actuacion,sup_pc_m2,max_plantas&outputFormat=csv"

# resolver — spatial subzone (note the EXPLICIT CRS axis; native is EPSG:25830)
curl -A "$UA" "$G&request=GetFeature&typeNames=coaco:vcatastro_urbanismo&BBOX=37.8744,-4.7759,37.8747,-4.7755,urn:ogc:def:crs:EPSG::4326&propertyName=refcat,ordenanza&outputFormat=csv"
# authoritative subzone via ordenanzas.link:
curl -A "$UA" "$G&request=GetFeature&typeNames=coaco:ordenanzas&propertyName=ordenanza,et,link&outputFormat=csv"   # O_MC1..4, O_PAS2, O_OA1, O_UAD1/3, O_CTP1…

# GMU municipality-wide raster (authority) — direct host blocked here; via COACo proxy + Wayback:
curl -A "$UA" "http://visor.pgou.coacordoba.org/doc/planos/cus/CUS41W.jpg" -o CUS41W.jpg   # 200 image/jpeg
curl -A "$UA" "http://web.archive.org/web/2025id_/https://www.gmucordoba.es/planos/calificacion-usos-y-sistemas"   # 49 CUSnnW + 28 peripheral
```

---

*Maintainer: UNASSIGNED. This spike resolves ACCESS/GEOMETRY/PROVENANCE. The remaining blocker is the
L-449 human verification (WS6) — a separate human gate. Coverage beyond 2 districts is WS2
(vectorize the published GMU rasters), an engineering task, not an external wait.*
