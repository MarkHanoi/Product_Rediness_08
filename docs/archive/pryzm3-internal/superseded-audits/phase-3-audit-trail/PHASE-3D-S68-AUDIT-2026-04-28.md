# Phase 3D · S68 Sprint Audit — Security Hardening + SOC2 + SAML/SCIM

**Date**: 2026-04-28
**Sprint**: S68 (Phase 3D, Q4 M34–M36 GA hardening track, sprint 2 of 6)
**Spec source**: `docs/00_NEW_ARCHITECTURE/phases/PHASE-3D-Q4-M34-M36-HARDENING-GA.md` §S68
**Companion ADR**: `docs/02-decisions/adrs/0050-s68-security-hardening-posture.md`
**Carry-forward from**: S67 (self-host Docker Compose; code-stability invariant unchanged).

---

## §1 What this audit asserts

S68 is the **security gate** of Phase 3D. Its 10 daily deliverables (D1–D10) split into three classes:

- **External / contracted** (D1, D2, D8 partial): third-party pen test + remediation execution.
- **Deliverable-producing in-repo** (D3–D7, D9): seven companion docs + one ADR + nginx CSP edit.
- **Operational** (D10 + the drill it includes): quarterly secret-rotation drill kickoff.

This audit honestly records: **D3, D4, D5 (specification), D6, D7 (scans + SOC2 + SAML/SCIM specs), D9 are committed in this sprint as docs + nginx edit. D1, D2, D8 are external/operator-side. D5 (policy migrations) and D7 (SAST re-run) are scheduled for S69 D6 + S69 D1 respectively.**

---

## §2 Files written / edited in this sprint

| Path                                                             | Action  | Lines (approx) | Purpose                                             |
| ---------------------------------------------------------------- | ------- | -------------- | --------------------------------------------------- |
| `docs/04-reference/security/scans-2026-Q4-baseline.md`                        | NEW     | ~150           | S68 D7 — dependency + SAST + HoundDog scan results. |
| `docs/04-reference/security/csp-audit-2026-Q4.md`                             | NEW     | ~140           | S68 D3 — editor + plugin-iframe CSP audit.          |
| `docs/04-reference/security/plugin-sandbox-audit-2026-Q4.md`                  | NEW     | ~110           | S68 D4 — sandbox first-party reconfirmation.        |
| `docs/04-reference/security/rls-audit-2026-Q4.md`                             | NEW     | ~180           | S68 D5 — every-table RLS inventory + gap analysis.  |
| `docs/04-reference/security/oauth2-review-2026-Q4.md`                         | NEW     | ~120           | S68 D6 — PKCE + token-lifecycle review.             |
| `docs/04-reference/security/saml-scim-mappings.md`                            | NEW     | ~170           | S68 D7 — enterprise SSO mappings + SCIM schema.     |
| `docs/04-reference/security/secret-rotation-playbook.md`                      | NEW     | ~160           | S68 D9 — operator-facing rotation runbook.          |
| `docs/02-decisions/adrs/0050-s68-security-hardening-posture.md`   | NEW     | ~180           | Sprint-level posture summary.                       |
| `docs/00_NEW_ARCHITECTURE/audits/PHASE-3D-S68-AUDIT-2026-04-28.md` | NEW   | (this file)    | Honest sprint audit.                                |
| `pryzm-selfhost/nginx/editor.conf`                               | EDITED  | +20 / -3       | Adds CSP, HSTS, COOP, CORP, Permissions-Policy headers. |
| `docs/00_NEW_ARCHITECTURE/PROCESS-TRACKER.md`                    | EDITED  | +1 / -1        | S68 row marked `[~]` partial close.                 |
| `replit.md`                                                      | EDITED  | +~70           | New top section §PRYZM-2-PHASE-3D-S68.              |

**Zero edits to service source code.** The S67 code-stability invariant (no touches to `apps/{api-gateway,sync-server,bake-worker,editor}/src`) is preserved.

**Zero edits to** the family-creator-rewrite-plan boundary: `apps/component-editor`, `packages/file-format/src/family-*`, `family-runtime`, `geometry-kernel/sketch+producers`, `constraint-solver`, `scheduler`, `eslint-plugin-pryzm`, `marketplace-web`, `ifc-vocab.ts`.

---

## §3 D-by-D status (honest)

| Day | Spec deliverable                                                                 | Status     | Where it landed (or why deferred)                                                                                                                  |
| --- | -------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Pen test (external; founder coordinates).                                        | DEFERRED   | External engagement; no in-repo artefact possible.                                                                                                 |
| D2  | Pen test continues.                                                              | DEFERRED   | Same as D1.                                                                                                                                        |
| D3  | CSP audit + remediation; report at `docs/04-reference/security/csp-audit-2026-Q4.md`.         | DONE       | `docs/04-reference/security/csp-audit-2026-Q4.md` written; `pryzm-selfhost/nginx/editor.conf` edited to emit CSP + HSTS + COOP + CORP + Permissions-Policy.    |
| D4  | Sandbox audit (independent confirmation no escapes).                             | PARTIAL    | `docs/04-reference/security/plugin-sandbox-audit-2026-Q4.md` first-party reconfirmation written. Independent third-party confirmation contracted external; lands as §4.4 of the audit doc when received. |
| D5  | RLS audit on Postgres: every table has policy; verified test queries.            | PARTIAL    | `docs/04-reference/security/rls-audit-2026-Q4.md` audit + gap analysis written (every table inventoried). Per-table policy migrations + verified test queries SCHEDULED for S69 D6 (DR drill day already provisions live Postgres). |
| D6  | OAuth2 review: PKCE flow correct; token expiry + refresh handled.                | DONE (with deferred wiring) | `docs/04-reference/security/oauth2-review-2026-Q4.md` written. PKCE primitive confirmed RFC 7636 + OAuth 2.1 conformant. Production resource-server wiring (token introspection, refresh rotation) deferred to S70 D8 per ADR-0041 §D — boundary is documented. |
| D7  | Dependency + SAST + HoundDog scans; SOC2 access-review automation.               | PARTIAL    | Scans run: HoundDog 0 findings (clean); SCA 26 findings (2 crit + 8 high — remediation plan in §5 of baseline doc, fixes in S68 D8); SAST errored (`river CANCEL`) — re-run scheduled at S68 D8 + S69 D1. SOC2 access-review automation: `docs/04-reference/security/saml-scim-mappings.md` defines the SAML/SCIM mappings + audit-log event types the SOC2 evidence query consumes; runtime automation deferred to S70 D8 alongside the SAML/SCIM adapter. |
| D8  | Remediations.                                                                    | DEFERRED (planned) | Patch-level dependency bumps planned (handlebars 4.7.8→4.7.9, next 16.2.1→16.2.3, fast-xml-parser 5.3.7→5.5.6, postcss→8.5.10, brace-expansion→1.1.13). No edits in this sprint to keep the audit clean — bumps execute at S68 D8 against a fresh audit re-run. |
| D9  | Demo + secret-rotation playbook.                                                 | DONE (playbook); demo deferred | `docs/04-reference/security/secret-rotation-playbook.md` written with 13-secret inventory, per-secret rotation procedures, emergency-rotation flow, quarterly-drill schedule. Demo is operator-side (not in-repo). |
| D10 | Buffer.                                                                          | RESERVED   | First quarterly secret-rotation drill scheduled here (items 1 + 11; lowest blast radius).                                                          |

---

## §4 Verification of S67 invariants (still held)

**Code-stability invariant** (per ADR-0048 §B):

- Zero edits inside `apps/api-gateway/src` (175 tests untouched).
- Zero edits inside `apps/sync-server/src`.
- Zero edits inside `apps/bake-worker/src`.
- Zero edits inside `apps/editor/src`.

**Family-creator-rewrite-plan boundary** (per S59 deep-review and PROCESS-TRACKER):

- Zero edits inside `apps/component-editor`, `packages/file-format/src/family-*`, `packages/family-runtime`, `packages/geometry-kernel/sketch+producers`, `packages/constraint-solver`, `packages/scheduler`, `packages/eslint-plugin-pryzm`, `packages/marketplace-web`, `packages/ifc-vocab.ts`.

**S67 carry-forward not addressed in S68** (still open at S68 close):

- sync-server + bake-worker `/health` route wiring (~50 lines each) — still open; will land alongside the S69 D6 DR drill (which exercises healthchecks under failover).
- `pnpm lint:selfhost` script for marketplace SQL drift check — still open; can land at S70 D8 self-host publish day.

---

## §5 Test totals

**New tests in this sprint**: zero. S68 is documentation + nginx config; no test-bearing code introduced.

**Existing test workflows**: unchanged. The S68 changes do not touch any source path covered by the configured workflows (`audit-log-middleware`, `bake-worker-test-geometry`, `bcf-round-trip`, `constraint-solver-snapshot`, `family-editor-quality-gates`, `ifc-export-tier1`, `ifc-import-tier2`, `ifc-inspector-pset-editor`, `pdf-classification-accuracy`, `pdf-stage3-pure`, `pryzm-vi-parity`, `rhino-import-3dm`).

**Pre-existing failure unchanged**: `pryzm-persistence` continues to fail on existing code under `packages/persistence-client` — not in S68 scope.

---

## §6 Scan results (from §3 D7, repeated for audit-trail completeness)

| Scanner            | Status | Critical | High | Moderate | Low | Total |
| ------------------ | ------ | -------- | ---- | -------- | --- | ----- |
| Dependency (SCA)   | OK     | 2        | 8    | 14       | 2   | 26    |
| SAST               | ERROR  | —        | —    | —        | —   | —     |
| HoundDog           | OK     | 0        | 0    | 0        | 0   | **0** |

**Critical (2)**: `handlebars@4.7.8` cluster (GHSA-2w6w-674q-4c4q + chained moderate); fix = bump to 4.7.9.
**High (8)**: handlebars (1), `next@16.2.1`→16.2.3 (1), `fast-xml-parser@5.3.7`→5.5.6 (1), 5 in long tail.
**SAST error**: `river CANCEL` transport-level cancellation; re-run scheduled S68 D8 + S69 D1.
**HoundDog clean**: necessary, not sufficient — see `docs/04-reference/security/scans-2026-Q4-baseline.md` §4 for the limits of this signal.

---

## §7 What this audit does NOT claim

- It does **not** claim a third-party pen test ran (D1, D2 — external; founder-coordinated).
- It does **not** claim an independent third-party sandbox audit ran (D4 — same channel as pen test).
- It does **not** claim every Postgres table has an RLS policy (D5 — only 2 of 21 do today; rest scheduled for S69 D6).
- It does **not** claim a SAST result either way (D7 — scanner errored; re-run scheduled).
- It does **not** claim SCA is currently clean (D7 — 2 critical + 8 high open; remediation at S68 D8).
- It does **not** claim the production OAuth2 resource server is wired (D6 — boundary is S70 D8).
- It does **not** claim SAML / SCIM runtime is operational (D7 — mappings doc shipped; runtime adapter is S70 D8; "operational for at least 1 enterprise tenant" exit-criterion item is gated on S72 GA).
- It does **not** claim the remediation bumps are in (D8 — planned, not executed).
- It does **not** claim any demo was recorded (D9 demo half — operator-side).
- It does **not** claim the secret-rotation drill ran (D10 — scheduled).

What it **does** claim: every deliverable that can be a written contract has a written contract; every gap has a named follow-on sprint and a named day; the security posture is documented with the same honesty standard as the S67 audit.

---

## §8 Next-sprint hand-off

| Item                                                        | Where                                  | Sprint |
| ----------------------------------------------------------- | -------------------------------------- | ------ |
| Per-table RLS policy migrations + verified test queries     | new files per §3.2 of RLS audit        | S69 D6 |
| sync-server + bake-worker `/health` route wiring            | `apps/sync-server/src/app.ts` + bake-worker | S69 D6 |
| SAST scanner re-run (1st retry) + final retry              | scan baseline §3                       | S68 D8 + S69 D1 |
| Dependency-bump remediations (handlebars, next, fast-xml-parser, postcss, brace-expansion) | root + workspace package.jsons | S68 D8 |
| Production OAuth2 resource server + refresh-rotation        | api-gateway adapter                    | S70 D8 |
| SAML / SCIM runtime adapter                                 | api-gateway sso + scim modules         | S70 D8 |
| `pnpm lint:selfhost` SQL-drift script                       | root scripts                           | S70 D8 |
| First quarterly secret-rotation drill (items 1 + 11)        | drill log at `docs/04-reference/security/rotation-drills/2026-Q4.md` | S68 D10 |
| Per-service rw/ro Postgres role split                       | `pryzm-selfhost/init-db/01-bootstrap.sql` | S70 D8 |

---

**Audit authored by**: sprint-S68 (2026-04-28)
**Honesty standard**: matches `docs/00_NEW_ARCHITECTURE/audits/PHASE-3D-S67-AUDIT-2026-04-28.md` — every claim verifiable in-repo; every deferral named with sprint + day; no "tested ✅" without an artefact.
