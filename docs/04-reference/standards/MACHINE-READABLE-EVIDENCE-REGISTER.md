# MACHINE-READABLE EVIDENCE REGISTER

**Status**: BINDING (founder directive, 2026-08-02) — *"a single source of truth for what is machine-readable, what isn't, and the next concrete action."*
**Scope**: every city under active close-out. One row per dataset, not per city.
**Related**: [BLOCKER-CLASSIFICATION-STANDARD.md](./BLOCKER-CLASSIFICATION-STANDARD.md) · [PROBE-DISCIPLINE.md](./PROBE-DISCIPLINE.md) · [ADR-0283](../../02-decisions/adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) · [ADR-0284](../../02-decisions/adrs/ADR-0284-derived-geometry-permissible-derived-law-is-not.md) · [C63](../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md)

## Why this exists

> *"That register gives every engineer and reviewer a single source of truth for what is machine-readable,
> what isn't, and the next concrete action. It also prevents reopening already-closed investigations and
> keeps the project moving toward completion."* — founder, 2026-08-02

Three things went wrong this week that this register exists to stop:

- **A closed investigation reopened.** València's *profundidad edificable* was hunted as an unpublished
  dataset; it turned out to be **drawn** in Layer 212's movement geometry, which we already held.
- **A search with no stopping rule.** Córdoba's calificación hunt had no exit criterion until one was
  imposed. An open-ended search is indistinguishable from an unstarted one.
- **A dataset assessed on the wrong artefact.** Madrid's NZ-3 was judged `OBJECTID`-only from **layer 4**,
  which is a child of *Cartografía* — basemap wallpaper. The planning layers were never examined.

## Rules

1. **One row per dataset**, keyed by city + dataset, never by city alone.
2. **`Machine-readable` is measured, not assumed** — with the probe's URL, HTTP status, content-type and
   byte count recorded in the city's `findings/`. **Failure ≠ empty**: a 403 / 499 / timeout is
   `Unknown`, never `No` (L-422/457/467/469).
3. **`Status` is one of** `Use` · `Verified` · `Investigate` · `Investigating` · `External` · `Derived` ·
   `Closed`.
4. **`Action` is one concrete next step**, owned, with an exit criterion. *"Investigate further"* is not an
   action.
5. **A row does not reopen without new evidence.** `Closed` and `Use` rows are settled; re-litigating one
   is the drift this register prevents.
6. ⚠ **Machine-readable ≠ authorised to publish.** ADR-0283: *where evidence is incomplete **or legally
   insufficient**, PRYZM returns Unknown rather than inferring entitlement.* Madrid's `Fondo` geometry is
   machine-readable AND may still be unpublishable if Art. 8.3.1 governs. This register answers "can we
   read it", never "may we publish it".

## The register — 2026-08-02

| City | Dataset | Machine-readable | Status | Next action (one, owned) |
|---|---|---|---|---|
| **Murcia** | *Alineaciones* (municipal alignment geometry) | **Yes** | **Use** | Implement the **bbox** neighbour fetch — the resolver API resolves a point. *Owner: Murcia agent.* |
| **Murcia** | PGOU TR-2012 Normas Urbanísticas (vol. 11) | **Yes** — filed, SHA-256 `ab71c651…`, 22 cited articles byte-identical across both consolidations | **Verified** | None. Supersession CHECKED and clean. |
| **Murcia** | `viales` / `comunicaciones_poligonos` | **No** — centrelines, no width; 4 features over the whole Casco Antiguo | **Closed** | None. Superseded by *alineaciones*. Do not re-probe. |
| **Madrid** | PGOUM-97 Compendio 2025 | **Yes** — born-digital text layer; 282 records, article/apartado/page/verbatim; 1,321 quotes re-read, 0 fabricated, 0 mis-paged | **Verified** | Complete the **SIG-M1 targeted review** → certify the transcription. *Owner: the founder.* **Highest ROI on the board.** |
| **Madrid** | NZ-1 *Fondo de la Edificación* ring (`/api/madrid/condiciones`, layer 6) | **Yes** | **Use** | Confirm the SIG-M2 flip renders; publish MEASURED share. *Owner: Madrid agent.* |
| **Madrid** | `PG_ANALISIS_EDIFICACION` (13 layers) | **Partial** — L2 *Fondo máximo…* + L12 *Fondo* are geometry-only (`OBJECTID`); L8/L9 carry `TIPOANEDIF`+`PROTECCION`+`PLANO_AE` with uniqueValue renderers; L10 carries `ENLACE`. ⚠ L7–L10 are **APE.00.01-scoped** | **Investigate** | **FROZEN pending law.** Resolve **Art. 8.3.1 vs 8.3.5** first; then prove L2/L12 extent before claiming coverage. *Owner: planning review.* |
| **Madrid** | `NORMAS_ZONALES` routing layer | **Yes** | **Use** | None. NZ 2/6/10/11 absent from `AMB_TX_ETIQ` — recorded as a named coverage gap. |
| **Córdoba** | COACo `ordenanzas` / `hojas_cus` (8 vectorised sheets) | **Yes** | **Use** | None — but it **is** the 2-district pilot, not the city. |
| **Córdoba** | GMU *Calificación, Usos y Sistemas* — 69 of 77 sheets | **No (so far)** — georeferenceable raster JPGs (`CUS41W.jpg` → 200, 461,957 B) | **Investigating** | **One-shot sweep**: ArcGIS REST · FeatureServer · MapServer · ArcGIS Online · hidden layers · relationship tables · COACo viewer endpoints. Then bind, or declare *"no discoverable machine-readable source exists"* and vectorise. **No second investigation.** *Owner: Córdoba agent.* |
| **Córdoba** | PGOU-2001 ordinance text | **Yes** — transcribed, per-*ordenanza* (not per-district) | **Verified** | None. Vectorisation adds geometry only; no article needs re-reading. |
| **Córdoba** | `vhex25_max_plantas` / `vcatastro_urbanismo` | **Yes** | **Closed** | Recorded, deliberately **not** counted — Catastro-derived storey counts enter as `derived-levels`, which earn no C63 Axis-6 credit, and cover the pilot only. |
| **València** | Layer 212 *PGOU Alineaciones* (`PGOU_AL`) — 21,210 polygons, keyless | **Yes** | **Use** | Await `altura` semantics. ⚠ The **movement geometry is the depth datum** (Art. 6.18.1) — R1 **Superseded**. *Owner: the founder (R5 email).* |
| **València** | Catastro parcel path | **Yes** — keyless, two independent routes | **Use** | None. PARCEL measured 99.2 %. |
| **València** | Heritage — `Patrimonio_Historico`, `Vivienda` (17 folders) | **Unknown** — error **499 `Token Required`**, NOT absent | **External** | Obtain credentials, **or** ship the refuse-where-heritage-may-apply path. Heritage constrains **downward**; ignoring it over-states. *Owner: the founder.* |
| **València** | `valencia.opendatasoft.com` · `PGOU_AL.{dwg,gml,shz,json}` | **No** — portal parked ("domain could not be found"); CAD distributions 404 ×4 | **Closed** | None. The city's own metadata points at dead routes. Do not re-probe. |
| **Barcelona** | AMB Refós *qualificacio_refos_3857* (89 `CLAU_URB`) | **Yes** | **Use** | None. |
| **Barcelona** | DOGC 4893 (PGM) | **Yes** — in repo corpus, the only city that can prove its quotes from local bytes | **Verified** | None. |
| **Barcelona** | ~2,600 derived partial plans | **No** — outside corpus | **Closed** | **Signed out of scope.** Publish framework + quantified delegation + corpus boundary; delegated land refuses with its instrument named. |
| **All (heights)** | MDS *Edificación* national raster | **Yes** | **Use** | Bake #26 in flight. 7 of 9 Spanish stamp bboxes were short of their terrain region — fixed and pinned. |

## What the register makes visible

- **Only one dataset on the board is genuinely unavailable as data** — Córdoba's 69 CUS sheets, and even
  that is `Investigating`, not `No`.
- **Three rows are `External`/blocked on a third party**, all of them València's or Madrid's SIG-M1.
- **Five rows are `Closed`** — dead ends recorded so nobody spends a second week on them. That is the
  register's highest-value column.
- **Madrid's `Partial` row is the only one where "machine-readable" and "publishable" come apart**, which is
  exactly why rule 6 exists.
