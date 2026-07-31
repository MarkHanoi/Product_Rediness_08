# NEXT — Madrid (28079, es-md, Spain)

> Where we stopped and how to resume. Convention: README = what is true now; this = where we
> stopped. **Last updated 2026-07-31** · Maintainer: Phase-4 jurisdiction documentation agent ·
> Status: **SPEC + 7 founder recon captures folded in; no pack registered; nothing L-449-signed.**

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

## 2 — THE NUMBER

Denominator: **Madrid residential parcel clicks.** Shippable envelope resolution **today = 0 %**
(measured: `packsByZone` empty, not estimated). Ceiling once the parametric NZs are sourced and NZ 1
is wired: **≈ 60–62 %** — ⚠ but that ceiling is a product of two land-share fractions (~0.65
directly-NZ-governed × ~0.96 in NZ 3/4/1/8) that are **UNSOURCED** and must not be presented as
measured coverage. The founder's forecasts (~90–95 % after extraction) are **forecasts, not
measurements**, and use a different denominator ("machine-readable buildability coverage").

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

### 4.1 — All NZ 4/5/7/8/9 rule values are document-gated (the dominant blocker)
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

### 4.2 — NZ 1 wiring + sign-off (research-complete; engineering residual only)
The solver and provider **exist and are tested**. What remains:
- **(a)** a server same-origin proxy `/api/madrid/pgoum97/{condiciones,ficha}` so
  `resolveMadridNZ1Ring` can fetch the published footprint at runtime;
- **(b)** 🔴 **pre-existing tsc defect** — `ComputeBuildableEnvelopeInput` lacks
  `explicitAreaFootprint`. The engine branch reads `input.explicitAreaFootprint`
  (`ZoningRulesEngine.ts:651`) but the interface never declares it, so `tsc` fails at the base (3
  errors) while `vitest` is green — **this would hard-fail the Fly build.** Fix: add
  `readonly explicitAreaFootprint?: ReadonlyArray<Pt> | null;` (like `blockRing`). **Engine/schema
  owner.**
- **(c)** register the **verified** NZ-1 codes `['1.1','1.2','1.3','1.4','1.5','1.6']` matched on
  `AMB_TX_ETIQ` — **not** the placeholder `['NZ1']`;
- **(d)** the L-449 sign-off.
⚠ None of this needs the ordinance. It is the piece-(a) work in §3.1.

### 4.3 — `COEF_Z` is quarantined and must stay that way
The only FAR-shaped number Madrid exposes; legal meaning **and denominator** both unknown (it is
keyed on `CODMANZANA`, so the scope may be *manzana*, not parcel). **Must not be bound to `farRatio`
anywhere.** Reading `COEF_Z = 5` as FAR 5.0 is the **L-616** failure mode exactly. Resume step:
Compendio Cap. 8.1, search *coeficiente* / *edificabilidad* / *Coeficiente Z* / *tabla de grados*. If
absent, sign off the **negative** — do not guess. (`sources/SOURCES.md` §B2.)

### 4.4 — Seven cheap probes, none run
`sources/VERIFICATION.md` §1a lists P1–P7 — one query each, no ordinance read, each retires a
documented unknown (`AMB_TX_DENOM`; the zones 2/6/10/11 routing gap; the four unprobed layers; a
later-edition check). **These are the cheapest available progress in the dossier and nobody has run
them.**

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

## 8 — THE SMALLEST NEXT STEP that moves the number

Two candidates, deliberately not ranked here (§3 is the founder's call):

- **Cheapest overall (agent, minutes):** run **P1–P7** (`sources/VERIFICATION.md` §1a). Retires seven
  documented unknowns with no ordinance read and no engineering. Does **not** move the envelope number.
- **Largest on the envelope number (human, one session):** **read Compendio 2025 Cap. 8.4 and fill the
  NZ 4 *fondo edificable* + *altura* table per grado.** NZ 4 is central Madrid's dominant residential
  typology, is `alignment`-shaped (schema-ready today), and needs **no engine work** — so it converts
  the largest share of the ceiling from SPEC into a real envelope. Cost: one sourcing session + the
  L-449 sign-off.
- **Smallest engineering unblock (agent, no legal input):** §4.2(b), the `explicitAreaFootprint`
  interface field — a 🔴 build-breaking tsc defect that is one line and is currently masked by green
  tests.

⚠ **When NZ 4 is implemented:** *fondo edificable* is measured **from the official street alignment
line**, inward. **It is not a parcel shrink.** Insetting the parcel ring by the depth is a
plausible-looking model that is wrong — the same error class that burned significant time in the
Barcelona inset-collapse saga (L-529/L-581).
