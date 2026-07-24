# Rate Implementation Plan — Saudi Arabia (`sa`) national

**Current rate:** ~55% (see [`RATE.md`](./RATE.md)) · **Live-reachable-from-here ceiling:** ~55% ·
**Compileable (AMBER) ceiling:** **~72–80%** (reframed — see §0) · **Ceiling with a Balady agreement:**
~72% · **Gap to Denmark (~96%):** ~41 pts · **Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> Model references: **Denmark** [`../dk/`](../dk/RATE-IMPLEMENTATION-PLAN.md) (ceiling, ~96%) ·
> **Barcelona** [`../es/es-ct/08019-barcelona/`](../es/es-ct/08019-barcelona/RATE-IMPLEMENTATION-PLAN.md)
> (the pilot climb). Saudi mirrors the phase SHAPE, not the position: like Barcelona, its reachable
> ceiling ≈ its current rate, so the plan's job is to *realise* the rate as a certified product and to
> name the BLOCKED phases honestly. **New (2026-07-24, spike):**
> [`findings/SAUDI-DATA-RECON-SPIKE.md`](./findings/SAUDI-DATA-RECON-SPIKE.md) reframes the ceiling
> under the green/amber/red model — the exact-vertical source is **open-data-catalogued (AMBER)**, not
> lawyer-gated (RED), which raises the *compileable* ceiling even though nothing new was reached live.

---

## 0 — The three-state model (green / amber / red) and the planning-compiler frame

RATE = "can PRYZM **answer** a parcel automatically?" not "is it in a live database?". Three states:

- **GREEN** — government publishes the numbers as queryable data → automatic today.
- **AMBER** — government publishes the **law or the plan** (PDF / open-data table / GIS layer); PRYZM
  compiles it **once** into a verified, cited rule pack → answers at runtime, no human, no PDF read. A
  PDF or an open dataset is **AMBER, not a blocker** — the cost is one-time structuring, bounded by
  *institutional coverage*, not by parsing.
- **RED** — only a human lawyer can interpret per parcel → the true blocker.

**Saudi under this model.** The footprint (setbacks + coverage — 66.7% of the envelope) is **AMBER,
already compiled** (exact national closed-form, L-606). The 2026-07-24 recon spike found that the two
levers L-606 filed as hard geo-fenced blockers have their **authoritative sources published as OPEN-DATA
datasets** — **"Approved Local, Guideline & Detailed Plans"** (= المخطط المعتمد, the exact-vertical
source, §4 cl.1) and **"Approved Land Subdivision Plans"** (parcel geometry) — catalogued via Balady's
open-data page and served from the SDAIA national portal (`open.data.gov.sa`). **Open data is AMBER
(compile-once), not RED (lawyer-only), and not the licensed GEOSA gate.** So the exact per-zone vertical
value moves from "needs a MOMRAH/Balady **data agreement**" toward "needs the **public open-data portal**
reached + the plan layer digitised" — a categorically cheaper unlock.

**The architecture — a national planning compiler.** Heterogeneous sources (the MOMRAH PDF · SDAIA
open-data plan datasets · Balady ArcGIS · dev-authority design codes · GEOSA context) →
**one versioned, queryable national rule graph** → spatial index → parcel envelope. Balady/28 becomes a
**VERIFICATION oracle** (confirm the compiled answer against the resolved per-parcel fields), not a
runtime dependency. Compiler phases: **national ontology → zone compiler → municipal registry → rule
equivalence → planning-map digitisation → parcel binding** (mapped to the phase tracker below).

**Honest bound.** From *this* environment the spike reached **no** new source that serves dimensional
rules: the SDAIA portal is network-blocked here, Balady/28 is geo-fenced (NXDOMAIN, re-confirmed), GEOSA
publishes only templates to anonymous (licensed), and the reachable RCRC open portal carries **zero**
rule datasets (statistical/transport only). So the **live-reachable-from-here ceiling stays ~55%**; the
**compileable ceiling rises to ~72–80% conditionally**, on evidence that the rule sources are AMBER not
RED — a revision of *classification*, not a claimed live gain. Full evidence + reachability matrix:
[`findings/SAUDI-DATA-RECON-SPIKE.md`](./findings/SAUDI-DATA-RECON-SPIKE.md).

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

**⇒ The live-reachable-from-here ceiling is ~55%** — the footprint is exact and credited, and nothing
reached *this pass* raises it because the two remaining levers were not pullable from here. **But the
2026-07-24 spike reframes the two levers from RED to AMBER** (their sources are open-data-catalogued, not
lawyer-gated), which lifts the **compileable ceiling to ~72–80%** once the SDAIA plan datasets are reached
and digitised:

- **Exact per-zone vertical value** — its source is the **"Approved Local/Guideline/Detailed Plans"**
  open dataset on the SDAIA portal (AMBER), *plus* dev-authority design codes (AMBER PDFs). Previously
  filed as needing a data agreement; now shown to be **open-portal + one-time-compile**.
- **Live per-parcel path** — Balady `MapServer/28` (resolved setbacks + use + floors) is still geo-fenced
  (NXDOMAIN, re-confirmed), and remains the *richest* upstream and a **verification oracle**; but under the
  reframe it is no longer the *only* route — parcel geometry also has an AMBER source in the **"Approved
  Land Subdivision Plans"** open dataset, independent of a Balady agreement.

The ceiling **with a Balady agreement** is still ~72% (a *read* envelope, better than Barcelona). It stays
below Denmark's 96% even then, because the *exact* vertical value genuinely varies by municipal plan (never
a single national number) and GEOSA's national building/terrain products are licensed. This is the honest
gap-to-Denmark: **not a transcription problem — an institutional-coverage + per-municipality-vertical
problem, with the rule sources AMBER (compileable) rather than RED.**

> ⚠ **Honesty (spike, §0):** the compileable-ceiling rise is a revision of *classification* (RED→AMBER),
> not a live gain. From this environment the SDAIA portal is network-blocked, so the AMBER plan datasets
> were **not** pulled. The rise is conditional on (a) reaching the portal from an unblocked egress and (b)
> the plan dataset actually carrying per-zone height/floors — an open lead, not a confirmed field. Height
> caps (villa 14 m / apt 23 m) remain **DISPUTED** and held null (see `sources/VERIFICATION.md`).

---

## 2 — Phase tracker

Status vocabulary is FIXED: **NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A**.
"Rate: from→to" is cumulative. ⚠ Status tracks WORK; the rate only moves when `RATE.md` is re-derived.

Phases are the **planning-compiler** stages: national ontology → zone compiler → municipal registry →
rule equivalence → planning-map digitisation → parcel binding.

| Phase | Compiler stage | Goal | Unlocks | Rate: from→to | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | national ontology | **Assess** — read the primary 2024 MOMRAH decision live (2 hosts); enumerate Balady `MapServer/28` + measure its geo-fence; characterise GEOSA (licensed) + global fallbacks; write `RATE.md` | the honest baseline: exact national footprint (66.7%) + a cited vertical ceiling, all live confirmation geo-fenced | — → ~55% | **VERIFIED** (L-606) | UNASSIGNED |
| **0b** | source recon | **Recon spike** — probe SDAIA open-data, Balady gateway, GEOSA catalog, RCRC/dev-authority + municipal GIS; classify reachable/auth/geo-fenced/licensed/absent on evidence; apply the green/amber/red reframe | the reachability matrix; the RED→AMBER reclassification of the vertical + parcel-geometry sources; the compileable ceiling ~72–80% | ~55% (reframes ceiling, holds rate) | **VERIFIED** (spike, 2026-07-24) | UNASSIGNED |
| **1** | zone compiler | **Ship + certify the national FOOTPRINT pack (the big shippable win)** — wire `saRiyadhDemo.ts` (registry + index + per-city bbox + L5 dispatcher); apply `resolveSaudiSetbacks` (`max(w/5,{3,2,2})`) + per-class `maxCoverage`; vertical held null (DISPUTED caps refuse, C58 §1.13); human `VERIFICATION.md` sign-off (L-449) | the 66.7% national footprint — AMBER, compiled, **country-wide, one formula** — as a **certified structured** answer; pack `estimated-ruleset` → `structured` | ~55% (**realises**, holds) | **IN PROGRESS** (pack authored; wiring TODO; `VERIFICATION.md` FOOTPRINT-confirmed, height DISPUTED) | UNASSIGNED |
| **2** | planning-map digitisation | **Exact vertical value via the SDAIA open "Approved Plans" dataset (AMBER)** — reach `open.data.gov.sa`, read the "Approved Local/Guideline/Detailed Plans" dataset schema; compile per-zone height/floors into the rule graph; cross-check dev-authority (RCRC/ADA) design codes | converts height + floors from bounded-refusal to cited per-zone values | ~55% → ~65% | **BLOCKED-here** on SDAIA network egress (public open portal, **not** a licence) + confirming the dataset carries height/floors | UNASSIGNED |
| **3** | parcel binding | **Live/read per-parcel envelope** — Balady `MapServer/28` (geometry + `MAINLANDUSE` + resolved setbacks + `NOOFFLOORS`) as a *read* envelope + **verification oracle**; OR parcel geometry from the "Approved Land Subdivision Plans" open dataset (agreement-free) | flips Saudi from a constructed demo footprint to a **read/verified** envelope (better than Barcelona) | ~65% → ~72–80% | **BLOCKED** — Balady geo-fenced (agreement/egress); subdivision open dataset = SDAIA egress | UNASSIGNED |
| **muni** | municipal registry | **Per-Amana + dev-authority registry** — enumerate real Amana spatial-portal hosts (Riyadh=`mapservice.alriyadh.gov.sa`, others TBD) + dev-authority regimes (RCRC/ROSHN/NEOM/Diriyah/Qiddiya) as AMBER rule overlays keyed by zone | the §1 cl.3 override surface (the R1 trap) as compiled overlays | (feeds Phase 2) | **NOT STARTED** — some hosts geo-fenced; RCRC *open data* reachable but carries no rules | UNASSIGNED |
| **ctx** | context axis | **Context layers** — global fallbacks (Copernicus GLO-30 DEM; MS/Google ML footprints; OSM) + reachable RCRC ODS transport/demographics; pursue a GEOSA licence for national LoD2/LiDAR | buildings + terrain + transport, separate from the dimensional fill | (separate axis) | **NOT STARTED** (fallbacks + RCRC ODS available); GEOSA **BLOCKED** on a licence | UNASSIGNED |

> ⚠ Phases 0/0b are **VERIFIED**. Phase 1 **realises** ~55% but does not raise it — the number already
> credits the AMBER footprint. Phases 2–3 are the rate-raising phases; the spike reframes them from
> **geo-fence/agreement-BLOCKED (RED)** to **open-portal-AMBER** — the SDAIA plan datasets are a *public
> open portal*, network-blocked from this environment but not licence-gated, so the unlock is egress +
> one-time compile, not a data agreement. Balady/28 stays the richest path and a verification oracle.

---

## 3 — The gap to Denmark (~96%)

Denmark reaches ~96% because its dimensional values are **already digitised into structured national
fields** (Plandata WFS), so almost no query reads a document. Saudi's ~41-pt gap is **not** the Barcelona/
Madrid case (numbers in PDFs needing OCR + parcel-binding). It is a **combination of template cases (b) and
(c)**:

- **(c) A key path is geo-fenced / licence-gated — but the RULE sources are AMBER, not RED.** The live
  per-parcel feed (Balady `MapServer/28`) is geo-fenced; GEOSA's national NSDI is licensed. **But** the
  exact per-zone vertical's *authoritative source* — the "Approved Plans" open dataset — is a **public
  open portal (AMBER)**, network-blocked from this environment yet not licence-gated (spike §0). So the
  dominant half of the gap is removed by **egress + one-time compile**, not necessarily a data agreement —
  the reframe that lifts the compileable ceiling to ~72–80%. It stays below 96% because the exact vertical
  genuinely varies per municipal plan (case (b)) and GEOSA's context products are licensed.
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

**Blockers (each geo-fence measured on shape, not HTTP status — §CONTEXT-DATA-HONESTY; full matrix in
[`findings/SAUDI-DATA-RECON-SPIKE.md`](./findings/SAUDI-DATA-RECON-SPIKE.md) §2):**

- **Phase 1 — human `VERIFICATION.md` sign-off (L-449).** Only the human gate remains before the footprint
  pack ships `structured`. FOOTPRINT fields independently confirmed 2026-07-24; height caps DISPUTED,
  held null. → the one non-geo-fenced blocker.
- **Phase 2 — the exact vertical value (reframed AMBER).** Its authoritative source is the **SDAIA
  "Approved Local/Guideline/Detailed Plans" open dataset** — a *public open portal*, not a licence. From
  this environment `open.data.gov.sa`/`od.data.gov.sa`/`data.gov.sa` **time out / ECONNREFUSED
  (78.93.109.61)** — a network egress block, not a permission gate. Dev-authority codes (`rcrc.gov.sa`
  WAF-rejected; `trc.alriyadh.gov.sa` / `istitlaa.ncc.gov.sa` ECONNREFUSED) are AMBER PDF overlays.
  BLOCKED-here on egress + confirming the dataset carries height/floors.
- **Phase 3 — the live/read parcel feed.** `umapsudp.momrah.gov.sa` **NXDOMAIN (re-confirmed 2026-07-24)**;
  the Balady proxy returns a WAF-200 Arabic apology page. Still the richest upstream (geometry + class +
  width + exact floors in one read) and a **verification oracle** — but no longer the *only* geometry
  route: the "Approved Land Subdivision Plans" open dataset is an agreement-free AMBER alternative.
- **Highest-value unlock (revised).** **Reach the SDAIA open-data portal from an unblocked egress** — it
  is open, not licensed, and holds both the exact-vertical source (Approved Plans) and an agreement-free
  parcel-geometry source (Subdivision Plans). Balady/28 (agreement/egress) is the fallback gold path.
- **Reachable-but-no-rules (recorded so it is not re-chased as a rule source):** `opendata.rcrc.gov.sa`
  (Opendatasoft, 35 datasets, GeoJSON export live) carries **only statistical/transport/demographic**
  data — zero height/FAR/setback/zoning. `apiservices.balady.gov.sa/v1/momrah-services/open-data`
  (reachable, 200/JSON) is the MOMRAH **newsroom**, not datasets. `geocatalog.geoportal.sa/geonetwork`
  (GEOSA) is reachable but publishes only **template records** to anonymous (licensed, empty to public).

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
findings: [`findings/SAUDI-DATA-RECON-SPIKE.md`](./findings/SAUDI-DATA-RECON-SPIKE.md) (2026-07-24 recon +
green/amber/red reframe + reachability matrix),
[`findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md`](./findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md),
`SAUDI-PRIMARY-DECISION-EXTRACT.md`, `SAUDI-UMAPS-API-ENUMERATION.md`; `sources/SOURCES.md`;
`sources/VERIFICATION.md` (height caps DISPUTED — held null).*
