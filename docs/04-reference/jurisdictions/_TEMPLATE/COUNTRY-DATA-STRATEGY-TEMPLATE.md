# Country Data Strategy — `<COUNTRY>` (`<iso2>`)

<!-- ═══════════════════════════════════════════════════════════════════════════════════════════════
COPY THIS FILE to `docs/04-reference/jurisdictions/<iso2>/COUNTRY-DATA-STRATEGY.md` when opening a new
country. It is the REUSABLE, COUNTRY-AGNOSTIC evaluation framework: the fixed method for deciding, for
ANY country, how much of "what can I build on this parcel?" we can answer from data, what is stuck in
legal text, and the honest ceiling of automation. It sits ABOVE the two per-jurisdiction trackers:

  • RATE.md                     — the single measured NUMBER (structured dimensional fill rate).
  • RATE-IMPLEMENTATION-PLAN.md — the phased climb of that number.
  • COUNTRY-DATA-STRATEGY.md    — THIS: the reasoning that produces both, the same way in every country.

It does NOT duplicate the extraction pipeline (that is the horizontal engine, spec'd once in
`docs/04-reference/ORDINANCE-EXTRACTION-PIPELINE.md`) — it is the COUNTRY-LEVEL decision layer that
decides WHETHER, WHERE and HOW MUCH to point that engine.

Fill every `<…>`. Delete no honesty rule. The whole value of this template is that Norway, Germany, the
Netherlands, France and Spain are all evaluated by the IDENTICAL seven-step method, so their numbers are
comparable and their ceilings are honest.
═══════════════════════════════════════════════════════════════════════════════════════════════ -->

**Country:** `<COUNTRY>` · **ISO 3166-1:** `<ISO2>` · **National join key:** `<INSEE / INE / kommunenr / AGS / …>` ·
**Legal-plan unit:** `<PLU/PLUi (FR) · PGOU (ES) · kommuneplan (NO) · Bebauungsplan (DE) · omgevingsplan (NL)>` ·
**Fragmentation:** `<N municipalities / M plan-authorities>` ·
**Proven-minimum rate:** `<NN%>` (see `RATE.md`) · **Realistic ceiling:** `<MM%>` · **Last updated:** `<YYYY-MM-DD>` · **Owner:** `<UNASSIGNED>`

> **The question this country must answer, per parcel:** zone/use · a density metric
> (FAR / coverage / BYA-BRA / %-utilisation) · height · setbacks. The rate is *how many parcels get all
> of those as machine-readable data, with no human opening a PDF.* Same ruler in every country.

---

## Step (a) — Inventory every authoritative machine-readable dataset

<!-- List EVERY government/authoritative dataset that touches a buildable-envelope question, whether or
not it carries the numbers. Probe each LIVE (assert on Content-Type + body — a reputation is not a probe;
PROBE-DISCIPLINE.md). "Structured?" = does it deliver a numeric BUILDING PARAMETER, or only geometry /
a code / a PDF link? Most countries have rich geometry + zoning-code coverage and a numeric hole — name
the hole explicitly. -->

| Layer | Authoritative source + endpoint | Licence | Live-probe result (date · sample field=value) | Delivers a numeric building param? |
|---|---|---|---|---|
| Parcel geometry | `<endpoint>` | `<open/ODbL/geo-fenced>` | `<probed: field=value>` | geometry only |
| Zoning code + plan link | `<endpoint>` | `<…>` | `<probed: zone=…, pdf=…>` | ❌ code + PDF link, no numbers |
| Structured numeric rules (if any) | `<national table? / per-municipality portal? / none>` | `<…>` | `<probed / ABSENT>` | `<✅ / ❌ / partial>` |
| Overlays — heritage / flood / environment (SUP-equivalent) | `<endpoint>` | `<…>` | `<probed: N overlays>` | overlay geometry (discretionary rule stays in text) |
| Context buildings + height | `<endpoint>` | `<…>` | `<probed: height=…>` | ✅ existing-building height (context, not rule) |
| Terrain (DTM/DSM/LiDAR) | `<endpoint>` | `<…>` | `<coverage %>` | datum only |

**Two-denominator note (mandatory).** State the **zone-identification** coverage AND the **numeric-fill**
coverage separately — they are almost always very different, and quoting the first as the headline is the
§CONTEXT-DATA-HONESTY failure. `<Country> answers "which zone" for ~<XX>% of parcels but "what numbers"
for ~<NN>%.`

---

## Step (b) — Measure how many parcel questions the data answers DIRECTLY

<!-- The field-by-field derivation of the RATE.md headline. One row per governing field. "Score" is the
fraction of parcels that field is machine-readable for. The headline rate is a weighted read of THIS
table — never a separate guess. Re-derive from real checks; no research ⇒ no number ("NOT YET ASSESSED").
Keep the benchmark row set (Denmark ~96 · Madrid ~68 · Saudi ~55 · Barcelona ~48 · Norway ~32 ·
Germany ~28 · France ~22) in sync so scores are comparable. -->

| Field | Structured? | Source / where the number actually lives | Coverage | Score |
|---|---|---|---|---|
| Parcel geometry | `<✅/❌>` | `<…>` | `<…>` | `<…>` |
| Zone / use code | `<…>` | `<…>` | `<…>` | `<…>` |
| Density (FAR / coverage / %) | `<…>` | `<… or "n/a — abolished, cite the law">` | `<…>` | `<…>` |
| Max height | `<…>` | `<…>` | `<…>` | `<…>` |
| Setbacks | `<…>` | `<… or "national formula, cite it (e.g. DE Abstandsflächen)">` | `<…>` | `<…>` |
| Overlays (heritage/flood) | `<…>` | `<…>` | `<…>` | `<…>` |
| Existing-building height (context) | `<…>` | `<…>` | `<…>` | `<…>` |

**Composite → headline:** `<show the arithmetic, e.g. (height+coverage+setback)/3 = ~X% for params;
+ zone/parcel identification → practical ~NN%>`. This IS the `RATE.md` headline.

---

## Step (c) — Identify what remains only in legal text

<!-- The gap the data cannot close. For each numeric field NOT structured: WHERE does the number live
(which document type), and WHY (no national table? abolished? graphic-primacy? discretionary?). This is
the input to Step (d): only text-bound numbers need the extraction pipeline. -->

| Numeric field | Lives only in | Why it is not data | Extractable by pipeline? |
|---|---|---|---|
| `<height>` | `<per-municipality règlement/plan PDF>` | `<no national table>` | `<yes — article parser>` |
| `<emprise/coverage>` | `<…>` | `<…>` | `<…>` |
| `<setbacks>` | `<… OR national statute formula>` | `<…>` | `<yes / N/A — it's a formula, code it once>` |
| `<the discretionary layer>` | `<heritage sign-off / graphic plan>` | `<not a number at all — a human judgement / a drawing>` | **NO — refuse, never fabricate** |

**Document-shape count (the depth-vs-breadth lever, `ORDINANCE-EXTRACTION-PIPELINE.md` §6.5).** Classify
this country's plan corpus:

| Shape | Description | This country |
|---|---|---|
| **A** — old scanned typewriter walls | high OCR burden, depth play | `<count / n>` |
| **B** — modern consolidated, clean/born-digital | low burden, high-leverage, transfers | `<count / n>` |
| **C** — a national/general plan governs directly | no pipeline needed, free breadth | `<count / n>` |

---

## Step (d) — Extraction-pipeline design for this country

<!-- HOW the text-bound numbers become data. DO NOT re-spec the pipeline — reference the horizontal core
and state ONLY this country's thin adapter. -->

The shared engine is **`docs/04-reference/ORDINANCE-EXTRACTION-PIPELINE.md`** (`@pryzm/ordinance-extraction`,
Stages 0–6: supersession gate → profile → OCR/text-pull → dual-pass extract → cross-checks →
**L-449 human gate** → emit pack at `pipeline-extracted-unverified`). This country supplies only:

1. **Enumerator** — how to list in-force plan documents + supersession here: `<the register/API>`.
2. **Article/section grammar adapter** — the ONE-PARSER-PER-ARTICLE map from this country's plan
   structure to C58 fields. One parser per rule article, reused across every municipality — NOT one
   reader per plan:
   | Local article/section | Governs | → C58 field |
   |---|---|---|
   | `<e.g. FR Art. 6 / DE §…>` | `<street setback>` | `setback.front_m` |
   | `<Art. 7>` | `<side/rear>` | `setback.side_m/rear_m` |
   | `<Art. 9>` | `<coverage>` | `maxCoverage` |
   | `<Art. 10>` | `<height>` | `maxHeight_m` |
3. **Locale + algorithm-detector settings** — decimal/thousands convention; the phrases that mean "the
   number is a formula/on-a-drawing" → emit `null`/`derived`, **never a number**
   (`ORDINANCE-EXTRACTION-PIPELINE.md` §2 Stage 4).
4. **Efficiency unit** — transcribe at the **plan-authority** level, not the municipality level, where one
   plan governs many municipalities (e.g. FR PLUi → N communes). Prioritise the `<M plan-authorities>`,
   not the `<N municipalities>`. The join key carries the full member list.

⚠ **L-449 gate + `pipeline-extracted-unverified` tier are non-negotiable.** A machine-extracted number
ships permanently BELOW `estimated-ruleset` until a human signs it off in `VERIFICATION.md`. It never
silently graduates (that doc §3).

---

## Step (e) — The green / amber / red model

<!-- The honest tri-state every parcel answer falls into. This is what the UI renders and what the rate
counts. -->

| Band | Meaning | Confidence tier | Counts toward the rate? |
|---|---|---|---|
| 🟢 **GREEN — structured data** | the number is published as a machine-readable field (Denmark-style; or a local portal like Lyon `pluhauteur`) | `structured` | ✅ yes — this IS the rate |
| 🟠 **AMBER — compiled from law** | the number was extracted from the plan PDF (pipeline) or hand-transcribed (curated) and human-verified | `ordinance-pdf` (human) / `pipeline-extracted-unverified` (machine, pre-sign-off) | ✅ once human-verified (L-449); ⚠ shown with a louder "verify against original" affordance until then |
| 🔴 **RED — needs a human / is not a number** | discretionary sign-off (heritage/ABF), graphic-primacy plan, or an unencoded gap | `not-determined` → a cited **refusal** | ❌ no — and correctly so: a refusal is a POSITIVE cited answer, never a fabricated figure (C58 §1.4) |

**The invariant:** RED is never dressed as GREEN. A parcel we cannot answer honestly returns "this needs
the local plan / a heritage sign-off", not a plausible number. A low rate that is all-honest beats a high
rate with one fabricated figure — that single figure is the liability (`ORDINANCE-EXTRACTION-PIPELINE.md`
§3, the legal control).

---

## Step (f) — The honest ceiling method

<!-- How high THIS country can climb, argued in three fixed steps. NEVER claim 100%. -->

1. **Proven minimum = today's measured `RATE.md` number** (`<NN>%`). Green-band only, live-probed. This
   is the floor and it is never inflated by a hypothesis.
2. **NLP / extraction lever = a HYPOTHESIS, stated as conditional.** "IF the extraction pipeline runs on
   `<the N plan-authorities>` at the measured precision, the amber band adds `<+X pts>` → `<~MM%>`." This
   is a projection to be measured empirically (the pilot's precision + confident-wrong rate,
   `ORDINANCE-EXTRACTION-PIPELINE.md` §6.3), **not** a claim it has landed. Say "conditional / projected".
3. **Human-review ceiling ≈ 95–99%, NEVER 100%.** With full structured coverage + extraction + human
   verification, a residuum always remains discretionary and un-automatable: heritage/ABF sign-offs
   (case-by-case judgement, not a number), graphic-primacy plans (a drawing overrides the table),
   genuinely ambiguous or under-appeal instruments. Those resolve to a cited refusal forever. **State the
   country's residuum explicitly** (`<the ~1–5% that stays red and why>`). A doc that promises 100% is
   the dishonesty this whole framework exists to prevent.

| Ceiling step | This country | Basis |
|---|---|---|
| Proven minimum (green today) | `<NN>%` | live-probed |
| + extraction lever (amber, conditional) | `<~MM>%` | projected, measure via pilot |
| Human-review ceiling | `<~95–99>%` | never 100 — residuum: `<…>` |

---

## Step (g) — The multi-source layer harvesting checklist

<!-- The per-parcel harvest. Every structured layer is a SEPARATE query — the base zone query does not
carry overlays, context, or terrain. The overlay/heritage guard is mandatory: a numeric answer produced
without checking the heritage/flood overlay is confidently-wrong and invisible to the engine. -->

- [ ] **Parcel geometry** — `<source>` → the ring the envelope is inset from.
- [ ] **Zoning code + plan document link** — `<source>` → zone id + the PDF/plan reference.
- [ ] **Structured numeric rule** (if the country/portal has one) — `<source>` → height/coverage/setback.
- [ ] **Overlay: heritage / monument perimeter** — `<source>` → **refuse-with-warning on intersection**.
- [ ] **Overlay: flood / risk (PPR-equivalent)** — `<source>` → constraint that can cap or forbid build.
- [ ] **Overlay: environment / protected habitat** — `<source>`.
- [ ] **Context buildings + real height** — `<source>` → LOD1 massing.
- [ ] **Terrain (DTM/DSM/LiDAR)** — `<source>` → the datum height is measured from (heights are relative).
- [ ] **Supersession / in-force check** — `<register>` → never extract from a repealed instrument.

---

## Worked reference — France as an instance of this method

`docs/04-reference/jurisdictions/fr/` applies every step above: (a) IGN GPU + PCI + BD TOPO + SUP
inventoried and live-probed; (b) ~22% numeric fill vs ~95% zone-ID measured; (c) height/emprise/setback
text-bound in per-EPCI PLU règlements; (d) one-parser-per-PLU-article (Art. 6/7/9/10) on the shared core,
transcribed per PLUi (one doc → 58 Lyon communes); (e) Lyon `pluhauteur` = green, transcribed règlements =
amber, ABF/Marseille-graphic = red-refusal; (f) 22% proven → ~30–35% with extraction → never 100% (ABF +
graphic-primacy residuum); (g) the harvesting checklist with the ABF-perimeter guard. Read `fr/RATE.md` +
`fr/RATE-IMPLEMENTATION-PLAN.md` as the filled example.

---

*Governing: **C58** §1.2 (fidelity) / §1.4 (never a guess) / §1.6 (per-field provenance) / §1.11
(granularity) · **ADR-0269** (curate-then-serve) · **L-449** (human-verification gate). Engine:
`../../ORDINANCE-EXTRACTION-PIPELINE.md`. Trackers: `RATE.md`, `RATE-IMPLEMENTATION-PLAN.md`. Aspiration:
`../../PLANNING-COMPILER-NORTH-STAR.md`. Probe discipline: `../../PROBE-DISCIPLINE.md`.*
