# MÁLAGA ENGINE PROGRESS — 2026-08-05

> Companion to [`FORENSIC-BLOCKER-AUDIT-2026-08-03.md`](./FORENSIC-BLOCKER-AUDIT-2026-08-03.md) and
> [`CAPABILITY-AUDIT-2026-08-04.md`](./CAPABILITY-AUDIT-2026-08-04.md). Mirrors the structure of
> Sevilla's `SEVILLA-ENGINE-PROGRESS-2026-08-05.md`.
>
> **Code touched this pass**: `packages/site-parcel-data/src/rulepacks/esMalaga.ts` (51-line scaffold
> → full 38-zone pack), `packages/site-parcel-data/src/index.ts` (exports),
> `packages/site-parcel-data/__tests__/esMalagaEnvelope.test.ts` (new, 250 tests),
> `packages/site-parcel-data/__tests__/packPublishedConfidenceUnchanged.test.ts` (manifest entry).
> **Corpus added**: `findings/corpus/NormasUrbanisticas/` (Documento C, 2011 + FEB-2018).
> **Not committed** — left in the working tree for review, per brief.

---

## Headline

**Málaga is now the INVERSE of Sevilla's opening position.** Sevilla began with live zone identity
and zero transcribed parameters. Málaga now has a fully transcribed, article-cited ordinance —
**all 38 zone codes the plan declares, 9 of them with real computable footprints** — and **zero
zone identity**. Nothing in the pack is reachable by dispatch, and nothing can be until the
municipality's calificación layer becomes readable.

`MALAGA_ENVELOPE_VERIFIED` remains `false` and was not touched (L-449, founder-only).

---

## 1. The critical first check — the corpus was the WRONG DOCUMENT, as suspected

The brief's suspicion was **correct and material**.

The pre-existing local corpus at `findings/corpus/memorias/` is **Documento A** — "Introducción,
memorias y estudio económico-financiero". Confirmed two ways:

1. Its filenames (`TITULO I ANTECEDENTES…`, `TITULO VIII CLASIFICACION Y CALIFICACION DEL SUELO`,
   `CAP VIII Epigrafe 8_4 pags 424 a 443`, …) match, character for character, the Documento A branch
   of the official index page.
2. Fetching `https://www.malaga.eu/recursos/urbanismo/pgou_ap2/pgou2011ad1.html` live and extracting
   its links shows every one of those files under
   `pgou_ad1/Documento A. Introduccion memorias y estudio economico financiero/…`.

Documento A is descriptive. **It carries no per-zone numeric buildable parameters.** Building a pack
from it would have been fabrication.

### What was fetched instead

`Documento C. Normativa, ordenanzas y fichas` exists in the 2011 tree, **but there is a later,
binding consolidation** at a different host and path, exactly as the screenshot's
"(Actualización FEB. 2018)" note implied:

`https://urbanismo.malaga.eu/normativa-y-planeamiento/pgou-2011/pgou-2011/documento-c.-2018/`

Both were downloaded. **Only the FEB-2018 consolidation was transcribed** — its Título XII pages are
footed *"Normas Urbanísticas. Ordenanzas. Título XII. Febrero 2018"*. Using the 2011 originals would
have risked transcribing superseded figures.

Saved to `findings/corpus/NormasUrbanisticas/`:

| File | Source | Bytes |
|---|---|---|
| `AD-FEB2018/12-TITULO-XII.pdf` | `…/.galleries/Documento-C.-Ordenanzas/12-TITULO-XII.pdf` | 1,023,286 |
| `AD-FEB2018/11-TITULO-XI.pdf` | same gallery | 348,994 |
| `AD-FEB2018/13-TITULO-XIII.pdf` | same gallery | 246,758 |
| `AD-FEB2018/06-TITULO-VI.pdf` (usos) | `…/Documento-C.-Normas-urbanisticas-y-ordenanzas/` | 905,826 |
| `AD-FEB2018/07-TITULO-VII.pdf` | same | 151,646 |
| `TITULO_XII_ORDENANZAS.pdf` etc. | the 2011 `pgou_ap2` tree — kept for provenance, **not transcribed** | — |

All are **natively text-extractable** (`pdftotext -enc UTF-8`, no OCR). Título XII extracts to 3,212
lines of clean text. ⚠ The first extraction used the default encoding and produced mojibake
(`Art�culo`); `-enc UTF-8` is required.

---

## 2. The zone-code universe — derived from the BINDING TEXT, not a live service

Sevilla's universe came from a live ArcGIS `zona_orden` field. **That route is closed for Málaga**
(§3). The universe here is derived from Documento C itself:

- **Art. 12.1.1 "Zonas"** enumerates the twelve top-level zones of Suelo Urbano.
- Each zone's own chapter declares its subzones by article (Art. 12.6.2, 12.7.2, 12.8.2, 12.9.2,
  12.10.2, …).
- Capítulo Decimoquinto adds **GSM**, which Art. 12.1.1's list does not name.

**38 codes total.** Chapter map:

| Cap. | Zone | Subzone codes | Arts. |
|---|---|---|---|
| III | Edificios Protegidos | `EP` | Cap. III |
| IV | Ciudad Histórica | `C-1` `C-2` `C-3` `C-4` | 12.4.1–12.4.7 |
| V | Manzana Cerrada | `MC` | 12.5.1–12.5.4 |
| VI | Ordenación Abierta | `OA-1` `OA-2` | 12.6.1–12.6.5 |
| VII | Ciudad Jardín | `CJ-1` `CJ-1A` `CJ-2` `CJ-2A` `CJ-3` `CJ-4` | 12.7.1–12.7.5 |
| VIII | Unifamiliar Aislada | `UAS-1`…`UAS-5` | 12.8.1–12.8.5 |
| IX | Unifamiliar Adosada | `UAD-1` `UAD-2` | 12.9.1–12.9.6 |
| X | Colonia Tradicional Popular | `CTP-1` `CTP-2` | 12.10.1–12.10.6 |
| XI | Uso Productivo | `PROD-1A` `PROD-1B` `PROD-2` `PROD-3A` `PROD-3B` `PROD-4` `PROD-4B` `PROD-5` | 12.11.3–12.11.9 |
| XII | Comercial | `CO` | 12.12.1–12.12.4 |
| XIII | Hotelera | `H` | 12.13.1–12.13.4 |
| XIV | Equipamiento | `E` `S` `D` `SC` | 12.14.1–12.14.3 |
| XV | Gran Superficie Minorista | `GSM` | 12.15.1–12.15.4 |

> ⚠ **Stated honestly**: this derivation is arguably *stronger* for a legal question than a GIS
> attribute, but it carries a different risk — a code in force on the ground yet absent from
> Documento C would be invisible to it, and **no live-service cross-check is available to catch
> that**. Recorded in the pack's own `MALAGA_PGOU_ZONE_CODES` docstring.

---

## 3. Zone geometry — blocked, re-verified live, and four new founder leads closed

The Oracle lock is **still live on 2026-08-05** (third consecutive session):

```
GET sig.malaga.eu/geoserver/wfs?...GetFeature&typeName=muralPGOU:POLCALIF_T
→ HTTP 200, ows:ExceptionReport:
  "Cannot create PoolableConnectionFactory (ORA-28000: la cuenta está bloqueada)"
```

New this pass: `DescribeFeatureType` on the same layer returns a **well-formed `xsd:schema` with
zero element declarations** — GeoServer cannot introspect the table either, because the same
connection is down. This *explains* the prior audits' "445-byte schema with zero fields" rather than
merely repeating it.

The full `GetCapabilities` census (43 feature types) was re-pulled and enumerated: exactly **8** are
`muralPGOU:*` (`POLCALIF_T`, `LINALIN_T`, `TEXTOPON_T`, `EXPTOPO_V`, `EXPCONSULTA_V`,
`DENOMPGOUAPR_V`, `DENOMPGOUEXP_V`, `DENOMPGOUTRM_V`). The other 35 are `GeoPortal:*`,
`DatosAbiertos:*`, `Limasa:*` and `AgenciaDeLaEnergia:*` — waste containers, cultural venues,
parking, street furniture. **No non-`muralPGOU` layer carries zoning.**

### Founder leads — all four checked live, all four negative

| # | Lead | Verified result |
|---|---|---|
| 1 | **Geoportal de Málaga** — inspect the viewer's own network calls | `geoportal.malaga.eu` **301 → `callejero.malaga.eu`** (street directory). Fetched its page and **both JS bundles** (`init.bundle.js` 12,727 B, `checks.bundle.js` 27,864 B) and grepped for WMS/WFS/WMTS/ArcGIS-REST URLs — **none present**. `sig.malaga.eu/arcgis/rest/services?f=json` → **HTTP 404**: there is no ArcGIS REST instance, so `providers/containers/arcgisRest.ts` has nothing to point at. |
| 2 | **Open Data "Sistema de Información Cartográfica – Edificación"** | **The dataset is real**, and is downloadable in GeoJSON/SHP/KML/GML/CSV in both EPSG:25830 and EPSG:4326 exactly as the founder described. **It is not zoning.** Its schema is `FID, ID_EDIFICACION, SDOLINEA` — a LINESTRING and an id, nothing more. Sibling `…-Parcela` carries `ID_PARCELA, REFCATASTRAL, CATASTRAL, INSCRIPREGIS, ALTEDIFICA, FECCONSTRUC, USO` — cadastral base cartography. **No `zona_orden` analogue.** ⚠ `ALTEDIFICA` is a *surveyed* built-floor count and `USO` an *actual* use code; reading either as a normative permission would be the exact §GETCAPABILITIES-IS-NOT-AN-INVENTORY / L-616 fabrication this pack exists to prevent. Live CKAN `package_search`: `planeamiento` → **0**, `calificacion` → **0**, `pgou` → **0**. |
| 3 | **Transparency portal** | `transparencia.malaga.eu` HTTP 200; documents only, nothing vector. |
| 4 | **"Nuevo Planeamiento" / PGOM** | `urbanismo.malaga.eu/normativa-y-planeamiento/informacion-pgom/` fetched live; PDF links only, **no map service referenced anywhere in the page**. |

Also checked and negative: national SIU (`mitma.gob.es/siu/wms` → 301 loop; `servicios.mitma.es`
unreachable) and `idee.es` INSPIRE planning WMS (**404**).

> **The founder's premise that Málaga's planning GIS is "✅ Strong" does not hold.** The planning GIS
> *exists* and is well-modelled — it even publishes `muralPGOU:LINALIN_T`, the region's only
> municipal alignment layer by name — but it is **not readable**. Strong ≠ available. This is the
> third independent pass to reach the same conclusion, now with the alternate-backend, open-data and
> viewer-network hypotheses each individually closed by direct test.

**Consequence: no `resolveMalagaZone.ts` was written, and none can be.** That is a finding, not an
omission. Writing a resolver against a locked endpoint would produce a module that can only ever
return a transport error.

---

## 4. What was packed — 9 real footprints

All figures verbatim from Documento C Título XII (Feb-2018), each cited to its article in the
pack's `ordinanceRef`.

### UAS — Vivienda Unifamiliar Aislada (Cap. VIII, Arts. 12.8.1–12.8.5)

| Code | FAR | Coverage | Front / Side / Rear | Height |
|---|---|---|---|---|
| `UAS-1` | 0.60 | 50 % | 2 / 2 / 2 m | PB+1, 7 m |
| `UAS-2` | 0.37 | 40 % | 3 / 3 / 3 m | PB+1, 7 m |
| `UAS-3` | 0.30 | 30 % | 3 / 3 / 3 m | PB+1, 7 m |
| `UAS-4` | 0.25 | 25 % | 4 / 4 / 4 m | PB+1, 7 m |
| `UAS-5` | 0.20 | 20 % | 6 / 6 / 6 m | PB+1, 7 m |

**Why UAS resolves where CJ does not**: Art. 12.8.4.1 tabulates the *public*-lindero separation as a
flat per-subzone figure, and Art. 12.8.4.2 then states in one unbranched sentence that *"la
separación mínima a los demás linderos se regulará **en los mismos términos** que el apartado
anterior"* — side and rear take the front's figure. Nothing is height-dependent, occupation-driven
or graphic. FAR (12.8.3.1), coverage (12.8.3.3) and height (12.8.4.3, zone-wide "para todas las
Subzonas") are all flat. No `geometricRule` is needed: three positive insets bound the footprint.

### UAD — Vivienda Unifamiliar Adosada (Cap. IX, Arts. 12.9.1–12.9.6)

| Code | FAR | Coverage | Front | Side | Rear | Depth | Height |
|---|---|---|---|---|---|---|---|
| `UAD-1` | 1.16 | 60 % | 3 m | 0 (adosada) | 3 m | **15 m** | PB+1, 7 m |
| `UAD-2` | 0.52 | 45 % | 4 m | 0 (adosada) | 5 m | **20 m** | PB+1, 7 m |

Ships `geometricRule.kind:'alignment'` — Art. 12.9.4.3 states a *profundidad máxima edificable*
**measured from the street alignment** ("desde la alineación de la valla a vial"), which is *not*
interchangeable with a rear setback measured from the rear boundary. Córdoba's UAD-1/UAD-2 shape,
reused verbatim. `side_m: 0` is a typology statement, not an absent rule: Art. 12.9.1 defines the
zone as *ordenación adosada* and Art. 12.9.4.8 legislates the **consequence** (runs capped at 50 m,
gaps of twice the public-lindero separation) — a zone that regulates the length of its party-wall
terraces has party walls at zero separation.

### CTP — Colonia y Edificación Tradicional Popular (Cap. X, Arts. 12.10.1–12.10.6)

| Code | FAR | Coverage | Front | Side | Rear | Depth | Height |
|---|---|---|---|---|---|---|---|
| `CTP-1` | 1.80 | 80 % (PA) | 0 (alineación obligatoria) | 0 (medianera) | — | **15 m** | PB+1, 7.50 m |
| `CTP-2` | 2.60 | 80 % (PA) | 0 | 0 | — | **15 m** | PB+2, 11.00 m |

The cleanest alignment zone in the pack. ⚠ **front 0 + side 0 + rear null is only safe because the
15 m depth band exists** — without it this triple insets by 0 on every edge and draws the whole
parcel (L-616 mechanism A). A dedicated test pins exactly that. Coverage packs the *plantas altas*
80 % (Art. 12.10.3.5) rather than the ground floor's 100 % — the under-stating direction, on Córdoba
CTP-1's convention.

---

## 5. What refuses, and why — 29 zones across 9 mechanisms

Each refusal ships `geometricRule: { kind: 'explicit-area', ringRef }` plus whatever **real,
unconditional scalars its chapter does state**, so the refusal is as informative as the law allows.

| Ring | Zones | The unresolved mechanism |
|---|---|---|
| `MALAGA_MC_FONDO_UNRESOLVED_RING` | `MC` | Art. 12.5.2.4 — depth is expressly **"se entenderá LIBRE"** where no interior alignment is drawn, capped only by 12.5.2.5 occupation (PB 100 % / PA 75 %) with three parcel-dimension exceptions. Front 0 + side 0 + free depth = whole parcel. Height (12.5.3.1) is per-plano with a per-street-width fallback table needing measured road geometry. *Packed anyway*: coverage 0.75. |
| `MALAGA_OA_SEPARACION_UNRESOLVED_RING` | `OA-1` `OA-2` | Art. 12.6.3.4.1 measures the front constraint to the **road AXIS** (*eje del vial*), not the boundary — unconvertible without half-width (§MURCIA-PGOU-EJES). Side = H/4 (12.6.3.4.2). OA-2 states **no FAR at all** (12.6.4.2) and its 90 % occupation applies to a **graphic footprint, not the parcel** (12.6.4.3) — a denominator substitution (C63), so not packed. *Packed anyway*: OA-1 FAR 2.20, coverage 0.65. |
| `MALAGA_CJ_LINDEROS_UNRESOLVED_RING` | `CJ-1` `CJ-1A` `CJ-2` `CJ-2A` `CJ-3` `CJ-4` | Art. 12.7.3.5 — side/rear = **½ the height at each point**, min 3 m: a sloping envelope, not a flat inset. ⚠ **Unlike Sevilla's CJ the FRONT here IS resolvable** — Art. 12.7.3.4 tabulates it against height and Art. 12.7.3.3 fixes each subzone's own height, so the two tables *compose* to one flat figure per subzone (3/3/4/3/4/5 m). That is a lookup, not a construction. *Packed anyway*: FAR, coverage, height, front. |
| `MALAGA_CH_PEPRI_UNRESOLVED_RING` | `C-1` `C-2` `C-3` `C-4` | Art. 12.4.1 declares each subzone's own plan **"expresamente vigente"** (PEPRI Centro / PERI-C.2 / PERI Trinidad-Perchel / PEPRI Perchel Sur); Título XII only *substitutes* named articles, and 12.4.3 expressly leaves the per-street height listings **inside the PEPRI**. Four instruments PRYZM does not hold — and the municipality's own PEPRI Centro GIS viewer is independently offline. |
| `MALAGA_EP_CATALOGO_UNRESOLVED_RING` | `EP` | Cap. III is a **per-building** protection regime, not a zone ordinance. No zone-wide number exists to transcribe. |
| `MALAGA_PROD_SEPARACION_UNRESOLVED_RING` | `PROD-1A` `PROD-1B` `PROD-2` `PROD-3A` `PROD-3B` `PROD-4` `PROD-4B` `PROD-5` | Eight subzones, eight different conditionals: parking-standard-subordinated retranqueo (12.11.4.5); Estudio de Detalle (12.11.4.1.2, 12.11.6); **road-class branch** 5 m local / 10 m estructurante (12.11.5.5.2); H/2 laterals (12.11.7.5); a **container for three IND types with different numbers** (12.11.8.1.5); and PROD-5 expressly **borrowing other zones' ordinances** (12.11.9.2). *Packed anyway*: PROD-1A/1B/2/3B FAR, coverage, height. |
| `MALAGA_TERCIARIO_CLASE_SUELO_UNRESOLVED_RING` | `CO` `GSM` | **Land-class-branched.** In suelo urbano consolidado the parameters are literally *"los mismos que los de las ordenanzas de las parcelas colindantes"* (12.12.2.1 / 12.15.2.1). In urbanizable / urbano no consolidado a *complete flat triple* IS stated (12.12.2.2: FAR 1, PB 70 %/PA 50 %, 9 m, 5 m setbacks; 12.15.2.2: FAR 0.85/0.70, 80 %/60 %, 12 m, 5 m). **Both cited, neither packed** — packing the urbanizable branch would apply it to consolidated urban parcels, the majority case in the core. |
| `MALAGA_HOTEL_SIN_TIPIFICACION_RING` | `H` | **The ordinance itself declines.** Art. 12.13.2, verbatim: *"no es posible una tipificación de los diversos parámetros edificatorios que los definen."* PRYZM is not failing to find a number; the plan declines to set one. |
| `MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING` | `E` `S` `D` `SC` | Art. 12.14.2.2 — parameters are *"las condiciones edificatorias de la zona en que se encuentren"*, and the only stated figures (0.50 / 1 m²t/m²s) *"prevalecerán **como mínimos**"*. **Packing a stated MINIMUM into `plotRatioFAR` — a maximum slot — would invert the constraint's direction**, strictly worse than null. |

### One honest gap, recorded rather than smoothed over

`EP` takes a **different engine path** from the other 28 refusals. `ZoningRulesEngine`'s `anyResolved`
gate (`src/ZoningRulesEngine.ts` ~L210) only proceeds past `status:'none'` if a numeric field
resolved *or* a `permittedUse` was declared. `EP` declares **neither**, deliberately — so it returns
`status:'none'` (no envelope at all, a *stronger* refusal than `degenerate`) but **its
`explicit-area` caveat is never emitted**, so a consumer would see "no envelope" without the cited
reason the other 28 carry. The ring is still declared and greppable. Pinned by its own test block
with this trade-off written into the test's comment.

---

## 6. Test results

New file `packages/site-parcel-data/__tests__/esMalagaEnvelope.test.ts` — **250 tests**, all passing:

- Gate: `MALAGA_ENVELOPE_VERIFIED === false`; refusal is `legallyGrounded: false`, `ordinanceRef: null`.
- Universe: all 38 codes pinned as a sorted list; list proven **derived** from the pack, not re-typed;
  9 real-footprint codes pinned separately and also derived.
- Citation totality: **every** zone cites a Título XII article number **and** the Feb-2018 source PDF.
- UAS ×5 (parametrized): exact FAR / coverage / uniform setback / height, **and** a real solve whose
  inset area equals `(30−2s)(40−2s)` — proving a genuine computation, not a stub.
- UAD ×2: exact `alignment` rule object; depth band proven to **actually bind** on a 40 m parcel
  (result strictly smaller than a rear-setback-only solve).
- CTP ×2: footprint equals `30 × 15` m² exactly; explicit L-616 test that 0/0/null is only safe
  because the band exists.
- 29 refusals (parametrized): correct ring, zero area, refuses regardless of edge classification.
- 28 of them additionally proven `degenerate` **and** surfacing the explicit-area caveat; `EP` pinned
  separately as the `none` path.
- Per-mechanism invariants: MC free-depth, OA road-axis, CJ two-table composition, CH PEPRI
  delegation, H self-declining, Equipamiento minima-not-maxima, CO/GSM dual-branch, PROD ×4.
- **Global L-616 totality**: every one of the 38 codes, plus an unknown code, proven never to yield
  the full parcel area.

| Suite | Result |
|---|---|
| `esMalagaEnvelope.test.ts` (new) | **250 / 250 pass** |
| `packages/site-parcel-data` full suite | **3094 / 3094 pass, 150 files** (was 3093/150 before this pass, +250 new −249 … see note) |
| Root `npx tsc --skipLibCheck --noEmit` | clean |

> **Note on the count**: the pre-existing suite was 3093 passing / 149 files at the start of this
> pass *with one failure* in `packPublishedConfidenceUnchanged.test.ts` — that test is a **totality
> guard** asserting every rulepack file declaring a `defaultConfidence` is pinned in its frozen
> manifest, and the new Málaga pack correctly tripped it (24 files vs 23 manifest entries). Fixed by
> adding the `esMalaga` manifest entry pinned at `estimated-ruleset` (never the OCR bottom tier —
> the PDFs are natively text-extractable — and never higher). This is the guard working as designed.

---

## 7. What is still blocked

| Item | Type | Smallest unlock |
|---|---|---|
| **Zone identity** — `muralPGOU:POLCALIF_T` Oracle account lock | External / operational | A human contacts Ayuntamiento de Málaga or its GIS operator. Not engineering-solvable; three passes have now exhausted the alternate-source search space. |
| `resolveMalagaZone.ts` | Engineering, **gated on the above** | ~½ day once the layer answers. The pack is already authored, so this is the only remaining code. |
| Alignment provider (`muralPGOU:LINALIN_T`) | Engineering, gated on the above | Málaga remains the best candidate to seed a real alignment provider — the only published municipal alignment layer in Andalucía. |
| `MALAGA_ENVELOPE_VERIFIED` signature | **Founder-only (L-449)** | Not an implementer's act. ⚠ Doubly gated: a signature today would publish nothing (no resolver), which makes it *safe* to leave but **not safe to flip casually** — it would silently authorise publication the moment a resolver lands, without a second review. |
| MC per-street-width height | Engineering | Córdoba solved the analogous table from measured Catastro block geometry (ADR-0287). That machinery exists but is **not wired here**; wiring a sign-gated pack to a PRYZM-*constructed* rectangle is a separate, considered decision this pass did not make. |
| CH / C-1…C-4 | Research | Four subordinate instruments (PEPRI Centro, PERI-C.2, PERI Trinidad-Perchel, PEPRI Perchel Sur) would each need transcription — and their geometry is unreachable regardless (viewer offline). |
| `EP` refusal does not surface its reason | Engineering, small | Either give the engine a path that reaches the footprint stage with zero declared fields, or accept `none` as a terminal refusal that carries its own citation. |

---

## 8. Comparison

| City | Ordinance transcribed | Zone identity live | Dispatch | Gate |
|---|---|---|---|---|
| **Sevilla** | 15/15 zones | ✅ ArcGIS layer 25 | wired | **signed** 2026-08-05 |
| **Córdoba** | yes | ✅ third-party GIS | wired | `false` |
| **Málaga (this pass)** | ✅ **38/38 zones, 9 real footprints** | ❌ **Oracle-locked** | none possible | `false` |
| **Granada** | none | ❌ | none | `false` |

Málaga's readiness is no longer limited by *research*. It is limited by **one third party's database
account**.

---

## 9. Documento B — "Planos" (investigated 2026-08-05, second pass)

> **Scope**: investigation only. No code was touched, no resolver written, no georeferencing or
> vectorisation attempted. The raster/vector classification feasibility work — the analogue of
> Córdoba's `RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md` — is deliberately **not** done here.
> **Corpus added**: `findings/corpus/planos/P.2.1_Calificacion/` (all 35 sheets + index),
> `…/P.2.2_Calificacion_PEPRI_Centro/` (3 sheets + index),
> `…/P.2.9_Alineaciones_Alturas_Rasantes/` (3 sample sheets + index),
> `findings/corpus/DocumentoD_Catalogos/` (2 samples).

### 9.1 What Documento B actually is

§3 closed every *live service* route. Documento B is the **paper** route, and it had never been
opened. Fetched live and enumerated from the raw HTML of
`https://www.malaga.eu/recursos/urbanismo/pgou_ap2/pgou2011ad1.html` (1,119,340 B, 4,172 links):

| Documento | PDF links |
|---|---|
| B. Planos | **1,860** |
| C. Normativa, ordenanzas y fichas | 1,660 |
| I. Anejos | 340 |
| D. Los catálogos | 94 |
| F / A / E / H / G | 60 / 58 / 58 / 36 / 2 |

**Every one of the 1,860 is a PDF. There is no WFS, WMS, ArcGIS REST, GeoJSON, SHP, DWG or DGN
download anywhere in the tree.** Documento B splits into `1. Planos de Informacion` (782) and
`2. Planos de Propuesta` (1,078). Only the *Propuesta* half is normative.

⚠ **The corpus already held part of Documento B and it was the wrong half.** The pre-existing
`findings/corpus/planos/` subfolders (`Alturas`, `Uso_del_Suelo`, `Red_Viaria`, `SuelosYTipos`, …,
fetched 06:52–07:44 today) are all `I_*` sheets — **Planos de *Información***. Descriptive survey,
not ordinance. This is the same Documento-A-shaped mistake §1 caught, one document later.

> 🚩 **`corpus/planos/Alturas/` is a fabrication trap.** It is `I.3.3 Alturas de la edificación`,
> **1/32.000**, footed *"Documento de Aprobación Provisional, JUNIO 2010"* — a **surveyed existing**
> storey-count survey (legend: *solar, B–B+1, B+2–B+3, B+4–B+6, B+7–B+9, >B+10*). Reading it as a
> normative height permission is exactly the §GETCAPABILITIES-IS-NOT-AN-INVENTORY / L-616 error the
> `ALTEDIFICA` field was rejected for in §3. The **normative** height plan is `P.2.9` (§9.5), a
> different document at 1/2.000. They must never be conflated.

### 9.2 P.2.1 "Calificación, Usos y Sistemas" — the zoning map exists

`…/Documento B. Planos/2. Planos de Propuesta/P.2 Ordenacion general/P.2.1/`

**35 sheets (`P_2_1_01.pdf` … `P_2_1_35.pdf`) + `grafico de distribucion de hojas.pdf`.** All 36
downloaded live (HTTP 200, 75 MB). Titleblock verified visually on sheet 24:

> Ayuntamiento de Málaga · **Aprobación Definitiva · Documento de Subsanación de Deficiencias** ·
> Planos de Ordenación · Ordenación General · **P.2.1 Calificación, Usos y Sistemas** ·
> FECHA **MARZO 2011** · ESCALA **1 / 5.000** · HOJA **24/35**

The sheet index is a **regular rectangular grid** of 35 tiles covering the whole municipality, with
the current sheet boxed on each sheet's own index thumbnail.

### 9.3 Raster or vector? — **hybrid, and CAD-derived**

Answering point 3 of the brief first, because it changes the rest. **File metadata, not appearance:**

```
P_2_1_01.pdf  creator: MicroStation 8.11.7.446 de Bentley Systems Incorporated
P_2_1_20.pdf  title: P_2_1_20.dgn   author: Bentley Systems, Inc.   creator: MicroStation 8.5.2.35
P_2_1_24.pdf  title: P_2_1_24.dgn   creator: MicroStation 8.5.2.35
```

These are **exports from MicroStation `.dgn` CAD files**. A vector master therefore exists inside the
Gerencia — a fact worth knowing for any future data request, even though it is not published.

What was *published*, per content-stream operator census on sheet 24:

| Operator | Count | Meaning |
|---|---|---|
| `Tj` | **7,255** | text-show — real, selectable, coordinate-addressable text |
| `Do` | 47 | image draws |
| `S` / `l` | 55 / 2 | strokes / linetos — **essentially no vector linework** |

- **Graphics = raster.** 47 `DCTDecode` (JPEG) tiles, 76,979,456 px total. The dominant tile is
  **9,664 × 6,768 px at exactly 300 dpi**, covering 2,319 × 1,624 pt (818 × 573 mm) — the whole map
  frame. At 1:5.000, 300 dpi ⇒ **0.42 m per pixel on the ground.** That is far better than a scan:
  it is a clean 300 dpi *export*, not a digitised sheet.
- **Zone labels = vector text.** The subzone codes are live text at known page coordinates —
  `CTP-1`, `OA-1`, `UAS-3`, `CJ-2` extract directly with no OCR.

So P.2.1 is **not** Córdoba's 49-CUS-sheet situation. It is strictly easier: colour-fill raster
classification for the *family*, plus zero-OCR text extraction for the *subzone digit*.

### 9.4 Georeferenceability — **P.2.1 has NO coordinate grid**

Checked, not assumed. Across all 35 sheets, tokens matching `\d{6,7}`: **1** (`120120`, a stray
label). The map frame corners were rendered at 4× and inspected — a **plain frame, no tick marks, no
grid crosses, no UTM callouts**. The only scale reference is a graphic scale bar (0–200 m).

**Consequence:** P.2.1 needs **ground-control-point registration** — it cannot be georeferenced from
its own content. Mitigants: a regular 35-tile index grid, a fixed 1:5.000 scale, and a base
cartography layer (contours, buildings, street names) that is matchable against Catastro.

### 9.5 🎯 P.2.9 "Alineaciones, Alturas y Rasantes" — fully vector **and self-georeferencing**

Not asked for, found while cross-checking, and materially more valuable than P.2.1 on two of the
open blockers. **114 sheets + index**, named `<row 01–17>.<col A–M>.pdf`. Three sampled live.

| Property | Value |
|---|---|
| Scale | **1 / 2.000** |
| Images | **0** |
| Vector paths | **49,799 / 73,110 / 84,886** (sheets 09.F / 10.G / 11.H) |
| Sheet size | 3,237 × 1,704 pt (~1,142 × 601 mm) |
| Content | Alineaciones · **Altura de la edificación en número de plantas incluida la baja** · Ordenanza particular |

**It carries a UTM coordinate grid as extractable text**, 17 labels per sheet:

```
11.H.pdf   easting  372000 @ x=302pt … 374000 @ x=3136pt   (every 200 m)
           northing 4066000 @ y=1485pt … 4067000 @ y=68pt
10.G.pdf   370000…372000 / 4065000…4066000
09.F.pdf   368000…370000 / 4064000…4065000
```

Affine verified: **283.4 pt between 200 m ticks = 99.98 mm = 1:2.000 exactly.** The sheet grid is
perfectly regular — **column letter ⇒ +2.000 m easting, row number ⇒ +1.000 m northing** — so the
transform for all 114 sheets is derivable from each sheet's own text with **zero GCP work**.
⚠ The datum is *not* stated on the sheet: UTM zone 30N is certain from the magnitudes, but **ED50
(EPSG:23030) vs ETRS89 (EPSG:25830) is unresolved** and they differ by ~100 m here — that must be
pinned before any use, per §MURCIA-PGOU-EJES (never measure after a lossy reprojection).

Its legend, read at 3×, is **three grey tones only**: `MANZANA CERRADA (MC)`,
`ORDENACION ABIERTA (OA-2)`, `OTRAS ORDENANZAS` — plus storey counts annotated three ways (*en el
tramo de calle* / *en el tramo de fachada de la manzana* / *en la manzana*). Code tokens `MC` and
`OA-2` appear exactly 3× across 3 sheets = **legend only**. So P.2.9 gives a **3-way** ordinance
split, not the 38 codes — it is **not** a zone-identity source. But it is the direct answer to two
blockers in §7:

- **MC per-street-width height** — P.2.9 states the storey count *per street segment*, which is what
  Art. 12.5.3.1's per-plano listing refers to. This is the *published* table, not a PRYZM-constructed
  rectangle, so it avoids the ADR-0287 concern §7 flagged.
- **OA road-axis alignment** — `alineaciones` are drawn here as vector geometry.

### 9.6 P.2.2 "Calificación PEPRI Centro" — fully vector, but only delimits the ámbito

3 sheets + index, **1/2.000, MARZO 2011, zero images, up to 43,034 vector paths and 3,990 filled
paths**. Its `CALIFICACIONES` legend has **exactly one** entry — `PEPRI — CIUDAD HISTÓRICA - Centro`
— plus `HOTELERO`, dotaciones `E`/`S`/`D`, and protection overlays. It **delimits the PAM-PEPRI
Centro ámbito; it does not carry the PEPRI's own internal ordenanza zoning.** No coordinate grid
(0 UTM tokens). **C-1…C-4 therefore remain unresolved**, exactly as §5 recorded.

### 9.7 🚩 Legend cross-check against the 38 transcribed codes — **it does NOT line up**

Flagging loudly, as the brief required. Method: full text of all 35 sheets, regex tolerant of both
hyphen and space (`C-2`, `C 2`, `C2` all match). The legend contributes ≤1 hit per sheet, so a count
of 35/35 sheets is *legend-only* and a count well above 35 is a genuine map label.

**P.2.1's legend is family-level.** Colour encodes the family (`MC`, `OA`, `CJ`, `CTP`, `UAS`, `UAD`,
`H`, `PROD`, `PROD-4`, `PROD-5`, `CO`, `PEPRI`, `C2`, `C3`); the **subzone digit lives only in the
map-body text label**.

**Resolvable from P.2.1 — 23 codes** (counts = total / sheets):

`MC` 83/35 · `OA-1` 143/8 · `OA-2` 130/9 · `CJ-1` 10/3 · `CJ-2` 17/5 · `CJ-3` 22/5 · `CJ-4` 10/6 ·
`UAS-1` 28/8 · `UAS-2` 25/9 · `UAS-3` 12/5 · `UAS-4` 21/6 · `UAS-5` 5/3 · `UAD-1` 17/8 ·
`CTP-1` 172/35 · `CTP-2` 28/8 · `PROD-4` 60/35 · `CO` 105/35 · `H` 51/35 · `E` 311/35 · `S` 333/35 ·
`D` 98/35. (`UAD-2` 3/3 and `PROD-5` 35/35 are marginal — present but barely, or legend-only.)

**NOT resolvable from P.2.1 — 13 of the 38 codes appear NOWHERE, legend or map:**

| Code(s) | Finding |
|---|---|
| `C-1` | **Notation mismatch.** The plan writes the PEPRI Centro zone as **`PEPRI`**, never `C-1`. |
| `C-2` `C-3` | **Notation mismatch.** Plan writes **`C2` `C3`** (no hyphen), and only in the legend — Ciudad Histórica polygons carry **no map-body text label at all**, they are identified by fill colour alone. |
| `C-4` | **Absent entirely.** *PEPRI Perchel Sur has no legend entry and no map label on any of the 35 sheets.* A zone the pack declares has no graphic representation in the plan's own zoning map. |
| `CJ-1A` `CJ-2A` | **Absent.** P.2.1 labels only `CJ-1`…`CJ-4`. The `A` variants are invisible to it. |
| `PROD-1A` `PROD-1B` `PROD-2` `PROD-3A` `PROD-3B` | **Absent, and structurally so** — the legend groups them under a *single* colour reading **`PROD` / "PRODUCTIVO 1/2/3"**. The plan **does not graphically distinguish** these five. |
| `PROD-4B` | **Absent.** Only `PROD-4` is drawn. |
| `SC` `GSM` | **Absent.** `GSM` — the code §2 noted Art. 12.1.1 omits — has no graphic representation either. |
| `EP` | **Absent as a calificación** — it appears instead as **`PROTECCIÓN ARQUITECTÓNICA` under `DETERMINACIONES COMPLEMENTARIAS`**, i.e. a per-building **overlay symbol**, not a zone fill. ✅ This independently **confirms** §5's reasoning for `MALAGA_EP_CATALOGO_UNRESOLVED_RING`. |

> **Honest reading of the mismatch.** Absence from P.2.1 does *not* prove a code is not in force —
> it may be carried by a subordinate instrument (the PEPRIs for `C-*`) or by a ficha rather than the
> citywide map. What it *does* prove is that **P.2.1 alone cannot resolve those 13**, and that the
> §2 warning — *"a code in force on the ground yet absent from Documento C would be invisible…and no
> live-service cross-check is available to catch that"* — now has its **converse** on record: codes
> present in Documento C that Documento B never draws. The two documents are **not** in bijection.
> Neither is wrong; they are different instruments at different resolutions.
>
> Usefully, the 13 unresolvable codes are **almost entirely already-refused zones** (`C-*`, `EP`,
> `PROD-*`, `GSM`, `SC` are all in §5's 29). The only additional losses are `CJ-1A` and `CJ-2A`, both
> already refused under `MALAGA_CJ_LINDEROS_UNRESOLVED_RING`. **All 9 real-footprint zones
> (`UAS-1`…`UAS-5`, `UAD-1`, `UAD-2`, `CTP-1`, `CTP-2`) are present as map labels** — `UAD-2` only
> weakly (3 sheets) — so the ceiling on *dispatchable* coverage is unaffected by the mismatch.

### 9.8 Is the 2011 Documento B current? — checked, and yes, with caveats

Documento C had a binding FEB-2018 consolidation (§1), so this was checked rather than assumed.
**There is no 2018 (or any post-2011) consolidation of Documento B.**

- `urbanismo.malaga.eu/…/pgou-2011-aprobado/` offers exactly two links, and its *"Visualización del
  Plan"* points **back to `…/pgou_ap2/PGOU2011AD1.html`** — the same 2011 AD1 tree used here. That
  is the in-force plano set.
- `…/modificaciones-al-plan/` lists **13 modificaciones (≈2012–2014)** as individual PDFs, several of
  which **do alter calificación locally** (e.g. *"Calificaciones en SGIT viario en C/ Centaurea"*,
  *"Modificación de zona verde por equipamiento en La Araña"*). So the 2011 sheets are
  **current but not consolidated** — a production pipeline would have to overlay all 13.
- ⚠ **Wrong-URL trap, recorded so nobody walks into it:**
  `urbanismo.malaga.eu/plan-general-de-ordenacion/documentos-de-tramite-pgou-2011/aprobacion-provisional-pgou-2008/documento-b.-planos-del-plan-general/`
  is a page literally titled *"Documento B. Planos del Plan General"* — but it is the **2008
  Aprobación Provisional**, i.e. *superseded*, three years older than the AD1 set. Search engines
  surface it above the real one.
- ⚠ A second live-verified trap: Documento D's hrefs on the index page **omit the `pgou_ad1/`
  path segment** that Documento B's carry. Building a Documento D URL by analogy with Documento B
  returns **HTTP 404** — observed, then corrected. Both base paths are recorded in §9.10.

### 9.9 Documento D "Los catálogos" — secondary, and it closes `EP` rather than `CH`

47 PDFs in three catalogues: **Catálogo de edificaciones protegidas** (292 pp., per-building fichas
grouped into zones A–N), **Catálogo de jardines protegidos** (14 gardens), **Catálogo de protección
arqueológica** (92 yacimientos). Natively text-extractable. A ficha sampled live reads:

> `Zona LIMONAR-MALAGUETA` · `Dirección CAMINO SANTA PAULA, 6` · `Referencia A01` ·
> `Grado de Protección ARQUITECTÓNICA-I` · DESCRIPCIÓN / SITUACIÓN / FOTOGRAFÍA

**Address-keyed, protection-grade only — no FAR, no height, no setback, no zone-wide parameter.**
This is a **positive confirmation** of §5's `EP` refusal: Cap. III really is a per-building regime
with nothing to transcribe, and §9.7 independently showed `EP` is drawn as an overlay symbol rather
than a zone fill. Relevant to **1** of the 29 refused zones (`EP`), plus arqueológica as an overlay.
It contains **none** of the four `CH` instruments (PEPRI Centro, PERI-C.2, PERI Trinidad-Perchel,
PEPRI Perchel Sur) — **`C-1`…`C-4` stay blocked**. ⚠ Provenance caveat: the fichas are footed
*"Aprobación Provisional. Junio 2010"*, an earlier stage than the AD1 2011 tree that serves them.

### 9.10 Verified URL base paths

```
index          https://www.malaga.eu/recursos/urbanismo/pgou_ap2/pgou2011ad1.html
Documento B    https://www.malaga.eu/recursos/urbanismo/pgou_ap2/pgou_ad1/Documento%20B.%20Planos/…
Documento D    https://www.malaga.eu/recursos/urbanismo/pgou_ap2/Documento%20D.%20Los%20catalogos/…
                                                              ^^^ NO pgou_ad1/ segment — 404 if added
P.2.1  …/2.%20Planos%20de%20Propuesta/P.2%20Ordenacion%20general/P.2.1/P_2_1_NN.pdf   (NN=01..35)
P.2.2  …/P.2%20Ordenacion%20general/P.2.2/P_2_2_0N.pdf                                (N=1..3)
P.2.9  …/P.2%20Ordenacion%20general/P.2.9/RR.C.pdf                     (RR=01..17, C=A..M, 114 sheets)
```

### 9.11 Verdict

> ✅ **Plausible path — worth a full feasibility study, and on better terms than Córdoba got.**
>
> Málaga's zone identity is **not** unobtainable; it is **unobtainable *as a service***. §3's
> conclusion ("limited by one third party's database account") is now too pessimistic: the same
> information is published as **P.2.1, 35 sheets at 1:5.000, MicroStation-derived, 300 dpi
> (0.42 m/px) colour raster with the subzone codes as OCR-free extractable vector text**. The single
> hard cost is **GCP georeferencing** — P.2.1 carries no coordinate grid — and that cost is
> **partly pre-paid by P.2.9**, which is fully vector, at 1:2.000, and **self-georeferencing from its
> own UTM tick labels**, giving a registered municipal reference frame to register P.2.1 against.
>
> Two findings must be carried into that study rather than discovered inside it: **(a)** the legend
> resolves only ~23 of the 38 codes and **structurally cannot** separate `PROD-1A/1B/2/3A/3B`,
> `CJ-1A/2A`, `SC`, `GSM` or `C-1`…`C-4` — though all **9 real-footprint zones are resolvable**, so
> the ceiling on *dispatchable* coverage is unaffected; and **(b)** the 2011 sheets are current but
> **not consolidated** — 13 modificaciones (2012–2014) sit on top and some move calificación.
>
> Not a dead end. The remaining blocker in §7 should be re-read as *"zone identity requires a
> raster-georeferencing pipeline"*, not *"zone identity is unavailable"*.

---

## 10. Documento C.3 — "Fichas de ámbitos de planeamiento de desarrollo y gestión" (investigated 2026-08-05, third pass)

> **Scope**: read-and-report scoping check only. **No code, rule pack or data file was modified.**
> The question asked was narrow: does C.3 hand `PROD` — or any other refused zone — concrete flat
> buildable parameters that would let §5's refusals be narrowed?
> **Corpus added**: `findings/corpus/FichasAmbitos/` — 25 curated PDFs + `LINK-INVENTORY-823-fichas.txt`.

### 10.1 The document exists, was never held, and is now fetched

C.3 is a **sibling of C.1/C.2 inside the same 2011 `pgou_ad1` tree**, not a separate publication —
so §1's "Documento C" fetch had opened only branches 1 and 2 of three. Enumerated live from the same
index (`pgou2011ad1.html`, re-fetched this pass, **1,119,340 B — byte-identical to §9.1**):

```
…/pgou_ad1/Documento C. Normativa, ordenanzas y fichas/
   1. Normas urbanisticas. Disposiciones generales/     ← §1 (C.1)
   2.  Normas urbanisticas. Ordenanzas/                 ← §1 (C.2, Título XII et al.)
   3. Fichas de ambitos de planeamiento de desarrollo y gestion/   ← THIS SECTION
```

⚠ **Unlike C.1/C.2 there is no FEB-2018 consolidation of C.3.** Checked the same way: the Feb-2018
gallery at `urbanismo.malaga.eu/…/documento-c.-2018/` publishes **only** the Normas/Ordenanzas
títulos. The fichas exist solely in the 2011 AD1 tree. Same standing as Documento B (§9.8): current
but unconsolidated.

**823 ficha PDFs**, in two families:

| Family | Folder | Count | Nature |
|---|---|---|---|
| **Planeamiento Aprobado** | `1 .PA 1983` / `2. PAM 1983` / `3. PA 1997` / `4. PAM 1997` | 147 / 33 / 147 / 42 | ámbitos whose development instrument is **already approved and executed** |
| **Planeamiento Desarrollo SUC_SUNC** | `1. SUC` … `9. SUNC` | 353 | ámbitos **remitted to a future instrument** (PP / PE / ED) |

**430 of 446** targeted PDFs downloaded (HTTP 200); **16 hrefs on the index are dead links on the
municipality's own server** (e.g. `PA-CH.11 (97).pdf`, `PA-PT.12 (97).pdf` → 404). All 430 are
**natively text-extractable** — `pdftotext -enc UTF-8 -layout`, zero needing OCR.

### 10.2 The answer to brief question 1 — **No. Not one ficha states a parcel-level parameter.**

This is the load-bearing finding, and it is quantified across all 430, not sampled:

| Parameter a rule pack needs | Fichas stating it |
|---|---|
| `ocupación máxima` (coverage) | **0** |
| `edificabilidad neta` (parcel FAR) | **0** |
| `fondo edificable` (buildable depth) | **0** |
| `retranqueo` / lindero separation as a **figure** | **0** (5 files use the word, all in prose — *"tipologías que permitan el retranqueo respecto del viario"* — none give a number) |
| `parcela mínima` | 2 |
| `altura máxima` (storeys or metres) | 68 |
| `Ie` (ámbito-level m²t/m²s) | **413** |

The fichas are **land-accounting instruments, not ordinances**. What a PA ficha actually carries
(`PA-CA.1 (83) M`, verbatim):

```
1.- Ordenanza de aplicación: UAD (PB+1)
2.- Cesiones: Verde/Deportivo 25.038,00 m2s · Viario 2.956,00 m2s
3.- Superficie del ámbito: 33.621,00 m2s
4.- Ie: 0,17 m2s/m2t          5.- Edificabilidad Total: 5.613,00 m2t
```

`Ie` here is a **gross ámbito index** — total floorspace ÷ whole ámbito area *including viario and
cesiones*. It is **not** `plotRatioFAR` and packing it as one would be a **C63 denominator
substitution** (score against buildable land, not gross land) of exactly the kind §5 already refused
for `OA-2`'s graphic-footprint 90 %.

The per-parcel geometry is **always** delegated onward, in one of two directions:

- **Backwards to Título XII** — *"Ordenanza de aplicación: UAD-1"*. That ordinance is already
  transcribed in the pack. The ficha adds **nothing numeric**.
- **Forwards to a further instrument** — `SUNC-O-CA.1` is the sharpest case. It looks like it
  resolves (it is `Ordenación Pormenorizada Potestativa`, i.e. the PGOU did exercise its option) but
  reads: *"Los parámetros de referencia para la edificación son los de la ordenanza **CTP-1**, si bien
  la edificabilidad neta y la ocupación por parcela **serán la resultante del techo máximo permitido
  en la ordenación propuesta**"* — the two parameters PRYZM needs are handed to a **graphic**
  ordenación, and *"Mediante Estudio de Detalle se definirán las alineaciones interiores"*.

**347 of 430 are stamped `Ordenación Pormenorizada Completa`** — i.e. the brief's "already
complete/consolidated" category is not rare, it is the majority. **Being complete still yields no
flat parameter**, because completeness here means *the land accounting closed*, not *the envelope
was written down*.

### 10.3 Brief question 2 — nothing to cite, with one honest partial exception

No ficha is citable as packable envelope data. The nearest misses, recorded so they are not
re-discovered as leads:

- `PA-LE.3 (97)`: *"3.- Ordenanza: MC · 4.- **Altura máxima desde rasante acera: 16 m**"* — a real,
  flat, unconditional height. But it is **per-ámbito**, keyed to an ámbito whose geometry is behind
  the same locked `POLCALIF_T` (§3), and it constrains height only — MC's blocker is **free depth**,
  not height. 68 fichas carry such a height; none carries a footprint.
- `SUS-G.1`: *"La parcela mínima de las zonas empresarial y comercial será de **1.000 m2s**"* —
  a minimum parcel size, not an envelope parameter.

### 10.4 Brief question 1, PROD specifically — the fichas *disambiguate*, they do not *quantify*

This is the one place C.3 genuinely touches §5's PROD refusal, and it is worth stating precisely
because it is easy to overstate.

§5 recorded that `PROD-4` refuses partly because Art. 12.11.8.1.5 makes it **"a container for three
IND types with different numbers."** C.3 shows the plan resolves that container **per ámbito**:

```
GA-G.3 (97)    Ordenanza de aplicación: PRODUCTIVO-4 (IND-3).
PA-G.10 (83)   Ordenanzas de Aplicación: Productivo-4 (IND-2, IND-3) (PR)
PA-G.12 (97)   Ordenanza de aplicación: PRODUCTIVO-4 (IND-1)
PAM-G.5 (T)    Ordenanza de aplicación  Productivo-4 (IND-3, IND-4).
```

**35 fichas name a specific IND type** under Productivo-4 (IND-3 ×13, IND-1 ×4, IND-2 ×3, and 15
more that name **two or more** IND types for a single ámbito, or just *"(IND)"*). So the ambiguity is
**resolvable in principle** — but this does **not** narrow the refusal, for three independent
reasons, any one of which is sufficient:

1. **It supplies a selector, not a value.** Knowing an ámbito is IND-3 still sends you back to
   Art. 12.11.8, whose numbers §5 already found conditional. The ficha adds no FAR, coverage or setback.
2. **The selector is keyed to ámbito geometry PRYZM cannot obtain** — the same `muralPGOU:POLCALIF_T`
   Oracle lock (§3). There is no way to ask "which PA ámbito is this parcel in".
3. **15 of the 35 are themselves ambiguous** — `(IND-2, IND-3)` for one ámbito is two ordinances, not one.

`PROD-1A/1B/2/3A/3B` fare worse still. The SUS-P sector fichas — the delegated-sector territory the
brief expected to be productive — hand back only an **indicative** table. `SUS-CA.10 "Rosado Este"`,
verbatim structure:

| Column | Value |
|---|---|
| Section heading | **`ORDENACION PORMENORIZADA INDICATIVA`** ← non-binding by its own title |
| Ie (ordenación **estructural**, binding) | **0,3500 m²t/m²s** — gross, over 279.158,20 m²s of sector |
| Altura Máxima | B+2 (industrial) / B+1 (logístico) |
| **Tipología de Referencia** | **`PROD-1, 2`** ← two subzones at once, and *"de referencia"* |
| `INSTRUMENTO DE DESARROLLO` | **`PLAN PARCIAL`** |

A **reference** typology naming **two** subzones, inside an explicitly **indicative** table, for land
whose development instrument has **not been written**. That is the textbook shape of a genuine
delegation.

> **Verdict on PROD: the refusal is confirmed correct, and its mechanism is now better evidenced.**
> C.3 does **not** narrow any of the 8. It converts one of §5's stated mechanisms from a *reading of
> the ordinance* into a *documented fact*: the plan really does defer PROD's per-parcel numbers, and
> where it disambiguates, it disambiguates **by ámbito** — a key PRYZM cannot look up.

### 10.5 Brief question 4 — bearing on the other refused zones

- **`CH` / `C-1`…`C-4` — confirmed blocked, and now confirmed from the fichas' own mouth.** Each of
  the four PEPRI/PERI instruments has a ficha, and every one is a *delegation notice*.
  `PAM-PEPRI (83) M` (PEPRI Centro) states the PEPRI *"se declara **expresamente vigente** en su
  ámbito"* and then lists **only which of its articles Título XII substitutes** — including the
  explicit carve-out *"los artículos 7 (**excepto listado de alturas por calles**) … quedan
  sustituidos por el artículo 12.4.3"*, i.e. the per-street height list stays inside the PEPRI. That
  is §5's `MALAGA_CH_PEPRI_UNRESOLVED_RING` reasoning, verbatim, from the plan itself.
  `PA-P.13 (97)` (PEPRI Perchel Sur = `C-4`) is seven prose objectives; its `DETERMINACIONES` block
  has **`Ie` and `EDIFICABILIDAD TOTAL` literally blank**. ✅ Useful cross-link: §9.7 flagged that
  `C-4` has **no graphic representation anywhere in P.2.1**. C.3 explains why — Perchel Sur is
  carried as a **PA ámbito** (39.452,00 m²s), not as a calificación fill.
- **`MC` — unchanged.** Zero fichas state a `fondo edificable`. The 48 MC-referencing fichas name the
  ordinance and sometimes a height (§10.3); the free-depth blocker is untouched.
- **`EP` — unchanged**, and independently re-confirmed a third way: `EP` appears in **no** ficha as
  an "Ordenanza de aplicación". Consistent with §5 (per-building regime) and §9.7 (overlay symbol).
- **`CO` / `GSM` / `H` / Equipamiento — unchanged.** `CO` appears only as a co-ordinance in mixed
  ámbitos (*"MC, CO (PR)"*); `GSM` appears in **no** ficha at all.

### 10.6 🚩 New finding, unasked-for: fichas cite zone codes that are NOT in the 38

**33 fichas name `MC-1`, `MC-2`, `CJ-5`, `CJ-6` or `OA-3`** — five codes that **do not exist** in the
38-code universe §2 derived from Título XII (which stops at `CJ-4`, `OA-2`, and an unsuffixed `MC`).

> **Do not read this as "the universe is wrong."** The PA/GA fichas are stamped **`CONDICIONES PGOU
> 97`** and the índices carry paired columns *"DENOMINACIÓN PGOU 2011 | CÓDIGO PGOU 97"* — these are
> **PGOU-1997-era ordinance codes**, quoted to record what the approved instrument was granted under,
> not codes in force under the 2011 plan. The suffix `(PR)` that accompanies nearly all of them
> (152 fichas) is undefined anywhere in the corpus and should be treated as unresolved.
>
> It is recorded here because it is the **third** instance of the §2 warning's theme: Documento C's
> Título XII, Documento B's P.2.1 legend, and Documento C.3's fichas are **three different code
> vocabularies that are not in bijection**. Any future zone-identity pipeline must normalise across
> all three, and must not assume a token like `MC-1` from one document is a 2011 subzone.

### 10.7 Verified URL base paths (add to §9.10)

```
Documento C.3  https://www.malaga.eu/recursos/urbanismo/pgou_ap2/pgou_ad1/Documento%20C.%20Normativa%2C%20ordenanzas%20y%20fichas/3.%20Fichas%20de%20ambitos%20de%20planeamiento%20de%20desarrollo%20y%20gestion/…
                                                                                        ^^^ comma is %2C — literal comma 404s
  …/Planeamiento%20Aprobado/{1%20.PA%201983,2.%20PAM%201983,3.%20PA%201997,4.%20PAM%201997}/
  …/Planeamiento%20Desarrollo%20SUC_SUNC/{1.%20SUC,2.%20ED,3.%20PE,4.%20SG,5.%20FICHAS%20SL,6.%20SUS-R,7.SUS-P,8.%20SUNS,9.%20SUNC}/
```
⚠ Note the folder name irregularities the site actually uses and which must be reproduced exactly:
`1 .PA 1983` (space **before** the dot) and `7.SUS-P` (**no** space after the dot).

### 10.8 Verdict

> ❌ **C.3 does not narrow PROD's 8 refusals. It confirms all 8 are already correct as-is — and the
> same for `CH`, `MC`, `EP`, `CO`, `GSM` and Equipamiento.** A clean negative.
>
> Across **430 fichas**: **zero** state a coverage, a net FAR, a buildable depth or a numeric setback.
> They state gross ámbito accounting (`Ie`, superficie, cesiones) plus a **pointer** — either back to
> the Título XII ordinance already transcribed in §4/§5, or forward to a Plan Parcial / Estudio de
> Detalle that does not exist yet. **There is nothing in C.3 to pack.**
>
> The one substantive gain is evidentiary, not numeric: C.3 upgrades §5's `PROD` and `CH` refusal
> rationales from *ordinance interpretation* to *documented municipal fact*, and it independently
> re-confirms `EP`. The one new liability is §10.6 — a **third** non-bijective zone-code vocabulary,
> which belongs in the §9.11 feasibility study's assumptions rather than being met inside it.
