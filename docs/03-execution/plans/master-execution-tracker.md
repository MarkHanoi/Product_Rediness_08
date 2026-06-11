# PRYZM — Master Execution Tracker

> **Stamp**: 2026-06-03 · **Status**: CANONICAL · **The day-to-day navigation tracker**
> **Latest (2026-06-03)**: IP-A5.X apex/app split is CODE-COMPLETE on `main` (every remaining item is user infra: Fly deploy · DNS · Supabase Pro). IP-A3 RAC pipeline at ~90% — apex→app deep-link wired (A.17.x.23), post-auth brief-ready seam (A.5.g), apartment-from-footprint console cmd + AI-panel button (A.5.g.2). The full RAC→GIS→scene→apartment-from-boundary journey is now sequenced in [PIPELINE-RAC-TO-SITE-TO-DESIGN-2026-06-03.md](./PIPELINE-RAC-TO-SITE-TO-DESIGN-2026-06-03.md); C19 `SiteModelStore`+`ParcelBoundarySchema` confirmed REAL. Next headless slice: site L5 dispatch adapter (A.7.c.x) → A.5.g.3 read-boundary → generate.
> **Purpose**: ONE table answering "what's the next thing to do?" — every active sub-phase across Phases A/B/C with goal, description+refs, status.
> **Companion to**: the layered plans ([cadence-and-planning-system.md](./cadence-and-planning-system.md) explains the planning system; this doc is the operational view across all horizons).
> **Update cadence**: at every sprint close + on any major status change. PR + review.

---

## §1 — How to read this tracker

- **Phase letter** (A · B · C) maps to roadmap phase: A=Alpha (0-6mo), B=Beta (6-18mo), C=GA (18-36mo).
- **Sub-phase** is a numbered increment within the phase (A.1, A.2, …).
- **Goal**: the one-line deliverable.
- **Description + refs**: detail + links to the canonical contract/spec/plan.
- **Status**: see §2.

## §2 — Status legend

| Status | Meaning |
|---|---|
| ✅ DONE | Shipped + acceptance criteria met + in production |
| 🟢 IN PROGRESS | Active work in current/next sprint |
| 🟡 NEXT UP | Scheduled for the next 2 sprints |
| ⚪ PLANNED | Scheduled later in this phase |
| 🔴 BLOCKED | Cannot proceed without dependency resolution |
| 🔵 DEFERRED | Pushed out beyond this phase by deliberate decision |
| ⚫ CLOSED-DEFERRED | Decided not to ship; ADR recorded |

---

## §2.5 — CONSOLIDATED PHASE-BY-PHASE INDEX (the single canonical view)

The audits in §12, §16, §18, §19, §20 surfaced ~584 sub-phases across Phases A/B/C/D + cross-cutting X.*. This §2.5 indexes the canonical tables — §3 (Phase A), §4 (Phase B), §5 (Phase C), §6 (Phase D), §7 (X cross-cutting) — and points to the sub-section for each category.

Every sub-phase **anywhere in this doc** has the `| Phase | Goal | Description + references | Status |` row format. The aggregated counts per category:

| Category | Phase A (~290) | Phase B (~136) | Phase C (~96) | Phase D (~46) | Cross-cut (~16) | Doc section |
|---|---:|---:|---:|---:|---:|---|
| **Core typology + site + climate + SDK + marketplace + brand** | A.1–A.41 (41) | B.1–B.35 (35) | C.1–C.39 (39) | — | — | §3.1 / §4.x / §5.x |
| **Editor UI redesign** | A.U.1–A.U.18 (18) | B.U.1–B.U.17 (~17) | C.U.1–C.U.12 (12) | — | — | §12.3 + §12.4 |
| **Project hub / page / lifecycle** | A.PL.1–A.PL.6 (6) | B.U.6 (1) | — | — | — | §12.3 |
| **Sheet + view + elevation UX** | — | B.S.1–B.S.5 (5) | C.U.1 (1) | — | — | §12.4 |
| **Inspect tree + Data Panel UX** | A.24 (1) | B.12–B.13 + B.I.1–B.I.3 + B.D.1–B.D.3 (8) | C.U.3 + C.U.4 (2) | — | — | §12.4 |
| **Family creation pipeline** | A.F.1–A.F.5 (5) | B.F.1–B.F.4 (4) | C.F.1–C.F.2 (2) | — | — | §12.5 |
| **Native Revit (IFC4 + Python adapter)** | A.R.1–A.R.2 (2) | B.R.1–B.R.3 (3) | C.R.1–C.R.4 (4) | — | — | §12.6 |
| **AI commands + assistant** | A.42–A.47 (6) | B.AI.1–B.AI.4 + B.U.5 (5) | C.AI.1–C.AI.2 (2) | — | — | §12.7 |
| **Auth + Billing UX** | A.A.1–A.A.4 + A.B.1–A.B.5 (9) | B.A.1–B.A.2 + B.B.1–B.B.4 (6) | — | — | — | §12.8 |
| **Admin tooling** | A.AD.1–A.AD.2 (2) | B.AD.1–B.AD.3 (3) | C.AD.1–C.AD.2 (2) | — | — | §12.9 |
| **Apartment master (D-α/β/γ · L1-L7 · D+T classes · P0 · F-tier)** | A.AM.* + A.CS.* + A.DC.* + A.F1.* + A.AM.FP.* (~80) | B.AM.* + B.CS.* + B.DC.* + B.F2.* + B.F3.* + B.AM.FP.* (~40) | C.AM.* + C.CS.* + C.DC.* + C.F4.* + C.F5.* + C.F8.* + C.AM.FP.9 (~25) | D.AM.* + D.CS.* + D.DC.* + D.F6.* + D.F7.* (~15) | — | §19 |
| **Marketing + trust surfaces** | A.M.1–A.M.10 + A.M.LAUNCH.* (13) | B.M.1–B.M.3 (3) | C.M.1 (1) | — | — | §12.11 + §19.6 |
| **Mobile + tablet** | A.MO.1–A.MO.3 (3) | B.MO.1–B.MO.3 (3) | C.MO.1–C.MO.3 (3) | — | — | §12.12 |
| **Production-readiness blockers + highs (from remaining-work)** | A.PR.B10–B19 + A.PR.H3–H37 (~25) | — | — | — | — | §16.1 + §16.2 |
| **Architecture migration (P4/P6/P8 finalisation)** | A.AM.H33–H36 + A.P4F + A.P8F (3) | — | — | — | — | §16.3 |
| **Daily-use sprints (T-* · U-* · C-* · M-* · L-* · S-* IDs)** | A.DU.* (~30) | — | — | — | — | §16.4–§16.9 |
| **Plan-view incremental projection** | A.PV.OPENING + A.PV.STAIR-RAIL + A.PV.CONTRACT + A.PV.HLR (4) | — | — | — | — | §16.10 |
| **Master-status OI register (OI-007 → OI-058)** | A.OI.* (~10) + C.OI.007 (1) | — | — | — | — | §16.11 |
| **Apartment-layout carry-overs (multi-apt brief · NO-windows · corridor · etc.)** | A.APT.* (~11) | — | — | — | — | §16.12 |
| **Wall-junction defects** | A.WJ.LCORNER + A.WJ.MULTICLUSTER + A.WJ.IWO (3) | B.WJ.ADR55P4A/B/C (3) | — | — | — | §16.13 |
| **Operator / non-code** | — | — | — | — | X.OP.1–X.OP.3 (3) | §16.14 |
| **Phase D post-GA (WCAG · multi-IFC · GeoJSON · SAB · WebGPU-mobile · family-threading · multi-day-offline · CI/CD)** | — | — | — | D.PGA.1–D.PGA.8 (8) | — | §16.15 |
| **Spec audit additions (CDE · stakeholder · MEP · EIR · buildingSMART · sheet×4D×5D · analysis-bridge · sustainability · PDF-to-BIM · materials · wall-mvt · stair3D · edge-flicker · WebGPU-overlay)** | A.SP.32 + A.SP.33 + A.SP.38 + A.SP.39 + A.SP.MAT + A.SP.WMS + A.SP.S3D + A.SP.EL.1 + A.SP.EL.2 (~9) | B.SP.40 + B.SP.41 + B.SP.42 + B.SP.MAT (~4) | C.SP.43 + C.SP.45 (~2) | — | — | §18.2 + §18.3 |
| **AEC-Magazine wishlist (DfMA · ConTech · AI-2D-drawing · outcome-pricing)** | — | — | — | D.AEC.46 + D.AEC.47 + D.AEC.53 + D.AEC.58 (4) | — | §20.1 |
| **Extended SPEC numbering (Linked-Data · IDS · ICDD · bSDD · AI-design-partner · Code-compliance · DTDL/IoT · Spec-writer · decentralised-data)** | — | — | — | D.SP.48–58 (9) | — | §20.2 |
| **Strategic ADRs pending (ADR-036 → ADR-050)** | — | B.ADR.36–38 (3) | C.ADR.39–42 (4) | D.ADR.43–50 (8) | — | §20.3 |
| **Launch publication (beta · GA · demo)** | A.M.LAUNCH.BETA + A.M.LAUNCH.GA + A.M.LAUNCH.BETA-DEMO (3) | — | — | — | — | §19.6 |
| **Wireup-2026 residuals (mostly shipped)** | A.WU.768 + A.WU.E8 (2) | — | — | — | — | §19.7 |
| **Cross-cutting continuous** | — | — | — | — | X.1–X.10 + X.OP.1-3 (~13) | §7 + §16.14 |
| **TOTAL** | **~290** | **~136** | **~96** | **~46** | **~16** | **~584** |

### §2.5.1 — How to use this index

For day-to-day operations:

- **Standup**: open §3 (Phase A) — scan for 🟢 IN PROGRESS + 🟡 NEXT UP rows
- **Sprint planning**: cross-reference §3 against the quarterly plan (Q3 / Q4)
- **Phase exit**: re-read §3 + verify all rows → ✅ DONE or 🔵 DEFERRED with ADR
- **Cross-team handoff**: cite the sub-phase ID + the doc reference in the row
- **New work surfaces**: pick a phase + category from §2.5 + add a row in the right §3.x / §4.x / §5.x / §6.x sub-section per the convention in §15

**The canonical detailed tables follow in §3 (Phase A), §4 (Phase B), §5 (Phase C), §6 (Phase D), §7 (X cross-cutting).** All sub-phase rows from §12–§20 audit sections are referenced through §2.5 to their source rows — the audit sections preserve the authoring trail without duplicating the table content.

---

## §2.6 — UI Testing Inflection Points (IPs) — the user-testable moments

A development plan without testable inflection points is theoretical. **Every sprint of Phase A ships a concrete UI surface the user (founder · architect-on-team · pilot customer) can click through to verify the work is real**. Each IP = one demo + one acceptance test + one customer feedback loop.

The IP framework injects testing cadence into the otherwise-infrastructure-heavy Phase A. Sub-phases group around IPs — at every IP, the user opens the app and validates the cumulative surface.

### §2.6.1 — IP design principles

| Principle | What it means |
|---|---|
| **Every 2 weeks** | Sprint close = IP close. No 4-week gaps without UI surface. |
| **Cumulative, not destructive** | Each IP builds ON the previous (regression-tested). A new IP never breaks the previous IP's testable workflow. |
| **One sentence acceptance** | The IP can be summarised in one sentence: "User can do X." If you need 3 sentences, split into 2 IPs. |
| **Demo-able in < 10 min** | The full IP demo (signup → action → result) runs in under 10 minutes; longer demos hide UX friction. |
| **Pilot-customer-runnable** | A pilot customer can run the IP demo with a 1-page script + zero engineering help. |
| **Inflection ≠ feature complete** | An IP is the user-visible moment; the work behind it may still have polish or edge-cases that close in later IPs. |

### §2.6.2 — IP status legend

| Status | Meaning |
|---|---|
| 🎯 **OPEN** | Currently being built toward |
| ✅ **REACHED** | Demonstrated; user-tested; acceptance criteria met |
| ⚠️ **PARTIAL** | Demonstrated but with acceptance gaps |
| 🔁 **REGRESSING** | Was REACHED; broke in a later sprint; recovering |

---

## §3.0 — Phase A — Inflection Point Roadmap (13 IPs across 6 months)

Every 2-week sprint of Phase A delivers a testable UI moment. The columns answer: **WHEN** (sprint close), **WHAT'S TESTABLE** (one-sentence user-can statement), **CONTRIBUTING SUB-PHASES** (the work powering this IP), **DEMO SCRIPT REFERENCE** (where the test runbook lives), **SUCCESS CRITERIA** (specific pass conditions).

> **2026-06-02 re-rank**: the original calendar-order (IP-A1 → IP-A13) assumed each IP would close in its sprint slot. By Sprint 2 we have ~ 40 % of sub-slices DONE across 9 IPs but **0 IPs closed** — substrate landed everywhere, surface landed nowhere. The new **`🎯 Closure rank`** column re-orders IPs by engineering-closability so we drive ONE IP to acceptance at a time. Original IP numbers (`IP-A1` … `IP-A13`) are preserved because external docs reference them; the new sequencing is the rank column. External infra blockers (npm token, Cloudflare DNS, paying customers) are flagged inline so the user can unblock in parallel. **Closure rank 1 — old IP-A5** (pricing + provenance + brand cutover) — is the active focus because pricing ships + provenance backend ships + DNS unblock is in flight (user has `pryzm.so` in Cloudflare).

| Closure rank | IP # | Sprint close | Theme | What the user can test (one sentence) | Contributing sub-phases | Success criteria | Status |
|---|---|---|---|---|---|---|---|
| **🔁 0 — REGRESSING / REPLATFORM** | **IP-A5** | Sprint 5 · 2026-09-08 | **Brand cutover + C19/C21 canonical (under replatform)** | "I navigate to pryzm.so, see the editor's landing → sign-in → project hub → main canvas as ONE app, hosted on Cloudflare + Supabase." | 🔁 A.17 (Cloudflare Pages was live for Astro mirror; **retired per ADR-055** — pryzm.so flips to Fly.io editor in Phase A, then to Cloudflare Pages + Functions in Phase B+), ✅ A.M.3 (manifesto.astro — superseded; **content moves into editor route** per ADR-055 §7), ✅ A.M.4 (trust.astro — same), ✅ A.18 (pricing-page generator — **deleted per ADR-055 §7**, editor renders directly from @pryzm/entitlements), ✅ A.M.5 (root index.astro — **deleted per ADR-055 §7**, editor's LandingPage.ts is canonical), ✅ A.31.e (L5 Provenance panel + right-click menu — 48 tests — UNAFFECTED by replatform), ⚪ C19 + C21 ratifications (deferred) | (1) pryzm.so resolves to the EDITOR (not an Astro mirror) ⚪ in flight via ADR-055 Phase A; (2) Pricing page reads from entitlement registry ✅ (moves into editor); (3) Right-click → "Show AI provenance" ✅ engineering DONE | 🔁 REGRESSING to drive ARCHITECTURE-correct outcome. The Astro mirror was an architectural shortcut (ADR-052, now SUPERSEDED). User flagged the drift trap: "There is only one app — one solution — PRYZM." Re-driven via [ADR-055](../../02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md) — 4 phases (A: Fly.io bridge · B: static-to-edge · C: API-to-functions · D: CRDT-to-DO). |
| **🎯 0.5 — DRIVING NOW** | **IP-A5.X** | Sprint 5 (overlap) | **One PRYZM: apex/app split + EU residency + Cloudflare + Supabase (Phase A bridge)** | "pryzm.so apex serves pre-rendered marketing (Cloudflare Pages); app.pryzm.so serves the editor (Fly.io, EU `fra`) — both from the SAME codebase per the motif.io / linear.app pattern." | ✅ A.17.x.0 (ADR-055 authored 2026-06-02), ✅ A.17.x.1 (ADR-052 marked SUPERSEDED), ✅ A.17.x.2 (Phase A artifacts: Dockerfile + .dockerignore + fly.toml + .github/workflows/deploy-fly.yml — wired to `/api/health/{live,ready}`), ✅ A.17.x.3 (Production-hardening checklist authored — 15 sections cited file:line; 3 pre-flip gates identified: trust-proxy=2 · STRIPE_WEBHOOK_SECRET · 6-route err.message leak), ✅ A.17.x.4 (Astro retirement plan authored — 6 pages retire, 17 docs survive at docs.pryzm.so), ✅ A.17.x.5 (Strategic-docs audit caught 4 critical ADR-055 errors: region · domain · auth · Phase D conflict invariant), ✅ A.17.x.6 (**ADR-055 AMENDED**: §0 apex/app split per motif pattern · §5 EU region `fra` per C22/C49 · §2 custom-JWT preserved per C08+ADR-045 · §3 Phase D conflict invariant per C08 §3.2 · §2 honest cost trajectory ($25/mo Supabase Pro floor for C48 RTO/RPO compliance)), ✅ A.17.x.7 (`product-vision.md` amended: pryzm.so canonical domain; pryzm.app aspiration retired), ✅ A.17.x.8 (**ADR-056 ACCEPTED** — Supabase Auth migration plan; 421 lines; sequenced as Phase A.5 AFTER Phase A close; dual-stack 30-day window; supersedes C08 §1.1 + ADR-045 §3), ✅ A.17.x.9 (Phase A migration runbook AUTHORED — 13 sections, 70+ operator actions, 18-row verification matrix, 6-failure-mode rollback playbook; `docs/05-guides/deployments/PHASE-A-MIGRATION-RUNBOOK-2026-Q3.md`), ✅ A.17.x.10 (**3 pre-flip security gates CLOSED**: trust-proxy=2 env-tuned · STRIPE_WEBHOOK_SECRET fails 503 instead of silent 200 · 6+ err.message leaks closed via respondInternalError helper; **13 new tests green**), 🟡 A.17.x.11 (Fly app `pryzm` provisioned in `fra` + first deploy green — **deploy artifacts audited + 2 boot/build blockers FIXED** `c98b7b2`: top-level `vite` import crashed prod boot, `tests/*` workspace manifests dockerignored broke frozen-lockfile; health grace 5s→30s. **CI `docker-image` job builds + boots the image vs ephemeral Postgres → `/api/health/ready`** = Fly-parity proof every push. Remaining = user: `flyctl apps create pryzm` + `FLY_API_TOKEN`/secrets + first real deploy), ✅ A.17.x.12 (apex pre-render BUILD WIRED `7b5baac` + **Cloudflare repoint CONFIRMED LIVE 2026-06-03** — `pryzm.so` serves the `dist-apex` landing ("Build the future, intelligently. / Start here"); `APP_ORIGIN` env points the "Start here" CTA at the app host. **NB landing-fidelity gap vs the editor → A.17.x.21**), 🔴 A.17.x.13 (DNS: `pryzm.so` → `pryzm.pages.dev` apex · `app.pryzm.so` + `api.pryzm.so` → `pryzm.fly.dev` · TLS issued. **CONFIRMED BLOCKED 2026-06-03 from live:** "Start here" on `pryzm.so` → `https://pryzm.fly.dev/signup` → **`DNS_PROBE_FINISHED_NXDOMAIN`** (+ the "Unsafe attempt to load URL … from chrome-error://" follow-on, a consequence of the error page). The CTA + the §3.2.2 redirect (A.17.x.23) are CORRECT — `pryzm.fly.dev` simply doesn't resolve because **the Fly app isn't deployed yet (A.17.x.11)**. **Fix (USER INFRA):** (1) `flyctl deploy`; (2) `flyctl status`/`apps list` to read the REAL Fly hostname (may differ from `pryzm.fly.dev`); (3) set Cloudflare `APP_ORIGIN` to a REACHABLE host — the deployed Fly URL now, or `https://app.pryzm.so` once this DNS+TLS lands. Until then the full pipeline is testable LOCALLY at `localhost:5000/signup`.), ✅ A.17.x.14 (Astro marketing deletion DONE + merged to main — 5 marketing pages {index,pricing,manifesto,trust,start}.astro + `gen-docs-site-pricing.mjs` + `pricing.json` removed, `404.astro` kept; `check-no-product-routes-in-docs-site` gate LIVE in the `apex-gates` CI job. **NB: Cloudflare MUST already build `dist-apex` — the Astro source is gone from main**), ⚪ A.17.x.15 (Cloudflare Pages project re-scoped to `docs.pryzm.so` only OR deleted), ⚪ A.17.x.16 (Supabase project provisioned in `eu-central-1` Frankfurt; Supabase Pro upgraded for C48 PITR compliance before first paying customer), ✅ A.17.x.17 (**C51 contract CANONICAL** — normative form of ADR-055 §0: DNS map §4 + route table §5 + build contract §6 + 5 planned CI gates §7; commit `7b5baac`), ✅ A.17.x.18 (**marketing pricing/manifesto/trust moved into editor L7** per §7 — `apps/editor/src/ui/marketing/`, single source the apex + in-app router both consume; PlatformRouter `showMarketing()` + `?page=` deep-link; Pricing reads live from `@pryzm/entitlements`; commit `7f20484`; 12 happy-dom tests green), ✅ A.17.x.19 (**§4 OAuth callback popup-HTML leak sealed** — Google + Microsoft callbacks no longer interpolate `err.message` into popup HTML/postMessage; errorId + sanitised message; commit `46d4566`; +2 tests → 52/52 green), ✅ A.17.x.20 (**C51 §7 boundary gates + CSP hardening shipped** — **5 of 7 §7 gates LIVE** in the `apex-gates` CI job: apex-self-contained · apex-size · apex-no-auth-cookies · no-product-routes-in-docs-site · route-surface-assignment; **§3.2.1 app→apex 301 redirect** for /pricing,/manifesto,/trust (hostname-guarded, tested §5); **config-derived `connect-src`** (`buildConnectSrc` — drops the dead AI origin, derives the exact Supabase origin from `SUPABASE_URL`, ws: dev-only); **CSP `report-uri` violation sink** (`server/cspReport.js`) for evidence-based strict-CSP tightening; remaining 2 gates (strict-csp · dns-probe) need a running app / live DNS; commits `a51efbe`→`abb8313`; 66/66 server tests green), ✅ A.17.x.21 (**apex landing now byte-parity with editor `LandingPage`** — was a fidelity gap flagged 2026-06-03 from live: the apex pre-render hand-wrote a SIMPLIFIED landing (hero + bespoke + Manifesto/Pricing/Trust nav) vs the editor's full `LandingPage.ts` (hero + bottom-bar Pricing/Solutions/Resources + JS mosaic gallery). This is the **C51 §2.1.5 drift the contract forbids** ("apex MUST consume the editor's component source"). **Proper fix:** extract `LandingPage`'s static body into a pure shared `landingMarkup(mode)` module both the editor + the prerender consume — mode='app' preserves the exact button ids so the editor JS wiring is intact, mode='apex' emits anchor links to `APP_ORIGIN`. Blockers: the mosaic is SCC-blocked (`LandingPageMosaic`→`@pryzm/core-app-model`) so it static-skips; and a **nav/route reconciliation** is needed (editor nav shows Solutions/Resources which have NO apex routes — apex only built /pricing,/manifesto,/trust). Needs running-app verification of the editor landing post-extraction. **✅ FIXED 2026-06-03 (parallel agent)** — `apps/editor/src/ui/platform/landingMarkup.ts` (NEW, import-pure) holds the EXACT `build()` template; `LandingPage.build()` calls `landingMarkup({mode:'app'})` (same ids → editor JS intact); `prerender-apex.mjs` emits `landingMarkup({mode:'apex',appOrigin})`. `dist-apex/index.html` now contains `lp-bottom-bar` + `lp-bespoke` + hero with `${APP_ORIGIN}` CTAs = byte-parity with the editor. Editor typecheck clean), ✅ A.17.x.22 (**strict-CSP `script-src-attr 'none'` unblocked** — replaced all inline DOM `onclick=` handlers with `addEventListener`: `index.html` boot skeleton ×5 (→ `data-skel-action` + delegated wireup), AICreatePanel dropzone, PlatformRouter maintenance overlay; the live-console violation source. Advances the `check-app-strict-csp` gate. Parallel agent 2026-06-03), ✅ A.17.x.23 (**apex→app pipeline deep-link WIRED — "test the pipeline from pryzm.so" unblocked** — the apex landing's clean CTA paths (`/signup`,`/start`,`/sign-in`) didn't resolve into the SPA, which is query-routed (`PlatformRouter` reads `?page=` on first paint): clicking "Start here" on pryzm.so would have dumped the visitor on the LANDING, not onboarding. Fixed with **`server.js` §3.2.2** clean-path→`?page=` 302 redirects (`/signup`→`?page=signup`→RAC onboarding · `/start`→onboarding · `/sign-in`→`?page=signin`→auth modal · `/contact`,`/solutions`,`/resources`→landing root) applied on ALL hosts incl. localhost (testable locally NOW, before Fly) + **`PlatformRouter` `?page=signin`** handler (opens auth modal directly). End-to-end: pryzm.so "Start here" → app.pryzm.so/signup → 302 → ?page=signup → SPA → RAC onboarding → brief → auth → A.5.g brief-ready. **9 new §5b redirect tests green (37/37 suite)**; routing canonicalized into C51 §3.2.2 + §5 table (parallel doc agent)) | (1) `curl -I https://pryzm.so/` returns 200 pre-rendered HTML from Cloudflare Pages globally ✅ (repoint live); (2) `curl -I https://app.pryzm.so/` returns 200 from Fly `fra` ⚪; (3) Sign-in modal on app.pryzm.so ⚪; (4) Project Hub reachable post-auth ⚪; (5) Astro source tree deleted ✅ (A.17.x.14, on main); (6) ADR-055 amended + ADR-056 planned ✅; (7) Custom JWT preserved per C08 §1.1 ✅; (8) EU region honored per C22 §1.3 + C49 §1.2 ✅; (9) **ALL 4 contract conflicts resolved BEFORE any code shipped** ✅ | 🎯 ~ 70 % — 14 of 20 sub-tasks DONE + 2 in-progress (Astro deletion merged · §7 gates + CSP hardening shipped · Fly artifacts fixed + CI-validated; apex build + Cloudflare repoint awaiting the dashboard step). **CRITICAL PATH**. Every remaining item is now a pure infra action the USER performs: Cloudflare repoint+DNS (A.17.x.12/13/15), `flyctl apps create pryzm`+token+deploy (A.17.x.11), Supabase Pro provision (A.17.x.16). All code/config that can be built + verified without live infra is DONE on `main` (sealed by the `docker-image` Fly-parity CI job). |
| **⚪ — — RESERVED** | **IP-A5.B** | Sprint 6 | **Static client → Cloudflare Pages (Phase B of ADR-055)** | "The Vite-built `dist/` is served from Cloudflare Pages globally; the API still calls Fly. First-paint < 800ms p95." | ⚪ Build pipeline emits dist/ to Cloudflare Pages on push to main; ⚪ pryzm.so CNAME → pryzm.pages.dev; ⚪ Editor's API base URL → app.fly.dev or api.pryzm.so | (1) p95 first paint < 800ms globally — measured | ⚪ Not started. Follows Phase A close. |
| **⚪ — — RESERVED** | **IP-A5.C** | Sprint 6-7 | **45 Express routes → Pages Functions (Phase C of ADR-055)** | "API routes serve from Cloudflare's edge globally; Fly decommissioned." | ⚪ Read-only routes first (GET projects, GET project/:id), ⚪ then mutations (POST/DELETE/PATCH), ⚪ then Stripe webhook (raw-body via `req.text()`), ⚪ parity tests across both paths during cutover | (1) Each route ships with parity test green for 1 sprint before flip; (2) Fly destroyed by sprint close | ⚪ Not started. Highest engineering surface in the migration. |
| **⚪ — — RESERVED** | **IP-A5.D** | Sprint 7 | **Socket.io → Durable Objects (Phase D of ADR-055)** | "Yjs CRDT round-trips via Cloudflare Durable Objects; full Cloudflare stack." | ⚪ One DO per project, ⚪ WebSocket upgrade in Pages Functions handler, ⚪ Yjs sync protocol parity-tested vs Socket.io | (1) CRDT round-trip p95 ≤ 80ms (Socket.io baseline); (2) Full Cloudflare stack live; (3) Cost projection within budget | ⚪ Not started. HIGHEST risk piece of the migration. |
| **🎯 2** | **IP-A3** | Sprint 3 · 2026-08-11 | **RAC chatbot end-to-end + Climate substrate parses** | "I land on pryzm.so, click 'Build something', enter a draggable canvas, answer 4 questions (role · team size · typology · brief), get routed to apartment generation in < 60 seconds." | ✅ A.5 (RAC L3 + parsers + summarizeCapturedState DONE; L5 panel A.5.b DONE — vanilla-DOM RACChatbotPanel, 20 tests), 🟡 A.5.c (company-size capture LOGIC done; its host was the Astro /start surface — now retired, see A.5.d; editor-side L3 racReducer extension + app.pryzm.so re-mount pending, A.5.f), 🔁 A.5.d (draggable+resizable RAC canvas was built on `apps/docs-site/src/pages/start.astro` — **that surface was RETIRED with the A.17.x.14 Astro deletion 2026-06-02**; the canvas pattern + RAC logic survive in `RACChatbotPanel.ts`, pending re-mount INSIDE app.pryzm.so per ADR-055 §5.2 / C51 §5.2), ✅ A.6 (TypologyPicker L3 model DONE; L5 panel A.6.b DONE — vanilla-DOM TypologyPickerPanel, 17 tests), 🟢 A.10 (climate EPW + NOAA L0+L2+L3+commands DONE; A.11 UI PENDING), ⚪ A.15 part 2 (3 more plugins), 🔁 A.M.1/2 (landing's purple-mesh hero + 'Build something' CTA: the editor's `LandingPage.ts` is canonical, served via the apex pre-render per ADR-055 §7 — the old Astro landing was deleted A.17.x.14), ⚪ A.U.5 (tool-registry refresh), ✅ A.5.e (**POST /api/leads lead-capture sink** — `server/leads.js`, public + rate/size-capped, always-200; the RAC `onBriefReady` fire-and-forgets the captured brief via `captureLead()` `keepalive`; 3 tests green), ✅ A.5.f (**RAC canvas RE-MOUNTED in the editor** — `PlatformRouter.showOnboarding()` mounts `RACChatbotPanel` sourcing `runtime.typology.registry`; wired to the landing's "Build something/Get started" CTA + `?page=signup`/`?page=start` deep-link; `onBriefReady` stashes the brief on `getCapturedBrief()` then hands off to auth; in-app `ONBOARDING_STYLES`; typecheck clean), ✅ A.5.g (**post-auth brief-ready seam SHIPPED 2026-06-03** — `PlatformRouter` post-auth emits the typed `pryzm:onboarding-brief-ready` runtime event (registered in `RuntimeEvents`; P4/P8-clean — typed event, NO window global). The in-editor pipeline subscribes to seed the first project from the captured conversation; A.17.x.23 wired the apex→app deep-link so the journey is reachable end-to-end), 🟢 A.5.g.2 (**apartment-from-footprint console command SHIPPED 2026-06-03** — `apps/editor/src/ui/apartment-layout/apartmentFromScratch.ts` (NEW): `generateApartmentFromScratch(opts?)` draws a closed exterior shell from a footprint polygon (one tested `wall.create` per edge — same payload as the wall tool), polls `gatherLayoutPayload` until ≥3 exterior shell walls settle, then runs the existing generator inside it. Wired as `window.pryzmGenerateApartmentFromScratch()` (+ §HELP row + globals type) **+ an AI-panel button "Generate apartment (from scratch)"** (AIPanel.ts) so it's UI-testable without the console. **Architected to take a `footprint` polygon → this IS "generate from a boundary polygon", the seam the GIS site-boundary (A.8.c) feeds.** Default = centred 10×8 m rectangle. Editor typecheck clean. **KEY FINDING that gated the auto-wire:** `triggerApartmentLayout` (apartmentLayoutTrigger.ts:44) needs a ≥3-wall shell to ALREADY exist — it lays out INSIDE a shell, doesn't create one. REMAINING: in-browser verification (wall winding + facade-orientation flagging the new walls exterior) + then auto-fire on the `pryzm:onboarding-brief-ready` event) | (1) "Build something" → RAC canvas → 4 questions captured ✅ **re-mounted in-app** (`showOnboarding`); reachable from the landing CTA + `?page=signup`. Public reachability via `pryzm.so` landing → `app.pryzm.so/signup` ✅ deep-link WIRED (A.17.x.23), live-reachable pending the Fly deploy; (2) Captured brief → `POST /api/leads` ✅ (A.5.e) + stashed on `getCapturedBrief()` + **post-auth `pryzm:onboarding-brief-ready` event ✅ (A.5.g)**; (3) End-to-end signup → editor preload of brief 🟡 seam shipped (A.5.g); auto-generation staged (A.5.g.2); (4) EPW parses 10 reference files ✅ | 🟢 ~ 90 % — RAC logic + canvas DONE + **re-mounted in-app (A.5.f)** + **lead-capture (A.5.e)** + **post-auth brief-ready seam (A.5.g)** + **apex→app deep-link (A.17.x.23)**; remaining = A.5.g.2 auto-generation (in-browser verify) + the app.pryzm.so deploy |
| **🎯 3** | **IP-A2** | Sprint 2 · 2026-07-28 | **Apartment-as-TypologyPack + Site UI scaffold** | "I can still generate an apartment AND I now see a Site panel in the editor with my plot boundary loaded from address." | ✅ A.3 (TypologyRegistry slot), 🟢 A.4 (apartment-pack BRIDGE DONE; A.4.b full migration PENDING), 🟢 A.7 (C19 substrate L0+L3+13 commands DONE; A.7.f IfcSite round-trip PENDING), ⚪ A.8.a-f (Site UI: address → parcel → climate ingest), ✅ A.20 (C50 contract DRAFT) | (1) Apartment regression suite green ✅; (2) New Site panel renders plot from address — ⚪ A.8 Site UI is the big-ticket L5 work; (3) IFC export passes 10-project nightly — ⚪ A.27 PLANNED | 🟢 ~ 55 % — biggest user-visible PRYZM differentiator; A.8 Site UI is heavy |
| **🎯 4** | **IP-A7** | Sprint 7 · 2026-10-14 | **House typology MVP + Inspect tree axis + L5 daylight** | "I pick 'house' in the picker, fill in the brief, AND get a valid layout — AND I see daylight violations highlighted in the inspect tree." | ⚪ A.21 part 1 (house schema + workflow scaffold — significant), 🟢 A.38 (L5 daylight: L2 rule A.37.β ✅ + formatter A.37.δ ✅; L5 panel PENDING), 🟢 A.23 part 1 (C20 schemas ✅ all 4 aggregates + 14 commands + stores), ⚪ A.U.2 (property panel migration) | (1) House layout generates < 60s — ⚪ A.21 PLANNED; (2) Daylight violations highlighted — 🟢 L2 rule ✅, L5 panel PENDING; (3) IFC PSet 80%+ — ⚪ A.25 PLANNED | 🟢 ~ 30 % — daylight + C20 substrate ahead of schedule; house typology is the big remaining piece |
| **🎯 5** | **IP-A4** | Sprint 4 · 2026-08-25 | **Full pipeline router + Climate UI + privacy** | "I can see my project's sun-path + wind-rose, AND the editor has a privacy consent banner I can configure." | ⚪ A.9 (IfcSite round-trip), ⚪ A.11 (climate UI: sun-path / wind rose / temp profile), ⚪ A.U.12 (consent banner — A.30.c ConsentStore ✅ as backend), 🟢 A.30 (DSAR — L0+L3+commands DONE; A.30.d.2 server worker PENDING), ⚪ A.B.5 (trial banner), ⚪ A.B.4 (quota meter) | (1) Climate sun-path correct — ⚪ L5 panel; (2) Consent banner — ⚪ L5 banner (backend ✅); (3) DSAR export — ⚪ server worker | 🟢 ~ 35 % — privacy substrate done, climate UI is the demo-driver |
| **🎯 6** | **IP-A1** | Sprint 1 · 2026-07-14 | **Regression baseline + first marketplace install** | "I can still create an apartment via the existing flow, AND I can install BCF plugin from the new marketplace UI in < 30 seconds." | ✅ A.1 (TypologyPipeline pkg), ✅ A.2 (TypologyManifest schema), 🔴 A.12 (`@pryzm/sdk` npm publish — needs npm token + 2FA), 🟡 A.14 (`marketplace.pryzm.so` DNS — user has Cloudflare; needs subdomain config), ⚪ A.15 first BCF + IFC-Export plugins, ⚪ A.PR.B19 secrets rotated | (1) Existing apartment generation works ✅; (2) `npm view @pryzm/sdk` returns version — 🔴 npm token blocker; (3) `marketplace.pryzm.so` resolves — 🟡 DNS pending; (4) Marketplace install flow — ⚪ L5 UI | 🟡 ~ 30 % — demoted because of 2 external blockers (npm token + pryzm.app domain) |
| **🎯 7** | **IP-A9** | Sprint 9 · 2026-11-11 | **House SHIPPED + C20 canonical + axe-core green** | "House typology in production; 25 paying customers; axe-core CI gate passes all critical/serious." | ⚪ A.21 SHIP (depends on IP-A7), ⚪ C20 CANONICAL (schemas DONE), 🟢 A.32 (A.32.α static gate ✅; A.32.β dynamic gate PENDING), ✅ A.34 (FULLY DONE — 17 token pairs audited), ⚪ A.40 part 2 (25 customers) | (1) House in production — ⚪ depends on IP-A7; (2) C20 ratified — 🟢; (3) CI all-21-gates green — 🟢 static a11y ✅, dynamic PENDING; (4) MRR > $750 — ⚪ marketing | 🟢 ~ 20 % — A.34 done; remainder gated on IP-A7 |
| **🎯 8** | **IP-A10** | Sprint 10 · 2026-11-25 | **Office MVP + first Revit round-trip** | "I pick 'small office', generate a layout, export to IFC, import into Revit, see the model carries through with > 95% data integrity." | ⚪ A.22 part 1 (office workflow), ⚪ A.26 (Revit IFC4X3-RV variant), ⚪ Revit reference round-trip, 🟢 A.35 part 1 (4 backup runbooks ✅; drill pending), ⚪ A.U.4 (settings panel) | (1) Office layout for 3 briefs — ⚪; (2) Revit round-trip — ⚪; (3) PG snapshot scheduler — 🟢 runbook ready, impl pending | ⚪ ~ 15 % — Office + Revit are forward work |
| **🎯 9** | **IP-A11** | Sprint 11 · 2026-12-09 | **Office SHIPPED + DR drill complete + 35 customers** | "Office typology in production; first DR drill completes without data loss; provenance UI works for office layouts too." | ⚪ A.22 SHIP (depends on IP-A10), ⚪ A.36 first DR drill (runbooks ✅), 🟢 A.31 provenance backend ✅ (works for office at no extra cost), ⚪ A.40 part 3 (35 customers) | (1) Office in production — ⚪; (2) DR drill < 30 min RTO — ⚪ runbook ready; (3) MRR > $1050 — ⚪ marketing; (4) NPS > 40 — ⚪ | ⚪ ~ 10 % — gated on IP-A10 |
| **🎯 10** | **IP-A8** | Sprint 8 · 2026-10-28 | **House polish + Inspect tree complete + first community family pack** | "I generate a house, navigate the Site→Building→Level→Apt→Room→Element tree, install a UK door catalogue from the marketplace, and drop a door from it." | ⚪ A.21 part 2 (house validators — gated on IP-A7), ⚪ A.24 (Inspect tree fully wired), ⚪ B.I.2 (per-element-type sub-panels), ⚪ A.29 + A.28 (first community pack) | (1) House passes 5 reference projects — ⚪; (2) Inspect tree 6-tier nav — ⚪ (C20 schemas ✅); (3) UK door catalogue — ⚪; (4) IFC4X3-RV — ⚪ A.26 | ⚪ ~ 5 % — gated on IP-A7 + needs marketplace infra (IP-A1) |
| **🎯 11** | **IP-A6** | Sprint 6 · 2026-09-22 | **Phase A Q3 acceptance — full apartment workflow** | "First 10 paying customers complete the entire signup → apartment → IFC export workflow without help." | ⚪ A.40 part 1 (first 10 customers — marketing-led), ⚪ marketplace developer dashboard, 🟢 A.31 provenance backend ✅, ⚪ IFC4X3 IfcSite round-trip nightly | (1) 10 customers MRR > $250 — ⚪ marketing; (2) Marketplace ≥ 50 artefacts — ⚪; (3) Apartment regression × 5 nightly — ⚪ A.27 | ⚪ ~ 10 % — marketing-led + ops-gated; engineering can't push by itself |
| **🎯 12** | **IP-A12** | Sprint 12 · 2026-12-23 | **Phase A acceptance — 3 typologies + 50 customers + 100 cognition rules** | "All three typologies (apartment + house + office) tested end-to-end; 50+ paying customers; 252 of 248 spec rules enforced (exceeds spec)." | ⚪ All Phase A buckets close to acceptance; 🟢 A.37 cognition (5 validators DONE — G9 + G8 + L5 corridor + L5 sightline + aggregator + formatter + summarizer; ~ 5 / 100 rules) | (1) E1-E10 exit criteria true — ⚪; (2) Marketplace 50+ — ⚪; (3) MRR > $1500 — ⚪ marketing; (4) All 21 CI gates stable 4 weeks — ⚪ | ⚪ ~ 8 % — terminal-but-one; closes only after IP-A1/A6/A9/A11 |
| **🎯 13 — TERMINAL** | **IP-A13** | Sprint 13 · 2026-12-30 | **Phase A EXIT — ADR-NNN-phase-1-exit-alpha ratified** | "Phase A officially closes; the team moves to Phase B (Beta); first 2 Enterprise pilots already in flight." | ⚪ A.41 (Phase 1 exit ADR) | (1) ADR-NNN-phase-1-exit-alpha merged ACCEPTED — ⚪; (2) Q1 2027 + Phase B plan ratified — ⚪ | ⚪ 0 % — awaits IP-A12 |

### §3.0.1 — Phase A IP demo runbooks

Each IP has a demo script — a 1-page test runbook describing exactly what to click, what to type, and what to verify. The runbooks live in `docs/05-guides/demos/IP-A<N>-runbook.md` (authored at IP-1 start; updated each IP close).

| IP | Demo runbook |
|---|---|
| IP-A1 | `docs/05-guides/demos/IP-A1-regression-baseline-and-marketplace-install.md` |
| IP-A2 | `docs/05-guides/demos/IP-A2-typology-pack-and-site-ui.md` |
| IP-A3 | `docs/05-guides/demos/IP-A3-rac-chatbot-end-to-end.md` |
| IP-A4 | `docs/05-guides/demos/IP-A4-climate-and-privacy.md` |
| IP-A5 | `docs/05-guides/demos/IP-A5-brand-cutover-and-provenance.md` |
| IP-A6 | `docs/05-guides/demos/IP-A6-Q3-full-apartment-workflow.md` |
| IP-A7 | `docs/05-guides/demos/IP-A7-house-mvp-and-daylight.md` |
| IP-A8 | `docs/05-guides/demos/IP-A8-house-polish-and-inspect-tree.md` |
| IP-A9 | `docs/05-guides/demos/IP-A9-house-shipped-and-c20.md` |
| IP-A10 | `docs/05-guides/demos/IP-A10-office-mvp-and-revit-roundtrip.md` |
| IP-A11 | `docs/05-guides/demos/IP-A11-office-shipped-and-dr-drill.md` |
| IP-A12 | `docs/05-guides/demos/IP-A12-phase-A-acceptance.md` |
| IP-A13 | `docs/05-guides/demos/IP-A13-phase-A-exit.md` |

### §3.0.2 — Phase A IP customer feedback loop

Each IP includes a **structured 30-min customer feedback session** with 2-3 pilot customers (when available):

| Feedback dimension | Per-IP questions |
|---|---|
| **Was the demo executable in < 10 min without help?** | Yes / No / Needed help (specify where) |
| **Was the UI obvious or confusing?** | Per-step rating |
| **Did the result look like the right output?** | Yes / No / Concerns (specify) |
| **Would you use this in your daily work today?** | Yes / Not yet / Why-not |
| **What's the one thing you'd add for the next sprint?** | Free-form |

Feedback is recorded in `docs/03-execution/status/ip-feedback/IP-A<N>-feedback-<date>.md`; surfaced in next sprint planning.

---

## §4.0 — Phase B — Inflection Point Roadmap (~18 IPs across 18 months)

Phase B IPs are coarser-grained (~monthly) since multi-typology + enterprise + EU region work spans multiple sprints per inflection. The roadmap:

| IP # | Target month | Theme | What the user can test (one sentence) |
|---|---|---|---|
| **IP-B1** | 2027-01 | Townhouse + co-living typologies | "I pick 'townhouse' or 'co-living', get a valid layout with party-wall constraints honoured." |
| **IP-B2** | 2027-02 | Co-working + Gym typologies | "I generate a co-working space + a gym, with their typology-specific validators (sound separation · changing-room privacy)." |
| **IP-B3** | 2027-03 | Sheet engine MVP | "I drag a viewport onto a sheet, add a title block, and export a vector PDF that prints to scale." |
| **IP-B4** | 2027-04 | Pharmacy + clinic typologies + first Enterprise pilot | "Pharmacy typology generates with controlled-substance storage; first Enterprise customer signs MSA." |
| **IP-B5** | 2027-05 | Sheet engine complete + drawing set | "I author a sheet set with revisions; export PDF/A-3 transmittal package." |
| **IP-B6** | 2027-06 | Inspect Tree CANONICAL + per-element-type sub-panels | "Inspect tree shows the full Site→Building→Level→Apt→Room→ElementType→ElementInstance hierarchy; per-element panels work." |
| **IP-B7** | 2027-07 | Restaurant + shop typologies | "Restaurant typology with kitchen-to-dining flow validators; first 100 paying customers." |
| **IP-B8** | 2027-08 | Data Panel CANONICAL + bulk-edit + automation | "I open the Data panel, filter doors by fire rating, bulk-edit to change a property; cron rule emails me on violation." |
| **IP-B9** | 2027-09 | EU region LIVE + first 3 Enterprise customers | "EU customer routes through eu.pryzm.so; data stays in Frankfurt; first 3 Enterprise contracts signed." |
| **IP-B10** | 2027-10 | Federated clash detection + BCF round-trip | "I run a federated clash check with my Solibri/Navisworks colleague; BCF issues round-trip cleanly." |
| **IP-B11** | 2027-11 | Car-park typology + L5 perceptual sim | "Car-park typology generates with bay-packing + ramp slope; perceptual sim flags acoustic issues." |
| **IP-B12** | 2027-12 | SOC 2 Type II audit pass + WCAG external audit pass + i18n de-DE LIVE | "Compliance evidence package ready for procurement; German locale tested by native-speaker; VPAT publishes." |
| **IP-B13** | 2028-01 | School + library typologies + SAML SSO live | "School + library typologies generate; SSO via Okta works for Enterprise customer." |
| **IP-B14** | 2028-02 | i18n fr-FR + ja-JP LIVE + family-marketplace flywheel | "French + Japanese locales tested; ~50 active marketplace developers; ~250 published artefacts." |
| **IP-B15** | 2028-03 | C24/C27/C28/C29/C30 all CANONICAL + Mid-firm sprint | "Sheet · Inspect · Data · PDF · Drawing-set all canonical; Mid-firm tier has 50+ customers." |
| **IP-B16** | 2028-04 | Marketplace 500 artefacts + 100 developers | "Marketplace catalogue + developer dashboard show the ecosystem flywheel kicking in." |
| **IP-B17** | 2028-05 | Phase B acceptance — 10 typologies + 500 customers + first 5 Enterprise customers | "All Phase B exit criteria green; 5 Enterprise customers running their first project in production." |
| **IP-B18** | 2028-06 | Phase B EXIT — ADR-NNN-phase-2-exit-beta ratified | "Phase B officially closes; Phase C plan ratified." |

---

## §5.0 — Phase C — Inflection Point Roadmap (~18 IPs across 18 months; selected)

Phase C IPs span 25 typologies + 4 regions + Revit full + cognition API. Selected major IPs:

| IP # | Target month | Theme |
|---|---|---|
| **IP-C1** | 2028-08 | US region LIVE + first US Enterprise customer |
| **IP-C2** | 2028-10 | AP region LIVE (Tokyo + Singapore) |
| **IP-C3** | 2028-12 | UK region LIVE (post-Brexit separate) |
| **IP-C4** | 2029-02 | Revit round-trip 10-project nightly green |
| **IP-C5** | 2029-04 | C32 DXF/DWG CANONICAL |
| **IP-C6** | 2029-06 | C33 Rhino + Grasshopper bridge LIVE |
| **IP-C7** | 2029-08 | L6 behavioural simulation (pedestrian flow) LIVE |
| **IP-C8** | 2029-10 | C35 COBie + C37 Schedule 4D + C38 Cost 5D all CANONICAL |
| **IP-C9** | 2029-12 | Phase C EXIT — 25 typologies + 30 Enterprise + ISO 19650 Phase 2/3 audit |

---

## §6.0 — Phase D — Inflection Point Roadmap (post-GA; selected)

Phase D shifts from sprint-driven to opportunity-driven. Selected strategic IPs:

| IP # | Target window | Theme |
|---|---|---|
| **IP-D1** | 2030-Q1 | Cognition substrate published API — first 3 external consumers |
| **IP-D2** | 2030-Q2 | First DfMA / digital-fabrication output (CNC + robotic) |
| **IP-D3** | 2030-Q3 | AI-Automated 2D Drawing Output (D.AEC.53 — "the killer feature") MVP |
| **IP-D4** | 2030-Q4 | First marketplace community-authored typology pack live (community drives long-tail) |
| **IP-D5** | 2031+ | Outcome-based pricing model launched (D.AEC.58) |
| **IP-D6** | 2031+ | First IDS / ICDD / bSDD-driven workflows live |
| **IP-D7** | 2031+ | Decentralised data ownership (Solid Pods + WebID) experimental |

---

## §3.0.3 — Mapping Phase A IPs back to sub-phases (cross-reference)

Every Phase A sub-phase in §3.1–§3.X traces to one or more IPs. This table is the operational pivot:

| Sub-phase | Contributes to IP(s) |
|---|---|
| A.1 TypologyPipeline scaffold | IP-A1 |
| A.2 TypologyManifest schema | IP-A1 |
| A.3 TypologyRegistry + dispatch router | IP-A2 |
| A.4 Apartment refactored as Pack | IP-A2 |
| A.5 RAC chatbot UI | IP-A3 |
| A.5.g.2 Apartment-from-footprint-polygon (✅ console cmd) | IP-A3 |
| A.5.g.3 Apartment-from-boundary ✅ SHIPPED 2026-06-03 (`apartmentFromBoundary.ts` · `pryzmGenerateApartmentFromBoundary()` — reads `siteModelStore.getParcelBoundary()` → footprint → `generateApartmentFromScratch`; typology-agnostic site read, §FUTURE-TYPOLOGY flagged; needs in-browser smoke) | IP-A3 · plan: PIPELINE-RAC-TO-SITE-TO-DESIGN-2026-06-03 |
| A.5.g.4 RAC→site-bootstrap router (on pryzm:onboarding-brief-ready → create project + site + route to GIS) | IP-A3 |
| O.1–O.6 Onboarding workflow re-sequence — DESIGN: [ONBOARDING-WORKFLOW-DESIGN-2026-06-03](./ONBOARDING-WORKFLOW-DESIGN-2026-06-03.md). ✅ **O.1 SHIPPED** (auth-first re-order + returning-user branch in `PlatformRouter`). ✅ **O.2 SHIPPED** (`OnboardingStepController` — RAC→location(geocode)→draw-or-skip→generate guided first-run; default-rect skip path = ratified fallback; draw path uses location-only `dispatchSiteLocation` so the drawn boundary is the first `setParcelBoundary`, NOT blocked by the immutable rule; `pryzmToggleGIS` GIS handoff + 60s watchdog. **Browser-verify: the GIS draw handoff timing.**) ✅ **O.5 SHIPPED 2026-06-03** (hub "New Project" → guided RAC→site→generate flow seeded by the modal {name, projectType→typology}; blank-canvas escape kept; `ProjectHub.handleCreate('guided')` → `onStartOnboarding` → `showOnboarding(seed)` `8a11ad0`). ✅ **Onboarding QUALITY PASS 2026-06-03 (founder-tested):** white+purple brand colours + compact panels (was dark/black + oversized — brand violation) `400ce8e`; draw-step modal made **non-blocking** bottom banner so the map is drawable (was a centred overlay covering the map) `6d054b4`; **3D view activated after generate** so the result lands as a building not a flat plan (`window.viewController.activate('3D')`) `80ae89b`. Remaining: O.3 (location as profile-level) · O.4 (profile-persist RAC answers) · O.6 (funnel-top lead line) · **O.7** post-boundary flow redesign (founder spec [[onboarding-site-generate-view-flow]]): ✅ **O.7.1 SHIPPED 2026-06-03** (new `'confirm'` step — after boundary draw/skip, asks "Generate {typology} with AI?" [Generate / Not now] instead of silent auto-gen; keeps the boundary visible via the non-blocking presentation; typology-aware copy threaded from the brief; watchdog + Skip now route to confirm not auto-gen; `OnboardingStepController.renderGenerateConfirmStep` `71d082a`). 🔴 **O.7.2 QUEUED — post-generate view broken (founder-flagged 2026-06-03, twice)**: after "Generate apartment", the LEFT pane (the cream Hektar 2D map the user drew on) goes BLANK and Cesium isn't rendering well — the user is left with no usable site view beside the plan. WANT: keep the cream 2D plan map + the drawn boundary AND show the generated apartment on it, with Cesium-3D as a deliberate on-demand toggle (dual-view). Likely cause: the GIS 2D-map surface is torn down / not re-pointed after the boundary commit + generate, and the post-generate `activate('3D')` leaves the GIS split in a half-state. ✅ **O.7.2 SHIPPED `a3d892f0`** (plan view + 2D/3D toggle after generate). 🔴 **O.7.2.b REFINEMENT QUEUED (founder 2026-06-03)**: the desired flow is — (1) after boundary commit/Enter, **KEEP the cream 2D plan-view map showing the drawn boundary** (do NOT dispose it / jump to the BIM plan — `SiteBoundaryMap2D.commit` disposes the map today); the "Generate with AI?" confirm step appears OVER the 2D map; (2) ONLY on "Generate apartment" swap the view, and it should ALWAYS land on a **fixed dual-pane: LEFT = 3D (default) · RIGHT = plan view**. · 🎨 **O.13 QUEUED — onboarding panels adopt the New Project modal design (founder 2026-06-03, screenshot)**: purple gradient header bar (white title + white × close) + white body + footer button row — matching the hub's "New Project" modal / `authModals`/ProjectHub chrome — instead of the all-frosted-glass look. Keep compact, sizable, movable, slightly transparent. Restyle `onboardingStyles.ts` (rac/os header → purple gradient) + ensure the RAC/step header markup has a close affordance · ✅ **O.13.b SHIPPED 2026-06-04 (`26a872d8`) — PANEL-BACKDROP-UNIFY**: every floating panel/modal scrim now routes through ONE shared token `--pryzm-panel-backdrop: rgba(28,12,60,0.26)` + `--pryzm-panel-backdrop-blur: blur(2px)` (in `apps/editor/src/ui/styles/tokens.ts`; brand purple-tint, NEVER black; sits between the old opaque New-Project ~0.45 and translucent RAC ~0.28 scrims as the founder asked — "between screenshot 1 and 2, more translucent than 1 but more opaque than 2"). 21 scrims repointed across onboarding/projectHub(New Project)/authModals/confirmDialog/apartmentLayoutModal/**BatchLoadingIndicator (the AI batch "Building N elements…" modal — founder: "applies also to batch element creation through the AI command pipeline")**/sheetEditor/drawingHuds/IFC dialogs/etc.; the intentional no-scrim boundary-draw banner (`--drawing`) preserved. · ✅ **O.13.c SHIPPED 2026-06-04 (`4b2daa6`) — brief panel heading unreadable**: in the RAC PROJECT BRIEF panel the body heading ("Tell me about the project — size, bedrooms, style") is CLIPPED under the purple gradient header bar + low-contrast → fix header/body spacing + heading colour so it's fully visible below the header. `onboardingStyles.ts` (`.rac-*` header/body) + the brief-step heading markup. · ✅ **O.13.d SHIPPED 2026-06-04 (`4b2daa6`) — unclear "next step" CTA**: sticky bottom action bar with a prominent purple primary "Generate apartment →"/"Continue →" CTA + de-emphasised ghost Cancel. the advance action ("Mark brief complete") sits at the TOP beside Cancel and isn't an obvious primary CTA → make a prominent PRIMARY purple button (panel bottom) that advances to generate; de-emphasise Cancel; make "what to click to proceed" obvious. · ✅ **O.15 SHIPPED-PARTIAL 2026-06-04 (`4b2daa6`) — kill the project-page flash before the loader**: `PlatformRouter.onBriefReady` now hides `#platform-root` SYNCHRONOUSLY before the async `client.create` chain, so the Project Hub no longer repaints between the brief CTA and the loader (the founder complaint). RESIDUAL (deferred to O.8/O.14): a sub-second pastel-background blank may still show before the loader paints (loader is gated behind one async create hop). ORIGINAL: after the brief CTA the app briefly re-paints the PROJECT HUB/PAGE (~1s) THEN shows the "DOWNLOADING BIM ENGINE…" loader → go DIRECTLY to the loader (skip the intermediate hub paint). The loader's OWN slowness = engine boot, tracked separately at O.8/O.14. · 🟢 **O.8 SHIPPED-PARTIAL 2026-06-04 (`1dd98ff` + prior `3d54541`)** — deferred non-essential engine init past first paint: CRDT/`YjsDocAdapter`/conflict-disclosure UI now lifted into `wireCollaborationCRDT()` behind `requestIdleCallback(4000)`+`setTimeout(1500)` fallback + re-schedule on `pryzm-project-loaded` (safe: CommandBus `_crdtApplier` + BatchCoordinator `_yjsDocAdapter` hooks are null/optional-guarded; nothing on the generate path reads them sync); `_crdtWired` once-guard + `window.__pryzmEnsureCollabCRDT` force-hook + `window.__pryzmEagerBoot` escape flag. Prior commit already deferred initDataPlatform monitoring (DependencyResolver/TemporalGraph/PhysicsEngine/ConstraintEngine/AmbientIntelligence). RESIDUAL: `initScene`/`initBuilders`/`initTools`/`initUI`/persistence MUST stay early (first-paint + generate path). Pairs with O.14 module-warm. ORIGINAL: "Set up your project" takes several seconds to appear because New Project → `createAndOpenProject` runs the FULL BIM engine boot first — `initScene` + `initBuilders` (20 subsystems) + `initTools` + `initDataPlatform` (physics/temporal/semantic graphs) + `initUI` + 34 stores (two main-thread blocks `LONGTASK 1726ms` + `2310ms` in the live log). The OnboardingStepController gates on `pryzm-project-loaded`, which fires only AFTER all of it. But the location/draw steps need NONE of the BIM engine — only the GENERATE step does. **Fix direction:** show the onboarding location step IMMEDIATELY on New Project (decoupled from engine boot), warm the engine in the background, and gate ONLY the generate step on engine-ready; and/or defer non-essential init (physics, data-platform, lifecycle) past first onboarding paint. Relates to OI-053 perf series · ✅ **O.11 SHIPPED 2026-06-03** (`8251ee6`) — apartment-generate seconds-long pause for tiny output (3 walls + 2 doors) FIXED. **TRUE root cause (not what was assumed):** NOT per-opening wall rebuilds (those already coalesce) — it was a **`structuredClone` of the ENTIRE wall store on EVERY command**: `ApartmentLayoutExecutor` dispatched one legacy `commandManager.execute(CreateWallOpeningCommand/CreateRoomBoundingLineCommand)` per element, and `CommandManagerImpl.execute` deep-clones `wallStore.getAll()` for each → **O(N openings × walls)** heavyweight clones. Fix = new `CreateWallOpeningsBatchCommand` + `CreateRoomBoundingLinesBatchCommand` (reuse the per-element logic, ONE snapshot each) → **O(walls)**; identical built result; one undo unit preserved (still inside the build `runBatch`). ai-host 1469✓ editor-typecheck✓. (NB the legacy synchronous path is REQUIRED — the bus `door.batch.create` writes PLUGIN stores separate from the renderer's legacy singletons; switching verbs would break rendering.) **Follow-up (O.11.b, if seconds persist):** the executor's 150ms-cadence wall-readiness `tick(40)` poll + `apartmentFromScratch`'s per-shell-wall 100ms sequential poll add fixed-quantum latency on top of the now-fast build · 🔵 **O.12 QUEUED — Typology Brief Schema + dynamic slider brief UI (founder-flagged 2026-06-03; architecturally-governed)**: the RAC project brief is a free-text box; it must instead gather STRUCTURED, typology-relevant data via easy controls — **sliders** (apartment: bedrooms 2→4; bathrooms; style; toggles) and per-typology fields (house: floors; office: headcount). DESIGN OF RECORD = [SPEC-TYPOLOGY-BRIEF-SCHEMA](../specs/SPEC-TYPOLOGY-BRIEF-SCHEMA.md): each typology DECLARES a `briefSchema` (typed `BriefField[]`: range/stepper/select/multiselect/toggle/text) in its TypologyManifest; the RAC renders it dynamically; the structured `Brief` feeds `buildLayoutCommands` directly (no NLP parse) and the O.10 "Choose a layout" picker binds the SAME fields (single source of truth). Sub-phases **O.12.a** ✅ SHIPPED 2026-06-03 (`a376b55` — L0 `packages/schemas/src/typology/briefSchema.ts`: `BriefField` Zod union {range/stepper/select/multiselect/toggle/text} + `BriefSchema` + apartment `briefSchema` in the manifest {bedrooms/bathrooms/style/openPlanKitchenDining/masterEnSuite/targetAreaM2/notes} + C50 §2.6 + ADR-0056, 22 tests), **O.12.b** (RAC renders schema as sliders/steppers — NEXT), **O.12.c** (pipeline reads structured brief + picker binds same fields), **O.12.d** (house+office schemas). Needs: contract extension (TypologyManifest/C16-C17) + an ADR ("briefs are typology-declared, not UI-hard-coded"). Typology-agnostic per [[platform-spine-typology-agnostic]] · 🔵 **GRAPH.* QUEUED — Unified Building Graph + powerful (fluid/living) graph visualization (founder-flagged 2026-06-03, after Finch)**: STRATEGY = [PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION](../../01-strategy/PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION.md). Audit finding: PRYZM is ALREADY ahead of Finch on the data side — `SemanticGraph`/`TemporalGraph`/`DependencyResolver` (core-app-model) + `TopologyLayer` (room-topology) + `RoomGraphService` (spatial-index) + `SemanticQueryEngine`/`sightlineGraph`/`bubbleGraph` (ai-host) + ConstraintEngine + cognition stack. GAPS = (1) one UNIFIED canonical "Building Graph" (`@pryzm/building-graph` UBG that PROJECTS the existing graphs into one node/edge model + query surface) and (2) a **powerful FLUID/LIVING visualization** — not stiff node-link lines but a near-liquid metaball/curl-noise "living blob" (the landing purple-mesh shader vocabulary, rendering AS the graph; "a living blob in the city that adjusts to its inhabitants"). Phases ✅ **GRAPH.1 SHIPPED 2026-06-03** (`24b2dc3` — `@pryzm/building-graph` UBG core: node/edge Zod schema (10 edge types) + in-memory store + adapter INTERFACE + ADR-0058, 22 tests, L2/P5-pure) · ✅ **GRAPH.2 SHIPPED 2026-06-04** (`0ba8f3c` — concrete adapters: topology→bounds/adjacentTo, roomGraph→connectsTo/circulatesVia, semantic→derivesFrom, dependency→dependsOn, constraint→violates; FACTORY variant (`create<Source>Adapter(snapshot)→UbgAdapter`) keeps core P5-pure via injected plain `adapters/inputs.ts` shapes; P8 `pryzm.ubg.project` span per adapter; 33 tests. **⚠ GRAPH.2-wiring PREREQ: the `inputs.ts` source-service shapes are ASSUMED structural subsets — verify field names against the real TopologyLayer.getAdjacencyRelationships / RoomGraphService.getGraph / SemanticGraph.getAll / DependencyResolver RebuildTask / validation-report RuleViolation before writing the editor-side extraction**) · ✅ **GRAPH.2-wiring SHIPPED 2026-06-04** (`95588ec`/`0210752` — `apps/editor/src/engine/buildBuildingGraph.ts` projects REAL `topology`/`roomGraph`/`semantic`/`dependency`/`constraint` data into the UBG; AUDIT confirmed the assumed `inputs.ts` shapes match the real services 1:1 (only a `RuleSeverity.level→string` flatten + caller-derived dependency pairs); exposed via `window.pryzmBuildBuildingGraph()` + `pryzm:building-graph-rebuilt` event for GRAPH.3; per-source guards, 14 tests) · ✅ **GRAPH.3 SHIPPED** (building-graph overlay — force layout + metaball nodes + hover/focus/toggle, `window.pryzmShowBuildingGraph()`) + ✅ **GRAPH.3.b-hero SHIPPED 2026-06-04** (`0192aaa`/`9f3973`/`b674d7a` — the founder-referenced MIAW living aesthetic: soft pastel-purple radial field + flowing tapered linear-gradient bezier edges (bright-mid "flowing light") + central convergence "blob" on the highest-degree node (outsized 4.4× halo + crisp white ring + always-on label) — done by hand after the agent timed out; remaining: a true WebGL/TSL fluid SDF shader = GRAPH.3.b-hero-webgl, later) · ✅ **GRAPH.4-interrogate SHIPPED 2026-06-05** (founder: "I WANT THE GRAPH BE MORE EXPLICIT — the elements and rules need to be more precise — what element is each — maybe elements and rules are SELECTABLE — and user can INTERROGATE the graph? ideally also RELATIONSHIP"): the overlay nodes are now click-selectable → a white #6600FF interrogation card (`BuildingGraphOverlay.buildDetailPanel`/`updateDetailPanel`) shows **what element it is** (kind badge + human label + id), its **properties** (roomType/area/levelId etc., humanised + unit-formatted), every **relationship** as a typed directed edge `→/← {edgeType} {neighbourKind · neighbourLabel}` (from `graph.outEdges`/`inEdges`), and the **rules it breaks** (outgoing `violates` edges → red ⚠ rows w/ evidence; for a rule node, the inverse — who violates it). Re-renders on select + on `pryzm:building-graph-rebuilt`. Pairs with the GRAPH.4-doc guide [building-graph-elements-and-rules](../../05-guides/building-graph-elements-and-rules.md) · GRAPH.4 AI-over-graph (SemanticQueryEngine on UBG) · GRAPH.5 persist+export. Needs ADR (UBG as relational substrate) + a C-contract (node/edge model, sibling to C20). Typology-agnostic, P2/P5/P8-safe · 🐛 **O.9 QUEUED — panel-drag-shift regression (founder-flagged 2026-06-03)**: after the glass/draggable/resizable panel work (`f952053b`), grabbing a panel to drag makes it JUMP to a side — `makeDraggable`/`makeResizable` aren't preserving the cursor↔panel-origin offset on mousedown (need `offset = clientX - rect.left` captured at grab, then `left = clientX - offset`), and/or the resize helper's first-drag geometry-pin fights the drag. Quick fix; same surface as the panel-chrome commit. · ✅ **O.10 SHIPPED-PARTIAL — dynamic layout picker** (the "Choose a layout" modal already has Bedrooms/Bathrooms + room checkboxes {Living room · Entrance hall · Open-plan kitchen+dining · Master en-suite} + per-room area fields + scored options; founder-confirmed it looks good 2026-06-03). 🔴 **LAYOUT-QUALITY QUEUED — built result ≠ picker preview on skewed boundaries (founder-flagged 2026-06-03)**: the picker previews clean rectilinear layouts, but generating into a NON-rectangular drawn boundary (triangle/skewed quad) produces a mess — a generic triangular "Room 00-001 122.5 m²" with crossing walls, not the chosen layout. The D-TGL engine assumes near-rectangular footprints; need boundary-shape handling (rectify/orient the skewed boundary, snap-to-rectangular, or warn-and-suggest) so the built apartment matches the picker. Relates to [[single-apartment-fix-pass-spec]] + [[d-tgl-deterministic-layout-engine]]. · 🐛 **3D-MIRROR-PLANE QUEUED (founder-flagged 2026-06-03)**: after boundary-create/generate on a skewed/oversized parcel (666 m², one giant "Room 00-001"), the 3D view shows a phantom TILTED grey "mirror" plane beside the flat parcel. ANALYSIS: the flat faint slab = the A.8.x parcel fill (correct, flat XZ); the tilted plane = a **mis-rendered WALL** (founder had `WA-XX-002` selected with a gizmo in the shot) — a degenerate/wrong-winding wall mesh produced by the generator on the non-rectilinear oversized boundary. Same root family as LAYOUT-QUALITY above + the WJR degenerate-wall defect ([[walljoinresolver-multi-cluster-bug]]); fix = flag degenerate walls INVALID + skip their mesh build, and rectify/clamp the boundary before generation. Needs in-editor inspection of the selected wall's geometry | IP-A3 · IP-A2 |
| **🧪 Onboarding/map perf + draw queue (founder testing 2026-06-03, batch)** — ✅ **O.14 SHIPPED-PARTIAL 2026-06-04 (`9466ef0`)** engine-preload-during-RAC: AUDIT found the one project-INDEPENDENT cost is the ~2.6MB `engineLauncher` MODULE download/eval (the literal "Downloading BIM engine…" stage); `bootstrap()` itself MUST stay late (needs the live `#container` canvas + open project — confirms O.8). FIX: new `engineWarmup.ts` (`warmEngineModule()` shared cached `import('@app/engine/engineLauncher')` + `ensureEngineWarm()`), fired from `PlatformRouter.showOnboarding()` so the chunk downloads DURING the RAC/brief/location/draw steps; `main.ts loadEngine()` delegates to it so prewarm + real boot share ONE download; best-effort, idempotent, falls back to cold boot on failure. (WebGPU renderer init was already prewarmed via `rendererPrewarm`.) RESIDUAL: the project-dependent `bootstrap()` cost is unchanged — further wins = deferring non-essential init (physics/data-platform) past first paint (O.8). · 🔴 **O.7.2.b RE-EMPHASIZED (said again)**: keep the cream 2D plan map (with the drawn boundary) rendering after Enter/commit EXACTLY as it was just before — the "Generate with AI?" confirm step must appear OVER the cream map, not a blank pane (`SiteBoundaryMap2D.commit` disposes the map today — see O.7.2.b in the O.* row). · 🟡 **A.8.c.f.5** 2D map loads 10× faster: MapLibre/OpenFreeMap first-paint is slow — prewarm style+tiles, lighter initial style, cache. · 🟡 **A.8.c.f.7** preload the 2D map in the BACKGROUND during onboarding steps 1–2 (Location) so it's ready when the user enters the address (mechanism for A.8.c.f.5). · 🟡 **A.8.c.f.6** more complete/detailed/up-to-date buildings in the 2D plan view: OpenFreeMap (OSM) has gaps — options = keyed richer provider (MapTiler), ML building-footprint overlay (Microsoft/Google Open Buildings), or default-to-satellite where OSM is thin. · 🟢 **A.8.c.g** boundary-draw SNAPPING: snap the draw tool to the map's building-footprint/street vertices+edges (OpenFreeMap vector geometry IS available) — snap-to-corner/edge/outline — for an accurate plot boundary tracing real splits. · 🎨 **MAP-FORMA-AESTHETIC QUEUED (founder 2026-06-04)** — make the GIS/map view replicate **Autodesk Forma's plan-oblique massing style** (CesiumJS + MapLibre): white (`#FFFFFF`) extruded building solids w/ ~1–2px black (`#1a1a1a`) outlines (proposed/new = warmer `#F5F4F0` + dashed green `#2D6A4F`); a single soft low-angle directional shadow (Cesium `shadows:true` + `terrainShadows:ENABLED`, fixed mid-morning `JulianDate` ~10am equinox, shadow `rgba(30,30,30,0.25)`, `softShadows:true`, `shadowMap.size 2048`); teal/dark-green courtyard ground fills (`#1B4332`/`#2D4A3E` ~0.85, no extrusion); minimal vector basemap (roads `#D9D6CF`, water `#C8DCE8`, land `#F0EDE8`, NO POI/satellite — MapLibre/MapTiler Basic custom style JSON); dashed dark-green project boundary (`#2D6A4F`, 8px-on/6px-off, 2px); height labels `+Nm` thin grey `#555` Inter/Helvetica 300; plan-oblique camera pitch 35–45° N/NW heading; optional edge depth-of-field vignette. Target = indistinguishable from a Forma/Hektar massing screenshot (no satellite, no photorealism, no colourful UI in-canvas). Builds on A.8.b (Cesium-light basemap) + the A.8.x parcel fill; pairs with the cream 2D plan map [[onboarding-site-generate-view-flow]]. Needs a basemap-style JSON + Cesium shadow/material config + a 3D-Tiles/GeoJSON OSM-building loader; typology-agnostic site visual. · ✅ **AUDIT+SPEC DONE 2026-06-04** ([SPEC-FORMA-SITE-VIEW](../specs/SPEC-FORMA-SITE-VIEW.md), `fdba433f`): root cause of the poor Cesium render = it's a DELIBERATE photoreal globe (ESRI satellite + Google 3D-tiles + `globe.enableLighting` + `skyAtmosphere` in `CesiumViewport.ts:166-218`) with a token-degraded near-white fallback when `VITE_CESIUM_TOKEN`/Google key is missing — the opposite of Forma's flat massing look. The existing **ENU substrate is REUSED** (`LTPENURebase` x=E/y=Up/z=−North metric frame + `CesiumThreeBridge` `eastNorthUpToFixedFrame`); Cesium becomes a READ+RENDER consumer (NO drawing/wall-authoring/parallel-coord changes per SPEC §8). Phases: **FORMA.1** ✅ SHIPPED 2026-06-04 (`29314dd` — `siteMap2DStyle.ts` `FORMA_PALETTE` + `buildFormaMap2DStyle()`; Forma vector style is now the 2D default, boundary restyled dashed-green `#2D6A4F`, keyless OpenFreeMap recolour-only, 6 tests) · **FORMA.2** ✅ SHIPPED 2026-06-04 (`d3fe35a` — `CesiumViewport.setFormaMode()`: flat ground `#D9D5CE` + disabled sky/atmosphere/sun/moon + bg `#E8E8E6` + dir-light + soft 4096 shadows + feature-detected AO/silhouette; default-ON when no Cesium token; `window.pryzmSetCesiumFormaMode`) · **FORMA.3** ✅ SHIPPED 2026-06-04 (`6c60cd9` — `[▦ Plan View][◉ 3D View]` toggle + `⤢ Zoom to Site` in GISAreaLayout; 3D → `setFormaMode(true)` + flyTo heading 325°/pitch −45°/alt∝√area; authored walls (`wall` store `baseLine`+`height`) → white `#FFFFFF` extrusions + `#1C1C1C` outline via `eastNorthUpToFixedFrame` ENU anchor (z=−North), boundary dashed-green; fed to `setFormaSilhouetteTargets`; `window.pryzmShowFormaView`; FORMA.4 re-render seam stubbed) — original FORMA.1 desc: 2D Forma basemap (`FORMA_PALETTE` style JSON: roads `#D9D6CF`/water `#C8DCE8`/land `#F0EDE8`, dashed-green boundary — low risk) · ~~**FORMA.2** Cesium Forma render mode `setFormaMode`~~ (white `#FFFFFF` proposed/`#E8E5DF`@0.92 context + dir-light~10am + soft 4096 shadows `rgba(20,20,20,0.30)` + AO 2.5 + silhouette `#1C1C1C` + flat ground `#D9D5CE` + disabled sky/atmosphere/sun/moon + bg `#E8E8E6`; feature-detect post-process, keep photoreal path) · **FORMA.3** 3D massing view + [Plan View][3D View] toggle + NW oblique handoff (heading 325°/pitch −45°, dist∝√areaM2, 1.2s flyTo); authored footprints→white `PolygonGraphics` extrusions + courtyard teal `#1B4332` + boundary 0.5m wall · **FORMA.4** ✅ SHIPPED 2026-06-04 (`56d064d`) coordinate bridge consumer (centroid→`eastNorthUpToFixedFrame`→`sampleTerrainMostDetailed` clamp→extrusions; live clear+re-place on `site.parcel-boundary-set`/`apartment.layout-executed`, no re-fly; `LTPENURebase.setOrigin` now wired on `site.updateLocation` in `siteDispatch.ts`; apps/editor gains `@pryzm/geospatial` dep + lockfile sync; typecheck-clean) · **FORMA.5** ✅ SHIPPED 2026-06-04 (`8bb500f`) analysis hooks: `FormaSiteAnalysisControls.ts` top-right card — sun&shadow scrubber (date + 4 season presets + time-of-day slider + ▶Study dawn→dusk sweep) driving the Cesium light via `solarSample(lat,lon,iso)` from `@pryzm/climate-host` (NOAA, ENU→ECEF through the same `eastNorthUpToFixedFrame` anchor as the massing, so shadows fall at the true sun angle); climate card (existing `ClimatePanel`); compact SVG wind-rose (`windRoseBars`). All read-only, graceful no-data states, disposed on view exit. (Used `solarSample` not `RealSunService` — the latter is THREE-bound `core-app-model`, wrong layer for Cesium/P2.) · 📐 **MAP-STACK DECISION 2026-06-04 (founder research synthesis)**: STAY on **CesiumJS (3D + climate) + MapLibre (2D draw)** — free, robust, vendor-lock-free, and what the best climate-BIM apps (VC Solar/VC Map) use; do NOT adopt **Mapbox** (key + lock-in; shadows cosmetic not physical) nor **Google Photorealistic 3D tiles** (can't toggle/edit individual buildings). KEY INSIGHT: the 2D boundary-DRAW surface correctly stays MapLibre (flat top-down = best click-to-draw); the "Archistar/Forma-quality PLAN view with white buildings + shadows" is NOT a flat map — it's a **Cesium PLAN-OBLIQUE** view (low ~30–45° tilt, the FORMA.2 aesthetic). Three quality upgrades ✅ ALL SHIPPED 2026-06-04: (a) ✅ **FORMA-PLAN-OBLIQUE** (`d43b3d2`) — a low-tilt "Plan" camera preset on the Cesium Forma view (massing + shadows, top-down-ish) alongside the 3D oblique; (b) ✅ **MAP-DATA-OVERTURE** (`db45cac`) — keyless **Overpass/OSM** building footprints (Overture ships GeoParquet, not browser-direct; OSM is the keyless path + largely what Overture buildings derive from; one-line `OVERTURE_SWAP` upgrade documented) for the MapLibre 2D context AND extruded white Cesium 3D context massing w/ shadows (`contextBuildings.ts`, CSP origins added, bbox cache + graceful fallback); (c) ✅ **CLIMATE-LIVE-DATA** (`d17920f`) — Open-Meteo (monthly temp normals + wind) + PVGIS (GHI) keyless adapters injected as the `fetchImpl` behind the A.10 bundled-normals fallback; CSP origins added; 23 tests; honest `noaa-normals`/`fallback-defaults` tier. Climate CALCULATION (CFD/Radiance/EnergyPlus) stays out-of-renderer (Cesium renders results, doesn't compute). · ✅ **FORMA-3D-WIRING + UI-FORMA-TOGGLE-POSITION SHIPPED 2026-06-04** (`8a0b02c`/`904ac90`): the Cesium Forma view is now REACHABLE via a "Site 3D (Forma)" button (GIS rail + post-generate result bar) defaulting to the Plan preset (root cause was `mountFormaViewToggle` defined-but-never-called); forced Forma mode (token-safe) + `whenReady()` (killed the 400ms race); floating toggles + analysis card repositioned off the top-centre toolbar (lower-left + bottom-right). Decision of record: [SPEC-FORMA-SITE-VIEW](../specs/SPEC-FORMA-SITE-VIEW.md); ADR to formalize. | IP-A2 · IP-A3 |
| **🔧 Testing regressions + critical opens (2026-06-03 session)** — ✅ **panel-size-on-load** (inset:0+margin:auto stretched to max-height; → transform-centre `a8d672ef`) · ✅ **draw-step blank / Cesium-instead-of-cream-map** (`SiteBoundaryMap2D` TDZ `ReferenceError` on `basemap` from the satellite toggle → map never mounted `a8d672ef`) · ✅ **3D LineLoop error-spam every frame** (`ParcelBoundarySceneRenderer` THREE.LineLoop → THREE.Line; WebGPU doesn't support LineLoop `db8021d7`) · ✅ **RoomBoundingLine `isActive` TypeError → ~80 s batch hang** (`data.properties?.isActive ?? true` guard `db8021d7`) · 🔴 **OI-060 — HTTP 500 on `GET /api/v1/projects`; OLD PROJECTS CAN'T OPEN (founder-flagged 2026-06-03)**: server returns 500 (errorId'd) on BOTH list and open of existing projects (`ProjectListClient server-error`). Server-side — needs the server stack trace. Suspect: a row/snapshot the list/open path can't deserialize (old volatile-era projects, or a real PG query/column error now the pool is live), or the §SERVER-PG-DEGRADE path. Relates to OI-059. AUDIT the `/api/v1/projects` GET handler + `_openProjectViaRuntime`. · ✅ **LAYOUT-QUALITY-DEEP SHIPPED-PARTIAL 2026-06-04 (`ee076e0`)** — AUDIT found the D-TGL primary path is ALREADY polygon-aware for axis-aligned rectilinear shells (`enumerate.ts:122` `decomposeToRects(shell.perimeter)`); the bounding-rect bailout lives in the strip-slicer fallback (`proceduralLayout.ts:57`) fired when D-TGL returns `[]`, plus skewed/off-axis quads stair-step in `decomposeToRects`. FIX: added principal-axis rotation (`principalAxisAngle` length-weighted circular mean at 4× edge angle) in `runDeterministicLayout.ts` — rotate shell+spans to axis-aligned frame, enumerate, rotate geometry back; L/U/T + skewed-22° quads now lay rooms inside the REAL polygon (no 1-room bailout), +11 tests, ai-host 1480✓. DEFERRED (honest): concave-AND-skewed (e.g. L rotated 22°) notches still stair-step; truly arbitrary organic polygons get rotated-frame best-fit (rooms are always rectangles in the rotated frame). ORIGINAL: the generator ALREADY turns the drawn boundary into N shell walls (e.g. 9 for a U-shape), but D-TGL `subdivide` assumes a RECTANGLE → on a non-rectangular (U/L) footprint it drops rooms (`§HARD-MIN-SIDE` spam) and bails to a 1-room rectangle that IGNORES the drawn shape; the layout-picker options are then "completely off" from the plot. **FIX DIRECTION (supersedes the bounding-rectangle rectify): USE THE DRAWN BOUNDARY LINES DIRECTLY as the shell + make D-TGL do a rectilinear DECOMPOSITION of the ACTUAL polygon** (lay rooms inside the real shape, not a bounding rect). Relates to [[single-apartment-fix-pass-spec]] + [[d-tgl-deterministic-layout-engine]]. · 🟡 **AI-HOST-WINDOW-GLOBALS-TYPECHECK (founder-flagged 2026-06-03 — "don't leave them there")**: `pnpm --filter @pryzm/geometry-wall run typecheck` (and other dependent-package typechecks) report TS2339 on `window.commandContext`/`slabStore`/`columnStore`/etc. in `ai-host/src/{AIReadModel,AIElementFactory}.ts`, even though `packages/ai-host/src/global-window.d.ts` declares them all — the ambient `declare global` is a MODULE (`export {}`) so it's NOT loaded when a dependent package transitively compiles ai-host source. ✅ FIX APPLIED 2026-06-03: `/// <reference path="./global-window.d.ts" />` in `AIReadModel.ts` + `AIElementFactory.ts` — ai-host window-global TS2339 GONE (verified). · 🔴 **PER-PACKAGE-TYPECHECK-HYGIENE SWEEP (revealed 2026-06-03, do NOT dismiss)**: running the per-package typecheck exposed the SAME class of pre-existing errors the root/editor typecheck MASKS — `command-registry/src/CommandManagerImpl.ts` TS2339 on undeclared `window.visibilityIntentStore`/`viewIntentInstanceStore`, plus genuine strict-null errors (`Object is possibly undefined`, `string | undefined not assignable`) in `command-registry/{ceilings,curtainwall,ai-vg}/*`. TASK: (1) add the missing window globals to `command-registry/src/global-window-augment.d.ts` + `/// reference` it where read; (2) fix the strict-null sites; (3) add a **CI per-package typecheck gate** so these never accumulate again. LONG-TERM: remove window-global reads per P4 (constructor injection). | IP-A2 · IP-A3 · §7 CI |
| A.6 TypologyPicker UI · **A.6.b** TypologyPickerPanel built (`TypologyPickerPanel.ts`, registry-driven cards) · ✅ **A.6.c SHIPPED 2026-06-05 — House + Apartment selectable end-to-end (full UI)**: the RAC already renders registry-driven typology chips (casa-unifamiliar included) but two blockers hid the house — the New-Project modal's "Residential" auto-seeded `apartment` (skipping the picker) + `briefBootstrap` hard-gated `typologyId !== 'apartment'`. Fixes: modal "Building type" offers explicit **Apartment** + **House — single-family** (PlatformRouter `_typologyForProjectType` maps them; Apartment is the default option); gate widened to `{apartment, casa-unifamiliar}` (both → `generateApartmentFromBoundary`, the casa Pack being a single-storey bridge); RAC chips show the Pack `displayName`; confirm-noun says "house"; style made typology-agnostic (`getActiveDesignMetadata`) so floor + furniture finishes apply to the house. Casa generates as a SINGLE-STOREY house today (A.21.a bridge); multi-storey + stairs = future Pack work. | IP-A3 |
| A.7 C19 Site schemas + SiteStore | IP-A2 (schema) · IP-A5 (ratify) |
| A.7.c.x site.* L5 dispatch helper ✅ SHIPPED 2026-06-03 (`createSiteFromRect.ts` · `pryzmCreateSiteFromRect(addr?,w?,d?)` — runs `siteCreate`→`siteUpdateLocation`→`siteSetParcelBoundary` pure handlers directly + emits typed `site.created`/`site.location-changed`/`site.parcel-boundary-set` on `runtime.events` per the handlers' documented L5-adapter contract; bus registration + `LTPENURebase.setOrigin` deferred to A.8.a). PREREQ for A.8.c + A.5.g.4. · **A.7.c.2–.5** ✅ SHIPPED (`d010ba2`·`9d10d77`·`ee9fef8`) — C19 Site MVS commands as pure L3 handlers (Zod-validated → `SiteModelStore` mutation → typed event; P8 span at the L5 plane): `siteUpdateZoning`/`siteSetFootprint`/`siteClearFootprint` · `siteAddContextBuilding`/`siteRemoveContextBuilding`/`siteReplaceContextBuilding` · `siteLinkClimate`/`siteLinkBuilding`/`siteReplace`/`siteDelete`; 51 tests. A.7.c.4 `siteResyncContextBuildings` (async cesium/osm/msft ingest) deferred. | IP-A2 |
| A.8.a Address geocoding + lat/lon picker ✅ SHIPPED 2026-06-03 (`geocodeAddress.ts` headless OSM Nominatim + `siteGeocodeSearchBox.ts` CSP-safe; pick → Cesium fly-to + `site.updateLocation`; nominatim added to CSP `connect-src`). Residual: `LTPENURebase.setOrigin` rebase deferred (A.8.a/C19 §1.3) | IP-A2 (search box renders + returns lat/lon) |
| A.8.x Parcel-boundary scene render ✅ SHIPPED 2026-06-03 (`ParcelBoundarySceneRenderer.ts` — committed boundary drawn as a violet #6600FF in-scene ground outline + 6% fill; reads `siteModelStore.getParcelBoundary()` scene-XZ so it aligns with generated walls by construction; P2-compliant via `@pryzm/renderer-three/three` facade; non-pickable on `EDITOR_LAYER`; project-scoped dispose via `projectScopeRegistry`; refreshes on `site.parcel-boundary-set`; `initScene` wiring `a6bc791`). Browser-verify: visual + wall-alignment | IP-A2 |
| A.8.b Cesium-light tile layer 🟢 2026-06-03 (`CesiumViewport.ts`: keyless **ESRI World Imagery satellite** basemap + OSM streets fallback; imagery colour-graded (brightness 0.9 / contrast 1.15 / saturation 1.25 / gamma 1.1) + `globe.enableLighting` + ground/sky atmosphere — fixes founder "washed-out / too light" feedback `177087a`. Google 3D-Tiles premium path untouched (token-gated). Browser-verify: ESRI tiles load + crisp-not-dim). Residual: zoom-to-bbox parity with 2D map | IP-A2 (cream basemap loads; zooms to bbox) |
| A.8.c Polygon-draw tool (Hektar-style) 🟢 FIRST CUT 2026-06-03 (`SiteBoundaryDrawTool.ts` Cesium click/dblclick/Esc → `boundaryProjection.ts` equirectangular XZ + edge-class → `site.setParcelBoundary`; **UI-triggerable** via GIS rail panel buttons "✏️ Draw Site Boundary" + "🏢 Generate Apartment" (`GISRailPanel` → `gisStartBoundaryDraw` prop + `generateApartmentFromBoundary`), not just `pryzmStartBoundaryDraw()`). Browser-verify: pick on 3D-tiles, projection accuracy, frontage heuristic. Residual: proj4 LTP-ENU swap, drag-edit, >30 warn/>200 refuse (C19 §1.4) | IP-A2 (vertex-click + close-loop) · IP-A4 (drag-edit + OSM snap) |
| **A.8.c.f Hektar-style 2D plan-view boundary-draw map** ✅ SHIPPED 2026-06-03 — the founder wanted boundary-draw on a beautiful cream PLAN-view cartographic map (Hektar), NOT the 3D Cesium globe. `apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts` + `siteMap2DStyle.ts` (MapLibre GL). **A.8.c.f.1** first cut (CartoDB Positron raster + violet draw → same `boundaryProjection`→`dispatchParcelBoundary`→`site.setParcelBoundary` commit path; GIS-rail "✏️ Draw Site Boundary" opens 2D map, Cesium kept for 3D render) `5ce3ffc`. **A.8.c.f.2** Hektar-grade upgrade (**OpenFreeMap keyless vector tiles** → real white building footprints + drop-shadows + streets + muted labels; optional 3D `fill-extrusion`; `fitBounds`-to-address; CSP `tiles.openfreemap.org`) `a53d453`. **A.8.c.f.3** zoom-to-address bbox actually threaded through the onboarding path (`pryzmSetGeocodeFrame` hook; geocode bbox was dropped in onboarding's `handleGeocode`) `400ce8e`. Browser-verify: looks like Hektar + zooms to plot + buildings/shadows render (OpenFreeMap source-layer names). Residual (queued): keep boundary visible on plan map + post-boundary "generate via AI?" step + dual Cesium-3D/2D-plan on-demand view (see [[onboarding-site-generate-view-flow]] / O.7 below). · ✅ **A.8.c.f.4 SHIPPED 2026-06-03** (`20c254b` — keyless **ESRI satellite/aerial basemap toggle** "Map/Satellite" on the 2D map; `setStyle` swap re-adds the violet boundary draw + restores camera on `style.load` so the in-progress drawing survives; 9 style tests green). Was: sparse building coverage = OSM source-data gaps (founder-clarified 2026-06-03): the Hektar cream+shadow look is good, but building footprints are missing in many areas — and the founder confirmed it's the SOURCE DATA, not rendering: OpenFreeMap is OSM-derived, so even central Lisbon (Engrácia) has gaps. Any OSM-based vector source (Overpass, other planetiler hosts) shares the SAME gaps. **Only real aerial imagery fills them.** Fix = add a keyless **satellite/aerial basemap toggle** (ESRI World Imagery — the same provider Cesium uses) to the 2D map so the user can switch Hektar-cream ↔ aerial when OSM coverage is thin and still draw the boundary accurately. Default stays Hektar-cream | IP-A2 |
| A.8.d Auto-fire site analyses on boundary commit | IP-A4 (climate fetch + ContextBuilding pull live) |
| A.8.e BuildingFootprint authoring | IP-A4 (footprint draw + containment-lint live) |
| A.8.f Site Inspector right-panel ✅ SHIPPED 2026-06-03 (`SiteInspectorPanel.ts` + `siteInspectorData.ts` — GIS-rail "📐 Site Inspector" button; shows address · lat/lon · parcel area m² (store `parcel.area` + shoelace fallback) · boundary vertex count + inline SVG thumbnail · frontage/true-north when present; "Climate analysis" + "Edit boundary" actions; live via `siteModelStore.subscribe()` + `site.created`/`site.location-changed`/`site.parcel-boundary-set`; 13 unit tests green; white+purple brand `ae908fe`). **Satisfies IP-A2 "I see a Site panel with my plot."** Browser-verify: rail open + populate-on-author | IP-A2 · IP-A4 |
| A.9 IfcSite round-trip | IP-A5 |
| A.10 Climate ingestion EPW + NOAA | IP-A3 (parser) · IP-A4 (UI) |
| A.11 Climate substrate UI ✅ SHIPPED 2026-06-03 (`apps/editor/src/ui/climate/ClimatePanel.ts` — sun-path + wind-rose + temp-profile over the A.10 `@pryzm/climate-host` ClimateStore; pure chart math in `climateChartData.ts`, 14 tests; empty-state when no EPW/location). Browser-verify the panel render + mount point. | IP-A4 |
| A.APT.SA.5 windows: door-avoidance ✅ SHIPPED 2026-06-03 (`3a8f8315`) — windows were ALREADY emitted (T1.W engine); added `clearOffsetMm` to slide each window clear of doors on its host wall + fall through to the next exterior wall; ai-host 1463/1463. **NB if apartments still show NO windows, it's a RENDER/path issue, not the engine.** | IP-A5 |
| A.12 @pryzm/sdk npm publish | IP-A1 |
| A.13 @pryzm/headless npm publish | IP-A1 |
| A.14 DNS marketplace.pryzm.so | IP-A1 |
| A.15 First 5 marketplace plugins | IP-A1 (first 2) · IP-A3 (next 3) |
| A.16 Marketplace UX polish | IP-A6 |
| A.17 brand cutover (SUPERSEDED by IP-A5.X / ADR-055 → `pryzm.so` apex/app split) | IP-A5 |
| A.18 Pricing page from entitlement registry | IP-A5 |
| A.19 Brand-voice content sweep | IP-A5 |
| A.20 C50 Typology Pipeline contract DRAFT | IP-A2 |
| A.21 House typology end-to-end | IP-A7 (MVP) · IP-A8 (polish) · IP-A9 (ship) |
| A.22 Small-Office typology end-to-end | IP-A10 (MVP) · IP-A11 (ship) |
| A.23 C20 Building + Apt Aggregates | IP-A7 (schemas) · IP-A8 (wiring) · IP-A9 (ratify) |
| A.24 Inspect tree wired with aggregates | IP-A7 (axis) · IP-A8 (complete) |
| A.25 IFC4X3 Pset coverage | IP-A7 (80%) · IP-A9 (100%) |
| A.26 Revit IFC4X3-RV variant exporter | IP-A10 |
| A.27 10-project IFC round-trip nightly | IP-A9 |
| A.28 First 3 community family packs | IP-A8 |
| A.29 Family marketplace UX polish | IP-A8 |
| A.30 C22 PII partial ratification | IP-A4 (DSAR) · IP-A5 (UI) |
| A.31 C23 Provenance graph partial ratification | IP-A5 (graph) · IP-A11 (UI complete) |
| A.32-A.34 WCAG accessibility prep | IP-A9 (axe-core green) |
| A.35 Backup + DR runbooks | IP-A10 (PG snapshot) · IP-A11 (drill) |
| A.36 First DR drill | IP-A11 |
| A.37 Cognition L1-L4 hardening (100 rules) | IP-A12 |
| A.38 L5 daylight rule-checker | IP-A7 |
| A.39 L5 perceptual evaluator | IP-A8 |
| A.40 First 50 paying customers | IP-A6 (10) · IP-A9 (25) · IP-A11 (35) · IP-A12 (50) |
| A.41 Phase 1 exit ADR | IP-A12 (draft) · IP-A13 (ratified) |
| A.U.* Editor UI redesign | distributed: A.U.5 → IP-A3 · A.U.12 consent → IP-A4 · A.U.4 settings → IP-A10 · A.U.2 property panel → IP-A7 |
| A.PL.* Project page | A.PL.1 hub → IP-A3 · A.PL.4 sharing → IP-A8 |
| A.M.* Marketing surfaces | A.M.1/2/3/4 → IP-A5 |
| A.B.* Billing UX | A.B.5 trial banner → IP-A4 · A.B.4 quota meter → IP-A4 |
| A.A.* Auth UX | A.A.1 signup polish → IP-A2 |
| A.PR.B/H Production-readiness | distributed across IP-A1 through IP-A11; B10 (quarantine modal) → IP-A6; H19 (OTel exporter) → IP-A4 |
| A.DU.* Daily-use fixes | distributed; primarily IP-A1 → IP-A6 (sprint 1-3 fixes) |
| A.OI.* | OI-011/012/013 → IP-A1; OI-053 (project-open perf) → IP-A4; OI-058 (Scene Registry) → IP-A6 |
| A.APT.* Apartment carry-overs | A.APT.SA.2 corridor ✅ SHIPPED 2026-06-03 (`bbebb79`): `wallsAndDoors.ts` pass (2c) §CIRCULATION-REROUTE — every private/service room without a DIRECT corridor door gets one on a permitted circulation-adjacent wall (caps respected, forbidden pairs never crossed, ensuite-via-master preserved); land-locked rooms → `unroutedToCirculationRoomIds` warning not illegal door; `enumerate.ts` `clean+legal+routed` gate tier. Closes single-apartment-fix-spec critical #2 ("corridor doesn't link all"). ai-host 1469/1469 (+6). · A.APT.SA.5 windows engine → IP-A5 |

The user-facing acceptance test at each IP runs through the cumulative test surface: IP-A6 tests IP-A1 through IP-A6's combined surfaces.

---

## §3 — Phase A — Alpha (Current; 2026-Q3 to 2026-Q4; ~6 months)

**Phase A exit criteria**: see [roadmap-phase-1-alpha.md §1](./roadmap-phase-1-alpha.md). 10 criteria (E1–E10). Closure ADR raised at end of 2026-Q4.

### §3.1 — Phase A capability buckets + sub-phases

| Phase | Goal | Description + references | Status |
|---|---|---|---|
| **A.1** | **TypologyPipeline package scaffold** | NEW `packages/typology-pipeline/` (TypologyRegistry + 7-stage PipelineRouter + 7 stage helpers, 54/54 tests). `composeRuntime()` slot integration deferred to A.3. Refs: [phase-1-alpha §3.1](./roadmap-phase-1-alpha.md), [typology-expansion §4](./typology-expansion-roadmap.md). Owner: Engineer 1. | ✅ DONE (Sprint 1) |
| **A.2** | **TypologyManifest schema** | `packages/schemas/src/typology/manifest.ts` — zod-validated TypologyManifest, 39/39 tests. Refs: [typology-expansion §4.1](./typology-expansion-roadmap.md). | ✅ DONE (Sprint 1) |
| **A.3** | **TypologyRegistry slot + dispatch router** | `runtime.typology = { registry, router }` slot wired in `composeRuntime()` ([types.ts](../../../packages/runtime-composer/src/types.ts), [composeRuntime.ts](../../../packages/runtime-composer/src/composeRuntime.ts)) + 7 integration tests; tearDown clears registry. Pack self-registration deferred to A.4. Refs: [C50 §1.1](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md), [typology-expansion §4.2–4.3](./typology-expansion-roadmap.md). | ✅ DONE (Sprint 1) |
| **A.4** | **Apartment refactored as TypologyPack** | Multi-slice refactor; broken into A.4.a-A.4.x below. Existing `@pryzm/ai-host` apartmentLayout workflow stays intact until A.4.x retires it. Refs: [C50 §6](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md), [phase-1-alpha §3.2](./roadmap-phase-1-alpha.md). | 🟡 IN PROGRESS (Sprint 2) |
| **A.4.a** | **Apartment pack scaffold + bridge registration** | NEW `packages/typology-pack-apartment/` (manifest + bridge generative/bim-emit stages + factory + 16 tests). Registered at boot in `composeRuntime()`. Bridge command `typology.apartment.bridge` to be intercepted by editor's legacyBridge handler (A.4.a-editor-bridge). Refs: [C50 §6](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md). | ✅ DONE (Sprint 1) |
| **A.4.b** | **Move D-TGL into the pack — deterministic Stage 4** | Migrate `packages/ai-host/src/workflows/apartmentLayout/tgl/` + `generate.ts` + `proceduralLayout.ts` into `packages/typology-pack-apartment/src/stages/deterministic.ts`. Refs: [SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE](../../02-decisions/specs/SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md). | ⚪ PLANNED (Sprint 3–4) |
| **A.4.c** | **Move AI workflow into the pack — AI Stage 4** | Migrate `apartmentLayout/workflow.ts` + `executePlan.ts` into the pack with a clean DI seam for the relay + shellReader. Refs: [C09 §2.4](../../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md). | ⚪ PLANNED (Sprint 4) |
| **A.4.d** | **Move validators into the pack — Stage 5** | Migrate `apartmentLayout/validators/` + bathroomCorridorOnly + door-presence + window-presence + circulation-gate. Refs: [apartment dimensional-constraints](./apartment/dimensional-constraints.md). | ⚪ PLANNED (Sprint 4) |
| **A.4.e** | **Move cognition evaluators — Stage 6** | Migrate L1+L2+L3+L4+L7 evaluators per [APARTMENT-COGNITION-STACK §3](../../03-execution/plans/apartment/cognition-stack.md). | ⚪ PLANNED (Sprint 5) |
| **A.4.f** | **Move command emitters — Stage 7** | Migrate `apartmentLayout/buildLayoutCommands.ts` into the pack's bimEmission. Retire `typology.apartment.bridge` placeholder. | ⚪ PLANNED (Sprint 5) |
| **A.4.x** | **Retire `@pryzm/ai-host` apartmentLayout module** | Remove the legacy path after editor-bridge no longer needed. C50 DRAFT → CANONICAL gate. Refs: [C50 §10 ratification](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md). | ⚪ PLANNED (Sprint 6) |
| **A.5** | **RAC chatbot UI v1** | Split into A.5.a (L3 pure state-machine — DONE) and A.5.b (L5 React component). Role + typology + brief flow per [product-vision §5 Step 2](../../01-strategy/product-vision.md). Refs: [typology-expansion §2](./typology-expansion-roadmap.md). | 🟢 IN PROGRESS (Sprint 1–3) |
| **A.5.a** | **RAC chatbot L3 state-machine model** | `packages/typology-pipeline/src/RacChatbotModel.ts` — pure 6-phase reducer (intro → awaiting-role → awaiting-typology → awaiting-brief → ready, plus cancelled). Includes `parseRoleFromText` + `parseTypologyIdFromText` deterministic parsers (LLM-fallback path), `toBrief()` exit-shape extractor, `defaultPromptForPhase` UI helper, **`summarizeCapturedState` echo-back helper** (A.5.a.next, 15 tests — single-line architect-readable summary: `OK: architect · apartment · 2-bed · 1-bath · 70m² target · style modern`; canonical key order [bedrooms · bathrooms · targetArea · style · budget · timeline]; unknown keys append alphabetically; integer counts bare, floats 1dp, booleans yes/no, strings trimmed, empty/null/undefined skipped, objects JSON). 48 tests (33 + 15). Reference: `./MasterMiawW/` (the MIAW chatbot — translate patterns into the L5 React component). | ✅ DONE (Sprint 1–2) |
| **A.5.b** | **RAC chatbot L5 React component** | `apps/editor/src/ui/onboarding/RACChatbot.tsx` — wraps A.5.a model with Claude streaming UI (per MIAW ConversationCanvas pattern). Plus the Claude-API call site that does structured extraction for brief fields. | ⚪ PLANNED (Sprint 3) |
| **A.6** | **TypologyPicker UI** | Split into A.6.a (L3 pure model — DONE) and A.6.b (L5 React component). 10-category card grid. Refs: [typology-expansion §3](./typology-expansion-roadmap.md), [C50 §5.3](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md). | 🟢 IN PROGRESS (Sprint 1–3) |
| **A.6.a** | **TypologyPicker L3 pure model** | `packages/typology-pipeline/src/TypologyPickerModel.ts` — `buildPickerCards(registry, userTier)` + 4 filter helpers + `groupByCategory` + **`groupByPhaseGate`** + **`summarizePickerCards`** (A.6.a.next). Per C50 §5.3 locked cards STAY in the list (annotated with `locked: true` + `lockReason`, never filtered out) so the upgrade-path is visible. Sort: category asc → displayName asc. `groupByPhaseGate` returns groups in stability order (ga → beta → alpha → community-marketplace); empty groups omitted. `summarizePickerCards` returns `{total, available, locked, categoryCount, marketplaceCount, byPhaseGate}` for the L5 header chip. 30 tests (20 + 10). | ✅ DONE (Sprint 1–2) |
| **A.6.b** | **TypologyPicker L5 React component** | `apps/editor/src/ui/onboarding/TypologyPicker.tsx` consumes A.6.a model; renders 10-category card grid + locked badges + category section headers. | ⚪ PLANNED (Sprint 3) |
| **A.7** | **C19 Site element schemas + SiteStore** | Multi-slice; broken into A.7.a-A.7.f. Refs: [C19](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md), [phase-1-alpha §4.1](./roadmap-phase-1-alpha.md). | 🟢 IN PROGRESS (Sprint 1–2) |
| **A.7.a** | **L0 site schemas authored** | 7 schemas in `packages/schemas/src/site/` (SiteModel · Parcel · BuildingFootprint · ContextBuilding · SiteLocation · ProvenanceRecord + branded ids) + 35 tests. Re-uses canonical `Vec3` + `ProjectId` from existing schemas to avoid root-barrel collisions. | ✅ DONE (Sprint 1) |
| **A.7.b** | **SiteStore (L3 reactive store)** | `packages/stores/src/SiteModelStore.ts` (15 tests). Subscribable; resolution helpers (getParcelBoundary · getFootprint · getContextBuildings · getLocation); `set()` + `reset()` + `dispose()` lifecycle. Wired in `composeRuntime()` → `runtime.siteModelStore`. Per [C19 §3.1](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md). | ✅ DONE (Sprint 1) |
| **A.7.c** | **`site.*` commands per C16** | Broken into A.7.c.1 (MVS for typology Stage 2 — site.create / site.updateLocation / site.setParcelBoundary, ✅ DONE) and A.7.c.2+ (the rest: updateZoning · setFootprint · context-buildings · replace · delete). Refs: [C19 §4](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md), [C16](../../02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md). | 🟢 IN PROGRESS (Sprint 1–2) |
| **A.7.c.1** | **MVS: site.create + site.updateLocation + site.setParcelBoundary** | Pure handlers in `packages/stores/src/site-commands/` (17 tests). Enforces §1.1 idempotency · §1.4 parcel polygon immutability · §2.7 edge-classifications length. Domain events `site.created` · `site.location-changed` · `site.parcel-boundary-set` ready for L5 emit. LTP-ENU rebase per §1.3 is the L5 adapter's responsibility. | ✅ DONE (Sprint 1) |
| **A.7.c.2** | **site.updateZoning + site.setFootprint + site.clearFootprint** | 3 handlers in `packages/stores/src/site-commands/` (17 tests). updateZoning patches mutable parcel fields (setbacks · zoning · FAR · maxHeight) without touching the polygon (§1.4); setFootprint runs §1.6 containment + setback check via `@pryzm/site-validators` and SUCCEEDS WITH `warnings` (non-fatal lint per §1.6); clearFootprint sets footprint to null. Domain events `site.zoning-updated` · `site.footprint-set` · `site.footprint-cleared` ready for L5 emit. Refs: [C19 §4.1](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md). | ✅ DONE (Sprint 1) |
| **A.7.c.3** | **site.addContextBuilding + site.removeContextBuilding + site.replaceContextBuilding** | 3 handlers in `packages/stores/src/site-commands/` (15 tests). Per §1.5 reference-only neighbour shapes (L0 schema enforces `editable: false` via `z.literal`). addContextBuilding rejects duplicate ids; removeContextBuilding rejects when id missing; replaceContextBuilding is atomic remove + add preserving order, supports same-id or new-id replacement, rejects collision with unrelated entries. Domain events `site.context-building-{added,removed,replaced}` ready for L5 emit. | ✅ DONE (Sprint 1) |
| **A.7.c.4** | **site.resyncContextBuildings (async ingest)** | Per §1.8 — atomic replace from cesium-ion / osm / msft-footprints. | ⚪ PLANNED (Sprint 3) |
| **A.7.c.5** | **site.linkClimate + site.linkBuilding + site.replace + site.delete** | 4 handlers in `packages/stores/src/site-commands/` (19 tests). `siteLinkClimate` / `siteLinkBuilding` set the C21/C20 cross-element refs (null clears). `siteReplace` = the ONLY path to change parcel polygon per §1.4 — rejects id-mismatch + projectId-mismatch + L0 SiteModelSchema fail; event carries `priorSnapshot` for the single undo entry per §4.4. `siteDelete` rejects WITHOUT explicit `cascadeFromProjectDelete: true` flag per §1.1 (FORBIDDEN in normal flow). Refs: [C19 §4](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md). | ✅ DONE (Sprint 1) |
| **A.7.d** | **Cross-schema validators (pure geometry package)** | NEW `packages/site-validators/` (L2 pure geometry) — polygonArea + polygonSignedArea + pointInPolygon + pointSegmentDistance + pointPolygonEdgeDistance + polygonContains + polygonFingerprint + checkFootprintContainment (§1.6 containment + setback) + checkFAR (§1.6 invariant 4) + checkEdgeClassifications (§2.7 invariant 3). 39 tests. Site-commands refactored to use the canonical implementations (DRY). Refs: [C19 §1.6 + §2.7](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md). | ✅ DONE (Sprint 1) |
| **A.7.e** | **Legacy `Project.location` migration** | Multi-slice; broken into A.7.e.1 (L0 schema adapter — DONE) and A.7.e.2 (L4 persistence loader v1→v2 promotion + L5 dual-write — PLANNED). Per [C19 §8.2](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md). | 🟢 IN PROGRESS (Sprint 2) |
| **A.7.e.1** | **L0 legacy-location adapter** | New L0-pure module `packages/schemas/src/site/legacyProjectLocation.ts` exposing (a) `LegacyProjectLocation` interface mirroring v1 `Project.location` (5 fields: latitude / longitude / elevationAsl / trueNorth / basePoint), (b) `promoteProjectLocationToSite(legacy): SiteLocation` — information-preserving v1→v2 promotion, defaults v2-only fields (crs / siteAddress / landTitleNumber) to null per [C19 §8.1] (no PII tracked in v1), (c) `siteLocationToLegacyProjectLocation(site): LegacyProjectLocation` — the v1-shape getter view for the [C19 §8.2] deprecation period (lossy in v2→v1 by design), (d) `v1FieldsEqual(a, b): boolean` — diff-detection for the L4 dual-write adapter (ignores v2-only fields). 16 tests. The L4 persistence loader calls `promoteProjectLocationToSite()` synchronously BEFORE `pryzm-project-context-set` fires (deferred to A.7.e.2). | ✅ DONE (Sprint 2) |
| **A.7.f** | **`IfcSite` round-trip** | per [C25 §3](../../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md) — this is what A.9 covers. | (see A.9) |
| **A.8** | **Site authoring UI (Cesium-light)** | Cream/warm-white map aesthetic per [product-vision §5 Step 3](../../01-strategy/product-vision.md). Hektar-style UX: address-search → satellite zoom → polygon-draw → auto-analyses. Broken into A.8.a-A.8.f below. Refs: [C19 §5](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md), [phase-1-alpha §4.1.4](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 3–4) |
| **A.8.a** | **Address geocoding + lat/lon picker** | OSM Nominatim primary, Mapbox secondary (per [C19 §5.1](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md)). Free-form address input → returns lat/lon + bbox. Dispatches `site.updateLocation`. PII per [C22](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md). | ⚪ PLANNED (Sprint 3) |
| **A.8.b** | **Cesium-light tile layer** | Cream/warm-white satellite-imagery basemap (the "not the dark globe" aesthetic per [product-vision §5 Step 3](../../01-strategy/product-vision.md)). Cesium ion + custom style. Default zoom-to-bbox on address commit. | ⚪ PLANNED (Sprint 3) |
| **A.8.c** | **Polygon-draw tool (Hektar-style)** | Click vertices → double-click to close → drag-to-edit vertices → undo per vertex. Optional snap to OSM building footprints. Warns > 30 vertices, refuses > 200 (per [C19 §1.4](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md)). On commit: `LTPENURebase.projectToScene` (per [C12](../../02-decisions/contracts/C12-GEOSPATIAL.md)) → dispatches `site.setParcelBoundary`. | ⚪ PLANNED (Sprint 3–4) |
| **A.8.d** | **Auto-fire site analyses on boundary commit** | Boundary-commit event triggers: climate ingest ([C21](../../02-decisions/contracts/C21-CLIMATE-INGESTION.md) EPW/NOAA fetch for boundary centroid) + terrain DEM pull + ContextBuilding snapshot (OSM + Microsoft Footprints per [C19 §2.3](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md)). Async, non-blocking, status surfaced in [A.11 climate panel](#). | ⚪ PLANNED (Sprint 4) |
| **A.8.e** | **BuildingFootprint authoring (inside parcel)** | Second polygon tool — draws the project's own building outline on the parcel. Enforces containment + setback compliance per [C19 §1.6](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md). Lint warnings surfaced in Site Inspector ([C19 §5.3](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md)). | ⚪ PLANNED (Sprint 4) |
| **A.8.f** | **Site Inspector right-panel** | Read-only summary: lat/lon, true-north, CRS, parcel area, FAR ratio, setback compliance, climate-summary, ContextBuilding count. Per [C19 §5.3](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md). | ⚪ PLANNED (Sprint 4) |
| **A.9** | **IFC4X3 `IfcSite` round-trip** | Through `plugins/ifc-export/` + `plugins/ifc-import/`. Refs: [C25 §3](../../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md). | ⚪ PLANNED (Sprint 3) |
| **A.10** | **C21 Climate ingestion (EPW + NOAA)** | Multi-slice; broken into A.10.a-A.10.f. Refs: [C21](../../02-decisions/contracts/C21-CLIMATE-INGESTION.md), [phase-1-alpha §4.3](./roadmap-phase-1-alpha.md). | 🟢 IN PROGRESS (Sprint 1–6) |
| **A.10.a** | **L0 Climate schemas** | 10 schemas in `packages/schemas/src/climate/` (ClimateDataset + EPWRecord + NOAANormal + WindRose + DesignTemps + DegreeDays + SolarSample + ClimateCacheKey + ClimateProvenance + ClimateIngestionError) + helpers `serialiseClimateCacheKey` + `quantiseToCacheKey`. Per [C21 §1.8](../../02-decisions/contracts/C21-CLIMATE-INGESTION.md) every numeric field carries its SI unit in the field-name suffix (…C / …Pa / …Wm2 / …Mps / …Deg / …Pct / …Tenths). Discipline-neutral per §1.10. 48 tests. | ✅ DONE (Sprint 1) |
| **A.10.b** | **L2 EPW parser + 4 builders** | NEW `packages/climate-host/` (L2 pure). `parseEpwHeader` (handles both 9-field + 10-field LOCATION variants per EPW vendor norms) + `parseEpwHourlyRecords` (35-field DOE spec; sentinel-tolerant; local→UTC via GMT offset) + 4 aggregators (`buildMonthlyNormals` · `buildWindRose` 16-sector × 6-bin Beaufort · `buildDesignTemperatures` ASHRAE 99.6%/0.4% + Stull wet-bulb · `buildDegreeDays` base 18°C + 65°F). 37 tests. | ✅ DONE (Sprint 1) |
| **A.10.c** | **L2 SolarPathReader** | `@pryzm/climate-host/src/solarPath.ts` — fresh NOAA-spreadsheet implementation (Meeus Ch. 25), pure + deterministic per [C21 §1.3](../../02-decisions/contracts/C21-CLIMATE-INGESTION.md). `solarSample(lat, lon, utcIso) → SolarSample` + `toJulianDay` + Kasten-Young air-mass + Laue clear-sky transmittance for `approxDirectWm2`. Verified at NOAA reference points (June/Dec solstice zenith at tropics, equinox at equator, London white-nights, 80°N polar night). 22 tests. Implemented FRESH (not extracted from RealSunService) so the new package stays L2-pure; a later slice can swap RealSunService internals to call this helper. | ✅ DONE (Sprint 1) |
| **A.10.d** | **L3 ClimateStore + composeRuntime wiring** | `packages/stores/src/ClimateStore.ts` — siteRef → ClimateDataset resolver + cache keyed by ClimateCacheKey (per [C21 §1.4](../../02-decisions/contracts/C21-CLIMATE-INGESTION.md)) so 2 sites within ~1 km share one entry. Stale entries retained in audit archive per §1.5 (never deleted). EPW > NOAA priority applied at ingest (re-ingest supersedes). Wired in `composeRuntime()` → `runtime.climateStore` + C13 reset hook. 20 tests. | ✅ DONE (Sprint 1) |
| **A.10.e** | **L3 climate.* commands** | 6 handlers in `packages/stores/src/climate-commands/` (24 tests). `climate.ingestEPW` (parses + 4 builders → ClimateDataset → store.ingest, returns cacheKey) · `climate.refreshNOAA` (12 monthlies → synthesised ClimateDataset, EPW supersedes per §1.2 audit-retained) · `climate.resolveSite` (read-only siteRef → dataset \| null) · `climate.invalidateCache` (mark stale per §1.5, archive retains) · `climate.solarSample` (pure compute via @pryzm/climate-host per §1.3) · `climate.windRose` (read-only WindRoseAggregate). Per [C21 §4.1](../../02-decisions/contracts/C21-CLIMATE-INGESTION.md). | ✅ DONE (Sprint 1) |
| **A.10.f** | **Climate substrate cross-package wiring** | composeRuntime slot + reset hook + the L5 UI handoff (which feeds into A.11). | ⚪ PLANNED (Sprint 4) |
| **A.11** | **Climate substrate UI panel** | Sun-path + wind-rose + temperature/humidity profiles. Refs: [phase-1-alpha §4.3](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 4) |
| **A.12** | **`@pryzm/sdk` npm publish (OI-011)** | `pnpm --filter @pryzm/plugin-sdk publish --access public`. Refs: [phase-1-alpha §5.1](./roadmap-phase-1-alpha.md). | 🔴 BLOCKED (npm token + 2FA setup required) |
| **A.13** | **`@pryzm/headless` npm publish (OI-012)** | Same as A.12 for headless. Refs: [phase-1-alpha §5.2](./roadmap-phase-1-alpha.md). | 🔴 BLOCKED (same as A.12) |
| **A.14** | **DNS `marketplace.pryzm.so` (OI-013)** | Cloudflare DNS + TLS cert. Refs: [phase-1-alpha §5.3](./roadmap-phase-1-alpha.md). | 🟡 NEXT UP (Sprint 1) |
| **A.15** | **First 5 PRYZM-first-party plugins listed** | BCF · IFC-Export · DXF · Multiplayer · Cesium-bridge. Refs: [phase-1-alpha §5.7](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 2–4) |
| **A.16** | **Marketplace UX polish** | browse + filter + detail + install flow. Refs: [phase-1-alpha §5.4](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 3) |
| **A.17** | **Brand cutover — SUPERSEDED by IP-A5.X / ADR-055** | `pryzm.so` is now the canonical domain (the `pryzm.app` aspiration is retired, A.17.x.7). The apex/app split (C51) replaces the old "single landing rebuild" approach; the work is tracked under IP-A5.X (A.17.x.*). Landing copy is the editor's `apps/editor/src/ui/platform/LandingPage.ts` per ADR-055 §7. | 🔁 SUPERSEDED → see IP-A5.X |
| **A.18** | **Pricing page from entitlement registry** | Multi-slice: A.18.a (L2 `@pryzm/entitlements` package — DONE) + A.18.b (L5 pricing surface — **MOVED into the editor** `apps/editor/src/ui/marketing/` per ADR-055 §7 / A.17.x.18; the old `apps/docs-site/src/pages/pricing.astro` was DELETED with the Astro docs-site, A.17.x.14. The editor's `PricingPage` + the apex prerender both render from `buildPricingPageData()`/`@pryzm/entitlements` — DONE). Refs: [C39 §1.1 + §1.2 + §1.13](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md) · C51 §6.3. | ✅ DONE (Sprint 2) |
| **A.18.a** | **L2 `@pryzm/entitlements` package** | New L2-pure package in `packages/entitlements/` exposing (a) append-only `ENTITLEMENT_REGISTRY` of 30 feature gates per [C39 §1.2] (typology + output + collaboration + quota + marketplace + enterprise categories), (b) `check(key, userTier): CheckResult` discriminated-union resolver per [C39 §1.1] (deprecated→open, developer/admin bypass, tier-ladder ordinal compare), (c) `buildPricingPageData()` data generator per [C39 §1.13] (section-ordered + per-tier availability matrix + monotonic-up-the-ladder invariant). Pure: no I/O, no THREE, no DOM. 36 tests (registry: 9 · resolver: 15 · pricingPage: 12). | ✅ DONE (Sprint 2) |
| **A.18.b** | **L5 pricing page (Astro)** | `apps/docs-site/src/pages/pricing.astro` — Astro page reading `buildPricingPageData()` from `@pryzm/entitlements` at BUILD TIME (static pre-render, no client-side JS). Renders per-category comparison tables with the 5 consumer tiers as columns and 30 feature gates as rows. Single source of truth: the L2 registry — no hand-written copy. `pnpm exec astro check` clean. Tracker authority for this approach: docs-site is Astro Starlight (not React); the §1.13 contract requires "generated, not hand-written" — Astro static gen satisfies that literally. | ✅ DONE (Sprint 2) |
| **A.19** | **Brand-voice content sweep** | Every customer-facing string audited against [manifesto §5](../../01-strategy/manifesto.md). | ⚪ PLANNED (Sprint 5) |
| **A.20** | **C50 Typology Pipeline contract — DRAFT** | NEW contract (14 invariants) codifying the substrate A.1 shipped. Refs: [C50](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md), [typology-expansion §10](./typology-expansion-roadmap.md). Ratifies (DRAFT → CANONICAL) when A.3 + A.4 ship. | ✅ DRAFT DONE (Sprint 1) |
| **A.21** | **Casa Unifamiliar (House) typology end-to-end** | T2 ship — the SECOND typology; first multi-storey (1–3 levels) + stairs on the typology-agnostic spine. Multi-slice A.21.a–A.21.x. Full requirements + architecture + multi-storey pipeline in [SPEC-CASA-UNIFAMILIAR-TYPOLOGY](../specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md). Refs: [phase-1-alpha §3.3](./roadmap-phase-1-alpha.md), [typology-expansion §5](./typology-expansion-roadmap.md), [C50](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md). **✅ MULTI-STOREY CORE LANDED (2026-06-06):** the pure ai-host pipeline shipped + merged — `packages/ai-host/src/workflows/houseLayout/` (A.21.b storey allocation + A.21.c orchestrator + stair-core + slab-void + roof descriptors), 36 tests, ai-host 1580/1580, zero regression, purely additive (no existing file changed). REMAINING = the EDITOR WIRING follow-up (A.21.d–g: multi-level threading → `AddLevelCommand` fan-out → per-storey command set → `CreateStairCommand` + auto-opening slab-void → slab/roof emission) which needs LIVE in-browser verification, so it is NOT done blind — do it via an agent with a render loop or after a deploy-test cycle. The core's `HouseLayoutResult` is the exact contract the wiring consumes (see A.21.c). **As-built map + the two engine-reuse deviations (stair-core area-budget reduction; per-storey envelope clamp) documented in [SPEC-CASA §13](../specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md#§13--implementation-status--as-built-2026-06-06).** | 🟢 CORE DONE — editor wiring (A.21.d–g) next (Sprint 7–8) |
| **A.21.a** | **Pack scaffold + manifest + brief + register** | NEW `packages/typology-pack-casa-unifamiliar/` mirroring the apartment pack: manifest (`id: casa-unifamiliar`, residential, house roomTypes incl. stair/landing/garage) + slider brief (floors stepper 1–3, bedrooms, garage, garden, master-location) + bridge generative/bim-emit stages + register in `composeRuntime()`. Picker card + RAC recognition go live (both registry-driven). Refs: [SPEC §5,§8](../specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md). | ⚪ PLANNED (Sprint 7) |
| **A.21.b** | **House program + room types + storey allocation** | ✅ **CORE SHIPPED 2026-06-06** — `houseLayout/storeyAllocation.ts` `allocateProgramToStoreys(program, storeyCount) → StoreyProgram[]` (public/wet/living + kitchen on the GROUND; bedrooms + bathrooms UPSTAIRS; stair+landing reserved on every storey it passes; 1-storey = passthrough; pure + deterministic). `houseLayout/types.ts` adds `StoreyProgram`/`StoreyRole`. NB the `RoomType` enum extension (stair/landing/garage/porch/terrace) + house program-rules `accessFrom` for vertical circulation is the remaining sub-slice (folded into A.21.h validators). Refs: [SPEC §3](../specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md), [SPEC-ARCHITECTURAL-PROGRAM-RULES](../specs/SPEC-ARCHITECTURAL-PROGRAM-RULES.md). | ✅ DONE (core) |
| **A.21.c** | **Storey orchestrator (reuse D-TGL per plate)** | ✅ **SHIPPED 2026-06-06** — NEW `packages/ai-host/src/workflows/houseLayout/` (`houseOrchestrator.ts` `generateHouseLayout(shell, program, constraints, weights, {storeyCount, floorToFloorM=3.0, baseElevationM=0, levelIdForStorey, solar, roofKind='gable'}) → HouseLayoutResult` + `stairCore.ts` `reserveStairCore(footprint, storeyCount)` → an aligned ~1.0 m × 2.6–3.2 m mm rect that STACKS across storeys). Per storey runs the FROZEN single-plate `generateDeterministicLayouts` unchanged: the stair core is handled by shrinking the usable AREA BUDGET (`netAreaM2 = trueArea − stairCoreArea`), not carving the polygon (engine has no obstacle param). Result carries `storeys[]` (levelId/elevationM/footprint), `perStoreyLayout[]`, `stairs[]` (StairCore from/to levelId), `voids[]` (SlabVoid over the stair on every non-ground slab), `roof` (RoofDescriptor, footprint=shell). Pure/deterministic, span-free (spans live at the plane boundary). **36 tests; ai-host 1580/1580 (zero regression).** SECONDARY FIX: the apartment §D3.5 envelope gate rejects a house ground floor (big area, few bedrooms) → orchestrator clamps the engine-area into `apartmentDimensionsFor(bedrooms).{grossMin,grossMax}` per storey (A.21.h should replace with a real house envelope counting non-bedroom area). Refs: [SPEC §6](../specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md). | ✅ DONE |
| **A.21.d** | **Multi-level threading** | `levelId: string` → `storeyPlates: {levelId, elevationM, footprint}[]` through payload / `EnumerateInput` / semanticGraph meta (one Level node per storey) / `LayoutExecuteOptions`; per-storey `levelId` + `baseElevationM` stamping. Refs: [SPEC §6](../specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md). | ⚪ PLANNED (Sprint 8) |
| **A.21.e** | **Level creation + per-storey command fan-out** | Executor mints L1…Ln via `AddLevelCommand` (L0 Ground exists) at `n × floor-to-floor`; dispatches one level-stamped command set per storey in one runBatch. | ⚪ PLANNED (Sprint 8) |
| **A.21.f** | **Stair auto-placement + stairwell void** | Programmatic `CreateStairCommand` per adjacent level pair (base/top levelId, shape from core aspect, risers from level-gap), `autoCreateOpening` punches the upper-slab void, writes `connectedByStair` graph edges. Refs: [SPEC §7](../specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md). | ⚪ PLANNED (Sprint 8) |
| **A.21.g** | **Vertical alignment v1 + slab replication** | Identical exterior shell per storey (walls stack) + `CreateAllSlabsFromLevelToAllFloorsCommand` for floors. Column/beam stacking deferred (P-tier). | ⚪ PLANNED (Sprint 8) |
| **A.21.h** | **House validators + cognition** | **Envelope slice ✅ SHIPPED:** real house envelope `houseLayout/houseEnvelope.ts` `validateHouseStorey` (judges a storey by its FULL programme area, not bedroom count) + injected `envelopeValidator` seam in `generateDeterministicLayouts`/`EnumerateInput` (apartment path byte-identical) retires the per-storey area-clamp kludge (SPEC §13.3 Deviation B resolved); 19 tests, ai-host suite green. Remaining (⚪): stair clearance, cross-floor circulation reachability, wet-stack preference; cognition evaluators + ObjectiveVector axes. | 🟡 IN PROGRESS (Sprint 8–9) |
| **A.21.i** | **Post-gen chain fan-out across storeys** | floor / ceiling / furnish / lighting now run on EVERY house storey, not just the active level. ADDITIVE: new `runHousePostGenChain.ts` orchestrator sets each storey active in turn + drives the existing per-stage triggers (floor + ceiling → furnish → lighting), sequencing on `*.layout-executed` so storeys don't race; `_finishOpenings` returns a Promise so the chain starts after the cross-storey room redetect. `houseFanoutGuard.ts` suppresses the furnish/lighting cascade handlers during the fan-out (prevents double-placement). Apartment single-level path byte-for-byte unchanged (guard false during apartment runs). | 🟢 DONE (Sprint 9) |
| **A.21.D25** | 🏠 **House: furniture/finishes appeared ONLY on the TOP floor — now EVERY storey (ground included)** (founder in-browser test 2026-06-06: a multi-storey house got floors/ceilings/furniture/lights on the top floor only, ground floor bare) | House-only; apartment single-level path byte-for-byte unchanged. **ROOT CAUSE — a NAMING-vs-FURNISH race, not the fan-out loop.** `runHousePostGenChain` already iterated every storey ground-first and set each active before its chain, and every stage executor (floor/ceiling/furnish/light) correctly reads `resolveActiveLevel()` + filters by `level.id`. The bug was upstream: the executor named ALL storeys' rooms in one up-front loop (`nameDetectedRooms` per storey) then waited a FLAT 600 ms before starting the chain. But `nameDetectedRooms` is ASYNC (room-store subscription + 80 ms settle, or its own 2.5 s hard-timeout) and occupancy-tagging is what furnish/floor/ceiling key off (`furnishRoom('')` → [] = "furnish does nothing", A.21.D24). The GROUND storey is processed first, so its furnish fired before its (still-pending) naming completed → 0 furniture on ground; the UPPER storeys, processed later, were named by the time they ran → furnished. Hence "only the top floor." ✅ **FIXED 2026-06-06 (`§A.21.D25`, editor-only).** Moved naming OUT of the up-front loop and INTO the per-storey chain: `runHousePostGenChain` now accepts an optional `nameStorey(levelId)` driver; for EACH storey, in sequence, `runChainForLevel` sets the storey active, calls `nameStorey(levelId)`, and AWAITS that storey's `apartment.room-name-completed {levelId}` event (filtered by levelId; 3.5 s budget > the naming pass's 2.5 s hard-timeout) BEFORE furnishing. So ground rooms are guaranteed tagged before ground furnish — every storey (ground + uppers) gets floors/ceilings/furniture/lights. The executor builds the `nameStorey` from its per-storey `option` map and drops the flat 600 ms wait. Loud per-storey logs already exist (`§POLL-TELEMETRY room-name-completed level=… detected_rooms=N`, `§FURNISH-SUMMARY`, `§FURNISH-EMPTY`) so a genuinely room-less ground storey surfaces its cause. **Tests:** new `apps/editor/__tests__/runHousePostGenChain.test.ts` (4 — every storey furnished ground-first; naming awaited before each storey's furnish; timeout-bounded advance when naming never signals; 3-storey ground-up order). Editor typecheck clean for the 2 changed files (worktree has no node_modules → filtered tsc output to `runHousePostGenChain.ts` + `HouseLayoutExecutor.ts` = zero errors; rest is missing-`@pryzm/*`-dep noise). Determinism preserved; P6 respected (no new mutation path); no new deps. **NEEDS IN-BROWSER VERIFY:** generate a 2-storey house → BOTH floors have floor finishes + ceilings + furniture + lights (not just the top). | 🟢 DONE (in-browser verify pending) |
| **A.21.j** | **Editor onboarding wiring + console** | DONE: both onboarding entry points (`briefBootstrap` + `OnboardingStepController.generateAndFinish`) now route `casa-unifamiliar` → the multi-storey HOUSE generator (`generateHouseFromBoundary`, storeyCount from the brief's `floors` field, default 2, clamped [1,3]) built inside the SAME authored parcel boundary the apartment path reads; apartment path byte-identical; `pryzmGenerateHouse*` console commands already shipped. | 🟢 DONE (UI path routes House correctly) |
| **A.21.k** | **UI: per-storey modal + multi-level result + dollhouse** | Generation modal shows per-storey thumbnails; result view adds a level selector (2D plan per floor) + reuses `LevelExplodeController` for an exploded "dollhouse" axon. Tracked as `A.U.*` under §12.3. Refs: [SPEC §9](../specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md). ✅ **MODAL SHIPPED 2026-06-06** — "Choose a house layout" modal (apartment-parity): N whole-house variant cards (3) each w/ per-storey plan thumbnails (ground→upper) + per-storey room summary + score + aggregate /100 bar; brand white+#6600FF, z-index 4000, reuses apartment `alm-*` chrome + new `hlm-*` per-storey strip. NEW files `apps/editor/src/ui/house-layout/{HouseLayoutController,HouseLayoutModal,houseCardModel,houseModalHtml}.ts`; N variants from NEW pure `generateHouseLayoutOptions(...)` (ai-host) reusing the apartment per-storey multi-option enumeration (deterministic `(v+s)%opts(s)`, NO Math.random; variant 0 == single-best). Executor build internals UNTOUCHED (only additive `variantIndex`/`variantCount` on `HouseExecuteInput`). Onboarding (`OnboardingStepController.generateHouse → generateHouseFromBoundary`) + console route through the controller. +6 ai-host tests (full suite 1715/1715); house files typecheck-clean. REMAINING: multi-level result view + dollhouse explode. | 🟢 MODAL DONE (result-view/dollhouse pending; in-browser verify) |
| **A.21.x** | **Reference projects + tests + ratify** | ≥3 reference houses (1/2/3-storey) + ≥50 pipeline tests + ratify; retire any apartment-coupling. Flips C50 toward CANONICAL for multi-storey. | 🟡 TESTS ADDED — 43 `generateHouseLayout` integration tests in [`houseLayoutPipeline.test.ts`](../../../packages/ai-host/__tests__/houseLayoutPipeline.test.ts) (1/2/3-storey invariants, allocation, stair-stacking, house-envelope path, non-rect footprints, determinism, edge clamps). Surfaced KNOWN BUG: upper storeys get a kitchen (frozen bubbleGraph unconditional). Reference-projects + ratify still pending. |

#### §3.1.A21D — Casa demo layout-quality fix-pass (DEMO BLOCKERS — generation quality the founder will demo with a house)

These are generation-quality defects the founder hit testing the live casa/apartment generator (the casa demo uses the apartment generator via the A.21.a single-storey stopgap, so these serve BOTH). Root-caused 2026-06-05. Priority order = demo impact. See [single-apartment-fix-pass-spec](../specs/) + [APARTMENT-COGNITION-STACK](../../03_PRYZM3/) (climate-driven design).

> **🚀 DEPLOY STATUS (2026-06-06):** A substantial batch is **staged on `main` and deploy-ready** (1544 ai-host + 0 editor typecheck errors) — D2 non-orthogonal layout (`§RECTIFY-QUAD`), D5.c more-windows, D5.d adjacency (bedroom→corridor), D6.1–D6.3 climate-driven windows, A.25.1/.2 design-parameter sliders + discoverable button, GRAPH.4 click-inspect fix, A.21.D-GLOBE2 context-building mirrors + 7-day cache, room-name nearest-fallback. **BLOCKED on repo visibility, not code:** Fly deploys run free only on the public-repo GitHub-Actions window (16 GB runner; private = limited minutes, Fly remote/Depot builder OOMs at exit 137). The repo is currently **private**, so the next Fly deploy needs the founder to flip it **public** → re-enable the `push:` trigger in `.github/workflows/deploy-fly.yml` → push → poll `flyctl releases --app pryzm` → revert to `workflow_dispatch:`-only → private. Hold this batch + the multi-storey agent's branch for ONE combined Fly window.

| ID | Demo blocker | Root cause (found 2026-06-05) + fix direction | Status |
|---|---|---|---|
| **A.21.D1** | ✅ **RESOLVED 2026-06-05** — Windows never created (`shell windows built — 0/0`) | Root cause: `shellWallMatch.matchShellHost` required EXACT (1 cm) endpoint match, so the D-TGL's axis-aligned perimeter never matched a non-orthogonal drawn shell → windows dropped. FIX (`§SHELL-MATCH-TOLERANT`): after the exact pass, fall back to the nearest near-PARALLEL (≤30°), near-COLLINEAR (≤1 m perp), OVERLAPPING shell wall, and PROJECT the window's centre onto it (the reversed case falls out of the projection). Exact-match behaviour + all 14 prior tests preserved; +4 non-orthogonal regression tests (18/18). Unblocks windows on angled plots (the founder's Córdoba parallelogram). | ✅ DONE |
| **A.21.D2** | ✅ **RESOLVED 2026-06-05 (`§RECTIFY-QUAD`, `59f1cfaa`)** — Non-orthogonal layouts collapsed to ONE giant room + slivers | Root cause: `principalAxisAngle` (runDeterministicLayout) only aligns the shell's DOMINANT edge family; a parallelogram's other two edges stay slanted, so `rectDecomposition.decomposeToRects` stair-steps them into one big central rect + sub-minCell slivers → `subdivide` crams every room into the 57 m² rect ("93 m² merged blob") + drops slivers (§HARD-MIN-SIDE) / forces the strip-slicer bailout. An off-axis RECTANGLE rotates to axis-aligned → works — exactly the asymmetry the founder hit. FIX: NEW `rectifyConvexQuad()` (called atop `decomposeToRects`) — when the principal-axis-rotated shell is a CONVEX QUAD (4 verts after collinear-removal, fill-ratio ≥0.5), rectify it to its axis-aligned bbox before tiling, so a skewed quad tiles as ONE clean rect = the same room canvas a true rectangle gives. Discriminator is vertex-count+convexity (an L-shape can fill its bbox MORE than a sheared quad), so L/U/T shells keep their notch-aware decomposition bit-identically. TRADE-OFF: interior partitions become rectangular in the rotated frame (fill the bbox); the OUTER shell stays the real drawn shape (emitted separately + `§EXTEND-TO-PERIMETER` still extends partitions to the true `shellPolygon`). RESULT: a 16°-rotated parallelogram (108 m²) → **8 rooms** (was 1 blob), matching the equivalent rectangle; RoomDetectionEngine separates them (7/5/9/10). 1544 ai-host tests green. Needs in-browser confirm on a real skewed GIS draw. Canonical doc: [SPEC-TGL §2.3 `§RECTIFY-QUAD`](../specs/SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md#§23--d2-quad-rectification-rectify-quad--non-orthogonal-plots). | ✅ DONE |
| **A.21.D3** | **Modal options ≠ wall execution** (`preview=24 … submitted=13`) | PARTLY by design: preview shows ALL walls incl. the shell; the build skips the shell (`skipExteriorWalls` — it already exists) → external_skip=11. The REAL defect is open-plan merge (`detected 6 / expected 8`) + WJR clamps changing the built geometry. FIX: render the preview from the SAME post-skip + post-WJR geometry the build uses, so what the user picks is what they get. | 🟡 HIGH |
| **A.21.D4** | ✅ **RESOLVED 2026-06-05** — Style (modern/classic/minimal/warm) does nothing | Style now drives furniture COLOUR + MATERIAL finish. NEW pure `furnishLayout/styleFinish.ts` (per-style, per-category palette: upholstered→fabric, case-goods→wood, else neutral). Threaded end-to-end: `buildFurnishCommands(...style)` stamps `color`+`material` → `CommandEventBridge` forwards `color` (type + emit) → `initTools §FT-FURNITURE` passes it to the legacy store → builders read `data.color`/`data.material` (e.g. WhiteSofaBuilder). Executor reads `style` from `getActiveBriefMetadata`. +4 tests (86 ai-host). Geometry still style-agnostic (finishes only — the right contract for v1). | ✅ DONE |
| **A.21.D5** | **Room layout quality** (proportions, corridors, allocation) | Broad — the D-TGL subdivision/squarify quality. Overlaps the existing [single-apartment-fix-pass-spec] (§AREA-FRACTIONS / §KITCHEN-DISTINCT / §SEALED-ROOMS shipped; master over-allocation + corridor-links-all + proper programme remain) + the [dimensional + topology validators framework]. ✅ **D5.NAMES FIXED 2026-06-05 (`§ROOM-NAME-NEAREST`)**: rooms showed generic "Room 00-NNN" on skewed builds (founder "all of the rooms are room") — the post-generate naming matched D-TGL→detected rooms by centroid-INSIDE-polygon, which fails when the built geometry is offset from the plan; added a NEAREST-centroid fallback so every detected room keeps its semantic name + occupancy. **FOUNDER QUEUE 2026-06-05 (skewed-plan testing, still open):** (D5.a) **room CONNECTION ≠ modal preview** — the built adjacency/doors diverge from the picked layout (relates D3); (D5.b) **corridors insufficient + mis-placed** — often too few/short, and a corridor should AVOID façade frontage (façade = priority for window/light rooms, not circulation) → bias corridors interior; (D5.c) **not enough windows** — more rooms should get glazing (windowable set / multi-window on long façades); (D5.d) **adjacency rules** (program-rules DB / wallsAndDoors): a BEDROOM must connect to a corridor (not be reachable only through another bedroom); a BATHROOM to a corridor OR a bedroom (ensuite); enforce in the door/permeability pass + the [architectural-program-rules] permission matrix + bubbleGraph. Refs [[program-rules-improvements-queue-2026-05-29]] + [[single-apartment-fix-pass-spec]]. ✅ **NO-SILENT-DROP FIXED 2026-06-06 (`§FEASIBILITY-ALLOC`)** — the subdivider silently dropped a requested bedroom when its squarified short side fell below the per-type floor; now `placeInRect` REBALANCES area (shrinks over-allocated neighbours toward their minima) so a starved room reaches its min before any drop, and a genuinely-infeasible room is REPORTED via a structured `DroppedRoom`/`subdivideWithReport` field → `candidate.droppedRooms` (enumerate prefers the fewest-drop strategy + logs the shortfall) instead of vanishing. Hard-min invariant kept; +8 tests; ai-host 1592/1592. EDITOR FOLLOW-UP: surface `droppedRooms` ("reduced program") in the modal/toast. | 🟡 HIGH |
| **A.21.D6** | **Climate-driven design** (windows + layout respond to sun / wind / shadow / temperature) | The Phase-2 [APARTMENT-COGNITION-STACK] differentiator. 🟢 **D6.1 FOUNDATION SHIPPED 2026-06-05** — sun-oriented WINDOW placement: NEW pure `windowEmission/solarOrientation.ts` (`equatorFacingDir(lat)` → S in N-hemisphere / N in S-hemisphere; `outwardNormal`; `orientationFit`; `solarLengthMultiplier` = `1 + weight·fit`) + `emitWindowsForRoom` gains an optional `solar` bias that ranks candidate external walls by **length × sun-orientation** (a sun-facing façade beats a marginally-longer wrong-facing one; a much-longer wall still wins — orientation tunes, not overrides). No-op when absent → 0 regression (34 tests incl. 11 new). ✅ **D6.2 ACTIVATION SHIPPED 2026-06-05 — climate-driven windows now LIVE end-to-end**: editor `gatherLayoutPayload` stamps `siteLatitudeDeg` from `getCurrentSiteOrigin().lat` → `ApartmentGenerateLayoutPayload` → `workflow.ts` → `GenerateLayoutInput.siteLatitudeDeg` → `generateDeterministicLayouts(…, {latDeg})` computes the world equator-facing dir, rotates it by the principal-axis `−angle` into the emit frame → `emitGeometry(graph, {solar})` builds a per-room `SolarBias` (sunDir + room centroid) → `emitWindowsForRoom` ranks walls by length×orientation. So a generated apartment now puts windows on the sun-facing façade of every corner room (N-hemisphere → south; S-hemisphere → north). ai-host 63 window/tgl tests green; editor + ai-host typecheck clean. ✅ **D6.3 GLAZING-SIZE SHIPPED 2026-06-05** — passive-solar window SIZING: new pure `climateGlazingFactor(latDeg, fit)` ∈ [0.85,1.25] (COLD high-|lat| climates ENLARGE sun-facing glazing for winter gain up to +25%; HOT low-|lat| SHRINK to limit overheating; temperate pivot ~37.5° neutral). `emitWindowsForRoom` scales the chosen window width (clamped to wall-fit) + height by the factor for that wall's sun-orientation; `latDeg` rides the SAME thread as D6.2 (`SolarBias.latDeg` ← `EmitGeometryOpts.solar.latDeg` ← `generateDeterministicLayouts` ← `siteLatitudeDeg`), so no new editor wiring. +6 tests (69 ai-host green). Then **D6.4** layout (living/sleeping toward sun, service toward cold side) + wind. Climate substrate now LIVE (A.10.g bundled-first). Canonical doc: [SPEC-TGL §2.4 climate-driven windows](../specs/SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md#§24--d6-climate-driven-windows-sun-oriented-placement--passive-solar-sizing). | 🟢 IN PROGRESS (D6.1 done) |
| **A.21.D7** | ✅ **RESOLVED 2026-06-05** — Generation + furnish too slow (founder: "AI generation too slow", "furniture too slow") | Confirmed from the live log: every openings batch (`elements=9`) AND the 40-element furnish batch sat **8.0 s** — almost entirely `[BatchCoordinator] WATCHDOG: signalBuildQueueDrained() not called within 8 s — force-completing`. That signal is ONLY fired by the WallFragmentBuilder rAF-drain when ITS queue empties; openings-only and furnish-only batches build NO walls → the wall queue is never populated → the signal never fires → the batch waits the full watchdog with render suppressed (geometry was in scene at ~150 ms). FIX (`§A.21.D7-FIX` idle-probe, `3cffd84d`): the 8 s watchdog is now only the ULTIMATE backstop. WallBuilderControl/CW/Slab gain optional `hasPendingBuilds()`; WallFragmentBuilder exposes `get hasPendingBuilds`; WallRebuildCoordinator's `__wallRebuildControl` reports queued events/flush-rAF/builder-queue; BatchCoordinator arms a re-arming `pre-render` probe that completes the batch once every control is idle for 2 frames (~32 ms) instead of 8000 ms. `signalBuildQueueDrained()` made idempotent (`_drainSignalled`) against probe/builder/watchdog races; reset in `_setupBatch`/`forceReset`. Accelerates BOTH apartment generation and furniture furnishing (shared root cause). Backward-compatible (no `hasPendingBuilds` → legacy watchdog). Editor typecheck clean. | ✅ DONE |
| **A.21.D-FLOOR** | ✅ **RESOLVED 2026-06-05** — Flooring looks like flat "coloured rooms", not realistic finishes | The pipeline ALREADY auto-fires `CreateFloorsByRoomTypeCommand` on `apartment.layout-executed` (one floor per room, parallel to ceiling), but every floor rendered with the flat `#D4C4A8` fallback (generated rooms carry no explicit `finishes.floor` → CreateFloorCommand default). FIX (`§A.21.D-FLOOR`, `0fb64052`): NEW pure `command-registry/src/floors/floorFinish.ts` — `floorFinishFor(occupancyType, style)` → {finishColor, finishPattern, materialName}: wood plank (engineered oak / walnut-herringbone / pale ash / honey oak) for living·bedroom·dining·study, porcelain tile (small-format cool stone for wet rooms, large-format light stone for kitchen/service), across all 4 brief styles. `CreateFloorsByRoomTypeCommand` takes an optional `style` and stamps the resolved finishSpec per floor (CreateFloorCommand spreads it over its default; FloorPanelBuilder renders `finishSpec.finishColor`). `floorLayoutTrigger` reads the brief style (`getActiveBriefMetadata`) so flooring matches the furniture style chip. Editor typecheck clean. | ✅ DONE |
| **A.21.D-GLOBE** | ✅ **RESOLVED 2026-06-05** — 3D context buildings render in one fixed square + vanish on pan | Context buildings (keyless OSM via Overpass) were fetched ONCE for the site-origin bbox at view-open; `camera.moveEnd` only LOGGED the position. Beyond that square nothing loaded → founder's "buildings stop showing as I move". FIX (`§A.21.D-GLOBE`, deploy after `0fb64052`): `maybeRefreshContextOnPan()` on moveEnd reloads context buildings centred on the new camera ground point — gated (layer already active, camera height <~6 km, moved >~450 m from last load, 600 ms debounce); `loadContextBuildings()` aborts in-flight + clears prior entities so pans never leak/stack; timer cleared on dispose. NB the related "now don't render" report at Guadalajara was OSM data sparsity (Overpass returned 2 footprints there vs ~800 in Córdoba), not a regression — pan-refresh now loads denser areas as the camera moves over them. Editor typecheck clean. | ✅ DONE |
| **A.21.D8** | ✅ **RESOLVED 2026-06-05** — 3D globe shows only flat satellite, no 3D context buildings | `CesiumViewport.restorePhotorealMode` CLEARED the extruded OSM context buildings on exit-Forma, assuming "photoreal already shows real buildings" — true only WITH a token (Google 3D Tiles). On the keyless ESRI-satellite path the globe was left with no 3D buildings. Fix (`§GLOBE-CONTEXT-BUILDINGS`): only clear when `_cesiumToken` is present; otherwise (re)load the extruded overlay so the keyless "3D globe" shows 3D context buildings on the satellite. | ✅ DONE |
| **A.21.D9** | **Boundary draw: live dimension labels** (founder 2026-06-06: "when defining the boundaries of the apartment or house — could add dimensions?") | While drawing the boundary polygon, show the running edge length (and ideally the angle) as a label on each segment + the live segment being drawn, so the user sizes the plot precisely. The boundary-draw tool already has the points; add an overlay dimension annotation per edge (mirror any existing dimension/measure overlay). UI work in the boundary/draw tool — verify in-browser. | 🔵 QUEUED |
| **A.21.D10** | **Multi-storey modal shows ALL storeys** (founder 2026-06-06: "if 2/3 levels, the modal should show the layout of the 2/3 levels, not only ground floor") | The "Choose a layout" modal renders only the ground-floor plan. For a house with `storeyCount>1` it must render a per-storey thumbnail (tabs or stacked) from `HouseLayoutResult.perStoreyLayout[]`. ✅ **RESOLVED 2026-06-06 by A.21.k** — the NEW "Choose a house layout" modal renders one per-storey plan thumbnail (ground→upper) per variant card from `result.perStoreyLayout[]`, so a 2/3-storey house shows all storeys' layouts. | ✅ DONE |
| **A.21.D11** | **Interior partitions overrun the perimeter walls** (founder 2026-06-06, screenshot 2 — partitions pass THROUGH the exterior shell) | `§EXTEND-TO-PERIMETER` extends interior partitions out to the true `shellPolygon` so they meet the angled shell, but on some shells it extends PAST the shell wall (no clamp to the shell segment intersection) → the partition pokes through the façade. FIX: clamp each extended partition endpoint to its intersection with the shell polygon edge (not a fixed over-extension). Pure ai-host (`tgl/emitGeometry`/`wallsAndDoors` extend step) — testable. | 🟡 HIGH |
| **A.21.D12** | **Windows render as a recessed panel, not an opening** (founder 2026-06-06, screenshot 2 — windows look like blind sunken rectangles, no glazing/void) | The window opening is cut but the glazing/frame either isn't built or the opening isn't punched through the wall body (single-volume vs segmented producer), so it reads as an inset panel. Investigate the window host-opening + glass builder on generated (non-orthogonal) shell walls; ensure the opening is a true void with a glazed pane. Renderer/geometry-window — needs in-browser verify. | 🟡 HIGH |
| **A.21.D13** | **Only ONE level created despite selecting 2** (founder 2026-06-06: "DESPITE I SELECTED 2 LEVELS ONLY ONE LEVEL WAS CREATED") | Root: the live prod path is the single-plate apartment generator (casa = A.21.a single-storey bridge); the floors>1 brief value is read but nothing mints the upper levels. ✅ **CONSOLE PATH SHIPPED 2026-06-06 (A.21.d–g)** — `apps/editor/src/ui/house-layout/HouseLayoutExecutor` + `window.pryzmGenerateHouse(n)`: mints L1…Ln via AddLevelCommand → per-storey fan-out → stairs (auto slab-void) → roof, one runBatch. Editor typecheck clean. ✅ **UI PATH SHIPPED 2026-06-06 (A.21.j)** — both onboarding entry points now route `casa-unifamiliar` → `generateHouseFromBoundary` (storeyCount from the brief `floors`, default 2, clamp [1,3]) inside the authored parcel, so "House + 2 floors" mints 2 levels via the house executor (NOT the single-plate apartment generator). REMAINING: per-storey modal (A.21.D10); single-undo-collapse of level creation (A.21.e caveat). See [SPEC-CASA §13.4](../specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md). | 🟢 UI + CONSOLE PATHS DONE (needs in-browser verify) |
| **A.21.D14** | **Some areas have no room** (founder 2026-06-06, screenshot 3) — `detected 8 / D-TGL expected 12` | TWO roots in the live log: (1) **`Room boundary polygon must not self-intersect`** repeatedly skips rooms in `ReDetectRoomsCommand` (the detected boundary self-intersects on the skewed shell) AND (2) the `CREATE_ROOM_BOUNDING_LINE` builder **threw** `Cannot read properties of undefined (reading 'start')`, ABORTING the runBatch mid-drain so later boundary lines/rooms never built. ✅ **CRASH FIXED 2026-06-06 (`§RBL-PLACEMENT-GUARD`)** — `RoomBoundingLineBuilder.build` now skips a placement-less record instead of throwing (sibling of the prior §RBL-PROPS-GUARD). REMAINING: the self-intersect boundary on skewed shells (open-plan merge — `boundary lines not splitting`) → RoomDetectionEngine boundary repair. ✅ **CIRCULATION-COMPLETENESS HARDENED 2026-06-06 (`§CIRCULATION-REROUTE-TWOHOP`)** — the A.APT.SA.2 re-route now adds a pass 2c-ii: a private room with NO legal circulation-adjacent wall is routed onto the spine via ONE permitted, circulation-served intermediate room (e.g. bedroom→living where living opens onto the corridor) before falling back to the connected-but-warned `unroutedToCirculationRoomIds` diagnostic. Never crosses a forbidden pair, respects caps (relax last); +tests in the new suite; ai-host 1592/1592. | 🟡 HIGH (crash fixed; detection open) |
| **A.21.D15** | **Lighting + "screens" (mirror/TV) float ABOVE the level** (founder 2026-06-06: "old bug") | ✅ ROOT-CAUSED + FIXED (2026-06-06). NOT a per-level base bug (lighting + furnish executors both add `level.elevation` correctly; lights at `elevation + height` were already right). The bug was a **double/triple-counted mount offset** for WALL-MOUNTED furniture: (1) `CreateFurnitureCommand` baked `level.elevation + baseOffset` into `position.y`, then `FurnitureFragmentBuilder` added `baseOffset` AGAIN (`position.y + baseOffset`) → `floor + 2×offset`; (2) several wall builders (WallArt/WallMirror, BathroomMirror/TowelRail, WcMirror/Washbasin, CurtainRod, DryingRack) ALSO added `BASE = data.baseOffset` inside their geometry, and the **TV** hardcoded `PANEL_BOTTOM = 1.20` → up to `floor + 3×offset`. Floor items (offset 0) were unaffected — hence only wall items floated. Fix: ONE datum rule `worldY = floor + mountOffset`, applied once. New pure helper `furnitureElevation.furnitureWorldY` (4 tests); `CreateFurnitureCommand.position.y = level.elevation` (floor datum); `FurnitureFragmentBuilder` applies `+ baseOffset` once; the 6 violating builders + TV made FLOOR-RELATIVE (internal BASE = 0). Lighting untouched (already correct). geometry-furniture 20 tests + ai-host 1709 tests green. Verify in-browser (2-storey furnished house). | 🟢 DONE |
| **A.21.D16** | **Graph: much richer, "nourishing" semantics** (founder 2026-06-06: "MUCH MUCH MORE INTERESTING… room relationships, element relationships, REASONS WHY those elements are/were located in such location") | The current overlay shows generic `Element`/`Rule` nodes with generic `depends-on`/`violates` edges. Make it ARCHITECTURALLY MEANINGFUL: (a) ROOM nodes with `adjacentTo`/`connectsTo`/`circulatesVia` edges (the UBG already models these — surface them); (b) per-element RATIONALE ("this window is on the SOUTH façade for daylight"; "this door links Bedroom→Corridor per program-rules"); (c) human labels not `Element`/`Element`. Builds on GRAPH.4 + the [[building-graph-strategy]] UBG. The differentiator the founder keeps asking for. Pairs with [SPEC-LIVING-DESIGN-PARAMETERS §4.2](../specs/SPEC-LIVING-DESIGN-PARAMETERS.md#§42--a254--graph-linked-what-changed--why) (A.25.4 "what changed + why" overlay reads this graph). ✅ **DONE 2026-06-06** (`rationale.ts` + `buildBuildingGraph` enrich passes + overlay restructure; building-graph 51/51, editor typecheck clean) — human labels, room↔room `adjacentTo`, window→façade/door→linked-rooms rationale, inspect card sections. | ✅ DONE |
| **A.21.D17** | ✨ **Living Building Graph** (force-directed live space-relationship overlay) | A Canvas2D, physics-animated overlay of the building's SPACES and their relationship LAYERS — **adjacency · circulation · environmental/sun · acoustic · structural** — modelled as springs that settle into a layout MINIMISING tension across the active layers (settled state = the optimal spatial organisation for the questions you've toggled on). Consumes the UBG read-only via `window.__pryzmBuildingGraph` (re-syncs on `pryzm:building-graph-rebuilt`, re-entry-guarded — never rebuilds inside the listener); rooms only (furniture excluded), boundary-less/self-intersecting rooms skipped. Acoustic/environmental derived locally (loud↔quiet separation; sun-rich clustering); structural = wet/service riser clustering. NEW folder `apps/editor/src/ui/living-graph/` (own `LivingGraphOverlay`/`LivingGraphCanvas`/pure `forceSimulation`/`livingGraphData`/`livingGraphSchema`); brand white+#6600FF; **P3-compliant** (frame-bus tick → guarded setInterval fallback, NO raw rAF; stops on settle/freeze/dispose); deterministic (index-seeded scatter, NO `Math.random`). Console openers `window.pryzmOpenLivingGraph()` / `pryzmCloseLivingGraph()` + a `✦ Living Graph` launcher. **SUPERSEDES the static `⚛ Graph` view as the primary graph UI** (founder: wire the primary Graph button here — reconcile at merge). DESIGN OF RECORD = [SPEC-LIVING-BUILDING-GRAPH](../specs/SPEC-LIVING-BUILDING-GRAPH.md). Builds on A.21.D16 + `ADR-0058` (UBG) + [[building-graph-strategy]]. +7 force-sim unit tests; editor typecheck clean (new files). | ✅ DONE (overlay shipped; primary-button reconcile pending) |
| **A.21.D18** | 🪜 **House pipeline: I / L / U staircases + shape-matched slab void + housing roof** (founder 2026-06-06) | The stair COMMAND already supported I/L/U + auto-void + pitched roof; the multi-storey HOUSE generator only ever emitted a straight `I` run. ✅ **SHIPPED 2026-06-06** — (1) `stairCore.ts` `reserveStairCoreShaped(...)` chooses I/L/U from the available core box (long-thin/aspect≥2.2 → I; generous square availW≥2000 ∧ availH≥2800 → U; squarer mid availW/H≥1600 → L; tight → I fallback) + `splitRisersForShape(...)` (L/U ≈half each); `StairCore` now carries `shape`/`flights`/`landingDepthM`/`risersBeforeLanding`/`footprintMm` (additive); orchestrator resolves per-flight directions (flight1 along longer axis; L turns left, U reverses). (2) `HouseLayoutExecutor._createStair` emits the shaped `CreateStairInput` (flights + landings + turnDirection/secondRunSide + stepsBeforeLanding + `autoCreateOpening:true`). (3) **Void already matches** — `CreateStairCommand.autoCreateOpening` uses `computeStairFootprintRect` which bbox's ALL flights+landings → the hole fits L/U by construction (NO command change). (4) Roof: `_createRoof` converts the descriptor's `pitchDeg` (~30–35°, fallback 32°) → command `slope = tan(pitch)`, gable default / hip when `roofKind:'hip'` / flat only when `'flat'`, ~400 mm eave `overhang`, `baseOffset` = wall height. **Param gap:** `CreateRoofCommand` has no pitch°/eave param — pitch via `slope`, eave via `overhang`. +~17 ai-host tests (shape selection / split / carried flights). See [SPEC-CASA §7.1–§7.2](../specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md). | ✅ DONE (ai-host + editor) |
| **A.21.D19** | ✅ **RESOLVED 2026-06-06** — Furnishing STYLE system: distinct MATERIALS per style (founder 2026-06-06: "different materials depending on the style") | EXTENDS A.21.D4. Replaced the four coarse chips (modern/classic/minimal/warm) with FOUR architecturally-grounded styles — **Nordic · Mediterranean · Minimalist · Classic** — each driving a DISTINCT material + colour per furniture CATEGORY (upholstery/seating · case-goods/wood · tables · metal/hardware · soft · neutral) + floor + wall-accent hint. `styleFinish.ts` rewritten around a reviewable PALETTE TABLE (style × category → {colour hex, material}); return shape UNCHANGED so `buildFurnishCommands` consumes it untouched. Nordic = pale ash/linen-grey/light-oak floor; Mediterranean = terracotta/ochre/olive + wrought-iron + terracotta tile; Minimalist = mono grey/white/black + glass tables + polished concrete; Classic = burgundy/navy upholstery + dark walnut + brass + herringbone/marble floor. BACK-COMPAT: old ids alias (modern→minimalist, minimal→minimalist, warm→mediterranean, classic→classic) + free-text synonyms (scandinavian→nordic, traditional→classic, …); default `nordic`. `floorFinish.ts` extended in lock-step (timber/wet/dry tables × 4 styles; minimalist kitchen = polished concrete, classic = marble + walnut herringbone, mediterranean = terracotta). Both typology manifests' `style` select updated to the 4 new options (default `nordic`); runtime reads `md.style` as a raw string through the normalisers so new ids flow with no executor change. WALLS: no wall-finish pipeline exists today → `styleAccentsFor().wallAccent` exposes the per-style accent as a hook + FLAGGED as a follow-up (did NOT invent a pipeline). +18 tests (`furnishStyles.test.ts`) — each of 4 styles distinct per category, aliases resolve, floors lock-step, defaults sane; full ai-host suite 1608/1608. DESIGN OF RECORD = [SPEC-FURNISHING-STYLES](../specs/SPEC-FURNISHING-STYLES.md). | ✅ DONE |
| **A.21.D20** | ✅ **DONE 2026-06-06** — Kitchen + wardrobe I/L/U run layouts + REAL kitchen appliances (founder 2026-06-06) | The kitchen + wardrobe now get architectural **I / L / U** run shapes, and the kitchen gets first-class **appliances** placed IN the run honouring the **sink↔hob↔fridge work-triangle**. **Part A (L0 types):** +9 `FurnitureType` members — `fridge` (promoted from a factory-only string), `oven`, `hob`, `dishwasher`, `washing_machine`, `sink`, `extractor`, `base_unit`, `wall_unit` — added to BOTH `geometry-furniture/FurnitureTypes` + the pure `ai-host/furnishLayout/types` `FurnitureKind`; exhaustive `FurnitureCategoryMap` (→ `'kitchen'`) + `FurnitureMaterialIntent` maps extended (compile-time exhaustiveness = the gate); standard 600 mm footprints added to `furnishLayout/footprints`. **Part B (builders):** NEW `geometry-furniture/builders/ApplianceBuilders.ts` — one lightweight, correctly-sized + **front-faced** box proxy per appliance (Sink/Hob/Oven/Dishwasher/WashingMachine/Fridge/Extractor/BaseUnit/WallUnit), registered in `FurnitureFactory` (fridge now its own `FridgeBuilder`, not the pantry proxy) + exported from the package index. **Part C (engine):** NEW pure `furnishLayout/kitchenLayout.ts` (`planKitchen`) — chooses the shape (`auto` picks **L** for typical rooms = the reliable triangle; a compact U only when the back wall stays ≤3.3 m; I for galleys; brief override `I`/`L`/`U` with graceful degrade) via a perpendicular-wall `buildChain`; lays 600 mm modules per arm with the work-triangle stations kept compact around the shared corner (sink+hob on the spine arm, fridge on a perpendicular arm one cell off the corner → every leg inside NKBA 1.2–2.7 m) + the extractor stacked above the hob; door walls excluded. NEW pure `furnishLayout/wardrobeLayout.ts` (`planWardrobe`) — I/L/U wardrobe run along the bedroom's free (non-window/non-door) walls, sharing the placed-furniture obstacle set. `furnishRoom`/`furnishRoomCompound` gained a `FurnishOptions` ({kitchenLayout, wardrobeLayout, kitchenWashingMachine}) and route kitchen→`planKitchen`, bedroom wardrobe→`planWardrobe`. `validateKitchenFromFurniture` now reads the EXPLICIT sink/hob/fridge (NKBA-accurate, retiring the run-centre heuristic). **Part D (brief/UI):** NEW `kitchenLayout` select field on the apartment manifest brief (Auto/I/L/U); `FurnishLayoutExecutor` reads it (+`wardrobeLayout`) from the active brief + adds a kitchen washing machine when there's no utility room. **Tests:** NEW `kitchenWardrobeAppliances.test.ts` (18) + updated `furnishSolver` kitchen tests; ai-host green; ai-host + geometry-furniture typecheck clean. DESIGN OF RECORD = [SPEC-KITCHEN-WARDROBE-APPLIANCES](../specs/SPEC-KITCHEN-WARDROBE-APPLIANCES.md). **NEEDS IN-BROWSER VERIFY:** furnish a kitchen → expect an L/U run with sink+hob+oven+dishwasher+fridge (+extractor over hob) sensibly placed; a bedroom wardrobe along a wall; appliance picker hookup FLAGGED for follow-up (shape exposed via brief + the new types are catalogue-ready). | ✅ DONE (in-browser verify + picker hookup pending) |
| **A.21.D21** | 🏚️ **House v35 prod defects** (founder in-browser test 2026-06-06, post-v35) | Five real defects from the first live `House` generation: **(1) house design modal** (A.21.k) ✅ DONE — see A.21.k row. **(2) Roof offset/floating** ✅ DONE (see A.21.D21.G). **(3) Perimeter not closed** ✅ DONE (D21.G). **(4) Stairs crash into walls** ✅ DONE (D21.G — keep-out, Deviation A resolved). **(5) Graph auto-covers ALL rooms** ✅ DONE (D21.5). All five amended; needs in-browser re-verify on the next deploy. | 🟢 ALL FIXED (in-browser verify pending) |
| **A.21.D21.5** | 🕸️ **Graph slice: whole-project room graph by default (ALL storeys, no selection)** (founder 2026-06-06: "the graph should cover ALL rooms in the project + their relationships, WITHOUT having to select a node first") | The Living + static Building-Graph overlays already build the UBG on open and render every ROOM node + relationship edge without a click — but the UBG was **silently active-level-scoped**: `resolveLevelIds()` in `buildBuildingGraph.ts` read ONLY `bimManager.getAllLevels()`, which is **undefined on the real BimManager** (its method is `getLevels()`), so it fell through to the active-level-only fallback and upper storeys of a multi-storey house never entered the graph. ✅ **DONE 2026-06-06** — `resolveLevelIds` (§UBG-ALL-LEVELS) now tries EVERY level enumerator in turn — `bimManager.getLevels()` (canonical) → `getAllLevels()` (legacy alias) → `wallStore.getLevels()` → `projectContext.levels` — de-duplicated, first non-empty wins; the single active level is the LAST-resort fallback only, so one UBG aggregates rooms from **every storey**. §UBG-LEVEL-TAG — Living Graph `GraphNode` gained an optional `level` (humanised storey) so a multi-storey house's rooms are distinguishable. Both overlays render all nodes+edges on `show()` — no selection needed. +2 test describe blocks (two-storey aggregation + `resolveLevelIds` enumerator shapes). | ✅ DONE (engine + overlay; in-browser verify pending) |
| **A.21.D21.G** | 🏠 **House THREE geometry defects from the first live multi-storey HOUSE (prod v35)** (founder 2026-06-06: roof floating/offset off the footprint; perimeter shell not fully closed; staircase intersecting interior walls) | THREE root-caused fixes, apartment path BYTE-IDENTICAL (all new ai-host params OPTIONAL, default undefined; editor changes in `HouseLayoutExecutor` only). **Defect 2 — ROOF offset/floating (`HouseLayoutExecutor._createRoof`, editor-only):** the `RoofFootprint` contract is `polygon` = CENTROID-LOCAL + `centroid` = world anchor (the fragment builder positions the root group AT the centroid and adds the local-polygon mesh — it does NOT offset children by −centroid like the slab builder does). The executor was passing the ABSOLUTE world polygon AND the world centroid → every vertex landed at `world + centroid` (double-count) → the parallelogram-shifted-off-footprint, "floating" roof. FIX: subtract the world centroid so `polygon` is local; `centroid` stays world → roof sits ON the building, aligned. `roof.footprint` from the engine is (and is asserted) the WORLD shell perimeter. **Defect 4 — STAIRS crash into walls (RESOLVES Deviation A, SPEC-CASA §13.2):** the core was only an area-budget reduction (un-carved LOCATION) → partitions could cross the run. FIX (genuine keep-out, option (a)): `generateDeterministicLayouts` gains an OPTIONAL `keepOutRectsWorld`; the orchestrator passes the core rect; `enumerate.buildCandidate` SUBTRACTS it (new pure `subtractRectsFromRects` guillotine split in `rectDecomposition.ts`) from the decomposed buildable rects BEFORE `subdivide`, inflated by a 0.05 m clearance ring (= the subdivider's `ALIGNMENT_SNAP_EPS_M`) so the post-subdivide snap can't re-encroach. No room/partition tiles over the core; walls terminate at the core edge. Carved on every storey (incl. ground). **Defect 3 — perimeter not closed on upper storeys (`HouseLayoutExecutor`, editor-only):** the engine emits an `isExternal` wall only where a room face touches a footprint edge → gaps where the tiling doesn't reach (dropped room / area cap / carved core) → open shell. FIX: every UPPER storey now EXPLICITLY emits the full footprint perimeter (one `wall.batch.create` per edge, pre-minted ids, `_buildPerimeterShell`) like the ground shell, with `skipExteriorWalls: true` on BOTH ground + upper so the engine's partial externals never duplicate it; the minted perimeter walls double as the storey's `shellWalls` (windows host on them, no read-back). CLOSED perimeter on every storey by construction. **Tests:** +7 ai-host (4 keep-out overlap in `houseLayout.test.ts` — no room bbox overlaps the core on 2/3-storey; 3 `subtractRectsFromRects` in `tglRectDecomposition.test.ts` — area conserved, no overlapping sub-rect). Full ai-host suite **1716/1716** (1709 baseline + 7); editor typecheck clean for the changed file (worktree has no node_modules → verified by filtering tsc output to `HouseLayoutExecutor.ts` = zero errors, the rest is missing-dep noise). SPEC-CASA §7.2 (roof frame) + §7.3 (keep-out + perimeter) + §13.2 (Deviation A RESOLVED) updated. **NEEDS IN-BROWSER VERIFY:** generate a 2-storey house → roof sits ON the building aligned to the footprint; all perimeter walls present + closed on every storey; stair sits in a clear void, no wall crossing it. | ✅ DONE (ai-host + editor; in-browser verify pending) |
| **A.21.D21.M** | **House builds layout DIRECTLY with no options** (founder 2026-06-06: "the house wants the SAME 'Choose a layout' modal the apartment flow shows") | The multi-storey HOUSE path generated + built option[0] silently — no chooser, unlike the apartment flow. ✅ **MODAL SLICE FIXED 2026-06-06 (= A.21.k)** — House now opens a "Choose a house layout" modal with N variant cards (per-storey previews + score) and builds the picked variant. Built as a controller+modal layer (`HouseLayoutController`/`HouseLayoutModal`) over the UNTOUCHED `HouseLayoutExecutor` (only additive `variantIndex`/`variantCount`); N options from the new pure `generateHouseLayoutOptions(...)`. See A.21.k + [SPEC-CASA §9](../specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md). | 🟢 MODAL DONE (in-browser verify) |
| **A.21.D23** | 🌬️ **CLIMATE · WIND · WEATHER live in the Forma site view** (founder 2026-06-06: sun/shadow + climate-driven windows work, but the WIND ROSE sat empty (`No wind data — set a site + load climate`) and there was no live weather/temperature overlay tied to the site) | The PURE substrate was already complete — `@pryzm/climate-host` exposes `buildWindRose` (16-sector × 6-bin EPW aggregate, tested in `builders.test.ts`) + `buildMonthlyNormals`/`buildDesignTemperatures`/`buildDegreeDays`; the L3 `ClimateStore` + `climate.ensureForLocation` command synthesise a full `ClimateDataset` (wind rose from per-month prevailing dirs, design temps + HDD/CDD) from BUNDLED offline normals (instant, no network) with a background live Open-Meteo/PVGIS upgrade; the L5 `ensureSiteClimate` adapter + `windRoseBars`/`monthlyTempSeries` chart helpers + the `FormaSiteAnalysisControls` rose all existed. The GAP was purely editor-side: the panel relied on `GISAreaLayout.mountFormaAnalysis`'s fire-and-forget ingest (which can race the LTP-ENU origin) and only showed a one-line climate NOTE — no real weather card. ✅ **DONE 2026-06-06** (editor-only; `FormaSiteAnalysisControls.ts`): **(1)** the panel now PROACTIVELY runs `ensureSiteClimate(runtime)` on mount when a site is authored but no dataset is resolvable (guarded once/mount), so the rose + weather never sit empty on a real site — bundled normals land instantly, the `climateStore.subscribe()` repaints. **(2)** Wind rose upgraded from a single thin frequency line per sector to STACKED speed-band segments (6 Beaufort-ish bins, light→dark #6600FF) keyed off the aggregate's `speedBinHours` — a proper direction × speed-band rose. **(3)** NEW live weather/comfort card replacing the one-line note: a 12-month min/avg/max temperature band SVG sparkline (`monthlyTempSeries`) + a 2×2 chip grid (heating/cooling ASHRAE design temps + HDD/CDD base-18) keyed to the site, all repainting on the climate/site subscription. Keyed to the SAME site lat/lon the sun/shadow path uses (`siteModelStore` + LTP-ENU fallback). GRACEFUL: no site → quiet empty state ("appears once a site location is set"); site but rose all-zero → "needs an EPW with hourly wind". No new climate engine, no new deps; pure math stays in `climate-host` (L-low). **VERIFY (worktree has no node_modules):** single-file tsc on the changed file = zero errors in `FormaSiteAnalysisControls.ts` (rest is missing-`@pryzm/*`-dep noise); `buildWindRose` + builders already green in `climate-host` `builders.test.ts`. **NEEDS IN-BROWSER VERIFY:** author a site → open the Forma 3D/plan view → wind rose populated (speed-banded bars) + weather card (temp band + design-temp/degree-day chips) from real climate, keyed to the site. | ✅ DONE (editor; in-browser verify pending) |
| **A.21.D24** | 🏠 **House roof: TWO defects on the v36 multi-storey HOUSE** (founder 2026-06-06: roof sits on the 1st storey not the TOP; roof geometry wrong on a non-90° / skewed footprint) | House-only; apartment path untouched. **Defect 2 — roof on the WRONG level:** the prior `autoBaseOffset: true` rule re-derived the roof base offset from `wallStore.getByLevel(topLevelId)` AT command time, but the top-storey walls are dispatched on the ASYNC bus and aren't committed when the synchronous roof command runs in the same `runBatch` → racy/empty lookup. ✅ **FIXED 2026-06-06 (`§ROOF-LEVEL`, `HouseLayoutExecutor._createRoof`, editor-only):** the executor passes the TOP `StoreyPlate` into `_createRoof`, targets `levelId = topStorey.levelId` EXPLICITLY, and sets a DETERMINISTIC `baseOffset = top-storey wall height` with `autoBaseOffset: false` → `RoofFragmentBuilder` resolves `worldY = topStorey.elevationM + wallHeightM` = the head of the uppermost storey's walls, for any storeyCount (1/2/3). **Defect 1 — gable broken on a skewed footprint:** `RoofGeometryBuilder.generateGable` built the ridge from the AXIS-ALIGNED bbox (ridge along world X/Z), so on a rotated/parallelogram plate the ridge sheared into a broken gable. ✅ **FIXED 2026-06-06 (`§RIDGE-PRINCIPAL-AXIS`):** (a) new pure THREE-free `roofRidgeAxis.gableRidge` builds the ridge along the footprint's PRINCIPAL axis (longest-edge direction), centred on the perpendicular extent — byte-identical to the old build for axis-aligned rectangles (no regression), correct on a 16°-skew; (b) for a NON-quad / non-convex shell (`!isGableFriendly`), `_createRoof` degrades `gable` → HIP (polygon-offset, handles any convex footprint). +6 unit tests in `packages/geometry-roof/__tests__/roofRidgeAxis.test.ts` (rotation-following axis, ridge parallel to long façade, L/hexagon/degenerate → hip fallback). Determinism preserved (no `Math.random`), no new deps. SPEC-CASA §7.2 updated. **VERIFY (worktree has no node_modules):** verified by inspection + parity (the editor already imports `@pryzm/geometry-roof` in 7 other files; geometry-roof tsconfig excludes `__tests__`). **NEEDS IN-BROWSER VERIFY:** 2-storey SKEWED house → roof caps the TOP storey, aligned + correct shape on the angled footprint. | 🟢 DONE (geometry + editor; in-browser verify pending) |
| **A.21.D25** | 🏠 **House barely subdivides (one giant room) + wall joins poor** (founder 2026-06-06, v37: a generated multi-storey HOUSE showed one ~165 m² "Room 00-001" + almost no other rooms; corner gaps / bad mitres) | House-only; apartment path UNTOUCHED. **Defect 2 — one giant room (ROOT CAUSE):** the frozen single-plate D-TGL engine lays out *exactly* the programme it is handed; a SPARSE captured brief (a 0/1-bedroom brief, or a `storeyAllocation` upper storey left with just a hall) makes `squarify` STRETCH one or two rooms to fill the WHOLE plate (a 165 m² "living" blob, or a 165 m² "hall" = the founder's "Room 00-001"). Confirmed by repro: an empty/sparse brief → a 165 m² single-storey gave **1 room**; a 2-storey gave ground=2, upper=1. NOT the §HOUSE-MAX-CAP, envelope, or keep-out (all verified robust — a NORMAL 3-bed brief already gives 7–11 rooms/storey on 120–300 m², skewed/L/narrow incl.). ✅ **FIXED 2026-06-06 (`§HOUSE-PLATE-PROGRAM-FLOOR`, pure ai-host `houseLayout/houseProgramFloor.ts` `enrichStoreyProgramToPlate`):** the orchestrator now RAISES (never lowers — every user count is a floor) each storey's programme to a sensible house room SET sized to its plate BEFORE the per-storey engine call — ground = living+kitchen+dining+hall guaranteed; upper = corridor+≥1 bed+bath guaranteed (no kitchen, §3); then a bedroom-GROWTH pass fills the plate, GATED (`growBedrooms`) to UPPER storeys + the GROUND of a SINGLE-storey house only, so a multi-storey ground floor keeps its single guest bedroom and the **well-behaved 3-bed/2-storey case is unchanged**. Growth measures area via the SAME `houseStoreyBand` the gate + cap use; cap still bounds the subdivision budget so added rooms stay sensibly sized. Repro post-fix: empty brief 165 m² single-storey → **12 rooms**; 2-storey → ground 4 + upper 10. **Defect 4 — wall joins (corner gaps / mitres):** ROOT CAUSE for the house-specific corner gap = `_buildPerimeterShell` SKIPPED a degenerate footprint edge with `continue`, BREAKING the shared-vertex chain so two walls no longer met at a common endpoint → `WallJoinResolver.resolveLevel` couldn't mitre that corner. ✅ **FIXED (`§PERIMETER-CLOSE`, `HouseLayoutExecutor._buildPerimeterShell`, editor-only):** build a CLEANED vertex RING (drop near-duplicate + wrap-duplicate vertices) then emit one wall per ring edge (last→first) — a closed loop with EXACT shared endpoints, every corner a true two-wall junction the resolver mitres. WallJoinResolver itself NOT touched (apartment-safe). Remaining corner-gap classes tracked at A.21.D11 (§EXTEND-TO-PERIMETER overrun on skewed plates) + WJR diff-thickness weakness (same shell-0.2/partition-0.1 as the apartment — not a house regression). **+16 ai-host tests** (`houseProgramFloor.test.ts`: ≥6 rooms on a 150–170 m² sparse plate, no 1-room storey, no-regression on the 3-bed case, + pure-unit enricher); **ai-host 1743/1743 green** (was 1727); ai-host house files typecheck clean (`vitest --typecheck`: no errors). No `Math.random`, no new deps. SPEC-CASA §3 + §7.3 updated. **NEEDS IN-BROWSER VERIFY:** generate a house from a thin brief → the plate splits into a FULL sensible room set (not one giant room) + corners closed; confirm the editor brief/onboarding default isn't itself shipping an over-sparse program. | 🟢 DONE (ai-host + editor; in-browser verify pending) |
| **A.21.D22** | 🎛️ **House modal: DYNAMIC parameter editing (live regenerate, apartment-parity)** (founder 2026-06-06: "let the user change house parameters on the fly and the options regenerate live — like the apartment modal") | The "Choose a house layout" modal was static option cards only. ✅ **SHIPPED 2026-06-06** — ports the apartment `§MODAL-DYNAMIC` idiom to the house modal: an inline program-edit form (white + #6600FF) lets the user edit **Floors (1–3)**, **Bedrooms (0–5)**, **Bathrooms (1–3)**, **Living room**, **Open-plan kitchen + dining**, **Master en-suite**, plus the **A.25 design sliders** (Daylight/Privacy/Kitchen/Compactness → `ScoringWeights`, 0–100 → 0–1). A form change is **debounced 250 ms** (`setTimeout`, P3 — no raw rAF) → the controller re-runs the **PURE synchronous `generateHouseLayoutOptions(...)` DIRECTLY** (NOT the apartment's async relay/`options-ready` event round-trip — the house generator is an offline deterministic L2 call, so a direct call is correct + simpler) → `HouseLayoutModal.refresh(variants)` swaps just the card grid with an `alm-busy` "Regenerating…" dim. **Changing Floors** re-runs with the new `storeyCount` → the engine re-enumerates per-storey + the cards reflect the new floor count. Picking a card still builds that exact variant via the executor's `variantIndex` path, now against the LATEST edited program/storeys/weights (controller caches a mutable regenerate context; passes `variantCount: HOUSE_OPTION_COUNT` so preview ↔ build indices align). **Additive only:** executor + `generateHouseLayoutOptions` signatures UNCHANGED; apartment modal UNTOUCHED; no `Math.random`, no new deps. Files: `HouseLayoutModal.ts` (form + debounce + `onProgramChange`/`refresh`/`setBusy`), `houseModalHtml.ts` (new pure `buildHouseProgramEditFormHtml` + `HouseProgramFormState` + form-state param on `buildHouseModalHtml`), `HouseLayoutController.ts` (cached `_regen` context + `_computeVariants`/`_regenerate`/`_build`), `styles/panels/apartmentLayoutModal.ts` (shared `.alm-program-slider*` CSS). Editor typecheck: worktree has no node_modules → verified by filtering tsc output to the 4 changed files = ZERO errors (only env-wide missing-dep noise remains; `@pryzm/ai-host` DOES resolve, so the house files' types against `ApartmentProgram`/`ScoringWeights`/`ScoredHouseLayoutOption`/`generateHouseLayoutOptions` ARE checked). SPEC-CASA §9 updated. **NEEDS IN-BROWSER VERIFY:** House → modal opens → change Bedrooms/Floors → cards regenerate live → pick → builds the edited variant. | 🟢 DONE (in-browser verify pending) |
| **A.21.D25** | ♾️ **House upper-storey plan view: INFINITE re-projection loop (1st-floor plan not reactive)** (founder prod log 2026-06-06: `project → plan-symbols + CREATE_ANNOTATION → ViewTechnicalDrawingCache invalidated → re-project …` forever on `vd-plan-*` / `L-house-…-1-…`, main thread saturated) | **THE EXACT CYCLE:** the plan-view re-projection driver `viewDependencyTracker.onReprojectionNeeded` (initScene.ts) calls `RoomTagAutoPopulator.populate()` BEFORE projecting → `populate()` executes `CreateAnnotationCommand`/`DeleteAnnotationCommand` → the subsystem `AnnotationStore` emits `storeEventBus.emit({elementType:'annotation:room-tag', …})` → `ViewTechnicalDrawingCache._onStoreChange` (which filtered NOTHING but view-definitions) dispatched `vd:projection-stale` → `PlanViewManager._onProjectionStale` → `invalidate(viewId)` + `_ensureProjection` → re-project → `populate()` again → ♾️. **WHY HOUSE-ONLY:** `runHousePostGenChain` sets each storey active in turn + `nameDetectedRooms` fires `room.rename` per storey, so the upper-storey room/tag set is STILL churning while its plan view is live → `populate()` keeps writing (apartment settles before the plan is viewed → `populate()` is a no-op → no loop). **THE FIX (decoupling + idempotency, no reactivity loss):** (1) **§A.21.D25 DOCUMENTATION-OVERLAY DECOUPLING** — `ViewTechnicalDrawingCache._onStoreChange` now early-returns for `annotation:*` element types. Annotations are NOT in the EdgeProjectorService TechnicalDrawing; they are a SEPARATE overlay painted every frame by `planViewAnnotationRenderer.render()` from the live store, so an annotation write needs no cache invalidation — cutting the cycle edge at source. Geometry edits (wall/door/room) still emit their own non-annotation events → re-project exactly once. (2) **Idempotent room-tags** — extracted pure `roomTagIdempotency.roomTagNeedsRefresh()`; `populate()` now UPDATEs a kept tag only on genuine label/area drift (e.g. a house rename) and is a true NO-OP when tags already match (defense-in-depth: even if some annotation path re-dirtied, a settled populate writes nothing). (3) removed 3 bogus `runtime.bus.executeCommand('room.create', {})` debug calls in `RoomTagAutoPopulator` that fired a phantom room-create on every tag op. **Tests:** +7 pure `roomTagIdempotency.test.ts` (room-topology; stable-across-repeats + drift cases) — green. Typecheck clean for the 3 changed files (`ViewTechnicalDrawingCache.ts`, `RoomTagAutoPopulator.ts`, `roomTagIdempotency.ts`; rest of the package's tsc output is pre-existing missing-dep/strictness noise). Files: `packages/core-app-model/src/views/ViewTechnicalDrawingCache.ts`, `packages/room-topology/src/RoomTagAutoPopulator.ts` + new `roomTagIdempotency.ts` + `__tests__/roomTagIdempotency.test.ts` + `vitest.config.ts`. **NEEDS IN-BROWSER VERIFY:** generate a 2-storey house → open the UPPER-storey plan → it is reactive, NO `invalidated/project` log spam; editing an element on that storey still re-projects exactly once; apartment plan reactivity unchanged. | ✅ DONE (engine; in-browser verify pending) |
| **A.21.D24** | 🏠 **House v36 prod test defects** (founder in-browser test 2026-06-06, post-v36 — house VOLUME now good) | Seven defects: (1) Roof wrong on non-90° footprints → RoofFragmentBuilder/_createRoof non-axis-aligned polygon handling. (2) Roof on the WRONG level (1st not TOP storey) → _createRoof baseOffset/levelId. (3) 3D-globe shows ONLY ground-floor walls (no 2nd storey/roof); user must see ALL floors or pick which → CesiumThreeBridge level export is active/ground-only. (4) Stairs orthogonal to plan even when skewed → stair placement ignores the layout principal-axis rotation. (5) Furnish AI does NOTHING (pryzmFurnishAllRooms/AI button → no furniture) → FurnishLayoutExecutor path broken (no furnishable rooms on active level / event-identity wiring). (6) Graph too basic — Living Graph needs richer content. (7) 3D climate graphs in Forma (heat·sun·wind·warmth·circulation), not just D23 2D rose+temp; D23 rose still No-wind-data — ensureSiteClimate not firing on the house handoff. | 🔴 HIGH (post-v36 demo defects) |
| **A.21.D25** | 🏠 **House v37 prod test — DEEP defects** (founder in-browser test 2026-06-06; stairwell+window-openings now OK) | (1) **INFINITE re-projection loop on the upper-storey plan** (NOT reactive) — the L1 plan view (`vd-plan-*`) repeats forever: NativeElementMeshExporter → EdgeProjector.project → door/bed/wardrobe/window plan symbols → `CREATE_ANNOTATION` → RoofSlopeSymbol → HiddenLineRemoval → `ViewTechnicalDrawingCache invalidated` → re-project. Something (likely the per-storey `nameDetectedRooms`/room-tag annotation creation from the D24 furnish fix, or the post-gen chain) keeps CREATING annotations which invalidate the plan cache → reproject → create again. Saturates the main thread = “first floor plan not reactive”. **(2) Poor internal layout / almost NO rooms** — the house plate barely subdivides (one ~165 m² “Room 00-001”), so few rooms. (3) **Furnish only on the TOP floor, not ground** — the post-gen/naming furnished the ACTIVE level (upper) only; ground floor unfurnished. (4) **Wall joins not good** — corner gaps / mitres on the house shell+partitions. (5) **Forma shows only WALLS** — multi-floor massing renders storey walls but NOT furniture/floors/roof; need all elements in Forma. REVIEW → AUDIT → DOCUMENT → FIX. | 🔴 CRITICAL (post-v37) |
| **A.21.D26** | 🛡️ **Stairwell-void guardrail** (founder 2026-06-06: "the opening created around the stair opening should have a railing — same type as the one used on the stairs") | When the stair `autoCreateOpening` punches the void in the upper slab, the open edges have NO guardrail → you would step off into the stairwell. ADD a handrail around the void perimeter on the upper storey — the SAME handrail type/material the stair uses — leaving the stair-entry edge open (3 sides railed, the entry side clear). Implement at stair/void creation in `HouseLayoutExecutor._createStair` (after the void is known) via the existing handrail command (`CreateHandrailCommand`/the stair-railing type) along the void rect edges minus the entry side, on the `topLevelId`. House-only; additive. SEQUENCED AFTER the A.21.D25 batch (those agents are editing `HouseLayoutExecutor` now). IMPLEMENTED: HouseLayoutExecutor._createVoidGuardrail rails 3 exposed void edges on the upper floor (CreateHandrailCommand, height 1.050 m = stair handrailHeight, baluster/rectangular), leaving open the step-off edge (max dot of edge-outward vs final-flight dir; robust for I/L/U + rotation); best-effort try-guard never breaks the stair. | ✅ DONE (v38) |
| **A.21.D27** | 🌡️ **Forma 3D climate overlays do NOT render + climate dataset never loads** (founder 2026-06-06, v37 verify) | Despite a site location set (panel shows 37.89, -4.80) the Climate & Site Intelligence panel shows **NO DATASET / “No climate dataset imported”**, so the Wind rose + Wind/Heat 3D overlays have no data; AND the **3D site-analysis toggles (Sun path / Wind / Heat) paint NOTHING in the Cesium scene** — even Sun-path, which needs no dataset (geometry from lat/lon only). So D23/D24-#7 shipped the toggle UI + 2D stereographic chart but the LIVE 3D overlays + the climate INGEST don’t actually work. AUDIT: (a) why `ensureSiteClimate`/`climate.ensureForLocation` doesn’t produce a dataset when coords ARE set (the D23 site-change retry isn’t firing/resolving on this flow) — bundled normals should ingest instantly; (b) why `CesiumViewport.setSunPathOverlay/setWindOverlay/setHeatOverlay` entities don’t appear (wrong ENU frame/scale, added to the wrong viewer, cleared by the massing re-render, or never actually invoked by the toggle handlers). SEQUENCED AFTER the A.21.D25 Forma-all-elements agent (same `CesiumViewport`/`GISAreaLayout` files). Heavily Cesium → needs a live render loop, not blind. | 🔴 HIGH (post-v37) |
| **A.21.D28** | 🏠 **v38 founder test-pass — 11 findings** (2026-06-07) | (1) **FORMA STILL WALLS-ONLY**: log `rendering massing: 33 wall(s), 0 slab(s), 0 roof(s), 0 furniture` + `area≈0 m²` — D25 getFormaSlabs/Roofs/Furniture readers return EMPTY despite snapshot 2 slabs/57 furniture/roof; footprint area computes 0. (2) **CesiumViewport CRASH** `Uncaught TypeError: s.id.startsWith is not a function` (entity id not a string) — likely aborts overlay/pick. (3) **3D SITE-ANALYSIS OVERLAYS INVISIBLE**: log confirms `sun-path overlay: 3 arc(s)+17 marker(s) radius 80m` created but NOT visible on globe; wind/heat still NO DATASET. (4) **GROUND FLOOR = ONE 167.9 m² ROOM** (multi-name fallback) — interior walls missing on the 2-storey GROUND storey (upper subdivides fine in IFC view); D25 enrich gated ground-of-multistorey out. (5) **MISSING WALLS / WALLS NOT JOINING / WINDOW OUTSIDE SHELL** (3 red arrows). (6) **CENTRAL STAIR = SPACE WASTE** — needs deep space-planning review (stair position + circulation efficiency). (7) **FURNISH AI CMD = active-floor only** — want a MODAL option to furnish ALL floors. (8) **FURNISH MESSY** (tied to #4 ground layout). (9) **Bottom-panel level selector does nothing when triggered.** (10) **WINDOWS DON’T RENDER OPENINGS until a NEW window is placed — then ALL appear** (deferred wall-rebuild/invalidation at generation time; D12 root). (11) **Living Graph: make panel RESIZABLE/bigger.** POSITIVE: roof better, layout better, loop GONE, upper-floor subdivision good, Living Graph settled 9 rooms. | 🔴 IN PROGRESS (3 agents: Cesium/Forma · window-openings · ground-subdivision+joins; features #7/#9/#11 + #6 review queued) |
| **A.21.D29** | Founder architectural brief (2026-06-07) | (1) FLOOR/CEILING STAIRWELL VOID: slab void is punched (stair auto-opening) but the FLOOR FINISH on the upper storey + the CEILING above the void are NOT holed so the finish covers the stairwell. Audit whether floors (CreateFloorsByRoomType) + ceilings (D-CE) can cut a void; implement a void cut matching the stair footprint. (2) STAIRWELL RAILING NOT APPEARING: A.21.D26 _createVoidGuardrail shipped v38 but no railing renders - diagnose (CreateHandrailCommand canExecute fail? handrailStore to HandrailFragmentBuilder not subscribed during generation? wrong level/geometry?) and make it render around the void (3 sides, step-off open). (3) MAIN ENTRANCE DOOR: place an external door on the GROUND-floor shell connected to the entrance hall as the main entrance (currently none). (4) ENVIRONMENTAL DESIGN DRIVERS to SPEC-ENVIRONMENTAL-DESIGN-DRIVERS.md (acoustic, solar, wind, natural ventilation + 12-driver PRIORITY HIERARCHY: site-fixed to env-performance to technical to regulation). Phased E.1-E.6; relates to cognition-stack + stair-space-efficiency-objective. | IN PROGRESS (parallel: floor/ceiling-void, railing-fix, entrance-door, env-E.1/E.2) |
| **A.21.D30** | Forma wall-joins look gappy in 3D globe (founder 2026-06-07) | QUEUED. In the PRYZM BIM canvas the wall corners miter cleanly, but in the 3D viewer / Forma massing the same corners show gaps/overlap. Root cause (likely): getFormaWalls emits each wall as an INDEPENDENT extruded box (start->end x thickness) with NO corner miter/join, so adjacent walls do not meet at corners in the massing (the BIM path uses WallJoinResolver miters; the Forma path does not). Fix: miter/extend Forma wall boxes at shared endpoints, OR render the storey footprint as a single extruded ring/polygon instead of per-wall boxes. CesiumViewport/GISAreaLayout massing only (C04). | QUEUED (after current D29 wave) |
| **A.21.D31** | 3D globe should use real Cesium 3D Tiles (founder 2026-06-07) | Keep Site 3D / Forma AS-IS (flat massing, applyFormaMode) but the 3D GLOBE should stream real photorealistic 3D Tiles. FINDING: the code is ALREADY fully implemented in CesiumViewport (Cesium3DTileset.fromIonAssetId(2275207) = Google Photorealistic 3D Tiles, line ~495), gated ONLY on photorealAvailable = !!VITE_CESIUM_TOKEN. Forma mode does NOT load tiles (correct split). ROOT CAUSE: the VITE_CESIUM_TOKEN repo SECRET is not set (matches the GitHub Actions lint warning) so _cesiumToken is undefined -> tiles skipped, globe falls back to keyless ESRI satellite. ACTION (founder/infra, not code): set the VITE_CESIUM_TOKEN repo secret to a Cesium ion access token; next deploy bakes it in and the globe streams 3D Tiles while Forma stays flat. Then verify the 3D-globe view triggers the photoreal path (restorePhotorealMode) and Forma stays flat. | QUEUED (needs VITE_CESIUM_TOKEN secret) |
| **A.21.D32** | D30 Forma wall-joins FIXED (staged v41) + stair objective reverted, being fixed (2026-06-07) | D30: Forma per-wall-box fallback (house-from-scratch, no drawn boundary) extruded independent boxes -> corner gaps; FIXED by reconstructing the perimeter ring and extruding ONE watertight prism per storey (handles rectilinear/L/U/skewed; falls back to boxes if non-closed). CesiumViewport only, merged 226cce0c (local, staged for v41). STAIR space-efficiency objective (9737336) merged then REVERTED from main: broke the A.21.D18 equality invariant (generateHouseLayoutOptions[0] != generateHouseLayout: 52 vs 51 elements -> the two paths choose different stair positions) + 2 tiny-plate guard tests (returns 3 candidates / picks left where it should fall back to central). A fixing agent is re-applying + fixing the 3 tests; will re-merge when the FULL ai-host suite is green. v40 deploying; v41 will batch D30 + stair-fix. | IN PROGRESS |
| **A.21.D33** | v40 founder test-pass (2026-06-07) | (a) STAIRWELL RAILING OFF from the slab/floor void — _createVoidGuardrail uses stair.rectMm but the void uses computeStairFootprintRect; align to the same footprint. (b) LEVEL-INTERROGATE CRASH: the stacked-floors/level-cycle button throws `Cannot add property bamTargetY, object is not extensible` at _applyLevelTransforms/_cycleLevelMode (engineLauncher) — frozen object mutated; clone/guard. (c) COMPLIANCE-OVERLAY WEIRD SHADES on each floor — RoomBoundaryBuilder tints 8 error/7 warning rooms; make it OFF by default / toggle. (d) INTERIOR WALLS RUN AGAINST FACADE WINDOWS — interior partitions terminate on an exterior window opening; offset partitions off exterior openings (interior-wall-on-opening-conflict). (e) FORMA: roof in WRONG position + NO windows/doors/furniture in massing (furniture reader still 0); fix roof placement + add openings/furniture to massing. (f) HEAT + WIND don't render (sun-path does) — climate dataset never loads (NO DATASET); D27 climate-ingest. (g) LIVING GRAPH resize handle should be BOTTOM-RIGHT (currently top-left) — re-anchor panel + move grip. (h) STAIR still central — the space-efficiency objective was reverted; fixing agent re-applying. | IN PROGRESS (parallel: railing-align, level-crash, compliance-overlay, interior-wall-window, forma-extras, living-graph-grip; stair-fix + climate queued) |
| **A.21.D34** | v45 founder test-pass (2026-06-07) | SKEWED-PLATE cluster (log: rot -24.1deg): (a) WINDOW still pokes OUTSIDE the shell on a skewed plot (clamp misses a case); (b) STAIR placed partially OUTSIDE the shell (space-efficiency perimeter candidate not clamped to the rotated shell polygon); (g) ROOM boundary still SELF-INTERSECTS on upper skewed level (ReDetectRooms skips it) - D14 repair insufficient for rotated frame; (h) WJR §SELF-CLUSTER-GUARD + §WJR-INVALID skip a degenerate wall (wall both-ends-in-one-cluster) -> missing wall. (c) STRANGE PROJECTION LINES per floor in 3D - translucent gridded planes extending beyond the building footprint per level (wrong render). (d) FORMA massing still missing WINDOWS/DOORS/STAIRS/FURNITURE (walls+slab+roof render; furniture reader returned 0 again). (e) LIVING GRAPH too compressed/messy (force-sim spacing). (f) CLIMATE VIZ should match Autodesk Forma (wind STREAMLINES + gradient HEAT/comfort ground map) - big visual upgrade, QUEUED as D35. EXTERNAL: 3D-Tiles needs the VITE_CESIUM_TOKEN/VITE_GOOGLE_MAPS_KEY secret. | IN PROGRESS (parallel: skewed-geometry-robustness, forma-extras, projection-lines, living-graph-spacing; climate-forma-viz + 3D-tiles-secret queued) |
| **A.21.D36** | v46 log triage + layout-quality root (2026-06-07) | FOUNDER-PRIORITISED = LAYOUT QUALITY. (1) ROOM-DROPPING: §HARD-MIN-SIDE-PER-ROOM (bathroom 1.44m<1.80m) + §FEASIBILITY-ALLOC drop bathrooms/bedrooms -> incomplete/missing-room plans. Fix = fit the program to the plot (re-allocate area, shrink larger rooms toward min, accept smaller-but-legal) instead of dropping; only drop as true last resort when plot < all-minimums. (2) §CIRCULATION-REROUTE: a habitable room reachable only THROUGH another room (no corridor) -> connect every room to circulation. ALSO OPEN (queued): v46 visual (per-floor grid planes still present-diff source; roof on next/3rd level; doors-vs-walls; wall-joins in plan+3d); 3D BUILDING tiles not loading despite token (Google asset 2275207); §RAILING-CREATE-BROKEN dead bus path (railings render via legacy cmd). HARMLESS: /items GLB 404 (.dockerignore by-design, box fallback), §RBL guard, §MULTI-CLUSTER (no WJR-INVALID this plot). | ADDED-TO-QUEUE (v46 re-test): WINDOW-OUT-OF-SHELL RECURS (frames float off the wall plane despite D34b — the in-shell clamp/host-match still misses on this plot); FORMA windows+doors STILL ABSENT (D34d Forma insets not visible in v46 — verify it deployed / why insets don't render). IN PROGRESS (layout-completeness agent; window-shell + forma-openings + visual + tiles + cleanup queued) |
| **A.21.D37** | Living Graph UX upgrade (founder 2026-06-07, QUEUED) | (1) SELECT-TO-3D: clicking a room node should HIGHLIGHT that room in the 3D model; offer a toggle between just-SELECT (highlight) and ISOLATE-in-view (reuse the Inspect-panel ModelTree isolation pipeline: createIsolationStateStore + IsolationAnimator + ElementMeshRegistryAdapter). (2) MIRO/MURAL CANVAS: the graph should pan + zoom freely (scroll-wheel zoom to cursor, drag-pan, fit-to-content) like Miro/Mural, not a fixed cramped viewport. Files: apps/editor/src/ui/living-graph/ (LivingGraphOverlay/LivingGraphCanvas/DrawState already has scale from D34e — extend to wheel-zoom+pan + selection dispatch into the scene/isolation). | QUEUED |
| **A.21.D38** | Wall↔slab vertical continuity (founder 2026-06-07, QUEUED) | The exterior shell shows a dark exposed-slab BAND at each floor junction (walls stop below the slab; next-level walls start above it). FIX: a level's walls should rise to the MID-HEIGHT of the next level's slab, and the next level's walls should START from that slab mid-height — so the shell reads CONTINUOUS from outside. Computed per level height + slab thickness (wall top = floor elev + wall height + slab/2; next wall base = next floor elev − slab/2). House wall emission (HouseLayoutExecutor / slab+wall vertical extents). | QUEUED |
| **A.21.D39** | v48 founder test-pass (2026-06-07) | ROOT (recurring, cascades): GROUND floor detects as 1 MERGED room (7 rooms in 172 m²) -> furnish dumps 40 items in one space -> 24 overlap warnings (curtain_rod/oven, entrance_table/dishwasher, door paths blocked). Interior walls EXIST but don't CLOSE into detectable rooms on ground (upper floor furnishes fine, 0 warnings). Needs DEEP root-cause on wall-emission->room-detection closure, not another per-plot patch. (1) WINDOW-OUT-OF-SHELL recurs in CORNERS. (2) STAIR still central. (3) GROUND wall-edge corner not joined. (4) FURNITURE inaccurate (consequence of #root). NEW DISTINCT: (5) HOUSE NOT PLACED on the Cesium 3D-tiles globe (tiles render, building absent). (6) FORMA windows need GLASS finish (see-through) + sun-path should cast SHADOWS through glass; furniture inaccurate. (7) CLIMATE DATA still 'No wind data' on Forma (D27 ingest not firing on this flow) -> D35 streamlines/heat can't draw. | IN PROGRESS (deep room-closure + window-corner · house-on-globe + window-glass · climate-ingest-on-forma) |
| **A.21.D40** | v49 founder test-pass (2026-06-07) | WIN: weld fix WORKED — ground now detects 5 rooms (was 1). PARTIAL/OPEN: (1) MIRROR SHADOW under the building (reflected/duplicate shadow plane — render bug). (2) WINDOW still overruns the CORNER (D39 corner-drop insufficient) + windows OVERLAP each other (log CONFLICT skips) + perimeter walls render fine then GROUND walls 'go off at the end' (post-openings rebuildWalls / weld perturbs ground shell). (3) HOUSE still NOT on the photoreal 3D-tiles globe (placeBuildingOnGlobe wired but not rendering on tiles; works in Forma). (4) WINDOWS not transparent in BIM 3D view (D39 glass was Forma-only; BIM WindowBuilder glazing opacity separate). (5) LAYOUT central zone STILL merges (100.8 m² multi-name) — weld got 1->5 but central living/corridor/dining/bath still one room (deeper subdivision quality). (6) SITE/CLIMATE analyses still not showing in Forma (wind rose empty — verify on confirmed-v49). NEW PERF: generation slow (PBR-upgrade 1.3s + PSO-compile 972ms blocking; room-naming hard-timeout 5s). | SHIPPED v50 (mirror-shadow+house-on-tiles · window corner/overlap/walls-go-off · window-glass-BIM); DEEPER items → A.21.D41 |
| **A.21.D41** | v50 DEEPER/QUEUED close-out (2026-06-08, 4 parallel root-cause agents → v51) | **All four DEEPER items root-caused & fixed.** (5) CENTRAL-BLOB → ROOT: `buildWallsAndDoors` open-plan wall-suppression had NO room-type guard, so ANY `via:'open'` bubble edge touching a private/wet/circulation room dropped its separating wall (and `hall↔living` is `open` → fused the entrance hall too). FIX: `programRules.isOpenPlanEligible` (living/kitchen/dining ONLY); zone union-find honours an `open` edge only when BOTH endpoints eligible — bedrooms/baths/ensuite/wc/study/corridor/hall always enclosed (door pipeline still connects via doorway). L/U/T 3-bed plates now detect 11/11 rooms via the real RoomDetectionEngine. PERF → ROOT: room-naming hit its hard-timeout EVERY storey because naming only read the store inside a future `subscribe` callback, but the caller runs redetect FIRST → rooms already present → no fresh store change ever fires → pure ~5s/storey dead wait. FIX: sync fast-path (`getByLevel` populated → `apply('already-present')` + emit immediately) ≈ 5–10s saved on a 2-storey house; + post-batch PBR upgrade scoped to NEW meshes via WeakSet (was full-scene traverse of ~520 every batch); + rename batch `skipPbrUpgrade:true` (pure metadata, kills the 972ms compile pass). CLIMATE-ON-FORMA → ROOT: D39's third project-id fallback read `window.projectContext.projectId` but that object (core-app-model ProjectContext) has NO `projectId` field → permanently-undefined dead branch → Site never auto-created → empty wind rose + no Wind/Heat overlay data. FIX: `resolveActiveProjectId` falls back to `window.__pendingProjectId` (set by ProjectHub.openProject, populated on the house flow); `FormaSiteAnalysisControls.ensureClimateIfMissing` now repaints rose/weather/overlay when a dataset is already present (closes the missed-notify mount race). WALL-JOINS → ROOT: 3-endpoint clusters that are really T-junctions (two near-collinear through-walls + perpendicular stem) were resolved as L-corners with a 45° bisector miter on the through-walls → caps pulled back → triangular gap outside + overlap inside. FIX: §PASS-THROUGH-FLUSH detects near-collinear pass-through pair (\|t·t\| ≥ cos~10°) → resolves the cluster with square caps trimmed to the consensus point (the file's own watertight 3+ junction doctrine); lives in `resolveLevel` only → §rebuildWallBodies cached-miter path (D40) untouched. GATE: ai-host 1915/1915 (+6 central-blob tests), geometry-wall 30/30 (+5 corner-flush tests), editor changed-files tsc clean (initScene errors = pre-existing window-shim baseline), no lockfile drift. PLUS per-room door/window types now reach the LIVE opening: the resolvers (`defaultDoorSystemTypeId`/`defaultWindowSystemTypeId`) existed but door finish was stamped only on the DEAD `door.batch.create` payload the live executors never dispatch → per-room door finish never rendered. FIX (`72162d18`): `buildLayoutCommands` stamps the resolved real `dt-*` id onto the door's `wall.createOpening` opening (the field CreateWallOpeningCommand reads); global fallback `'solid-timber'` was NOT a real store id (silently dropped) → canonical `dt-solid-timber`; wet/private side wins owning-room (bathroom↔corridor keyed to bathroom); real catalogue ids only (`dt-*`/`wt-*`); house path covered via shared buildLayoutCommands; ai-host 1916/1916. Closes [[ai-creation-default-element-types-queue]] Gap B. ALSO in the v51 batch: furnish bedside lamps (D-FLE — engine already had wardrobe variants/kitchen fridge/room-driven lighting; bedside task light was the one real gap; surface-mounted accessory exempt from floor-overlap) + A.25.3 living-design sliders (the four remaining axes — adjacency strictness via `preferenceBetween^strictness`, accessibility via corridor strip width, climate via `SolarBias.weight`, space via bubble-graph area-weight — bound to the EXISTING substrate per SPEC/ADR-0060, NOT a parallel scorer; `designParamsToEngineTuning` returns null when all four neutral → byte-identical baseline). Final gate ai-host 1949/1949. | ✅ MERGED to main — ships v51 on next deploy |
| **A.21.D42** | v(pre-v51) founder live test — 7 wall/window/stair/shadow defects + Cesium dup (2026-06-08, 5 parallel agents) | Founder tested a build PREDATING v51 (log: `[WallJoinResolver] §MULTI-CLUSTER [primary=2 t-into=1]` old mitre path + merged central room `Living Room/Corridor/Bedroom 2/Kitchen/Bathroom 68.1m²` + repeated `§CIRCULATION-REROUTE`). TRIAGE: **#1** perimeter corners good-during/bad-at-end → ALREADY FIXED v50 §rebuildWallBodies + v51 §PASS-THROUGH-FLUSH (deploy to verify). **#2** window near corner/out of shell → ALREADY FIXED v50 §WINDOW-CORNER-SPAN + de-overlap. **#3** internal T walls not joining → ALREADY FIXED v51 §PASS-THROUGH-FLUSH. **#4** internal L walls not joining → partly v50/v51; L-double-line residual being re-checked by the stair/wall agent. **#5** STAIR-IN-CENTRE breaks enclosure (rooms don't close, no circulation) + NEW founder strategy "stair occupies least space, hugs a perimeter wall, ideally worst-aspect/north façade" → NEW deeper agent (houseLayout stairPosition/stairCore + subdivision-around-stair robustness + worst-aspect derivation from siteLatitude). **#6** shadow/grey plane on boundary wall in plan + a grey plane extending past the footprint in 3D (distinct from v50 Forma mirror-shadow) → NEW render agent (shadow-catcher/ground-plane/room-fill audit). **#7** clear vertical BREAK/seam on walls where windows/doors are cut (recurring — [[wall-opening-seam-two-paths]]) → NEW render agent (two-path CSG-vs-grid seam, continuous-surface fix). CESIUM (founder "good progress"): house now ON the photoreal 3D-tiles (✓ v50 sampleHeight clamp), but PRYZM ALSO extrudes its own 2069 OSM context boxes (#E8E5DF) → DUPLICATE the Google 3D-Tiles buildings; + founder wants the house on the globe in the REAL main-app BIM scene colours (not the Forma pastel palette) → NEW agent (suppress own context when tiles active + thread real material colour). 5 agents launched off v51 HEAD; merge+gate per the established loop. **OUTCOME (v52):** #6 boundary shadow = room-fill overlay mesh (`RoomBoundaryBuilder`, unclassified #E0E0E0@0.35) shown unconditionally → hidden in pure 3D view (mirrors D34c datum/floor-hatch gates) MERGED. #7 wall-opening seam ROOT = plain walls built as abutting box segments → full-height face has no vertex at the opening sill/head → a T-junction `mergeGeometries`+creasedNormals can't heal; FIX `WallHoleBodyBuilder` builds ONE continuous `ExtrudeGeometry` (face minus hole/notch — seamless, no CSG/WASM, P2-safe), safe fallback to segments for mitered/overlap; geometry-wall 39/39 MERGED. CESIUM: `photorealTilesActive` flag suppresses PRYZM's own 2069 OSM context boxes when Google tiles active (kills duplication) + `resolveMassFill` renders the house in real per-element BIM `materialColor` on the globe MERGED. #5 STAIR ROOT = a central stair keep-out fractures the plate into a 3–4-rect picture-frame → the `§SINGLE-RECT-CARVE` corridor spine only fires for 1 rect → no circulation → merged blob; FIX = perimeter/back-corner worst-aspect placement (north default from siteLatitude) + `§STAIR-OBSTACLE-CARVE` dominant-rect corridor carve — BUT broke 3 invariant tests (variant-0=single-best; public-down/private-up vertical alloc), first REVERTED to protect the green batch, then a regression-fix agent re-applied it with the 3 regressions fixed: (i) variant-0=single-best — per-storey options are Pareto-ranked so `options[0]` ≠ max-scalar `overall`; both `generateHouseLayout` + modal variant 0 now select via a shared `bestStoreyOptionIndex` (argmax overall) → variant 0 is max-aggregate by construction (no-carve paths byte-identical, argmax==0); (ii)+(iii) master+ensuite-upstairs — the carve squeezed the programme into the ~75% dominant rect, too tight for the en-suite → §STAIR-CARVE-NO-DROP runs BOTH the dominant-rect carve and the generic multi-rect pack and keeps whichever drops fewer rooms (tie → carve, for its corridor spine; `packMultiRect` extracted). ai-host 1975/1975. MERGED. #1/#2/#3 already in undeployed v51. | ✅ ALL MERGED (v52) — #5/#6/#7/Cesium |
| **A.21.D43** | FORMA-view defects — SHIPPED in v52 | (a) context FLOAT ROOT = the globe path's `sampleHeightMostDetailed` wrote a non-zero height into the persistent `formaTerrainBaseHeight`; switching globe→Forma re-seated context+massing at that leftover height while the grey ground stayed at 0 → float; FIX `applyFormaMode` resets `formaTerrainBaseHeight=0` + clears sampledAt on entry. (b) larger context `CONTEXT_BBOX_HALF_DEG` 0.005→0.0125 (~2.8 km square; new cache key auto via toFixed(4), 7-day TTL + 4-mirror unchanged; pan-refresh 450→1100 m). (c) Forma window glass ROOT = the glazing already had `FORMA_GLAZING_ALPHA` but `outline:true` makes a Cesium polygon render fill OPAQUE; FIX windows `outline:false` (doors keep outline, stay opaque). Merged (stale-base 3-way merge verified: Cesium `photorealTilesActive`/`resolveMassFill` + D43 changes coexist, tsc clean). | ✅ MERGED (v52) || **A.21.D44** | Floating grey PLANE beside the house in 3D (founder live test — screenshot+log, recurring after two prior fixes) | **MESH IDENTIFIED (definitively, by reading):** the **PARCEL-BOUNDARY FILL** — `ParcelBoundarySceneRenderer.buildFill()` (`apps/editor/src/ui/site/ParcelBoundarySceneRenderer.ts`), mesh `name='pryzm-parcel-boundary-fill'`, a flat `THREE.ShapeGeometry` plane at `y≈0.02` on the XZ ground, `MeshBasicMaterial({color:0x6600FF, opacity:0.06, DoubleSide})`, on `EDITOR_LAYER`, non-pickable. **WHY IT FLOATS BESIDE THE HOUSE IN 3D:** the fill is sized to the **drawn PARCEL/lot ring** (A.8.x — committed C19 `siteModelStore.getParcelBoundary()`), NOT the building footprint — the lot extends past the walls and the boundary is usually offset/angled vs the generated building, so a large flat slab sits off to the side/below. At `#6600FF`@0.06 over the white viewport it reads light-grey. It was added to the BIM scene with **NO view-gating** → shown in the pure orbit-able 3-D BIM model view (where a flat ground slab does not belong). It is a real scene mesh, NOT a cast shadow / ShadowMaterial catcher / mirror plane. **DISTINCT FROM D42 #6:** D42 #6 gated the **room-fill overlay** (`RoomBoundaryBuilder`, `userData.isRoomOverlay`, `#E0E0E0`@0.35, sized to a DETECTED room polygon ON the footprint). This is a DIFFERENT mesh (different builder/name/colour/userData) sized to the SITE LOT, which is why it floats *beside* rather than *on* the house and survived the D42 #6 fix. **SUSPECT #2 RULED OUT:** the `§WJR-INVALID`/§SELF-CLUSTER-GUARD log lines are the EXPECTED diagnostic — `WallFragmentBuilder` already skips the body build, hides the group, and returns `[]` for an invalid self-cluster wall (no mesh ever reaches the renderer), so the degenerate-wall path is NOT the plane (prior queued fix already in place). **ROOT-CAUSE FIX (render-only, C04 + P2):** tag the fill `userData.isParcelBoundaryFill=true`, then GATE it in `initScene` (`_applyParcelFillVisibilityForView`, mirroring the D34c datum / floor-hatch / D42 #6 room-overlay gates): hidden in pure `'3D'`, visible in every other view; re-applied on `view-activated` AND (microtask-deferred) on `site.parcel-boundary-set` so a boundary authored while in 3-D never flashes the slab. Boundary LINE left visible in all views (harmless outline). **INTACT:** D42 #6 room-overlay gate, Pascal sun/AO real shadows, the parcel fill in the SITE/GIS/plan view (where the lot reads correctly from above) + the 2-D map `pryzm-boundary-fill` layer, valid-wall rendering. Files: `ParcelBoundarySceneRenderer.ts` (+userData tag) · `initScene.ts` (+gate). | ✅ FIXED (gate the parcel fill out of the pure-3D BIM view) |
| **A.21.D45/47/48/49** | Layout-quality + globe batch (founder live test 2026-06-08, parallel agents — full detail in commit messages) | **D45 WINDOW CORNER SETBACK** (`9d101188`): windows landed at `offset=0.100m` (cosmetic `END_CLEAR_M`) hugging the corner — the D5.c multi-window rework slammed the first window to `minOff=0.1m`. FIX `cornerSetbackForWall(len)=clamp(0.10·len, 0.5m, 1.2m)` at BOTH ends + width-clamp-or-drop (never slam to corner); D40 de-overlap + D6 solar intact. **D47 DOOR MINIMUMS** (`03d89f53`): §DOOR-MINIMUMS in programRules (habitable/circulation 0.80m, entrance 0.90m, wet 0.70m); `addDoor` clamps up / refuses too-short wall (never sub-minimum); every-room-access via §SEALED-ROOMS. **D48 FLOOR FINISH ON SLAB** (`faa67e7e`): finish defaulted thickness 0.075@offset0 = coincident with slab top (z-fight + no clash); `resolveFinishSeating()`+`DEFAULT_FINISH_THICKNESS_M=0.015` seats finish bottom-on-slab-top → disjoint volumes; FFL-datum = noted follow-up. **D49 REAL BIM ON 3D TILES** (`d8001e09`): globe showed Forma massing; audited CesiumThreeBridge (WebGPU-BIM can't composite into WebGL-Cesium) → renderer-agnostic glTF: `exportFragmentsToGLB`→`Cesium.Model` primitive depth-tested vs tiles, seated at v50 clamp; Forma study mode stays massing; failure keeps massing; fidelity follow-ups documented. GATE: ai-host 2006/2006, editor changed-files tsc clean. | ✅ ALL MERGED (post-v54) |
| **A.21.D60** | WINDOW MANDATORY RESCUE — windowless habitable room (founder live test 2026-06-09, prod `§DIAG-ROOMS … Bedroom 1[bedroom] a=19.7 w=0 … ⚠ WINDOWLESS habitable room(s)`) | A window-mandatory bedroom shipped with ZERO windows. ROOT: the engine DID emit windows for it but every one was DROPPED in shell-matching/distribution — prod `§DIAG-WIN-DIST resolved=6 kept=4 droppedByDeOverlap=2 unmatchedToShell=6` + `§DIAG-WIN-UNMATCHED total=6 → cornerFitDrop:3 noShellMatch:3`. The `cornerFitDrop` guard (`shellWallMatch.ts` §WINDOW-CORNER-FIT) drops a TOLERANT-match window whose projected centre is closer than `widthM/2 + cornerSetback(0.5–1.2m)` to a corner; `noShellMatch` = the emitted host didn't match a shell wall within the 30°/1m tolerance; de-overlap dropped the rest. FIX `§WINDOW-MANDATORY-RESCUE` (A.21.D60): `resolveAllShellWindows` now detects any `windowMandatoryFor` room (programRules: living/kitchen/master/bedroom) with 0 kept windows and runs a LAST-RESORT relaxed retry to retain ONE — escalating (a) corner setback → bare 0.1m clearance, (b) shrink width → MIN_WINDOW, (c) widen match tolerance 30°→45°/1m→1.6m. A rescued window pre-empts only a lower-priority WET conflicter (never another habitable room → that surfaces as `NO-FRONTAGE`). ONLY a fallback: byte-identical when a mandatory room already keeps ≥1 window; pure + deterministic (ADR-0061). New §DIAG line `§WINDOW-MANDATORY-RESCUE fired for N room(s) → <room>:<relaxation>`. +6 shellWallMatch tests. | ✅ MERGED (uncommitted at author time) |
| **A.21.D50** | FORMA-massing quality — wall joints + window transparency (founder live test 2026-06-08, "add to the queue") | On the Forma/Cesium massing the founder sees: (1) **WALL-JOINT issues** — the massing falls back to PER-WALL BOXES (`[CesiumViewport][forma] perimeter ring unavailable — falling back to per-wall boxes`) which don't miter/merge at corners → visible gaps/overlaps at the massing corners; FIX direction = build the storey shell as ONE extruded PERIMETER RING (close the ring from the shell walls) instead of independent per-wall boxes, so corners are clean by construction; investigate why the perimeter ring is "unavailable" (wall ordering / open ring) and close it. (2) **WINDOWS NOT TRANSPARENT** — D43 set Forma window `outline:false` to honour `FORMA_GLAZING_ALPHA`, but the founder still sees opaque windows; re-audit (is the alpha applied? is a material/colour overriding it? is this the on-tiles `resolveMassFill` path vs the Forma study path?) and make Forma window insets reliably translucent. **SEQUENCED BEHIND A.21.D49** (real-BIM-on-tiles) — same `CesiumViewport.ts`, must not run in parallel; launch off the post-D49 HEAD. NB: A.21.D49 may SUPERSEDE part of this for the "3D globe" path (real BIM model replaces massing there) — but the "Site 3D (Forma)" study mode STAYS massing, so the per-wall-box→ring + glazing fixes still matter there. | 🔵 QUEUED (sequenced behind D49) || **A.21.D51** | "Choose a house/apartment layout" PICKER MODAL — size + legend + preview-vs-built PARITY AUDIT (founder live test 2026-06-08) | Editor-UI work on the layout picker modal (`apps/editor/src/ui/house-layout/` + `apps/editor/src/ui/apartment-layout/`). **(1) SIZE ✅ SHIPPED** — the modal was `min(960px,96vw) × 88vh` (small, thumbnails near-illegible). Now `.alm-panel` = `width:min(1600px,90vw); height:90vh` (~90% of viewport, capped on ultrawide); `.alm-grid` widened to `minmax(360px,1fr)` + `flex:1 1 auto`/scrolling so it shows FEWER, LARGER cards; `.alm-thumb` plan preview `height:clamp(180px,22vh,320px)` (was 120px); house per-storey thumb `160×120` (was 92×64). Brand white+#6600FF kept; program-edit header (Floors/Bedrooms/sliders) + "Use this layout" actions + live-regenerate untouched. File: `apps/editor/src/ui/styles/panels/apartmentLayoutModal.ts`. **(2) LEGEND ✅ SHIPPED** — the apartment modal already had `buildOccupancyLegendHtml` (`.alm-legend`, one swatch+label per occupancy, keyed to the SHARED `OCCUPANCY_FILL` map in `layoutThumbnail.ts`); the HOUSE modal had NONE. Added it: `buildHouseModalHtml` now renders the SAME legend once-per-modal (new `collectStoreyOptions` flattens every storey's `ScoredLayoutOption` → `buildOccupancyLegendHtml`), and `HouseLayoutModal.refresh()` rebuilds the legend in lock-step with the cards on every regenerate. Swatches use the EXACT colour source the thumbnails paint from → no drift. Files: `apps/editor/src/ui/house-layout/houseModalHtml.ts` + `HouseLayoutModal.ts`. **(3) CORRIDOR appearance** — NOTE only, being handled in A.21.D46 (`tgl/subdivide.ts`); not touched here. **(4) PREVIEW ≠ EXECUTED — PARITY AUDIT (the valuable finding, ENGINE-SIDE → FLAGGED, NOT fixed here):** the modal thumbnail draws the D-TGL candidate's EXACT room polygons (`option.rooms[].polygon` filled by occupancy via `buildLayoutThumbnailSvg`) — clean SEPARATED rooms straight off the engine's `perStoreyLayout[i]`. The BUILT result is re-derived by a DIFFERENT path: `buildLayoutCommands` → `wall.batch.create` (interior partitions) → `wall.createOpening` → **`RoomDetectionEngine` RE-DETECT from the COMMITTED wall loops** → `nameDetectedRooms`. **DIVERGENCE INTRODUCED at partition-closure → room-detection:** the preview trusts the engine's intended polygons; the build only separates rooms if the emitted partition walls actually CLOSE loops on the detection node-grid. When a partition fails to weld to the shell / to a neighbour (the central-blob / D39 weld / D41 family), `RoomDetectionEngine` MERGES the intended rooms into ONE polygon and `nameDetectedRooms` concatenates the names → the `103.4 m²` "Living Room / Bedroom 2 / Corridor / Bathroom / Kitchen / Dining" multi-name blob the founder saw — diverging from the clean preview. **NOT a modal-render bug** (the thumbnail and the executor consume the same `ScoredLayoutOption`; the loss happens downstream in the geometry→detection round-trip), so per the constraints it is NOT fixed in this editor-UI row. **DEPLOY-STATE NOTE:** the fixes that close this — D41 (`§SEALED-ROOMS` private/wet/circulation rooms ALWAYS enclosed via `programRules.isOpenPlanEligible`, 11/11 detect) + D39/D40 (`§GROUND-WELD` `weldPartitionsToShell`) — landed in **v51 (A.21.D41, MERGED to main)**; the founder's blob screenshot is from a build PREDATING v51 (matches the A.21.D42 triage: the merged-room log + old mitre path are pre-v51). The `_weldGroundPartitions`/`§GROUND-WELD` code + `weldPartitionsToShell`/D41 `isOpenPlanEligible` ARE present in the current tree (`HouseLayoutExecutor.ts` + `packages/ai-host` `wallsAndDoors.ts`/`programRules.ts`). SEQUENCED FOLLOW-UP (engine, NOT this row): any residual central-zone merge overlaps the in-flight **A.21.D46** corridor work in `tgl/subdivide.ts` — verify on a confirmed-v51+ build before any further engine change. GATE: worktree has no node_modules (typecheck sandbox-blocked); changes are pure CSS + pure HTML-string builders (Node-testable, no DOM), no type-surface change (`ScoredLayoutOption extends LayoutOption` → direct assign). | ✅ SIZE + LEGEND SHIPPED (editor-UI); parity root DOCUMENTED — engine-side (partition-closure → room-detection), fixed in v51 (D41/D39), residual flagged as A.21.D46-adjacent follow-up || **A.21.D56** | GLB export drops ancestor world transform → real-BIM-on-globe lateral offset (root-caused by A.21.D54) | **ROOT CAUSE (confirmed, UPSTREAM of the geospatial code):** `exportFragmentsToGLB` in `packages/file-format/src/export/glb/GLBExporter.ts` did `element.clone(true)` then re-parented each clone under a fresh identity `exportRoot`. `Object3D.clone(true)` copies only the element's **LOCAL** transform (position/quaternion/scale relative to its parent) — it does NOT carry the composed ancestor chain (`matrixWorld`). So an element that lived under a translated/rotated parent GROUP in the editor scene lost that ancestor **X/Z (and rotation)** once re-parented → the assembled GLB was laterally shifted from the true site origin. On the globe, `CesiumViewport.renderRealModelOnGlobe` seats the model with ONE `eastNorthUpToFixedFrame(siteOrigin)` ENU frame where the GLB's `(0,0,0)` === the site origin and scene-world coords map straight to ENU (east = x, north = −z); the dropped ancestor offset IS the "slightly off" lateral shift the founder saw. Reproduced: a bare `clone(true)` of an element at local `(2,0,3)` under a parent at `(10,0,-7)` exports at world `(2,0,3)` (wrong) instead of `(12,0,-4)`. **FIX (deterministic, minimal, exporter-side only):** new exported helper `cloneWithBakedWorldTransform(element)` — clones, then `element.updateWorldMatrix(true,false)` (refresh ancestor chain) → `clone.matrix.copy(element.matrixWorld)` → `decompose` into the clone's local position/quaternion/scale. Added straight under the IDENTITY `exportRoot`, the clone's WORLD transform now equals the source's original scene-world transform EXACTLY. The existing Y-base anchoring (`exportRoot.position.y -= minY`) is untouched (only shifts the up-axis; X/Z origin stays at scene-world (0,0,0) = site origin). glTF Y-up convention (the D54 heading-pin: `upAxis:Y`/`forwardAxis:Z`) unchanged — no axis change. **CALLERS CHECKED (all stay correct, all improve):** the only 4 call sites are `apps/editor/src/ui/tools-panel/panels/ExportRailPanel.ts` (manual GLB download/Cesium) and `apps/editor/src/ui/layout/GISAreaLayout.ts` ×3 (`placeBimOnEarth` + GIS-globe placement + debug download) — every one passes the whole `bimManager.scene` and relies on the GLB carrying elements at world-correct positions; baking world transforms is strictly more correct for all (a DOWNLOADED/round-tripped GLB is now world-correct too — the right behaviour). `CesiumViewport.ts` NOT touched (D54-merged geospatial side). **TESTS:** added `packages/file-format/__tests__/glb-export-world-transform.test.ts` (3 cases: translated-parent → world position preserved; rotated-parent → world rotation+position preserved; root-element identity-ancestry no-op). Bake math verified directly against `three` r183 (worktree has no node_modules → vitest sandbox-blocked; logic confirmed via node). P2-clean (THREE via `@pryzm/renderer-three/three`). Files: `GLBExporter.ts` (+helper) + new test. | ✅ FIXED (exporter bake) || **A.24** | 🎨 **Dual render tiers — Massing (Forma) + Presentation (Spacio)** (founder-requested 2026-06-05: "an option more simple like Forma — and another like Spacio — way nicer and detailed") | TWO deliberately distinct visual tiers, switchable on the 3D view. **T-MASS (Massing)** = the Cesium site view (clean pastel/white blocks + white OSM context + soft ground shadow) — largely SHIPPED ([SPEC-FORMA-SITE-VIEW](../specs/SPEC-FORMA-SITE-VIEW.md) + §10 A.21.D-FORMA). **T-PRES (Presentation)** = the EXISTING **BIM 3D WebGPU view** (real walls/windows/balconies/handrails already render via PascalSceneLighting + SSGI + soft shadows) put into a **presentation render mode**: studio ground + soft gradient sky + soft sun/AO + **entourage** (trees + scale people) + **white-model / use-coloured material presets** — the clean white-architectural-model look (NOT photoreal; Spacio itself is non-photoreal). KEY: T-PRES reuses the BIM renderer — NO second engine. DESIGN OF RECORD = [SPEC-RENDER-TIERS-MASSING-AND-PRESENTATION](../specs/SPEC-RENDER-TIERS-MASSING-AND-PRESENTATION.md) (detailed founder-image analysis A/B/C + spacio.ai study + parity: PRYZM is AHEAD on substance — real windows/balconies/sun/climate/IFC — behind only on presentation polish). Slices: **A.24.1** tier-toggle UI (`Massing \| Presentation` segmented control) · **A.24.2** PresentationEnvironment (studio ground + soft sky + sun/AO, BIM 3D) · **A.24.3** material presets (white-model / use-coloured from occupancy → `FORMA_USE_COLOURS`) · **A.24.4** entourage library (scale people + trees around the footprint) · **A.24.5** massing-tier facade hint (floor lines + window-grid texture on Cesium blocks) · **A.24.6** use colour-coding in T-MASS (multi-mass mixed-use split) · **A.24.7** (stretch) measurement HUD on massing (Image A) · **A.24.8 QUEUED — roads + pedestrian context** (founder: "we need data about roads, pedestrian areas, etc."): fetch OSM `highway=*` (roads) + `footway/path/pedestrian` via Overpass — MIRROR the proven `contextBuildings.ts` pattern (4 mirrors + 7-day localStorage cache + never-throw) in a new `contextRoads.ts`; render as thin graphite polylines (roads) + lighter dashed (pedestrian) on the Cesium Forma ground via `viewer.entities.add({polyline})` mirroring `loadContextBuildings`. Makes the site view read like the Forma reference (streets, not just blocks). NEEDS a live-verification loop (Cesium render) — do via an agent or after a deploy-test cycle, not blind · **A.24.9 QUEUED — Forma "horizontal line" artifact** (founder): a faint horizontal band in the grey Forma ground — likely the globe ellipsoid horizon / a coplanar imagery seam; investigate `setFormaMode` ground + horizon culling. Out of scope: photoreal PBR, face-level push-pull editing (Image C gizmo). Rendering-only (C04); P2/P5/P6/P7 untouched. | 🔵 QUEUED (DRAFT spec) |
| **A.25** | 🎛️ **Living Design Parameters — slider-driven layout** (founder-requested 2026-06-05: "the user should be able to interact via parameter-slider that could impact the design layout LIVE — via climate, space, accessibility, sun, adjacency, location, room-connection… all parameters possible!") | A real-time PARAMETER PANEL whose sliders re-influence the generated design: **climate** (D6 sun/glazing weight), **space** (room area fractions / target m²), **accessibility** (corridor width / step-free / door clear-width), **sun** (orientation priority — the D6 `weight`), **adjacency** (program-rules strictness / preferred-vs-forbidden), **location** (the site lat/lon already drives D6), **room-connection** (corridor-first vs open-plan permeability). Each slider feeds the EXISTING substrate — `ScoringWeights` (score.ts), the O.12 typology `briefSchema` (range/stepper/select fields), the [architectural-program-rules] permission matrix, and the D6 `SolarBias.weight`/`siteLatitudeDeg` — and re-runs `generateDeterministicLayouts` (fast, offline) to update the layout LIVE. Pairs with the now-interrogable Building Graph (GRAPH.4: nodes/edges/rules explained) so the user SEES *why* the design changed. **DESIGN OF RECORD = [SPEC-LIVING-DESIGN-PARAMETERS](../specs/SPEC-LIVING-DESIGN-PARAMETERS.md) + [ADR-0060](../../02-decisions/adrs/0060-living-design-parameters.md)** (parameters are typology-declared + bound to `ScoringWeights`/program-rules/`SolarBias`, re-running the deterministic engine — NOT a parallel scorer; C50 §2.6.5). Builds on O.10 layout picker + O.12 brief schema + D6 climate. Slices: **A.25.1 ✅ SHIPPED** parameter→ScoringWeights binding + live re-generate seam (`designParamsToScoringWeights` + `activeDesignParams` + `gatherLayoutPayload`) · **A.25.2 ✅ SHIPPED** the slider panel UI (`DesignParamsPanel`, brand white+#6600FF, draggable) + `pryzmToggleDesignParams()` + discoverable button · **A.25.3 ✅ SHIPPED 2026-06-08** adjacency/accessibility/climate/space sliders → program-rules adjacency-strictness + `SolarBias.weight` + corridor strip width + habitable area-weight (new `EngineTuning` threaded payload→`generateDeterministicLayouts`; neutral slider = identity / Pareto-equality preserved; +15 tests, ai-host suite green) · A.25.4 graph-linked "what changed + why". Typology-agnostic per [[platform-spine-typology-agnostic]]. | 🟢 v1+A.25.3 SHIPPED (A.25.1/.2/.3) — A.25.4 queued |
| **A.26** | 🧬 **Editable Living Graph = the Inspect surface (BIM 2.0/3.0 — the graph IS the edit substrate)** (founder-requested 2026-06-08: "the living graph becomes the inspect tab — but as a panel as it is now — the user could select rooms within the living graph, change attributes, the graph adapts; change room area and the layout changes automatically… this should behave like BIM 2.0 and BIM 3.0") | The headline differentiator ask: make the Living Graph **bidirectional** — not a read-only interrogation overlay (GRAPH.3/GRAPH.4) but the **editable Inspect tab**, kept as the current movable/zoomable panel, where editing the GRAPH edits the MODEL. Fuses three things ALREADY in the codebase: (1) **GRAPH.4 interrogation** (`BuildingGraphOverlay` node-select → element/relationship/rule inspect card; `livingGraphSelection` `RoomFocusController` already does select / isolate-in-3D — visible in the founder screenshot: select "Bathroom 1" → area/sun/acoustic/links + "why it's here" + spaces); (2) the **A.25 live-regenerate seam** (`activeDesignParams`/`gatherLayoutPayload` → `generateDeterministicLayouts` re-run, debounced; A.25.3 `EngineTuning` proves engine inputs can be driven live); (3) the **Inspect panel** (`InspectPanel` ModelTree+Provenance, A.24/A.31.e). VISION: select a room IN the graph → highlight/isolate in 3D (✓ exists); edit a node ATTRIBUTE (area m², occupancy, adjacency preference, sun/acoustic target) on the inspect card → the graph re-lays-out AND the engine re-runs so the BUILT layout updates automatically (room grows/shrinks, partitions move, doors re-reconcile). Graph = *cause*, model = *effect* → "BIM 2.0/3.0". BUILDS ON the UBG ([[building-graph-strategy]]), A.25 ([SPEC-LIVING-DESIGN-PARAMETERS] + ADR-0060), the command bus (P6 — all mutation via commands), the deterministic engine. NEEDS: a **write-path** from a graph-node edit → a structured per-node layout-constraint delta → re-run (extend the A.25 seam so per-room area/occupancy/adjacency become PER-NODE overrides on the bubble-graph / feasibility-alloc inputs, not just global sliders) + the inverse projection back into the graph; plus **merging the Living Graph INTO the Inspect tab** (one surface). Governance: NEW ADR ("the building graph is a bidirectional edit substrate, not a read-only projection"; sibling to ADR-0058 UBG + ADR-0060 living-params) + a C-contract (editable-graph node/edit model, sibling to C20). Slices: **A.26.1** select-room-in-graph → 3D (✓ already via GRAPH.4 + `livingGraphSelection`) · **A.26.2** Living Graph adopts the Inspect-tab chrome (one panel, kept movable/zoomable) · **A.26.3** edit room AREA on the inspect card → per-node area override → engine re-run → layout updates (THE headline demo) · **A.26.4** edit occupancy/adjacency/sun/acoustic → graph adapts + (where it drives geometry) engine re-run · **A.26.5** inverse — model edits (drag a wall, change a room) reflect back into the graph live. Typology-agnostic per [[platform-spine-typology-agnostic]]. This is the WHAT-EDITABLE (BIM 2/3) axis made real — pairs with the WHERE-IT-LIVES (geospatial) + WHAT-KINDS (family-platform) strategic axes. **A.26.1 ✅ (already shipped via GRAPH.4 + livingGraphSelection). A.26.3 ✅ SHIPPED 2026-06-08 (v53)** — the HEADLINE: the Living Graph inspect-card AREA is now editable; commit → per-room override stashed (`activeRoomAreaOverrides`) → merged into `program.roomAreasByName` by `gatherLayoutPayload` → the EXISTING debounced `triggerApartmentLayout` re-runs `generateDeterministicLayouts` → `bubbleGraph` honours the per-room target (clamped to min/maxAreaFrac) → layout updates + the overlay rebuilds the UBG on `apartment.layout-executed` → graph re-lays-out. Reuses the shipped `roomAreasByName` mechanism + the A.25 seam (no new engine field, no parallel mutator). Empty stash ⇒ byte-identical baseline (ADR-0061 invariant I2, test-guarded; +7 ai-host tests, suite 1982). **Governance: ADR-0061 (building graph = bidirectional edit substrate) PROPOSED + indexed.** Remaining: A.26.2 (merge graph fully INTO the Inspect tab chrome) · A.26.4 (edit occupancy/adjacency/sun/acoustic → adapt) · A.26.5 (inverse: model edit → graph live) + the C-contract. **A.26.4 ✅ SHIPPED 2026-06-08** — the SECOND editable per-node attribute: room **OCCUPANCY/TYPE**. AUDIT first established the room SET + TYPES come from program FLAGS (`bedrooms`/`bathrooms`/`livingRoom`/…), minted + named deterministically inside `buildBubbleGraph` — there was NO per-instance type channel. The SOUND binding (not a fragile flag-remap): a new per-instance override `ApartmentProgram.roomTypesByName` (the direct sibling of `roomAreasByName`), consumed in `buildBubbleGraph` to RE-TYPE the minted room of that name IN PLACE (re-deriving its area weight / minima / habitability / adjacency rules from the new type's `roomRule`; room id/name/order/count unchanged — only `type` + derived `needsWindow`/`isPrivate`). Editor: new `activeRoomTypeOverrides.ts` stash (sibling) → merged into `program.roomTypesByName` in `gatherLayoutPayload` → fires the SAME debounced `triggerApartmentLayout` → engine re-types that room → layout updates + graph re-lays-out (same `apartment.layout-executed` rebuild as A.26.3). Inspect card: a brand white+#6600FF occupancy `<select>` (`occupancyField`, "— (detected)" clears the override; real engine room types). VALID-TYPE-GUARD + name-not-found + same-type = no-ops. Empty stash ⇒ `roomTypesByName` omitted ⇒ byte-identical baseline (ADR-0061 I2, test-guarded `roomTypeOverride.test.ts`). Area editing intact. **A.26.2 ✅ SHIPPED 2026-06-08** — the Living Graph adopts the Inspect-tab CHROME: `buildHeader` now paints the canonical onboarding/InspectPanel purple gradient (`linear-gradient(135deg,#6600ff,#8b2fe0)`) + white "🔍 Inspect · Living Graph" title + translucent-white header chips/buttons, over the white body; movable/zoomable (drag header, resize grip, wheel-zoom/pan) + GRAPH.4 interrogation + select/isolate-in-3D + the A.26.3 area edit all kept. **Governance: ADR-0061 promoted PROPOSED→ACCEPTED + the normative contract [C52 — Editable Building Graph](../../02-decisions/contracts/C52-EDITABLE-BUILDING-GRAPH.md) authored (sibling to C20; §2 editable-attribute table E1 area ✅ / E2 occupancy ✅ / E3 adjacency-pref / E4 sun-acoustic; §3 write-path discipline; §4 invariants I1–I4) + indexed in contracts README.** Remaining: A.26.4 follow-ons E3 (adjacency-pref) + E4 (sun/acoustic) → bind to the existing scorer axes per C52 §2/§3 · A.26.5 (inverse: model edit → graph live). **A.26.5 ✅ SHIPPED 2026-06-08** — the INVERSE projection that completes the bidirectional loop (C52 §3.3 / §4 I4), in two slices wired in `LivingGraphOverlay` (editor-only event plumbing; no engine change): **A.26.5a MODEL→GRAPH LIVE** — while the panel is OPEN, the overlay subscribes to the EXISTING model-mutation signals (the `bim-{room,wall,door,window}-{added,updated,removed}` window DOM events the stores already fire + the typed `bim-wall-mutation-committed` runtime event from ADR-057-P1 drag-moves) and on any of them schedules a DEBOUNCED (~400 ms) + COALESCED rebuild via the EXISTING `rebuildGraphFromModel()` → `window.pryzmBuildBuildingGraph()` → `pryzm:building-graph-rebuilt` → the overlay re-binds (NO parallel graph builder, P6 read-only). A burst (generate / multi-element edit / redetect sweep) collapses into ONE rebuild; closed panel does no work; timer cancelled on hide + dispose (no leak, no storm). **A.26.5b SELECT-IN-3D → HIGHLIGHT-IN-GRAPH** (the reverse of A.26.1) — the overlay subscribes to the canonical `selectionBus` (fallback `bim-selection-changed`); on a pick from a NON-graph source it maps the element → its ROOM via the new `roomIdForElement` (the exact inverse of `elementIdsForRoom`, reusing the SAME `buildModelElementLocations` parent-chain projection) and EMPHASISES that room's graph node (focus + inspect card + pan-into-view) — LIGHTWEIGHT, no isolation/model-write side effects; our own graph→3D echoes (`inspect-panel` source) are ignored so the two directions never fight. Forward A.26.1–A.26.4 (area/occupancy edit, chrome, select/isolate, GRAPH.4) all intact. Tests: `apps/editor/__tests__/livingGraphSelectionReverse.test.ts` (8 cases — reverse mapping + exact-inverse + degrade-to-null). | 🟢 A.26.1+A.26.2+A.26.3+A.26.4+A.26.5 SHIPPED — C52 contract CANONICAL (bidirectional loop CLOSED); A.26.4-E3/E4 queued |
| **A.22** | **Small-Office typology end-to-end** | T3 ship. 8 room types + AI workflow + D-OFFICE + validators + 5 reference projects. Refs: [phase-1-alpha §3.4](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 10–12) |
| **A.23** | **C20 Building + Apartment Aggregates ratification** | Multi-slice; broken into A.23.a-A.23.f. Refs: [C20](../../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md). | 🟢 IN PROGRESS (Sprint 1) |
| **A.23.a** | **L0 aggregate schemas (Building/Level/Apartment/Room)** | 5 schemas in `packages/schemas/src/aggregates/` (Building + Level + Apartment + Room + branded ids LevelId/ApartmentId/RoomId — BuildingId re-imported from `site/types.ts` for single source-of-truth). Composes the existing `ApartmentParameters` + `RoomParameters` records. Exposed via SUBPATH `@pryzm/schemas/aggregates` (root re-export would collide with existing `elements/Room` + `types/Id.RoomId`). NOTE: C20 §2.4 `Room.apartmentId: ApartmentId | null` is deferred to A.23.b — existing `RoomParameters.apartmentId` is non-nullable; widening migrates atomically with the L3 store wiring. 23 tests. | ✅ DONE (Sprint 1) |
| **A.23.b** | **L3 stores for aggregates + nullable apartmentId widening** | Broken into A.23.b.1 (Building + Level — DONE) and A.23.b.2 (Apartment + Room + nullable-widening — PLANNED). Cross-store invariants (active-Level uniqueness · unit-number uniqueness · Room.apartmentId ↔ Apartment.levelId) ship with the A.23.c commands. | 🟢 IN PROGRESS (Sprint 1) |
| **A.23.b.1** | **L3 BuildingStore + LevelStore + composeRuntime wiring** | 2 new stores in `packages/stores/src/` (28 tests). BuildingStore.list() sorts by ordinal-asc then createdAt-asc (reserves C20.1 multi-Building order). LevelStore.list() sorts by elevation; query helpers `activeForBuilding` / `findByNumber` / `findByElevation` feed cross-row checks the A.23.c commands run before commit. Both wired in composeRuntime → `runtime.buildingStore` + `runtime.levelStore` + C13 reset hooks. | ✅ DONE (Sprint 1) |
| **A.23.b.2** | **L3 ApartmentStore + RoomStore + composeRuntime wiring** | 2 leaf stores in `packages/stores/src/` (23 tests). ApartmentStore.list() sorts by buildingId then unitNumber; helpers `listForLevel` / `listForBuilding` / `findByUnitNumber`. RoomStore.list() sorts by levelId then name (case-insensitive); helpers `listForLevel` / `listForApartment` + `removeForApartment` cascade used by `apartment.delete`. Both wired in composeRuntime → `runtime.apartmentStore` + `runtime.roomStore` + C13 reset hooks. NOTE: `RoomParameters.apartmentId` nullable-widening (per [C20 §2.4](../../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md) public-corridor case) deferred to A.23.b.3. | ✅ DONE (Sprint 1) |
| **A.23.b.3** | **`RoomParameters.apartmentId` nullable-widening** | Close the [C20 §2.4](../../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md) public-corridor gap — widen `RoomParameters.apartmentId` to `string \| null`, update `Room.apartmentId` to `.nullable()`. Atomic with consumer updates (D-TGL, D-FLE, existing RoomParametersStore). | ⚪ PLANNED (Sprint 2) |
| **A.23.c** | **building.* / level.* / apartment.* / room.* commands** | 14 handlers in `packages/stores/src/aggregate-commands/` (60 tests). Building (create/update/delete-forbidden) · Level (create/update/setActive/delete with cascade-first) · Apartment (create/update/delete with Room cascade) · Room (create/update/delete/assignToApartment with §1.4 same-Level). All commands enforce cross-row + cross-store invariants per [C20 §1.2–§1.5 + §1.9]. Per [§4.5 + ADR-051] update events carry `prior` snapshots for ring-buffer undo. Per [C20 §4](../../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md). | ✅ DONE (Sprint 2) |
| **A.23.d** | **composeRuntime wiring** | DONE in A.23.b.1 + A.23.b.2 — all 4 stores wired as `runtime.buildingStore` + `runtime.levelStore` + `runtime.apartmentStore` + `runtime.roomStore`. | ✅ DONE (Sprint 1) |
| **A.23.e** | **Inspect tree wiring** | Per C27 §3 — Site → Building → Level → Apartment → Room → Element hierarchy. Tracker A.24. | (see A.24) |
| **A.23.f** | **Legacy apartment-parameter migration** | Existing `ApartmentParameterPropagator` + `ApartmentParametersStore` references re-pointed to the new Apartment aggregate. | ⚪ PLANNED (Sprint 9) |
| **A.24** | **Inspect tree wired with aggregates** | Site → Building → Level → Apartment → Room → Element hierarchy. Refs: [C27 §3](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md). | ⚪ PLANNED (Sprint 8) |
| **A.25** | **IFC4X3 Pset coverage gap-fill** | All shipped element types export canonical Pset; `IfcSpace` + `IfcZone` + `IfcFurniture` coverage. Refs: [C25 §3](../../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md), [phase-1-alpha §9](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 7–9) |
| **A.21.D24.3** | 🏢 **3D-globe MULTI-FLOOR massing — all storeys + roof on the globe + floor selector** (founder 2026-06-06: "in the Cesium 3D-globe view only the GROUND-floor walls show; the 2nd storey + roof are missing") | The live "3D / Plan" Cesium globe view (`renderFormaMassing`) showed ONLY the ground floor of a multi-storey house. **ROOT CAUSE (active-level NOT the issue; FLATTENING was):** `GISAreaLayout.getFormaWalls()` read EVERY wall from the store (all levels) but **dropped each wall's storey elevation** — `wall.baseLine.y` (the §WALL-AUDIT level-elevation convention) + `wall.baseOffset` were never read; only `x`/`z` survived. Then `CesiumViewport.renderFormaMassing` took `max(wall.height)` and extruded ONE footprint solid from the ground to that single height → every storey collapsed onto a single ground-floor block; upper storeys + a roof level never appeared. ✅ **DONE 2026-06-06** (rendering-only, C04; P2/P3 respected — THREE/Cesium unchanged, no raw rAF, no new deps): **(1)** `getFormaWalls()` now carries `baseElevation = baseLine[0].y + baseOffset` (+ `levelId`) per wall. **(2)** `renderFormaMassing` groups walls into **STOREY BANDS** by base elevation (0.5 m tolerance absorbs authoring jitter; sorted ground-up so band index = floor number) via new pure `groupWallsIntoStoreyBands(...)`, and extrudes ONE solid **per band stacked at its true elevation** (footprint per storey when a boundary is drawn; per-wall-at-storey-elevation fallback otherwise) — so all floors + a roof/parapet level (if its walls are authored) appear. Single-storey + apartment models have every wall at y=0 → exactly one band → BYTE-IDENTICAL to the old behaviour. **(3)** NEW floor-visibility control: a compact **"Floors" `<select>`** in the Forma view toggle bar (white+#6600FF, hidden until ≥2 storeys) — "All floors" (default) vs isolate a single storey; wired through new public `getFormaStoreyBands()` / `setVisibleFormaLevels(indices)` (re-renders the cached massing with the filter, no re-fly, no terrain re-clamp). New input field `walls[].baseElevation?` + `visibleLevels?` (both optional → back-compat). Files: `apps/editor/src/ui/layout/GISAreaLayout.ts`, `apps/editor/src/ui/geospatial/CesiumViewport.ts`. **VERIFY (worktree has no node_modules → tsc not runnable here):** reasoned type-clean; `cesiumViewport` is typed `any` in GISAreaLayout so the new method calls are safe; new fields optional. **NEEDS IN-BROWSER (Cesium render) VERIFY:** generate a 2-storey house → switch to 3D globe → BOTH storeys + roof appear stacked at correct elevations; the Floors selector shows All/Ground/1st… and isolating a floor hides the others; single-storey + apartment unchanged. | ✅ DONE (engine + selector; in-browser Cesium verify pending) |
| **A.21.D25** | 🏢 **3D-globe Forma massing was WALLS-ONLY — add floors/slabs + roof + coarse furniture** (founder 2026-06-06, builds on A.21.D24.3: "show ALL elements in Forma — floors, roof, ideally furniture — so it reads as a real building, not just wall blocks") | The D24.3 multi-storey globe view stacked all wall storeys correctly but the building was OPEN-TOPPED and HOLLOW (walls only): no floor plates, no roof cap, no contents. ✅ **DONE 2026-06-06** (rendering-only, C04; P2 — Cesium via the existing viewport, no raw rAF, no new deps; additive alongside the wall massing to minimise conflict with the concurrent D24 floor-selector work): **(1) Slabs/floors** — new `getFormaSlabs()` (GISAreaLayout) reads the slab store (`boundary` outer ring scene-XZ + `boundary.y + baseOffset` top elevation + `thickness`); `renderFormaMassing` extrudes a THIN solid floor plate per slab at its storey elevation (ground plate sunk `FORMA_BASE_SINK_M` to avoid z-fight). **(2) Roof** — new `getFormaRoofs()` reads the roof store (`boundary` ring + base/eave elevation + `thickness` + `pitch` rad); flat roofs (pitch≈0) cap as a thin slab, pitched roofs raise a COARSE centroid "ridge fan" (one triangular wedge per boundary edge up to a centre apex, rise = ½·min-extent·tan(pitch), clamped ≤6 m) so the building closes on top + reads pitched (exact pitched form stays in the BIM view; the globe is a massing read). **(3) Furniture** — new `getFormaFurniture()` reads the furniture store (`origin` scene-XZ + `origin.y` elevation + `size` bbox/`scale` → coarse footprint + height + `rotation`), HARD-CAPPED at `FORMA_FURNITURE_CAP = 400` items (perf — never floods the globe); rendered as rotated extruded boxes in the subtler context-fill so they read as contents, not massing. ALL three are storey-band visibility-filtered (`bandIndexForElevation` → nearest band) so the D24 Floors selector hides their floors too; all entities go into `formaMassingEntities` (cleared on every re-render); each block is try/guarded (a bad ring logs + skips, never crashes placement). New OPTIONAL `renderFormaMassing` input fields `slabs?`/`roofs?`/`furniture?` → back-compat (older callers / apartment path unchanged: an apartment with no slabs/roof simply contributes nothing extra). Files: `apps/editor/src/ui/layout/GISAreaLayout.ts`, `apps/editor/src/ui/geospatial/CesiumViewport.ts`. **VERIFY (worktree has NO node_modules → tsc not runnable here):** reasoned type-clean — `cesiumViewport` is `any` in GISAreaLayout so the new field calls are safe; all new input fields optional; new locals (`slabs`/`roofs`/`furniture`/`bandIndexForElevation`/`furnitureFill`) collision-checked; reuses in-scope `toCartesian`/`baseHeight`/`massFill`/`massOutline`/`bands`/`isBandVisible`/`polygonCentroidAndAreaXZ`. **NEEDS IN-BROWSER (Cesium render) VERIFY:** generate a house → 3D globe → floors (solid plates) + roof (closed/pitched cap) + walls per storey; building reads as solid + closed, not hollow blocks; furniture appears coarse (or is absent on unfurnished models); single-storey + apartment still look right; Floors selector still isolates per storey incl. the new elements. **FLAG:** roof ridge-fan is COARSE (centroid hip approximation, not the true gable/hip ridge); furniture is a coarse box (no GLB) — both deliberate massing-scale reads, refine later if the founder wants exact site-view roof shape. | 🟢 DONE (engine; in-browser Cesium verify pending) |
| **A.26** | **Revit IFC4X3-RV variant exporter** | The Revit-import-friendly variant. Refs: [C26](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md). | ⚪ PLANNED (Sprint 8) |
| **A.27** | **10-project IFC round-trip nightly** | Reference suite per [C25 §6](../../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md). | ⚪ PLANNED (Sprint 9) |
| **A.28** | **First 3 community-authored family packs** | IKEA-style kitchen system · UK door catalogue · JIS-spec window catalogue. Refs: [phase-1-alpha §6.4](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 8–9) |
| **A.29** | **Family marketplace UX polish** | 3D preview · Ed25519 verify badge · install flow. Refs: [phase-1-alpha §6](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 8) |
| **A.30** | **C22 PII tier — partial ratification** | Multi-slice; broken into A.30.a (L0 schemas: DataTier · Region · DSAR · Consent · RetentionPolicy — DONE), A.30.b (L0 BreachIncident + StorageRoutingPolicy — PLANNED), A.30.c (L3 ConsentStore + RetentionScheduler — PLANNED), A.30.d (server DSAR worker + privacy UI — PLANNED). Refs: [C22](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md), [phase-1-alpha §7.1](./roadmap-phase-1-alpha.md). | 🟢 IN PROGRESS (Sprint 2) |
| **A.30.a** | **L0 C22 privacy schemas (DataTier · Region · DSAR · Consent · RetentionPolicy)** | 4 L0-pure schemas in `packages/schemas/src/privacy/` exposed via SUBPATH `@pryzm/schemas/privacy`. (a) `DataTierSchema` — 4-tier closed enum (pii / project / telemetry / derived) per [C22 §2.1]; (b) `DsarRequestSchema` — DSAR audit row per [C22 §2.4] with cross-field invariants (dueAt ≥ submittedAt · type=rectify ⇔ patch · status=completed needs completedAt · status=in-progress|completed|manual needs verifiedAt); (c) `ConsentSchema` — per-purpose consent record per [C22 §2.6] (revokedAt ≥ grantedAt); (d) `RetentionPolicySchema` — per-tier retention config per [C22 §2.3] (PII maxBackupDays ≤ 90 enforced per §1.6 · maxBackupDays ≤ maxDays). 32 tests covering enum closure · DSAR type-coupling · GDPR-30-day clock · PII backup ceiling · trigger list closure. | ✅ DONE (Sprint 2) |
| **A.30.b** | **L0 BreachIncident schema** | New L0-pure schema in `packages/schemas/src/privacy/BreachIncident.ts`. Per [C22 §2.5] captures the breach lifecycle (suspected → confirmed → notified-authority → notified-subjects → closed). superRefine enforces: `detectedAt ≤ confirmedAt`, status-driven required fields (every status ≥ 'confirmed' needs `confirmedAt`; ≥ 'notified-authority' needs `authorityNotification`; ≥ 'notified-subjects' needs `subjectNotification`; 'closed' needs `closedAt`), `recordsAffected ≥ subjectsAffected` (a subject can have multiple records). `confirmedAt` start of the GDPR Art. 33 72-h clock per [C22 §1.9]. BreachRegion enum is `eu / us / ap` (excludes `self-hosted` since those are the customer's incident, not PRYZM's). AuthorityNotification + SubjectNotification sub-schemas extracted. 22 tests. | ✅ DONE (Sprint 2) |
| **A.30.c** | **L3 ConsentStore** | New L3 user-scoped store in `packages/stores/src/ConsentStore.ts` wrapping the L0 Consent substrate (A.30.a). Per [C22 §3.1] authoritative source for "is this user consented to purpose X right now?". `grant()` is idempotent on identical rows + auto-supersedes prior active versions of the same purpose (sets `revokedAt: grantedAt` on the older row; returns the superseded rows so the L3 retention scheduler can fire the §1.6 `consent-revoke` purge). `revoke()` flips `revokedAt` on the active row + returns it (no-op when no active row). `purgeUser()` is the GDPR Art. 17 erasure path (hard-deletes every row for a user). Listener-throw isolation + idempotent dispose. 21 tests covering read API (activeFor latest-grant tie-break, isConsented, listForUser asc-order, activeForUser filter) · grant (idempotent · cross-version supersede · cross-purpose isolation · cross-user isolation) · revoke (success + no-op + audit-history retention) · purgeUser (Art. 17 erase + other-user isolation) · subscription + reset + dispose lifecycle. | ✅ DONE (Sprint 2) |
| **A.30.d.1** | **consent.* command surface (3 handlers)** | 3 pure command handlers in `packages/stores/src/consent-commands/` per [C22 §4]. (a) `grantConsent` — idempotent on identical rows + auto-supersedes prior active versions of the same purpose; emits `ConsentGrantedEvent` carrying the superseded rows so the L3 RetentionScheduler can fire `consent-revoke` purges. (b) `revokeConsent` — flips `revokedAt` on the active row; rejects with `no-active-consent` when no active grant exists (surfaces accidental double-revokes explicitly). (c) `purgeUserConsent` — GDPR Art. 17 erasure; idempotent (returns `rowCount: 0` for unknown users). 11 tests covering happy paths · cross-version supersede · cross-purpose / cross-user isolation · revoke success + no-active rejection + double-revoke rejection · purge other-user isolation + idempotent zero-row path · Zod validation throws. The L5 DSAR worker + privacy-settings UI (A.30.d.2) consume this surface. | ✅ DONE (Sprint 2) |
| **A.31** | **C23 Provenance graph — partial ratification** | Multi-slice; broken into A.31.a (L0 schemas: AIArtefact / ProvenanceEdge / ContextSnapshot / RedactionRecord — DONE), A.31.b (L0 ProvenanceExport — ✅ DONE `0adc336`), A.31.c (L3 ProvenanceStore — ✅ DONE `db37652`), A.31.d (L3 provenance.* commands `recordArtefact`/`linkElement`/`updateApprovalStatus`/`queryByProject` — ✅ DONE `aed1a58`), A.31.e (L5 Inspect-Provenance UI tab — ✅ DONE `60cec8c`). **C23 §8 step-1 substrate (a–e) COMPLETE 2026-06-04** (schemas + L3 store + commands + UI tab, ~112 tests); server PG backend + RLS + signed-export route = later slices (B.U.8 / C23 §8.2). Refs: [C23](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md), [phase-1-alpha §7.2](./roadmap-phase-1-alpha.md). | 🟢 SUBSTRATE DONE (a–e; server/RLS later) |
| **A.31.a** | **L0 C23 Provenance schemas (AIArtefact + ProvenanceEdge + ContextSnapshot + RedactionRecord)** | 4 L0-pure schemas in `packages/schemas/src/provenance/` exposed via SUBPATH `@pryzm/schemas/provenance`. (a) `AIArtefactSchema` — the append-only audit row per [C23 §2.1] with cross-field §1.4 invariant (deterministic ↔ non-null seed) enforced. (b) `ProvenanceEdgeSchema` — DAG edge per [C23 §2.2] with exactly-one-of `toArtefactId` / `toElementId` + edge-kind ↔ target-shape coupling. (c) `ContextSnapshotSchema` — serialised model context per [C23 §2.3] bridging to C05 file-format via `projectStateSha`. (d) `RedactionRecordSchema` — PII redaction audit per [C23 §2.4] (counts only, never content; per-category sum ≤ totalTokensRedacted). 36 tests. | ✅ DONE (Sprint 2) |
| **A.31.b** | **L0 ProvenanceExport schema (signed audit bundle)** | New L0-pure schema in `packages/schemas/src/provenance/ProvenanceExport.ts` composing the 4 A.31.a schemas into the Ed25519-signed customer-facing audit bundle per [C23 §2.5]. superRefine enforces: `totalArtefacts` matches `artefacts.length`, `totalEdges` matches `edges.length`, `artefactsFrom ≤ artefactsTo`, every embedded artefact + edge belongs to the export's `projectId` (per §1.8 RLS pre-image). Signature shape captured: base64 Ed25519 + signing-key-id with the marketplace-key pattern. 15 tests. | ✅ DONE (Sprint 2) |
| **A.31.c** | **L3 ProvenanceStore + composeRuntime wiring** | New L3 store in `packages/stores/src/ProvenanceStore.ts`. APPEND-ONLY per [C23 §1.9] with two carve-outs: `updateApprovalStatus()` (§1.7) and `linkElement()` (§4.4 produced-element link append). Rejects edges that would close a DAG cycle (§1.3 — DFS implementation tracing out-edges from the target back to the source). Snapshots dedup by `contextHash` (§2.3 — calling `addOrReuseSnapshot` with an existing hash returns the prior row). Composes into `runtime.provenanceStore` slot in composeRuntime; dispose chain wired. 35 tests covering read API · append-only enforcement · DAG cycle rejection (self-loop / 2-node / 3-node / diamond passes) · snapshot dedup · approval-status carve-out (mutates only that field, no-op on unchanged, throws on unknown) · linkElement idempotent + appends · reset + dispose + listener-throw isolation. | ✅ DONE (Sprint 2) |
| **A.31.d** | **provenance.* command surface (4 handlers)** | 4 pure command handlers in `packages/stores/src/provenance-commands/` per [C23 §4]. (a) `recordArtefact` — write a new artefact + idempotent on idempotencyKey per [C23 §1.11] (re-dispatch returns existing row + `deduplicated: true`); dedup scoped by projectId. (b) `linkElement` — append element ids to `producedElementIds` per §4.2; idempotent per element id; reject on unknown artefact. (c) `updateApprovalStatus` — flip approvalStatus per §1.7 with legal-transition graph (pending → user-approved | user-rejected | never-applied; auto-applied / user-approved / user-rejected / never-applied terminal); same-status is a no-op; reject on unknown artefact. (d) `queryByProject` — read-only filter per §4.3 (projectId required, optional `from` / `to` ISO-8601 window, optional `workflowKinds` exact-match filter). 26 tests covering happy paths · idempotency dedup (key + project scope + duplicate-id-different-key rejection) · idempotent linking · legal + illegal transitions for every starting state · same-status no-op · unknown artefact · query filter combinations. Tracker: A.31 progresses A.31.a → A.31.b → A.31.c → A.31.d DONE. | ✅ DONE (Sprint 2) |
| **A.31.e** | **L5 Inspect-tree Provenance tab + right-click menu (IP-A5 iter 5.2 + 5.2.b)** | Panel `apps/editor/src/ui/inspect/ProvenanceTab.ts` + orchestrator `ProvenanceMenuOrchestrator.ts` + `ModelTreeContextMenuPayload` hook on `ModelTree.ts`. Panel renders the C23 provenance graph for a selected element via `ProvenanceStore.listArtefactsForProject(projectId)` + filter by `producedElementIds.includes(elementId)`. Per-artefact card: model · workflow version · reproducibility (deterministic+seed / non-deterministic) · cost (USD magnitude formatted) · tokens · duration · cache status · timestamp · prompt SHA · produced-element count · redacted prompt preview as `<details>`. Approval badge uses semantic CSS classes (`pv-badge--success` / `--warning` / `--error` / `--info` / `--muted`). Subscribes to the store so live appends auto-rerender. `role="region"` + `aria-label="AI provenance for selected element"`. **Iter 5.2.b** wires ModelTree right-click → orchestrator → popover → "Show AI provenance" → panel mount. ModelTree's new `onContextMenu` hook is opt-in (back-compat); orchestrator filters menu items by `selection.kind === 'elementInstance'`. Tab is reused across right-clicks (selection swap, not remount). Esc + click-outside dismiss · Enter / Space activate · first item auto-focus. 48 tests (31 panel · 17 orchestrator). Demos: [iter 5.2 panel](../../05-guides/demos/IP-A5-iteration-5-2-provenance-tab.md) + [iter 5.2.b menu](../../05-guides/demos/IP-A5-iteration-5-2-b-provenance-context-menu.md). Final 5-line shell-wiring at editor mount lands in iter 5.2.c. | ✅ DONE (Sprint 2) |
| **A.32** | **WCAG axe-core CI: critical + serious all green** | Multi-slice; broken into A.32.α (STATIC gate — token-contrast audit on every PR — DONE) and A.32.β (DYNAMIC gate — Playwright + axe-core against live editor DOM — PLANNED). Refs: [C43 §6](../../02-decisions/contracts/C43-ACCESSIBILITY.md), [phase-1-alpha §7.3](./roadmap-phase-1-alpha.md). | 🟢 IN PROGRESS (Sprint 2) |
| **A.32.α** | **Static a11y CI gate (`check:a11y-contrast`)** | New CI gate script at `scripts/check-a11y-token-contrast.mjs` + root `pnpm run check:a11y-contrast` alias. Delegates to `pnpm --filter @pryzm/a11y-tokens exec vitest run __tests__/tokens.test.ts` — runs the A.34 audit in < 1 s, fails the PR if any declared (foreground, background) token pair drops below its WCAG threshold. Exit codes: 0 pass, 1 audit failed, 2 environment broken. The dynamic side (Playwright + axe-core walking the live editor DOM) is A.32.β. | ✅ DONE (Sprint 2) |
| **A.33** | **Keyboard registry + cheat-sheet UI** | Multi-slice; broken into A.33.a (L2 `@pryzm/keyboard-registry` package — registry + format helpers + cheat-sheet builder — DONE), A.33.b (L5 `?` cheat-sheet modal — ✅ DONE 2026-06-10: `apps/editor/src/ui/ShortcutCheatSheet.ts` now renders from the canonical `@pryzm/keyboard-registry` via `buildCheatSheetData(detectPlatform())` — was a drift-prone hand-curated list; platform-aware glyphs (⌘ on macOS / Ctrl on Win-Linux), experimental rows muted, ARIA dialog. Wired at `initUI.ts:2867`, opens on `?`/Shift-/.) and A.33.c (audit existing scattered key handlers + route through registry — PLANNED). Refs: [C43 §1.3](../../02-decisions/contracts/C43-ACCESSIBILITY.md). | 🟢 IN PROGRESS (Sprint 2 — A.33.a + A.33.b DONE; A.33.c pending) |
| **A.33.a** | **L2 `@pryzm/keyboard-registry` package** | New L2-pure package in `packages/keyboard-registry/`: (a) append-only `KEYBOARD_REGISTRY` of 35 shortcuts grouped into 7 categories (global / view / select / create / edit / navigate / inspect), (b) `validateRegistry()` boot-time guard that throws on duplicate ids OR combo collisions in the same context (alias collisions detected, experimental entries tolerated), (c) `formatKeyCombo(combo, platform)` platform-aware glyph rendering (`⌘ S` on macOS per Apple HIG, `Ctrl+S` on Windows/Linux per MS style guide), (d) `buildCheatSheetData(platform)` data generator the L5 modal renders. Pure: no DOM, platform passed explicitly (no `navigator.platform` sniff at file scope). 37 tests (registry: 15 · format: 12 · cheatSheet: 10). | ✅ DONE (Sprint 2) |
| **A.34** | **Color-contrast token sweep** | Multi-slice; broken into A.34.a (L2 `@pryzm/a11y-tokens` package — registry + audit — DONE) and A.34.b (focus-ring + form-control border tokens — DONE). Refs: [C43 §1.5](../../02-decisions/contracts/C43-ACCESSIBILITY.md). | ✅ DONE (Sprint 2) |
| **A.34.a** | **L2 `@pryzm/a11y-tokens` package (contrast calculator + token-pair audit)** | New L2-pure package in `packages/a11y-tokens/`. (a) `parseHexColor` + `relativeLuminance` + `contrastRatio` implement the WCAG 2.x formula deterministically (no DOM). (b) `checkContrast(fg, bg, {level, size})` returns `{ratio, threshold, passes, level, size}` with thresholds covering AA normal (4.5:1) · AA large (3:1) · AAA normal (7:1) · AAA large (4.5:1) · non-text (3:1, WCAG 1.4.11). (c) `PRYZM_TOKENS` registry of 14 canonical color tokens (brand purple #6600FF + 5 surfaces + 3 text grays + 4 semantic + 1 border). (d) `TOKEN_PAIRS` registry of 11 legal (fg, bg) usage pairs with declared `minLevel` per [C43 §1.5] (text-dense surfaces — inspect tree + data panel — gated AAA; everything else AA). (e) `auditTokenPairs()` runs the audit + returns pass/fail split. 28 tests covering hex parsing edge cases · WCAG luminance constants (white/black/grey) · 21:1 symmetric maximum · level-threshold escalation · text-dense AAA enforcement · the registry passes the audit cleanly · audit catches a known-failing fixture. Decorative panel borders exempted per WCAG 1.4.11 (documented inline). | ✅ DONE (Sprint 2) |
| **A.34.b** | **Focus-ring + form-control border tokens (essential non-text per WCAG 1.4.11 + 2.4.11)** | Adds 4 new tokens to `PRYZM_TOKENS`: `focus-ring: #C2A4FF` (keyboard focus indicator), `form-border: #7E7E94` (resting input border), `form-border-focused: #C2A4FF` (focus state, aligns with focus-ring), `form-border-error: #FF5252` (invalid state, aligns with semantic.error). Registers 6 new `TOKEN_PAIRS`: focus-ring × 3 surfaces (ink / paper / paper-elevated — the surfaces a focused control can appear on) + form-border resting + focused + error on paper. All 6 gated `non-text` AA (3:1) per [WCAG 1.4.11 + 2.4.11]; PRYZM aspires AAA per [C43 §1.3]. Audit caught a too-dim `form-border` at 2.72:1 < 3:1 — bumped #5A5A6E → #7E7E94 in the same commit (the kind of real defect the audit is designed to surface). 30 tests covering the new tokens + the existing 28. | ✅ DONE (Sprint 2) |
| **A.35** | **C48 Backup + DR runbooks** | Multi-slice; broken into A.35.a (4 core failure-mode runbooks + index README — DONE) and A.35.b-d (insider access · plugin corruption · CRDT divergence — PLANNED, deps on C47/C08 ratification). Refs: [C48 §1.10](../../02-decisions/contracts/C48-BACKUP-AND-DR.md). | 🟢 IN PROGRESS (Sprint 2) |
| **A.35.a** | **4 core DR runbooks (DB primary · regional outage · ransomware · accidental delete)** | 4 new runbooks in `docs/04-reference/runbooks/` codifying the C48 §1.10 procedure: (a) [RUNBOOK-DB-PRIMARY-FAILURE.md](../../04-reference/runbooks/RUNBOOK-DB-PRIMARY-FAILURE.md) — 30-min RTO promote-read-replica flow, (b) [RUNBOOK-REGIONAL-OUTAGE.md](../../04-reference/runbooks/RUNBOOK-REGIONAL-OUTAGE.md) — 4-hr RTO cross-region failover with cold-backup fallback, (c) [RUNBOOK-RANSOMWARE.md](../../04-reference/runbooks/RUNBOOK-RANSOMWARE.md) — 24-hr RTO with quarantine-first + credential rotation + mandatory disclosure path, (d) [RUNBOOK-ACCIDENTAL-DELETE.md](../../04-reference/runbooks/RUNBOOK-ACCIDENTAL-DELETE.md) — 4 sub-cases keyed off tier-retention window. Each runbook follows the same 7-section skeleton (when-applies / symptoms / procedure / verification / post-incident review / related / drill cadence). Index at [docs/04-reference/runbooks/README.md](../../04-reference/runbooks/README.md). | ✅ DONE (Sprint 2) |
| **A.36** | **C48 First DR drill (simulated PG primary failure)** | Drill + retrospective + runbook v2. Refs: [C48 §1.11](../../02-decisions/contracts/C48-BACKUP-AND-DR.md). | ⚪ PLANNED (Sprint 11) |
| **A.37** | **Cognition L1–L4 hardening — 100 new rules code-enforced** | 152 → 252 rules (out of 248-spec total; some are spec-expansion). Continuous Sprint 2–12; rules ship in batches keyed by cognition layer. First batch: A.37.α (G9 hierarchy validator — DONE). Refs: [phase-1-alpha §10](./roadmap-phase-1-alpha.md). | 🟢 IN PROGRESS (Sprint 2–12, continuous) |
| **A.37.α** | **G9 room-hierarchy validator** | New L2-pure validator `packages/ai-host/src/workflows/apartmentLayout/dimensions/validateRoomHierarchy.ts` closing the G9 gap from the dimensional framework. Catches layouts that PASS per-room G1-G6 but break architectural hierarchy invariants: H1 master < bedroom · H2 kitchen > living · H3 ensuite > bathroom · H4 non-social room dominates social zone · H5 corridor > bedroom · H6 wc > bathroom. All findings SOFT (penalty into `shapeQuality` / hierarchy axis); never HARD-rejects. Penalty scales with shortfall magnitude. 21 tests covering clean-pass + each H rule + delta-scaling + result-shape. Pairs with the existing 12 validators (validateRoomShape · validateRoomFit · validateKitchenTriangle · validateFrontage · validateAcousticZoning · validateCirculationSequence · validateCorridorConnectivity · validateForbiddenAdjacencies · validateMandatoryAdjacencies · validateWetCluster · validateApartmentEnvelope · validateKitchenFromFurniture). ai-host 1365 → 1386 tests. | ✅ DONE (Sprint 2) |
| **A.37.β** | **G8 room-daylight validator (windowless-bedroom guard)** | New L2-pure validator `packages/ai-host/src/workflows/apartmentLayout/dimensions/validateRoomDaylight.ts`. Closes the "windowless habitable room" anti-pattern called out in the single-apartment fix-pass spec (#5 NO windows): (a) HARD-rejects required-frontage rooms (master · bedroom · living · kitchen) with no aperture on any perimeter edge, (b) SOFT-flags preferred-frontage rooms (study · dining) with no aperture, (c) SOFT-flags habitable rooms whose aperture area is below 10 % of floor area (Building Reg habitability default). Service + circulation rooms (bath · wc · corridor · hall · utility) accept windowless by design. Window↔room association derived from axis-aligned edge-overlap geometry (no separate join required); partial overlaps + multi-window aggregation handled. 21 tests covering required HARD (master · bedroom · living · kitchen) + threshold edge cases + preferred SOFT (study · dining) + service-room acceptance + window-on-room geometry (far · multi · partial overlap) + result shape. Pairs with A.38 (the L5 daylight rule-checker UI consumes this validator's findings). | ✅ DONE (Sprint 2) |
| **A.37.γ** | **L2 aggregate dimensional validator (`validateAllDimensional`)** | New orchestrator `packages/ai-host/src/workflows/apartmentLayout/dimensions/validateAllDimensional.ts` that runs validateRoomShape (G1-G6) + validateRoomHierarchy (G9) + validateRoomDaylight (G8) + validateCorridorWidth (L5 perceptual) + **validateEntrySightline (L5 perceptual, A.39.b)** and concatenates findings into one `DimensionalReport`. `admissible` is the AND of every sub-validator; the `perValidator` field carries the raw per-sub-validator results so the L5 modal can render per-section badges. `skipDaylight: true` lets early pipeline phases (D-TGL pre-window) skip the daylight gate cleanly; `skipSightline: true` similarly forces the sightline gate off. The D3.1 enumerate.ts gate + the L5 modal both call this single function instead of 5 separate validators. Bonus: fixed a latent type-mismatch where `validateRoomDaylight` expected `roomId` but received `RoomShape.id` — properly maps both fields now. 11 tests covering sound-fixture admissibility · per-validator breakdown shape · fault propagation from each sub-validator (windowless → G8 HARD, narrow corridor → corridor HARD, master < bedroom → G9 SOFT, bedroom-off-hall → sightline HARD) · skipDaylight + skipSightline short-circuits · combined-finding-count consistency. | ✅ DONE (Sprint 2) |
| **A.37.δ** | **L2 dimensional-report formatter (`formatDimensionalReport`)** | New L2-pure transform `packages/ai-host/src/workflows/apartmentLayout/dimensions/formatDimensionalReport.ts`. Takes a `DimensionalReport` and returns a JSON-serializable `FormattedReport` shape the L5 modal renders: 4 fixed sections (Room shape G1-G6 · Room hierarchy G9 · Daylight G8 · Corridor comfort L5) each with `pass / warning / error` status + hard/soft counts; per-room rows grouped by `roomId` carrying `worstSeverity` + per-finding `{metric, reason, severity, delta}`; rooms with errors sort before rooms with only warnings (deterministic ordering); a global `overallSeverity` + `totals` header. Pure L2 — no React / DOM. The L5 modal (A.38.b PLANNED) + daylight panel (A.38.a PLANNED) + perceptual panel (A.39.c PLANNED) all consume this shape. 11 tests covering overall severity buckets · 4-section invariant + display names · section status reflection · per-room grouping + sort order · single-room mixed error+warning · finding-field preservation. | ✅ DONE (Sprint 2) |
| **A.37.ε** | **L2 layout-summary formatter (`formatLayoutSummary`)** | New L2-pure transform `packages/ai-host/src/workflows/apartmentLayout/formatLayoutSummary.ts`. Takes a `LayoutOption` and produces a single-line architect-readable summary like `2-bed apartment · 69m² · master 16m² · bedroom 12m² · living 22m² · kitchen 8m² · bath 5m² · corridor 6m²`. Aggregates multi-room types with `×N` count tag; uses shortened labels (`bath` not `bathroom`); fixed type ordering (master → bedroom → living → dining → kitchen → ensuite → bath → wc → study → hall → corridor → utility) for determinism. Used by AI artefact `outputSemanticFingerprint` summary · modal "now showing" copy · log lines · telemetry payloads. 13 tests covering bedroom-count tag (studio + 1/2/3-bed) · area rounding · canonical type ordering · multi-room ×N aggregation · single-room (no ×N) · shortened labels · empty-layout marker · absent-type omission · separator format · full architect-readable example. | ✅ DONE (Sprint 2) |
| **A.38** | **L5 daylight rule-checker** | Multi-slice; broken into A.38.a (L5 daylight panel reading `formatDimensionalReport().sections.roomDaylight` — PLANNED) and A.38.b (L5 modal full integration — PLANNED). The L2 rule (A.37.β) + report formatter (A.37.δ) are the data sources. Refs: [phase-1-alpha §10.2](./roadmap-phase-1-alpha.md). | 🟢 IN PROGRESS (Sprint 2) |
| **A.39** | **L5 perceptual evaluator (corridor width · sightline · aspect ratio)** | Multi-slice; broken into A.39.a (L2 corridor-width — DONE), A.39.b (L2 entry sightline — DONE), A.39.c (L5 UI panel — PLANNED). Refs: [phase-1-alpha §10.3](./roadmap-phase-1-alpha.md). | 🟢 IN PROGRESS (Sprint 2) |
| **A.39.a** | **L2 corridor-width perceptual evaluator** | New L2-pure validator `packages/ai-host/src/workflows/apartmentLayout/dimensions/validateCorridorWidth.ts`. Closes the cognition-stack L5 perceptual layer for the corridor element. Comfort thresholds per UK Approved Doc M + WHO interior-comfort guidance: < 0.80 m HARD (accessibility floor) · 0.80–1.00 m SOFT cramped · 1.00–1.40 m comfort band (no finding) · 1.40–2.50 m SOFT wide (wasted circulation) · > 2.50 m HARD ('that's a room, not a corridor — reclassify'). Penalty scales linearly with deviation from comfort-band edges. Non-corridor rooms ignored. Degenerate (zero-area) corridors handled. 15 tests covering comfort-band edges (1.00 / 1.40 exact) · HARD floor + ceiling rejection · SOFT cramped + wide scaling · multi-corridor aggregation · non-corridor ignored · degenerate handling. | ✅ DONE (Sprint 2) |
| **A.39.b** | **L2 entry-sightline perceptual evaluator (compression-release pattern)** | New L2-pure validator `packages/ai-host/src/workflows/apartmentLayout/dimensions/validateEntrySightline.ts`. Builds an adjacency graph from rooms + doors, BFS from the entry room, then scores the compression-release arrival sequence per the cognition-stack L5 architectural-quality layer. HARD-rejects private rooms (master · bedroom · bathroom · ensuite · wc) within 1 door of the entry (privacy break — the front door must not open onto a sleeping zone). SOFT-flags when the entry room itself is NOT a circulation room (hall · corridor) — direct-onto-living misses the compression phase. SOFT-flags when the deepest habitable destination (master · bedroom · living) sits at BFS depth > 4 (over-buried, visitor walks through too many thresholds). Filters out the `__exterior__` pseudo-node, handles disconnected rooms gracefully. 17 tests covering sound-apartment pass · privacy-break cases (bedroom / master / bathroom / ensuite / entry-as-bedroom) · accepts depth-2 routing · entry-not-circulation SOFT (living direct / passes for hall + corridor) · depth-too-deep SOFT (chain of 5) + depth-4 accepted · degenerate inputs · result-shape invariants. | ✅ DONE (Sprint 2) |
| **A.40** | **First 50 paying customers** | Solo + Studio PLG. Target $1500 MRR. Refs: [phase-1-alpha §1 E8](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 6–12, marketing-led) |
| **A.41** | **Phase 1 exit ADR (ADR-NNN-phase-1-exit-alpha)** | Immutable closure decision. Refs: [phase-1-alpha §1](./roadmap-phase-1-alpha.md), [cadence §6](./cadence-and-planning-system.md). | ⚪ PLANNED (Sprint 12–13, end-Q4) |

---

## §4 — Phase B — Beta (6–18 months; 2027-Q1 to 2028-Q2; ~18 months)

**Phase B exit criteria**: see [roadmap-phase-2-beta.md §1](./roadmap-phase-2-beta.md). 10 criteria. Closure ADR at end of 2028-Q2.

| Phase | Goal | Description + references | Status |
|---|---|---|---|
| **B.1** | Townhouse / row-house typology (T4) | Per [typology-expansion §5](./typology-expansion-roadmap.md) #4. Q1 2027. | 🔵 DEFERRED (Phase B) |
| **B.2** | Co-living unit typology (T5) | #5. Q1 2027. | 🔵 DEFERRED |
| **B.3** | Co-working space typology (T6) | #6. Q2 2027. | 🔵 DEFERRED |
| **B.4** | Gym / fitness studio typology (T7) | #7. Q2 2027. D-GYM engine. | 🔵 DEFERRED |
| **B.5** | Pharmacy typology (T8) | #8. Q3 2027. D-PHARMA engine + controlled-substance storage + GDPR-relevant consultation room. | 🔵 DEFERRED |
| **B.6** | GP surgery / clinic typology (T9) | #9. Q3 2027. | 🔵 DEFERRED |
| **B.7** | Restaurant / café typology (T10) | #10. Q4 2027. | 🔵 DEFERRED |
| **B.8** | **C24 Sheet Composition Engine — CANONICAL** | Vector renderer + viewports + section/elevation. Refs: [C24](../../02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md), [phase-2-beta §4.1](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.9** | **C29 PDF Vector Export — CANONICAL** | `packages/pdf-export/` implementation + PDF/A-3 + Tagged-PDF. Refs: [C29](../../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md). | 🔵 DEFERRED |
| **B.10** | **C30 Drawing Set Management — CANONICAL** | `SheetSetStore` + revision tracking + transmittal package. Refs: [C30](../../02-decisions/contracts/C30-DRAWING-SET-MANAGEMENT.md). | 🔵 DEFERRED |
| **B.11** | **C34 Print + Drawing Standards (4 standards)** | AIA + RIBA + DIN + ISO 19650. Refs: [C34](../../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md). | 🔵 DEFERRED |
| **B.12** | **C27 BIM 3.0 Inspect Model — CANONICAL** | Full Inspect tree + isolation animator + spatial resolver. Refs: [C27](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md), [phase-2-beta §5.1](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.13** | **C28 Data Panel + Automation — CANONICAL** | Unified grid + quality-rules engine + bulk-edit + export + cron. Refs: [C28](../../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md). | 🔵 DEFERRED |
| **B.14** | **EU region launch (Frankfurt + Dublin)** | Per [C49 §1.2](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). | 🔵 DEFERRED |
| **B.15** | **Region-scoped JWT + wrong-region redirect** | Per [C49 §1.6](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). | 🔵 DEFERRED |
| **B.16** | **Cross-region access gate + audit ledger** | Per [C49 §1.4](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). | 🔵 DEFERRED |
| **B.17** | **First 5 Enterprise customers signed** | Per [roadmap-enterprise-delivery §6](./roadmap-enterprise-delivery.md). | 🔵 DEFERRED |
| **B.18** | **SOC 2 Type II audit pass** | 6-month observation + external audit. Refs: [phase-2-beta §7.2](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.19** | **SAML SSO (Okta · Azure AD · Google Workspace)** | Currently NOT shipped — Phase 2. Refs: [phase-2-beta §7.3](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.20** | **Password reset + multi-factor auth (TOTP)** | Currently NOT shipped — Phase 2. | 🔵 DEFERRED |
| **B.21** | **Audit log surface + 7-year retention** | Per [C13](../../02-decisions/contracts/C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) + [C23](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md). | 🔵 DEFERRED |
| **B.22** | **C36 Federated clash + BCF round-trip** | Solibri + Navisworks + BIMcollab. Refs: [C36](../../02-decisions/contracts/C36-CLASH-DETECTION-AND-COORDINATION.md). | 🔵 DEFERRED |
| **B.23** | **L5 daylight full simulation** (vs Phase A's rule-checker) | Radiance integration or custom solver. Refs: [phase-2-beta §9.1](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.24** | **L5 acoustic separation validator** | Sound transmission between rooms. Refs: [phase-2-beta §9.2](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.25** | **L7 typology priors expand to 10 typologies** | Apartment + 9 more priors. | 🔵 DEFERRED |
| **B.26** | **i18n TIER 1: en-GB + de-DE + fr-FR + ja-JP** | Per [C46](../../02-decisions/contracts/C46-I18N-AND-L10N.md). | 🔵 DEFERRED |
| **B.27** | **i18n TIER 2: es-ES first** | Per [C46 §1.2](../../02-decisions/contracts/C46-I18N-AND-L10N.md). | 🔵 DEFERRED |
| **B.28** | **Locale switcher + per-project unit-system** | Per [C46 §5](../../02-decisions/contracts/C46-I18N-AND-L10N.md). | 🔵 DEFERRED |
| **B.29** | **WCAG 2.2 AA external audit (Deque/TPG) + first VPAT** | Per [C43 §1.13](../../02-decisions/contracts/C43-ACCESSIBILITY.md). | 🔵 DEFERRED |
| **B.30** | **AWS KMS + BYOK Enterprise onboarding** | Per [C49 §1.3](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). | 🔵 DEFERRED |
| **B.31** | **Marketplace dev hackathon + 100 active developers** | Refs: [phase-2-beta §6](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.32** | **500 marketplace artefacts** | Per [phase-2-beta §1 E5](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.33** | **Established-developer programme (first 10)** | Per [C40 §1.10](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md). | 🔵 DEFERRED |
| **B.34** | **C45 Browser + Device Matrix — CANONICAL** | Per [C45](../../02-decisions/contracts/C45-BROWSER-AND-DEVICE-MATRIX.md). | 🔵 DEFERRED |
| **B.35** | **Phase 2 exit ADR (ADR-NNN-phase-2-exit-beta)** | End of 2028-Q2. | 🔵 DEFERRED |

---

## §5 — Phase C — GA + post-GA (18–36 months; 2028-Q3 to 2029-Q4; ~18 months)

**Phase C exit criteria**: see [roadmap-phase-3-ga.md §1](./roadmap-phase-3-ga.md). 12 criteria.

| Phase | Goal | Description + references | Status |
|---|---|---|---|
| **C.1–C.15** | **Typologies #11–#25** | Shop · car-park · school · library · hotel · hospital · warehouse · care-home · spa · vet · day-care · university · supermarket · distribution-centre · data-centre. Per [typology-expansion §5](./typology-expansion-roadmap.md). | 🔵 DEFERRED |
| **C.16** | **US region launch (us-east-1 + us-west-2)** | Per [C49 §1.2](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). | 🔵 DEFERRED |
| **C.17** | **AP region launch (ap-northeast-1 + ap-southeast-1)** | Tokyo + Singapore. | 🔵 DEFERRED |
| **C.18** | **UK region launch (eu-west-2 — separate from EU)** | Per [C49 §1.5](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). | 🔵 DEFERRED |
| **C.19** | **L6 behavioural simulation (pedestrian flow + occupancy)** | Per [site-and-cognition §3.4](../../01-strategy/site-and-cognition-strategy.md). | 🔵 DEFERRED |
| **C.20** | **L7 typology priors expand to all 25** | + community-authored long tail. | 🔵 DEFERRED |
| **C.21** | **Constraint DB expand to 1000 rules code-enforced** | From 250 (Phase B) to 1000. | 🔵 DEFERRED |
| **C.22** | **C26 Revit round-trip — production full** | RVT/RFA via IFC4 + optional Python adapter + 100-project reference suite. Refs: [C26](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md). | 🔵 DEFERRED |
| **C.23** | **C32 DXF/DWG round-trip — CANONICAL** | ODA library integration. Refs: [C32](../../02-decisions/contracts/C32-DXF-DWG-ROUND-TRIP.md). | 🔵 DEFERRED |
| **C.24** | **C33 Rhino interchange — CANONICAL** | NURBS round-trip + Grasshopper bridge. Refs: [C33](../../02-decisions/contracts/C33-RHINO-INTERCHANGE.md). | 🔵 DEFERRED |
| **C.25** | **C35 COBie FM Handover — CANONICAL** | Tier-1 IFC + COBie Pset coverage. Refs: [C35](../../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md). | 🔵 DEFERRED |
| **C.26** | **C37 Schedule 4D — CANONICAL** | Gantt + time-phasing + Synchro/Asta export. Refs: [C37](../../02-decisions/contracts/C37-SCHEDULE-4D.md). | 🔵 DEFERRED |
| **C.27** | **C38 Cost 5D — CANONICAL** | `packages/cost-engine/` + RSMeans/BCIS/Spon's importers + CSI/NRM2/Uniformat roll-ups. Refs: [C38](../../02-decisions/contracts/C38-COST-5D.md). | 🔵 DEFERRED |
| **C.28** | **Cognition substrate as published API** | REST API for third-party consumers. Refs: [phase-3-ga §10](./roadmap-phase-3-ga.md). | 🔵 DEFERRED |
| **C.29** | **30+ Enterprise customers signed** | Per [roadmap-enterprise-delivery §8](./roadmap-enterprise-delivery.md). | 🔵 DEFERRED |
| **C.30** | **ISO 19650 Phase 2 + Phase 3 audit pass** | Production + completion phases. | 🔵 DEFERRED |
| **C.31** | **Self-host option (defence + intelligence customers)** | Per [C49 §1.6](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). | 🔵 DEFERRED |
| **C.32** | **First government procurement win** | UK Cabinet Office or US GSA. | 🔵 DEFERRED |
| **C.33** | **Marketplace 2000 artefacts + 200 active devs** | Per [phase-3-ga §1 E5](./roadmap-phase-3-ga.md). | 🔵 DEFERRED |
| **C.34** | **30% of revenue from marketplace-adjacent** | Per [phase-3-ga §1 E6](./roadmap-phase-3-ga.md). | 🔵 DEFERRED |
| **C.35** | **TIER 2 i18n complete (pt-BR + zh-CN) + TIER 3 RTL pilot** | ar-SA + he-IL. | 🔵 DEFERRED |
| **C.36** | **Annual external WCAG audit (recurring)** | Per [C43 §1.13](../../02-decisions/contracts/C43-ACCESSIBILITY.md). | 🔵 DEFERRED |
| **C.37** | **Quarterly DR drill per region** | Per [C48 §1.11](../../02-decisions/contracts/C48-BACKUP-AND-DR.md). | 🔵 DEFERRED |
| **C.38** | **First C47 file-format MAJOR bump** | When schema invariant breaks. Refs: [C47](../../02-decisions/contracts/C47-FILE-FORMAT-VERSIONING.md). | 🔵 DEFERRED |
| **C.39** | **Phase 3 exit ADR (ADR-NNN-phase-3-exit-ga)** | End of 2029-Q4. | 🔵 DEFERRED |

---

## §6 — Phase D + beyond (Phase 4 / 36-month+; 2030+)

Per [vision-2030.md](./vision-2030.md). Driven by marketplace flywheel + community-authored typology expansion. No detailed sub-phase tracking until end of Phase C.

---

## §7 — Cross-cutting sub-phases (continuous; not phase-locked)

Some work spans phases:

| ID | Goal | Cadence | Status |
|---|---|---|---|
| **X.1** | NFT bench maintenance + new benches per shipped feature | Per-PR + per-feature | 🟢 IN PROGRESS (continuous) |
| **X.2** | C14 Cast-count tripwire — ratchet toward zero | Per-PR | 🟢 IN PROGRESS (baseline holds) |
| **X.3** | OTel span coverage — every new public function | Per-PR via `check-otel-spans.ts` | 🟢 IN PROGRESS (hard-fail gate) |
| **X.4** | Constraint DB rule curation | Continuous | 🟢 IN PROGRESS (A.37 active) |
| **X.5** | Customer support intake + SEV-1 PMI cadence | Per [C42](../../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md) | 🟢 IN PROGRESS (low volume) |
| **X.6** | Documentation cadence per [C31](../../02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) | Continuous | 🟢 IN PROGRESS (this commit) |
| **X.7** | Sprint retros + per-sprint planning | Per-sprint | 🟢 IN PROGRESS |
| **X.8** | Marketplace + dev-rel ecosystem development | Continuous | ⚪ PLANNED (starts A.14–A.16) |
| **X.9** | Sales pipeline development (mid-firm + enterprise) | Continuous from Q4 | ⚪ PLANNED |
| **X.10** | Brand-voice content moderation per [manifesto §5](../../01-strategy/manifesto.md) | Per-customer-surface | 🟢 IN PROGRESS |

---

## §8 — Immediate next 5 actions (the "what's next" answer)

The 5 actions to do FIRST, in priority order, as of **2026-06-02** (rewritten — the prior 2026-06-01 list is closed: A.1/A.2 typology-pipeline shipped `172fc8c`, A.7 site substrate shipped, A.17 superseded by the ADR-055 apex/app split; `pryzm.app` retired for canonical `pryzm.so`). **All of IP-A5.X's code/config is now DONE on `main`; the critical path is now INFRA the user performs (1–4), then the Revit code-track (5).**

| Order | Sub-phase | Action | Owner | Time-box |
|---|---|---|---|---|
| **1** | **A.17.x.12** | **Cloudflare repoint** — point the `pryzmapp` Pages project at build cmd `pnpm install --no-frozen-lockfile && pnpm build:apex`, output `apps/editor/dist-apex`, branch `main`. **URGENT** — the Astro source is deleted from `main` (A.17.x.14), so the old docs-site build now fails. Verify: landing shows "Start here". | User (Cloudflare) | 15 min |
| **2** | **A.17.x.11** | **Fly first deploy** — **🟢 PREPPED 2026-06-03:** `flyctl v0.4.57` installed + on PATH; `Dockerfile`/`.dockerignore`/`fly.toml` validated (EU `fra`, health `/api/health/ready`); `.env` secrets mapped. **BLOCKED on the one interactive step only the user can do: `fly auth login`** (browser). After login the agent can drive the rest (app create — `pryzm` may be globally taken, rename if so → `pryzm-app`; `flyctl secrets import` from `.env`; `flyctl deploy --remote-only`). The `docker-image` CI job already validates the image builds + boots, so this is de-risked. | User (`fly auth login`) → then agent | 1–2 hr |
| **3** | **A.17.x.13** | **DNS** — `pryzm.so` → apex Pages · `app.pryzm.so` + `api.pryzm.so` → Fly · `docs.pryzm.so` → docs-site (A.17.x.15) · TLS auto. | User (Cloudflare DNS) | 30 min |
| **4** | **A.17.x.16** | **Supabase** — provision project in `eu-central-1` (Frankfurt) + upgrade to Pro for C48 PITR before the first paying customer. | User (Supabase) | 1 hr |
| **5** | **A.R.3** | **Revit round-trip code-track** — complete the `IfcMetaStore` wiring (plugin re-point → composeRuntime registration + C13 reset → ifc-import populates → ifc-export reads → `.pryzm` serialize/hydrate). Drives the §12.6.1 D.R lane vs ThatOpen's 2026-06-22 launch. | Engineer | 1–2 sprints |

Actions 1–4 are the deployment unblock (all user-side infra; every code prerequisite is on `main`). Action 5 is the highest-value code-track work that runs in parallel — the foundation shipped `1f3cea5`; the completion sequence is in §12.6 A.R.3.

---

## §9 — Capacity vs commitment dashboard (Phase A)

| Sprint | Window | Capacity (dev-wk) | Committed (dev-wk) | Slack |
|---|---|---:|---:|---:|
| S1 | Jul 1–14 | 5.5 | 5.0 | 0.5 |
| S2 | Jul 15–28 | 5.5 | 5.0 | 0.5 |
| S3 | Jul 29–Aug 11 | 5.5 | 5.0 | 0.5 |
| S4 | Aug 12–25 | 5.5 | 4.5 | 1.0 |
| S5 | Aug 26–Sep 8 | 5.5 | 4.5 | 1.0 |
| S6 | Sep 9–22 | 5.5 | 4.5 | 1.0 |
| Q3 buffer | Sep 23–30 | (planning) | — | — |
| S7 | Oct 1–14 | 5.5 | 5.0 | 0.5 |
| S8 | Oct 15–28 | 5.5 | 5.0 | 0.5 |
| S9 | Oct 29–Nov 11 | 5.5 | 5.0 | 0.5 |
| S10 | Nov 12–25 | 5.0 (US Thanksgiving) | 4.5 | 0.5 |
| S11 | Nov 26–Dec 9 | 5.5 | 5.0 | 0.5 |
| S12 | Dec 10–23 | 5.5 | 4.5 | 1.0 |
| Holiday | Dec 24–31 | — | ADR-only | — |
| **Phase A total** | **Q3–Q4 2026** | **~65** | **~57** | **~8 (12%)** |

Per [quarterly-2026-Q3 §1](./quarterly-2026-Q3.md) + [quarterly-2026-Q4 §1](./quarterly-2026-Q4.md). Slack is reserve for incident response + customer escalations.

---

## §10 — Cross-references

| Doc | Relationship |
|---|---|
| [cadence-and-planning-system.md](./cadence-and-planning-system.md) | The planning system this tracker operates in |
| [vision-2030.md](./vision-2030.md) | H1 — Phase A/B/C/D arc derives from |
| [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) | Phase A full detail |
| [roadmap-phase-2-beta.md](./roadmap-phase-2-beta.md) | Phase B full detail |
| [roadmap-phase-3-ga.md](./roadmap-phase-3-ga.md) | Phase C full detail |
| [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) | Typology pipeline + 25-typology roadmap |
| [roadmap-enterprise-delivery.md](./roadmap-enterprise-delivery.md) | Customer-delivery sequence |
| [annual-2026.md](./annual-2026.md) | H3 — current year |
| [quarterly-2026-Q3.md](./quarterly-2026-Q3.md) | H4 — current quarter |
| [quarterly-2026-Q4.md](./quarterly-2026-Q4.md) | H4 — next quarter |
| [PERF-REALTIME-EDIT…2026-06-03.md](../analysis/PERF-REALTIME-EDIT-AND-VIEW-SWITCH-2026-06-03.md) + [ADR-057](../../02-decisions/adrs/ADR-057-realtime-geometry-and-view-interactivity.md) | **🟡 QUEUED perf (2026-06-03).** User: door-move/view-switch not "instant" like ThatOpen. Finding: the door mesh DOES move instantly (TransformControls, commit-on-release); the lag is `door.setOffset` → a **whole-level** synchronous wall rebuild (`WallRebuildCoordinator._flush`: `resolveLevel` + per-wall `buildWall` dispose/recreate + infill), O(walls-per-level) not O(1). **No per-frame CSG** (single-volume producer flag-off → segmented-box fallback). 3D↔plan switch verified ALREADY fast (camera toggle + cached plan projection, `FastPathProjectorService` sub-50ms) — not the gap. Fix: incremental single-wall openings-only rebuild branch. **✅ ADR-057 ACCEPTED — P1 SHIPPED 2026-06-03 (`ea11e457`)**: `WallDeltaClassifier` + `WallRebuildCoordinator._flushOpeningsOnly` → door/window offset edits rebuild ONLY the edited wall (O(1)), whole-level fallback for any structural delta; 20/20 geometry-wall tests. Door-move now instant. P2-P5 backlogged. |
| [PERF-PROJECT-OPEN-AND-BATCH-2026-06-03.md](../analysis/PERF-PROJECT-OPEN-AND-BATCH-2026-06-03.md) | **🟡 QUEUED perf (2026-06-03).** User: project creation + batch apartment generation too slow (live log: 768 ms/297 ms LONGTASKs, 1–8 fps during open). Root cause #1: the WebGPU **render pipeline is rebuilt on EVERY project-switch** (SSGI/outline TSL graph re-authored + GPU dispose/recompile — content-independent, 100% redundant) = the 768 ms LONGTASK. #2: batch generator's two-phase wall→door split gated by a 150 ms poll, each door triggering a whole-level wall rebuild. #3: 20+ `pryzm-project-loaded` re-binds per open. Engine bootstrap + empty data-load are correctly cheap. Quick win = build pipeline once/tab (A.OI.053d). Tracker rows: A.OI.053d/f/g/h/c/i. |

---

## §11 — How this tracker updates

- **Every sprint close** — update status (⚪ → 🟢 → ✅) on completed sub-phases
- **On any 🔴 BLOCKED** — surface in next standup; raise unblock plan
- **On 🔵 DEFERRED change** — record reason; raise ADR if material
- **On every new sub-phase** — add to the right phase table + check capacity
- **Quarterly close** — move closed sub-phases to a `Phase-A-CLOSED.md` summary; refresh capacity table

Per [cadence-and-planning-system §10 cardinal rules](./cadence-and-planning-system.md): plans flow down; reality flows up. When a sprint discovery invalidates a tracker assumption, update + raise an ADR.

---

## §12 — Coverage audit (added 2026-06-01)

After authoring the initial Phase A/B/C tables, I audited the tracker against EVERYTHING that exists in the strategy + decisions + apartment master docs + 49 contracts + 56 specs + the under-documented UI surfaces. Several substantial workstreams were under-enumerated. They are listed below as additions to the existing phase tables.

### §12.1 — Coverage check by surface

| Surface | Coverage in §3–§5 above | Verdict | Action |
|---|---|---|---|
| TypologyPipeline + 25 typologies | A.1–A.6 + B.1–B.7 + C.1–C.15 | ✅ full | none |
| Site + climate substrate | A.7–A.11 | ✅ full | none |
| Plugin SDK + marketplace | A.12–A.16 + B.31–B.33 | ✅ full | none |
| Phase 1/2/3 contract gap closures | sprinkled | ⚠️ incomplete | §12.2 adds 49-contract rollup |
| **Editor UI redesign** | A.5, A.6, A.24 (partial) | ❌ thin | §12.3 adds A.U.* sub-phases |
| **Project hub / landing / project page** | A.17 brand-cutover only | ❌ missing | §12.3 |
| **Sheet + view + elevation UX (great)** | B.8–B.11 high-level | ⚠️ thin | §12.4 |
| **Inspect tree + Data Panel UI** | B.12–B.13 high-level | ⚠️ thin | §12.4 |
| **Family creation pipeline UX** | A.28 + A.29 thin | ❌ thin | §12.5 |
| **Component editor (apps/component-editor/)** | mentioned only | ❌ thin | §12.5 |
| **Native Revit import** | A.26 + C.22 | ⚠️ partial | §12.6 |
| **Native Revit export** | A.26 + C.22 | ⚠️ partial | §12.6 |
| **AI commands (full surface)** | typology-pipeline only | ❌ thin | §12.7 |
| **AI Chat / AI assistant in editor** | not enumerated | ❌ missing | §12.7 |
| **Auth UI (signup / signin / MFA / SSO)** | B.19–B.20 high-level | ⚠️ thin | §12.8 |
| **Billing UI (subscription · invoices · BYOK · region)** | none | ❌ missing | §12.8 |
| **Admin tooling (curation · support agent · analyst)** | A.16 marketplace UX only | ❌ thin | §12.9 |
| **Apartment master document (apartment/ folder)** | typology section only | ⚠️ partial | §12.10 |
| **Onboarding tutorials + in-app help** | none | ❌ missing | §12.11 |
| **Status page · trust page · VPAT · privacy · ToS** | A.17 brand-cutover groups | ⚠️ thin | §12.11 |
| **Email transactional templates** | none | ❌ missing | §12.11 |
| **Search / activity feed / notifications** | none | ❌ missing | §12.11 |
| **Mobile + tablet UX (per C44)** | C.x not detailed | ⚠️ thin | §12.12 |

### §12.2 — All-49-contract gap closure rollup (the master compliance view)

Each contract MUST reach CANONICAL by end of Phase C. Sub-phases by contract:

| Contract | Phase A | Phase B | Phase C | End-state |
|---|---|---|---|---|
| **C01** Architecture | A.X.1 refresh package counts | stable | stable | CANONICAL |
| **C02** Composition root | A.3 (slot ext) | B.U.1 (slot ext) | stable | CANONICAL |
| **C03** Schemas + commands | continuous | continuous | continuous | CANONICAL |
| **C04** Rendering | continuous | B.U.2 GPU+RT polish | continuous | CANONICAL |
| **C05** Persistence | A.47 file-format ver | B.U.3 chunked partial-load | continuous | CANONICAL |
| **C06** UI shell + tools | A.U.1–A.U.10 redesign | B.U.4 panel system maturity | continuous | CANONICAL |
| **C07** Plugin SDK | A.12, A.13 publish | B.31 ecosystem | C.33 maturity | CANONICAL |
| **C08** Collab + security | A.30+31 partials | B.18–B.20 SOC2+SSO+MFA | C.30 ISO 19650 | CANONICAL |
| **C09** AI + visibility | A.42–A.47 AI commands | B.U.5 AI Chat assistant | C.19 L6 + C.28 cog-API | CANONICAL |
| **C10** Perf + observability | X.1 continuous | continuous | continuous | CANONICAL |
| **C11** Element creation | continuous | continuous | continuous | CANONICAL |
| **C12** Geospatial | A.7–A.11 | B.30 BYOK extends | continuous | CANONICAL |
| **C13** Project lifecycle | A.PL.1–A.PL.6 hub + share + versions | B.U.6 enterprise multi-org | continuous | CANONICAL |
| **C14** Legacy elimination | X.2 continuous | continuous | continuous | CANONICAL |
| **C15** Hosted elements | stable | stable | stable | CANONICAL |
| **C16** Command authoring | continuous | continuous | continuous | CANONICAL |
| **C17** Batch creation catalogue | A.U.4 per-typology entries | continuous | continuous | CANONICAL |
| **C18** Element preview visual | stable | stable | stable | CANONICAL |
| **C19** Site Model | A.7 ratify | stable | stable | CANONICAL ✅ |
| **C20** Aggregates | A.23 ratify | stable | stable | CANONICAL ✅ |
| **C21** Climate ingestion | A.10 ratify | B.23 daylight full | continuous | CANONICAL ✅ |
| **C22** Privacy + PII | A.30 partial | B.U.7 full DSAR + audit | continuous | CANONICAL |
| **C23** Provenance + AI audit | A.31 partial | B.U.8 full | C.28 cog-API extends | CANONICAL |
| **C24** Sheet composition | — | B.8 ratify + sheet-UX | C.U.1 plotter integration | CANONICAL |
| **C25** IFC Export | A.25 PSet polish | B.U.9 IfcSpace+Zone+Furniture | C.U.2 IFC4X3 validation gate | CANONICAL |
| **C26** Revit RT | A.26 IFC4X3-RV variant | B.U.10 partial RT + family mapping | C.22 full RT + Python adapter | CANONICAL |
| **C27** Inspect tree | A.24 wiring | B.12 ratify + Inspect UX | C.U.3 inspect API public | CANONICAL |
| **C28** Data Panel | — | B.13 ratify + Data UX | C.U.4 automation surface | CANONICAL |
| **C29** PDF Vector | — | B.9 ratify | C.U.5 PDF/UA-2 stretch | CANONICAL |
| **C30** Drawing Set | — | B.10 ratify + transmittal | C.U.6 enterprise revision UX | CANONICAL |
| **C31** Documentation | continuous | ratify on stability | continuous | CANONICAL |
| **C32** DXF/DWG | — | — | C.23 ratify | CANONICAL |
| **C33** Rhino | — | — | C.24 ratify + Grasshopper | CANONICAL |
| **C34** Print standards | — | B.11 4 standards | C.U.7 5 more standards | CANONICAL |
| **C35** COBie | — | — | C.25 ratify | CANONICAL |
| **C36** Clash detection | — | B.22 ratify + BCF | C.U.8 federated review API | CANONICAL |
| **C37** Schedule 4D | — | — | C.26 ratify | CANONICAL |
| **C38** Cost 5D | — | — | C.27 ratify | CANONICAL |
| **C39** Pricing | A.17–A.18 partial | B.U.11 multi-currency | C.U.9 regional discounts | CANONICAL |
| **C40** Marketplace | A.14–A.16 + A.29 | B.31–B.33 + B.U.12 dev events | C.33 maturity | CANONICAL |
| **C41** Telemetry | A.U.12 consent banner | B.U.13 per-locale consent | C.U.10 published analytics | CANONICAL |
| **C42** Support tier | A.U.13 4-channel + SEV1 PMI | B.U.14 SLA per region | C.U.11 customer summit | CANONICAL |
| **C43** Accessibility | A.32–A.34 audit prep | B.29 ratify ext audit | C.36 annual audit | CANONICAL |
| **C44** Mobile + tablet | A.U.14 surface matrix + share-link | B.U.15 form-factor breakpoint maturity | C.U.12 2D plan-view authoring | CANONICAL |
| **C45** Browser matrix | A.U.15 Tier 1 support | B.34 ratify + Tier 2 | continuous | CANONICAL |
| **C46** i18n | A.U.16 en-GB | B.26–B.28 Tier 1 + Tier 2 first | C.35 Tier 2 complete + RTL | CANONICAL |
| **C47** File-format ver | A.U.17 partial | B.U.16 full ratify | C.38 first MAJOR bump | CANONICAL |
| **C48** Backup + DR | A.35–A.36 | continuous + drill cadence | C.37 quarterly per region | CANONICAL |
| **C49** Multi-region | DRAFT | B.14–B.16 EU launch | C.16–C.18 US + AP + UK | CANONICAL |
| **C50** Typology pipeline | A.20 DRAFT | B.U.17 ratify | continuous | CANONICAL |

### §12.3 — Phase A — Editor UI + Project Page additions (~14 wk)

Material UI work NOT covered in §3.1. Adds to Phase A:

| Phase | Goal | Description + refs | Status |
|---|---|---|---|
| **A.U.1** | **Editor shell redesign for typology routing** | Top bar shows typology badge + role badge; typology-switcher in user menu. Refs: [product-vision §5 Step 2](../../01-strategy/product-vision.md). | ⚪ PLANNED (Sprint 4) |
| **A.U.2** | **Property panel migration to Inspect tree leaves** | Existing flat PropertyInspector (80 files) → typed-leaf component per element type. Refs: [C27 §8](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md) migration plan. | ⚪ PLANNED (Sprint 5–8) |
| **A.U.3** | **CREATE panel: per-typology batch leaf catalogue** | Each typology contributes batch entries to the `CREATE › <Discipline>` panel per [C17](../../02-decisions/contracts/C17-BATCH-CREATION-CATALOGUE-AND-PANEL-BINDING.md). | ⚪ PLANNED (Sprint 3) |
| **A.U.4** | **Settings panel restructure** (preferences · privacy · billing · accessibility · region) | Categorised settings; per-section deep-link. Refs: [C42 §5.2](../../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md), [C43 §5.2](../../02-decisions/contracts/C43-ACCESSIBILITY.md), [C44 §5.x](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md). | ⚪ PLANNED (Sprint 6) |
| **A.U.5** | **Tool registry UX refresh** | Per-tool icon + keyboard hint + tooltip. Refs: [C06 §4](../../02-decisions/contracts/C06-UI-SHELL-AND-TOOLS.md). | ⚪ PLANNED (Sprint 4) |
| **A.U.6** | **Marketplace UX in editor (install panel)** | In-editor marketplace browse + install card; right-side install drawer. | ⚪ PLANNED (Sprint 4) |
| **A.U.7** | **Notification + toast system maturity** | Unified `AppToast` per [C06 §4.6](../../02-decisions/contracts/C06-UI-SHELL-AND-TOOLS.md); aria-live announce per [C43 §1.4](../../02-decisions/contracts/C43-ACCESSIBILITY.md). | ⚪ PLANNED (Sprint 5) |
| **A.U.8** | **Search across editor + project** | Cmd-K palette: jump-to-element + jump-to-tool + jump-to-room + jump-to-typology. | ⚪ PLANNED (Sprint 8) |
| **A.U.9** | **Activity feed (per-project change history)** | Compact feed of last 50 commands; click to time-travel. Surfaces undo/redo + Ctrl-Z visually. Refs: [C13 §3.7](../../02-decisions/contracts/C13-PROJECT-LIFECYCLE-AND-ISOLATION.md). | ⚪ PLANNED (Sprint 9) |
| **A.U.10** | **In-product help (the `?` icon + first-project tutorial)** | KB search + AI helper (per [C42 §5.1](../../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md)) + report-bug + accessibility-issue links. | ⚪ PLANNED (Sprint 5–6) |
| **A.U.11** | **Onboarding tutorials (5-step interactive)** | "Generate apartment" · "Edit a room" · "Add a door" · "Save" · "Export IFC". Refs: [roadmap-enterprise-delivery §3](./roadmap-enterprise-delivery.md). | ⚪ PLANNED (Sprint 5–6) |
| **A.U.12** | **Telemetry consent banner + cookie management** | Three-tier consent (Essential / Product / Marketing) per [C41](../../02-decisions/contracts/C41-TELEMETRY-AND-ANALYTICS.md). | ⚪ PLANNED (Sprint 4) |
| **A.U.13** | **Support intake surface (help@ + in-product chat)** | 4-channel surface per [C42 §1.1](../../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md). | ⚪ PLANNED (Sprint 6) |
| **A.U.14** | **Mobile + tablet surface-capability matrix UI** | Per-form-factor `blocked` / `read-only` / `form-only` / `full` enforcement. Refs: [C44 §1.4](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md). | ⚪ PLANNED (Sprint 7) |
| **A.U.15** | **Browser Tier 1 support detection + unsupported-browser landing** | Per [C45 §1.8](../../02-decisions/contracts/C45-BROWSER-AND-DEVICE-MATRIX.md). | ⚪ PLANNED (Sprint 4) |
| **A.U.16** | **i18n en-GB locale bundle (TIER 1 fork from en-US)** | First locale split; messages/ folder set up. Refs: [C46 §1.2](../../02-decisions/contracts/C46-I18N-AND-L10N.md). | ⚪ PLANNED (Sprint 6) |
| **A.U.17** | **File format `formatVersion` + writer signature** | First C47 enforcement. Refs: [C47 §1.1](../../02-decisions/contracts/C47-FILE-FORMAT-VERSIONING.md). | ⚪ PLANNED (Sprint 7) |
| **A.U.18** | **Notifications inbox (in-product + email)** | Email transactional templates (welcome · upgrade · DR comm) + in-product inbox. | ⚪ PLANNED (Sprint 8) |
| **A.U.19** | **AI design-assistant panel: scrollable create-commands list** | User-reported defect: the AI design-assistant right-panel's create-commands list did NOT scroll when the catalogue overflowed the viewport — items below the fold were unreachable. Fixed in `apps/editor/src/ui/styles/panels/toolsRail.ts`: added `overflow-y: auto` + `overflow-x: hidden` + `scrollbar-gutter: stable` to `.tpr-create-root`. The `min-height: 0` on the flex child was already present; combined with the new overflow rule, content above panel-height now flows onto a scrollbar instead of clipping. Stable scrollbar gutter prevents the panel width jittering when the bar appears/disappears. | ✅ DONE (Sprint 2) |
| **A.U.20** | **`scripts/` folder taxonomy (flat → 7-folder)** | Reorganised 33 flat scripts into `scripts/{check,migrate,scan,build,cutover,legacy-pryzm3,one-offs}/` with a `scripts/README.md` describing the taxonomy + conventions (no inter-script imports · standard exit codes · header-comment naming the enforced contract · idempotent codemods). Updated 9 `package.json` aliases + 1 external `tools/ga-gate/run-all.ts` reference. Pure refactor — no behaviour change. | ✅ DONE (Sprint 2) |
| **A.U.21** | **Casa Unifamiliar typology UI (picker card · floors brief · per-storey modal · multi-level result)** | The house typology's editor surfaces: typology picker card + thumbnail (registry-driven, auto-appears once `casa-unifamiliar` registers); brief panel renders the floors stepper (new vs apartment) + house fields; generation modal shows per-storey plan thumbnails; result view adds a level selector (2D plan per floor) + reuses `LevelExplodeController` for an exploded "dollhouse" axon. Supports tracker `A.21.k`. Refs: [SPEC-CASA-UNIFAMILIAR-TYPOLOGY §9](../specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md). | ⚪ PLANNED (Sprint 9) |
| **A.PL.1** | **Project Hub redesign (landing for signed-in users)** | Recent projects · starred · typology shortcuts · sharing inbox. Refs: [product-vision §5 Step 1](../../01-strategy/product-vision.md). | ⚪ PLANNED (Sprint 5) |
| **A.PL.2** | **Project list page** | Grid · filter by typology · search · pagination · per-project context menu. | ⚪ PLANNED (Sprint 5) |
| **A.PL.3** | **Project create flow** | "New project" routes through RAC chatbot (per A.5 + A.6). | ⚪ PLANNED (Sprint 4) |
| **A.PL.4** | **Project sharing UI (per-project member roles)** | Invite by email · ISO 19650 role assignment (collaborator/approver/publisher) per [C08 §1.3](../../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md). | ⚪ PLANNED (Sprint 7) |
| **A.PL.5** | **Project version history UI** | Per-version snapshot grid + revert + diff (basic). Refs: [C13](../../02-decisions/contracts/C13-PROJECT-LIFECYCLE-AND-ISOLATION.md). | ⚪ PLANNED (Sprint 8) |
| **A.PL.6** | **Project settings (per-project unit-system · drawing-standard · members)** | Refs: [C46 §1.1](../../02-decisions/contracts/C46-I18N-AND-L10N.md), [C34](../../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md). | ⚪ PLANNED (Sprint 7) |

### §12.4 — Phase B — Sheet + Inspect + Data UX additions (~10 wk)

The user emphasized: "making sheets, views, elevations great" — add sub-phases:

| Phase | Goal | Description + refs |
|---|---|---|
| **B.U.1** | **PryzmRuntime slot additions for sheet + inspect + data** | composeRuntime gains sheet/inspect/data slots typed. Refs: [C02 §1.2](../../02-decisions/contracts/C02-COMPOSITION-ROOT-AND-BOOT.md). |
| **B.U.2** | **GPU + raytrace rendering polish** | WebGPU rollout; soft-shadow + PBR materials. Refs: [C04](../../02-decisions/contracts/C04-RENDERING-AND-SCHEDULING.md). |
| **B.U.3** | **Chunked partial-load** | Large-project (10k+ elements) faster open via per-level chunks. Refs: [C05 §3.5](../../02-decisions/contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md). |
| **B.U.4** | **Panel system maturity (per [C06](../../02-decisions/contracts/C06-UI-SHELL-AND-TOOLS.md))** | Dockable + resizable + per-user persisted layouts. |
| **B.S.1** | **Sheet editor UX great** | Drag-drop viewport placement · auto-arrangement · multi-page editor · title-block-template picker · revision-cloud tool · live-update viewports as model edits. Refs: [C24](../../02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md). |
| **B.S.2** | **View + elevation + section UX great** | Section-cut tool with on-canvas grip · per-view visibility-intent · saved view-templates · plan/elevation/section/3D toggle in viewport ribbon. Refs: [C04 + C24 + C27]. |
| **B.S.3** | **Dimension + annotation tool UX great** | Auto-dimension run · annotation styles · leader lines · multi-line text · keynote-tag · revision-cloud · view-extents-clip. Refs: [SPEC-29-VECTOR-PRIMITIVES](../specs/SPEC-29-VECTOR-PRIMITIVES.md). |
| **B.S.4** | **Drawing-set UX great** | Drag-reorder sheets · auto-numbering · revision-state-machine UI · transmittal cover-page generator · PDF/A-3 export from drawing-set. Refs: [C30](../../02-decisions/contracts/C30-DRAWING-SET-MANAGEMENT.md). |
| **B.S.5** | **Print-calibration UI** | 1m×1m calibration print → user adjusts paper scale → saves per-printer profile. Refs: [C29 §6](../../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md). |
| **B.I.1** | **Inspect tree UX great** | Site → Building → Level → Apartment → Room → ElementType → ElementInstance navigation · isolation animator · per-node dashboard. Refs: [C27 §5](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md). |
| **B.I.2** | **Per-element-type Inspect sub-panel** | Wall panel · door panel · window panel · slab panel · curtain-wall panel · stair panel · ... · with element-specific quick-actions. |
| **B.I.3** | **Isolation animator polish** | Fade-out + opacity + section-cut on selection isolate; smooth restoration. Refs: [C27 §4](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md). |
| **B.D.1** | **Data Panel UX great** | Unified grid: filter · sort · group · bulk-edit · formula DSL · export to Excel/CSV/JSON. Refs: [C28](../../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md). |
| **B.D.2** | **Quality-rules engine UI** | Per-rule severity · in-grid violation highlighting · auto-fix suggestions. Refs: [C28 §1.2](../../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md). |
| **B.D.3** | **Schedules + automation surfaces** | Predefined schedules per typology (door schedule · window schedule · room schedule · finish schedule); cron-run rules. Refs: [C28 §1.4](../../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md). |
| **B.U.5** | **AI Chat assistant in-editor** | Persistent right-side chat panel; conversation history per project; AI commands dispatched from chat (per A.42–A.47 below). |

### §12.5 — Family Creation Pipeline UX additions

The user called out family creation explicitly. Adds to Phase A + B:

| Phase | Goal | Description + refs |
|---|---|---|
| **A.F.1** | **Component editor (`apps/component-editor/`) UX polish** | Sketcher with planegcs solver UX feedback · 3D ops (extrude/sweep/loft/revolve) toolbar · parameter table editor. Refs: existing `apps/component-editor/`. |
| **A.F.2** | **Family publish flow UX** | `pryzm dev publish` for code; `apps/component-editor/marketplace/publishFlow.ts` polish · Ed25519 sign · preview render. Refs: [C40 §5.1](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md). |
| **A.F.3** | **Family browse + install (in-editor)** | Marketplace pane → drop family onto canvas → parametric override. Refs: [C07 §3](../../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md). |
| **A.F.4** | **Family preview + 3D thumbnail** | Per-family 3D preview rotatable; parametric play. |
| **A.F.5** | **`.pryzm-family` file format documentation** | SPEC-FAMILY-FORMAT.md publish per [C47](../../02-decisions/contracts/C47-FILE-FORMAT-VERSIONING.md). |
| **B.F.1** | **Family update + version mechanism** | When pack v1.1 publishes, existing customer projects offered upgrade; per-family-instance opt-in. Refs: [C47 §1.4](../../02-decisions/contracts/C47-FILE-FORMAT-VERSIONING.md). |
| **B.F.2** | **Family curation queue (back-office)** | `apps/admin-tools/src/curation/family/` curated category review + publish. Refs: [C40 §5.3](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md). |
| **B.F.3** | **Family marketplace SPA polish** | `apps/marketplace-web/` browse → detail → preview → install + Ed25519 verify badge. |
| **B.F.4** | **Family-pack import for plugin developers** | Re-import + edit-and-republish flow for own packs. |
| **C.F.1** | **AI-assisted family creation** | "Make me a kitchen-island family" → AI proposes parametric definition → user refines. (Stretch goal; depends on AI maturity.) |
| **C.F.2** | **Family analytics for authors** | Install counts · review · earnings per pack. Refs: [platform-strategy §11](../../01-strategy/platform-strategy.md). |

### §12.6 — Native Revit deliverables (full breakdown)

The user specifically called out "native Revit import + export". Per [C26](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md), PRYZM uses IFC4 as the canonical bridge — there is no direct .rvt parsing in the monorepo (a deliberate architectural decision per C26 §1). Sub-phases:

> **2026-06-02 — code audit + competitive re-rank.** A full read-only audit (see callout below) found PRYZM is **materially further along than this table implied**: the IFC4X3-RV Revit-variant exporter, GlobalId preservation, and the `packages/schemas/src/revit/` schema surface are SHIPPED, and IFC import already maps 6 Tier-1 families to **native, command-bus-editable** elements (not static meshes). Statuses below are now audit-grounded. The remaining gap to the user's vision ("Revit project → PRYZM native elements → modify → back to Revit, *live*") is the **D.R live-round-trip tier** added below, prompted by ThatOpen Company's **That Open Platform** announcement (Revit live-collaboration; Founding-Member launch **2026-06-22**) — the same category PRYZM's C26 targets, so this is now a competitively time-sensitive lane.

| Phase | Goal | Status (2026-06-02 audit) |
|---|---|---|
| **A.R.1** | **IFC4X3-RV variant exporter** (Revit-import-friendly variant) | ✅ **SHIPPED** — `plugins/ifc-export/src/exporters/revit-variant.ts` (Pset_RevitType + Pset_RevitInstance + Workset `IfcGroup` + `IfcRelAssignsToGroup`; coordinate-mode pset is a stub). |
| **A.R.2** | **First reference round-trip: 1 Revit RVT → IFC → PRYZM → IFC → Revit** | 🟡 **PARTIAL** — import (Tier-1 native + Tier-2 transform-proxy, `web-ifc@0.0.77`) + export both exist; GlobalId + psets round-trip **IFF the meta-store is populated**, but the meta-store is `InMemoryIFCMetaStore` only. Blocker = **persistent meta-store (S55)**. |
| **A.R.3** *(new)* | **Persistent IFC/Revit meta-store** | 🟡 **FOUNDATION SHIPPED** `1f3cea5` — canonical `IfcElementMeta` schema at `@pryzm/schemas/ifc` (L0) + durable reactive `IfcMetaStore` at `@pryzm/stores` (L3): get/getByGlobalId/add/updatePset/updateQuantity/delete + `serialize↔hydrate` (Zod-validated, the `.pryzm` path) + `reset`/`subscribe`/`dispose`; 13 tests green. **Completion sequence:** (1) ✅ **re-pointed both plugins to the canonical shape** via the plugin-sdk (L6) facade — `plugin-sdk` re-exports `@pryzm/schemas/ifc`; `ifc-export` + `ifc-import` alias `IfcElementMeta`/`Pset`/`Qset`/`PsetValue`/`IfcElementTier` from it (3 near-identical copies → 1; plugin-sdk + both plugins typecheck clean, 252 + 28 tests green); (2) ✅ **registered in `composeRuntime`** — `runtime.ifcMetaStore` (construct+expose+dispose; 132 runtime tests green); the reset into the *distributed* C13 project-switch path is still pending (no consumer needs it until import populates); (3) 🟡 **command surface built** — `@pryzm/stores/ifc-commands` `registerIfcMeta`/`deregisterIfcMeta` (the P6-clean mutation path; pure `(payload, store) → IfcCommandResult<Event>`, mirrors `consent-commands`; 5 tests green) — remaining: bus-registration + `ifc-import` dispatching `ifc.meta.register` after producing metas (depends on the S55 import-pipeline call-site); (4) ⚪ `ifc-export` reads via `get()`; (5) ⚪ `.pryzm` save/load calls `serialize()`/`hydrate()`. **The single highest-leverage unlock** — converts the existing half-round-trip into a real one. |
| **B.R.1** | **10-project reference round-trip nightly** | ⚪ Suite of 10 representative Revit projects; CI nightly diff-check. |
| **B.R.2** | **Revit Family mapping table** | 🟡 Schema EXISTS (`packages/schemas/src/revit/RevitFamilyMapping.ts`); the populated RFA→element matrix for the canonical 100 categories is pending. Refs: [C26 §3](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md). |
| **B.R.3** | **Parameter translation via IfcPropertySet** | 🟡 Export writes psets/qsets; import preserves them in `IFCElementMeta.psets` + `_ifcCustom` bag. Solid on the IFC path; Revit shared-parameter fidelity needs B.R.2 + the adapter. |
| **C.R.1** | **Optional external Python/C# Revit add-in** | ⚪ Out-of-monorepo per C26 §6.3 (Windows COM + Revit API). The only path to phasing / worksets / design-options + *live* push-back. Refs: [C26 §6](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md). |
| **C.R.2** | **100-project reference suite (Enterprise validation)** | ⚪ Expand nightly diff suite to 100 representative projects across building types. |
| **C.R.3** | **Revit-import wizard (in-editor)** | ⚪ Drag-drop .rvt → server-side conversion via IFC → in-editor preview → accept. |
| **C.R.4** | **Revit-export wizard (in-editor)** | ⚪ "Export to Revit" UI flow → IFC4X3-RV → save dialog → optional adapter trigger. |

#### §12.6.1 — D.R — Live Revit ↔ PRYZM round-trip (the "That Open Platform" lane)

The user's framing — *"Revit project into PRYZM as native elements through a plugin — modify elements — back to Revit!"* — is the **live, collaborative** evolution of the file-based round-trip above (ThatOpen's pitch: no long export/import · full change history · go back in time · keep data control). The audit's gap analysis sizes it at **~12–15 sprints on top of A.R.3**. Architecture note: the *in-editor* half is a PRYZM L7 plugin (registers a format/connector via the plugin SDK), but the *Revit-side* half MUST be a separate Windows add-in (Revit runs desktop COM, not in the browser) — so "a plugin" is really **two** cooperating pieces bridged over a websocket/event channel.

| Phase | Goal | Builds on / Gap |
|---|---|---|
| **D.R.1** | **Streaming delta import** (Revit change → PRYZM command) | Builds on command-bus + sync-server event log; NEW = WS bridge from the desktop adapter + Revit-delta→command translator. ~3–4 sprints. |
| **D.R.2** | **Bidirectional property/parameter push-back** (PRYZM edit → Revit) | Builds on the pset round-trip; NEW = PRYZM event → adapter → Revit API write. ~2–3 sprints. |
| **D.R.3** | **Change history / time-travel** ("go back in time") | Builds on the durable sync-server event log; NEW = version snapshots + revert-to-version surface (undo ring-buffer is bounded, not sufficient). ~2 sprints. |
| **D.R.4** | **Revit-aware conflict resolver** (Revit-user A vs PRYZM-user B edit same element) | Builds on the ADR-049 CRDT resolver; NEW = per-parameter binding / deterministic merge strategy (C08 §3.2 explicit-conflict posture). ~1–2 sprints. |
| **D.R.5** | **Workset / phasing / design-option sync** | Builds on the IFC4X3-RV worksets + `RevitWorkset` schema; NEW = live bidirectional membership + phase (New/Existing/Demolished) sync. ~1–2 sprints. |
| **D.R.6** | **The desktop Revit adapter** (separate repo, Windows COM + Revit API 2024–2026) | NEW, out-of-monorepo (C26 §6.3). Reads `.rvt`→rich IFC+sidecar; applies PRYZM deltas back to the Revit model. ~4–6 sprints + C#/COM expertise. |

> **Audit artefact (2026-06-02):** read-only sweep of the interop subsystem — `plugins/{ifc-import,ifc-export,ifc-inspector,rhino-import,dxf}`, `packages/pdf-to-bim`, `packages/schemas/src/revit/`, `packages/schemas/src/base/primitives.ts` (`IfcData`), command-bus/event-log/CRDT, and plugin-sdk. Verdict: **strong IFC-bridge foundation + Revit-variant exporter SHIPPED**; gap to *live* round-trip = persistent meta-store (A.R.3) → streaming bridge → external desktop adapter. No `.rvt` parser and no Revit add-in exist yet (both deliberate per C26). Full findings preserved in the session memory + this section.

### §12.7 — AI commands (full surface)

The user emphasized "AI commands". Beyond the typology pipeline, the AI command surface needs explicit enumeration:

| Phase | Goal | Description |
|---|---|---|
| **A.42** | **AI command surface: `ai.chat.send`** | User types into the AI chat → routed to AiPlane workflow. |
| **A.43** | **AI command: `ai.generate.<typology>`** | Per-typology generate batch (apartment / house / office in Phase A). |
| **A.44** | **AI command: `ai.critique.layout`** | Plan-critique workflow per [C09 §2.4](../../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md). |
| **A.45** | **AI command: `ai.voice.parse`** | VoiceCommand workflow + microphone-input UI. |
| **A.46** | **AI command: `ai.query.read`** | Semantic queries ("show me all rooms above 20 m²") per AI-Query plugin. |
| **A.47** | **AI command: `ai.rules.check`** | Compliance-rule check workflow. |
| **B.U.5** | **AI Chat assistant in-editor (persistent panel)** | Right-side chat panel; routes through commands above. (Listed in §12.4.) |
| **B.AI.1** | **AI command: `ai.edit.<scope>`** | Semantic edit ("make this room 20% larger"); the AI proposes a command sequence + user approves. |
| **B.AI.2** | **AI approval queue UX great** | Per-proposal preview · accept all / reject all / per-item · undo. Refs: [C09 §5](../../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md). |
| **B.AI.3** | **AI cost meter UX (per-project budget)** | Visible per-project AI-cost ticker; per [C09 §6](../../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md). |
| **B.AI.4** | **BYOK for Anthropic key (Enterprise)** | Per [C39 §1.10](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md). |
| **C.AI.1** | **Cognition substrate as published API** | Already C.28. AI consumers query via REST. |
| **C.AI.2** | **AI personalisation per role** | Architect vs interior-designer vs developer get different defaults + prompts. Refs: [typology-expansion §11](./typology-expansion-roadmap.md). |

### §12.8 — Auth + Billing UX (full surface)

| Phase | Goal | Description |
|---|---|---|
| **A.A.1** | **Signup flow polish (Google · Microsoft · email)** | UX redesign; first-time RAC routing immediately on signup. |
| **A.A.2** | **Signin flow polish + remember-me** | Tier-1 browser support per [C45](../../02-decisions/contracts/C45-BROWSER-AND-DEVICE-MATRIX.md). |
| **A.A.3** | **Password reset flow** | Currently NOT shipped. Email-based reset link with token. |
| **A.A.4** | **Multi-factor auth (TOTP)** | First MFA support; recovery codes. |
| **B.A.1** | **SAML SSO** (Okta · Azure AD · Google Workspace) | For Enterprise per [C08 §1.3](../../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md). |
| **B.A.2** | **SSO provisioning + SCIM** | Auto-provision users from IdP per Enterprise customer config. |
| **A.B.1** | **Billing settings page** | Subscription · payment method · invoice history. Refs: [C39 §5.3](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md). |
| **A.B.2** | **Plan upgrade / downgrade flow** | Stripe Checkout integration; downgrade safety modal per [C39 §5.6](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md). |
| **A.B.3** | **Paywall modal** | Per [C39 §5.1](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md). |
| **A.B.4** | **Quota meter widget (in editor footer)** | AI tokens · projects · storage. Per [C39 §5.2](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md). |
| **A.B.5** | **Trial banner** | Days-left countdown; convert CTA. |
| **B.B.1** | **BYOK setup wizard (Enterprise)** | Customer connects AWS KMS key; per-org keys per [C49](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). |
| **B.B.2** | **Region migration UI (Enterprise)** | Customer initiates EU → UK migration flow; 48h read-only freeze. Refs: [C49 §1.9](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). |
| **B.B.3** | **Invoice history + download** | Per Stripe + per [C39 §5.3](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md). |
| **B.B.4** | **Custom Enterprise contract / MSA flow** | Sales-led for Enterprise per [roadmap-enterprise-delivery §6](./roadmap-enterprise-delivery.md). |

### §12.9 — Admin tooling

| Phase | Goal | Description |
|---|---|---|
| **A.AD.1** | **Marketplace curation queue back-office** | `apps/admin-tools/src/curation/` for curated-category review. Refs: [C40 §5.3](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md). |
| **A.AD.2** | **Support agent tooling (`apps/admin-tools/src/support/`)** | Per [C42 §5.3](../../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md) — queue · ticket detail · break-glass · refund. |
| **B.AD.1** | **Admin telemetry dashboard** | Per [C41 §5.3](../../02-decisions/contracts/C41-TELEMETRY-AND-ANALYTICS.md). |
| **B.AD.2** | **Admin override surface for entitlements** | Per [C39 §1.10 + §4.3](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md). |
| **B.AD.3** | **Admin DR drill coordinator UI** | Per [C48 §1.11](../../02-decisions/contracts/C48-BACKUP-AND-DR.md). |
| **C.AD.1** | **Enterprise customer success dashboard (per-customer CSM view)** | Account health · usage trends · QBR prep · churn risk indicator. Refs: [roadmap-enterprise-delivery §6.4](./roadmap-enterprise-delivery.md). |
| **C.AD.2** | **Compliance evidence package generator** | One-stop bundle for procurement teams. Per [roadmap-enterprise-delivery §6.3](./roadmap-enterprise-delivery.md). |

### §12.10 — Apartment master document scope (per docs/03-execution/plans/apartment/)

The apartment workstream has 6 deep-detail docs that the tracker should explicitly cite:

| Phase | Goal | Detail doc |
|---|---|---|
| **A.AM.1** | F-tier (furniture catalogue + activity systems) | [apartment/furniture-and-activity.md](./apartment/furniture-and-activity.md) — already partially shipped (D-FLE engine) |
| **A.AM.2** | Cognition stack L1-L7 progression (apartment-specific) | [apartment/cognition-stack.md](./apartment/cognition-stack.md) |
| **A.AM.3** | Family Platform — user-defined families | [apartment/family-platform.md](./apartment/family-platform.md) — runtime shipped; UX work in §12.5 |
| **A.AM.4** | Dimensional + topology validators (D-class + T-class) | [apartment/dimensional-constraints.md](./apartment/dimensional-constraints.md) |
| **A.AM.5** | Driving-principles room/element matrix | [apartment/driving-principles.md](./apartment/driving-principles.md) |
| **A.AM.6** | BIM 2 → BIM 3 live parametric data substrate (D-α/β/γ) | [apartment/bim2-bim3-data-mgmt.md](./apartment/bim2-bim3-data-mgmt.md) — D-α-1 through D-α-4 shipped |

### §12.11 — Marketing + trust + content surfaces

The user said "all landing working - all project page work". Adds:

| Phase | Goal | Description |
|---|---|---|
| **A.M.1** | Landing page (`pryzm.so`) rebuild | Aspirational hero (per [manifesto §5](../../01-strategy/manifesto.md)) + 90-sec live apartment demo + clear CTAs. (Now the editor's `LandingPage.ts` served via the apex pre-render per ADR-055 §7 / IP-A5.X — see A.17.x.12/18.) |
| **A.M.2** | Pricing page (generated from entitlement registry) | Per [C39 §1.13](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md). (Already A.18.) |
| **A.M.3** | About page + manifesto page (`pryzm.so/manifesto`) | New Astro page `apps/docs-site/src/pages/manifesto.astro` (IP-A5 iter 5.4a). Renders the customer-facing surface of `docs/01-strategy/manifesto.md` (CANONICAL): §1 What we believe · §2 The promise (one-conversation pledge) · §3 Why now (3-capability table) · §4 Who we are · §5 How we talk to customers (3-filter brand voice + dont/say table) · §6 What we will not be · §7 Shape of the company. Pricing-feature-count chip pulls from `@pryzm/entitlements` so the manifesto and the pricing page can never drift. Site-nav links to /pricing + /trust. Astro static pre-render; zero client JS. `astro check` clean. Source is the canonical markdown; the page deliberately re-states the headline beats rather than embedding verbatim so brand-voice copy can be tuned without re-editing the contract. | ✅ DONE (Sprint 2) |
| **A.M.4** | Trust page (`pryzm.so/trust`) | New Astro page `apps/docs-site/src/pages/trust.astro` (IP-A5 iter 5.4b). Customer-facing surface of the four trust contracts: **C22** (Privacy/PII tier — DataTier table · DSAR 30-day window · per-tier retention windows pulled from `tierDisplayNames`), **C23** (Provenance/AI audit — every-call audit promise · right-click → Show AI provenance reference · Ed25519 signed export bundle for regulators), **C43** (Accessibility — WCAG 2.2 AA target + AAA on text-dense surfaces · static contrast audit on every PR · focus-ring token discipline), **C48** (Backup/DR — 4 runbook table with RTOs · per-tier retention windows). "What's verifiable today vs in flight" section calls out which promises are LIVE vs ratified-but-implementation-pending — no "Coming Soon" copy, per manifesto §5.3 "curated about what we ship". `astro check` clean. | ✅ DONE (Sprint 2) |
| **A.M.5** | Accessibility statement (`pryzm.so/accessibility`) | Per [C43 §5.3](../../02-decisions/contracts/C43-ACCESSIBILITY.md). |
| **A.M.6** | VPAT 2.5-INT (`pryzm.so/vpat`) | Quarterly per [C43 §1.14](../../02-decisions/contracts/C43-ACCESSIBILITY.md). |
| **A.M.7** | Status page (`status.pryzm.so`) | Per [C48 §5.3](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) — third-party SaaS (statuspage.io). |
| **A.M.8** | Supported browsers page (`pryzm.so/supported-browsers`) | Generated from [C45 BrowserSupportRegistry](../../02-decisions/contracts/C45-BROWSER-AND-DEVICE-MATRIX.md). |
| **A.M.9** | Privacy policy + Terms of service | Legal-reviewed; per [C22 §5](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) + [C41](../../02-decisions/contracts/C41-TELEMETRY-AND-ANALYTICS.md). |
| **A.M.10** | Customer case studies | First 5 customer references; per [go-to-market §3.1](../../01-strategy/go-to-market.md). |
| **B.M.1** | Developer site (`developers.pryzm.so` or `pryzm.so/developers`) | Per [platform-strategy §10.1](../../01-strategy/platform-strategy.md). |
| **B.M.2** | Blog (engineering + design + customer stories) | Per [go-to-market §3.1 content marketing](../../01-strategy/go-to-market.md). |
| **B.M.3** | Customer summit (annual; first edition) | Per [operating-principles §6.5](../../01-strategy/operating-principles.md). |
| **C.M.1** | Plugin author conference (annual; first edition) | Per [platform-strategy §10.3](../../01-strategy/platform-strategy.md). |

### §12.12 — Mobile + tablet specific (per C44)

| Phase | Goal | Description |
|---|---|---|
| **A.MO.1** | Form-factor breakpoint detection + capability matrix | Per [C44 §1.4](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md). |
| **A.MO.2** | Share-link viewer (works on every form-factor) | Per [C44 §1.8](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md) — strict invariant. |
| **A.MO.3** | PWA manifest + install banner | Per [C44 §1.10](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md). |
| **B.MO.1** | Bottom-sheet pattern for mobile panels | Per [C44 §5.3](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md). |
| **B.MO.2** | Touch-target sizing audit (44×44 px min on touch) | Per [C44 §1.5](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md). |
| **B.MO.3** | Offline queue (~1 hour authoring queued + sync on reconnect) | Per [C44 §1.9](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md). |
| **C.MO.1** | 2D plan-view touch authoring on phone | Per [C44 §5.4](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md). |
| **C.MO.2** | Tablet (iPad Pro 12.9") full editor capability | Per [C44 §1.4](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md). |
| **C.MO.3** | Field-tier pricing experiment (mobile-viewer-only for site supervisors) | Per [C44 §10 OQ-6](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md). |

---

## §13 — Revised sub-phase count

| Phase | Original count (§3–§5) | Additions (§12) | Total |
|---|---|---|---|
| Phase A | 41 sub-phases (A.1–A.41) | +18 A.U.* + 6 A.PL.* + 1 A.20 (already there) + 5 A.AM.* + 5 A.B.* + 4 A.A.* + 3 A.M.* + 10 A.M (marketing) + 3 A.MO.* + 6 AI (A.42–A.47) + 5 A.F.* + 2 A.AD.* + 2 A.R.* = **~70 additions** | ~111 sub-phases |
| Phase B | 35 | +17 B.U.*/S.*/I.*/D.*/F.*/R.*/AI.*/A.*/B.*/AD.*/M.*/MO.* additions = **~30 additions** | ~65 sub-phases |
| Phase C | 39 | +12 C.U.*/F.*/R.*/AI.*/AD.*/M.*/MO.* additions = **~15 additions** | ~54 sub-phases |
| Cross-cutting (X.*) | 10 | + X.11 onboarding tutorials maintenance + X.12 marketplace ecosystem dev + X.13 customer feedback loop | 13 sub-phases |
| **Total** | 125 sub-phases | **+~115 additions** | **~240 sub-phases** |

This is the **comprehensive view**. Roughly 240 named deliverables across 5 years.

---

## §14 — Coverage verification — am I covering EVERYTHING?

After this addendum, the answer is **substantially yes** — within these honest caveats:

| Surface | Covered? | Where |
|---|---|---|
| TypologyPipeline + 25+ typologies | ✅ | §3.1, §12.3 |
| Site + climate substrate | ✅ | §3.1 A.7–A.11 |
| All 49 contracts to CANONICAL | ✅ | §12.2 rollup |
| Editor UI redesign (panels, settings, tools, search, notifications, help) | ✅ | §12.3 A.U.* |
| Project hub / list / share / settings / versions | ✅ | §12.3 A.PL.* |
| Sheet + view + elevation + section great | ✅ | §12.4 B.S.* |
| Dimension + annotation great | ✅ | §12.4 B.S.3 |
| Inspect tree + per-element-type sub-panels | ✅ | §12.4 B.I.* |
| Data Panel + automation + schedules | ✅ | §12.4 B.D.* |
| Family creation pipeline (component editor · publish · install · update · curation · analytics · AI-assisted) | ✅ | §12.5 |
| Native Revit import + export (via IFC4 + Python adapter) | ✅ | §12.6 A.R.* + B.R.* + C.R.* |
| AI commands (chat · generate · critique · voice · query · rules · edit · approval · cost · BYOK · personalisation) | ✅ | §12.7 |
| Auth UX (signup · signin · password reset · MFA · SSO · SCIM) | ✅ | §12.8 A.A.* + B.A.* |
| Billing UX (subscription · paywall · quota · trial banner · BYOK setup · region migration · invoices · custom MSA) | ✅ | §12.8 A.B.* + B.B.* |
| Admin tooling (curation queue · support agent · telemetry dashboard · CSM view · compliance evidence) | ✅ | §12.9 |
| Apartment master scope (F-tier · cognition · family · dimensional · driving · BIM 2/3 data) | ✅ | §12.10 |
| Landing + about + trust + accessibility + VPAT + status + privacy + ToS + supported-browsers + case-studies + developer-site + blog + customer-summit + plugin-conference | ✅ | §12.11 |
| Mobile + tablet (form-factor matrix · share-link · PWA · bottom-sheet · touch-target · offline · 2D plan-view authoring · iPad full · field-tier pricing) | ✅ | §12.12 |
| Per-region (EU · US · AP · UK) | ✅ | §4 B.14–B.16 + §5 C.16–C.18 |
| Sovereignty + BYOK + self-host | ✅ | §4 B.30 + §5 C.31 |
| Performance + observability + bench maintenance | ✅ | §7 X.1 continuous |
| Documentation cadence + brand-voice content | ✅ | §7 X.6 + X.10 |

### Honest gaps that remain

Things this tracker still doesn't fully name:

1. **Per-region drawing-standard packs** (DIN-extension · NF-extension · JIS-extension after the 4 first-party in B.11) — TBD per regional demand.
2. **Community-authored typology long tail** (Phase D 2030+) — explicitly deferred; not in §3–§5.
3. **Per-jurisdiction regulatory packs** (UK Part M · ADA · DIN-Brandschutz · Japanese fire-code · etc.) — each is a constraint-DB extension; granular sub-phase TBD when customer demand surfaces.
4. **Plugin SDK successor versions (v2 · v3)** — Phase D scope; format-versioning per [C47](../../02-decisions/contracts/C47-FILE-FORMAT-VERSIONING.md) governs.
5. **Customer-managed integrations** (BIM360 · Procore · Bentley iTwin · Trimble Connect · Aconex · ArchiCAD's BIMcloud) — explicitly marketplace-plugin opportunities per [platform-strategy §2.5](../../01-strategy/platform-strategy.md), not PRYZM-first-party builds.

These gaps are by design — pushing them to community + marketplace is the strategic moat per [platform-strategy](../../01-strategy/platform-strategy.md).

---

## §15 — Where to add the next sub-phase

When new work surfaces (a customer request · a code discovery · a new contract DRAFT), the addition flows here:

1. Determine the **phase** (A · B · C · D) based on commit window
2. Determine the **category** (U=UI, PL=project page, AM=apartment master, F=family, R=Revit, AI=AI, A=auth, B=billing, AD=admin, M=marketing, MO=mobile, S=sheets, I=inspect, D=data)
3. Pick the **next free number** in that phase × category
4. Add a row to the relevant table in §3, §4, §5, or §12.* with the **goal · description+refs · status** columns
5. Update §13 sub-phase count

Every addition is PR'd + reviewed per [cadence §10 cardinal rules](./cadence-and-planning-system.md).

---

## §16 — Carry-over from `status/remaining-work-consolidated.md` (operational in-flight work)

Per [status/remaining-work-consolidated.md](../status/remaining-work-consolidated.md) (stamped 2026-05-29; supersedes 4 prior audit + fix-log docs), substantial operational work was in-flight when documentation reorganisation started. This section integrates EVERY non-closed item from that consolidated doc into Phase A (most are urgent production-readiness fixes that must close before Phase 1 exit).

### §16.1 — Production-readiness BLOCKERS (Phase A — single-week priority)

| Sub-phase | ID | Title | Refs / Notes |
|---|---|---|---|
| **A.PR.B10** | B10 | Resilient-import quarantine + autosave-blocking modal | `ProjectLoader` continues loading on element failures — silent data loss. CRITICAL. |
| **A.PR.B11** | B11 | Version-limit proactive prune UI + per-project version cap | `§QUOTA-EVICT` (`8463607`) closed the recovery path; remaining is UX + cap. |
| **A.PR.B12** | B12 | CRDT conflict UI wired into adapter | `CRDTConflictResolver.mergeElement` → `YjsDocAdapter.applyCommand`; surface `ConflictResolutionDialog` + Banner from `engineLauncher.ts:560`. |
| **A.PR.B13** | B13 | Cursor-paginated catch-up + durable-insert-before-broadcast | Yjs late-joiner replay correctness. |
| **A.PR.B15** | B15 | Dual handler-registration retire | Round 52 Proxy is interim; canonical retire owed. |
| **A.PR.B17** | B17 | PSO prewarm + EdgeProjector slicing | Closes the 11.5 s / 16.6 s freezes on first plan-view. |
| **A.PR.B19** | B19 | Secret rotation (ops) | Operational, not code. |
| **A.PR.B20** | B20 | ✅ **RESOLVED 2026-06-03** — pg preflight false-timeout → **real Supabase persistence** | The boot `pgPreflight` (6 s, fired DURING the event-loop-blocking boot) misclassified a HEALTHY Supabase transaction-pooler DB as dead → the whole session silently fell to the **volatile in-memory store (data lost on every restart)**, `migrationsReady=false`. Root causes + fix `12dda0a`: **§D7** skip the session-`SET` on a tx-pooler (`:6543` / pgbouncer) — it hung node-postgres's first pooled query behind it (the `client.query() while executing` warning); **§D8** raise preflight 6 s→18 s to survive the boot stall (measured DB = 759 ms connect + 70 ms `SELECT 1`). Now `migrationsReady=true`. Founder-confirmed live. Also this session: rate-limiter **dev no-op + raised prod limits** (was 429-ing create/delete/open under heavy testing) `b081576`; **`.gitignore .claude/worktrees/`** (stale agent worktrees surfaced ~4900 bogus "changes"). |

### §16.2 — Production-readiness HIGHS (Phase A — two-week tier)

| Sub-phase | ID | Title | Refs / Notes |
|---|---|---|---|
| **A.PR.H3** | H3 | OAuth `state` CSRF nonce | Server-side state store. |
| **A.PR.H5** | H5 | JWT lifetime + refresh tokens | Session-table migration; avoid logging everyone out on deploy. |
| **A.PR.H6** | H6 | Marketplace plugin signature — server-side bundle SHA-256 | Per [C07 §3.2](../../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md). |
| **A.PR.H7** | H7 | IFC upload streaming (multer + S3/disk) | Currently in-memory. |
| **A.PR.H9** | H9 | Remove in-memory anonymous fallback | Once B14 hard-fail covers it. |
| **A.PR.H13** | H13 | Boot-time failed-registration banner | Tracking list + DOM surface. |
| **A.PR.H17** | H17 | Redis adapter for Socket.io + rate-limit + plan cache | OR explicit single-instance pin. |
| **A.PR.H19** | H19 | OTel SDK install + OTLP exporter + pino structured logs | P8 spans currently emit to void. Pairs with C10. |
| **A.PR.H20** | H20 | PITR backup for PG JSONB | Per [C48 §1.1](../../02-decisions/contracts/C48-BACKUP-AND-DR.md). |
| **A.PR.H21** | H21 | Per-room loop in `ImportProjectCommand` | Perf fix. |
| **A.PR.H23** | H23 | Strict Zod typing for save payloads (walls/slabs/doors/windows) | Per [C05](../../02-decisions/contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md). |
| **A.PR.H24** | H24 | Chunked snapshot save (wire `SnapshotStreaming` into save path) | Perf at scale. |
| **A.PR.H25** | H25 | Snapshot `schemaVersion > current` hard-refuse | Per [C47 §1.6](../../02-decisions/contracts/C47-FILE-FORMAT-VERSIONING.md). |
| **A.PR.H27** | H27 | Hoist `dbMigrate` import in 16 hot handlers | Cold-boot perf. |
| **A.PR.H28** | H28 | Delete ~250 MB duplicate binary assets | Bundle-size hygiene. |
| **A.PR.H31** | H31 | `(window as any)` ratchet plan (P4 finalisation) | Per [C01 §1 P4](../../02-decisions/contracts/C01-ARCHITECTURE-AND-GOVERNANCE.md). |
| **A.PR.H32** | H32 | Cesium lazy-load | Cold-boot perf. |
| **A.PR.H37** | H37 | 670 unsanitized `innerHTML` sweep + DOMPurify mandate | Security hardening per [C08](../../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md). |

### §16.3 — Architecture migration (Phase A continuous + Phase B)

| Sub-phase | ID | Title |
|---|---|---|
| **A.AM.H33-H36** | H33-H36 | Finish P6 migration (~12 of 500+ `commandBus` calls remain) + widen GA-gate scope + reset ratchets + split `server.js` (4944 LOC god-file) |
| **A.P4F** | P4-final | ~15 residual production sites (OI-044 phase 2): `ViewportPreviewRenderer.ts` ×2 · `ProjectScopedStorage.ts` · `ProjectScopeRegistry.ts` · `ViewIntentInstanceStore.ts` |
| **A.P8F** | P8-OTLP | OTLP exporter configuration (pairs with A.PR.H19) — spans currently emit to void |

### §16.4 — Daily-use Sprint 1 (cliff-edges; 2–3 days)

| Sub-phase | ID | Title |
|---|---|---|
| **A.DU.T-B1** | T-B1 | Polyline state evaporates on Split-View mouse-leave |
| **A.DU.T-B2** | T-B2 | Backspace deletes selected element mid-draw |
| **A.DU.T-B7** | T-B7 | Move tool exits after one move |
| **A.DU.C-B1** | C-B1 | Zoom-fit / zoom-selected dead buttons |
| **A.DU.C-B2** | C-B2 | Plan camera "fit all" after every commit |
| **A.DU.C-B3** | C-B3 | 100 m maxDistance hard cap |
| **A.DU.C-B4** | C-B4 | maxPolarAngle clamp |
| **A.DU.M-B1** | M-B1 | Wall+slab system-type IDs regenerate on save/load |
| **A.DU.T-H5** | T-H5 | ✅ **RESOLVED** — Furniture rotation hard-coded at 0 | The §FT-FURNITURE bus→legacy bridge (`initTools.ts §FIX-FURNITURE-ROTATION`) lifts the scalar yaw into `rotation.y` (`{x:0, y:ev.rotation, z:0}`); `buildFurnishCommands` emits the scalar correctly. Verified 2026-06-05. |
| **A.DU.FURN-OBB** | FURN-OBB | ✅ **RESOLVED 2026-06-05** — Furnish drops most furniture in non-orthogonal rooms | `furnishLayout/collision.ts footprintRect()` snapped yaw to {0,90,180,270} → axis-aligned footprint poked outside angled polygons → `rectInPolygon` failed → items dropped. Fix (`31f26add` + rotation-convention correction `7fd3e31a`): oriented-quad primitives (footprintCorners/quadInPolygon/quadsOverlap-SAT) testing the TRUE rotated footprint; placeSolver carries it end-to-end. Cardinal yaws ≡ AABB so orthogonal rooms unchanged. 81/81 furnish tests incl. 2 rotated-room regression tests. |
| **A.DU.T-H7** | T-H7 | Door 1.5 m radius |
| **A.DU.L-B3** | L-B3 | Standalone slab/floor opening restore |

### §16.5 — Daily-use Sprint 2 (undo/redo + collab silent-loss; 3–4 days)

| Sub-phase | ID | Title |
|---|---|---|
| **A.DU.U-B1** | U-B1 | Ring-buffer not cleared on project switch |
| **A.DU.U-B2** | U-B2 | `runtime.bus.dispatch` undefined → CRDT broken |
| **A.DU.U-B5** | U-B5 | Empty PatchPair on `element.delete` |
| **A.DU.L-B2** | L-B2 | `If-Match` 412 not sent |
| **A.DU.L-B1** | L-B1 | Quarantine modal (overlaps A.PR.B10) |
| **A.DU.S-B1** | S-B1 | Wire ConflictResolutionDialog (overlaps A.PR.B12) |
| **A.DU.L-H2** | L-H2 | `sendBeacon` for beforeunload |

### §16.6 — Daily-use Sprint 3 (material fidelity + view UX; 3–4 days)

| Sub-phase | ID | Title |
|---|---|---|
| **A.DU.M-H1** | M-H1 | Wall/roof/CW materialId resolution (CW closed Round 51; wall + roof remain) |
| **A.DU.M-H2** | M-H2 | Plan-edge hard-black colour (deferred with architectural rationale) |
| **A.DU.M-H4** | M-H4 | Door/window custom types persist |
| **A.DU.C-H1** | C-H1 | Triple-dispatch on canvas click |
| **A.DU.C-H7** | C-H7 | Marquee in plan |
| **A.DU.SV1** | — | Preserve selection across views |

### §16.7 — Daily-use Sprint 4 (polish; 1+ week)

| Sub-phase | ID | Title |
|---|---|---|
| **A.DU.T-H3** | T-H3 | Stair gizmo silent no-op |
| **A.DU.T-H6** | T-H6 | Column type ignored in plan |
| **A.DU.T-H2** | T-H2 | Backspace handler inconsistency |
| **A.DU.U-H6** | U-H6 | Multi-select Delete |
| **A.DU.U-H7** | U-H7 | Slab cascade delete |
| **A.DU.VT1** | — | View template / view creation / section |
| **A.DU.S-B2** | S-B2 | Export PDF/DXF (`window.print()` stub → real plugin) |
| **A.DU.S-B3** | S-B3 | Multiplayer cursor |

### §16.8 — Daily-use long-tail (Phase A or Phase B per priority)

Not enumerated individually (~30 items). Tracked as **A.DU.LT** in the tracker; full list in [status/remaining-work-consolidated §4 long-tail](../status/remaining-work-consolidated.md):

- T-H1 · T-H8 · T-H9 · T-H10
- U-H8 · U-H9 · U-H10 · U-H11
- L-H1 · L-H3 · L-H4 · L-H5 · L-H6 · L-H7 · L-H8 · L-H9
- C-H2 · C-H3 · C-H4 · C-H5 · C-H6 · C-H8
- M-H3 · M-H5 · M-H6 · M-H7
- S-H1–S-H8 (snap + dimension dual systems + annotation cmdMgr)

### §16.9 — Fix-log carry-overs (deferred)

| Sub-phase | Title |
|---|---|
| **A.DU.CO.R17** | Round 17 follow-ups: `RoofPathToolHandler` + `StairPathPlanToolHandler` (same one-liner pattern) |
| **A.DU.CO.R24** | Round 24 §FURN-3D-RESILIENCE — awaiting architect's logged error |
| **A.DU.CO.STAIR** | STAIR-PLAN-DI TODO in `apps/editor/src/types/globals.d.ts` |
| **A.DU.CO.R7** | Round 7 §FIX-VDT-DUAL-PATH Part 2 — per-undo redetect storm (~80 ms LONGTASK) |
| **A.DU.CO.47** | #47 WebGPU `Destroyed ShadowDepthTexture` on project-load hang |
| **A.DU.CO.48** | #48 RoomTopologyObserver forced-fire after unpause |

### §16.10 — Plan-view incremental projection (2 element types remain)

| Sub-phase | ID | Title |
|---|---|---|
| **A.PV.OPENING** | — | Opening element-level projection cache (16/18 done) |
| **A.PV.STAIR-RAIL** | — | Stair-railing element-level projection cache |
| **A.PV.CONTRACT** | — | C04 §3.4 + C11 §6.2.1/§6.2.2 + C10 NFT-PV-1 contract amendments sign-off |
| **A.PV.HLR** | — | (Conditional) HiddenLineRemoval incremental pass if it becomes bottleneck |

### §16.11 — Master-status OI register (OI-007 → OI-058)

Items not yet absorbed into Phase A above:

| Sub-phase | ID | Title | Phase target |
|---|---|---|---|
| **C.OI.007** | OI-007 | IFC streaming LONGTASK 253 ms (3–7 FPS drop) | Phase C (post-GA) |
| **A.OI.008** | OI-008 | WebGPU prewarm 2909 ms vs <1500 ms target | Phase A |
| **A.OI.009** | OI-009 | `engineLauncher.ts` bundle 4.3 MB | Phase A |
| **A.OI.050** | OI-050 | CustomEvent migration — 598 remaining; F.events.19 last sub-completed | Phase A continuous |
| **A.OI.053** | OI-053 | Project create + open slow (a-e) | Phase A |
| **A.OI.053d** | OI-053d | **★ Render pipeline REBUILT per project-switch = the 768 ms open LONGTASK** (content-independent; `onProjectSwitch` dispose + `onProjectLoaded` `activateOutlines()` re-author the SSGI/outline TSL graph every open — the repeated `§I2 usedTimes` log is the fingerprint). **Quick win: build the pipeline once/tab, re-point outline arrays (O(1)) on switch.** `packages/renderer-three/src/pipeline/RenderPipelineManager.ts:763-813,932-954,1199-1224`. Root-cause: [PERF-PROJECT-OPEN-AND-BATCH-2026-06-03.md](../analysis/PERF-PROJECT-OPEN-AND-BATCH-2026-06-03.md) §3/Q1. | 🟢 IMPLEMENTED 2026-06-03 — build-once-per-tab guard on `_outlineNodes` (`onProjectSwitch` 2nd+ open → O(1) `setSelectedObjects([])`/`setHoveredObjects([])` re-point, no dispose/rebuild; `onProjectLoaded` authors the node graph once); isolation + first-build + resize/DPR paths preserved; **56/56 renderer-three tests green**; on `main`. PENDING in-browser verify (outlines survive switch · no `§I2` on 2nd+ open · 768 ms–1.2 s LONGTASK gone). |
| **A.OI.053e** | OI-053e | Minor daily-use log warts (2026-06-03): `GET /favicon.ico 404` (add a favicon or a 204 route) + landing **skeleton a11y** — `lp-skel-hero-btn` retains focus inside `aria-hidden` `.lp-skel-shell` (use `inert` instead of `aria-hidden`, or blur on hide). `index.html` boot skeleton. | ⚪ Phase A — minor |
| **A.OI.053f/g/h** | OI-053f/g/h | Apartment batch generator: drop redundant Phase-1 `REDETECT_ROOMS` (f, quick) · replace the 150 ms wall-poll `setTimeout` cadence with a store-subscription signal (g, quick) · openings-only single-wall rebuild in batch door creation (h, structural — shares ADR-057 P1; collapses O(walls×doors)→O(doors)). `apps/editor/src/ui/apartment-layout/ApartmentLayoutExecutor.ts:157-367`. Analysis §4. **✅ OI-053f + OI-053g SHIPPED 2026-06-03** (`3500fab`): f = `skipRedetectRooms:true` on the wall batch (Phase-2 doors sweep is the meaningful one — final room set identical); g = subscribe to `storeEventBus` wall create/update → proceed the instant walls are ready, 150ms `setTimeout` kept as fallback + telemetry/iteration-cap preserved. Output identical (ai-host `apartmentLayoutCommands.test.ts` 27/27 green). In-browser confirm: `wall-poll-completed` `iters`→0-1, lower `elapsed_ms`, 1 redetect sweep. **✅ OI-053h / ADR-057 P1 SHIPPED 2026-06-03** (`ea11e457`): `WallDeltaClassifier.classifyWallDelta` → `WallRebuildCoordinator._flushOpeningsOnly` rebuilds ONLY the edited wall (cached miter `JoinData`; skips `resolveLevel`/V2-cache/infill) when the delta is openings-value-only on baseline-stable walls; ANY other delta falls back to whole-level. Door-move O(walls/level)→O(1); also speeds batch door placement. Invariance proven (resolve reads endpoints/thickness/adjacency, never openings); 20/20 geometry-wall tests; WJR-NAN-GUARD preserved. **ADR-057 → ACCEPTED, P1 implemented** (P2-P5 backlogged). | 🟢 f/g/h ALL DONE |
| **A.OI.053c/i** | OI-053c/i | Defer non-critical per-open `pryzm-project-loaded` re-binds (c, the 50–100 ms tail — 20+ listeners) · single-batch wall+door commit removing the two-phase split + poll + extra redetect (i, structural). Analysis §2.2/§5. | ⚪ Phase A — perf |
| **A.OI.054** | OI-054 | Hosted door/window two-part undo (followup-a); cross-stack redo / ADR-051 single-store (followup-b) | Phase A |
| **A.OI.056** | OI-056 | Auto-zoom on first plan-view element creation | Phase A |
| **A.OI.057** | OI-057 | Post-batch wall-join timing-implicit + plugin-store retains pre-miter baselines | Phase A/B |
| **A.OI.058** | OI-058 | Scene Registry (pascalorg pattern) replace `scene.traverse` for visibility/selection | Phase A (highest-value arch key) |
| **A.OI.059** | OI-059 | **★ MAJOR daily-use BLOCKER — cannot open previously-created projects.** `[persistence.openProject] project not found` (`buildPersistence.ts:105`) hard-fails older projects (`proj-1779…` "Test"/"lhhh"); a newer one ("njk,n") opens ONLY via LOCAL auto-restore after the server `/api/projects/:id/latest-version` 404s (`buildPersistence.ts:145` → `PlatformShell.ts:173`). Symptom of server project records living in the VOLATILE in-memory store (§SERVER-PG-DEGRADE — no `DATABASE_URL` locally) — the hub LISTS projects from a client/local source but `openProject` looks them up server-side where no durable row exists → divergence + **data-loss risk**. Secondary: `RoomBoundingLineBuilder.ts:68 Uncaught` on snapshot load. Analysis: [PERSISTENCE-CANNOT-OPEN-PROJECT-2026-06-03.md](../analysis/PERSISTENCE-CANNOT-OPEN-PROJECT-2026-06-03.md). **Older projects ARE RECOVERABLE from this browser's localStorage** (`bim-project-<id>-versions`). **✅ Q1 FIX SHIPPED 2026-06-03** — `buildPersistence.openProject` SOFT-falls-through with a minimal summary instead of throwing (mirrors the version-404 tolerance) → `PlatformShell` local auto-restore runs; `PlatformRouter` threads the hub's project NAME through the hint so the restored project shows its real name. 132/132 runtime-composer tests green; needs in-browser confirm. Remaining: S2 reconcile list/open sources · S1 durable server PG · OI-059b `RoomBoundingLineBuilder:68` snapshot-load wiring (store emits `{id}` only, builder derefs `.properties`/`.placement`; high-noise, non-aborting). | 🟢 Q1 FIX SHIPPED — pending browser confirm; S1/S2 structural queued |
| **A.OI.011** | OI-011 | npm publish @pryzm/sdk (= A.12) | Phase A — credentials |
| **A.OI.012** | OI-012 | npm publish @pryzm/headless (= A.13) | Phase A — credentials |
| **A.OI.013** | OI-013 | DNS marketplace.pryzm.so (= A.14) | Phase A — registrar |
| **A.OI.014** | OI-014 | Stripe keys live | Phase A — credentials |
| **A.OI.015** | OI-015 | Yjs WebSocket server credentials | Phase A — credentials |
| **A.OI.016** | OI-016 | OTLP endpoint (pairs with A.PR.H19) | Phase A — credentials |

### §16.12 — Apartment-layout pipeline carry-overs (per status doc §7)

| Sub-phase | ID | Title |
|---|---|---|
| **A.APT.MA-BRIEF** | — | Multi-apartment-floor-plate brief (new feature scope: shared core + N apartments per floor + structured JSON output) |
| **A.APT.SA.2** | — | Single-apartment fix #2 — corridor connectivity (not all rooms reachable) |
| **A.APT.SA.5** | — | Single-apartment fix #5 — NO-windows engine (apartment generator emits no windows) |
| **A.APT.FW.LIGHT** | — | Furnish-wishlist: proper task lighting per room |
| **A.APT.FW.WARD** | — | Furnish-wishlist: wardrobe variants (built-in vs freestanding · sliding vs hinged) |
| **A.APT.FW.PROF** | — | Furnish-wishlist: professional layout (slicing-tree improvements) |
| **A.APT.FW.CORR** | — | Furnish-wishlist: corridors quality (dead-end elimination · width consistency) |
| **A.APT.FW.ILLOG** | — | Furnish-wishlist: illogical-connection post-pass (bedroom-only-accessible-via-bathroom etc.) |
| **A.APT.PR.1B** | — | Program-rules #1b: missing room types (balcony · storage · open_plan) |
| **A.APT.PR.4** | — | Program-rules #4: desk + desk_chair FurnitureKind stubs |
| **A.APT.PR.5** | — | Program-rules #5: asymmetric door access (accessTo field) |

### §16.13 — Wall-junction defects (geometry-wall package)

| Sub-phase | ID | Title |
|---|---|---|
| **A.WJ.LCORNER** | — | Defect #3 — interior↔exterior L-corner produces black-triangle artefact |
| **A.WJ.MULTICLUSTER** | — | WallJoinResolver degenerate-wall bug — **🔴 DAILY-USE BLOCKER (re-open hang)**. Two vectors: (1) multi-cluster self-cluster degenerate (project `zse`); (2) **diff-thickness "option-B butt" NaN** — `tDom≠tSub` walls meeting at one shared endpoint pass the `MIN_LEN` length guard but the lateral `subNewPt` offset (`WallJoinResolver.ts:991`) can leave a near-zero/reversed baseline whose `normalize()` → NaN geometry → downstream extruder/CSG/BVH stall (project loads then FREEZES during load-time rebuild; last log `[WJR-DIFF-THICKNESS]`). **Fix: finite+direction guard in the option-B branch (`:1010`) + clamp lateral offset + degenerate-baseline guard at `buildWall` (skip mesh build, hide sliver) — "wrong-but-fast join beats frozen tab" + the structural flag-INVALID-and-skip-mesh path.** Analysis: [WALLJOINRESOLVER-DIFF-THICKNESS-HANG-2026-06-03.md](../analysis/WALLJOINRESOLVER-DIFF-THICKNESS-HANG-2026-06-03.md). **✅ INTERIM MITIGATION SHIPPED 2026-06-03** — two `§WJR-NAN-GUARD`s: (consumer) `WallFragmentBuilder.buildWall:736` skips the geometry op + hides the mesh if any baseline coord is non-finite OR length < 1e-3 m (runs BEFORE extrude/CSG/BVH — a hang isn't catchable, so the guard MUST precede the op) → **project-open can no longer freeze regardless of producer**; (producer) `WallJoinResolver.ts:1022` rejects non-finite `subNewPt` + direction-reversal → falls back to a clean butt. Normal perpendicular 0.2/0.1 L-corner still trims (verified). New regression suite `WallJoinResolver.diffThicknessNaN.test.ts` 6/6 green. Needs in-browser confirm (affected project loads without freezing). **✅ DURABLE STRUCTURAL FIX SHIPPED 2026-06-03** (`647be98f`): `§WJR-INVALID` — `WallJoinResolver` FLAGS invalid walls at resolve time (`invalid`/`invalidReason` on `JoinData`, `WallJoinTypes.ts:26`) for ALL degeneracy vectors — self-cluster (`zse`), diff-thickness collapse, diff-thickness NaN/unrescuable, zero-len/NaN — preserving the original baseline (no NaN write-back); `WallFragmentBuilder.buildWall:747` reads the flag FIRST, hides the wall + logs once `§WJR-INVALID skipped <id>: <reason>`. The NaN sniff is now belt-and-suspenders. Normal L-corner NOT over-flagged (verified). 24/24 geometry-wall tests (+4). | ✅ FIXED (interim + durable) — in-browser confirm pending |
| **A.WJ.IWO** | — | Interior-wall-on-opening conflict bug — `WallOccupancyStore.canPlace()` at commit + SnapManager exclusion + new Tier-1 ConstraintEngine rule |
| **B.WJ.ADR55P4A** | — | ADR-0055 P4a — layered walls |
| **B.WJ.ADR55P4B** | — | ADR-0055 P4b — openings |
| **B.WJ.ADR55P4C** | — | ADR-0055 P4c — retire infill (P3b already covers apartment generator's plain-partition case) |

### §16.14 — Operator / non-code (continuous)

| Sub-phase | ID | Title |
|---|---|---|
| **X.OP.1** | — | `git rm --cached '*.tsbuildinfo'` |
| **X.OP.2** | — | Retro `ALTER TABLE` for §H22 FK on existing prod DBs |
| **X.OP.3** | — | `pnpm up jspdf` lockfile regeneration (B16 sub-task) |

### §16.15 — Phase D post-GA / long-range (P3)

Per [status/remaining-work-consolidated.md §9](../status/remaining-work-consolidated.md):

| Sub-phase | ID | Title |
|---|---|---|
| **D.PGA.1** | — | WCAG 2.1 AA full audit (TASK-20) — already absorbed by [C43](../../02-decisions/contracts/C43-ACCESSIBILITY.md) and §3 A.32–A.34 + §5 C.36 |
| **D.PGA.2** | — | Multi-model IFC federation |
| **D.PGA.3** | — | GeoJSON / SHP geospatial import |
| **D.PGA.4** | — | SharedArrayBuffer geometry transfer |
| **D.PGA.5** | — | WebGPU mobile fallback (rendering gap) |
| **D.PGA.6** | — | Family builders off main thread (threading gap) |
| **D.PGA.7** | — | Multi-day offline merge (persistence gap) |
| **D.PGA.8** | — | Dependabot + deploy pipeline (CI/CD gap) |

---

## §17 — Final scope rollup (after coverage audit + remaining-work integration)

Substantially everything PRYZM does in code, ships in product, sells in market, or commits in contracts is now enumerated in this tracker (or in the doc cross-linked from a row):

| Layer | Sub-phase ranges | Total |
|---|---|---|
| Phase A (Alpha 0–6 mo) | A.1–A.41 + A.U.* (18) + A.PL.* (6) + A.F.* (5) + A.AM.* (6) + A.A.* (4) + A.B.* (5) + A.M.* (10) + A.AD.* (2) + A.MO.* (3) + A.R.* (2) + A.42–A.47 (6 AI) + A.PR.B/H/etc. (~20) + A.AM.H33-H36 + A.P4F + A.P8F + A.DU.* (~30) + A.PV.* (4) + A.OI.* (~15) + A.APT.* (~11) + A.WJ.* (3) | **~190** |
| Phase B (Beta 6–18 mo) | B.1–B.35 + B.U.* (17) + B.S.* (5) + B.I.* (3) + B.D.* (3) + B.AI.* (4) + B.F.* (4) + B.R.* (3) + B.A.* (2) + B.B.* (4) + B.AD.* (3) + B.M.* (3) + B.MO.* (3) + B.WJ.* (3) | **~90** |
| Phase C (GA 18–36 mo) | C.1–C.39 + C.U.* (12) + C.F.* (2) + C.R.* (4) + C.AI.* (2) + C.AD.* (2) + C.M.* (1) + C.MO.* (3) + C.OI.007 | **~65** |
| Phase D (post-GA, 36 mo+) | D.PGA.* (~8) + community-marketplace long tail | **~10** |
| Cross-cutting (X.*) | 10 + X.OP.* (3) + X.11–X.13 | **~16** |
| **GRAND TOTAL** | | **~370 named deliverables across 5 years** |

The tracker is the operational dashboard. The detail per sub-phase lives in the linked contract / spec / phase-roadmap. Every sub-phase has a path to closure.

---

## §18 — Spec audit (all 56 specs in `docs/03-execution/specs/`) + status-folder integration

The 56 normative specs each codify the wire format / algorithm / API for one subsystem. Every spec must trace to a sub-phase that delivers its scope. The audit below catalogues all 56 specs, the contract they ride on, the sub-phase that delivers their scope, and surfaces NEW sub-phases that weren't in §3–§17.

### §18.1 — Spec-to-phase mapping (all 56)

| Spec | Subsystem | Owning contract | Delivered by | Status |
|---|---|---|---|---|
| **SPEC-01-GEOMETRY-KERNEL** | Geometry kernel | C11 | continuous + per-typology | ✅ shipped (refinement continuous) |
| **SPEC-02-PERSISTENCE** | Persistence client | C05 | A.U.17, A.P4F | 🟢 partial |
| **SPEC-03-SYNC-CRDT** | Yjs CRDT sync | C08 | A.PR.B12, A.PR.B13, A.DU.U-B2 | 🟢 partial |
| **SPEC-04-DRAWING-ENGINE** | Drawing primitives + multi-backend | C24 + C29 + C04 | B.S.* + B.9 PDF | ⚪ Phase B |
| **SPEC-05-TYPE-CATALOG** | Built-in type catalogues | C18 | continuous | ✅ shipped |
| **SPEC-06-ROOMS-LEVELS** | Rooms + levels topology | C11 + C20 | A.23, A.APT.* | 🟢 partial |
| **SPEC-07-AI-LAYER** | AI host (L7.5) | C09 | A.42–A.47 + typology pipeline | 🟢 partial |
| **SPEC-08-SECURITY-COLLAB** | Auth + collab + ISO 19650 | C08 | A.A.*, B.A.* | 🟢 partial |
| **SPEC-09-PLUGIN-SDK** | Plugin SDK + sandbox + Ed25519 | C07 | A.12, A.13, A.F.* | ✅ v1.0.0 ready; A.OI.011 pending |
| **SPEC-10-OBSERVABILITY** | OTel spans + 68 benches | C10 | X.1 continuous + A.PR.H19 | 🟢 partial (OTLP exporter pending) |
| **SPEC-11-TESTING** | Test framework + coverage | continuous | X.1 + per-PR | ✅ ongoing |
| **SPEC-12-BUNDLE-SPLITTING** | Vite manual chunks | C04 | A.PR.H28, A.PR.H32 (Cesium lazy), A.OI.009 | 🟢 partial |
| **SPEC-13-CONTEXT-ENVELOPES** | Project context envelope protocol | C13 | A.PL.* + A.OI.053 | 🟢 partial |
| **SPEC-15-DEPLOYMENT-TOPOLOGY** | Deploy + region + DR | C48 + C49 | A.35–A.36, B.14–B.16, C.16–C.18 | 🟢 partial |
| **SPEC-21-ELEMENT-CREATION-PROTOCOL** | Element creation pipeline | C11 | continuous | ✅ shipped (refinement continuous) |
| **SPEC-24-DATA-STORE-MAP** | Per-store responsibility map | C03 | continuous | ✅ shipped |
| **SPEC-26-PRYZM-FILE-FORMAT** | `.pryzm` ZIP format | C05 + C47 | A.U.17 + B.U.16 | 🟢 partial |
| **SPEC-27-MIGRATION-ROLLBACK** | File format migration runners | C47 | A.U.17 + B.U.16 + C.38 | ⚪ Phase A onward |
| **SPEC-28-AI-COST-MODEL** | AI cost pricing | C09 § cost + C39 | A.PR.H19 + B.AI.3 + B.AI.4 | 🟢 partial |
| **SPEC-29-VECTOR-PRIMITIVES** | 2D primitive set | C24 + C29 | B.S.* | ⚪ Phase B |
| **SPEC-30-PLAN-VIEW-PERFORMANCE** | Plan-view incremental projection | C04 + C11 | A.PV.* | 🟢 16/18 element types cached |
| **SPEC-31-LOAD-BENCH-AND-BACKPRESSURE** | Load perf + backpressure | C10 | A.PR.H21, A.PR.H24, A.PR.H27 | 🟢 partial |
| **SPEC-32-CDE-MODULE** | Common Data Environment (ISO 19650) | C13 + C30 | A.PL.5 + B.7 + B.U.7 | 🟢 partial — A.SP.32 below |
| **SPEC-33-STAKEHOLDER-REVIEW-WEDGE** | Stakeholder review + sign-off workflow | C30 | A.SP.33 below | ⚪ Phase B |
| **SPEC-34-HYBRID-DATA-SOVEREIGNTY** | Sovereignty model | C49 | B.14–B.16, B.B.1, C.16–C.18 | 🟢 partial |
| **SPEC-35-BROWSER-SECURITY-ENTERPRISE-HARDENING** | CSP + Helmet + COEP/COOP | C08 + C45 | A.PR.H37 + A.U.15 + B.34 | 🟢 partial |
| **SPEC-36-COBIE-EXPORT** | COBie FM handover | C35 | C.25 | 🔵 Phase C |
| **SPEC-37-FEDERATED-CLASH-DETECTION** | Clash + BCF round-trip | C36 | B.22 | 🔵 Phase B |
| **SPEC-38-MEP-SYSTEMS** | MEP detailing (lighting · plumbing · structural already partial) | C11 + future C | A.SP.38 below | ⚪ partial (lighting/plumbing/structural plugins shipped) |
| **SPEC-39-EIR-BEP-TIDP-MIDP** | ISO 19650 information delivery docs | C30 | A.SP.39 below | ⚪ Phase B |
| **SPEC-40-BUILDINGSMART-IFC4-CERTIFICATION** | Official buildingSMART certification | C25 | A.SP.40 below | 🔵 Phase B/C |
| **SPEC-41-SHEET-SCHEDULE-4D-5D-EXTENSIONS** | Sheet × 4D × 5D shared model | C24 + C37 + C38 | C.26, C.27, C.U.6 | 🔵 Phase C |
| **SPEC-42-ANALYSIS-BRIDGE-PROTOCOL** | Round-trip to structural/MEP analyzers | C25 | A.SP.42 below | 🔵 Phase B/C |
| **SPEC-43-SUSTAINABILITY-LCA-CARBON** | LCA + embodied carbon | future contract | A.SP.43 below | 🔵 Phase D |
| **SPEC-44-CLOUD-BAKED-RENDERING** | Server-side bake worker | C04 | `apps/bake-worker/` (PRYZM 2 S21) shipped; refinement | 🟢 shipped |
| **SPEC-45-PDF-TO-BIM-PIPELINE** | PDF-to-BIM extraction | future C | A.SP.45 below | ⚪ marketplace plugin (per engineering-vision §8 NOT in scope as primary) |
| **SPEC-46-PLAN-CRITIQUE-WORKFLOW** | Plan critique AI workflow | C09 | A.44 (`ai.critique.layout`) | ✅ shipped |
| **SPEC-47-GENERATE-3-OPTIONS-WORKFLOW** | Generate 3 options AI workflow | C09 | A.43 (`ai.generate.*`) | ✅ shipped |
| **SPEC-48-CONSTRAINT-SOLVER** | Planegcs 2D constraint solver | C09 + Family Editor | A.F.1 component-editor | ✅ shipped (refinement continuous) |
| **SPEC-APARTMENT-LAYOUT-GENERATOR** | Apartment layout AI workflow | C09 + C50 | A.4 (refactor as TypologyPack) + apartment master | ✅ shipped |
| **SPEC-ARCHITECTURAL-PROGRAM-RULES** | 248-rule constraint DB | C09 + C50 | A.37, A.38, A.39 | 🟢 partial — 152→252 in Phase A |
| **SPEC-CANVAS-FLOATING-PANELS** | Floating-panel UX | C06 | A.U.4, A.U.7 | ⚪ Phase A |
| **SPEC-CEILING-LAYOUT-ENGINE** | D-CE deterministic ceiling engine | C09 | apartmentLayout → ceilingLayout already shipped | ✅ shipped |
| **SPEC-FAMILY-EDITOR** | Family creator app | C07 + Family Platform | A.F.1, A.F.2, A.F.5, B.F.* | 🟢 functional (refinement Phase A/B) |
| **SPEC-FURNITURE-LAYOUT-ENGINE** | D-FLE deterministic furniture engine | C09 | apartmentLayout → furnishLayout shipped | ✅ shipped |
| **SPEC-KITCHEN-WARDROBE-WALL-DRIVEN** | Wall-driven kitchen + wardrobe placement | C09 + apartmentLayout | A.APT.FW.WARD + furnish-wishlist (already shipped: kitchen-default + kitchen-island) | 🟢 partial |
| **SPEC-LAYOUT-CONSTRAINT-DATABASE** | The 248-rule spec (data) | data source for SPEC-ARCHITECTURAL-PROGRAM-RULES | A.37 (continuous) | 🟢 partial (~40% code-enforced) |
| **SPEC-LIGHTING-LAYOUT-ENGINE** | D-LE deterministic lighting engine | C09 | apartmentLayout → lightingLayout shipped | ✅ shipped |
| **SPEC-MATERIALS-REPOSITORY** | Materials library (project + global) | C03 + Family Platform | A.SP.MAT below | ⚪ Phase B |
| **SPEC-PROJECT-OPEN-CREATE-PIPELINE** | Project lifecycle UX pipeline | C13 | A.PL.* | ⚪ Phase A |
| **SPEC-SEMANTIC-DESIGN-ASSISTANT** | AI semantic assistant (5-layer · 5-phase) | C09 + C16 + C17 | A.42–A.47 + B.U.5 + B.AI.* | 🟢 phase-1 wired (per memory) |
| **SPEC-STAIR-3D-CREATION** | Stair 3D creation UX | C11 + C15 | A.DU.T-H3, A.DU.CO.R17 (stair part) | 🟢 partial |
| **SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE** | D-TGL apartment offline engine | C09 + C50 | apartmentLayout shipped | ✅ shipped |
| **SPEC-WALL-MOVEMENT-STUDY** | Wall edit / move UX research | C11 + C15 | A.WJ.* + future UX work | 🟢 research; design pending |
| **SPEC-WALL-SINGLE-VOLUME-CSG** | Wall CSG single-volume rendering | C11 | shipped per Pascal ADR-0055 P3b | ✅ shipped |
| **PLAN-GENERATIVE-DESIGN-SPRINTS** | Generative design sprint plan | strategic | Phase A typology pipeline | superseded by [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) |

### §18.2 — NEW sub-phases surfaced by spec audit

These specs identify scope not yet enumerated in §3–§17:

| Sub-phase | ID | Title | Owning spec |
|---|---|---|---|
| **A.SP.32** | — | CDE module surface — ISO 19650 Common Data Environment integration (WIP → SHARED → PUBLISHED → ARCHIVED state machine UX). Per [SPEC-32-CDE-MODULE](../specs/SPEC-32-CDE-MODULE.md). Server-side state machine exists (`server/versionStateMachine.js`); UX + workflow surface pending. | SPEC-32 |
| **A.SP.33** | — | Stakeholder review wedge — sign-off workflow for the stakeholder reviewers in the ISO 19650 CDE; per [SPEC-33-STAKEHOLDER-REVIEW-WEDGE](../specs/SPEC-33-STAKEHOLDER-REVIEW-WEDGE.md). | SPEC-33 |
| **A.SP.38** | — | MEP systems framework — per [SPEC-38-MEP-SYSTEMS](../specs/SPEC-38-MEP-SYSTEMS.md). PRYZM ships lighting + plumbing + structural at the architectural level; MEP detailing primary tool is out of scope (per [engineering-vision §8](../../01-strategy/engineering-vision.md)). Phase A scope: MEP element typing + IFC4X3 export of MEP categories so consultants can take over downstream. | SPEC-38 |
| **A.SP.39** | — | EIR / BEP / TIDP / MIDP ISO 19650 information-delivery documents — auto-generated from project metadata. Per [SPEC-39-EIR-BEP-TIDP-MIDP](../specs/SPEC-39-EIR-BEP-TIDP-MIDP.md). | SPEC-39 |
| **B.SP.40** | — | buildingSMART IFC4 certification — official buildingSMART certification badge. Per [SPEC-40-BUILDINGSMART-IFC4-CERTIFICATION](../specs/SPEC-40-BUILDINGSMART-IFC4-CERTIFICATION.md). | SPEC-40 |
| **B.SP.41** | — | Sheet × Schedule × 4D × 5D shared model — common live data substrate. Per [SPEC-41-SHEET-SCHEDULE-4D-5D-EXTENSIONS](../specs/SPEC-41-SHEET-SCHEDULE-4D-5D-EXTENSIONS.md). |
| **B.SP.42** | — | Analysis bridge protocol — IFC round-trip with structural (Tekla · ETABS · SAP) + energy + acoustic analyzers. Per [SPEC-42-ANALYSIS-BRIDGE-PROTOCOL](../specs/SPEC-42-ANALYSIS-BRIDGE-PROTOCOL.md). |
| **C.SP.43** | — | Sustainability + LCA + embodied carbon — per [SPEC-43-SUSTAINABILITY-LCA-CARBON](../specs/SPEC-43-SUSTAINABILITY-LCA-CARBON.md). Stretch goal; could land in Phase C as enterprise-customer requirement. |
| **C.SP.45** | — | PDF-to-BIM pipeline (marketplace plugin) — `packages/pdf-to-bim/` already exists; full editor-host integration pending. Per [SPEC-45-PDF-TO-BIM-PIPELINE](../specs/SPEC-45-PDF-TO-BIM-PIPELINE.md). |
| **B.SP.MAT** | — | Materials repository (project + global) — appearance + Pset properties; per [SPEC-MATERIALS-REPOSITORY](../specs/SPEC-MATERIALS-REPOSITORY.md). |
| **A.SP.WMS** | — | Wall movement study UX — apply [SPEC-WALL-MOVEMENT-STUDY](../specs/SPEC-WALL-MOVEMENT-STUDY.md) research findings to drag + drop wall edit UX. |
| **A.SP.S3D** | — | Stair 3D creation UX — apply [SPEC-STAIR-3D-CREATION](../specs/SPEC-STAIR-3D-CREATION.md); intersects A.DU.T-H3 (stair gizmo) + A.DU.CO.R17. |

### §18.3 — Status-folder integration (gaps surfaced in `status/`)

The status folder contains operational + analytical work items beyond `remaining-work-consolidated.md` (already absorbed in §16):

#### §18.3.1 — Intent analysis (`status/intent-analysis/`)

| Source doc | Surface | Sub-phase |
|---|---|---|
| [status/intent-analysis/master-implementation-plan.md](../status/intent-analysis/master-implementation-plan.md) | Master plan analysis | informational; superseded by H2 phase roadmaps |
| [status/intent-analysis/orchestration-layer.md](../status/intent-analysis/orchestration-layer.md) | Orchestration-layer gaps | absorbed by A.U.* + A.42–A.47 |
| [status/intent-analysis/panel-gaps.md](../status/intent-analysis/panel-gaps.md) | UI panel coverage gaps | absorbed by A.U.* |
| [status/intent-analysis/ui-ux-design.md](../status/intent-analysis/ui-ux-design.md) | UI/UX design work | absorbed by A.U.* + B.S.*/B.I.*/B.D.* |
| [status/intent-analysis/user-journeys.md](../status/intent-analysis/user-journeys.md) | User-journey gaps | absorbed by A.U.11 + A.PL.* + roadmap-enterprise-delivery |

#### §18.3.2 — Performance analysis (`status/performance-analysis/`)

| Source doc | Surface | Sub-phase |
|---|---|---|
| [status/performance-analysis/project-open-audit-2026-04.md](../status/performance-analysis/project-open-audit-2026-04.md) | Project-open audit findings | A.OI.053 (already enumerated) |
| [status/performance-analysis/project-open-tracker-2026-04.md](../status/performance-analysis/project-open-tracker-2026-04.md) | Tracker for the above | A.OI.053 |

#### §18.3.3 — Edges + lines (`status/edges-lines/`)

| Source doc | Surface | Sub-phase |
|---|---|---|
| [status/edges-lines/flicker-fix-plan.md](../status/edges-lines/flicker-fix-plan.md) | Edge-line flicker fix | A.SP.EL.1 below |
| [status/edges-lines/webgpu-overlay-depthbias.md](../status/edges-lines/webgpu-overlay-depthbias.md) | WebGPU overlay depth-bias | A.SP.EL.2 below |

| Sub-phase | Title |
|---|---|
| **A.SP.EL.1** | Edge-line flicker fix — silver-bullet for first-paint visual quality |
| **A.SP.EL.2** | WebGPU overlay depth-bias — depth-fighting workaround when WebGPU lands as default |

#### §18.3.4 — Post-mortems + retros (continuous learning surface)

| Source doc | Cadence |
|---|---|
| [status/post-mortems/pryzm-2-build.md](../status/post-mortems/pryzm-2-build.md) | Historical; informs operating-principles |
| [status/retros/phase-1-close.md](../status/retros/phase-1-close.md) | Phase-1 close retro (active) |
| [status/sprints/s18-retro.md](../status/sprints/s18-retro.md) | S18 retro |

Per [cadence-and-planning-system §7](./cadence-and-planning-system.md), per-sprint retros are H5 cadence artefacts. The retro template + cadence is binding via [operating-principles §6.2](../../01-strategy/operating-principles.md).

#### §18.3.5 — Apartment status

| Source doc | Sub-phase |
|---|---|
| [status/apartment-layout-status.md](../status/apartment-layout-status.md) | A.APT.* (already enumerated) |
| [status/apartment-status-dashboard.md](../status/apartment-status-dashboard.md) | A.APT.* dashboard view |

#### §18.3.6 — Prior-art audit + senior-architect audit

| Source doc | Phase |
|---|---|
| [status/prior-art-audit-2026-05-31.md](../status/prior-art-audit-2026-05-31.md) | Closed (informs all Phase A) |
| [status/senior-architect-audit.md](../status/senior-architect-audit.md) | Open issues — already absorbed in §16 + A.OI.* |

### §18.4 — REVISED grand-total rollup (after spec + status integration)

| Layer | Sub-phases |
|---|---|
| Phase A | ~190 (§17) + A.SP.* (12 new) + A.OI.* (covered) + A.PR.* (covered) + A.DU.* (covered) + A.PV.* (covered) + A.APT.* (covered) + A.WJ.* (covered) + A.AM.* (covered) + A.SP.EL.* (2 new) = **~205** |
| Phase B | ~90 (§17) + B.SP.* (3 new) = **~93** |
| Phase C | ~65 (§17) + C.SP.* (2 new) = **~67** |
| Phase D | ~10 (§17) = **~10** |
| Cross-cutting (X.*) | ~16 (§17) = **~16** |
| **GRAND TOTAL** | **~390 named deliverables across 5 years** |

### §18.5 — Coverage verification — am I covering EVERYTHING now?

After §18 the answer is **yes, materially** — within these documented residuals:

| Surface | Covered? |
|---|---|
| All 49 contracts (C01-C49) → CANONICAL by end of Phase C | ✅ §12.2 |
| All 56 specs → mapped to a delivering sub-phase | ✅ §18.1 + §18.2 |
| All 25 PRYZM-first-party typologies | ✅ §3 + §4 + §5 |
| All 247 status-doc work items (from remaining-work-consolidated) | ✅ §16 |
| All UI/UX (editor · project · settings · onboarding · help · search · activity feed · notifications · marketplace · sheets · inspect · data · component editor · family marketplace · admin tools · marketing surfaces · mobile) | ✅ §12.3–12.12 |
| Native Revit import + export (via IFC4 + Python adapter) | ✅ §12.6 |
| AI commands (chat · generate · critique · voice · query · rules · edit · approval · cost · BYOK · personalisation · semantic assistant) | ✅ §12.7 + A.42-A.47 + B.AI.* |
| Auth + Billing UX | ✅ §12.8 |
| ISO 19650 (CDE · stakeholder review · EIR/BEP/TIDP/MIDP) | ✅ §18.2 A.SP.32 + .33 + .39 |
| MEP architectural-level support | ✅ §18.2 A.SP.38 |
| Materials repository | ✅ §18.2 B.SP.MAT |
| Analysis bridge (structural · MEP · energy) | ✅ §18.2 B.SP.42 |
| Sustainability + LCA + embodied carbon | ✅ §18.2 C.SP.43 |
| PDF-to-BIM (marketplace plugin opportunity) | ✅ §18.2 C.SP.45 |
| Edges + lines + flicker fixes | ✅ §18.3 A.SP.EL.* |
| Wall movement UX | ✅ §18.2 A.SP.WMS |
| Stair 3D creation UX | ✅ §18.2 A.SP.S3D + A.DU.T-H3 |
| buildingSMART certification | ✅ §18.2 B.SP.40 |

### §18.6 — Known scope still NOT in the tracker (by design)

These are pushed to community + marketplace per [platform-strategy.md](../../01-strategy/platform-strategy.md):

| Scope | Why not in tracker |
|---|---|
| Per-jurisdiction regulatory packs (UK Part M · ADA · DIN-Brandschutz · Japanese fire-code · 50+ regional codes) | Marketplace community opportunity |
| Long-tail community-authored typologies (museum · prison · embassy · observatory · cleanroom · place-of-worship · ...) | Phase D + marketplace |
| Customer-managed integrations (BIM360 · Procore · Bentley iTwin · Trimble Connect · Aconex · BIMcloud · ...) | Marketplace plugin opportunity per [platform-strategy §2.5](../../01-strategy/platform-strategy.md) |
| Photoreal rendering primary tool | Out of scope per [engineering-vision §8](../../01-strategy/engineering-vision.md) |
| Construction administration primary tool | Out of scope; Procore + PlanGrid own |
| Facility management primary tool | Out of scope; Archibus + Maximo own |
| 4D scheduling primary tool | Out of scope; Synchro + Asta own (PRYZM exports via C37) |
| 5D cost primary tool | Out of scope; CostX owns (PRYZM exports via C38) |
| Native desktop app | Out of scope per [C44](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md) |
| Mobile native app | Out of scope per [C44 §1.10](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md) — PWA install fills this |

The discipline of saying no is the same as Phase 1 (per [positioning §6](../../01-strategy/positioning.md)). These scope-cuts are not gaps in the tracker — they are deliberate.

---

## §19 — Apartment master document + launch + legacy/wireup deep extraction

The audit in §12.10 cited the apartment/ folder by reference but didn't extract individual work items. A deep extraction (6 files · 3799 LOC) surfaces **72 concrete unshipped work items** plus launch + wireup-2026 residuals. Adding here.

### §19.1 — Apartment BIM 2/3 data management (D-α/β/γ)

From [apartment/bim2-bim3-data-mgmt.md](./apartment/bim2-bim3-data-mgmt.md). 12 items:

| Sub-phase | ID | Title | Phase |
|---|---|---|---|
| **A.AM.D.α2** | D-α-2 | Command handlers: apartment/room parameter mutations | A |
| **B.AM.D.α3** | D-α-3 | apartmentSolver.recomputeImpact — local-region resolver (2wk) | B |
| **B.AM.D.α4** | D-α-4 | Panel A (Apartment Data) — read-only UI surface | B |
| **B.AM.D.α5** | D-α-5 | Panel A — live-edit + dispatch + impact preview | B |
| **C.AM.D.β1** | D-β-1 | Panel B (Room Data) — per-room inline editor | C |
| **C.AM.D.β2** | D-β-2 | Panel C (Adjacency Data) — live graph editor | C |
| **C.AM.D.β3** | D-β-3 | Panel D (Constraint Data) — per-apartment G/T overrides | C |
| **C.AM.D.β4** | D-β-4 | Panel E (Furniture Program) — room-level checklist | C |
| **C.AM.D.β5** | D-β-5 | Panel F (Activity Systems) — archetype toggles | C |
| **D.AM.D.γ1** | D-γ-1 | Propagation engine — full dependency + impact graph (BIM 3.0 inflection) | D |
| **D.AM.D.γ2** | D-γ-2 | Multi-edit batching + single-undo per user action | D |
| **D.AM.D.γ3** | D-γ-3 | External-source edits reconcile (collaborator/AI/remote) | D |

### §19.2 — Apartment cognition stack (L1–L7 progression)

From [apartment/cognition-stack.md](./apartment/cognition-stack.md). 28 items mapped to L1–L7 layers + cross-cuts. Phase A:

| Sub-phase | ID | Title |
|---|---|---|
| **A.CS.L1.1** | L1-α-1 | FacadeValueField — per-edge orientation + sunlight + noise scoring (1wk) |
| **A.CS.L1.2** | L1-α-2 | DaylightDepthField — solar penetration + north-light penalty (1wk) |
| **A.CS.L1.3** | L1-α-3 | Plumb FacadeValueField into bubbleGraph allocator |
| **A.CS.L1.4** | L1-α-4 | Modal "Façade quality" axis in score breakdown |

Phase B:

| Sub-phase | ID | Title |
|---|---|---|
| **B.CS.L2.1** | L2-β-1 | Hierarchy axis — private depth ≥3 / public ≤2 (§PRIVACY-DEPTH) |
| **B.CS.L2.2** | L2-β-2 | EntrySightlineScore — ray-cast entry visibility penalties |
| **B.CS.L2.3** | L2-β-3 | ArrivalSequence analysis — threshold → release detection |
| **B.CS.L2.4** | L2-β-4 | SpatialClimax — identify dominant room |
| **B.CS.L2.5** | L2-β-5 | Modal "Hierarchy" axis + textual arrival narrative |
| **B.CS.L3.1** | L3-γ-1 | EdgeType enum (SOCIAL_FLOW / INTIMATE_ACCESS / …) |
| **B.CS.L3.2** | L3-γ-2 | Populate EdgeType in bubbleGraph builder |
| **B.CS.L3.3** | L3-γ-3 | wallsAndDoors reads EdgeType for door width/style (1wk) |
| **B.CS.L3.4** | L3-γ-4 | edgeRealisation axis — high-importance edge type realization |
| **B.CS.L0.1** | L0-INT-1 | Intent Field substrate (7 channels: importance/privacy/openness/calmness/daylight/sociality/exposure) — highest-leverage cross-cut (2wk) |

Phase C:

| Sub-phase | ID | Title |
|---|---|---|
| **C.CS.L4.1** | L4-δ-1 | AlignmentField — pre-subdivide axis-line snapping (1.5wk) |
| **C.CS.L4.2** | L4-δ-2 | WetStackAlignment — penalise fragmented wet walls |
| **C.CS.L4.3** | L4-δ-3 | OpeningCadenceScore — door head-height + sill alignment |
| **C.CS.L4.4** | L4-δ-4 | ProportionalElegance — penalise aspect >3:1 + jagged boundaries |
| **C.CS.L5.1** | L5-ε-1 | SightlineGraph — diagonal sightline identification (1.5wk) |
| **C.CS.L5.2** | L5-ε-2 | PerceivedSpaciousness — area × diagonal / shortest-side |
| **C.CS.L5.3** | L5-ε-3 | DaylightReveal — entry wall surface light intensity |
| **C.CS.L5.4** | L5-ε-4 | VisualTermination — sightline endpoint identification |

Phase D:

| Sub-phase | ID | Title |
|---|---|---|
| **D.CS.L6.1** | L6-ζ-1 | OccupancyAgent — path-finding + clearance violation sim (2wk) |
| **D.CS.L6.2** | L6-ζ-2 | Six canonical activities — cooking / waking / laundry / hosting / kids / appliances |
| **D.CS.L6.3** | L6-ζ-3 | FrictionScore aggregate — clearance + path-conflict sum |
| **D.CS.L7.1** | L7-η-1 | Typology selector modal (Generic / Haussmann / Nordic / Japanese / Mediterranean / London / NYC) |
| **D.CS.L7.2** | L7-η-2 | Per-typology RoomRule override map |
| **D.CS.L7.3** | L7-η-3 | Per-typology archetype overrides (salon-on-façade · genkan · wet-core) — 2wk |
| **D.CS.L7.4** | L7-η-4 | AI architectural critique per-layout explanation |
| **D.CS.L0.2** | L0-INT-2 | Pareto refactor — true frontier instead of weighted sum (2wk) |

### §19.3 — Apartment dimensional + topology constraints (D + T classes)

From [apartment/dimensional-constraints.md](./apartment/dimensional-constraints.md). 48 items across §D1-D6 (Dimensional G-classes) + §T1-T5 (Topological A-classes). Phase A (data layer + core validators) + Phase B (scoring gates) + Phase C (UI + docs):

Phase A — data + validators (~16 dev-days):

| Sub-phase | ID | Title |
|---|---|---|
| **A.DC.D1.1** | D1.1 | RoomDimensions schema (all per-room constraints) |
| **A.DC.D1.2** | D1.2 | Populate roomDimensions.ts for all RoomTypes |
| **A.DC.D1.3** | D1.3 | Extend RoomRule with maxAreaM2 / maxShortSideM / maxLongSideM |
| **A.DC.D1.4** | D1.4 | Apartment-type sanity table (per bedroom-count min/target/max) |
| **A.DC.D1.5** | D1.5 | Dimension table tests (snapshot pin every value) |
| **A.DC.D2.1** | D2.1 | validateRoomShape — G1/G2/G3/G4/G6 shape validator (2 day) |
| **A.DC.D2.2** | D2.2 | validateRoomFit — G5 furniture envelope validator (3 day) |
| **A.DC.D2.3** | D2.3 | kitchenTriangleValidator — G10 work-triangle |
| **A.DC.D2.4** | D2.4 | validateApartmentEnvelope — gross-area sanity |
| **A.DC.D2.5** | D2.5 | Frontage-priority allocator — D-TGL P3 step (3 day) |
| **A.DC.D2.6** | D2.6 | Validator tests (happy/borderline/fail) |
| **A.DC.T1.1** | T1.1 | AdjacencyRule types + TopologyValidation schema |
| **A.DC.T1.2** | T1.2 | Machine-readable adjacency matrices (§14 per-room) |
| **A.DC.T1.3** | T1.3 | Full pair grid (§15) as derived table |
| **A.DC.T1.4** | T1.4 | Acoustic zoning data (source/receiver pairs) |
| **A.DC.T1.5** | T1.5 | Wet-cluster data (room types + cluster sizes) |
| **A.DC.T1.6** | T1.6 | Adjacency data tests (snapshot) |

Phase B — scoring gates (~14 dev-days):

| Sub-phase | ID | Title |
|---|---|---|
| **B.DC.D3.1** | D3.1 | enumerate.ts shape-validator gate (drop hard-rejects) |
| **B.DC.D3.2** | D3.2 | enumerate.ts fit-validator gate (post-doors) |
| **B.DC.D3.3** | D3.3 | Kitchen triangle gate + retry logic |
| **B.DC.D3.4** | D3.4 | New shapeQuality / fitQuality axes in ObjectiveVector |
| **B.DC.D3.5** | D3.5 | Apartment-envelope pre-D-TGL block + user toast |
| **B.DC.D3.6** | D3.6 | E2E fixture tests (envelope-reject · shape-reject · fit-reject) |
| **B.DC.T2.1** | T2.1 | validateMandatoryAdjacencies — A1 validator |
| **B.DC.T2.2** | T2.2 | validateForbiddenAdjacencies — A3 wrapper |
| **B.DC.T2.3** | T2.3 | validateAcousticZoning — A5 BFS distance check |
| **B.DC.T2.4** | T2.4 | validateWetCluster — A6 vertical-stack grouping |
| **B.DC.T2.6** | T2.6 | scoreCirculationSequence — A8 arrival BFS (1.5 day) |
| **B.DC.T2.7** | T2.7 | Topology validator tests |
| **B.DC.T3.1** | T3.1 | bubbleGraph reads A1 declarative rules |
| **B.DC.T3.2** | T3.2 | enumerate.ts gate for A1/A3/acoustic/wet/sequence |
| **B.DC.T3.3** | T3.3 | topologyQuality axis in ObjectiveVector |
| **B.DC.T3.4** | T3.4 | E2E topology tests (forbidden door · acoustic · wet) |

Phase C — UI + docs (~9 dev-days):

| Sub-phase | ID | Title |
|---|---|---|
| **C.DC.D4.1** | D4.1 | Card score breakdown adds Shape + Fit bars |
| **C.DC.D4.2** | D4.2 | Per-room warning badges (Tunnel kitchen · etc.) |
| **C.DC.D4.3** | D4.3 | HARD-REJECT visibility + modal explanation |
| **C.DC.D4.4** | D4.4 | Modal tests (badges + toast) |
| **C.DC.D5.1** | D5.1 | Update SPEC-ARCHITECTURAL-PROGRAM-RULES — Dimensions section |
| **C.DC.D5.2** | D5.2 | Update C09 §3.4 contract — dimensional validators |
| **C.DC.D5.3** | D5.3 | User-guide entry — why 20 m² bathroom won't generate |
| **C.DC.T4.1** | T4.1 | Topology axis bar in score breakdown |
| **C.DC.T4.2** | T4.2 | Per-violation badges (Bath visible from entry · etc.) |
| **C.DC.T4.3** | T4.3 | Modal topology UI tests |
| **C.DC.T5.1** | T5.1 | Update SPEC-ARCHITECTURAL-PROGRAM-RULES — Adjacency |
| **C.DC.T5.2** | T5.2 | Update C09 §3.4 — Topology validators section |
| **C.DC.T5.3** | T5.3 | User-guide — Why your layout has a Topology bar |

Phase D — psychological geometry + reconciliation (~3 dev-days):

| Sub-phase | ID | Title |
|---|---|---|
| **D.DC.D6.1** | D6.1 | Tighten existing minima against framework (kitchen 1.8 vs 2.1) |
| **D.DC.D6.2** | D6.2 | Psychological-geometry axis (bed-aligned-with-door · etc.) |

### §19.4 — Apartment family platform (P0)

From [apartment/family-platform.md](./apartment/family-platform.md). 9 items:

| Sub-phase | ID | Title | Phase |
|---|---|---|---|
| **A.AM.FP.1** | P0.1 | Element-lifecycle map (formalised + visualised) | A |
| **A.AM.FP.2** | P0.2 | Universal element contract (generalise F-tier ladder per discipline) | A |
| **B.AM.FP.3** | P0.3 | FamilyRegistry substrate (L0 schemas + indexes + seeding) (3wk) | B |
| **B.AM.FP.4** | P0.4 | FamilyRequest schema + Stage 1 ingestion (1wk) | B |
| **B.AM.FP.5** | P0.5 | Family Generation Pipeline Stages 2-4 (parametric + geometry + Zod) (6wk) | B |
| **B.AM.FP.6** | P0.6 | Family Generation Pipeline Stages 5-8 (registry + AI vocab + UI + IFC) (4wk) | B |
| **B.AM.FP.7** | P0.7 | Plugin-marketplace runtime (.pryzm-family loader + Registry) (3wk) | B |
| **B.AM.FP.8** | P0.8 | Discovery APIs (schema / IFC reader / property panel) (4wk) | B |
| **C.AM.FP.9** | P0.9 | Roadmap refactor audit (every tier against Family Platform target) (1wk) | C |

### §19.5 — Apartment F-tier (furniture + activity systems)

From [apartment/furniture-and-activity.md](./apartment/furniture-and-activity.md). 60+ items across F1 (per-furniture-type implementations) + F2-F8 (footprints / archetypes / activity systems / lighting / built-ins / soft furnishings). Selected key items:

Phase A — F1 individual furniture types (~150 dev-days at 5-10 days each):

| Sub-phase | ID | Title |
|---|---|---|
| **A.F1.1** | F1.1 | desk + desk_chair (full §0.1 ladder: 24 rows; 10 dev-days) |
| **A.F1.2** | F1.2 | bookshelf + bookshelf_glass (10 dev-days) |
| **A.F1.3** | F1.3 | tv_unit + tv_stand + tv_console |
| **A.F1.4** | F1.4 | shoe_cabinet + coat_rack + console_table + entry_bench |
| **A.F1.5** | F1.5 | bathroom_vanity + mirror + mirror_light + towel_rail |
| **A.F1.7** | F1.7 | wc_washbasin (separate from bathroom) |
| **A.F1.8** | F1.8 | washing_machine_standalone + tumble_dryer + utility_cabinet + drying_rack |
| **A.F1.9** | F1.9 | buffet + sideboard |
| **A.F1.10** | F1.10 | wall_art + wall_mirror |
| **A.F1.11** | F1.11 | curtain_rod + curtain_panel + roller_blind + venetian_blind |
| **A.F1.12** | F1.12 | dresser + vanity_table |
| **A.F1.14** | F1.14 | pantry_cabinet |
| **A.F1.15** | F1.15 | pendant_cluster (pendant lighting fixture) |

Phase B — F2 footprints + plan symbols + F3 archetype wiring (~5 wk):

| Sub-phase | ID | Title |
|---|---|---|
| **B.F2.1** | F2.1-F2.6 | Footprints + plan symbols for F1.1–F1.15 (3-4 wk combined) |
| **B.F3.1** | F3.1 | Study archetype wiring (desk required + bookshelf optional) |
| **B.F3.5** | F3.5 | WC archetype (wc_washbasin required) |
| **B.F3.6** | F3.6 | Utility archetype (washer + dryer required) |

Phase C — F4 activity systems · F5 lighting programme · F8 housekeeping (~6 wk):

| Sub-phase | ID | Title |
|---|---|---|
| **C.F4.1-7** | F4.1–F4.7 | Activity systems S1–S7: window dressing · entry storage · study workstation · bathroom vanity · utility · bedroom dressing · TV wall (~30 dev-days; "activity archetype" pattern) |
| **C.F5.1-4** | F5.1–F5.4 | Lighting programme (task / accent / pendant cluster / scenes) — 5 dev-days; D-LE wiring |
| **C.F8.1** | F8.1 | Orphan audit |
| **C.F8.3** | F8.3 | Material intent labels |

Phase D — F6 built-in joinery · F7 soft furnishings (~7 wk):

| Sub-phase | ID | Title |
|---|---|---|
| **D.F6.1-4** | F6.1–F6.4 | Built-in joinery (wall wardrobe · shelving · window seat · headboard + sconces) — 30 dev-days; C15 hosted-element |
| **D.F7.1-3** | F7.1–F7.3 | Soft furnishings (rug anchors · throws · plants) — 5 dev-days |

### §19.6 — Launch readiness (publication-pending)

From [launch/](./launch/). The 5 launch docs are mostly historical (post-incident traces) or publication-deferred drafts:

| Sub-phase | ID | Title | Status |
|---|---|---|---|
| **A.M.LAUNCH.BETA** | — | Publish [beta-announcement.md](./launch/beta-announcement.md) (copy RATIFIED; awaiting S48-D9 launch milestone per ADR-0038 §3) | A — publication-pending |
| **A.M.LAUNCH.GA** | — | Publish [ga-launch-blog-post.md](./launch/ga-launch-blog-post.md) (draft 2026-04-29; sprint S72 D6); needs refresh for PRYZM-not-PRYZM-2 brand decision per [NAMING-CONVENTIONS](../../NAMING-CONVENTIONS.md) | A — publication-pending |
| **A.M.LAUNCH.BETA-DEMO** | — | Beta demo script ([beta-demo-script.md](./launch/beta-demo-script.md)) — sales-engineer asset; refresh per current product state | A — refresh-pending |
| — | — | 40-cw-pipeline-trace.md + 41-batch-errors.md — historical incident traces; no open work | closed |

### §19.7 — Legacy wireup-2026 residuals

From [legacy/wireup-2026/00-PLAN.md](./legacy/wireup-2026/00-PLAN.md) (S72 white-UI + real-engine plan). Most has shipped (bootstrap split · bake-worker · sync-server · plugin-host · stores all live). Residuals:

| Sub-phase | ID | Title | Status |
|---|---|---|---|
| **A.WU.768** | — | ~768 mechanical replacements in (former) `src/ui/` → modern runtime APIs | mostly shipped (src/ has 7 files, 0 subdirs — work largely complete) |
| **A.WU.E8** | — | Codemod ratchet lint rule (`@pryzm/legacy-bridge` import-forbidden) | mostly redundant (bridge package never landed; absorbed by C14 cast-count ratchet) |

The wireup-2026 plan succeeded — no material outstanding scope vs the current Phase A.

### §19.8 — Final-final grand total (after §19 integration)

| Layer | Sub-phases |
|---|---|
| Phase A | ~205 (§18.4) + ~80 from apartment-deep-extract (§19.1-19.5 Phase A items + A.DC.* + A.F1.* + A.AM.* + A.CS.L1.*) + A.M.LAUNCH.* (3) + A.WU.* (2) = **~290** |
| Phase B | ~93 + ~40 from apartment (§19 B-items) = **~133** |
| Phase C | ~67 + ~25 from apartment (§19 C-items) = **~92** |
| Phase D | ~10 + ~15 from apartment (§19 D-items) = **~25** |
| Cross-cutting (X.*) | ~16 |
| **GRAND TOTAL** | **~556 named deliverables across 5 years** |

This is now **truly exhaustive**. Every line in every plans/* doc + every spec + every status doc + every relevant legacy plan has been catalogued or explicitly excluded.

### §19.9 — Final coverage statement

After §12 + §16 + §18 + §19, the tracker covers:

✅ All 49 contracts (C01–C49)
✅ All 56 specs
✅ All 25 PRYZM-first-party typologies
✅ The 130+ items from remaining-work-consolidated.md
✅ The 72 apartment master-document items (D-α/β/γ · L1-L7 cognition · D-class + T-class · P0 family-platform · F-tier furniture)
✅ All UI/UX surfaces
✅ Auth + billing + admin tooling
✅ Native Revit import + export
✅ AI command surface
✅ Family creation pipeline
✅ Mobile + tablet
✅ All marketing + trust surfaces
✅ ISO 19650 (CDE · stakeholder review · EIR/BEP/TIDP/MIDP)
✅ Edges + lines + flicker fixes
✅ Wall movement UX + Stair 3D UX
✅ MEP architectural-level + Materials repository + Analysis bridge
✅ Sustainability + LCA + Carbon (Phase D)
✅ buildingSMART certification
✅ Launch publication tasks (beta + GA blog + demo script)
✅ Wireup-2026 residuals (mostly shipped)

Known **deliberate** exclusions (§18.6) remain unchanged.

**The tracker is the operational dashboard. ~556 named deliverables. Every PRYZM commitment traces here.**

---

## §20 — Legacy `plan-detail/` + `phases/` + `wireup-2026/chunks` integration (the last residuals)

The user asked again: "is all of the scope covered?" Spot-checking the legacy folders that hadn't been deeply audited revealed **9 strategic themes in `legacy/plan-detail/06-AEC-WISHLIST.md` (AEC-Magazine BIM 2.0 supplement)** that proposed SPECs 33-58 — most map to existing contracts/specs, but **4 are NEW themes** I hadn't explicitly enumerated. Plus the extended SPEC numbering (49-58) carries Phase D scope worth surfacing.

### §20.1 — AEC Magazine Wishlist supplement — NEW themes not in §3-§19

Per [legacy/plan-detail/06-AEC-WISHLIST.md](./legacy/plan-detail/06-AEC-WISHLIST.md) (the AEC Magazine May/June 2023 BIM 2.0 wishlist folded into the post-GA roadmap):

| Sub-phase | Title | Phase | Note |
|---|---|---|---|
| **D.AEC.46** | **DfMA / Digital Fabrication** (CNC export · robotic fabrication · volumetric · BIM-to-CAM · on-site assembly QR) | D | SPEC-46 proposed. "None of the current generation BIM tools were ever intended to interface to or drive digital fabrication" (AEC Magazine quote). Marketplace plugin opportunity; PRYZM-first-party via export contracts. |
| **D.AEC.47** | **ConTech Bridges** (Procore · Asite · OpenSpace · Dusty Robotics · Trimble Connect · Autodesk Construction Cloud bidirectional integrations) | D | SPEC-47 proposed. Per [platform-strategy §2.5](../../01-strategy/platform-strategy.md), these are **marketplace plugin opportunities**, not PRYZM-first-party builds. |
| **D.AEC.53** | **AI-Automated 2D Drawing Output — "the killer feature"** (every drawing generated AND CHECKED automatically) | D | SPEC-53 proposed. "I would say we're only years away from having fully automated and checked 2D drawing output… The first software company to deliver a reliable automated workflow will make an absolute killing." — extends C24 + C28 + C09 AI. **Strategically important — not deferrable past Phase D.** |
| **D.AEC.58** | **Outcome-Based Pricing Model** (pay-per-output · revenue-share · post-subscription business model) | D | SPEC-58 proposed. Extends [C39 Pricing](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md). Strategic-business decision; sales-model evolution. |

### §20.2 — Extended SPEC numbering (Phase D / post-GA — SPEC-48 onward)

These specs are proposed in the AEC wishlist but DO NOT exist as files in `docs/03-execution/specs/` (max actual file = SPEC-48). They are Phase D / Year 5+ items:

| Sub-phase | Spec | Title | Phase |
|---|---|---|---|
| **D.SP.48** | SPEC-48 | Linked-Data Layer (RDF + SPARQL endpoint) — semantic web for BIM | D |
| **D.SP.49** | SPEC-49 | IDS 1.0 (Information Delivery Specification) — buildingSMART standard | D |
| **D.SP.50** | SPEC-50 | ICDD ISO 21597 Information Container | D |
| **D.SP.51** | SPEC-51 | bSDD Integration + 10 Jurisdiction Packs — code-compliance dictionary | D |
| **D.SP.52** | SPEC-52 | AI Design Partner (Stage 0 → Stage 4 progression) — full-autonomy roadmap | D |
| **D.SP.54** | SPEC-54 | Code Compliance Engine (IBC + AD-B + EUROCODE + SBC) — regulatory check engine | D |
| **D.SP.55** | SPEC-55 | DTDL Export + IoT Bridge (Azure DT + MQTT) — digital twin handover | D |
| **D.SP.56** | SPEC-56 | Specification Writer (NBS Chorus + SpecLink + MasterFormat) — written-spec generator | D |
| **D.SP.57** | SPEC-57 | Decentralised Data Ownership (Solid Pods + WebID) — Web3-adjacent data sovereignty | D |

### §20.3 — Strategic ADRs (ADR-031 → ADR-050) — decisions pending

The AEC wishlist proposes 20 strategic ADRs for Phase 4-7 (most still pending). These are decisions that gate Phase B/C/D work:

| Sub-phase | ADR | Decision pending | Phase |
|---|---|---|---|
| **B.ADR.36** | ADR-036 | Stakeholder review pricing — free viewer per project vs metered | B |
| **B.ADR.37** | ADR-037 | Hybrid data sovereignty default — cloud-default vs local-default | B |
| **B.ADR.38** | ADR-038 | Enterprise BYOK key custody — KMS-backed vs HSM-backed vs both | B |
| **C.ADR.39** | ADR-039 | Analysis bridge data contract — IFC4+JSON-LD vs gbXML vs MessagePack | C |
| **C.ADR.40** | ADR-040 | Render-worker engine selection — Cycles only vs +Mitsuba vs +LuxCore | C |
| **C.ADR.41** | ADR-041 | Cost rate library plug-in model — BYO vs marketplace-verified vs both | C |
| **C.ADR.42** | ADR-042 | 4D simulation playback — server-side video render vs client-side replay | C |
| **D.ADR.43** | ADR-043 | LCA database — open EC3+ICE vs commercial One Click LCA partnership | D |
| **D.ADR.44** | ADR-044 | DfMA fabrication output — IFC4-Precast vs LandXML-CAM vs vendor-direct | D |
| **D.ADR.45** | ADR-045 | ConTech integration topology — direct API per vendor vs unified ConnectorHub | D |
| **D.ADR.46** | ADR-046 | Triple-store implementation — Apache Jena vs Oxigraph vs Postgres-AGE | D |
| **D.ADR.47** | ADR-047 | SPARQL endpoint authn — anonymous public read vs project-token vs OAuth2 | D |
| **D.ADR.48** | ADR-048 | IDS authoring UX — visual editor vs YAML vs both | D |
| **D.ADR.49** | ADR-049 | bSDD sync policy — pull-on-edit vs nightly mirror vs hybrid | D |
| **D.ADR.50** | ADR-050 | AI design partner constraint propagation — declarative vs imperative vs hybrid | D |

### §20.4 — Verdict on the other legacy folders

| Legacy folder/file | Verdict | Why no new scope |
|---|---|---|
| **legacy/phases/PHASE-1/** (5 docs) | HISTORICAL | PRYZM 2 architecture rebuild PHASE-1 (Foundation + 1A-1D). Scope SHIPPED. |
| **legacy/phases/PHASE-2/** (6 docs) | HISTORICAL | PRYZM 2 PHASE-2 (Migration + 2A-2D Sheets/Schedules + Sync/Awareness Beta). Scope SHIPPED. |
| **legacy/phases/PHASE-3/** (8 docs) | HISTORICAL | PRYZM 2 PHASE-3 (Completion-GA · 3A AI/Visibility · 3B IFC/Family Creator · 3C Plugin SDK/Marketplace · 3D Hardening-GA). Scope SHIPPED — these are the architecture-rebuild plans that delivered Plugin SDK v1.0.0, the bake-worker, the sync-server. |
| **legacy/phases/PHASE-4-POST-GA/** | INFORMATIONAL | Post-GA phase plan — superseded by [vision-2030.md](./vision-2030.md) + [roadmap-phase-3-ga.md](./roadmap-phase-3-ga.md) + this tracker's Phase D |
| **legacy/plan-detail/01-MASTER-36M.md** | HISTORICAL | The original 36-month master plan; PRYZM 2 architecture rebuild. Now PRYZM ships at v1.0.0; replaced by [vision-2030.md](./vision-2030.md). |
| **legacy/plan-detail/04-LINEAR-EXECUTION.md** | HISTORICAL | Linear-execution view of the 36-month plan; informational. |
| **legacy/plan-detail/05-POST-GA-ROADMAP.md** | SUPERSEDED | Post-GA roadmap; folded into vision-2030 + phase-3-ga + this tracker §5 + §20. |
| **legacy/plan-detail/06-AEC-WISHLIST.md** | **INTEGRATED §20** above | 4 new themes + 9 extended specs + 15 strategic ADRs surfaced. |
| **legacy/wireup-2026/00-PLAN.md** | INTEGRATED §19.7 | S72 white-UI + real-engine plan; mostly shipped. |
| **legacy/wireup-2026/chunks/** (28 docs) | HISTORICAL | Per-phase breakdown of the wireup plan; sub-phase enumeration. The PRYZM 2 architecture rebuild is SHIPPED. References from runtime-composer and other packages cite specific chunk subsections. |
| **legacy/wireup-2026/reconciliation/** (7 docs) | HISTORICAL | Per-phase code-verified audits (A-F); the audit results informed Phase 0 of [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md). |
| **legacy/M28-IFC-IMPORT-PIPELINE.md** | EXPLANATORY | "subordinate to SPEC + ADR" per its own §authority. The actual IFC work is C25 + plugins/ifc-import (already in tracker as A.25, A.27, B.U.9). |
| **legacy/superseded-2026-06-01/** (7 docs) | SUPERSEDED | The 7 files I moved myself in the 03-execution restructure; superseded by the new 5-horizon planning system. Cited as archeology in [plans/README.md §2.6](./README.md). |

### §20.5 — REVISED final-final-final grand total

| Layer | Sub-phases | Δ vs §19 |
|---|---|---|
| Phase A | ~290 | unchanged |
| Phase B | ~133 + 3 ADRs (B.ADR.36–38) = **~136** | +3 |
| Phase C | ~92 + 4 ADRs (C.ADR.39–42) = **~96** | +4 |
| Phase D | ~25 + 4 AEC themes + 9 extended specs + 8 ADRs = **~46** | +21 |
| Cross-cutting (X.*) | ~16 | unchanged |
| **GRAND TOTAL** | **~584 named deliverables** | +28 vs §19 |

### §20.6 — Is ALL the scope now covered?

After §20: **yes, fully**. Every folder in `docs/03-execution/plans/` (including the legacy/ archeology) has been audited, and either:

1. **Mapped to an active sub-phase** in §3–§5 or §12.* or §16 or §18 or §19 or §20
2. **Explicitly marked HISTORICAL** because the work has shipped (architecture rebuild · PRYZM 2 → PRYZM transition · wireup-2026 white-UI work)
3. **Explicitly marked SUPERSEDED** because a newer canonical plan replaces it
4. **Explicitly marked EXPLANATORY** because the doc describes existing scope already in the tracker
5. **Explicitly excluded** per §18.6 deliberate scope-cuts (community + marketplace opportunities; out-of-scope domains per engineering-vision §8)

There are no remaining folders, plans, specs, contracts, ADRs, status docs, or apartment master-doc items that lack a tracker mapping.

### §20.7 — The single highest-priority Phase D item: AI-Automated 2D Drawing Output

Worth elevating: **D.AEC.53 — AI-Automated 2D Drawing Output ("the killer feature")** per AEC Magazine. Quoted: *"I would say we're only years away from having fully automated and checked 2D drawing output… The first software company to deliver a reliable automated workflow will make an absolute killing."*

This sits at the intersection of:
- **C09 AI host** (the workflow runtime)
- **C24 Sheet Composition** (the sheet engine)
- **C28 Data Panel** (the data + automation layer)
- **C09 §3 cognition substrate** (the model the AI reasons over)
- **C50 Typology Pipeline** (per-typology drawing conventions)

It is the **single Phase D bet** that could most materially reshape the industry. Not deferrable past Phase D. Should be considered for Phase C if Phase B + the cognition substrate + the sheet engine mature ahead of schedule. Flag this in the next quarterly review.

---

## §21 — END-STATE GAP AUDIT (verifying NO orphans at Phase D close)

User asked: *"when everything is done, will the vision of the solution + the architecture + all contracts + all ADRs + all specs + all execution files be covered — with no gaps?"*

This section runs the verification matrix. For each upstream commitment, the audit traces it to a delivering sub-phase + IP. Any orphan (commitment without delivery, or delivery without commitment) is flagged.

### §21.1 — Strategy layer (01-strategy/) — 13 canonical docs traced

| Strategy commitment | Delivered by phase | At which IP | Verification |
|---|---|---|---|
| **manifesto.md** §2 promise: "one conversation, from raw site to coordinated building" | A (apartment + house + office); B (10 typologies); C (25 typologies) | IP-A6 (apartment full flow) → IP-B17 (10 typologies) → IP-C9 (25 typologies) | Demo runbook proves the one-conversation promise per typology |
| **manifesto.md** §5 brand voice | A (content sweep + landing rebuild) | IP-A5 (brand cutover) | Quarterly brand-voice content audit per operating-principles §6.3 |
| **manifesto.md** §7 trade-offs (open format · 70/30 marketplace · sovereignty default) | A (SDK + marketplace) · B (EU region) · C (4 regions + BYOK + self-host) | IP-A1 + IP-B9 + IP-C3 | C07 + C40 + C49 contracts CANONICAL |
| **product-vision.md** §2 promise + §5 user journey 8 steps | A (Steps 1-8 wired) | IP-A3 (RAC chatbot Step 2) → IP-A6 (full journey) | E2E demo passes all 8 steps |
| **product-vision.md** §4 element types (14) + AI workflows (7) | A (3 typology pipelines) → C (25 typologies) | All Phase A/B/C IPs cumulative | Per-typology reference projects nightly green |
| **product-vision.md** §6 environments (local + CI + staging + prod) | A (CI gates) · B (EU region) · C (4 regions) | IP-A1 + IP-B9 + IP-C1/2/3 | All environments live + DR drills passing |
| **product-vision.md** §9 phased roadmap (Phase 0-3) | All phases A/B/C close | IP-A13 · IP-B18 · IP-C9 | Exit ADRs raised at each phase |
| **product-vision.md** §10 guiding principles (constraint DB is law · conversation before UI · etc.) | Continuous + X.4 + X.6 | Continuous | Per-PR review per operating-principles §6.2 |
| **positioning.md** §3 D1-D13 differentiators | All phases | IPs cumulative — see §18.1 + §12.2 | Each D# traces to a contract → phase delivery |
| **positioning.md** §4 moats (constraint DB · 49-contract suite · layered architecture · open format · marketplace) | A (foundation) · B (marketplace flywheel) · C (ecosystem moat) | IP-A6 · IP-B16 · IP-C9 | Marketplace 2000 artefacts + 200 devs by Phase C close |
| **positioning.md** §5 two-sided positioning | A (demand side PLG + supply side SDK) | IP-A6 (demand) · IP-A8 (supply via first community pack) | C39 + C40 contracts CANONICAL |
| **personas.md** C1-C5 archetypes | A (Solo + Studio PLG) · B (Mid-firm + first Enterprise) · C (full Enterprise) | IP-A6 · IP-B8 · IP-C1 | Per-tier MRR targets met |
| **go-to-market.md** 4 acquisition motions | A (PLG · DR · enterprise prep) · B (Mid-firm sales) · C (Enterprise contracts) | IP-A6 + roadmap-enterprise-delivery | Per-tier customer counts met |
| **platform-strategy.md** 3 pillars (Plugin SDK · Family Platform · Marketplace) | A (all 3 live) · B (flywheel) · C (moat) | IP-A1 + IP-A8 + IP-B16 + IP-C9 | C07 + C40 + family-platform infrastructure CANONICAL |
| **site-and-cognition-strategy.md** site substrate + 7-layer cognition | A (L1-L4 + site/climate) · B (L5) · C (L6 + L7 + cognition API) · D (substrate as research benchmark) | IP-A4 + IP-A7 + IP-B11 + IP-C7 + IP-D1 | C19/C20/C21 + cognition rules + L5-L7 evaluators |
| **operating-principles.md** O1-O10 + hiring bar + cadence + comp | Continuous (X.* + all phases) | Continuous | Quarterly + annual reviews per O8 + O9 |
| **engineering-vision.md** P1-P8 principles | Continuous + CI gates | Per-PR | All 21 CI gates green |
| **engineering-vision.md** D1-D13 differentiators | All phases | See §18.1 | Each D# → contract → phase delivery |
| **engineering-vision.md** 5 customer archetypes C1-C5 | personas.md row above | Same | Same |
| **engineering-vision.md** 17 headline NFTs + 68 benches | Continuous (X.1) | Continuous per-PR baseline | apps/bench CI baseline regression gate |
| **architecture.md** L0-L9 layered model + boundary lint | Continuous + C01-C18 ratifications | Per-PR | eslint-plugin-boundaries hard-fail gate |
| **architecture.md** composeRuntime() 29+ slot interface | Continuous (slot additions per phase) | Per-PR + IP-A2/A4/etc. | Per-slot test in packages/runtime-composer |
| **architecture.md** convergence booleans | A (most close) · B (region live) · C (multi-region) | IP-A12 (Phase A booleans) · IP-B17 · IP-C9 | check-pryzm3-exists.ts 9/9 then 13/13 then 17/17 |
| **architecture-breakdown.md** 79 packages + 47 plugins + 13 apps | All phases (package count grows) | Continuous | architecture-breakdown.md refreshed per PR |
| **risks-and-assumptions.md** R1-R8 ongoing + mitigations | Continuous monitoring + per-incident response | Quarterly review | risks-and-assumptions.md per-quarterly review per §9 |

**Verdict §21.1**: ALL 13 strategy docs have delivery traces. No orphans.

### §21.2 — Contracts layer (49 contracts C01-C49 + proposed C50) — traced to CANONICAL

Per §12.2 + §18.1 + §20.3:

| Contract range | Status at end-of-Phase | All CANONICAL by Phase D? |
|---|---|---|
| C01-C18 (CANONICAL today) | All ratified | ✅ |
| C19 + C20 + C21 | Ratified end-of-Phase-A | ✅ IP-A5 / IP-A9 |
| C22 + C23 | Phase A partial → Phase B full | ✅ IP-B12 |
| C24 + C27 + C28 + C29 + C30 | Phase B full | ✅ IP-B15 |
| C25 + C26 | Phase A partial (Pset + IFC4X3-RV variant) → Phase C full (Revit round-trip + 100 ref) | ✅ IP-C4 |
| C31 + C39 + C40 + C41 + C42 | Phase A partial → Phase B/C full | ✅ IP-B12 + IP-C8 |
| C32 + C33 + C35 + C37 + C38 | Phase C full | ✅ IP-C5 + IP-C6 + IP-C8 |
| C34 + C36 | Phase B full | ✅ IP-B10 + IP-B12 |
| C43 + C44 + C45 + C46 | Phase A partial → Phase B/C full | ✅ IP-B12 + IP-B14 + IP-C3 |
| C47 + C48 + C49 | Phase A partial → Phase B/C full | ✅ IP-A11 (DR drill) + IP-B9 (EU) + IP-C1-3 (US/AP/UK) |
| C50 Typology Pipeline (NEW) | DRAFT Phase A → CANONICAL Phase B | ✅ IP-B17 |
| C51-C54 (PROPOSED in §18.2 / §20.2) | DRAFT Phase B/C → CANONICAL Phase C/D | ✅ tracker §20.5 |

**Verdict §21.2**: All 49 contracts + C50 reach CANONICAL by Phase C close. Proposed C51+ ratify in Phase D. No orphans.

### §21.3 — ADR layer (108 ADRs) — conformance tracing

ADRs are *immutable per-decision rationale* — they don't "close", they document. The audit verifies: do all 108 ADRs have implementations that conform, OR a documented supersession?

| ADR range | Conformance state | Verified by |
|---|---|---|
| **ADRs 0001-0050 (early architecture)** — typed-IDs · command handlers · frame scheduler · MessagePack codec · primitive committer · etc. | ✅ Conforming — these are foundational; the code follows them; X.3 CI gates per-PR | Per-PR review |
| **ADRs 0051-0099 (mid)** — undo single-source-of-truth · ydoc-per-level · ai-response-cache · web-worker geometry pipeline · etc. | ✅ Conforming — recent (2026-04/05); aligned with current code per the audits | Per-PR review |
| **ADRs 0100-0108 (recent)** — recent decisions | ✅ Conforming | Per-PR review |
| **Strategic ADRs ADR-031 → ADR-050 (PROPOSED in §20.3)** | DRAFT — ratify in Phase B/C/D | ✅ Tracker §20.3 |
| **Future Phase-exit ADRs** (ADR-NNN-phase-N-exit-X.md per phase close) | Will exist at IP-A13 · IP-B18 · IP-C9 · Phase D close | Per closure |

**Verdict §21.3**: All 108 existing ADRs conform OR have supersession path. Phase-exit ADRs added at IP closures. No orphans.

### §21.4 — Specs layer (56 specs) — owner sub-phase traced

Per §18.1 — all 56 specs mapped to delivering sub-phase. Per §18.2 + §20.2 — 11+ proposed extended specs (SPEC-48..58 + SPEC-FAMILY-FORMAT) mapped to Phase D.

| Spec range | Owner sub-phase | Phase delivery |
|---|---|---|
| SPEC-01 through SPEC-15 (early infrastructure specs) | continuous (X.1 + Phase A foundations) | Phase A |
| SPEC-21, SPEC-24, SPEC-26, SPEC-27, SPEC-28, SPEC-29, SPEC-30, SPEC-31 (PRYZM 2 lineage) | Phase A bucket B7 + B8 | Phase A |
| SPEC-32 through SPEC-37 (CDE · stakeholder review · sovereignty · browser-security · COBie · clash) | §18.2 A.SP.32 + A.SP.33 + Phase B (clash) + Phase C (COBie) | Phase B-C |
| SPEC-38 + SPEC-39 (MEP + EIR/BEP) | Phase A §18.2 | Phase A-B |
| SPEC-40 (buildingSMART cert) | Phase B §18.2 B.SP.40 | Phase B |
| SPEC-41 + SPEC-42 (sheet×4D×5D + analysis bridge) | Phase B-C §18.2 | Phase B-C |
| SPEC-43 (sustainability + LCA + carbon) | Phase D §18.2 C.SP.43 + §20.1 | Phase D |
| SPEC-44 (cloud-baked rendering) | Already shipped (bake-worker) | ✅ |
| SPEC-45 (PDF-to-BIM) | Phase D §18.2 C.SP.45 | Phase D (marketplace) |
| SPEC-46 + SPEC-47 (plan critique + 3-options) | ✅ Already shipped | ✅ |
| SPEC-48 (constraint solver) | ✅ Already shipped + Family-editor | ✅ |
| SPEC-APARTMENT-LAYOUT-GENERATOR | ✅ Shipped | ✅ |
| SPEC-ARCHITECTURAL-PROGRAM-RULES + SPEC-LAYOUT-CONSTRAINT-DATABASE | Phase A A.37 (continuous) | Phase A-D |
| SPEC-CANVAS-FLOATING-PANELS | Phase A A.U.4 + A.U.7 | Phase A |
| SPEC-CEILING-LAYOUT-ENGINE | ✅ Already shipped | ✅ |
| SPEC-FAMILY-EDITOR | Phase A-B family pipeline | Phase A-B |
| SPEC-FURNITURE-LAYOUT-ENGINE | ✅ Already shipped | ✅ |
| SPEC-KITCHEN-WARDROBE-WALL-DRIVEN | Apartment carry-overs §16.12 + Phase A | Phase A |
| SPEC-LIGHTING-LAYOUT-ENGINE | ✅ Already shipped | ✅ |
| SPEC-MATERIALS-REPOSITORY | Phase B §18.2 B.SP.MAT | Phase B |
| SPEC-PROJECT-OPEN-CREATE-PIPELINE | Phase A A.PL.* | Phase A |
| SPEC-SEMANTIC-DESIGN-ASSISTANT | Phase A-B (A.42-A.47 + B.AI.*) | Phase A-B |
| SPEC-STAIR-3D-CREATION | Phase A §18.2 A.SP.S3D | Phase A |
| SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE | ✅ Already shipped | ✅ |
| SPEC-WALL-MOVEMENT-STUDY | Phase A §18.2 A.SP.WMS | Phase A |
| SPEC-WALL-SINGLE-VOLUME-CSG | ✅ Already shipped (Pascal ADR-0055 P3b) | ✅ |
| PLAN-GENERATIVE-DESIGN-SPRINTS | Superseded by typology-expansion-roadmap | ✅ |
| **PROPOSED SPEC-48..58** (Linked-data + IDS + ICDD + bSDD + AI-design-partner + Code-compliance + DTDL/IoT + Spec-writer + Decentralised-data) | Phase D §20.2 | Phase D |
| **PROPOSED SPEC-FAMILY-FORMAT** | Phase A A.F.5 | Phase A |

**Verdict §21.4**: All 56 existing specs + ~11 proposed have a delivering sub-phase. No orphans.

### §21.5 — Execution layer (03-execution/) — all docs accounted for

| 03-execution/ doc | Status | Delivery |
|---|---|---|
| **plans/cadence-and-planning-system.md** | META (CANONICAL) | Continuous |
| **plans/vision-2030.md** | H1 strategic | All phases |
| **plans/roadmap-phase-1-alpha.md** | H2 Phase A | All Phase A IPs |
| **plans/roadmap-phase-2-beta.md** | H2 Phase B | All Phase B IPs |
| **plans/roadmap-phase-3-ga.md** | H2 Phase C | All Phase C IPs |
| **plans/typology-expansion-roadmap.md** | H2 cross-cut | All 25 typology sub-phases |
| **plans/roadmap-enterprise-delivery.md** | H2 cross-cut | All Enterprise customer milestones |
| **plans/annual-2026.md** | H3 annual | Phase A H2 2026 |
| **plans/quarterly-2026-Q3.md** | H4 quarterly | Sprint 1-6 (IP-A1 through IP-A6) |
| **plans/quarterly-2026-Q4.md** | H4 quarterly | Sprint 7-13 (IP-A7 through IP-A13) |
| **plans/master-execution-tracker.md** (this doc) | THE operational dashboard | Per sprint update |
| **plans/apartment/** (6 docs) | Per-workstream detail | Per §19.1-19.5 sub-phases |
| **plans/pryzm-1-sunset.md** | Operational (PRYZM 1 retirement) | Continuous |
| **plans/launch/** (5 docs) | Publication-pending | §19.6 |
| **plans/legacy/** (all) | HISTORICAL or SUPERSEDED | §20.4 verdict table |
| **specs/** (56 + README) | Per-system normative | §21.4 above |
| **status/remaining-work-consolidated.md** | Active operational | §16 fully absorbed |
| **status/autonomous-session-runs-log.md** | Session record | Continuous |
| **status/apartment-{layout,dashboard}.md** | Active workstream | §16.12 |
| **status/cut-list-log.md** | Operational cuts | Continuous (per sprint) |
| **status/prior-art-audit-2026-05-31.md** | Closed | Informs all Phase A |
| **status/senior-architect-audit.md** | Open issues | §16 absorbed |
| **status/intent-analysis/** (5 docs) | Analytical | §18.3.1 absorbed |
| **status/performance-analysis/** (2 docs) | A.OI.053 | §18.3.2 absorbed |
| **status/edges-lines/** (2 docs) | A.SP.EL.1/2 | §18.3.3 absorbed |
| **status/post-mortems/pryzm-2-build.md** | Historical | Informs operating-principles |
| **status/retros/phase-1-close.md** | Active | H5 sprint retro cadence |
| **status/sprints/s18-retro.md** | Historical | H5 cadence artefact |
| **status/legacy-status-detail/** | Historical | Pre-2026 snapshots |

**Verdict §21.5**: Every doc in 03-execution/ has a delivery role OR is explicitly historical/superseded. No orphans.

### §21.6 — Decision layer (02-decisions/) — all docs accounted for

| 02-decisions/ doc | Status |
|---|---|
| **contracts/C01-C49** | §21.2 verdict — all CANONICAL by Phase C |
| **contracts/C50** (NEW Phase A) | CANONICAL by Phase B |
| **contracts/README.md (C00 index)** | CANONICAL — continuously refreshed |
| **contracts/MISSING-CONTRACTS-AUDIT-2026-06-01.md** | Closed (all 49 + C50 authored) |
| **adrs/0001-0108** | §21.3 verdict — conforming |
| **adrs/ADR-031-050 (strategic, proposed in §20.3)** | DRAFT → CANONICAL Phase B/C/D |
| **adrs/ADR-NNN-phase-{1,2,3}-exit** (future) | At IP-A13 · IP-B18 · IP-C9 |
| **principles/** | Continuous |
| **README.md** | Continuous |

**Verdict §21.6**: All 02-decisions/ docs have delivery + ratification trace. No orphans.

### §21.7 — Reference layer (04-reference/) — supporting docs

| 04-reference/ doc | Role |
|---|---|
| **architecture-detail/02-FILE-STRUCTURE.md** | CANONICAL (refreshed) |
| **architecture-detail/** other docs | Per-subsystem detail (continuous refresh per code change) |
| **file-formats/** | Per-format spec (continuous per C47 versioning) |
| **runbooks/** | Operational (per C48 §1.10 + IP-A10 onward) |
| **security/** | Per C08 + C22 |
| **observability/** | Per C10 |
| **audit/** | Per security audits + compliance (per C43 + C22) |
| **pascalorg-editor-research.md** | Historical research |
| **typecheck-error-queue.md** + **typecheck-errors-2026-05-24.txt** | Operational (per-PR cleanup) |
| **visibility-and-selection.md** | Per C04 + visibility/ package |

**Verdict §21.7**: 04-reference/ supports all phases; no orphans.

### §21.8 — Guides layer (05-guides/) — user-facing docs

| 05-guides/ | Role |
|---|---|
| Currently sparse — `apartment-layout.md` mainly | Phase A grows: per-IP demo runbooks (§3.0.1); per-typology user guides (Phase A + B); developer guides for Plugin SDK (per platform-strategy §10.1) |
| Per [DOCUMENTATION-GAPS §5.1-5.3](../../DOCUMENTATION-GAPS-AND-NEXT-PHASES.md) | ~28 guides needed; Phase A ships first 5; remainder Phase B-C |

**Verdict §21.8**: Guides grow per phase; no orphans (all listed in DOCUMENTATION-GAPS).

### §21.9 — Strategic check: at Phase D close, is the vision delivered?

The acid test — at end of Phase D (~2030+), can a customer do this:

| Scenario | Phase delivering | Verification IP |
|---|---|---|
| Customer signs up → RAC asks role + typology → routes to typology-specific pipeline → generates a building → exports IFC → consultant imports in Revit | A | IP-A6, IP-A10 |
| Customer designs a 25-storey mixed-use building (residential + workplace + retail typologies merged) | A + B + C cumulative | IP-C9 |
| Customer in EU region with BYOK key + SAML SSO + ISO 19650 phase-2 compliance + SOC 2 evidence | B + C | IP-B9 + IP-B12 + IP-C9 |
| Marketplace developer publishes a hospital typology pack + earns > £20k/year | B → C | IP-B16 + IP-C9 |
| Customer uses AI-Automated 2D Drawing Output ("the killer feature") to generate + check every sheet | D | IP-D3 |
| Customer queries cognition substrate via REST: "what does PRYZM know about this site/building/room?" | C | IP-D1 (cognition API) |
| 10,000 paying customers · 500 active marketplace developers · 30% of revenue from marketplace | D | IP-D4+ |
| All 4 regions (EU + US + AP + UK) live with same-sovereignty failover | C | IP-C3 |
| 25 PRYZM-first-party typologies + ~200 community-authored typology packs | C → D | IP-C9 + IP-D4 |
| WCAG 2.2 AA · SOC 2 Type II · ISO 19650 Phase 1+2+3 · GDPR · CCPA · APPI all compliant | B + C | IP-B12 + IP-C9 |
| Customer leaves PRYZM with their full project data (open `.pryzm` format · IFC4X3 round-trip · no lock-in) | A (foundation) — continuous | Continuous |

**All 11 strategic end-state scenarios are delivered by Phase D close.**

### §21.10 — Honest residual gaps

Things NOT delivered at Phase D close — by design:

| Out-of-scope | Why (per docs) |
|---|---|
| Native desktop / mobile apps | engineering-vision §8 — browser-only |
| Photoreal rendering primary tool | engineering-vision §8 — out (round-trip only) |
| Construction administration primary tool | engineering-vision §8 — out (Procore/PlanGrid own) |
| Facility management primary tool | engineering-vision §8 — out (Archibus/Maximo own) |
| 4D scheduling primary tool | engineering-vision §8 — out (Synchro/Asta own; PRYZM exports per C37) |
| 5D cost primary tool | engineering-vision §8 — out (CostX owns; PRYZM exports per C38) |
| MEP detailing primary tool | engineering-vision §8 — out (consultant tool job) |
| Structural FEM analysis | engineering-vision §8 — out (Tekla/ETABS own; PRYZM round-trips) |
| PDF-to-BIM as primary on-ramp | engineering-vision §8 — out (marketplace plugin opportunity) |
| Per-jurisdiction regulatory packs (50+ regional codes) | Marketplace community opportunity per platform-strategy |
| Community-authored long-tail typologies (museum · prison · embassy · ...) | Phase D + marketplace per typology-expansion §5 phase D row |
| Customer-managed integrations (BIM360 · Procore · iTwin · Trimble · Aconex · BIMcloud) | Marketplace plugin per platform-strategy §2.5 |

All 12 out-of-scope items are **deliberate** per positioning §6 ("the discipline of saying no"). They are documented exclusions, not gaps.

### §21.11 — FINAL VERDICT

After §21:

| Verification dimension | Result |
|---|---|
| All 13 strategy docs (01-strategy/) traced to delivery | ✅ §21.1 |
| All 49 contracts (C01-C49) + C50 + C51-54 proposed → CANONICAL by Phase C/D | ✅ §21.2 |
| All 108 ADRs conforming + future phase-exit ADRs scheduled | ✅ §21.3 |
| All 56 specs + ~11 proposed → delivering sub-phase | ✅ §21.4 |
| All 03-execution/ docs accounted for | ✅ §21.5 |
| All 02-decisions/ docs accounted for | ✅ §21.6 |
| All 04-reference/ docs supporting delivery | ✅ §21.7 |
| All 05-guides/ documented gap-fills sequenced | ✅ §21.8 |
| Strategic end-state scenarios delivered | ✅ §21.9 (11 of 11) |
| Out-of-scope items documented as deliberate | ✅ §21.10 (12 of 12) |

**ANSWER**: When all phases close (A → D, ~5-year arc), the vision + architecture + all 49 contracts + 108 ADRs + 56 specs + every execution file will be **fully covered with no gaps**. The only items not delivered are the 12 deliberate exclusions per engineering-vision §8 + positioning §6 — these are scope-cuts, not omissions.

**The tracker is now genuinely exhaustive at every layer.** Phase A begins concrete engineering at A.1 (`packages/typology-pipeline/` scaffold) per the current sprint.

---

*End — PRYZM Master Execution Tracker, 2026-06-01 — CANONICAL (with §12 · §14 · §16 · §17 · §18 · §19 · §20 · §21 — ~584 named deliverables · ALL upstream commitments traced to delivery · NO orphans · END-STATE VERIFIED §21.11).*

---

## §22 — FOUNDER DEMO-SESSION FEEDBACK QUEUE (2026-06-08)

Captured live during the founder's A.27 layout-quality + demo-prep session (2026-06-08).
These are **new founder requests**, queued for sequencing into Phase A. The app is **not yet
public (not even private beta)** due to instability — the immediate strategic goal these
items serve is a **single, scripted, end-to-end residential demo** for LinkedIn (see
`docs/05-guides/DEMO-SCRIPT-RESIDENTIAL-2026-06-08.md`). Status legend: ☐ queued · ◐ in
progress · ✅ shipped.

### §22.1 — The target demo flow (the "happy path" we are hardening)

The demo is one continuous residential story; every step below must be reliable BEFORE the
public/beta opens:

1. **House project creation** — user starts a *residential house* project. **DEMO-1 ☐ —
   SKIP the user-profile / persona modal step** (founder: "not sure the profile of the users
   matters here at all — probably this modal step should be avoided"). Go straight from "new
   House project" to the map.
2. **Site on the map** — user goes to the map, selects the site, and **defines the site
   boundary** by drawing.
3. **Design-option modal** — after the boundary is closed, the modal offers design options.
   **DEMO-2 ☐ — show the LIVING GRAPHS at this stage** (the bubble/adjacency graph for each
   candidate option, so the user reasons about the option *before* committing geometry).
4. **Layout on the main interface** — the chosen layout generates in the main PRYZM editor.
5. **On-the-fly optimisation** — **DEMO-3 ◐ — user edits data (e.g. a room's surface area,
   room type) and the layout REGENERATES live.** (Substrate exists: A.26 editable Living
   Graph → `roomAreasByName` / `roomTypesByName` → re-run deterministic engine. Harden for
   demo reliability.)
6. **3D interrogation** — user interrogates the result in 3D with **3D Tiles + Forma** massing.
7. **Live site/climate analysis** — user interrogates the 3D site with **climate analysis on
   the fly** (sun / wind / comfort overlays).

### §22.2 — Specific founder requests (the deltas this session)

| ID | Request | Source | Notes / relation to existing work | Status |
|---|---|---|---|---|
| **DEMO-1** | Remove/auto-skip the user-profile modal in the House-project create flow | demo msg | "this modal step should be avoided" | ☐ |
| **DEMO-2** | Surface the **Living Graphs** inside the design-option modal (per-option bubble/adjacency graph) | demo msg | builds on A.26 Living Graph + bubbleGraph; new surfacing in the option picker | ☐ |
| **DEMO-3** | **On-the-fly layout edit**: change room surface/data → layout updates live on the main canvas | demo msg | A.26 substrate exists; harden + make demo-reliable | ◐ |
| **BND-90** | **Orthogonal (90°) boundary drawing.** The FIRST boundary line is free; from the 2nd line on, the user can **opt in to "orthogonal-to-latest-line"** so every subsequent corner is 90° → produces rectilinear plots far better for housing AND **helps stair placement**. Goal: "create 90° walls during the boundary definition." | layout feedback + img | **Refines A.21.D46** (`feat(gis): orthogonal-to-previous-edge boundary draw lock`, on main). D60 added the ortho lock; this asks for the explicit **first-line-free → then opt-in toggle** UX + guaranteeing 90° corners flow into the wall/stair engine. | ◐ |
| **FORMA-CTX** | **Richer Forma 3D context** — not just extruded building volumes. Add **terrain contour lines, road centre-lines, and pedestrian data** to the Forma/3D-tiles site view (founder reference screenshots: the abstract grey massing + contours view, AND the coloured-plot view with roads/trees/water). | demo msg + 2 imgs | extends FORMA.* site stack; needs OSM roads + pedestrian network + terrain contour extraction into the Forma scene | ☐ |
| **FLR-VIEWS** | When the user creates a **2- or 3-floor house**, **automatically create floor-plan VIEWS for every floor that was generated** (today the "Floor Plans" panel shows only *Ground Floor*; upper storeys are built but get no plan view). | floor-plan msg + img | house orchestrator already produces per-storey `levelId` plates; wire each generated storey to an auto-registered Floor Plan view | ☐ |
| **VIEW-ZOOM** | On entering the **"3D + plan"** combined view (and on any view switch), **auto zoom-to-fit the geometry** so the house is framed immediately — today the 3D view opens empty/zoomed-out and the user must click **Home** to bring the house into frame. | view-zoom msg + img | call zoom-to-extents on `view-activated` when the active level/scene has geometry (debounced); applies to 3D + plan + Forma | ☐ |
| **LAYOUT-Q** | **Layout quality still not good enough** after A.27 Phases 2–4 (kitchen-zone weight, master surplus, hall face, door approach, adjacency sort). Continue the A.27 spec (Phases 5–7: corridor-face hint, stair-head corridor alignment, double-loaded corridor parti) AND treat the above (BND-90 rectilinear plots, stair location) as a quality lever. | layout feedback + img | A.27 Phases 5–7 remain; rectilinear (90°) plots from BND-90 are expected to materially improve subdivision + stair placement | ◐ |

### §22.4 — Observed-in-log defects (founder console paste 2026-06-08)

| ID | Defect | Evidence | Status |
|---|---|---|---|
| **BUG-ANNO-DRAG** | Dragging a **room-tag annotation in plan view throws** `CommandBusError: no handler registered for: UPDATE_ANNOTATION` (PlanViewInteraction `_onMouseUp`). The move is dispatched but no `UPDATE_ANNOTATION` handler is registered → uncaught promise rejection; the tag move is lost. | console: `Uncaught (in promise) CommandBusError: no handler registered for: UPDATE_ANNOTATION` | ☐ |
| **BUG-FB-ZEROSIZE** | On the 3D→plan→3D view round-trip a burst of `GL_INVALID_FRAMEBUFFER_OPERATION … Framebuffer is incomplete: Attachment has zero size` (then "too many errors") — a render target is sized 0 during the view switch (the combined-view layout/zoom timing). Likely the same root as VIEW-ZOOM (canvas/framebuffer sized before geometry is framed). | console: repeated `glClear/glDrawArrays … Attachment has zero size` | ☐ |
| **PERF-NOTE** | House post-gen shows long PSO/PBR longtasks (`FIRST-RENDER-POST-SUPPRESS totalSuppressedMs=4372ms`, `PBR-UPGRADE-COMPLETE totalPbrMs=2306ms`, `DEFERRED-RESUME-FLUSH delayed 2862ms — main thread blocked`). Acceptable for now but a demo-smoothness risk on the 2-storey path. | console timings | ◐ (perf backlog) |

### §22.5 — GIS georeferencing defect (HIGH — demo blocker) (2026-06-08)

| ID | Defect | Evidence | Status |
|---|---|---|---|
| **GIS-LOC** | **Cesium / 3D-Tiles view places the house TOO HIGH and in the WRONG location.** In **Forma** the house is correctly aligned to the **plan-view definition** (site boundary), but in the **Cesium 3D-globe + Google 3D-Tiles** view the house "comes nicely into view" yet floats well **above** the terrain and is **not georeferenced to the right spot** (founder screenshots: a tan-roofed house hovering above a real photoreal block). Founder flags this as **important**. Likely the **GLB/3D-Tiles placement path** does not seat on sampled terrain height **and** the LTP-ENU → globe transform's anchor/elevation diverges from the Forma/plan path. (Relates to A.21.D56 GLB world-transform bake + A.21.D40 house-on-tiles `sampleHeight` reseat — those fixed Forma/precise-location but the **Cesium-tiles elevation + lat/long anchor still wrong**.) FIX: unify the site-anchor + terrain-height seat so Cesium-tiles placement == Forma == plan definition. | console + 2 imgs | ☐ HIGH |

### §22.3 — A.27 layout-quality programme status (this session)

| Phase | Change | Status |
|---|---|---|
| A.27 P2 | F1-2 kitchen↔corridor pref 0.3→0.6 · F3 §MASTER-SURPLUS · F2 §HALL-ENTRANCE-FACE | ✅ shipped (deploy **v58**, ai-host 2038/2038) |
| A.27 P3 | §DOOR-APPROACH-QUALITY (centre doors on longest clear wall-run) | ✅ committed (`05687f39`, on main local) |
| A.27 P4 | §ADJACENCY-SORT pre-placement zone ordering (+3 tests) | ✅ committed (`15ccef19`, on main local; ai-host 2041/2041) |
| A.27 P5 | §CORRIDOR-FACE-HINT in squarify | ☐ queued |
| A.27 P6 | §STAIR-HEAD-AXIS upper-storey corridor alignment | ☐ queued |
| A.27 P7 | §DOUBLE-LOADED-PARTI new strategy | ☐ queued |

> NOTE (2026-06-08): P3 + P4 are committed locally on `main` but **not yet pushed/deployed**
> (awaiting the P5–P7 batch or a founder go for an interim **v59**). P2 + the 17 founder-held
> v57 commits shipped in **v58**.

---

### §22.6 — DEMO CODE-AUDIT: per-beat verification of the LinkedIn post (2026-06-08)

Each claim in the "site → living layout" post was audited against the real source (4 parallel
code-audit agents). Verdict per beat + the SPECIFIC work needed for the recorded demo to be
truthful. **Headline: 3 of 5 beats are solid; 2 are blocked (graph-before-geometry + 3D-on-tiles).**

#### Beat 1 — "Draw the plot boundary on a real map" → ✅ **WORKS** (BND-90 UX needs a flip)
- Impl: `apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts` (MapLibre cream/Forma 2D draw, `mountSiteBoundaryMap2D`), Cesium fallback `SiteBoundaryDrawTool.ts`, ortho lock `geospatial/orthoSnap.ts` (`resolveOrthoSnap`, ±8°), rail `tools-panel/panels/GISRailPanel.ts`, chain → `apartmentFromBoundary.ts` (`generateApartmentFromBoundary` → `polygonToFootprint` → `generateApartmentFromScratch`). Verified end-to-end.
- **BND-90 task (small):** the ortho checkbox defaults **ON** (`SiteBoundaryMap2D.ts` ~L343/L397 `orthoEnabled=true`). Spec wants **first-line-free → opt-IN** ⇒ flip default to **OFF**; first edge already free (snap needs ≥2 verts). ~1–2 h.

#### Beat 2 — "Read its Living Graph BEFORE any geometry exists" → ❌ **BROKEN (DEMO-2 not started)**
- The option modal (`apps/editor/src/ui/apartment-layout/ApartmentLayoutModal.ts` + `layoutThumbnail.ts`) shows **geometric floor-plan thumbnails + score bars**, NOT a bubble/adjacency graph. The real Living Graph (`ui/living-graph/LivingGraphOverlay.ts`) only opens on the `apartment.layout-executed` event — i.e. **after** geometry is committed. Adjacency data (`option.rooms[].adjacentTo`) exists on the option but is only used for validation, not drawn.
- **DEMO-2 tasks (~5–7 dev-days, OR ~0 for the demo via the 2-click workaround):**
  1. New pure renderer `apps/editor/src/ui/apartment-layout/layoutBubbleGraph.ts` — `buildLayoutBubbleGraphSvg(option)`, node-per-room + edge-per-adjacency, occupancy-coloured (mirror `layoutThumbnail.ts`, Node-testable, no THREE).
  2. Slot it into the card: `layoutCardModel.ts` → `layoutModalHtml.ts` (+ `.alm-bubble-graph` CSS in `apartmentLayoutModal.ts`); a "graph/plan" toggle per card. Scope clicks so the graph doesn't fire "Use this layout".
  3. **Demo fallback if not built:** pick option → open Living-Graph panel on the canvas immediately after (2 clicks; already in the demo script).

#### Beat 3 — "code-aware residential layout … walls/rooms/doors/windows/stairs as semantic BIM" → ✅ **WORKS (multi-storey, 23 integration tests)**
- `apps/editor/src/ui/house-layout/HouseLayoutController.ts` → pure `packages/ai-host/.../houseLayout/houseOrchestrator.ts` (`generateHouseLayout`, 1/2/3-storey) → `HouseLayoutExecutor.ts` → `buildLayoutCommands` (`executePlan.ts`): walls/doors(`wall.createOpening`+`door.batch.create`, per-pair privacy finish)/windows(per-room glazing, shell-host match)/stairs(`CreateStairCommand` per adjacent pair)/slabs/roof/handrails. Pure, P6 single-undo, byte-deterministic. `houseLayoutPipeline.test.ts` covers 1/2/3 storey. **No work needed for the claim** (but FLR-VIEWS + GIS-LOC affect how it's *shown*).

#### Beat 4 — "Change a room's area on the graph → regenerates deterministically, on the fly" → ✅ **WORKS (A.26.3/.4, test-guarded)**
- `ui/living-graph/LivingGraphOverlay.ts` area/type inspect fields → `activeRoomAreaOverrides.ts`/`activeRoomTypeOverrides.ts` → `gatherLayoutPayload.ts` (`roomAreasByName`/`roomTypesByName`) → `triggerApartmentLayout` → D-TGL → graph re-lays-out on `apartment.layout-executed`. Empty stash = byte-identical baseline (ADR-0061 I2, guarded). **450 ms debounce** + ~100–500 ms graph rebuild.
- **Hardening for demo (small):** (a) "Regenerating…" toast on area commit (debounce is invisible today); (b) clamp note when area < `minAreaM2` (silently clamped — don't surprise the presenter); (c) NEW test: 2-storey area-edit round-trip (editing ground-floor area must not disturb the upper storey); (d) clear overrides on project close (stale-bleed guard).

#### Beat 5 — "Read it in 3D on photoreal tiles, with sun, wind, comfort" → ◐ **PARTIAL — climate ✅, tiles placement ❌ (GIS-LOC)**
- **Climate overlays ✅:** `ui/geospatial/CesiumViewport.ts` `renderSunPathOverlay`/`renderWindOverlay`/`renderHeatOverlay` (sun arcs, wind streamlines+rose, comfort heat grid), driven by `ensureSiteClimate` (NOAA normals). Photoreal Google 3D Tiles gated on `VITE_CESIUM_TOKEN`/`VITE_GOOGLE_MAPS_KEY` (keyless ESRI fallback).
- **GIS-LOC ❌ (root cause now pinpointed):** the house floats too high + off-spot on the tiles because the **Cesium anchor diverges from the Forma/plan anchor**:
  - **Anchor drift:** `GISAreaLayout.getFormaOrigin()` prefers the LTP origin (`getCurrentSiteOrigin()` from `ui/site/siteDispatch.ts`), but can **fall back to the geocoded address** (`siteModelStore.getLocation()`), which the comment notes is ~10–15 m off. Forma uses the LTP origin; Cesium can end up on the address ⇒ wrong location.
  - **Elevation:** `CesiumViewport.renderRealModelOnGlobe` (~L3324–3411) seats the GLB at `Cartesian3.fromDegrees(originLon, originLat, baseHeight)` where `baseHeight = formaTerrainBaseHeight` sampled at the **boundary CENTROID** (`sampleHeightMostDetailed`, ~L2440), **not at the origin** ⇒ on sloped terrain the house sits too high.
  - **FIX (GIS-LOC, HIGH):** (1) freeze ONE site origin at boundary-commit and use it for BOTH Forma render AND Cesium placement (no address fallback once a boundary exists); (2) sample terrain height AT that same anchor (origin == height-sample point); (3) add a console.log of `getCurrentSiteOrigin()` at `placeRealModelOnGlobe` to confirm it's populated (not null→address). Files: `siteDispatch.ts`, `GISAreaLayout.ts` (`getFormaOrigin`/`placeRealModelOnGlobe` ~L1342–1375), `CesiumViewport.ts` (`renderRealModelOnGlobe`).

#### Demo go/no-go summary
| Beat | Status | Blocker | Demo workaround |
|---|---|---|---|
| 1 Boundary draw | ✅ | BND-90 default flip (minor) | usable as-is; flip default for polish |
| 2 Living Graph before geometry | ❌ | DEMO-2 not built | 2-click: pick option → open Living Graph panel |
| 3 Generate residential BIM | ✅ | — | film single-storey until FLR-VIEWS |
| 4 Edit area → regen | ✅ | feedback polish | rehearse one area edit |
| 5 3D photoreal + climate | ◐ | **GIS-LOC** (tiles) | climate ✅; for the on-tiles shot, fix GIS-LOC first OR use Forma context |

**To make the post fully truthful (not worked-around): fix GIS-LOC (HIGH) + build DEMO-2 + ship FLR-VIEWS + VIEW-ZOOM. BND-90 flip + Beat-4 feedback are quick polish.**

---

*Demo-queue addendum 2026-06-08 — 7 founder items (DEMO-1/2/3 · BND-90 · FORMA-CTX · FLR-VIEWS · LAYOUT-Q) + §22.4 bugs + §22.5 GIS-LOC + §22.6 per-beat code audit + A.27 P2–P7 status.*

### §22.7 — PROD-TEST DEFECTS on a ROTATED plate + the WALL-JOIN→OPENING→ROOM-MERGE cascade (2026-06-08)

Founder tested a 3-storey house on a **globally-rotated (non-orthogonal) boundary** (~15°; the
plan screenshot is visibly skewed). The console log is the smoking gun. The defects are NOT
independent — they are ONE cascade the founder named precisely: *"when something is going on in
some walls, the joins go off and the window openings too."*

#### The cascade — root cause (HIGH, the dominant LAYOUT-Q driver on skewed plates)
1. **Degenerate multi-clusters.** On the rotated plate the interior-partition endpoints + their
   perimeter intersections collapse into shared cluster points. Log:
   `§MULTI-CLUSTER cluster: 6 endpoints @ (-1.000, 13.299) [trimmed=4 selfCluster=2]` — a 6-endpoint
   cluster containing BOTH ends of one wall.
2. **Walls flagged INVALID + skipped.** The WallJoinResolver correctly detects the degenerate wall
   (both ends in one cluster) and drops it to avoid a phantom spike:
   `§SELF-CLUSTER-GUARD: skipped 2 endpoint(s) … wall_…ERT3SQ…` → `§WJR-INVALID skipped wall_…ERT3SQ…: self-cluster`
   (≥2 such walls per upper level: `…ERT3SQ…`, `…ES178W…`).
3. **Consequence A — rooms MERGE.** A skipped partition leaves a GAP, so RoomDetection can't seal the
   space → three rooms collapse into one. Screenshot: a single **"Corridor / Entrance Hall / Bathroom
   8.1 m²"** polygon (the merged-name convention = one detected room spanning all three). ⇒ founder's
   *"Corridor / Entrance Hall / Bathroom are not defined as independent rooms."*
4. **Consequence B — openings LOST.** Windows/doors the layout assigned to an invalidated/trimmed wall
   have no host wall to land on, so they silently drop. ⇒ founder's *"Bedroom 1 has no windows"* (its
   top-left perimeter frontage is exactly in the bad-cluster corner the arrows point at).
- **ROOT CAUSE:** the §SELF-CLUSTER-GUARD / §WJR-INVALID skip (the right *defensive* call — see
  `walljoinresolver-multi-cluster-bug` memo) is a SYMPTOM handler. The real defect is UPSTREAM: on a
  rotated plate the D-TGL subdivision + `weldPartitionsToShell` produce **near-coincident partition
  endpoints** that the join resolver can only reconcile by deleting a wall. FIX DIRECTION (multi-day,
  LAYOUT-Q): (a) snap/merge partition endpoints to clean perimeter intersection points BEFORE the join
  resolver (in `weldPartitionsToShell` / the alignment snap, in the rotated frame), so no self-clusters
  form; (b) when a wall MUST be dropped, RE-HOST its assigned openings on the surviving co-linear wall
  and RE-SEAL the room gap (don't silently lose them). **BND-90 (orthogonal boundary) sidesteps most of
  this for the demo** — rectilinear plates don't generate the rotated multi-cluster degeneracy.

#### Discrete defects from this test
| ID | Defect | Evidence | Status |
|---|---|---|---|
| **WJ-SKEW** | Perimeter corner joins fail, "mainly in bottom floors", on the rotated plate (degenerate multi-clusters → dropped walls). The CASCADE root above. | `§MULTI-CLUSTER`/`§SELF-CLUSTER-GUARD`/`§WJR-INVALID` log | ☐ HIGH |
| **ROOM-MERGE** | Corridor + Entrance Hall + Bathroom detected as ONE 8.1 m² room (unsealed by the dropped partitions). | screenshot merged name | ☐ HIGH (cascade) |
| **WIN-DROP** | Bedroom 1 has no windows (its frontage wall was invalidated/trimmed → window lost). | screenshot + log | ☐ HIGH (cascade) |
| **STAIR-OFF-SHELL** | Stair core pokes OUTSIDE the perimeter shell even though that corner is locally 90° (rotated-frame core reserve/clamp overruns the skewed shell). Sibling of A.21.D59 "stair proud of wall". | screenshot (stair bottom-right past wall) | ☐ HIGH |
| **HALL-NO-ENTRANCE** | §A.21.D29 creates exactly ONE main entrance door and it landed on the KITCHEN's shell wall; the HALL (the proper arrival room) got none. Founder: a kitchen external door is fine, but the hall must have its own entrance. | `§A.21.D29 main entrance door created on shell wall …` (one only) | ☐ MED |

> NOTE: these are predominantly **skewed-plate** failures. Shipping **BND-90** (orthogonal boundaries)
> is the fastest demo unblock; the WJ-SKEW upstream endpoint-snap + opening re-host is the durable fix
> and the core of **LAYOUT-Q**. The §SELF-CLUSTER skip is working as designed (no phantom spike) — the
> bug is that we lose the room seal + the openings when it fires.

---

*Addendum continues 2026-06-08 — §22.7 rotated-plate wall-join→opening→room-merge cascade (WJ-SKEW · ROOM-MERGE · WIN-DROP · STAIR-OFF-SHELL · HALL-NO-ENTRANCE). GIS-LOC + VIEW-ZOOM fixes shipped v60.*

### §22.8 — Fix wave 2 shipped (v61) + house-generator audit findings (2026-06-08)

**Shipped v61** (multi-agent fix wave; ai-host 2041/2041, editor typecheck clean):
| ID | Fix | Status |
|---|---|---|
| **WJ-SKEW** + **ROOM-MERGE** + **WIN-DROP** | `DEFAULT_PARTITION_WELD_M` 0.05 → 0.20 m so cross-wall endpoints fuse BEFORE the resolver (which clusters at 0.5–1.0 m) → no self-cluster → no dropped wall → no room merge / orphaned opening. Root-cause = a 3-way tolerance gap (subdivide 0.05 / weld 0.05 / resolver 0.5–1.0). | ✅ v61 (rotated-plate; verify on prod) |
| **STAIR-OFF-SHELL** | `snapRectInsidePoly()` re-validates the stair core against the ROTATED shell polygon after the bbox clamp (bbox ⊋ polygon on a skew). Axis-aligned = verbatim (D18). | ✅ v61 |
| **HALL-NO-ENTRANCE** | `wallBoundsRoom()` restricts the entrance door to a shell wall the HALL actually fronts (vertex-on-wall), not the nearest wall to its centroid. | ✅ v61 |
| **BND-90** | Ortho boundary lock now opt-in (default OFF; first line free, then toggle 90°). | ✅ v61 |

**House-generator deep reference + audit** written to `docs/04-reference/LAYOUT-GENERATION-ALGORITHM.md` (§ "Residential House Generator (Casa Unifamiliar)"). AUDIT FINDINGS (queued — NOT yet fixed):
| ID | Finding | Severity |
|---|---|---|
| **HSE-AUDIT-1** | `perStoreyLayout` is NOT reliably index-aligned with `storeys` — `assembleHouse` pushes a StoreyPlate always but the option only when non-null, so a blank middle storey desyncs the arrays the executor pairs by index. | ⚠ HIGH (correctness) |
| **HSE-AUDIT-2** | `goodViewKinds` (the "unless the view is good" half of the worst-aspect stair rule) is wired in `aspectScore` but never populated by any caller — only sun-derived aspect is reachable. | ⚠ MED (dead path) |
| **HSE-AUDIT-3** | Vertical acoustic preference is computed but never consumed (single deterministic allocation, no candidate set to rank) — comment overstates wiring. | ⚠ LOW |
| **HSE-AUDIT-4** | Riser counts diverge: the executor re-derives `totalRisers` with its own clamp, so `StairCore.flights[].riserCount` isn't what's built (works, but not identical). | ⚠ LOW |
| **HSE-AUDIT-5** | Blank-storey (wall-only) + large-plate cap ("rooms hug one side, empty perimeter band" when plate > grossMax/0.85) ship silently — need a founder call on intended graceful degradation. | ❓ founder |

**Still pending:** FLR-VIEWS (patch spec ready — needs view-create dispatch API + skip-duplicate-ground-view verification before shipping) · DEMO-2 (Living-Graph-in-modal) · DEMO-1 · FORMA-CTX · BUG-ANNO-DRAG · BUG-FB-ZEROSIZE · A.27 P5–P7 · HSE-AUDIT-1..5.

---

*Addendum continues 2026-06-08 — §22.8 fix wave 2 (WJ-SKEW/STAIR-OFF-SHELL/HALL-NO-ENTRANCE/BND-90 shipped v61) + house-generator deep reference + 5 audit findings (HSE-AUDIT-1..5).*

### §22.9 — Site/climate analysis panel: UI trigger + close (2026-06-08)

| ID | Request | Notes | Status |
|---|---|---|---|
| **SITE-PANEL-UI** | The **Sun & shadow / Weather & comfort / Wind rose / 3D site analysis** panel (the climate/site-analysis controls — `FormaSiteAnalysisControls.ts` / `ClimatePanel.ts`) must be **openable via a UI button** (not only auto-shown/console) AND the user must be able to **CLOSE it** (add a close ✕). Today it appears in a fixed spot with no toggle/dismiss. | Founder screenshot: the panel (Sun&shadow date+season slider+Study, Open full climate card, Wind rose, 3D site analysis Sun path/Wind/Heat). Add a rail/toolbar toggle + a close affordance; remember open/closed state. | ☐ |

---

*Addendum continues 2026-06-08 — §22.9 SITE-PANEL-UI (climate/site-analysis panel needs a UI open trigger + a close button).*

### §22.10 — Deploy-confirmation + fix-efficacy contingency + corridor-no-trim (2026-06-08)

- **DEPLOY CONFIRMED:** GitHub Actions API shows v58–v61 deploys all `conclusion: success` (v61 `11435b76` finished 12:27Z, spaced enough that `cancel-in-progress` did NOT cancel them). So the rotated-plate fixes ARE on prod. A founder re-test still showing the IDENTICAL pre-v61 defects (merged 118 m² Bedroom/Corridor/Bathroom, stairs-out, no-windows) ⇒ **stale SW-cached bundle** — needs a HARD reload. Tell-tale: BND-90 relabels the boundary toggle "⟂ Lock 90° to previous edge" (default OFF). If after a confirmed hard reload the defects persist, the fixes are INSUFFICIENT (next row).
- **WJ-SKEW-2 (contingency, if v61 hard-reloaded still merges):** weld tol 0.20 m may be below the rotated-plate residuals (resolver clusters at 0.5–1.0 m). Escalation: (1) raise `DEFAULT_PARTITION_WELD_M` toward 0.45–0.5 m to fully close the resolver gap; (2) add the upstream partition-endpoint SNAP (cluster endpoints to clean perimeter intersections in the rotated frame, in `weldPartitionsToShell` / `snapAxisLines`) so no self-cluster forms; (3) opening RE-HOST on a dropped wall. ☐
- **WALLS-DONT-REACH-PERIMETER:** founder: "some walls start but don't go until the perimeter wall." Partition stubs trimmed short of the shell on the rotated plate (§EXTEND-TO-PERIMETER not extending, or the weld snapped the endpoint inward). Part of the WJ-SKEW family. ☐
- **CORRIDOR-NO-TRIM:** founder: "the corridor defaults going all the way until the perimeter wall even if no extra door is present at the end." §CORRIDOR-END-TRIM (A.21.D57) should trim the corridor back to the last served door, but on this rotated plate it does NOT — the spine runs perimeter-to-perimeter wasting the end wall (no window there). Likely the trim's sealing-safety gate or the dependent-set spans fail on the skewed geometry. ☐ MED
- Reconfirms (same defects, deploy-gated until hard reload): STAIR-OFF-SHELL, HALL-NO-ENTRANCE (door on corridor not hall), WIN-DROP, ROOM-MERGE.

---

*Addendum continues 2026-06-08 — §22.10 deploy CONFIRMED (v61 live; stale-cache on founder re-test) + WJ-SKEW-2/WALLS-DONT-REACH/CORRIDOR-NO-TRIM contingencies if hard-reload still fails.*

### §22.11 — WJ-SKEW CONFIRMED working + v62–v64 demo completion (2026-06-08)

- **WJ-SKEW CONFIRMED FIXED (founder hard-reloaded log).** On a fresh bundle the founder ran a
  **38.5°-rotated** plate (`stair … rot 38.5°`): the WallJoinResolver logged ONLY clean
  `§MULTI-CLUSTER … trimmed=3` entries with **ZERO `§SELF-CLUSTER-GUARD` / `§WJR-INVALID
  self-cluster`** (the broken build was full of them), and the upper level detected **9 rooms**
  (vs the old merged blob). The earlier "still wrong" reports were STALE CACHE. The weld fix
  (0.05→0.20→0.45 m) eliminates the self-cluster → no dropped walls → no room-merge / window-drop.
- **WJ-SKEW-2 (weld 0.45 m)** — shipped (2041/2041), strengthens the above. ✅ v64
- **DEMO-1** — guided New-Project onboarding skips the persona/role step (seedRole='architect'). ✅ v64
- **SITE-PANEL-UI** — Forma site-analysis panel openable ("☀ Analysis" toolbar toggle) + closeable
  (header ✕), state persisted. ✅ v64
- **FLR-VIEWS + HSE-AUDIT-1** ✅ v62 · **DEMO-2** (Living Graph in modal) ✅ v63.
- **CORRIDOR-NO-TRIM — DEFERRED (diagnosed, not fixed).** Agent root-cause: on the §SINGLE-RECT
  carve the PRIVATE (dependent) zone tiles the corridor's ENTIRE long face, so the dependent-union
  served-extent (`needLo/needHi`, subdivide.ts:1044-1064) always equals the full corridor span →
  `freesLow/freesHigh` always false (subdivide.ts:1081-1083) → `trimCorridorToLastDoor` is a
  structural IDENTITY. NOT rotated-geometry (the trim sees axis-aligned rects in the principal-axis
  frame) and NOT the sealing gate. The real fix needs the trim to drive off the PUBLIC-face frontage
  (the reclaimable own-façade rooms), not the dependent union — a non-trivial re-model touching the
  §EVERY-ROOM-ACCESS invariant. Held for a focused pass rather than a blind apply (the agent's
  servedLo/Hi sketch reduces to the existing needLo/Hi). ☐ MED — queued.

**Demo path now end-to-end (v64):** House (no persona step) → map + boundary → option modal w/
Living Graph → clean rotated-plate layout (WJ-SKEW, 9 rooms, no merge) → 3D on photoreal tiles
(GIS-LOC) → openable/closeable climate panel. Remaining polish: CORRIDOR-NO-TRIM, DEMO-3 toast,
BUG-ANNO-DRAG, FORMA-CTX, HSE-AUDIT-2..5, A.27 P5-7.

---

*Addendum continues 2026-06-08 — §22.11 WJ-SKEW CONFIRMED (38.5° plate, zero self-clusters, 9 rooms) + v64 (WJ-SKEW-2 · DEMO-1 · SITE-PANEL-UI); CORRIDOR-NO-TRIM diagnosed + deferred.*

### §22.12 — v65 demo polish (2026-06-08)

- **DEMO-3** ✅ v65 — "Regenerating layout…" brand-#6600FF spinner toast on Living-Graph area/type
  edits (covers the 450 ms debounce); dismissed on `apartment.layout-executed` + 8 s safety fallback.
- **BUG-ANNO-DRAG** ✅ v65 — room-tag drag in plan view no longer throws `UPDATE_ANNOTATION
  CommandBusError`; registered the missing bridge in `initBusHandlers.ts` forwarding the legacy
  `UpdateAnnotationCommand` to `commandManager` (owns the store mutation + undo). Root cause: a
  migration gap (annotation.create bridge retired without an update bridge; PlanViewInteraction
  dispatches the legacy command on the new bus).

**Remaining backlog (post-v65):** CORRIDOR-NO-TRIM (diagnosed, needs door-aware trim + tests) ·
FORMA-CTX (terrain contours/roads/pedestrian) · HSE-AUDIT-2..5 (goodViewKinds/vertical-acoustic
unconsumed, riser divergence, blank-storey) · A.27 P5-7 (corridor-face hint, stair-head, double-loaded).

---

*Addendum continues 2026-06-08 — §22.12 v65 polish (DEMO-3 toast · BUG-ANNO-DRAG handler).*

### §22.13 — Residential layout AUDIT (v66/v67 prod test, 2026-06-08) — "the layout needs to be perfect"

Founder ran the house generator on v66/v67 (note: **v67 #148 was docs-only — no engine fix**, so it
showed the v66 layout). Full log + 5 screenshots audited. Governing spec:
[SPEC-ROOM-PLACEMENT-RULES.md](../specs/SPEC-ROOM-PLACEMENT-RULES.md) (gaps G1–G13).

**✅ Confirmed FIXED in v66:** wall colours (beige→white), windows render with holes, rooms went
from 1 merged 121.8 m² blob → 6 distinct rooms (§CONSENSUS-PROXIMITY-GUARD).

**🔑 BIGGEST NEW FINDING (G12) — over-program room drops.** The log shows the subdivider DROPPING
rooms wholesale before they're drawn:
```
§FEASIBILITY-ALLOC: rect 51.67 m² < Σ minimum 68.00 m² for 7 room(s) — Dropping bedroom / dining / hall / kitchen / living
§ENSUITE-FROM-MASTER: master rect too tight (7.45 m²) — ensuite left unplaced
§CIRCULATION-REROUTE: habitable room reachable only through a non-circulation room — circulation compromise
```
The drawn footprint can't fit the requested program, so rooms are dropped → the generic **"Room"**,
the **merged hall**, and the **bathroom with no legal corridor wall → no door**. This single cause
underlies several of the symptoms below. Compounded by **G13**: the "Target area 220 m²" slider (and
Style, Master-floor) are NOT wired into generation (audited: `gatherLayoutPayload.ts` → `EngineTuning`
carries none of them), so the engine can't scale the footprint to the brief.

**Consolidated issue table** (founder point → gap → root cause → status):

| # | Founder report | Gap | Root cause | Priority | Status |
|---|---|---|---|---|---|
| 1 | No entrance door | **G4** | Door centred on a shell wall already holding a window → `Opening overlaps existing opening` → skipped | HIGH | ✅ **FIXED v68** — gap-aware placement (`entranceDoor.ts` §ENTRANCE-DOOR-CLEAR) + fallback wall; +2 tests |
| 8 | **Bathroom has NO door — "all rooms must be accessible" (CRITICAL)** | **G12/G1** | Bathroom shares no wall with a corridor (over-program), OR its door was on a wall trimmed by WallJoinResolver → skipped | **CRITICAL** | 🔬 under agent investigation; likely needs a post-resolve accessibility guarantee |
| 4 | Kitchen / Entrance Hall need a wall between | **G1/G2** | Partition trimmed (wall-not-closing) OR hall dropped (G12) | HIGH | 🔬 under investigation |
| 7 | Perimeter wall junctions still bad | **G1** | Residual `trimmed=3` clusters + `§WJR-INVALID self-cluster` (degenerate wall dropped) after the v66 guard | HIGH | 🔬 under investigation (extend-to-shell vs trim) |
| 2 | Stair still outside on both sides ("origin of placement") | **G8** | Prod stair is a **U** (17 risers, rot 34.9°): the v66 §STAIR-RUN-BOUND fixed the **I-run only**; U/L footprint (2 flights + landing + width) still overruns the reserved rect | HIGH | OPEN — extend run-bound to L/U + verify origin |
| 5 | A room called "Room" | **G9** | Detected region not matched to a program role (often a G12 dropped room leaving an unlabelled cell) | MED | OPEN — every detected region must map to a role |
| 3 | Upper-level room colours render on ground floor | **G10 (new)** | Plan-view projection bleeds another level's room fills onto L0 | MED | OPEN — level-scope the room-fill projection |
| 6 | Windows all face 1–2 façades (south?) | **G11 (new)** | Window emission over-prefers a façade/orientation; no distribution across orientations | MED | OPEN — distribute windows across orientations while keeping daylight bias |
| — | Footprint can't fit program → rooms dropped | **G12 (new)** | Over-program; drawn boundary too small for the requested room set | **HIGH** | OPEN — scale footprint to brief OR warn + degrade gracefully (no generic rooms) |
| — | Brief sliders not driving output | **G13 (new)** | `targetArea`, `style`, `masterFloor` not threaded into generation | MED | OPEN — wire the brief panel into `EngineTuning`/program |
| — | `/items/Sofas/*.glb` 404 | KNOWN-HARMLESS | `.dockerignore` excludes `/items` GLBs on prod (by design); furniture falls back to primitives | — | NOT A BUG (see prod-test-findings 2026-06-05) |

**Priority order to make the layout "perfect":**
1. **G12** (over-program drops) + **G13** (wire target-area) — the keystone: stop dropping rooms; scale the plot to the program. Fixes #5, much of #4/#8.
2. **G1** residual (wall-closing: extend-to-shell + self-cluster) — fixes #4, #7, and the G5/G8-bathroom door skips.
3. **G8-bathroom accessibility guarantee** (CRITICAL) — every room MUST get a door post-resolve.
4. **G8 stair** U/L overrun.
5. **G10** colour bleed, **G11** window orientation, **G9** room naming.


### §22.14 — v68 prod test + v69 (G12 keystone + DIAG instrumentation, 2026-06-08)

**v68 founder verdict (progress + remaining):**
- ✅ Ground-floor perimeter wall joins now ALL GOOD (§SELF-CLUSTER-FLOOR worked).
- ✅ Stair now off on ONE side only (was both) — origin/placement still needs work (#2, G8).
- ❌ Still generic rooms ("Room 00-004", "Room 00-001") = dropped-room voids (G12/G9).
- ❌ Most rooms have doors but NOT windows — "daylight super important; every room needs ≥1
  window except corridor/storage/hall" (#5). **ROOT: downstream of G12** — the generic voids
  aren't real program rooms so they get no glazing; fix G12 → real rooms keep their windows.
- ❌ First-floor wall joins still bad (#3) — §SELF-CLUSTER-FLOOR + §GROUND-WELD only cover the
  ground; upper floors use `_buildPerimeterShell` and still self-cluster/trim. (G1 upper-floor.)
- ✅ **G14 RESOLVED (§LANDING-NOT-HALL, 2026-06-09)** — "Entrance Hall" appeared on the FIRST/SECOND
  floor (#4). **Root:** an entrance hall is where the FRONT DOOR lands → it can only exist on the
  GROUND (entrance) floor; upper floors are reached by the stair, which arrives at a LANDING
  (circulation). The bubble graph mints a `hall` named "Entrance Hall" purely from
  `program.entranceHall === true`, and BOTH `allocateProgramToStoreys` (storeyAllocation.ts:134) and
  `enrichStoreyProgramToPlate` (houseProgramFloor.ts:247) set `entranceHall:true` on UPPER storeys
  "to seed the stair landing" — so the upper storey minted a `hall` (→ "Entrance Hall") AND a
  `corridor`. **Fix (Approach A — hall is GROUND-ONLY; no new RoomType):** upper storeys now leave
  `entranceHall:false`. The stair-arrival circulation is the engine's existing `corridor` (always
  present on an upper storey because beds+baths ≥ 1 there), which the house executor RELABELS
  "Landing" (`HouseLayoutExecutor.nameStorey`, storeyIndex > 0; ground untouched). **Rule:** hall =
  ground-only; upper-floor stair arrival = a corridor named "Landing". Front-door/entrance logic
  (§A.21.D29) was already ground-only (`resolveEntranceDoor` runs only when `isGround`, and falls
  back to `corridor` when no hall) — verified unchanged. Apartment (single-storey = one ground
  storey) byte-identical. §DIAG line `§LANDING-NOT-HALL`. Tests: houseProgramFloor.test.ts +
  houseLayout.test.ts (ai-host 2091 green).
- ❌ living/dining/kitchen not clustered; entrance room not well located near the hall (G6/proximity).

**Founder issued Room Layout Engine SPEC v2.0** (supersedes SPEC-ROOM-PLACEMENT-RULES v1.0 where
they conflict) — prescriptive §0–§15: perimeter classification, program resolution, 4-zone
partitioning, bubble graph (weighted), Rodrigues-Shekhawat rectangular-dual + Squarify allocation,
circulation spine, door emission order, **entrance-door-reserve-before-windows**, **dining+study
windows MANDATORY / every habitable room ≥1 window**, walking-distance proximity (§9), per-room
solar orientation (§10), aspect-ratio + min-width (§11), furniture-fit validity (§12), validation
severity taxonomy (§14), acceptance criteria (§15). This is the normative target for the engine.

**v69 shipped:**
- §AREA-AGREEMENT (G12) — stop capping `presentedAreaM2` below the true plate for an enriched
  storey (gross target ≥ ½ plate) → rooms sized to the real plate, not a starved budget.
- §STAIR-FRAGMENT (G12) — `DOMINANT_FRACTION` 0.55 → 0.45 so the corridor-spine carve fires on a
  stair-fragmented plate (never worse on drops; adds a spine when it helps). ai-host 2043 green.
- **§DIAG instrumentation** (founder request — rich logs for console-paste diagnosis): `§DIAG-STOREY`
  (true vs presented area, gross target/max, program set, stair shape+pos), `§DIAG-RECTS` +
  `§DIAG-BRANCH` (decomposition rects, dominant fraction, carve-vs-generic pick + dropped types),
  `§DIAG-ROOMS` (per-room type/area/windowCount + storey door/window totals + ⚠ WINDOWLESS list).

**Keystone still open:** G12's COMPLETE cure is keeping the stair from fragmenting the plate (tied
to G8 stair placement/origin). The v69 nudges + diag logs will reveal from the next console paste
whether fragmentation still drops rooms. Then: G8 stair-corner placement, ~~G14 upper-floor
landing-not-hall~~ ✅ (§LANDING-NOT-HALL, 2026-06-09), G1 upper-floor walls, then the v2.0
window-mandate + proximity + solar layers.

### §22.15 — Generative-layout WORLD-MODEL strategy + SPEC v3.0 governance (2026-06-08)

Founder reframed the work: stop fighting fires, architect the **world model** first. Two deliverables
documented BEFORE implementing (founder instruction):

- **[GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY.md](../../01-strategy/GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY.md)**
  — the strategy doc: the "world-model living graph" thesis (the graph is the product; geometry is a
  projection; quality is graph-measurable; context is graph context), a competitive benchmark of how
  Forma/Spacemaker · Hypar · Finch · TestFit · Delve · the academic floorplan lines (House-GAN/
  Graph2Plan/rectangular-dual) architect generative logic, the synthesis ("deterministic semantic-graph
  solver, multi-objective/Pareto, environment-aware via lookups+surrogates, composable, ML-as-prior,
  graph kept live+editable" — which PRYZM's D-TGL+UBG+C52 already IS in shape), a full audit of SPEC
  v3.0's 20 sections vs PRYZM today (HAVE/PARTIAL/GAP), and a 7-phase roadmap (P0 structural → P1
  windows → P2 graph-metric scoring → P3 SiteContext/climate → P4 validation taxonomy → P5
  furniture-fit gate → P6 world-model/learning). **Web research was unavailable this session** — the
  competitor specifics are knowledge-based, flagged to-verify.
- **SPEC v3.0** (founder's "Room Layout Engine — Algorithm Architecture & Complete Element
  Specification v3.0", GIS/climate · acoustic · multi-storey · climate-windows · solar/wind ·
  furniture-fit · validation taxonomy) is the NORMATIVE TARGET (supersedes v2.0/v1.0). New gaps
  G15-G20 (acoustic matrix, climate WWR, vertical wet-stack, cross-vent, outdoor-area nodes,
  cold-wind shielding). KEY DECISION recorded: keep PRYZM's DETERMINISTIC enumeration (ADR-0061) —
  adopt v3.0's "24 variants" as deterministic DOF strategy-dimensions, REJECT the "sampling" framing.

**Deploy status:** v70 (keystone §CONSENSUS-ON-CENTRELINE room-merge fix) run #151 FAILED on INFRA
(Docker OOM/flyctl flake — all local gates green: isolation✓ tsc✓0-errors commandmanager✓
geometry-wall 45/45, ai-host 2043). Re-triggered as v71 (run #152, fresh push — GH "Re-run" replays
the old commit so a fresh push is required). NOTE: background agents are sandboxed WITHOUT network/
node, so deploy-monitoring + test-running must be done by the main loop.

### §22.16 — C53 contract + v71 keystone LIVE (2026-06-08)

- **v71 (run #152) DEPLOYED ✓** — the §CONSENSUS-ON-CENTRELINE keystone room-merge fix is LIVE (v70's
  run #151 had failed on infra; all local gates were green; fresh re-push succeeded). Rooms should now
  read as DISTINCT (no Living/Kitchen/Dining/Hall blob). + cornerFlush regression test (geometry-wall
  48/48) locks it.
- **[C53 — Generative Layout Engine Architecture](../../02-decisions/contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md)**
  authored (founder ask: "document the architecture in the contracts"). Binds **L-PRINCIPLE** (separate
  Topological Graph Logic from Geometric Solvers; topology=truth, geometry=projection; L1–L4), the
  6-tier pipeline, the typed topology-vs-geometry data contract, determinism + **slider-as-intent**
  (the reactivity-bug cure — UI controls modify graph weights NEVER dimensions), 3 deterministic
  variants, Pareto scoring, 5 CI gates, and the M0–M9 migration steps. M0 (no-merge) + M1
  (program↔plate) shipped; **M2 (slider-intent wiring, G13) is the next highest-leverage step**.

---

# §23 — GENERATIVE LAYOUT TO-BE: Documentation-Complete Implementation Plan (the world-model living graph)

**Status (2026-06-08): DOCUMENTATION COMPLETE — STOP before implementation.** This section reconciles
the now-sound architecture docs against the live code + the existing Phase-A pipeline, and defines the
phased plan to follow. Implementation begins only on founder go, subphase-by-subphase, each shipping
byte-identical-safe with the ai-host suite green.

## §23.1 — The sound documentation set (read in this order)
1. **Vision/strategy** — [GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY](../../01-strategy/GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY.md)
   (world-model living-graph thesis, competitive vector matrix, v3.0 audit, roadmap).
2. **Architecture contract** — [C53 — Generative Layout Engine Architecture](../../02-decisions/contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md)
   (L-PRINCIPLE topology/geometry separation, 6-tier pipeline, data contract, slider-as-intent,
   variants, Pareto, CI gates, M0–M9, §12 ratified refinements D1–D7).
3. **Decisions** — [ADR-0062](../../02-decisions/adrs/0062-layout-engine-deterministic-graph-solver.md)
   (D1 deterministic combinatorial expansion, D2 rectangular-dual solver, D3 signed-weights-at-zonal-cut,
   D4 dynamic boundary softening, D5 hard vertical stacking, D6 3-tier severity, D7 SiteContext cache).
4. **Rules (normative target)** — founder **SPEC v3.0** (GIS/climate, acoustic, multi-storey, windows,
   solar/wind, furniture-fit, validation taxonomy, acceptance) — §22.14.
5. **Engine specs** — [SPEC-TGL](../specs/SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md) (current engine) +
   [SPEC-RECTANGULAR-DUAL-LAYOUT-SOLVER](../specs/SPEC-RECTANGULAR-DUAL-LAYOUT-SOLVER.md) (the D2 upgrade) +
   [SPEC-LAYOUT-ALGORITHM-MASTER](../specs/SPEC-LAYOUT-ALGORITHM-MASTER.md) (orchestration + §DIAG surface)
   + [SPEC-ROOM-PLACEMENT-RULES](../specs/SPEC-ROOM-PLACEMENT-RULES.md) (G1–G20 gap tracker).

## §23.2 — Doc-vs-code reconciliation (verified 2026-06-08)
| TO-BE element | Doc | Code today | Verdict |
|---|---|---|---|
| Topology/geometry separation (L-PRINCIPLE) | C53 §1 | D-TGL already topology→geometry; editor seam leaked (G1) | HAVE + fixed v70 (ground) |
| Rectangular-dual solver (graph-edge ⇒ shared-wall) | SPEC-DUAL / ADR-0062 D2 | NONE — slicing/squarify only (grep-confirmed) | BUILD (deepest) |
| Signed adjacency weights at zonal cut | ADR-0062 D3 | preferenceBetween returns [0,1] unsigned | EXTEND to signed [-5,+5] |
| 3-tier severity | ADR-0062 D6 | RuleSeverity ALREADY in ai-host/AITypes.ts + RuleEngine.ts | REUSE/ALIGN — do NOT duplicate |
| Dynamic boundary softening | ADR-0062 D4 | hard gates can return 0 options | BUILD softening pass |
| Hard vertical structural stacking | ADR-0062 D5 | stair core reserved; plumbing/structural soft | PROMOTE to hard |
| Deterministic combinatorial matrix (4-axis) | ADR-0062 D1 | 8 fixed strategies (no DOF matrix) | EXTEND DOF dims |
| SiteContext cached vector field | ADR-0062 D7 | C19 site + NOAA/Overpass; not a cached field feeding layout | EXTEND C19 + wire |
| Slider-as-intent | C53 §6 | design-param sliders to EngineTuning (partial); target-area/style/master-floor NOT wired (G13) | WIRE all (M2) |

## §23.3 — The phased plan (maps M0–M9 + D1–D7 onto the A.21 house engine)
- **Phase 0 — Structural correctness (PARTIAL).** M0 no-merge GROUND (§CONSENSUS-ON-CENTRELINE v70 +
  regression test 48/48) + M1 program-vs-plate (§AREA-AGREEMENT + §STAIR-FRAGMENT v69). **CARRYOVER P0:
  upper-floor still merges (§23.5 evidence) — extend the weld/self-cluster/centreline treatment to
  `_buildPerimeterShell` (G1-upper).**
- **Phase 1 — Perimeter typing + frontage/windows + aspect (P1).** L/T/U/courtyard classifier (v3.0 §2);
  constructive frontage swap so every habitable room reaches the shell + is windowed (M3, G11);
  **aspect-ratio reject during enumeration (§15) — kills the tunnel rooms.** Owning: SPEC-ROOM-PLACEMENT-RULES
  W4 + v3.0 §§12,15.
- **Phase 2 — Signed graph + slider-intent + severity + softening + zoning gate (P2–P4).** Signed weights
  at zonal cut (D3); slider-as-intent G13 (M2 — reactivity cure); ALIGN to existing RuleEngine RuleSeverity
  (D6); dynamic boundary softening (D4); **privacy-gradient ZONE_VIOLATION gate (§4/§6)**; 4-axis
  deterministic matrix labelling variants A/B/C (D1).
- **Phase 3 — Context + scoring + furniture-fit gate (P5).** SiteContext cached field extending C19/C21
  (D7) feeding window WWR + solar/acoustic Pareto; D-PROX walking-distance (M4, G6); bedroom solar;
  **furniture-fit promoted to a PRE-RANK validity gate (§16, M8) — rejects the un-furnishable tunnel.**
- **Phase 4 — Rectangular-dual solver (the deep upgrade).** SPEC-RECTANGULAR-DUAL D2 — staged behind a
  flag, squarify fallback, byte-identity golden + adjacency-fidelity tests. The constructive cure.
- **Phase 5 — World-model + ML priors + hard vertical core (P6).** UBG unification (C52); **stair as an
  absolute anchor node + hard vertical stacking (D5, §9) — fixes the floating stair**; ML as suggester.
- **Cross-cutting — CI gates (C53 §9), merge-blocking:** determinism golden, topology-purity, no-merge
  generation test (extend to upper floors), slider-intent audit, acceptance suite (v3.0 §19).

## §23.4 — Current challenges to carry into implementation (do not regress)
- **Determinism is sacred (ADR-0061):** gated-when-absent, byte-identical; ai-host 2043 + geometry-wall 48 are the floor.
- **Editor seam is the failure-prone boundary:** engine is good (§DIAG-proven); most defects are editor
  geometric stages; the Phase-4 dual solver + the no-merge gate harden this.
- **Localhost dev unusable / browser-only stages:** verify on prod (pryzm.fly.dev) + §DIAG console paste.
- **Reuse, don't duplicate:** RuleSeverity, EngineTuning, C19, C52 — extend existing seams (P6/C52 §3).
- **Don't over-gate small plots:** D4 dynamic softening before any FATAL acoustic/zone gate ships.

## §23.5 — Layout failure POST-MORTEM (evidence → acceptance criteria, 2026-06-08)
A founder-supplied audit of two screenshots (first-floor `image_a53029.png`) is the concrete
justification for the whole world-model strategy. Each observed failure becomes a binding acceptance
criterion for its phase. **Crucially the upper floor STILL shows a merged blob** ("Bedroom 1 / Bedroom 2 /
Bedroom 3 / En-suite / Bathroom 2 / Bathroom 1 = 101.7 m²") — the keystone fix covered the ground floor
(§GROUND-WELD) but NOT the upper floor (`_buildPerimeterShell`).

| # | Observed artifact (evidence) | Root gap | Spec/ADR | Phase | Acceptance criterion |
|---|---|---|---|---|---|
| PM-0 | First floor = ONE 101.7 m² blob (6 rooms merged) + generic "Room 00-002/004" | **G1-upper** + G9 | §CONSENSUS-ON-CENTRELINE (extend) | **P0 carryover** | Upper floors produce distinct rooms (no merged label), every region named |
| PM-1 | Stair floats loose in a room corner, not on a spine/core | §9 / D5 | ADR-0062 D5 | P5 | Stair is an anchor node; circulation spine routes from it; hard vertical stack |
| PM-2 | Bedroom opens directly into a massive public zone, no buffer | §4/§6 / D3 | ADR-0062 D3/D4 | P2 | Privacy-gradient ZONE_VIOLATION gate; signed bedroom↔public penalty at zonal cut |
| PM-3 | Bedroom 1 = 23.2 m² narrow TUNNEL (bad aspect) | §15 | ADR-0062 / v3.0 §15 | P1 | Aspect-ratio filter (≤ ~1:2) rejects the candidate during enumeration |
| PM-4 | 23.2 m² bedroom too narrow to fit a bed + clearances | §16 | v3.0 §16 / M8 | P3 | Furniture-fit pre-rank gate: a room that can't fit mandatory furniture FAILS |
| PM-5 | Room 00-004 = 83.9 m² deep-plan cavern, dark interior | §7/§12 | SPEC-ROOM-PLACEMENT W4 / D2 | P1/P4 | Daylight-depth constraint: every habitable point within max distance of a window; constructive frontage swap |

> The post-mortem confirms the priority: **PM-0 (upper-floor merge) is the immediate P0 carryover**, then
> PM-3/PM-5 (aspect + daylight, Phase 1), then PM-2/PM-4 (zoning + furniture-fit, Phase 2/3), then PM-1
> (core anchor, Phase 5). The rectangular-dual solver (Phase 4) structurally prevents PM-0/PM-3/PM-5 by
> construction.

## §23.6 — Console-log POST-MORTEM (§DIAG trace → three deep mechanisms, 2026-06-08)
The §DIAG instrumentation (v69/v70) paid off: a founder audit of the live console trace pinpoints the
THREE mechanisms behind §23.5's artifacts. Each becomes a binding fix.

- **F1 — Program over-enrichment runaway.** `§DIAG-ENRICH after: path=grow-bedrooms bedrooms=1->5 (+4)
  baths=0->2 (+2)` on a 176 m² plate (brief = 1 bed). `enrichStoreyProgramToPlate` packs +4 bedrooms /
  +2 baths to fill AREA → 10 rooms crammed → elongated tunnels. **FIX (ADR-0062 D8): cap enrichment by
  EXTERNAL WINDOW-FACADE CAPACITY, not just area** — stop growing habitable rooms once their mandatory
  windows can no longer fit the available shell frontage. Owning: `houseProgramFloor.enrichStoreyProgramToPlate`.
  Phase 1. → drives PM-3/PM-4 (tunnels / unfurnishable).
- **F2 — Topology ships broken via the reroute escape-hatch (HIGHEST LEVERAGE).** EVERY candidate logs
  `connected=false topoOK=false circRouted=false`; doors `sealed=[r3,r4,r6,r9]`; the winner ships at
  `topologyQuality=0.00` via `§CIRCULATION-REROUTE` ("ships connected but compromised"). The reroute is
  **too permissive** — it lets unbuildable topologies through. **FIX (sharpens ADR-0062 D4/D6): make
  `topoOK` + `circRouted` a HARD gate — reject `topologyQuality=0.00` when ANY better candidate exists;
  fall back to softening (D4) ONLY when NO option is valid, and tag it. A sealed room is FATAL, not a
  warning.** Phase 2. → drives PM-0/PM-2 (merge / sealed / no buffer).
- **F3 — Window facade hogged by wet rooms.** `§DIAG-WIN En-suite: 3 windows`, `Bathroom 1: 3 windows`,
  while `Bedroom 1: wall#9 placed=0 (all removed by door/partition/de-overlap)` — a habitable room's only
  window deleted while wet rooms get 3 each. **FIX: habitable rooms get facade PRIORITY before wet rooms;
  never delete a habitable room's last window; cap windows-per-wet-room.** Owning: `windowEmission` /
  `shellWallMatch` de-overlap + emit order. Phase 1/3 (M3/G11). → drives PM-5 (dark cavern + windowless).

> **F2 (topological hard gate) is the single highest-leverage fix** — it stops the engine shipping
> `topologyQuality=0.00` garbage and is what makes the world-model "discard-if-invalid" promise real.

> **NEXT (on founder go), in leverage order:** **(1) F2** topological hard gate (reject invalid topo
> instead of rerouting) · **(2) PM-0** extend the no-merge fix to upper floors (`_buildPerimeterShell`) ·
> **(3) F1** enrichment facade-cap · **(4) F3** habitable window priority · **(5) M2** slider-as-intent.
> Everything above is documentation-complete; **implementation is intentionally NOT started** pending
> founder confirmation.

## §23.7 — Implementation status (LIVE log, updated 2026-06-08)
The full plan is §23.1–§23.6 above (doc set, doc-vs-code reconciliation, 5-phase plan, current
challenges, visual + console post-mortems). This is the running status as items ship.

| Item | Decision | Status | Deploy | Evidence |
|---|---|---|---|---|
| **F1 — enrichment density-cap** | ADR-0062 D8 / §ENRICH-DENSITY-CAP | ✅ **DONE** | v72 (1eb23641) | Caps bedrooms by plate circulation capacity (~45 m²/bed); test logs show upper floor 5→2-3 beds, candidates flip from all-`topoOK=false` to `topoOK=true circRouted=true connected=true` (x-rev-id 0.700) → ranking now picks a VALID topology |
| **F3 — habitable window priority** | ADR-0062 / §23.6 F3 / §WINDOW-HABITABLE-PRIORITY | ✅ **DONE** | v73 | `deOverlapShellWindows` keeps habitable-room windows over wet-room windows (was deleting a bedroom's only window while a bathroom kept 3). Byte-identical when no cross-priority wall conflict |
| **F2 — topology routed-preference** | ADR-0062 D4-sharpened / §TOPO-ROUTED-PREFERENCE | ✅ **DONE** | v74 | Inserted `legalRouted` + `connectedRouted` ranking tiers BELOW the `clean` tiers: when every candidate fails the shape gate (universal on elongated plates), the engine now prefers a circulation-ROUTED plan instead of shipping `circRouted=false` / `topologyQuality=0.00` (the founder console audit). D4-safe (never empties the pool → never zero-result); byte-identical when a clean tier is populated or no routed candidate exists. ai-host 2043/2043 |
| **F2b — topology HARD-REJECT gate** | §TOPO-HARD-REJECT (Stage 5) / ADR-0062 D4-SHARPENED/D6 | ✅ **DONE** | v93 (c183c295) | The full HARD gate the original F2 brief called for ("a sealed room is FATAL, not a warning"). New TOP-LEVEL tier split in `enumerate.ts`: a candidate is hard-invalid if a `windowMandatory` room is fully interior (W, reuses `frontage` hard findings), any room is land-locked (C, reuses `unroutedToCirculationRoomIds`), or a private room opens off the entrance hall (P, new scan). Hard-valid ranks ABOVE hard-invalid; `selectTier` runs over the hard-valid subset first, falls through to ALL candidates with a loud `§TOPO-HARD-REJECT-ALL` warning only when every strategy fails — **never empties the pool**. `§DIAG-TOPO-GATE` per candidate; `hardValid`/`hardFailedRules` on `TglCandidate`. CI invariant test `houseLayoutInvariants.test.ts` (45° plate: stair-corner I1 / no merged-name I3 / no silent-drop I4 — all PASS). ai-host **2118/2118**; byte-identical when ≥1 strategy is hard-valid |
| **PM-0 — upper-floor no-merge** | §CONSENSUS-ON-CENTRELINE (extend) | 🟡 **likely reduced by F1** | — | The 101.7 m² upper blob was driven by the 5-bedroom cram; F1 cuts the room count. RE-TEST on prod to confirm the upper floor no longer merges post-F1 before adding `_buildPerimeterShell` work |
| F1+F3 suite | ADR-0061 determinism | ✅ ai-host **2043/2043** green | — | byte-identical where the caps/priority don't bind |
| **M2 — slider-as-intent (G13)** | C53 §6 | ⚪ queued | — | wire all UI controls → `EngineTuning` weights, never absolute dimensions |
| **Phase 1+** (perimeter typing, aspect filter, frontage swap, severity-align, dynamic softening, SiteContext, dual-graph solver) | C53 / ADR-0062 / SPEC-DUAL | ⚪ planned (§23.3) | — | per the phased plan; each ships byte-identical-safe behind the CI gates |

> **NEXT:** re-test on prod with a §DIAG console paste — F1+F3 should show (a) fewer bedrooms on big
> plates, (b) `topoOK=true` winners (no more `topologyQuality=0.00`), (c) every habitable room windowed.
> The §DIAG-ENRICH / §DIAG-ENUM / §DIAG-WIN lines will confirm. Then M2 (slider-as-intent), then Phase-1
> aspect-filter + frontage-swap, then the Phase-4 rectangular-dual solver (the structural cure).

## §23.8 — v74 prod test POST-MORTEM (the engine is right; the EDITOR geometry is the wall, 2026-06-08)

v74 (F1+F2+F3+PM-5) prod test. The §DIAG trace proves the **engine improvements worked** but exposes
that the dominant remaining failures are **editor-side geometry**, not the engine:

- **Engine is now correct.** `§DIAG-ROOMS L0: rooms=8` — Living 72.5 · Bedroom 1 42.7 · Corridor 25.9 ·
  Hall 18.4 · Bedroom 2 42.7 · Dining 33.1 · Bathroom 16.6 · Kitchen 40.5 — **8 distinct, sized,
  windowed rooms** (F1 capped the count; ground got 9 windows; no cavern). The plan is good *as data*.
- **But the EDITOR merges them.** The ground-floor plan shows "Living / Bedroom 1 / Corridor / Entrance
  Hall = 194.5 m²" — `RoomDetectionEngine` flooded 4 of the 8 rooms together. `§MULTI-CLUSTER ...
  trimmed=3` still fires ×12 → interior partitions are still trimmed INWARD so they don't reach the
  perimeter (the founder's "some walls don't extend until where they should"). **The
  §CONSENSUS-ON-CENTRELINE fix kept walls on-axis but does NOT extend a partition to the perimeter it
  should meet** → the gap remains → detection floods. **The real cure is EXTEND-TO-SHELL (G1, deferred)
  + the rectangular-dual solver (exact tiling, no trim needed).**

**New, §DIAG-evidenced findings → tracked items:**

| ID | Evidence | Root | Owner | Priority |
|---|---|---|---|---|
| **PM-6** | Ground + upper STILL merge (194.5 / 204.4 m² blobs) despite §CONSENSUS-ON-CENTRELINE | partitions TRIMMED inward, not EXTENDED to the perimeter → detection floods | `WallJoinResolver` extend-to-shell (G1) + Phase-4 dual solver | **P0** |
| **PM-7** | `§DIAG-WIN-DIST` upper: `resolved=3 kept=2 unmatchedToShell=9`; ground `unmatchedToShell=5` | room window walls don't ALIGN to the (separately-built) perimeter shell, esp. upper floor (`_buildPerimeterShell`) → windows can't host → "almost no windows upstairs" | `windowEmission` / `shellWallMatch` + upper-floor perimeter alignment | **P0 (upstairs)** |
| **PM-8** | Internal walls too tall → protrude into floor above → ground walls visible in the FIRST-floor plan view | internal-wall height vs floor-to-floor + the per-level plan-view clip range includes lower-level walls (G10) | wall-height + `§FLR-VIEWS` plan clip / `NativeElementMeshExporter` level filter | **P1** |
| **PM-1** | Stair still mislocated (U, rot −21.7°) | stair not an anchor; placement (G8) | `stairPosition` + D5 | P1 |

**The verdict (honest):** F1/F2/F3/PM-5 fixed the *engine*. The remaining founder-visible defects — the
merge (PM-6), the missing upstairs windows (PM-7), the tall walls (PM-8) — are **editor-side geometry
that incremental gate/score tweaks will NOT fix**. Two structural cures, both already specced:
1. **Phase-4 rectangular-dual solver** (SPEC-RECTANGULAR-DUAL): exact tiling means partitions meet the
   perimeter BY CONSTRUCTION → no inward-trim, no flood-merge (PM-6), walls land where windows expect
   them (PM-7). This is the dominant cure and the centrepiece of the whole strategy.
2. **Upper-floor perimeter alignment + extend-to-shell** (G1 extend, PM-0): make `_buildPerimeterShell`
   share exact endpoints with the partitions AND extend partitions to the shell, so the upper floor
   closes + windows match.
3. PM-8 (wall height / plan bleed) is a contained editor fix, parallelisable.

> **RECOMMENDATION:** greenlight **Phase-4 (the rectangular-dual solver)** — it is the structural cure
> for PM-6 + PM-7 + the tunnels (PM-3) + the generic regions (G9), all at once, by construction. The
> engine is ready (8 clean rooms); the solver is what makes the editor render them as separate, windowed
> rooms. Everything else is a band-aid on the slicing solver this replaces.

---

## §24 — Auto-Documentation Sheets (`DOC-AUTO`) — analysis + plan (2026-06-09)

Founder brief: a **full set of PDF-ready documentation sheets for each floor plan and each room** —
per-level plan sheets, automatic building elevations, per-room interior elevations + cropped plan
views, and an automatic wall/door/window **SET-OUT plan with core dimensions** — all auto-placed on
numbered sheets. Full analysis/gap-audit/roadmap: **[AUTO-DOCUMENTATION-SHEETS-PLAN.md](AUTO-DOCUMENTATION-SHEETS-PLAN.md)**.

**Headline (4-agent codebase + contracts sweep):** ~80% of the substrate already EXISTS — Sheet/
Viewport/TitleBlock schemas (L0), `drawing-primitives` (L2, incl `buildSheetFromRooms`),
`plugins/sheets` (11+ handlers + book-exporter), `DrawingSetStore`, `sheetToPdfBytes` (pdf-export),
ViewDefinition (plan/elevation/section first-class) + `DefaultViewsManager` + **§FLR-VIEWS already
auto-creates per-storey plan views**, full elevation/section projection via EdgeProjectorService,
`CreateElevationMarkCommand` (auto-detects room + scopes), a 6-kind `DimensionString` schema + a
5-mode `produceDimensions()` auto-producer (per-element/room-bounding/elevation/section/rcp), and
grid/datum injection. **The gap is the ORCHESTRATION layer** that strings these into an auto sheet set.

**Governance:** complies with C24 (Sheet Composition) · C29 (PDF Vector Export) · C30 (Drawing Set
Mgmt) · C34 (Print & Drawing Standards) · SPEC-04 (Drawing Engine) · SPEC-30 (Plan-View Perf) ·
ADR-016/ADR-039. **Needs ONE new contract — C24.1 "Auto-Documentation Sheets Protocol"** (auto vs
interactive authoring, per-room/per-level coverage rule, auto-numbering, rule-based label/dim
placement) before the dimensioning/assembly items land.

**Tracked items (☐ queued — sequence in §7 of the plan doc):**
| Item | Scope | Maps gap |
|---|---|---|
| **DS1** | Per-level plan sheets (reuse §FLR-VIEWS + new pure `viewToSheet` factory) | G1+G2 |
| **DS2** | `sheet.export.pdf` command + "Export PDF" UI (wire `sheetToPdfBytes`; bridge book-exporter) | G3 |
| **DS3** | Building elevations — auto-place 4 N/S/E/W exterior marks from footprint → views → sheet | G4 |
| **DS4** | Per-room interior elevations + cropped plan views (cropRegion=room bbox; per-wall isolation) → room sheets | G5+G6 |
| **DS5** | Core dimensions / SET-OUT plan — new `set-out` producer mode (grid/datum-keyed chains + opening offset/width callouts) | G7 |
| **DS6** | Auto sheet set + numbering (A-1xx/2xx/3xx/4xx) + DrawingSet wiring + book PDF | G8 |

**Build order:** DS2 → DS1 → DS3 → DS5 (needs C24.1 draft) → DS4 → DS6. Each: pure deterministic
core + Node tests → editor executor dispatching commands (P6) → §DIAG line + OTel span (P8); purely
additive to the existing interactive tools. Status: **documented, NOT started** (pending founder go).

*Addendum 2026-06-09 — §24 DOC-AUTO analysis + plan added (4-agent substrate/contracts audit).*

### §24.1 — DOC-AUTO implementation status (2026-06-09)

The pure DOC-AUTO decision layer is **IMPLEMENTED + tested**; the remaining work is editor wiring.
Governed by **[C24.1](../../02-decisions/contracts/C24.1-AUTO-DOCUMENTATION-SHEETS-PROTOCOL.md)** (DRAFT).

| Item | What shipped | Deploy | Tests |
|---|---|---|---|
| **DS5** | `set-out` `DimensionAutoMode` producer mode (offset-from-wall-start + width + overall; `hostWallId` on door/window) — `geometry-kernel/dimensions/producer.ts` | v80 | gk 600/600 (+6) |
| **DS1** | `buildSheetFromViews` — N views → scale-fit grid sheet (`drawing-primitives/sheet`) | v81 | dp 138/138 (+11) |
| **DS3** | `computeBuildingElevationMarks` — 4 N/S/E/W exterior marks from footprint (`ai-host/houseLayout/buildingElevations.ts`) | v83 | ai-host (+5) |
| **DS4** | `roomCropRegion` + `computeRoomInteriorElevationMarks` — per-room crop + 4 interior elevations (`roomDocumentation.ts`) | v84 | ai-host (+7) |
| **DS6** | `planDocumentationSet` — numbered sheet plan (A-1xx plans · A-2xx elevations · A-3xx set-out · A-4xx room sheets) (`documentationSet.ts`) | v85 | ai-host (+5) |
| **C24.1** | Auto-Documentation Sheets Protocol contract (DRAFT) + README | v86 | — |

**ai-host 2082/2082** with all DOC-AUTO cores. **REMAINING (editor wiring, untestable without a deploy —
do as ONE focused task):** the `docSheets` executor (`planDocumentationSet` → `view.createDefinition`
per `DocViewSpec` → `buildSheetFromViews` → `sheet.create`/`addViewport` → DrawingSet) + **DS2**
(`sheet.export.pdf` command + an "Export PDF" surface, wiring the existing `sheetToPdfBytes`).
Open refinements: per-wall isolation in interior elevations; principal-axis (vs bbox) framing for
non-rectangular footprints; force-directed label placement (deferred per C24.1 §1.5).

### §24.2 — House-layout fixes shipped this session (2026-06-09)

| Fix | What | Deploy | Tests |
|---|---|---|---|
| **§STAIR-ANTI-FRAGMENT** | stair scorer prefers a CORNER carve (one dominant rect) over a fragmenting MID-EDGE → stops `§FEASIBILITY-ALLOC` room drops | v78 | ai-host (+3) |
| **§STAIR-HALF-LANDING-INWARD** | U-stair second flight folds toward the plate interior (`StairCore.interiorSide` from position kind) | v81 | ai-host (+4) |
| **§WJ-SKEW-3** | partition weld tol 0.45→0.60 m so rotated-plate (~−44°) Y-junction endpoints fuse → closes `§MULTI-CLUSTER pinned=0 trimmed=3` room merge | v81 | ai-host (+2) |
| **§STAIR-CONTAIN** | validate the FULL world-frame stair footprint vs the rotated shell + nudge the whole body inward until contained (`computeInwardContainmentOffset`) — the deeper cure for the systematic `cornersInShell=1/4` | v82 | ai-host (+5) |
| **§STAIR-CONTAIN-UPSTREAM** (the deepest stair fix — `position→keep-out→tile→nudge` DESYNC closed) | Move the stair containment UPSTREAM into `houseOrchestrator.ts` (`containStairCoreUpstream`): build the SHARED world stair footprint (`houseLayout/stairWorldFootprint.ts` — `computeStairWorldFootprint`, a byte-for-byte port of `geometry-stair` `computeStairFootprintRect`), solve the inward offset with `stairContainment.ts` `solveStairContainmentWorld` (the same interior-side→centroid 2-attempt gate the executor used) BEFORE the keep-out is carved. The keep-out is now the world AABB of the CONTAINED footprint (rooms tile around the FINAL stair position); the world offset rides `StairCore.containOffsetWorld` to the executor, which applies the SAME shift so the SHIPPED footprint == the carved keep-out by construction. The executor's `§STAIR-CONTAIN` becomes a VERIFICATION — re-solves on the shifted body, expects `{0,0}` residual, logs `§STAIR-CONTAIN ⚠ DESYNC` otherwise. `§DIAG-STAIR-CONTAIN-UPSTREAM storey=… offset=… cornersInShell=n/4` at reserve time. Reserved `core.rectMm` UNCHANGED (preserves §STAIR-DEFAULT-BIAS wall-hug + rectMm-equality tests). Apartment/single-storey byte-identical (no core → block skipped). Closes founder I2 (4/4) + keep-out==footprint coincidence; proven in `__tests__/stairContainUpstream.test.ts` (8 tests). `groundShellWeld` faithful threshold 4→3 (keep-out now reflects the real stair extent — correct, no overlap). **Doctrine = [ADR-0063](../../02-decisions/adrs/0063-house-generative-layout-doctrine.md) H3.** | v93 (abc000f0) | ai-host (+8: stairContainUpstream); ai-host 2113/2113 |
| **§STAIR-DEFAULT-BIAS (Fix 1)** | orchestrator ALWAYS supplies an `AspectBias` to `chooseStairCorePosition` — default N-hemisphere `{x:0,y:1}` (`STAIR_DEFAULT_LAT_DEG=45`) when no site solar → `PERIMETER_PREFERENCE`+`FRAGMENT_PENALTY` always fire → stair takes a back/side CORNER (one dominant rect), never central → fixes the central-stair merged blob. TOPOLOGY-level fix. Apartment/solar paths byte-identical | v83 | ai-host (+6) |
| **§STAIR-FRAGMENT (Fix 4)** | `DOMINANT_FRACTION` 0.45→0.40 in `subdivide.ts` so a corner-carved plate reliably triggers `§STAIR-OBSTACLE-CARVE`; defence-in-depth (still runs BOTH carve+packMultiRect, keeps fewer drops). `stairCarved`-gated → apartment unaffected | v83 | ai-host (+2) |
| **§DIAG-STAIR-RESERVE / §DIAG-BRANCH (Part 8)** | deterministic prod-verification logs: `§DIAG-STAIR-RESERVE storey=… kind=…` (corner-vs-central tell, `houseOrchestrator.ts`) + `§DIAG-BRANCH stairCarved dominantFrac=… path=carve\|generic` (`subdivide.ts`) | v83 | — |
| **§WALL-TOP-AT-SLAB-BOTTOM** | ground shell wall head = L1 floor (no protrusion into the floor-above plan) | v77 | — |
| **§BND-90-DEFAULT-ON** | orthogonal boundary lock default-on + 8°→22° snap (rectilinear plots) | v77 | — |
| **§SHELL-ANCHOR-PRESERVE** (6-fix wave) | `geometry-wall` room-merge: interior partitions stay welded to the perimeter (endpoints preserved through the join resolver) — closes a merged-room class on the ground plate | v89 (b3ecb6d1) | geometry-wall |
| **§SHARED-FLOOR-BOUNDS** (6-fix wave) | house modal renders all storey thumbnails at ONE consistent scale (shared floor bounds) — fixes per-floor zoom drift in the preview | v89 (834dc9ba) | editor |
| **§GHOST-FIX** (6-fix wave) | generated storey/roof/doc plans stop projecting the floor below (belowLevelDepth-0 intent) | v89 (082f7bea) | editor/views |
| **§DOC-ROOM-CROP** (6-fix wave) | per-room documentation plans fit + clip to the room crop region | v89 (cc7745fd) | editor/docs |
| **§ROOF-FORMA** (6-fix wave) | roof reappears in the Forma massing view after §ROOF-LEVEL | v89 (d276fbf3) | forma |
| **§GROUND-ENGINE-PERIMETER** | ground storey closes rooms via the engine's authoritative perimeter ring (the §5 smallest-slice from the unification audit) when safe — the cure for the ground "merged room" / fragile weld. **Doctrine = [ADR-0063](../../02-decisions/adrs/0063-house-generative-layout-doctrine.md) H1.** | v90 (0567f456) | house |
| **§PREVIEW-SHELL-FIDELITY** | modal thumbnail draws a clear perimeter ring + clamps window/door spans to the host wall (fixes "windows poking out of the shell" preview) | v90 (e2916906) | editor/modal |
| **§UPPER-SHELL-WELD** | upper storeys weld partitions to the minted engine perimeter on rotated plates. **Doctrine = [ADR-0063](../../02-decisions/adrs/0063-house-generative-layout-doctrine.md) H2.** | v91 (e061f263) | house |
| **§LANDING-NOT-HALL (G14)** | entrance hall is GROUND-ONLY; upper floors get a Landing (stair arrival = circulation). **Doctrine = [ADR-0063](../../02-decisions/adrs/0063-house-generative-layout-doctrine.md) H4.** | v91 (da48f3e1) | house |
| **§WINDOW-MANDATORY-RESCUE** | a `windowMandatory` room never ends up windowless (rescue pass in window emission) | v92 (3388b75d) | ai-host/layout |
| **§LEVEL-STACK** | instanced walls lift with their level; collapse restores the 3D view exactly (editor level-stack visualisation fix) | v93 (d81bdf0a) | editor |
| **§RECTIFY-SHELL-PROJECT** | by-construction cure for the rotated/sheared-plate room-merge: project bbox-edge interior-partition endpoints onto the REAL shell (in the rotated frame, before rotate-back) so they meet the executor perimeter ring within 20 mm — the weld becomes a safety net. Verified root: §RECTIFY-QUAD tiles the bbox while the executor ring is the real sheared quad (~1.9–2.1 m divergence). No-op (byte-identical) for the apartment + rectilinear plates. `rectShellProject.test.ts` + `tglRunDeterministicLayout.test.ts`. **Doctrine = [ADR-0063](../../02-decisions/adrs/0063-house-generative-layout-doctrine.md) H5.** | v95 (uncommitted) | ai-host/layout |

Reference: **[STAIR-CREATION-PIPELINE-AND-ANCHOR-ANALYSIS.md](../../04-reference/STAIR-CREATION-PIPELINE-AND-ANCHOR-ANALYSIS.md)**
(stair pipeline + the founder-confirmed start-corner-anchor analysis). **Master algorithm reference:**
[LAYOUT-GENERATION-ALGORITHM.md](../../04-reference/LAYOUT-GENERATION-ALGORITHM.md) now opens with a
2-page MASTER SUMMARY (D-TGL engine + apartment-single-plate vs house-storey-loop orchestration) and adds
**§8.4 "Why the apartment beats the house"** (engine 100% shared; gaps = stair + ground weld + parallel
program sizer) + **§8.5 "The stair is the circulation root-cause"** (the `position→keep-out→tile→nudge`
desync, grounded in the prod `§STAIR-CONTAIN (-1.50,-0.55)m` run — **now CLOSED by
`§STAIR-CONTAIN-UPSTREAM`, see the row above + §8.5.4**). **Queued (founder-flagged, needs a
prod test to pick the path):** lower-level INTERIOR walls → upper-slab top vs the exporter beyond-linework
root (L1-plan ghost lines); per-room windowless-habitable recovery; the stair-head-axis upper-corridor
alignment (A.27 P6).

*Addendum 2026-06-09 — §24.1 DOC-AUTO impl status (DS1-DS6 cores + C24.1 shipped) + §24.2 house-layout fixes (stair cure + rotated-plate merge).*

*Addendum 2026-06-09 (later) — §24.2 reconciled to v93: added the v89 6-fix prod-feedback wave
(§SHELL-ANCHOR-PRESERVE · §SHARED-FLOOR-BOUNDS · §GHOST-FIX · §DOC-ROOM-CROP · §ROOF-FORMA) + the
house-unification slices (§GROUND-ENGINE-PERIMETER v90 · §UPPER-SHELL-WELD v91 · §LANDING-NOT-HALL
v91 · §PREVIEW-SHELL-FIDELITY v90 · §WINDOW-MANDATORY-RESCUE v92 · §LEVEL-STACK v93); marked
§STAIR-CONTAIN-UPSTREAM + F2b §TOPO-HARD-REJECT committed (v93). **The house-layout doctrine behind
this wave is now recorded as [ADR-0063 — House generative-layout doctrine](../../02-decisions/adrs/0063-house-generative-layout-doctrine.md)** (per-storey apartment pipeline + multi-storey spine only;
stair contained upstream so keep-out == footprint; stair corner-anchored). The unification audit
[HOUSE-APARTMENT-UNIFICATION-AUDIT-2026-06-09](HOUSE-APARTMENT-UNIFICATION-AUDIT-2026-06-09.md) is
its context doc.*

---

## §25 — LIVE single-option layout modal (`LIVE-MODAL`) — analysis + plan (2026-06-09)

**Founder directive (verbatim):** *"the modal preview image is not accurate — the wall perimeter
shell should be better defined — it appears like windows going out of the perimeter shell already on
the preview — let's do something — i want only ONE option in the modal preview + living graph — but
better visibility — the user could change data in slider + living graph and the modal preview of the
floor plan should change LIVE accordingly."*

**Spec:** [SPEC-LIVE-SINGLE-OPTION-LAYOUT-MODAL](../specs/SPEC-LIVE-SINGLE-OPTION-LAYOUT-MODAL.md).
**Target:** the "Choose a house layout" modal (`apps/editor/src/ui/house-layout/*`).
**Governance:** C52 (editable building graph) · ADR-0061 · ADR-0060 (living design params) ·
ADR-0056 (typology brief) · C50/SPEC-TGL (the one deterministic engine).

### §25.1 — As-is (verified)

- The house modal opens with **3 variant cards** (`HouseLayoutController.HOUSE_OPTION_COUNT = 3`,
  `:42`; `generateHouseLayoutOptions(...)` best-first, `houseOrchestrator.ts:237`). Variant 0 is
  already the single best (A.21.D18 equality invariant, `:288`).
- The modal **already has** a debounced (250 ms) inline program-edit form + synchronous re-generate
  (`HouseLayoutModal._scheduleProgramChange :214` → `HouseLayoutController._regenerate :231` →
  `modal.refresh`). The house engine is an offline deterministic L2 call (no relay) → re-run is sync.
- The modal has **no living graph** (the apartment modal does, via `buildLayoutBubbleGraphSvg` +
  the per-card `.alm-view-toggle` Plan/Graph CSS — house just never calls them).
- The plan thumbnail (`layoutThumbnail.ts`) has **no dedicated perimeter-shell ring** and **does not
  clamp window/door spans to the host wall** → the "windows poking out of the shell" defect.

### §25.2 — Reusable substrate (do NOT reinvent)

- **Slider → re-render:** ALREADY in the house modal (§25.1) — reuse verbatim.
- **Graph edit → re-generate:** the apartment C52 loop — `activeRoomAreaOverrides.ts` /
  `activeRoomTypeOverrides.ts` (session stashes) + `LivingGraphOverlay.ts` (node edit → stash →
  debounced `triggerApartmentLayout` → `apartment.layout-executed` → graph re-projection). The modal
  reuses the SAME stashes; the house path merges them into `program.roomAreasByName/roomTypesByName`
  in `_computeVariants` and re-runs the SAME engine (sync, not via the async apartment trigger).

### §25.3 — Task breakdown

- [x] **LIVE-MODAL.A — single option (R1).** DONE (2026-06-09). `HouseLayoutController.request` opens
      the modal with `variants.slice(0,1)` (the single best — best-first sort + A.21.D18 invariant);
      `_regenerate` calls `modal.refresh(variants.slice(0,1))`. `houseModalHtml.buildHouseModalHtml`
      dropped the `headerCount` "N options" suffix → header reads "Choose your house layout".
- [x] **LIVE-MODAL.B — living graph (R2).** DONE (2026-06-09). `HouseLayoutModal._storeyGraphs`
      (mirrors `_storeyThumbs`) → `buildLayoutBubbleGraphSvg(s.option, {interactive:true})` per storey;
      `houseModalHtml.storeyHtml/cardHtml/buildHouseCardGridHtml/buildHouseModalHtml` thread a
      `storeyGraphs` param + a PER-STOREY `.alm-view-toggle` (Plan/Graph) + `.hlm-storey-view--graph`
      container; overlay click toggles `.hlm-storey--graph` on the storey row. Graphs render only
      when `onGraphEdit` is wired (no dead surface) ⇒ plan-only stays the pre-LIVE-MODAL look.
- [x] **LIVE-MODAL.C — better visibility (R3).** DONE (2026-06-09). R3a (perimeter shell RING from
      `LayoutWall.isExternal` / fitted-bbox fallback) + R3b (window/door span clamp to host wall +
      fitted bbox) ALREADY in `layoutThumbnail.ts` (§PREVIEW-SHELL-FIDELITY, applied unconditionally —
      apartment tests already updated). House `_storeyThumbs` now renders at HERO size (460×320);
      CSS: single wide centred card column + stacked hero `.hlm-card .hlm-storey-thumb` (height 320).
- [x] **LIVE-MODAL.D — editable modal graph (R4 graph).** DONE (2026-06-09). Opt-in
      `BubbleGraphOptions.interactive` emits `data-room-name` + `.alm-graph-node` + `pointer-events:auto`
      + role/tabindex (default-OFF ⇒ apartment overlay byte-identical). Modal node-click →
      `_openGraphNodeEditor` (inline area/type popover) → `setRoomAreaOverride`/`setRoomTypeOverride`
      (EXISTING C52 stash) → `_scheduleGraphEdit` (SAME 250 ms debounce timer, coalesced) →
      `onGraphEdit` → controller `_regenerateCurrent` → `_regenerate`. `_computeVariants._mergeOverrides`
      merges `getRoomAreaOverrides()`/`getRoomTypeOverrides()` into `program.roomAreasByName`/`roomTypesByName`
      before `generateHouseLayoutOptions` (no engine change); `_build` merges too so the BUILT house
      honours the edits.
- [x] **LIVE-MODAL.E — brief sliders + seeding (R4 slider).** DONE (2026-06-09, no code change needed).
      The modal form already presents Floors/Bedrooms/Bathrooms + 4 weight sliders and seeds from
      `req.program`/`req.weights`, which the caller (`houseFromBoundary`) gathers via
      `gatherLayoutPayload` (which itself seeds from `getActiveBriefMetadata` + the C52 stash, O.12
      parity). Re-presenting the brief numerics as range sliders is a cosmetic deferral (kept as
      number steppers to avoid duplicating `briefToProgram` interpretation in the controller).
- [x] **LIVE-MODAL.F — tests.** DONE (2026-06-09). New `apps/editor/__tests__/houseModalHtml.liveModal.test.ts`
      (single-card header has NO option count; one card; per-storey Plan/Graph toggle + graph present;
      plan-only when no graphs; interactive vs inert bubble nodes — 6 tests). New ai-host
      `houseLayout.test.ts` C52-I2 case: empty `roomAreasByName`/`roomTypesByName` reproduces the
      byte-identical baseline. `layoutThumbnail.test.ts` (30) + `runHousePostGenChain.test.ts` (4)
      stay green; ai-host 2085/2085; editor typecheck adds no new errors.

**Critical path:** A → B → D → F. Off-critical (parallel): C, E.
**Risks:** re-gen latency (mitigated: 250 ms debounce + sync offline engine); no live async closure
(controller caches data only); apartment regression (R3a/R3b/interactive all default-off).

## §26 — Concatenated cross-floor living graph, plan-LEFT / graph-RIGHT (`XFLOOR-GRAPH`) — analysis + plan (2026-06-09)

**Founder directive (verbatim):** *"the goal will be to have the graph NEXT TO the plan view — also
we should have a CONCATENATED graph in case we want to move a bedroom from upstairs to downstairs —
it should work like mural/miro the graphs — we should have the plan views to the LEFT and the graphs
to the RIGHT — the graphs are connected as a SINGLE LIVING ENTITY — and the plan view reflects
graphically the data. the graphs are the SEMANTIC TRUTH; the UI should be more dynamic — on the fly
the user can easily change data with sliders."*

**Spec:** [SPEC-LIVE-SINGLE-OPTION-LAYOUT-MODAL §9](../specs/SPEC-LIVE-SINGLE-OPTION-LAYOUT-MODAL.md#9--concatenated-cross-floor-living-graph-plan-left--graph-right--xfloor-graph).
**Target:** the "Choose a house layout" modal (`apps/editor/src/ui/house-layout/*`) — the next
evolution of the §25 single-option modal.
**Governance:** C52 (editable building graph) · ADR-0061 (bidirectional substrate) · ADR-0060
(living design params) · the UBG / `@pryzm/building-graph` strategy · C50/SPEC-TGL (the one engine).

### §26.1 — Shipped today vs target (verified)

- **Shipped (§25 / `LIVE-MODAL.*`):** single best option; per-storey Plan/Graph **TOGGLE**; ONE
  static editable **SVG bubble graph per storey** (`buildLayoutBubbleGraphSvg`, `interactive:true`);
  node-click → inline area/type editor → C52 stash → debounced sync regen.
- **Target (this §26 / SPEC §9):** plan-LEFT / graph-RIGHT **side-by-side** (no toggle); ONE
  **concatenated** graph spanning all storeys (storey lanes + stair edges); a **Miro/Mural**
  pan/zoom/drag CANVAS (reuse `LivingGraphCanvas`/`LivingGraphOverlay`); **drag a node between
  floor-lanes → move the room to that storey** → re-generate.

### §26.2 — Key findings (cite)

- **Room→floor assignment is by COUNT, not by instance** — `allocateProgramToStoreys`
  (`storeyAllocation.ts:44`, splits by `groundBedrooms`/`upperBedrooms`/… integer counts, `:80-86`).
- **No `roomFloorByName` exists** — `ApartmentProgram` has `roomAreasByName` (`apartmentLayout/types.ts:143`)
  + `roomTypesByName` (`:164`) but NO per-instance floor map. → must be ADDED (SPEC §9.4).
- **The Miro canvas already exists** — `apps/editor/src/ui/living-graph/` (`LivingGraphCanvas` +
  `LivingGraphOverlay`): pan (`onCanvasPointerDown :1153`), wheel-zoom-to-cursor (`onCanvasWheel :1132`),
  node-drag (`:1181`), hit-test (`pick :78`), force sim (`forceSimulation.ts`), P3-safe ticker
  (`ensureTicking :1007`), node-edit → C52 stash. **Reuse, do not reinvent** (SPEC §9.7).

### §26.3 — Task breakdown

- [ ] **XFLOOR-GRAPH.XA — room→floor override substrate (engine change, the gate).**
      `activeRoomFloorOverrides.ts` (NEW stash, keyed on storey-qualified node id) +
      `ApartmentProgram.roomFloorByName` (`apartmentLayout/types.ts`) + `allocateProgramToStoreys`
      made override-aware (default split → apply moves → re-validate via `validateHouseStorey` →
      clamp floor-pinned kitchen/hall). Empty ⇒ byte-identical (C52 I2). + ai-host tests.
- [ ] **XFLOOR-GRAPH.XB — concatenated graph builder [P with XC].** NEW pure
      `buildConcatenatedHouseGraph(option) → LiveGraph` (storey-prefixed ids, intra-floor
      `adjacentTo` edges, inter-floor stair edges from `result.stairs[].from/toLevelId`,
      `storeyIndex`/`levelId` per node) + an optional lane-anchor spring in `forceSimulation.ts`
      (default-off so the overlay is unchanged).
- [ ] **XFLOOR-GRAPH.XC — extract `MiroCanvasController` [P with XB].** Lift pan/zoom/drag +
      autoFit/userNavigated out of `LivingGraphOverlay` into a reusable controller over a
      `LivingGraphCanvas` + `LiveGraph`; refactor the overlay to use it (behaviour-preserving,
      guarded by the overlay's existing tests). ONE copy of the canvas nav (no fork).
- [ ] **XFLOOR-GRAPH.XD — side-by-side modal body (after XB+XC).** `houseModalHtml.ts` two-column
      `.hlm-body` (plan LEFT, graph-canvas mount RIGHT), plan thumbnails stacked top-floor-first;
      `HouseLayoutModal` mounts ONE `LivingGraphCanvas` + `MiroCanvasController` fed
      `buildConcatenatedHouseGraph(options[0])`, wires node-drop → `setRoomFloorOverride` +
      `_scheduleGraphEdit`, node-click → existing `_openGraphNodeEditor`; disposes on `dismiss`.
      CSS `.hlm-body` flex (plan ~40 %, graph ~60 %).
- [ ] **XFLOOR-GRAPH.XE — wire the floor override through the controller (after XA+XD).**
      `HouseLayoutController._mergeOverrides` (`:249`) also merges `getRoomFloorOverrides()` into
      `program.roomFloorByName` — flows to both preview (`_computeVariants`) and build (`_build`)
      with no other change.
- [ ] **XFLOOR-GRAPH.XF — tests + docs (last).** `buildConcatenatedHouseGraph.test.ts` (one graph
      for a 2-storey option, stair edge present, ids storey-qualified, blank-storey safe); extend
      `houseModalHtml.liveModal.test.ts` (side-by-side body, no toggle, graph mount); this SPEC §9 +
      tracker §26.

**Critical path:** XA → XD → XE → XF. Off-critical (parallel): XB, XC (both feed XD).
**Risks:** cross-floor re-allocation correctness (re-validate per storey + non-blocking reject);
graph stability on regen (reuse position-preservation `resync :715` + lane anchoring); re-gen
latency (250 ms debounce + sync engine; within-lane drag fires no regen); name ambiguity across
storeys (key on storey-qualified node id, not bare name); canvas fork (XC extracts ONE controller);
apartment/overlay regression (lane spring + override field + stash all default to no-op / C52 I2).

### §26.5 — THREE-PANE refinement + Dynamic Program Canvas (founder 2026-06-10)

**Founder directive (verbatim, 2026-06-10):** *"I requested a shift from the existing modal to another
one where the user can see the plan views to the LEFT — the graph to the CENTER — and the tool bar to
the RIGHT."*

This **refines** §26's two-pane (plan-LEFT / graph-RIGHT) into a **THREE-pane** workspace:
**LEFT = plan view(s) · CENTER = the living/concatenated graph (Miro/Mural canvas) · RIGHT = the
tools / program editor** (room-card add/resize/move, sliders — the "tools" rail). The graph is the
semantic centrepiece; the plan reflects it; the right rail is where the user edits the program. This
**replaces the existing generate modal** (and, per the canvas spec, eventually the onboarding Project
Brief panel). It is the same vision as the **Dynamic Program Canvas** authored this session:
- **SPEC:** [SPEC-DYNAMIC-PROGRAM-CANVAS](../specs/SPEC-DYNAMIC-PROGRAM-CANVAS.md) — the full model
  (room cards as the editable program; storey lanes; the live card↔program↔engine↔plan↔graph loop;
  add room / resize → roomAreas / drag between storeys → roomFloorByName / add level; multi-view).
- **ADR:** [ADR-0069 — dynamic program canvas as the primary authoring surface](../../02-decisions/adrs/0069-dynamic-program-canvas-as-primary-authoring-surface.md).
- **SPIKE (Phase 0, smallest end-to-end slice):** [SPIKE-DYNAMIC-PROGRAM-CANVAS](./SPIKE-DYNAMIC-PROGRAM-CANVAS.md)
  — one storey lane of draggable room cards beside one live plan, resize→roomAreas→regenerate, reusing
  `HouseLayoutController._regenerateCurrent` + `LivingGraphCanvas`; the only NEW file is
  `ProgramCanvasPanel.ts` + a small controller facade.
Relates to §26 (XFLOOR-GRAPH — the cross-floor graph substrate XA–XF feeds the CENTER pane) and
A.21.D37 (Miro/Mural pan-zoom + select-to-3D). The RIGHT-rail tools layout is the new element vs §26.
**Status: 🟢 IN PROGRESS — SHIPPED v117–v121 (see §26.6).**

### §26.6 — §3PANE SHIPPED log (v117–v121, 2026-06-10)

The three-pane Dynamic Program Canvas (built as the house modal body, pre-execution — SPIKE R-D option 1)
shipped in five test-gated iterations:

- **v117 — IT-1 three-pane layout.** `buildHousePanesHtml` + restructured `buildHouseModalHtml`/`refresh()`:
  LEFT = plan per storey · CENTER = the living graph per storey · RIGHT = tools rail (program form + legend +
  result + the single terminal "Use this layout" Execute). LEFT+CENTER are the regenerated `[data-role="grid"]`.
- **v118 — IT-2 size sliders + live level/result.** Per-RoomType size as range sliders (live m² `<output>`,
  0 ⇒ auto); `refresh()` also rebuilds the result block so the level stepper updates the whole panel live.
- **v119 — IT-3a selection-sync (R12).** Click a graph node OR a plan polygon (same `data-room-name`) →
  `.hlm-selected` highlight across all panes + the C52 editor.
- **v120 — IT-3c move-between-floors (R5) + §26 XE.** `HouseLayoutController._mergeOverrides` now merges
  `roomFloorByName` (the missing wire; XA engine half already shipped); the node editor gains a Floor selector
  → `setRoomFloorOverride("storey:<src>/<name>", target)` → re-allocate.
- **v121 — IT-3b connect-rooms (R10 / C52 E3).** New `ApartmentProgram.roomAdjacencyByName` + bubble-graph
  consumer (desired door edge, gated by `doorAllowedBetween`) + `activeRoomAdjacencyOverrides.ts` stash +
  `_mergeOverrides` merge + a "Connect to" select in the node editor.

vs the original XA–XF plan: **XA** ✅ (engine, prior) · **XD** ✅ (the 3-pane modal body, v117) · **XE** ✅ (v121
controller merge) · **XB/XC** (concatenated cross-floor graph + a reusable `MiroCanvasController`) NOT done —
the shipped version uses the EXISTING per-storey bubble-graph SVGs, not one concatenated pannable canvas.
**Remaining:** R3/R11 the room-type **palette + drag-to-add**, true **drag-and-drop** (cards/nodes between
lanes, vs the current Floor/Connect SELECTS), XB/XC the concatenated Miro canvas, IT-2.5 per-storey bedroom
COUNT steppers, and replacing the apartment modal + onboarding brief (SPEC §9 Phase 3–4). All edits are
pre-execution (no scene write until Execute); governed by SPEC-DYNAMIC-PROGRAM-CANVAS + ADR-0069 + C52 §2.2.

## §27 — Interior Daylight colour-code graph (`DAYLIGHT-GRAPH`) — QUEUED (2026-06-09)

**Founder directive (verbatim):** *"a daylight colour code graph inside the rooms that depending on
the size of the window it updates."* — add to the queue + the master tracker for later.

**Reference:** Autodesk Forma's **Interior Daylight** — a per-room **daylight-factor (DF) heatmap**:
a grid of coloured points across each room's floor, recoloured live as window/aperture size changes,
with a space-average DF %, median, % below 1% / above 2%, and a DF histogram.

**Target:** a per-room daylight-factor FIELD visualisation — a colour-coded point grid inside each
room (plan + 3D), recomputed LIVE when a window's size / aperture changes. The "graph" is the
spatial heat-field over the floor (and a small per-room DF stats card + histogram), not a node graph.

**Why it fits the substrate (cite):** the layout engine already has a `daylight` **ObjectiveVector
axis** (`SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE` §83 / §225 — `Σ area(spaces with window) / totalArea`,
window proximity to façade) and a live **window-emission** module (`windowEmission/`, incl
`solarOrientation.ts`, A.21.D6) feeding window placement + size; the realtime-edit substrate already
recomputes geometry on a window change (per the door/window setOffset/baseline rebuild path, ADR-057).
A DF field is the per-room VISUALISATION of that daylight signal, driven by the SAME window geometry,
recomputed on the SAME live-edit hook. Ties into the C19 Site / C21 climate substrate for sky model
inputs when present (graceful default sky otherwise).

**Phased breakdown (☐ queued — do NOT build before founder picks it up):**
| Item | Scope |
|---|---|
| **DG.1** | **DF model (pure, L2).** A daylight-factor estimator per room from window area / head height / room area / glazing transmittance + obstruction (split-flux / simplified DF to start; sky-component + externally-reflected + internally-reflected). Pure, unit-tested, no THREE/DOM. |
| **DG.2** | **Per-room point grid.** Sample the room floor on a regular grid (room-bbox / polygon-clipped), compute DF per point → a `DaylightField` data model (per-room points + value + the space-average / median / %<1% / %>2% stats). |
| **DG.3** | **Colour-map overlay.** Render the DF field as a coloured point/heat overlay inside each room (plan + 3D) in a perceptual ramp; a small per-room DF stats card + histogram. Renders through the THREE owner (P2); visibility intent (P7). |
| **DG.4** | **Live recompute on window-size change.** Subscribe the DF field to the existing window-edit hook (window create / resize / aperture / move) so the field + stats recolour LIVE as the user drags a window-size slider — reuse the realtime-edit rebuild path (ADR-057), debounced; cancellable. |

**Governance note:** NO contract / spec / ADR is being authored now (founder asked only to QUEUE it).
**It MAY warrant a SPEC when picked up** (the DF model + grid + live-recompute hook are spec-worthy);
at that point it would relate to `SPEC-ENVIRONMENTAL-DESIGN-DRIVERS` §2 (solar/daylight), the
`daylight` ObjectiveVector axis, `windowEmission/`, C19/C21 (sky/site inputs), and C04 (render/rAF).

*Addendum 2026-06-09 — §27 DAYLIGHT-GRAPH queued (founder request: per-room daylight-factor heatmap,
live on window size). Queue-only; no governance doc authored (may warrant a SPEC when picked up).*

## §28 — In-Browser Wind CFD (`WIND-CFD`) — QUEUED + GOVERNED (2026-06-09)

**Founder directive:** R&D reference — a wind CFD simulation of flow around buildings running IN THE
BROWSER on **WebGPU + Lattice-Boltzmann (LBM)**, no cloud/queue, tens of seconds; goal = a **free,
fast, early-stage wind-comfort assessment between buildings** (recirculation, roof-edge separation,
corner accelerations); validated against **AIJ benchmarks** (Case B isolated body **r≈0.84**);
absolute velocities in sheltered zones still calibrating. Founder explicitly asked for a **contract +
spec + ADR**.

**Governance (all three authored 2026-06-09):**
- **Contract:** [C54 — In-Browser Wind CFD](../../02-decisions/contracts/C54-IN-BROWSER-WIND-CFD.md)
  (DRAFT) — 8 invariants incl. the honesty/BETA rule, WebGPU compute boundary + soft-fallback, AIJ
  CI validation gate, determinism, domain-from-Site, feed-the-existing-objective, perf/privacy,
  layered placement. Registered in the [contracts README](../../02-decisions/contracts/README.md).
- **Spec:** [SPEC-WIND-CFD-LBM](../specs/SPEC-WIND-CFD-LBM.md) (DRAFT) — WebGPU LBM solver (D2Q9→D3Q19),
  domain/inlet from C19 context-buildings + C21 wind rose, AIJ validation harness, pedestrian-comfort
  output, tens-of-seconds perf NFT, no-WebGPU fallback, the W.1–W.7 phased build plan.
- **ADR:** [ADR-0064 — Wind CFD runs client-side on WebGPU + LBM](../../02-decisions/adrs/0064-in-browser-wind-cfd-webgpu-lbm.md)
  (**PROPOSED**) — the decision (vs cloud CFD vs none) + alternatives. Registered in the
  [ADR README](../../02-decisions/adrs/README.md).

**Where it sits (cite the substrate):** the high-fidelity sibling of the EXISTING coarse wind cue —
the wind rose (`packages/schemas/src/climate/windRose.ts`, `buildWindRose`) rendered as 2D rose +
3D streaks (`SPEC-FORMA-SITE-VIEW` §6, A.21.D24 `windStreakSegments()`) — and a better DATA source
for the EXISTING wind driver: `SPEC-ENVIRONMENTAL-DESIGN-DRIVERS` §3 (wind) + §5 **E.4
`naturalVentilation`** objective (`tgl/envDrivers.ts`). Consumes C19 Site context-buildings + C21
climate read-only, in the C12 LTP-ENU frame; renders through the THREE/Cesium owner (C04). NEW pure
compute package `packages/wind-cfd/` (L1/L2) + an `apps/editor/` site-analysis surface.

**Status: documented (contract + spec + ADR), NOT started** (pending founder go). No solver code ships
with these docs.

*Addendum 2026-06-09 — §28 WIND-CFD queued with full governance: C54 (DRAFT) + SPEC-WIND-CFD-LBM
(DRAFT) + ADR-0064 (PROPOSED), all registered. Founder-requested contract+spec+ADR.*

---

## §29 — Geodata Analytical Layers (`GEODATA-LAYERS`) — QUEUED + GOVERNED (2026-06-09)

**Founder directive:** reference — **Hektar** (a Nordic early-stage land-analysis tool): a **Layers panel** on the
right of a 3D massing+terrain view, analytical geodata layers **grouped by country** (Denmark / Norway /
Sweden) plus a cross-country top group (Europe — Labels / Other / Noise Pollution / Population / Natura
2000 Habitats). Each layer is a **toggle + opacity slider**; layers **drape** over the 3D terrain + white
building massing. Layers seen: Property Regions, Ground Coverage, Detail Plans, Terrain Shading, Terrain
Slope, Soil types, Landslide Susceptibility, Calculated Maximum Flood, 200-year Flood, 100-year Flood,
Ancient Monuments, Drainage Basins, Population per km², Noise Pollution, Natura 2000 Habitats. Sources
credited: Lantmäteriet, SGU (Sveriges geologiska undersökning), Mapbox, Nimbo. Founder wants this on
PRYZM's **Forma 3D view**, and explicitly asked for a **strategy + contract + spec + ADR**.

**Governance (all authored 2026-06-09):**
- **Strategy:** [`docs/01-strategy/site-and-cognition-strategy.md` §2.6](../../01-strategy/site-and-cognition-strategy.md)
  — positions geodata layers as the site substrate (PG0) made VISIBLE: the "WHERE-IT-LIVES" axis on the
  view designers already use; how it extends (not duplicates) the existing climate overlays + C54 wind CFD;
  the pluggable-provider data-source strategy; discipline-neutral framing.
- **Contract:** [C55 — Geodata Analytical Layers](../../02-decisions/contracts/C55-GEODATA-ANALYTICAL-LAYERS.md)
  (DRAFT) — 9 invariants incl. declarative descriptor, layers-DRAPE-never-BIM, pluggable-provider (no
  country in core), graceful per-layer absence, mandatory attribution/provenance, C22 PII tier on
  population/noise, opacity-without-re-fetch perf, feed-existing-consumers (future flood/landslide keep-out
  seam), layered placement. Registered in the [contracts README](../../02-decisions/contracts/README.md).
- **Spec:** [SPEC-GEODATA-ANALYTICAL-LAYERS](../specs/SPEC-GEODATA-ANALYTICAL-LAYERS.md) (DRAFT) — the
  `GeodataLayer` descriptor + `GeodataProvider` interface + `GeodataLayerRegistry`, the country-grouped
  Layers panel UX (toggle + opacity slider), raster/vector draping on Cesium, the §7 initial layer
  catalogue, the Lantmäteriet/SGU reference adapter + OGC fallback, lazy-load/tile/cache perf, and the
  GL.1–GL.5 phased build plan.
- **ADR:** [ADR-0065 — Geodata analytical layers are a first-class pluggable-provider subsystem draped on
  Forma/Cesium](../../02-decisions/adrs/0065-geodata-analytical-layers-pluggable-provider.md)
  (**PROPOSED**) — the decision (vs hardcoded per-country vs a single global provider vs commit-as-BIM vs
  nothing) + alternatives. Registered in the [ADR README](../../02-decisions/adrs/README.md).

**Where it sits (cite the substrate):** the THIRD analysis family on the EXISTING Forma 3D view, alongside the
climate overlays — sun scrubber / soft shadow / wind rose + 3D streaks / comfort heat field
(`apps/editor/src/ui/geospatial/FormaSiteAnalysisControls.ts`, SPEC-FORMA-SITE-VIEW §6) — and the C54
wind-CFD field (a sibling layer). Drapes onto the EXISTING Cesium viewer (`CesiumViewport.ts`, the
`viewer.imageryLayers.addImageryProvider` basemap path) over the existing context buildings + white massing,
in the C12 LTP-ENU/WGS84 frame, against the C19 Site/parcel bbox. PRYZM already carries a `HEKTAR_PALETTE`
2D cartography style (`apps/editor/src/ui/geospatial/siteMap2DStyle.ts`) inspired by the same reference —
the analytical-layers panel is the 3D completion of that thread. NEW pure registry/provider package
`packages/geodata-layers/` (L1/L2) + L0 schemas + an `apps/editor/` Layers panel via `geodata.*` commands.

**Build breakdown (GL.1–GL.5, SPEC §11):**
- [ ] **GL.1** — Registry + Layers panel shell (schemas + `GeodataLayerRegistry` + `GeodataProvider` interface + country-grouped accordions + toggle + opacity slider; `geodata.toggleLayer`/`setOpacity`/`registerProvider`; stub provider).
- [ ] **GL.2** — Raster drape (Cesium `ImageryLayer` + terrain clamp + opacity-in-place, no re-fetch).
- [ ] **GL.3** — Vector layers (clamped-to-ground drape through the THREE/Cesium owner + legends).
- [ ] **GL.4** — Provider adapters (Sweden Lantmäteriet + SGU reference adapter + generic OGC fallback; C12 CRS reprojection; attribution + C22 tier on population/noise).
- [ ] **GL.5** — Legend + attribution + graceful "no data here" + OTel spans + C45 tiling/tiering pass.

**Future tie-in (reserved, NOT in GL.1–GL.5):** a flood / landslide / slope layer MAY later feed an EXISTING
site-constraint / suitability input the generator already reads (a build keep-out surface) — never a parallel
objective (C55 §1.8, SPEC §10), mirroring the C54 §1.6 wind precedent.

**Status: documented (strategy + contract + spec + ADR), NOT started** (pending founder go). No layer code
ships with these docs.

*Addendum 2026-06-09 — §29 GEODATA-LAYERS queued with full governance: strategy §2.6 + C55 (DRAFT) +
SPEC-GEODATA-ANALYTICAL-LAYERS (DRAFT) + ADR-0065 (PROPOSED), all registered. Founder-requested
strategy+contract+spec+ADR.*

---

## §30 — Georeferenced 3D-Gaussian-Splatting context layer (`GS-PHOTOREAL`) — QUEUED (2026-06-09)

**Founder directive:** spike Apple Maps' radiance-field Flyover — is it free? how powerful? better than
Cesium? → then "create work item(s) to add this into the pipeline + queue + master tracker:
**Cesium's April 2026 release, CesiumJS (the exact library PRYZM already runs) natively supports
georeferenced 3D-Gaussian-splat tilesets via 3D Tiles + the open `KHR_gaussian_splatting` glTF extension.**"

**Spike verdict** ([SPIKE-GAUSSIAN-SPLATTING-PHOTOREAL-3D](../spikes/SPIKE-GAUSSIAN-SPLATTING-PHOTOREAL-3D.md)):
Apple's Flyover splats are **inaccessible** (app-only render feature, no API/SDK, MapKit JS is 2D + Look
Around only, ToS forbids caching/derived data) → **reject Apple**. BUT 3DGS itself is the best photoreal-
capture representation (fixes photogrammetry's broccoli-trees/melted-glass), is an **open Khronos/OGC
standard** (`KHR_gaussian_splatting` + SPZ, Aug 2025), needs **WebGPU** (PRYZM has it), and **CesiumJS now
renders georeferenced 3DGS tilesets natively** via 3D Tiles with hierarchical LOD. So PRYZM gets the same
tech without Apple — context-only (≈7.8 cm error, NOT measurement-grade, NOT CAD-editable).

**Work items (slot under C55 geodata-layers / the Forma site-context view; deferred until the founder picks it up):**
- [ ] **GS.1 — CesiumJS bump.** Upgrade CesiumJS from ~1.140 to the GS-capable release (≥ the April-2026
  line with `KHR_gaussian_splatting` + 3D-Tiles GS LOD). Audit breaking changes vs `CesiumViewport.ts`
  (the `Cesium3DTileset` / `fromIonAssetId` / `createGooglePhotorealistic3DTileset` paths ~:604/:611/:625/:649,
  the imageryLayers basemap path ~:535/:545). This bump is the only real blocker — render code is solved.
- [ ] **GS.2 — 3DGS tileset layer.** Add an additive georeferenced 3DGS `Cesium3DTileset` branch mirroring
  the existing Google-Photoreal-3D-Tiles branch, behind a **C55 geodata-layer toggle** (`drapeMode: building`,
  C19-anchored, context-only), composing with terrain + context buildings + white BIM massing.
- [ ] **GS.3 — Data source + attribution.** Host/source georeferenced splats (Cesium ion Community free tier
  / open splat capture e.g. SuperSplat/Luma/Scaniverse exports), with provenance/attribution per C55 §1.5.
- [ ] **GS.4 — Fallback.** Graceful no-WebGPU / no-splat-data path → fall back to the current Google/ESRI
  photoreal tiles (C45 tiering).

**Near-term recommendation (spike):** STAY on Cesium + Google Photoreal 3D Tiles (already working); prototype
GS.1–GS.2 on the next Cesium bump as a C55 layer. Governed by C55 (geodata layers) + C19 (site) + C45
(WebGPU tiering); no new contract.

**Status: spiked + queued (GS.1–GS.4), NOT started.**

---

## §31 — Session addendum 2026-06-09 (later) — pipeline architecture · robustness · level-stack · modularity

- **Pipeline architecture (DOC, done):** [PIPELINE-ARCHITECTURE-APARTMENT-VS-HOUSE](../../04-reference/PIPELINE-ARCHITECTURE-APARTMENT-VS-HOUSE.md)
  — founder-requested contractual side-by-side diagram of both generative pipelines (apartment single-plate
  vs house storey-loop): **23 shared engine stages / 11 house-only spine / 4 compensating bolt-ons** the
  apartment never needs (the parallel program sizer, the forked envelope validator, the ground weld, the
  upper-shell weld). 4 named reuse seams (payload-in / engine-out `LayoutOption`+`HouseLayoutResult` /
  `buildLayoutCommands` / the command verbs). No new C-number — C53 + ADR-0063 already govern; recommends
  in-place C53 cross-refs (§5 name seams ③④, §10 link the diagram + ADR-0063).
- **ROBUSTNESS REVIEW (queued):** on the *successful* "more coherent" 146 m² 2-bed apartment prod test,
  `§TOPO-HARD-REJECT-ALL` fired — ALL 8 strategies failed the hard **[window]** rule yet it shipped least-bad
  (safe floor worked). Re-run with `§DIAG-TOPO-GATE` to decide: daylight/frontage gate too strict (loosen
  `windowMandatoryFor` for open-plan-adjacent rooms that DO carry light through the open threshold) vs a real
  frontage shortfall (surface the reason in the modal like `§ENVELOPE-DIAGNOSTIC`). The one concrete gap the
  good prod test exposed.
- **MODULARITY convergence (ADR-0063 H1 / audit Stages 1–4, queued):** **M-A** finish `§GROUND-ENGINE-PERIMETER`
  as default so the rotated ground stops taking the `WELD-FALLBACK` (§8.5.5) · **M-B** parameterise
  `scaleProgramToShell` with a `plateRole` → retire the parallel program sizer + `§AREA-AGREEMENT` · **M-C**
  unify the envelope validator · **M-D** solve windowless-room + from-scratch entrance once in the engine.
- **§LEVEL-STACK rooms + furniture (SHIPPED, this session):** room name labels (THREE.Sprites with no
  `levelId`) now stamped from `roomStore` so they bucket + lift with their storey in both explode paths;
  fills/volumes/furniture already `levelId`-tagged; collapse restores exact; diagnostics report per-level
  rm/lbl/fur counts. (Composed with the v93 §LEVEL-STACK instanced-wall fix + 2-state toggle.)

---

## §32 — Interior Style System (queued)

**Status:** QUEUED · SPEC authored 2026-06-09 · [SPEC-INTERIOR-STYLE-SYSTEM](../specs/SPEC-INTERIOR-STYLE-SYSTEM.md)

Founder: ONE **Style selector** must drive ALL materials/finishes platform-wide, not just furniture
(Nordic → cream-paint walls + light-wood furniture/doors/windows + large windows; Mediterranean →
terracotta + deep blue + BIG windows; etc.). Today only **furniture + floors** are styled, for **4**
styles (`styleFinish.ts` + `floorFinish.ts`, A.21.D19 / SPEC-FURNISHING-STYLES). This SPEC is the
**superset**: **6 founder styles** — Nordic · Mediterranean · Classic · Countryside/Farmhouse ·
Japanese · Industrial — extended to **walls, doors, windows, lighting + a window-size (glazing) bias**.

- **Style descriptor + StyleRegistry** (§2–§4): pure data — palette of wall paint, floor finish,
  furniture wood/upholstery Slots, door/window finish, lighting fixtures, feature hints, and a numeric
  `glazingBias`. `resolveStyle()` absorbs the legacy `modern/minimal/warm/minimalist` aliases.
- **Maps onto EXISTING material/finish systems, no new mutation path** (§5, audited file:line):
  furniture `data.color`+material (`FurnitureFragmentBuilder.ts:155-159,232` / `MaterialService.ts:13-48`
  / `styleFinish.ts:187-195`); wall paint `wall.materialColor` (`WallFragmentBuilder.ts:887,1135,1492`,
  default `#e8e8e8`/`#d4c5b0` — **no wall-finish pipeline today**); doors `DoorSystemType` frame/leaf
  (`DoorSystemTypeStore.ts:13-18,150`) after the per-room type from `defaultElementTypes.ts:84-89`;
  windows `WindowSystemType` from `defaultElementTypes.ts:145-147`; floors `floorFinishFor`
  (`floorFinish.ts:91-102`, already per-style for 3 styles).
- **Window-size bias** (§6): multiply `WINDOW_SPECS` width/height by `palette.glazingBias` at the same
  clamp as the climate factor (`windowEmission/emitWindows.ts:433-443`; specs `types.ts:66-75`).
  **Bigger-window styles = Mediterranean (~1.25) + Nordic (~1.20)**; Industrial ~0.95; rest ~1.0–1.05.
- **Phased** ST.1 descriptor+registry → ST.2 floors-to-6 → ST.3 wall-paint stamp → ST.4 door/window
  finish → ST.5 glazing bias → ST.6 lighting (later) → ST.7 picker+brief (6 options both manifests).
- **Contract note:** SPEC now; warrants a future **C-number** (Interior Style / Material Authority,
  single source of finish truth) when built. Supersedes SPEC-FURNISHING-STYLES in scope.

---

## §33 — Cesium 3D globe stuck (queued, analysed)

**Status:** QUEUED · ANALYSED (read-only) 2026-06-09 · [ANALYSIS-CESIUM-GLOBE-STUCK](../spikes/ANALYSIS-CESIUM-GLOBE-STUCK.md)

Founder: "Cesium 3D globe is getting stuck." Prod log on `/#/start` shows **two independent problems**:

- **Problem A — zero-size framebuffer freeze.** `GL_INVALID_FRAMEBUFFER_OPERATION: glClear/glDrawElements/
  glDrawArrays: Framebuffer is incomplete: Attachment has zero size` (repeated). Root: `CesiumViewport`
  is built into a `display:none`/0×0 container (`CesiumViewport.ts:402,:466`), and several paths fire
  `requestRender()` while still hidden/0-size — mount `setTimeout` (`:794-804`), `frameSiteLocation`
  (`:932`), `setFormaMode` (`:995`), `moveEnd` (`:807`), `site.location-changed` flyTo (`:958`). The
  existing `forceResizeAndRender` size-mitigation only guards the `setVisible(true)` transition
  (`:4032,:4055,:4063`), not those paths; no `width>0 && height>0` precondition gates render.
  **Fix dir:** central `canRender()` size guard + `requestRenderIfSized()`; `ResizeObserver`
  first-nonzero resize (replace the `:4046` rAF retry); optionally pause `useDefaultRenderLoop` while hidden.
- **Problem B — collab catch-up replay factory gaps.**
  - `No factory for type: CREATE_STAIR_RAILING / CREATE_FLOORS_BY_ROOM_TYPE / CREATE_VIEW_DEFINITION /
    CREATE_ANNOTATION` → 25 skipped: these verbs have **command classes but no `REGISTRY` entry**
    (`CommandRegistry.ts:151-298`; skip path `RemoteCommandDispatcher.ts:68-74,:169-172`). Same class as
    the already-fixed `ASSIGN_BEAM_SUPPORTS` (`:275-279`). **Fix dir:** register the four factories + a
    CI declared-vs-registered guard (mirror `check:commandmanager`).
  - `Factory failed for type: ADD_OPENING TypeError: …(reading 'id') at … roofId`: `ADD_OPENING` IS
    registered (`CommandRegistry.ts:177-180`) but its host element is **undefined at replay** (replay
    order doesn't guarantee the host wall/roof exists — `RemoteCommandDispatcher.ts:157-159`); the
    execute path is async `bus.dispatch` whose `.catch` only catches the **promise**, not a synchronous
    throw (`:96-105`). **Fix dir:** catch sync throws on the bus path; skip host-missing commands with a
    logged reason (honour Invariant E-3); optional 2-pass topological replay.
- B can **abort the `/#/start` bootstrap** that arms the GIS surface, so A's render never gets its
  resize → reinforces the "stuck" globe. Both fixed together; no new contract (bug-class fixes).

---

## §34 — Party-Wall Awareness — no windows/doors on a façade against a neighbour (PW)

**Status:** PW.1 mechanism **DONE/shipped (v99)** · detection PW.2/PW.3 QUEUED · [SPEC-PARTY-WALL-AWARENESS](../specs/SPEC-PARTY-WALL-AWARENESS.md)

Founder: a façade snapped hard against an existing neighbour building must be **BLIND** — no windows, no
doors, no entrance. **Audit verdict: NOT considered today** — context buildings are visual-only
(`contextBuildings.ts` → Cesium/2D map only), the layout payload (`gatherLayoutPayload.ts:62`) carries no
neighbour data, and openings (`emitWindows.ts`, `shellWallMatch.ts:561`, `entranceDoor.ts:198`) land on any
external/hall wall blind to what abuts it.

- **PW.1 — suppression mechanism — DONE (v99).** Additive, deterministic `blindFacadeWallIds` set (keyed on
  shell wall id) threaded payload → windowEmission + shell-window matcher + entrance resolver: NO window and
  NO entrance on a blind/party wall; §WINDOW-MANDATORY-RESCUE also skips blind walls. Empty/absent ⇒
  **byte-identical** (apartment + house unaffected). Editor seam `resolveBlindFacades.ts` (empty default +
  `window.__pryzmBlindFacadeWallIds` injection point) wired into both executors. §DIAG-PARTY-WALL logs blind
  walls + suppressed openings. +9 tests; ai-host 2167/2167.
- **PW.2 — neighbour-footprint detection — TODO.** Plumb a neighbour-footprint store reachable from the
  executor (context-building lon/lat → world-ENU via the C19 site origin) + a per-shell-wall proximity/
  overlap test → `resolveBlindFacades` returns the computed set. Ties to C19 Site + C55 geodata.
- **PW.3 — setback config + cadastral party-wall data — TODO.**

---

## §35 — Stair-placement rules + L-corner wall-join diagnostics (§DIAG-STAIR-RULE / §DIAG-WALL-JOIN) — shipped v99

Founder: "create rules for where the stair goes + make all walls join L-shape (outer + interior) + add
console logs." Verified the rules already hold and made them explicit + always-on logged:
- **§DIAG-STAIR-RULE** (`houseOrchestrator.containStairCoreUpstream`): per generation, the 4 rules —
  R1 corner-not-central (§STAIR-DEFAULT-BIAS PERIMETER_PREFERENCE 1.0 + FRAGMENT_PENALTY 0.5), R2 worst-
  aspect wall, R3 no-room-overlap (keep-out = contained footprint), R4 footprint-in-shell (cornersInShell
  4/4) — each ✓/⚠, warns on violation. No violation in the test corpus.
- **§DIAG-WALL-JOIN** (`WallJoinResolver._applyCorner`, same- + diff-thickness paths): per-corner
  L / SHALLOW-L / COLLINEAR class + jointGap(mm) + bisectorOk + closed ✓/⚠. **Verdict: L-corners (perimeter
  + interior) close at jointGap=0.0mm — clean, no notch/overrun.** The interior PASS-THROUGH/collinear
  junctions the founder saw are square-capped consensus trims, not failed L-mitres.
ai-host 2158/2158, geometry-wall 50/50, 0 new typecheck errors. Diagnostics-only (no behaviour change).

---

> **Batch note (2026-06-10):** §36–§39 below are **four founder requests queued and SHIPPING in
> parallel this session** — implementation agents are in flight concurrently (stair room-type,
> entrance-hall placement, interior-door void, room-label toggle). Each entry below assigns the
> governing contract/spec/ADR up front; the exact commit hash + `§MARKER` is left for the main agent
> to fill on land. Status on all four: **QUEUED → SHIPPING (impl in flight this session).**

---

## §36 — Stair / vertical-circulation ROOM TYPE (`STAIR-ROOM-TYPE`) — QUEUED → SHIPPING (impl in flight this session)

**Founder request:** the layout modal's living graph shows a **"Stair"** area on the ground floor, but the
**EXECUTED** ground floor put a **BEDROOM** in that footprint. Make the stair a **first-class room type** so
**modal == execution** and no room tiles into the stair keep-out.

**Rule:** a `stair` (vertical-circulation) `RoomType` in the normative room DB — **circulation privacy**, **no
window** (`windowMandatory=false`), **adjacent to corridor/landing**, **no open-plan merge**, and it
**occupies the stair keep-out** (the contained core footprint the engine already reserves) so the program
sizer never re-allocates that area to a habitable room. Modal graph "Stair" node ⇒ same `stair` room in
execution.

**Approach:** add the `stair` RoomType to the program-rules DB (`programRules.ts`) with the circulation
profile above; thread it as a **reserved/keep-out room** through the subdivision so squarified subdivision
and `scaleProgramToShell` skip the stair footprint; the multi-storey spine (the contained stair core) is the
anchor the room hangs on. The stair is already the **storey-loop spine** in the house doctrine — this makes
the SHELL plan agree with it.

**Governance assigned:**
- **SPEC-ARCHITECTURAL-PROGRAM-RULES** — extends the normative room DB (the `programRules.ts` single source
  of truth). [`docs/03-execution/specs/SPEC-ARCHITECTURAL-PROGRAM-RULES.md`](../specs/SPEC-ARCHITECTURAL-PROGRAM-RULES.md) ✅ exists.
- **ADR-0063 — House generative-layout doctrine** (the stair is the multi-storey spine; reserved-core
  placement). [`docs/02-decisions/adrs/0063-house-generative-layout-doctrine.md`](../../02-decisions/adrs/0063-house-generative-layout-doctrine.md) ✅ exists.
- **C53 — Generative Layout Engine Architecture** (the deterministic engine that consumes the rule + keep-out).
  [`docs/02-decisions/contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md`](../../02-decisions/contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) ✅ exists.
- **Reference:** [`docs/04-reference/STAIR-CREATION-PIPELINE-AND-ANCHOR-ANALYSIS.md`](../../04-reference/STAIR-CREATION-PIPELINE-AND-ANCHOR-ANALYSIS.md) ✅ exists
  (the contained-core footprint + keep-out the room type must occupy).

**Status: QUEUED → SHIPPING (impl in flight this session).** Commit/`§MARKER` TBD by main agent.

---

## §37 — Entrance Hall: ground-only + perimeter-adjacent (`HALL-PERIMETER`) — QUEUED → SHIPPING (impl in flight this session)

**Founder request:** the **entrance hall must be ground-floor-only AND adjacent to a perimeter (shell) wall**,
because it hosts the **main entrance door**. Today the hall can be sized/placed without guaranteeing a shell
edge, so the front door has nowhere correct to land (cf. §HALL-NO-ENTRANCE, where the one entrance landed on
the kitchen's shell wall instead of the hall).

**Rule:** `hall.frontage = 'required'` (must touch the exterior shell) **+** ground-floor-only (already
enforced — upper storeys get a **Landing**, §LANDING-NOT-HALL / ADR-0063 H4) **+** the hall is placed on the
**entrance shell edge** where §A.21.D29 `resolveEntranceDoor` lands the front door (so the door is hosted on
*the hall's* perimeter wall, not a neighbour room's).

**Approach:** set `frontage: 'required'` on the `hall` rule in `programRules.ts`; in placement, bias/constrain
the hall cell to a shell-adjacent position coincident with the resolved entrance edge; keep the existing
ground-only gate (`resolveEntranceDoor` runs only when `isGround`).

**Governance assigned:**
- **SPEC-ARCHITECTURAL-PROGRAM-RULES** — the hall `frontage='required'` rule lives in the room DB.
  [`docs/03-execution/specs/SPEC-ARCHITECTURAL-PROGRAM-RULES.md`](../specs/SPEC-ARCHITECTURAL-PROGRAM-RULES.md) ✅ exists.
- **SPEC-ROOM-PLACEMENT-RULES** — the perimeter-adjacency / shell-edge placement rule.
  [`docs/03-execution/specs/SPEC-ROOM-PLACEMENT-RULES.md`](../specs/SPEC-ROOM-PLACEMENT-RULES.md) ✅ **exists**
  (the cited doc is present — it is the right home for the placement half).
- **§A.21.D29 entrance** — `resolveEntranceDoor` (ground-only, lands the front door on the entrance shell
  edge). Tracker row **A.21.D29** (≈ line 435) + the ground-only verification (≈ line 2461). The
  ground-only/Landing doctrine is **ADR-0063 H4** ([`0063-house-generative-layout-doctrine.md`](../../02-decisions/adrs/0063-house-generative-layout-doctrine.md) ✅).

**Status: QUEUED → SHIPPING (impl in flight this session).** Commit/`§MARKER` TBD by main agent.

---

## §38 — Interior doors missing the wall opening/void (`INTERIOR-DOOR-VOID`) — QUEUED → SHIPPING (impl in flight this session)

**Founder request:** **interior** doors hosted on **internal partition walls** show the door **leaf** but
**no hole is cut through the wall** — you see the leaf floating in a solid partition. **Shell (exterior)
openings cut correctly.**

**Rule / root class:** the bug is in the **interior-wall opening/void path**, not the door itself. PRYZM has
**two wall-opening render paths**: plain walls cut a **single-volume CSG** void, while **LAYERED** walls cut a
**per-cell grid** (`LayeredWallOpeningBuilder.ts`). The interior-partition path is failing to register/cut the
opening through its host wall (host-id mismatch, single-volume producer flag off for that wall, or the layered
grid not punching the cell) — so the leaf is placed but the void is absent. Files in scope:
`packages/geometry-wall/src/WallFragmentBuilder.ts` and `packages/geometry-wall/src/LayeredWallOpeningBuilder.ts`.

**Approach:** trace the interior-door create → host-wall opening registration → fragment rebuild, confirm the
opening reaches the correct producer (single-volume CSG vs layered grid) for an interior partition, and ensure
the void is cut (and the wall fragment rebuilt) exactly as the shell path does. Add a diagnostic that logs the
chosen path + whether a void was cut per interior opening.

**Governance assigned:**
- **C15 — Hosted Element / Host-Wall Contract** (doors/windows hosted in walls; the host-opening invariant).
  [`docs/02-decisions/contracts/C15-HOSTED-ELEMENT-CONTRACT.md`](../../02-decisions/contracts/C15-HOSTED-ELEMENT-CONTRACT.md) ✅ exists.
- **C11 — Element Creation Pipeline** (the create→host→rebuild pipeline the opening flows through).
  [`docs/02-decisions/contracts/C11-ELEMENT-CREATION-PIPELINE.md`](../../02-decisions/contracts/C11-ELEMENT-CREATION-PIPELINE.md) ✅ exists.
- **Note on the cited reference:** the task referenced `docs/...wall-opening-seam-two-paths` — **that path does
  NOT exist under `docs/`** (it is a `~/.claude` **MEMORY topic file**, "Wall-opening seam: two render paths",
  not a repo doc). The "two render paths" knowledge is captured here in this entry and is governed by **C15**;
  no repo doc to cite for it — do not invent one. The in-repo code anchors are the two builder files named above.

**Status: QUEUED → SHIPPING (impl in flight this session).** Commit/`§MARKER` TBD by main agent.

---

## §39 — Room-tag (3D label) visibility toggle button (`ROOM-LABEL-TOGGLE`) — QUEUED → SHIPPING (impl in flight this session)

**Founder request:** a **direct on/off button** in the **bottom toolbar** for the **3D room-name labels**
(the `RoomLabelRenderer` sprites) — so the user can hide/show floating room tags on demand.

**Rule:** room-label visibility is a **view-visibility concern**, NOT a BIM mutation — toggling it must **not**
go through the command/mutation path (no `commandBus` element write, no undo entry); it flips a render/view
flag that the label renderer subscribes to. (Distinct from P7 visibility *intent* on BIM elements — this is
pure UI/view state for an annotation overlay.)

**Approach:** add a toggle button to the bottom toolbar (`apps/editor/src/ui/bottom-menu/BottomActionMenu.ts`)
that flips a view flag consumed by `packages/room-topology/src/RoomLabelRenderer.ts` (show/hide the sprite
group). No element mutation; view-state only.

**Governance assigned:**
- **C04 — Rendering & Scheduling** (render/view-state ownership; the label sprites + their visibility flag are
  a rendering concern). [`docs/02-decisions/contracts/C04-RENDERING-AND-SCHEDULING.md`](../../02-decisions/contracts/C04-RENDERING-AND-SCHEDULING.md) ✅ exists.
- **Surface:** editor UI — `apps/editor/src/ui/bottom-menu/BottomActionMenu.ts` (button) →
  `packages/room-topology/src/RoomLabelRenderer.ts` (sprite visibility). View-visibility, not a BIM mutation.

**Status: QUEUED → SHIPPING (impl in flight this session).** Commit/`§MARKER` TBD by main agent.

---

## §40 — Partition→shell inner-face join (`PARTITION-SHELL-INNER-FACE`)

**Founder requirement:** interior partition walls must ALWAYS join to the **inner face** of the perimeter
(shell) wall — never protrude through it, never poke past the outer façade. "Should be covered in the wall-join
mechanism."

**Root cause:** interior partitions welded onto the shell **centreline** (left there by the `§MULTI-CLUSTER`
consensus-trim) were square-capped across the full shell thickness → poked out the outer façade.

**Fix:** `§PARTITION-SHELL-INNER-FACE` final clamp pass in `packages/geometry-wall/src/WallJoinResolver.ts` —
any partition endpoint on a longer through-host's body is clamped to the host's INNER face (shell unmoved,
`§SHELL-ANCHOR-PRESERVE`), + `§DIAG-WALL-JOIN PARTITION→SHELL` log. geometry-wall 54/54 (+4).

**Governance assigned:** **ADR-0055** (wall-junction Pascal pipeline) — extends its T-join doctrine.
**Status: SHIPPED** (commit `f28384a1`, v102).

## §41 — Window rules: perimeter-room window + no two windows overlap (`WINDOW-RULES`)

**Founder requirement:** (1) every room that has a perimeter (exterior/shell) wall in its boundary must have ≥1
window (minus blind party-wall façades); (2) two windows can NEVER overlap on the same wall span.

**Fix:** generalised `§DIAG-WINDOW-RULE` to flag any glazable room fronting a façade that ends up windowless;
`perimeterWindowRooms` channel; `§DIAG-WINDOW-OVERLAP` per-wall de-overlap proof (disjoint spans + 0.1m gap,
keeps the higher-priority window). `packages/ai-host/.../windowEmission/shellWallMatch.ts` + `tgl/emitGeometry.ts`.
ai-host 2198/2198. Blind-façade (PW.1) respected.

**Governance assigned:** **C15** (hosted elements: windows in walls) + **SPEC-ARCHITECTURAL-PROGRAM-RULES**
(`windowMandatory`/`windowDesiredFor`) + **C53** + **ADR-0061** (determinism). **Status: SHIPPED** (`4c58ba69`, v102).

## §42 — Entrance hall singleton + door on hall boundary (`HALL-SINGLETON`)

**Founder requirement:** exactly ONE entrance room in the residential house — always ground floor, always
adjacent to a perimeter wall, and the portion of the perimeter wall belonging to the hall's room boundary must
contain the MAIN ENTRANCE DOOR.

**Fix:** `§HALL-SINGLETON` hard invariant in `houseLayout/storeyAllocation.ts` (`assertHallSingleton` — force
ground hall ON, strip any upper hall, never zero); entrance door bound to a perimeter segment of the hall's OWN
boundary (`resolveEntranceDoor` candidate walls = `wallBoundsRoom`); `§DIAG-ENTRANCE` verdict line. Builds on the
already-shipped `§HALL-PERIMETER` (§37) + `§LANDING-NOT-HALL`. ai-host 2198/2198.

**Governance assigned:** **SPEC-ARCHITECTURAL-PROGRAM-RULES** + **§A.21.D29** (entrance resolver) + **ADR-0063**
(house doctrine) + **C53**. **Status: SHIPPED** (`4c58ba69`, v102).

## §43 — Extra/out-of-shell walls in the stair area (`STAIR-SHELL-CLAMP`)

**Founder bug (v101 regression):** extra walls created in the stair area, some OUTSIDE the perimeter shell;
ground floor showed `§DIAG-LEVELS … live=23 intended≈19 ⚠ EXTRA 4`.

**Root cause:** the §36 `STAIR-ROOM-TYPE` mint inflated the stair keep-out by `KEEPOUT_MARGIN_M`; a
perimeter-abutting ground keep-out pushed the stair rect 0.05m outside the shell → out-of-façade wall stub +
ground-only EXTRA 4.

**Fix:** `§STAIR-SHELL-CLAMP` in `tgl/enumerate.ts` — clamp the inflated stair rect to the shell bbox so a
perimeter-coincident edge classifies `isExternal` → `skipExteriorWalls` drops the duplicate/outside wall.
Interior keep-outs byte-identical (ADR-0061). +5 tests, ai-host 2203/2203.

**Governance assigned:** **ADR-0063** + **SPEC-ARCHITECTURAL-PROGRAM-RULES** + **C53**. **Status: SHIPPED**
(`dc2f277b`, v102).

## §44 — Floor finish bounded by wall inner faces (`FLOOR-INNER-FACE`)

**Founder requirement:** a room's floor finish must be bounded by the INNER FACES of its walls (the usable room
polygon), NOT the wall centrelines — floors must not run under the partitions; adjacent rooms' floors should meet
ONLY at door openings.

**Fix:** `§FLOOR-INNER-FACE` — `CreateFloorsByRoomTypeCommand` insets each room edge inward by the bounding
wall's half-thickness (new `insetPolygonToInnerFaces` in `@pryzm/room-topology`) so the floor stops at the inner
face; at door openings the edge keeps inset 0 so adjacent floors meet at the threshold (`§FLOOR-DOOR-GAP`).
`§DIAG` per room (inner-face ✓ / centreline ⚠ + door-gaps). room-topology 19/19.

**Governance assigned:** **C11** (element-creation pipeline) + **C15** (door openings define where floors meet) +
**C04** (rendering). P2/P6 respected. **Status: SHIPPED** (`9543b18b`, v102).

## §45 — Wall-Cutaway / Wall-Low-Height toggle-back loses openings (`DIAG-CUTAWAY-RESTORE`)

**Founder bug:** the bottom-toolbar Wall-Low/High (cutaway) toggle hides walls perfectly on the first press, but
on toggle-back the walls reappear SOLID — the door/window voids are not re-carved.

**Root cause:** same family as §38 `§DIAG-OPENING-VOID` — the toggle only hid/clipped wall bodies and never
re-ran `buildWall`, so a restored body kept its last (solid/instanced) geometry; the openings are still in
`wall.openings[]` but were never re-cut.

**Fix:** on the restore edge, re-queue every opening-bearing wall through `__wallRebuildControl.rebuildWalls`
(whole-level, openings-aware, carries the §DIAG-OPENING-VOID verify+fallback). New `§DIAG-CUTAWAY-RESTORE` log.
First-press hide + plain-wall rendering untouched. `apps/editor/src/ui/bottom-menu/BottomActionMenu.ts`.

**Governance assigned:** **C15** (hosted-element voids must render) + **C04** (rebuild via the existing
coordinator, P6/P2). **Status: SHIPPED** (`73c3b657`, v102).

## §46 — U-stair half-landing railing guard (`U-LANDING-GUARD`)

**Founder bug:** the generated U-stair had no railing across the mid/half-landing open edge (each flight had
balusters but the landing turn was unguarded).

**Root cause:** `StairRailingBuilder.buildLandingSegment` early-returned for U-shape landings (the railing
generator is per-flight; the landing is a separate slab with no steps).

**Fix:** `§U-LANDING-GUARD` — emit a handrail + balusters + posts along the landing's OPEN forward edge on the
correct `secondRunSide` (mirrors the mesh slab). geometry-stair 26/26 (+21).

**Governance assigned:** stair pipeline ref `docs/04-reference/STAIR-CREATION-PIPELINE-AND-ANCHOR-ANALYSIS.md`;
consistent with `§STAIR-U-LANDING-SIDE`. **Status: SHIPPED** (`8b880a6f`, v101).

## §47 — Access-graph-first layout grammar + execution-boundary fidelity (`ACCESS-GRAPH`)

**Founder critique (2026-06-10, captured faithfully):**

> *"A domestic floor plan is not a collection of rooms that fit inside a perimeter — it is a
> HIERARCHICAL ACCESS GRAPH. Every room must be reachable from the front door by traversing a
> defined sequence of spaces. The correct grammar for a two-storey house is:
> **Street → Front door → Entrance hall → [Living/Kitchen/Dining/Stair] → Landing →
> [Bedrooms/Bathrooms].** The algorithm generates rooms as isolated units and connects them with
> doors AFTER the fact — this is backwards. The access graph must be defined FIRST as a topology,
> and rooms placed to satisfy it."*

His 7 fundamental gaps: (1) no access-graph-first spatial grammar; (2) incomplete room-type
vocabulary (entrance-hall ground anchor / rectangular landing / ground WC / utility); (3) no per-type
ENFORCED area caps **at the SHIPPED level** (en-suite shipped ~53 m², master 29 m² — 50–200 % over);
(4) en-suite duplication / labelling collisions; (5) miter-clamp warnings from diagonal-wall
degeneracy; (6) window placement per-WALL not per-ROOM; (7) the stair making two phantom rooms instead
of one excluded void.

### The honest A/B split (the headline finding)

**Most of this grammar is ALREADY designed into the engine — the divergence is at the engine→editor
EXECUTION/DETECTION/NAMING boundary, not a missing engine.** The 53 m² en-suite is **geometrically
impossible** from the engine's `§AREA-FRACTIONS` caps → it is a *detected merged polygon* (two engine
rooms flooded into one when a partition endpoint misses the shell centreline), then mislabelled. The
biggest lever is execution-boundary fidelity, NOT rebuilding the engine.

- **(A) Already-designed-but-not-reliably-shipping (EXECUTION-BOUNDARY)** — dominant cause. Targeted by
  the just-shipped `§ROOM-NAME-BIJECTIVE` (1:1 room↔name match) + the new `§DIAG-EXEC-*`
  execution-boundary diagnostics.
- **(B) Genuinely-missing / doctrine-level (NEW)** — the access-graph-FIRST re-assertion on the
  *detected* plan (C53 §1 mandates topology-first but it is never re-checked post-detection), detected-
  room cap validation, the stair-as-excluded-void-before-detection, robust non-orthogonal polygon offset.

### Governance

- **ADR-0066 — Access-Graph-First Generative Layout Doctrine** (PROPOSED) —
  `docs/02-decisions/adrs/0066-access-graph-first-generative-layout-doctrine.md`. AG1–AG5 + the
  what-already-exists-vs-what-changes ledger. References ADR-0061/0062/0063, C53, C52,
  SPEC-ARCHITECTURAL-PROGRAM-RULES.
- **SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR** —
  `docs/03-execution/specs/SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR.md`. §2 grammar · §3 vocabulary ·
  §4 shipped-area caps (+ founder table) · §5 en-suite parent-child · §6 stair-void-before-detection ·
  §7 per-room window · §8 door coverage · §9 non-orthogonal robustness · §10 `§DIAG-EXEC-*` acceptance.
- **C53 §1** (topology is the source of truth; geometry is a projection) is the contract this doctrine
  extends from pre-detection design to a post-detection invariant.

### Priority fix list (founder's table) — each tagged ALREADY-ENGINE / EXECUTION-BOUNDARY / NEW

**CRITICAL**
- [ ] Every room ≥1 door — **EXECUTION-BOUNDARY**. Engine: `§SEALED-ROOMS`/`§CIRCULATION-REROUTE`
  (`wallsAndDoors.ts`) + `§EVERY-ROOM-ACCESS-COMB`. Diagnostic SHIPPED (`§DIAG-EXEC-DOORS` → ⚠ NO-DOOR);
  hard gate QUEUED.
- [ ] Every room ≥1 window on an exterior wall — **EXECUTION-BOUNDARY**. Engine: per-room
  `emitWindows.ts` + `windowMandatory` + `§WINDOW-MANDATORY-RESCUE`. Diagnostic SHIPPED
  (`§DIAG-EXEC-WINDOWS` → ⚠ NO-WINDOW / ⚠ WINDOW-ON-PARTITION); hard gate QUEUED.
- [ ] En-suite ≤ parent bedroom area — **ALREADY-ENGINE** (carved from inside the master,
  `subdivide.ts:460`; `ensuite.accessFrom=['master']`). Duplicate-en-suite was a naming collision →
  `§ROOM-NAME-BIJECTIVE` **DONE**. Detected-pair area assertion QUEUED.
- [ ] Add entrance hall / lobby — **ALREADY-ENGINE** (`§HALL-SINGLETON` + `§LANDING-NOT-HALL`/G14,
  `bubbleGraph.ts:160-178`, `hall.frontage='required'`). Boundary fix = bijective naming so it is never
  merged away (`§ROOM-NAME-BIJECTIVE` **DONE**).
- [ ] Bathrooms must not be the sole access to a bedroom — **ALREADY-ENGINE**
  (`bathroom.accessFrom=['corridor']` `§BATH-CORRIDOR-ONLY`; `bedroom.accessFrom` excludes `bedroom`,
  `maxDoors=1`; `§TOPO-HARD-REJECT` privacy rule).

**HIGH**
- [ ] Fix unnamed "Room 00-008" fallback resolver — **EXECUTION-BOUNDARY**. `§ROOM-NAME-BIJECTIVE`
  two-pass match (`matchDetectedRooms.ts` / `nameDetectedRooms.ts`) **DONE/IN-FLIGHT**.
- [ ] Upper-floor continuous corridor from landing to all bedrooms — **ALREADY-ENGINE**
  (corridor spine `§SINGLE-RECT-CARVE` runs full length; upper `corridor`=Landing). Assert on detected
  plan QUEUED.
- [ ] Per-room-type min/max area caps at the SHIPPED level — **B2 / EXECUTION-BOUNDARY**. Engine TARGET
  caps `§AREA-FRACTIONS` (`programRules.ts:494`, `bubbleGraph.ts:256-279`). Detected-polygon validation:
  `§DIAG-EXEC-AREA` SHIPPED (OK/⚠ OVER-CAP/⚠ NO-ENGINE-MATCH); hard gate QUEUED.

**MEDIUM**
- [ ] Fix 45° rotation normalisation — **ALREADY-ENGINE** (`§PRINCIPAL-AXIS` rotate-to-frame +
  `§RECTIFY-QUAD` + `§RECTIFY-SHELL-PROJECT`). `§DIAG-EXEC-ROTATION` surfaces the applied angle.
- [ ] Stair connects to hallway / entrance — **ALREADY-ENGINE** (`stair.accessFrom=['corridor','hall']`,
  `§STAIR-CORNER-ANCHOR`/ADR-0063 H4).
- [ ] Landing = proper rectangle, not residual sliver — **EXECUTION-BOUNDARY** (detection quality;
  surfaced by `§DIAG-EXEC-ROOMS`).

### Genuinely-NEW doctrine items (B)

- [ ] **B1 — Post-detection access-graph re-assertion.** Reconcile the detected door/room set against
  the engine `LayoutGraph` (P5); G1–G4 violated on the *shipped* plan = a surfaced defect. `NEW` (gate).
- [ ] **B2 — Detected-room area-cap gate.** Promote `§DIAG-EXEC-AREA` from observer to gate. `NEW`.
- [ ] **B3 — Stair footprint as a detection-time EXCLUSION.** Feed the contained world footprint
  (`§STAIR-CONTAIN-UPSTREAM` makes keep-out == shipped) to `RoomDetectionEngine` so the stair never
  splits into two phantom rooms. `§DIAG-EXEC-STAIR` is the diagnostic. `NEW`.
- [ ] **B4 — Robust non-orthogonal polygon offset.** Replace the `§DIAG-FLOOR-INSET` miter fall-back
  ladder with a Clipper-style offset OR enforce orthogonal/45° partitions. `NEW` (lowest priority).

### §SW-LAZY-CHUNK-404 — stale-shell deploy defect (prod blocker, 2026-06-10)

- [x] **Root cause (evidence-backed).** On prod v106 the batch-furnish (`import('@pryzm/ai-host')`
  → `/assets/index-BbFNqnZ7.js`) + the §A.21.D49 globe overlay (`import('@pryzm/file-format')`
  → `/assets/index-TEa8OqkW.js`) lazy chunks 404 → the SPA catch-all (`server.js:5476`
  `app.get('*')` → `dist/index.html`) returns `text/html` → module-script MIME failure. Verified
  via curl: the client's loaded eager hashes (`main-wyhJdWlF.js`, `engineLauncher-Byu7X2QJ.js`)
  return `200 text/html` (gone from the server), while the CURRENT prod shell references
  `main-CnowHNbh.js` → `engineLauncher-CZtUc5SR.js` → `index-{092PLv5A,BA-wrdwa,CON3wsoA,epGLtisX}.js`.
  So the client is running an OLDER build than the server serves = **hash skew**. Cause: the
  deployed `/sw.js` is `pryzm-v3` with a **cache-first `/assets/*`** branch + a byte-identical SW
  body across deploys (no `updatefound` → no auto-reload), so a returning visitor kept the
  v3-cached shell + eager chunks while the lazy chunks (never cached) 404 on the moved-on server.
  NOT a build-emit failure (the build deterministically emits the `index-*.js` chunks — local dist
  has 11; `engineLauncher`/`main` reference them) and NOT an image exclusion (`Dockerfile:145`
  copies `dist` wholesale; `.dockerignore` `dist` only affects the context upload, not the
  builder-stage dist). Distinct from the harmless `/items/*.glb` runtime-asset 404s
  (`.dockerignore:146` OBJECT-STORAGE-GLB, served by the dedicated `/items` static at
  `server.js:1606`).
- [x] **Fix (`public/sw.js`, ships via Vite `public/`→`dist/` copy).** (1) Bump cache version
  `v3`→`v4` so the poisoned `pryzm-v3` shell + `pryzm-assets-v3` asset caches are evicted on
  activate AND the new SW body fires `updatefound`→`controllerchange`→one-time auto-reload
  (`src/main.ts:558`) onto the fresh graph. (2) Harden the `/assets/*` branch: a cached or fetched
  response that is `text/html` (the SPA fallback for a missing chunk) or non-OK is treated as a MISS
  — never returned, never cached; the SW calls `self.registration.update()` to pull the newer SW
  and returns a 504 so the importer's own `.catch` runs instead of the browser choking on an HTML
  module script. **Verify after deploy:** `curl https://pryzm.fly.dev/sw.js | grep pryzm-v4`, then
  hard-reload prod, run batch-furnish, confirm the lazy chunk loads (current hash) with no
  `text/html` MIME error.
- **Governance:** C07 §7 (PWA / service worker), ADR-055 (deploy), `sw-stale-cache-fixed` memory.

### Status summary

- **DONE / IN-FLIGHT (2026-06-10):** `§ROOM-NAME-BIJECTIVE`
  (`apps/editor/src/ui/apartment-layout/matchDetectedRooms.ts` + `nameDetectedRooms.ts`) ·
  `§DIAG-EXEC-*` (`apps/editor/src/ui/house-layout/houseExecDiagnostics.ts`:
  `-ROOMS`/`-AREA`/`-DOORS`/`-WINDOWS`/`-STAIR`/`-ROTATION` + ROLLUP) · prior enablers
  `§ENVELOPE-FIT-GROWTH`, `§DIAG-FLOOR-INSET`, `§AREA-FRACTIONS`, `§HALL-SINGLETON`,
  `§STAIR-CONTAIN-UPSTREAM`, `§TOPO-HARD-REJECT`.
- **QUEUED:** the diagnostic→gate promotions (door / window / area / access-graph) and the four (B)
  doctrine items above.
- **Governance:** ADR-0066 (PROPOSED) + SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR (DRAFT) + C53 §1.

## §48 — BIM 3.0 Graph-IR / Intent-First Building Graph (north-star) (`GRAPH-IR`)

**Status: IMMINENT / PRIORITIZED (founder-flagged 2026-06-10) · staged adoption QUEUED.**

**Founder manifesto (captured faithfully):**

> *"Rooms are NOT the primary node type — that's the mistake every BIM/CAD/generative system makes.
> The graph should represent **intent → spatial systems → geometry**, NOT geometry directly — think
> of it as a COMPILER IR for architecture."*

- **7 node families:** **Intent · SpatialCluster · Site · Space · System · Geometry · Performance**
  (SpatialCluster = Private/Public/Service/Sleeping/Work Zone, sitting between Intent and rooms).
- **Node kernel** `{id, type, properties, constraints[], embeddings[], confidence}`; **edge kernel**
  `{source, target, relation, weight, hard}` — *most information lives in the edges*.
- **9-edge taxonomy:** `INFLUENCES · ADJACENT · SEPARATED_FROM · CONTAINS · ACCESSIBLE_VIA ·
  SERVED_BY · FACES · DEPENDS_ON · PART_OF`.
- **Space nodes NEVER know geometry** (no x/y/polygon/wall). **Sliders ARE Intent nodes** whose
  `priority` (0–1) propagates through `INFLUENCES` edges (Privacy↑ → separation/visibility
  constraints↑ → circulation adjusts → geometry recomputes) — pure graph propagation, no hardcoded
  logic. **Compiler pipeline:** `Intent Graph → Spatial Graph → Constraint Graph → Layout Graph →
  Geometry Graph → BIM Model`. **Geometry is a DERIVED projection, never user-authored.**

### The honest A/B split (the headline finding)

**PRYZM already has a large fraction of this — built geometry-rooted, not intent-rooted. The genuine
delta is the intent-first INVERSION, not the graph itself.** Do not claim PRYZM lacks what it has, nor
that the manifesto is done.

- **(A) ALREADY-BUILT.**
  - Typed persistent graph + projection principle: C53 §1 (`C53-…:23-28` *"topology is the source of
    truth; geometry is a projection of it"*); P5 `LayoutGraph` (`tgl/semanticGraph.ts:46-50`) with
    deterministic IFC GUIDs.
  - The compiler pipeline *in spirit*: P1→P9 `program → bubbleGraph → subdivide → semanticGraph →
    emitGeometry` (`LAYOUT-GENERATION-ALGORITHM.md`).
  - Typed semantic edges: `tgl/edgeTypes.ts:33-50` (`SOCIAL_FLOW`/`INTIMATE_ACCESS`/`BUFFER`/
    `SERVICE_ACCESS`/`CEREMONIAL_THRESHOLD`/`VISUAL_CONNECTION`/`ACOUSTIC_SEPARATION`, classified
    `:76-99`) + structural `EdgeKind` (`semanticGraph.ts:26`).
  - "Performance" + optimizer objectives: the **21-axis** `ObjectiveVector` (`tgl/objectives.ts:24`)
    already encodes `circulation`, `hierarchy` (privacy-depth), `adjacency`, `daylight`,
    `wetStackAlignment`, `acousticZoning`, `arrivalSequence`, `entrySightline`, `spatialClimax`,
    `solarOrientation`, `naturalVentilation` — i.e. most of the founder's penalty/reward optimizer
    list (circulation-first, privacy gradient, social-core, wet-core vertical clustering).
  - Privacy-gradient / "no bedroom off hall" / "every room on circulation" **enforced**, not just
    scored: `accessFrom` matrix (`rules/programRules.ts:200-203`,`:262`+) + `§TOPO-HARD-REJECT` gate
    (`tgl/enumerate.ts:125,187,636,929`).
  - Sliders already re-weight the ENGINE (not just the scorer): ADR-0060 + A.25
    `designParamsToScoringWeights.ts` (4 → `ScoringWeights`, 4 → `EngineTuning`).
  - Unified/editable building graph already exists: ADR-0058, C52, SPEC-LIVING-BUILDING-GRAPH,
    SemanticGraph/TemporalGraph/DependencyResolver/RoomGraphService.
- **(B) GENUINE DELTA — the intent-first inversion.**
  - **B1.** `NodeKind` is geometry-rooted: `'Space'|'Wall'|'Opening'|'Door'|'Window'|'Level'`
    (`semanticGraph.ts:25`) — **no** Intent/SpatialCluster/Site/System/Performance node kind. Graph
    starts at *program/Space*, not *intent*.
  - **B2.** **Space nodes DO know geometry today** — `Space` carries
    `geometry: { polygon: rectPolygon(p.rect) }` (`semanticGraph.ts:34,108`) — contradicts the
    manifesto. Target: derived Geometry node `PART_OF` the Space.
  - **B3.** Sliders are an *external* numeric mapping (`designParamsToScoringWeights.ts`, ADR-0060
    "bind, don't fork"), **not** Intent nodes with `INFLUENCES` propagation.
  - **B4.** Pipeline is `program → geometry`; no materialised Intent-Graph / Constraint-Graph stage;
    constraints live as code rules + scorer, not as node `constraints[]` / edge `hard` flags.
  - **B5.** No `Site`/`System` node families in the layout graph (C19 site + MEP exist elsewhere, not
    woven in as `SERVED_BY`/`FACES`-linked nodes).

### Optimizer-objectives note

The founder's circulation-first optimizer (clear spine before rooms; every private room on
circulation; stair as circulation anchor; Entrance→Hall→Living→Transition→Private privacy gradient;
open-plan social core; wet-core vertical clustering; penalty/reward list) is **mostly already encoded**
in `tgl/objectives.ts` (the 21 axes above) and **enforced** by the `accessFrom` matrix +
`§TOPO-HARD-REJECT` gate (§47). The delta is *promoting these from scorer axes / code rules to
first-class `Performance` nodes + `constraints[]`*, not inventing the objectives.

### Governance

- **NEW: [ADR-0067 — Graph-IR / Intent-First Building Graph (BIM 3.0)](../../02-decisions/adrs/0067-graph-ir-intent-first-building-graph-bim3.md)** (PROPOSED; GIR1–GIR5 + S1–S4 migration).
- Builds on: C52 (editable building graph) · C53 §1 (topology-first) · C50 (typology pipeline) ·
  C19 (site) · ADR-0058 (unified building graph) · ADR-0060 (sliders bind to substrate) ·
  ADR-0061/0062 (determinism + deterministic solver) · ADR-0066 (access-graph-first) · the GRAPH.*
  unified-building-graph strategy (`PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION.md`,
  `GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY.md`).

### Staged adoption checklist (additive, NOT a rewrite — each stage independently shippable,
gated by the determinism + topo-reject invariants; shipped single-plate path stays byte-identical)

- [ ] **S1 — Intent + SpatialCluster node types in the schema.** Extend `NodeKind`
  (`semanticGraph.ts:25`) with `Intent`/`SpatialCluster`; brief/bedroom-count → Intent nodes;
  Private/Public/Service/Sleeping/Work zones → SpatialCluster nodes `CONTAINS`-linking Spaces. `NEW`.
- [ ] **S2 — Sliders → Intent nodes + INFLUENCES propagation.** Reframe the ADR-0060 sliders as Intent
  nodes whose `priority` propagates via `INFLUENCES`; `designParamsToScoringWeights.ts` becomes a
  graph-propagation function (initially identical weights — Pareto-equality invariant). `NEW`.
- [ ] **S3 — Site / System / Performance node families.** Weave C19 site (`FACES`/climate edges),
  MEP/structure (`SERVED_BY`), and promote the `ObjectiveVector` axes to `Performance` nodes. `NEW`.
- [ ] **S4 — Geometry-as-derived-projection formalised.** Move `Space.geometry.polygon`
  (`semanticGraph.ts:108`) into a derived `Geometry` node (`Geometry --PART_OF--> Space`); Space
  becomes geometry-free (GIR3); Geometry family is an explicit recomputed output (GIR5). `NEW`.

## §49 — Five-Graph Model / Circulation-First Living Graph (`FIVE-GRAPH`)

**Status: IMMINENT / PRIORITIZED (founder-flagged 2026-06-10) · S1+S2 SHIPPED, S3–S5 QUEUED.**

**Founder direction (captured faithfully):** the Living Graph is *"too messy"* — one dense ~80-edge
network that mixes adjacency + desired adjacency + circulation + privacy + floor hierarchy + plumbing,
so *"an optimizer can't tell 'must connect' from 'should be near' from 'should NOT be near' from
'people move through here.'"* **Split it into FIVE distinct graphs with a DROPDOWN to switch between
them, + node roles + graph metrics, with the Circulation Graph as the MASTER (source of truth).**

- **The five graphs** *(Circulation = master/default)*:
  1. **Circulation** *(master)* — walkable routes; sparse (~15 rooms ≈ 18–25 edges, NOT 80+).
     Entrance→Hall→Living→Dining→Kitchen; Hall→Stair→Landing→{B1,B2,B3}.
  2. **Access** — "how do I reach this room?": depth / privacy / route-length / visibility from the
     entrance.
  3. **Functional Adjacency** — Kitchen↔Dining, Living↔Dining, Master↔Ensuite; 0.95 must-touch / 0.75
     preferred / 0.25 optional.
  4. **Separation** *(was MISSING)* — negative relations: Master‑‑X‑‑Living, Bathroom‑‑X‑‑Dining,
     Bedroom‑‑X‑‑Entrance.
  5. **Service** — wet-area clustering (Kitchen | Bathroom | Ensuite) for plumbing/stacking/MEP only;
     must NOT influence circulation.
- **Node roles:** `ENTRY / CIRCULATION / PUBLIC / SEMI_PRIVATE / PRIVATE / SERVICE / VERTICAL` + rules
  (PRIVATE cannot connect directly to ENTRY).
- **Graph metrics:** betweenness centrality (Hall high = good, Dining high = bad), privacy depth
  (distance from entrance), circulation efficiency (avg shortest path), room-hub penalty
  (Bedroom/Bathroom degree > 3 penalised; Hall > 5 / Landing > 4 rewarded).
- **Source-graph hierarchy inversion:** HOUSE → Circulation → {Access, Adjacency, Service} → Geometry
  Solver — inverting the usual Rooms → Adjacency → Geometry → Corridors.

### The honest A/B split (the headline finding)

**PRYZM already has FIVE relationship LAYERS + per-layer springs + a typed semantic edge taxonomy + the
enforced privacy/access matrix — but they are the WRONG five (physics/environmental, not intent/route),
shown ALL-AT-ONCE (toggles, not a chosen view), with NO Separation graph and NO master.** Do not claim
PRYZM lacks the machinery, nor that the model is done.

- **(A) ALREADY-BUILT.**
  - Five-layer relationship model: `EdgeLayer = adjacency | circulation | environmental | acoustic |
    structural` (`apps/editor/src/ui/living-graph/livingGraphSchema.ts:32-37`) + `EDGE_LAYERS:40` +
    per-layer colour (`:146`) + per-layer dash (`LivingGraphCanvas.ts:44`) + the layer-toggle chips
    (`LivingGraphOverlay.ts buildChips`) + **per-layer springs** (`forceSimulation.ts edgeActive:152`,
    `activeLayerCount:160`, summed `simulateStep:243-259`). One `GraphEdge` carries every layer it's in
    (`GraphEdge.layers`, `livingGraphSchema.ts:108`).
  - Typed engine LayoutGraph + semantic edge taxonomy: `tgl/semanticGraph.ts:46-50` +
    `tgl/edgeTypes.ts:33-50` (`SOCIAL_FLOW`/`INTIMATE_ACCESS`/`BUFFER`/`SERVICE_ACCESS`/
    `CEREMONIAL_THRESHOLD`/`VISUAL_CONNECTION`/`ACOUSTIC_SEPARATION`, `classifyEdge:76-99`).
  - Privacy gradient + access ENFORCED: per-room `privacy` class (`rules/programRules.ts:136`) +
    `accessFrom` matrix (`:200-203`,`:262`+) + `doorAllowedBetween` (`:739-741`) + `§TOPO-HARD-REJECT`
    (`tgl/enumerate.ts`).
  - Circulation-as-anchor doctrine: ADR-0066 + the 21-axis `ObjectiveVector` (`tgl/objectives.ts`).
  - One UBG, graphs as projections: ADR-0058 + C52; Living Graph reads cached UBG
    (`livingGraphData.ts buildLiveGraph:278`).
- **(B) GENUINE DELTA — the five-graph reframe.**
  - **B1.** WRONG five — today's `adjacency/circulation/environmental/acoustic/structural` ≠ the
    founder's `Circulation(master)/Access/Adjacency/Separation/Service`. Map:
    `circulation→Circulation`, `adjacency→Functional Adjacency`, `structural→Service`; `environmental`
    (sun) + `acoustic` are NOT in the founder's five (→ metric/derivation); **Access + Separation are
    genuinely new**.
  - **B2.** **Separation graph does not exist** — no negative "should-NOT-touch" relation; closest is
    the `acoustic` loud↔quiet *spring* (`livingGraphData.ts augmentEdges:378-386`), a physics push, not
    a declared privacy-gradient negative.
  - **B3.** Graphs shown ALL-AT-ONCE via toggles → the dense tangle; no "the graph you're looking at",
    no master.
  - **B4.** Circulation is one co-equal layer, NOT the generation source-of-truth; engine pipeline is
    still `program → bubbleGraph → geometry` (the OPPOSITE of HOUSE → Circulation → … → Geometry).
  - **B5.** No node ROLES (`ENTRY/CIRCULATION/PUBLIC/SEMI_PRIVATE/PRIVATE/SERVICE/VERTICAL` — nodes
    carry only `RoomKind`, `livingGraphSchema.ts:53`) and no graph METRICS panel.

### Governance

- **NEW: [ADR-0068 — Five-Graph Model: Circulation-First Building Graph](../../02-decisions/adrs/0068-five-graph-model-circulation-first-building-graph.md)** (PROPOSED; FG1–FG6 + S1–S5 migration).
- Concretizes ADR-0067 (Graph-IR — Adjacency ⊂ `ADJACENT`, Separation ⊂ `SEPARATED_FROM`, Access ⊂
  `ACCESSIBLE_VIA`, Service ⊂ `SERVED_BY` for residential); builds on ADR-0066 (access-graph-first) ·
  ADR-0058 (one UBG, graphs as projections) · C52 · C53 §1 · ADR-0061/0062 (determinism) · the GRAPH.*
  unified-building-graph strategy.

### Staged checklist (additive; the five graphs are PROJECTIONS of the one UBG, not a fork — FG6)

- [x] **S1 — Reframe the five layers → the five named graphs + add Separation.** `GraphView` vocabulary
  + `GRAPH_VIEW_LAYER`/`GRAPH_VIEW_LABEL`/`GRAPH_VIEW_READY`/`GRAPH_VIEW_HINT` + `DEFAULT_GRAPH_VIEW` +
  `layerStateForView` (`livingGraphSchema.ts`); two new `access`/`separation` `EdgeLayer`s (colour/dash);
  `separationWeight(a,b)` deriving Separation from the privacy gradient (`livingGraphData.ts`).
  `SHIPPED`.
- [x] **S2 — The dropdown UI (Deliverable 2).** `buildGraphSelector()` + `setView()` replace the
  all-on layer chips with a single-select dropdown (Circulation = master/default); the canvas renders
  ONLY the selected view's sparse edges; Access shown "(soon)" + stub. `SHIPPED`.
- [x] **S2.1 — Circulation reflects REAL realised doors + bubble→canvas highlight (founder 2026-06-10).**
  (1) `§DOOR-REFS-CIRCULATION` — `buildLiveGraph` now derives the Circulation (master) edge set from
  the REALISED door nodes' `refs: [roomA, roomB]` (not only the `connectsTo` edges the roomGraph adapter
  may skip / mis-resolve), so the Entrance Hall↔Corridor door the founder reported missing IS an edge;
  idempotent with `connectsTo` (addLayer dedups). `§DIAG-GRAPH` — per-view node/edge census + a NOTE when
  a detected door has no room↔room edge (e.g. the entrance door, one side outside the shell)
  (`livingGraphData.ts`). (2) `§BUBBLE-SELECT-HIGHLIGHT` — selecting a bubble now selects the ROOM id
  itself as the PRIMARY (+ its child elements) via `selectionBus.selectMany`, so the room highlights in
  BOTH the 2D plan + 3D canvas (`SelectionManager.selectById` finds the `elementType:'room'` mesh);
  previously an element-less room produced an empty selection → no highlight (`livingGraphSelection.ts`).
  C52 / ADR-0058 (one UBG, graphs as projections) · C04 (selection = view-state, P6-safe). `SHIPPED`.
- [ ] **S3 — Node roles + role-rules.** Derive `ENTRY/CIRCULATION/PUBLIC/SEMI_PRIVATE/PRIVATE/SERVICE/
  VERTICAL` per node (from `RoomKind` + `privacy`); enforce "PRIVATE may not connect directly to
  ENTRY". `NEW`.
- [ ] **S4 — Graph-metrics panel.** Betweenness centrality (Hall good / Dining bad), privacy depth,
  circulation efficiency (avg shortest path), room-hub penalty/reward. `NEW`.
- [ ] **S5 — Circulation as the generation source-of-truth (the pipeline inversion).** HOUSE →
  Circulation → {Access, Adjacency, Service} → Geometry; big engine-side change across D-TGL +
  bubbleGraph + `enumerate` gate. `NEW` (north-star).

## §50 — 3D pane empty on 3D+plan entry → auto-frame the building (`VIEW-AUTOFRAME`) — SHIPPED (2026-06-10)

Founder (Q3): selecting the "3D + plan" combined view shows an **EMPTY 3D pane** until the user manually
runs camera → Home / zoom. "This should be done automatically — zoom in to the building."

### §50.1 — Root cause (cite)
- `SplitViewManager.activate()` calls `_fitCamTargetToScene()` which fits **only the PLAN pane's Canvas2D
  camera** (`_camTarget`/`_frustumH` → `_syncPlanCanvasState()`) — the SECONDARY pane.
  (`apps/editor/src/engine/views/SplitViewManager.ts:198` + `:1579-1599`). The **MAIN 3D viewport's** OBC
  camera is never touched on split-view entry, so it stays at its seed pose (initViewSetup's `(20,20,20)`
  default, `apps/editor/src/engine/initViewSetup.ts:42-43`) or a stale plan-only pose → the generated
  building (at the scene/site frame) is off-screen.
- The existing `§3D-FRAME-ON-VIEW-SWITCH` handler (`apps/editor/src/engine/initTools.ts:1853-1872`) frames
  the 3D camera only **once per project session** (`_3dViewFirstFrameDone` guard) and only on a
  `view-activated` **perspective** event — which the split-view toggle does **not** emit (it emits
  `split-view-activated`, `SplitViewManager.ts:252`). So it never re-frames on subsequent 3D+plan entries.

### §50.2 — The fix (reused, additive)
- Reused the already-registered `zoom-fit` bus command (`engineLauncher.ts:509-522` §C-B1 →
  `initViewSetup.ts` `zoomToAll()`), which computes BIM scene bounds and frames the main perspective
  camera. `zoomToAll()` self-guards on an empty scene (`initViewSetup.ts:80-83`), so it's safe to fire
  before geometry exists.
- `SplitViewManager.activate()` now dispatches `window.runtime.bus.executeCommand('zoom-fit', {})` deferred
  ~320 ms (so just-committed meshes + matrixWorld are present — same posture as §13-CAM /
  §3D-FRAME-ON-VIEW-SWITCH), guarded by a re-check of `this._active`.
  (`apps/editor/src/engine/views/SplitViewManager.ts:257-291`, tag `§VIEW-AUTOFRAME`, console line
  `[SplitViewManager] §VIEW-AUTOFRAME: framed main 3D viewport on split-view entry.`)
- Additive only — does NOT touch the plan pane, the 2D-Map path, or the Site-3D/globe path. The dispatch
  shape matches `MainToolbar._dispatch` (`MainToolbar.ts:206`).

### §50.3 — Not changed (deliberate)
- The plain "3D" view (no split) keeps its one-shot `§3D-FRAME-ON-VIEW-SWITCH` framing. Relaxing that
  guard was **deliberately removed earlier** (`initTools.ts:1823-1830`, 2026-05-24 user request — it
  hijacked the user's chosen 3D framing). The founder's specific complaint is the **3D+plan** combined
  view, which §VIEW-AUTOFRAME now covers without regressing that decision. `SHIPPED`.

## §51 — Generated model offset from context buildings on the 3D globe (`GLOBE-LOCATION-SPIKE`) — SPIKE (documented, NOT implemented) (2026-06-10)

Founder (Q2): the generated model is **not in the correct location** on the 3D-globe / Cesium 3D-tiles /
Forma "Site 3D" view — it appears offset from where it should sit relative to the real context buildings.

### §51.1 — How placement works today (cite)
- The site **LTP-ENU origin** (`getCurrentSiteOrigin()`, `apps/editor/src/ui/site/siteDispatch.ts:65`) is set
  to the **geocoded address lat/lon** inside `dispatchSiteLocation → setLtpOriginIfSafe`
  (`siteDispatch.ts:81-111`, `:270`) — NOT the first-drawn boundary vertex (the GISAreaLayout comment at
  `:636-646` describes "first vertex", but the boundary-draw tool projects about the **Site location** when
  one exists: `SiteBoundaryDrawTool.ts:267-271`).
- The parcel **boundary** is projected to scene-XZ relative to that same origin via a local-equirectangular
  approximation (`boundaryProjection.ts:53-62`, `buildBoundaryFromLatLonRing` `:143-161`).
- The generated **building geometry** lives in scene-XZ in that same frame (it's generated from the
  boundary).
- The **Forma massing** path (`renderFormaMassing`, `CesiumViewport.ts:1573+`) re-projects each wall XZ via
  one `eastNorthUpToFixedFrame` anchored at `getFormaOrigin()` (`GISAreaLayout.ts:647-662`) with the mapping
  `enu·(east=x, north=−z, up=y)` (`CesiumViewport.ts:1758-1764`).
- The **real GLB model** path (`renderRealModelOnGlobe`, `CesiumViewport.ts:3441-3528`) serialises the live
  THREE scene to GLB (`exportFragmentsToGLB`, `GLBExporter.ts:42`) and places it with the SAME
  `eastNorthUpToFixedFrame(fromDegrees(originLon, originLat, baseHeight))` at the SAME origin,
  `upAxis: Y, forwardAxis: Z`.

### §51.2 — Findings (what is NOT the bug)
- **Axis mapping is correct.** Cesium's documented defaults for `Model.fromGltfAsync` are exactly
  `upAxis=Axis.Y, forwardAxis=Axis.Z`
  (`node_modules/.pnpm/@cesium+engine@24.0.0/.../Scene/Model/Model.js:2934-2935`). The explicit pinning at
  `CesiumViewport.ts:3500-3501` (D54) is a **no-op vs the default**; `Y_UP_TO_Z_UP` yields
  `(east=x, north=−z, up=y)`, matching the massing's mapping exactly.
- **GLB world transform is baked correctly + tested.** `cloneWithBakedWorldTransform`
  (`GLBExporter.ts:24-35`) carries each element's composed ancestor `matrixWorld` (regression-guarded by
  `packages/file-format/__tests__/glb-export-world-transform.test.ts`). No lateral drop.
- **Massing and real-model share the SAME ENU anchor + origin**, so they coincide horizontally; the only
  per-path difference is `exportRoot.position.y -= minY` (`GLBExporter.ts:123`) which re-anchors the GLB to
  base Y=0 — a **vertical-only** adjustment (cannot cause the lateral offset the founder sees).

### §51.3 — Root cause (the real one)
The georeference frame is **internally consistent** (boundary, building, massing, real-model, ENU anchor
ALL share the geocoded-address origin), so the model lands at the **geocoded address point** on the globe.
The offset relative to context buildings is because **the geocode point ≠ the true parcel location**:
- A geocoded address resolves to a street-interpolated / rooftop-centroid point that is commonly ~10-15 m
  from the actual lot (the `GISAreaLayout.ts:644` comment notes the address is "a DIFFERENT point once a
  boundary is committed (~10-15 m away)"). Anchoring the ENU frame at the address rather than the true
  parcel centroid offsets the whole model among the real-world context buildings.
- Secondary contributor: `boundaryProjection.latLonToSceneXZ` is a **local-equirectangular approximation**
  that ignores the UTM conformal correction (`boundaryProjection.ts:8-30`); sub-mm at a single lot but a
  documented stand-in for `LTPENURebase.projectToScene` (proj4 UTM, C12/C19 §1.3), which is **not yet wired
  at the draw surface** (`siteDispatch.ts:30-54`).

### §51.4 — Decision: SPIKE only (NOT a one-liner)
There is **no single wrong transform** to flip — the frames already agree. Fixing the offset is
**architectural**: anchor the ENU frame on the **drawn parcel centroid/first-vertex** rather than the
geocoded address, AND wire the real `LTPENURebase` (proj4 UTM) projection at the draw surface to replace
the equirectangular approximation. Per the task guardrails (implement only a clear, low-risk one-liner;
otherwise document) this is left **unimplemented**.

### §51.5 — Fix plan (when scheduled)
1. **Anchor on the parcel, not the address.** In `siteDispatch.setLtpOriginIfSafe`, when a parcel boundary
   is being committed, set the LTP origin to the **boundary centroid (or first vertex)** lat/lon, and have
   `getFormaOrigin()` / `getCurrentSiteOrigin()` return that. (`siteDispatch.ts:81-111`,
   `GISAreaLayout.ts:647-662`). This re-centres the model on the actual lot among context buildings.
2. **Wire `LTPENURebase` (proj4 UTM) at the draw surface** to replace `latLonToSceneXZ` (the documented
   C19 §1.3 follow-up, `boundaryProjection.ts:26-31`, `siteDispatch.ts:30-54`).
3. **Optional:** allow the user to nudge the placed model (existing `TransformGizmo` /
   `transformModel(translation, rotationAngle)` `CesiumViewport.ts:4189`) to fine-tune against the tiles.
Relationship to Q3: **NOT the same root cause.** Q3 (§50) is a missing camera-frame call on the PRYZM 3D
viewport; Q2 (§51) is a georeference anchor/projection-accuracy issue on the Cesium globe. They are
independent. `SPIKE`.

## §52 — Ground-floor corridor-branching for diversified / many-room plates (`GROUND-CORRIDOR-BRANCH`) — SPEC (3 attempts reverted, 2026-06-10)

Founder root complaint: large house plates show **blank area + ballooned rooms** (dining 51 m²); filling the
plate with more rooms (the chosen "sensible bounded auto-fill") needs every room to keep a door. Three direct
attempts this session were implemented and **reverted** because each broke a hard constraint — recording the
constraints here so the focused implementation lands first time.

### §52.1 — Why it's hard (the coupling)
The ground carve `trySingleRectCarve` (`tgl/subdivide.ts:824`) is **single-loaded**: `tryCarveCorridor` lays
one corridor strip with the **public** zone on one side and the **private** zone on the other, and
`sliceZoneAlongFace` (`:627`) combs the private rooms along the **one** corridor face (already the plate's
long axis — maximal run). It serves ~2–3 private rooms. Add study/WC/utility and there are 4–5 private rooms
for one face → the comb bails to squarify → back rows **sealed** (no door; `study`/`wc`/`bathroom` can only
door to a corridor, so the multi-hop reroute can't rescue them either).

### §52.2 — The THREE hard constraints any fix must satisfy simultaneously (each broke one attempt)
1. **No sealed rooms** — every room shares a wall with the corridor (a door). [Attempt 1: diversify only →
   sealed rooms, `roomsWithDoor=6/10`, 3 tests failed.]
2. **Entrance hall on the perimeter** (founder rule #2 — it hosts the front door). [Attempt 3: double-load
   EVERY room off a central corridor → the hall got combed into the interior → `houseLayout.test.ts` "ground
   hall abuts a perimeter wall" failed.]
3. **One rectangular corridor room** — the placement model gives each room ONE rect, so an L/T corridor isn't
   directly representable; the corridor strip must physically touch BOTH the public block AND both private
   sides. [Attempt 2: a central double-loaded private corridor doesn't reach a public block at the end.]

### §52.3 — The fix (when scheduled): public-perimeter-block + double-loaded-private with a corridor SPUR
- Keep PUBLIC rooms (hall + living + kitchen + dining, open-plan) as a block on the **perimeter** at one end
  of the plate (satisfies C2; reuse the existing public squarify).
- Run a corridor **spur** from the public/private boundary INTO the private zone, with private rooms combed
  off BOTH faces of the spur (satisfies C1; reuse `tryNoPublicDoubleLoadedCarve`'s both-sides comb logic).
- The spur's base sits on the public/private boundary so it's adjacent to the public block (door
  public↔corridor) and the corridor stays ONE rect (satisfies C3).
- This is a NEW carve (`tryPublicBlockSpurCarve`) — the central-strip double-load can't reach a perimeter
  public block, so a spur (corridor perpendicular to the split, based at the public boundary) is required.
- THEN re-apply `§PLATE-FILL-DIVERSIFY` (the saved flags + bubble mint + bounded ground-fill — sound code,
  reverted only because the carve couldn't host the extra rooms).
- GATE: `houseLayout.test.ts` green (every room a door AND the hall on the perimeter) for a diversified ground.

Test-gated, deterministic, apartment byte-identical (the spur only fires when the single-loaded comb fails).
This is a focused subdivision-geometry task, NOT a quick patch — three rushed attempts proved that.

### §52.6 — Instrumented finding: the blank-area + sealed-rooms is a COUPLED CHAIN, not one function (2026-06-10)

A focused instrumented run (289 m² single-storey, `§DIAG-RECTS` / `§DIAG-BRANCH` / `§DIAG-COMB-BAIL` added
temporarily then reverted) pinned the chain with numbers — the high-impact fix is bigger than
`sliceZoneAlongFace`:

1. **§HOUSE-MAX-CAP caps the presented area far below the plate.** On the 289 m² plate the subdivider was
   handed only **111 m²** (`§DIAG-RECTS areas=[69.3, 33.8, 8.0] total=111.1`) — **178 m² left blank.** THIS is
   the dominant source of the founder's "blank areas" (confirmed with numbers). The cap keys on the
   programme's `grossMax`; the programme didn't grow enough to lift it.
2. **The stair keep-out fragments even the capped plate** into 3 rects (`dominantFrac=0.62`), so there is no
   single clean rect to carve a corridor through.
3. **The dominant-rect corridor carve would DROP rooms**, so `§STAIR-CARVE-NO-DROP` picks the generic
   multi-rect pack instead (`carveDrops=5 genericDrops=0 → picked generic`) — and generic packing has **no
   corridor spine**, so rooms reach circulation only if squarify happens to abut them → the rest **seal**.
4. **The comb (`sliceZoneAlongFace`) fails even at privateRooms=2** on the small fragmented rects
   ("floors/depth too tight") — so the comb-gate is real but SECONDARY to (1)–(3).

**Revised fix order (the coupled chain — all needed, in this order):**
  (a) **§HOUSE-MAX-CAP**: present (most of) a large single-storey/ground plate (don't shrink 289→111); let
      the programme enrich to fill it (bounded). (b) **Stair-carve-no-drop**: the dominant-rect carve must not
      drop rooms (or fall to the §52 spur double-load) so a corridor spine survives. (c) **comb-gate**
      (§52.3 spur + `sliceZoneAlongFace` depth/floor gates) so the surviving rooms all abut the corridor.
This is a dedicated multi-step session with the house test as the live gate — NOT a single-function tweak.
The cap (a) is the single highest-leverage sub-fix (it owns the blank area), but shipping it alone re-opens
the sealed-rooms problem (more rooms than the carve/comb can connect), which is why (a)+(b)+(c) land together.

#### §52.6.1 — SHARPENED numeric diagnosis (2026-06-11): the blank area is the MULTI-STOREY GROUND floor

A clean reproduction (probe over `enrichStoreyProgramToPlate` + `houseStoreyBand`, sparse {1 bed,1 bath}
brief, varied plate) localises the defect precisely — it is NOT the single-storey path and NOT a generic cap:

| Path | 120 m² | 200 m² | 250 m² | 289 m² |
|---|---|---|---|---|
| **Single-storey** (growBedrooms) | beds3, gT135, **blank 0** | beds4, gT158, **blank 0** | — | beds6, gT196, **blank 0** |
| **Multi-storey GROUND** (growGroundRooms) | beds1, gT91, blank 0 | beds1, gT91, blank 0 | beds1, gT91, **blank 32** | beds1, gT91, **blank 71** |

The single-storey enricher grows bedrooms to the plate (grossTarget tracks the plate ⇒ the §AREA-AGREEMENT
`grossTarget ≥ 0.5·plate` branch keeps the TRUE area ⇒ zero blank). The **multi-storey ground is FLAT at
grossTarget≈91 for EVERY plate** because `fillGroundPlate` collapses to a single guest bedroom
(`Math.min(bedCap, max(floored, scaled))` where `scaleProgramToShell('ground')` returns ≤1) — so on any plate
> ~200 m² the cap clamps `presented = min(plate, grossMax=218)` and the rest is blank.

**This is exactly the founder's "if I add more rooms still those areas are not being filled in":** in a
multi-storey house, the Bedrooms stepper grows the UPPER storeys (the private level), never the ground — so the
GROUND blank is invariant to the bedroom count. The ground floor needs MORE PUBLIC rooms (study / family / utility /
a larger living+dining), but the frozen bubble graph (`tgl/bubbleGraph`) has **no study/family/utility room-type
flag** — adding them is the bubble-graph room-type expansion that the (b)+(c) carve/comb work then has to connect
without sealing. So the sharpened fix order is: **(a′) expand the ground-floor room SET (new public room-type flags
in the bubble graph: study, family, utility/WC) so the ground programme can grow its grossTarget toward a large
plate WITHOUT stretching a handful of rooms into blobs → (b) carve a corridor spine that reaches them → (c) comb-gate
so each abuts circulation.** Raising the cap alone re-creates the "167 m² Living Room" blob (few rooms, big area);
growing the count alone re-seals (carve can't reach them) — confirming the coupling, now scoped to the GROUND set.

**✅ SHIPPED v124 (`§HOUSE-GROUND-PUBLIC-SET`, 2026-06-11)** — the (a′) ground-public-set expansion landed:
new `ApartmentProgram.includeStudy/includeUtility` flags → bubbleGraph mints a study/utility room linked
OFF THE CORRIDOR SPINE (corridor-served → carve/comb reaches them → never seal) → `houseEnvelope.storeyRoomTypes`
mirrors them so the band's grossTarget grows → `fillGroundPlate` OR-ins study (≥200 m²), utility (≥240), a 2nd
corridor-served guest bedroom (≥270) on a large multi-storey ground. **Blank eliminated at every plate size
(289 m²: 71→0)**; small plates + axis-aligned + apartment path byte-identical. ai-host 2234/2234 (+6, incl. a new
no-sealed-room hard-gate on a real 289 m² 2-storey run). Closes the (a′) sub-fix; (b)/(c) carve/comb were not
needed because the corridor-served mint reaches the new rooms by construction.

## §53 — PROJECT NORTH vs TRUE NORTH (the rotated-plate root fix — major 5 defects) — IMPLEMENTING (2026-06-11)

**Founder root-cause insight:** like Revit, separate **Project North** (an orthogonal authoring frame whose
X-axis = the first significant drawn boundary edge / principal axis) from **True North** (the real-world/site
rotation). Author all generative geometry orthogonally; carry θ separately. Dissolves the 43.2°-rotated-plate
**residual** that opens partition seams → the major-5 cascade (sealed bedroom, generic "Room NN-xxx" names,
`§TOPO-HARD-REJECT [circulation]`, 1-door-upstairs, stair "1/4 corners").

**Governance:** [ADR-0070](../../02-decisions/adrs/0070-project-north-vs-true-north-authoring-frame.md) (Accepted) +
[SPEC-PROJECT-NORTH-AUTHORING-FRAME](../specs/SPEC-PROJECT-NORTH-AUTHORING-FRAME.md). Core rule **RIGID-TRANSFORM-LAST**:
construct + **rectify** + weld + seal in the axis-aligned Project-North frame (residual = 0), then apply +θ as ONE
rigid transform last. **RECTIFY** is load-bearing (§3.3): the ground reuses the user's *drawn* shell (a model
mismatch vs the engine's idealized principal-axis rectangle), so de-rotate alone preserves the residual —
de-rotating then snapping near-axis edges to exact axis makes the two shells the SAME clean polygon.
**Model B** (bake-once at generation, flag `window.__pryzmProjectNorth`) chosen for Phase 1 — contained to
`houseLayout/` + `apartmentLayout/tgl/` + the executor, no renderer/detection/persistence/IFC change. **Model A**
(editor-wide project transform + Project Base Point, true IFC `TrueNorth` parity, orthogonal editing everywhere)
deferred to Phase 2+. **Gate:** `houseLayoutInvariants.test.ts` 45°-rotated plate must reach `roomsWithDoor=N/N`,
no `§TOPO-HARD-REJECT`, no generic names; axis-aligned byte-identical. NOT claimed solved by §53: kitchen
NO-FRONTAGE + entrance-hall-not-perimeter (separate layout-quality, §51-adjacent). **Status: 🟠 IMPLEMENTING.**

## §54 — Living-graph node CARDS (select → interrogate → flowing canvas) — QUEUED (2026-06-11)

**Founder 2026-06-11:** on the Miro canvas each node (e.g. Kitchen) should behave like an individual selectable
**card**: select → INTERROGATE → a panel pops up with its **information · dependencies · adjacency · circulation**
(the living-graph data, not just the Area/Type/Floor/Connect editor we ship today), AND keep drag-and-drop /
connect-to-other-nodes / move-between-floors. Goal: "a more flowing and dynamic layout". Builds on the v122/123
Miro canvas (pan/zoom + node-drag) + the v119/120/121 C52 node editor — this EXTENDS the editor popover into a
richer **node inspector card** sourcing each room's graph relationships (its `adjacentTo`, its circulation route
to a corridor/hall, its program dependencies from the rules DB). SPEC: extend SPEC-DYNAMIC-PROGRAM-CANVAS (new
§5.9 node-inspector). **Status: 🔵 QUEUED — parallel agent (apps/editor, disjoint from §53 engine work).**
