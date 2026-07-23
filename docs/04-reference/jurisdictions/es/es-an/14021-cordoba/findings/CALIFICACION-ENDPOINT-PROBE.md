# Córdoba calificación — the endpoint probe (reachability + reproduction)

> **Stamp** 2026-07-23 · **Status** RESEARCH FINDINGS — no code, no pack, no wiring.
> **Governs nothing.** This is evidence, tiered per §CONTEXT-DATA-HONESTY.
> **Supersedes** the prior "COULD-NOT-VERIFY / GeoServer host not exposed" Córdoba verdict —
> the host WAS found this session and is live. See §2.
>
> Confidence tags used on every claim:
> **VERIFIED-LIVE** = fetched this session, this is the response · **COULD-NOT-VERIFY** = not confirmed, with the reason.

---

## 0 — The one-paragraph result

Córdoba's **calificación** (the PGOU zoning ordenanza, the layer that carries edificabilidad /
plantas / ocupación) **is served live and public as structured geometry** from the COACo viewer's
own GeoServer — **`https://geoserver.pgou.coacordoba.org/geoserver`** — as WFS 2.0.0 + WMS 1.3.0,
both HTTP 200. Each calificación polygon carries an `ordenanza` code and a **direct link to its
ordinance PDF**. Two caveats decide its usefulness: (1) coverage is **only 2 pilot districts**
(Sur + Noroeste), not the whole municipality; (2) the ordinance PDFs are **scanned images**
(`pdftotext` → 3 chars), so the numbers are present but need OCR. Separately, the **national SIU**
host that the prior pass believed dead is **alive** (`mapas.fomento.gob.es/arcgis`) — but it serves
**clasificación**, not calificación (see §4). The task's hypothesis of a national SIU *calificación*
WMS is **false**.

---

## 1 — How the endpoint was found (the trail, so it is reproducible)

1. Web-searched the Córdoba planning viewer → landing page **`https://visor.pgou.coacordoba.org/`**
   (the COACo "Visor urbanístico", IMDEEC-funded). VERIFIED-LIVE.
2. Landing is a marketing SPA; the app link is `.../app/`. The app is a Vite build with a single
   JS bundle `/app/assets/index-c4150013.js` (4.67 MB). VERIFIED-LIVE.
3. Grepped the bundle for hosts. Among OSM/Mapbox/Catastro/PNOA it references one own-backend host:
   **`https://geoserver.pgou.coacordoba.org`**. That is the map backend. VERIFIED-LIVE.

> Method note that matters: the calificación source was **not** in any documented IDE catalogue —
> it was reached by reading the viewer's own JS bundle. The prior pass's `/geoserver` 404 was
> against a *guessed* path on the wrong host; the real host is a subdomain of the viewer.

---

## 2 — The GeoServer (VERIFIED-LIVE)

`GetCapabilities` on both protocols returned HTTP 200 `application/xml`:

- WFS: `https://geoserver.pgou.coacordoba.org/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities`
- WMS: `https://geoserver.pgou.coacordoba.org/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities`

Provider (from the caps document): **Colegio Oficial de Arquitectos de Córdoba (COACo)**,
contact `informatica@coacordoba.net`. Internal origin leaks in the namespace as
`http://65.108.244.111:8080/geoserver/coaco` (a Hetzner box behind the public proxy) — noted only
because it confirms `coaco:` is the real workspace, not a demo.

### Feature types (workspace `coaco:`)

| typeName | what it is |
|---|---|
| **`coaco:ordenanzas`** | **the calificación** — zoning ordinance polygons (the target) |
| `coaco:usos_globales` | uso global polygons (`tipo`, `actuacion`, `sup_m2`) |
| `coaco:usos_dotacionales` | equipment / dotational uses |
| `coaco:actuaciones` | **derived-planning ámbitos** (PP/PERI/ED/SG) — see §3 |
| `coaco:vcatastro_urbanismo` | cadastre × urbanism join |
| `coaco:distritos` | district boundaries — **only 2 rows** (see §5) |
| `coaco:ordenanzas`, `usos_*`, `actuaciones` all fetch as CSV/GeoJSON |
| `coaco:vhex25_max_plantas`, `vhex25_n_inmuebles`, `vhex25_sup_total_m2`, … | 25-unit hex-grid statistics |

### `coaco:ordenanzas` schema (DescribeFeatureType, VERIFIED-LIVE)

| field | type | meaning |
|---|---|---|
| `geom` | Polygon | the calificación polygon |
| `ordenanza` | string | **the calificación name/code** (e.g. `Manzana Cerrada`) |
| `et` | string | estudio-de-detalle / sub-tag flag |
| `sup_m2` | float | polygon area |
| `link` | string | **direct URL to the ordinance PDF** |

**453 polygons** (`resultType=hits` → `numberMatched="453"`). Distinct calificación families and
counts (VERIFIED-LIVE, CSV pull):

| calificación (`ordenanza`) | polygons |
|---|---|
| Manzana Cerrada | 226 |
| Colonia Tradicional Popular | 99 |
| Ordenacion Abierta | 43 |
| Plurifamiliar aislada | 30 |
| Unifamiliar Adosada | 22 |
| CTP1- Campo de la Verdad | 16 |
| Uso Comercial | 8 |
| Elemento protegido | 7 |
| Uso Industrial | 1 |
| Unifamiliar Aislada | 1 |

→ **~10 calificación families, resolving to 15 distinct ordinance PDFs.** A compact rule-pack:
sample links `http://visor.pgou.coacordoba.org/doc/ordenanzas/O_PAS2.pdf`,
`.../O_INDUSTRIAL.pdf`, `.../O_OA1.pdf`.

---

## 3 — The derived-planning layer `coaco:actuaciones` (VERIFIED-LIVE)

Schema: `idac, actuacion, descripcion, instrumento, fecha, clase_suelo, link, geom(MultiPolygon),
tramitado(bool), distrito, ficha(bool), doc(bool)`.

**42 rows.** By `instrumento` (CSV, VERIFIED-LIVE — minor comma-in-field noise):

| instrumento | count |
|---|---|
| PLAN PARCIAL | ~9–11 |
| PLAN ESPECIAL DE REFORMA INTERIOR (PERI) | ~9 |
| ESTUDIO DE DETALLE | ~9 |
| SISTEMA GENERAL VIARIO / ESPACIOS LIBRES | ~6 |
| PLAN ESPECIAL (incl. SGEL) | ~3 |

By `clase_suelo`: **URBANO 32**, URBANIZABLE PROGRAMADO 2, blank 8.

**Read:** the consolidated urban fabric is **directly** qualified by the PGOU ordenanza (453
polygons); only ~42 discrete ámbitos are governed by a subordinate instrument. This is the
**inverse** of Barcelona's 62.8% derived-planning trap. Córdoba is a **direct-calificación**
city. (Whole-municipality area-share is NOT computable — only the 2-district pilot is published;
see §5. The `sup_m2` for actuaciones is not in the schema, so even a pilot area-share needs a
geometry-area pass.)

---

## 4 — The national SIU verdict (front-and-centre trip-wire)

**The prior Córdoba pass recorded the national SIU public host as DNS-dead. That is corrected:**
`https://mapas.fomento.gob.es/arcgis/rest/services/SIU/...` is **LIVE** (HTTP 200 with a browser
User-Agent; the ArcGIS REST view, not the WFS). This is the same host the Barcelona pass verified
on 2026-07-20 and it is still serving on 2026-07-23.

**But SIU serves CLASIFICACIÓN, not CALIFICACIÓN.** The full SIU folder was enumerated
(`.../rest/services/SIU?f=json`) — 26 services. There is **no calificación service**. The relevant ones:

- `SIU/Servicios_OGC/MapServer` L15 **`OGC_Clases_Suelo`** — clase de suelo (urbano / urbanizable /
  no urbanizable). **VERIFIED-LIVE for Córdoba INE 14021**: all 6 land classes present, all in force
  (`FechaBaja=99999999`):
  `SUELO URBANO`, `SUELO URBANO NO CONSOLIDADO`, `SUELO URBANIZABLE DELIMITADO O SECTORIZADO`,
  `SUELO URBANIZABLE NO DELIMITADO O SECTORIZADO`, `SUELO NO URBANIZABLE`, `SISTEMAS GENERALES Y OTROS`.
- `SIU/Planeamiento_Vigente/MapServer` — per-municipality registry of the in-force plan.
  **VERIFIED-LIVE for Córdoba**: `FiguraVigente = "Plan General"`, `FechaFigura = 2002` (the
  PGOU approved 2001, i.e. PGOU-2001), `UrlLink = https://ws132.juntadeandalucia.es/situadifusion/pages/search.jsf`.
- `SIU/CLASES_DE_SUELO`, `SIU/Ámbitos_o_Sectores`, `SIU/Grado_de_Desarrollo`,
  `SIU/Antigüedad_Planeamiento` — all clasificación/ámbito/registry, **none carry the ordenanza**.

**Conclusion — the SIU headline for the whole Spain rollout:** SIU gives **clasificación**
nationally (land class, one MultiSurface per class per municipality — the Tier-B question,
already documented in `spain/SPAIN-ZONING-LIVE-VERIFICATION-2026-07-20.md §8–§9`). It does **NOT**
give **calificación**. There is **no national calificación WMS**. Calificación must be sourced
per-jurisdiction (municipal viewer / regional SITUA). **Do not spend more cycles hunting a
national SIU calificación endpoint — it does not exist. This kills the shared trip-wire hypothesis
cleanly** (which is itself the point of chasing it: a proven negative saves Barcelona and Madrid
the same hunt).

---

## 5 — The scope caveat that a resolution claim MUST carry

The calificación GeoServer covers **only 2 pilot districts**, not the municipality:

- `coaco:distritos` returns **2 features**: **Sur** (zona 01) and **Noroeste** (zona 02).
- `coaco:ordenanzas` WGS84 bbox = `[-4.8077, 37.8558] → [-4.7691, 37.8986]` ≈ **3.4 km × 4.8 km**,
  total `sup_m2` summed = **1 628 616 m² ≈ 1.63 km²**. Córdoba's consolidated urban area is many
  times larger, and the municipality has ~10 administrative districts.

So this is the **IMDEEC-funded COACo pilot** over 2 districts, **not** a whole-city calificación
layer. A parcel click resolves to a calificación polygon **only if it lands inside Sur / Noroeste**;
elsewhere in the city the best available answer is SIU clasificación (land class, no envelope).
Note the pilot districts are Sur + Noroeste — **not** the casco histórico, which is under the
separate **PEPCH** (the dual-regime historic-core trap flagged in the prior pass — untouched here).

---

## 6 — The document-payload state (why no `structured` pack ships today)

The ordinance PDFs are **fetchable** (`O_PAS2.pdf` → HTTP 200 `application/pdf`, 762 KB, `%PDF-1.7`).
They **reference the right parameters** — a WebFetch read saw edificabilidad, altura/plantas,
ocupación, retranqueos, parcela mínima named — **but `pdftotext -layout` yields 3 characters**:
they are **scanned images with no text layer**. The numbers exist on paper; extracting them needs
**OCR + human verification**. Under C58 §1.2 / the L-449 gate, nothing here can ship
`confidence: 'structured'` yet — the numeric fields are unverified.

---

## 7 — EXACT reproduction (copy-paste; browser User-Agent required on the ministry host)

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36"

# --- COACo calificación GeoServer ---
curl -A "$UA" "https://geoserver.pgou.coacordoba.org/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities"
curl -A "$UA" "https://geoserver.pgou.coacordoba.org/geoserver/wfs?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=coaco:ordenanzas&outputFormat=application/json"
curl -A "$UA" "https://geoserver.pgou.coacordoba.org/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=coaco:ordenanzas&resultType=hits"          # numberMatched=453
curl -A "$UA" "https://geoserver.pgou.coacordoba.org/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=coaco:ordenanzas&propertyName=ordenanza,link&outputFormat=csv"
curl -A "$UA" "https://geoserver.pgou.coacordoba.org/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=coaco:distritos&outputFormat=csv"           # 2 rows: Sur, Noroeste
curl -A "$UA" "http://visor.pgou.coacordoba.org/doc/ordenanzas/O_PAS2.pdf" -o O_PAS2.pdf && pdftotext -layout O_PAS2.pdf - | wc -c   # ~3 → scanned

# --- National SIU (browser UA REQUIRED; default curl UA gets 403) ---
curl -A "$UA" "https://mapas.fomento.gob.es/arcgis/rest/services/SIU?f=json"                       # 26 services, none "calificacion"
curl -A "$UA" "https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Servicios_OGC/MapServer/15/query?where=ProvINE%3D%2714021%27&outFields=ProvINE,ClaseSuelo,FechaBaja&returnGeometry=false&f=json"
curl -A "$UA" "https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Planeamiento_Vigente/MapServer/1/query?where=nombre%20LIKE%20%27%25rdoba%25%27&outFields=nombre,FiguraVigente,FechaFigura,UrlLink&returnGeometry=false&f=json"
```

---

## 8 — Dead ends / negatives measured this session (do NOT re-run hoping)

| Target | Result |
|---|---|
| `ws132.juntadeandalucia.es/situadifusion` (Junta SITUA, from SIU UrlLink) | Live JSF **document registry** (planning PDFs by municipality) — the Andalucía analogue of Catalonia's RPUC. Its map JS (`componentemapa.js`) is a static province-image picker, **no WMS**. Calificación is inside the PGOU PDFs, not a service. |
| `datosabiertos` "Cartografía Urbana Vectorial" | = `ideandalucia.es/wms/urbana500|1000|2000|5000` — urban **base cartography** (buildings/streets), **not** calificación. |
| DERA G6 `usos_suelo` WFS | land **cover** (vegetation, extractive) — not calificación. Confirms prior pass. |
| VITUA (IECA visor) | tells you **which instrument** is in force per municipality; structured spatial data **only for plans approved after 24 Apr 2026** (Normas Directoras). Córdoba PGOU is 2001 → **PDF-only, not in VITUA as geodata**. |
| SIU `SIU/*` folder (26 services) | no calificación service exists nationally. |
