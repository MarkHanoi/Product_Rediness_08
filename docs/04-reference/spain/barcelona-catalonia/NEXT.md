# NEXT — Barcelona (INE 08019, Catalonia, Spain)

> **What this file is.** The single place that records **where PRYZM stopped on Barcelona, exactly
> why, and precisely what to do to go further the moment it becomes possible.** It is written so that
> if — while working on *any other municipality* — someone finds a source, a technique, or a service
> that could unblock one of the items below, they can come straight here, find the exact endpoint /
> field / measurement, and resume without re-deriving a day of work.
>
> **Convention (applies to every municipality).** Every municipality folder, under its country
> folder, carries a `NEXT.md` in this shape:
> `docs/04-reference/<country>/<municipality>/NEXT.md`. See §0 for the template.
>
> **Last updated:** 2026-07-22. **Maintainer:** UNASSIGNED. **Status of the city:** live in
> production; at its honest full-envelope ceiling for the PGM-only approach.

---

## 0 — The `NEXT.md` template (copy this for a new municipality)

```
# NEXT — <City> (<INE/code>, <region>, <country>)
## 1 — WHERE WE STOPPED (the one-paragraph truth)
## 2 — THE NUMBER (what % of clicks get a full envelope, and why exactly that)
## 3 — BLOCKERS (each: what it is · why it blocks · what would unblock it · the exact resume step)
## 4 — TRIP-WIRES (a finding elsewhere that should send you back here — "if you ever see X, come check Y")
## 5 — WHAT IS ALREADY BUILT AND MUST NOT BE REDONE
## 6 — VERIFIED SOURCES (endpoint · what it answers · confidence tier · the exact query)
## 7 — DEAD ENDS (measured negatives — do NOT re-run these hoping for a different answer)
## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost
```

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

We encoded Barcelona's 1976 general plan (**PGM**) to the point where it answers a **complete,
legally-cited buildable envelope for ~47% of privately-buildable clicks**, and gives a **correct,
cited refusal** for essentially all the rest. We then hit a **structural ceiling of ~48%** that no
further work *on the PGM* can move, because **62.8% of Barcelona's land is governed by separate
derived plans the PGM does not contain** (measured live, `L-590c` §11). We discovered — and
verified against two independent public services — that Barcelona **publishes which derived plan
governs each parcel, with its approval date**, but **NOT the plans' buildable parameters**: those
live inside per-plan documents that for the pre-1970 instruments are **scans**. So Barcelona's real
full-envelope ceiling is **~48–50% until the derived-plan documents are read**, which is a
document-extraction programme, not a data pull. **We stopped here deliberately** — the next real
gain is a different kind of work, and it should be justified on its own.

---

## 2 — THE NUMBER (and why it is exactly this)

```
end-to-end = clau coverage × layers 1–3 × layer 5 (height) × layer 6 (geometry)
           =     53.5%     ×    94.7%   ×      94.0%       ×      98.5%   = 46.9%
```

- **46.9%** = full-envelope resolution of **private buildable** clicks.
- **12.7%** = full-envelope of **ALL** clicks (only 27.1% of the city is private buildable).
- **91.7%** = clicks that get a **true answer OR a correct cited refusal**.
- **~48%** = the ceiling if 22a lands its regime-neutral half and bare-20a is sourced.
- **The three layer terms (94.7 × 94.0 × 98.5 = 87.7%) are near their practical ceiling.** The number
  is now a **clau-coverage** story, and clau coverage is capped by the derived-planning wall.

**Denominators are not interchangeable. State which you mean, every time.** See
`BARCELONA-REASONING-RECORD.md` Part 2 for the full ladder and the day it went 5.8% → 46.9%.

---

## 3 — BLOCKERS (in priority order)

### 3.1 — 🔴 THE WALL: derived-plan parameters are in documents, not data

- **What it is.** 62.8% of Barcelona is `PLAN='PD*'` (derived planning). **2,595 instruments**, back
  to 1956. Their buildable numbers are not in any queryable layer.
- **Why it blocks.** A full envelope needs the numbers (height, FAR, band). The register gives us
  identity + approval date + a `URL`, never parameters. The `URL` → an AngularJS SPA fitxa page whose
  documents load from a backend; for old plans they are **scans**.
- **What we measured (so nobody re-hopes).** The one AMB layer with parameters (`sectors_refos/9`)
  covers **76 sectors = 1.2 M m² = ~1.9% of the derived-planning land**, and they are recent Poblenou
  PMU regeneration sectors, **not** the historical instruments. `L-590c` §11.
- **What would unblock it, in ascending cost:**
  1. **A structured export of the derived-plan parameters** — if the Ajuntament PIU backend (the SPA
     the fitxa page calls) exposes a JSON API with per-plan `alçada` / `edificabilitat` fields.
     **NOT YET ENUMERATED.** ← *cheapest possible win; check this first (§8).*
  2. The **RPUC** publishing instrument text as data rather than scans. **Expert opinion: expected to
     be scans, not verified.** One direct RPUC record lookup settles it.
  3. An **OCR / document-understanding pipeline** over the scanned instruments. Years, or an
     LLM-extraction programme. **The honest cost of "80%".**
- **THE EXACT RESUME STEP.** Open the network tab (or curl the XHR) that
  `https://ajuntament.barcelona.cat/informaciourbanistica/cerca/ca/fitxa/LC084/--/--/ap/`
  fires on load. If it returns JSON with numeric planning fields, blocker (1) is open and the path to
  ~80% shortens dramatically. If it returns document links to PDFs/scans, we are on path (2)/(3).

### 3.2 — clau 22a (17.5% of private land) — RESOLVED as Art. 350.1; regime-neutral half shipping

- **What it is.** Industrial land. PGM Art. 350 has two regimes; **we proved (8/8 samples, two
  independent services) that 22a here is governed by an approved Pla Parcial ⇒ Art. 350.1**, under
  which the PGM states only FAR (2) + occupation (90% *alineacions de vial* / 70% *aïllada*).
- **Why it does NOT yield the ~15 points once hoped.** Under 350.1 the height and band come from the
  Pla Parcial — i.e. blocker 3.1. So 22a's full envelope is **behind the same wall**.
- **What shipped.** A `regime-undetermined` named refusal + the unconditional FAR (ADR-0276, Track C).
- **Resume step.** When 3.1 opens, 22a becomes a full envelope automatically — the FAR is already in
  hand, only the plan's height is missing.
- **Sources.** `L-590c` (whole file). Expert validation: `L-590c` §10.

### 3.3 — clau 18 (22.5% of private land) — correct refusal, Art. 306 delegates

- **What it is.** The PGM's Art. 306 states no envelope; it delegates to the parcel's own approved
  plan. Our refusal is **correct**.
- **Why it blocks.** Same wall as 3.1 — the envelope is in the plan document.
- **Resume step.** Identical to 3.1. **18 and 22a together are 40% of private buildable land and open
  together the moment the derived-plan parameters become reachable.**

### 3.4 — clau 12b (Ciutat Vella, ~1.8%) — refused; height = mean of neighbours

- **What it is.** The old-town subzone where permitted height **is** the mean height of existing
  neighbouring buildings.
- **Why it blocks.** We do not hold reliable neighbour heights (context heights are 0.9% surveyed).
- **What would unblock it.** **Real LiDAR / surveyed neighbour heights.** ⭐ **This is the ONE zone
  where measuring neighbours is the legal method, not a proxy** — see §4.3. Candidate sources:
  ICGC LiDAR (Catalonia), Barcelona municipal LiDAR, Microsoft ML Building Footprints heights.
- **Resume step.** Acquire a neighbour-height source, wire it as an input to the 12b height
  construction (the construction already knows it needs "mean of neighbours"), and it resolves.

### 3.5 — bare `20a` (~1.8%) — refused; names the zone, not the subzone

- **What it is.** Ten subzones spanning edificabilitat 0.25–1.50; a bare `20a` is an **editorial
  assimilation**, not a real outcome (AMB documents it as such).
- **Why it blocks / what would unblock.** Expert view (validated): **refusing is correct.** A finer
  municipal layer resolving the subzone would help, if one exists. Low value (~1.5 pts) and may not
  be recoverable.
- **Resume step.** If a municipal zoning layer with subzone granularity is found, check it resolves
  the bare-20a polygons; otherwise leave refused.

### 3.6 — 🔴 NEW MANDATORY CHECK before citing any derived plan (from expert review)

- **What it is.** A municipal index can lag the legal record when a plan is **modified, superseded, or
  annulled by a court**. Citing a stale index would be **our** failure.
- **What would satisfy it.** Confirm, from the register itself, that no later modification / annulment
  is recorded before finalising a citation. The AMB expedients layer already carries the fields:
  **`EXP_DEROG`, `VIGENT`, `RECURS_O_SENTENCIA`, `TANCAMENT_OUT`.**
- **Resume step.** When 3.1 opens and we start citing plans, run the annulment check against those
  fields **first**. Likely runnable against data we already reach — **not yet measured.** `L-590c`
  §10.4.

---

## 4 — TRIP-WIRES (if you see this elsewhere, come back HERE)

> These are the whole point of this file. A find in another municipality that matches any line below
> should send you straight back to the matching §3 blocker.

- **4.1 — A structured planning-parameters API.** If ANY Spanish (or other) municipality turns out to
  expose derived-plan `height` / `FAR` / `edificabilitat` as JSON/WFS fields — **come back and test
  whether Barcelona's PIU backend (§3.1 resume step) does the same.** Every Spanish city shares the
  general-plan → derived-plan → register structure; a technique that reads one likely reads all.
- **4.2 — An OCR / document-understanding pipeline that works.** If a Saudi or other pass builds a
  reliable scan-to-parameters extractor, **it is directly reusable on Barcelona's 2,595 scanned
  instruments** (§3.1 path 3). That single capability is the difference between Barcelona's ~48% and
  ~80%.
- **4.3 — A verified LiDAR / surveyed-building-height source.** ⭐ Unblocks **clau 12b** (§3.4), the
  one zone where neighbour heights are the legal input; also gives us the **envelope sanity-check
  alarm** (compare computed height to real neighbours) we do not have today. Candidates worth chasing
  if seen anywhere: **ICGC LiDAR**, Microsoft ML Building Footprints heights.
- **4.4 — A free parcel-boundary / cadastre pattern.** Barcelona uses Catastro (fine). But if another
  jurisdiction forces us to build a "user draws the plot" flow that is good, **that flow is the
  fallback for any city without a free cadastre** — note it here so we don't rebuild it.
- **4.5 — The `parcel → instrument → classification → article` chain, built anywhere.** Today's
  deepest finding (`L-590c` §7) is that the zoning code we read is an *editorial projection* of the
  law, not the law. If another municipality forces us to build the instrument-first chain properly,
  **Barcelona should adopt it** — it is the correct model for the derived-planning 63%.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- **PGM depth construction** (Art. 242, per-block, bisection) — `blockDerivedDepth.ts`. Validated
  0/65 over-stating.
- **Per-edge metric offset / capsule-union erosion** — `insetPolygon.ts`. L-586, 0/65 over-stating.
- **Street-width construction** (Art. 238 governing punctual width) — `streetWidth.ts`. ⭐ **Portable
  to any width-keyed jurisdiction** (candidate for Saudi Arabia).
- **`tiered-occupation` rule kind + `BuildableEnvelope.tiers`** — ADR-0273. For two-tier solids.
- **The registry + three-outcome disposition** (`pack` / `refusal` / `unregistered`) — a new clau or
  city is a *data addition*, not an engine edit. `registry.ts`.
- **The refusal vocabulary** — legal refusal · coverage-gap · construction-incomplete ·
  **regime-undetermined** (ADR-0276). Each is a *positive cited answer*, not a blank.
- **Packed claus:** 13a/13E, 13b, 12, 20a family (10 subzones). 22a = regime-neutral half.
- **The primary source is committed:** `PGM-NNUU-metropolitana.pdf` (MMAMB re-edition). Art. 350
  extracted glyph-by-glyph from p. 116.

---

## 6 — VERIFIED SOURCES (endpoint · answers · tier · query)

| Source | Answers | Tier | Note |
|---|---|---|---|
| **AMB `qualificacio_refos/16` (`QU_Trames`)** `geoportal.amb.cat/geoserveis/rest/services` | clau, `PLAN` (PG/PD*), area per parcel | **VERIFIED-LIVE** | ⚠ path is **`/geoserveis/`**, NOT `/arcgis/` (which 301s to a notice) |
| **AMB `expedients_refos/1` (`Expedients_Etiquetes`)** | WHICH instrument governs · `DAPRDEF` (definitive-approval date) · `TIPUSASS` · `VIGENT` · `EXP_DEROG` · `URL` | **VERIFIED-LIVE** | ⭐ the index. `TIPUSASS 251 = Pla Parcial` (inferred from names, not a code table) |
| **AMB `sectors_refos/9` (`SECT_Trames`)** | `IE_BR`, `ST_TOTAL`, `N_H`, `US` — buildability params | **VERIFIED-LIVE** | ⚠ filter on **`CODIS_INE`** (plural); `CODI_INE` is rejected → false zero. Only 76 Barcelona sectors |
| **BCN municipal WMS** `w133.bcn.cat/WMSURBANISME` | per-parcel `CODI_PLA`, `DATA_AD`, `TEMATICA`, free-text `ALCADES` | **AGENT-VERIFIED-LIVE** (I could not reach it myself — connection reset) | *"informatiu, no normatiu"* → **index only, never cite as authority** |
| **MUC** `sig.gencat.cat/ows/MUC` (WFS 2.0) | clau at a point | **VERIFIED-LIVE** (existing provider) | ⚠ does **NOT** carry Pla-Parcial approval status for Barcelona (0 features; 133 for Sabadell) |
| **RPUC** | the instruments themselves (the AUTHORITY to cite) | **COULD NOT VERIFY form** | expert: likely scans for pre-1970 plans. One record lookup settles it |
| `PGM-NNUU-metropolitana.pdf` (committed) | the PGM articles | **VERIFIED-PRIMARY** (re-typeset re-edition; not certified) | known transcription errors in Arts. 251.3a, 330, 331 |

Full reproduction commands: `L-590c` §8 and §11.7.

---

## 7 — DEAD ENDS (measured; do NOT re-run hoping)

- **`GRAU_DES`** — external analysis called it the highest-value field. **Null on 100% of Barcelona
  22a.** Does not encode approval status. `L-590c` §2.1.
- **`REGIM` / `EXP_PD` / `CLAU_PD`** — named by external analysis; **absent from the AMB
  `QU_Trames` schema.** May exist in a municipal service; unverified. Do not treat absence-here as
  absence-everywhere.
- **MUC for Barcelona Pla-Parcial status** — 0 features. It is a coverage fact (133 for Sabadell),
  not a failed fetch. `L-590c` §10 / Track-B table.
- **`sectors_refos/9` as the 80% path** — refuted: 2% coverage, wrong plans. `L-590c` §11.2.
- **The ~65% ceiling I once quoted** — wrong; assumed 22a resolves through Art. 350.2. It does not.
- **`GRAU_DES` domain decode via the DOGC font** — Identity-H, digits absent from the text stream;
  needs a human read of NNUU pp. 276–277 (the L-597 clau-13 quadres, separate issue).

⚠ **The recurring trap, written once:** a **301 → HTML notice returns HTTP 200 with a body**, and a
**rejected `where`-clause returns zero rows**. Both look like "no data". **Assert on response SHAPE;
run an unfiltered count FIRST.** This cost two external passes a wrong "my tool is blocked" and cost
me a near-published "Barcelona has no sector data". `L-590c` §1, §5.1.

---

## 8 — THE SMALLEST NEXT STEP that moves the number

**Enumerate the Barcelona PIU backend (§3.1 resume step).** One measurement: capture the XHR that the
fitxa SPA fires, and see whether it returns **structured planning parameters** or **document links**.

- **If structured:** blocker 3.1 partially opens, 18 + 22a (40% of private land) come into reach, and
  the same technique likely generalises to every Spanish city. Barcelona's ceiling moves off ~48%.
- **If document links / scans:** the ~80% path is confirmed to be OCR-only, and we should **stop
  spending on Barcelona coverage** and ship the **"point at the governing plan" signpost tier**
  instead (cheap, generalises for free, moves product quality not the resolution number).

**Everything else on Barcelona is either near its ceiling or gated behind this one fact.** Measure it
before scheduling any further Barcelona rule work.

---

**See also:** `BARCELONA-REASONING-RECORD.md` (the full day) · `L-590c-PLA-PARCIAL-REGIME-RESOLVED.md`
(the derived-planning finding + expert validation + the 80% refutation) · `RISK-REGISTER.md` ·
`../../GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` (the jurisdiction axis).
