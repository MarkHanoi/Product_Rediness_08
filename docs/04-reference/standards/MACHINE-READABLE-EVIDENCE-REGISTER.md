# MACHINE-READABLE EVIDENCE REGISTER

**Status**: **APPROVED AND MANDATORY** (founder, programme sponsor decision, 2026-08-02) — *"a single source of truth for what is machine-readable, what isn't, and the next concrete action."*
**Scope**: every city under active close-out. One row per dataset, not per city.

> ⛔ **MANDATORY FIRST CHECK.** *"Every future investigation must begin by checking the register before
> opening a new line of enquiry."* Opening a probe against a dataset already recorded here as `Closed` —
> or re-deriving a conclusion already recorded — is a process defect, not diligence. If the register is
> wrong, correct it **with evidence**; do not route around it.

**Related**: [DECISION-REGISTER.md](./DECISION-REGISTER.md) (**its companion — what exists vs what we decided**) · [BLOCKER-CLASSIFICATION-STANDARD.md](./BLOCKER-CLASSIFICATION-STANDARD.md) · [PROBE-DISCIPLINE.md](./PROBE-DISCIPLINE.md) · [ADR-0288](../../02-decisions/adrs/ADR-0288-machine-readable-is-not-publishable.md) (**Rule 6, promoted**) · [ADR-0283](../../02-decisions/adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) · [ADR-0284](../../02-decisions/adrs/ADR-0284-derived-geometry-permissible-derived-law-is-not.md) · [C63](../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md)

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
6. ⚠ **Machine-readable ≠ publishable — now [ADR-0288](../../02-decisions/adrs/ADR-0288-machine-readable-is-not-publishable.md).**
   Promoted from a register rule to a corpus principle because it is universal: *"future mistakes will
   almost certainly come from someone discovering geometry and assuming that geometry authorizes
   entitlement."* Madrid's `Fondo` geometry is machine-readable AND may still be unpublishable if Art.
   8.3.1 governs. The **`Publishable`** column below keeps that visible in every discussion.
7. ⚠ **A dataset's GEOMETRY and its ATTRIBUTES are separate rows when their publishability differs.**
   València forced this: Layer 212's *polygon* is the authoritative depth datum and is in use TODAY, while its
   `altura` *attribute* is parsed but **interpretation-unbound**. One row saying "layer 212 in use" would let a
   later reader conclude the attribute is trusted too — **the one inference this city is waiting not to make.**
8. **The three questions are separate.** *Can we read it?* → this register. *Have we already tried?* → this
   register's `Closed` rows. *May we publish from it?* → **never this register** — ADR-0288 + ADR-0283.

## The register — 2026-08-02

| City | Dataset | Machine-readable | **Publishable** | Status | Next action (one, owned) |
|---|---|---|---|---|---|
| **Murcia** | *Alineaciones* (municipal alignment geometry) | **Yes** | **Yes** — SIG-MU2 (methodology, 4 conditions) | **Use** | ✅ **DONE 2026-08-02** — `?extent=neighbourhood` bbox fetch shipped; MEASURED coverage 23.51 % → **28.03 %**. No dissolve needed: Murcia publishes block-level alineación polygons directly. |
| **Murcia** | PGOU TR-2012 Normas Urbanísticas (vol. 11) | **Yes** — filed, SHA-256 `ab71c651…`, 22 cited articles byte-identical across both consolidations | **Yes** — SIG-MU1 / SIG-MU2 | **Verified** | None. Supersession CHECKED and clean. |
| **Murcia** | `viales` / `comunicaciones_poligonos` | **No** — centrelines, no width; 4 features over the whole Casco Antiguo | N/A | **Closed** | None. Superseded by *alineaciones*. Do not re-probe. |
| **Madrid** | PGOUM-97 Compendio 2025 | **Yes** — born-digital text layer; 282 records, article/apartado/page/verbatim; 1,321 quotes re-read, 0 fabricated, 0 mis-paged | **Pending** — await SIG-M1 certification | **Verified** | Complete the **SIG-M1 targeted review** → certify the transcription. *Owner: the founder.* **Highest ROI on the board.** |
| **Madrid** | NZ-1 *Fondo de la Edificación* ring (`/api/madrid/condiciones`, layer 6) | **Yes** | **Yes** — SIG-M2 (Doctrine B) | **Use** | Confirm the SIG-M2 flip renders; publish MEASURED share. *Owner: Madrid agent.* |
| **Madrid** | `PG_ANALISIS_EDIFICACION` (13 layers) | **Partial** — L2 *Fondo máximo…* + L12 *Fondo* are geometry-only (`OBJECTID`); L8/L9 carry `TIPOANEDIF`+`PROTECCION`+`PLANO_AE` with uniqueValue renderers; L10 carries `ENLACE`. ⚠ L7–L10 are **APE.00.01-scoped** | ⛔ **Pending — await Art. 8.3.1 vs 8.3.5** | **Investigate** | **FROZEN pending law.** Resolve **Art. 8.3.1 vs 8.3.5** first; then prove L2/L12 extent before claiming coverage. *Owner: planning review.* |
| **Madrid** | `NORMAS_ZONALES` routing layer | **Yes** | **Yes** — routing only, publishes no figure | **Use** | None. NZ 2/6/10/11 absent from `AMB_TX_ETIQ` — recorded as a named coverage gap. |
| **Córdoba** | COACo `ordenanzas` / `hojas_cus` (8 vectorised sheets) | **Yes** | **No** — gate shut; blockers 4+3 must precede 2 | **Use** | None — but it **is** the 2-district pilot, not the city. |
| **Córdoba** | GMU *Calificación, Usos y Sistemas* — 69 of 77 sheets | **No — CONCLUDED 2026-08-02** ⚠ and worse than assumed: **41 of 49 urban sheets return a 69-byte "Server under construction" page**; only 8 are live, of which 6 are already vectorised. No world file or `.prj` is served for ANY sheet, so "georeferenceable" was an assumption. | N/A — **the vectorisation target does not exist** | **Closed** | ⛔ **Search CLOSED, one-shot rule honoured — do NOT reopen.** Six avenues exhausted (`GMU_Services` was **George Mason University**, an acronym collision 6,148 km away). Blocker 22 stays **Data acquisition**, NOT Engineering — the evidence forbids the migration. **Exit: GMU serves the 41 sheets, or refuses.** *Owner: the founder.* ⛔ **VECTORISATION IS NOT AUTHORISED** (D-002, 2026-08-02) — the pre-approval's premise was measured false. |
| **Córdoba** | `ide.cordoba.es` GeoServer — **105 layers** (Ayuntamiento, a DIFFERENT publisher from COACo) | **Yes** — WFS 200 / 157,326 B; WMS 200 / 363,539 B | **No** — no zoning layers | **Investigate** | ⭐ **NEW, nobody had this.** No calificación, but serves `sup_viales` · `red_viaria` · `tramo_vial` — a candidate **street-width source**. Blocker 8 (0.88 pp) had recorded that none was known. Filed, deliberately not acted on. |
| **Córdoba** | PGOU-2001 ordinance text | **Yes** — transcribed, per-*ordenanza* (not per-district) | **No** — no geometry to bind it to | **Verified** | None. Vectorisation adds geometry only; no article needs re-reading. |
| **Córdoba** | `vhex25_max_plantas` / `vcatastro_urbanismo` | **Yes** | **No** — `derived-levels`, no C63 Axis-6 credit | **Closed** | Recorded, deliberately **not** counted — Catastro-derived storey counts enter as `derived-levels`, which earn no C63 Axis-6 credit, and cover the pilot only. |
| **València** | Layer 212 *PGOU Alineaciones* — **GEOMETRY** (movement polygons, 21,210, keyless) | **Yes** | **Yes** — the polygon IS the depth datum (Art. 6.18.1) | **Use** | **None — in use today.** Read, parsed and validated on every access (containment, patio holes, CRS). R1 **Superseded**: the polygon is the depth datum. |
| **València** | Layer 212 — **`altura` ATTRIBUTE** | **Yes** — parsed, 12 typed kinds | ⛔ **Pending — await semantics** | **Investigate** | ⚠ **Parsed but INTERPRETATION UNBOUND.** A bare `5` is `bare-integer`, never "5 storeys". Await the municipal definition; Q4 (the −2 gap) is the gate. *Owner: the founder (R5).* |
| **València** | Catastro parcel path | **Yes** — keyless, two independent routes | **Yes** — PARCEL axis, not ENVELOPE | **Use** | None. PARCEL measured 99.2 %. |
| **València** | Heritage — `Patrimonio_Historico`, `Vivienda` (17 folders) | **Unknown** — error **499 `Token Required`**, NOT absent | **No** — constrains downward; refuse where it may apply | **External** | Obtain credentials, **or** ship the refuse-where-heritage-may-apply path. Heritage constrains **downward**; ignoring it over-states. *Owner: the founder.* |
| **València** | `valencia.opendatasoft.com` · `PGOU_AL.{dwg,gml,shz,json}` | **No** — portal parked ("domain could not be found"); CAD distributions 404 ×4 | N/A | **Closed** | None. The city's own metadata points at dead routes. Do not re-probe. |
| **Barcelona** | AMB Refós *qualificacio_refos_3857* (89 `CLAU_URB`) | **Yes** | **Yes** — SIG-2 / SIG-3 | **Use** | None. |
| **Barcelona** | DOGC 4893 (PGM) | **Yes** — in repo corpus, the only city that can prove its quotes from local bytes | **Yes** — corpus-local, quotes provable | **Verified** | None. |
| **Barcelona** | ~2,600 derived partial plans | **No** — outside corpus | **No** — signed OUT of verified scope | **Closed** | **Signed out of scope.** Publish framework + quantified delegation + corpus boundary; delegated land refuses with its instrument named. |
| **All (heights)** | MDS *Edificación* national raster | **Yes** | **Yes** — heights, not envelopes | **Use** | Bake #26 in flight. 7 of 9 Spanish stamp bboxes were short of their terrain region — fixed and pinned. |

## What the register makes visible

- **Only one dataset on the board is genuinely unavailable as data** — Córdoba's 69 CUS sheets, and even
  that is `Investigating`, not `No`.
- **Three rows are `External`/blocked on a third party**, all of them València's or Madrid's SIG-M1.
- **Five rows are `Closed`** — dead ends recorded so nobody spends a second week on them. That is the
  register's highest-value column.
- **Madrid's `Partial` row is the only one where "machine-readable" and "publishable" come apart**, which is
  exactly why rule 6 exists.
