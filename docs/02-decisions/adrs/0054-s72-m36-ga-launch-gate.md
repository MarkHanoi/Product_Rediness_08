# ADR-0054 — S72 · M36 GA Launch Gate

**Status**: Accepted (sprint-scoped — S72, 2026-04-29)
**Sprint**: PRYZM 2 Phase 3D · S72 (M36 GA Launch Gate, weeks 143–144)
**Spec source**: `docs/03-execution/plans/legacy/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S72 (lines 394–488) + §3 GA Gate criteria + §6 gap-closure + §8 handoff
**Companion docs**:
- `apps/bench/reports/S72-m36-ga-launch-gate-2026-04-29.md` (sprint report)
- `apps/bench/reports/M36-GA.md` (milestone bench rollup, §3 line 483)
- `docs/archive/pryzm3-internal/superseded-audits/PHASE-3D-S72-M36-GA-LAUNCH-GATE-2026-04-29.md` (sprint audit)
- `docs/03-execution/status/post-mortems/PRYZM-2-build.md` (36-month post-mortem, §3 line 487)
- `docs/03-execution/plans/post-ga-roadmap.md` (§8 handoff item 11)
- `RELEASE-NOTES-2.0.0.md` (root) + `pryzm-selfhost/RELEASE-NOTES-2.0.0.md` (self-host bundle)
- `docs/03-execution/plans/pryzm-1-sunset.md` + `docs/03-execution/status/cut-list-log.md` + `docs/05-guides/enterprise/operations/status-page-and-on-call.md`
- `docs/03-execution/plans/launch/GA-LAUNCH-BLOG-POST.md` (D6 deliverable)

---

## Context

S72 is the final sprint of PRYZM 2's 36-month build (S01 → S72) and
the M36 GA Launch Gate. The phase doc §S72 daily plan has 10 days:
D1 final integration sweep, D2 monitoring + alerting verification,
D3 support workflow + status page, D4 launch dry-run, D5 release tag
+ notes + `apps/bench/reports/M36-GA.md`, D6 launch blog post, **D7
LAUNCH (Tuesday)**, D8 first-24h monitoring, D9 48-hour triage, D10
retro + `docs/03-execution/status/post-mortems/PRYZM-2-build.md`.

A subset of the daily plan is necessarily operator-side: the actual
`git tag v2.0.0`, the LAUNCH announcement, the first-24h on-call,
the press traffic monitoring, the ≥100-paying-users KPI. The
remaining items — the GA gate codification, the M36-GA milestone
roll-up, the post-mortem, the post-GA roadmap, the PRYZM 1 sunset
schedule, the cut-list-log consolidation, the release notes, the
ADR + audit + sprint report — are D-day-actionable and land in this
commit.

The closure pattern is the same one S55–S71 audits used: artefacts
land in-repo with green vitest evidence; live-runtime gates are
named carry-forwards with reversal triggers. Per the S67/S68/S70/S71
precedent the sprint is closed at "D-day-actionable partial close"
in the PROCESS-TRACKER and the in-flight operator-side items are
named by sprint+day.

Seven decisions follow.

---

## Decisions

### A — GA tag = `v2.0.0`; manifest version bumped in this commit

The phase doc §S72 D5 charter is *"release tag + notes"*. The actual
`git tag -a v2.0.0 -m "PRYZM 2.0.0 GA"` + `git push --tags` is
operator-side (no signing key + no push creds in dev env). What
lands in this commit is everything the operator-side tag depends on:

- `package.json::version` → `"2.0.0"` (was `"0.0.1"`).
- `pryzm-selfhost/version.json` already declares `pryzm: "2.0.0"`
  + `services.{sync-server,bake-worker,api-gateway,editor}: "2.0.0"`
  (landed S70 D8 per ADR-0052).
- `pryzm-selfhost/RELEASE-NOTES-2.0.0.md` (landed S70 D8) covers the
  self-host bundle.
- `RELEASE-NOTES-2.0.0.md` (root, NEW this commit) covers the
  platform end-to-end (services + plugins + APIs + breaking changes).

The version-manifest agreement is asserted by
`tests/ga-gate/__tests__/ga-version-manifest.test.ts` (4 vitest
cases) so the operator-side `git tag v2.0.0` is a no-op
confirmation, not a content change.

**Reversal trigger**: if a critical pen-test finding lands during
the S72 D7 LAUNCH window and forces a 1-month delay per the §K3D-A
kill-switch, the version manifests stay at 2.0.0; the LAUNCH
calendar moves; this ADR's `Status` flips to *Held — K3D-A*.

### B — GA gate codification as `tests/ga-gate/` workspace package

The phase doc §3 GA Gate criteria are a 7-slice list (Functional,
Performance, Architectural, Quality, Bench, Business, Documentation).
Until S72 the gate existed only as prose. This commit codifies the
machine-checkable subset as `tests/ga-gate/` (new workspace
`@pryzm/test-ga-gate`) with 6 vitest files:

- `architectural-invariants.test.ts` — §3 Architectural (`src/legacy/`
  absent, PRYZM 2 trees with 0 `(window as any)`, THREE confined to
  committers, no react in editor deps).
- `perf-coverage.test.ts` — §3 Performance (every NFT row landed or
  documented-deferred, K3-F threshold = 10%, largest-model hard-fail
  flag on, fixture exists, M36-GA report exists).
- `quality-gates.test.ts` — §3 Quality (CSP audit / RLS audit / OAuth2
  review / SAML+SCIM mappings / secret-rotation playbook / scans
  baseline + WCAG audit + S72 release artefact paths).
- `release-artefacts.test.ts` — §3 Documentation (M36-GA + post-mortem
  + roadmap + sunset + cut-list-log + status-page + blog post +
  root release notes + self-host release notes + docs-site selfhost
  + roadmap names every §7 deferred item).
- `handoff-checklist.test.ts` — §8 Handoff (automatable subset of the
  11-item checklist).
- `ga-version-manifest.test.ts` — §3 Functional (root + self-host
  manifests agree on `2.0.0`).

The package is private and asserts **static contracts** over the
repo. The dynamic gate (LAUNCH on D7, first-24h monitoring,
status-page provisioning, ≥100 paying users) is operator-side and
named in §G of this ADR.

**Honesty boundary on §3 Architectural** — the §3 line reads "0
`(window as any)` sites repo-wide" but the GA bundle ships the
PRYZM 2 trees only. The kill-switched PRYZM 1 `src/` tree retains
the legacy footprint and is the documented honest carry-forward
(`docs/03-execution/plans/pryzm-1-sunset.md` §3 — delete `src/` after the
90-day sunset window). The test asserts the invariant for the trees
that GA actually ships (`apps/api-gateway`, `apps/sync-server`,
`apps/bake-worker`).

**Reversal trigger**: if a future sprint deletes `src/` post-sunset,
the test file's `PRYZM2_SCAN_TREES` constant should expand to
include the project root scan; the test will then enforce the §3
"repo-wide" reading verbatim.

### C — PDF-to-BIM ships under `'preview'` label at GA per ADR-0052 §E

The phase doc §S70 D8 charter shipped the gate primitive
(`evaluatePreviewGate(metrics)` in `apps/ai-worker/src/pdf-to-bim/preview-gate.ts`);
the phase doc §S72 D5 charter is the **flip decision**. Re-evaluated
at this date (S72 D5):

| Threshold (ADR-029 Part E) | Required | Measured at S72 D5 |
|---|---|---|
| Page-class accuracy | ≥ 0.90 | n/a |
| Scale accuracy | ≥ 0.95 | n/a |
| Wall precision | ≥ 0.85 | n/a |
| Wall recall | ≥ 0.75 | n/a |
| Opening precision | ≥ 0.80 | n/a |

**Decision at S72 D5**: ships under `'preview'` label. The SPEC-45
fixture corpus of ≥ 50 real PDF sets has not been measured here (the
sets are not in the dev env); `evaluatePreviewGate({})` defaults to
`'preview'` per its safety contract; `PDF_TO_BIM_RELEASE_LABEL` is
unchanged from `'preview'`. This honors phase-doc §K3D-D ("if PDF-to-BIM
accuracy bar is not met, defer public preview to post-GA; ship under
`preview` or full label per ADR-029 Part E").

**Reversal trigger**: when an operator runs the SPEC-45 corpus
through `evaluatePreviewGate(realMetrics)` and the function returns
`'full'`, flip the in-source constant to `'full'` and append a row
to `apps/bench/reports/M36-GA.md` §3 referencing the run output.
One-line constant flip + release-notes delta. No API change.

### D — PRYZM 1 sunset window: 90 days from S61 announcement

The phase-doc §S72 context says *"PRYZM 1 sunset announced (90-day
migration window — already counting from S61)"*. The sunset doc
(`docs/03-execution/plans/pryzm-1-sunset.md`, NEW this commit) records:

- The sunset announcement date = S61 close (≈ 2026-Q1).
- The window length = 90 days (3 months).
- The migration tool = `@pryzm/cli` `install` / `upgrade` / `rollback`
  (landed S70 D8, 12/12 tests green).
- The per-project migration recipe = `pryzm pack` from PRYZM 1 →
  `pryzm unpack` into PRYZM 2.
- The batch migration tool deferral per phase-doc §7 ("PRYZM 1 →
  PRYZM 2 batch migration tool — S72 ships per-project migration;
  batch tool in 90-day window").
- Window end target = 2026-Q3, after which `src/` deletion is the
  next mechanical step (carry-forward register item 25).

**Reversal trigger**: if any 1.x customer files a blocking migration
issue during the window, the sunset is paused; tracked via the
`pryzm-1-sunset` issue label.

### E — Post-GA roadmap = `docs/03-execution/plans/post-ga-roadmap.md`

§8 handoff item 11 reads *"Post-GA roadmap document drafted at
`docs/03-execution/plans/post-ga-roadmap.md` with the §7 items prioritised."* This
commit creates that file (NEW, 30+ lines) covering all 9 §7 items:

1. Native mobile authoring app (NG4) — P3.
2. CFD / FEM / energy simulation in-editor (NG3) — P3.
3. IFC 4.3 advanced features per `[strategic ADR-008]` — P2.
4. Single-binary self-host (after Docker Compose path stable) — P2.
5. Multi-region SaaS deployment (US/EU/APAC failover) — P1.
6. SOC 2 / ISO 27001 certification — P1.
7. AI plugin marketplace tier (revenue-share) — P3.
8. Real-time co-presence in component editor — P2.
9. PRYZM 1 → PRYZM 2 batch migration tool (90-day window) — P0.

Plus the carry-forward register items 17–24 from
`apps/bench/reports/M36-GA.md` §5 (cold-load promotion, orbit-fps
real-browser, undo-single bench, persistence-client constructor fix,
…).

**Reversal trigger**: roadmap is re-prioritised post-LAUNCH from
real customer signal; the priority column is the only thing that
moves; the items themselves stay.

### F — Cut-list final state = `docs/03-execution/status/cut-list-log.md`

`[strategic ADR-018]` Tier-1 + Tier-2 cut-list final state at GA:

| Cut ID | Description | Default | Final state | Decision sprint+day |
|---|---|---|---|---|
| T1.1 | Defer PWA shell | open | **CUT** (deferred to v2) | S31 |
| T2.1 | Defer DXF/SVG export | open | **CUT** (deferred to v2) | S59 D1 |
| T2.2 | Defer further component editor marketplace richness | open | **CUT** (deferred to v2) | S54 |
| T2.3 | Defer multi-language UI | open | **CUT** (deferred to Phase 4) | S59 D7 |
| T2.4 | Defer collaboration cursor history | open | **STAYS OPEN — wait for first request** | S60 D2 |
| T2.5 | Defer offline-first | open | **CUT** (post-GA) | S60 |
| T2.6 | Defer multi-region | open | **CUT** (per ADR-0049) | S67 D9 |

Plus the in-flight cuts from S55–S72 audit deferrals. Full table in
`docs/03-execution/status/cut-list-log.md`.

**Reversal trigger**: any cut's reversal is documented in the same
file with the post-GA sprint that owns the un-cut. Reversal cost
column carried forward from the original cut decision.

### G — Operator-side carry-forward register (consolidated)

The 26-item carry-forward register from `docs/03-execution/status/post-mortems/PRYZM-2-build.md`
§5 is the canonical M36 operator-side hand-off list. Highlights:

- LAUNCH on D7 (Tuesday) — calendar gate.
- First-24h monitoring (D8) + 48h triage (D9) — on-call.
- Pen test report (S68 R3D-02) — external vendor, K3D-A in force.
- SAST re-run (S68 D8 / S69 D1) — `runSastScan` after transport fix.
- Browser matrix live runs (S70 D2/D9) — `.github/workflows/browser-matrix.yml`.
- DR drill #1 (S70 D8 / S71 D8) — DR-DRILL-RUNBOOK §10.
- Fresh-VM `docker-compose up` (S67 D6) — first operator with Docker host.
- ghcr.io image push (S70 D8) — `pryzm-selfhost/scripts/publish-prep.sh --push`.
- Stripe checkout end-to-end (S71b D3) — staging.
- Marketing site live + 5 case studies (S71b D1–D6).
- ≥ 100 paying users — business KPI.
- Quarterly secret-rotation drill #1 (S68 D10).
- Post-GA bench coverage (cold-load promotion + orbit-fps real-browser + undo-single + precision-budget tightening).
- `src/` PRYZM 1 tree deletion after 90-day sunset window.

Each item has a reversal trigger or completion criterion in its
owning audit; this ADR's consolidated table is for sign-off ergonomics.

---

## Consequences

- **Positive**:
  - The `tests/ga-gate/` package becomes the runtime contract for "is GA-ready". Future post-GA sprints that touch §3 invariants get a green/red signal in O(seconds).
  - The `M36-GA.md` + post-mortem + roadmap + sunset + cut-list-log + status-page + blog post + root release notes set is the complete §3 Documentation deliverable. No silent gaps.
  - The version-manifest agreement (root + self-host + GA-gate package all on `2.0.0`) makes the operator-side `git tag v2.0.0` a confirmation, not a content change. Reduces tag-cut risk to near-zero.
  - PDF-to-BIM `'preview'` posture preserved per ADR-0052 §E with reversal trigger named — no silent over-claim.
  - PRYZM 1 sunset schedule made explicit. The 90-day countdown started at S61; window-end → `src/` deletion is the documented next mechanical step.

- **Negative**:
  - The static GA-gate test cannot enforce the operator-side gates (LAUNCH, monitoring, pen test). The carry-forward register in §G is the compensating contract.
  - The M36-GA `'preview'` PDF-to-BIM posture is honest but it's not the strongest possible launch position. Customers who measure on the SPEC-45 corpus and find `'full'` thresholds met will see a one-line constant flip.
  - The `src/` PRYZM 1 tree retains the legacy footprint at GA (per the §3 Architectural honesty boundary in Decision B). Deletion is post-sunset only.

- **Reversibility**: high. Every decision A–G has a named reversal
  trigger. The sprint-scoped Status (Accepted on 2026-04-29) means
  this ADR binds S72 close only; subsequent ADRs may amend.

---

## Cross-references

| Type   | Reference                                                                                       | Why it matters                                                                                  |
|--------|--------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| ADR    | ADR-0048 (S67 self-host docker-compose §B code-stability invariant)                             | Boundary preserved — zero edits inside `apps/{api-gateway,sync-server,bake-worker,editor}/src` |
| ADR    | ADR-0049 (S67 D9 multi-region cut)                                                               | Multi-region cuts kept; reversal cost = 2 sprints, post-GA per `docs/03-execution/plans/post-ga-roadmap.md`       |
| ADR    | ADR-0050 (S68 security hardening posture)                                                        | Quality §3 baseline; CSP/RLS/OAuth2/SAML+SCIM/scans/secret-rotation pointers                    |
| ADR    | ADR-0051 (S69 perf hardening)                                                                    | warn-only landing of largest-model bench; reversal contract for warn→hardFail flip              |
| ADR    | ADR-0052 (S70 browser-matrix + WCAG + self-host publish + PDF preview + lifecycle deletion)      | §E PDF preview gate stays; §B.7 src/lifecycle deletion stays                                   |
| ADR    | ADR-0053 (S71 perf regression hunt + hard-fail flip + K3-F codification)                         | NFT-target shape lock + K3-F machine-checkable contract                                         |
| Spec   | `phases/PHASE-3D-Q4-M34-M36-HARDENING-GA.md` §3 + §6 + §8                                       | GA gate criteria + gap-closure + handoff checklist                                              |
| Spec   | `phases/PHASE-3-COMPLETION-GA-M25-M36.md` §K3-A through §K3-G                                    | Kill-switches in force across the whole GA gate                                                 |
| Spec   | `08-VISION.md §6` (NFT contract, 9 rows)                                                         | Performance §3 reading                                                                          |
| Strategic ADR | `[strategic ADR-018]` Tier-1 + Tier-2 cut-list                                            | Cut-list final state in Decision F                                                              |
| Strategic ADR | `[strategic ADR-021]` SOC2 sequencing                                                     | Quality §3 SOC2 deferral to post-GA                                                             |
| Strategic ADR | `[strategic ADR-026]` zero `react` symbols in editor bundle                              | Architectural §3 reading; gate in `apps/editor/package.json` deps                              |
| Strategic ADR | `[strategic ADR-029]` PDF-to-BIM accuracy thresholds                                     | Decision C + ADR-0052 §E                                                                        |
| Bench  | `apps/bench/reports/M36-GA.md` (NEW this commit)                                                 | Phase-doc §3 line 483 ("`apps/bench/reports/M36-GA.md` published")                              |
| Bench  | `apps/bench/reports/S72-m36-ga-launch-gate-2026-04-29.md` (NEW this commit)                      | Sprint report                                                                                   |
| Audit  | `docs/archive/pryzm3-internal/superseded-audits/PHASE-3D-S72-M36-GA-LAUNCH-GATE-2026-04-29.md` (NEW)            | Sprint audit                                                                                    |
| Doc    | `docs/03-execution/status/post-mortems/PRYZM-2-build.md` (NEW this commit)                                           | Phase-doc §3 line 487 + §8 item 2                                                               |
| Doc    | `docs/03-execution/plans/post-ga-roadmap.md` (NEW this commit)                                                      | Phase-doc §8 item 11                                                                            |
| Doc    | `docs/03-execution/plans/pryzm-1-sunset.md` (NEW this commit)                                            | Phase-doc §S72 context (90-day window)                                                          |
| Doc    | `docs/03-execution/status/cut-list-log.md` (NEW this commit)                                              | Decision F                                                                                       |
| Doc    | `docs/05-guides/enterprise/operations/status-page-and-on-call.md` (NEW this commit)                                   | Phase-doc §S72 D3 + §8 items 3+4+5                                                              |
| Doc    | `docs/03-execution/plans/launch/GA-LAUNCH-BLOG-POST.md` (NEW this commit)                                        | Phase-doc §S72 D6                                                                               |
| Doc    | `RELEASE-NOTES-2.0.0.md` (root, NEW this commit)                                                 | Phase-doc §S72 D5 ("release tag + notes")                                                       |
| Test   | `tests/ga-gate/__tests__/*.test.ts` (NEW this commit)                                            | Decision B; the runtime gate                                                                    |

---

*Sprint-scoped. Status flips to `Held — K3D-A` if the operator-side
pen test reveals a critical finding without a 7-day fix path. Owner:
Architecture lead. Re-audit at sprint S73 (post-GA roadmap kickoff)
or sooner if any reversal trigger fires.*
