# PRYZM CONTROL CATALOG

**Status**: DRAFT · **Created**: 2026-08-09 · Companion to [ISO-READINESS-MATRIX](./ISO-READINESS-MATRIX.md) · [ISO-GAP-REGISTER](./ISO-GAP-REGISTER.md) · [PRYZM-ENVELOPE-ASSURANCE-SPEC](./PRYZM-ENVELOPE-ASSURANCE-SPEC.md).

## The one design rule

> **A control is designed ONCE and mapped to every standard it serves.**

The failure this avoids is the estate's own recorded disease at the governance layer: C65 §3.5 records that
N divergent stores produced *"three disagreeing plan-limit tables, two typology id lists and two copies of
one style resolver in a single week."* A 9001 change-control procedure, a 27001 secure-development control
and a 42001 AI-change-management control that are written separately will disagree within a quarter, and
then the disagreement itself becomes the nonconformity (**L-756** is exactly that shape: one policy
declared three times with two different values → silent data loss).

So: **one control, many mappings.** If a standard needs something a control does not provide, extend the
control — do not clone it.

## Reading a control

- **Technical enforcement** — what a machine does. If this is empty, the control is a procedure and will
  decay; say so rather than pretending otherwise.
- **Human procedure** — what a person must do. If this is empty, the control is fully automated.
- **Evidence generated** — the durable artefact an auditor reads. **A control that generates no artefact
  is not auditable**, whatever it prevents.
- **Failure action** — what happens when the control trips. ⛔ For any control mapped to an envelope,
  the failure action MUST NOT be "refuse the envelope" unless the failure bears on that envelope's
  correctness (assurance spec §0.1/§0.3).

---

## PC-01 · Reachability of declared controls

| | |
|---|---|
| **Purpose** | A symbol that declares itself a control (guard, gate, validator, middleware, redactor, allowlist) must be reachable from a production path, or be **explicitly recorded as unwired with a reason**. |
| **Standards** | 9001 §8.3, §10.2 · 27001 §9.1, A.8.25 · 42001 §9.1 · 19650-2 (naming/CDE) |
| **Risk addressed** | ⭐ The estate's defining failure: 17 controls authored, tested and unreachable (Matrix §FA.1); 7 documents asserting them (§FA.3). **This control is the parent of most of this catalog.** |
| **Required behaviour** | Every entry in a declared control inventory has ≥1 non-test call site, or an entry in `unwired-by-design.json` carrying: the reason, the condition that would make wiring correct, and an owner. |
| **Technical enforcement** | A CI gate over the inventory. Model it on the existing `write-route-auth-exemptions.json` pattern, which already works. |
| **Human procedure** | Adding an entry to `unwired-by-design.json` requires the same rigour as `facadeRasantDatum.ts` — the estate's one *correct* deliberate non-wiring, distinguishable from ~20 accidental ones **only because someone wrote down why.** |
| **Evidence generated** | The ledger; the CI run. |
| **Test** | A positive control: a dummy unwired guard must turn the gate red. (V1 audit lesson **L-J**: *a guard that cannot fail is not a guard*.) |
| **Audit frequency** | Every PR. |
| **Owner** | Backend |
| **Failure action** | Block the merge. Never an envelope refusal. |
| **Closes** | GAP-001, and detects GAP-070/071 and FA-03…FA-17 as a class |

## PC-02 · Gate integrity — every declared gate can fail, and blocks the path in use

| | |
|---|---|
| **Purpose** | A CI gate must (a) be capable of going red, (b) block the path by which code actually reaches production, and (c) not be satisfiable by a `skipped` job. |
| **Standards** | 9001 §8.5.6, §8.6 · 27001 A.8.25, A.8.31 |
| **Risk addressed** | GAP-002: `ga-gate` blocks a PR merge and **cannot block a push-to-main deploy**, while the comment justifying its omission was falsified by the same commit that made it blocking. GAP: `skipped` counts as pass. |
| **Required behaviour** | `REQUIRED_JOBS` ≡ the set of blocking CI jobs. Any conclusion other than `success` fails, including `skipped`. A bypass exists but sits behind an approval environment and is logged. |
| **Technical enforcement** | `deploy-fly.yml` edit; a meta-check that `REQUIRED_JOBS` matches the blocking jobs in `ci.yml`. |
| **Human procedure** | Approving a bypass is a named act. |
| **Evidence generated** | The workflow run; the bypass warnings. |
| **Test** | Force `ga-gate` red in a branch and prove the deploy refuses. |
| **Audit frequency** | Every deploy; reviewed quarterly. |
| **Owner** | Backend |
| **Failure action** | Refuse the deploy. |
| **Closes** | GAP-002 |

## PC-03 · Severity-classed debt ledger

| | |
|---|---|
| **Purpose** | Tolerated failures are partitioned by consequence. Some contract violations may not be chosen. |
| **Standards** | 9001 §10.2 · 27001 A.8.25 · **C58 §1.4** (envelope honesty) · C13 (isolation) |
| **Risk addressed** | GAP-003: `gate-debt.json` tolerates `check-zoning-fidelity-label.ts`, `check-xss-guards.ts` and `check-project-isolation.ts` on the **same terms as style debt**. The ledger's own rules are excellent (shrink-only; a paid debt must leave the ledger; nothing is added without a founder decision) — it simply lacks classes. |
| **Required behaviour** | Two sections: `tolerable` and `never-tolerable`. `never-tolerable` must be empty for CI to pass. A gate protecting a user-facing legal-honesty claim, a security boundary, or a tenant-isolation invariant is `never-tolerable` by definition. |
| **Technical enforcement** | `run-all.ts` reads the classes. |
| **Human procedure** | Classifying a gate is a founder act, recorded. |
| **Evidence generated** | The ledger's git history is a shrink-only record — **already the best corrective-action evidence in the estate.** |
| **Test** | Adding a failing gate to `never-tolerable` turns CI red. |
| **Audit frequency** | Every PR; the ledger reviewed monthly for the drift signal *"tolerated set flat or growing."* |
| **Owner** | Founder + Backend |
| **Failure action** | Block the merge. |
| **Closes** | GAP-003, GAP-010 |

## PC-04 · Claim–reality agreement

| | |
|---|---|
| **Purpose** | No document, marketing page, dashboard, architecture diagram or health endpoint may assert a capability the system does not have. |
| **Standards** | 9001 §7.5 · 27001 A.5.34, §7.5 · 42001 §A.9 (transparency) |
| **Risk addressed** | GAP-004 and Matrix §FA.3: CLAUDE.md, `architecture.html:1104`, `baseline.json:5`, `/trust`, `TrustPage.ts:146`, C08 §3.1, SPEC-32 — seven documents currently asserting controls that do not operate. Plus `/api/health` reporting `otel.active` from an env var. |
| **Required behaviour** | Every capability claim in a published surface dereferences to either a passing test, a `file:line`, or an explicit "planned" marker. **C31 already does this correctly** — every one of its CI gates is marked "(planned)". **That is the standard.** |
| **Technical enforcement** | Partial. A health endpoint must report a *measured* fact (SDK start success), never an env var. A claim-sweep is otherwise a review activity. |
| **Human procedure** | A quarterly claim sweep across `CLAUDE.md`, `public/architecture.html`, the apex trust/pricing pages, contract §Status lines and `apps/bench/baseline.json`. |
| **Evidence generated** | The dated sweep record. |
| **Test** | `otel.active` must be false when the SDK fails to start — a positive control. |
| **Audit frequency** | Quarterly, and on any marketing change. |
| **Owner** | Founder |
| **Failure action** | Correct the document **or** wire the control. ⛔ Never leave them disagreeing. |
| **Closes** | GAP-004, GAP-021 (partly), GAP-060, GAP-062, FA-23 |

## PC-05 · Fail-closed default for security and legal-output logic

| | |
|---|---|
| **Purpose** | An error in a control path must never produce a permissive result, and must never be cached. |
| **Standards** | 27001 A.8.26, A.8.24 · 42001 §8.4 · C62 §1.1 (unknown is typed, never fabricated) |
| **Risk addressed** | GAP-031: the plugin CRL returns an **empty list** on DB error and caches it `max-age=3600` — every revoked key valid for an hour. GAP-030: DB TLS with `rejectUnauthorized:false`. GAP-012: Catastro collapsing outage into "no parcel". |
| **Required behaviour** | Three outcomes are always distinct: **success · empty · failure.** A failure never renders as an emptiness, never becomes a cached authoritative document, and never widens permission. ⚠ This is the same rule as `FetchOutcome`'s `absent` vs `transient` split, which already exists and works — **generalise it rather than inventing a second vocabulary.** |
| **Technical enforcement** | A lint/gate over `catch` blocks in security and resolver paths that return a permissive literal. |
| **Human procedure** | Code review checklist item. |
| **Evidence generated** | The gate run; a test per failure path. |
| **Test** | Simulated dependency failure per path; assert non-permissive. |
| **Audit frequency** | Every PR. |
| **Owner** | Backend |
| **Failure action** | Block. For envelopes: the outcome is `transient`, which is **not** a refusal and must not be counted as one. |
| **Closes** | GAP-012, GAP-030, GAP-031 |

## PC-06 · Evidence integrity (append-only, tamper-evident, retained)

| | |
|---|---|
| **Purpose** | Records that serve as evidence cannot be altered, and their absence is detectable. |
| **Standards** | **27001 A.8.15 (evidence integrity — a named 27001 requirement)** · 9001 §7.5.3 · 42001 §7.5 · 19650-2 (container audit) · C23 §1.9 |
| **Risk addressed** | GAP-034: three separate audit mechanisms (`event_log`, `version_audit_log`, an unmounted `audit_log` **whose table has no DDL**); append-only asserted in comments with no trigger or `REVOKE`; no hash chain; no retention; `event_log` swallows write failures. |
| **Required behaviour** | **One** audit mechanism. `UPDATE`/`DELETE` rejected by the database. Rows hash-chained. A retention schedule per record class. A write failure is loud. |
| **Technical enforcement** | DB trigger + `REVOKE`; a chain-verify job. |
| **Human procedure** | Retention decided per class; reviewed annually. |
| **Evidence generated** | The log itself; the chain-verification run. |
| **Test** | An `UPDATE` attempt must fail; a tampered row must fail verification. |
| **Audit frequency** | Chain verified nightly; retention reviewed annually. |
| **Owner** | Backend |
| **Failure action** | Alert. Never blocks user work. |
| **Closes** | GAP-034, and is a prerequisite for GAP-051 and GAP-023 |

## PC-07 · Provenance of a derived value

| | |
|---|---|
| **Purpose** | Every value PRYZM shows that it did not receive verbatim from an authority carries: legal source · computational source · confidence tier · retrieval date. |
| **Standards** | 42001 (AI provenance) · 19115 (lineage) · 19157 (quality) · C62 · C64 §2.3 · C23 |
| **Risk addressed** | GAP-020 (no retrieval/effective date → staleness undetectable), GAP-021 (`license: null` ×8), GAP-051 (AI provenance dead), GAP-059 (AI confidence an ungoverned float). |
| **Required behaviour** | **One vocabulary — C62's** — for geodata, AI output and derived constraints alike. ⛔ A compliance-specific tier ladder is forbidden: that is the N-stores failure at the assurance layer. |
| **Technical enforcement** | Schema-level: `MetadataEnvelope<T>` on every derived value; a gate on `license: null` and missing `retrievedAt`. |
| **Human procedure** | Authority ranking decided once (`AuthorityRankSchema` already does it deterministically). |
| **Evidence generated** | The provenance record travelling with the value. |
| **Test** | A value without provenance fails schema validation. |
| **Audit frequency** | Every PR. |
| **Owner** | Backend |
| **Failure action** | For a **missing** tier: degrade the confidence tier and show why. ⛔ **Never refuse** — a lower tier is more coverage than a refusal, and C62 §1.1 already forbids fabricating the value instead. |
| **Closes** | GAP-019, GAP-020, GAP-021, GAP-059; unblocks GAP-013 |

## PC-08 · Human-in-the-loop for consequential machine output

| | |
|---|---|
| **Purpose** | A machine-derived change with legal or model-state consequence takes effect only after a human act, and that act is durably recorded. |
| **Standards** | 42001 §6.2/§8.4 (AI oversight) · 19650-2 (authorisation before publication) · C64 §2.7 (**the certification gate is a human act, machine-signable never**) · C58 (human graduation) |
| **Risk addressed** | GAP-053 (three bypasses, incl. `autoapproveThreshold` defaulting to 0.85), GAP-054 (approvals in `localStorage`), GAP-023 (no publication record), Matrix §T2.1 (`approve_published` has no caller). |
| **Required behaviour** | One approval object, server-persisted, covering **all three** consequential surfaces: an AI-authored model change · a CDE state transition to published · an envelope publication decision. ⚠ These are the same control at three altitudes; the estate currently has three half-built versions and one strong exemplar — `ordinance-extraction`'s `humanVerifiedBy` graduation gate. **Copy that.** |
| **Technical enforcement** | No mutation path without an approval id; a gate asserting no second command is executed inside an approval handler. |
| **Human procedure** | Named reviewers; who may sign what. |
| **Evidence generated** | The approval record — the single most valuable artefact this catalog produces for all three certifications. |
| **Test** | An unapproved AI mutation is rejected; the parent-wall auto-execute path is covered. |
| **Audit frequency** | Every PR; sampled quarterly. |
| **Owner** | Founder (policy) + Product (mechanism) |
| **Failure action** | Refuse the *mutation* (not the envelope). |
| **Closes** | GAP-023, GAP-053, GAP-054, GAP-070 (partly), EA-1, C4 of the assurance spec |

## PC-09 · Discovery exhaustion before an absence claim

| | |
|---|---|
| **Purpose** | "Not published" is a claim about our search, not about the world, and it expires. |
| **Standards** | 19157 (completeness) · C62 §1.7 · ADR-0296 · DISCOVERY-EXHAUSTION-STANDARD |
| **Risk addressed** | ⬆ **Coverage.** Nine of fourteen standing blockers across Balears, Canarias, Barcelona and Huesca were overturned in a single day without any publisher releasing new data. Zaragoza: `GetCapabilities` advertised 178 typenames and omitted the one that mattered; `DescribeLayer` exposed 47, **25 unadvertised**. València: ruled blocked on scans while the city publishes the layer as ArcGIS REST / GeoJSON / WFS / WMS / CSV. |
| **Required behaviour** | An absence claim carries: the strategies attempted, per-strategy evidence, the date, and an expiry. HTTP 400/403/499/timeout is `Unknown`, **never** `No`. |
| **Technical enforcement** | Today none — the standard is human procedure with no machine backing. **That is the gap.** Minimum: a typed absence claim (C62 §1.7 already models it) that a resolver cannot construct without a discovery record. |
| **Human procedure** | The standard, already written and demonstrably effective. |
| **Evidence generated** | The findings record; the MACHINE-READABLE-EVIDENCE-REGISTER row. |
| **Test** | A resolver constructing an absence without a discovery record fails CI. |
| **Audit frequency** | Per city onboarding; absences re-tested on expiry. |
| **Owner** | Programme |
| **Failure action** | The claim reverts to `unknown` — **which is a weaker statement, not a refusal.** |
| **Closes** | GAP-012 (shares the mechanism), and is the highest-coverage control in this catalog |

## PC-10 · Measured-not-asserted

| | |
|---|---|
| **Purpose** | Any number that governs a decision is computed by a cited artefact, never transcribed. |
| **Standards** | 9001 §9.1 · C64 §2.13 · C63 §1.1 · PROBE-DISCIPLINE |
| **Risk addressed** | GAP-013 (refusal correctness asserted, never measured), GAP-018 (thresholds withheld for want of a distribution). ⚠ And the probe risk itself: PROBE-DISCIPLINE records four probes that measured something adjacent to what they named — including **one written specifically to catch the defect it then missed.** |
| **Required behaviour** | R1 — call the production entry point, never re-assemble the chain. R2 — validate against a source that cannot share the bug. `status:'measured'` is the only key that unlocks a scored axis, and is never set to make a number appear. |
| **Technical enforcement** | `computeScorecard.mjs` already enforces the `measured` gate — extend the pattern. |
| **Human procedure** | Every probe is reviewed as production code. |
| **Evidence generated** | `tools/**/measurements/*.json` — dated, cited, reviewable. |
| **Test** | The scorecard test suite. |
| **Audit frequency** | Per measurement cycle. |
| **Owner** | Programme |
| **Failure action** | The axis is `not-assessed`. ⛔ **`not-assessed ≠ 0 %`** and is never a determination (C64 §5.2). |
| **Closes** | GAP-013, GAP-018 |

## PC-11 · Third-party and supply-chain control

| | |
|---|---|
| **Purpose** | Every external dependency — code, data, service, model — is registered, licensed, scanned and re-assessed. |
| **Standards** | 9001 §8.4 · 27001 A.5.7, A.5.19-23, A.8.8 · 42001 (third-party AI) · 19115 (licence as metadata) |
| **Risk addressed** | GAP-032 (**zero** dependency scanning of any kind; last SCA 2026-04-28 with *"SAST: ERROR"*), GAP-038 (no supplier register for ~16 suppliers + ~14 government GIS endpoints), GAP-021 (`license: null` ×8), **L-762** (geodata commercial terms unexamined — assessed as *existential* in the V1 audit's risk register). |
| **Required behaviour** | One register covering **both** code dependencies and data/service suppliers, because for PRYZM they are the same risk: a geodata licence and an npm licence both end a product. Each row: purpose · licence/terms · data sent · sub-processors · re-assessment date. |
| **Technical enforcement** | Dependabot + `pnpm audit` + SBOM + licence check in CI; a gate on `license: null` in provenance. |
| **Human procedure** | Founder + counsel review of commercial terms; annual re-assessment. |
| **Evidence generated** | The register; the SBOM per build. |
| **Test** | A vulnerable or wrongly-licensed dependency fails CI. |
| **Audit frequency** | Per build (automated); annually (commercial). |
| **Owner** | Founder + Backend |
| **Failure action** | Block the merge (technical); escalate (commercial). |
| **Closes** | GAP-021, GAP-032, GAP-038; feeds L-762 |

## PC-12 · Access control completeness

| | |
|---|---|
| **Purpose** | Every declared permission action is enforced at every mutating path, and identity resolution is never mistaken for authorisation. |
| **Standards** | 27001 A.5.15-18 · 19650-2 (role-gated CDE) · C08 |
| **Risk addressed** | GAP-033: `hasPermission()` has 3 call sites for a 24-action matrix; `roleCheck` and `assertScopes` are dead; `authMiddleware` **never rejects** — by contract it is a resolver, so a missing in-handler check is silent. |
| **Required behaviour** | Every action in the matrix has ≥1 non-test caller, or leaves the matrix. Every mutating route is authenticated (`check-write-route-auth.ts` — **this gate already exists and passes**). |
| **Technical enforcement** | Extend `check-write-route-auth.ts` with a matrix-coverage assertion; PC-01 catches the dead middleware. |
| **Human procedure** | Quarterly access review. |
| **Evidence generated** | The gate run; the review record. |
| **Test** | Positive control: remove a `hasPermission` call and the gate must go red. |
| **Audit frequency** | Every PR; reviewed quarterly. |
| **Owner** | Backend |
| **Failure action** | Block. |
| **Closes** | GAP-033, FA-03, FA-04, FA-05 |

## PC-13 · Recoverability proven by exercise

| | |
|---|---|
| **Purpose** | A backup that has never been restored is not a backup, and a runbook without a trigger is not a control. |
| **Standards** | 27001 A.8.13-14, A.5.24-28 · 9001 §8.5.4 · C48 |
| **Risk addressed** | GAP-035 (no backup executor while `/trust` sells a 4-hour RTO, a 90-day cold tier and a stamped drill cadence; `restore-verify.bench.ts` asserts its own deferral and throws if enabled), GAP-036 (six substantive runbooks and **nothing detects** the conditions they respond to). |
| **Required behaviour** | A scheduled backup; **at least one executed, written-up restore**; detection wired to each runbook's trigger condition. |
| **Technical enforcement** | Scheduled job; an uptime monitor per runbook trigger. |
| **Human procedure** | Drill cadence; the write-up. |
| **Evidence generated** | The drill record — the artefact `/trust` currently claims exists. |
| **Test** | The restore-verify bench turns real and green. |
| **Audit frequency** | Quarterly drill. |
| **Owner** | Backend |
| **Failure action** | Alert; and until the first drill, **correct the trust page** (PC-04). |
| **Closes** | GAP-035, GAP-036, FA-16 |

## PC-14 · Change control over machine behaviour

| | |
|---|---|
| **Purpose** | A prompt, model, rule pack or dataset version change is a controlled change with a recorded version, an evaluation, and a rollback. |
| **Standards** | 9001 §8.5.6 · 42001 §8.1 · 19650 (revision control) · C23 §1.2 |
| **Risk addressed** | GAP-052 (model recorded nowhere for 11 endpoints; a default literal that can misattribute), GAP-056 (**no evaluation of any kind; the LLM is stubbed in every test**), GAP-057 (no `workflowVersion`, prompts are inline literals), and the release-record gap (GAP-082: no changelog, no release tags). |
| **Required behaviour** | Every machine-behaviour surface carries a version and a hash. A change runs against a golden corpus. A dated model snapshot id, never a moving alias. Rule packs already have the right shape — **generalise from them.** |
| **Technical enforcement** | `workflowVersion` + `promptHash` required by schema; a golden-corpus job. |
| **Human procedure** | Review the eval delta before merge. |
| **Evidence generated** | The version record; the eval run; the changelog. |
| **Test** | A prompt change without a version bump fails CI. |
| **Audit frequency** | Every PR. |
| **Owner** | Product |
| **Failure action** | Block. |
| **Closes** | GAP-052, GAP-056, GAP-057, GAP-082 |

## PC-15 · Controlled documented information

| | |
|---|---|
| **Purpose** | Every governing document has an owner, an approver, a status that means something, and enforced immutability once sealed. |
| **Standards** | 9001 §7.5 · 27001 §7.5 · 42001 §7.5 · C31 |
| **Risk addressed** | GAP-083 (**5 of 65** contracts carry any owner line; C31 makes `Owner` optional and is itself DRAFT), GAP-084 (all of C31's gates are "(planned)"), GAP-090 (C61 missing with no stub). |
| **Required behaviour** | Mandatory Owner + Approver + review date. **The DRAFT/CANONICAL/ACTIVE ladder is retained unchanged** — it is already the best control-of-documented-information design in the estate, precisely because ACTIVE requires a passing test rather than an opinion. |
| **Technical enforcement** | C31's planned gates, landed: naming, stamps, immutability, links. |
| **Human procedure** | Ratify C31; assign owners. |
| **Evidence generated** | The document headers; the gate runs. |
| **Test** | Editing a sealed ADR body fails CI. |
| **Audit frequency** | Every PR. |
| **Owner** | Founder |
| **Failure action** | Block. |
| **Closes** | GAP-083, GAP-084, GAP-090 |

## PC-16 · Nonconformity and corrective action

| | |
|---|---|
| **Purpose** | Every defect is registered with an owner, a root cause, a correction and an effectiveness check. |
| **Standards** | 9001 §10.2 · 27001 §10 · 42001 §10 |
| **Risk addressed** | GAP-085. ⚠ **This control is 80 % built and must not be replaced.** The L-NN Issue Log (to L-781) with §7.3's evidence-per-row table, plus the declared-debt ledgers (`gate-debt.json` shrink-only, `xss-sink-baseline.json`, `write-route-auth-exemptions.json`, `eslint-baseline-window-as-any.json`), already constitute a better NCR system than most certified estates run. |
| **Required behaviour** | Add four fields: owner · due date · explicit root cause · closure verification. **Do not migrate to an external tracker.** |
| **Technical enforcement** | None needed. |
| **Human procedure** | The existing discipline, plus closure verification. |
| **Evidence generated** | The log; the ledgers' git history. |
| **Test** | — |
| **Audit frequency** | Monthly. |
| **Owner** | Founder |
| **Failure action** | — |
| **Closes** | GAP-085, GAP-089 |

## PC-17 · Management system administration

| | |
|---|---|
| **Purpose** | Scope, policy, risk assessment, SoA, competence, internal audit programme, management review — the paperwork that certification is actually about. |
| **Standards** | 9001 §4-5, §7.2, §9.2, §9.3 · 27001 §4-6, §9.2, §9.3 · 42001 §4-6, §9.2, §9.3 |
| **Risk addressed** | GAP-080, 081, 086, 087, 088 — all certification blockers, none of which affects a single envelope. |
| **Required behaviour** | Each artefact exists, is dated, owned and reviewed. |
| **Technical enforcement** | None. This control is entirely procedural and should be stated as such rather than dressed up. |
| **Human procedure** | Write once, review on cadence. |
| **Evidence generated** | The documents; the review minutes. |
| **Test** | — |
| **Audit frequency** | Annual (scope/policy/SoA); quarterly (management review). |
| **Owner** | Founder |
| **Failure action** | ⛔ **None on the product.** Assurance spec §0.1 is absolute: **no ISO management artefact is ever an envelope precondition.** |
| **Closes** | GAP-080, GAP-081, GAP-086, GAP-087, GAP-088 |

---

## Coverage map — control → standards

| Control | 9001 | 27001 | 42001 | 19650 | 191xx | Envelope |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| PC-01 Reachability | ● | ● | ● | ● | | ● |
| PC-02 Gate integrity | ● | ● | | | | ● |
| PC-03 Severity-classed debt | ● | ● | | | | ● |
| PC-04 Claim–reality agreement | ● | ● | ● | | | ● |
| PC-05 Fail-closed | | ● | ● | | ● | ● |
| PC-06 Evidence integrity | ● | ● | ● | ● | | |
| PC-07 Provenance | | | ● | ● | ● | ● |
| PC-08 Human-in-the-loop | ● | | ● | ● | | ● |
| PC-09 Discovery exhaustion | | | | | ● | ● |
| PC-10 Measured-not-asserted | ● | | ● | | ● | ● |
| PC-11 Supply chain | ● | ● | ● | | ● | ● |
| PC-12 Access control | | ● | | ● | | |
| PC-13 Recoverability | ● | ● | | | | |
| PC-14 Change control | ● | ● | ● | ● | | ● |
| PC-15 Documented information | ● | ● | ● | ● | | |
| PC-16 Nonconformity | ● | ● | ● | | | |
| PC-17 MS administration | ● | ● | ● | | | |

**17 controls cover 5 standards families.** Written per-standard, the same ground would take ~40 documents
that would disagree within a quarter.

## The three controls that pay for themselves first

1. **PC-01 (Reachability)** — it *finds* the others. Every future audit of this estate is cheaper once it
   exists, because the question "is this real?" stops being a manual investigation.
2. **PC-09 (Discovery exhaustion)** — the only control here whose primary effect is **more publishable
   envelopes**. Nine blockers fell in a day to it, unautomated.
3. **PC-05 (Fail-closed)** — one rule that simultaneously fixes a security fail-open, a legal-data
   honesty defect and an envelope-coverage loss, because they are the same bug three times.
