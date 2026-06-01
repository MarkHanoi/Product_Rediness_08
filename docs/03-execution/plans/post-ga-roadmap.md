# PRYZM 2 — Post-GA Roadmap

**Date opened**: 2026-04-29 (S72 D10 / phase-doc §8 handoff item 11)
**Owner**: Founder + Architecture lead
**Source**: `phases/PHASE-3D-Q4-M34-M36-HARDENING-GA.md` §7 (Post-GA Roadmap Seeds) + `docs/03-execution/status/post-mortems/PRYZM-2-build.md` §5 (operator-side carry-forward register)

This is the post-GA roadmap drafted at S72 D10 per phase-doc §8 item 11.
Items are prioritised P0 (blocking 90-day post-LAUNCH stability),
P1 (next-quarter), P2 (mid-year), P3 (deferred next-year+).

The roadmap re-prioritises post-LAUNCH from real customer signal.
The priority column moves; the items themselves are the locked
seed list from phase-doc §7 + the carry-forward register.

---

## §1 P0 — 90-day post-LAUNCH stability (blocking)

| # | Item | Why P0 | Source |
|---|---|---|---|
| 1 | LAUNCH on D7 (Tuesday) | Calendar gate; the whole §3 gate depends on it | phase-doc §S72 D7 |
| 2 | First 24-hour monitoring + response | Initial reliability signal | phase-doc §S72 D8 |
| 3 | 48-hour mark + initial issue triage | First-week incident-response cadence | phase-doc §S72 D9 |
| 4 | PRYZM 1 → PRYZM 2 batch migration tool | 90-day sunset window already counting from S61; per-project tool is in CLI; batch tool needs a 1-2 sprint dedicated push | phase-doc §7 + `docs/03-execution/plans/pryzm-1-sunset.md` |
| 5 | First quarterly secret-rotation drill | SOC2 §1.10 contract; first drill scheduled S68 D10 (carry-forward) | `docs/04-reference/security/secret-rotation-playbook.md` §5 |
| 6 | DR drill #1 against live staging Postgres | DR-DRILL-RUNBOOK §10 sign-off | ADR-0051 §C + ADR-0053 §F |
| 7 | Pen test report response | K3D-A kill-switch in force | phase-doc §S68 R3D-02 |
| 8 | Status page + alerting live provisioning | §3 Business "monitoring + alerting verified" | `docs/05-guides/enterprise/operations/status-page-and-on-call.md` |

---

## §2 P1 — Next quarter (~M37–M39)

| # | Item | Source |
|---|---|---|
| 9 | **Multi-region SaaS deployment (US/EU/APAC failover)** | phase-doc §7; ADR-0049 cut at S67 D9; reversal cost = 2 sprints |
| 10 | **SOC 2 / ISO 27001 certification** | phase-doc §7; depends on quarterly drill cadence (item 5) + auto-report (per `[strategic ADR-021]` + ADR-028 Part G) |
| 11 | Cold-load NFT baseline promotion (3 rows: small / medium / large) | M36-GA §1 row 1–3 partial; mechanical step `pnpm bench && pnpm bench:baseline` per S71 §6 |
| 12 | `orbit-fps` real-browser p95 baseline | M36-GA §1 row 6 partial; depends on isolated CI runner per ADR-0053 §A |
| 13 | Precision-budget tightening from trailing-7-run baseline | ADR-0051 §A formula; reversal trigger on isolated CI runner |
| 14 | SPEC-45 PDF-fixture-corpus measurement (≥ 50 real PDF sets) → preview→full flip | ADR-0054 §C reversal trigger; one-line constant flip |
| 15 | ARM64 multi-arch image publish | S67 D5 carry-forward; depends on ghcr.io creds + `docker buildx` CI |
| 16 | Fresh-VM `docker-compose up` matrix verified across Ubuntu/Debian/RHEL/Rocky × ARM64+x86_64 | S67 D6 carry-forward; first operator with Docker host + VM matrix |
| 17 | Browser matrix live runs across all 5 projects (Chromium / Firefox / WebKit / Edge channel / iPad Safari) | S70 D2/D9 carry-forward |
| 18 | Stripe checkout + pricing config end-to-end test on staging | S71b D3 / S72 D4 carry-forward |
| 19 | Marketing site live (pryzm.com) + 5 case studies + 5-min demo video | S71b D1–D6 carry-forward |
| 20 | All 72 sprint retros archived in `docs/03-execution/status/retros/` | post-S72 D10 mechanical |
| 21 | `pryzm-vi-parity` workflow stale-failure visibility fix | Existing-code surface (`packages/visibility/`); tests pass on direct `npx vitest run` |
| 22 | `packages/persistence-client/__tests__/file-system-backend.test.ts` constructor-export fix | Existing-code; 8/144 failing in that single file |
| 23 | `.replit` workflow registry stale-stub cleanup (5 orphans) | Operator-side `.replit` edit; unblocks the 6-workflow consolidated test registration |

---

## §3 P2 — Mid-year (~M40–M42)

| # | Item | Source |
|---|---|---|
| 24 | **IFC 4.3 advanced features** | phase-doc §7; per `[strategic ADR-008]` |
| 25 | **Single-binary self-host** (after Docker Compose path stable) | phase-doc §7 |
| 26 | **Real-time co-presence in component editor** | phase-doc §7; `[strategic ADR-018]` T2.2 deferred to v2 backlog |
| 27 | `undo-single.bench.ts` dedicated bench | M36-GA §1 row 9 gap; closes the §6 NFT row 9 documented gap |
| 28 | `src/` PRYZM 1 tree deletion (post 90-day sunset window) | `docs/03-execution/plans/pryzm-1-sunset.md` §3; mechanical once sunset closes |
| 29 | Format v2 freeze planning | post-GA after format v1 frozen at S71b D7 |
| 30 | Plugin SDK 1.x evolution (post-1.0 incremental) | Plugin SDK 1.0 frozen at M33; 1.x lane post-GA |

---

## §4 P3 — Deferred to next-year+

| # | Item | Source |
|---|---|---|
| 31 | **Native mobile authoring app** (NG4) | phase-doc §7 |
| 32 | **CFD / FEM / energy simulation in-editor** (NG3 — post-GA plugins) | phase-doc §7 |
| 33 | **AI plugin marketplace tier (revenue-share)** | phase-doc §7 |
| 34 | i18n / multi-language UI | T2.3 cut at S59 D7; reversal cost = 2 sprints |
| 35 | Collaboration cursor history (replayable timeline) | T2.4 — STAYS OPEN until first request |

---

## §5 Process commitments (carrying forward into post-GA work)

These are not roadmap items but process conventions that locked
during S55–S72 and should continue post-GA:

1. Two-column scoring (Raw % vs Closure %) on every audit per `_TEMPLATE.md` W-17.
2. "What this audit does NOT claim" section in every sprint audit.
3. Sprint-scoped ADR for every sprint with non-trivial decisions.
4. Carry-forward register named by sprint+day in every sprint audit.
5. ADR reversal triggers for every deferral.
6. Workspace package per gate (`@pryzm/perf-budgets`, `@pryzm/wcag-audit`, `@pryzm/test-ga-gate`) — collapse drift into one import path.
7. Code-stability invariant from ADR-0048 §B carries: no edits inside `apps/{api-gateway,sync-server,bake-worker,editor}/src` unless the sprint charter explicitly opens that surface.
8. Family-creator-rewrite-plan boundary carries: no edits inside `apps/component-editor`, `packages/file-format/src/family-*`, `family-runtime`, `geometry-kernel/sketch+producers`, `constraint-solver`, `scheduler`, `eslint-plugin-pryzm`, `marketplace-web`, `ifc-vocab.ts`.
9. Kill-switches stay live: K3-A through K3-G + K3D-A through K3D-D unless explicitly retired by an ADR.
10. NFT-target list owned by `@pryzm/perf-budgets`; updated in lockstep with `08-VISION.md` §6 amendments.

---

## §6 Cross-references

- `phases/PHASE-3D-Q4-M34-M36-HARDENING-GA.md` §7 (Post-GA Roadmap Seeds) + §8 (Handoff Checklist)
- `docs/03-execution/status/post-mortems/PRYZM-2-build.md` §5 (carry-forward register, 26 items deduplicated)
- `apps/bench/reports/M36-GA.md` §5 (operator-side carry-forward register)
- `docs/02-decisions/adrs/0054-s72-m36-ga-launch-gate.md` §G (consolidated)
- `docs/03-execution/plans/pryzm-1-sunset.md` (sunset schedule)
- `docs/03-execution/status/cut-list-log.md` (Tier-1 + Tier-2 final state)
- `docs/05-guides/enterprise/operations/status-page-and-on-call.md` (S72 D3 runbook)

---

*Roadmap last updated 2026-04-29 at S72 D10. Re-prioritisation expected
weekly during the 90-day post-LAUNCH window, then monthly. Owner:
Architecture lead. Reviewed quarterly with founder.*
