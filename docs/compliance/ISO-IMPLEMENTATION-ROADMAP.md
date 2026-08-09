# ISO IMPLEMENTATION ROADMAP — PRYZM

**Status**: DRAFT · **Created**: 2026-08-09 · **Nothing in this roadmap is authorised.** It is a proposal
for founder review, per the read-only terms of the audit that produced it.

Companions: [ISO-READINESS-MATRIX](./ISO-READINESS-MATRIX.md) · [ISO-GAP-REGISTER](./ISO-GAP-REGISTER.md) ·
[PRYZM-CONTROL-CATALOG](./PRYZM-CONTROL-CATALOG.md) · [PRYZM-ENVELOPE-ASSURANCE-SPEC](./PRYZM-ENVELOPE-ASSURANCE-SPEC.md).

## Sequencing principle

Ordered by **expected additional legally defensible envelopes ÷ (implementation + research cost)**, then by
risk — **not** by ease. Two consequences worth stating up front:

- **Phase 1 is not the cheapest work; it is the work that stops other work from silently regressing.**
  Until the gates gate, every fix in later phases can be undone without anyone noticing.
- **Phases 2, 3 and 4's administrative halves are deliberately late.** They are certification blockers and
  they change no envelope. Doing them early would be optimising the wrong variable.

⚠ **Effort figures are engineering estimates for one competent engineer, excluding review and deploy.**
`research` and `counsel` are not engineering time and cannot be compressed by adding engineers.

⚠ **C64 §2.13**: this roadmap transcribes no coverage or completion figure. Where progress must be
demonstrated, the acceptance criterion names the artefact that computes it.

---

## PHASE 0 — Evidence baseline *(1 week, mostly not engineering)*

**Purpose**: establish what is true before changing anything. This phase exists because the audit found
several claims that could not be settled from the repository at all, and one of them (the Supabase region)
governs where **all PII lives**.

| Work | Repository change | Effort | Gap |
|---|---|---|---|
| Settle the five provider-dashboard UNKNOWNs: Supabase project region · whether `supabase-rls.sql` and the `pryzm_save_version` RPC were ever applied · whether the committed Cesium ion token was revoked · whether the project `ON DELETE CASCADE` FKs exist · whether `apps/api-gateway` is deployed | A dated evidence note per item under `docs/compliance/evidence/` | **1 d** of checks | GAP-041 |
| Freeze the AI system inventory | Promote Matrix §T1.3.2 to a maintained artefact | 2 h | GAP-061 |
| Build the supplier + dependency register (one register — code and data suppliers are the same risk) | New artefact; doubles as the **L-762** decision input | 2–3 d | GAP-038, PC-11 |
| Designate the L-NN Issue Log as the formal NCR register and add four fields (owner · due date · root cause · closure verification) | Header note in `V1-LAUNCH-READINESS-AUDIT.md` | 1 d | GAP-085, PC-16 |
| Record the C61 reserved-slot stub | `docs/02-decisions/contracts/` | 10 min | GAP-090 |

**Documents**: the five evidence notes; the AI inventory; the supplier register.
**Controls**: PC-11 (partial), PC-16.
**Owner**: Founder.
**Dependencies**: none.
**Acceptance**: every UNKNOWN in Matrix §T1.2.1's final row is either settled with a dated note or
explicitly re-stated as UNKNOWN with the evidence required. ⛔ **Until then, none may be asserted as
satisfied in any customer-facing claim.**

---

## PHASE 1 — Critical controls *(2 weeks — do nothing else first)*

**Purpose**: make the gates gate, close the fail-opens, and stop the published claims that are untrue.
**Every item is either a gate that cannot fail, a claim that is false, or a control that fails open.**
None is a new feature.

### 1a — Two days that close four critical rows

| # | Work | Effort | Gap | Control |
|---|---|---|---|---|
| 1 | `deploy-fly.yml`: add `ga-gate` to `REQUIRED_JOBS`; treat `skipped` as failure; put `bypass_ci_gate` behind an approval environment; delete the falsified comment at `:178` | **2–4 h** | GAP-002 | PC-02 |
| 2 | `server/pgClient.js:86`: pin the DB CA, `rejectUnauthorized: true` | **2–4 h** | GAP-030 | PC-05 |
| 3 | Plugin CRL: fail closed (or stale-with-warning); **never cache an error result** | **4 h** | GAP-031 | PC-05 |
| 4 | CI gate refusing a non-test `DualPassExtractor` implementation without a founder-signed ADR | **4 h** | GAP-025 | PC-01 |

> These four are the highest value-per-hour in the whole programme. Item 2 alone is the single largest
> security improvement available for the effort.

### 1b — The rest of Phase 1

| # | Work | Effort | Gap | Control |
|---|---|---|---|---|
| 5 | Partition `gate-debt.json` into `tolerable` / `never-tolerable`; move `check-zoning-fidelity-label.ts`, `check-xss-guards.ts`, `check-project-isolation.ts` to `never-tolerable`; **close those three** | 1 d + **3–5 d** | GAP-003, GAP-010 | PC-03 |
| 6 | PC-01 reachability gate + `unwired-by-design.json`, seeded with `facadeRasantDatum.ts` and its reason | **3–5 d** | GAP-001 | PC-01 |
| 7 | Claim sweep: correct CLAUDE.md, `public/architecture.html:1104`, `apps/bench/baseline.json:5`, the `/trust` backup + deletion claims, `TrustPage.ts:146`, C08 §3.1, SPEC-32. Make `/api/health` report **measured** OTel status | **1 d** | GAP-004, FA-23 | PC-04 |
| 8 | Dependabot + `pnpm audit` + SBOM job | **4–6 h** | GAP-032 | PC-11 |
| 9 | One uptime monitor + one alert channel on `/api/health/ready` | **hours** | GAP-036 | PC-13 |
| 10 | Real backup schedule + **one executed restore drill, written up** | **1 wk** | GAP-035 | PC-13 |
| 11 | `/api/ai/compliance/advise`: add a disclaimer and recording, or withdraw the route | **1 d** | GAP-050 | PC-04, PC-14 |
| 12 | Populate `license` (or a typed unknown) at the eight `siteDispatch.ts` sites | **2 d** | GAP-021 | PC-07, PC-11 |
| 13 | CODEOWNERS · PR template · SECURITY.md · CONTRIBUTING · `license` field | **4 h** | GAP-081 | PC-15 |

**Documents**: a claim-sweep record; the restore-drill write-up; the debt-ledger classification decision.
**Owner**: Backend, with founder decisions on items 5, 7 and 11.
**Dependencies**: Phase 0 for item 12 (the licensing decision).
**Acceptance**: a deliberately-red `ga-gate` blocks a deploy; `never-tolerable` is empty; a dummy unwired
guard turns PC-01 red; a restore-drill record exists and the trust page matches it; no document in Matrix
§FA.3 still disagrees with the code.

---

## PHASE 2 — QMS (ISO 9001) *(3 weeks, parallelisable with Phase 3)*

| Work | Repository change | Effort | Gap |
|---|---|---|---|
| Quality policy, scope, process owners | New | 1 wk | GAP-080 |
| Release record: tag releases, generate a changelog, unfreeze the version | CI + `package.json` | 1 d | GAP-082 |
| Mandatory Owner + Approver + review date on every contract/ADR/spec; ratify C31 | Template + 65 headers | 1 wk | GAP-083 |
| Land C31's naming + immutability gates (they are already designed) | `tools/` | 3 d | GAP-084 |
| Competence matrix | New, one page | 2 h | GAP-088 |
| Start filing incident records | `runbooks/incidents/` | ongoing | GAP-089 |

**Controls**: PC-15, PC-16, PC-17 (partial), PC-14 (release half).
**Owner**: Founder.
**Dependencies**: none.
**Acceptance**: *"what shipped on date X"* is answerable without git archaeology; renaming a sealed ADR
fails CI; every contract names an owner.

---

## PHASE 3 — ISMS (ISO 27001) *(4 weeks)*

| Work | Effort | Gap |
|---|---|---|
| ISMS scope, policy, risk assessment method, risk register, **Statement of Applicability** | 2 wk | GAP-080 |
| Consolidate to **one** audit mechanism; DB-enforced append-only; hash chain; retention schedule | 1 wk | GAP-034 |
| Route the 21 unenforced permission actions through `hasPermission`, or remove them from the matrix; extend `check-write-route-auth.ts` with matrix coverage | 1 wk | GAP-033 |
| GDPR: export + delete endpoints, cookie consent, DPA, routed and footer-linked legal pages | 2–3 wk + **counsel** | GAP-039 |
| `SESSION_SECRET` fatal in all environments; a key-rotation path | 1 d | GAP-040 |
| MFA; a token revocation list | 1–2 wk | GAP-037 |
| Crash reporting + a real OTLP exporter — **or delete the OTel scaffolding and say so** | 1 wk | Matrix §T1.2.0 item 1 |

**Controls**: PC-06, PC-12, PC-05, PC-11, PC-13, PC-17.
**Owner**: Backend + Founder (+ counsel for GDPR).
**Dependencies**: Phase 1 (the fail-opens must be closed before an SoA can honestly claim the controls).
**Acceptance**: an `UPDATE` on the audit table is rejected by the database; a gate asserts every matrix
action has a caller; the GDPR mechanism and the published promise agree.

---

## PHASE 4 — AIMS (ISO 42001) *(4 weeks)*

⚠ **Sequenced after 27001 because C23's provenance chain depends on the evidence-integrity work (PC-06),
and building provenance on a mutable log would have to be redone.**

| Work | Effort | Gap |
|---|---|---|
| **Founder decision first**: wire C23 or descope it loudly. It must not stay `CODE_ONLY` | 1 d (decision) | GAP-051 |
| If wiring: dispatch `ai.recordArtefact` on every AI path; add the provenance tables | 2 wk | GAP-051 |
| Call `recordAiUsage` on every path; remove the default-model fallback; pin a dated model snapshot; make cost-record failure loud | 3 d | GAP-052 |
| One approval path, server-persisted; close the three bypasses; decide `autoapproveThreshold` explicitly | 1 wk | GAP-053, GAP-054 |
| Dispatch-time intent allowlist; bounded `TAG_ELEMENTS_BY_CONDITION`; atomic-or-rolled-back `executeBatch` | 1–2 wk | GAP-055 |
| Golden corpus per live workflow + drift detection | 2 wk | GAP-056 |
| `workflowVersion` + `promptHash` on live paths (copy `ordinance-extraction`'s pattern) | 3 d | GAP-057 |
| PII redaction before prompt egress — **or amend C23 to state plainly that nothing is redacted** | 1 wk | GAP-058 |
| Persistent AI labelling after commit; self-labelling demo-fixture fallback | 1 wk | GAP-060, GAP-062 |
| AI outputs onto `DomainConfidence` | 1 wk | GAP-059 |
| AIMS scope, policy, AI risk assessment | 1 wk | GAP-080 |

**Controls**: PC-07, PC-08, PC-14, PC-17.
**Owner**: Product + Founder.
**Dependencies**: Phase 3 (PC-06).
**Acceptance**: every AI call produces a record with the true model id and a workflow version; no
AI-authored mutation reaches the command bus without a server-persisted approval; a prompt change that
degrades the golden corpus fails CI.

---

## PHASE 5 — ISO 19650 *(2 weeks — unusually cheap, because it is already built)*

> **This phase is wiring, not construction.** The server state machine, the role matrix, the audit log, the
> Annex A vocabulary and three client panels all exist and are tested.

| Work | Effort | Gap |
|---|---|---|
| Instantiate `CDEVersionPanel`, `StructuredNameBuilder`, `CDETransmittalPanel`; add the client transition call | 1 wk | GAP-070 |
| Mount `validateNameMiddleware` — **or** delete it and correct `public/architecture.html:1104` | 4 h | GAP-071 |
| Implement `approve_published`, or remove it from the matrix | 2 d | Matrix §T2.1 |
| Reconcile SPEC-32 to the 4-state reality, or commit to building the 8-state machine | 1 d | GAP-073 |
| Decide classification (Uniclass/OmniClass) — adopt or descope | research | GAP-072 |
| Decide whether 19650-5 is in scope. ⚠ **Do not present C22's privacy tier as 19650-5** | research | GAP-074 |

**Controls**: PC-08, PC-12, PC-01.
**Owner**: Product.
**Dependencies**: Phase 4 (PC-08's approval object is shared with the AI approval; build it once).
**Acceptance**: a user can move a version WIP → SHARED → PUBLISHED in the UI, and the transition is
role-gated, audited and approved.

---

## PHASE 6 — ISO 191xx *(4 weeks — this is where envelope coverage moves)*

> ⭐ **Of all eight phases, this is the one that increases publishable envelopes.** Read the ⬆ markers.

| Work | Effort | Gap | Coverage |
|---|---|---|---|
| ⬆ **C62 consumer migration**, starting with `license` and `retrievedAt` — the single highest-leverage 191xx item | 2 wk | GAP-020, PC-07 | Enables tier degradation instead of refusal |
| ⬆ **Catastro four-way outcome discriminant** — transplant the zoning path's existing, tested fix | 1 wk | GAP-012 | ⬆ Stops an outage being recorded as an absence |
| ⬆ **Coverage-gating chrome wired** (after the founder's `ESTIMATED_DEFAULT_PACK` ruling) | 2–3 d | GAP-011 | ⬆ An honest refusal is a product answer (C63 §3.1) |
| ⬆ **Refusal-correctness audit** — 30 sampled refusals per live city | research, ~1 wk/city | GAP-013 | ⬆ **Potentially the largest single unlock: an incorrect refusal is suppressed land** |
| ⬆ Measure the parcel-quality distribution; set acceptance thresholds so the label stops under-selling good data | 1 wk | GAP-018 | ⬆ |
| `crs` + `transformation` + accuracy on every `ParcelFeature`; log datum shifts | 3–5 d | GAP-019 | Certification (C3) |
| Staleness gate that **degrades the tier, never refuses** | 1 wk | GAP-020 | Neutral-to-⬆ |
| Planar-partition validator for zoning coverages | 1 wk | GAP-022 | Correctness |
| Machine-readable dataset descriptors; **generate** the evidence-register row from them | 1 wk | GAP-075 | Process |
| ⚠ Generic downward constraint composition (EA-5) — **measure the coverage cost before shipping** | 2–3 wk | GAP-016 | ⚠ May reduce; correctness argument |

**Controls**: PC-05, PC-07, PC-09, PC-10.
**Owner**: Backend + Programme.
**Dependencies**: the founder's `ESTIMATED_DEFAULT_PACK` ruling gates the coverage chrome.
**Acceptance**: a `refusal-audit/*.measurements.json` exists for ≥1 live city with a stated error rate; a
simulated Catastro 503 produces `transient`, never `absent`; every `ParcelFeature` carries its CRS as data.

---

## PHASE 7 — Internal audit *(2 weeks, then continuous)*

| Work | Effort | Gap |
|---|---|---|
| Convert the existing ad-hoc audit cadence into a scheduled programme with independence and follow-up | 1 wk | GAP-086 |
| Quarterly management review, one page | hours/quarter | GAP-087 |
| First internal audit against this matrix; record findings as NCRs in the L-NN log | 1 wk | — |
| Recurring refusal audit (PC-10) and quarterly claim sweep (PC-04) | ongoing | GAP-013, GAP-004 |

**Recommended audit sequence** — audit in the order the controls were built, because auditing an
unbuilt control produces a finding you already knew:
**PC-01 → PC-02/03 → PC-05 → PC-04 → PC-06 → PC-12 → PC-13 → PC-08 → PC-07/09/10 → PC-11 → PC-14 → PC-15/16/17.**

**Acceptance**: a dated audit plan exists; the first audit's findings are in the NCR register with owners.

---

## PHASE 8 — Certification readiness *(external, sequenced last)*

| Work | Dependency |
|---|---|
| Statement of Applicability finalised against the as-built control set | Phase 3 |
| Stage 1 readiness review with a certification body | Phases 2–4, 7 |
| Remediate Stage 1 findings | — |
| Stage 2 audit | — |

⚠ **Do not start Phase 8 before Phase 7 has run at least once.** A certification body's first question is
*"show me your internal audit and management review"*, and both are currently absent.

---

## The envelope-assurance track — runs in parallel, gated by founder decisions

These are **not** ISO work and must not be sequenced behind it. Three need a founder ruling before any
engineering starts:

| # | Decision required | Blocks | Consequence of deferring |
|---|---|---|---|
| **D1** | The `ESTIMATED_DEFAULT_PACK` ruling — refuse outside covered jurisdictions, or continue drawing a placeholder-derived envelope with a label | GAP-011 | The largest open assurance question; the honest coverage verdict stays unreachable |
| **D2** | Who may act as reviewer-of-record, and is that a PRYZM role or a customer-side act | GAP-023, EA-1 | Certification of an envelope (assurance spec §2.2 C4) remains impossible |
| **D3** | Confirm the external posture is **cited determination, not certification**, and commission a marketing/trust copy sweep against it | PC-04 | The gap between what the code does and what the pages say keeps widening |
| **D4** | Approve measuring EA-5's coverage cost before it ships | GAP-016 | The one control that may reduce coverage ships unmeasured |

---

## Total shape

| Phase | Elapsed | Character |
|---|---|---|
| 0 — Evidence baseline | 1 wk | Mostly not engineering |
| 1 — Critical controls | 2 wk | ⭐ Do first. Nothing else is safe until it is done |
| 2 — QMS | 3 wk | Writing + light CI |
| 3 — ISMS | 4 wk | Engineering + counsel |
| 4 — AIMS | 4 wk | Engineering; **one founder decision gates half of it** |
| 5 — 19650 | 2 wk | Wiring already-built capability |
| 6 — 191xx | 4 wk | ⭐ **Where envelope coverage moves** |
| 7 — Internal audit | 2 wk + ongoing | Process |
| 8 — Certification | external | Sequenced last |

Phases 2–6 are substantially parallelisable. The serial spine is
**0 → 1 → 3 (PC-06) → 4 → 5**, with **6 running alongside from the start** — and phase 6 is the one a
customer would notice.
