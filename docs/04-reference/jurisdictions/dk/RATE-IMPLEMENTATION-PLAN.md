# Rate Implementation Plan — Denmark (`dk`) national

> **This is the CANONICAL demonstration of what "maximum" looks like.** Denmark is the ceiling
> exemplar (~96%) that every other jurisdiction's plan points at. Its plan is deliberately **short**:
> the assessment is done, the structured path already ships, and the realistic ceiling ≈ the current
> rate — because Denmark is the one case where the numbers are genuinely digitised. Read this to see
> the shape of a jurisdiction that has already arrived; a PDF-bound jurisdiction copies the phase
> *shape* but not the position.

**Current rate:** ~96% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~98% ·
**Gap to ceiling:** ~2 pts · **Gap to Denmark (~96%):** 0 pts (Denmark *is* the ceiling model) ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Denmark is **Denmark-like** (tautologically — it is the definition): the numbers already exist as
structured, machine-readable fields in one open national register, so the work is **ingestion, not
transcription**. The single structural fact that sets the ceiling: **the values are digitised.**
`bebygpct` (FAR), `maxbygnhjd` (height), `maxetager` (storeys) and `anvendelsegenerel` (use) are
first-class WFS attributes on the adopted plan features at `geoserver.plandata.dk` (WFS 2.0, keyless,
VERIFIED-LIVE 2026-07-23). This is why ~87% of byzone queries already return zone + density + height as
pure structured fields with **zero document access**, and why the residual is not a wall.

The realistic ceiling is **~98%**, not 100%, and the gap between the current ~96% and that ~98% is
**diminishing-returns work**:

- The move from the *pure-structured* 87% to the **~96%** headline is deterministic born-digital
  text recovery (no image-OCR, no human PDF read) — ≈79% of the ~13 pp gap is born-digital text keyed
  to a Plandata id (L-611 §2). This is what makes 96% the *data-readiness* rate rather than 87%.
- The move from ~96% to **~98%** needs true **image-OCR** of a scanned lokalplan minority (~13.5% of
  the gap ≈ +1.8 pp) — the harder tier, and cheaply reused from the Spain OCR pipeline rather than
  built twice.
- The remaining **~1–2 pp is genuinely unreachable** (plan-omitted / `kortbilag`-drawing-only /
  BR18-deferred) — an honest source absence, **not fabricatable** (C58 §1.4).

So: **ceiling ≈ current rate.** Denmark has effectively arrived. The plan below is a maintenance plan
plus a small, optional climb, not a build-out.

---

## 2 — Phase tracker

Status vocabulary is FIXED: **NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A**.
"Rate: from→to" is cumulative. Status tracks WORK; the rate only moves when `RATE.md` is re-derived.

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | **Assess** — live endpoint/schema checks; area-weighted + byzone Monte-Carlo fill measurement; write `RATE.md` | the honest baseline: ~87% pure-structured / ~96% digital-data-available | — → ~96% | Done (L-609/L-610/L-611) | **VERIFIED** | UNASSIGNED |
| **1** | **Maintain the structured path** — keep `plandataZoningProxy.js` + `DkZoningProvider` + `mapPlandataToZoningRecord` current with Plandata layer/field changes; hold the `byggefelt → delområde → lokalplan → ramme` selection rule; ratify §USABLE-FALLBACK legal precedence (Danish-planner sign-off) | `confidence: 'structured'` ratified on fall-through dimensions; no drift | ~96% (holds) | Low — ongoing + one human sign-off | **IN PROGRESS** (2 legal items PENDING, VERIFICATION.md) | UNASSIGNED |
| **2** | **Born-digital text-pull + ramme-id localization** (the cheap, OCR-free recovery) — consume the shared `ORDINANCE-EXTRACTION-PIPELINE` Stage-2 born-digital text branch; the `doklink` already names the exact PDF per gap feature; add the ramme-id localization stage for large consolidated `kommuneplan` docs | realizes the ~96% headline as re-derivable data; recovers ≈79% of the ~13 pp gap | ~87 (pure-structured) → **~96%** (re-derived) | Medium — no scan pipeline; deterministic text-pull + id anchor | **NOT STARTED** (needs the shared pipeline) | UNASSIGNED |
| **3** | **The last ~2 pts + the separate axes** — image-OCR the scanned lokalplan minority (reuse Spain OCR, do not build twice); wire byggefelt footprint → `maxCoverage` (ADR-gated cross-layer, `isBindingFootprint` already live); wire `byggelinjer` (setbacks) | +~1.8 pp dimensions; the coverage axis (~1.4% byzone) and setback axis start from 0% | ~96% → **~98% (ceiling)** | Higher — OCR + a C58/ADR schema decision | **NOT STARTED / BLOCKED** on the OCR pipeline + the coverage ADR | UNASSIGNED |

> ⚠ Phase 0 is **VERIFIED** because `RATE.md` was derived from live checks. Phases 2/3 are
> **SHIPPED→VERIFIED** only when `RATE.md` is re-measured after they land — marking a phase done here
> never moves the rate on its own.

---

## 3 — The gap to Denmark (~96%)

Denmark **is** the ceiling model, so this section is the inverse of every other jurisdiction's: it names
*why nobody else reaches 96%*, so the contrast is legible in one place.

- **Spain (Barcelona ~48% / Madrid ~68%):** numbers are prose in scanned/born-digital ordinance PDFs
  bound to a plan, needing OCR **and** parcel-binding vectorisation — an expensive depth play. Denmark's
  equivalent residual is 79% born-digital text keyed to a Plandata id: **the id is the binding key**, so
  no vectorisation wall.
- **Germany (~28%) / Norway (~32%):** a national exchange schema exists (XPlanung / SOSI Plan) but the
  numeric-utilisation object is an unfilled placeholder and the real value is prose — the *slot* exists,
  the *fill* does not. Denmark's slot is **filled**: `bebygpct`/`maxbygnhjd`/`maxetager` are populated
  attributes, ≈87% of byzone.
- **The universal separator:** Denmark's numbers were **digitised into structured fields**; everyone
  else's were not. That single fact is the whole distance, and it is why Denmark's ceiling is genuinely
  ~96% while a PDF-bound jurisdiction's structural ceiling stays far lower until a transcription pipeline
  + the L-449 human gate exist (see the ⚠ in the template — the ceiling is NOT always 96%).

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Depends on / already built (do not rebuild):**

- `server/plandataZoningProxy.js` (keyless same-origin WFS proxy + coordinate cache),
  `packages/site-parcel-data/src/providers/DkZoningProvider.ts`,
  `mapPlandataToZoningRecord.ts` — the structured path, **no rule pack, no `registry.ts` entry**
  (correct and must stay so). The `byggefelt → delområde → lokalplan → ramme` selection rule +
  `isBindingFootprint` gate + `Bindende byggefelt` overlay shipped (L-610).

**Blockers (each also in `NEXT.md` / `VERIFICATION.md`):**

- **Legal — §USABLE-FALLBACK precedence** (a dimensionless local plan shadowed by the richer
  kommuneplanramme beneath). Needs Danish-planner confirmation. Blocks ratifying the fall-through
  precedence, not the number. → Phase 1.
- **ADR — byggefelt footprint → `maxCoverage`.** Coverage is a ratio the pure mapper cannot compute
  (no parcel); needs a C58/ADR decision to add an L0 footprint-ring field + a downstream C57
  parcel-intersection step, gated on `bygkunifelt && !bygvejledende`. → Phase 3.
- **Shared OCR pipeline.** Phases 2–3's recovery consumes the `ORDINANCE-EXTRACTION-PIPELINE`; Denmark
  does not build a second OCR path.

**Cross-jurisdiction reuse (why this work is cheap breadth, not a bespoke build):**

- **Denmark is the shape-B proof** the pipeline pays off fastest on: ≈79% of its gap is born-digital
  text keyed to GIS ids (L-611 §5). It needs the *shared core*, not a second pipeline.
- **Denmark ADDS one capability to the shared spec: ramme-id localization** for large consolidated
  born-digital framework plans (§2.3 of L-611) — a deterministic retrieval stage valuable to any country
  whose framework plan is one big PDF.
- **Area-weighting trip-wire (both ways):** area-weighting a fill can move it the "wrong" way when the
  big polygons are the empty ones (Denmark ramme: 75.7% count → 61.5% area). Any jurisdiction
  area-weighting its fill should re-read L-609 §2.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96% — this file) · **Barcelona**
`../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance),
**ADR-0269** (curate-then-serve), **L-449** (human-verification gate). Source findings:
`findings/L-609-*`, `findings/L-610-*`, `findings/L-611-*`; `sources/SOURCES.md`;
`sources/VERIFICATION.md`.*
