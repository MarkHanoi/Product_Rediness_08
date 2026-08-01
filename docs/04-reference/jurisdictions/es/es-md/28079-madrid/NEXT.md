# NEXT — Madrid (28079, es-md, Spain)

> Where we stopped and how to resume. Convention: README = what is true now; this = where we
> stopped. **Last updated 2026-08-01** · Maintainer: Phase-4 jurisdiction documentation agent ·
> Status: **pack REGISTERED and routed end to end, gate SHUT; NZ 1 renders; nothing L-449-signed.**

> ## ⚠⚠ READ [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md) FIRST — much of this file was STALE
>
> **Corrected in place 2026-08-01.** Two commits landed after this file's 2026-07-31 body was
> written — **`40c80164` (§MADRID-PGOUM97-WIRING)** and the L-665 confidence fix — and a live probe
> pass (**L-676**) measured four things this file carried as unsourced. Every stale claim below is
> struck through or annotated **⛔ STALE** rather than deleted, so the correction is auditable.
>
> | This file said | Measured / verified truth |
> |---|---|
> | "no pack registered", `packsByZone` **empty** | **23 zones registered**; Madrid routed end to end; the gate (`MADRID_ENVELOPE_VERIFIED=false`) is what withholds numbers |
> | ENVELOPE = a measured **0 %** | **≤4.7 %** — NZ 1 (`MADRID_NZ1_CERTIFIED=true`) **renders a constructed envelope** on 11.695 % of NZ-governed land |
> | ceiling **≈60–62 %** (0.65 × 0.96, unsourced) | **DISPROVEN.** Measured: NZ 3 alone is **60.458 %** and refuses by law; ENVELOPE caps at **≈36.8 %** |
> | §4.1 all NZ 4/5/7/8/9 values document-gated, **zero** extracted | **282 cited records extracted** (`tools/madrid-extract/`); NZ 4 ships `buildableDepth_m: 12` (Art. 8.4.7.1, quoted). What is missing is a **signature**, not a read |
> | §4.2(b) 🔴 tsc defect — `explicitAreaFootprint` undeclared | **CLOSED.** `ZoningRulesEngine.ts:84` declares it |
> | §4.2(a) proxy missing · §4.2(c) placeholder `['NZ1']` codes | **BOTH CLOSED** — see the annotations in §4.2 |
> | §4.4 "seven cheap probes, none run" | **P1, P2 and P6 RUN and CLOSED** (L-676) |
> | §4.3 `COEF_Z` quarantined *as a precaution* | **Quarantine now EVIDENCE-BACKED**: 15,907 polygons, 100 % integers 0–8, **47.56 % compound** ⇒ measurably **not a FAR** |

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Madrid's **routing half is solved and independently corroborated**; its **legal half is untouched**.
Parcel→Norma-Zonal+grado routing is live and machine-readable for all **34** claus
(`NORMAS_ZONALES/0`, `AMB_TX_ETIQ`), derived-plan (APR/APE/API) detection works, and NZ 1's buildable
footprint is published as geometry — all re-confirmed this session by a founder recon pass that
reached the same endpoints independently. The `explicit-area` solver and the Madrid NZ-1
provider/adapter are **built and tested**. Against that: **zero** numeric Norma-Zonal parameters have
been extracted, **zero** rows carry a primary-article citation, and **nothing is signed** — so the
C63 LEGISLATION axis is a *measured* 0 % (0 of 34 claus) and the ENVELOPE axis a *measured* 0 %
(`packsByZone` is empty; every parcel gets a cited refusal). This pass **verified the ordinance
identity** (Compendio 2025, 24-09-2025) and found that a second Madrid portal still serves the
superseded July consolidation. Net: **the bottleneck is no longer discovery — it is one bounded human
read of Compendio Título VIII, plus a sequencing decision the founder has not yet made.**

## 2 — THE NUMBER ⛔ **REPLACED 2026-08-01 — see [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md)**

**Denominator: land the PGOUM-97 zoning layer assigns a Norma Zonal to = 149,577,170 m²**, measured
by server-side `SHAPE.STArea()` over all 34 `AMB_TX_ETIQ` codes (L-676, 2026-08-01). *(Not the
municipal ≈604 km²; not the L-656 private-buildable denominator, which Madrid still lacks.)*

| State today | Share |
|---|---:|
| TERMINAL — cited delegation (NZ 3, Art. 8.3.1 *aprovechamiento agotado*) | **60.458 %** |
| TERMINAL — constructed envelope (NZ 1, published footprint clipped) | **11.695 %** |
| PENDING one signature (NZ 4·5·7·8·9) | **27.847 %** |
| **TERMINAL TODAY** | **72.153 %** — *of which human-signed: **0 %*** |

**ENVELOPE axis: ≤4.7 % today · ≈7.5 % realistic · ARITHMETIC MAXIMUM ≈36.8 %.** ~96 % of the
ENVELOPE gap is **LAW** (NZ 3), not effort.

> ⛔ **STALE, struck 2026-08-01.** ~~"Shippable envelope resolution today = 0 % (measured:
> `packsByZone` empty)"~~ — `packsByZone` carries 23 codes and NZ 1 renders. ~~"Ceiling ≈60–62 %
> (0.65 × 0.96)"~~ — **DISPROVEN by measurement**: the parametric NZs govern 27.85 % and NZ 1
> 11.70 % (39.5 % together), with 60.46 % refusing by law. The founder's ~90–95 % forecasts remain
> **forecasts on a different denominator**, unchanged and still not merged.

## 3 — 🔴 THE OPEN DECISION: sequencing (the founder's call, NOT settled here)

**The "highest-value next step" has moved five times across the seven captures.** No ordering in this
dossier is authoritative, and an earlier instruction that treated roadmap §50 as settled is
**withdrawn**.

| Batch | Claimed next step | NZ 1's slot |
|---|---|---|
| 1–2 §39 | NZ 4 article extraction | 3rd |
| 2 §50 | NZ 4 → **NZ 1** → NZ 8 — *"NZ 1 is no longer research blocked, it is **engineering** blocked"* | **2nd** |
| 3 | `MadridProvider` + NZ 4 | 3rd |
| 4 §4 | **"Do NOT start with NZ 1"** — *"technically hardest despite GIS availability"* | **4th** |
| 5 §16 | Sprint order by value; NZ 1 = Sprint 5 | **5th** |
| 6 §Phase E | NZ 1 last — *"not geometry (already GIS); only COEF_Z meaning, height interpretation, protected conditions"* | **last** |
| 7–11 | *not* NZ 4 by hand → build the Spanish compiler / applicability graph / ontology / rule resolver first | — |

### 3.1 — What actually dissolves most of the NZ-1 disagreement (capture-note C-19)

**NZ 1 is two independent pieces, and the batches were arguing about different halves:**

| Piece | Blocked on | Natural slot |
|---|---|---|
| **(a)** `solveExplicitArea()` + `ExplicitAreaRule` in the rule union, and the wiring around it | **engineering only — no ordinance read** | can go **early**, in parallel with any extraction (§50's argument) |
| **(b)** `COEF_Z` semantics · height interpretation · protected/ficha conditions | **legal extraction** | naturally **late** (batches 4–6's argument) |

⚠ **And piece (a) is narrower than every capture assumes.** All of §19/§38/§50 and batches 4–6 state
the engine *needs* `solveExplicitArea()`. **It already shipped** — see
`findings/L-608-EXPLICIT-AREA-SOLVER-SHIPPED.md` and `findings/L-608-NZ1-PROVIDER-SHIPPED.md`
(`esMadridNZ1Provider.ts`, fixture-tested). The founder's material is **stale on this point**. The
genuine residual for (a) is listed in §3.2 and is smaller than "build a solver".

### 3.2 — What the founder is actually being asked to decide

1. **Does the NZ-1 engine wiring (piece a) go now, in parallel?** It is a code task an agent can take
   today with no legal input. Argument for: cheap, unblocks the historic core, nothing else waits on
   it. Argument against (batches 4–6): engine changes carry more risk than parameter extraction, and
   NZ 4 buys far more coverage per week.
2. **Is NZ 4 extracted into flat rules, or *through* a graph/ontology/resolver?** Batches 7–11 argue
   architecture-first (avoid a costly redesign); batches 1–6 argue extraction-first (NZ 4 ≈ 30–40 %
   of Madrid residential in 2–3 weeks). ⚠ Batches 7–11 substantially **overlap PRYZM's already-ratified**
   planning-regime resolver and building-graph work (capture-note C-22) — so the honest framing is
   **reconcile-first, not build-first**. Building a second graph alongside the existing one is the
   "dozens of incompatible schemas" outcome those batches themselves warn against.
3. **Nothing in the corpus has yet been tested against a real PGOUM article.** Every schema claim,
   every effort estimate, and the whole "one Spanish compiler" thesis is currently unvalidated.

**Recorded as OPEN. Do not let any downstream doc or agent present an ordering as decided.**

## 4 — BLOCKERS (each: what · why it blocks · unblock · EXACT resume step)

### 4.1 — ⛔ **STALE** — NZ 4/5/7/8/9 are EXTRACTED; what is missing is a SIGNATURE
> **Corrected 2026-08-01.** `tools/madrid-extract/` read the Compendio 2025 born-digital text layer
> and produced **282 cited records** across **23 zones**, each carrying article + apartado + PDF page
> + verbatim quote. `MADRID_NZ4_RULE` ships `buildableDepth_m: 12` citing Art. 8.4.7.1 verbatim
> (*"Se establece un fondo máximo edificable de doce (12) metros"*); `madridAnchoDeCalle.ts` holds
> the NZ 1/4/9 *ancho de calle* height tables. **The dominant blocker is now the L-449 human audit
> of that machine read (CLOSURE-REGISTER row 1), not the read itself.** The paragraph below
> described the world before `40c80164`; its *schema* reasoning (the Zod schema structurally forbids
> a placeholder pack) remains correct and worth keeping.

<details><summary>⛔ superseded text (kept for audit)</summary>

#### All NZ 4/5/7/8/9 rule values are document-gated (the dominant blocker)
- **Why it blocks.** `AlignmentRuleSchema` requires a `.positive()` `buildableDepth_m`;
  `SetbackRuleSchema` requires the front/side/rear triple. No pack parses without them. The Zod
  schema **structurally forbids** a placeholder pack — this is a feature.
- **Unblock.** One human read of the primary text.
- **EXACT resume step.** Open **`COMPENDIO_MPG_NNUU_24_09_2025.pdf`** (transparencia — *not* the
  geoportal copy, §4.5), **Título VIII**, Cap. 8.4 (NZ 4) first. Per grado, transcribe *fondo
  edificable* / retranqueos, *altura de cornisa* + *nº plantas*, *ocupación* **with its denominator**,
  usos — each into a `sources/SOURCES.md` row carrying the full citation atom (§0.4), or it stays
  `null` with a status.
- ⚠ **Measured negative — do not go looking in GIS.** A full field inventory across all six PGOUM-97
  services found **no `ALTURA`/`PLANTAS`/`FONDO`/`RETRANQUEO` attribute and no coded-value domains**.
  The numbers are genuinely not in GIS.

</details>

⚠ **That measured GIS negative STANDS and was not overturned** — the parametric *values* are not in
GIS, which is why the machine read the PDF instead. ⭐ **But a related negative WAS overturned:**
`PG_ORDENACION/8 Alineaciones` publishes **22,584 `Alineación Oficial` polylines** (L-676), so the
*legal datum* for the fondo and for every *ancho de calle* height **is** machine-readable even though
the values are not. CLOSURE-REGISTER rows **7** and **8** — both re-bucketed **A → B**.

### 4.2 — NZ 1 wiring + sign-off — ✅ **(a)(b)(c) ALL CLOSED; (d) reframed** (verified 2026-08-01)

- **(a)** ✅ **CLOSED, by a different implementation than this row assumed.** `/api/madrid/condiciones`
  is **mounted** (`server.js:514` → `server/madridCondicionesProxy.js`), and `/api/madrid/normas-zonales`
  beside it (`server.js:518`). ⚠ The routes this row names — `/api/madrid/pgoum97/{condiciones,ficha}`
  — belong to `rulepacks/esMadridNZ1Provider.ts`, which is **unreachable dead code** (imported by
  nothing but its own test). The live path is `providers/resolveMadridNZ1Ring.ts`. **Two rival
  providers now exist** — CLOSURE-REGISTER row **4**, and the *ficha* logic is stranded in the dead
  one (row **3**).
- **(b)** ✅ **CLOSED.** `ZoningRulesEngine.ts:84` declares
  `readonly explicitAreaFootprint?: ReadonlyArray<Pt> | null;` (and `:95` adds
  `explicitAreaFootprintParts`). The engine reads both at `:743–746`. **The 🔴 build-breaking tsc
  defect no longer exists** — this row was stale when written into §8 as "the smallest engineering
  unblock".
- **(c)** ✅ **CLOSED.** `esMadridNZ1.ts:146` ships
  `MADRID_NZ1_ZONE_CODES = ['1.1','1.2','1.3','1.4','1.5','1.6']`, matched on `AMB_TX_ETIQ`; the
  placeholder `['NZ1']` is gone. Registry **and** dispatcher route on the single shared constant
  `MADRID_NZ1_CODE_PREFIX = '1.'` rather than restating a literal, so a seventh grado would still
  reach NZ 1's settled answer instead of the coverage-gap card.
- **(d)** 🟠 **OPEN, and it is TWO signatures, not one.** SIG-M1 covers `MADRID_ENVELOPE_VERIFIED`
  (the 23 packed zones) and **explicitly excludes NZ 1**. Meanwhile `MADRID_NZ1_CERTIFIED = true`
  already authorises the only Madrid envelope that renders, **with no signature row anywhere in
  `VERIFICATION.md §3`** — CLOSURE-REGISTER row **5**.

### 4.3 — `COEF_Z` is quarantined — ✅ **and the quarantine is now EVIDENCE, not caution**
The only FAR-shaped number Madrid exposes; legal meaning **and denominator** both unknown (it is
keyed on `CODMANZANA`, so the scope may be *manzana*, not parcel). **Must not be bound to `farRatio`
anywhere.** Reading `COEF_Z = 5` as FAR 5.0 is the **L-616** failure mode exactly.

> ⭐ **CLOSED ON NEGATIVE EVIDENCE (L-676, 2026-08-01) — the "it is a FAR" hypothesis is eliminated.**
> Census of all **15,907** `PG_CONDICIONES_EDIFICACION/6` polygons, **57** distinct values:
> **100 % are INTEGERS in 0–8** (not one decimal in 15,907 rows) and **47.56 % carry a COMPOUND
> value** (`"0 / 5"` ×1,498, `"0 / 6 / 7"` ×409, `"0 / 4 / 5 / 7"`). **A polygon cannot hold three
> simultaneous plot ratios.** ⚠ This does **not** say what `COEF_Z` *is* — Cap. 8.1 is still the only
> source for that, and the resume step below is unchanged. **Verified safe today:**
> `siteDispatch.ts` builds NZ 1's `ZoningRecord` with `structuredFields: {}`; nothing binds it.

Resume step (for the POSITIVE meaning, unchanged): Compendio Cap. 8.1, search *coeficiente* /
*edificabilidad* / *Coeficiente Z* / *tabla de grados*. If absent, sign off the **negative** — do not
guess. (`sources/SOURCES.md` §B2.)

### 4.4 — Seven cheap probes — **three RUN and CLOSED 2026-08-01 (L-676); four still open**
`sources/VERIFICATION.md` §1a lists P1–P7 — one query each, no ordinance read, each retires a
documented unknown.

- ✅ **P1 CLOSED** — `AMB_TX_DENOM` **exists and is populated for all 34 codes** (`"ZONA 3 GRADO 1º -
  NIVEL a"` …). It was previously *"REQUESTED by the proxy but never verified to exist"*.
- ✅ **P2 CLOSED (coverage half)** — unfiltered `returnCountOnly` = **34**, groupBy = **34 groups,
  `n=1` each** ⇒ the inventory is **exhaustive**, so zones 2/6/10/11 govern **0 m²** and **no parcel
  can route to them**. Candidate cause (c) is eliminated; the nomenclature question survives at P3.
- ✅ **P6 CLOSED, and it is the highest-value of the seven** — `PG_ORDENACION/8 Alineaciones` is live
  with **22,584 `Alineación Oficial`** polylines (+3,582 *en Volumetría Específica*, +2,066 *Trazado
  Indicativo APR*, +873 unlabelled). The NZ-4 depth datum **is** usable geometry.
- 🔴 **P3 / P4 / P5 / P7 still open** — `PG_ANALISIS_EDIFICACION`, `PG_EDIFICIOS_PROTEGIDOS`,
  `PG_USOS_Y_ACTIVIDADES` field inventories, and the later-edition check.

⭐ **New, unlisted probe run this pass:** `PG_CONDICIONES_EDIFICACION/1 Ficha Específica` holds
**131** points — the individually-defined parcels the live NZ-1 resolver **never reads**
(CLOSURE-REGISTER row **3**).

### 4.5 — 🔴 Version hazard: two portals, two consolidations
`geoportal.madrid.es` serves **`COMPENDIO_MPG_NNUU_07_07_2025.pdf`** ("COMPENDIO JULIO 2025") — the
**superseded** July consolidation — while `transparencia.madrid.es` serves the current
**24-09-2025** edition. Both returned HTTP 200 on 2026-07-31; they are distinct documents (different
sizes and `Last-Modified`). There is no on-page signal on the geoportal copy that a newer edition
exists. **Cite transparencia. If an extraction quotes `07_07_2025`, treat it as version-suspect.**

## 5 — TRIP-WIRES (if you see X elsewhere, come back HERE)

- **If you build or touch the `explicit-area` engine branch for ANY jurisdiction** — Madrid NZ 1 is
  its first consumer; wire `esMadridNZ1.ts` + the ringRef resolver at the same time (one unit).
- **If you find a jurisdiction that publishes a buildable FOOTPRINT as geometry** (not parameters) —
  reuse the ringRef resolver pattern; it is the playbook-flagged reusable asset.
- **If you are tempted to encode a single scalar for an NZ** — STOP. Every Madrid NZ is
  **grado-structured** (NZ 8 alone has 10 codes). Key on the exact `AMB_TX_ETIQ` string.
- **If you see a Madrid fondo/altura figure in a blog, slide, or a specific APR plan** — SECONDARY,
  and APR plans carry site overrides that *contradict* the general norm. Never promote it.
- **If the ordinance-extraction pipeline (`packages/ordinance-extraction/`) gains a new locale** —
  test it against the Compendio **before** writing any Spanish grammar. The founder's "~80 % reusable"
  claim is a **hypothesis**: Berlin's input is a per-plan *bplan*; Madrid's is a consolidated
  city-wide ordinance with an article hierarchy and grade inheritance Berlin has no analogue for, and
  the founder's own batch 5 concedes *"Madrid's text is less structured"*. Cheapest test: run the
  existing extractor at the Compendio and measure what fraction of Título VIII it segments correctly.
- **If anyone proposes a "one Spanish compiler serves every Spanish city"** — PRYZM has direct
  counter-evidence: Barcelona's `edificabilitat` is a **CONSTRUCTION, not a lookup** (ADR-0271, Art.
  242.2 is an algorithm), so a vocabulary map `edificabilidad → farRatio` would read it as a value and
  be **silently wrong**. Honest framing: *one compiler + per-city semantic adapters*. Test against
  Barcelona early — it is the one Spanish city where we already hold ground truth.
- **If a resolver/override/precedence layer is built** — it must **never increase confidence**
  (capture-note C-27). `unknown` must survive resolution; otherwise every upstream `null` discipline
  is laundered away silently.
- **If a height field is modelled anywhere** — the measurement *datum* and the *sampling rule along
  it* are **two** required fields. Recording `referencePlane: "rasante_oficial"` alone still
  reproduces **L-584** exactly (one point at the block centroid vs the ordinance's façade).

## 6 — WHAT IS ALREADY BUILT (do not redo)

- The Norma-Zonal typology map + the rule-kind decision per NZ (`findings/L-608-MADRID-PACK-SPEC.md`).
- The LIVE ArcGIS probe of the NZ 1 data plane, and the **34-code `AMB_TX_ETIQ` inventory** with
  per-zone breakdown (`findings/MADRID-DATA-RECON-SPIKE.md`).
- The proof that `CODMANZANA` is **not** a refcat substring (three real refcats) — the join is spatial.
- The proof that **`COND_EDIF` is NOT the zonal grado** (25/25 counter-examples). A probe that was
  wrong, and the correction is the valuable part.
- The `explicit-area` solver primitive (`resolveExplicitAreaRing` + `solveExplicitArea`) + engine
  branch — **MERGED**.
- The Madrid NZ 1 provider/adapter — **SHIPPED** (`esMadridNZ1Provider.ts` + fixture test).
- The declaration-grade `esMadridNZ1.ts` pack file (UNREGISTERED — awaits §4.2).
- **This pass:** ordinance identity verified; the two-portal version hazard found; the founder corpus
  reconciled into `sources/SOURCES.md` with every conflict carried forward, not collapsed.

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **Founder's cited Compendio URL** (`madrid.es/…/Listado-de-Publicaciones/Compendio-2025-…`) →
  **HTTP 404** (2026-07-31). The claim it carried was right; the locator was wrong.
- **No `ALTURA`/`PLANTAS`/`FONDO`/`RETRANQUEO` attribute or coded-value domain** on any of the six
  PGOUM-97 services — full field inventory, 2026-07-24. The parametric numbers are not in GIS.
- **`madridlicencias.com/.../PGOUM-97.pdf` via WebFetch** — compressed/encoded streams, no extractable
  text layer. Use the official transparencia PDF with a real PDF reader / OCR.
- **Both Compendio PDFs exceed agent fetch limits** (~25–26 MB each). Identity and reachability are
  verifiable by `curl -I`; the *contents* need a real reader.
- **Web search for NZ 4 numbers** — returns APR-plan-specific values mixed with the general norm.
  SECONDARY, not usable.
- ⚠ **Superseded dead end:** `pgoum97/PG_ORDENACION` "Service not started" (2026-07-23, ×2) was
  **transient** — it answered HTTP 200 with 17 layers on 2026-07-24, and it is **off the critical
  path** anyway (routing comes from `NORMAS_ZONALES/0`). Older files in this dossier that call it
  "down" are stale.

## 8 — THE SMALLEST NEXT STEP that moves the number ⛔ **REPLACED — measurement changed the ranking**

**The single smallest next step is: a human reads Compendio 2025 Cap. 8.3 and signs the NZ 3
refusal.** One chapter, eleven quotes **already extracted**, and it converts **60.458 %** of
Madrid's Norma-Zonal-governed land from *terminal-but-unverified* to *terminal-and-verified*. It
needs a human; nothing else does it. See CLOSURE-REGISTER row **13** and its recommended order.

> ⛔ **STALE, struck 2026-08-01 — every candidate below was mis-ranked, and the measurement is why.**
> - ~~"Largest on the envelope number: read Cap. 8.4, NZ 4"~~ — **NZ 4 is 8.83 %** of NZ-governed
>   land, **not** the 30–40 % the corpus assumed; NZ 3 is **60.46 %** and was ranked nowhere. And
>   Cap. 8.4 has **already been machine-read** — `buildableDepth_m: 12` ships today.
> - ~~"Smallest engineering unblock: §4.2(b), the `explicitAreaFootprint` tsc defect"~~ — **that
>   defect does not exist**; the field is declared at `ZoningRulesEngine.ts:84`.
> - ~~"Cheapest overall: run P1–P7"~~ — **P1, P2 and P6 are now RUN** (§4.4). P6 turned out to move
>   two blockers from Evidence to Engineering, so "does not move the envelope number" was wrong too.
>
> **The transferable lesson: this dossier ranked its own work for five passes without ever measuring
> the land.** One `groupByFieldsForStatistics` query — available the whole time — inverted the queue.

⚠ **When NZ 4 is implemented:** *fondo edificable* is measured **from the official street alignment
line**, inward. **It is not a parcel shrink.** Insetting the parcel ring by the depth is a
plausible-looking model that is wrong — the same error class that burned significant time in the
Barcelona inset-collapse saga (L-529/L-581).
