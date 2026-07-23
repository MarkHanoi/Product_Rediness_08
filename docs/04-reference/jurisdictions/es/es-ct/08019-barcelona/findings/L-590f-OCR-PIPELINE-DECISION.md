# L-590f — The OCR-pipeline decision: pilot before building

**2026-07-23.** `L-590e` measured that Barcelona's ~48% ceiling is a **scan wall** — the Pla
Parcials governing clau 18 + 22a are 99% pre-1990 and 100% scans, so the only path to ~80% is OCR +
field extraction. This file records the **decision analysis** for whether to build that pipeline,
combining our own measurement with an independent expert review the founder commissioned.

> ## RECOMMENDATION (both our analysis and the external review converge here)
> **Do NOT commit to building the full pipeline yet. Run a stratified, cross-city PILOT first**
> (5–10 documents, Barcelona **and** a Córdoba sample, hand-verified against the source images by
> someone who reads Catalan/Spanish planning docs, deliberately chosen to include the hard cases —
> at least one handwritten page, one table, one photographed/degraded scan). The pilot is days, not
> weeks; it converts our three biggest unknowns (real accuracy, true cost including review labour,
> and whether the capability transfers across cities) from **assumptions into measurements** —
> which is the discipline this entire effort is built on. Going straight to a multi-week build before
> that pilot is the one move that would repeat the mistake the whole project exists to prevent:
> acting on a plausible number instead of a verified one.

---

## 1 — Why this is even a question (our measurement)

- ~63% of Barcelona's buildable land is governed by ~2,600 separate derived plans, not the PGM.
- The register (RPUC) is reachable; **modern** plans return clean text. But the plans capping our
  number are **old (99% pre-1990) and 100% scans** (0 extractable chars, incl. handwritten pages).
- ⇒ **48% is the hard "read-the-data" ceiling. ~80% is OCR-only.** Proven necessary AND sufficient.
- ⭐ **The capability is horizontal:** Córdoba's ordinances are *also* scans (`L-590c`/es-an). Build
  once, potentially unlock many cities — IF the pattern (general plan + old scanned derived plans)
  is common in the rollout. **That "if" is unmeasured and must not carry more weight than it has
  earned.**

## 2 — Feasibility & the failure modes that matter (expert review)

- Typed 1955–1990 pages: commercial OCR ~95%+ char accuracy. The risk is **not** there. It is:
  1. **Tables** (occupation-by-subzone, height-by-street-width) — OCR silently misaligns columns and
     **attaches the right number to the wrong subzone.** A confident, plausible, WRONG answer — the
     exact thing our product exists to avoid. **Highest-risk failure mode.**
  2. **Handwritten marginalia** — where amendments live (someone crossed out "9,15 m", wrote "9,45 m"
     by hand). Worst OCR accuracy, most consequential edits.
  3. **Photographed (not scanned) pages** — skew/shadow/resolution loss; distribution unknown until
     we look.
  4. **Algorithmic rules mistaken for numbers** — an LLM handed our own Art. 242.2 (a *procedure*,
     not a value) will compute and report a number instead of reporting the algorithm. A schema/prompt
     risk that *compounds* OCR error.
- **Fluency is not a confidence signal.** A wrong FAR from a smudged cell reads exactly as
  confidently as a right one. This is the L-526 failure (wrong article, confidently cited) reproduced
  at 2,600-document scale unless an independent check is baked in.

## 3 — The verification design (non-negotiable, treat as a LEGAL control)

- **A permanent new confidence tier below any primary tier** — e.g. `pipeline-extracted-unverified`
  — that never silently graduates. Slots into our existing vocabulary
  (`primary-consolidated | primary-original | secondary | inferred`).
- **Dual-pass agreement** as the cheap first gate (two models / two prompt strategies /
  OCR-then-extract vs. direct-vision-extract): auto-accept only where they agree; route disagreement
  to a human. This is our own "run it twice, compare" discipline turned on the pipeline's own output.
- **Human-in-the-loop for anything that ships as a citable number**, at least until a measured
  precision rate per document-quality tier exists. Verify *every* extraction for the first few
  hundred docs to establish true precision, then sample.
- **Cheap cross-checks** against signals we already hold: our footprint/height data, cadastral floor
  counts, and a sanity bound (does the FAR fall in the 0.2–3.0 range PGM zones actually use?). Catches
  gross errors, not plausible-but-wrong ones.
- **Provenance retention:** store the source-image *crop* beside each value so a human/audit checks in
  seconds. Non-negotiable.
- ⚠ **Run the supersession check FIRST** (`EXP_DEROG`/`VIGENT`/`RECURS_O_SENTENCIA` — `L-590c` §10.4):
  extracting from a superseded document yields a *doubly*-wrong citation (wrong value AND dead
  instrument). Before extraction, not after.

## 4 — Cost & effort (order of magnitude)

- **API spend is NOT the driver:** ~$1,000–2,600 raw OCR for 2,600 docs (~52k pages × ~$0.02–0.05) +
  low-hundreds-to-low-thousands for the LLM extraction pass. Cheap.
- **The real cost is engineering + skilled review labour:** the retrieval chain (scoped, the
  `basica→detall→documents` enumerator is cracked), extraction schema/prompts, disagreement routing,
  confidence-tier plumbing, and **25–40 hours of Catalan-planning-literate review** just to establish
  a precision estimate on ~300–500 docs.
- **Honest estimate:** feasibility pilot = **days**; production-grade pipeline WITH proper
  verification gating = **4–8 weeks eng + an ongoing review burden** for city #1, less for city #2 if
  the *architecture* (not the corpus tuning) transfers.

## 5 — The strategic call: depth vs. breadth (and a false choice inside it)

- Framing it as "80% in Barcelona vs. more cities" may be a **false choice**: if the OCR capability
  is genuinely horizontal, you're not buying +32 points in one city — you're buying an unknown number
  of points across every rollout city with this structural pattern. **Action item: count how many
  cities in the rollout tracker have the "general plan + old scanned derived plans" shape.** Most →
  highest-leverage build available. Just Barcelona+Córdoba → capped, two-city investment, calculus
  much closer.
- **But the transfer claim is unverified** (different archive, scan vintage, language conventions) —
  hence the pilot must include a Córdoba sample to *test* transfer, not assume it.
- **A cheaper breadth exists and must be priced against this:** cities where the general plan governs
  most land directly (no scan wall) may already be near their own ceiling with **zero OCR work**.
  Price "one more directly-governed city" as the real opportunity cost, not "more cities" as a
  monolith.

## 6 — Risks that scale with automation

- **The "informatiu, no normatiu" disclaimer gets SHARPER once we OCR it ourselves.** Today a wrong
  number is shared with the government publisher ("the portal said this"); after our own OCR+LLM, a
  wrong number is **unambiguously our pipeline's error.** Citation language must say
  *"OCR-extracted from [source], not independently verified against original."*
- **Legal exposure scales with volume** — thousands of auto-extracted values reaching architects and
  developers making real building decisions is a systematically-generated liability surface unless
  precision is measured AND disclosed. The confidence tier (§3) is a legal control, not a nicety.
- **Maintenance/staleness:** documents get amended. A one-time OCR pass rots. Need a re-run trigger
  tied to `DAPRDEF`/amendment fields, or an explicit "as of" staleness stamp on every derived value —
  else we ship increasingly-wrong numbers with increasing confidence, silently.

## 7 — The decision, and the next action

**The capability is very likely worth building — but "build it" is not yet a well-formed yes.** The
next action is the **stratified cross-city pilot** (§Recommendation). It is cheap, it directly
answers accuracy + true cost + transfer, and it is the only move consistent with the method that got
us here. Everything needed to run it is now in hand: the cracked `basica→detall→documents` enumerator
(`L-590e`), named 1956–1978 documentIds, and the Córdoba COACo ordinance PDFs (es-an).

**In parallel, ship the cheap win that needs no OCR:** the "point at the governing plan" signpost
tier (governing instrument + approval date + link), powered directly by the same enumerator — it
does not move the resolution number but converts a blank refusal into a cited, navigable answer, and
it generalises to every Spanish city for free.

---

**Related:** `L-590e-RPUC-BARCELONA-CORPUS-MEASUREMENT.md` · `L-590d-RPUC-DOCUMENT-BACKEND.md` ·
`L-590c-PLA-PARCIAL-REGIME-RESOLVED.md` §11 · `../../es-an/14021-cordoba/` (the transfer test case) ·
`NEXT.md` §8.
