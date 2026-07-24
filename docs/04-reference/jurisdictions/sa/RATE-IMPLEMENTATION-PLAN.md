# Rate Implementation Plan — Saudi Arabia (`sa`) national

**Current rate:** ~55% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling (reachable from outside SA):**
~55% · **Ceiling with a geo-fence break (BLOCKED):** ~72% · **Gap to reachable ceiling:** ~0 pts (the
work is REALISING the 55, not raising it) · **Gap to Denmark (~96%):** ~41 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> Model references: **Denmark** [`../dk/`](../dk/RATE-IMPLEMENTATION-PLAN.md) (ceiling, ~96%) ·
> **Barcelona** [`../es/es-ct/08019-barcelona/`](../es/es-ct/08019-barcelona/RATE-IMPLEMENTATION-PLAN.md)
> (the pilot climb). Saudi mirrors the phase SHAPE, not the position: like Barcelona, its reachable
> ceiling ≈ its current rate, so the plan's job is to *realise* the rate as a certified product and to
> name the BLOCKED phases honestly.

---

## 1 — The ceiling: what "maximum" means here

Saudi Arabia is **neither Denmark-like nor purely PDF-bound — it is a GEO-FENCE-bound jurisdiction**, and
that single structural fact sets the ceiling. Two levers separate the current ~55% from Denmark's ~96%,
and **both are geo-fenced, not PDF-locked**:

1. **The footprint rule is already exact and already credited.** Setbacks + ground coverage (4 of the 6
   governing envelope fields — 66.7%) are a *published national closed-form* in the 2024 MOMRAH decision
   (`plot ⊖ max(streetWidth/5, {3,2,2})`, capped by `coverage × plotArea`), read live on two government
   hosts. There is no OCR wall and no envelope construction here — unlike Barcelona's Art. 242 depth build
   or Norway's `BestemmelseUtnyttingsgrad` prose. So the ~55% **already fully credits the footprint**;
   shipping it does not raise the number, it *realises* it as a certified structured answer.

2. **Every lever ABOVE ~55% is behind a geo-fence, not a PDF.** The exact per-zone vertical value (height +
   floors beneath the national ceiling) defers to the municipal approved plan (المخطط المعتمد, §4 cl. 1)
   and is overridden by development authorities (§1 cl. 3); the entire live per-parcel path (geometry,
   `MAINLANDUSE`, street width, resolved setbacks, `NOOFFLOORS`) lives inside the Balady `MapServer/28`
   service. Both are **measured geo-fences** — NXDOMAIN on the ArcGIS host, a WAF-200 apology page on the
   proxy, RCRC/ADA hosts ECONNREFUSED/WAF-rejected — asserted on *shape*, not HTTP status. This is a
   §CONTEXT-DATA-HONESTY measured-negative-on-shape, **not** proof of absence.

**⇒ The realistic ceiling reachable from outside SA is ~55%** — the footprint is exact and credited, and
nothing reachable raises it because the two remaining levers are geo-fenced. The ceiling **with a
geo-fence break** (an in-SA egress or a MOMRAH/Balady data agreement) is **~72%** — toward Madrid's band —
because Balady already carries setbacks + use + floors *resolved per parcel*, so Saudi would flip from a
constructed demo footprint to a **read** envelope, a better data position than Barcelona. It stays below
Denmark's 96% even then, because the *exact* vertical value still varies by municipal plan (never a single
national number) and GEOSA's national building/terrain products are licensed, not open. This is the honest
gap-to-Denmark: **not a transcription problem — a geo-fence + a per-municipality-vertical problem.**

---

## 2 — Phase tracker

Status vocabulary is FIXED: **NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A**.
"Rate: from→to" is cumulative. ⚠ Status tracks WORK; the rate only moves when `RATE.md` is re-derived.

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | **Assess** — read the primary 2024 MOMRAH decision live (2 hosts); enumerate Balady `MapServer/28` + measure its geo-fence on shape; characterise GEOSA (licensed) + the global context fallbacks; write `RATE.md` | the honest baseline: exact national footprint (66.7%) + a cited vertical ceiling, all live confirmation geo-fenced | — → ~55% | Done (L-606) | **VERIFIED** | UNASSIGNED |
| **1** | **Ship + certify the national FOOTPRINT pack (the big shippable win)** — wire `saRiyadhDemo.ts` (registry + index + per-city bbox + L5 dispatcher, the WIRING TODO); apply `resolveSaudiSetbacks` (`max(w/5,{3,2,2})`) + per-class `maxCoverage`; national vertical ceiling as a field-level BOUNDED cited-null refusal (C58 §1.13); human `VERIFICATION.md` sign-off (L-449) | the 66.7% national footprint — 4 of 6 fields, exact, **country-wide, one formula** — as a **certified structured** answer; pack `estimated-ruleset` → `structured` | ~55% (**realises**, holds) | Low — pack authored; wiring + one human sign-off | **IN PROGRESS** (pack authored L-606; wiring TODO; `VERIFICATION.md` unsigned) | UNASSIGNED |
| **2** | **Exact vertical value** — read the per-zone exact floors/height (the value *beneath* the national ceiling) from the Amana approved plans + RCRC/ADA corridor tables | converts height + floors (2 of 6 fields) from bounded-refusal to cited per-zone values (esp. the apartment 23 m band) | ~55% → ~62% | Medium (in-SA read; assert on content) | **BLOCKED** on an in-SA egress or a MOMRAH/RCRC agreement (every source geo-fenced, L-606 §4) | UNASSIGNED |
| **3** | **Live per-parcel feed** — reach Balady `MapServer/28`: geometry + `MAINLANDUSE` + resolved `FRONT/REAR/SIDEDEFECTION` + `NOOFFLOORS` per parcel | flips Saudi from a constructed demo footprint to a **read** envelope (better than Barcelona); live classification + street width + exact floors | ~62% → ~72% (toward Madrid's band) | High — **business/legal, not engineering** | **BLOCKED** on the same geo-fence (in-SA egress / MOMRAH-Balady data agreement / Saudi-resident egress) | UNASSIGNED |
| **ctx** | **Context layers** — wire the reachable global fallbacks (Copernicus GLO-30 DEM; Microsoft/Google ML building footprints, KSA covered); pursue a GEOSA National Geoportal licence for national LoD2/LiDAR | the context axis (buildings + terrain), separate from the dimensional fill | (separate axis) | Low (fallbacks) / High (GEOSA licence) | **NOT STARTED** (fallbacks available); GEOSA **BLOCKED** on a licence agreement | UNASSIGNED |

> ⚠ Phase 0 is **VERIFIED** (`RATE.md` derived from live reads + measured geo-fences). Phase 1 **realises**
> ~55% as a certified product but does not raise it — the number already credits the exact footprint.
> Phases 2–3 are the only rate-raising phases, and **both are BLOCKED on a geo-fence break**, a business/
> legal unlock rather than engineering.

---

## 3 — The gap to Denmark (~96%)

Denmark reaches ~96% because its dimensional values are **already digitised into structured national
fields** (Plandata WFS), so almost no query reads a document. Saudi's ~41-pt gap is **not** the Barcelona/
Madrid case (numbers in PDFs needing OCR + parcel-binding). It is a **combination of template cases (b) and
(c)**:

- **(c) A key path is geo-fenced / licence-gated.** The live per-parcel feed (Balady `MapServer/28`) and
  the exact per-zone vertical (municipal plans + RCRC/ADA tables) are reachable only from inside SA or under
  a data agreement; GEOSA's national NSDI is licensed, not open. This is the dominant half of the gap and it
  is removed by an *agreement*, not by engineering — the honest reason even the geo-fence-broken ceiling is
  ~72%, not 96%.
- **(b) The exact vertical is fragmented across N municipalities/authorities.** Unlike the footprint (one
  national formula, all Amanas), the exact height/floors is per-Amana + per-development-authority — so even
  fully reachable it needs many endpoints, one reader, and never collapses to a single national number.

The footprint half is *already* Denmark-like in shape (exact, national, structured) — Saudi's problem is
uniquely that its **best data (Balady, resolved per parcel) is the least reachable**. That inversion is the
whole story: Barcelona has the data and not the rule; Saudi has the rule (and, behind the fence, the data
too) but cannot reach the data from here.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Depends on / already built (do not rebuild):**

- `packages/site-parcel-data/src/rulepacks/saRiyadhDemo.ts` (authored, L-606) + `resolveSaudiSetbacks`
  (the width→triple resolver) — mapped onto the existing `setback` kind + `maxCoverage`, **no new
  `GeometricRule` schema kind** (the `esBarcelona20aAillada` precedent). The pack is **city-agnostic**: the
  same national footprint serves Riyadh, Jeddah, and Dammam with only a per-city bbox differing.
- `streetWidth.ts` conceptually ports (Saudi عرض الشارع = frontage-to-frontage) but has **no inputs** on
  the gated path (it needs Balady parcel rings); the demo takes the width from the user (L-606 §3).
  `blockDerivedDepth.ts` does **NOT** port (Saudi uses flat coverage %, no Art-242 free-space build).

**Blockers (each geo-fence measured on shape, not HTTP status — §CONTEXT-DATA-HONESTY):**

- **Phase 1 — human `VERIFICATION.md` sign-off (L-449).** The machine clause-transcription is done
  (L-606 §4b); only the human gate remains before the footprint pack ships `structured`. → the one
  non-geo-fenced blocker.
- **Phase 2 — the exact vertical value.** `trc.alriyadh.gov.sa` ECONNREFUSED; `rcrc.gov.sa` WAF-rejected;
  `istitlaa.ncc.gov.sa` ECONNREFUSED. BLOCKED on an in-SA read.
- **Phase 3 — the live parcel feed.** `umapsudp.momrah.gov.sa` NXDOMAIN; the Balady proxy returns a
  WAF-200 Arabic apology page. BLOCKED on an in-SA egress or a MOMRAH/Balady data agreement — the
  **single highest-value unlock** (it delivers geometry + class + width + exact floors in one step).

**Cross-jurisdiction reuse (why this is cheap breadth):**

- **The residential rule is ONE national document, kingdom-wide** (Section 1 binds all Amanas) — a far
  stronger structural position than Norway's 357 kommuner or Germany's 16 Länder. One footprint pack
  covers the whole country; the per-city work is a bbox + the local vertical/heritage overlay.
- **The footprint pack + `resolveSaudiSetbacks` is the reusable core** — Riyadh (authored), Jeddah, and
  Dammam all reuse it unchanged; only the override/heritage overlays differ per city.
- **The measured-geo-fence discipline** (assert on content-type + body, not HTTP 200) is the reusable
  honesty pattern for any jurisdiction with a WAF-200 or split-horizon backend.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona**
`../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance §1.2/§1.4,
field-level bounded refusal §1.13), **ADR-0269** (curate-then-serve), **ADR-0270** (rule kind =
`setback`), **L-449** (human-verification gate), **L-606** (Riyadh pack + the geo-fence probes). Source
findings: [`findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md`](./findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md),
`SAUDI-PRIMARY-DECISION-EXTRACT.md`, `SAUDI-UMAPS-API-ENUMERATION.md`; `sources/SOURCES.md`;
`sources/VERIFICATION.md`.*
