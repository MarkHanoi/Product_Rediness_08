# PRYZM ENVELOPE ASSURANCE SPEC — the minimum evidence chain for a published envelope

**Status**: DRAFT · **Created**: 2026-08-09 · **Owner**: founder (accountable) / envelope-compiler programme (operational)
**Domain**: `docs/compliance/` — NEW domain. This is not a derivative of a contract; it is the *assurance view*
of an architecture that C64/C58/C62/C57 already own. Where a contract settles something, this document
**cites and defers**. It restates nothing.

**Reads that bind this document**
[C64 — The Envelope Compiler](../02-decisions/contracts/C64-ENVELOPE-COMPILER.md) (nine layers · resolution order · determination taxonomy · §2.13) ·
[C58 — Zoning Rules & Buildable Envelope](../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) ·
[C57 — Parcel Data Layer](../02-decisions/contracts/C57-PARCEL-DATA-LAYER.md) ·
[C62 — Data Confidence, Provenance & Unknown-Reason Model](../02-decisions/contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md) ·
[C63 — City Completion & Dossier](../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) ·
[C12 — Geospatial](../02-decisions/contracts/C12-GEOSPATIAL.md) ·
[DISCOVERY-EXHAUSTION-STANDARD](../04-reference/standards/DISCOVERY-EXHAUSTION-STANDARD.md) ·
[MACHINE-READABLE-EVIDENCE-REGISTER](../04-reference/standards/MACHINE-READABLE-EVIDENCE-REGISTER.md) ·
[PROBE-DISCIPLINE](../04-reference/standards/PROBE-DISCIPLINE.md) ·
[LEGAL-ATTRIBUTION-MODEL](../04-reference/standards/LEGAL-ATTRIBUTION-MODEL.md) ·
[BLOCKER-CLASSIFICATION-STANDARD](../04-reference/standards/BLOCKER-CLASSIFICATION-STANDARD.md) ·
ADR-0283…ADR-0296.

---

## §0 — THE SEPARATION THIS DOCUMENT EXISTS TO PROTECT

> **ISO controls govern the RELIABILITY OF THE SYSTEM. Envelope-assurance controls govern the VALIDITY OF AN
> INDIVIDUAL ENVELOPE.** — founder ruling, 2026-08-09.

Three consequences, normative:

- **§0.1** — A missing ISO management artefact (management review, competence record, internal-audit
  programme, SoA) **MUST NOT** appear as an envelope refusal reason, in code, in a determination object, or
  in any user-facing card. There is no `unknownReason` value for "our QMS is immature", and there must
  never be one.
- **§0.2** — Conversely, a missing **authoritative source** for a binding variable is an envelope defect
  **regardless** of how complete the paperwork is. A certified ISMS does not upgrade a
  `missing-authoritative-data` determination by one tier (C64 §4.3, ADR-0286).
- **§0.3** — **The compliance programme MUST NOT become a refusal mechanism.** The objective is
  *maximise legally defensible envelope coverage*. Any control proposed here that would reduce the number
  of publishable envelopes without a correctness argument is rejected by construction. Where a control
  both increases assurance and reduces coverage, the coverage cost is stated explicitly in §6 and
  requires a founder decision.

**Classification rule** — every finding in `ISO-GAP-REGISTER.md` carries exactly one of:
`compliance control` · `envelope gate` · `quality improvement` · `administrative evidence`. A finding that
cannot be classified is mis-scoped and is split.

---

## §1 — THE TWELVE-LINK EVIDENCE CHAIN

An envelope is only as defensible as its weakest link. The chain below is the **minimum**; a link marked
BROKEN means no envelope crossing it is publishable as authoritative, whatever the other eleven say.

Per-link status vocabulary: **COMPLETE** (mechanism exists, is reachable in production, and produces a
durable artefact) · **PARTIAL** (mechanism exists but is not universal, not reachable, or produces no
durable artefact) · **BROKEN** (the link is asserted but the mechanism does not operate) · **UNKNOWN**
(not measured — the reason is stated).

⚠ **C64 §2.13 applies to this table.** No coverage or completion percentage is transcribed here. Where a
number is needed, the artefact that computes it is cited:
`tools/city-completion/measurements/*.measurements.json` (five cities present: barcelona, cordoba, madrid,
murcia, valencia) · `tools/city-completion/computeScorecard.mjs` ·
[PEC-EXECUTION-DASHBOARD](../03-execution/plans/PEC-EXECUTION-DASHBOARD.md) ·
[NATIONAL-CAPABILITY-REGISTER](../04-reference/standards/NATIONAL-CAPABILITY-REGISTER.md).

| # | Link | What must be true | Where it lives today | Status | Why |
|---:|---|---|---|---|---|
| **1** | **AUTHORITATIVE SOURCE** | The instrument that governs this parcel is identified: publisher, instrument, version, date in force, geographic extent, and precedence against every other instrument covering the same land. | C64 layer 1 (`LegalStack`); per-city `jurisdictions/**/sources/`; registry declarations in `packages/site-parcel-data/src/rulepacks/registry.ts`. | **PARTIAL** | C64 §3 records **extent** and **disposition** precedence as existing and **instrument** precedence as absent. Where two instruments both cover a parcel, nothing decides which binds — the failure the LEGAL-ATTRIBUTION-MODEL was written for, and that model is **shipped as a typed layer and wired into nothing, deliberately** (its own §8). |
| **2** | **DISCOVERY** | Before any absence is recorded, every applicable discovery strategy has succeeded, failed with evidence, or been ruled inapplicable with a stated reason. | DISCOVERY-EXHAUSTION-STANDARD §1; MACHINE-READABLE-EVIDENCE-REGISTER (mandatory first check). | **PARTIAL** | The standard is normative and demonstrably effective — it overturned nine of fourteen standing "not published" blockers in a day. But it is a **human procedure with no technical enforcement**: nothing in code or CI refuses an absence claim that lacks a recorded exhaustion. |
| **3** | **EVIDENCE** | The response that produced the value is captured: URL, HTTP status, content-type, byte count, retrieval timestamp, and a stored fixture. | Per-city `findings/`; MACHINE-READABLE-EVIDENCE-REGISTER rule 2 (**failure ≠ empty**: 403/499/timeout is `Unknown`, never `No`). | **PARTIAL** | The rule is right and is the single most valuable honesty control in the estate. Enforcement is by review. Fixtures exist per rule-pack test but there is no repository-wide evidence store keyed by parcel, so a published envelope cannot be re-derived from stored inputs years later. |
| **4** | **INTERPRETATION** | Which *correctly read* value binds. Legal status attaches to the **statement**, not the document. | `packages/ordinance-extraction/src/attribution/**` (L2, pure). | **BROKEN as an operating link** | The layer is built, typed and tested and **imported by no production path** (its own status line: *"SHIPPED as a typed layer, WIRED INTO NOTHING (deliberately)"*). Berlin 8-30 (four correct GRZ readings), Madrid NZ 7 (0,5 vs 1,0) and Paris (`plub_filet`/`plub_hauteur`/`plub_hmc`) are the recorded cases with no operating discriminator. |
| **5** | **RULE** | A versioned, per-field-provenanced rule pack, registered to a jurisdiction and zone, whose registration is a deliberate signed act. | `packages/site-parcel-data/src/rulepacks/` (75 files) + `registry.ts` (2,347 LOC). | **COMPLETE** | This is the strongest link in the estate. The registry is **registered-to-refuse by default**: a zone without a signed pack yields a cited refusal rather than a number, precedence is declared (a registered pack beats a refusal classification, and the reason is written down), ambiguity is refused rather than resolved, and the signature is the legal act — *never the wiring*. Verified independently at §7.4 dimension 9 of `ISSUE-LOG.md`. |
| **6** | **INPUTS** | Parcel geometry, frontages, corner status, street widths, terrain and overlays — each with its own CRS, source, licence and retrieval date. | C57 `ParcelProvider`; `packages/site-parcel-data/src/providers/**`; terrain/height bakes. | **PARTIAL** | C57 §1.4 mandates per-parcel provenance and §1.5 mandates honest degradation. But the Catastro path is recorded as collapsing **outage into "no parcel"** (L-771) — the §CONTEXT-DATA-HONESTY failure at the input boundary — while the *zoning* path already has the four-way outcome discriminant that fixes it. The fix is a known transplant, not research. |
| **7** | **DERIVATION** | Every derived value follows C64 §4's single resolution order, with step 0 (*is a method prescribed?*) answered explicitly per city per article and the answer recorded. | C64 §4/§4.1; per-city `findings/`. | **BROKEN as a universal mechanism** | C64 §3 records layers **2 (variable dependency graph), 3 (variable resolution) and 4 (dataset resolver) as absent**: *"every city hand-orders its own path"*. Murcia is the recorded proof of the cost — Art. 4.5.3 **does** prescribe a method and Art. 4.5.4 prescribes a different governing frontage on a corner *solar*; both were missed, both under-granted. |
| **8** | **GEOMETRY** | The solid is constructed by the deterministic engine, intersects **all** derived constraints, and never over-states. | C58 engine; `envelopeToMassingNeverOverstates`. | **COMPLETE for the modelled constraints** | The never-overstate invariant is implemented and gated. ⚠ Its scope is **the constraints that are modelled**. C64 §3.3 states the residual precisely: *an unmodelled downward constraint can only over-state, and is invisible to every metric on the board.* Airport/flood/infrastructure are declared first-class layer-6 variables for exactly this reason; layer 6 is recorded as **one per-city implementation, no generic `min()` composition**. |
| **9** | **CONSTRAINTS** | Heritage, airport, flood, infrastructure and statutory overlays compose downward over the base variables, generically. | C64 layer 6. | **PARTIAL** | See §8. This is the highest-severity *silent* over-statement risk in the chain, because it fails **quietly and in the permissive direction**. |
| **10** | **VALIDATION** | The result is checked against something that cannot share the bug, and the check is run in CI. | PROBE-DISCIPLINE R1/R2; `tools/ga-gate/run-all.ts` (25 gates, incl. zoning-fidelity and height-fidelity); ADR-0292. | **PARTIAL — materially improved 2026-08** | The gate suite was *invoked by nothing* (L-774) and is now **merge-blocking under a shrink-only ratchet** (`.github/workflows/ci.yml:276-307`, `pnpm run ga-gate:all` → `tools/ga-gate/run-all.ts`, §GA-GATE-RATCHET / L-775). `tools/ga-gate/gate-debt.json` declares **16 tolerated failures** — among them `check-zoning-fidelity-label.ts`, `check-xss-guards.ts` and `check-project-isolation.ts`. So: the mechanism is real and can now go red; the debt it tolerates includes the fidelity-honesty gate itself. **See §2.1a.** |
| **11** | **REVIEW** | A human with planning literacy has checked that the cited article actually terminates or governs the parcel. | C64 §2.7 (*the certification gate is a human act, dereferenceable, and machine-signable never*); §5.3. | **BROKEN** | **Refusal correctness has never been measured** — it is asserted (PEC-EXECUTION-DASHBOARD, "REFUSAL CORRECTNESS — NOT MEASURED"; C64 §5.3). An incorrect refusal is a defect of the same class as an over-granted envelope. A refusal audit is commissioned but not executed, and there is no reviewer-of-record field on a published envelope. |
| **12** | **PUBLICATION DECISION** | An explicit, recorded decision that *this* envelope may be shown as authoritative, with the confidence tier that decision carries. | C58 §1.4 fidelity label + CI fidelity-label gate; C62 `ValidationState`. | **PARTIAL** | The *label* is contractually mandated and gated. The *decision* is not an object: there is no per-envelope publication record, no decider, no timestamp, no revocation path. Compounding it, `ESTIMATED_DEFAULT_PACK` still draws a plausible worldwide envelope from placeholder constants and the coverage-gating chrome (`mountSiteEntryPanel`) is **never called** (L-771) — so the honest "not covered" verdict exists, is tested, and no user sees it. |

**Chain verdict** — links 4, 7 and 11 are BROKEN and links 1, 2, 3, 6, 9, 10, 12 are PARTIAL. Links 5 and 8
are COMPLETE and are the assets everything else should be built onto, not around.

---

## §2 — THE TWO QUESTIONS, ANSWERED SEPARATELY

The founder brief requires these never be merged. They are different bars with different owners.

### §2.1 — What must be true to **PUBLISH** an envelope

*Publish* = show it to a user inside PRYZM, labelled with its confidence tier, as PRYZM's best answer.

| # | Precondition | Enforced today by | Enforcement kind |
|---:|---|---|---|
| P1 | The parcel resolves to a jurisdiction with a **registered** rule pack, or the outcome is a cited refusal / typed determination. Never a silent global default. | `registry.ts` precedence + refusal registrations | **technical — operating** |
| P2 | Every published number carries `legal source · computational source · confidence tier`. | C64 §2.3, ADR-0286; `DerivationEntrySchema` | **technical — operating** |
| P3 | The fidelity label is displayed and an `estimated-ruleset` envelope is never rendered as authoritative. | C58 §1.4 + CI fidelity-label gate (L-373) | ⛔ **GATE IS RED AND TOLERATED** — see §2.1a |
| P4 | Unknown is typed, with a reason. No fabricated value fills a slot. | C62 §1.1/§1.7 | **technical — operating** |
| P5 | The solid intersects **all** derived constraints and does not over-state. | `envelopeToMassingNeverOverstates` + ga-gate | **technical — operating, scoped to modelled constraints** |
| P6 | Determination is reported split (envelope + refusal-by-category), never as a bare number. | PEC dashboard rule; C64 §2.12 | **procedural — not technically enforced** |
| P7 | Outside covered jurisdictions the user is told so, before an envelope is drawn. | `SiteEntryPanel` / C60 coverage-gated mode | ❌ **AUTHORED, NOT REACHABLE** (L-771) |
| P8 | An input-source failure is distinguishable from an input-source emptiness. | zoning path: yes (four-way discriminant, merge-blocking test). parcel/Catastro path: **no** | ⚠ **half-operating** |

### §2.1a — ⛔ THE HIGHEST-SEVERITY FINDING IN THIS DOCUMENT

`tools/ga-gate/gate-debt.json` (baselined `2026-08-08`, commit `d0d34999`, *"9 passing / 16 failing"*)
lists **`check-zoning-fidelity-label.ts`** among the 16 gates that **fail today and are tolerated by the
ratchet**.

That gate is the technical enforcement of **C58 §1.4** — *"an estimated envelope is NEVER shown
authoritative"* — which the contract itself designates a CI-gated invariant (L-373). The gate suite going
merge-blocking (L-775) was a large net improvement and correctly chose a ratchet over a big-bang cleanup.
But the consequence, stated plainly, is:

> **The one CI gate that stops a placeholder-derived envelope from being presented as a legal fact is
> currently red, and the build is configured to accept that.**

Also on the tolerated list: **`check-xss-guards.ts`** (a security control) and
**`check-project-isolation.ts`** (the C13 multi-tenant invariant).

⚠ **This is not an argument against the ratchet.** It is an argument that **the ledger needs severity
classes**: a style/debt gate and a *user-facing legal-honesty* gate must not be tolerable on the same
terms. The recommended action is not "fix all 16" — it is **partition `gate-debt.json` into
`tolerable` and `never-tolerable`**, move the fidelity, XSS and isolation gates to `never-tolerable`, and
close those three first. Rule 3 of the ledger's own `$comment` already says adding a line *"is choosing to
ship a known contract violation"* — the missing step is that some violations may not be chosen.

⚠ **The counterpart false-assurance**: `check-otel-spans.ts` is among the **9 passing** gates. It verifies
that spans are *authored*. No provider is registered and no OTLP exporter is in any `package.json`
(`server/telemetry.js:63,104` dynamically imports packages that are not installed), so the spans are
*exported nowhere*. **A green gate is measuring the wrong end of the pipe** — the same shape as
PROBE-DISCIPLINE artefact #1.

**⇒ To publish today, the outstanding items are P3 (the red gate), P7 and P8.** Both are engineering, both are recorded,
both are days-to-a-week. Neither requires new legal research. **Closing them increases publishable
coverage** (P7 by making refusals honest instead of invisible; P8 by stopping an outage from being
recorded as an absence, which is the exact mechanism that produced nine false blockers in the
DISCOVERY-EXHAUSTION-STANDARD's opening paragraph).

### §2.2 — What must be true to **CERTIFY** an envelope

*Certify* = assert to a third party (a client, an insurer, a planning authority, a court) that this
envelope is a defensible statement of what the instrument permits.

| # | Precondition | Status | Owner |
|---:|---|---|---|
| C1 | Every link in §1 is COMPLETE for this parcel — not for the city, for **this parcel**. | ❌ links 4/7/11 broken | programme |
| C2 | The **instrument precedence** question is answered and recorded — which instrument binds, and why not the other. | ❌ C64 layer 1 partial; attribution layer unwired | legal + engineering |
| C3 | The inputs are **re-derivable**: stored fixtures, recorded CRS and transformation, retrieval timestamp, licence. | ⚠ partial — no per-parcel evidence store | engineering |
| C4 | A named, planning-literate human reviewed the citation and signed. **Machine-signable never** (C64 §2.7). | ❌ no reviewer-of-record; no signature object on an envelope | founder |
| C5 | The methodology signature is distinguished from a per-parcel warranty. | ✅ stated (C64 §4.3) | — |
| C6 | Refusal correctness is **measured**, not asserted, at a stated sample and error rate. | ❌ never measured | programme |
| C7 | The version of every rule pack, dataset and code path used is pinned and reproducible from the record. | ⚠ rule packs are versioned in git; the *binding* of a published envelope to a git SHA + dataset version is not recorded | engineering |
| C8 | An issued-authority route exists where the ordinance makes one necessary, and the reachable tier ceiling is stated where it does not. | ⚠ stated per-city in dossiers; not modelled as data | legal |

**⇒ PRYZM cannot certify an envelope today, and should not claim to.** The gap is not primarily
technical — C2, C4, C6 and C8 are legal-and-organisational. The honest external posture is:
*"PRYZM publishes a cited, tiered, refusable determination. It does not issue a certification."*
That posture is already what the code does; it is the *documents and marketing* that must be checked
against it.

---

## §3 — THE INFORMATION-CONTAINER MODEL (feeds the 19650 mapping)

Eight container classes, proposed. Each is a thing PRYZM already produces; naming them is what makes a
19650 mapping possible at all. See `ISO-READINESS-MATRIX.md` §Tier-2 for the ISO 19650 concept mapping.

| Container | Content | Identity today | Revision today | Suitability/status today |
|---|---|---|---|---|
| **SOURCE** | a publisher's dataset or instrument | URL + layer name | publisher's, not tracked | none |
| **EVIDENCE** | a captured response + fixture | path in `findings/` | git | register `Status` (`Use`/`Verified`/`Investigate`/`Closed`…) — **the closest thing to a suitability code in the estate** |
| **RULE** | a versioned rule pack | module id + jurisdiction + zone | git | **signed / registered-to-refuse** — a real two-state gate |
| **GEOMETRY** | parcel, footprint, terrain | parcel ref | none | provider confidence |
| **CONSTRAINT** | a resolved variable + its `DerivationEntry` | variable id | none | C62 confidence tier |
| **ENVELOPE** | `BuildableEnvelope` \| `EnvelopeDetermination` | parcel + run | none | fidelity label |
| **VERIFICATION** | a probe, gate or measurement run | measurements JSON | `measuredAt` | `status: 'measured'` unlocks an axis — **a genuine gate, and documented as un-fakeable** |
| **PUBLICATION** | the decision to show it | ❌ does not exist | ❌ | ❌ |

**The structural finding**: PRYZM has *content* for seven of eight containers and *lifecycle metadata* for
almost none. Identity is ad-hoc, revision is git, and only EVIDENCE, RULE and VERIFICATION have anything
resembling a status code. **PUBLICATION does not exist as an object at all** — which is precisely why §2.1
P7 could be authored, tested and unreachable without anything noticing.

---

## §4 — REGRESSION CASES (use these to test any control proposed here)

A control that does not catch these is not worth building.

| Case | The defect | Which link failed | The lesson a control must encode |
|---|---|---|---|
| **Murcia — `pgou_ejes` is a road axis** | A centreline was read as an alignment; measurement was taken after a lossy reprojection. | 6 (INPUTS), 7 (DERIVATION) | Semantic binding of a layer is a **decision**, not an inference from plausibility (C64 §3.4: *a layer that could supply a variable is a CANDIDATE, never a resolution*). And CRS handling must be recorded at the point of measurement. |
| **Murcia — Art. 4.5.3 / 4.5.4** | A prescribed method and a prescribed corner-frontage rule were both missed; the resolver reached the "legally constructible" step without a recorded step-0 answer. | 7 | Step 0 must be a **checked branch with a recorded answer per city per article**, and reaching step 5 without one is non-conformant (C64 §4.1). Both errors **under**-granted — i.e. the assurance failure *cost* coverage. |
| **València — 89.81 % of registers are scans** | A city was ruled blocked on the wrong artefact class; nobody looked for the GIS layer that publishes `PGOU - Alineaciones` as ArcGIS REST / GeoJSON / WFS / WMS / CSV. | 2 (DISCOVERY) | Absence in one artefact class is not absence in the jurisdiction. Exhaustion must be **per platform**, and recorded. |
| **Zaragoza — 28-typename sweep returned HTTP 400** | A failed guess was recorded as an absence; `GetCapabilities` advertised 178 typenames and omitted the one that mattered; `DescribeLayer` exposed 47, **25 unadvertised**. | 2, 3 | **Failure ≠ emptiness**, at the protocol level. An advertised inventory is a publication choice, not an inventory. |
| **Huesca / Balears / Canarias** | Standing blockers overturned without any publisher releasing new data. | 2 | A "not published" conclusion is a claim about **our search**, not about the world (ADR-0296). It must carry an expiry and a method. |
| **L-616 — envelope over-states on partial data** | An UNKNOWN constraint was drawn as zero/unbounded. | 8, 9 | A solid must intersect **all** derived constraints; an unmodelled downward constraint can only over-state (ADR-0284, C64 §3.3). |
| **L-581 — inset collapse** | Two rival mechanisms were each "confirmed" and both were wrong; the check written to catch the defect missed it. | 10 (VALIDATION) | Validate against an oracle that **cannot share the bug** (PROBE-DISCIPLINE R2, grid rasterisation vs offset). Writing a check is not writing the right check. |
| **L-584 — façade rasant** | Terrain sampled at the centroid where the ordinance measures at the façade; the correct transcription exists (28 tests) and is **deliberately unwired**, because wiring it would make the issue *look* closed while publishing an artefact. | 6, 12 | **A deliberate non-wiring is a control and must be recorded as one.** This is the estate's best example of the right call — and it is only distinguishable from the ~20 accidental non-wirings because someone wrote down why. |

---

## §5 — WHAT WOULD HAVE TO BE TRUE — the six controls this spec asks for

Designed once here; catalogued (with standards mapping) in `PRYZM-CONTROL-CATALOG.md`.

1. **EA-1 · Publication record.** A `PublicationDecision` object bound to (parcel, rule-pack version, code
   SHA, dataset versions, fidelity tier, decided-by, decided-at, revocable-by). Nothing is shown as
   authoritative without one. *Closes link 12 and C7; makes P7 impossible to leave unreachable.*
2. **EA-2 · Evidence store.** Per-parcel, content-addressed capture of every upstream response used, with
   URL, status, content-type, bytes, timestamp. *Closes link 3 and C3.*
3. **EA-3 · Step-0 register.** A machine-readable per-city-per-article record of *is a method prescribed?*,
   with a CI gate that fails any resolver reaching step 5 without one. *Closes link 7's recorded half.*
4. **EA-4 · Refusal audit.** A recurring sampled audit (30 refusals per live city) verifying the cited
   article terminates that parcel; result recorded as a measurement artefact, not prose. *Closes C6, and
   is the single control most likely to **increase** coverage — an incorrect refusal is suppressed land.*
5. **EA-5 · Generic downward composition.** Layer-6 `min()` composition over overlay constraints so an
   unmodelled overlay fails **closed and visibly** rather than silently permissive. *Closes link 9.*
6. **EA-6 · Instrument-precedence resolution.** Wire the LEGAL-ATTRIBUTION-MODEL to the resolution path,
   or record — with the same rigour as L-584 — why it must stay unwired. *Closes link 4 and C2.*

⚠ **EA-5 is the only one of the six that can reduce coverage**, and only where an overlay is genuinely
unmodelled. That is a correctness argument, so it survives §0.3 — but the coverage cost must be measured
before it ships, not after.

---

## §6 — WHAT THIS SPEC DELIBERATELY DOES NOT REQUIRE

Recorded so that a future reader does not add them back as if they were oversights.

- **No ISO management artefact is an envelope precondition** (§0.1).
- **No refusal is added for uncertainty that does not change the legal outcome** — C64 §2.4 already sets
  that bar and it is the correct one. Refusing more is not assuring more.
- **No new confidence vocabulary.** C62 is the one vocabulary; a compliance-specific tier ladder would be
  the N-stores failure (C65 §3.5) at the assurance layer.
- **No machine signature on a legal act.** C64 §2.7 is absolute and this spec does not soften it.

---

## §7 — OPEN QUESTIONS FOR THE FOUNDER

1. **The `ESTIMATED_DEFAULT_PACK` ruling** (L-771). Refuse outside covered jurisdictions, or continue to
   draw a placeholder-derived envelope with a label? This is the largest single assurance decision on the
   board and it is a founder call, not an engineering one.
2. **Reviewer-of-record.** Who may sign C4, and is that a role PRYZM staffs or a customer-side act?
3. **The certification claim.** Confirm that PRYZM's external posture is *cited determination, not
   certification* — and commission a sweep of marketing/trust copy against it.
4. **EA-5's coverage cost.** Approve measuring it before shipping.
