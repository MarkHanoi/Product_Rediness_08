# Rate Implementation Plan — `<JURISDICTION>` (`<iso>`) `<national | city>`

<!-- ────────────────────────────────────────────────────────────────────────────
COPY THIS FILE alongside LEGISLATION-RATE.md. It is the phased TO-DO / tracker that
gets this jurisdiction from its CURRENT legislation rate (see the sibling
LEGISLATION-RATE.md) to the MAXIMUM rate achievable in its scope — which is how the
LEGISLATION axis of the composite master RATE.md (city) / COUNTRY-RATE.md (country)
climbs. The standard is defined in
`docs/04-reference/jurisdictions/README.md` §"RATE-IMPLEMENTATION-PLAN.md".

TWO REFERENCE POINTS, always cite them:
  • CEILING MODEL — DENMARK (~96%). Denmark shows what "fully structured" looks
    like: national Plandata delivers zone + numeric density + height as machine-
    readable fields, so almost no query needs to read a PDF. Denmark is the proof
    that ~96% is REACHABLE when the numbers are digitised into structured fields.
  • PILOT MODEL — BARCELONA (first pilot city). Barcelona is the proven CLIMB: a
    phased roadmap (registry → per-clau packs → block-derived construction →
    refusal vocabulary) taking coverage from a low base to constructed envelopes
    on most of the city. Mirror its phase SHAPE (each phase names a rate delta,
    an effort, and a status), not its numbers.

⚠ THE CEILING IS NOT ALWAYS 96%. Denmark hits ~96% because its numbers EXIST as
structured data. A jurisdiction whose numbers live only in ordinance PDFs has a
LOWER structural ceiling UNLESS an OCR/transcription pipeline is built — and even
then the human-verification gate (L-449) caps how fast it climbs. State this
jurisdiction's REALISTIC ceiling and WHY, honestly. A plan that promises 96%
where the data cannot support it is the same dishonesty LEGISLATION-RATE.md forbids.

⚠ NEVER mark a phase SHIPPED/VERIFIED on this doc as a way of claiming a rate.
The rate only moves when LEGISLATION-RATE.md is re-derived from real checks. Status
here tracks WORK; LEGISLATION-RATE.md tracks the MEASUREMENT. Keep them distinct.
──────────────────────────────────────────────────────────────────────────── -->

**Current rate:** `<NN>%` (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)) · **Realistic ceiling:** `<MM>%` ·
**Gap to ceiling:** `<MM−NN> pts` · **Gap to Denmark (~96%):** `<96−NN> pts` ·
**Last updated:** `<YYYY-MM-DD>` · **Owner:** `<UNASSIGNED>`

---

## 1 — The ceiling: what "maximum" means here

<!-- 1–2 paragraphs. What is the highest rate this jurisdiction can reach, and what SETS that limit?
     Is it Denmark-like (numbers already structured → ceiling near 96%, the work is ingestion), or
     is it PDF-bound (numbers only in ordinance text → ceiling capped until a transcription pipeline
     + human gate exists)? Name the single structural fact that decides it. If the jurisdiction is
     unresearched, say "ceiling not yet established — Phase 0 is the assessment itself." -->

---

## 2 — Phase tracker

<!-- The to-do list. One row per phase. Rate delta = the honest estimated jump in the LEGISLATION-RATE.md
     number when this phase lands (NOT a claim it has landed). Status vocabulary is FIXED — use exactly
     these so a reader can scan every jurisdiction's plans the same way:
        NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED (code done, rate not re-measured) ·
        VERIFIED (rate re-derived in LEGISLATION-RATE.md and confirmed) · N/A (not applicable here)
     "Rate: from→to" is cumulative across phases. -->

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — direct endpoint/schema checks; write LEGISLATION-RATE.md | the honest baseline number | — → `<NN>%` | | | |
| **1** | | | `<NN>` → `<..>%` | | NOT STARTED | UNASSIGNED |
| **2** | | | | | NOT STARTED | UNASSIGNED |
| **3** | | | → `<MM>%` (ceiling) | | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

<!-- What structurally separates this jurisdiction from the 96% ceiling model? Usually one of:
     (a) numbers are in PDFs not structured fields (needs transcription + L-449 gate);
     (b) delivery is fragmented across N municipalities (needs N endpoints, one reader);
     (c) a key layer is licence-gated or geo-fenced (needs an agreement / in-region access).
     Name which, with evidence. This is the honest reason the ceiling may be below 96%. -->

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

<!-- What must exist first (a contract, an ADR, a shared tool like streetWidth.ts or the OCR
     pipeline). What is BLOCKED and on what. What work here also helps another jurisdiction (a
     transcription pipeline, a shared schema) — the reuse that makes the corpus cheaper than N
     separate builds. Link the L-NNN items in ISSUE-LOG.md where they exist. -->

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona**
`../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance),
**ADR-0269** (curate-then-serve), **L-449** (human-verification gate).*
