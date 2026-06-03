# ADR-055 — One PRYZM: hosted on Cloudflare + Supabase

| Field | Value |
|---|---|
| Status | **ACCEPTED 2026-06-02 · AMENDED 2026-06-02** (4 critical contract conflicts caught by strategic-docs audit; corrected before any code shipped) |
| Supersedes | **ADR-052** (the docs-site marketing surface — retired) |
| Defers to | **ADR-056 (planned)** — Supabase Auth migration (Phase A.5, sequenced AFTER Phase A close so it doesn't block production) |
| Owner | Platform infrastructure · `@MarkHanoi` |
| Constraint reference | C08 §1.1 (auth identity) · C22 §1.1/§1.3 (PII tier + region) · C39 pricing surfaces · C43 a11y tokens · C48 §1.1 (RTO/RPO) · C49 §1.2/§1.13 (EU residency + GDPR) · ADR-045 (Supabase mixed backend) |
| Touches | `server.js` · `apps/editor/` · `apps/docs-site/` · `package.json` · `fly.toml` (new) · GitHub Actions · Cloudflare DNS · ADR-052 (deprecates) · `docs/01-strategy/product-vision.md §8` (amend domain canonical) |

---

## Amendment log (read this FIRST before §2)

The first draft of this ADR (initial commit 2026-06-02) made four contract-violating choices that a strategic-docs audit caught BEFORE any deployment shipped:

1. **§5 region** — pinned `iad` (US East) when **C22 §1.3** + **C49 §1.2** mandate EU primary for the GDPR customers personas.md targets. **Corrected → `fra` (Frankfurt) for Fly, `eu-central-1` for Supabase.**
2. **§5 domain** — hardcoded `pryzm.so` when `product-vision.md §8` declared `pryzm.app` canonical (with `pryzm.so` flagged "legacy with cutover planned"). User confirmed pryzm.so is the actual canonical going forward. **Corrected → pryzm.so canonical, `product-vision.md §8` amended in same PR.**
3. **§2 auth** — claimed "Supabase Auth · JWT issuance" when **C08 §1.1 (CANONICAL Wave A19)** + **ADR-045 §3** are emphatic: PRYZM uses custom JWT + bcrypt with `SESSION_SECRET`, NEVER Supabase Auth sessions. **Corrected → custom JWT preserved through Phase A. ADR-056 (planned) will sequence Supabase Auth as a deliberate Phase A.5 migration with C08 §1.1 superseded explicitly.**
4. **§3 Phase D** — silent on the **C08 §3.2** explicit-conflict invariant that server-side `Y.applyUpdate` must preserve. **Corrected → Phase D acceptance criteria add CRDT-conflict-detection parity gate.**

Plus 5 important amendments applied in the same pass: cost trajectory honest about Supabase Pro requirement for C48 targets, R2 bucket tier-tagging per C22 §1.1, `§SERVER-PG-DEGRADE` fallback survives, OAuth callback URI enumeration, Stripe webhook raw-body porting plan.

---

## Context

PRYZM's first deployment attempt (IP-A5, ADR-052) introduced a **second codebase** for the customer-facing surface: an Astro Starlight project at `apps/docs-site/` deployed to Cloudflare Pages, with hand-mirrored copies of the editor's landing page, pricing data, manifesto narrative, and trust pillars.

Within three days this approach surfaced its own anti-pattern: every time the editor's `apps/editor/src/ui/platform/LandingPage.ts` changed, the Astro mirror had to be hand-updated, and they drifted immediately (different fonts on first paint, different colour palettes on different builds, different CTA copy). The user flagged this directly: **"There is only one app — one solution — PRYZM."**

Simultaneously the user's long-term constraints sharpened:

- "Best long-term enterprise architecture for thousands of users"
- "I don't want to pay for it"
- "Architecturally sound — no shortcuts"

These three constraints can only coexist on the **Cloudflare edge + Supabase** stack — that's the only combination that scales to enterprise traffic at $0 baseline and grows linearly with usage. Replit / Fly / Render solo-host costs scale super-linearly; AWS / GCP solo-cloud requires DevOps overhead that contradicts "no shortcuts" for a small team.

ADR-052's "marketing surface as separate codebase" decision is therefore replaced. There is no marketing codebase. There is one PRYZM, and it is the editor.

---

## Decision

### §0 — The apex/app split (motif.io / linear.app pattern) — amended 2026-06-02

PRYZM follows the **canonical SaaS deployment pattern**: one codebase, **two deploy targets**:

```
ONE codebase  ──►  apps/editor/  (the only product source of truth)
                       │
                       ├─►  pryzm.so          ◄─ apex (Cloudflare Pages)
                       │       Public routes pre-rendered to static HTML at
                       │       build time: /, /pricing, /manifesto, /trust.
                       │       Sub-100ms first paint globally. SEO-crawlable.
                       │       Permissive CSP for the marketing surface.
                       │       Zero auth, zero DB calls, zero cost at any scale.
                       │
                       └─►  app.pryzm.so      ◄─ application (Fly Phase A →
                               Authed routes — SPA + server: /sign-in,         Cloudflare Pages+Functions Phase B+)
                               /signup, /projects, /canvas/:id, /api/*.
                               Strict CSP, COOP, COEP. Cookies scoped to
                               Domain=app.pryzm.so. EU region (fra).
                               This is THE editor.
```

**This is NOT a contradiction with the "one PRYZM" rule.** "One PRYZM" means one codebase + one source of truth for components, tokens, branding. It says nothing about deploy targets. Apex/app split honors "one PRYZM" perfectly — same code, two output artifacts.

**Why this is the right pattern (the canonical SaaS literature):**

| Concern | Editor-on-apex (rejected) | Apex/app split (this ADR) |
|---|---|---|
| SEO | SPA shell = unrankable | Pre-rendered HTML = ranks like a marketing site |
| First paint at pryzm.so | ~800ms (Vite cold-load) | < 100ms (edge cache hit globally) |
| Cost trajectory | Full editor cost at apex traffic | Apex free forever; app cost scales with users only |
| Security headers | One CSP must cover marketing + app | Permissive CSP on apex; strict CSP on app |
| Cookies | Apex auth cookies leak into subdomains | `Domain=app.pryzm.so` confines auth |
| Reliability | App outage = marketing down too | Marketing survives app maintenance |
| Deploy cadence | Every PR redeploys the editor | Marketing deploys instant; app deploys gated |

**Signup flow** (mirrors motif.io / linear.app):
1. User on `pryzm.so` clicks "Build something →"
2. Redirect to `app.pryzm.so/signup` (or `/sign-in` if cookie present)
3. RAC chatbot runs INSIDE `app.pryzm.so` (it's the editor's pre-auth onboarding surface)
4. After RAC capture → project created → user lands on `app.pryzm.so/projects/<id>` (the canvas)

**Build pipeline** (Vite + a pre-render step):
- `pnpm build:apex` → `apps/editor/dist-apex/` containing pre-rendered `/`, `/pricing`, `/manifesto`, `/trust`
- `pnpm build:app`  → `apps/editor/dist-app/` containing the full SPA bundle + server
- `apex` deploys to Cloudflare Pages (`pryzm.so`)
- `app` deploys to Fly (Phase A) → Cloudflare Pages + Functions (Phase B+)

Both build steps consume the SAME `apps/editor/src/` tree. Components like `LandingPage.ts` render identically in both (the apex version skips auth + DB hydration; the app version drives the editor).

### §1 — The single-codebase rule

**There is no `apps/docs-site/` product surface.** All customer-facing surfaces — landing, pricing, manifesto, trust, sign-in, sign-up, project hub, main canvas, RAC onboarding chatbot, site locator — are routes inside `apps/editor/`. The CI enforces this with a new gate `scripts/check/check-no-duplicate-surfaces.mjs` (planned next iteration) that fails any PR adding a new `apps/docs-site/src/pages/*.astro` that re-implements an editor surface.

The Astro project may survive ONLY as the **developer documentation surface** at `docs.pryzm.so` (Plugin SDK / REST API / Headless / Self-Host docs). It will NOT serve any customer-facing route.

### §2 — The hosting architecture (the long-term target)

| Layer | Choice | Rationale |
|---|---|---|
| Static client bundle | **Cloudflare Pages** | Global edge CDN. 0ms cold start. Atomic deploys. Branch previews. Free up to 500 builds/month. |
| API routes (45 endpoints in `server.js`) | **Cloudflare Pages Functions** (Workers runtime) | Edge-distributed. ~30ms p99 globally. Free 100k req/day; scales to billions. |
| Postgres | **Supabase** (`eu-central-1` Frankfurt — C22/C49 mandated EU residency) via `server/supabaseClient.js` per ADR-045 | SOC 2 + ISO 27001. Read replicas. **PITR requires Supabase Pro ($25/mo)** to meet C48 §1.1 RPO ≤ 5 min; free tier is daily-snapshot only. ADR-045 §3 mandates service-role REST + custom JWT — see Auth row below. |
| Auth | **Custom JWT + bcrypt + OAuth (preserved as-is for Phase A)** per **C08 §1.1** + **ADR-045 §3** | `SESSION_SECRET`-signed JWTs, bcrypt rounds = 12 (`server/authStore.js:28`), PKCE OAuth flow (`server/oauthService.js`). Supabase REST acts ONLY as the user-row reader via service-role per ADR-045 §3. **Phase A.5 (ADR-056 planned)** migrates to Supabase Auth's JWT issuance — sequenced AFTER Phase A close so it doesn't block production. |
| Realtime CRDT (Yjs sync) | **Cloudflare Durable Objects** (Phase D — preserves C08 §3.2 explicit-conflict invariant) | One DO per project. Server-side `Y.applyUpdate` merge MUST surface CONFLICTED SyncSlot state + `ConflictResolutionDialog` per C08 §3.1/§3.2 Wave A19. Parity-tested vs Socket.io baseline before cutover. |
| File storage | **Cloudflare R2** with C22 §1.1 tier-tagged buckets (`pryzm-pii-eu` · `pryzm-project-eu` · `pryzm-telemetry-eu`) | Zero egress fees (vs S3). 10GB free. EU-region bucket placement honors C22 §1.3 PII residency. PII writes without tier tag MUST reject per C22 §6.1. |
| AI proxy | **existing Cloudflare Worker** (`CF_WORKER_URL`) | Already in the stack; keep as-is. |
| DNS + WAF + Analytics | **Cloudflare** | Where `pryzm.so` already lives. |

**Cost trajectory** (amended for C48 RTO/RPO compliance):
- **Phase A only (Fly bridge, no paying customers)**: **$0** (Fly free + Supabase free 500MB + daily-only snapshots — acceptable for alpha, NOT for paying tenants)
- **First paying tenant onward**: **$25/mo Supabase Pro** required to meet **C48 §1.1** RPO ≤ 5 min (2-minute PITR granularity, 7-day retention). Free-tier daily snapshots fail C48 audit.
- **Editor scale 10k-100k MAU**: ~$50-$150 / month (Supabase Pro + Pages Functions overage + R2 egress + Durable Objects requests)
- **100k+ MAU enterprise scale**: ~$150-$600 / month; linear with usage
- **Multi-region (post-Phase D, Phase B-tier IPs)**: + $25/mo per peer Supabase region; LHR for UK separation per C49 §1.13

For comparison: Replit/Fly/Render solo-host at 100k MAU = $300-$3000 / month + DevOps overhead + no edge.

**Honest baseline**: $0 ships Phase A. **$25/mo is the floor** for any production-paying customer per C48. The "$0 forever" claim in the first draft of this ADR was wrong — corrected here.

### §3 — The execution sequence (4 sprints)

Re-platforming `server.js` in-place is high-risk + high-disruption. Instead we cut over in **four well-bounded sub-phases**, each individually shippable + reversible:

| Phase | Sprint | Deliverable | Risk gate |
|---|---|---|---|
| **A — Bridge** (apex + app, two deploys, one codebase) | Sprint 3 (this week) | (1) Build pre-render step: `pnpm build:apex` emits static HTML for /, /pricing, /manifesto, /trust → push to Cloudflare Pages → CNAME `pryzm.so` → `pryzm.pages.dev`. (2) Deploy current `server.js` unchanged to **Fly.io** (region `fra`) → CNAME `app.pryzm.so` + `api.pryzm.so` → `pryzm.fly.dev`. **Both deploys from the same codebase** per §0 apex/app split. | (a) Fly machine 512MB survives editor runtime ([production-hardening checklist](../../05-guides/deployments/PRODUCTION-HARDENING-CHECKLIST.md) verified before flip); (b) 3 pre-flip gates closed: `trust proxy = 2` (Cloudflare→Fly two-hop), `STRIPE_WEBHOOK_SECRET` rotated, 6-route `err.message` leak closed; (c) Astro mirror retired per [retirement plan](../../05-guides/deployments/ASTRO-RETIREMENT-PLAN-2026-Q3.md); (d) C22 §1.3 region honored (EU primary). |
| **A.5 — Auth migration to Supabase Auth** | Sprint 4 (sequenced AFTER A close) | **ADR-056 (planned)** authors the Supabase Auth migration: supersedes C08 §1.1 + ADR-045 §3, identity reconciliation, JWT cutover with 30-day TTL overlap, OAuth flow rewrite, RLS policies wired to `auth.uid()`. Production-grade enterprise auth — SOC2/ISO27001 audited IdP, JWKS, refresh-token rotation, MFA-ready, SSO-ready. | (a) ADR-056 ACCEPTED before any code; (b) 30-day overlap window between old + new JWT issuance; (c) zero-downtime cutover verified in staging branch preview; (d) `auth.uid()` RLS verified across every PII-bearing table. |
| **B — App SPA to edge** | Sprint 4-5 | Build the editor SPA → push `dist-app/` to **Cloudflare Pages** (`app.pryzm.so`). API still calls Fly via `api.pryzm.so`. Edge cache for static assets; HTML uncached. | First-paint < 800ms TTFB measured on the new path. |
| **C — API to functions** | Sprint 5-6 | Port the 45 Express routes → Pages Functions. Read-only first (`GET /api/v1/projects` etc), then mutations, then Stripe webhooks (raw-body via `req.text()`). Decommission Fly when last route lands. | Each route ships with parity tests; old + new both green for 1 sprint before cutover. |
| **D — CRDT to DO** | Sprint 7 | Replace Socket.io with Durable Objects for Yjs sync. Full Cloudflare. | (a) CRDT round-trip latency p95 ≤ 80ms (Socket.io baseline); (b) **C08 §3.2 explicit-conflict invariant preserved** — server-side `Y.applyUpdate` must surface `CONFLICTED` SyncSlot state + drive `ConflictResolutionDialog` per Wave A19 amendment. Parity-tested against the current Socket.io path before cutover. No silent merges. |

Phase boundaries are reversibility checkpoints. If Phase C reveals an API route that doesn't translate to Pages Functions (e.g. requires long-running Node libs), we hold that route on Fly and revisit. If Phase D's Durable Object cost projection exceeds budget, we stay on Socket.io + Fly indefinitely.

### §4 — Test / staging environment

**Branch previews on Cloudflare Pages.** Every push to a feature branch auto-deploys to `<branch>.pryzm-pages.dev` (ephemeral). API points at a staging-tier Supabase project (separate from production). Engineers click a PR's preview URL to verify before merging to `main` (production).

This replaces the historical practice of local-only testing + production-as-only-target. Free, ephemeral, no ops overhead, perfect parity with production.

### §5 — DNS + domain (amended 2026-06-02 for apex/app split)

```
pryzm.so (apex)        → Cloudflare Pages (always-static, pre-rendered marketing).
                          Phase A: serves /, /pricing, /manifesto, /trust as static HTML.
                          NEVER receives auth traffic. NEVER hits Supabase.
                          Sub-100ms first paint globally.

www.pryzm.so           → 301 → pryzm.so (apex)

app.pryzm.so           → THE EDITOR.
                          Phase A:  CNAME-flat → pryzm.fly.dev (EU region: fra)
                          Phase B:  CNAME-flat → pryzm-app.pages.dev (Cloudflare Pages SPA)
                                    API still routes to Fly via `api.pryzm.so` until Phase C.
                          Phase C:  Pages Functions take the API; Fly retired.
                          Phase D:  Durable Objects take CRDT; full Cloudflare stack.

api.pryzm.so           → Phase A:  CNAME-flat → pryzm.fly.dev (alias of app)
                          Phase C:  Pages Functions (Workers runtime)
                          Required so the SPA at app.pryzm.so can call the API
                          without same-origin gymnastics.

docs.pryzm.so          → Cloudflare Pages (Astro Starlight, developer docs ONLY).
                          Plugin SDK · REST API · Headless · Self-Host.
                          NO customer-facing routes — those live at apex/app.

marketplace.pryzm.so   → reserved for the plugin marketplace SPA
                          (apps/marketplace-web/, ships Sprint 9+).

staging.pryzm.so       → ephemeral branch-preview deploys (Cloudflare Pages
                          branch previews + Fly staging app).
                          Each PR gets <pr-N>.pryzm-staging.pages.dev.

[reserved] eu.pryzm.so / uk.pryzm.so → C49 §1.13 multi-region (Phase B+).
```

**Region pin**: apex (`pryzm.so`) is GLOBAL-edge (Cloudflare's network); app + api are **EU-only** in Phase A (`fra` on Fly). C22 §1.3 PII residency is honored because PII never touches the apex.

All managed in Cloudflare. TLS auto-provisioned. No manual cert work.

### §6 — Migration runbook

The four phases are documented in detail at `docs/05-guides/deployments/CLOUDFLARE-MIGRATION-RUNBOOK-2026-Q3.md`. Each phase has:

- A pre-flight checklist (env vars, DB rows, traffic baseline)
- The dashboard click-sequence (Fly + Cloudflare)
- A verification curl/health-check matrix
- A rollback playbook keyed on what fails

Any deviation from the runbook must update the runbook in the same PR.

### §7 — What gets retired

| Asset | Disposition | When |
|---|---|---|
| `apps/docs-site/src/pages/index.astro` | DELETE (after Phase A's pryzm.so DNS flip) | Phase A close |
| `apps/docs-site/src/pages/start.astro` | DELETE (RAC moves to editor as A.5.b/d) | Phase A close |
| `apps/docs-site/src/pages/{pricing,manifesto,trust}.astro` | MOVE to editor routes; delete from Astro | Phase A close |
| `apps/docs-site/src/pages/404.astro` | KEEP for docs.pryzm.so | Forever |
| `scripts/build/gen-docs-site-pricing.mjs` | DELETE (pricing renders directly from `@pryzm/entitlements` in editor) | Phase A close |
| `apps/docs-site/src/data/pricing.json` | DELETE | Phase A close |
| **ADR-052** | Marked SUPERSEDED-BY-ADR-055; kept for historical record | Phase A close |
| Cloudflare Pages project `pryzmapp` | RECONFIGURE to serve only `docs.pryzm.so` (developer docs) OR delete | Phase A close |

### §8 — Entry routing (apex clean paths → SPA query parser)

**Context.** The apex (static, no JS) must hand visitors off to the app surface, and the app's first-paint router must place them on the right surface (RAC onboarding, auth modal, or a marketing route). The editor already routes via a **query parser**, not a pathname router: `apps/editor/src/router.ts` deliberately reads `?page=<name>` instead of `/path/:id` so it does not have to reach past the `?pryzm2=1` **kill-switch** in `src/main.ts` or reconfigure the dev/prod server to serve `index.html` for arbitrary pathnames. `PlatformRouter` owns the legacy hash surface (`#/`, `#/projects`); `?page=` is an extra slot layered on top.

**Decision.** The apex emits **clean, shareable** paths on the app origin (`/signup`, `/start`, `/sign-in`, `/contact`, `/solutions`, `/resources`); the app **server** bridges each to the SPA's `?page=` form with a 302 (e.g. `/signup → /?page=signup`), rather than rebuilding the SPA on a pathname router. Marketing paths (`/pricing`, `/manifesto`, `/trust`) keep their separate §5 / C51 §3.2.1 host-guarded 301 to the apex. The clean-path bridge runs on all hosts (incl. `localhost`) so the apex→app journey is testable before the Fly DNS lands.

**Consequence.** Public links stay clean and shareable; the SPA keeps its single query-parser entry point; the `?pryzm2=1` kill-switch and the hash-router contract that `router.ts` documents stay intact (no pathname router, no server `index.html`-for-`/path/*` deployment change). The normative form of this rule — the clean-path → `?page=` map and the full entry-path table — lives in **C51 §3.1.8 / §3.1.8.1 / §5.3** (the contract is the source of truth; this note records the decision and its rationale).

---

## Consequences

### Positive

1. **One codebase, one product surface.** The drift trap that prompted this ADR cannot recur.
2. **Enterprise-grade edge architecture** at a free-tier baseline. The architecture scales to 100k+ MAU without re-platforming again.
3. **Branch previews** make code review meaningfully easier (one URL per PR).
4. **Cost-predictable**: $0 today, linear with scale, all on one provider's dashboard.
5. **Documented contract** (this ADR + the migration runbook) prevents future engineers from re-introducing a parallel marketing codebase.

### Negative

1. **Migration is real work.** Phases B + C + D add up to ~6-8 sprint-weeks. Phase A delivers production in days, but the full target architecture takes the rest of Phase A's calendar.
2. **CRDT migration (Phase D)** is the highest-risk piece. Durable Objects have a different consistency model than Socket.io; we verify with a parity-tested cutover.
3. **Supabase Auth migration**: today's custom JWT + bcrypt + OAuth needs to converge with Supabase Auth. Session-token rotation cutover requires care.
4. **Branch-preview proliferation** can mask cost surprises if Cloudflare's free-build allowance is exceeded; CI gate must cap.

### Neutral / forward-tracked

- **SEO**: the editor is a Vite SPA. First-paint of the landing must be crawler-visible. Phase B includes a pre-render step for the public-route subset (`/`, `/pricing`, `/manifesto`, `/trust`).
- **OAuth callback URLs**: Google + MS dashboards must update once `pryzm.so` is live. Tracked in the runbook.
- **Stripe webhooks**: raw-body handling on Pages Functions is straightforward but needs explicit `req.text()` rather than the express.raw() recipe.

---

## Related

- **C00** Docs taxonomy — this ADR lives in `02-decisions/adrs/`; the runbook in `05-guides/deployments/`.
- **C39** Pricing surfaces — pricing page now renders directly from `@pryzm/entitlements` inside the editor (the docs-site JSON-snapshot pattern from ADR-052 §1.4 is retired).
- **C43** Accessibility — `PRYZM_TOKENS` registry is the single source for colour values across all editor routes; the duplicated hex literals from ADR-052 §3 are retired.
- **C48** Backup & DR — Supabase PITR + Cloudflare R2 versioning replace the previous Replit-volume backup story.
- **ADR-052** — SUPERSEDED BY THIS DOC. Retained for historical context.
- **ADR-053** Lockfile-drift policy — unchanged.
- **ADR-054** Reference-only repos as gitignored — unchanged.

---

## Change log

- **2026-06-02** — Authored at user's "one PRYZM" direction. First deploy target: Phase A (Fly.io bridge) within this sprint. Phase D (Durable Objects) target: Sprint 7.
