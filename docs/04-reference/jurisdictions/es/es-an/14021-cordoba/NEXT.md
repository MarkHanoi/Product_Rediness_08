# NEXT — Córdoba (14021, Andalucía / es-an, España)

> Where we stopped and how to resume. Convention: every claim is tiered VERIFIED-LIVE / COULD-NOT-VERIFY.
> Last updated **2026-08-01** · Maintainer: site-feasibility research ·
> Status: **PACK REGISTERED + GATED SHUT; the city is ≈ 95 % CLOSED by land, awaiting a signature.**

> ## ⚠ THREE CLAIMS IN THIS FILE WERE STALE AND ARE CORRECTED HERE (2026-08-01)
>
> Read [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md) first — it is now the file that answers
> *"what is left?"*. What this one said, and what is true:
>
> | This file said | Truth |
> |---|---|
> | **"NO PACK"** / *"UNREGISTERED … do NOT register"* / *"Do not touch `registry.ts`"* (§8) | The pack is **REGISTERED** — 13 subzones, `rulepacks/registry.ts` — and has been since `068a02ce`. The wiring was done; the **HONESTY GATE** (`CORDOBA_ENVELOPE_VERIFIED = false`) is what stops a number, not the absence of registration. |
> | **"~19 % fully numeric / ~89 % partial"** (§2, §8) | **WITHDRAWN.** That was a parcel-count census over ordenanza families, **structurally blind to DELEGATION**. Measured against the L-656 buildable-land denominator it is **≈ 16 % full / ≈ 31 % any**, of the pilot's 1.851 km². |
> | **"Whole-city ≈ 0 %"** with no denominator | Composable, and now composed: the published calificación covers **1.629 km² of Córdoba's 33.342 km² of SUELO URBANO = 4.88 %** (national SIU, INE 14021, queried 2026-08-01). Whole-city **any-envelope ceiling ≈ 1.7 %**. And ~0 % *answered* is **not** ~0 % *closed*: 95.1 % now carries a cited refusal. |
>
> ⚠ **And one defect this file never recorded, now closed:** outside the pilot PRYZM was publishing a
> **fabricated estimated envelope** (3,0/1,5/3,0 m, FAR 2,00, 50 %) on 95.1 % of the city's urban
> land. See `CLOSURE-REGISTER.md` blocker 1.

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

## 8 — WHERE THE NUMBER STANDS NOW (extraction DONE 2026-07-23)

✅ **The OCR/VISION extraction + the parcel count are DONE.** Results:
- **`findings/OCR-EXTRACTION-RESULTS.md`** — all 15 links / 12 distinct docs read (2 born-digital text,
  10 clean rasters, 2 dead links); per-family per-field value table; auto-gate flags; the pilot resolution.
- **`findings/ORDENANZA-PACK-SPEC.md`** — the pack design + what is deliberately not packed.
- **`packages/site-parcel-data/src/rulepacks/esCordobaPGOU2001.ts`** — the pack, 13 subzones,
  schema-valid, ⬆ **REGISTERED** (the "UNREGISTERED / do NOT register" note here was stale; the
  `pipeline-extracted-unverified` tier landed and the pack self-labels it). It renders **no number**
  because the dispatcher's `CORDOBA_ENVELOPE_VERIFIED` gate is shut, which is the interlock — not the
  registration.

⛔ **THE NUMBER BELOW IS WITHDRAWN — kept only so a reader who saw it elsewhere can find its
retraction.** ~~*(denominator = 5 725 Catastro parcels of the Sur+Noroeste pilot): ~19 % fully
numeric, ~89 % partial, ~11 % not extractable.*~~ It counted parcels by ordenanza family and never
asked whether a subzone could **bind**, whether a later instrument **supersedes** it, or whether the
bound subzone **renders**. **Measured properly against buildable land: ≈ 16 % full / ≈ 31 % any /
≈ 69 % correctly refused**, because **≈ 50 % of pilot buildable land is delegated** to a Plan Parcial /
Plan Especial / PERI / Estudio de Detalle and **7 of the 13 packed subzones bind zero land**. Full
derivation: [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) §SIG-1.

**Whole-city, denominator NAMED (new, 2026-08-01):** the published calificación covers **1.629 km² of
Córdoba's 33.342 km² of SUELO URBANO = 4.88 %** (national SIU `OGC_Clases_Suelo`, INE 14021), so the
municipality-wide any-envelope ceiling is **≈ 1.7 %**. ⚠ That is the *answered-with-a-number*
fraction. Under the ratified definition of CLOSED the city is **≈ 95 % closed**, because the rest now
carries an explicit cited refusal.

**Smallest next step now:** the human-verification pass on the §2 value table (Spanish-planning-literate
reviewer, ~hours) → lifts the pilot to `estimated-ruleset`. ⚠ **A signature alone renders nothing** —
the COACo subzone resolver is authored and **never called**, so it must land in the same change
(`CLOSURE-REGISTER.md` blocker 3). ⚠ **The "do not touch `registry.ts`/`index.ts`" instruction that
stood here is SPENT:** that wiring is done (`068a02ce`), and a second, refusal-only registration for
the rest of the municipality landed on 2026-08-01 (blocker 1).

Remaining research gaps (do not re-do the extraction): (a) COACo pilot coverage still 2 districts —
re-run `coaco:distritos&resultType=hits` to detect >2; (b) the MC per-street-width height table and the
CTP-1 ocupación step-function need resolvers to move MC/CTP from partial→full; (c) the Conjunto Histórico
**Tomo VI** (Campo de la Verdad envelope) and the UAS chapter are not held — source them to close those
families.
