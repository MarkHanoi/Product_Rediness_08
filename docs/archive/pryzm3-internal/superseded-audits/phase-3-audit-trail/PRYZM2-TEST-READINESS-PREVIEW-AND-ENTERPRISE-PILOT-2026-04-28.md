# PRYZM 2 — TEST READINESS: PREVIEW + ENTERPRISE PILOT

**Date.** 2026-04-28 (S71)

**The question this doc answers.** *"After 36 months of build, what
does the work actually need so it is ready (a) for preview testing
by our team + alpha users and (b) for an enterprise pilot
customer to run a real 4-week trial on a real project?"*

**The two gates.**

- **Gate P — Preview Testing.** Internal team + 5–15 friendly alpha
  users can use PRYZM 2 for one hour, find real bugs, file them
  through a working channel, and not lose their work. Goal: bug
  discovery + qualitative UX feedback.
- **Gate E — Enterprise Pilot Testing.** 1–3 named enterprise
  customers (a Top-100 GC, a 50–200 person architecture practice,
  a national infrastructure agency) run a 4-week paid pilot on a
  real small project, with a signed pilot agreement, named CSM
  contact, and weekly check-in cadence. Goal: design-partner
  feedback + pilot revenue + reference customer for the GA launch.

**Gate E is *not* enterprise GA.** It is *strictly less* than
enterprise GA — see `PRYZM2-ENTERPRISE-GRADE-REALITY-CHECK-2026-04-28.md`
for the GA bar. Gate E is the *minimum credible posture* for a
named enterprise customer to sign a pilot agreement and load real
project data, knowing that the production-grade items (SOC 2,
IFC4 cert, 24/7 SLA) are on a published roadmap, not in hand.

**The bottom line.**

| Gate | Calendar from S71 D1 | Engineering wires | Operational wires |
| ---- | -------------------- | ----------------- | ----------------- |
| **Gate P** | **5 working days** | W1, W3, W4, W5 from the wireup audit | bug-channel + pilot telemetry on |
| **Gate E** | **Gate P + 4 sprints (~8 weeks)** | + W2 chrome, + RLS gap closure (S69 D6 carry), + W6 cap-stones partial, + auth bridge promoted to real | + pilot agreement, DPA, NDA, named CSM, status page, weekly check-in cadence, support email + SLA, data-export-on-exit guarantee |

Everything below is the detail behind those two rows.

---

## §1 What is *not* in scope for either gate

Stating it up front so the gate definitions are crisp:

- **SOC 2 Type II.** Post-Gate-E, post-GA work. The pilot DPA acknowledges
  it is in progress.
- **buildingSMART IFC4 certification.** Same — submission Q4 2026 per the
  enterprise reality check; pilot uses uncertified IFC4 export with
  documented limitations.
- **Multi-region.** Cut for GA per ADR-0049. Pilots run in our
  single region; pilots requiring data residency get the self-host
  Docker stack.
- **24/7 SLA.** Pilot SLA is **business-hours best-effort** with a
  4-hour P1 response (one named contact + one backup). 24/7 lands
  with the first paid enterprise contract that funds it.
- **Tenant admin self-serve UI.** Provisioned manually by us during
  the pilot (CSM-managed). Self-serve lands at enterprise GA.
- **HSM-backed plugin signing.** Pilots get a signed-off plugin
  allow-list (no third-party plugins) so the OS-keychain signing
  is not a pilot-blocker.
- **Pen-test "clean" report.** Pilot security pack includes the
  S68 scan baseline + the remediation plan; pilots sign the NDA
  and accept the in-progress posture.

These are *real* gaps, but they are not pilot-blockers as long as
they are *named* in the pilot agreement. Hiding them is what
creates blowups; disclosing them is what makes pilots possible.

---

## §2 Gate P — Preview Testing readiness

### §2.1 Audience definition

- **Internal team** (founder + 0–4 engineers + 0–2 designers).
- **Friendly alpha cohort** (5–15 individuals from the beta cohort
  per `packages/beta-signup`'s `beta_signups` table — designers,
  small studios, individual practitioners who already opted in).

### §2.2 Success criteria for Gate P

A user can:

1. Visit `/` (or `?pryzm2=1` until the polarity flip lands), see
   no errors in the browser console, see the project hub with
   their projects listed (auth works).
2. Open an existing project. The real PRYZM 2 editor mounts (not
   the toy cube). The renderer attaches. The user sees an empty
   workspace they can interact with.
3. Draw a wall, place a door, switch to a slab tool, place a slab.
   See the inspector populate when an element is selected. Save
   the project. Refresh the page. Reopen the project. The wall +
   door + slab are still there.
4. Hit "report a bug" or use a documented `support@pryzm.com`
   inbox to file a finding with auto-attached `console.log` +
   build SHA.
5. Run for 60 minutes without a hard crash. Soft errors land in
   the loud-fail-soft panel with a copy-trace button.

### §2.3 Engineering wires required for Gate P (the minimum)

Reusing the W-codes from `PRYZM2-FINAL-WIREUP-AUDIT-S71-2026-04-28.md`:

| Wire | What | Effort | Status |
| ---- | ---- | -----: | ------ |
| **W1** | `src/main.ts:137` swap `bootHelloCube` → `mountEditor` (5 lines, real editor mounts) | 1 day | not started |
| **W3** | Auth bridge (`localStorage['bim-platform-token']` injected as `Authorization: Bearer` on `ProjectListClient` and friends; sign-in panel on 401) | 1 day | not started |
| **W4** | Polarity flip + sunset banner activation (`/` boots PRYZM 2; `?pryzm1=1` is the legacy fallback) | 1 day | not started |
| **W5-a** | Anthropic model id 404 fix (`server.js:108` default → live Haiku id; startup ping) | 0.5 day | live bug |
| **W5-b** | `SUPABASE_SERVICE_ROLE_KEY` provisioned + wired into socket join-project | 0.5 day | live bug |
| **W5-c** | `pryzm-vi-parity`, `pryzm-persistence`, `audit-log-middleware` workflows green | 2–4 days | red |
| **W2-min** | *Minimum* chrome — a single toolbar with wall + slab + door + window + select + pan tools, mounted above the canvas. Inspector docked right. **No** layer manager, **no** sheets nav for Gate P. | 5 days | not started |

**Gate P engineering subtotal: ~10 working days, 1 engineer.**

### §2.4 Operational wires for Gate P (the things bug-discovery needs)

| Item | What | Effort | Status |
| ---- | ---- | -----: | ------ |
| **OP-P1** | Crash reporter wired and reporting. `packages/crash-reporter/src/CrashReporter.impl.ts` exists; verify it is mounted by `mountEditor()` and that the OTel-linked reporter sends to a real collector (not noop). | 0.5 day | partial |
| **OP-P2** | OTel collector receiving + 14-day retention. The `pryzm.boot` span is already emitted; verify the collector endpoint is configured. | 0.5 day | partial |
| **OP-P3** | "Report a bug" button in the chrome that opens a mailto: to `support@pryzm.com` with auto-attached `userAgent`, `url`, build SHA, last 50 console messages. | 0.5 day | not started |
| **OP-P4** | `support@pryzm.com` inbox monitored business-hours; tickets land in a shared issue tracker (Linear / GitHub Issues). | 0.5 day setup, ongoing | not started |
| **OP-P5** | Build SHA visible in the chrome footer ("PRYZM 2.0.0-rc.N · `<7-char SHA>`") so bug reports identify the build. | 0.5 day | not started |
| **OP-P6** | A `docs/preview-tester-guide.md` shipped to alpha users — what to test, what to ignore (the "in beta" chrome elements), what to file a bug on, the support inbox. | 0.5 day | not started |
| **OP-P7** | Feature-flag gate (`packages/feature-flags`) so we can disable specific in-flight features per-user during preview without a deploy. | 0.5 day | partial (package exists) |

**Gate P operational subtotal: ~3 working days, 1 engineer + 1 founder ongoing.**

### §2.5 Gate P calendar

| Day | Work |
| --- | ---- |
| **D1** | W1 + W3 + W5-a + W5-b ship in one PR. Smoke test: real editor mounts, auth works, AI calls return 200. |
| **D2** | W4 polarity flip + sunset banner. Smoke test: `/` defaults to PRYZM 2; `?pryzm1=1` is legacy. |
| **D3–D4** | W5-c — fix the three red workflows. |
| **D5–D9** | W2-min toolbar + inspector mount. |
| **D10** | OP-P1 through OP-P7 — crash reporter check, OTel check, bug button, build SHA footer, preview-tester guide, feature-flag verification, support inbox setup. |

**Gate P opens at D10 (10 working days from S71 D1).** That is
end of S71 if W2-min is the bottleneck, or mid-S72 if the polarity
flip + chrome takes longer to stabilise.

---

## §3 Gate E — Enterprise Pilot Testing readiness

### §3.1 Audience definition

- **1–3 named enterprise pilot customers**, contracted via signed
  pilot agreement (LOI + DPA + NDA). Examples of the right shape:
  - A 50–200 person architecture practice running a 4-week pilot
    on one in-flight schematic-design project.
  - A Top-100 GC's BIM coordination team running a federated-clash
    pilot on a small commercial fit-out.
  - A national infrastructure agency's BIM standards team running
    a 4-week evaluation against ISO 19650.
- **Pilot scope is bounded.** One project per pilot. ≤10 named users
  per pilot tenant. ≤4 weeks duration. Real but small (<5,000
  elements).

### §3.2 Success criteria for Gate E

The pilot customer can:

1. Sign a pilot agreement that includes the in-progress posture
   honestly (DPA acknowledges SOC 2 timeline; NDA acknowledges
   pen-test status; pilot SLA = business-hours best-effort with
   4h P1).
2. Be provisioned a tenant in our single region with their named
   users (CSM-managed; self-serve admin UI not required for pilot).
3. Load a real project (IFC import, drawing import, or hand-built)
   and have it persist across the 4-week pilot without data loss.
4. See **only their tenant's data** — RLS coverage on all
   user-data-bearing tables (closes the §B.3 ADR-0050 gap).
5. Use the editor for 4 weeks without a critical-severity incident
   (= unplanned downtime > 1h, or any data loss).
6. File support tickets to a named CSM contact, get a P1 response
   within 4 business hours, get a weekly check-in call.
7. Have status-page visibility into our uptime + incidents during
   the pilot.
8. Export their project at the end of the pilot in a portable
   format (.pryzm v1.0 + IFC4 + PDF sheets) so they retain the
   work product whether they convert or walk.
9. Receive the security artefact pack (S68 scan baseline,
   CSP audit, plugin sandbox audit, OAuth2 review, RLS audit,
   secret rotation playbook) under NDA on request.

### §3.3 Engineering wires required for Gate E (delta over Gate P)

| Wire | What | Effort | Why pilot-blocking |
| ---- | ---- | -----: | ------------------ |
| **W2-full** | Full chrome — toolbar (12 elements + 6 tools), inspector, sheets nav, layer manager, view switcher | 10 days | A pilot user cannot evaluate the product through console-only. |
| **W6-cap1** | Vector PDF export from sheets (fixes the M20 sheets cap-stone) | 5 days | Pilot deliverables include plot-quality drawings. |
| **W6-cap2** | Role-matrix middleware on `server/api/v1/routes.js` (per `packages/api-rbac`) | 3 days | Multi-user pilot means role escalation must be locked down. |
| **W6-cap3** | AI back-pressure curve wired (front-end degrades when worker queue > 80%) | 3 days | AI plugins are part of the pilot pitch; queue-collapse on a pilot demo is unacceptable. |
| **RLS-gap** | Close the 19/21 RLS gap from ADR-0050 §B.3. Per-pattern policies (per-project, per-user, append-only audit, catalog, publisher self-management) on every user-data-bearing table. Verified test queries against live Postgres. | 5 days | Tenant isolation is non-negotiable for a pilot. |
| **OAuth2-prod** | OAuth2 production resource server wired (per ADR-0050 §B.5; was scheduled S70 D8). Replaces the test-shim with token introspection + refresh rotation. | 3 days | Pilot users authenticating via OAuth2 means the test shim is unacceptable. |
| **W7-stage1** | First legacy zone deletion (`src/engine/`, 11,960 LOC). Bundle drops ~3 MB. | 2 days | Pilot bundle size affects first-load on customer networks; not strictly blocking but visibly slow without it. |
| **Data-export** | "Export project" emits a `.zip` containing `.pryzm` + IFC4 + PDF sheets. End-of-pilot guarantee. | 3 days | The pilot agreement requires it; without it the pilot won't sign. |

**Gate E engineering delta: ~34 working days. With 2 engineers
parallelising independent items (UI vs backend), ~17 calendar
days = ~3.5 sprints over Gate P.**

### §3.4 Operational wires for Gate E (delta over Gate P)

| Item | What | Effort | Why pilot-blocking |
| ---- | ---- | -----: | ------------------ |
| **OP-E1** | **Pilot agreement template.** A 4–6 page LOI written by external counsel covering scope, term, fee (or no-fee for design partners), IP, confidentiality, success criteria, exit. Template parameterised per pilot. | 5 days (legal) | No agreement = no pilot. |
| **OP-E2** | **DPA template.** Standard EU GDPR + UK GDPR addendum. Acknowledges SOC 2 in progress, lists processors (Replit, Supabase, Anthropic, Cloudflare, etc.), data flow diagram, sub-processor list. | 3 days (legal) | EU pilots cannot sign without it. |
| **OP-E3** | **NDA template.** Mutual NDA; pilot security pack handed under it. | 1 day (legal) | Required to share security artefacts. |
| **OP-E4** | **Security pack assembly.** PDF compilation of: S68 security posture summary (ADR-0050), 7 companion docs, scan baseline with remediation plan, RLS audit (post-fix), pen-test executive summary (when delivered), data-flow diagram, sub-processor list. | 2 days | Pilot procurement + security review will request this. |
| **OP-E5** | **CAIQ + SIG-Lite first-pass response library.** ~2 days of writing answers to the standard questionnaires. Reusable per pilot. | 2 days | First pilot's security review will ask. |
| **OP-E6** | **Status page** (`status.pryzm.com` via Atlassian Statuspage / Better Stack / Instatus). Live uptime + incident posting. 12-month history accumulating from pilot day 1. | 1 day setup + ongoing | Pilots will check it; absence is a sales objection. |
| **OP-E7** | **Pilot tenant provisioning runbook.** SOP for: create tenant org, provision N users with role assignments, send welcome emails, create project skeleton, schedule kickoff call. | 2 days | Without an SOP this leaks tribal knowledge per-pilot. |
| **OP-E8** | **Named CSM (one founder + one backup).** 4h P1 response, weekly check-in call, shared Slack channel per pilot. Calendly slots reserved. | ongoing | Pilot agreement names the CSM; backfill plan if CSM unavailable. |
| **OP-E9** | **Support inbox upgrade.** `support@pryzm.com` + `pilots@pryzm.com` with SLAs by ticket priority (P1 4h, P2 1 business day, P3 3 business days). | 1 day setup | The pilot agreement references these. |
| **OP-E10** | **Pilot kickoff deck + weekly check-in template.** Standard slides for kickoff (scope, contacts, escalation, calendar) and weekly review (what was tested, what shipped, blockers, next-week plan). | 1 day | Operational discipline scales to N pilots. |
| **OP-E11** | **Backup verification cadence.** Weekly verified restore drill on a pilot tenant clone. Output retained for SOC 2 evidence collection. | 1 day setup + 1h/week ongoing | Pilots ask "what happens if our data gets lost?" — evidence required. |
| **OP-E12** | **Incident response procedure.** SOP for: detect → page → triage → comms (status page + customer email) → resolve → post-mortem. First-iteration version. | 2 days | One incident handled badly during a pilot loses the pilot. |
| **OP-E13** | **Data-export-on-exit verification.** End-to-end test that a pilot tenant can export everything and we can demonstrate clean deletion within 30 days. | 1 day | Pilot agreement requires it. |
| **OP-E14** | **Pricing for the pilot.** Either zero-fee design-partner agreement (preferred for the first 1–2 pilots) or a paid pilot fee ($25K–$100K depending on customer size), with conversion credit toward year-1 contract. | 2 days (commercial) | Without a pricing decision the conversation stalls. |

**Gate E operational delta: ~25 working days, mix of engineering +
legal + commercial + ops. Several of these are one-time setup (the
templates) and several are ongoing (CSM, weekly drill).**

### §3.5 Gate E calendar (delta over Gate P)

| Sprint | Work |
| ------ | ---- |
| **S71 close** | Gate P opens (per §2.5). |
| **S72 D1–D5** | W2-full chrome (toolbar + inspector + sheets nav + layer manager). RLS-gap closure on live Postgres. Data-export feature. |
| **S72 D6–D10** | OAuth2-prod wiring. W6-cap1 vector PDF. W6-cap2 role-matrix middleware. W6-cap3 AI back-pressure. W7-stage1 legacy deletion. |
| **S73 D1–D5** | OP-E1 through OP-E5 (legal templates + security pack + CAIQ/SIG-Lite). OP-E11 backup verification cadence. |
| **S73 D6–D10** | OP-E6 status page live. OP-E7 provisioning runbook. OP-E8 CSM coverage. OP-E9 support inbox upgrade. OP-E10 kickoff deck. OP-E12 incident SOP. OP-E13 data-export verification. OP-E14 pricing decision. **Gate E opens.** |
| **S74 D1** | First pilot kickoff. |

**Gate E opens at end of S73, ~6 calendar weeks after Gate P
opens, ~8 calendar weeks from S71 D1.**

---

## §4 Combined master checklist

Single-page rollup of every item across both gates so it can be
tracked in one tool.

### §4.1 Engineering (12 items)

```
GATE P (10 days)
[ ] W1     5-line dynamic-import swap in src/main.ts:137
[ ] W3     auth bridge (Bearer injection + sign-in panel)
[ ] W4     polarity flip + sunset banner activation
[ ] W5-a   Anthropic model id 404 fix
[ ] W5-b   SUPABASE_SERVICE_ROLE_KEY provision + wire
[ ] W5-c   3 red workflows green
[ ] W2-min minimum chrome (toolbar w/ 6 tools + inspector)

GATE E DELTA (17 days, 2 engineers)
[ ] W2-full     full chrome (12-tool toolbar + sheets nav + layer mgr)
[ ] W6-cap1     vector PDF export from sheets
[ ] W6-cap2     role-matrix middleware on /v1 routes
[ ] W6-cap3     AI back-pressure curve wired
[ ] RLS-gap     RLS policies on remaining 19 user-data tables
[ ] OAuth2-prod production resource server (replaces test-shim)
[ ] W7-stage1   src/engine/ deletion (3 MB bundle drop)
[ ] Data-export pilot tenant export-everything zip
```

### §4.2 Operational / Legal / Commercial (21 items)

```
GATE P (3 days)
[ ] OP-P1 crash reporter mounted + reporting to OTel collector
[ ] OP-P2 OTel collector + 14-day retention verified
[ ] OP-P3 "report a bug" mailto button in chrome
[ ] OP-P4 support@pryzm.com monitored + ticket tracker wired
[ ] OP-P5 build SHA in chrome footer
[ ] OP-P6 docs/preview-tester-guide.md shipped to alpha cohort
[ ] OP-P7 feature-flag gate verified for kill-switch use

GATE E DELTA (25 days)
[ ] OP-E1  pilot agreement template (legal)
[ ] OP-E2  DPA template (legal, GDPR + UK GDPR)
[ ] OP-E3  NDA template (legal)
[ ] OP-E4  security pack PDF assembly
[ ] OP-E5  CAIQ + SIG-Lite first-pass response library
[ ] OP-E6  status page live (status.pryzm.com)
[ ] OP-E7  pilot tenant provisioning runbook
[ ] OP-E8  named CSM coverage (founder + backup)
[ ] OP-E9  support inbox upgrade with SLA tiers
[ ] OP-E10 pilot kickoff deck + weekly check-in template
[ ] OP-E11 weekly verified restore drill on pilot clone
[ ] OP-E12 incident response SOP
[ ] OP-E13 data-export-on-exit end-to-end verification
[ ] OP-E14 pilot pricing decision (zero-fee design partner vs paid)
```

**Total: 12 engineering + 21 operational/legal/commercial = 33 items.**

---

## §5 The smallest path forward (next 2 sprints)

If you want a single sentence of action:

> *"Land W1 + W3 + W4 + W5 in S71 D1–D5, ship W2-min + OP-P1
> through OP-P7 in S71 D6–D10 to open Gate P. Use the S72 capacity
> for W2-full + RLS-gap + OAuth2-prod + Data-export to land the
> engineering side of Gate E by S72 close. Run S73 as the
> operational/legal/commercial sprint to open Gate E at S73 close.
> Sign the first pilot at S74 D1."*

That puts the first pilot kickoff at **~9 calendar weeks from
today** (2026-04-28 → 2026-07-01).

---

## §6 What this gives you commercially

A summary of what each gate unlocks.

### §6.1 Gate P unlocks

- A working alpha that the team can dogfood for one hour without
  losing work.
- Real bug reports from real users, not from staring at the code.
- Telemetry (`pryzm.boot`, crash reports) starts accumulating
  baseline data so post-GA regressions are detectable.
- A `preview.pryzm.com` (or equivalent) URL that can be shared
  with prospects under loose NDA for feedback — not for paid
  pilots.

### §6.2 Gate E unlocks

- A signed pilot revenue line ($25K–$100K per pilot if paid; zero
  if design partner) and one named reference customer for the GA
  launch.
- A real load test on the system at customer-data scale.
- The security questionnaire, DPA, and pilot agreement library
  that every subsequent enterprise sale will reuse.
- A 4-week feedback loop on what enterprise users *actually* care
  about — almost certainly different from what the team thinks
  they care about.
- The credible foundation to run a public GA at S72 with "3 named
  pilot customers including [name redacted]" in the launch press.

### §6.3 What this does NOT give you

- It does not give you a SOC 2 report. Pilot DPAs say "in
  progress" and pilots accept that.
- It does not give you 24/7 support. Pilot SLAs say "business
  hours" and pilots accept that.
- It does not give you flagship-scale (1M+ element) performance.
  Pilot scope is bounded to <5,000 elements.
- It does not give you self-serve enterprise IAM (SAML/SCIM
  runtime). Pilot users are CSM-provisioned manually.
- It does not give you multi-region. EU pilots either accept the
  US region with NDA or take the self-host stack.

These are the same items the enterprise reality check named — they
are post-GA work, not pilot-blockers, *as long as the pilot
agreement names them honestly*.

---

## §7 Risks to both gates (and what to do about them)

| Risk | Probability | Impact | Mitigation |
| ---- | :---------: | :----: | ---------- |
| W2-min toolbar takes 10 days instead of 5 | High | Slips Gate P to mid-S72 | Cut to a 3-tool toolbar (wall + select + pan) for Gate P only; expand for Gate E. |
| RLS-gap closure surfaces a defence-in-depth bug that takes a week to fix | Medium | Slips Gate E by 1 sprint | Schedule the RLS work first in S72 so any drift is contained early. |
| OAuth2-prod wiring exposes a token-introspection edge case the test shim hid | Medium | Slips Gate E by 0.5 sprint | Stage on a non-pilot tenant for 3 days before the first pilot kickoff. |
| Legal templates take 10 days instead of 5 | High | Slips Gate E by 1 week | Start the legal work in S72 (parallel to engineering) instead of S73. |
| The first pilot customer's procurement security review demands SOC 2 in hand | Medium | First pilot doesn't sign | Pre-qualify pilots: only pursue customers where the buyer (BIM director, head of digital design) can override the procurement security review for a pilot, not for a full contract. Most can. |
| First pilot finds a critical-severity bug in week 2 | High | Pilot pauses; CSM time spike | Reserve 30% of the first pilot's CSM time for incident handling, not check-ins. Plan one hot-fix release window per week of the pilot. |
| `support@pryzm.com` inbox becomes overwhelmed during alpha | Medium | Bug discovery slows | Cap alpha cohort at 15 users for the first 2 weeks; expand only after the inbox cadence is sustainable. |
| AI quota exhaustion + Anthropic 404 collide | Live | AI features break for every alpha user | W5-a + the persistent AI quota fix from `PRYZM2-FINAL-WIREUP-AUDIT-S71-2026-04-28.md` §7 ship together. |

---

## §8 Honest framing for the team

This doc is not a re-statement of the master plan; it is a
*subset* of it sequenced for the **single most expensive thing the
team can do next**, which is **prove the 36 months works in real
hands**. There is one trap to avoid:

- **Don't slip Gate P to perfect Gate E.** Gate P opens in 10
  working days. Anything that doesn't fit in those 10 days waits
  for S72. Shipping Gate P fast is what surfaces the bugs that
  S72 needs to know about.

And one trap not to fall into the other direction:

- **Don't open Gate E before Gate P has run for 2 weeks.** The
  first pilot landing on a system that hasn't survived 2 weeks
  of internal + alpha testing is the highest-risk move available.
  The pilot calendar (S74 D1 = ~6 weeks post-Gate-P) builds in
  exactly that buffer; don't shorten it.

Everything below the above two rules is detail.

---

## §9 Cross-references

- `PRYZM2-FINAL-WIREUP-AUDIT-S71-2026-04-28.md` — the 9 engineering wires.
- `PRYZM2-ENTERPRISE-GRADE-REALITY-CHECK-2026-04-28.md` — what enterprise GA actually requires (which Gate E is *not*).
- `docs/02-decisions/adrs/0050-s68-security-hardening-posture.md` — the security posture the security pack draws from.
- `docs/02-decisions/adrs/0048-s67-self-host-docker-compose.md` — the self-host fallback for EU pilots that don't accept US region.
- `docs/02-decisions/adrs/0049-s67-multi-region-cut-decision.md` — why pilots run single-region.
- `docs/X_B2B/B2B-IMPLEMENTATION-PLAN.md` — the existing pricing tiers + B2B streams the pilot pricing decision draws from.
- `docs/PRODUCTION-READINESS-IMPLEMENTATION-PLAN.md` — the PRYZM 1 production-readiness plan whose Phase 7–12 hardening items partially overlap §3 above.

---

*End of test-readiness audit. — 2026-04-28, S71.*
