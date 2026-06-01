# PRYZM 2 — ENTERPRISE-GRADE REALITY CHECK (S71, 2026-04-28)

**The question.** *"Is this really the best production-grade,
enterprise final product shift after 36 months?"*

**The honest answer.** No. What S71–S72 lands is a **credible
Series-A SaaS launch posture** for an AEC tool. It is not what
large-enterprise procurement organisations (a Top-10 ENR contractor,
a Foster / HOK / Arup / AECOM enterprise license, a national
infrastructure agency) actually accept as "enterprise-grade". The
gap is real and most of it has been **cut, deferred, or scheduled
post-GA on purpose** — but it has not been spoken out loud anywhere
in one place. This doc does that.

This is not a takedown of the team's 36 months of work. The
foundation is genuinely strong (§2). It is a frank statement of
what GA *will* deliver versus what enterprise customers will
actually demand on day 1, so the team can choose its framing
honestly: *"GA"* vs *"Enterprise GA"*.

---

## §1 What "enterprise-grade" means in AEC (the bar)

AEC software procurement is harder than typical B2B SaaS because
the buyer is risk-averse, the contracts are multi-year, the data
is regulated, and the workflows are mission-critical (a structural
mistake kills people). Across the deals my peers in AEC SaaS have
walked through, the bar has nine pieces:

| # | Bar | Why AEC procurement asks |
| - | --- | ------------------------ |
| 1 | **SOC 2 Type II report (12 months of evidence)** | Required by every Top-100 GC's IT review. No report = no PO. |
| 2 | **buildingSMART IFC4 certification** | The interoperability gate. Uncertified IFC = "won't talk to Revit / ArchiCAD round-trip" risk. |
| 3 | **ISO 19650 conformance** (CDE + naming + EIR/BEP) | UK + EU public sector contracts mandate it. Increasingly North America too. |
| 4 | **Independent penetration test report (clean)** | Every annual security review asks for the most recent one. Findings = remediation timeline = procurement freeze. |
| 5 | **Multi-region or compelling data-residency story** | EU contracts cite GDPR Schrems-II; AU/JP cite local sovereignty. Self-host is acceptable IF the self-host is genuinely turnkey + supported. |
| 6 | **24/7 SLA-backed support with named CSM** | A 4-hour P1 response on a $250K/yr contract is table stakes. Solo-founder support is not viable. |
| 7 | **Procurement-grade commercials** | Annual invoicing, NET-30/60 terms, COI + insurance, MSA + DPA + BAA templates ready, security questionnaire response library. |
| 8 | **Production-grade plugin signing supply chain** | If a marketplace is part of the pitch, the signing keys must be in an HSM/KMS, with documented rotation + revocation. OS-keychain signing is a sales objection. |
| 9 | **Defence-in-depth at the data layer** | RLS coverage on every user-data-bearing table. "Server-side authz is the primary gate, RLS is the backstop" is the right architecture. Missing the backstop = an anon-key leak is a breach. |

Some software ships GA without all nine — but none of those
products are sold into Top-100 GC accounts at the prices the master
plan implies (the §17 amended decision table prices the enterprise
tier at multi-thousand-seat, multi-year contracts).

---

## §2 What exists today — credit where it is due

The team has done substantial enterprise-readiness work. Naming it:

### §2.1 Security posture (S68 — ADR-0050)

`docs/04-reference/security/` contains seven contracts that match the shape of a
real security programme:

- `csp-audit-2026-Q4.md` — strict-by-default editor CSP with three documented relaxations + per-plugin iframe CSP (`default-src 'none'`, `<iframe sandbox="allow-scripts">` no `allow-same-origin`).
- `plugin-sandbox-audit-2026-Q4.md` — first-party sandbox reconfirmation + escape-vector regression suite.
- `rls-audit-2026-Q4.md` — every-table RLS inventory.
- `oauth2-review-2026-Q4.md` — RFC 7636 + OAuth 2.1 PKCE primitive review.
- `saml-scim-mappings.md` — enterprise SSO IdP-to-PRYZM mappings + SCIM schema.
- `secret-rotation-playbook.md` — every secret + cadence + first quarterly drill scheduled S68 D10.
- `scans-2026-Q4-baseline.md` — dependency + SAST + HoundDog scan baseline.

Defence-in-depth model (per ADR-0050 §B.1) is **architecturally
correct**: edge → API → service → DB-RLS-backstop.

### §2.2 Self-host (S67 — ADR-0048)

`pryzm-selfhost/` ships a 6-service Docker Compose stack
(postgres, minio, sync-server, bake-worker, api-gateway, editor).
`install.sh` generates secrets via `openssl rand -hex 24`, mounts
them as Docker secrets, persists data in named volumes, runs
`init-db/` SQL on first boot. **This is a real product** —
self-host is a viable answer for a customer with a data-residency
ask we cannot otherwise meet.

### §2.3 AEC depth specs

The 00_NEW_ARCHITECTURE/specs corpus includes:

- `SPEC-40-BUILDINGSMART-IFC4-CERTIFICATION.md`
- `SPEC-39-EIR-BEP-TIDP-MIDP.md` (ISO 19650 BIM execution plans)
- `SPEC-37-FEDERATED-CLASH-DETECTION.md`
- `SPEC-36-COBIE-EXPORT.md`
- `SPEC-34-HYBRID-DATA-SOVEREIGNTY.md`
- `SPEC-27-MIGRATION-ROLLBACK.md`
- `SPEC-15` (multi-region + data residency)
- `SPEC-24` (regional data residency posture)

`docs/30_DATA/CDE-ISO/17-ISO-19650-CDE-IMPLEMENTATION-PLAN.md`
exists. The CDE state machine (`docs/30_DATA/CDE-ISO/18-VERSIONING-STATE-MACHINE-CONTRACT.md`)
is contracted. **This is rare for a 36-month-old AEC startup** and
is a real differentiator.

### §2.4 Reliability posture (S69 — ADR-0051)

- Largest-fixture bench (10K walls × 50 levels) with WARN-only
  thresholds and a documented hard-fail flip at S70 D8.
- DR drill runbook (`docs/00_NEW_ARCHITECTURE/runbooks/DR-DRILL-RUNBOOK.md`)
  codifying the four migration failure modes from SPEC-27 §8.
- 4-hour heap-leak harness (`apps/bench/scripts/heap-leak-hunt.mjs`).
- Trailing-7-run baseline discipline established in S03 and held since.

### §2.5 Multi-region cut — *correctly framed*

ADR-0049 cuts multi-region for M36 GA with **honest reasoning**:
no measured EU demand in the beta cohort, +2 sprint cost, self-host
satisfies most data-residency asks, SOC 2 sequencing argues for
not doing both at once. `PRYZM_REGION` env var is reserved so
post-GA reactivation is a config change, not a code change. **This
is the correct way to cut a Tier-2 item** and is a credit to the
ADR discipline.

---

## §3 The gap — what S72 GA does NOT deliver

Cross-referencing §1 against §2 + ADRs 0048–0051 + the security
docs:

### §3.1 Compliance evidence — none of the four big artefacts in hand

| Bar item | Status at S72 GA |
| -------- | ---------------- |
| **SOC 2 Type II** | Explicitly **post-GA "~6 months"** per PHASE-3D §7. Type I report not yet referenced. No SOC 2 = no Top-100 GC PO. |
| **buildingSMART IFC4 certification** | SPEC-40 exists. Certification process itself is **6–12 months** with buildingSMART International, including remote testing + on-site review. **Not started**. |
| **ISO 19650 conformance** | Implementation plan exists (`docs/30_DATA/CDE-ISO/17-…`). No third-party assessment. UK BSI certification ~6 months. |
| **Independent pen test report (clean)** | S68 D1–D2 contracted with a third party per ADR-0050 §B.4. Findings + remediation execution = S68 D8. **No "clean" report referenced** at S72 — no statement that critical/high findings are at zero. |

### §3.2 Security execution — material gaps still open

From ADR-0050 itself, frankly stated:

- **RLS coverage: 2 of 21 tables.** §B.3 of ADR-0050 *explicitly accepts the gap* at S68 close, scheduling the fix for S69 D6. As of the most recent ADR (0051), it is unclear whether S69 D6 actually executed against a live Postgres or remained provisional. **An anon-key leak today is a 19-table data breach.**
- **OAuth2 production resource server: not wired.** S70 D8 work. The GA-day OAuth2 surface is a **test shim** until that lands.
- **SAML/SCIM runtime adapter: not wired.** Same — S70 D8 work. Mappings exist; the runtime that executes them does not.
- **SAST scanner: errored at the transport layer.** Not clean. Re-run scheduled S69 D1 — outcome not in the latest ADR.
- **SCA: 26 findings (2 critical, 8 high, 14 moderate, 2 low).** Remediation expected post-S68 D8 to bring to "0 critical / 0 high / 4 moderate (esbuild, astro deferred)". **The "deferred moderate" line is the kind of language a procurement security review highlights.**
- **Plugin sandbox third-party audit: pending.** Founder-coordinated, parallel to S68 pen test. The K3-C gate is *provisionally* held by the first-party audit + regression suite.
- **Plugin signing keys: in OS keychain.** `packages/plugin-sdk/src/signing.ts:13` — "private key in the OS keychain". For a marketplace selling signed third-party plugins to enterprise, this is a **sales objection** and a **single-machine compromise = supply chain compromise** risk. HSM/KMS is the bar.
- **Secret rotation drill: one drill, dev environment, items 1+11 only.** §B.8 — "first quarterly drill is scheduled for S68 D10 (buffer day) on the dev environment for items 1 + 11 (lowest-blast-radius secrets)." The procurement bar is **production drill on every secret**. The catch-up roadmap (S71 launch-dry-run + every quarter) is sound, but at GA the receipts are thin.

### §3.3 AEC interop — the certification gap

Even with SPEC-40, SPEC-39, SPEC-37, SPEC-36 written:

- IFC4 export Tier-1 ships per `plugins/ifc-export` workflow. **buildingSMART certification is a separate process** that takes 6–12 months and costs ~€15–25K. Not started at S72.
- Revit / ArchiCAD migration tooling: `docs/feasibility-revit-rhino-interoperability.md` is a **feasibility study**, not a shipping product. Without one, the enterprise customer's question — "how do I move my 50 in-flight projects from Revit?" — has no answer.
- COBie export: SPEC-36 exists. Plugin: not enumerated in `plugins/`. Status: spec only.
- Federated clash detection: SPEC-37. Same — spec only.
- 4D / 5D integration (P6, MS Project, cost databases): not in any phase doc.

The SPECs are the right starting move. The implementations are not GA-shipped.

### §3.4 Operational maturity

- **24/7 on-call rotation:** not referenced in the runbooks. A real team-of-N is needed; a solo-founder pager is not viable for a $50K+/seat enterprise contract.
- **Status page (status.pryzm.com or similar):** not seen. Required by every enterprise vendor checklist.
- **SLA contracts:** uptime % + P1 response time + credit schedule — not in any doc. SLA without measurement is just marketing copy.
- **Customer-facing change/maintenance windows:** not procedural.
- **Backup verification cadence:** DR drill is one-shot at S69 D6. Procurement bar is monthly verified restore drill, with output retained for SOC 2.
- **Support tier definitions:** not seen.

### §3.5 Multi-tenancy at scale

- The largest-fixture bench is **10,000 walls × 50 levels**. A real enterprise BIM model on a hospital, airport, or refinery often **exceeds 1 million elements**. The 10K bench is a credible *medium-large project* gate — it is not a *flagship enterprise project* gate.
- Per-tenant noisy-neighbour testing: not enumerated. On shared sync-server / bake-worker pools, one tenant's batched-undo can starve another. This is a real production-incident class.
- Per-tenant audit log export: not enumerated. SOC 2 + GDPR DSR routinely require it.

### §3.6 Commercial readiness for enterprise

- **Annual invoicing (NET-30, NET-60):** Stripe handles it but the workflow + signed-PO + AP-portal upload story is bespoke per customer. Not in any phase doc.
- **Tax (VAT, GST, sales tax nexus):** Stripe Tax can do it; not referenced as wired.
- **MSA + DPA + BAA + COI templates:** not in `docs/legal/` (no such directory). Procurement asks for these on day 1.
- **Security questionnaire response library:** not seen. CAIQ + SIG-Lite responses can be a 2-week project per net-new ask without one.

---

## §4 Two honest framings of GA

The team has to choose one. Either is defensible; *not choosing* and
quietly shipping under enterprise marketing copy is what creates the
sales-cycle blowups 6 months post-launch.

### §4.1 Framing A — "Series-A SaaS GA"

Marketed as: **"PRYZM 2.0 is now generally available for
individual practitioners, small studios, and design teams up to 50
seats. Enterprise tier in beta — contact sales."**

What you ship at S72:
- The 9 wires from `PRYZM2-FINAL-WIREUP-AUDIT-S71-2026-04-28.md`.
- The S68 security posture, even with the listed gaps.
- Self-host as the data-residency answer.
- Stripe self-serve billing for individual + team tiers.

What you defer to a published roadmap:
- SOC 2 Type II — Q3 2026 (6 months post-GA).
- IFC4 certification — Q4 2026 (start S73, complete by Q4).
- ISO 19650 — Q1 2027.
- HSM-backed signing — Q3 2026 alongside SOC 2.
- Multi-region — Q2 2027 once measured EU demand exists.
- Enterprise support tier (24/7, named CSM) — when first paying enterprise contract closes.

This framing is **honest, achievable, and lets the product launch
on schedule** without overpromising. The downside: the first
"enterprise" sales conversations all stall on procurement until
the deferred items land.

### §4.2 Framing B — "Enterprise GA"

Marketed as: **"PRYZM 2.0 is enterprise-ready. SOC 2 Type II
certified, IFC4 verified, 99.9% SLA, EU + US regions."**

What this requires that S72 does NOT have:

- **+12 months calendar.** SOC 2 Type II requires 12 months of audited evidence; you cannot ship Type II at GA unless you started the 12-month observation window in May 2025. From the ADR record, the formal SOC 2 framework starts post-GA.
- **+€20K + 9 months for IFC4 certification.** Independent buildingSMART process.
- **+€10–15K + 3 months for the pen test → remediation → re-test cycle to land "clean".**
- **Multi-region uncut.** +2 sprints minimum, +infra cost.
- **24/7 support team hire.** ~3 FTE (follow-the-sun).
- **HSM/KMS migration for signing keys.** ~1 sprint + ongoing operational cost.
- **RLS on every user-data table.** ~1 sprint + verified test queries on a live Postgres.
- **Procurement-grade commercials work.** ~1 sprint + outside counsel for MSA/DPA review.

If you mean **Enterprise GA in the strict sense above, the GA date
is M40–M42**, not M36. That is **+4–6 months** of additional work
on top of the §5 wires from the prior audit. After 36 months
already spent, +6 months to reach a posture you can stand behind
with a Top-100 GC is a defensible trade.

### §4.3 The hybrid that most AEC SaaS pick

Most AEC SaaS at this stage pick **Framing A at GA + a public
"path to enterprise" roadmap with named dates**. The public roadmap
is the procurement conversation:

> *"PRYZM 2.0 ships May 2026. SOC 2 Type II audit window opens in
> June, certification expected Q2 2027. IFC4 certification
> submission Q3 2026. Enterprise tier (multi-region, 24/7 SLA,
> SAML/SCIM at scale) GA Q4 2026."*

This is honest, it is what your beta cohort already understands,
and it lets you have an enterprise sales conversation today on the
basis of *commitment*, not *current state*. The risk is the
roadmap dates slip — which is why publishing them is itself an
operational discipline.

---

## §5 What "enterprise-grade after 36 months" actually looks like (the bar)

For comparison: what AEC enterprise customers see when they
evaluate the established players.

| Capability | Established AEC SaaS at "enterprise GA" |
| ---------- | --------------------------------------- |
| Security certifications | SOC 2 Type II + ISO 27001 + (often) FedRAMP / HIPAA / Cyber Essentials Plus |
| AEC certifications | buildingSMART IFC4 export + import certified, BCF certified, often OpenBIM trademark |
| Compliance | ISO 19650 audited, GDPR + CCPA DSR procedures, DPA library, schrems-II addendums |
| Pen test cadence | Annual external pen test, public summary or NDA-shareable full report |
| Vulnerability disclosure | Public VDP, often a bug bounty (HackerOne/Bugcrowd) |
| SLA | 99.9% uptime, P1 1h response + 4h resolution, credit schedule, public status page with 12-month history |
| Support | 24/7 on-call, named CSM at $50K+/yr, regional support hours |
| Identity | SAML 2.0 + OIDC, SCIM 2.0 provisioning, MFA, IP allowlist, just-in-time access |
| Tenant admin | Self-serve role/permission UI, audit log export, per-tenant data residency choice, per-tenant retention policies |
| Data residency | At minimum US + EU regions; often APAC + UK + AU + CA for sovereign customers |
| Migration tooling | Revit + ArchiCAD + Bentley import with fidelity report, parallel-run pilot programme, white-glove migration consulting |
| Federation | Multi-discipline coordination, federated model load, clash detection report export, RFI integration |
| Procurement | MSA + DPA + BAA + AUP templates, COI + cyber insurance, security questionnaire library, SOC 2 + ISO + pen-test reports under NDA |
| Plugin supply chain | HSM-rooted signing chain, SBOM per release, signed releases (cosign / sigstore), revocation list, marketplace review SLA |
| Performance ceiling | Tested at flagship scale (1M+ elements, multi-discipline federated models), public benchmark results |
| Status of source-of-truth | Audited control matrix (Drata, Vanta, Tugboat) live, evidence collection automated |

After 36 months, **PRYZM 2 is a credible "Series-A AEC SaaS"**. To
stand next to the table above takes another **9–18 months** of
deliberate enterprise-tier work. The ADRs you have written and the
SPECs you have already drafted are the right roadmap inputs — what
is missing is the calendar and headcount to execute them.

---

## §6 The strategic question

This is the conversation that needs to happen with whoever is
deciding the M36 GA framing.

> *"After 36 months, do we ship at Framing A (Series-A SaaS GA,
> honest roadmap to enterprise), at Framing B (enterprise GA, +6
> months slip), or at the hybrid (A at GA + published path to B)?"*

The technical answer to your question is the same regardless: the
9 wires in `PRYZM2-FINAL-WIREUP-AUDIT-S71-2026-04-28.md` ship at
GA either way. What differs is **what is true on the marketing
site** and **which customers can sign a real contract on day 1**.

A few uncomfortable things worth saying out loud:

- **No AEC SaaS reaches enterprise-procurement-ready in 36 months
  with a small team.** Bentley took ~30 years. Revit took ~7 years
  to reach Autodesk's "AEC industry standard" status. Bluebeam took
  ~10. 36 months → SOC 2 + IFC4 + 24/7 SLA + flagship-scale
  performance is not a calendar that exists in this category.
- **The right comparator is not Autodesk; it is Speckle / Snaptrude
  / Hypar / Qonic in their first 3 years**, all of whom shipped
  GA at Framing A and built the enterprise tier in years 4–5.
- **The 36 months has produced unusually strong foundations:** 92
  packages, 38 plugins, the plugin-SDK signing chain, the CDE
  state machine, ADR-0050's defence-in-depth security model. These
  are *years* ahead of what most 3-year-old AEC SaaS has. The gap
  is *not in the architecture*; it is in the certifications,
  the operational team, and the procurement-facing artefacts —
  which are the things you cannot accelerate by writing better
  code.
- **Trying to ship Framing B in S72 is the wrong move.** It would
  burn a year of credibility when the enterprise customers test it
  and find SOC 2 missing, IFC4 uncertified, 24/7 unstaffed. Better
  to ship Framing A honestly and let the roadmap do its job.

---

## §7 Recommendation (my opinion, you can ignore it)

1. **Ship Framing A at S72** as planned. Use the 9 wires from the
   prior audit.
2. **Publish a 12-month enterprise roadmap** alongside the GA
   announcement, with named dates for SOC 2 Type II, IFC4
   certification, multi-region, and 24/7 SLA. Be specific.
3. **Cut the word "enterprise" from any GA marketing copy that
   isn't accompanied by "in beta" or "Q3 2026".** The first
   sales-cycle blowup with a procurement department that finds the
   gap unannounced is more expensive than the marketing softening.
4. **Pre-sell the enterprise tier on commitment.** A signed LOI
   with a Top-100 GC for a Q4 2026 enterprise rollout is worth
   more than a fully-built enterprise tier with no signed
   customer.
5. **Treat the post-GA roadmap as a single 12-month project with
   its own phase doc.** Call it Phase 4 — Enterprise Readiness, M37–M48.
   Don't let it dribble out as ad-hoc sprints.

---

*End of reality check. — 2026-04-28, S71.*
