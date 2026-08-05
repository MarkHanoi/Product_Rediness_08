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
