# Madrid (INE 28079) — per-field sources

**Status: NZ 1 live-data rows VERIFIED-LIVE. All NZ 4/8/5/7 rule VALUES UNVERIFIED — the pack MUST
NOT ship them until the rows carry real primary citations.**

Per the authoring contract (JURISDICTION-PLAYBOOK §3.3): every value the pack sets needs a row here
— value · unit · governing article · document · URL. **A field with no citable source stays `null`
in the pack** and is listed under *Unverified*. Never interpolate or infer. Blog / slide /
APR-plan-specific figures are **SECONDARY** and never become a pack value.

---

## A. VERIFIED-LIVE — NZ 1 buildable footprint + edificabilidad (Tier A)

Captured 2026-07-23 by direct endpoint call (`?f=json`). Per **L-438**, endpoint claims are citable
only from a RESPONSE, never from portal prose — these are responses. Host:
`sigma.madrid.es/hosted/rest/services/`.

| Item | Value | Source (response) |
|---|---|---|
| NZ 1 service | Plano de Condiciones de la Edificación, PGOUM-97 (BOE 19-04-1997) | `PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer?f=json` (serviceDescription) |
| Service scope | *"regulated under Zonal Norm 1 … special parcels with individually defined conditions"* | ↑ same |
| Fondo de la Edificación | layer **2**, `esriGeometryPolyline`, fields = `[OBJECTID]` only | `.../MapServer/2?f=json` |
| Condiciones de la Edificación | layer **6**, `esriGeometryPolygon` | `.../MapServer/6?f=json` |
| Ficha Específica | layer **1**, `esriGeometryPoint` (per-parcel override) | `.../MapServer?f=json` |
| Fondo (closed polygon) | layer **10**, `esriGeometryPolygon` (candidate ring) | `.../MapServer?f=json` |
| **`COEF_Z`** (edificabilidad) | field on layer 6, type **String**, alias "Coeficiente Z :" | `.../MapServer/6?f=json` (fields[]) |
| `CODMANZANA` | field on layer 6, String, alias "Número de Manzana :" (the key `COEF_Z` is per) | ↑ same |
| `COND_EDIF` | field on layer 6, SmallInteger, "Grado Condición Edificación :" | ↑ same |
| `NUMORD` | field on layer 6, String, "Número de Catálogo :" | ↑ same |
| Alineaciones (official line) | `pgoum97/PG_ORDENACION_SIN_AMBITO/MapServer` layer 5 (polyline); also `PG_GESTION` layer 8 | `.../PG_ORDENACION_SIN_AMBITO/MapServer?f=json` |

⚠ **Two caveats that gate USE of the above (not portal prose — structural facts of the response):**
1. `COEF_Z` is **String** and keyed on **`CODMANZANA`** ⇒ **block granularity** (C58 §1.11) and may
   be a coded value. **Parse under assertion; refuse (not zero) on an unparseable code.** Its exact
   numeric semantics are **UNVERIFIED** — do not treat as a bare float until confirmed on a real query.
2. `Fondo de la Edificación` is a **polyline** (rear line), not a closed ring. Which layer is the
   closed buildable area (6 vs 10 vs a constructed close against Alineaciones) is **UNVERIFIED** —
   the ringRef resolver's first job (`findings/L-608` §4).

## A2. PRIOR-VERIFIED, NOT re-confirmed this pass — the calificación (Norma Zonal) plane

The prior Madrid assessment recorded *"calificación as a LIVE queryable ArcGIS point service"*. This
pass could **not** re-verify it: `pgoum97/PG_ORDENACION/MapServer?f=json` returned HTTP 500 "Service
not started" (x3, 2026-07-23). **Tier: PRIOR-VERIFIED (not re-confirmed).** Resume by retrying and
identifying the NZ-code field; see `NEXT.md` §3.4.

---

## B. NZ 1 pack-value rows

| Field | Value | Unit | Article / source | Tier |
|---|---|---|---|---|
| `geometricRule.kind` | `explicit-area` | — | published footprint (§A) — the case the schema names | VERIFIED-LIVE (kind), engine-BLOCKED (KG-4) |
| `geometricRule.ringRef` | `madrid-nz1:fondo-condiciones/v-<vintage>` | — | provider resolver over §A layers | DESIGN (`findings/L-608` §4) |
| edificabilidad (`COEF_Z`) | *live per manzana* | (coded) | layer 6 field | VERIFIED-LIVE as data; parse UNVERIFIED; granularity `block` |
| `permittedUse` | `residential` (grado 1º) | — | NNUU Cap. 8.1, 2016 mod of Cap. 8.3 regime | SECONDARY (COAM) — re-cite to Compendio before shipping |
| `maxHeight_m` / `maxFloors` / `maxCoverage` / setbacks | — | — | — | **null (unverified)** |

---

## C. RULE VALUES — NZ 4 / 8 / 5 / 7 — **NONE VERIFIED**

Governed by the **PGOUM-97 NNUU, Compendio 2023** (`madrid.es/UnidadesDescentralizadas/UDCUrbanismo/
PGOUM/CompendioNNUU/Compendio 2023/1 Compendio 2023.pdf`), Capítulos 8.x. **Grado-structured** — key
any future pack on `NZ<n>-<grado>`, never a bare NZ scalar.

### NZ 4 — Edificación en manzana cerrada (`alignment`) — Cap. 8.4

| Field | Value | Unit | Article | Document | URL |
|---|---|---|---|---|---|
| `alignment.buildableDepth_m` (fondo edificable) | — | m | Art. 8.4.x (per grado) | — | — |
| `alignment.alignTo` | `official-line` (Madrid publishes alineaciones) | — | — | live Alineaciones layer | — |
| `alignment.sideTreatment` | `party-wall` (medianería) | — | Art. 8.4.x | — | — |
| `maxHeight_m` / `maxFloors` (altura de cornisa / nº plantas) | — | m / — | Art. 8.4.x | — | — |
| `maxCoverage` (ocupación máxima) | — | 0..1 | Art. 8.4.x | — | — |
| `permittedUse` | — | — | Art. 8.4.x | — | — |

### NZ 8 — Edificación en vivienda unifamiliar (`setback`) — Cap. 8.8

| Field | Value | Unit | Article | Document | URL |
|---|---|---|---|---|---|
| `setback.front_m` / `side_m` / `rear_m` (retranqueos) | — | m | Art. 8.8.x (per grado) | — | — |
| `maxHeight_m` / `maxFloors` | — | m / — | Art. 8.8.x | — | — |
| `maxCoverage` | — | 0..1 | Art. 8.8.x | — | — |
| `plotRatioFAR` (edificabilidad) | — | m²/m² | Art. 8.8.x | — | — |

### NZ 5 (bloques abiertos) / NZ 7 (baja densidad) — `setback` — Cap. 8.5 / 8.7 — all fields `null`.

**Nothing above may be filled from memory, a blog, a lecture slide, or an APR/APE plan (which carry
site-specific overrides that contradict the general norm). Primary NNUU read + L-449 sign-off only.**

---

## D. NZ 3 — Volumetría específica — the REFUSAL copy (authorable now)

NZ 3 has no zone-level parametric rule — the buildable volume is fixed **per parcel** by its ficha /
approved volumetry. Honest output = a cited `derived-plan` refusal (a POSITIVE answer, not an
envelope). Proposed copy:

- `code`: `derived-plan`
- `headline`: *"Volumetría específica (Norma Zonal 3) — la edificabilidad se define por parcela."*
- `detail`: *"PGOUM-97 Norma Zonal 3 fixes the buildable volume specifically for each parcel through
  its own volumetric sheet (ficha), not through a general zone parameter. PRYZM does not hold that
  per-parcel volumetry, so no zone envelope is computed here."*
- `ordinanceRef`: *"PGOUM-97 NNUU Cap. 8.3, Norma Zonal 3 (Compendio 2023; Cap. 8.3 modified 2016)."*
- `legallyGrounded`: `true`.

Upgrade path: if the specific volumetry is published as geometry (as NZ 1's footprint is), NZ 3
becomes an `explicit-area` zone.

---

## E. Unverified / open

- NZ 4/8/5/7 grado-by-grado parameters — **not established** (Cap. 8.x primary read pending).
- `COEF_Z` numeric semantics + the buildable-ring layer choice — **not established** (needs a live
  `query`, not a metadata read).
- The queryable Norma-Zonal calificación endpoint — **PRIOR-VERIFIED, not re-confirmed** (service
  was down this pass).
- The ~35 % derived-ámbito share and the per-NZ split within the directly-governed 96 % — carried
  from the prior assessment; the split is **UNSOURCED** and must not be asserted as a resolution %.
