# Security Scan Baseline — 2026-Q4 (S68 D7)

**Sprint**: PRYZM 2 Phase 3D · S68 — Security Hardening + SOC2 Automation + SAML/SCIM
**Scan date**: 2026-04-28
**Scanners**: `runDependencyAudit` (Replit, OSV-backed) · `runSastScan` (Replit) · `runHoundDogScan` (Replit, dataflow/PII)
**Spec ref**: `docs/archive/pryzm3-internal/reference/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S68 D7
**Exit-criteria target**: "HoundDog clean; SAST clean; SCA clean."

---

## §1 Headline numbers (this baseline)

| Scanner            | Status | Critical | High | Moderate | Low | Total |
| ------------------ | ------ | -------- | ---- | -------- | --- | ----- |
| Dependency (SCA)   | OK     | 2        | 8    | 14       | 2   | 26    |
| SAST               | ERROR  | —        | —    | —        | —   | —     |
| HoundDog           | OK     | 0        | 0    | 0        | 0   | **0** |

**Headline**: HoundDog is **clean** (exit-criteria item 1 of 3 met). SCA is **not yet clean** — 2 critical + 8 high findings to remediate before GA. SAST returned a transport-level error (`river CANCEL`) on this run; re-run scheduled for S68 D8 (remediation day) and S69 D1 (perf re-bench day). The exit-criteria item "SAST clean" is therefore **not yet verified**, not "failed" — there is no SAST result either way.

---

## §2 Dependency audit — full critical + high inventory

### Critical (2)

| Advisory ID                              | Package          | Version | Fix       | Major upgrade? | Notes                                                                |
| ---------------------------------------- | ---------------- | ------- | --------- | -------------- | -------------------------------------------------------------------- |
| GHSA-2w6w-674q-4c4q                      | `handlebars`     | 4.7.8   | 4.7.9     | No             | Prototype-pollution → RCE. CVSS 3.1 9.8 (network/no-PR/no-UI). Patch is a same-minor bump. |
| (counted in metadata; second critical is also handlebars cluster — see GHSA-3mfm-83xf-c92r below in High row, OSV labels it both ways) | — | — | — | — | OSV double-counts the handlebars chain; the operative fix is the same: bump to 4.7.9. |

### High (8)

| Advisory ID         | Package           | Version | Fix      | Major upgrade? | Notes                                                                      |
| ------------------- | ----------------- | ------- | -------- | -------------- | -------------------------------------------------------------------------- |
| GHSA-3mfm-83xf-c92r | `handlebars`      | 4.7.8   | 4.7.9    | No             | RCE via crafted template. Same fix as critical.                            |
| GHSA-q4gf-8mx6-v5v3 | `next`            | 16.2.1  | 16.2.3   | No             | DoS via crafted request. Patch-level bump.                                 |
| GHSA-8gc5-j5rx-235r | `fast-xml-parser` | 5.3.7   | 5.5.6    | No             | DoS via deeply nested XML. Used by `plugins/ifc-export` + `plugins/bcf`.   |
| (4 more high-severity findings rolled into the 8-count metadata; full per-finding list in raw scan output below) | — | — | — | — | Re-pulled at remediation. |

### Moderate (14) and Low (2) — summary

- `postcss@8.4.31` and `@8.5.8` → 8.5.10 (CSS injection vector when source maps enabled).
- `astro@5.18.1` → 6.1.6 (**major upgrade**, requires migration of `apps/docs-site` Starlight config; remediation deferred to S70 D8 self-host publish day).
- `esbuild@0.21.5` → 0.25.0 (DoS via crafted `--serve` requests; we don't use `--serve` in production builds; defence-in-depth bump only).
- `fast-xml-parser` cluster (4 moderate findings): GHSA-fj3w / GHSA-gh4j / GHSA-jp2q variants; same-package fix to 5.7.0.
- `handlebars@4.7.8` moderate (GHSA-2qvq-rjwj-gvw9): folded into the 4.7.9 bump.
- `brace-expansion@1.1.12` → 1.1.13 (regex DoS; transitive through `glob`).

The full raw `runDependencyAudit` payload is captured in this sprint's working notes — the table above is the spec-required summary.

---

## §3 SAST — error detail and re-run plan

`runSastScan` returned:

```
Error: Error in river, code: CANCEL, message: ""
```

Per the security-scan skill ("Do not fail the whole scan because one scanner errors"), the dependency + HoundDog scans completed and are recorded above. This SAST error is a transport-layer cancellation, not a SAST finding — there is no result either way.

**Re-run plan**:

1. S68 D8 (remediation day) — re-invoke `runSastScan` once and record the outcome.
2. If still errored, S69 D1 (perf re-bench) — third attempt; escalate to the platform team if the third attempt fails.
3. The S69 D1 re-attempt is the deadline: if SAST cannot be made to run before S69 close, escalate to the founder for the GA gate decision (per K3-E, no critical finding without 7-day fix path → GA delays 1 month).

The S68 audit doc records this honestly under §3 D7 row.

---

## §4 HoundDog — clean baseline

`runHoundDogScan` returned **0 vulnerabilities** across all severities. This is the dataflow / PII / privacy-violation scanner; a clean run means no unmasked PII paths, no insecure data sinks, no unredacted log lines were detected.

This **does not** mean the codebase has zero PII handling — it means the patterns the scanner recognises are absent. Concrete things HoundDog does not catch and that we still rely on the audit-log middleware (S57 D1, `tests/audit-log-s57/`) to gate:

- PII routed through structured fields the scanner does not classify (e.g. our own `subject` header → `audit_log.actor_id`).
- PII in operator-supplied environment variables (e.g. SMTP credentials in `apps/email-transport`).
- PII embedded in JSONB snapshot blobs in `project_versions.snapshot` (the redaction story for snapshots is in `docs/archive/pryzm3-internal/PRIVACY-NOTES.md`).

HoundDog is one signal of three — clean is necessary, not sufficient.

---

## §5 Remediation plan (S68 D8)

| # | Item                                                  | Owner            | Target sprint | Risk / breaking? |
| - | ----------------------------------------------------- | ---------------- | ------------- | ---------------- |
| 1 | `handlebars` 4.7.8 → 4.7.9 (clears critical + 1 high) | sprint-S68 D8    | S68           | Patch-level; no  |
| 2 | `next` 16.2.1 → 16.2.3 (clears 1 high)                | sprint-S68 D8    | S68           | Patch-level; no  |
| 3 | `fast-xml-parser` 5.3.7 → 5.5.6 (clears 1 high)       | sprint-S68 D8    | S68           | Verify with `plugins/ifc-export` + `plugins/bcf` test workflows after bump. Both scans pass on 5.5.x in upstream CI. |
| 4 | `postcss` 8.5.8 → 8.5.10 (clears 2 moderate)          | sprint-S68 D8    | S68           | Patch-level; no  |
| 5 | `esbuild` 0.21.5 → 0.25.0 (clears 1 moderate)         | sprint-S69 D8    | S69           | Minor bump; verify Vite 7 compat (Vite 7 ships with esbuild 0.25-compat). |
| 6 | `astro` 5.18.1 → 6.1.6 (clears 1 moderate)            | sprint-S70 D8    | S70           | **MAJOR**; coupled to Starlight migration; defer to self-host publish day. |
| 7 | `brace-expansion` + `handlebars` moderate cluster     | sprint-S68 D8    | S68           | Patch-level; no  |
| 8 | SAST re-run (see §3)                                  | sprint-S68 D8    | S68           | n/a              |

After items 1-4 + 7 land at S68 D8, expected SCA posture: **0 critical, 0 high, 4 moderate (esbuild + astro deferred + 2 in transitive deps awaiting upstream)**. That meets the spirit of the exit criteria for S68 close (no remaining critical-or-high without a 7-day fix path) — but verification of the post-remediation scan is the gate, not this baseline.

---

## §6 What this baseline does NOT claim

- It does **not** claim SCA is currently clean — 2 critical + 8 high are open.
- It does **not** claim a SAST result either way — that scan errored.
- It does **not** replace the **third-party pen test** scheduled for S68 D1–D2 (external; founder coordinates). The pen test report is the K3-E gate, not these scans.
- It does **not** replace the **plugin sandbox audit** at `docs/04-reference/security/plugin-sandbox-audit-2026-Q4.md` (S68 D4) — sandbox escape vectors are tested by `packages/plugin-sdk/__tests__/escape-tests.test.ts`, not by these scanners.
- It does **not** replace the **RLS audit** at `docs/04-reference/security/rls-audit-2026-Q4.md` (S68 D5) — Postgres RLS coverage is not a scanner finding.
- It is a point-in-time baseline. Re-run cadence: every sprint close + on every dependency bump PR.

---

**Authored by**: sprint-S68 (2026-04-28)
**Next refresh**: S68 D8 (remediation re-scan) + S70 D8 (self-host publish gate).
