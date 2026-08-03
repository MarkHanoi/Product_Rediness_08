# ADR-0296 — "Not published" is a claim about our SEARCH, not about the world

**Status:** Accepted · **Date:** 2026-08-03 · **Extends:** ADR-0290 (exhaust authoritative sources
before engineering a derived solution), ADR-0292 (no tool reports a result it cannot verify against
external ground truth) · **Binds:** C62 §1.7 · **Standard:**
`docs/04-reference/standards/DISCOVERY-EXHAUSTION-STANDARD.md`

## Context — the measurement that forced this

Between 2026-08-02 and 2026-08-03, **nine of fourteen** standing "the authority does not publish
this" blockers across Balears, Canarias, Barcelona and Huesca were overturned. **Not one** was
overturned because a publisher released new data. Every one fell because the discovery method that
produced the negative was incomplete.

The five that carried the most weight:

| Recorded conclusion | What was actually true |
|---|---|
| Zaragoza: *"the polygon carries `A1` without its subgrado; a 28-typename sweep returned HTTP 400 on all 28"* | `urbanismo:Calificaciones_Urbanas` answered HTTP 200 and always had — 7,967 polygons, all four article selectors populated. The eight A1/* grades sum to **exactly** the coarse layer's 1,325. |
| València: blocked, *"89.81% of registers are scans"* | That measured **ordenanza documents**. The city publishes `PGOU - Alineaciones` (layer 212) as ArcGIS REST / GeoJSON / WFS / WMS / CSV. Frontage sits **0.004 m** from it vs **8.854 m** from the street axis. |
| Córdoba: *"no alignment layer exists"* (105 WFS + 119 WMS + 15 services enumerated) | True of services, and **irrelevant** — the PGOU puts the alignment on a plan sheet. 49/49 sheets are vector CAD: 1,332,794 path objects, **zero raster**, georeferenced off a printed UTM graticule to **0.018 m**. |
| Huesca: *"all paint colours on all sampled sheets are greyscale"* | A colour-blind extractor. Colour-aware recount: **1,595 / 3,020** non-grey stroke items, **41 / 39** distinct stroke classes. |
| Barcelona `CLOSURE-REGISTER`: the ~37–38% ceiling holds because the `structured` tier needs *"the authority publishing its numbers AS DATA … Barcelona does neither"* | `QUA_13TF_pol_CN` publishes *fondària edificable* as **3,127 points**. PRYZM **constructs** a number the authority publishes. |

The failure is one shape, not five: **negative evidence obtained through an incomplete discovery
method**. And it is uniquely durable, because **refusing looks safe** — it raises no error, breaks no
test and draws no complaint, so nobody re-tests it.

⚠ The mirror defect also occurred and is recorded here deliberately: I asserted that
`packages/ordinance-extraction/src/ingest/decodeText.ts` existed and briefed three agents to reuse
it. It does not exist. A false **positive** capability claim propagates the same way a false negative
does, and for the same reason — nobody verified.

## Decision

1. **An absence is a typed claim carrying a discovery-confidence token** — `VALIDATED` / `STRONG` /
   `UNVERIFIED` (C62 §1.7). A bare "not available" is not a permitted value anywhere in the system.
2. **A conclusion of absence may not be recorded** until every applicable discovery stage for that
   platform has either succeeded, failed **with evidence**, or been ruled inapplicable **with a
   stated reason**.
3. **Mandatory evidence**: full search log with HTTP status *and* byte count; a **positive control**
   proving the mechanism works; a **negative control** proving the filter discriminates; a committed
   re-runnable probe; and `failed` distinguishable from `empty` in the output.
4. **`UNVERIFIED` is technical debt, not a closed question.** It schedules a re-audit.
5. Four inferences are **banned as evidence of absence**:
   - a failed guess (HTTP 400 from a WFS is evidence about the guess, not the city);
   - an advertised inventory (`GetCapabilities` is a *publication choice* — Zaragoza advertises 178
     typenames and omits the one that mattered; only `DescribeLayer` enumerated all 47, **25
     unadvertised**);
   - absence in one artefact class generalised to the jurisdiction;
   - a fabricated URL that 404s — that **manufactures** evidence of absence.
6. **Availability is not a status code.** Madrid's CE plan sheets return HTTP 200 with 2,303 bytes of
   *"Servicio No Disponible"* HTML; BOCM's structured channel returns 200, well-formed, carrying
   **0.27%** of the document. Verify magic bytes and assert length parity against the primary artefact.

## Consequences

- Every existing absence conclusion is re-classified A (validated) / B (strong) / C (re-audit) /
  D (already false). Anything never independently re-tested defaults to **C**.
- The 20-entry false-negative taxonomy in the standard becomes the regression-test backlog — each
  entry names the fix and the test that pins it.
- Cost: discovery gets slower and more expensive per jurisdiction. That is the intended trade. A
  false absence is silent and permanent; a slow search is neither.
- ⚠ This ADR does **not** license optimism. The opposite error — asserting a datum the authority did
  not publish — remains the L-616 overstatement and is worse, because it is visible on real land.
  Refusals that survive the standard are **correct outcomes**, e.g. Huesca's georeference (no
  `/Measure`, `/VP`, `/GPTS`, `/Neatline`, no world file, zero OCGs) and Madrid NZ-1's height
  (Art. 8.1.15.1 — CPPHAN-discretionary, so no engineering can supply it).
