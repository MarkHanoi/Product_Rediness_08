# NEXT — Córdoba (14021, Andalucía / es-an, España)

> Where we stopped and how to resume. Convention: every claim is tiered VERIFIED-LIVE / COULD-NOT-VERIFY.
> Last updated 2026-07-23 · Maintainer: site-feasibility research · Status: **ENDPOINT CRACKED, NO PACK**.

## 1 — WHERE WE STOPPED (the one-paragraph truth)

We cracked the data-access blocker the prior pass could not: Córdoba's **calificación** is served live and
public from the COACo viewer's own GeoServer — **`https://geoserver.pgou.coacordoba.org/geoserver`**
(WFS 2.0.0 + WMS 1.3.0, both HTTP 200) — as structured polygons (`coaco:ordenanzas`, 453 features) with an
ordenanza code and a **direct ordinance-PDF link**. Two things stop a pack: (1) coverage is a **2-district
pilot** (Sur + Noroeste), not the city; (2) the ordinance PDFs are **scanned images**, so the numbers need
OCR + human verification. Separately we corrected the prior "SIU host dead" note — SIU is **alive** but only
carries **clasificación**, so the national-calificación-WMS idea is disproven.

## 2 — THE NUMBER (what %, which denominator, why)

**0% `structured` today.** Denominator = a parcel click in Córdoba (INE 14021). Structured-capable clicks =
parcels inside the **Sur + Noroeste** pilot (2 of ~10 districts), and even those are `estimated-ruleset`,
not `structured`, until the scanned ordinance PDFs are OCR'd and human-verified. Everywhere else, only SIU
**clasificación** resolves (land class, no envelope). Exact parcel fraction of the 2 pilot districts is
**not yet measured** — needs a Catastro-parcel count per district (see §8).

## 3 — BLOCKERS (each: what · why · unblock · exact resume step)

1. **Scanned ordinance PDFs.** The 15 `O_*.pdf` at `visor.pgou.coacordoba.org/doc/ordenanzas/` have no text
   layer (`pdftotext` → 3 chars). *Blocks* the numeric extraction that any `structured` pack needs.
   *Unblock:* OCR (they reference edificabilidad / plantas / ocupación / retranqueos / parcela mínima).
   *Resume step:* download the 15 distinct PDFs, run OCR (Tesseract `spa`), extract per-ordenanza
   parameters into `sources/SOURCES.md` rows, then send to human verification.
2. **Pilot coverage = 2 districts.** `coaco:distritos` returns only **Sur** + **Noroeste**; `coaco:ordenanzas`
   bbox ≈ 3.4×4.8 km (~1.63 km²). *Blocks* a whole-city claim. *Unblock:* wait for COACo to extend the pilot,
   OR curate the rest of the city from the PGOU PDFs via SITUA. *Resume step:* re-run
   `GetFeature&typeNames=coaco:distritos&resultType=hits` to detect when districts > 2.
3. **Catastro↔calificación positional agreement UNVERIFIED.** SIU clasificación and Catastro are two
   digitisation lineages; the COACo geometry is a third. *Unblock:* overlay a known Catastro parcel against a
   `coaco:ordenanzas` polygon and against the municipal viewer for the same plot; confirm they agree.

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **⭐ SIU calificación (Barcelona + Madrid).** If any jurisdiction agent starts hunting a *national SIU
  calificación WMS* — **STOP**. It does not exist. SIU (`mapas.fomento.gob.es/arcgis`, browser UA) serves
  **clasificación** (clase de suelo) nationally and a per-municipality **Planeamiento_Vigente registry**
  (`FiguraVigente` + `UrlLink`), **not** the ordenanza. Calificación is per-jurisdiction. Use SIU for the
  Tier-B land-class question and for the "which plan is in force + where is its document" question only.
  Evidence: `findings/CALIFICACION-ENDPOINT-PROBE.md §4`.
- **Municipal-architect-college viewers (any Spanish city).** The calificación endpoint was found by reading
  the COACo **viewer's own JS bundle**, not a public IDE catalogue. If a city's official IDE 404s, look for a
  Colegio de Arquitectos / municipal *visor urbanístico* and grep its bundle for its GeoServer/ArcGIS host.
- **Andalucía SITUA (`ws132.juntadeandalucia.es/situadifusion`).** This is the region-wide **document
  registry** (planning PDFs by municipality), the analogue of Catalonia's RPUC — **not** a calificación WMS.
  Use it for scriptable PDF discovery per INE code, not for geodata.
- **VITUA / post-2026 plans.** Andalucía plans approved **after 24 Apr 2026** publish structured spatial data
  in VITUA. For any Andalusian municipality with a *recent* plan, check VITUA first — it may already carry the
  calificación as geodata (Córdoba's 2001 plan does not).

## 5 — WHAT IS ALREADY BUILT (do not redo)

- Endpoint discovery (COACo GeoServer) — done, reproducible.
- SIU clasificación + Planeamiento_Vigente for INE 14021 — queried live, values captured.
- Layer inventory + `coaco:ordenanzas` schema + distinct calificación families + `actuaciones`
  derived-planning breakdown — done. Do not re-enumerate; extend.

## 6 — VERIFIED SOURCES (endpoint · answers · tier · exact query)

See `sources/SOURCES.md`. Headline three, all **VERIFIED-LIVE 2026-07-23**:
- COACo GeoServer `coaco:ordenanzas` — calificación polygon + code + PDF link (453 features).
- SIU L15 `OGC_Clases_Suelo` `where ProvINE='14021'` — 6 land classes, in force.
- SIU `Planeamiento_Vigente` — Plan General 2002, UrlLink → Junta SITUA.

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- National SIU **calificación** service — does not exist (26 SIU services enumerated).
- Junta SITUA `situadifusion` — document registry, no WMS.
- `datosabiertos` "Cartografía Urbana Vectorial" (urbana500/1000/2000/5000) — base cartography, not zoning.
- DERA G6 `usos_suelo` WFS — land cover, not calificación.
- VITUA — instrument-in-force per municipality; geodata only for post-24-Apr-2026 plans.

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**OCR the 15 ordinance PDFs and count pilot parcels.** (a) `curl` the 15 distinct `O_*.pdf`, Tesseract-`spa`
OCR, extract per-ordenanza {edificabilidad, nº plantas, ocupación, retranqueos, parcela mínima} into
`SOURCES.md` rows; (b) `GetFeature coaco:vcatastro_urbanismo` to count cadastral parcels inside Sur+Noroeste
→ the honest numerator. Cost: ~1 focused session for (a)+(b); then a human-verification pass to lift the
2-district pilot from `estimated-ruleset` toward `structured`. **Do not touch `registry.ts`/`index.ts`** —
any wiring is an orchestrator task, recorded as a `WIRING TODO (orchestrator)` block when a verified pack exists.
